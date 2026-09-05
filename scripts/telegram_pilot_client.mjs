// Local-only pilot driver. Bot credentials never leave this machine except to api.telegram.org.
import { readFile, writeFile } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setDefaultResultOrder } from 'node:dns';
import { setDefaultAutoSelectFamily } from 'node:net';
import { parseEnv } from 'node:util';
import { setTimeout as pause } from 'node:timers/promises';
import { inspectTelegram } from './telegram_preflight.mjs';
import { createClients, workerConfig, workerTick } from './lib/telegram-worker.mjs';
// Verified on the pilot host: Telegram IPv4 TLS works, IPv6 times out.
setDefaultResultOrder('ipv4first');
setDefaultAutoSelectFamily(false);
const remote = '/tmp/isvoi-telegram-check-S4UqgMF0';
const sshArgs = ['-i','C:/Users/1/.ssh/isvoi_beget_ed25519','-o','BatchMode=yes','-o','ConnectTimeout=12'];
const target = 'deploy@217.114.14.32';
const output = 'work/private/telegram-pilot-result.json';
function ssh(command) {
  const result = spawnSync('ssh',[...sshArgs,target,command],{encoding:'utf8',timeout:60000,maxBuffer:1024*1024,windowsHide:true});
  if (result.error || result.status !== 0) throw new Error('PILOT_SSH_FAILED');
  return result.stdout.trim();
}
let tunnel;
let phase='CONFIG';
let interrupted = false;
process.on('SIGINT',()=>{interrupted=true;}); process.on('SIGTERM',()=>{interrupted=true;});
try {
  const env = parseEnv(await readFile('work/private/telegram-test.env','utf8'));
  if (env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, '') !== 'isvoi_test_bot' || env.TELEGRAM_CHAT_ID?.trim() !== '-1004431327377') throw new Error('WRONG_TEST_DESTINATION');
  phase='TELEGRAM_PREFLIGHT';
  const ready = await inspectTelegram(env);
  if (!ready.ready || ready.webhookConfigured || String(ready.bot.id) !== '8908725708') throw new Error('PILOT_TELEGRAM_NOT_READY');
  phase='SSH_CREDENTIAL';
  const credential = JSON.parse(ssh(`cat ${remote}/pilot-private/worker.json`));
  if (!/^[a-f0-9]{64}$/.test(credential.token) || Date.now() >= credential.expiresAt) throw new Error('PILOT_CREDENTIAL_INVALID');
  if (!/^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(credential.apiHost || '') || credential.apiHost.split('.').length !== 4 || !credential.apiHost.split('.').every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255)) throw new Error('PILOT_CONTAINER_ADDRESS_INVALID');
  phase='TUNNEL';
  tunnel = spawn('ssh',[...sshArgs,'-o','ExitOnForwardFailure=yes','-o','ServerAliveInterval=15','-N','-L',`127.0.0.1:18055:${credential.apiHost}:8055`,target],{stdio:['ignore','ignore','pipe'],windowsHide:true});
  tunnel.stderr.on('data',chunk=>{const message=String(chunk);if(/administratively prohibited/i.test(message)) console.log('PILOT_SSH_FORWARD_DENIED');else if(/connect failed/i.test(message)) console.log('PILOT_SSH_FORWARD_CONNECT_FAILED');});
  let tunnelError = false; tunnel.on('error',()=>{tunnelError=true;});
  let connected = false;
  for (let n=0;n<30;n++) {
    if (tunnelError || tunnel.exitCode !== null) throw new Error('PILOT_TUNNEL_FAILED');
    try { const response=await fetch('http://127.0.0.1:18055/server/ping',{signal:AbortSignal.timeout(3000)}); if(response.ok){connected=true;break;} }
    catch(error) { if(n===5 && /^[A-Z_]+$/.test(error.cause?.code || '')) console.log(`PILOT_LOOPBACK_${error.cause.code}`); }
    await pause(500);
  }
  if (!connected) throw new Error('PILOT_TUNNEL_TIMEOUT');
  const clients = createClients(workerConfig({...env,TELEGRAM_ENABLED:'true',TELEGRAM_MODE:'test',TELEGRAM_DIRECTUS_URL:'http://127.0.0.1:18055',TELEGRAM_DIRECTUS_TOKEN:credential.token}));
  const identityPath='work/private/telegram-pilot-identity.json';
  let savedIdentity;
  try { savedIdentity=JSON.parse(await readFile(identityPath,'utf8')); } catch(error) { if(error.code!=='ENOENT') throw error; }
  const identity={bot_id:'8908725708',worker_id:savedIdentity?.expiresAt===credential.expiresAt?savedIdentity.workerId:randomUUID()};
  if(!/^[a-f0-9-]{36}$/.test(identity.worker_id)) throw new Error('PILOT_IDENTITY_INVALID');
  await writeFile(identityPath,JSON.stringify({workerId:identity.worker_id,expiresAt:credential.expiresAt}));
  async function sessionWithRetry() {
    for(let n=0;n<35;n++) {
      try { return await clients.directus('session',identity); }
      catch(error) { if(!['DIRECTUS_HTTP_409','DIRECTUS_NETWORK_ERROR','DIRECTUS_HTTP_502','DIRECTUS_HTTP_503','DIRECTUS_HTTP_504'].includes(error.message) || n===34) throw error; await pause(3000); }
    }
  }
  phase='SESSION';
  const initialSession=await sessionWithRetry();
  // Verify actual HTTP authentication before creating anything to send.
  const denied = await fetch('http://127.0.0.1:18055/isvoi-telegram/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(identity),signal:AbortSignal.timeout(5000)});
  if (denied.status !== 403) throw new Error('PILOT_PUBLIC_ENDPOINT_NOT_DENIED');
  phase='ENQUEUE';
  ssh(`cd ${remote} && node scripts/telegram_pilot_server.mjs enqueue`);
  if(initialSession.conversations) {
    const existing=JSON.parse(ssh(`cd ${remote} && node scripts/telegram_pilot_server.mjs status`));
    if(!existing.conversation) {
      const link=ssh(`cd ${remote} && node scripts/telegram_pilot_server.mjs conversation-link`);
      if(!/^https:\/\/t\.me\/isvoi_test_bot\?start=[A-Za-z0-9_-]{43}$/.test(link)) throw new Error('PILOT_LINK_INVALID');
      console.log(`PILOT_CLIENT_LINK ${link}`);
    }
  }
  const deadline=Math.min(credential.expiresAt-60000,Date.now()+1800000);
  let announced=false,claimed=false,lastStatus=0,pollFailures=0;
  while(!interrupted && Date.now()<deadline) {
    phase='WORKER_TICK';
    const session=await sessionWithRetry();
    if(session.mode !== 'test') throw new Error('PILOT_MODE_MISMATCH');
    let tick;
    try { tick=await workerTick({clients,identity,offset:session.update_offset,conversations:session.conversations===true,pollTimeout:2}); pollFailures=0; }
    catch(error) {
      if(error.message!=='TELEGRAM_POLL_FAILED' || ++pollFailures>5) throw error;
      console.log('PILOT_POLL_RECONNECTING'); await pause(3000); continue;
    }
    if(tick.delivered || Date.now()-lastStatus>15000) {
      phase='STATUS';
      const status=JSON.parse(ssh(`cd ${remote} && node scripts/telegram_pilot_server.mjs status`));
      lastStatus=Date.now();
      await writeFile(output,JSON.stringify({...status,checkedAt:new Date().toISOString(),listenerUntil:new Date(deadline).toISOString()},null,2));
      if(['failed','uncertain'].includes(status.delivery?.state)) throw new Error('PILOT_DELIVERY_REQUIRES_REVIEW');
      if(status.delivery?.message_id && !announced) {
        announced=true;
        console.log(`PILOT_CARD_READY https://t.me/c/4431327377/${status.delivery.message_id}`);
      }
      if(initialSession.conversations) {
        if(status.conversation?.outbox?.some(row=>row.destination==='client'&&row.purpose==='reply'&&['failed','uncertain'].includes(row.state))) throw new Error('PILOT_REPLY_REQUIRES_REVIEW');
        if(status.conversation?.messages?.some(row=>row.direction==='in') && status.conversation?.outbox?.some(row=>row.destination==='client'&&row.purpose==='reply'&&row.state==='done') &&
          !status.conversation.outbox.some(row=>['pending','in_flight'].includes(row.state))) {
          console.log('PASS: live client message reached the lead topic, manager explicitly confirmed a reply, Telegram accepted delivery to the linked client.');
          claimed=true;break;
        }
      } else if(status.lead?.status==='in_progress' && status.delivery?.state==='done' && String(status.delivery.revision)===String(status.delivery.sent_revision)) {
        const owner='1a612dfb-8f1c-455b-a8cd-b57ea60afc24';
        if(status.lead.assigned_to!==owner || status.comments.length!==1 || status.comments[0].created_by!==owner || status.activity.length!==1 || status.activity[0].user!==owner) throw new Error('PILOT_CLAIM_AUDIT_MISMATCH');
        console.log('PASS: live Telegram callback assigned the fixture lead, recorded staff audit and updated the card.');
        claimed=true;
        break;
      }
    }
    await pause(1000);
  }
  if(!announced) throw new Error('PILOT_CARD_NOT_DELIVERED');
  if(!claimed) throw new Error('PILOT_WAITING_FOR_CLICK');
  console.log('PILOT_LISTENER_STOPPED');
} catch(error) {
  const code=/^[A-Z][A-Z0-9_]{0,79}$/.test(error?.message || '')?error.message:'PILOT_CLIENT_FAILED';
  console.error(`${code} (${phase})`); process.exitCode=1;
} finally { tunnel?.kill(); }

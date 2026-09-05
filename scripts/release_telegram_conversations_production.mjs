// Reviewed stage-2 upgrade. Run only from a code-only staging directory on the ISVOI host.
// `check` is read-only. `enable` keeps the existing stage-1 route and has a feature-flag rollback.
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { openSync, closeSync } from 'node:fs';
import { readFile, writeFile, mkdir, copyFile, rmdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { parseEnv } from 'node:util';
import { setDefaultResultOrder } from 'node:dns';
import { setDefaultAutoSelectFamily } from 'node:net';
import { setTimeout as pause } from 'node:timers/promises';
import { conversationsSql } from './setup_directus_telegram_conversations_sql.mjs';
import { productionTelegram as p } from './setup_directus_telegram_production_sql.mjs';
import { inspectTelegram } from './telegram_preflight.mjs';

setDefaultResultOrder('ipv4first');
setDefaultAutoSelectFamily(false);
const root='/opt/isvoi';
const stack=resolve(root,'infra/directus-beget');
const webEnvPath=resolve(root,'apps/web/.env.local');
const directusEnvPath=resolve(stack,'.env');
const telegramEnvPath=resolve(root,'infra/telegram/.env');
const statePath=resolve(root,'var/telegram-release-state.json');
const lock=resolve(root,'var/telegram-conversations-release-lock');
const source=resolve(process.cwd());
const expectedBase='2bee9ed328fe85d65fd270211c99e7147c9efb1d';
const action=process.argv[2] || 'check';

function cmd(program,args,{cwd=root,input,inputFile,binary=false,timeout=180000}={}) {
  const fd=inputFile?openSync(inputFile,'r'):null;
  try {
    const result=spawnSync(program,args,{cwd,input,stdio:fd===null?undefined:[fd,'pipe','pipe'],encoding:binary?undefined:'utf8',timeout,maxBuffer:64*1024*1024});
    if(result.error||result.status!==0) throw new Error('RELEASE_COMMAND_FAILED');
    return binary?result.stdout:result.stdout.trim();
  } finally {if(fd!==null)closeSync(fd);}
}
const sql=query=>cmd('docker',['compose','exec','-T','database','psql','-U','isvoi','-d','isvoi','-v','ON_ERROR_STOP=1','-At'],{cwd:stack,input:query});
async function writeEnv(path,values) {
  let raw=await readFile(path,'utf8');
  for(const [key,value] of Object.entries(values)) {
    const expression=new RegExp(`^${key}=.*$`,'gm');
    if([...raw.matchAll(expression)].length>1) throw new Error('DUPLICATE_ENV_KEY');
    const line=`${key}=${JSON.stringify(String(value))}`;
    raw=expression.test(raw)?raw.replace(expression,()=>line):`${raw.trimEnd()}\n${line}\n`;
  }
  await writeFile(path,raw,{mode:0o600});
}
async function pingDirectus() {
  for(let n=0;n<60;n++) {try{if((await fetch('http://127.0.0.1:8055/server/ping',{signal:AbortSignal.timeout(2000)})).ok)return;}catch{}await pause(1500);}
  throw new Error('DIRECTUS_RESTART_TIMEOUT');
}
async function websiteIdentity() {
  const web=parseEnv(await readFile(webEnvPath,'utf8'));
  const token=web.DIRECTUS_LEADS_TOKEN?.trim();
  const configuredOrigin=String(web.DIRECTUS_URL||web.NEXT_PUBLIC_DIRECTUS_URL||'');
  let target;
  try {target=new URL(configuredOrigin);} catch {throw new Error('WEBSITE_INTAKE_CONFIG_INVALID');}
  const loopback=['127.0.0.1','localhost','::1'].includes(target.hostname);
  if(!token||(target.protocol!=='https:'&&!(target.protocol==='http:'&&loopback))||target.username||target.password||target.pathname!=='/'||target.search||target.hash) throw new Error('WEBSITE_INTAKE_CONFIG_INVALID');
  const origin=target.origin;
  let response,body;
  try {
    response=await fetch(`${origin}/users/me?fields=id,status,role`,{headers:{Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(15000)});
    body=await response.json();
  } catch {throw new Error('WEBSITE_INTAKE_IDENTITY_UNAVAILABLE');}
  const id=body?.data?.id;
  if(!response.ok||!UUID.test(id||'')) throw new Error('WEBSITE_INTAKE_IDENTITY_INVALID');
  const safe=sql(`WITH RECURSIVE roles(id,parent) AS (
    SELECT role,(SELECT parent FROM directus_roles WHERE id=role) FROM directus_users WHERE id='${id}' AND status='active' AND role IS NOT NULL
    UNION ALL SELECT r.id,r.parent FROM directus_roles r JOIN roles x ON r.id=x.parent
  ), effective_policies(policy) AS (
    SELECT a.policy FROM directus_access a WHERE a."user"='${id}' OR a.role IN(SELECT id FROM roles)
  ) SELECT (EXISTS(SELECT 1 FROM directus_users WHERE id='${id}' AND status='active')
    AND EXISTS(SELECT 1 FROM effective_policies e JOIN directus_policies q ON q.id=e.policy WHERE q.name='ISVOI Lead Intake' AND NOT q.admin_access)
    AND NOT EXISTS(SELECT 1 FROM effective_policies e JOIN directus_policies q ON q.id=e.policy WHERE q.admin_access))::text;`);
  if(safe!=='true') throw new Error('WEBSITE_INTAKE_IDENTITY_NOT_SCOPED');
  return {id,token};
}
async function manifest() {
  if(!/^\/tmp\/isvoi-telegram-conversations-release-[A-Za-z0-9]+$/.test(source)) throw new Error('RELEASE_STAGING_REQUIRED');
  const value=JSON.parse(await readFile(resolve(source,'release-manifest.json'),'utf8'));
  if(value.base!==expectedBase||!/^[a-f0-9]{40}$/.test(value.commit)||!/^[a-f0-9]{64}$/.test(value.bundle_sha256)) throw new Error('RELEASE_MANIFEST_INVALID');
  const bundle=await readFile(resolve(source,'release.bundle'));
  if(createHash('sha256').update(bundle).digest('hex')!==value.bundle_sha256) throw new Error('RELEASE_BUNDLE_HASH_MISMATCH');
  cmd('git',['bundle','verify',resolve(source,'release.bundle')]);
  return value;
}
function conversationSchemaState() {
  if(sql("SELECT to_regclass('public.lead_conversations') IS NULL;")==='t') return 'absent';
  const complete=sql(`SELECT (to_regclass('public.telegram_link_tokens') IS NOT NULL
    AND to_regclass('public.telegram_client_sessions') IS NOT NULL
    AND to_regclass('public.lead_messages') IS NOT NULL
    AND to_regclass('public.telegram_reply_drafts') IS NOT NULL
    AND to_regclass('public.telegram_message_outbox') IS NOT NULL
    AND to_regclass('public.telegram_retention_settings') IS NOT NULL)::text;`);
  if(complete!=='true') throw new Error('CONVERSATIONS_SCHEMA_PARTIAL');
  const rows=sql(`SELECT (SELECT count(*) FROM lead_conversations)
    +(SELECT count(*) FROM telegram_link_tokens)+(SELECT count(*) FROM telegram_client_sessions)
    +(SELECT count(*) FROM lead_messages)+(SELECT count(*) FROM telegram_reply_drafts)
    +(SELECT count(*) FROM telegram_message_outbox)+(SELECT count(*) FROM telegram_retention_settings);`);
  if(rows!=='0') throw new Error('CONVERSATIONS_SCHEMA_NOT_EMPTY');
  return 'empty';
}
async function baseline({upgrade=false}={}) {
  const state=JSON.parse(await readFile(statePath,'utf8'));
  const head=cmd('git',['rev-parse','HEAD']);
  if(cmd('git',['status','--porcelain'])||(upgrade?head!==expectedBase:head!==state.commit)) throw new Error('PRODUCTION_CHECKOUT_CHANGED');
  if(!state.installed||state.route!==p.route) throw new Error('STAGE1_RELEASE_STATE_INVALID');
  if(sql(`SELECT EXISTS(SELECT 1 FROM telegram_routes WHERE id='${p.route}' AND bot_id=${p.botId} AND chat_id=${p.chatId} AND enabled)::text;`)!=='true') throw new Error('STAGE1_ROUTE_NOT_READY');
  const telegram=parseEnv(await readFile(telegramEnvPath,'utf8'));
  if(telegram.TELEGRAM_ENABLED!=='true'||telegram.TELEGRAM_MODE!=='production'||telegram.TELEGRAM_BOT_USERNAME?.replace(/^@/,'')!=='isvoi_help_bot'||telegram.TELEGRAM_CHAT_ID!==p.chatId||!telegram.TELEGRAM_BOT_TOKEN?.startsWith(`${p.botId}:`)) throw new Error('PRODUCTION_WORKER_CONFIG_INVALID');
  if(upgrade) {
    const readiness=await inspectTelegram(telegram);
    if(!readiness.ready||readiness.webhookConfigured) throw new Error('PRODUCTION_BOT_NOT_READY');
  }
  return {state,telegram,intake:upgrade?await websiteIdentity():null};
}
async function restartDirectus() {cmd('docker',['compose','up','-d','--force-recreate','--no-deps','directus'],{cwd:stack});await pingDirectus();}
function restartWorker() {cmd('pm2',['restart','isvoi-telegram','--update-env']);}
function restartWeb() {cmd('pm2',['restart','isvoi-web','--update-env']);}

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let phase='VALIDATE',backup,workerStopped=false,flagsChanged=false,codeMerged=false;
try {
  if(!['check','enable','disable'].includes(action)) throw new Error('RELEASE_ACTION_INVALID');
  const release=await manifest();
  const current=await baseline({upgrade:action!=='disable'});
  const schemaState=action==='disable'?null:conversationSchemaState();
  if(action==='check') {
    console.log(JSON.stringify({status:'TELEGRAM_CONVERSATIONS_RELEASE_READY',base:expectedBase,commit:release.commit,retentionMonths:6,bot:'isvoi_help_bot',chatId:p.chatId,schemaState,stage1Preserved:true}));
  } else if(action==='disable') {
    await writeEnv(webEnvPath,{TELEGRAM_CONVERSATIONS_ENABLED:false});
    await writeEnv(directusEnvPath,{ISVOI_TELEGRAM_CONVERSATIONS_ENABLED:false});
    cmd('npm',['run','web:build'],{timeout:1200000});
    await restartDirectus();restartWorker();restartWeb();cmd('pm2',['save']);
    await writeFile(statePath,JSON.stringify({...current.state,conversationsEnabled:false,conversationsDisabledAt:new Date().toISOString()},null,2),{mode:0o600});
    console.log('TELEGRAM_CONVERSATIONS_DISABLED_STAGE1_PRESERVED');
  } else {
    await mkdir(dirname(lock),{recursive:true});await mkdir(lock);
    const stamp=new Date().toISOString().replace(/[-:.]/g,'');
    backup=resolve(root,`backups/telegram-conversations-${stamp}`);
    await mkdir(backup,{mode:0o700});
    try {
      phase='BACKUP';
      const dump=cmd('docker',['compose','exec','-T','database','pg_dump','-U','isvoi','-d','isvoi','-Fc'],{cwd:stack,binary:true});
      await writeFile(resolve(backup,'postgres.dump'),dump,{mode:0o600});
      cmd('docker',['compose','exec','-T','database','pg_restore','--list'],{cwd:stack,inputFile:resolve(backup,'postgres.dump')});
      for(const [from,name] of [[directusEnvPath,'directus.env'],[telegramEnvPath,'telegram.env'],[webEnvPath,'web.env']]) await copyFile(from,resolve(backup,name));
      phase='CODE';
      cmd('git',['fetch',resolve(source,'release.bundle'),release.commit]);
      cmd('git',['merge','--ff-only',release.commit]);
      codeMerged=true;
      if(cmd('git',['rev-parse','HEAD'])!==release.commit||cmd('git',['status','--porcelain'])) throw new Error('RELEASE_CODE_MISMATCH');
      phase='VERIFY';
      cmd('npm',['run','telegram:test'],{timeout:180000});
      cmd('npm',['run','web:verify'],{timeout:1200000});
      phase='SCHEMA';
      sql(conversationsSql);
      if(sql("SELECT retention_months::text FROM telegram_retention_settings WHERE bot_id=8694946838;")!=='') throw new Error('RETENTION_MUST_START_LAZILY');
      phase='API';
      cmd('pm2',['stop','isvoi-telegram']);workerStopped=true;
      sql(`UPDATE telegram_runtime SET lease_until=now() WHERE bot_id=${p.botId};`);
      await writeEnv(directusEnvPath,{
        ISVOI_TELEGRAM_CONVERSATIONS_ENABLED:true,
        ISVOI_TELEGRAM_BOT_USERNAME:'isvoi_help_bot',
        ISVOI_TELEGRAM_INTAKE_USER_ID:current.intake.id,
      });flagsChanged=true;
      await restartDirectus();
      const workerToken=current.telegram.TELEGRAM_DIRECTUS_TOKEN;
      if(!workerToken) throw new Error('WORKER_TOKEN_MISSING');
      const identity={bot_id:p.botId,worker_id:randomUUID()};
      const endpoint=async(path,token,body)=>{
        const response=await fetch(`http://127.0.0.1:8055/isvoi-telegram/${path}`,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
        return {response,body:await response.json().catch(()=>null)};
      };
      if((await endpoint('session',null,identity)).response.status!==403) throw new Error('PUBLIC_ENDPOINT_NOT_DENIED');
      const authenticated=await endpoint('session',workerToken,identity);
      if(!authenticated.response.ok||authenticated.body?.data?.mode!=='production'||authenticated.body?.data?.conversations!==true) throw new Error('CONVERSATIONS_ENDPOINT_NOT_READY');
      const publicIntake=await endpoint('intake-check',null,{});
      if(publicIntake.response.status!==403) throw new Error('PUBLIC_INTAKE_NOT_DENIED');
      const workerIntake=await endpoint('intake-check',workerToken,{});
      if(workerIntake.response.status!==403) throw new Error('WORKER_INTAKE_NOT_DENIED');
      const scopedIntake=await endpoint('intake-check',current.intake.token,{});
      if(!scopedIntake.response.ok||scopedIntake.body?.data?.ok!==true) throw new Error('SCOPED_INTAKE_PREFLIGHT_FAILED');
      sql(`UPDATE telegram_runtime SET lease_until=now() WHERE bot_id=${p.botId} AND worker_id='${identity.worker_id}';`);
      phase='ACTIVATE';
      await writeEnv(webEnvPath,{TELEGRAM_CONVERSATIONS_ENABLED:true});
      restartWorker();workerStopped=false;
      restartWeb();cmd('pm2',['save']);
      let live=false;
      for(let n=0;n<30;n++) {
        const lease=sql(`SELECT EXISTS(SELECT 1 FROM telegram_runtime WHERE bot_id=${p.botId} AND worker_id<>'${identity.worker_id}' AND lease_until>now())::text;`);
        const home=await fetch('https://isvoi.ru/',{redirect:'error',signal:AbortSignal.timeout(10000)}).catch(()=>null);
        if(lease==='true'&&home?.ok){live=true;break;}await pause(2000);
      }
      if(!live) throw new Error('ACTIVATION_SMOKE_FAILED');
      const processes=JSON.parse(cmd('pm2',['jlist']));
      for(const name of ['isvoi-web','isvoi-telegram']) if(!processes.some(x=>x.name===name&&x.pm2_env?.status==='online')) throw new Error('PM2_PROCESS_NOT_ONLINE');
      if(sql(`SELECT EXISTS(SELECT 1 FROM telegram_routes WHERE id='${p.route}' AND enabled)::text;`)!=='true') throw new Error('STAGE1_ROUTE_CHANGED');
      await writeFile(statePath,JSON.stringify({...current.state,commit:release.commit,conversationsEnabled:true,retentionMonths:6,conversationsBackup:backup,conversationsActivatedAt:new Date().toISOString()},null,2),{mode:0o600});
      console.log(JSON.stringify({status:'TELEGRAM_CONVERSATIONS_PRODUCTION_ENABLED',commit:release.commit,retentionMonths:6,stage1Preserved:true,backup}));
    } catch(error) {
      phase=`ROLLBACK_${phase}`;
      if(backup) {
        try{await copyFile(resolve(backup,'directus.env'),directusEnvPath);await copyFile(resolve(backup,'web.env'),webEnvPath);}catch{}
      }
      if(codeMerged) {
        // Baseline cleanliness is checked before merge, so this can only discard this exact release commit.
        try{cmd('git',['reset','--hard',expectedBase]);cmd('npm',['run','web:build'],{timeout:1200000});}catch{}
      }
      if(flagsChanged||codeMerged) {try{await restartDirectus();}catch{}try{restartWeb();}catch{}}
      if(workerStopped||codeMerged) {try{restartWorker();}catch{}}
      throw error;
    } finally {await rmdir(lock);}
  }
} catch(error) {
  const code=/^[A-Z][A-Z0-9_]{0,79}$/.test(error?.message||'')?error.message:'TELEGRAM_CONVERSATIONS_RELEASE_FAILED';
  console.error(`${code} (${phase}); secret details suppressed.`);process.exitCode=1;
}

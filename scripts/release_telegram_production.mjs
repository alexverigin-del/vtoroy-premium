// Reviewed first-install release only. The bot token arrives via SSH stdin, never argv.
import { spawnSync } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, copyFile, rmdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { parseEnv } from 'node:util';
import { setDefaultResultOrder } from 'node:dns';
import { setDefaultAutoSelectFamily } from 'node:net';
import { setTimeout as pause } from 'node:timers/promises';
import { telegramSql } from './setup_directus_telegram_sql.mjs';
import { productionIdentitySql, productionTelegram as p } from './setup_directus_telegram_production_sql.mjs';
import { inspectTelegram } from './telegram_preflight.mjs';
setDefaultResultOrder('ipv4first'); setDefaultAutoSelectFamily(false);
const root='/opt/isvoi', stack=resolve(root,'infra/directus-beget');
const source=resolve(process.cwd());
const expectedBase='f8bd33216a250cf3aa6161e9a1483be2f233a59a';
const lock=resolve(root,'var/telegram-release-lock');
const statePath=resolve(root,'var/telegram-release-state.json');
const action=process.argv[2] || 'install';
function cmd(program,args,{cwd=root,input,inputFile,binary=false}={}) {
  const fd=inputFile?openSync(inputFile,'r'):null;
  try {
    const result=spawnSync(program,args,{cwd,input,stdio:fd===null?undefined:[fd,'pipe','pipe'],encoding:binary?undefined:'utf8',timeout:180000,maxBuffer:64*1024*1024});
    if(result.error || result.status!==0) throw new Error('RELEASE_COMMAND_FAILED');
    return binary?result.stdout:result.stdout.trim();
  } finally {if(fd!==null)closeSync(fd);}
}
const sql = query => cmd('docker',['compose','exec','-T','database','psql','-U','isvoi','-d','isvoi','-v','ON_ERROR_STOP=1','-At'],{cwd:stack,input:query});
async function writeEnv(path,values) {
  let raw=''; try{raw=await readFile(path,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
  for(const [key,value] of Object.entries(values)) {
    const expression=new RegExp(`^${key}=.*$`,'gm');
    if([...raw.matchAll(expression)].length>1) throw new Error('DUPLICATE_ENV_KEY');
    const line=`${key}=${JSON.stringify(String(value))}`;
    raw=expression.test(raw)?raw.replace(expression,()=>line):`${raw.trimEnd()}\n${line}\n`;
  }
  await writeFile(path,raw,{mode:0o600});
}
async function ping() {
  for(let n=0;n<60;n++) {try{if((await fetch('http://127.0.0.1:8055/server/ping',{signal:AbortSignal.timeout(2000)})).ok)return;}catch{} await pause(1500);}
  throw new Error('DIRECTUS_RESTART_TIMEOUT');
}
let phase='VALIDATE';
try {
  if(!/^\/tmp\/isvoi-telegram-release-[A-Za-z0-9]+$/.test(source)) throw new Error('RELEASE_STAGING_REQUIRED');
  if(action==='disable') {
    const state=JSON.parse(await readFile(statePath,'utf8'));
    if(state.route!==p.route || !state.installed) throw new Error('RELEASE_STATE_INVALID');
    sql(`UPDATE telegram_routes SET enabled=false WHERE id='${p.route}';`);
    cmd('pm2',['stop','isvoi-telegram']); cmd('pm2',['save']);
    await writeEnv(resolve(root,'infra/telegram/.env'),{TELEGRAM_ENABLED:false});
    await writeEnv(resolve(stack,'.env'),{ISVOI_TELEGRAM_ENABLED:false});
    cmd('docker',['compose','up','-d','--force-recreate','--no-deps','directus'],{cwd:stack}); await ping();
    console.log('TELEGRAM_DISABLED_HISTORY_PRESERVED');
  } else if(action==='install') {
    if(cmd('git',['rev-parse','HEAD'])!==expectedBase || cmd('git',['status','--porcelain'])) throw new Error('PRODUCTION_CHECKOUT_CHANGED');
    // A code-only Git bundle carries exactly the reviewed release commit.
    const manifest=JSON.parse(await readFile(resolve(source,'release-manifest.json'),'utf8'));
    if(manifest.base!==expectedBase || !/^[a-f0-9]{40}$/.test(manifest.commit)) throw new Error('RELEASE_MANIFEST_INVALID');
    let input='';for await(const chunk of process.stdin)input+=chunk;
    const bot=parseEnv(input);
    if(bot.TELEGRAM_BOT_USERNAME?.replace(/^@/,'')!=='isvoi_help_bot' || bot.TELEGRAM_CHAT_ID!==p.chatId || !bot.TELEGRAM_BOT_TOKEN?.startsWith(`${p.botId}:`)) throw new Error('WRONG_PRODUCTION_BOT');
    const readiness=await inspectTelegram(bot);
    if(!readiness.ready || readiness.webhookConfigured) throw new Error('PRODUCTION_BOT_NOT_READY');
    if(sql("SELECT to_regclass('public.telegram_routes') IS NULL;")!=='t') throw new Error('TELEGRAM_ALREADY_INSTALLED');
    await mkdir(dirname(lock),{recursive:true}); await mkdir(lock);
    const stamp=new Date().toISOString().replace(/[-:.]/g,'');
    const backup=resolve(root,`backups/telegram-${stamp}`);
    await mkdir(backup,{mode:0o700});
    let identityInstalled=false,filesInstalled=false;
    try {
      phase='BACKUP';
      const dump=cmd('docker',['compose','exec','-T','database','pg_dump','-U','isvoi','-d','isvoi','-Fc'],{cwd:stack,binary:true});
      await writeFile(resolve(backup,'postgres.dump'),dump,{mode:0o600});
      // pg_restore --list exits after the archive TOC. Reading a file descriptor
      // avoids a false Node EPIPE when it intentionally leaves data unread.
      cmd('docker',['compose','exec','-T','database','pg_restore','--list'],{cwd:stack,inputFile:resolve(backup,'postgres.dump')});
      await copyFile(resolve(stack,'.env'),resolve(backup,'directus.env'));
      await copyFile(resolve(stack,'docker-compose.yml'),resolve(backup,'docker-compose.yml'));
      phase='CODE';
      cmd('git',['fetch',resolve(source,'release.bundle'),manifest.commit]);
      cmd('git',['merge','--ff-only',manifest.commit]); filesInstalled=true;
      phase='SCHEMA'; sql(telegramSql);
      const workerToken=randomBytes(32).toString('hex');
      sql(productionIdentitySql(workerToken)); identityInstalled=true;
      await mkdir(resolve(root,'infra/telegram'),{recursive:true});
      await writeEnv(resolve(root,'infra/telegram/.env'),{...bot,TELEGRAM_ENABLED:false,TELEGRAM_MODE:'production',TELEGRAM_DIRECTUS_URL:'http://127.0.0.1:8055',TELEGRAM_DIRECTUS_TOKEN:workerToken});
      await writeEnv(resolve(stack,'.env'),{ISVOI_TELEGRAM_ENABLED:true,ISVOI_TELEGRAM_BOT_ID:p.botId,ISVOI_TELEGRAM_WORKER_USER_ID:p.worker,ISVOI_TELEGRAM_MODE:'production'});
      phase='API';cmd('docker',['compose','up','-d','--force-recreate','--no-deps','directus'],{cwd:stack});await ping();
      const identity={bot_id:p.botId,worker_id:randomUUID()};
      const request=async auth=>fetch('http://127.0.0.1:8055/isvoi-telegram/session',{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:`Bearer ${workerToken}`}:{})},body:JSON.stringify(identity),signal:AbortSignal.timeout(15000)});
      if((await request(false)).status!==403) throw new Error('PUBLIC_ENDPOINT_NOT_DENIED');
      const response=await request(true), body=await response.json();
      if(!response.ok || body.data?.mode!=='production')throw new Error('WORKER_ENDPOINT_NOT_READY');
      // Release only this preflight lease before the permanent worker starts.
      sql(`UPDATE telegram_runtime SET lease_until=now() WHERE bot_id=${p.botId} AND worker_id='${identity.worker_id}';`);
      phase='ACTIVATE';
      await writeEnv(resolve(root,'infra/telegram/.env'),{TELEGRAM_ENABLED:true});
      cmd('pm2',['start','infra/telegram/ecosystem.config.cjs','--only','isvoi-telegram']);
      let leased=false;
      for(let n=0;n<40;n++) {
        if(sql(`SELECT EXISTS(SELECT 1 FROM telegram_runtime WHERE bot_id=${p.botId} AND worker_id<>'${identity.worker_id}' AND lease_until>now());`)==='t'){leased=true;break;}
        await pause(2000);
      }
      if(!leased) throw new Error('WORKER_LEASE_NOT_ACQUIRED');
      const processes=JSON.parse(cmd('pm2',['jlist']));
      if(!processes.some(proc=>proc.name==='isvoi-telegram' && proc.pm2_env?.status==='online'))throw new Error('WORKER_NOT_ONLINE');
      sql(`UPDATE telegram_routes SET enabled=true,activated_at=now() WHERE id='${p.route}';`);
      cmd('pm2',['save']);
      await writeFile(statePath,JSON.stringify({installed:true,route:p.route,commit:manifest.commit,backup,activatedAt:new Date().toISOString()},null,2),{mode:0o600});
      console.log(JSON.stringify({status:'TELEGRAM_PRODUCTION_ENABLED',bot:'isvoi_help_bot',chatId:p.chatId,backfill:false,backup}));
    } catch(error) {
      if(identityInstalled) {
        try{sql(`UPDATE telegram_routes SET enabled=false WHERE id='${p.route}'; UPDATE directus_users SET token=NULL,status='suspended' WHERE id='${p.worker}';`);}catch{}
        spawnSync('pm2',['delete','isvoi-telegram'],{cwd:root,stdio:'ignore'});
        try{await writeEnv(resolve(root,'infra/telegram/.env'),{TELEGRAM_ENABLED:false});}catch{}
      }
      if(filesInstalled) {
        await copyFile(resolve(backup,'directus.env'),resolve(stack,'.env'));
        // Keep additive reviewed code/schema, but endpoint defaults to disabled.
        await writeEnv(resolve(stack,'.env'),{ISVOI_TELEGRAM_ENABLED:false});
        try{cmd('docker',['compose','up','-d','--force-recreate','--no-deps','directus'],{cwd:stack});await ping();}catch{}
      }
      throw error;
    } finally { await rmdir(lock); }
  } else throw new Error('RELEASE_ACTION_INVALID');
} catch(error) {
  const code=/^[A-Z][A-Z0-9_]{0,79}$/.test(error.message || '')?error.message:'TELEGRAM_RELEASE_FAILED';
  console.error(`${code} (${phase}); secret details suppressed.`);process.exitCode=1;
}

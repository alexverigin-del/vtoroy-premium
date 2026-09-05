#!/usr/bin/env node
// Production release gate. It is inert unless invoked with check, enable or disable on the deployment host.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { openSync,closeSync } from 'node:fs';
import { readFile,writeFile,mkdir,copyFile,rmdir } from 'node:fs/promises';
import { resolve,dirname } from 'node:path';
import { parseEnv } from 'node:util';
import { setTimeout as pause } from 'node:timers/promises';
import { notificationsSql } from './setup_directus_telegram_notifications_sql.mjs';

const root='/opt/isvoi';
const stack=resolve(root,'infra/directus-beget');
const directusEnvPath=resolve(stack,'.env');
const telegramEnvPath=resolve(root,'infra/telegram/.env');
const statePath=resolve(root,'var/telegram-release-state.json');
const lock=resolve(root,'var/telegram-notifications-release-lock');
const source=resolve(process.cwd());
const expectedBase='9bc0a592338bbb9bba13b6dfb08ad30e7409eac9';
const action=process.argv[2]||'check';

function cmd(program,args,{cwd=root,input,inputFile,binary=false,timeout=180000,env}={}) {
 const fd=inputFile?openSync(inputFile,'r'):null;
 try {const result=spawnSync(program,args,{cwd,input,stdio:fd===null?undefined:[fd,'pipe','pipe'],encoding:binary?undefined:'utf8',timeout,maxBuffer:64*1024*1024,env:env||process.env});if(result.error||result.status!==0)throw new Error('RELEASE_COMMAND_FAILED');return binary?result.stdout:result.stdout.trim();}
 finally{if(fd!==null)closeSync(fd);}
}
const sql=query=>cmd('docker',['compose','exec','-T','database','psql','-U','isvoi','-d','isvoi','-v','ON_ERROR_STOP=1','-At'],{cwd:stack,input:query});
async function writeEnv(path,values){let raw=await readFile(path,'utf8');for(const [key,value] of Object.entries(values)){const re=new RegExp(`^${key}=.*$`,'gm');if([...raw.matchAll(re)].length>1)throw new Error('DUPLICATE_ENV_KEY');const line=`${key}=${JSON.stringify(String(value))}`;raw=re.test(raw)?raw.replace(re,()=>line):`${raw.trimEnd()}\n${line}\n`;}await writeFile(path,raw,{mode:0o600});}
async function ping(){for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:8055/server/ping',{signal:AbortSignal.timeout(2000)})).ok)return;}catch{}await pause(1500);}throw new Error('DIRECTUS_RESTART_TIMEOUT');}
async function restartDirectus(){cmd('docker',['compose','up','-d','--no-deps','directus'],{cwd:stack});await ping();}
function manifest(){if(!/^\/tmp\/isvoi-telegram-notifications-release-[A-Za-z0-9]+$/.test(source))throw new Error('RELEASE_STAGING_REQUIRED');const value=JSON.parse(cmd('cat',[resolve(source,'release-manifest.json')]));if(value.base!==expectedBase||!/^[a-f0-9]{40}$/.test(value.commit)||!/^[a-f0-9]{64}$/.test(value.bundle_sha256))throw new Error('RELEASE_MANIFEST_INVALID');const bundle=cmd('sha256sum',[resolve(source,'release.bundle')]).split(/\s+/)[0];if(bundle!==value.bundle_sha256)throw new Error('RELEASE_BUNDLE_HASH_MISMATCH');return value;}
function baseline(){const head=cmd('git',['rev-parse','HEAD']);if(head!==expectedBase||cmd('git',['status','--porcelain']))throw new Error('PRODUCTION_CHECKOUT_CHANGED');if(sql("SELECT (to_regclass('public.telegram_message_outbox') IS NOT NULL AND to_regclass('public.telegram_client_sessions') IS NOT NULL)::text;")!=='true')throw new Error('CONVERSATIONS_SCHEMA_REQUIRED');const telegram=parseEnv(cmd('cat',[telegramEnvPath]));if(telegram.TELEGRAM_ENABLED!=='true'||telegram.TELEGRAM_MODE!=='production'||!telegram.TELEGRAM_BOT_TOKEN?.startsWith('8694946838:'))throw new Error('PRODUCTION_WORKER_CONFIG_INVALID');return {telegram};}

let phase='VALIDATE',backup,merged=false,workerStopped=false;
try {
 if(!['check','enable','disable'].includes(action))throw new Error('RELEASE_ACTION_INVALID');
 const release=manifest();
 if(action==='disable') {
  await writeEnv(directusEnvPath,{ISVOI_TELEGRAM_NOTIFICATIONS_ENABLED:false});
  sql("UPDATE telegram_bot_settings SET notifications_enabled=false WHERE bot_id=8694946838; UPDATE telegram_message_outbox SET state='cancelled',error_code='NOTIFICATIONS_DISABLED' WHERE campaign_id IS NOT NULL AND state='pending';");
  await restartDirectus();cmd('pm2',['restart','isvoi-telegram','--update-env']);cmd('pm2',['save']);console.log('TELEGRAM_NOTIFICATIONS_DISABLED_CONVERSATIONS_PRESERVED');
 } else {
  const current=baseline();
  if(action==='check'){console.log(JSON.stringify({status:'TELEGRAM_NOTIFICATIONS_RELEASE_READY',base:expectedBase,commit:release.commit,pilotTelegramIds:['65092546'],publicSubscriptions:false,channel:false}));process.exit(0);}
  await mkdir(dirname(lock),{recursive:true});await mkdir(lock);
  const stamp=new Date().toISOString().replace(/[-:.]/g,'');backup=resolve(root,`backups/telegram-notifications-${stamp}`);await mkdir(backup,{mode:0o700});
  try {
   phase='BACKUP';const dump=cmd('docker',['compose','exec','-T','database','pg_dump','-U','isvoi','-d','isvoi','-Fc'],{cwd:stack,binary:true});await writeFile(resolve(backup,'postgres.dump'),dump,{mode:0o600});cmd('docker',['compose','exec','-T','database','pg_restore','--list'],{cwd:stack,inputFile:resolve(backup,'postgres.dump')});await copyFile(directusEnvPath,resolve(backup,'directus.env'));await copyFile(telegramEnvPath,resolve(backup,'telegram.env'));
   phase='CODE';cmd('pm2',['stop','isvoi-telegram']);workerStopped=true;sql('UPDATE telegram_runtime SET lease_until=now() WHERE bot_id=8694946838;');cmd('git',['fetch',resolve(source,'release.bundle'),release.commit]);cmd('git',['merge','--ff-only',release.commit]);merged=true;
   phase='VERIFY';cmd('npm',['run','telegram:build']);cmd('npm',['run','telegram:test']);cmd('npm',['run','web:verify'],{timeout:1200000});cmd('node',['scripts/rehearse_telegram.mjs','--production'],{timeout:300000});
   phase='SCHEMA';sql(notificationsSql);sql("INSERT INTO telegram_bot_settings(bot_id,notifications_enabled,pilot_mode,pilot_user_ids) VALUES(8694946838,true,true,'[\"65092546\"]'::jsonb) ON CONFLICT(bot_id) DO UPDATE SET notifications_enabled=true,pilot_mode=true,pilot_user_ids='[\"65092546\"]'::jsonb;");
   await writeEnv(directusEnvPath,{ISVOI_TELEGRAM_NOTIFICATIONS_ENABLED:true});await restartDirectus();
   phase='PROFILE';cmd('node',['scripts/configure_telegram_bot_profile.mjs','--apply'],{env:{...process.env,TELEGRAM_BOT_TOKEN:current.telegram.TELEGRAM_BOT_TOKEN}});
   phase='ACTIVATE';cmd('npm',['run','web:build'],{timeout:1200000});cmd('pm2',['restart','isvoi-web','--update-env']);cmd('pm2',['restart','isvoi-telegram','--update-env']);workerStopped=false;cmd('pm2',['save']);
   for(let i=0;i<30;i++){const live=sql("SELECT EXISTS(SELECT 1 FROM telegram_runtime WHERE bot_id=8694946838 AND lease_until>now())::text;");const home=await fetch('https://isvoi.ru/',{redirect:'error',signal:AbortSignal.timeout(10000)}).catch(()=>null);if(live==='true'&&home?.ok){await writeFile(statePath,JSON.stringify({commit:release.commit,notificationsEnabled:true,pilotTelegramIds:['65092546'],channelEnabled:false,backup,activatedAt:new Date().toISOString()},null,2),{mode:0o600});console.log(JSON.stringify({status:'TELEGRAM_NOTIFICATIONS_PILOT_ENABLED',commit:release.commit,backup}));process.exit(0);}await pause(2000);}throw new Error('ACTIVATION_SMOKE_FAILED');
  } catch(error) {
   phase=`ROLLBACK_${phase}`;try{sql("UPDATE telegram_bot_settings SET notifications_enabled=false WHERE bot_id=8694946838;");}catch{}try{await copyFile(resolve(backup,'directus.env'),directusEnvPath);}catch{}if(merged){try{cmd('git',['reset','--hard',expectedBase]);cmd('npm',['run','web:build'],{timeout:1200000});}catch{}}try{await restartDirectus();}catch{}try{cmd('pm2',['restart','isvoi-web','--update-env']);}catch{}try{cmd('pm2',['restart','isvoi-telegram','--update-env']);}catch{}throw error;
  } finally{await rmdir(lock);}
 }
} catch(error){const code=/^[A-Z][A-Z0-9_]{0,79}$/.test(error?.message||'')?error.message:'TELEGRAM_NOTIFICATIONS_RELEASE_FAILED';console.error(`${code} (${phase}); details suppressed.`);process.exitCode=1;}

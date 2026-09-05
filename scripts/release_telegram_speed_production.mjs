#!/usr/bin/env node
// Production release gate for queue pacing, menu edits and delivery metrics.
import { spawnSync } from 'node:child_process';
import { openSync,closeSync } from 'node:fs';
import { readFile,writeFile,mkdir,copyFile,rmdir } from 'node:fs/promises';
import { resolve,dirname } from 'node:path';
import { parseEnv } from 'node:util';
import { setTimeout as pause } from 'node:timers/promises';
import { notificationsSql } from './setup_directus_telegram_notifications_sql.mjs';

const root='/opt/isvoi';
const stack=resolve(root,'infra/directus-beget');
const telegramEnvPath=resolve(root,'infra/telegram/.env');
const statePath=resolve(root,'var/telegram-speed-release-state.json');
const lock=resolve(root,'var/telegram-speed-release-lock');
const source=resolve(process.cwd());
const expectedBase='94d44f7799b7e8e640859ffab2909f15db84055c';
const action=process.argv[2]||'check';

function cmd(program,args,{cwd=root,input,inputFile,binary=false,timeout=180000}={}) {
 const fd=inputFile?openSync(inputFile,'r'):null;
 try {const result=spawnSync(program,args,{cwd,input,stdio:fd===null?undefined:[fd,'pipe','pipe'],encoding:binary?undefined:'utf8',timeout,maxBuffer:64*1024*1024});if(result.error||result.status!==0)throw new Error('RELEASE_COMMAND_FAILED');return binary?result.stdout:result.stdout.trim();}
 finally{if(fd!==null)closeSync(fd);}
}
const sql=query=>cmd('docker',['compose','exec','-T','database','psql','-U','isvoi','-d','isvoi','-v','ON_ERROR_STOP=1','-At'],{cwd:stack,input:query});
async function ping(){for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:8055/server/ping',{signal:AbortSignal.timeout(2000)})).ok)return;}catch{}await pause(1500);}throw new Error('DIRECTUS_RESTART_TIMEOUT');}
async function restartDirectus(){cmd('docker',['compose','up','-d','--no-deps','directus'],{cwd:stack});await ping();}
function manifest(){if(!/^\/tmp\/isvoi-telegram-speed-release-[A-Za-z0-9]+$/.test(source))throw new Error('RELEASE_STAGING_REQUIRED');const value=JSON.parse(cmd('cat',[resolve(source,'release-manifest.json')]));if(value.base!==expectedBase||!/^[a-f0-9]{40}$/.test(value.commit)||!/^[a-f0-9]{64}$/.test(value.bundle_sha256))throw new Error('RELEASE_MANIFEST_INVALID');const hash=cmd('sha256sum',[resolve(source,'release.bundle')]).split(/\s+/)[0];if(hash!==value.bundle_sha256)throw new Error('RELEASE_BUNDLE_HASH_MISMATCH');return value;}
function baseline(){if(cmd('git',['rev-parse','HEAD'])!==expectedBase||cmd('git',['status','--porcelain']))throw new Error('PRODUCTION_CHECKOUT_CHANGED');const telegram=parseEnv(cmd('cat',[telegramEnvPath]));if(telegram.TELEGRAM_ENABLED!=='true'||telegram.TELEGRAM_MODE!=='production'||!telegram.TELEGRAM_BOT_TOKEN?.startsWith('8694946838:'))throw new Error('PRODUCTION_WORKER_CONFIG_INVALID');if(sql("SELECT coalesce((SELECT notifications_enabled AND pilot_mode AND NOT channel_enabled FROM telegram_bot_settings WHERE bot_id=8694946838),false)::text;")!=='true')throw new Error('PILOT_STATE_CHANGED');}

let phase='VALIDATE',backup,merged=false;
try {
 if(!['check','apply'].includes(action))throw new Error('RELEASE_ACTION_INVALID');
 const release=manifest();baseline();
 if(action==='check'){console.log(JSON.stringify({status:'TELEGRAM_SPEED_RELEASE_READY',base:expectedBase,commit:release.commit}));process.exit(0);}
 await mkdir(dirname(lock),{recursive:true});await mkdir(lock);
 const stamp=new Date().toISOString().replace(/[-:.]/g,'');backup=resolve(root,`backups/telegram-speed-${stamp}`);await mkdir(backup,{mode:0o700});
 try {
  phase='BACKUP';const dump=cmd('docker',['compose','exec','-T','database','pg_dump','-U','isvoi','-d','isvoi','-Fc'],{cwd:stack,binary:true});await writeFile(resolve(backup,'postgres.dump'),dump,{mode:0o600});cmd('docker',['compose','exec','-T','database','pg_restore','--list'],{cwd:stack,inputFile:resolve(backup,'postgres.dump')});await copyFile(telegramEnvPath,resolve(backup,'telegram.env'));
  phase='CODE';cmd('pm2',['stop','isvoi-telegram']);sql('UPDATE telegram_runtime SET lease_until=now() WHERE bot_id=8694946838;');cmd('git',['fetch',resolve(source,'release.bundle'),release.commit]);cmd('git',['merge','--ff-only',release.commit]);merged=true;
  phase='VERIFY';cmd('npm',['run','telegram:build']);cmd('npm',['run','telegram:test']);cmd('npm',['run','web:verify'],{timeout:1200000});cmd('node',['scripts/rehearse_telegram.mjs','--production'],{timeout:300000});
  phase='SCHEMA';sql(notificationsSql);await restartDirectus();
  phase='ACTIVATE';cmd('pm2',['restart','isvoi-telegram','--update-env']);cmd('pm2',['save']);
  for(let i=0;i<30;i++){
   const live=sql("SELECT (EXISTS(SELECT 1 FROM telegram_runtime WHERE bot_id=8694946838 AND lease_until>now()) AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='telegram_message_outbox' AND column_name='sent_at') AND EXISTS(SELECT 1 FROM telegram_delivery_metrics WHERE bot_id=8694946838 AND delivery_class='service') AND EXISTS(SELECT 1 FROM telegram_delivery_metrics WHERE bot_id=8694946838 AND delivery_class='campaign'))::text;");
   if(live==='true'){await writeFile(statePath,JSON.stringify({commit:release.commit,serviceDelayMs:1100,campaignDelayMs:3200,metricsWindowHours:24,backup,activatedAt:new Date().toISOString()},null,2),{mode:0o600});console.log(JSON.stringify({status:'TELEGRAM_SPEED_RELEASED',commit:release.commit,backup}));process.exit(0);}await pause(2000);
  }
  throw new Error('ACTIVATION_SMOKE_FAILED');
 } catch(error) {
  phase=`ROLLBACK_${phase}`;
  if(merged){try{cmd('git',['reset','--hard',expectedBase]);cmd('npm',['run','telegram:build']);}catch{}}
  try{await restartDirectus();}catch{}try{cmd('pm2',['restart','isvoi-telegram','--update-env']);}catch{}throw error;
 } finally{await rmdir(lock);}
} catch(error){const code=/^[A-Z][A-Z0-9_]{0,79}$/.test(error?.message||'')?error.message:'TELEGRAM_SPEED_RELEASE_FAILED';console.error(`${code} (${phase}); details suppressed.`);process.exitCode=1;}

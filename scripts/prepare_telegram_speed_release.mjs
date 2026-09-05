#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile,writeFile,mkdir,copyFile } from 'node:fs/promises';
import { resolve,dirname,sep } from 'node:path';

const base='94d44f7799b7e8e640859ffab2909f15db84055c';
const root=resolve('.');
const outputRoot=resolve('work/outputs');
const output=resolve(process.argv[2]||'');
if(!process.argv[2]||!output.startsWith(outputRoot+sep)||!/telegram-speed-release-[A-Za-z0-9_-]+$/.test(output)) throw new Error('OUTPUT_DIRECTORY_INVALID');
function git(args){const result=spawnSync('git',args,{cwd:root,encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024});if(result.error||result.status!==0)throw new Error('GIT_COMMAND_FAILED');return result.stdout.trim();}
if(git(['status','--porcelain'])) throw new Error('WORKTREE_NOT_CLEAN');
const commit=git(['rev-parse','HEAD']);
if(!/^[a-f0-9]{40}$/.test(commit)||git(['merge-base',base,commit])!==base||commit===base) throw new Error('RELEASE_BASE_NOT_ANCESTOR');
const files=git(['diff','--name-only',`${base}..${commit}`]).split(/\r?\n/).filter(Boolean);
if(!files.length||files.some(path=>/(^|\/)(\.env$|private|backups|work)(\/|$)/i.test(path))) throw new Error('RELEASE_FILE_SET_INVALID');
await mkdir(output,{recursive:false,mode:0o700});
const bundle=resolve(output,'release.bundle');
git(['bundle','create',bundle,'HEAD',`^${base}`]);git(['bundle','verify',bundle]);
const bytes=await readFile(bundle);
const manifest={base,commit,bundle_sha256:createHash('sha256').update(bytes).digest('hex'),files};
await writeFile(resolve(output,'release-manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});
for(const path of ['scripts/release_telegram_speed_production.mjs','scripts/setup_directus_telegram_notifications_sql.mjs']) {
 const target=resolve(output,path);await mkdir(dirname(target),{recursive:true});await copyFile(resolve(path),target);
}
console.log(JSON.stringify({status:'TELEGRAM_SPEED_RELEASE_PREPARED',base,commit,files:files.length,bundle_sha256:manifest.bundle_sha256,output}));

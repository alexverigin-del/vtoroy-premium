#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const compose=path.join(root,'infra','directus-beget','docker-compose.yml');
const uploads=path.join(root,'infra','directus-beget','uploads');
const assets=[
  {key:'welcome',title:'isvoi:telegram:welcome:v1',file:path.join(root,'assets','brand','telegram','isvoi-telegram-welcome-v1.jpg'),type:'image/jpeg'},
  {key:'avatar',title:'isvoi:telegram:avatar:v2',file:path.join(root,'assets','brand','telegram','isvoi-telegram-avatar-v2.png'),type:'image/png'},
];

function sqlValue(value) {return `'${String(value).replaceAll("'","''")}'`;}
function sql(query) {
  const result=spawnSync('docker',['compose','-f',compose,'exec','-T','database','sh','-lc','psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -v ON_ERROR_STOP=1'],{cwd:root,input:query,encoding:'utf8'});
  if(result.error || result.status!==0) throw new Error(result.error?.message || result.stderr || result.stdout || 'DIRECTUS_SQL_FAILED');
  return result.stdout.trim();
}

function botId() {
  const at=process.argv.indexOf('--bot-id');
  const value=at>=0?process.argv[at+1]:process.env.ISVOI_TELEGRAM_BOT_ID;
  if(!/^[1-9][0-9]{4,15}$/.test(String(value || ''))) throw new Error('Pass a valid --bot-id.');
  return String(value);
}

async function install(asset) {
  const [metadata,fileStat]=await Promise.all([sharp(asset.file).metadata(),stat(asset.file)]);
  if(!['jpeg','png'].includes(metadata.format) || !metadata.width || !metadata.height) throw new Error(`INVALID_BRAND_ASSET:${asset.key}`);
  const existing=sql(`SELECT id::text||E'\\t'||filename_disk FROM directus_files WHERE title=${sqlValue(asset.title)} ORDER BY uploaded_on DESC LIMIT 1;`);
  const [existingId,existingDisk]=existing?existing.split('\t'):[];
  const id=existingId || randomUUID();
  const filenameDisk=existingDisk || `${id}${path.extname(asset.file).toLowerCase()}`;
  const target=path.join(uploads,filenameDisk);
  if(path.dirname(target)!==uploads) throw new Error('UNSAFE_UPLOAD_PATH');
  await mkdir(uploads,{recursive:true});
  const temporary=`${target}.new`;
  await copyFile(asset.file,temporary);
  await rename(temporary,target);
  sql(existingId
    ? `UPDATE directus_files SET filename_download=${sqlValue(path.basename(asset.file))},type=${sqlValue(asset.type)},filesize=${fileStat.size},width=${metadata.width},height=${metadata.height},modified_on=now() WHERE id=${sqlValue(id)}::uuid AND title=${sqlValue(asset.title)};`
    : `INSERT INTO directus_files(id,storage,filename_disk,filename_download,title,description,type,folder,filesize,width,height,uploaded_on) VALUES(${sqlValue(id)}::uuid,'local',${sqlValue(filenameDisk)},${sqlValue(path.basename(asset.file))},${sqlValue(asset.title)},'Фирменное изображение Telegram I СВОИ',${sqlValue(asset.type)},(SELECT id FROM directus_folders WHERE name='ISVOI Site Assets' ORDER BY id LIMIT 1),${fileStat.size},${metadata.width},${metadata.height},now());`);
  return {id,filenameDisk};
}

const id=botId();
const installed=Object.fromEntries(await Promise.all(assets.map(async asset=>[asset.key,await install(asset)])));
const updated=sql(`UPDATE telegram_bot_settings SET welcome_photo_file=${sqlValue(installed.welcome.id)}::uuid,updated_at=now() WHERE bot_id=${id} RETURNING bot_id;`);
if(!updated.split(/\r?\n/).includes(id)) throw new Error('TELEGRAM_BOT_SETTINGS_NOT_FOUND');
console.log(`Installed Telegram brand assets: welcome=${installed.welcome.id}, avatar=${installed.avatar.id}, bot=${id}.`);

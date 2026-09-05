#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';

const base='2bee9ed328fe85d65fd270211c99e7147c9efb1d';
const root=resolve('.');
const outputRoot=resolve('work/outputs');
const output=resolve(process.argv[2]||'');
if(!process.argv[2]||!output.startsWith(outputRoot+sep)||!/telegram-conversations-release-[A-Za-z0-9_-]+$/.test(output)) throw new Error('OUTPUT_DIRECTORY_INVALID');
function git(args) {
  const result=spawnSync('git',args,{cwd:root,encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024});
  if(result.error||result.status!==0) throw new Error('GIT_COMMAND_FAILED');
  return result.stdout.trim();
}
if(git(['status','--porcelain'])) throw new Error('WORKTREE_NOT_CLEAN');
const commit=git(['rev-parse','HEAD']);
if(!/^[a-f0-9]{40}$/.test(commit)||git(['rev-parse',`${commit}^`])!==base) throw new Error('RELEASE_MUST_BE_ONE_COMMIT_AFTER_BASE');
const allowed=new Set([
  'apps/web/.env.example','apps/web/app/lead-intake/route.ts','apps/web/components/ClubLeadForm.tsx',
  'apps/web/components/FinalCtaSection.tsx','apps/web/components/ProductLeadForm.tsx','apps/web/components/TelegramContinue.tsx',
  'apps/web/components/TradeInWizard.tsx','apps/web/components/useLeadIntake.ts','docs/telegram-client-conversations-release.md',
  'docs/telegram-client-conversations.md','docs/telegram-leads-design.md','infra/directus-beget/.env.example',
  'infra/directus-beget/docker-compose.yml',
  'infra/directus-beget/extensions-bundled/directus-extension-isvoi-telegram/dist/conversations.js',
  'infra/directus-beget/extensions-bundled/directus-extension-isvoi-telegram/dist/index.js',
  'infra/directus-beget/extensions-bundled/directus-extension-isvoi-telegram/dist/protocol.js',
  'infra/directus-beget/extensions-bundled/directus-extension-isvoi-telegram/src/conversations.js',
  'infra/directus-beget/extensions-bundled/directus-extension-isvoi-telegram/src/index.js',
  'infra/directus-beget/extensions-bundled/directus-extension-isvoi-telegram/src/protocol.js','infra/telegram/.env.example',
  'package.json','scripts/audit_next_bundle_budget.mjs','scripts/build_telegram_extension.mjs',
  'scripts/content_ownership_baseline.json','scripts/lib/telegram-worker.mjs',
  'scripts/prepare_telegram_conversations_release.mjs','scripts/rehearse_telegram.mjs',
  'scripts/release_telegram_conversations_production.mjs','scripts/setup_directus_telegram_conversations_sql.mjs',
  'scripts/telegram_conversations_contract.mjs','scripts/telegram_pilot_client.mjs','scripts/telegram_pilot_fixture.mjs',
  'scripts/telegram_pilot_server.mjs','scripts/telegram_production_contract.mjs','scripts/test_telegram_integration.mjs',
]);
const changed=git(['diff','--name-only',`${base}..${commit}`]).split(/\r?\n/).filter(Boolean);
if(!changed.length||changed.some(path=>!allowed.has(path))||changed.some(path=>/(^|\/)(\.env|work|private)(\/|$)/i.test(path))) throw new Error('RELEASE_FILE_SET_INVALID');
await mkdir(output,{recursive:false,mode:0o700});
const bundle=resolve(output,'release.bundle');
git(['bundle','create',bundle,'HEAD',`^${base}`]);
git(['bundle','verify',bundle]);
const bytes=await readFile(bundle);
const manifest={base,commit,bundle_sha256:createHash('sha256').update(bytes).digest('hex'),files:changed};
await writeFile(resolve(output,'release-manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});
for(const path of [
  'scripts/release_telegram_conversations_production.mjs','scripts/setup_directus_telegram_conversations_sql.mjs',
  'scripts/setup_directus_telegram_production_sql.mjs','scripts/telegram_preflight.mjs',
]) {
  const target=resolve(output,path);await mkdir(dirname(target),{recursive:true});await copyFile(resolve(root,path),target);
}
console.log(JSON.stringify({status:'TELEGRAM_CONVERSATIONS_RELEASE_PREPARED',base,commit,files:changed.length,bundle_sha256:manifest.bundle_sha256,output}));

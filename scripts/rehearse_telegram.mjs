#!/usr/bin/env node
// Local disposable containers only. Never contacts SSH or an existing database.
import { spawnSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile, mkdir, copyFile, rm } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { telegramSql } from './setup_directus_telegram_sql.mjs';
const suffix = randomBytes(6).toString('hex');
const network = `isvoi-telegram-test-${suffix}`;
const database = `${network}-db`;
const runner = `${network}-runner`;
const production = process.argv.includes('--production');
const native = process.argv.includes('--native') || production;
if (process.argv.slice(2).some(arg => !['--native','--production'].includes(arg)) || process.argv.slice(2).length > 1) throw new Error('Unknown rehearsal option');
const stagingRoot = resolve('work/telegram-rehearsal');
const staging = resolve(stagingRoot, suffix);
let stagingCreated = false;
const docker = (args, input) => spawnSync('docker', args, { encoding: 'utf8', input, timeout: 30000, maxBuffer: 1024 * 1024 });
function check(result) { if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr || 'Docker command failed'); return result.stdout; }
check(docker(['version', '--format', '{{.Server.Version}}']));
// Images must already be present. This test never pulls images or uses host secrets.
for (const image of ['postgres:16-alpine', 'directus/directus:11.17.4']) check(docker(['image', 'inspect', image, '--format', '{{.Id}}']));
try {
  await mkdir(stagingRoot, { recursive: true });
  await mkdir(staging); // Exclusive creation; never overwrite another fixture.
  stagingCreated = true;
  for (const file of [
    'scripts/telegram_pg_contract.mjs', 'scripts/setup_directus_telegram_sql.mjs',
    ...(native ? ['scripts/telegram_native_contract.mjs', 'scripts/fixtures/telegram_schema.sql'] : []),
    ...(production ? ['scripts/telegram_production_contract.mjs','scripts/setup_directus_telegram_production_sql.mjs'] : []),
    'infra/directus-beget/extensions-bundled/directus-extension-isvoi-telegram/package.json',
    'infra/directus-beget/extensions-bundled/directus-extension-isvoi-telegram/src/index.js',
    'infra/directus-beget/extensions-bundled/directus-extension-isvoi-telegram/src/protocol.js',
  ]) {
    await mkdir(dirname(resolve(staging, file)), { recursive: true });
    await copyFile(resolve(file), resolve(staging, file));
  }
  check(docker(['network', 'create', '--internal', network]));
  check(docker(['run', '-d', '--name', database, '--network', network, '--network-alias', 'db', '--memory', '512m', '--cpus', '0.5', '--tmpfs', '/var/lib/postgresql/data:rw,size=384m', '-e', 'POSTGRES_PASSWORD=fixture', '-e', 'POSTGRES_DB=telegram_test', 'postgres:16-alpine']));
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    const result = docker(['exec', '-e', 'PGPASSWORD=fixture', database, 'psql', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'telegram_test', '-c', 'SELECT 1']);
    if (result.status === 0) { ready = true; break; }
    await pause(500);
  }
  if (!ready) throw new Error('Fixture database did not become ready');
  if (native) {
    const nativeArgs = ['run', '--rm', '--name', runner, '--network', network, '--memory', '768m', '--cpus', '0.75', '--entrypoint', 'node',
      '-e', 'TELEGRAM_DISPOSABLE_FIXTURE=true', '-e', 'DB_CLIENT=pg', '-e', 'DB_HOST=db', '-e', 'DB_PORT=5432', '-e', 'DB_USER=postgres', '-e', 'DB_PASSWORD=fixture', '-e', 'DB_DATABASE=telegram_test',
      '-e', 'SECRET=disposable-fixture-only-not-a-production-secret', '-e', 'TELEMETRY=false', '-e', 'CACHE_ENABLED=false', '-e', 'CACHE_SCHEMA=false', '-e', 'LOG_LEVEL=error',
      '--mount', `type=bind,source=${staging},target=/workspace,readonly`, 'directus/directus:11.17.4'];
    for (const command of [
      ['/directus/node_modules/@directus/api/dist/cli/run.js', 'bootstrap', '--skipAdminInit'],
      [production ? '/workspace/scripts/telegram_production_contract.mjs' : '/workspace/scripts/telegram_native_contract.mjs'],
    ]) {
      const child = spawn('docker', [...nativeArgs, ...command], { stdio: 'inherit' });
      const timeout = setTimeout(() => { docker(['rm', '-f', runner]); }, 180000);
      try {
        const status = await new Promise((resolveStatus, reject) => { child.on('error', reject); child.on('exit', resolveStatus); });
        if (status !== 0) throw new Error('Native Directus contract failed');
      } finally { clearTimeout(timeout); }
    }
  } else {
  const fixture = await readFile(new URL('./fixtures/telegram_schema.sql', import.meta.url), 'utf8');
  const sql = fixture + '\n' + telegramSql + '\n' + telegramSql;
  check(docker(['exec', '-i', database, 'psql', '-U', 'postgres', '-d', 'telegram_test', '-v', 'ON_ERROR_STOP=1'], sql));
  const child = spawn('docker', ['run', '--rm', '--name', runner, '--network', network, '--memory', '384m', '--cpus', '0.5', '--entrypoint', 'node', '-e', 'TELEGRAM_DISPOSABLE_FIXTURE=true', '-e', 'DB_HOST=db', '--mount', `type=bind,source=${staging},target=/workspace,readonly`, 'directus/directus:11.17.4', '/workspace/scripts/telegram_pg_contract.mjs'], { stdio: 'inherit' });
  const status = await new Promise((resolveStatus, reject) => { child.on('error', reject); child.on('exit', resolveStatus); });
  if (status !== 0) throw new Error('PostgreSQL contract failed');
  }
} finally {
  docker(['rm', '-f', runner]);
  docker(['rm', '-f', database]);
  docker(['network', 'rm', network]);
  if (!staging.startsWith(stagingRoot + sep) || staging === stagingRoot) throw new Error('Unsafe fixture cleanup path');
  if (stagingCreated) await rm(staging, { recursive: true, force: true });
}

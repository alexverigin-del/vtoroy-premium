// Start only from a reviewed code-only staging directory on the ISVOI server.
// No production paths, Telegram credentials, public ports or production DB access.
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
const root = process.cwd();
if (!/^\/tmp\/isvoi-telegram-check-[A-Za-z0-9]+$/.test(root)) throw new Error('PILOT_STAGING_REQUIRED');
const action = process.argv[2] || 'start';
const statePath = resolve('pilot-state.json');
const ext = resolve('infra/directus-beget/extensions-bundled/directus-extension-isvoi-telegram');
const image = 'directus/directus:11.17.4';
const privateIPv4 = value => /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(value) && value.split('.').length === 4 && value.split('.').every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255);
function docker(args, input) {
  const result = spawnSync('docker', args, { encoding: 'utf8', input, timeout: 30000, maxBuffer: 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error('PILOT_DOCKER_COMMAND_FAILED');
  return result.stdout.trim();
}
function valid(state) {
  if (!/^isvoi-telegram-pilot-[a-f0-9]{12}$/.test(state.network) || state.database !== `${state.network}-db` || state.api !== `${state.network}-api` || state.runner !== `${state.network}-runner`) throw new Error('PILOT_STATE_INVALID');
}
function envArgs() { return [
  '-e', 'TELEGRAM_DISPOSABLE_FIXTURE=true', '-e', 'DB_CLIENT=pg', '-e', 'DB_HOST=db', '-e', 'DB_PORT=5432', '-e', 'DB_USER=postgres', '-e', 'DB_PASSWORD=fixture', '-e', 'DB_DATABASE=telegram_pilot',
  '-e', 'TELEMETRY=false', '-e', 'CACHE_ENABLED=false', '-e', 'CACHE_SCHEMA=false', '-e', 'LOG_LEVEL=error',
]; }
function execArgs(state, command) { valid(state); return ['exec', '-i', state.api, 'node', '/workspace/scripts/telegram_pilot_fixture.mjs', command]; }
async function cleanup(state) {
  valid(state);
  for (const name of [state.runner, state.api, state.database]) spawnSync('docker', ['rm', '-f', name], { stdio: 'ignore', timeout: 30000 });
  spawnSync('docker', ['network', 'rm', state.network], { stdio: 'ignore', timeout: 30000 });
  state.stopped = true;
  await writeFile(statePath, JSON.stringify(state, null, 2), { mode: 0o600 });
}
if (action !== 'start') {
  const state = JSON.parse(await readFile(statePath, 'utf8')); valid(state);
  if (action === 'stop') { await cleanup(state); console.log('PILOT_STOPPED'); }
  else if (['enqueue','status','conversation-link'].includes(action)) {
    if (state.stopped || Date.now() >= state.expiresAt) throw new Error('PILOT_EXPIRED');
    console.log(docker(execArgs(state, action)));
  } else throw new Error('PILOT_ACTION_INVALID');
} else {
  // Exclusive file prevents a second pilot from replacing state of an active one.
  const network = `isvoi-telegram-pilot-${randomBytes(6).toString('hex')}`;
  const state = { network, database: `${network}-db`, api: `${network}-api`, runner: `${network}-runner`, expiresAt: Date.now() + 3600000, stopped: false };
  let previous;
  try { previous = JSON.parse(await readFile(statePath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (previous) {
    valid(previous);
    if (!previous.stopped) throw new Error('PILOT_ALREADY_ACTIVE');
    for (const name of [previous.database, previous.api, previous.runner]) {
      if (spawnSync('docker', ['container', 'inspect', name], { stdio: 'ignore', timeout: 10000 }).status === 0) throw new Error('PILOT_CLEANUP_REQUIRED');
    }
    await rename(statePath, resolve(`pilot-state-${Date.now()}.json`));
  }
  await writeFile(statePath, JSON.stringify(state), { flag: 'wx', mode: 0o600 });
  const token = randomBytes(32).toString('hex');
  const secret = randomBytes(32).toString('hex');
  let stop = false;
  process.on('SIGINT', () => { stop = true; }); process.on('SIGTERM', () => { stop = true; });
  try {
    for (const name of ['postgres:16-alpine', image]) docker(['image','inspect',name,'--format','{{.Id}}']);
    docker(['network','create','--internal',network]);
    docker(['run','-d','--name',state.database,'--network',network,'--network-alias','db','--memory','512m','--cpus','0.5','--tmpfs','/var/lib/postgresql/data:rw,size=384m','-e','POSTGRES_PASSWORD=fixture','-e','POSTGRES_DB=telegram_pilot','postgres:16-alpine']);
    let ready = false;
    for (let n = 0; n < 60; n++) {
      try { docker(['exec',state.database,'pg_isready','-h','127.0.0.1','-U','postgres']); ready = true; break; } catch { await pause(500); }
    }
    if (!ready) throw new Error('PILOT_DB_TIMEOUT');
    const bootstrap = spawn('docker', ['run','--rm','--name',state.runner,'--network',network,'--memory','768m','--cpus','0.75',...envArgs(),'-e',`SECRET=${secret}`,'--entrypoint','node',image,'/directus/node_modules/@directus/api/dist/cli/run.js','bootstrap','--skipAdminInit'], { stdio:'ignore' });
    const timer = setTimeout(() => { spawnSync('docker',['rm','-f',state.runner],{stdio:'ignore',timeout:30000}); },180000);
    try { if (await new Promise((r,j) => { bootstrap.on('exit',r); bootstrap.on('error',j); }) !== 0) throw new Error('PILOT_BOOTSTRAP_FAILED'); } finally { clearTimeout(timer); }
    // No published ports. SSH reaches the internal bridge address from the host.
    docker(['run','-d','--name',state.api,'--network',network,'--memory','768m','--cpus','0.75',...envArgs(),'-e',`SECRET=${secret}`,
      ...(process.argv.includes('--conversations')?['-e','ISVOI_TELEGRAM_CONVERSATIONS_ENABLED=true','-e','ISVOI_TELEGRAM_INTAKE_USER_ID=00000000-0000-4000-8000-000000000021','-e','ISVOI_TELEGRAM_BOT_USERNAME=isvoi_test_bot','-e','ISVOI_TELEGRAM_TEST_CLIENT_IDS=65092546']:[]),
      '-e','PUBLIC_URL=https://pilot.invalid','-e','ISVOI_TELEGRAM_ENABLED=true','-e','ISVOI_TELEGRAM_MODE=test','-e','ISVOI_TELEGRAM_BOT_ID=8908725708','-e','ISVOI_TELEGRAM_WORKER_USER_ID=00000000-0000-4000-8000-000000000001','-e','ISVOI_TELEGRAM_STUDIO_LINK_ENABLED=false',
      '--mount',`type=bind,source=${root},target=/workspace,readonly`,'--mount',`type=bind,source=${ext},target=/directus/extensions/directus-extension-isvoi-telegram,readonly`,'--entrypoint','node',image,'/directus/node_modules/@directus/api/dist/cli/run.js','start']);
    state.apiHost = docker(['inspect','--format','{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}',state.api]);
    if (!privateIPv4(state.apiHost)) throw new Error('PILOT_CONTAINER_ADDRESS_INVALID');
    await writeFile(statePath,JSON.stringify(state),{mode:0o600});
    docker(execArgs(state,'setup'),JSON.stringify({workerToken:token,botId:'8908725708',chatId:'-1004431327377',telegramUserId:'65092546',directusUserId:'1a612dfb-8f1c-455b-a8cd-b57ea60afc24'}));
    let apiReady = false;
    for (let n = 0; n < 90; n++) {
      try { const response = await fetch(`http://${state.apiHost}:8055/server/ping`,{signal:AbortSignal.timeout(1000)}); if (response.ok) { apiReady=true; break; } } catch {}
      await pause(1000);
    }
    if (!apiReady) throw new Error('PILOT_API_TIMEOUT');
    await mkdir(resolve('pilot-private'),{mode:0o700,recursive:true});
    await writeFile(resolve('pilot-private/worker.json'),JSON.stringify({token,apiHost:state.apiHost,expiresAt:state.expiresAt}),{mode:0o600});
    console.log(JSON.stringify({status:'PILOT_READY',expiresAt:new Date(state.expiresAt).toISOString(),publishedPorts:false}));
    while (!stop && Date.now() < state.expiresAt) {
      await pause(2000);
      if (JSON.parse(await readFile(statePath,'utf8')).stopped) break;
    }
  } finally { await cleanup(state); }
}

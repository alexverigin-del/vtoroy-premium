#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { runWorker } from './lib/telegram-worker.mjs';

const args = process.argv.slice(2);
let envPath = 'work/private/telegram.env';
let once = false;
for (let index = 0; index < args.length; index++) {
  if (args[index] === '--once') once = true;
  else if (args[index] === '--env' && args[index + 1] && !args[index + 1].startsWith('--')) envPath = args[++index];
  else { console.error('Usage: node scripts/run_telegram_worker.mjs [--env path] [--once]'); process.exit(1); }
}
const stop = new AbortController();
process.on('SIGTERM', () => stop.abort());
process.on('SIGINT', () => stop.abort());
try {
  const env = parseEnv(await readFile(envPath, 'utf8'));
  await runWorker(env, { once, signal: stop.signal });
} catch (error) {
  // Supervisors should restart on failure; no raw error can contain credentials.
  const code = typeof error?.message === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(error.message) ? error.message : 'TELEGRAM_WORKER_ERROR';
  console.error(`Telegram worker stopped: ${code}. Check configuration, connection and delivery states; secret details suppressed.`);
  process.exitCode = 1;
}

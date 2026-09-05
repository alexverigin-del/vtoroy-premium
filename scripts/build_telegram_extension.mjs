#!/usr/bin/env node
import { mkdir, copyFile } from 'node:fs/promises';
const root = new URL('../infra/directus-beget/extensions-bundled/directus-extension-isvoi-telegram/', import.meta.url);
await mkdir(new URL('dist/', root), { recursive: true });
for (const name of ['index.js', 'protocol.js', 'conversations.js']) await copyFile(new URL(`src/${name}`, root), new URL(`dist/${name}`, root));
console.log('Telegram extension built without runtime package imports.');

import { randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export function indexNowConfig(env: NodeJS.ProcessEnv = process.env) {
  if (env.INDEXNOW_ENABLED !== "1") return null;
  const key = env.INDEXNOW_KEY || "";
  const directory = env.INDEXNOW_STATE_DIR || "";
  if (!/^[a-zA-Z0-9-]{8,128}$/.test(key)) throw new Error("indexnow_invalid_key");
  if (!path.isAbsolute(directory) || path.parse(directory).root === path.resolve(directory)) {
    throw new Error("indexnow_invalid_state_directory");
  }
  return { key, directory: path.resolve(directory) };
}

export async function writeIndexNowJson(directory: string, name: string, value: unknown) {
  if (!["dirty", "state"].includes(name)) throw new Error("indexnow_invalid_state_name");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = path.join(directory, `${name}.${randomUUID()}.tmp`);
  await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
  await rename(temporary, path.join(directory, `${name}.json`));
}

export async function markIndexNowDirty() {
  const config = indexNowConfig();
  if (!config) return;
  await writeIndexNowJson(config.directory, "dirty", { token: randomUUID() });
}

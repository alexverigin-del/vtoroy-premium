import { cp, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const web = path.join(root, "apps/web");
const cache = path.join(web, ".next/cache/images");
const saved = path.join(root, "work/next-image-cache");
async function copyCache(from, to) {
  try {
    await mkdir(path.dirname(to), { recursive: true });
    await cp(from, to, { recursive: true });
  } catch (error) {
    if (error.code !== "ENOENT") console.warn(`Image cache preservation: ${error.message}`);
  }
}

// Only the image cache survives builds; never reuse page/route output.
await copyCache(cache, saved);
const code = await new Promise((resolve, reject) => {
  const child = spawn(
    process.execPath,
    [path.join(root, "node_modules/next/dist/bin/next"), "build"],
    { cwd: web, stdio: "inherit", env: process.env },
  );
  child.on("error", reject);
  child.on("exit", (code) => resolve(code ?? 1));
});
await copyCache(saved, cache);
process.exitCode = code;

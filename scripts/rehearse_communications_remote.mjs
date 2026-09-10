import { spawnSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
// Explicit reviewed SSH host/key. No project DB credentials or platform tokens are used.
const host = process.env.COMM_REHEARSAL_SSH_HOST,
  key = process.env.COMM_REHEARSAL_SSH_KEY;
if (!host || !key || !/^[a-z0-9_.-]+@[a-z0-9.-]+$/i.test(host))
  throw Error("REHEARSAL_SSH_CONFIGURATION_REQUIRED");
const suffix = randomBytes(6).toString("hex"),
  name = `isvoi-comm-test-${suffix}`,
  remote = `/tmp/${name}`,
  local = resolve("work", name);
await mkdir(local, { recursive: false });
await build({
  entryPoints: ["packages/communications/src/index.ts"],
  outfile: resolve(local, "core.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
});
await copyFile("packages/communications/schema.sql", resolve(local, "schema.sql"));
await copyFile(
  "scripts/communications_native_contract.mjs",
  resolve(local, "communications_native_contract.mjs"),
);
function exec(tool, args) {
  const r = spawnSync(tool, args, { encoding: "utf8", timeout: 60000, maxBuffer: 2 * 1024 * 1024 });
  if (r.status !== 0) throw Error(r.stderr || "REHEARSAL_COMMAND_FAILED");
  return r.stdout;
}
const ssh = (command) => exec("ssh", ["-i", key, "-o", "BatchMode=yes", host, command]);
const docker = (command) => ssh(`docker ${command}`);
let created = false;
try {
  docker('image inspect postgres:16-alpine directus/directus:11.17.4 --format "{{.Id}}"');
  ssh(`mkdir -m 755 ${remote}`);
  created = true;
  exec("scp", [
    "-i",
    key,
    "-o",
    "BatchMode=yes",
    ...["core.mjs", "schema.sql", "communications_native_contract.mjs"].map((f) =>
      resolve(local, f),
    ),
    `${host}:${remote}/`,
  ]);
  docker(`network create --internal ${name}`);
  docker(
    `run -d --name ${name}-db --network ${name} --network-alias comm-db --memory 384m --cpus 0.5 --tmpfs /var/lib/postgresql/data:rw,size=256m -e POSTGRES_PASSWORD=fixture -e POSTGRES_DB=communications_test postgres:16-alpine`,
  );
  ssh(
    `for n in 1 2 3 4 5 6 7 8 9 10; do docker exec ${name}-db pg_isready -U postgres && exit 0; sleep 1; done; exit 1`,
  );
  const run = `run --rm --name ${name}-runner --network ${name} --memory 768m --cpus 0.75 --entrypoint node -e COMM_DISPOSABLE_FIXTURE=true -e DB_CLIENT=pg -e DB_HOST=comm-db -e DB_PORT=5432 -e DB_USER=postgres -e DB_PASSWORD=fixture -e DB_DATABASE=communications_test -e SECRET=disposable-fixture-only -e TELEMETRY=false -e CACHE_ENABLED=false -e CACHE_SCHEMA=false -e LOG_LEVEL=error --mount type=bind,source=${remote},target=/fixture,readonly directus/directus:11.17.4`;
  for (const command of [
    "/directus/node_modules/@directus/api/dist/cli/run.js bootstrap --skipAdminInit",
    "/fixture/communications_native_contract.mjs",
  ]) {
    const child = spawn(
      "ssh",
      ["-i", key, "-o", "BatchMode=yes", host, `docker ${run} ${command}`],
      { stdio: "inherit" },
    );
    const timer = setTimeout(() => {
      try {
        docker(`rm -f ${name}-runner`);
      } catch {}
    }, 180000);
    const status = await new Promise((yes, no) => {
      child.on("error", no);
      child.on("exit", yes);
    });
    clearTimeout(timer);
    if (status !== 0) throw Error("NATIVE_CONTRACT_FAILED");
  }
} finally {
  if (created) {
    for (const command of [`rm -f ${name}-runner ${name}-db`, `network rm ${name}`])
      try {
        docker(command);
      } catch {}
    ssh(`find ${remote} -maxdepth 1 -type f -delete && rmdir ${remote}`);
  }
}

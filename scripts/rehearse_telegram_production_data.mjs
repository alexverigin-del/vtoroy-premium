import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";

const host = process.env.COMM_REHEARSAL_SSH_HOST,
  key = process.env.COMM_REHEARSAL_SSH_KEY;
if (!host || !key || !/^[a-z0-9_.-]+@[a-z0-9.-]+$/i.test(host))
  throw Error("REHEARSAL_SSH_CONFIGURATION_REQUIRED");

const suffix = randomBytes(6).toString("hex"),
  name = `isvoi-telegram-data-${suffix}`,
  remote = `/tmp/${name}`,
  remoteCode = `${remote}/runner`,
  local = resolve("work", name),
  database = `${name}-db`,
  volume = `${name}-data`;

await mkdir(local, { recursive: false });
await build({
  entryPoints: ["packages/communications/src/index.ts"],
  outfile: resolve(local, "core.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  banner: {
    js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
});
await copyFile("packages/communications/schema.sql", resolve(local, "schema.sql"));
await copyFile(
  "scripts/communications_production_data_contract.mjs",
  resolve(local, "communications_production_data_contract.mjs"),
);

function exec(tool, args, timeout = 120000) {
  const result = spawnSync(tool, args, {
    encoding: "utf8",
    timeout,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.status !== 0) throw Error(result.stderr || result.error?.message || "COMMAND_FAILED");
  return result.stdout;
}
const ssh = (command, timeout) =>
  exec("ssh", ["-i", key, "-o", "BatchMode=yes", host, command], timeout);
const docker = (command, timeout) => ssh(`docker ${command}`, timeout);
let remoteCreated = false,
  databaseCreated = false,
  networkCreated = false,
  volumeCreated = false;

try {
  docker('image inspect postgres:16-alpine directus/directus:11.17.4 --format "{{.Id}}"');
  ssh(`install -d -m 700 ${remote} && install -d -m 755 ${remoteCode}`);
  remoteCreated = true;
  exec("scp", [
    "-i",
    key,
    "-o",
    "BatchMode=yes",
    resolve(local, "core.mjs"),
    resolve(local, "schema.sql"),
    resolve(local, "communications_production_data_contract.mjs"),
    `${host}:${remoteCode}/`,
  ]);
  ssh(
    `cd /opt/isvoi/infra/directus-beget && set -a && . ./.env && set +a && ` +
      `docker compose exec -T database sh -lc ` +
      `'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner --no-privileges --serializable-deferrable' ` +
      `> ${remote}/production.dump`,
    300000,
  );
  docker(`network create --internal ${name}`);
  networkCreated = true;
  docker(`volume create ${volume}`);
  volumeCreated = true;
  docker(
    `run -d --name ${database} --network ${name} --network-alias comm-production-copy-db ` +
      `--memory 640m --cpus 1 -v ${volume}:/var/lib/postgresql/data ` +
      `-e POSTGRES_PASSWORD=fixture -e POSTGRES_DB=communications_production_copy postgres:16-alpine`,
  );
  databaseCreated = true;
  ssh(
    `for n in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do ` +
      `docker exec ${database} pg_isready -U postgres && exit 0; sleep 1; done; exit 1`,
  );
  ssh(
    `docker exec -i ${database} pg_restore -U postgres -d communications_production_copy ` +
      `--no-owner --no-privileges --exit-on-error < ${remote}/production.dump`,
    300000,
  );
  const args = [
    "run",
    "--rm",
    "--name",
    `${name}-runner`,
    "--network",
    name,
    "--memory",
    "768m",
    "--cpus",
    "1",
    "--entrypoint",
    "node",
    "-e",
    "COMM_DISPOSABLE_PRODUCTION_COPY=true",
    "-e",
    "DB_CLIENT=pg",
    "-e",
    "DB_HOST=comm-production-copy-db",
    "-e",
    "DB_PORT=5432",
    "-e",
    "DB_USER=postgres",
    "-e",
    "DB_PASSWORD=fixture",
    "-e",
    "DB_DATABASE=communications_production_copy",
    "-e",
    "SECRET=disposable-production-copy-only",
    "-e",
    "TELEMETRY=false",
    "-e",
    "CACHE_ENABLED=false",
    "-e",
    "CACHE_SCHEMA=false",
    "-e",
    "LOG_LEVEL=error",
    "--mount",
    `type=bind,source=${remoteCode},target=/fixture,readonly`,
    "directus/directus:11.17.4",
    "/fixture/communications_production_data_contract.mjs",
  ];
  const child = spawn("ssh", ["-i", key, "-o", "BatchMode=yes", host, `docker ${args.join(" ")}`], {
    stdio: "inherit",
  });
  const timer = setTimeout(() => {
    try {
      docker(`rm -f ${name}-runner`);
    } catch {}
  }, 300000);
  const status = await new Promise((resolveStatus, reject) => {
    child.on("error", reject);
    child.on("exit", resolveStatus);
  });
  clearTimeout(timer);
  if (status !== 0) throw Error("PRODUCTION_DATA_REHEARSAL_FAILED");
} finally {
  if (databaseCreated)
    try {
      docker(`rm -f ${name}-runner ${database}`);
    } catch {}
  if (networkCreated)
    try {
      docker(`network rm ${name}`);
    } catch {}
  if (volumeCreated)
    try {
      docker(`volume rm ${volume}`);
    } catch {}
  if (remoteCreated)
    try {
      ssh(
        `find ${remoteCode} -maxdepth 1 -type f -delete && rmdir ${remoteCode} && ` +
          `find ${remote} -maxdepth 1 -type f -delete && rmdir ${remote}`,
      );
    } catch {}
}

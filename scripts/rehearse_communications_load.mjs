import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFile, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const host = process.env.COMM_REHEARSAL_SSH_HOST;
const key = process.env.COMM_REHEARSAL_SSH_KEY;
if (!host || !key || !/^[a-z0-9_.-]+@[a-z0-9.-]+$/i.test(host))
  throw Error("REHEARSAL_SSH_CONFIGURATION_REQUIRED");

const suffix = randomBytes(6).toString("hex");
const name = `isvoi-communications-load-${suffix}`;
const remote = `/tmp/${name}`;
const local = resolve("work", name);
const database = `${name}-db`;
const volume = `${name}-data`;

await mkdir(local, { recursive: false });
await copyFile("packages/communications/schema.sql", resolve(local, "schema.sql"));
await copyFile(
  "scripts/communications_load_contract.mjs",
  resolve(local, "communications_load_contract.mjs"),
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
let remoteCreated = false;
let databaseCreated = false;
let networkCreated = false;
let volumeCreated = false;

try {
  docker('image inspect postgres:16-alpine directus/directus:11.17.4 --format "{{.Id}}"');
  ssh(`install -d -m 755 ${remote}`);
  remoteCreated = true;
  exec("scp", [
    "-i", key, "-o", "BatchMode=yes",
    resolve(local, "schema.sql"),
    resolve(local, "communications_load_contract.mjs"),
    `${host}:${remote}/`,
  ]);
  docker(`network create --internal ${name}`);
  networkCreated = true;
  docker(`volume create ${volume}`);
  volumeCreated = true;
  docker(
    `run -d --name ${database} --network ${name} --network-alias load-db ` +
      `--memory 640m --cpus 1 -v ${volume}:/var/lib/postgresql/data ` +
      `-e POSTGRES_PASSWORD=fixture -e POSTGRES_DB=communications_load postgres:16-alpine`,
  );
  databaseCreated = true;
  ssh(
    `for n in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do ` +
      `docker exec ${database} pg_isready -U postgres && exit 0; sleep 1; done; exit 1`,
  );

  const command =
    `docker run --rm --name ${name}-runner --network ${name} --memory 768m --cpus 1 ` +
    `--entrypoint node -e COMM_DISPOSABLE_LOAD_DATABASE=true -e DB_HOST=load-db -e DB_PORT=5432 ` +
    `-e DB_USER=postgres -e DB_PASSWORD=fixture -e DB_DATABASE=communications_load ` +
    `--mount 'type=bind,source=${remote},target=/fixture,readonly' ` +
    `--mount 'type=bind,source=/opt/isvoi,target=/repo,readonly' ` +
    `directus/directus:11.17.4 /fixture/communications_load_contract.mjs`;
  const child = spawn("ssh", ["-i", key, "-o", "BatchMode=yes", host, command], {
    stdio: "inherit",
  });
  const timer = setTimeout(() => {
    try { docker(`rm -f ${name}-runner`); } catch {}
  }, 300000);
  const status = await new Promise((resolveStatus, reject) => {
    child.on("error", reject);
    child.on("exit", resolveStatus);
  });
  clearTimeout(timer);
  if (status !== 0) throw Error("COMMUNICATIONS_LOAD_REHEARSAL_FAILED");
} finally {
  if (databaseCreated) {
    try { docker(`rm -f ${name}-runner ${database}`); } catch {}
  }
  if (networkCreated) {
    try { docker(`network rm ${name}`); } catch {}
  }
  if (volumeCreated) {
    try { docker(`volume rm ${volume}`); } catch {}
  }
  if (remoteCreated) {
    try { ssh(`find ${remote} -maxdepth 1 -type f -delete && rmdir ${remote}`); } catch {}
  }
  await rm(local, { recursive: true, force: true });
}

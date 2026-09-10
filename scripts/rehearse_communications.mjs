import { spawnSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, copyFile } from "node:fs/promises";
import { delimiter, dirname, resolve } from "node:path";
import { build } from "esbuild";
const name = `isvoi-comm-test-${randomBytes(6).toString("hex")}`,
  local = resolve("work", name);
const dockerExecutable = (() => {
  if (process.env.DOCKER_CLI_PATH) return process.env.DOCKER_CLI_PATH;
  if (process.platform !== "win32") return "docker";
  const candidates = [
    process.env.ProgramFiles &&
      resolve(process.env.ProgramFiles, "Docker", "Docker", "resources", "bin", "docker.exe"),
    process.env.LOCALAPPDATA &&
      resolve(process.env.LOCALAPPDATA, "Programs", "DockerDesktop", "resources", "bin", "docker.exe"),
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) ?? "docker";
})();
const dockerEnvironment =
  process.platform === "win32" && dockerExecutable !== "docker"
    ? { ...process.env, PATH: `${dirname(dockerExecutable)}${delimiter}${process.env.PATH ?? ""}` }
    : process.env;
function docker(args) {
  const r = spawnSync(dockerExecutable, args, {
    encoding: "utf8",
    env: dockerEnvironment,
    timeout: 60000,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (r.status !== 0) throw Error(r.error?.message || r.stderr || "DOCKER_REQUIRED");
  return r.stdout;
}
docker(["version", "--format", "{{.Server.Version}}"]);
for (const image of ["postgres:16-alpine", "directus/directus:11.17.4"])
  docker(["image", "inspect", image, "--format", "{{.Id}}"]);
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
  "scripts/communications_native_contract.mjs",
  resolve(local, "communications_native_contract.mjs"),
);
try {
  docker(["network", "create", "--internal", name]);
  docker([
    "run",
    "-d",
    "--name",
    `${name}-db`,
    "--network",
    name,
    "--network-alias",
    "comm-db",
    "--memory",
    "384m",
    "--cpus",
    "1",
    "--tmpfs",
    "/var/lib/postgresql/data:rw,size=256m",
    "-e",
    "POSTGRES_PASSWORD=fixture",
    "-e",
    "POSTGRES_DB=communications_test",
    "postgres:16-alpine",
  ]);
  let ready = false;
  for (let i = 0; i < 30; i++) {
    const r = spawnSync(
      dockerExecutable,
      ["exec", `${name}-db`, "pg_isready", "-U", "postgres"],
      { env: dockerEnvironment, stdio: "ignore" },
    );
    if (r.status === 0) {
      ready = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready) throw Error("FIXTURE_DATABASE_NOT_READY");
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
    "COMM_DISPOSABLE_FIXTURE=true",
    "-e",
    "DB_CLIENT=pg",
    "-e",
    "DB_HOST=comm-db",
    "-e",
    "DB_PORT=5432",
    "-e",
    "DB_USER=postgres",
    "-e",
    "DB_PASSWORD=fixture",
    "-e",
    "DB_DATABASE=communications_test",
    "-e",
    "SECRET=disposable-fixture-only",
    "-e",
    "TELEMETRY=false",
    "-e",
    "CACHE_ENABLED=false",
    "-e",
    "CACHE_SCHEMA=false",
    "-e",
    "LOG_LEVEL=error",
    "--mount",
    `type=bind,source=${local},target=/fixture,readonly`,
    "directus/directus:11.17.4",
  ];
  for (const command of [
    ["/directus/node_modules/@directus/api/dist/cli/run.js", "bootstrap", "--skipAdminInit"],
    ["/fixture/communications_native_contract.mjs"],
  ]) {
    const child = spawn(dockerExecutable, [...args, ...command], {
      env: dockerEnvironment,
      stdio: "inherit",
    });
    const timer = setTimeout(() => {
      try {
        docker(["rm", "-f", `${name}-runner`]);
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
  for (const args of [
    ["rm", "-f", `${name}-runner`, `${name}-db`],
    ["network", "rm", name],
  ])
    try {
      docker(args);
    } catch {}
}

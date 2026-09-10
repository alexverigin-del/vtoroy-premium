import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { delimiter, dirname, resolve } from "node:path";
import { communicationsMetadataSql } from "./setup_directus_communications_sql.mjs";

const root = resolve(import.meta.dirname, ".."),
  baseUrl = process.env.COMM_LOCAL_DIRECTUS_URL || "http://127.0.0.1:8056",
  adminEmail = "admin@example.com",
  password = "local-isvoi-fixture-password",
  ids = {
    store: "11111111-1111-4111-8111-111111111111",
    manager: "22222222-2222-4222-8222-222222222222",
    worker: "33333333-3333-4333-8333-333333333333",
    intake: "44444444-4444-4444-8444-444444444444",
    connection: "55555555-5555-4555-8555-555555555555",
    managerPolicy: "66666666-6666-4666-8666-666666666666",
    workerPolicy: "77777777-7777-4777-8777-777777777777",
    intakePolicy: "88888888-8888-4888-8888-888888888888",
    managerRole: "99999999-9999-4999-8999-999999999999",
  };

if (baseUrl !== "http://127.0.0.1:8056") throw Error("LOCAL_FIXTURE_URL_REQUIRED");

const dockerExecutable = (() => {
  if (process.env.DOCKER_CLI_PATH) return process.env.DOCKER_CLI_PATH;
  if (process.platform !== "win32") return "docker";
  const candidates = [
    process.env.ProgramFiles &&
      resolve(process.env.ProgramFiles, "Docker", "Docker", "resources", "bin", "docker.exe"),
    process.env.LOCALAPPDATA &&
      resolve(
        process.env.LOCALAPPDATA,
        "Programs",
        "DockerDesktop",
        "resources",
        "bin",
        "docker.exe",
      ),
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) ?? "docker";
})();
const dockerEnvironment =
  process.platform === "win32" && dockerExecutable !== "docker"
    ? { ...process.env, PATH: `${dirname(dockerExecutable)}${delimiter}${process.env.PATH ?? ""}` }
    : process.env;

function psql(sql) {
  const result = spawnSync(
    dockerExecutable,
    [
      "compose",
      "-f",
      resolve(root, "infra/communications/docker-compose.test.yml"),
      "exec",
      "-T",
      "database",
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "communications_test",
    ],
    { cwd: root, encoding: "utf8", env: dockerEnvironment, input: sql, maxBuffer: 8 * 1024 * 1024 },
  );
  if (result.status !== 0)
    throw Error(result.stderr || result.error?.message || "FIXTURE_SQL_FAILED");
  return result.stdout;
}

async function api(path, options = {}, token) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = Error(body?.errors?.[0]?.message || `HTTP_${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body.data;
}

async function login(email) {
  return (
    await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, mode: "json" }),
    })
  ).access_token;
}

async function upsertUser(token, id, email, firstName, role = null) {
  const values = { id, email, password, first_name: firstName, status: "active", role };
  const users = await api(
    `/users?filter[id][_eq]=${encodeURIComponent(id)}&fields=id,email,first_name,status,role&limit=1`,
    {},
    token,
  );
  if (users.length) {
    const { password: _password, ...updates } = values;
    const current = users[0];
    const roleId = typeof current.role === "object" ? current.role?.id : current.role;
    if (
      current.email !== updates.email ||
      current.first_name !== updates.first_name ||
      current.status !== updates.status ||
      (roleId || null) !== updates.role
    )
      await api(`/users/${id}`, { method: "PATCH", body: JSON.stringify(updates) }, token);
  } else {
    await api("/users", { method: "POST", body: JSON.stringify(values) }, token);
  }
}

const baseSql = await readFile(
    resolve(root, "infra/communications/local-fixture-base.sql"),
    "utf8",
  ),
  communicationsSql = await readFile(resolve(root, "packages/communications/schema.sql"), "utf8");
psql(`${baseSql}\n${communicationsSql}\n${communicationsMetadataSql}`);

const adminToken = await login(adminEmail);
psql(`INSERT INTO directus_roles(id,name,icon,description)
VALUES ('${ids.managerRole}','Communications Manager','forum','Менеджеры омниканальной очереди.')
ON CONFLICT(id) DO UPDATE SET name=excluded.name,icon=excluded.icon,description=excluded.description;`);
await upsertUser(adminToken, ids.manager, "manager@example.com", "Менеджер", ids.managerRole);
await upsertUser(adminToken, ids.worker, "worker@example.com", "Worker");
await upsertUser(adminToken, ids.intake, "intake@example.com", "Intake");

psql(`
BEGIN;
INSERT INTO store_locations(id, city) VALUES ('${ids.store}', 'Тестовый город')
ON CONFLICT(id) DO UPDATE SET city=excluded.city;

INSERT INTO directus_policies(id,name,admin_access,app_access) VALUES
 ('${ids.managerPolicy}','Communications local manager',false,true),
 ('${ids.workerPolicy}','Communications local worker',false,false),
 ('${ids.intakePolicy}','Communications local intake',false,false)
ON CONFLICT(id) DO UPDATE SET name=excluded.name,admin_access=excluded.admin_access,app_access=excluded.app_access;

DELETE FROM directus_access
WHERE "user" IN ('${ids.manager}','${ids.worker}','${ids.intake}') OR role='${ids.managerRole}';
INSERT INTO directus_access(id,role,policy) VALUES
 (gen_random_uuid(),'${ids.managerRole}','${ids.managerPolicy}');
INSERT INTO directus_access(id,"user",policy) VALUES
 (gen_random_uuid(),'${ids.worker}','${ids.workerPolicy}'),
 (gen_random_uuid(),'${ids.intake}','${ids.intakePolicy}');

DELETE FROM directus_permissions WHERE policy IN ('${ids.managerPolicy}','${ids.workerPolicy}','${ids.intakePolicy}');
INSERT INTO directus_permissions(policy,collection,action,permissions,validation,fields) VALUES
 ('${ids.managerPolicy}','leads','read',
  '{"store_location_id":{"_eq":"${ids.store}"}}','{}','*'),
 ('${ids.managerPolicy}','leads','update',
  '{"store_location_id":{"_eq":"${ids.store}"}}','{}','status,assigned_to'),
 ('${ids.managerPolicy}','lead_comments','create','{}',
  '{"_and":[{"created_by":{"_eq":"$CURRENT_USER"}},{"outcome":{"_eq":"note"}},{"lead":{"_nnull":true}}]}','*'),
 ('${ids.intakePolicy}','leads','create','{}',
  '{"_and":[{"store_location_id":{"_eq":"${ids.store}"}},{"is_test":{"_eq":true}}]}','*');

INSERT INTO comm_staff(user_id,store_id,enabled,can_manage,can_publish)
VALUES ('${ids.manager}','${ids.store}',true,true,false)
ON CONFLICT(user_id,store_id) DO UPDATE SET enabled=true,can_manage=true,can_publish=false;

INSERT INTO comm_connections(
 id,platform,external_id,name,enabled,mode,store_id,worker_user_id,service_user_id,secret_ref,settings,marketing_enabled
) VALUES (
 '${ids.connection}','telegram','8908725708','Telegram local fixture',true,'test','${ids.store}',
 '${ids.worker}','${ids.intake}','LOCAL_FIXTURE',
 '{"pilot_user_ids":["900001","900002"],"subscriptions_pilot_only":true,"subscriptions_enabled":false}',false
)
ON CONFLICT(id) DO UPDATE SET external_id=excluded.external_id,enabled=true,mode='test',worker_user_id=excluded.worker_user_id,
 service_user_id=excluded.service_user_id,bot_username='isvoi_test_bot',settings=excluded.settings,marketing_enabled=false;

UPDATE comm_runtime SET active=true,sending_enabled=false,recovery_hold=true WHERE id=1;
COMMIT;
`);

const managerToken = await login("manager@example.com"),
  workerToken = await login("worker@example.com");
await api("/users/me", { method: "GET" }, managerToken);
await api("/users/me", { method: "GET" }, workerToken);
console.log(
  JSON.stringify(
    {
      ready: true,
      url: baseUrl,
      manager: "manager@example.com",
      connection_id: ids.connection,
      sending_enabled: false,
      recovery_hold: true,
    },
    null,
    2,
  ),
);

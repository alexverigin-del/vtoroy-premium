const IDENTIFIER = /^[a-z_][a-z0-9_]*$/u;
const PATCH_ID = /^[a-z0-9][a-z0-9._-]{2,99}$/u;
const SENSITIVE_SEGMENT = /(?:password|secret|token|otp|tfa|auth_data)/iu;
const BLOCKED_COLLECTIONS = new Set([
  "directus_files",
  "leads",
  "lead_comments",
  "catalog_import_batches",
  "inventory_import_batches",
  "inventory_import_issues",
  "inventory_items",
  "inventory_movements",
]);
const IMMUTABLE_ROOT_FIELDS = new Set([
  "id",
  "date_created",
  "date_updated",
  "created_at",
  "updated_at",
  "user_created",
  "user_updated",
]);

export function validateIdentifier(value, label) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    throw new Error(`${label} must be a lowercase snake_case identifier`);
  }
}

export function validatePatch(patch, { requireLock = false } = {}) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw new Error("Patch must be a JSON object");
  }
  if (patch.version !== 1) throw new Error("Patch version must be 1");
  if (typeof patch.id !== "string" || !PATCH_ID.test(patch.id)) {
    throw new Error(
      "Patch id must use 3-100 lowercase letters, numbers, dots, dashes or underscores",
    );
  }
  if (typeof patch.description !== "string" || patch.description.trim().length < 10) {
    throw new Error("Patch description must contain at least 10 characters");
  }

  validateIdentifier(patch.collection, "collection");
  if (patch.collection.startsWith("directus_") || BLOCKED_COLLECTIONS.has(patch.collection)) {
    throw new Error(
      `Collection ${patch.collection} is outside the content-patch ownership boundary`,
    );
  }

  if (!patch.selector || typeof patch.selector !== "object" || Array.isArray(patch.selector)) {
    throw new Error("selector must be an object with exact-match fields");
  }
  const selectorEntries = Object.entries(patch.selector);
  if (selectorEntries.length < 1 || selectorEntries.length > 4) {
    throw new Error("selector must contain between 1 and 4 exact-match fields");
  }
  for (const [field, value] of selectorEntries) {
    validateIdentifier(field, `selector.${field}`);
    if (value !== null && !["string", "number", "boolean"].includes(typeof value)) {
      throw new Error(`selector.${field} must be a scalar or null`);
    }
  }

  if (!patch.changes || typeof patch.changes !== "object" || Array.isArray(patch.changes)) {
    throw new Error("changes must be an object");
  }
  const changeEntries = Object.entries(patch.changes);
  const removals = patch.remove ?? [];
  if (!Array.isArray(removals)) throw new Error("remove must be an array of JSON paths");
  if (changeEntries.length + removals.length < 1 || changeEntries.length + removals.length > 20) {
    throw new Error("A patch must contain between 1 and 20 changed paths");
  }

  const paths = [...changeEntries.map(([field]) => field), ...removals];
  if (new Set(paths).size !== paths.length) throw new Error("Patch paths must be unique");
  for (const fieldPath of paths) {
    validateFieldPath(fieldPath);
    const [root] = fieldPath.split(".");
    if (IMMUTABLE_ROOT_FIELDS.has(root))
      throw new Error(`Field ${root} is immutable in content patches`);
    if (SENSITIVE_SEGMENT.test(fieldPath))
      throw new Error(`Sensitive field path is not allowed: ${fieldPath}`);
  }
  for (const fieldPath of removals) {
    if (!fieldPath.includes("."))
      throw new Error(`Only nested JSON keys can be removed: ${fieldPath}`);
  }

  if (!["site-content", "none"].includes(patch.revalidate ?? "site-content")) {
    throw new Error('revalidate must be "site-content" or "none"');
  }

  if (patch.lock !== undefined) {
    if (!patch.lock || typeof patch.lock !== "object" || Array.isArray(patch.lock)) {
      throw new Error("lock must be an object");
    }
    if (patch.lock.snapshotHash !== undefined && !/^[a-f0-9]{64}$/u.test(patch.lock.snapshotHash)) {
      throw new Error("lock.snapshotHash must be a SHA-256 hex digest");
    }
    if ((patch.lock.versionField === undefined) !== (patch.lock.versionValue === undefined)) {
      throw new Error("lock.versionField and lock.versionValue must be provided together");
    }
    if (patch.lock.versionField !== undefined) {
      validateIdentifier(patch.lock.versionField, "lock.versionField");
      if (typeof patch.lock.versionValue !== "string" || !patch.lock.versionValue) {
        throw new Error("lock.versionValue must be a non-empty string");
      }
    }
  }
  if (requireLock && !patch.lock?.snapshotHash) {
    throw new Error("Apply requires lock.snapshotHash. Run with --capture-lock first");
  }

  return patch;
}

function validateFieldPath(fieldPath) {
  if (typeof fieldPath !== "string" || fieldPath.length > 160) {
    throw new Error("Every changed path must be a string up to 160 characters");
  }
  for (const segment of fieldPath.split(".")) validateIdentifier(segment, `path ${fieldPath}`);
}

export function quoteIdentifier(value) {
  validateIdentifier(value, "SQL identifier");
  return `"${value}"`;
}

export function sqlJson(value) {
  return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
}

export function buildSelectorSql(selector, alias = "t") {
  return Object.entries(selector)
    .map(([field, value]) => {
      const column = `${alias}.${quoteIdentifier(field)}`;
      if (value === null) return `${column} IS NULL`;
      return `to_jsonb(${column}) = ${sqlJson(value)}`;
    })
    .join(" AND ");
}

export function applyPatchToRow(row, patch, schema) {
  const desired = structuredClone(row);
  const touchedRoots = new Set();

  for (const [fieldPath, value] of Object.entries(patch.changes)) {
    const segments = fieldPath.split(".");
    assertPathAgainstSchema(segments, schema);
    setPath(desired, segments, structuredClone(value));
    touchedRoots.add(segments[0]);
  }
  for (const fieldPath of patch.remove ?? []) {
    const segments = fieldPath.split(".");
    assertPathAgainstSchema(segments, schema);
    deletePath(desired, segments);
    touchedRoots.add(segments[0]);
  }

  return { desired, touchedRoots: [...touchedRoots].sort() };
}

function assertPathAgainstSchema(segments, schema) {
  const [root] = segments;
  if (!schema[root]) throw new Error(`Field does not exist in production schema: ${root}`);
  if (segments.length > 1 && !["json", "jsonb"].includes(schema[root].dataType)) {
    throw new Error(`Nested path requires a json/jsonb root field: ${segments.join(".")}`);
  }
}

function setPath(target, segments, value) {
  let cursor = target;
  for (const segment of segments.slice(0, -1)) {
    const current = cursor[segment];
    if (current === null || current === undefined) cursor[segment] = {};
    else if (typeof current !== "object" || Array.isArray(current)) {
      throw new Error(`Cannot descend through non-object JSON value at ${segment}`);
    }
    cursor = cursor[segment];
  }
  cursor[segments.at(-1)] = value;
}

function deletePath(target, segments) {
  let cursor = target;
  for (const segment of segments.slice(0, -1)) {
    if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) return;
    cursor = cursor[segment];
  }
  if (cursor && typeof cursor === "object" && !Array.isArray(cursor)) {
    delete cursor[segments.at(-1)];
  }
}

export function getPath(row, fieldPath) {
  return fieldPath.split(".").reduce((value, segment) => value?.[segment], row);
}

export function buildDiff(row, desired, patch) {
  return [...Object.keys(patch.changes), ...(patch.remove ?? [])].map((fieldPath) => ({
    path: fieldPath,
    before: getPath(row, fieldPath),
    after: getPath(desired, fieldPath),
  }));
}

export function buildUpdateSql({ patch, desired, touchedRoots, currentHash, commit }) {
  const table = `public.${quoteIdentifier(patch.collection)}`;
  const recordJson = Object.fromEntries(touchedRoots.map((field) => [field, desired[field]]));
  const assignments = touchedRoots
    .map(
      (field) =>
        `${quoteIdentifier(field)} = (jsonb_populate_record(NULL::${table}, ${sqlJson(recordJson)})).${quoteIdentifier(field)}`,
    )
    .join(",\n    ");
  const selector = buildSelectorSql(patch.selector, "t");
  const transactionEnd = commit ? "COMMIT;" : "ROLLBACK;";

  return `BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $content_patch$
DECLARE
  affected integer;
BEGIN
  UPDATE ${table} AS t
  SET ${assignments}
  WHERE ${selector}
    AND encode(digest(convert_to(to_jsonb(t)::text, 'UTF8'), 'sha256'), 'hex') = '${currentHash}';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN
    RAISE EXCEPTION 'Content patch optimistic lock failed: expected 1 row, changed %', affected;
  END IF;
END
$content_patch$;

SELECT 'content_patch.${commit ? "apply" : "rehearsal"}|ok';
${transactionEnd}
`;
}

export function assertLockMatches(patch, row, currentHash) {
  if (patch.lock?.snapshotHash && patch.lock.snapshotHash !== currentHash) {
    throw new Error(
      `Snapshot changed since preparation: expected ${patch.lock.snapshotHash}, got ${currentHash}`,
    );
  }
  if (patch.lock?.versionField) {
    const actual = row[patch.lock.versionField];
    if (String(actual) !== String(patch.lock.versionValue)) {
      throw new Error(
        `Version changed: ${patch.lock.versionField} expected ${patch.lock.versionValue}, got ${actual}`,
      );
    }
  }
}

export function captureLock(patch, row, hash) {
  const versionField = ["date_updated", "updated_at", "modified_on"].find(
    (field) => row[field] !== null && row[field] !== undefined,
  );
  const lock = { snapshotHash: hash };
  if (versionField) {
    lock.versionField = versionField;
    lock.versionValue = String(row[versionField]);
  }
  return { ...patch, lock };
}

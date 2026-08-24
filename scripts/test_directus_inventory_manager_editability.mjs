#!/usr/bin/env node

const baseUrl = (process.env.DIRECTUS_URL || "").replace(/\/$/, "");
const token = (process.env.DIRECTUS_TOKEN || "").trim();

if (!baseUrl || !token) {
  throw new Error("DIRECTUS_URL and DIRECTUS_TOKEN are required.");
}

async function rawRequest(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
  return { response, body: await response.text() };
}

async function request(path, options = {}) {
  const result = await rawRequest(path, options);
  if (!result.response.ok) {
    throw new Error(`${options.method || "GET"} ${path}: ${result.response.status} ${result.body}`);
  }
  return result.body ? JSON.parse(result.body) : null;
}

const issueQuery = new URLSearchParams({
  "filter[resolved][_eq]": "false",
  "filter[source_kind][_eq]": "inventory",
  fields: "id,message,resolved,resolution_note,inventory_item.id,inventory_item.source_title",
  limit: "1",
});
const issue = (await request(`/items/inventory_import_issues?${issueQuery}`))?.data?.[0];
if (!issue?.inventory_item?.id) throw new Error("No linked open inventory issue found.");

const item = (
  await request(
    `/items/inventory_items/${encodeURIComponent(issue.inventory_item.id)}?fields=id,quantity,review_note`,
  )
)?.data;
if (!item) throw new Error("Linked inventory item is not readable.");

const marker = `inventory-manager-editability-${Date.now()}`;
const originalItemNote = item.review_note ?? null;
const originalIssueNote = issue.resolution_note ?? null;
const originalIssueResolved = issue.resolved;
const originalIssueMessage = issue.message;
let itemChanged = false;
let issueChanged = false;
let forbiddenItemChanged = false;
let forbiddenIssueChanged = false;

try {
  await request(`/items/inventory_items/${item.id}`, {
    method: "PATCH",
    body: JSON.stringify({ review_note: marker }),
  });
  itemChanged = true;

  const forbiddenItem = await rawRequest(`/items/inventory_items/${item.id}`, {
    method: "PATCH",
    body: JSON.stringify({ quantity: Number(item.quantity) + 1 }),
  });
  if (forbiddenItem.response.ok) {
    forbiddenItemChanged = true;
    throw new Error("Inventory Manager changed source quantity.");
  }

  const undocumentedClose = await rawRequest(`/items/inventory_import_issues/${issue.id}`, {
    method: "PATCH",
    body: JSON.stringify({ resolved: true, resolution_note: null }),
  });
  if (undocumentedClose.response.ok) {
    await request(`/items/inventory_import_issues/${issue.id}`, {
      method: "PATCH",
      body: JSON.stringify({ resolved: false, resolution_note: originalIssueNote }),
    });
    throw new Error("Inventory Manager closed an issue without a resolution note.");
  }

  await request(`/items/inventory_import_issues/${issue.id}`, {
    method: "PATCH",
    body: JSON.stringify({ resolved: true, resolution_note: marker }),
  });
  issueChanged = true;

  const resolvedIssue = await request(
    `/items/inventory_import_issues/${issue.id}?fields=id,resolved,resolution_note`,
  );
  if (resolvedIssue?.data?.resolved !== true || resolvedIssue?.data?.resolution_note !== marker) {
    throw new Error("Documented issue resolution was not persisted.");
  }

  const forbiddenIssue = await rawRequest(`/items/inventory_import_issues/${issue.id}`, {
    method: "PATCH",
    body: JSON.stringify({ message: `${issue.message} [forbidden]` }),
  });
  if (forbiddenIssue.response.ok) {
    forbiddenIssueChanged = true;
    throw new Error("Inventory Manager changed generated issue text.");
  }
} finally {
  if (forbiddenIssueChanged) {
    await request(`/items/inventory_import_issues/${issue.id}`, {
      method: "PATCH",
      body: JSON.stringify({ message: originalIssueMessage }),
    });
  }
  if (issueChanged) {
    await request(`/items/inventory_import_issues/${issue.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        resolved: originalIssueResolved,
        resolution_note: originalIssueNote,
      }),
    });
  }
  if (forbiddenItemChanged) {
    await request(`/items/inventory_items/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ quantity: item.quantity }),
    });
  }
  if (itemChanged) {
    await request(`/items/inventory_items/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ review_note: originalItemNote }),
    });
  }
}

console.log(
  JSON.stringify({
    ok: true,
    linked_issue: true,
    item_operator_field_editable: true,
    issue_resolution_field_editable: true,
    undocumented_resolution_rejected: true,
    documented_resolution_persisted: true,
    source_item_field_protected: true,
    generated_issue_field_protected: true,
    restored: true,
  }),
);

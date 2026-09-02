import { readFile, mkdir, stat, rmdir } from "node:fs/promises";
import path from "node:path";
import {
  INDEXNOW_ORIGIN,
  INDEXNOW_ENDPOINT,
  INDEXNOW_KEY_PATH,
  INDEXNOW_MAX_URLS,
  publicIndexNowUrl,
  sitemapIndexNowUrls,
  robotsAllowsIndexNow,
  indexNowPageFingerprint,
  indexNowPayload,
} from "../../apps/web/lib/indexnow.ts";
import { writeIndexNowJson } from "../../apps/web/lib/indexnow-queue.ts";

const HOUR = 3_600_000;
const REMOVED = "removed";

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function responseText(response, limit = 5_000_000) {
  if (Number(response.headers.get("content-length")) > limit)
    throw new Error("indexnow_response_too_large");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) throw new Error("indexnow_response_too_large");
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function scanIndexNowSite(previous = {}, { fetchImpl = fetch, now = Date.now } = {}) {
  const started = now();
  const get = (url) =>
    fetchImpl(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
      headers: { "user-agent": "ISVOI-IndexNow/1.0", "cache-control": "no-cache" },
    });
  // Never turn a CMS outage/fallback into a batch of deletion notifications.
  const health = await get("https://api.isvoi.ru/server/health");
  if (health.status !== 200 || JSON.parse(await responseText(health, 10000)).status !== "ok")
    throw new Error("indexnow_cms_unhealthy");
  const sitemap = await get(`${INDEXNOW_ORIGIN}/sitemap.xml`);
  const robot = await get(`${INDEXNOW_ORIGIN}/robots.txt`);
  if (sitemap.status !== 200 || robot.status !== 200)
    throw new Error("indexnow_discovery_unavailable");
  const urls = sitemapIndexNowUrls(await responseText(sitemap));
  const robots = await responseText(robot, 500000);
  if (/<html/i.test(robots)) throw new Error("indexnow_invalid_robots");
  const currentUrls = new Set(urls);
  const all = [...new Set([...urls, ...Object.keys(previous)])];
  if (all.length > INDEXNOW_MAX_URLS || all.some((url) => publicIndexNowUrl(url) !== url))
    throw new Error("indexnow_unsafe_state");
  const entries = {};
  for (let offset = 0; offset < all.length; offset += 3) {
    if (now() - started > 8 * 60_000) throw new Error("indexnow_scan_timeout");
    await Promise.all(
      all.slice(offset, offset + 3).map(async (url) => {
        if (!robotsAllowsIndexNow(robots, url)) {
          entries[url] = REMOVED;
          return;
        }
        const response = await get(url);
        if ([404, 410].includes(response.status)) {
          if (currentUrls.has(url)) throw new Error("indexnow_sitemap_page_missing");
          entries[url] = REMOVED;
          return;
        }
        if ([301, 302, 307, 308].includes(response.status)) {
          if (currentUrls.has(url)) throw new Error("indexnow_sitemap_redirect");
          const destination = publicIndexNowUrl(
            new URL(response.headers.get("location"), url).href,
          );
          if (!destination || !currentUrls.has(destination))
            throw new Error("indexnow_unverified_redirect");
          entries[url] = REMOVED;
          return;
        }
        if (response.status !== 200 || !response.headers.get("content-type")?.includes("text/html"))
          throw new Error("indexnow_page_unavailable");
        const hash = indexNowPageFingerprint(
          await responseText(response),
          url,
          response.headers.get("x-robots-tag") || "",
        );
        // A page merely disappearing from Sitemap is not proof it was deleted.
        if (!currentUrls.has(url) && hash) {
          entries[url] = previous[url];
          return;
        }
        entries[url] = hash || REMOVED;
      }),
    );
  }
  const oldUrls = Object.keys(previous);
  const removed = oldUrls.filter((url) => entries[url] === REMOVED);
  if (removed.length > Math.max(5, oldUrls.length * 0.2))
    throw new Error("indexnow_bulk_removal_requires_review");
  return entries;
}

function validateState(state) {
  if (!state) return;
  if (
    state.version !== 1 ||
    !state.entries ||
    !state.removals ||
    !Number.isFinite(state.nextAttemptAt) ||
    Object.keys(state.entries).length > INDEXNOW_MAX_URLS ||
    Object.entries(state.entries).some(
      ([url, hash]) => publicIndexNowUrl(url) !== url || !/^[0-9a-f]{64}$/.test(hash),
    )
  ) {
    throw new Error("indexnow_invalid_state");
  }
}

export async function runIndexNowWorker(
  config,
  { mode = "run", fetchImpl = fetch, now = Date.now } = {},
) {
  if (!["run", "initialize", "dry-run"].includes(mode)) throw new Error("indexnow_invalid_mode");
  const { directory, key } = config;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lock = path.join(directory, "worker.lock");
  try {
    await mkdir(lock);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    // Every scan is bounded below 9 minutes. Recover only an old empty lock.
    if (now() - (await stat(lock)).mtimeMs < 15 * 60_000) return { status: "locked" };
    await rmdir(lock);
    try {
      await mkdir(lock);
    } catch (retryError) {
      if (retryError.code === "EEXIST") return { status: "locked" };
      throw retryError;
    }
  }
  try {
    const stateFile = path.join(directory, "state.json");
    const state = await readJson(stateFile);
    validateState(state);
    if (mode === "initialize" && state) throw new Error("indexnow_already_initialized");
    if (mode === "run" && !state) throw new Error("indexnow_initialize_first");
    const dirty = await readJson(path.join(directory, "dirty.json"));
    const token = dirty?.token || "";
    const timestamp = now();
    if (
      mode === "run" &&
      state.nextAttemptAt > timestamp &&
      (state.failures || token === state.token)
    )
      return { status: "idle" };
    try {
      const observed = await scanIndexNowSite(state?.entries, { fetchImpl, now });
      const entries = { ...observed };
      const removals = {};
      const changed = [];
      for (const [url, hash] of Object.entries(observed)) {
        if (hash !== REMOVED) {
          if (state && hash !== state.entries[url]) changed.push(url);
          continue;
        }
        delete entries[url];
        if (!state?.entries[url]) continue;
        const firstSeen = state.removals[url] ?? timestamp;
        if (timestamp - firstSeen >= 60_000) changed.push(url);
        else {
          removals[url] = firstSeen;
          entries[url] = state.entries[url];
        }
      }
      if (mode === "dry-run")
        return {
          status: state ? "preview" : "initialization_required",
          changed,
          pendingRemovals: Object.keys(removals),
        };
      let acceptedStatus = null;
      if (changed.length || mode === "initialize") {
        const verification = await fetchImpl(`${INDEXNOW_ORIGIN}${INDEXNOW_KEY_PATH}`, {
          redirect: "error",
          signal: AbortSignal.timeout(15000),
        });
        if (verification.status !== 200 || (await responseText(verification, 1024)).trim() !== key)
          throw new Error("indexnow_key_not_published");
      }
      if (changed.length) {
        const response = await fetchImpl(INDEXNOW_ENDPOINT, {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(15000),
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify(indexNowPayload(key, changed)),
        });
        acceptedStatus = response.status;
        if (![200, 202].includes(response.status)) {
          const error = new Error(`indexnow_submission_http_${response.status}`);
          const retry = response.headers.get("retry-after");
          const retryAt =
            retry && /^\d+$/.test(retry)
              ? timestamp + Number(retry) * 1000
              : Date.parse(retry || "");
          error.retryAt = Number.isFinite(retryAt) ? retryAt : 0;
          throw error;
        }
        await response.body?.cancel();
      }
      await writeIndexNowJson(directory, "state", {
        version: 1,
        entries,
        removals,
        token,
        failures: 0,
        lastSuccessAt: timestamp,
        nextAttemptAt: timestamp + (Object.keys(removals).length ? 60_000 : HOUR),
      });
      return {
        status: mode === "initialize" ? "initialized" : "ok",
        inspected: Object.keys(observed).length,
        submitted: changed.length,
        acceptedStatus,
      };
    } catch (error) {
      if (state && mode === "run") {
        const failures = (state.failures || 0) + 1;
        const delay = Math.min(6 * HOUR, 60_000 * 2 ** Math.min(failures - 1, 12));
        await writeIndexNowJson(directory, "state", {
          ...state,
          failures,
          nextAttemptAt: Math.max(timestamp + delay, error.retryAt || 0),
        });
      }
      throw error;
    }
  } finally {
    await rmdir(lock);
  }
}

#!/usr/bin/env node
import { indexNowConfig } from "../apps/web/lib/indexnow-queue.ts";
import { runIndexNowWorker } from "./lib/indexnow-worker.mjs";

try {
  const flags = process.argv.slice(2);
  if (flags.length !== 1 || !["--run", "--initialize", "--dry-run"].includes(flags[0])) {
    throw new Error("Usage: run_indexnow.mjs --run | --initialize | --dry-run");
  }
  const config = indexNowConfig();
  console.log(
    JSON.stringify(
      config
        ? await runIndexNowWorker(config, { mode: flags[0].slice(2) })
        : { status: "disabled" },
    ),
  );
} catch (error) {
  // Keys, response bodies, HTML and Directus tokens must never enter logs.
  console.error(
    `[IndexNow] ${/^indexnow_|^Usage:/.test(error.message) ? error.message : "worker_failed"}`,
  );
  process.exitCode = 1;
}

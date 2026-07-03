import fs from "node:fs";
import { chromium } from "playwright";

const EXECUTABLE_ENV_KEYS = ["PLAYWRIGHT_EXECUTABLE_PATH", "CHROME_EXECUTABLE_PATH"];

const WINDOWS_BROWSER_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];

function envExecutablePath() {
  for (const key of EXECUTABLE_ENV_KEYS) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return "";
}

function localExecutablePath() {
  if (process.platform !== "win32") return "";
  return WINDOWS_BROWSER_CANDIDATES.find((candidate) => fs.existsSync(candidate)) || "";
}

export function playwrightLaunchOptions(options = {}) {
  const executablePath = envExecutablePath() || localExecutablePath();
  return executablePath ? { ...options, executablePath } : options;
}

export async function launchChromium(options = {}) {
  return chromium.launch(playwrightLaunchOptions(options));
}

export function playwrightBrowserHint() {
  return [
    "Playwright browser is not installed and no system Chrome/Edge executable was found.",
    "Install the Playwright browser with: npx playwright install chromium",
    "Or set PLAYWRIGHT_EXECUTABLE_PATH to a local Chrome/Edge executable.",
  ].join(" ");
}

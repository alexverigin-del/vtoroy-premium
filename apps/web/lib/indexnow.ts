import { createHash } from "node:crypto";
import { Parser } from "htmlparser2";

export const INDEXNOW_ORIGIN = "https://isvoi.ru";
export const INDEXNOW_ENDPOINT = "https://yandex.com/indexnow";
export const INDEXNOW_KEY_PATH = "/indexnow-key.txt";
export const INDEXNOW_MAX_URLS = 500;

export function publicIndexNowUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.origin !== INDEXNOW_ORIGIN || url.username || url.password || url.search || url.hash)
      return null;
    if (!/^\/[a-zA-Z0-9/_-]*$/.test(url.pathname)) return null;
    if (/^\/(?:api|_next|club|integrations|lead-intake|trade\/qa)(?:\/|$)/i.test(url.pathname))
      return null;
    return `${url.origin}${url.pathname === "/" ? "/" : url.pathname.replace(/\/$/, "")}`;
  } catch {
    return null;
  }
}

export function sitemapIndexNowUrls(xml: string): string[] {
  if (
    !/<urlset\b[^>]*xmlns=["']http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9["']/.test(xml) ||
    !/<\/urlset>/.test(xml)
  ) {
    throw new Error("indexnow_invalid_sitemap");
  }
  const raw = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  const urls = raw.map(publicIndexNowUrl);
  if (!urls.length || urls.some((url) => !url) || urls.length > INDEXNOW_MAX_URLS) {
    throw new Error("indexnow_unsafe_sitemap");
  }
  return [...new Set(urls as string[])].sort();
}

export function robotsAllowsIndexNow(robots: string, url: string): boolean {
  const groups: { agents: string[]; rules: { allow: boolean; pattern: string }[] }[] = [];
  let group = { agents: [] as string[], rules: [] as { allow: boolean; pattern: string }[] };
  for (const line of robots.split(/\r?\n/)) {
    const match = line
      .replace(/#.*/, "")
      .trim()
      .match(/^([\w-]+)\s*:\s*(.*)$/);
    if (!match) continue;
    const [, rawName, value] = match;
    const name = rawName.toLowerCase();
    if (name === "user-agent") {
      if (group.rules.length) {
        groups.push(group);
        group = { agents: [], rules: [] };
      }
      group.agents.push(value.toLowerCase());
    } else if ((name === "allow" || name === "disallow") && value) {
      group.rules.push({ allow: name === "allow", pattern: value });
    }
  }
  groups.push(group);
  const specific = groups.filter((item) =>
    item.agents.some((agent) => ["yandex", "yandexbot"].includes(agent)),
  );
  const selected = specific.length ? specific : groups.filter((item) => item.agents.includes("*"));
  const pathname = new URL(url).pathname;
  const matches = selected
    .flatMap((item) => item.rules)
    .filter((rule) => {
      const pattern = rule.pattern.replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
      return new RegExp(`^${pattern}`).test(pathname);
    })
    .sort((a, b) => b.pattern.length - a.pattern.length || Number(b.allow) - Number(a.allow));
  return matches[0]?.allow ?? true;
}

// Hash only crawlable public content, not React flight chunks, random IDs,
// consent state, CSS classes or build filenames. Nothing here executes HTML/JS.
export function indexNowPageFingerprint(html: string, expectedUrl: string, xRobots = "") {
  let depth = 0,
    mainDepth = 0,
    skipDepth = 0,
    h1Count = 0;
  let title = "",
    inTitle = false,
    json = "",
    inJson = false;
  const text: string[] = [],
    assets: string[] = [],
    structured: unknown[] = [];
  const descriptions: string[] = [],
    canonicals: string[] = [],
    robots: string[] = [xRobots];
  const parser = new Parser(
    {
      onopentag(name, attributes) {
        depth++;
        if (name === "main" && !skipDepth) mainDepth = depth;
        if (name === "title") inTitle = true;
        if (
          name === "meta" &&
          ["robots", "yandex", "yandexbot"].includes(attributes.name?.toLowerCase())
        )
          robots.push(attributes.content || "");
        if (name === "meta" && attributes.name === "description")
          descriptions.push(attributes.content || "");
        if (name === "link" && attributes.rel === "canonical") canonicals.push(attributes.href);
        if (name === "script" && attributes.type === "application/ld+json") {
          inJson = true;
          json = "";
        }
        if (!skipDepth && ["script", "style", "template", "noscript"].includes(name))
          skipDepth = depth;
        if (mainDepth && !skipDepth) {
          if (name === "h1") h1Count++;
          if (name === "img") assets.push(JSON.stringify([attributes.src, attributes.alt]));
          if (name === "a") assets.push(attributes.href || "");
        }
      },
      ontext(value) {
        if (inTitle) title += value;
        if (inJson) json += value;
        if (mainDepth && !skipDepth) text.push(value);
      },
      onclosetag(name) {
        if (name === "title") inTitle = false;
        if (name === "script" && inJson) {
          structured.push(JSON.parse(json));
          inJson = false;
        }
        if (depth === skipDepth) skipDepth = 0;
        if (depth === mainDepth) mainDepth = 0;
        depth--;
      },
    },
    { decodeEntities: true },
  );
  parser.write(html);
  parser.end();
  if (robots.some((value) => /(?:^|[,\s])(?:noindex|none)(?:$|[,\s])/i.test(value))) return null;
  if (canonicals.length !== 1) throw new Error("indexnow_missing_or_duplicate_canonical");
  if (publicIndexNowUrl(new URL(canonicals[0], expectedUrl).href) !== expectedUrl) return null;
  const content = text.join(" ").replace(/\s+/g, " ").trim();
  if (!title.trim() || !h1Count || content.length < 40) throw new Error("indexnow_incomplete_page");
  return createHash("sha256")
    .update(JSON.stringify({ title: title.trim(), descriptions, content, assets, structured }))
    .digest("hex");
}

export function indexNowPayload(key: string, urls: string[]) {
  if (
    !/^[a-zA-Z0-9-]{8,128}$/.test(key) ||
    !urls.length ||
    urls.length > INDEXNOW_MAX_URLS ||
    urls.some((url) => publicIndexNowUrl(url) !== url)
  ) {
    throw new Error("indexnow_invalid_submission");
  }
  return {
    host: "isvoi.ru",
    key,
    keyLocation: `${INDEXNOW_ORIGIN}${INDEXNOW_KEY_PATH}`,
    urlList: [...new Set(urls)],
  };
}

import { Parser } from "htmlparser2";
import { pathToFileURL } from "node:url";

// Only same-origin public image optimizer URLs are eligible. No CMS credentials.
export function criticalImageUrls(html, base) {
  const origin = new URL(base).origin;
  const urls = new Set();
  const add = (src) => {
    if (!src) return;
    const url = new URL(src, base);
    if (url.origin === origin && url.pathname === "/_next/image") urls.add(url.href);
  };
  const srcset = (value) =>
    (value || "")
      .split(",")
      .map((item) => item.trim().split(/\s+/)[0])
      .filter(Boolean);
  const parser = new Parser({
    onopentag(name, attrs) {
      if (name === "img" && (attrs.fetchpriority === "high" || attrs.loading === "eager")) {
        const candidates = srcset(attrs.srcset);
        if (candidates.length) candidates.forEach(add);
        else add(attrs.src);
      }
      if (name === "link" && attrs.rel === "preload" && attrs.as === "image") {
        const candidates = srcset(attrs.imagesrcset);
        if (candidates.length) candidates.forEach(add);
        else add(attrs.href);
      }
    },
  });
  parser.end(html);
  return [...urls];
}

export async function warmPublicImages(base, routes = ["/", "/store", "/blog"]) {
  const urls = new Set();
  const failures = [];
  for (const route of routes) {
    try {
      const url = new URL(route, base);
      if (url.origin !== new URL(base).origin) throw new Error("Cross-origin page refused");
      const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      criticalImageUrls(await response.text(), base).forEach((url) => urls.add(url));
    } catch (error) {
      failures.push(`${route}: ${error.message}`);
    }
  }
  let warmed = 0;
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        redirect: "error",
        headers: { Accept: "image/avif,image/webp,image/*" },
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok || !response.headers.get("content-type")?.startsWith("image/"))
        throw new Error(`Invalid image response ${response.status}`);
      await response.arrayBuffer();
      warmed += 1;
    } catch (error) {
      failures.push(`${url}: ${error.message}`);
    }
  }
  return { discovered: urls.size, warmed, failures };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const base = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000";
  console.log(
    JSON.stringify(
      await warmPublicImages(base, process.env.IMAGE_WARM_ROUTES?.split(",")),
      null,
      2,
    ),
  );
  // Best effort: cache health must never block a content publication.
}

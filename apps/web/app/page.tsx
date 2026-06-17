import fs from "node:fs";
import path from "node:path";
import Script from "next/script";

export const dynamic = "force-dynamic";

function legacyHomeMarkup(): string {
  const candidates = [
    path.join(process.cwd(), "apps", "web", "public", "index.html"),
    path.join(process.cwd(), "public", "index.html"),
    path.join(process.cwd(), "index.html"),
    path.join(process.cwd(), "..", "..", "index.html"),
  ];
  const source = candidates.find((candidate) => fs.existsSync(candidate));
  if (!source) {
    throw new Error("Legacy homepage index.html was not found.");
  }

  const html = fs.readFileSync(source, "utf8");
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? "";

  return body
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/href="catalog\/index\.html"/g, 'href="/catalog/index.html"')
    .replace(/href="store\/index\.html"/g, 'href="/store/index.html"')
    .replace(/href="passport\/index\.html"/g, 'href="/passport/index.html"')
    .replace(/href="trade\/index\.html"/g, 'href="/trade/index.html"')
    .replace(/href="club\/index\.html"/g, 'href="/club/index.html"')
    .replace(/href="index\.html#/g, 'href="/#')
    .replace(/src="assets\//g, 'src="/assets/')
    .replace(/href="assets\//g, 'href="/assets/');
}

export default function HomePage() {
  return (
    <>
      <link rel="stylesheet" href="/styles.css?v=20260616a" />
      <div dangerouslySetInnerHTML={{ __html: legacyHomeMarkup() }} />
      <Script src="/data/devices.js?v=20260616a" strategy="afterInteractive" />
      <Script src="/script.js?v=20260616a" strategy="afterInteractive" />
    </>
  );
}

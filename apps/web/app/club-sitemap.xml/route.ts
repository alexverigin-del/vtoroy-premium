export function GET() {
  return new Response(
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      "  <url>",
      "    <loc>https://club.isvoi.ru/</loc>",
      "    <changefreq>weekly</changefreq>",
      "    <priority>0.7</priority>",
      "  </url>",
      "</urlset>",
      "",
    ].join("\n"),
    {
      headers: {
        "content-type": "application/xml; charset=utf-8",
      },
    },
  );
}

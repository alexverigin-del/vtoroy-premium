export function GET() {
  return new Response(
    ["User-agent: *", "Allow: /", "Sitemap: https://club.isvoi.ru/sitemap.xml", ""].join("\n"),
    {
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
    },
  );
}

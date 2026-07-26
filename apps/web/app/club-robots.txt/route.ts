import { getClubPageData, isClubIndexingEnabled } from "@/lib/club";

export const dynamic = "force-dynamic";

export async function GET() {
  const clubData = await getClubPageData();
  const indexable = isClubIndexingEnabled(clubData.settings);
  return new Response(
    indexable
      ? ["User-agent: *", "Allow: /", "Sitemap: https://club.isvoi.ru/sitemap.xml", ""].join("\n")
      : ["User-agent: *", "Disallow: /", ""].join("\n"),
    {
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
    },
  );
}

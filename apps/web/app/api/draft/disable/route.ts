import { draftMode } from "next/headers";
import { NextResponse } from "next/server";

import { siteUrl } from "@/lib/structured-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const draft = await draftMode();
  draft.disable();
  return NextResponse.redirect(new URL(siteUrl("/blog")));
}

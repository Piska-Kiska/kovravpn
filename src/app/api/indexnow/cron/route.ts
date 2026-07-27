// src/app/api/indexnow/cron/route.ts
//
// Daily IndexNow ping, triggered by Vercel Cron.
//
// Vercel Cron authentication:
//  - On Hobby tier, Vercel adds an `Authorization: Bearer <CRON_SECRET>`
//    header to cron requests, using the value of the `CRON_SECRET` env var
//    that Vercel auto-generates when crons are enabled.
//  - We verify this header so nobody external can trigger the endpoint by
//    guessing the path.
//
// Ref: https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs
//
// Schedule is defined in /vercel.json: "0 3 * * *" = 03:00 UTC daily
// (06:00 Moscow time — chosen so the daily search-engine quota resets are
// consumed during our users' morning, not late at night).

import { NextRequest, NextResponse } from "next/server";
import { pingIndexNow } from "@/lib/indexnow";
import { GUIDES, SITE_URL } from "@/lib/guides";

const CRON_SECRET = process.env.CRON_SECRET || "";

/**
 * Everything indexable, derived from the same registry that feeds the
 * sitemap. Previously this was a hardcoded list of four URLs, so the
 * /guides cluster — the pages actually written to rank — was never
 * announced and had to wait for an organic crawl.
 *
 * Well under the 100-URL cap in pingIndexNow, with room for the registry
 * to keep growing.
 */
const URLS = [
  `${SITE_URL}/`,
  `${SITE_URL}/guide`,
  `${SITE_URL}/guides`,
  ...GUIDES.map((g) => `${SITE_URL}/guides/${g.slug}`),
  `${SITE_URL}/terms`,
  `${SITE_URL}/privacy`,
];

export async function GET(req: NextRequest) {
  // Vercel Cron uses GET by default. Keep a strict auth check so the path
  // alone cannot be used to flood IndexNow (and through it, rate-limit us
  // at Bing/Yandex).
  const auth = req.headers.get("authorization") || "";
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await pingIndexNow(URLS);
  return NextResponse.json(
    { ...result, ranAt: new Date().toISOString() },
    { status: result.ok ? 200 : 502 },
  );
}

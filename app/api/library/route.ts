import { NextResponse } from "next/server";
import db, { ready } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LibRow = {
  id: string;
  title: string;
  artist: string | null;
  perf_name: string | null;
  created_at: number;
};

// GET /api/library — all existing songs (across performances), de-duplicated by
// title+artist, so they can be copied into another performance without
// re-fetching their lyrics.
export async function GET() {
  await ready();
  const result = await db.execute(`
    SELECT s.id, s.title, s.artist, s.created_at, p.name AS perf_name
    FROM songs s
    LEFT JOIN performances p ON p.id = s.performance_id
    ORDER BY s.created_at DESC
  `);

  const seen = new Set<string>();
  const items: LibRow[] = [];
  for (const row of result.rows as unknown as LibRow[]) {
    const key = `${(row.title || "").trim().toLowerCase()}|${(
      row.artist || ""
    )
      .trim()
      .toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(row);
  }

  return NextResponse.json({ songs: items });
}

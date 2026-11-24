import { NextResponse } from "next/server";
import db, { ready } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SongRow = {
  id: string;
  title: string;
  artist: string | null;
  source_url: string | null;
  lyrics: string;
  chorus: string | null;
  position: number;
  created_at: number;
  performance_id: string | null;
};

// POST { fromId, performanceId } — copy an existing song into a performance,
// reusing its already-fetched lyrics (no re-fetch).
export async function POST(req: Request) {
  await ready();

  let body: { fromId?: string; performanceId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const fromId = (body.fromId || "").trim();
  const performanceId = (body.performanceId || "").trim();
  if (!fromId || !performanceId) {
    return NextResponse.json({ error: "חסרים פרטים" }, { status: 400 });
  }

  const src = await db.execute({
    sql: "SELECT * FROM songs WHERE id = ?",
    args: [fromId],
  });
  if (src.rows.length === 0) {
    return NextResponse.json({ error: "השיר לא נמצא" }, { status: 404 });
  }
  const s = src.rows[0] as unknown as SongRow;

  const id = crypto.randomUUID();
  const now = Date.now();
  const maxRes = await db.execute({
    sql: "SELECT COALESCE(MAX(position), -1) AS maxPos FROM songs WHERE performance_id = ?",
    args: [performanceId],
  });
  const nextPos =
    Number((maxRes.rows[0] as unknown as { maxPos: number }).maxPos) + 1;

  await db.execute({
    sql: `INSERT INTO songs (id, title, artist, source_url, lyrics, chorus, position, created_at, performance_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      s.title,
      s.artist,
      s.source_url,
      s.lyrics,
      s.chorus,
      nextPos,
      now,
      performanceId,
    ],
  });

  const inserted = await db.execute({
    sql: "SELECT * FROM songs WHERE id = ?",
    args: [id],
  });
  return NextResponse.json({ song: inserted.rows[0] as unknown as SongRow });
}

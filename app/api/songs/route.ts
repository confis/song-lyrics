import { NextResponse } from "next/server";
import db, { ready } from "@/lib/db";
import { extractSongFromUrl } from "@/lib/extract";

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

// GET /api/songs?performance=<id> — songs in one performance, in order.
export async function GET(req: Request) {
  await ready();
  const performanceId = new URL(req.url).searchParams.get("performance");
  if (!performanceId) {
    return NextResponse.json({ error: "חסר מזהה הופעה" }, { status: 400 });
  }
  const result = await db.execute({
    sql: "SELECT * FROM songs WHERE performance_id = ? ORDER BY position ASC, created_at ASC",
    args: [performanceId],
  });
  return NextResponse.json({ songs: result.rows as unknown as SongRow[] });
}

// POST { url, performanceId } — fetch + extract a song into a performance.
export async function POST(req: Request) {
  await ready();

  let body: { url?: string; performanceId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const performanceId = (body.performanceId || "").trim();
  if (!performanceId) {
    return NextResponse.json({ error: "חסר מזהה הופעה" }, { status: 400 });
  }

  const url = (body.url || "").trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    return NextResponse.json(
      { error: "נא להזין כתובת URL תקינה (שמתחילה ב-http)" },
      { status: 400 }
    );
  }

  let song;
  try {
    song = await extractSongFromUrl(url);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "שגיאה בחילוץ מילות השיר";
    return NextResponse.json({ error: message }, { status: 422 });
  }

  const id = crypto.randomUUID();
  const now = Date.now();

  const maxRes = await db.execute({
    sql: "SELECT COALESCE(MAX(position), -1) AS maxPos FROM songs WHERE performance_id = ?",
    args: [performanceId],
  });
  const nextPos = Number((maxRes.rows[0] as unknown as { maxPos: number }).maxPos) + 1;

  await db.execute({
    sql: `INSERT INTO songs (id, title, artist, source_url, lyrics, chorus, position, created_at, performance_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      song.title,
      song.artist,
      url,
      song.lyrics,
      song.chorus,
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

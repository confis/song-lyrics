import { NextResponse } from "next/server";
import db, { ready } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PerformanceRow = {
  id: string;
  name: string;
  position: number;
  created_at: number;
  song_count: number;
};

export async function GET() {
  await ready();
  const result = await db.execute(`
    SELECT p.id, p.name, p.position, p.created_at,
           COUNT(s.id) AS song_count
    FROM performances p
    LEFT JOIN songs s ON s.performance_id = p.id
    GROUP BY p.id
    ORDER BY p.position ASC, p.created_at ASC
  `);
  return NextResponse.json({
    performances: result.rows as unknown as PerformanceRow[],
  });
}

export async function POST(req: Request) {
  await ready();

  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }

  const name = (body.name || "").trim();
  if (!name) {
    return NextResponse.json({ error: "נא להזין שם להופעה" }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  const maxRes = await db.execute(
    "SELECT COALESCE(MAX(position), -1) AS maxPos FROM performances"
  );
  const nextPos = Number((maxRes.rows[0] as unknown as { maxPos: number }).maxPos) + 1;

  await db.execute({
    sql: "INSERT INTO performances (id, name, position, created_at) VALUES (?, ?, ?, ?)",
    args: [id, name.slice(0, 200), nextPos, now],
  });

  return NextResponse.json({
    performance: { id, name: name.slice(0, 200), position: nextPos, created_at: now, song_count: 0 },
  });
}

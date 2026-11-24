import { NextResponse } from "next/server";
import db, { ready } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Rename a performance.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await ready();
  const { id } = await params;

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

  const res = await db.execute({
    sql: "UPDATE performances SET name = ? WHERE id = ?",
    args: [name.slice(0, 200), id],
  });
  if (res.rowsAffected === 0) {
    return NextResponse.json({ error: "ההופעה לא נמצאה" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, name: name.slice(0, 200) });
}

// Delete a performance and all of its songs.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await ready();
  const { id } = await params;
  await db.batch(
    [
      { sql: "DELETE FROM songs WHERE performance_id = ?", args: [id] },
      { sql: "DELETE FROM performances WHERE id = ?", args: [id] },
    ],
    "write"
  );
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchResult = {
  title: string;
  artist: string;
  url: string;
  thumbnail: string;
};

// GET /api/search?q=<song name> — autocomplete via the Genius search API.
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") || "").trim();
  if (!q) return NextResponse.json({ results: [] });

  const token = process.env.GENIUS_ACCESS_TOKEN;
  if (!token) {
    // Signal the UI that search isn't configured yet (link paste still works).
    return NextResponse.json({ results: [], error: "missing_genius_token" });
  }

  let res: Response;
  try {
    res = await fetch(
      `https://api.genius.com/search?q=${encodeURIComponent(q)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
  } catch {
    return NextResponse.json({ error: "שגיאת רשת בחיפוש" }, { status: 502 });
  }

  if (!res.ok) {
    return NextResponse.json(
      { error: `החיפוש נכשל (סטטוס ${res.status})` },
      { status: 502 }
    );
  }

  const data = await res.json().catch(() => null);
  const hits: Array<{ type?: string; result?: Record<string, unknown> }> =
    data?.response?.hits || [];

  const results: SearchResult[] = hits
    .map((h) => h.result)
    .filter((r): r is Record<string, unknown> => Boolean(r && r.url))
    .map((r) => ({
      title: String(r.title || ""),
      artist: String(
        (r.primary_artist as { name?: string } | undefined)?.name || ""
      ),
      url: String(r.url),
      thumbnail: String(
        r.song_art_image_thumbnail_url || r.header_image_thumbnail_url || ""
      ),
    }))
    .slice(0, 8);

  return NextResponse.json({ results });
}

import { createClient, type Client } from "@libsql/client";

// libSQL client — storage resolution:
//  1. DATABASE_URL / TURSO_DATABASE_URL (recommended in production): a persistent
//     libSQL/Turso URL with its auth token. Real, shared persistence.
//  2. Otherwise a local SQLite file. On Vercel the project dir is read-only, so
//     we use /tmp there (ephemeral). Locally we use data/songs.db.
function resolveUrl(): string {
  const remote = process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL;
  if (remote) return remote;
  if (process.env.VERCEL) return "file:/tmp/songs.db";
  return "file:data/songs.db";
}

const url = resolveUrl();
const authToken =
  process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN;

declare global {
  // eslint-disable-next-line no-var
  var __libsqlClient: Client | undefined;
  // eslint-disable-next-line no-var
  var __dbReady: Promise<void> | undefined;
}

const client: Client =
  global.__libsqlClient ?? createClient({ url, authToken });
if (!global.__libsqlClient) global.__libsqlClient = client;

async function init(): Promise<void> {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS songs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      artist TEXT,
      source_url TEXT,
      lyrics TEXT NOT NULL,
      chorus TEXT,
      position INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  // Performances (shows): each is its own named setlist of songs.
  await client.execute(`
    CREATE TABLE IF NOT EXISTS performances (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      position INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  // Add songs.performance_id if this DB predates performances.
  const cols = await client.execute("PRAGMA table_info(songs)");
  const hasPerf = (cols.rows as unknown as Array<{ name: string }>).some(
    (r) => r.name === "performance_id"
  );
  if (!hasPerf) {
    await client.execute("ALTER TABLE songs ADD COLUMN performance_id TEXT");
  }

  // Migrate any songs not yet attached to a performance into a default one,
  // so existing data is preserved when upgrading.
  const orphan = await client.execute(
    "SELECT COUNT(*) AS c FROM songs WHERE performance_id IS NULL"
  );
  if (Number((orphan.rows[0] as unknown as { c: number }).c) > 0) {
    const existing = await client.execute(
      "SELECT id FROM performances ORDER BY position ASC, created_at ASC LIMIT 1"
    );
    let defId: string;
    if (existing.rows.length) {
      defId = (existing.rows[0] as unknown as { id: string }).id;
    } else {
      defId = crypto.randomUUID();
      await client.execute({
        sql: "INSERT INTO performances (id, name, position, created_at) VALUES (?, ?, ?, ?)",
        args: [defId, "ההופעה שלי", 0, Date.now()],
      });
    }
    await client.execute({
      sql: "UPDATE songs SET performance_id = ? WHERE performance_id IS NULL",
      args: [defId],
    });
  }
}

export function ready(): Promise<void> {
  if (!global.__dbReady) global.__dbReady = init();
  return global.__dbReady;
}

export default client;

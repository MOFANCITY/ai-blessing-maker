import type { Client } from "@libsql/client/http";
import type { ToolKey } from "@/lib/capabilities/registry";

export interface ContentRecord {
  id: number;
  owner_openid: string;
  tool_key: ToolKey;
  input_json: string;
  output_json: string;
  status: "completed" | "draft";
  created_at: number;
  updated_at: number;
}

let contentTableReady: Promise<void> | null = null;
const MAX_CONTENT_JSON_LENGTH = 16_000;

function serializeContentPayload(value: unknown, label: string): string {
  const serialized = JSON.stringify(value);
  if (!serialized || serialized.length > MAX_CONTENT_JSON_LENGTH) {
    throw new Error(`${label}内容超出可存储范围`);
  }
  return serialized;
}

async function ensureContentTable(db: Client) {
  if (contentTableReady) return contentTableReady;
  contentTableReady = db
    .execute(`
      CREATE TABLE IF NOT EXISTS content_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_openid TEXT NOT NULL,
        tool_key TEXT NOT NULL,
        input_json TEXT NOT NULL,
        output_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'completed',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)
    .then(() => db.execute(
      `CREATE INDEX IF NOT EXISTS idx_content_records_owner_created
       ON content_records (owner_openid, created_at DESC)`,
    ))
    .then(() => undefined)
    .catch((error) => {
      contentTableReady = null;
      throw error;
    });
  return contentTableReady;
}

export async function createContentRecord(
  db: Client,
  data: { ownerOpenid: string; tool: ToolKey; input: Record<string, unknown>; output: unknown; status?: "completed" | "draft" },
): Promise<ContentRecord> {
  await ensureContentTable(db);
  const now = Date.now();
  const result = await db.execute({
    sql: `INSERT INTO content_records
          (owner_openid, tool_key, input_json, output_json, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          RETURNING *`,
    args: [
      data.ownerOpenid,
      data.tool,
      serializeContentPayload(data.input, "输入"),
      serializeContentPayload(data.output, "输出"),
      data.status ?? "completed",
      now,
      now,
    ],
  });
  return result.rows[0] as unknown as ContentRecord;
}

export async function getOwnedContentRecord(
  db: Client,
  ownerOpenid: string,
  id: number,
): Promise<ContentRecord | null> {
  await ensureContentTable(db);
  const result = await db.execute({
    sql: "SELECT * FROM content_records WHERE id = ? AND owner_openid = ? LIMIT 1",
    args: [id, ownerOpenid],
  });
  return (result.rows[0] as unknown as ContentRecord | undefined) ?? null;
}

export async function listContentRecords(
  db: Client,
  ownerOpenid: string,
  limit = 50,
  offset = 0,
): Promise<ContentRecord[]> {
  await ensureContentTable(db);
  const result = await db.execute({
    sql: `SELECT * FROM content_records WHERE owner_openid = ?
          ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    args: [ownerOpenid, Math.max(1, Math.min(100, limit)), Math.max(0, offset)],
  });
  return result.rows as unknown as ContentRecord[];
}

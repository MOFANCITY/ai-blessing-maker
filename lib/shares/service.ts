import type { Client } from "@libsql/client/http";
import { ensureCreditsTables } from "@/lib/credits";

export type ShareType = "friend" | "timeline";

export type ShareRewardResult =
  | { ok: true; alreadyRewarded: boolean; pointsAdded: number; balanceAfter: number }
  | { ok: false; code: "NOT_FOUND" | "NOT_SHAREABLE" };

let shareTablesReady: Promise<void> | null = null;

async function ensureShareTables(db: Client) {
  if (shareTablesReady) return shareTablesReady;
  shareTablesReady = db
    .execute(`
      CREATE TABLE IF NOT EXISTS share_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        openid TEXT NOT NULL,
        content_type TEXT NOT NULL,
        content_id TEXT NOT NULL,
        share_type TEXT NOT NULL,
        reward INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(openid, content_type, content_id, share_type)
      )
    `)
    .then(() =>
      db.execute(
        `CREATE INDEX IF NOT EXISTS idx_share_events_owner_created
         ON share_events (openid, created_at DESC)`,
      ),
    )
    .then(() => undefined)
    .catch((error) => {
      shareTablesReady = null;
      throw error;
    });
  return shareTablesReady;
}

/**
 * Grant at most one reward for each owned, shareable couplet and destination.
 * The event, balance mutation, credit ledger entry and record flag are one
 * write transaction, so retries and concurrent taps cannot mint extra credit.
 */
export async function rewardCoupletShare(
  db: Client,
  openid: string,
  recordId: number,
  shareType: ShareType,
): Promise<ShareRewardResult> {
  await ensureCreditsTables(db);
  await ensureShareTables(db);

  const recordResult = await db.execute({
    sql: `SELECT id, openid, can_share
          FROM couplet_records
          WHERE id = ? AND openid = ?
          LIMIT 1`,
    args: [recordId, openid],
  });
  const record = recordResult.rows[0] as
    | { can_share?: number | boolean | null }
    | undefined;
  if (!record) return { ok: false, code: "NOT_FOUND" };
  if (Number(record.can_share) !== 1) return { ok: false, code: "NOT_SHAREABLE" };

  const reward = shareType === "timeline" ? 10 : 5;
  const now = new Date().toISOString();
  const timestamp = Date.now();
  const results = await db.batch(
    [
      {
        sql: `INSERT OR IGNORE INTO user_credits
              (openid, balance, total_earned, total_spent, created_at, updated_at)
              VALUES (?, 0, 0, 0, ?, ?)`,
        args: [openid, now, now],
      },
      {
        sql: `INSERT OR IGNORE INTO share_events
              (openid, content_type, content_id, share_type, reward, created_at)
              VALUES (?, 'couplet', ?, ?, ?, ?)
              RETURNING id`,
        args: [openid, String(recordId), shareType, reward, timestamp],
      },
      {
        sql: `UPDATE user_credits
              SET balance = balance + ?, total_earned = total_earned + ?, updated_at = ?
              WHERE openid = ? AND changes() = 1
              RETURNING balance`,
        args: [reward, reward, now, openid],
      },
      {
        sql: `INSERT INTO credits_transactions
              (openid, type, amount, balance_after, reason, metadata, created_at)
              SELECT ?, 'earn', ?, balance, 'share', ?, ?
              FROM user_credits
              WHERE openid = ? AND changes() = 1`,
        args: [
          openid,
          reward,
          JSON.stringify({ contentType: "couplet", contentId: recordId, shareType }),
          timestamp,
          openid,
        ],
      },
      {
        sql: `UPDATE couplet_records
              SET is_shared = 1, shared_at = ?
              WHERE id = ? AND openid = ?`,
        args: [now, recordId, openid],
      },
    ],
    "write",
  );

  const eventCreated = results[1].rows.length > 0;
  if (!eventCreated) {
    const balanceResult = await db.execute({
      sql: "SELECT balance FROM user_credits WHERE openid = ? LIMIT 1",
      args: [openid],
    });
    return {
      ok: true,
      alreadyRewarded: true,
      pointsAdded: 0,
      balanceAfter: Number(
        (balanceResult.rows[0] as { balance?: number } | undefined)?.balance ?? 0,
      ),
    };
  }

  return {
    ok: true,
    alreadyRewarded: false,
    pointsAdded: reward,
    balanceAfter: Number((results[2].rows[0] as unknown as { balance: number }).balance),
  };
}

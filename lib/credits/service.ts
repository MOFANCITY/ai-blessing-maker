/**
 * 积分（Credits）业务逻辑层。
 *
 * 每一笔余额变更及其流水都通过 libSQL 的 write batch 在同一事务中提交，
 * 避免并发请求透支余额或留下没有流水的余额变更。
 */
import type { Client } from "@libsql/client/http";
import {
  COST_PER_USAGE,
  CHECKIN_REWARD,
  DAILY_OPEN_BONUS,
  NEW_USER_BONUS,
} from "./config";
import type {
  CreditsCheckResult,
  CreditsInfo,
  CheckinResult,
  DailyOpenResult,
  UserCreditsRow,
  CreditsTransactionRow,
  TransactionItem,
  CreditsReason,
} from "./types";

const todayStr = (): string => new Date().toISOString().slice(0, 10);
const nowISO = (): string => new Date().toISOString();
const nowTs = (): number => Date.now();

let tablesReady: Promise<void> | null = null;

export async function ensureCreditsTables(db: Client): Promise<void> {
  if (tablesReady) return tablesReady;

  tablesReady = (async () => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS user_credits (
        openid TEXT PRIMARY KEY,
        balance INTEGER NOT NULL DEFAULT 0,
        last_checkin_date TEXT,
        last_open_date TEXT,
        total_earned INTEGER NOT NULL DEFAULT 0,
        total_spent INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS credits_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        openid TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('earn', 'spend')),
        amount INTEGER NOT NULL CHECK(amount > 0),
        balance_after INTEGER NOT NULL,
        reason TEXT NOT NULL,
        metadata TEXT,
        created_at INTEGER NOT NULL
      )
    `);
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_ct_openid_created
        ON credits_transactions (openid, created_at DESC)
    `);
  })().catch((error) => {
    tablesReady = null;
    throw error;
  });

  return tablesReady;
}

function transactionStatement(input: {
  openid: string;
  type: "earn" | "spend";
  amount: number;
  reason: CreditsReason;
  metadata?: Record<string, unknown>;
}) {
  return {
    sql: `INSERT INTO credits_transactions
          (openid, type, amount, balance_after, reason, metadata, created_at)
          SELECT ?, ?, ?, balance, ?, ?, ?
          FROM user_credits
          WHERE openid = ? AND changes() = 1`,
    args: [
      input.openid,
      input.type,
      input.amount,
      input.reason,
      input.metadata ? JSON.stringify(input.metadata) : null,
      nowTs(),
      input.openid,
    ],
  };
}

function toCreditsInfo(row: UserCreditsRow | null): CreditsInfo {
  const today = todayStr();
  if (!row) {
    return {
      balance: 0,
      lastCheckinDate: null,
      canCheckinToday: true,
      lastDailyOpenDate: null,
      canClaimDailyOpen: true,
      totalEarned: 0,
      totalSpent: 0,
    };
  }

  return {
    balance: Number(row.balance),
    lastCheckinDate: row.last_checkin_date ?? null,
    canCheckinToday: row.last_checkin_date !== today,
    lastDailyOpenDate: row.last_open_date ?? null,
    canClaimDailyOpen: row.last_open_date !== today,
    totalEarned: Number(row.total_earned),
    totalSpent: Number(row.total_spent),
  };
}

function toTransactionItem(row: CreditsTransactionRow): TransactionItem {
  return {
    id: Number(row.id),
    type: row.type,
    amount: Number(row.amount),
    balanceAfter: Number(row.balance_after),
    reason: row.reason,
    createdAt: Number(row.created_at),
  };
}

/** Initialize an account and grant the one-time new-user reward atomically. */
export async function initNewUser(db: Client, openid: string): Promise<boolean> {
  await ensureCreditsTables(db);
  const now = nowISO();
  const results = await db.batch(
    [
      {
        sql: `INSERT OR IGNORE INTO user_credits
              (openid, balance, total_earned, total_spent, created_at, updated_at)
              VALUES (?, ?, ?, 0, ?, ?)
              RETURNING balance`,
        args: [openid, NEW_USER_BONUS, NEW_USER_BONUS, now, now],
      },
      transactionStatement({
        openid,
        type: "earn",
        amount: NEW_USER_BONUS,
        reason: "new_user",
      }),
    ],
    "write",
  );

  return results[0].rows.length > 0;
}

export async function getCreditsInfo(
  db: Client,
  openid: string,
): Promise<CreditsInfo> {
  await ensureCreditsTables(db);
  const result = await db.execute({
    sql: "SELECT * FROM user_credits WHERE openid = ? LIMIT 1",
    args: [openid],
  });
  return toCreditsInfo(
    result.rows[0]
      ? (result.rows[0] as unknown as UserCreditsRow)
      : null,
  );
}

/**
 * Atomically debit one AI use and append its ledger entry. The conditional
 * UPDATE makes the balance check safe even when multiple requests race.
 */
export async function checkAndDeduct(
  db: Client,
  openid: string,
  feature?: string,
): Promise<CreditsCheckResult> {
  await ensureCreditsTables(db);
  const now = nowISO();
  const results = await db.batch(
    [
      {
        sql: `UPDATE user_credits
              SET balance = balance - ?, total_spent = total_spent + ?, updated_at = ?
              WHERE openid = ? AND balance >= ?
              RETURNING balance`,
        args: [COST_PER_USAGE, COST_PER_USAGE, now, openid, COST_PER_USAGE],
      },
      transactionStatement({
        openid,
        type: "spend",
        amount: COST_PER_USAGE,
        reason: "ai_usage",
        metadata: feature ? { feature } : undefined,
      }),
    ],
    "write",
  );

  const updated = results[0].rows[0] as { balance?: number } | undefined;
  if (updated) return { ok: true, balanceAfter: Number(updated.balance) };

  const balanceResult = await db.execute({
    sql: "SELECT balance FROM user_credits WHERE openid = ? LIMIT 1",
    args: [openid],
  });
  const balance = Number(
    (balanceResult.rows[0] as { balance?: number } | undefined)?.balance ?? 0,
  );
  return {
    ok: false,
    code: "INSUFFICIENT_CREDITS",
    balance,
    needed: Math.max(0, COST_PER_USAGE - balance),
  };
}

/** Atomically add credits and create the matching earning ledger entry. */
export async function addCredits(
  db: Client,
  openid: string,
  amount: number,
  reason: CreditsReason,
  metadata?: Record<string, unknown>,
): Promise<number> {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("积分数量必须为正整数");
  }

  await ensureCreditsTables(db);
  const now = nowISO();
  const results = await db.batch(
    [
      {
        sql: `INSERT OR IGNORE INTO user_credits
              (openid, balance, total_earned, total_spent, created_at, updated_at)
              VALUES (?, 0, 0, 0, ?, ?)`,
        args: [openid, now, now],
      },
      {
        sql: `UPDATE user_credits
              SET balance = balance + ?, total_earned = total_earned + ?, updated_at = ?
              WHERE openid = ?
              RETURNING balance`,
        args: [amount, amount, now, openid],
      },
      transactionStatement({ openid, type: "earn", amount, reason, metadata }),
    ],
    "write",
  );

  return Number((results[1].rows[0] as unknown as { balance: number }).balance);
}

/** Refund a previously charged AI request when an upstream operation fails. */
export async function refundUsage(
  db: Client,
  openid: string,
  feature?: string,
): Promise<number> {
  return addCredits(db, openid, COST_PER_USAGE, "ai_refund", feature ? { feature } : undefined);
}

async function rewardOnce(
  db: Client,
  openid: string,
  amount: number,
  reason: CreditsReason,
  dateColumn: "last_checkin_date" | "last_open_date",
) {
  await ensureCreditsTables(db);
  const today = todayStr();
  const now = nowISO();
  const results = await db.batch(
    [
      {
        sql: `INSERT OR IGNORE INTO user_credits
              (openid, balance, total_earned, total_spent, created_at, updated_at)
              VALUES (?, 0, 0, 0, ?, ?)`,
        args: [openid, now, now],
      },
      {
        sql: `UPDATE user_credits
              SET balance = balance + ?, total_earned = total_earned + ?, ${dateColumn} = ?, updated_at = ?
              WHERE openid = ? AND (${dateColumn} IS NULL OR ${dateColumn} <> ?)
              RETURNING balance`,
        args: [amount, amount, today, now, openid, today],
      },
      transactionStatement({ openid, type: "earn", amount, reason }),
    ],
    "write",
  );

  const row = results[1].rows[0] as { balance?: number } | undefined;
  return row ? Number(row.balance) : null;
}

export async function dailyCheckin(
  db: Client,
  openid: string,
): Promise<CheckinResult> {
  const balanceAfter = await rewardOnce(
    db,
    openid,
    CHECKIN_REWARD,
    "checkin",
    "last_checkin_date",
  );
  return balanceAfter === null
    ? { ok: false, reason: "already_checked_in" }
    : { ok: true, reward: CHECKIN_REWARD, balanceAfter };
}

export async function dailyOpenBonus(
  db: Client,
  openid: string,
): Promise<DailyOpenResult> {
  const balanceAfter = await rewardOnce(
    db,
    openid,
    DAILY_OPEN_BONUS,
    "daily_open",
    "last_open_date",
  );
  return balanceAfter === null
    ? { ok: false, reason: "already_claimed" }
    : { ok: true, reward: DAILY_OPEN_BONUS, balanceAfter };
}

export async function getTransactionHistory(
  db: Client,
  openid: string,
  limit = 50,
  offset = 0,
): Promise<TransactionItem[]> {
  await ensureCreditsTables(db);
  const result = await db.execute({
    sql: `SELECT * FROM credits_transactions
          WHERE openid = ?
          ORDER BY created_at DESC
          LIMIT ? OFFSET ?`,
    args: [openid, Math.max(1, Math.min(100, limit)), Math.max(0, offset)],
  });
  return (result.rows as unknown as CreditsTransactionRow[]).map(toTransactionItem);
}

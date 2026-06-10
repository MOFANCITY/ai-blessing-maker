/**
 * 积分（Credits）业务逻辑层
 *
 * 职责：组合数据库操作，实现完整的积分业务规则。
 * 设计原则：
 *   - 接收 db client 作为参数（依赖注入），不直接引用全局 db
 *   - 不处理 HTTP 请求/响应，保持纯业务逻辑
 *   - 每个方法职责单一，便于单元测试
 *
 * 测试策略：
 *   - 传入 mock db client 即可测试各业务规则
 *   - 无需模拟 HTTP 层
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

// ============================================================
// 内部工具
// ============================================================

const todayStr = (): string => new Date().toISOString().slice(0, 10);
const nowISO = (): string => new Date().toISOString();
const nowTs = (): number => Date.now();

// ============================================================
// 数据库层
// ============================================================

let _tablesReady: Promise<void> | null = null;

async function ensureTables(db: Client): Promise<void> {
  if (_tablesReady) return _tablesReady;
  _tablesReady = (async () => {
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
  })();
  return _tablesReady;
}

async function insertTransaction(
  db: Client,
  tx: {
    openid: string;
    type: "earn" | "spend";
    amount: number;
    balanceAfter: number;
    reason: CreditsReason;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await db.execute({
    sql: `INSERT INTO credits_transactions
          (openid, type, amount, balance_after, reason, metadata, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      tx.openid,
      tx.type,
      tx.amount,
      tx.balanceAfter,
      tx.reason,
      tx.metadata ? JSON.stringify(tx.metadata) : null,
      nowTs(),
    ],
  });
}

// ============================================================
// 查询接口
// ============================================================

/**
 * 将原始数据库行转为 CreditsInfo 对象
 */
function toCreditsInfo(row: UserCreditsRow | null): CreditsInfo {
  const td = todayStr();
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
    canCheckinToday: row.last_checkin_date !== td,
    lastDailyOpenDate: row.last_open_date ?? null,
    canClaimDailyOpen: row.last_open_date !== td,
    totalEarned: Number(row.total_earned),
    totalSpent: Number(row.total_spent),
  };
}

/**
 * 将数据库行转为 API 返回格式
 */
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

// ============================================================
// 公开业务接口
// ============================================================

/**
 * 初始化新用户的积分记录（幂等）
 * @returns true 表示首次初始化（新用户），false 表示已存在
 */
export async function initNewUser(
  db: Client,
  openid: string,
): Promise<boolean> {
  await ensureTables(db);
  const iso = nowISO();
  const result = await db.execute({
    sql: `INSERT INTO user_credits (openid, balance, total_earned, total_spent, created_at, updated_at)
          VALUES (?, 0, 0, 0, ?, ?)`,
    args: [openid, iso, iso],
  });
  if (result.rowsAffected === 0) return false;
  // 赠送新用户积分
  await addCredits(db, openid, NEW_USER_BONUS, "new_user");
  return true;
}

/**
 * 获取用户积分概览
 */
export async function getCreditsInfo(
  db: Client,
  openid: string,
): Promise<CreditsInfo> {
  await ensureTables(db);
  const row = await db.execute({
    sql: "SELECT * FROM user_credits WHERE openid = ? LIMIT 1",
    args: [openid],
  });
  return toCreditsInfo(
    row.rows[0] ? (row.rows[0] as unknown as UserCreditsRow) : null,
  );
}

/**
 * 检查并扣除积分（每次 AI 调用前执行）
 *
 * 规则：
 *   1. 直接检查余额是否足够
 *   2. 余额不足时返回失败
 */
export async function checkAndDeduct(
  db: Client,
  openid: string,
  feature?: string,
): Promise<CreditsCheckResult> {
  await ensureTables(db);

  const row = await db.execute({
    sql: "SELECT * FROM user_credits WHERE openid = ? LIMIT 1",
    args: [openid],
  });

  if (!row.rows[0]) {
    return {
      ok: false,
      code: "INSUFFICIENT_CREDITS",
      balance: 0,
      needed: COST_PER_USAGE,
    };
  }

  const r = row.rows[0] as unknown as UserCreditsRow;
  const balance = Number(r.balance);

  if (balance < COST_PER_USAGE) {
    return {
      ok: false,
      code: "INSUFFICIENT_CREDITS",
      balance,
      needed: COST_PER_USAGE - balance,
    };
  }

  // 扣减积分
  const newBalance = balance - COST_PER_USAGE;
  await db.execute({
    sql: `UPDATE user_credits
          SET balance = ?, total_spent = total_spent + ?, updated_at = ?
          WHERE openid = ?`,
    args: [newBalance, COST_PER_USAGE, nowISO(), openid],
  });
  await insertTransaction(db, {
    openid,
    type: "spend",
    amount: COST_PER_USAGE,
    balanceAfter: newBalance,
    reason: "ai_usage",
    metadata: feature ? { feature } : undefined,
  });

  return { ok: true, balanceAfter: newBalance };
}

/**
 * 为用户增加积分
 */
export async function addCredits(
  db: Client,
  openid: string,
  amount: number,
  reason: CreditsReason,
  metadata?: Record<string, unknown>,
): Promise<number /* new balance */> {
  await ensureTables(db);

  const row = await db.execute({
    sql: "SELECT balance FROM user_credits WHERE openid = ? LIMIT 1",
    args: [openid],
  });

  if (!row.rows[0]) {
    const iso = nowISO();
    await db.execute({
      sql: `INSERT INTO user_credits (openid, balance, total_earned, total_spent, created_at, updated_at)
            VALUES (?, 0, 0, 0, ?, ?)`,
      args: [openid, iso, iso],
    });
  }

  const currentBalance = row.rows[0]
    ? Number((row.rows[0] as unknown as { balance: number }).balance)
    : 0;
  const newBalance = currentBalance + amount;

  await db.execute({
    sql: `UPDATE user_credits
          SET balance = ?, total_earned = total_earned + ?, updated_at = ?
          WHERE openid = ?`,
    args: [newBalance, amount, nowISO(), openid],
  });
  await insertTransaction(db, {
    openid,
    type: "earn",
    amount,
    balanceAfter: newBalance,
    reason,
    metadata,
  });

  return newBalance;
}

/**
 * 每日签到
 */
export async function dailyCheckin(
  db: Client,
  openid: string,
): Promise<CheckinResult> {
  await ensureTables(db);

  const row = await db.execute({
    sql: "SELECT last_checkin_date FROM user_credits WHERE openid = ? LIMIT 1",
    args: [openid],
  });

  const td = todayStr();
  if (
    row.rows[0] &&
    (row.rows[0] as unknown as UserCreditsRow).last_checkin_date === td
  ) {
    return { ok: false, reason: "already_checked_in" };
  }

  const newBalance = await addCredits(db, openid, CHECKIN_REWARD, "checkin");

  await db.execute({
    sql: "UPDATE user_credits SET last_checkin_date = ?, updated_at = ? WHERE openid = ?",
    args: [td, nowISO(), openid],
  });

  return { ok: true, reward: CHECKIN_REWARD, balanceAfter: newBalance };
}

/**
 * 每日打开小程序奖励（每人每天 1 次）
 */
export async function dailyOpenBonus(
  db: Client,
  openid: string,
): Promise<DailyOpenResult> {
  await ensureTables(db);

  const row = await db.execute({
    sql: "SELECT last_open_date FROM user_credits WHERE openid = ? LIMIT 1",
    args: [openid],
  });

  const td = todayStr();
  if (
    row.rows[0] &&
    (row.rows[0] as unknown as UserCreditsRow).last_open_date === td
  ) {
    return { ok: false, reason: "already_claimed" };
  }

  const newBalance = await addCredits(
    db,
    openid,
    DAILY_OPEN_BONUS,
    "daily_open",
  );

  await db.execute({
    sql: "UPDATE user_credits SET last_open_date = ?, updated_at = ? WHERE openid = ?",
    args: [td, nowISO(), openid],
  });

  return { ok: true, reward: DAILY_OPEN_BONUS, balanceAfter: newBalance };
}

/**
 * 获取积分交易流水
 */
export async function getTransactionHistory(
  db: Client,
  openid: string,
  limit = 50,
  offset = 0,
): Promise<TransactionItem[]> {
  await ensureTables(db);
  const result = await db.execute({
    sql: `SELECT * FROM credits_transactions
          WHERE openid = ?
          ORDER BY created_at DESC
          LIMIT ? OFFSET ?`,
    args: [openid, Math.max(1, Math.min(100, limit)), Math.max(0, offset)],
  });
  return (result.rows as unknown as CreditsTransactionRow[]).map(
    toTransactionItem,
  );
}

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
  DAILY_FREE_LIMIT,
  COST_PER_USAGE,
  CHECKIN_REWARD,
  SHARE_REWARD,
  DAILY_SHARE_LIMIT,
  NEW_USER_BONUS,
} from "./config";
import type {
  CreditsCheckResult,
  CreditsInfo,
  CheckinResult,
  ShareRewardResult,
  UserCreditsRow,
  CreditsReason,
} from "./types";

// ============================================================
// 内部工具
// ============================================================

const todayStr = (): string => new Date().toISOString().slice(0, 10);
const nowISO = (): string => new Date().toISOString();
const nowTs = (): number => Date.now();

// ============================================================
// 数据库层 —— 内聚在此，不单独抽取文件以保持简洁
// 如果未来需要复杂迁移，可独立为 db.ts
// ============================================================

function sqlQuote(val: unknown): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "number") return String(val);
  return `'${String(val).replace(/'/g, "''")}'`;
}

let _tablesReady: Promise<void> | null = null;

async function ensureTables(db: Client): Promise<void> {
  if (_tablesReady) return _tablesReady;
  _tablesReady = (async () => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS user_credits (
        openid TEXT PRIMARY KEY,
        balance INTEGER NOT NULL DEFAULT 0,
        daily_free_used INTEGER NOT NULL DEFAULT 0,
        daily_share_count INTEGER NOT NULL DEFAULT 0,
        last_free_reset_date TEXT,
        last_share_reset_date TEXT,
        last_checkin_date TEXT,
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

/**
 * 将原始数据库行转为 CreditsInfo 对象
 * 自动处理跨日重置
 */
function toCreditsInfo(row: UserCreditsRow | null): CreditsInfo {
  const td = todayStr();
  if (!row) {
    return {
      balance: 0,
      dailyFreeUsed: 0,
      dailyFreeLimit: DAILY_FREE_LIMIT,
      dailyShareCount: 0,
      dailyShareLimit: DAILY_SHARE_LIMIT,
      lastCheckinDate: null,
      canCheckinToday: true,
      totalEarned: 0,
      totalSpent: 0,
    };
  }
  const sameDay = (stored: string | null) => stored === td;
  return {
    balance: Number(row.balance),
    dailyFreeUsed: sameDay(row.last_free_reset_date)
      ? Number(row.daily_free_used)
      : 0,
    dailyFreeLimit: DAILY_FREE_LIMIT,
    dailyShareCount: sameDay(row.last_share_reset_date)
      ? Number(row.daily_share_count)
      : 0,
    dailyShareLimit: DAILY_SHARE_LIMIT,
    lastCheckinDate: row.last_checkin_date ?? null,
    canCheckinToday: row.last_checkin_date !== td,
    totalEarned: Number(row.total_earned),
    totalSpent: Number(row.total_spent),
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
  const td = todayStr();
  const iso = nowISO();
  const result = await db.execute({
    sql: `INSERT INTO user_credits (openid, balance, daily_free_used, daily_share_count,
           last_free_reset_date, last_share_reset_date,
           total_earned, total_spent, created_at, updated_at)
          VALUES (?, 0, 0, 0, ?, ?, 0, 0, ?, ?)`,
    args: [openid, td, td, iso, iso],
  });
  // INSERT OR IGNORE 语义：如果已存在则忽略
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
 *   1. 先消耗每日免费额度（前 N 次免费）
 *   2. 免费额度用尽后消耗积分余额
 *   3. 积分不足时返回失败
 */
export async function checkAndDeduct(
  db: Client,
  openid: string,
  feature?: string,
): Promise<CreditsCheckResult> {
  await ensureTables(db);

  const td = todayStr();
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
  const isSameDay = r.last_free_reset_date === td;
  let dailyFreeUsed = isSameDay ? Number(r.daily_free_used) : 0;

  // ── 优先使用免费额度 ──
  if (dailyFreeUsed < DAILY_FREE_LIMIT) {
    dailyFreeUsed++;
    await db.execute({
      sql: `UPDATE user_credits
            SET daily_free_used = ?, last_free_reset_date = ?, updated_at = ?
            WHERE openid = ?`,
      args: [dailyFreeUsed, td, nowISO(), openid],
    });
    return { ok: true, usedFree: true, balanceAfter: balance };
  }

  // ── 免费额度用完，检查积分余额 ──
  if (balance < COST_PER_USAGE) {
    return {
      ok: false,
      code: "INSUFFICIENT_CREDITS",
      balance,
      needed: COST_PER_USAGE - balance,
    };
  }

  // ── 扣减积分 ──
  const newBalance = balance - COST_PER_USAGE;
  await db.execute({
    sql: `UPDATE user_credits
          SET balance = ?, total_spent = total_spent + ?,
              last_free_reset_date = ?, updated_at = ?
          WHERE openid = ?`,
    args: [newBalance, COST_PER_USAGE, td, nowISO(), openid],
  });
  await insertTransaction(db, {
    openid,
    type: "spend",
    amount: COST_PER_USAGE,
    balanceAfter: newBalance,
    reason: "ai_usage",
    metadata: feature ? { feature } : undefined,
  });

  return { ok: true, usedFree: false, balanceAfter: newBalance };
}

/**
 * 为用户增加积分（签到/分享奖励/管理员调整）
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
    // 如果用户还没有积分记录，先初始化
    const td = todayStr();
    const iso = nowISO();
    await db.execute({
      sql: `INSERT INTO user_credits (openid, balance, daily_free_used, daily_share_count,
             last_free_reset_date, last_share_reset_date,
             total_earned, total_spent, created_at, updated_at)
            VALUES (?, 0, 0, 0, ?, ?, 0, 0, ?, ?)`,
      args: [openid, td, td, iso, iso],
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
    reason: reason as CreditsReason,
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
 * 分享奖励（每日有次数上限）
 */
export async function shareReward(
  db: Client,
  openid: string,
): Promise<ShareRewardResult> {
  await ensureTables(db);

  const td = todayStr();
  const row = await db.execute({
    sql: "SELECT * FROM user_credits WHERE openid = ? LIMIT 1",
    args: [openid],
  });

  if (!row.rows[0]) {
    return { ok: false, reason: "daily_limit_reached" };
  }

  const r = row.rows[0] as unknown as UserCreditsRow;
  const isSameDay = r.last_share_reset_date === td;
  const shareCount = isSameDay ? Number(r.daily_share_count) : 0;

  if (shareCount >= DAILY_SHARE_LIMIT) {
    return { ok: false, reason: "daily_limit_reached" };
  }

  const newShareCount = shareCount + 1;

  await db.execute({
    sql: `UPDATE user_credits
          SET daily_share_count = ?, last_share_reset_date = ?, updated_at = ?
          WHERE openid = ?`,
    args: [newShareCount, td, nowISO(), openid],
  });

  const newBalance = await addCredits(db, openid, SHARE_REWARD, "share");

  return {
    ok: true,
    reward: SHARE_REWARD,
    balanceAfter: newBalance,
    dailyRemaining: DAILY_SHARE_LIMIT - newShareCount,
  };
}

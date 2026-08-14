/**
 * 积分（Credits）系统类型定义
 *
 * 所有公开类型集中在此文件，方便各模块引用。
 */

/** 积分检查与扣减结果 */
export type CreditsCheckResult =
  | { ok: true; balanceAfter: number }
  | {
      ok: false;
      code: "INSUFFICIENT_CREDITS";
      balance: number;
      needed: number;
    };

/** 用户积分概览 */
export interface CreditsInfo {
  balance: number;
  lastCheckinDate: string | null;
  canCheckinToday: boolean;
  lastDailyOpenDate: string | null;
  canClaimDailyOpen: boolean;
  totalEarned: number;
  totalSpent: number;
}

/** 签到结果 */
export type CheckinResult =
  | { ok: true; reward: number; balanceAfter: number }
  | { ok: false; reason: "already_checked_in" };

/** 每日打开奖励结果 */
export type DailyOpenResult =
  | { ok: true; reward: number; balanceAfter: number }
  | { ok: false; reason: "already_claimed" };

/** 积分交易记录（行记录） */
export interface CreditsTransactionRow {
  id: number;
  openid: string;
  type: "earn" | "spend";
  amount: number;
  balance_after: number;
  reason: string;
  metadata: string | null;
  created_at: number;
}

/** 积分交易记录（API 返回格式） */
export interface TransactionItem {
  id: number;
  type: "earn" | "spend";
  amount: number;
  balanceAfter: number;
  reason: string;
  createdAt: number;
}

/** 用户积分记录（数据库行） */
export interface UserCreditsRow {
  openid: string;
  balance: number;
  last_checkin_date: string | null;
  last_open_date: string | null;
  total_earned: number;
  total_spent: number;
  created_at: string;
  updated_at: string;
}

/** 积分交易原因枚举 */
export type CreditsReason =
  | "new_user"
  | "checkin"
  | "daily_open"
  | "ai_usage"
  | "ai_refund"
  | "share"
  | "admin_adjust";

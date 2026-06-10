/**
 * 积分（Credits）系统类型定义
 *
 * 所有公开类型集中在此文件，方便各模块引用。
 */

/** 积分检查与扣减结果 */
export type CreditsCheckResult =
  | { ok: true; usedFree: boolean; balanceAfter: number }
  | { ok: false; code: "INSUFFICIENT_CREDITS"; balance: number; needed: number };

/** 用户积分概览 */
export interface CreditsInfo {
  balance: number;
  dailyFreeUsed: number;
  dailyFreeLimit: number;
  dailyShareCount: number;
  dailyShareLimit: number;
  lastCheckinDate: string | null;
  canCheckinToday: boolean;
  totalEarned: number;
  totalSpent: number;
}

/** 签到结果 */
export type CheckinResult =
  | { ok: true; reward: number; balanceAfter: number }
  | { ok: false; reason: "already_checked_in" };

/** 分享奖励结果 */
export type ShareRewardResult =
  | { ok: true; reward: number; balanceAfter: number; dailyRemaining: number }
  | { ok: false; reason: "daily_limit_reached" };

/** 积分交易记录（数据库行） */
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

/** 用户积分记录（数据库行） */
export interface UserCreditsRow {
  openid: string;
  balance: number;
  daily_free_used: number;
  daily_share_count: number;
  last_free_reset_date: string | null;
  last_share_reset_date: string | null;
  last_checkin_date: string | null;
  total_earned: number;
  total_spent: number;
  created_at: string;
  updated_at: string;
}

/** 积分交易原因枚举 */
export type CreditsReason =
  | "new_user"
  | "checkin"
  | "share"
  | "ai_usage"
  | "first_use"
  | "admin_adjust";

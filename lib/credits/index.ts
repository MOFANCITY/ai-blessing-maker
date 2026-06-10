/**
 * 积分（Credits）模块 — 统一导出
 *
 * 使用方式：
 *   import { db } from "@/lib/db";
 *   import { checkAndDeduct } from "@/lib/credits";
 *
 *   const result = await checkAndDeduct(db, openid, "blessing");
 */

export {
  initNewUser,
  getCreditsInfo,
  checkAndDeduct,
  addCredits,
  dailyCheckin,
  dailyOpenBonus,
  getTransactionHistory,
} from "./service";

export type {
  CreditsCheckResult,
  CreditsInfo,
  CheckinResult,
  DailyOpenResult,
  TransactionItem,
  CreditsReason,
} from "./types";

export {
  COST_PER_USAGE,
  CHECKIN_REWARD,
  DAILY_OPEN_BONUS,
  NEW_USER_BONUS,
} from "./config";

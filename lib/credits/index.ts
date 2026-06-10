/**
 * 积分（Credits）模块 — 统一导出
 *
 * 使用方式：
 *   import { db } from "@/lib/db";
 *   import { checkAndDeduct } from "@/lib/credits";
 *
 *   const result = await checkAndDeduct(db, openid, "blessing");
 */

export { initNewUser, getCreditsInfo, checkAndDeduct, addCredits, dailyCheckin, shareReward } from "./service";

export type {
  CreditsCheckResult,
  CreditsInfo,
  CheckinResult,
  ShareRewardResult,
  CreditsReason,
} from "./types";

export {
  DAILY_FREE_LIMIT,
  COST_PER_USAGE,
  CHECKIN_REWARD,
  SHARE_REWARD,
  DAILY_SHARE_LIMIT,
  NEW_USER_BONUS,
} from "./config";

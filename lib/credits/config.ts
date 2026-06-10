/**
 * 积分（Credits）系统配置常量
 *
 * 所有可调参数集中在此文件，便于后续调整积分经济模型。
 * 修改此文件无需改动任何业务逻辑代码。
 */

/** 每日免费 AI 调用次数上限（所有功能共享） */
export const DAILY_FREE_LIMIT = 10;

/** 每次 AI 调用消耗的积分 */
export const COST_PER_USAGE = 1;

/** 每次签到奖励的积分 */
export const CHECKIN_REWARD = 3;

/** 每次分享奖励的积分 */
export const SHARE_REWARD = 2;

/** 每日分享奖励上限 */
export const DAILY_SHARE_LIMIT = 3;

/** 新用户注册赠送积分 */
export const NEW_USER_BONUS = 10;

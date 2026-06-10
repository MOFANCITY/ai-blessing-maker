/**
 * 每日打开小程序奖励
 * POST /api/user/credits/daily-open
 *
 * 用户每天首次打开小程序时自动调用，领取 10 积分。
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveAuth, isWeChatRequest } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { dailyOpenBonus, getCreditsInfo } from "@/lib/credits";

export async function POST(req: NextRequest) {
  try {
    if (!isWeChatRequest(req)) {
      return NextResponse.json(
        { error: "此应用仅支持微信小程序访问，请在微信中打开" },
        { status: 403 },
      );
    }

    const auth = resolveAuth(req);
    if (!auth) {
      return NextResponse.json({ error: "用户未登录" }, { status: 401 });
    }

    const result = await dailyOpenBonus(db, auth.openid);

    if (!result.ok) {
      // 已领取过，返回当前余额即可（不是错误）
      const info = await getCreditsInfo(db, auth.openid);
      return NextResponse.json({
        success: true,
        reward: 0,
        balanceAfter: info.balance,
        alreadyClaimed: true,
      });
    }

    return NextResponse.json({
      success: true,
      reward: result.reward,
      balanceAfter: result.balanceAfter,
      alreadyClaimed: false,
    });
  } catch (error) {
    console.error("每日打开奖励失败:", error);
    return NextResponse.json(
      { error: "领取失败，请稍后重试" },
      { status: 500 },
    );
  }
}

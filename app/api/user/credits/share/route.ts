/**
 * 分享奖励
 * POST /api/user/credits/share
 *
 * 用户分享小程序后调用此接口领取积分奖励。
 * 每日分享奖励有次数上限。
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveAuth, isWeChatRequest } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { shareReward } from "@/lib/credits";

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

    const result = await shareReward(db, auth.openid);

    if (!result.ok) {
      return NextResponse.json(
        {
          error: "今日分享奖励已达上限",
          code: "SHARE_LIMIT_REACHED",
          reward: 0,
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      success: true,
      reward: result.reward,
      balanceAfter: result.balanceAfter,
      dailyRemaining: result.dailyRemaining,
    });
  } catch (error) {
    console.error("领取分享奖励失败:", error);
    return NextResponse.json(
      { error: "领取分享奖励失败，请稍后重试" },
      { status: 500 },
    );
  }
}

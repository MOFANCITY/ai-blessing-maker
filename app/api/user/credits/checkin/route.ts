/**
 * 每日签到
 * POST /api/user/credits/checkin
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveAuth, isWeChatRequest } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { dailyCheckin } from "@/lib/credits";

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

    const result = await dailyCheckin(db, auth.openid);

    if (!result.ok) {
      return NextResponse.json(
        { error: "今日已签到", code: "ALREADY_CHECKED_IN", reward: 0 },
        { status: 409 },
      );
    }

    return NextResponse.json({
      success: true,
      reward: result.reward,
      balanceAfter: result.balanceAfter,
    });
  } catch (error) {
    console.error("签到失败:", error);
    return NextResponse.json({ error: "签到失败，请稍后重试" }, { status: 500 });
  }
}

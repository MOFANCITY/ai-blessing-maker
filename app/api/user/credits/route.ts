/**
 * 查询用户积分概览
 * GET /api/user/credits
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveAuth, isWeChatRequest } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { getCreditsInfo } from "@/lib/credits";

export async function GET(req: NextRequest) {
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

    const info = await getCreditsInfo(db, auth.openid);

    return NextResponse.json({ success: true, data: info });
  } catch (error) {
    console.error("获取积分信息失败:", error);
    return NextResponse.json(
      { error: "获取积分信息失败" },
      { status: 500 },
    );
  }
}

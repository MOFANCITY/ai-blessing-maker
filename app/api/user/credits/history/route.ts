/**
 * 查询积分交易流水
 * GET /api/user/credits/history?limit=50&offset=0
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveAuth, isWeChatRequest } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { getTransactionHistory } from "@/lib/credits";

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

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const items = await getTransactionHistory(db, auth.openid, limit, offset);

    return NextResponse.json({ success: true, data: items });
  } catch (error) {
    console.error("获取积分流水失败:", error);
    return NextResponse.json(
      { error: "获取积分流水失败" },
      { status: 500 },
    );
  }
}

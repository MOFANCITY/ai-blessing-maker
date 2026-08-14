import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isWeChatRequest, resolveAuth } from "@/lib/api-auth";
import { rewardCoupletShare, type ShareType } from "@/lib/shares/service";

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

    const body = (await req.json()) as { recordId?: unknown; shareType?: unknown };
    const recordId =
      typeof body.recordId === "number" &&
      Number.isSafeInteger(body.recordId) &&
      body.recordId > 0
        ? body.recordId
        : null;
    const shareType = body.shareType;
    if (!recordId || (shareType !== "friend" && shareType !== "timeline")) {
      return NextResponse.json({ error: "参数无效" }, { status: 400 });
    }

    const reward = await rewardCoupletShare(
      db,
      auth.openid,
      recordId,
      shareType as ShareType,
    );
    if (!reward.ok) {
      return NextResponse.json(
        {
          error:
            reward.code === "NOT_FOUND"
              ? "对联记录不存在"
              : "该对联暂不满足分享条件",
        },
        { status: reward.code === "NOT_FOUND" ? 404 : 400 },
      );
    }

    return NextResponse.json({
      success: true,
      alreadyRewarded: reward.alreadyRewarded,
      pointsAdded: reward.pointsAdded,
      balanceAfter: reward.balanceAfter,
      // Kept temporarily for older clients that display the legacy field.
      totalPoints: reward.balanceAfter,
      message: reward.alreadyRewarded ? "本次分享已奖励" : `+${reward.pointsAdded}积分`,
    });
  } catch (error) {
    console.error("分享记录失败:", error);
    return NextResponse.json({ error: "分享失败，请重试" }, { status: 500 });
  }
}

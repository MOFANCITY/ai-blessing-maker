import { NextRequest, NextResponse } from "next/server";
import { favoriteDb } from "@/lib/db";
import { resolveMiniProgramAuth } from "@/lib/api-auth";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = resolveMiniProgramAuth(req);
    if (!auth) {
      return NextResponse.json({ error: "用户未登录" }, { status: 401 });
    }

    const { id } = await params;
    const favoriteId = parseInt(id, 10);

    if (isNaN(favoriteId)) {
      return NextResponse.json({ error: "无效的收藏 ID" }, { status: 400 });
    }

    const removed = await favoriteDb.removeFavorite(favoriteId, auth.openid);

    if (!removed) {
      return NextResponse.json(
        { error: "收藏不存在或无权删除" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "已取消收藏",
    });
  } catch (error) {
    console.error("取消收藏失败:", error);
    return NextResponse.json({ error: "取消收藏失败" }, { status: 500 });
  }
}

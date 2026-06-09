import { NextRequest, NextResponse } from "next/server";
import { favoriteDb } from "@/lib/db";

function resolveAuth(req: NextRequest): { openid: string } | null {
  const isDevelopment = process.env.NODE_ENV === "development";
  if (isDevelopment) {
    return { openid: "dev_openid_12345" };
  }

  const userAgent = req.headers.get("user-agent") || "";
  if (!userAgent.includes("MicroMessenger")) {
    return null;
  }

  const token =
    req.cookies.get("auth_token")?.value ||
    req.headers.get("Authorization")?.replace("Bearer ", "");

  if (!token) return null;

  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const decoded = JSON.parse(Buffer.from(padded, "base64").toString());
    if (typeof decoded.openid === "string" && decoded.openid.length > 0) {
      return { openid: decoded.openid };
    }
  } catch {
    return null;
  }
  return null;
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = resolveAuth(req);
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

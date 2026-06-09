import { NextRequest, NextResponse } from "next/server";
import { favoriteDb } from "@/lib/db";

const VALID_TYPES = ["blessing", "diss", "couplet", "poem"] as const;

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

export async function GET(req: NextRequest) {
  try {
    const auth = resolveAuth(req);
    if (!auth) {
      return NextResponse.json({ error: "用户未登录" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const contentType = searchParams.get("type") || undefined;
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    if (
      contentType &&
      !VALID_TYPES.includes(contentType as (typeof VALID_TYPES)[number])
    ) {
      return NextResponse.json({ error: "无效的内容类型" }, { status: 400 });
    }

    const favorites = await favoriteDb.getUserFavorites(auth.openid, {
      contentType,
      limit,
      offset,
    });

    const total = await favoriteDb.getUserFavoritesCount(
      auth.openid,
      contentType,
    );

    return NextResponse.json({
      success: true,
      favorites,
      total,
    });
  } catch (error) {
    console.error("获取收藏列表失败:", error);
    return NextResponse.json({ error: "获取收藏列表失败" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = resolveAuth(req);
    if (!auth) {
      return NextResponse.json({ error: "用户未登录" }, { status: 401 });
    }

    const body = await req.json();

    const { content_type, content_id, title, content } = body as {
      content_type?: unknown;
      content_id?: unknown;
      title?: unknown;
      content?: unknown;
    };

    if (
      !content_type ||
      !VALID_TYPES.includes(content_type as (typeof VALID_TYPES)[number])
    ) {
      return NextResponse.json({ error: "无效的内容类型" }, { status: 400 });
    }

    const titleStr = typeof title === "string" ? title.trim() : "";
    if (!titleStr) {
      return NextResponse.json({ error: "标题不能为空" }, { status: 400 });
    }

    const contentStr = typeof content === "string" ? content.trim() : "";
    if (!contentStr) {
      return NextResponse.json({ error: "内容不能为空" }, { status: 400 });
    }

    const favorite = await favoriteDb.addFavorite({
      user_id: auth.openid,
      content_type: content_type as (typeof VALID_TYPES)[number],
      content_id: typeof content_id === "string" ? content_id : null,
      title: titleStr,
      content: contentStr,
    });

    return NextResponse.json({
      success: true,
      favorite,
    });
  } catch (error) {
    console.error("添加收藏失败:", error);
    return NextResponse.json({ error: "添加收藏失败" }, { status: 500 });
  }
}

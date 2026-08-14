import { NextRequest, NextResponse } from "next/server";
import { db, favoriteDb } from "@/lib/db";
import { getOwnedContentRecord } from "@/lib/content/service";
import { resolveMiniProgramAuth } from "@/lib/api-auth";

const VALID_TYPES = [
  "blessing",
  "diss",
  "couplet",
  "poem",
  "moments",
  "speech",
  "comic",
  "novel",
  "lyrics",
] as const;

export async function GET(req: NextRequest) {
  try {
    const auth = resolveMiniProgramAuth(req);
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
    const auth = resolveMiniProgramAuth(req);
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

    const contentId = typeof content_id === "string" ? content_id.trim() : "";
    const newTool = ["moments", "speech", "comic", "novel", "lyrics"];
    if (newTool.includes(content_type as string)) {
      const contentRecordId = Number(contentId);
      if (!Number.isSafeInteger(contentRecordId) || contentRecordId <= 0) {
        return NextResponse.json({ error: "请提供要收藏的作品记录" }, { status: 400 });
      }
      const record = await getOwnedContentRecord(db, auth.openid, contentRecordId);
      if (!record || record.tool_key !== content_type) {
        return NextResponse.json({ error: "作品不存在或无权收藏" }, { status: 404 });
      }
    }

    if (contentId && (await favoriteDb.isFavorited(auth.openid, content_type as string, contentId))) {
      return NextResponse.json({ success: true, alreadyFavorited: true, favorite: null });
    }

    const favorite = await favoriteDb.addFavorite({
      user_id: auth.openid,
      content_type: content_type as (typeof VALID_TYPES)[number],
      content_id: contentId || null,
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

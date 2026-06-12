import { NextRequest, NextResponse } from "next/server";
import { feedbackDb } from "@/lib/db";
import { resolveAuth, isWeChatRequest } from "@/lib/api-auth";

export async function POST(req: NextRequest) {
  try {
    if (!isWeChatRequest(req)) {
      return NextResponse.json(
        { error: "此应用仅支持微信小程序访问" },
        { status: 403 },
      );
    }

    const auth = resolveAuth(req);
    if (!auth) {
      return NextResponse.json({ error: "用户未登录" }, { status: 401 });
    }

    const body = await req.json();
    const { content_type, record_id } = body as {
      content_type?: unknown;
      record_id?: unknown;
    };

    if (
      typeof content_type !== "string" ||
      !["blessing", "diss"].includes(content_type)
    ) {
      return NextResponse.json({ error: "无效的内容类型" }, { status: 400 });
    }
    if (typeof record_id !== "number" || record_id <= 0) {
      return NextResponse.json({ error: "无效的记录 ID" }, { status: 400 });
    }

    const feedback = await feedbackDb.addFeedback({
      user_id: auth.openid,
      content_type,
      record_id,
    });

    return NextResponse.json({ success: true, feedback });
  } catch (error) {
    console.error("提交反馈失败:", error);
    return NextResponse.json({ error: "提交反馈失败" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    if (!isWeChatRequest(req)) {
      return NextResponse.json(
        { error: "此应用仅支持微信小程序访问" },
        { status: 403 },
      );
    }

    const auth = resolveAuth(req);
    if (!auth) {
      return NextResponse.json({ error: "用户未登录" }, { status: 401 });
    }

    const body = await req.json();
    const { content_type, record_id } = body as {
      content_type?: unknown;
      record_id?: unknown;
    };

    if (
      typeof content_type !== "string" ||
      !["blessing", "diss"].includes(content_type)
    ) {
      return NextResponse.json({ error: "无效的内容类型" }, { status: 400 });
    }
    if (typeof record_id !== "number" || record_id <= 0) {
      return NextResponse.json({ error: "无效的记录 ID" }, { status: 400 });
    }

    await feedbackDb.removeFeedback({
      user_id: auth.openid,
      content_type,
      record_id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("取消反馈失败:", error);
    return NextResponse.json({ error: "取消反馈失败" }, { status: 500 });
  }
}

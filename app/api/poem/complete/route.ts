import { NextRequest, NextResponse } from "next/server";
import { poemDb } from "@/lib/db";
import { isWeChatRequest, resolveAuth } from "@/lib/api-auth";

interface CompletePoemRequest {
  recordId?: unknown;
  userLines?: unknown;
}

function parseUserLines(value: unknown, expectedLength: number): string[] | null {
  if (!Array.isArray(value) || value.length !== 2) return null;

  const lines = value.map((line) => (typeof line === "string" ? line.trim() : ""));
  if (
    lines.some((line) => {
      const characters = Array.from(line);
      return (
        characters.length !== expectedLength ||
        characters.some((character) => !/[\u4e00-\u9fff]/.test(character))
      );
    })
  ) {
    return null;
  }
  return lines;
}

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

    const body = (await req.json()) as CompletePoemRequest;
    const recordId =
      typeof body.recordId === "number" &&
      Number.isSafeInteger(body.recordId) &&
      body.recordId > 0
        ? body.recordId
        : null;
    if (!recordId) {
      return NextResponse.json({ error: "古诗记录不存在" }, { status: 400 });
    }

    // The authoritative type/theme/AI lines live in the draft. Clients only
    // submit their own two lines, so forged AI content cannot be persisted.
    const draft = await poemDb.getPoemRecord(recordId, auth.openid);
    if (!draft) {
      return NextResponse.json({ error: "古诗记录不存在或已完成" }, { status: 404 });
    }

    const type = draft.type === "poem7" ? "poem7" : "poem5";
    const userLines = parseUserLines(body.userLines, type === "poem7" ? 7 : 5);
    if (!userLines) {
      return NextResponse.json(
        { error: `请填写两句各${type === "poem7" ? 7 : 5}个汉字的续写` },
        { status: 400 },
      );
    }

    const aiLines = String(draft.ai_lines)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (aiLines.length !== 2) {
      return NextResponse.json({ error: "古诗草稿数据异常，请重新生成" }, { status: 409 });
    }

    const result = [...aiLines, ...userLines].join("\n");
    const record = await poemDb.updatePoemUserLines(
      recordId,
      auth.openid,
      userLines,
      result,
    );
    if (!record) {
      return NextResponse.json({ error: "古诗记录不存在或已完成" }, { status: 409 });
    }

    return NextResponse.json({
      success: true,
      recordId,
      type,
      theme: String(draft.theme),
      lines: [...aiLines, ...userLines],
    });
  } catch (error) {
    console.error("提交古诗合作失败:", error);
    return NextResponse.json({ error: "提交失败，请重试" }, { status: 500 });
  }
}

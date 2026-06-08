import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { poemDb } from "@/lib/db";

interface CompletePoemRequest {
  type?: unknown;
  theme?: unknown;
  aiLines?: unknown;
  userLines?: unknown;
}

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

export async function POST(req: NextRequest) {
  try {
    const isDevelopment = process.env.NODE_ENV === "development";
    if (!isDevelopment) {
      const userAgent = req.headers.get("user-agent") || "";
      if (!userAgent.includes("MicroMessenger")) {
        return NextResponse.json(
          { error: "此应用仅支持微信小程序访问，请在微信中打开" },
          { status: 403 },
        );
      }
    }

    const auth = resolveAuth(req);
    if (!auth) {
      return NextResponse.json({ error: "用户未登录" }, { status: 401 });
    }

    const body = (await req.json()) as CompletePoemRequest;

    const type = body.type;
    if (type !== "poem5" && type !== "poem7") {
      return NextResponse.json({ error: "古诗类型不正确" }, { status: 400 });
    }

    const theme = typeof body.theme === "string" ? body.theme.trim() : "";
    if (!theme) {
      return NextResponse.json({ error: "古诗主题不能为空" }, { status: 400 });
    }

    if (!Array.isArray(body.aiLines) || body.aiLines.length < 2) {
      return NextResponse.json(
        { error: "AI 创作的诗句不完整" },
        { status: 400 },
      );
    }

    if (!Array.isArray(body.userLines) || body.userLines.length < 2) {
      return NextResponse.json(
        { error: "您续写的诗句不完整" },
        { status: 400 },
      );
    }

    const aiLines = [body.aiLines[0], body.aiLines[1]]
      .filter(Boolean)
      .join("\n");
    const userLines = [body.userLines[0], body.userLines[1]]
      .filter(Boolean)
      .join("\n");
    const result = [
      body.aiLines[0],
      body.aiLines[1],
      body.userLines[0],
      body.userLines[1],
    ]
      .filter(Boolean)
      .join("\n");

    try {
      await poemDb.insertPoemRecord({
        user_id: auth.openid,
        type,
        theme,
        gameMode: true,
        extras: null,
        aiLines,
        userLines,
        result,
      });
    } catch (dbError) {
      console.error("插入古诗完成记录失败:", dbError);
    }

    return NextResponse.json({
      success: true,
      type,
      theme,
    });
  } catch (error) {
    console.error("提交古诗合作失败:", error);

    let errorMessage = "提交失败，请重试";
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 429) {
        errorMessage = "请求太频繁，请稍后再试";
      } else if (
        error.response?.status === 401 ||
        error.response?.status === 403
      ) {
        errorMessage = "服务暂时不可用";
      }
    } else if (error instanceof Error && error.message.includes("429")) {
      errorMessage = "请求太频繁，请稍后再试";
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

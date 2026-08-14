import { NextRequest, NextResponse } from "next/server";
import { isWeChatRequest, resolveAuth } from "@/lib/api-auth";
import { getEnabledTools } from "@/lib/capabilities/registry";

function scoreTool(query: string, keywords: readonly string[]) {
  return keywords.reduce((score, keyword) => score + (query.includes(keyword) ? keyword.length : 0), 0);
}

export async function POST(req: NextRequest) {
  try {
    if (!isWeChatRequest(req)) {
      return NextResponse.json({ error: "此应用仅支持微信小程序访问，请在微信中打开" }, { status: 403 });
    }
    if (!resolveAuth(req)) {
      return NextResponse.json({ error: "用户未登录" }, { status: 401 });
    }

    const body = (await req.json()) as { query?: unknown };
    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!query || query.length > 200) {
      return NextResponse.json({ error: "请输入不超过200字的创作意图" }, { status: 400 });
    }

    const ranked = getEnabledTools()
      .map((tool) => ({ tool, score: scoreTool(query, tool.intentKeywords) }))
      .sort((left, right) => right.score - left.score || left.tool.name.localeCompare(right.tool.name));
    const bestScore = ranked[0]?.score ?? 0;
    const recommendations = (bestScore > 0 ? ranked.filter((item) => item.score > 0) : ranked)
      .slice(0, 3)
      .map(({ tool, score }) => ({
        tool: tool.key,
        name: tool.name,
        confidence: bestScore > 0 ? Math.max(0.35, Math.min(0.98, score / bestScore)) : 0.2,
        reason: score > 0 ? `匹配到“${tool.intentKeywords.find((keyword) => query.includes(keyword))}”` : "可根据你的描述开始创作",
        prefill: { topic: query, theme: query },
      }));

    return NextResponse.json({ success: true, recommendations });
  } catch (error) {
    console.error("意图推荐失败:", error);
    return NextResponse.json({ error: "意图推荐失败，请重试" }, { status: 500 });
  }
}

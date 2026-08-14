import { NextRequest, NextResponse } from "next/server";
import { isWeChatRequest } from "@/lib/api-auth";
import { getUIConfig } from "@/lib/config/ui-config";
import { getEnabledTools } from "@/lib/capabilities/registry";

/** Exposes the enabled capability registry while retaining the v1 config shape. */
export async function GET(req: NextRequest) {
  try {
    if (!isWeChatRequest(req)) {
      return NextResponse.json(
        { error: "此应用仅支持微信小程序访问，请在微信中打开" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(req.url);
    const config = getUIConfig(searchParams.get("version") ?? undefined);
    return NextResponse.json({
      success: true,
      data: {
        ...config,
        platform: searchParams.get("platform") || "wechat",
        tools: getEnabledTools().map((tool) => ({
          key: tool.key,
          name: tool.name,
          description: tool.description,
          creditCost: tool.creditCost,
          favoriteEnabled: tool.favoriteEnabled,
          shareEnabled: tool.shareEnabled,
          inputFields: tool.inputFields,
        })),
      },
    });
  } catch (error) {
    console.error("获取配置失败:", error);
    return NextResponse.json({ success: false, error: "获取配置失败，请重试" }, { status: 500 });
  }
}

// Next.js API 路由相关导入
import { NextRequest, NextResponse } from "next/server";
// UI配置相关
import { getUIConfig } from "@/lib/config/ui-config";

/**
 * 配置查询参数接口
 */
interface ConfigQueryParams {
  version?: string;    // 配置版本（可选）
  platform?: string;   // 平台标识（可选，如 wechat, web等）
}

/**
 * 获取配置 API 路由处理函数
 * 处理 GET 请求，返回小程序端的UI配置信息
 * 该接口主要用于小程序初始化时获取展示配置
 * @param req - Next.js 请求对象
 * @returns JSON 响应，包含UI配置数据
 */
export async function GET(req: NextRequest) {
  try {
    // 检查是否为微信小程序访问
    const userAgent = req.headers.get('user-agent') || '';
    if (!userAgent.includes('MicroMessenger')) {
      return NextResponse.json(
        { error: "此应用仅支持微信小程序访问，请在微信中打开" },
        { status: 403 }
      );
    }

    // 解析查询参数
    const { searchParams } = new URL(req.url);
    const version = searchParams.get('version') || undefined;
    const platform = searchParams.get('platform') || 'wechat';

    // 获取UI配置
    const config = getUIConfig(version);

    // 添加平台特定的配置调整（如果需要）
    // 这里可以根据不同平台返回不同的配置
    const platformConfig = {
      ...config,
      platform,
    };

    // 返回配置数据
    return NextResponse.json({
      success: true,
      data: platformConfig,
    });

  } catch (error) {
    // 记录错误信息用于调试
    console.error("获取配置失败:", error);

    // 返回错误响应
    return NextResponse.json({
      success: false,
      error: "获取配置失败，请重试"
    }, { status: 500 });
  }
}
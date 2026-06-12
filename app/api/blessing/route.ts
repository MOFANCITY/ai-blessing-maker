// Next.js API 路由相关导入
import { NextRequest, NextResponse } from "next/server";
// HTTP 请求库，用于错误处理
import axios from "axios";
// AI 服务函数，用于调用外部 AI API
import { generateBlessing } from "@/lib/ai-service";
// 提示词模板生成器
import { createBlessingPrompt } from "@/lib/prompt-templates";
// 输入验证和清理函数
import { validateInput, cleanText } from "@/lib/validation";
// 数据库客户端
import { db, historyDb } from "@/lib/db";
// 认证与积分
import { resolveAuth, isWeChatRequest } from "@/lib/api-auth";
import { checkAndDeduct } from "@/lib/credits";

/**
 * API 请求体接口
 * 定义了前端发送的祝福语生成请求的数据结构
 */
interface BlessingRequest {
  occasion?: string; // 场合类型（经典模式）
  festival?: string; // 节日类型（经典模式）
  targetPerson?: string; // 目标人群（经典模式）
  style?: string; // 祝福语风格（可选）
  customDescription?: string; // 自定义描述（智能模式）
  useSmartMode?: boolean; // 是否使用智能模式
  timestamp?: number; // 时间戳（可选）
  version?: string; // 版本号（可选）
  userProfile?: "elderly" | "standard" | "young"; // 用户群配置
}

/**
 * 祝福语生成 API 路由处理函数
 * 处理 POST 请求，接收用户参数并调用 AI 服务生成祝福语
 * 支持两种模式：经典模板模式和智能描述模式
 * @param req - Next.js 请求对象，包含用户发送的数据
 * @returns JSON 响应，包含生成的祝福语或错误信息
 */
export async function POST(req: NextRequest) {
  try {
    // 检查是否为微信小程序访问
    if (!isWeChatRequest(req)) {
      return NextResponse.json(
        { error: "此应用仅支持微信小程序访问，请在微信中打开" },
        { status: 403 },
      );
    }

    // 解析认证信息
    const auth = resolveAuth(req);
    if (!auth) {
      return NextResponse.json({ error: "用户未登录" }, { status: 401 });
    }

    // 解析请求体中的 JSON 数据
    const body: BlessingRequest = await req.json();

    // 基础验证
    const validation = validateInput(body);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // 清理输入
    if (body.customDescription) {
      body.customDescription = cleanText(body.customDescription);
    }

    // ── 积分检查 ──
    const creditsCheck = await checkAndDeduct(db, auth.openid, "blessing");
    if (!creditsCheck.ok) {
      return NextResponse.json(
        {
          error: "当日免费次数已用尽，积分不足",
          code: "INSUFFICIENT_CREDITS",
          balance: creditsCheck.balance,
          needed: creditsCheck.needed,
        },
        { status: 403 },
      );
    }

    // 根据请求参数生成相应的 AI 提示词
    const prompt = createBlessingPrompt(body);

    // 调用 AI 服务生成祝福语
    const blessing = await generateBlessing(prompt);

    // 获取用户信息（查找数据库中的 user id 用于记录历史）
    const userResult = await db.execute({
      sql: "SELECT id FROM users WHERE openid = ? LIMIT 1",
      args: [auth.openid],
    });
    const user = userResult.rows[0] ?? null;

    // 插入历史记录
    let recordId: number | null = null;
    try {
      const record = await historyDb.addHistory({
        user_id: user.id,
        blessing,
        occasion: body.occasion,
        target_person: body.targetPerson,
        style: body.style || "传统",
      });
      recordId = (record as { id: number } | undefined)?.id ?? null;
    } catch (historyError) {
      // 历史记录插入失败，但不影响祝福语生成
      console.error("插入历史记录失败:", historyError);
    }

    // 返回成功结果
    return NextResponse.json({ blessing, recordId });
  } catch (error) {
    // 记录错误信息用于调试
    console.error("生成祝福语失败:", error);

    // 安全的错误处理 - 只返回用户友好的消息
    let errorMessage = "生成失败，请重试";

    // 处理特定的已知错误类型
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

    // 返回错误响应
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

// Next.js 类型定义和全局样式导入
import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

// SEO 元数据配置
// 定义网站标题、描述、关键词和图标
export const metadata: Metadata = {
  title: "妙笔祝福 — AI祝福语生成器",
  description:
    "妙笔祝福后端与演示：AI智能生成个性化中文祝福语，支持多种场景、节日和目标人群。登录用户的祝福记录会保存在账户中。",
  keywords: "妙笔祝福,祝福语,AI生成,个性化,节日祝福,生日祝福",
  icons: {
    icon: "/favicon.svg",
  },
};

/**
 * 根布局组件
 * 包含应用的全局结构：头部、主内容区域和底部
 * 采用响应式设计和节日渐变背景主题
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen flex flex-col">
        {/* 应用头部 - 包含标题和装饰性元素 */}
        <header className="relative overflow-hidden">
          {/* 主渐变背景层 */}
          <div className="absolute inset-0 bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500"></div>
          {/* 叠加渐变层，增加深度效果 */}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-red-500/20 to-orange-500/30"></div>
          {/* 内容层，确保在背景之上 */}
          <div className="relative z-10 py-12">
            <div className="max-w-6xl mx-auto px-4">
              {/* 主标题 */}
              <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black text-center festive-title mb-4">
                🎊 妙笔祝福 · AI祝福语生成器 🎊
              </h1>
              {/* 副标题 */}
              <p className="text-center text-sm sm:text-base md:text-lg lg:text-xl font-semibold text-white drop-shadow-lg">
                ✨ 不会写祝福，也能说出心里话 ✨
              </p>
              {/* 装饰性动画表情，不参与屏幕阅读器 */}
              <div className="text-center mt-4 space-x-2" aria-hidden="true">
                <span className="inline-block text-3xl animate-bounce">🎉</span>
                <span
                  className="inline-block text-3xl animate-bounce"
                  style={{ animationDelay: "0.2s" }}
                >
                  🎈
                </span>
                <span
                  className="inline-block text-3xl animate-bounce"
                  style={{ animationDelay: "0.4s" }}
                >
                  🎊
                </span>
                <span
                  className="inline-block text-3xl animate-bounce"
                  style={{ animationDelay: "0.6s" }}
                >
                  🎁
                </span>
                <span
                  className="inline-block text-3xl animate-bounce"
                  style={{ animationDelay: "0.8s" }}
                >
                  🎉
                </span>
              </div>
            </div>
          </div>
        </header>
        {/* 主内容区域 */}
        <main
          className="flex-1 flex items-center justify-center py-8"
          role="main"
        >
          <div className="w-full max-w-6xl mx-auto px-4">{children}</div>
        </main>
        {/* 应用底部 */}
        <footer className="relative overflow-hidden bg-gradient-to-r from-red-600 via-orange-600 to-yellow-600 text-white py-8">
          {/* 底部阴影效果 */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
          <div className="relative z-10 max-w-6xl mx-auto px-4 text-center">
            {/* 装饰性表情 */}
            <div className="mb-4 space-x-2" aria-hidden="true">
              <span className="text-2xl">🎊</span>
              <span className="text-2xl">🎉</span>
              <span className="text-2xl">🎊</span>
            </div>
            {/* 版权信息 */}
            <p className="text-lg font-semibold drop-shadow-lg">
              &copy; 2025 妙笔祝福 - 让祝福更有温度 🌟
            </p>
            {/* 隐私声明 */}
            <p className="text-sm mt-2 opacity-90">
              祝福语用于 AI 生成；登录用户的祝福记录会保存在您的账户中，便于查看历史。未登录访客内容不长期保存。 ❤️ 项目已开源：
              <a
                href="https://github.com/farion1231/ai-blessing-maker"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white hover:text-gray-200"
              >
                GitHub
              </a>
            </p>
          </div>
        </footer>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}

"use client";

import ErrorMessage from "./ErrorMessage";
import EmptyState from "./EmptyState";
import BlessingResult from "./BlessingResult";

interface ResultDisplayProps {
  blessing: string;
  error: string;
  loading: boolean;
  copySuccess: boolean;
  copyFading: boolean;
  onCopy: () => void;
  onRegenerate: () => void;
}

export default function ResultDisplay({
  blessing,
  error,
  loading,
  copySuccess,
  copyFading,
  onCopy,
  onRegenerate,
}: ResultDisplayProps) {
  return (
    <div className="card-primary min-h-[380px] sm:h-[420px] md:h-[480px] lg:h-[520px] xl:h-[560px] flex flex-col transition-all duration-300 ease-in-out">
      {/* 装饰元素 */}
      <div className="decoration-tl"></div>

      <h2 className="text-2xl font-black text-center mb-6 festive-title">
        <span aria-hidden="true"></span> 生成结果{" "}
        <span aria-hidden="true"></span>
      </h2>

      {error && <ErrorMessage message={error} />}

      {blessing ? (
        <div className="flex-1 flex flex-col sm:overflow-hidden">
          <div className="flex-1 sm:overflow-y-auto overflow-x-hidden pr-2">
            <BlessingResult
              blessing={blessing}
              loading={loading}
              onCopy={onCopy}
              onRegenerate={onRegenerate}
            />
          </div>

          {/* 复制成功提示区域 - 固定空间 */}
          <div className="h-16 flex items-center justify-center flex-shrink-0 transition-all duration-300 relative z-20">
            {copySuccess && (
              <div
                className={`bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-2xl p-4 text-center font-semibold shadow-lg ${
                  copyFading ? "fade-out" : "fade-in"
                } max-w-md mx-auto relative z-20`}
              >
                <div className="flex items-center justify-center gap-2">
                  <span className="text-2xl"></span>
                  <span>祝福语已复制到剪贴板！快去分享这份温暖吧~</span>
                  <span className="text-2xl"></span>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <EmptyState />
        </div>
      )}
    </div>
  );
}

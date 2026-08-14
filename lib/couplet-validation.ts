import { cleanText } from "@/lib/validation";
import { containsPromptInjectionAttempt } from "@/lib/prompt-safety";

const BLOCKED_PATTERNS = [
  /<script/i,
  /javascript:/i,
  /(system|assistant|user):/i,
];

const COUPLET_THEMES = ["春节", "元宵", "贺寿", "乔迁", "日常"] as const;

export type CoupletTheme = (typeof COUPLET_THEMES)[number];

export interface CoupletUpperRequest {
  occasion?: string;
  theme?: string;
  difficulty?: "simple" | "medium" | "hard";
}

export interface CoupletReviewRequest {
  upperLine: string;
  lowerLine: string;
  recordId?: number;
}

export interface CoupletReviewResult {
  score: number;
  summary: string;
  strengths: string[];
  suggestions: string[];
  canShare: boolean;
}

const LINE_LIMITS = { min: 4, max: 14 };

function countChars(line: string): number {
  return [...line.replace(/\s/g, "")].length;
}

function hasBlockedContent(text: string): boolean {
  return containsPromptInjectionAttempt(text)
    || BLOCKED_PATTERNS.some((pattern) => pattern.test(text));
}

const SHARE_BLOCKED_PATTERNS = [
  /自杀|自残|杀人|爆炸|制毒|强奸|恐怖袭击/,
  /仇恨|种族灭绝|纳粹/,
];

/** A deterministic gate for share eligibility; model output is never authoritative. */
export function isCoupletContentShareable(upperLine: string, lowerLine: string): boolean {
  return !hasBlockedContent(upperLine)
    && !hasBlockedContent(lowerLine)
    && !SHARE_BLOCKED_PATTERNS.some((pattern) => pattern.test(`${upperLine}\n${lowerLine}`));
}

export function normalizeCoupletLine(text: string): string {
  return cleanText(text)
    .replace(/[，。、；：！？,.;:!?"""''（）()\[\]【】]/g, "")
    .trim();
}

export function validateCoupletUpperRequest(data: unknown): {
  valid: boolean;
  error?: string;
  theme?: string;
  difficulty?: "simple" | "medium" | "hard";
} {
  if (!data || typeof data !== "object") {
    return { valid: false, error: "请求参数无效" };
  }

  const input = data as CoupletUpperRequest;
  const rawTheme = (input.theme || input.occasion || "日常").trim();
  const theme = COUPLET_THEMES.includes(rawTheme as CoupletTheme)
    ? rawTheme
    : "日常";

  const difficulty = ["simple", "medium", "hard"].includes(
    input.difficulty || "",
  )
    ? (input.difficulty as "simple" | "medium" | "hard")
    : "medium";

  if (hasBlockedContent(rawTheme)) {
    return { valid: false, error: "主题内容不符合要求" };
  }

  return { valid: true, theme, difficulty };
}

export function validateCoupletReviewRequest(data: unknown): {
  valid: boolean;
  error?: string;
  upperLine?: string;
  lowerLine?: string;
  recordId?: number;
} {
  if (!data || typeof data !== "object") {
    return { valid: false, error: "请求参数无效" };
  }

  const input = data as CoupletReviewRequest;
  const upperLine = normalizeCoupletLine(String(input.upperLine || ""));
  const lowerLine = normalizeCoupletLine(String(input.lowerLine || ""));
  const recordId =
    typeof input.recordId === "number" ? input.recordId : undefined;

  if (!upperLine || !lowerLine) {
    return { valid: false, error: "请填写完整的上联和下联" };
  }

  const upperLen = countChars(upperLine);
  const lowerLen = countChars(lowerLine);

  if (
    upperLen < LINE_LIMITS.min ||
    upperLen > LINE_LIMITS.max ||
    lowerLen < LINE_LIMITS.min ||
    lowerLen > LINE_LIMITS.max
  ) {
    return { valid: false, error: "每联字数应在 4 到 14 字之间" };
  }

  if (upperLen !== lowerLen) {
    return { valid: false, error: "上下联字数须相等" };
  }

  if (hasBlockedContent(upperLine) || hasBlockedContent(lowerLine)) {
    return { valid: false, error: "对联内容不符合要求" };
  }

  return { valid: true, upperLine, lowerLine, recordId };
}

export function normalizeUpperLineFromAI(raw: string): string {
  const line = raw
    .split("\n")
    .map((s) => s.trim())
    .find((s) => s.length > 0);

  if (!line) return "";

  return normalizeCoupletLine(
    line
      .replace(/^(上联|上聯|横批|橫批|下联|下聯)[：:]\s*/i, "")
      .replace(/^["「『]|["」』]$/g, ""),
  );
}

export const COUPLET_REVIEW_FALLBACK: CoupletReviewResult = {
  score: 4,
  summary: "点评结果格式异常，请重新评联",
  strengths: [],
  suggestions: ["请重新生成点评"],
  canShare: false,
};

export function parseCoupletReviewJson(raw: string): CoupletReviewResult {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return COUPLET_REVIEW_FALLBACK;
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Partial<CoupletReviewResult>;
    const scoreValue = Number(parsed.score);
    if (
      !Number.isInteger(scoreValue)
      || scoreValue < 1
      || scoreValue > 5
      || typeof parsed.summary !== "string"
      || !Array.isArray(parsed.strengths)
      || !Array.isArray(parsed.suggestions)
    ) {
      return COUPLET_REVIEW_FALLBACK;
    }
    const score = scoreValue;
    const summary =
      typeof parsed.summary === "string" && parsed.summary.trim()
        ? cleanText(parsed.summary).slice(0, 30)
        : COUPLET_REVIEW_FALLBACK.summary;

    const strengths = Array.isArray(parsed.strengths)
      ? parsed.strengths
          .filter(
            (s): s is string => typeof s === "string" && cleanText(s).length > 0,
          )
          .map((s) => cleanText(s).slice(0, 30))
          .slice(0, 2)
      : COUPLET_REVIEW_FALLBACK.strengths;

    const suggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions
          .filter(
            (s): s is string => typeof s === "string" && cleanText(s).length > 0,
          )
          .map((s) => cleanText(s).slice(0, 30))
          .slice(0, 2)
      : [];

    // This flag means the model response passed the strict output schema.
    // The route replaces it with the deterministic share-policy result.
    const canShare = true;

    return { score, summary, strengths, suggestions, canShare };
  } catch {
    return COUPLET_REVIEW_FALLBACK;
  }
}

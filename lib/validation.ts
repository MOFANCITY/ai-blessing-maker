// 简化的验证规则
import { containsPromptInjectionAttempt } from "@/lib/prompt-safety";

const LIMITS = {
  customDescription: { min: 5, max: 300 },
  additionalInfo: { max: 100 },
  dissSituation: { min: 5, max: 500 },
  dissTarget: { max: 50 },
};

const VALID_DISS_TONES = ['优雅反击', '一针见血', '幽默调侃', '高级讽刺', '直接怼', '捧杀式'] as const;
export type DissTone = (typeof VALID_DISS_TONES)[number];

export interface DissCleanedInput {
  situation: string;
  tone: string;
  target?: string;
  presetId?: string;
}

// 基础危险词过滤（只过滤明显的提示词注入）
const BLOCKED_PATTERNS = [
  /<script/i,
  /javascript:/i,
  /\b(system|assistant|user)\s*:/i,
];

function hasUnsafePromptContent(text: string): boolean {
  return containsPromptInjectionAttempt(text) || BLOCKED_PATTERNS.some((pattern) => pattern.test(text));
}

const CLASSIC_FIELD_LIMITS = {
  occasion: 40,
  targetPerson: 40,
  style: 24,
  festival: 40,
} as const;

function validateRequiredClassicText(value: unknown, field: keyof typeof CLASSIC_FIELD_LIMITS): boolean {
  return typeof value === "string"
    && cleanText(value).length > 0
    && cleanText(value).length <= CLASSIC_FIELD_LIMITS[field]
    && !hasUnsafePromptContent(cleanText(value));
}

function validateOptionalClassicText(value: unknown, field: keyof typeof CLASSIC_FIELD_LIMITS): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value !== "string") return false;
  const cleaned = cleanText(value);
  return cleaned.length === 0 || (
    cleaned.length <= CLASSIC_FIELD_LIMITS[field]
    && !hasUnsafePromptContent(cleaned)
  );
}

export function validateInput(data: unknown): { valid: boolean; error?: string } {
  // 空值检查
  if (!data) {
    return { valid: false, error: "请选择场合和对象" };
  }
  
  // 类型断言
  const inputData = data as Record<string, unknown>;
  
  // 智能模式验证
  if (inputData.useSmartMode || inputData.mode === 'smart') {
    const desc = typeof inputData.customDescription === "string"
      ? cleanText(inputData.customDescription)
      : "";
    
    if (!desc) return { valid: false, error: "请输入场景描述" };
    if (desc.length < LIMITS.customDescription.min) {
      return { valid: false, error: "描述太短，请详细一些" };
    }
    if (desc.length > LIMITS.customDescription.max) {
      return { valid: false, error: "描述太长，请简化一下" };
    }
    
    // 检查危险模式
    if (hasUnsafePromptContent(desc)) {
      return { valid: false, error: "输入内容不符合要求" };
    }
  }
  
  // 经典模式验证（简单非空检查）
  else {
    if (
      !validateRequiredClassicText(inputData.occasion, "occasion")
      || !validateRequiredClassicText(inputData.targetPerson, "targetPerson")
      || !validateOptionalClassicText(inputData.style, "style")
      || !validateOptionalClassicText(inputData.festival, "festival")
    ) {
      return { valid: false, error: "请选择有效且安全的场合和对象" };
    }
  }
  
  return { valid: true };
}

// 简单文本清理（移除控制字符）
export function cleanText(text: string): string {
  return text.replace(/[\x00-\x1F\x7F\u200B-\u200D\uFEFF]/g, '').trim();
}

/**
 * 怼人输入验证
 * - situation: 必填，5-500 字符
 * - tone: 必填，必须在合法怼人风格列表中
 * - target: 可选，最多 50 字符
 * - presetId: 可选字符串
 */
export function validateDissInput(data: unknown): { valid: boolean; error?: string; cleaned?: DissCleanedInput } {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: '请输入对方原话' };
  }

  const input = data as { situation?: unknown; tone?: unknown; target?: unknown; presetId?: unknown };

  const rawSituation = typeof input.situation === 'string' ? cleanText(input.situation) : '';
  if (!rawSituation) {
    return { valid: false, error: '请输入对方原话' };
  }
  if (rawSituation.length < LIMITS.dissSituation.min) {
    return { valid: false, error: '描述太短，请详细一些' };
  }
  if (rawSituation.length > LIMITS.dissSituation.max) {
    return { valid: false, error: '描述太长，请简化一下' };
  }

  if (hasUnsafePromptContent(rawSituation)) {
    return { valid: false, error: '输入内容不符合要求' };
  }

  const tone = typeof input.tone === 'string' ? input.tone.trim() : '';
  if (!tone || !VALID_DISS_TONES.includes(tone as DissTone)) {
    return { valid: false, error: '请选择怼人风格' };
  }

  let target: string | undefined;
  if (input.target !== undefined && input.target !== null) {
    if (typeof input.target !== 'string') {
      return { valid: false, error: '称呼格式不正确' };
    }
    target = cleanText(input.target);
    if (target.length > LIMITS.dissTarget.max) {
      return { valid: false, error: '称呼不能超过 50 字' };
    }
    if (hasUnsafePromptContent(target)) {
      return { valid: false, error: '称呼内容不符合要求' };
    }
    if (target.length === 0) target = undefined;
  }

  let presetId: string | undefined;
  if (input.presetId !== undefined && input.presetId !== null) {
    if (typeof input.presetId !== 'string') {
      return { valid: false, error: 'presetId 格式不正确' };
    }
    presetId = input.presetId.trim() || undefined;
  }

  const cleaned: DissCleanedInput = { situation: rawSituation, tone, target, presetId };

  return { valid: true, cleaned };
}

// ========================
// 古诗输入验证
// ========================

const VALID_POEM_TYPES = ['poem5', 'poem7'] as const;
export type PoemType = (typeof VALID_POEM_TYPES)[number];

export const VALID_POEM_THEMES = [
  '春天',
  '新年',
  '事业',
  '爱情',
  '山水',
  '思念',
  '离别',
  '壮志',
] as const;
export type PoemTheme = (typeof VALID_POEM_THEMES)[number];

export interface PoemCleanedInput {
  type: PoemType;
  theme: PoemTheme;
  gameMode: boolean;
  extras?: string;
}

const LIMITS_POEM = {
  extras: { max: 200 },
};

/**
 * 古诗输入验证
 * - type: 必填，'poem5' 或 'poem7'
 * - theme: 必填，必须在 8 个主题列表中
 * - gameMode: 可选布尔
 * - extras: 可选字符串，最多 200 字符
 */
export function validatePoemInput(
  data: unknown
): { valid: boolean; error?: string; cleaned?: PoemCleanedInput } {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: '请选择古诗类型和主题' };
  }

  const input = data as { type?: unknown; theme?: unknown; gameMode?: unknown; extras?: unknown };

  const rawType = typeof input.type === 'string' ? input.type.trim() : '';
  if (!rawType) {
    return { valid: false, error: '请选择古诗类型（五言 / 七言）' };
  }
  if (!VALID_POEM_TYPES.includes(rawType as PoemType)) {
    return { valid: false, error: '古诗类型必须是 poem5 或 poem7' };
  }
  const type = rawType as PoemType;

  const rawTheme = typeof input.theme === 'string' ? input.theme.trim() : '';
  if (!rawTheme) {
    return { valid: false, error: '请选择古诗主题' };
  }
  if (!VALID_POEM_THEMES.includes(rawTheme as PoemTheme)) {
    return { valid: false, error: '主题必须是有效的主题之一' };
  }
  const theme = rawTheme as PoemTheme;

  let gameMode = false;
  if (input.gameMode !== undefined && input.gameMode !== null) {
    if (typeof input.gameMode !== 'boolean') {
      return { valid: false, error: '游戏模式格式不正确' };
    }
    gameMode = input.gameMode;
  }

  let extras: string | undefined;
  if (input.extras !== undefined && input.extras !== null) {
    if (typeof input.extras !== 'string') {
      return { valid: false, error: '额外要求格式不正确' };
    }
    const trimmed = cleanText(input.extras);
    if (trimmed.length > LIMITS_POEM.extras.max) {
      return { valid: false, error: '额外要求不能超过 200 字' };
    }
    if (hasUnsafePromptContent(trimmed)) {
      return { valid: false, error: '额外要求包含不允许的指令性内容' };
    }
    extras = trimmed || undefined;
  }

  const cleaned: PoemCleanedInput = { type, theme, gameMode, extras };
  return { valid: true, cleaned };
}
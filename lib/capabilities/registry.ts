export const TOOL_KEYS = [
  "blessing",
  "diss",
  "couplet",
  "poem",
  "moments",
  "speech",
  "comic",
  "novel",
  "lyrics",
] as const;

export type ToolKey = (typeof TOOL_KEYS)[number];

export interface ToolDefinition {
  key: ToolKey;
  name: string;
  description: string;
  creditCost: number;
  enabled: boolean;
  favoriteEnabled: boolean;
  shareEnabled: boolean;
  inputFields: readonly string[];
  intentKeywords: readonly string[];
}

export const TOOL_REGISTRY: Record<ToolKey, ToolDefinition> = {
  blessing: {
    key: "blessing", name: "祝福", description: "为亲友写一段真诚祝福", creditCost: 1,
    enabled: true, favoriteEnabled: true, shareEnabled: true,
    inputFields: ["occasion", "targetPerson", "style", "customDescription"],
    intentKeywords: ["祝福", "生日", "婚礼", "毕业", "新年", "节日"],
  },
  diss: {
    key: "diss", name: "巧妙回应", description: "得体地回应不舒服的话", creditCost: 1,
    enabled: true, favoriteEnabled: true, shareEnabled: false,
    inputFields: ["situation", "tone", "target"],
    intentKeywords: ["回应", "回怼", "反击", "怎么回复", "阴阳怪气"],
  },
  couplet: {
    key: "couplet", name: "对联", description: "出上联、对下联并点评", creditCost: 1,
    enabled: true, favoriteEnabled: true, shareEnabled: true,
    inputFields: ["theme", "difficulty"],
    intentKeywords: ["对联", "上联", "下联", "春联", "横批"],
  },
  poem: {
    key: "poem", name: "古诗", description: "AI 起承，与你共写绝句", creditCost: 1,
    enabled: true, favoriteEnabled: true, shareEnabled: true,
    inputFields: ["type", "theme", "extras"],
    intentKeywords: ["古诗", "诗", "五言", "七言", "绝句"],
  },
  moments: {
    key: "moments", name: "朋友圈", description: "生成可直接发布的朋友圈文案", creditCost: 1,
    enabled: true, favoriteEnabled: true, shareEnabled: true,
    inputFields: ["topic", "tone", "details"],
    intentKeywords: ["朋友圈", "发圈", "配文", "文案", "晒"],
  },
  speech: {
    key: "speech", name: "演讲稿", description: "生成完整的开场、正文与结尾", creditCost: 1,
    enabled: true, favoriteEnabled: true, shareEnabled: true,
    inputFields: ["topic", "audience", "duration", "tone"],
    intentKeywords: ["演讲", "发言", "致辞", "讲话", "主持"],
  },
  comic: {
    key: "comic", name: "漫画", description: "创作单格或四格漫画分镜与台词", creditCost: 1,
    enabled: true, favoriteEnabled: true, shareEnabled: true,
    inputFields: ["topic", "format", "style"],
    intentKeywords: ["漫画", "四格", "分镜", "台词", "搞笑"],
  },
  novel: {
    key: "novel", name: "小说", description: "生成有钩子的小说开头与主角卡", creditCost: 1,
    enabled: true, favoriteEnabled: true, shareEnabled: true,
    inputFields: ["theme", "genre", "protagonist"],
    intentKeywords: ["小说", "故事", "开头", "设定", "主角"],
  },
  lyrics: {
    key: "lyrics", name: "唱词", description: "写一段有旋律感的原创唱词", creditCost: 1,
    enabled: true, favoriteEnabled: true, shareEnabled: true,
    inputFields: ["theme", "style", "mood"],
    intentKeywords: ["歌词", "唱词", "歌曲", "副歌", "说唱"],
  },
};

export function getToolDefinition(key: string): ToolDefinition | null {
  return Object.prototype.hasOwnProperty.call(TOOL_REGISTRY, key)
    ? TOOL_REGISTRY[key as ToolKey]
    : null;
}

export function getEnabledTools(): ToolDefinition[] {
  return TOOL_KEYS.map((key) => TOOL_REGISTRY[key]).filter((tool) => tool.enabled);
}

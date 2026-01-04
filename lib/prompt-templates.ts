/**
 * 祝福语请求接口
 * 定义了生成祝福语所需的所有参数
 * 支持两种模式：经典模板模式和智能描述模式
 */
interface BlessingRequest {
  occasion: string;           // 场合类型（经典模式使用）
  festival?: string;          // 节日类型（经典模式使用）
  targetPerson: string;       // 目标人群（经典模式使用）
  style?: string;             // 祝福语风格（可选）
  customDescription?: string; // 用户自定义描述（智能模式使用）
  useSmartMode?: boolean;     // 是否使用智能模式
  timestamp?: number;         // 时间戳（可选）
  version?: string;           // 版本号（可选）
}

/**
 * 创建智能模式的提示词
 * 基于用户的自由描述生成个性化的祝福语
 * @param options - 包含用户描述的请求参数
 * @returns 完整的 AI 提示词文本
 */
export function createSmartPrompt(options: BlessingRequest): string {
  const { customDescription } = options;
  
  return `
# Role
你是一位精通中文社交礼仪与情感表达的文案专家，擅长根据不同人际关系捕捉最恰当的语气，创作既真诚又不落俗套的祝福语。

# Task
请根据以下描述生成一段个性化的祝福语：

用户描述：${customDescription}

请生成一段真诚、个性化、符合情境的祝福语。要求：
1. 深度理解用户描述中的所有细节：人物关系、具体情况、情感背景等
2. 自动识别并恰当使用文中提到的姓名、称呼、关系
3. 根据描述的场景和情境选择最合适的语气和风格
4. 体现对具体情况的理解和针对性关怀
5. 长度适中（50-100字），真诚自然，避免套话模板
6. 语言温暖有力，富有个人色彩和情感共鸣
7. 如果描述中包含特殊背景，要巧妙地体现出来
8. 避免使用敏感词汇

# Output
请直接返回祝福语内容，不需要其他说明。`;
}

/**
 * 创建经典模板模式的提示词
 * 基于用户选择的场景、人群和风格生成标准化祝福语
 * @param options - 包含场景、目标人群和风格的请求参数
 * @returns 完整的 AI 提示词文本
 */
export function createTemplatePrompt(options: BlessingRequest): string {
  const { occasion, targetPerson, style = "温馨" } = options;

  return `
# Role
你是一位精通中文社交礼仪与情感表达的文案专家，擅长根据不同人际关系捕捉最恰当的语气，创作既真诚又不落俗套的祝福语。

# Task
请根据以下变量，为我撰写一段地道的中文祝福语：
- 祝福场合：${occasion}
- 祝福对象：${targetPerson}（请考虑与此人的亲疏关系）
- 期望风格：${style}

# Requirements
1. 身份对齐：根据“祝福对象”自动调整称呼（如敬语“您”或亲昵称呼）和社交距离，确保不突兀。
2. 内容结构：建议包含【对现状的肯定/赞美】+【核心祝愿】+【对未来的美好期许】。
3. 语言去水：避免空洞的成语堆砌，优先使用口语化但有质感的表达，字数严格控制在 50-80 字之间。
4. 情感共鸣：内容要积极正面，文字要有温度，读起来像是由衷而发而非模板生成。

# Output
请直接输出祝福语正文，无需任何开头语或解释。
`;
}

/**
 * 主提示词创建函数
 * 根据用户选择的模式自动切换到相应的提示词生成器
 * @param options - 完整的祝福语请求参数
 * @returns 根据模式生成的对应提示词
 */
export function createBlessingPrompt(options: BlessingRequest): string {
  // 如果启用智能模式且有自定义描述，使用智能提示词
  if (options.useSmartMode && options.customDescription?.trim()) {
    return createSmartPrompt(options);
  } else {
    // 否则使用经典模板提示词
    return createTemplatePrompt(options);
  }
}
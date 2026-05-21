/**
 * 祝福语请求接口
 * 定义了生成祝福语所需的所有参数
 * 支持两种模式：经典模板模式和智能描述模式
 */
interface BlessingRequest {
  occasion?: string;          // 场合类型（经典模式使用）
  festival?: string;          // 节日类型（经典模式使用）
  targetPerson?: string;      // 目标人群（经典模式使用）
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

  // 检查必需参数
  if (!occasion || !targetPerson) {
    throw new Error('经典模式需要提供场合和目标人群');
  }

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

/**
 * 生成对联上联的提示词
 */
export function createCoupletUpperPrompt(theme: string): string {
  return `
# Role
你是一位擅长创作中文对联的文案专家，熟悉常见节日、日常生活与人生场合的联语风格。

# Task
为「${theme}」主题创作一副对联的**上联**（仅上联一行）。

# Requirements
1. 字数：7 个汉字（不含标点、空格）。
2. 内容积极，适合送给亲友，不涉及政治、暴力、低俗、迷信等敏感内容。
3. 语言典雅但不晦涩，中老年读者能看懂。
4. 字数必须严格 7 个汉字，多一个字少一个字都不行。为下联留出对仗空间：词性、意境可与之呼应，但不要写出下联。
5. 不要输出横批、解释。只输出 7 个汉字本身，不要任何标点符号、引号、序号、前缀（如「上联：」）、后缀或解释文字。

# Output
只输出 7 个汉字，一行，无其他任何文字。`;
}

/**
 * 评下联的提示词（要求严格 JSON）
 */
export function createCoupletReviewPrompt(
  upperLine: string,
  lowerLine: string
): string {
  return `
# Role
你是一位和蔼的中文对联老师傅，擅长用大白话点评对联，鼓励初学者。你既能欣赏传统工整的对仗，也乐见年轻人以幽默诙谐的方式玩对联——哪怕下联不太合规矩，只要押韵有趣、心意到了，你也会笑着夸一句"有意思"。

# Task
点评用户写的下联是否配得上这条上联。

- 上联：${upperLine}
- 下联：${lowerLine}

# Requirements
1. 先判断下联风格：是传统工整型还是诙谐搞笑型。两种风格都认真点评，不要因风格不同而否定用户。
2. 从三方面简评：字数是否相配、词性/结构是否大致对仗、意境是否贴切。
3. 诙谐搞笑型的下联（如押韵、谐音梗、搞笑呼应）：重点肯定其趣味性和创意，不苛求传统对仗和平仄，语气可以轻松幽默，像朋友间开玩笑。
4. 随意发挥型的下联（如个性化的表达、独特的创意）：可以适当给予评价，像私塾老先生对孩童般宽容，鼓励用户的创作热情。
4. 不苛求严格平仄，语气鼓励为主，避免打击创作热情。
5. 评语口语化，每条建议不超过 20 字，不用过多文言术语。
6. canShare 判断：下联不含攻击性、低俗、政治敏感、暴力内容时 canShare 为 true；否则为 false。诙谐搞笑但无害的内容完全可以分享。
7. score 为 1-5 的整数（5 最好）。诙谐搞笑型只要有趣、押韵、无害，可以给到 3 分。
8. summary 不超过 20 字。

# Output
直接输出一个 JSON 对象，不要任何解释文字，不要 markdown 代码块标记（\`\`\`），不要多余文字。格式如下：
{"score":4,"summary":"一句话总评","strengths":["优点1"],"suggestions":["建议1"],"canShare":true}`;
}
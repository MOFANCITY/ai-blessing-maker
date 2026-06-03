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
  version?: string;
  userProfile?: 'elderly' | 'standard' | 'young'; // 用户群配置，用于调整语气风格
}

/**
 * 创建智能模式的提示词
 * 基于用户的自由描述生成个性化的祝福语
 * @param options - 包含用户描述的请求参数
 * @returns 完整的 AI 提示词文本
 */
export function createSmartPrompt(options: BlessingRequest): string {
  const { customDescription } = options;

  // 根据用户群调整语气要求
  const toneGuidance = getUserProfileToneGuidance(options.userProfile);

  return `
# Role
你是一位精通中文社交礼仪与情感表达的文案专家，擅长根据不同人际关系捕捉最恰当的语气，创作既真诚又不落俗套的祝福语。

# Task
请根据以下描述生成一段个性化的祝福语：

用户描述：${customDescription}

请生成一段真诚、个性化、符合情境的祝福语。要求：
${toneGuidance}
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

  // 根据用户群调整语气要求
  const toneGuidance = getUserProfileToneGuidance(options.userProfile);

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
${toneGuidance}
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
 * @param theme - 对联主题
 * @param difficulty - 难度等级 ('simple' | 'medium' | 'hard')，影响字数范围
 */
export function createCoupletUpperPrompt(theme: string, difficulty?: 'simple' | 'medium' | 'hard'): string {
  // 根据难度确定字数范围
  const difficultyMap: Record<string, { min: number; max: number; desc: string }> = {
    'simple': { min: 4, max: 5, desc: '4-5' },
    'medium': { min: 6, max: 8, desc: '6-8' },
    'hard': { min: 9, max: 14, desc: '9-14' }
  };

  const targetDifficulty = difficultyMap[difficulty || 'medium'];
  const charRange = `${targetDifficulty.min}-${targetDifficulty.max}`;

  return `
# Role
你是一位擅长创作中文对联的文案专家，熟悉常见节日、日常生活与人生场合的联语风格。

# Task
为「${theme}」主题创作一副对联的**上联**（仅上联一行）。

# Requirements

1. 字数：${charRange} 个汉字（不含标点、空格）。字数必须严格在这个范围内。
2. 内容积极，适合送给亲友，不涉及政治、暴力、低俗、迷信等敏感内容。
3. 语言典雅但不晦涩，中老年读者能看懂。
4. 为下联留出对仗空间：词性、意境可与之呼应，但不要写出下联。
5. 不要输出横批、解释。只输出 ${charRange} 个汉字本身，不要任何标点符号、引号、序号、前缀（如「上联：」）、后缀或解释文字。

# Output
只输出 ${charRange} 个汉字，一行，无其他任何文字。`;
}

/**
 * 创建怼人提示词
 * @param situation - 场景描述 / 对方原话（5-500 字）
 * @param tone - 怼人风格（优雅反击 / 一针见血 / 幽默调侃 / 高级讽刺 / 直接怼 / 捧杀式）
 * @param target - 涉及人物（可选，最多 50 字）
 * @returns 完整的 AI 提示词
 */
export function createDissPrompt(situation: string, tone: string, target?: string): string {
  const TONE_GUIDANCE: Record<string, string> = {
    '优雅反击': '礼貌但寸步不让，措辞得体不丢气场，让对方挑不出礼节上的毛病',
    '一针见血': '直击对方逻辑漏洞或话术软肋，简洁利落，不绕弯子',
    '幽默调侃': '用轻松甚至自嘲的方式消解攻击，让旁观者会心一笑、对方有苦说不出',
    '高级讽刺': '言此意彼、绵里藏针，表面上夸实际在损，对方回看才能品出味道',
    '直接怼': '直白清晰但绝不爆粗口、不进行人身攻击，把话说明白',
    '捧杀式': '先顺着对方的话把对方"捧"到一个他自己站不住的位置上，让他自己打脸',
  };

  const toneDesc = TONE_GUIDANCE[tone] || TONE_GUIDANCE['优雅反击'];

  const targetLine = target && target.trim().length > 0
    ? `\n涉及人物：${target}\n`
    : '';

  return `
# Role
你是一位中文社交话术高手，擅长用「有理有据、不失风度」的方式回击不当言论。你的回击既要让旁观者觉得妙，又不能成为对方把柄。

# Task
请根据用户描述的场景，撰写一句回击文案。风格要求：「${tone}」。

场景 / 对方原话：${situation}${targetLine}

# Requirements
1. 风格执行：${tone}——${toneDesc}
2. 长度：30-150 个汉字，节奏紧凑，不要写成段落
3. 底线红线（必须遵守）：
   - 不使用任何形式的脏话、咒骂、爆粗口
   - 不进行人身攻击（不攻击对方外貌、家庭、学历、收入等）
   - 不煽动仇恨，不针对任何受保护群体（种族、性别、宗教、地域、性取向、年龄等）
   - 不涉及政治敏感话题、暴力威胁、违法教唆
4. 如果原话涉及以上红线，请用得体、聪明的方式礼貌拒绝或巧妙转移，不要硬怼
5. 保持中文口语感，自然流畅，不要口号化或模板化

# Output
只输出回击文案本身，一段话，不带任何前缀、引号、标题、解释、表情符号。
`.trim();
}

/**
 * 评下联的提示词（要求严格 JSON）
 * @param upperLine - 上联内容
 * @param lowerLine - 下联内容
 * @param difficulty - 难度等级，影响评标准
 */
export function createCoupletReviewPrompt(
  upperLine: string,
  lowerLine: string,
  difficulty?: 'simple' | 'medium' | 'hard'
): string {
  // 根据难度确定字数范围，用于评下联
  const difficultyMap: Record<string, { min: number; max: number; desc: string }> = {
    'simple': { min: 4, max: 5, desc: '4-5' },
    'medium': { min: 6, max: 8, desc: '6-8' },
    'hard': { min: 9, max: 14, desc: '9-14' }
  };

  const targetDifficulty = difficultyMap[difficulty || 'medium'];
  const charRange = `${targetDifficulty.min}-${targetDifficulty.max}`;

  return `
# Role
你是一位和蔼的中文对联老师傅，擅长用大白话点评对联，鼓励初学者。你既能欣赏传统工整的对仗，也乐见年轻人以幽默诙谐的方式玩对联——哪怕下联不太合规矩，只要押韵有趣、心意到了，你也会笑着夸一句"有意思"。

# Task
点评用户写的下联是否配得上这条上联。

- 上联（${charRange}字）：${upperLine}
- 下联（应为${charRange}字）：${lowerLine}

# Requirements

1. 字数要求：下联应为 ${charRange} 个汉字，与上联相配。字数不符时要特别指出，但不要因此过度扣分。
2. 先判断下联风格：是传统工整型还是诙谐搞笑型。两种风格都认真点评，不要因风格不同而否定用户。
3. 从三方面简评：字数是否相配、词性/结构是否大致对仗、意境是否贴切。
4. 诙谐搞笑型的下联（如押韵、谐音梗、搞笑呼应）：重点肯定其趣味性和创意，不苛求传统对仗和平仄，语气可以轻松幽默，像朋友间开玩笑。
5. 随意发挥型的下联（如个性化的表达、独特的创意）：可以适当给予评价，像私塾老先生对孩童般宽容，鼓励用户的创作热情。
6. 不苛求严格平仄，语气鼓励为主，避免打击创作热情。
7. 评语口语化，每条建议不超过 20 字，不用过多文言术语。
8. canShare 判断：下联不含攻击性、低俗、政治敏感、暴力内容时 canShare 为 true；否则为 false。诙谐搞笑但无害的内容完全可以分享。
9. score 为 1-5 的整数（5 最好）。诙谐搞笑型只要有趣、押韵、无害，可以给到 3 分。
10. summary 不超过 20 字。

# Output
直接输出一个 JSON 对象，不要任何解释文字，不要 markdown 代码块标记（\`\`\`），不要多余文字。格式如下：
{"score":4,"summary":"一句话总评","strengths":["优点1"],"suggestions":["建议1"],"canShare":true}`;
}

/**
 * 根据用户群返回对应的语气指导文本
 * @param userProfile - 用户群类型
 * @returns 语气指导文本，插入到 prompt 的 Requirements 部分
 */
function getUserProfileToneGuidance(userProfile?: 'elderly' | 'standard' | 'young'): string {
  switch (userProfile) {
    case 'elderly':
      return `
0. 语气风格：使用长辈熟悉的表达方式，语速感舒缓，多用"祝您""愿您"等敬语，避免网络流行语和缩写。
`;
    case 'young':
      return `
0. 语气风格：轻松活泼，可适当使用表情符号（如✨🎉💪）和网络热词，语言年轻化有网感，但保持真诚不油腻。
`;
    case 'standard':
    default:
      return `
0. 语气风格：通用友好，平衡正式与亲切，适合大多数社交场景，避免极端口语化或过于书面化。
`;
  }
}

/**
 * 创建古诗提示词
 *
 * 生成模式 (gameMode=false 或不传):
 *   - 生成绝句的前两句（起承）
 *   - poem5: 每句 5 字；poem7: 每句 7 字
 *   - 主题与 extras 都需体现在诗中
 *
 * 评估模式 (gameMode=true):
 *   - 对用户提供的 4 句诗进行点评
 *   - 重点评估平仄、押韵、对仗
 *   - 用户 4 句通过 extras 传入，格式为「第1句\n第2句\n第3句\n第4句」
 *   - 第 1-2 句为 AI 已写（上下文），第 3-4 句为用户所写
 *
 * @param type - 'poem5' (五言) 或 'poem7' (七言)
 * @param theme - 主题词
 * @param gameMode - 是否为评估模式
 * @param extras - 可选的额外要求（意象、风格等），评估模式下存放「4 句用户诗」用 \n 分隔
 * @returns 完整的 AI 提示词
 */
export function createPoemPrompt(
  type: 'poem5' | 'poem7',
  theme: string,
  gameMode?: boolean,
  extras?: string
): string {
  const charPerLine = type === 'poem7' ? 7 : 5;
  const typeLabel = type === 'poem7' ? '七言' : '五言';

  if (gameMode) {
    const userLines = (extras || '').split('\n').map((l) => l.trim());
    const safeLines = [
      userLines[0] || '（空）',
      userLines[1] || '（空）',
      userLines[2] || '（空）',
      userLines[3] || '（空）',
    ];

    return `
# Role
你是一位精通古诗词格律的中文老师，擅长用大白话点评诗作。你既能欣赏传统工整的格律，也乐见年轻人以真诚情感写诗——哪怕平仄不太工整，只要诗意与心意到了，你会笑着肯定。

# Task
请对用户合作完成的一首${typeLabel}绝句进行点评。

- 主题：${theme}
- 字数：每句 ${charPerLine} 字（共 4 句）
- 用户提供的 4 句：
  1. ${safeLines[0]}
  2. ${safeLines[1]}
  3. ${safeLines[2]}
  4. ${safeLines[3]}

# Requirements

1. 字数检查：每句都应为 ${charPerLine} 字，字数不符时要明确指出。
2. 平仄评估：粗略评点第 3-4 句（用户写的）的平仄是否与第 1-2 句大致相合。不要苛求严格格律，重点是「念起来顺口」。
3. 押韵评估：第 2、4 句（偶数句）末字是否押同一韵脚？押韵宽严皆可，但要给出提示。
4. 主题契合：4 句是否围绕「${theme}」展开？
5. 意境连贯：4 句是否构成完整的「起承转合」？转句是否有变化？合句是否收束？
6. 鼓励为主：即便不太工整，也要肯定用户的创意和情感。语气像老朋友聊诗，不做学术训诂。
7. 不出现人身攻击、低俗、政治敏感、暴力等内容。
8. 评语口语化，每条建议不超过 20 字。

# Output
只输出点评文字，一段话，不带任何前缀、引号、标题、解释。`.trim();
  }

  const extrasLine = extras && extras.trim().length > 0
    ? `\n额外要求：${extras}\n`
    : '';

  return `
# Role
你是一位精通古诗词创作的中文诗人，熟悉绝句的格律与意境。你的作品既有古典韵味又能让现代人读懂，避免晦涩典故堆砌。

# Task
请围绕「${theme}」主题，创作一首${typeLabel}绝句的**前两句**（仅起承两行）。

# Requirements

1. 字数：每句严格 ${charPerLine} 个汉字（不含标点、空格）。四要素：
   - 必须是汉字（不写阿拉伯数字、英文字母、特殊符号）
   - 不能用逗号、句号、感叹号、引号
   - 不能合并多行或加空行
   - 写完即停，不要写第 3-4 句（把转合留给用户）
2. 内容：紧扣主题「${theme}」，与 ${theme} 相关的意象、季节、情感均可。
3. 风格：典雅但不晦涩，中老年读者能看懂。
4. 平仄：尽量合律，但不必过分拘泥。
5. 押韵：第 2 句末字押韵，便于用户写第 4 句时呼应。
6. 不要输出横批、解释、注释、序号。也不要写「前两句：」之类的标签。
7. 禁止内容：政治敏感、暴力、低俗、迷信、人身攻击一律不写。
${extrasLine}
# Output
只输出两行诗，每行 ${charPerLine} 个汉字。无其他任何文字、无引号、无标点、无标签、无解释。`.trim();
}

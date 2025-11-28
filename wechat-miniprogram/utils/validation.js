/**
 * 输入验证和清理函数
 * 确保用户输入安全，防止提示词注入和恶意内容
 */

// 定义需要阻止的危险模式（防止提示词注入攻击）
const BLOCKED_PATTERNS = [
  // 防止AI绕过指令的尝试
  /ignore\s+previous/i,
  /disregard\s+instructions/i,
  /override\s+instructions/i,
  /system\s+prompt/i,
  /you\s+are\s+an\s+AI/i,
  // 防止脚本注入
  /<script/i,
  /javascript:/i,
  /onerror/i,
  /onload/i,
  /onclick/i,
  // 防止SQL注入尝试
  /'\s*or\s*1=1/i,
  /"\s*or\s*1=1/i,
  /drop\s+table/i,
  /delete\s+from/i,
  /insert\s+into/i,
];

/**
 * 验证输入内容
 * @param {Object} body - 请求体对象
 * @returns {Object} 验证结果对象
 */
function validateInput(body) {
  // 检查是否使用智能模式
  const useSmartMode = body.useSmartMode === true;

  if (useSmartMode) {
    // 智能模式验证
    if (!body.customDescription || typeof body.customDescription !== 'string') {
      return { valid: false, error: '请提供祝福语描述' };
    }

    const description = body.customDescription.trim();
    if (description.length < 5) {
      return { valid: false, error: '描述至少需要5个字符' };
    }

    if (description.length > 300) {
      return { valid: false, error: '描述不能超过300个字符' };
    }

    // 检查是否包含阻止的模式
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(description)) {
        return { valid: false, error: '输入内容包含不安全的字符或模式' };
      }
    }
  } else {
    // 经典模板模式验证
    if (!body.scenario || typeof body.scenario !== 'string') {
      return { valid: false, error: '请选择祝福场景' };
    }

    if (!body.targetPerson || typeof body.targetPerson !== 'string') {
      return { valid: false, error: '请选择目标人群' };
    }

    // 检查是否包含阻止的模式
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(body.scenario) || pattern.test(body.targetPerson) ||
          (body.style && pattern.test(body.style)) ||
          (body.festival && pattern.test(body.festival))) {
        return { valid: false, error: '输入内容包含不安全的字符或模式' };
      }
    }
  }

  return { valid: true };
}

/**
 * 清理文本内容
 * 移除控制字符和潜在的危险内容
 * @param {string} text - 需要清理的文本
 * @returns {string} 清理后的文本
 */
function cleanText(text) {
  if (typeof text !== 'string') return '';

  return text
    // 移除控制字符（保留常见的空白字符）
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // 移除多余的空白字符
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = {
  validateInput,
  cleanText
};
import { createClient } from 'redis';

// 创建Redis客户端实例
const redisClient = createClient({
  url: process.env.KV_REDIS_URL || 'redis://localhost:6379'
});

// 连接Redis客户端
redisClient.on('error', (err) => {
  console.error('Redis Client Error:', err);
});

// 连接到Redis
if (!redisClient.isOpen) {
  redisClient.connect().catch(console.error);
}

/**
 * 速率限制配置
 */
const RATE_LIMIT_CONFIG = {
  // 分钟级限制
  minute: {
    window: 60, // 60秒
    max: 8,     // 最多8次请求
  },
  // 日级限制
  daily: {
    window: 24 * 60 * 60, // 24小时
    max: 50,              // 最多50次请求
  }
};

/**
 * 环境检测
 */
const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * 开发环境内存缓存（简单的速率限制）
 */
const memoryCache = new Map<string, { count: number; resetTime: number }>();

/**
 * 速率限制结果接口
 */
interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetTime: number;
  error?: string;
}

/**
 * 改进的IP检测函数，适配Vercel环境
 * @param request Next.js请求对象
 * @returns 客户端真实IP地址
 */
export function getClientIP(request: Request): string {
  const headers = request.headers;

  // Vercel特定的IP头，按优先级排序
  const ipSources = [
    'x-vercel-forwarded-for',    // Vercel边缘函数专用
    'cf-connecting-ip',          // Cloudflare代理
    'x-forwarded-for',           // 标准转发头
    'x-real-ip',                 // Nginx等反向代理
    'x-client-ip',               // 其他代理
  ];

  for (const source of ipSources) {
    const value = headers.get(source);
    if (value) {
      // 处理逗号分隔的IP列表，取第一个（最原始的客户端IP）
      const ip = value.split(',')[0]?.trim();
      if (ip && isValidIP(ip)) {
        return ip;
      }
    }
  }

  // 如果所有方法都失败，返回固定值而不是"unknown"
  // 这样可以避免所有无法识别IP的用户共享同一个限额
  return 'anonymous';
}

/**
 * 简单的IP地址格式验证
 * @param ip IP地址字符串
 * @returns 是否为有效IP
 */
function isValidIP(ip: string): boolean {
  // IPv4正则
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  // IPv6正则（简化版）
  const ipv6Regex = /^[0-9a-fA-F:]+$/;

  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}

/**
 * 开发环境的内存速率限制
 */
function checkMemoryRateLimit(identifier: string): RateLimitResult {
  const now = Math.floor(Date.now() / 1000);
  const key = `${identifier}:${Math.floor(now / RATE_LIMIT_CONFIG.minute.window)}`;

  const cached = memoryCache.get(key);
  const count = cached ? cached.count + 1 : 1;
  const resetTime = (Math.floor(now / RATE_LIMIT_CONFIG.minute.window) + 1) * RATE_LIMIT_CONFIG.minute.window;

  memoryCache.set(key, { count, resetTime });

  // 清理过期的缓存项
  for (const [k, v] of Array.from(memoryCache.entries())) {
    if (v.resetTime <= now) {
      memoryCache.delete(k);
    }
  }

  if (count > RATE_LIMIT_CONFIG.minute.max) {
    return {
      success: false,
      limit: RATE_LIMIT_CONFIG.minute.max,
      remaining: 0,
      resetTime,
      error: '请求太频繁，请稍后再试'
    };
  }

  return {
    success: true,
    limit: RATE_LIMIT_CONFIG.minute.max,
    remaining: RATE_LIMIT_CONFIG.minute.max - count,
    resetTime
  };
}

/**
 * 基于Redis的速率限制检查（生产环境）或内存限制（开发环境）
 * @param identifier 标识符（通常是IP地址）
 * @returns 限制检查结果
 */
export async function checkRateLimit(identifier: string): Promise<RateLimitResult> {
  // 如果Redis客户端未连接，则使用内存限制
  if (!redisClient.isOpen) {
    console.warn('Redis未连接，使用内存速率限制');
    return checkMemoryRateLimit(identifier);
  }

  try {
    const now = Math.floor(Date.now() / 1000);

    // 检查分钟级限制
    const minuteKey = `rate_limit:minute:${identifier}:${Math.floor(now / RATE_LIMIT_CONFIG.minute.window)}`;
    // 使用INCR命令增加计数并获取当前值
    const minuteCount = await redisClient.incr(minuteKey);

    // 为新键设置过期时间
    if (minuteCount === 1) {
      await redisClient.expire(minuteKey, RATE_LIMIT_CONFIG.minute.window);
    }

    if (minuteCount > RATE_LIMIT_CONFIG.minute.max) {
      return {
        success: false,
        limit: RATE_LIMIT_CONFIG.minute.max,
        remaining: 0,
        resetTime: (Math.floor(now / RATE_LIMIT_CONFIG.minute.window) + 1) * RATE_LIMIT_CONFIG.minute.window,
        error: '请求太频繁，请稍后再试'
      };
    }

    // 检查日级限制
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD格式
    const dailyKey = `rate_limit:daily:${identifier}:${today}`;
    const dailyCount = await redisClient.incr(dailyKey);

    // 为新键设置过期时间（到第二天）
    if (dailyCount === 1) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      const secondsUntilTomorrow = Math.floor((tomorrow.getTime() - Date.now()) / 1000);
      await redisClient.expire(dailyKey, secondsUntilTomorrow);
    }

    if (dailyCount > RATE_LIMIT_CONFIG.daily.max) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      return {
        success: false,
        limit: RATE_LIMIT_CONFIG.daily.max,
        remaining: 0,
        resetTime: Math.floor(tomorrow.getTime() / 1000),
        error: '今日使用次数已达上限'
      };
    }

    return {
      success: true,
      limit: RATE_LIMIT_CONFIG.minute.max,
      remaining: RATE_LIMIT_CONFIG.minute.max - minuteCount,
      resetTime: (Math.floor(now / RATE_LIMIT_CONFIG.minute.window) + 1) * RATE_LIMIT_CONFIG.minute.window
    };

  } catch (error) {
    console.error('速率限制检查失败:', error);

    // 开发环境降级为内存限制，生产环境拒绝请求
    if (isDevelopment) {
      console.warn('Redis不可用，降级为内存限制');
      return checkMemoryRateLimit(identifier);
    }

    // 生产环境保持严格策略
    return {
      success: false,
      limit: 0,
      remaining: 0,
      resetTime: Math.floor(Date.now() / 1000) + 60,
      error: '服务暂时不可用，请稍后重试'
    };
  }
}

/**
 * 获取速率限制状态（不增加计数）
 * @param identifier 标识符
 * @returns 当前限制状态
 */
export async function getRateLimitStatus(identifier: string): Promise<RateLimitResult> {
  // 如果Redis客户端未连接，则返回内存状态
  if (!redisClient.isOpen) {
    const now = Math.floor(Date.now() / 1000);
    const key = `${identifier}:${Math.floor(now / RATE_LIMIT_CONFIG.minute.window)}`;
    const cached = memoryCache.get(key);
    const count = cached?.count || 0;

    return {
      success: count < RATE_LIMIT_CONFIG.minute.max,
      limit: RATE_LIMIT_CONFIG.minute.max,
      remaining: Math.max(0, RATE_LIMIT_CONFIG.minute.max - count),
      resetTime: (Math.floor(now / RATE_LIMIT_CONFIG.minute.window) + 1) * RATE_LIMIT_CONFIG.minute.window
    };
  }

  try {
    const now = Math.floor(Date.now() / 1000);

    // 获取当前分钟的计数
    const minuteKey = `rate_limit:minute:${identifier}:${Math.floor(now / RATE_LIMIT_CONFIG.minute.window)}`;
    const minuteCount = await redisClient.get(minuteKey);
    const numericMinuteCount = minuteCount ? parseInt(minuteCount) : 0;

    // 获取当前日期的计数
    const today = new Date().toISOString().split('T')[0];
    const dailyKey = `rate_limit:daily:${identifier}:${today}`;
    const dailyCount = await redisClient.get(dailyKey);
    const numericDailyCount = dailyCount ? parseInt(dailyCount) : 0;

    const minuteRemaining = Math.max(0, RATE_LIMIT_CONFIG.minute.max - numericMinuteCount);
    const dailyRemaining = Math.max(0, RATE_LIMIT_CONFIG.daily.max - numericDailyCount);

    return {
      success: numericMinuteCount < RATE_LIMIT_CONFIG.minute.max && numericDailyCount < RATE_LIMIT_CONFIG.daily.max,
      limit: RATE_LIMIT_CONFIG.minute.max,
      remaining: Math.min(minuteRemaining, dailyRemaining),
      resetTime: (Math.floor(now / RATE_LIMIT_CONFIG.minute.window) + 1) * RATE_LIMIT_CONFIG.minute.window
    };

  } catch (error) {
    console.error('获取速率限制状态失败:', error);

    // 开发环境降级处理
    if (isDevelopment) {
      return {
        success: true,
        limit: RATE_LIMIT_CONFIG.minute.max,
        remaining: RATE_LIMIT_CONFIG.minute.max,
        resetTime: Math.floor(Date.now() / 1000) + 60
      };
    }

    return {
      success: false,
      limit: 0,
      remaining: 0,
      resetTime: Math.floor(Date.now() / 1000) + 60,
      error: '无法获取限制状态'
    };
  }
}
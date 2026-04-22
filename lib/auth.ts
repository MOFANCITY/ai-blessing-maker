import * as crypto from 'crypto';

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-in-production';

/**
 * JWT Token Payload 接口
 */
export interface TokenPayload {
  userId: string;
  openid: string;
}

/**
 * 生成 JWT token
 */
export function generateToken(userId: string, openid: string): string {
  // 使用 URL-safe base64 编码
  const toBase64Url = (str: string) => {
    return Buffer.from(str)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  };

  const header = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = toBase64Url(JSON.stringify({
    sub: userId,
    openid,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor((Date.now() + 7 * 24 * 60 * 60 * 1000) / 1000), // 7天有效期
  }));

  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return `${header}.${payload}.${signature}`;
}

/**
 * 验证用户 token
 */
export function verifyToken(token: string): TokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [header, payload, signature] = parts;

    // 解码 URL-safe base64
    const fromBase64Url = (str: string) => {
      const base64 = str
        .replace(/-/g, '+')
        .replace(/_/g, '/');
      const padding = base64.length % 4;
      return base64 + '='.repeat(padding === 0 ? 0 : 4 - padding);
    };

    const expectedSignature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${header}.${payload}`)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    if (signature !== expectedSignature) return null;

    const decodedPayload = fromBase64Url(payload);
    const decoded = JSON.parse(Buffer.from(decodedPayload, 'base64').toString());

    if (decoded.exp < Math.floor(Date.now() / 1000)) return null;

    return {
      userId: decoded.sub,
      openid: decoded.openid,
    };
  } catch {
    return null;
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { WechatLoginRequest, UserLoginResponse } from '@/lib/types/auth';
import { userDb } from '@/lib/supabase';
import { verifyToken } from '@/lib/auth';
import * as crypto from 'crypto';

/**
 * 微信登录 API
 * POST /api/auth/wechat/login
 */
export async function POST(request: NextRequest): Promise<NextResponse<UserLoginResponse | { error: string }>> {
  try {
    const body: WechatLoginRequest = await request.json();
    const { code, userInfo } = body;

    if (!code) {
      return NextResponse.json(
        { error: '缺少微信登录凭证 code' },
        { status: 400 }
      );
    }

    // 调用微信接口获取 openid (使用 Mini Program 专用接口)
    const wechatResponse = await fetch(
      `https://api.weixin.qq.com/sns/jscode2session?appid=${process.env.WECHAT_APP_ID}&secret=${process.env.WECHAT_APP_SECRET}&js_code=${code}&grant_type=authorization_code`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    const wechatData = await wechatResponse.json();

    if (wechatData.errcode) {
      console.error('微信登录失败:', wechatData);
      return NextResponse.json(
        { error: `微信登录失败: ${wechatData.errmsg}` },
        { status: 400 }
      );
    }

    const { openid, unionid, expires_in } = wechatData;

    // 使用 Supabase 查询用户
    let user = await userDb.getUserByOpenid(openid);

    if (!user) {
      // 创建新用户
      user = await userDb.createUser({
        openid,
        unionid: unionid || undefined,
        nickname: userInfo?.nickName || '微信用户',
        avatar_url: userInfo?.avatarUrl || undefined,
      });
      console.log('新用户创建成功:', user.id);
    } else {
      // 更新用户信息
      await userDb.updateUser(openid, {
        nickname: userInfo?.nickName || user.nickname,
        avatar_url: userInfo?.avatarUrl || user.avatar_url,
        last_login_at: true,
      });
      console.log('用户登录更新:', user.id);
    }

    // 生成 JWT token
    const token = generateToken(user.id, openid);

    // 构建响应
    const response: UserLoginResponse = {
      success: true,
      user: {
        id: user.id,
        openid: user.openid,
        unionid: user.unionid,
        nickname: user.nickname,
        avatarUrl: user.avatar_url,
        createdAt: user.created_at,
        lastLoginAt: user.last_login_at,
        totalBlessingsGenerated: user.total_blessings_generated || 0,
      },
      token,
    };

    // 设置 Cookie（有效期与微信 access_token 相同）
    const cookieOptions = `Path=/; HttpOnly; SameSite=Lax; Max-Age=${expires_in}`;
    
    return NextResponse.json(response, {
      status: 200,
      headers: {
        'Set-Cookie': `auth_token=${token}; ${cookieOptions}`,
      },
    });
  } catch (error) {
    console.error('登录处理错误:', error);
    return NextResponse.json(
      { error: '登录失败，请稍后重试' },
      { status: 500 }
    );
  }
}

/**
 * 验证用户并获取用户信息
 * GET /api/auth/wechat/login
 */
export async function GET(request: NextRequest): Promise<NextResponse<{ user: unknown } | { error: string }>> {
  try {
    // 从 Cookie 获取 token
    const token = request.cookies.get('auth_token')?.value;

    if (!token) {
      return NextResponse.json(
        { error: '未登录' },
        { status: 401 }
      );
    }

    // 验证 token
    const decoded = verifyToken(token);
    
    if (!decoded) {
      return NextResponse.json(
        { error: '登录已过期' },
        { status: 401 }
      );
    }

    // 获取用户信息
    const user = await userDb.getUserByOpenid(decoded.openid);

    if (!user) {
      return NextResponse.json(
        { error: '用户不存在' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      user: {
        id: user.id,
        openid: user.openid,
        unionid: user.unionid,
        nickname: user.nickname,
        avatarUrl: user.avatar_url,
        createdAt: user.created_at,
        lastLoginAt: user.last_login_at,
        totalBlessingsGenerated: user.total_blessings_generated || 0,
      },
    });
  } catch (error) {
    console.error('验证用户失败:', error);
    return NextResponse.json(
      { error: '验证失败' },
      { status: 500 }
    );
  }
}

/**
 * 生成 JWT token
 */
function generateToken(userId: string, openid: string): string {
  const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-in-production';

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
    iat: Date.now(),
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7天有效期
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

import { NextRequest, NextResponse } from 'next/server';
import { WechatLoginRequest, UserLoginResponse } from '@/lib/types/auth';
import { supabase, userDb, TABLES } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';

// 微信小程序配置
const WECHAT_APP_ID = process.env.WECHAT_APP_ID;
const WECHAT_APP_SECRET = process.env.WECHAT_APP_SECRET;

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-in-production';

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

    // 调用微信接口获取 openid 和 session_key
    const wechatResponse = await fetch(
      `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${WECHAT_APP_ID}&secret=${WECHAT_APP_SECRET}&code=${code}&grant_type=authorization_code`,
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

    const { openid, unionid, access_token, expires_in } = wechatData;

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
export async function GET(request: NextRequest): Promise<NextResponse<{ user: any } | { error: string }>> {
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
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
  const payload = Buffer.from(JSON.stringify({
    sub: userId,
    openid,
    iat: Date.now(),
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7天有效期
  })).toString('base64');
  
  const crypto = require('crypto');
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64');
  
  return `${header}.${payload}.${signature}`;
}

/**
 * 验证 JWT token
 */
function verifyToken(token: string): { userId: string; openid: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const [header, payload, signature] = parts;
    
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${header}.${payload}`)
      .digest('base64');
    
    if (signature !== expectedSignature) return null;
    
    const decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
    
    if (decoded.exp < Date.now()) return null;
    
    return {
      userId: decoded.sub,
      openid: decoded.openid,
    };
  } catch (error) {
    return null;
  }
}

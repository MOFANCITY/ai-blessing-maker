import { NextRequest, NextResponse } from 'next/server';
import { supabase, historyDb } from '@/lib/supabase';
import * as crypto from 'crypto';
import { UserHistory } from '@/lib/types/auth';

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-in-production';

/**
 * 验证用户 token
 */
interface TokenPayload {
  userId: string;
  openid: string;
}

function verifyToken(token: string): TokenPayload | null {
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

    if (decoded.exp < Date.now()) return null;

    return {
      userId: decoded.sub,
      openid: decoded.openid,
    };
  } catch {
    return null;
  }
}

/**
 * 获取用户历史记录
 * GET /api/user/history
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // 从 Cookie 获取 token
    const token = request.cookies.get('auth_token')?.value || request.headers.get('authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return NextResponse.json(
        { error: '用户未登录' },
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

    // 从 URL 获取 limit 参数
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    // 获取用户信息
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('openid', decoded.openid)
      .single();
    
    if (userError || !users) {
      return NextResponse.json(
        { error: '用户不存在' },
        { status: 404 }
      );
    }

    const history = await historyDb.getUserHistory(users.id, limit);

    return NextResponse.json({
      success: true,
      history: history.map((item: UserHistory) => ({
        id: item.id,
        blessing: item.blessing,
        occasion: item.occasion,
        targetPerson: item.targetPerson,
        style: item.style,
        createdAt: item.createdAt,
      })),
    });
  } catch (error) {
    console.error('获取历史记录失败:', error);
    return NextResponse.json(
      { error: '获取历史记录失败' },
      { status: 500 }
    );
  }
}

/**
 * 添加用户历史记录
 * POST /api/user/history
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // 从 Cookie 获取 token
    const token = request.cookies.get('auth_token')?.value || request.headers.get('authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return NextResponse.json(
        { error: '用户未登录' },
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

    const body = await request.json();
    const { blessing, occasion, targetPerson, style } = body;

    if (!blessing) {
      return NextResponse.json(
        { error: '缺少祝福语内容' },
        { status: 400 }
      );
    }

    // 获取用户信息
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('openid', decoded.openid)
      .single();
    
    if (userError || !user) {
      return NextResponse.json(
        { error: '用户不存在' },
        { status: 404 }
      );
    }

    // 添加历史记录
    const historyItem = await historyDb.addHistory({
      user_id: user.id,
      blessing,
      occasion,
      target_person: targetPerson,
      style: style || '传统',
    });

    return NextResponse.json({
      success: true,
      historyItem: {
        id: historyItem.id,
        blessing: historyItem.blessing,
        occasion: historyItem.occasion,
        targetPerson: historyItem.target_person,
        style: historyItem.style,
        createdAt: historyItem.created_at,
      },
    });
  } catch (error) {
    console.error('保存历史记录失败:', error);
    return NextResponse.json(
      { error: '保存历史记录失败' },
      { status: 500 }
    );
  }
}

/**
 * 删除历史记录
 * DELETE /api/user/history?id=xxx
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    // 从 Cookie 获取 token
    const token = request.cookies.get('auth_token')?.value || request.headers.get('authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return NextResponse.json(
        { error: '用户未登录' },
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

    // 获取历史记录 ID
    const { searchParams } = new URL(request.url);
    const historyId = searchParams.get('id');

    if (!historyId) {
      return NextResponse.json(
        { error: '缺少历史记录 ID' },
        { status: 400 }
      );
    }

    // 获取用户信息
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('openid', decoded.openid)
      .single();
    
    if (!user) {
      return NextResponse.json(
        { error: '用户不存在' },
        { status: 404 }
      );
    }

    // 删除历史记录
    await historyDb.deleteHistory(historyId, user.id);

    return NextResponse.json({
      success: true,
      message: '删除成功',
    });
  } catch (error) {
    console.error('删除历史记录失败:', error);
    return NextResponse.json(
      { error: '删除历史记录失败' },
      { status: 500 }
    );
  }
}

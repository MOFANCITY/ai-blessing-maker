import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { verifyToken } from '@/lib/auth';

/**
 * 获取用户资料
 * GET /api/user/profile
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

    // 获取用户信息
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, openid, unionid, nickname, avatar_url, created_at, last_login_at, total_blessings_generated')
      .eq('openid', decoded.openid)
      .single();

    if (userError || !user) {
      return NextResponse.json(
        { error: '用户不存在' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        openid: user.openid,
        unionid: user.unionid,
        nickname: user.nickname,
        avatarUrl: user.avatar_url,
        createdAt: user.created_at,
        lastLoginAt: user.last_login_at,
        totalBlessingsGenerated: user.total_blessings_generated,
      },
    });
  } catch (error) {
    console.error('获取用户资料失败:', error);
    return NextResponse.json(
      { error: '获取用户资料失败' },
      { status: 500 }
    );
  }
}

/**
 * 更新用户资料
 * PUT /api/user/profile
 */
export async function PUT(request: NextRequest): Promise<NextResponse> {
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
    const { nickname, avatarUrl } = body;

    // 验证输入
    if (nickname !== undefined && (typeof nickname !== 'string' || nickname.trim().length === 0 || nickname.length > 100)) {
      return NextResponse.json(
        { error: '昵称不能为空且长度不能超过100个字符' },
        { status: 400 }
      );
    }

    if (avatarUrl !== undefined && (typeof avatarUrl !== 'string' || avatarUrl.length > 500)) {
      return NextResponse.json(
        { error: '头像URL长度不能超过500个字符' },
        { status: 400 }
      );
    }

    // 构建更新数据
    const updateData: { nickname?: string; avatar_url?: string } = {};
    if (nickname !== undefined) {
      updateData.nickname = nickname.trim();
    }
    if (avatarUrl !== undefined) {
      updateData.avatar_url = avatarUrl;
    }

    // 如果没有要更新的字段
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: '没有要更新的字段' },
        { status: 400 }
      );
    }

    // 更新用户信息
    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update(updateData)
      .eq('openid', decoded.openid)
      .select('id, openid, unionid, nickname, avatar_url, created_at, last_login_at, total_blessings_generated')
      .single();

    if (updateError) {
      console.error('更新用户资料失败:', updateError);
      return NextResponse.json(
        { error: '更新用户资料失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      user: {
        id: updatedUser.id,
        openid: updatedUser.openid,
        unionid: updatedUser.unionid,
        nickname: updatedUser.nickname,
        avatarUrl: updatedUser.avatar_url,
        createdAt: updatedUser.created_at,
        lastLoginAt: updatedUser.last_login_at,
        totalBlessingsGenerated: updatedUser.total_blessings_generated,
      },
    });
  } catch (error) {
    console.error('更新用户资料失败:', error);
    return NextResponse.json(
      { error: '更新用户资料失败' },
      { status: 500 }
    );
  }
}

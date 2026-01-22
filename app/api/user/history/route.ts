import { NextRequest, NextResponse } from 'next/server';
import { supabase, historyDb } from '@/lib/supabase';
import { verifyToken } from '@/lib/auth';
import { UserHistory } from '@/lib/types/auth';

/**
 * 获取用户历史记录或统计数据
 * GET /api/user/history - 获取历史记录
 * GET /api/user/history?stats=true - 获取祝福语统计数据
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

    // 从 URL 获取参数
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || searchParams.get('limit') || '10', 10);
    const isStatsRequest = searchParams.get('stats') === 'true';

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

    // 如果是统计请求，返回统计数据
    if (isStatsRequest) {
      // 获取总数
      const { count: totalCount, error: totalError } = await supabase
        .from('user_history')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', users.id);

      if (totalError) {
        throw totalError;
      }

      // 获取当月数量
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      const { count: monthlyCount, error: monthlyError } = await supabase
        .from('user_history')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', users.id)
        .gte('created_at', startOfMonth.toISOString())
        .lte('created_at', endOfMonth.toISOString());

      if (monthlyError) {
        throw monthlyError;
      }

      return NextResponse.json({
        success: true,
        stats: {
          total: totalCount || 0,
          monthly: monthlyCount || 0,
        },
      });
    }

    const { data: history, total } = await historyDb.getUserHistory(users.id, page, pageSize);

    return NextResponse.json({
      success: true,
      data: history.map((item: UserHistory) => ({
        id: item.id,
        blessing: item.blessing,
        occasion: item.occasion,
        targetPerson: item.targetPerson,
        style: item.style,
        createdAt: item.createdAt,
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
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

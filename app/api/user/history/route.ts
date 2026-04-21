import { NextRequest, NextResponse } from 'next/server';
import { db, historyDb } from '@/lib/db';
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
    const userResult = await db.execute({
      sql: 'SELECT id FROM users WHERE openid = ? LIMIT 1',
      args: [decoded.openid],
    });
    const users = userResult.rows[0];

    if (!users) {
      return NextResponse.json(
        { error: '用户不存在' },
        { status: 404 }
      );
    }

    // 如果是统计请求，返回统计数据
    if (isStatsRequest) {
      const stats = await historyDb.getStats(String(users.id));
      return NextResponse.json({ success: true, stats });
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
    const userResult = await db.execute({
      sql: 'SELECT id FROM users WHERE openid = ? LIMIT 1',
      args: [decoded.openid],
    });
    const user = userResult.rows[0];
    
    if (!user) {
      return NextResponse.json(
        { error: '用户不存在' },
        { status: 404 }
      );
    }

    // 添加历史记录
    const historyItem = await historyDb.addHistory({
      user_id: String(user.id),
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
    const userResult = await db.execute({
      sql: 'SELECT id FROM users WHERE openid = ? LIMIT 1',
      args: [decoded.openid],
    });
    const user = userResult.rows[0];
    
    if (!user) {
      return NextResponse.json(
        { error: '用户不存在' },
        { status: 404 }
      );
    }

    // 删除历史记录
    await historyDb.deleteHistory(historyId, String(user.id));

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

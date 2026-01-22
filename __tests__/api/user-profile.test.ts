import { GET, PUT } from '@/app/api/user/profile/route'
import { NextRequest } from 'next/server'
import * as supabase from '@/lib/supabase'
import * as auth from '@/lib/auth'

// Mock dependencies
jest.mock('@/lib/supabase')
jest.mock('@/lib/auth')

const mockSupabase = supabase.supabase as jest.MockedObject<typeof supabase.supabase>
const mockVerifyToken = auth.verifyToken as jest.MockedFunction<typeof auth.verifyToken>

describe('/api/user/profile', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('GET /api/user/profile', () => {
    it('successfully gets user profile', async () => {
      const mockToken = 'valid-token'
      const mockDecoded = { userId: 'user-123', openid: 'openid-123' }
      const mockUser = {
        id: 'user-123',
        openid: 'openid-123',
        unionid: 'unionid-123',
        nickname: '测试用户',
        avatar_url: 'https://example.com/avatar.jpg',
        created_at: '2024-01-01T00:00:00Z',
        last_login_at: '2024-01-01T00:00:00Z',
        total_blessings_generated: 10
      }

      mockVerifyToken.mockReturnValue(mockDecoded)
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockUser,
              error: null
            })
          })
        })
      } as any)

      const mockRequest = {
        cookies: {
          get: jest.fn().mockReturnValue({ value: mockToken })
        }
      } as unknown as NextRequest

      const response = await GET(mockRequest)
      const responseData = await response.json()

      expect(mockVerifyToken).toHaveBeenCalledWith(mockToken)
      expect(mockSupabase.from).toHaveBeenCalledWith('users')
      expect(response.status).toBe(200)
      expect(responseData).toEqual({
        success: true,
        user: {
          id: mockUser.id,
          openid: mockUser.openid,
          unionid: mockUser.unionid,
          nickname: mockUser.nickname,
          avatarUrl: mockUser.avatar_url,
          createdAt: mockUser.created_at,
          lastLoginAt: mockUser.last_login_at,
          totalBlessingsGenerated: mockUser.total_blessings_generated
        }
      })
    })

    it('returns 401 when no token provided', async () => {
      const mockRequest = {
        cookies: {
          get: jest.fn().mockReturnValue(null)
        },
        headers: {
          get: jest.fn().mockReturnValue(null)
        }
      } as unknown as NextRequest

      const response = await GET(mockRequest)
      const responseData = await response.json()

      expect(response.status).toBe(401)
      expect(responseData.error).toBe('用户未登录')
    })

    it('returns 401 when token is invalid', async () => {
      const mockToken = 'invalid-token'

      mockVerifyToken.mockReturnValue(null)

      const mockRequest = {
        cookies: {
          get: jest.fn().mockReturnValue({ value: mockToken })
        }
      } as unknown as NextRequest

      const response = await GET(mockRequest)
      const responseData = await response.json()

      expect(mockVerifyToken).toHaveBeenCalledWith(mockToken)
      expect(response.status).toBe(401)
      expect(responseData.error).toBe('登录已过期')
    })

    it('returns 404 when user not found', async () => {
      const mockToken = 'valid-token'
      const mockDecoded = { userId: 'user-123', openid: 'openid-123' }

      mockVerifyToken.mockReturnValue(mockDecoded)
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: new Error('User not found')
            })
          })
        })
      } as any)

      const mockRequest = {
        cookies: {
          get: jest.fn().mockReturnValue({ value: mockToken })
        }
      } as unknown as NextRequest

      const response = await GET(mockRequest)
      const responseData = await response.json()

      expect(response.status).toBe(404)
      expect(responseData.error).toBe('用户不存在')
    })
  })

  describe('PUT /api/user/profile', () => {
    it('successfully updates user profile', async () => {
      const mockToken = 'valid-token'
      const mockDecoded = { userId: 'user-123', openid: 'openid-123' }
      const requestBody = { nickname: '新昵称', avatarUrl: 'https://example.com/new-avatar.jpg' }
      const mockUpdatedUser = {
        id: 'user-123',
        openid: 'openid-123',
        unionid: 'unionid-123',
        nickname: '新昵称',
        avatar_url: 'https://example.com/new-avatar.jpg',
        created_at: '2024-01-01T00:00:00Z',
        last_login_at: '2024-01-01T00:00:00Z',
        total_blessings_generated: 10
      }

      mockVerifyToken.mockReturnValue(mockDecoded)
      mockSupabase.from.mockReturnValue({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: mockUpdatedUser,
                error: null
              })
            })
          })
        })
      } as any)

      const mockRequest = {
        cookies: {
          get: jest.fn().mockReturnValue({ value: mockToken })
        },
        json: jest.fn().mockResolvedValue(requestBody)
      } as unknown as NextRequest

      const response = await PUT(mockRequest)
      const responseData = await response.json()

      expect(mockVerifyToken).toHaveBeenCalledWith(mockToken)
      expect(mockSupabase.from).toHaveBeenCalledWith('users')
      expect(response.status).toBe(200)
      expect(responseData).toEqual({
        success: true,
        user: {
          id: mockUpdatedUser.id,
          openid: mockUpdatedUser.openid,
          unionid: mockUpdatedUser.unionid,
          nickname: mockUpdatedUser.nickname,
          avatarUrl: mockUpdatedUser.avatar_url,
          createdAt: mockUpdatedUser.created_at,
          lastLoginAt: mockUpdatedUser.last_login_at,
          totalBlessingsGenerated: mockUpdatedUser.total_blessings_generated
        }
      })
    })

    it('returns 400 when nickname is empty', async () => {
      const mockToken = 'valid-token'
      const mockDecoded = { userId: 'user-123', openid: 'openid-123' }
      const requestBody = { nickname: '' }

      mockVerifyToken.mockReturnValue(mockDecoded)

      const mockRequest = {
        cookies: {
          get: jest.fn().mockReturnValue({ value: mockToken })
        },
        json: jest.fn().mockResolvedValue(requestBody)
      } as unknown as NextRequest

      const response = await PUT(mockRequest)
      const responseData = await response.json()

      expect(response.status).toBe(400)
      expect(responseData.error).toBe('昵称不能为空且长度不能超过100个字符')
    })

    it('returns 400 when nickname is too long', async () => {
      const mockToken = 'valid-token'
      const mockDecoded = { userId: 'user-123', openid: 'openid-123' }
      const requestBody = { nickname: 'a'.repeat(101) }

      mockVerifyToken.mockReturnValue(mockDecoded)

      const mockRequest = {
        cookies: {
          get: jest.fn().mockReturnValue({ value: mockToken })
        },
        json: jest.fn().mockResolvedValue(requestBody)
      } as unknown as NextRequest

      const response = await PUT(mockRequest)
      const responseData = await response.json()

      expect(response.status).toBe(400)
      expect(responseData.error).toBe('昵称不能为空且长度不能超过100个字符')
    })

    it('returns 400 when avatarUrl is too long', async () => {
      const mockToken = 'valid-token'
      const mockDecoded = { userId: 'user-123', openid: 'openid-123' }
      const requestBody = { avatarUrl: 'a'.repeat(501) }

      mockVerifyToken.mockReturnValue(mockDecoded)

      const mockRequest = {
        cookies: {
          get: jest.fn().mockReturnValue({ value: mockToken })
        },
        json: jest.fn().mockResolvedValue(requestBody)
      } as unknown as NextRequest

      const response = await PUT(mockRequest)
      const responseData = await response.json()

      expect(response.status).toBe(400)
      expect(responseData.error).toBe('头像URL长度不能超过500个字符')
    })

    it('returns 400 when no fields to update', async () => {
      const mockToken = 'valid-token'
      const mockDecoded = { userId: 'user-123', openid: 'openid-123' }
      const requestBody = {}

      mockVerifyToken.mockReturnValue(mockDecoded)

      const mockRequest = {
        cookies: {
          get: jest.fn().mockReturnValue({ value: mockToken })
        },
        json: jest.fn().mockResolvedValue(requestBody)
      } as unknown as NextRequest

      const response = await PUT(mockRequest)
      const responseData = await response.json()

      expect(response.status).toBe(400)
      expect(responseData.error).toBe('没有要更新的字段')
    })

    it('returns 401 when no token provided', async () => {
      const requestBody = { nickname: '新昵称' }

      const mockRequest = {
        cookies: {
          get: jest.fn().mockReturnValue(null)
        },
        headers: {
          get: jest.fn().mockReturnValue(null)
        },
        json: jest.fn().mockResolvedValue(requestBody)
      } as unknown as NextRequest

      const response = await PUT(mockRequest)
      const responseData = await response.json()

      expect(response.status).toBe(401)
      expect(responseData.error).toBe('用户未登录')
    })

    it('returns 401 when token is invalid', async () => {
      const mockToken = 'invalid-token'
      const requestBody = { nickname: '新昵称' }

      mockVerifyToken.mockReturnValue(null)

      const mockRequest = {
        cookies: {
          get: jest.fn().mockReturnValue({ value: mockToken })
        },
        json: jest.fn().mockResolvedValue(requestBody)
      } as unknown as NextRequest

      const response = await PUT(mockRequest)
      const responseData = await response.json()

      expect(response.status).toBe(401)
      expect(responseData.error).toBe('登录已过期')
    })

    it('handles database update errors', async () => {
      const mockToken = 'valid-token'
      const mockDecoded = { userId: 'user-123', openid: 'openid-123' }
      const requestBody = { nickname: '新昵称' }

      mockVerifyToken.mockReturnValue(mockDecoded)
      mockSupabase.from.mockReturnValue({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: null,
                error: new Error('Database error')
              })
            })
          })
        })
      } as any)

      const mockRequest = {
        cookies: {
          get: jest.fn().mockReturnValue({ value: mockToken })
        },
        json: jest.fn().mockResolvedValue(requestBody)
      } as unknown as NextRequest

      const response = await PUT(mockRequest)
      const responseData = await response.json()

      expect(response.status).toBe(500)
      expect(responseData.error).toBe('更新用户资料失败')
    })
  })
})

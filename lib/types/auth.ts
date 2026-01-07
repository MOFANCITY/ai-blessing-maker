/**
 * 微信登录凭证
 */
export interface WechatLoginCode {
  code: string;
}

/**
 * 微信用户信息
 */
export interface WechatUserInfo {
  nickName: string;
  avatarUrl: string;
  gender: number;
  city: string;
  province: string;
  country: string;
  language: string;
}

/**
 * 微信登录请求
 */
export interface WechatLoginRequest {
  code: string;
  userInfo?: WechatUserInfo;
  iv?: string;
  encryptedData?: string;
}

/**
 * 用户登录响应
 */
export interface UserLoginResponse {
  success: boolean;
  user: {
    id: string;
    openid: string;
    unionid?: string;
    nickname: string;
    avatarUrl: string;
    createdAt: string;
    lastLoginAt: string;
    totalBlessingsGenerated: number;
  };
  token: string;
}

/**
 * 用户对象
 */
export interface User {
  id: string;
  openid: string;
  unionid?: string;
  nickname: string;
  avatarUrl: string;
  createdAt: Date;
  lastLoginAt: Date;
  totalBlessingsGenerated: number;
}

/**
 * 用户使用历史记录
 */
export interface UserHistory {
  id: string;
  userId: string;
  blessing: string;
  occasion: string;
  targetPerson: string;
  style: string;
  createdAt: Date;
}

/**
 * 生成祝福语请求（带用户认证）
 */
export interface AuthenticatedBlessingRequest {
  occasion?: string;
  targetPerson?: string;
  style?: string;
  customDescription?: string;
  useSmartMode?: boolean;
}

/**
 * API 错误响应
 */
export interface ApiErrorResponse {
  error: string;
  code?: string;
}

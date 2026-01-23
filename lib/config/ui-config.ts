/**
 * 小程序端配置接口
 * 定义了控制小程序端各种功能展示的配置项
 */
export interface UIConfig {
  // 功能开关
  features: {
    smartMode: boolean;        // 智能模式开关
    templateMode: boolean;     // 模板模式开关
    feedback: boolean;         // 反馈功能开关
    showGenerateImageBtn: boolean; // 生成图片按钮显示开关
  }
}

/**
 * 默认配置
 * 提供小程序端的默认配置值
 */
export const defaultUIConfig: UIConfig = {
  features: {
    smartMode: true,
    templateMode: true,
    feedback: true,
    showGenerateImageBtn: false
  }
};

/**
 * 获取UI配置
 * 可以根据不同条件返回不同的配置版本
 * @param version - 可选的配置版本号
 * @returns UI配置对象
 */
export function getUIConfig(version?: string): UIConfig {
  // 这里可以根据版本号或其他条件返回不同的配置
  return {
    ...defaultUIConfig
  };
}
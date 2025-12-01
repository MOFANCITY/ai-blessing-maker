/**
 * API配置文件
 */

// API配置
const API_CONFIG = {
  // 开发环境
  development: {
    baseUrl: 'http://localhost:3000',
    endpoint: '/api/blessing'
  },
  // 生产环境 - 需要替换为你的实际部署地址
  production: {
    baseUrl: 'https://your-deployed-app.vercel.app', // 替换为你的实际部署地址
    endpoint: '/api/blessing'
  }
};

// 当前环境 - 在开发时使用development，部署时改为production
const CURRENT_ENV = 'development';

// 导出当前环境的API配置
const currentConfig = API_CONFIG[CURRENT_ENV];

module.exports = {
  API_BASE_URL: currentConfig.baseUrl,
  API_ENDPOINT: currentConfig.endpoint,
  // 完整的API URL
  API_URL: currentConfig.baseUrl + currentConfig.endpoint
};
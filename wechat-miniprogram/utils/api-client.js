/**
 * 祝福语生成选项接口定义
 * 支持两种模式：经典模板模式和智能描述模式
 */
// Note: In JavaScript, we don't have interfaces, but we can document the expected structure

/**
 * 生成祝福语函数
 * 通过 API 调用后端服务生成个性化祝福语
 * @param {Object} options - 祝福语生成选项，包含场景、风格等信息
 * @returns {Promise<string>} 返回生成的祝福语文本
 */
function generateBlessing(options) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: 'https://your-domain.com/api/blessing', // 需要替换为实际的API域名
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
      },
      data: options,
      success(res) {
        if (res.statusCode === 200 && res.data && res.data.blessing) {
          resolve(res.data.blessing);
        } else {
          const errorMsg = res.data && res.data.error ? res.data.error : '生成祝福语失败';
          reject(new Error(errorMsg));
        }
      },
      fail(err) {
        console.error('API调用失败:', err);
        reject(new Error('网络错误，请检查网络连接'));
      }
    });
  });
}

module.exports = {
  generateBlessing
};
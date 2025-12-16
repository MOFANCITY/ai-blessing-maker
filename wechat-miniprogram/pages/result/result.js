// 导入 API 调用函数
const { generateBlessing } = require('../../utils/api-client.js');

Page({
  data: {
    // 状态管理
    blessing: '',           // 生成的祝福语内容
    loading: false,         // 加载状态
    error: '',              // 错误信息
    copySuccess: false,     // 复制成功状态
    copyFading: false,      // 复制提示淡出动画状态
    showLongPressMenu: false, // 长按菜单显示状态
    showEnvelope: false,    // 信封飞出动画状态

    // 表单数据（用于重新生成）
    formData: {}
  },

  /**
   * 页面加载时获取传递的数据
   */
  onLoad(options) {
    // 从页面参数中获取祝福语内容和表单数据
    if (options.blessing) {
      this.setData({
        blessing: decodeURIComponent(options.blessing)
      });
    }

    // 获取表单数据（用于重新生成）
    if (options.formData) {
      this.setData({
        formData: JSON.parse(decodeURIComponent(options.formData))
      });
    }
  },

  /**
   * 处理复制祝福语功能
   * 将生成的祝福语复制到系统剪贴板，并显示成功提示
   */
  onCopy() {
    const that = this;
    wx.setClipboardData({
      data: this.data.blessing,
      success() {
        that.setData({
          copySuccess: true,
          copyFading: false
        });

        // 2.5秒后开始淡出动画
        setTimeout(() => {
          that.setData({ copyFading: true });
        }, 2500);

        // 3秒后完全隐藏提示
        setTimeout(() => {
          that.setData({
            copySuccess: false,
            copyFading: false
          });
        }, 3000);
      },
      fail(err) {
        console.error('复制失败:', err);
        that.setData({
          error: '复制失败，请手动选择文字复制'
        });
      }
    });
  },

  /**
   * 处理重新生成操作
   * 使用相同参数重新调用 API 生成祝福语
   */
  onRegenerate() {
    const { formData } = this.data;

    // 开始加载
    this.setData({
      loading: true,
      error: ''
    });

    // 使用当前选项重新生成
    generateBlessing(formData)
      .then(result => {
        this.setData({
          loading: false,
          blessing: result
        });
      })
      .catch(err => {
        this.setData({
          error: err.message || '生成失败，请重试',
          loading: false
        });
      });
  },

  /**
   * 处理卡片长按事件
   * 显示长按菜单
   */
  onLongPressCard() {
    this.setData({
      showLongPressMenu: true
    });
  },

  /**
   * 隐藏长按菜单
   */
  hideLongPressMenu() {
    this.setData({
      showLongPressMenu: false
    });
  },

  /**
   * 处理语音播放功能
   */
  onVoicePlay() {
    const that = this;
    wx.showModal({
      title: '语音播放',
      content: '语音播放功能正在开发中，请暂时阅读文字内容',
      showCancel: false,
      confirmText: '知道了'
    });
  },

  /**
   * 保存祝福语为图片
   */
  onSaveImage() {
    const that = this;
    this.setData({
      showLongPressMenu: false
    });

    // 这里可以实现保存为图片的功能
    // 由于微信小程序的限制，这里暂时显示提示
    wx.showToast({
      title: '图片保存功能开发中',
      icon: 'none',
      duration: 2000
    });
  }
});
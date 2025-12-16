// 导入配置数据
const { scenarios, festivals, targetPersons, styles } = require('../../utils/config.js');
// 导入 API 调用函数
const { generateBlessing } = require('../../utils/api-client.js');
// 导入验证函数
const { validateInput, cleanText } = require('../../utils/validation.js');

Page({
  data: {
    // 表单数据
    formData: {
      scenario: '',
      festival: '',
      targetPerson: '',
      style: '传统', // 默认传统风格
      customDescription: '',
      useSmartMode: false // 默认模板模式
    },

    // 状态管理
    blessing: '',           // 生成的祝福语内容
    loading: false,         // 加载状态
    error: '',              // 错误信息
    copySuccess: false,     // 复制成功状态
    copyFading: false,      // 复制提示淡出动画状态
    formError: false,       // 表单验证错误状态
    showLongPressMenu: false, // 长按菜单显示状态
    showEnvelope: false,    // 信封飞出动画状态
    currentStep: 1,         // 当前步骤，用于逐步引导模式

    // 配置数据
    scenarios: scenarios,
    festivals: festivals,
    targetPersons: targetPersons,
    styles: styles,

    // Picker索引 - 初始化为默认值的索引
    scenarioIndex: 0,
    festivalIndex: 0,
    targetPersonIndex: 0,
    styleIndex: styles.findIndex(style => style.value === '传统')
  },

  /**
   * 切换输入模式
   * 在两种模式之间切换，并清空相应的表单数据
   * @param {Object} e - 事件对象
   */
  toggleMode(e) {
    const useSmartMode = e.currentTarget.dataset.mode === 'smart';

    this.setData({
      'formData.useSmartMode': useSmartMode,
      // 根据模式清空不同的字段
      ...(useSmartMode ? {
        'formData.scenario': '',
        'formData.festival': '',
        'formData.targetPerson': '',
        'formData.style': '传统'
      } : {
        'formData.customDescription': ''
      }),
      // 重置picker索引
      scenarioIndex: 0,
      festivalIndex: 0,
      targetPersonIndex: 0,
      styleIndex: this.data.styles.findIndex(style => style.value === '传统'),
      // 清空结果和错误
      blessing: '',
      error: ''
    });
  },

  /**
   * 下一步
   */
  nextStep() {
    const { currentStep } = this.data;
    if (currentStep < 4) {
      this.setData({
        currentStep: currentStep + 1
      });
    }
  },

  /**
   * 上一步
   */
  prevStep() {
    const { currentStep } = this.data;
    if (currentStep > 1) {
      this.setData({
        currentStep: currentStep - 1
      });
    }
  },

  /**
   * 处理表单输入变化
   * @param {Object} e - 事件对象
   */
  onInputChange(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;

    this.setData({
      [`formData.${field}`]: value
    });
  },

  /**
   * 处理场景选择变化
   * @param {Object} e - 事件对象
   */
  onScenarioChange(e) {
    const selectedIndex = e.detail.value;
    const selectedScenario = this.data.scenarios[selectedIndex];

    this.setData({
      'formData.scenario': selectedScenario.value,
      scenarioIndex: selectedIndex
    });
  },

  /**
   * 处理节日选择变化
   * @param {Object} e - 事件对象
   */
  onFestivalChange(e) {
    const selectedIndex = e.detail.value;
    const selectedFestival = this.data.festivals[selectedIndex];

    this.setData({
      'formData.festival': selectedFestival.value,
      festivalIndex: selectedIndex
    });
  },

  /**
   * 处理目标人群选择变化
   * @param {Object} e - 事件对象
   */
  onTargetPersonChange(e) {
    const selectedIndex = e.detail.value;
    const selectedTargetPerson = this.data.targetPersons[selectedIndex];

    this.setData({
      'formData.targetPerson': selectedTargetPerson.value,
      targetPersonIndex: selectedIndex
    });
  },

  /**
   * 处理风格选择变化
   * @param {Object} e - 事件对象
   */
  onStyleChange(e) {
    const selectedIndex = e.detail.value;
    const selectedStyle = this.data.styles[selectedIndex];

    this.setData({
      'formData.style': selectedStyle.value,
      styleIndex: selectedIndex
    });
  },

  /**
   * 处理表单提交事件
   * 接收用户输入，调用 API 生成祝福语
   * @param {Object} e - 表单提交事件
   */
  onSubmit(e) {
    // 阻止表单默认提交行为已在 WXML 中处理

    // 清理输入
    const formData = { ...this.data.formData };
    if (formData.customDescription) {
      formData.customDescription = cleanText(formData.customDescription);
      this.setData({ 'formData.customDescription': formData.customDescription });
    }

    // 客户端验证
    const validation = validateInput(formData);
    if (!validation.valid) {
      this.setData({
        error: validation.error,
        formError: true
      });
      // 移除错误动画类
      setTimeout(() => {
        this.setData({ formError: false });
      }, 500);
      return;
    }

    // 基本验证（保持向后兼容）
    const { useSmartMode, customDescription, scenario, targetPerson } = formData;

    if (useSmartMode && (!customDescription || !customDescription.trim())) {
      this.setData({ error: '请提供祝福语描述' });
      return;
    }

    if (!useSmartMode) {
      // 在逐步引导模式下，检查必填项
      if (!scenario) {
        this.setData({
          error: '请选择祝福场景',
          currentStep: 1  // 返回到相应步骤
        });
        return;
      }

      if (!targetPerson) {
        this.setData({
          error: '请选择目标人群',
          currentStep: 3  // 返回到相应步骤
        });
        return;
      }
    }

    // 开始加载
    this.setData({
      loading: true,
      error: '',
      blessing: ''
    });

    // 调用 API 生成祝福语
    generateBlessing(formData)
      .then(result => {
        // 跳转到结果页面显示祝福语
        wx.navigateTo({
          url: `/pages/result/result?blessing=${encodeURIComponent(result)}&formData=${encodeURIComponent(JSON.stringify(formData))}`
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
   * 处理重新生成操作
   * 使用相同参数重新调用 API 生成祝福语
   */
  onRegenerate() {
    // 开始加载
    this.setData({
      loading: true,
      error: ''
    });

    // 清理输入
    const formData = { ...this.data.formData };
    if (formData.customDescription) {
      formData.customDescription = cleanText(formData.customDescription);
    }

    // 使用当前选项重新生成
    generateBlessing(formData)
      .then(result => {
        // 跳转到结果页面显示祝福语
        wx.navigateTo({
          url: `/pages/result/result?blessing=${encodeURIComponent(result)}&formData=${encodeURIComponent(JSON.stringify(formData))}`
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
   * 打字机效果显示祝福语
   * @param {string} text - 要显示的完整文本
   */
  typeWriterEffect(text) {
    this.setData({
      blessing: ''
    });

    let index = 0;
    const timer = setInterval(() => {
      if (index < text.length) {
        this.setData({
          blessing: text.substring(0, index + 1)
        });
        index++;
      } else {
        clearInterval(timer);
      }
    }, 80); // 80ms per character
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
   * 处理分享祝福语功能
   * 显示信封飞出动画
   */
  onShare() {
    const that = this;
    this.setData({
      showEnvelope: true
    });

    // 1.5秒后隐藏信封动画
    setTimeout(() => {
      that.setData({
        showEnvelope: false
      });
    }, 1500);

    // 这里可以实现分享功能
    // 暂时显示分享提示
    setTimeout(() => {
      wx.showToast({
        title: '分享功能开发中',
        icon: 'none',
        duration: 2000
      });
    }, 500);
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
  },

  /**
   * 处理语音输入功能
   */
  onVoiceInput() {
    const that = this;
    wx.showModal({
      title: '语音输入',
      content: '语音输入功能正在开发中，请暂时使用文字输入',
      showCancel: false,
      confirmText: '知道了'
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
  }
});
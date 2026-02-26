import {
  CubismFramework,
  Option,
  LogLevel,
} from './live2dcubismframework';
import './cubismdefaultparameterid';
import './cubismmodelsettingjson';
import './icubismallcator';
import './icubismmodelsetting';

/**
 * Live2D Cubism SDK 管理器（单例）
 * 负责 SDK 的初始化、配置和生命周期管理
 */
export class Live2DManager {
  private static instance: Live2DManager;
  private initialized = false;

  private constructor() {}

  static getInstance(): Live2DManager {
    if (!this.instance) {
      this.instance = new Live2DManager();
    }
    return this.instance;
  }

  /**
   * 初始化 Cubism SDK
   * 必须在使用任何 Live2D 功能前调用
   */
  initialize(): void {
    if (this.initialized) return;

    // 检查 Core 库
    if (typeof (window as unknown as { Live2DCubismCore: unknown }).Live2DCubismCore === 'undefined') {
      console.error('[Live2D] Live2DCubismCore is not loaded!');
      throw new Error('Live2DCubismCore is not loaded. Please include the script in index.html');
    }

    console.log('[Live2D] Core loaded, initializing...');

    const option = new Option();
    option.logFunction = (message: string) => {
      console.log('[Live2D]', message);
    };
    option.loggingLevel = LogLevel.LogLevel_Info;

    CubismFramework.startUp(option);
    CubismFramework.initialize();

    this.initialized = true;
    console.log('[Live2D] Cubism SDK initialized successfully');
  }

  /**
   * 释放 SDK 资源
   */
  dispose(): void {
    if (this.initialized) {
      CubismFramework.dispose();
      this.initialized = false;
      console.log('[Live2D] Cubism SDK disposed');
    }
  }

  /**
   * 检查 SDK 是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

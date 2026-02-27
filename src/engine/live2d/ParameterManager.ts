import { CubismModel } from './model/cubismmodel';
import { CubismId } from './id/cubismid';
import { CubismIdManager } from './id/cubismidmanager';

/**
 * Live2D 参数管理器
 * 负责管理表情参数和动作触发
 */
export class ParameterManager {
  private model: CubismModel;
  private idManager: CubismIdManager;
  private parameterMap: Map<string, number> = new Map();
  private idCache: Map<string, CubismId> = new Map();

  // 预定义的表情参数映射
  private static readonly EMOTION_MAP: Record<string, Record<string, number>> = {
    neutral: {
      ParamEyeLOpen: 1,
      ParamEyeROpen: 1,
      ParamMouthForm: 0,
    },
    happy: {
      ParamEyeLOpen: 1,
      ParamEyeROpen: 1,
      ParamEyeLSmile: 0.5,
      ParamEyeRSmile: 0.5,
      ParamMouthForm: 0.5,
    },
    sad: {
      ParamEyeLOpen: 0.6,
      ParamEyeROpen: 0.6,
      ParamBrowLY: 0.3,
      ParamBrowRY: 0.3,
      ParamMouthForm: -0.3,
    },
    angry: {
      ParamEyeLOpen: 0.8,
      ParamEyeROpen: 0.8,
      ParamBrowLAngle: 0.3,
      ParamBrowRAngle: 0.3,
      ParamMouthForm: -0.2,
    },
    surprised: {
      ParamEyeLOpen: 1,
      ParamEyeROpen: 1,
      ParamBrowLY: -0.5,
      ParamBrowRY: -0.5,
      ParamMouthForm: 0.8,
    },
    relaxed: {
      ParamEyeLOpen: 0.9,
      ParamEyeROpen: 0.9,
      ParamBrowLAngle: -0.1,
      ParamBrowRAngle: -0.1,
      ParamMouthForm: 0.1,
    },
  };

  constructor(model: CubismModel) {
    this.model = model;
    this.idManager = new CubismIdManager();
  }

  /**
   * 获取 CubismId (带缓存优化)
   */
  private getId(name: string): CubismId {
    let id = this.idCache.get(name);
    if (!id) {
      id = this.idManager.getId(name);
      this.idCache.set(name, id);
    }
    return id;
  }

  /**
   * 应用表情参数
   * 如果 emotion 不被支持，则应用 neutral 作为默认值
   */
  applyEmotion(emotion: string | undefined, intensity: number): void {
    // 如果 emotion 不被支持，使用 neutral 作为默认值
    const supportedEmotion =
      emotion && ParameterManager.EMOTION_MAP[emotion] ? emotion : 'neutral';
    const paramMap = ParameterManager.EMOTION_MAP[supportedEmotion];
    if (!paramMap) return;

    for (const [paramName, value] of Object.entries(paramMap)) {
      this.setParameter(paramName, value * intensity);
    }
  }

  /**
   * 应用呼吸动画
   */
  applyBreathing(time: number, weight: number): void {
    const breathAmplitude = 0.02 * weight;
    const breathFreq = 1.2;
    const breath = Math.sin(time * breathFreq) * breathAmplitude;

    this.setParameter('ParamBodyY', breath);
    this.setParameter('ParamBodyAngleX', breath * 0.5);
  }

  /**
   * 应用眨眼动画
   */
  applyBlinking(weight: number): void {
    // Live2D 模型通常自带眨眼功能，这里可以调整眨眼权重
    const blinkValue = 1 - weight * 0.5;
    this.setParameter('ParamEyeLOpen', blinkValue);
    this.setParameter('ParamEyeROpen', blinkValue);
  }

  /**
   * 设置参数值
   */
  setParameter(name: string, value: number): void {
    try {
      const id = this.getId(name);
      this.model.setParameterValueById(id, value);
      this.parameterMap.set(name, value);
    } catch {
      // 参数可能不存在，忽略
    }
  }

  /**
   * 获取参数值
   */
  getParameter(name: string): number {
    try {
      const id = this.getId(name);
      return this.model.getParameterValueById(id);
    } catch {
      return this.parameterMap.get(name) ?? 0;
    }
  }

  /**
   * 重置所有参数
   */
  resetParameters(): void {
    this.parameterMap.clear();
  }
}

/**
 * state -> 动画/表情参数映射
 * 将 currentState、intensity、emotion 转为 engine (avatarRig + animation) 可用的参数
 */

import type { AgentStateType, EmotionType } from '@/protocol/types';

/** 供 engine 使用的动画混合权重等 */
export interface AnimationParams {
  /** 当前状态 */
  state: AgentStateType;
  /** 呼吸权重 0~1 */
  breathingWeight: number;
  /** 眨眼权重 0~1（若有 BlendShape） */
  blinkWeight: number;
  /** 全局强度，用于平滑过渡 */
  intensity: number;
  /** 表情名，供 BlendShape 使用 */
  emotion: EmotionType;
}

const DEFAULT_PARAMS: AnimationParams = {
  state: 'idle',
  breathingWeight: 1,
  blinkWeight: 1,
  intensity: 0.8,
  emotion: 'neutral',
};

/**
 * 根据状态与强度计算动画参数
 */
export function stateToAnimationParams(
  state: AgentStateType,
  intensity: number,
  emotion: EmotionType
): AnimationParams {
  const params: AnimationParams = {
    ...DEFAULT_PARAMS,
    state,
    intensity: Math.max(0, Math.min(1, intensity)),
    emotion,
  };

  switch (state) {
    case 'idle':
      params.breathingWeight = 1;
      params.blinkWeight = 1;
      break;
    case 'tool_running':
      params.breathingWeight = 0.6;
      params.blinkWeight = 0.8;
      break;
    case 'error':
      params.breathingWeight = 0.8;
      params.blinkWeight = 1;
      params.intensity = Math.min(params.intensity, 0.5);
      break;
  }

  return params;
}

/**
 * 平滑插值：当前参数向目标参数过渡（每帧调用，用 intensityDeltaClamp 限制变化量）
 */
export function lerpAnimationParams(
  current: AnimationParams,
  target: AnimationParams,
  deltaClamp: number
): AnimationParams {
  const clamp = (from: number, to: number) => {
    const d = to - from;
    const step = Math.sign(d) * Math.min(Math.abs(d), deltaClamp);
    return from + step;
  };
  return {
    state: target.state,
    breathingWeight: clamp(current.breathingWeight, target.breathingWeight),
    blinkWeight: clamp(current.blinkWeight, target.blinkWeight),
    intensity: clamp(current.intensity, target.intensity),
    emotion: target.emotion,
  };
}

/**
 * 封装：表情、视线、基础动作
 * 不关心协议，只根据传入参数驱动 VRM
 */

import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import type { AnimationParams } from '@/app/mapping';

/** 可选：BlendShape 名称与 emotion 的映射（按 VRM 规范，若无则用骨骼/简单动画替代） */
const EMOTION_TO_PRESET: Record<string, string> = {
  neutral: 'neutral',
  happy: 'happy',
  sad: 'sad',
  angry: 'angry',
  surprised: 'surprised',
  relaxed: 'relaxed',
};

const CLEARABLE_EMOTIONS = [
  'neutral',
  'happy',
  'sad',
  'angry',
  'surprised',
  'relaxed',
  'sorry',
  'confused',
  'unknown',
];

const LAST_EMOTION_BY_MANAGER = new WeakMap<object, string>();

/**
 * 应用表情（BlendShape），若有则用，若无则跳过
 * VRM expression 是累加的，所以要先清空其他表情
 */
export function applyEmotion(vrm: VRM, emotion: string, intensity: number): void {
  const expressionManager = vrm.expressionManager;
  if (!expressionManager) return;

  const requested = EMOTION_TO_PRESET[emotion] ?? emotion;
  const presetName = expressionManager.getExpression(requested)
    ? requested
    : expressionManager.getExpression('neutral')
      ? 'neutral'
      : requested;
  const clampedIntensity = Math.max(0, Math.min(1, intensity));

  // 强制重置所有表情后再设置新表情（确保每次都是干净状态）
  LAST_EMOTION_BY_MANAGER.set(expressionManager, presetName);

  const clearCandidates = new Set([
    ...CLEARABLE_EMOTIONS,
    ...Object.keys(expressionManager.expressionMap ?? {}),
    presetName,
  ]);
  clearCandidates.forEach((name) => {
    if (!name || !expressionManager.getExpression(name)) return;
    expressionManager.setValue(name, name === presetName ? clampedIntensity : 0);
  });
}

/**
 * 视线：LookAt 目标（V1 简化为看向相机或偏移）
 * three-vrm 3.x 的 lookAt.target 为 Object3D，用 lookAt(position) 设置目标位置
 */
export function applyLookAt(
  vrm: VRM,
  target: THREE.Vector3 | null
): void {
  const lookAt = vrm.lookAt;
  if (!lookAt) return;

  if (target) {
    lookAt.lookAt(target);
  }
}

/**
 * 周期性眨眼：每隔若干秒闭眼一瞬（若模型有 blink BlendShape）
 * 返回 0~1，1 表示完全闭上
 */
const BLINK_INTERVAL = 3.2;
const BLINK_DURATION = 0.12;
export function periodicBlinkValue(time: number): number {
  const t = time % BLINK_INTERVAL;
  if (t < BLINK_DURATION) {
    const x = t / BLINK_DURATION;
    return Math.sin(x * Math.PI);
  }
  return 0;
}

/**
 * 眨眼（若有 BlendShape）
 */
export function applyBlink(
  vrm: VRM,
  blinkWeight: number,
  time: number
): void {
  const expressionManager = vrm.expressionManager;
  if (!expressionManager) return;

  const blink = expressionManager.getExpression('blink');
  if (!blink) return;

  const value = periodicBlinkValue(time) * Math.max(0, Math.min(1, blinkWeight));
  expressionManager.setValue('blink', value);
}

/**
 * 根据 AnimationParams 一次性应用表情与视线等
 */
export function applyAnimationParams(
  vrm: VRM,
  params: AnimationParams,
  time: number,
  lookAtTarget: THREE.Vector3 | null
): void {
  applyEmotion(vrm, params.emotion, params.intensity);
  applyBlink(vrm, params.blinkWeight, time);
  applyLookAt(vrm, lookAtTarget);
}

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
};

/**
 * 应用表情（BlendShape），若有则用，若无则跳过
 */
export function applyEmotion(vrm: VRM, emotion: string, intensity: number): void {
  const expressionManager = vrm.expressionManager;
  if (!expressionManager) return;

  const presetName = EMOTION_TO_PRESET[emotion] ?? 'neutral';
  const preset = expressionManager.getExpression(presetName);
  if (!preset) return;

  expressionManager.setValue(presetName, Math.max(0, Math.min(1, intensity)));
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
 * 眨眼（若有 BlendShape）
 */
export function applyBlink(vrm: VRM, blinkWeight: number): void {
  const expressionManager = vrm.expressionManager;
  if (!expressionManager) return;

  const blink = expressionManager.getExpression('blink');
  if (blink) {
    expressionManager.setValue('blink', Math.max(0, Math.min(1, blinkWeight)));
  }
}

/**
 * 嘴部开合（speaking 时，无 TTS 时用周期动画）
 */
export function applyMouth(vrm: VRM, speakingWeight: number, time: number): void {
  const expressionManager = vrm.expressionManager;
  if (!expressionManager) return;

  const aa = expressionManager.getExpression('aa');
  const oh = expressionManager.getExpression('oh');
  if (aa) {
    const cycle = Math.sin(time * 4) * 0.5 + 0.5;
    expressionManager.setValue('aa', cycle * Math.max(0, Math.min(1, speakingWeight)));
  }
  if (oh) {
    const cycle = Math.sin(time * 4 + 0.5) * 0.5 + 0.5;
    expressionManager.setValue('oh', cycle * Math.max(0, Math.min(1, speakingWeight)));
  }
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
  applyBlink(vrm, params.blinkWeight);
  applyLookAt(vrm, lookAtTarget);
  applyMouth(vrm, params.speakingWeight, time);
}

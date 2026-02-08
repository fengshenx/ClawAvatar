/**
 * 封装：表情、视线、基础动作
 * 不关心协议，只根据传入参数驱动 VRM
 */

import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import type { AgentStateType } from '@/protocol/types';
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

const ALL_EMOTIONS = Object.values(EMOTION_TO_PRESET);

/**
 * 应用表情（BlendShape），若有则用，若无则跳过
 * VRM expression 是累加的，所以要先清空其他表情
 */
export function applyEmotion(vrm: VRM, emotion: string, intensity: number): void {
  const expressionManager = vrm.expressionManager;
  if (!expressionManager) {
    console.log('[applyEmotion] No expressionManager');
    return;
  }

  const presetName = EMOTION_TO_PRESET[emotion] ?? emotion;
  const clampedIntensity = Math.max(0, Math.min(1, intensity));

  ALL_EMOTIONS.forEach((name) => {
    if (name && expressionManager.getExpression(name)) {
      expressionManager.setValue(name, name === presetName ? clampedIntensity : 0);
    }
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
 * 周期性眨眼：idle 时每隔若干秒闭眼一瞬（若模型有 blink BlendShape）
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
 * idle 时使用周期性眨眼；其他状态由外部传入的 blinkWeight 决定
 */
export function applyBlink(
  vrm: VRM,
  blinkWeight: number,
  time: number,
  state: AgentStateType
): void {
  const expressionManager = vrm.expressionManager;
  if (!expressionManager) return;

  const blink = expressionManager.getExpression('blink');
  if (!blink) return;

  const usePeriodic = state === 'idle' || state === 'error';
  const value = usePeriodic
    ? periodicBlinkValue(time) * Math.max(0, Math.min(1, blinkWeight))
    : Math.max(0, Math.min(1, blinkWeight));
  expressionManager.setValue('blink', value);
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
  applyBlink(vrm, params.blinkWeight, time, params.state);
  applyLookAt(vrm, lookAtTarget);
  applyMouth(vrm, params.speakingWeight, time);
}

/**
 * 头部骨骼额外旋转（在 vrm.update() 之后调用，叠加在 LookAt 之上）
 * 使点头/歪头更明显，且不依赖 BlendShape
 */
export function applyHeadBoneMotion(
  vrm: VRM,
  params: AnimationParams,
  time: number
): void {
  const humanoid = vrm.humanoid;
  if (!humanoid) return;
  const head = humanoid.getRawBoneNode('head');
  if (!head) return;

  const tiltX = Math.sin(time * 0.8) * 0.1 * params.thinkingWeight;
  const tiltY = Math.sin(time * 0.6) * 0.08 * params.thinkingWeight;
  const nodX = Math.sin(time * 3) * 0.12 * params.speakingWeight;

  const q = new THREE.Quaternion();
  q.setFromEuler(new THREE.Euler(tiltX + nodX, tiltY, 0, 'XYZ'));
  head.quaternion.multiply(q);
}

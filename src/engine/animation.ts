/**
 * idle 动画逻辑：呼吸
 * 动作来源：state -> mapping 得到权重 -> 此处用 time 生成具体位移
 */

import * as THREE from 'three';
import type { AnimationParams } from '@/app/mapping';

/** 呼吸：整体上下轻微浮动 */
const BREATH_AMPLITUDE = 0.04;
const BREATH_FREQ = 1.2;
export function breathingOffset(time: number, weight: number): number {
  return Math.sin(time * BREATH_FREQ) * BREATH_AMPLITUDE * weight;
}

/**
 * 根据 params 更新 VRM.scene 的 position（呼吸）
 */
export function applyStateMotion(
  group: THREE.Group,
  params: AnimationParams,
  time: number
): void {
  const breath = breathingOffset(time, params.breathingWeight);
  group.position.y = breath;
}

/**
 * idle / thinking / speaking 的动画逻辑
 * 呼吸、头部微动、思考态视线偏移等，与 VRM 解耦（通过 avatarRig 应用）
 */

import * as THREE from 'three';
import type { AnimationParams } from '@/app/mapping';

/** 呼吸：对 Y 缩放或 position.y 做正弦波 */
export function breathingOffset(time: number, weight: number): number {
  return Math.sin(time * 1.2) * 0.015 * weight;
}

/** 思考态：头部轻微倾斜（弧度） */
export function thinkingHeadTilt(time: number, weight: number): { x: number; y: number; z: number } {
  return {
    x: Math.sin(time * 0.8) * 0.08 * weight,
    y: Math.sin(time * 0.6) * 0.12 * weight,
    z: Math.sin(time * 0.5) * 0.05 * weight,
  };
}

/** 说话态：轻微点头 */
export function speakingNod(time: number, weight: number): number {
  return Math.sin(time * 3) * 0.03 * weight;
}

/**
 * 根据 params 更新 VRM.scene 的 position/rotation（呼吸、点头、思考歪头）
 */
export function applyStateMotion(
  group: THREE.Group,
  params: AnimationParams,
  time: number
): void {
  const breath = breathingOffset(time, params.breathingWeight);
  const nod = speakingNod(time, params.speakingWeight);
  const tilt = thinkingHeadTilt(time, params.thinkingWeight);

  group.position.y = breath + nod;
  group.rotation.x = tilt.x;
  group.rotation.y = Math.PI + tilt.y;
  group.rotation.z = tilt.z;
}

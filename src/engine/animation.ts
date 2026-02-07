/**
 * idle / thinking / speaking 的动画逻辑
 * 呼吸、头部微动、思考态视线偏移等
 * 动作来源：state -> mapping 得到权重 -> 此处用 time 生成具体位移/旋转
 */

import * as THREE from 'three';
import type { AnimationParams } from '@/app/mapping';

/** 呼吸：整体上下轻微浮动（幅度调大以便可见） */
const BREATH_AMPLITUDE = 0.04;
const BREATH_FREQ = 1.2;
export function breathingOffset(time: number, weight: number): number {
  return Math.sin(time * BREATH_FREQ) * BREATH_AMPLITUDE * weight;
}

/** 思考态：整体轻微倾斜（弧度），模拟歪头思考 */
const TILT_AMPLITUDE = 0.12;
export function thinkingHeadTilt(time: number, weight: number): { x: number; y: number; z: number } {
  return {
    x: Math.sin(time * 0.8) * TILT_AMPLITUDE * weight,
    y: Math.sin(time * 0.6) * TILT_AMPLITUDE * weight,
    z: Math.sin(time * 0.5) * (TILT_AMPLITUDE * 0.6) * weight,
  };
}

/** 说话态：轻微上下点头 */
const NOD_AMPLITUDE = 0.08;
const NOD_FREQ = 3;
export function speakingNod(time: number, weight: number): number {
  return Math.sin(time * NOD_FREQ) * NOD_AMPLITUDE * weight;
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

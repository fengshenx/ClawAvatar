/**
 * 播放 GLTF/GLB 内置时间轴动画（gltf.animations）
 * 若模型里带了 AnimationClip（如 idle、walk），在此创建 Mixer 并支持按名称切换
 */

import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type ClipAnimationsResult = {
  mixer: THREE.AnimationMixer;
  /** 动画片段名称列表，用于 UI 展示按钮（可被外部 push 以合并 VRMA） */
  clipNames: string[];
  /** 与 clipNames 一一对应的 actions（可被外部 push 以合并 VRMA） */
  actions: THREE.AnimationAction[];
  /** 播放指定名称的片段（先停掉当前，再播该片段） */
  playClip: (name: string) => void;
};

/**
 * 用 GLTF 里的动画片段创建 Mixer，并返回片段名称列表与「按名称播放」方法
 * @param vrm 当前 VRM（其 scene 为动画根）
 * @param gltf 带 animations 的 GLTF
 * @returns 有动画时返回 { mixer, clipNames, playClip }，无则 null
 */
export function setupClipAnimations(
  vrm: VRM,
  gltf: GLTF
): ClipAnimationsResult | null {
  if (!gltf.animations?.length) return null;

  const mixer = new THREE.AnimationMixer(vrm.scene);
  const clipNames: string[] = [];
  const actions: THREE.AnimationAction[] = [];

  for (let i = 0; i < gltf.animations.length; i++) {
    const clip = gltf.animations[i];
    if (!clip) continue;
    clipNames.push(clip.name || `动画 ${i + 1}`);
    const action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
    actions.push(action);
  }

  function playClip(name: string): void {
    const index = clipNames.indexOf(name);
    if (index < 0) return;
    actions.forEach((a) => a.stop());
    actions[index]?.play();
  }

  playClip(clipNames[0] ?? '');

  return { mixer, clipNames, actions, playClip };
}

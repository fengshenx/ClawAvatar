/**
 * 将 VRMA 解析出的 VRMAnimation 转为 AnimationClip 并加入现有 Mixer
 * 与 clipAnimations 共用同一 mixer，便于统一「按名称播放」
 */

import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import {
  createVRMAnimationClip,
  VRMLookAtQuaternionProxy,
} from '@pixiv/three-vrm-animation';
import type { VRMAnimation } from '@pixiv/three-vrm-animation';

export type VrmaEntry = {
  /** 展示名称（来自 manifest 或文件名） */
  name: string;
  vrmAnimation: VRMAnimation;
};

/**
 * 在 vrm.scene 上确保存在 VRMLookAtQuaternionProxy，避免 createVRMAnimationClip 内重复创建并打警告
 */
function ensureLookAtProxy(vrm: VRM): void {
  const hasProxy = vrm.scene.children.some(
    (obj) => obj instanceof VRMLookAtQuaternionProxy
  );
  if (!hasProxy && vrm.lookAt) {
    const proxy = new VRMLookAtQuaternionProxy(vrm.lookAt);
    proxy.name = 'VRMLookAtQuaternionProxy';
    vrm.scene.add(proxy);
  }
}

/**
 * 将一批 VRMA 条目转为 AnimationClip 并加入 mixer，同时扩展 clipNames 与 actions
 */
export function addVrmaClipsToMixer(
  vrm: VRM,
  mixer: THREE.AnimationMixer,
  clipNames: string[],
  actions: THREE.AnimationAction[],
  entries: VrmaEntry[]
): void {
  ensureLookAtProxy(vrm);
  for (const { name, vrmAnimation } of entries) {
    const clip = createVRMAnimationClip(vrmAnimation, vrm);
    const action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
    clipNames.push(name);
    actions.push(action);
  }
}

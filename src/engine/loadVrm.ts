/**
 * 加载 VRM，返回 VRM 实例与原始 GLTF（用于播放内置动画）
 * 使用 GLTFLoader + VRMLoaderPlugin（@pixiv/three-vrm）
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRM } from '@pixiv/three-vrm';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type LoadVrmOptions = {
  /** VRM/GLB 文件 URL（如 /models/avatar.vrm 或 /models/avatar.glb） */
  url: string;
};

export type LoadVrmResult = {
  vrm: VRM;
  /** 原始 GLTF，内含 gltf.animations（时间轴动画片段），有则可用于 AnimationMixer */
  gltf: GLTF;
};

/**
 * 加载 VRM 模型
 * 若文件为带 VRM 扩展的 GLB，同时可拿到 gltf.animations 播放内置动作
 */
export function loadVrm(options: LoadVrmOptions): Promise<LoadVrmResult> {
  const { url } = options;
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));

  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        const vrm = gltf.userData.vrm as VRM | undefined;
        if (!vrm) {
          reject(new Error('VRM not found in gltf.userData'));
          return;
        }
        resolve({ vrm, gltf });
      },
      undefined,
      (err) => reject(err ?? new Error('Unknown load error'))
    );
  });
}

/**
 * 将 VRM 场景图挂到 Group 并设置基础朝向/缩放
 */
export function attachVrmToGroup(vrm: VRM, group: THREE.Group): void {
  group.clear();
  group.add(vrm.scene);
  vrm.scene.rotation.y = Math.PI; // 面向相机
  vrm.scene.position.set(0, 0, 0);
  vrm.scene.scale.setScalar(1);
}

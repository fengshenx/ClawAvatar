/**
 * 加载 VRM，返回 VRM 实例
 * 使用 GLTFLoader + VRMLoaderPlugin（@pixiv/three-vrm）
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRM } from '@pixiv/three-vrm';

export type LoadVrmOptions = {
  /** VRM 文件 URL（如 /models/avatar.vrm） */
  url: string;
};

/**
 * 加载 VRM 模型
 */
export function loadVrm(options: LoadVrmOptions): Promise<VRM> {
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
        resolve(vrm);
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

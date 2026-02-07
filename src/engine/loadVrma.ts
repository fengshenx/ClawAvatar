/**
 * 加载 VRMA（VRM Animation）文件
 * 使用 GLTFLoader + VRMAnimationLoaderPlugin，得到 gltf.userData.vrmAnimations
 */

import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMAnimationLoaderPlugin } from '@pixiv/three-vrm-animation';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { VRMAnimation } from '@pixiv/three-vrm-animation';

export type GLTFWithVrmAnimations = GLTF & {
  userData: { vrmAnimations?: VRMAnimation[] };
};

/**
 * 加载单个 VRMA 文件
 * @returns gltf，其中 gltf.userData.vrmAnimations 为 VRMAnimation[]
 */
export function loadVrma(url: string): Promise<GLTFWithVrmAnimations> {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMAnimationLoaderPlugin(parser));

  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => resolve(gltf as GLTFWithVrmAnimations),
      undefined,
      (err) => reject(err ?? new Error('Unknown load error'))
    );
  });
}

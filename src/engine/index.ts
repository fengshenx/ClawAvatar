/**
 * Engine 统一导出
 */

export { createScene, renderFrame, resizeRenderer, updateControls, setupAvatarDrag } from './renderer';
export type { SceneContext, RendererOptions } from './renderer';
export { loadVrm, attachVrmToGroup } from './loadVrm';
export type { LoadVrmOptions, LoadVrmResult } from './loadVrm';
export { loadVrma } from './loadVrma';
export type { GLTFWithVrmAnimations } from './loadVrma';
export { setupClipAnimations } from './clipAnimations';
export type { ClipAnimationsResult } from './clipAnimations';
export { addVrmaClipsToMixer } from './vrmaClips';
export type { VrmaEntry } from './vrmaClips';
export {
  applyEmotion,
  applyLookAt,
  applyBlink,
  applyAnimationParams,
  periodicBlinkValue,
} from './avatarRig';
export {
  breathingOffset,
  applyStateMotion,
} from './animation';

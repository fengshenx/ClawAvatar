/**
 * Three 场景、相机、渲染循环
 * 管理 canvas、光照、背景、轨道控制，不关心协议
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface RendererOptions {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  /** 背景色 */
  background?: number;
  /** 是否启用轨道控制（鼠标拖拽旋转），Electron 下禁用 */
  enableControls?: boolean;
}

export interface SceneContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  clock: THREE.Clock;
  /** 轨道控制：鼠标拖拽旋转、滚轮缩放 */
  controls: OrbitControls;
  /** 用于挂载 VRM 的 Group */
  avatarGroup: THREE.Group;
  /** 轨道目标点（相机看向的位置，Avatar 视线可对准相机） */
  cameraPosition: THREE.Vector3;
}

const DEFAULT_BG = 0x1a1a2e;

/**
 * 创建场景、相机、渲染器与 avatar 容器
 */
export function createScene(options: RendererOptions): SceneContext {
  const { canvas, width, height, background = DEFAULT_BG, enableControls = true } = options;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background);

  const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
  camera.position.set(0, 1.4, 1.8);
  const orbitTarget = new THREE.Vector3(0, 1.2, 0);
  camera.lookAt(orbitTarget);

  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(orbitTarget);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 0.8;
  controls.maxDistance = 5;
  controls.maxPolarAngle = Math.PI * 0.45;
  controls.minPolarAngle = Math.PI * 0.15;
  controls.enabled = enableControls;
  controls.enableRotate = enableControls;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // 简单光照
  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(2, 4, 3);
  dir.castShadow = true;
  scene.add(dir);
  const fill = new THREE.DirectionalLight(0xaaccff, 0.3);
  fill.position.set(-1, 2, 2);
  scene.add(fill);

  const avatarGroup = new THREE.Group();
  avatarGroup.position.set(0, 0, 0);
  scene.add(avatarGroup);

  const clock = new THREE.Clock();

  return {
    scene,
    camera,
    renderer,
    clock,
    controls,
    avatarGroup,
    cameraPosition: orbitTarget,
  };
}

/**
 * 更新轨道控制（每帧调用，用于 damping）
 */
export function updateControls(ctx: SceneContext, delta: number): void {
  ctx.controls.update(delta);
}

/**
 * 单帧渲染
 */
export function renderFrame(ctx: SceneContext): void {
  ctx.renderer.render(ctx.scene, ctx.camera);
}

/**
 * 更新渲染器尺寸
 */
export function resizeRenderer(ctx: SceneContext, width: number, height: number): void {
  ctx.camera.aspect = width / height;
  ctx.camera.updateProjectionMatrix();
  ctx.renderer.setSize(width, height);
  ctx.controls.update();
}

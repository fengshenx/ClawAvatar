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

/**
 * 创建场景、相机、渲染器与 avatar 容器
 */
export function createScene(options: RendererOptions): SceneContext {
  const { canvas, width, height, background, enableControls = true } = options;

  const scene = new THREE.Scene();
  // 透明模式：Electron 悬浮窗口不设置背景；否则可按需设置
  if (background !== undefined) {
    scene.background = new THREE.Color(background);
  }
  // 保持 scene.background 为 null 以支持透明悬浮窗口

  const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
  camera.position.set(0, 0.85, 1.8);
  const orbitTarget = new THREE.Vector3(0, 1, 0);
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

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  // 不设置 scene.background，保持透明
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
  // 保护措施：确保背景始终透明（防止 VRM 插件设置不透明背景）
  ctx.scene.background = null;
  ctx.renderer.render(ctx.scene, ctx.camera);
}

/** Avatar 拖拽状态 */
interface DragState {
  isDragging: boolean;
}

/**
 * 为 Canvas 添加 Avatar 拖拽功能（拖拽时移动窗口）
 * 仅在 Electron 模式下生效
 */
export function setupAvatarDrag(
  canvas: HTMLCanvasElement,
  ctx: SceneContext,
  avatarGroup: THREE.Group
): () => void {
  if (typeof window === 'undefined' || !window.electronAPI) {
    return () => {};
  }

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const dragState: DragState = {
    isDragging: false,
  };

  function getIntersects(event: MouseEvent): THREE.Intersection[] {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, ctx.camera);
    // 递归检测 avatarGroup 下的所有子对象
    return raycaster.intersectObjects(avatarGroup.children, true);
  }

  function onMouseDown(event: MouseEvent) {
    if (!window.electronAPI) return;
    const intersects = getIntersects(event);
    if (intersects.length > 0) {
      // 点击在 Avatar 上，开始拖拽
      dragState.isDragging = true;
      ctx.controls.enabled = false; // 拖拽时禁用轨道控制
      canvas.style.cursor = 'grabbing';
      // 拖拽期间确保窗口可接收鼠标事件
      window.electronAPI.setIgnoreMouseEvents(false, { forward: false });
    }
  }

  function onMouseMove(event: MouseEvent) {
    if (!window.electronAPI || !dragState.isDragging) return;
    // 使用 screen 坐标避免窗口移动后参考系变化的问题
    const dx = event.movementX;
    const dy = event.movementY;
    if (dx === 0 && dy === 0) return;
    // 直接用 movementX/movementY 更可靠
    window.electronAPI.moveWindow(dx, dy);
  }

  function onMouseUp() {
    if (dragState.isDragging) {
      dragState.isDragging = false;
      ctx.controls.enabled = true; // 恢复轨道控制
      canvas.style.cursor = 'auto';
      // 恢复点击穿透状态
      window.electronAPI?.setIgnoreMouseEvents(false, { forward: true });
    }
  }

  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);

  // 返回清理函数
  return () => {
    canvas.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  };
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

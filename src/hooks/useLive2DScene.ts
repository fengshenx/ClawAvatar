/**
 * 创建 Live2D 场景、加载模型、驱动状态动画的渲染循环
 * 每帧从 store 取状态 -> mapping -> lerp -> engine 应用
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Live2DModelLoader,
  Live2DAnimator,
  ParameterManager,
  CubismModel,
  Live2DRenderer,
} from '@/engine';
import { CubismPhysics } from '@/engine/live2d/physics/cubismphysics';
import { CubismPose } from '@/engine/live2d/effect/cubismpose';
import { useAppStore } from '@/app/state';
import { isElectron } from '@/config';

const DEFAULT_MODEL_URL = '/models/Hiyori';

export interface UseLive2DSceneOptions {
  modelUrl?: string;
  width: number;
  height: number;
  /** 目标渲染帧率，默认 30 */
  targetFps?: number;
}

export function useLive2DScene(options: UseLive2DSceneOptions) {
  const { modelUrl = DEFAULT_MODEL_URL, width, height } = options;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const modelRef = useRef<CubismModel | null>(null);
  const rendererRef = useRef<Live2DRenderer | null>(null);
  const animatorRef = useRef<Live2DAnimator | null>(null);
  const paramManagerRef = useRef<ParameterManager | null>(null);
  const physicsRef = useRef<CubismPhysics | null>(null);
  const poseRef = useRef<CubismPose | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [motionNames, setMotionNames] = useState<string[]>([]);

  // 记录上次的状态，用于检测变化时输出日志
  const lastActionNameRef = useRef<string | null>(null);
  const lastGestureSeqRef = useRef(0);
  const idleMotionNameRef = useRef<string | null>(null);
  const lastLoopMotionRef = useRef<string | null>(null);
  const wasPlayingRef = useRef(false);

  // ⚡ 性能优化：用 ref 缓存 Store 状态，避免每帧读取
  const emotionCacheRef = useRef<string>('neutral');
  const intensityCacheRef = useRef(0);
  const gestureCacheRef = useRef<string | null>(null);
  const gestureSeqCacheRef = useRef(0);
  
  // ⚡ 性能优化：用于表情脏检查的专用 Ref
  const lastAppliedEmotionRef = useRef<string | null>(null);
  const lastAppliedIntensityRef = useRef(-1);

  // 鼠标拖拽状态
  const isDraggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const mouseHandlersRef = useRef<{
    onMouseDown?: (e: MouseEvent) => void;
    onMouseMove?: (e: MouseEvent) => void;
    onMouseUp?: () => void;
  }>({});

  // 存储可见性变化处理器
  const visibilityHandlerRef = useRef<(() => void) | null>(null);

  // ⚡ 性能优化：订阅 Store 变化，更新 ref（零开销）
  useEffect(() => {
    const unsub = useAppStore.subscribe((state) => {
      emotionCacheRef.current = state.current.emotion;
      intensityCacheRef.current = state.current.intensity;
      gestureCacheRef.current = state.current.gesture;
      gestureSeqCacheRef.current = state.current.gestureSeq;
    });
    return unsub;
  }, []);

  // 处理 Electron 本地文件协议
  function resolveModelUrl(url: string): string {
    // 只有在 Electron 生产构建时才使用 electron-local 协议
    // 开发模式下（无论是否 Electron），都使用普通 URL
    const isDev = import.meta.env.DEV;
    if (isElectron() && !isDev) {
      const path = url.replace(/^\//, '');
      return `electron-local://${path}`;
    }
    return url;
  }

  useEffect(() => {
    let disposed = false;
    let animationFrameId = 0;
    let frameTimerId = 0;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const getCanvasSize = () => ({
      width: Math.max(1, Math.round(canvas.clientWidth || width)),
      height: Math.max(1, Math.round(canvas.clientHeight || height)),
    });

    // 检查 Core 库是否加载
    console.log('[Live2D] Live2DCubismCore loaded:', typeof (window as unknown as { Live2DCubismCore: unknown }).Live2DCubismCore !== 'undefined');

    // 加载 Live2D 模型
    const resolvedUrl = resolveModelUrl(modelUrl);
    console.log('[Live2D] Loading model from:', resolvedUrl);
    Live2DModelLoader.load({ modelUrl: resolvedUrl, canvas })
      .then(async ({ model, renderer, physics, pose }) => {
        if (disposed) return;

        modelRef.current = model;
        rendererRef.current = renderer;
        physicsRef.current = physics;
        poseRef.current = pose;
        {
          const size = getCanvasSize();
          renderer.resize(size.width, size.height);
        }

        // 创建动画控制器
        const animator = new Live2DAnimator(model);
        animatorRef.current = animator;

        // 优先从 model3.json / *.model3.json 中读取动作，避免对可选 motions.json 的无效请求
        await animator.loadMotionFromModelSetting(resolvedUrl);
        // 兼容旧项目：若模型配置里没有 motions，再尝试旧的外部清单
        if (animator.getLoadedMotionNames().length === 0) {
          const manifestUrl = resolveModelUrl(`${modelUrl}/motions.json`);
          await animator.loadMotionManifest(manifestUrl);
        }
        const loadedMotions = animator.getLoadedMotionNames();
        setMotionNames(loadedMotions);
        idleMotionNameRef.current =
          loadedMotions.find((name) => /^idle_/i.test(name)) ?? loadedMotions[0] ?? null;
        if (idleMotionNameRef.current) {
          const played = animator.play(idleMotionNameRef.current);
          if (played) {
            lastLoopMotionRef.current = played;
            wasPlayingRef.current = true;
          }
        }

        // 创建参数管理器
        const paramManager = new ParameterManager(model);
        paramManagerRef.current = paramManager;

        setLoading(false);

        // 启动渲染循环
        let lastTime = performance.now();
        let isPaused = false;

        // ⚡ 性能优化：降帧渲染（默认 30fps）
        const targetFps = Math.max(1, options.targetFps ?? 30);
        const frameInterval = 1000 / targetFps;
        let lastFrameTime = performance.now();

        const clearScheduledFrame = () => {
          if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = 0;
          }
          if (frameTimerId) {
            clearTimeout(frameTimerId);
            frameTimerId = 0;
          }
        };

        const scheduleNextFrame = () => {
          if (isPaused || disposed) return;

          // 低帧率场景避免每个 VSync 都触发回调，降低 Electron 的空转开销
          if (targetFps < 60) {
            const elapsed = performance.now() - lastFrameTime;
            const delay = Math.max(0, frameInterval - elapsed);
            frameTimerId = window.setTimeout(() => {
              frameTimerId = 0;
              animationFrameId = requestAnimationFrame(loop);
          // ⚡ 改为在模型加载后启动循环
            }, delay);
            return;
          }

          animationFrameId = requestAnimationFrame(loop);
          // ⚡ 改为在模型加载后启动循环
        };

        const loop = (timestamp: number) => {
          if (isPaused || disposed) return;
          lastFrameTime = timestamp;
          const dt = Math.min(0.1, Math.max(0, (timestamp - lastTime) / 1000)); // 转换为秒并限制跳帧抖动
          lastTime = timestamp;

          const model = modelRef.current;
          const renderer = rendererRef.current;
          const animator = animatorRef.current;
          const paramManager = paramManagerRef.current;
          const physics = physicsRef.current;
          const pose = poseRef.current;

          if (!model || !renderer || !animator || !paramManager) {
            // ⚡ 性能优化：没有模型时停止循环，等模型加载后再启动
            return;
          }

          // 更新动画
          try {
            animator.update(dt);
          } catch (err) {
            console.error('[Live2D] Motion update error:', err);
          }


          // 处理手势动作
          if (gestureSeqCacheRef.current > lastGestureSeqRef.current && gestureCacheRef.current) {
            lastGestureSeqRef.current = gestureSeqCacheRef.current;
            const played = animator.play(gestureCacheRef.current);
            if (played) {
              lastActionNameRef.current = played;
              lastLoopMotionRef.current = played;
              wasPlayingRef.current = true;
            }
          }

          const isPlayingNow = animator.isPlayingMotion();
          if (!isPlayingNow && wasPlayingRef.current && lastLoopMotionRef.current) {
            const replayed = animator.play(lastLoopMotionRef.current);
            if (replayed) {
              wasPlayingRef.current = true;
            } else {
              wasPlayingRef.current = false;
            }
          } else {
            wasPlayingRef.current = isPlayingNow;
          }

          // 如果没有播放动作，应用表情
          if (!animator?.isPlayingMotion()) {
            // ⚡ 性能优化：仅在表情或强度变化时应用
            const currentEmotion = emotionCacheRef.current;
            const currentIntensity = intensityCacheRef.current;
            
            if (lastAppliedEmotionRef.current !== currentEmotion || lastAppliedIntensityRef.current !== currentIntensity) {
                paramManager.applyEmotion(currentEmotion, currentIntensity);
                lastAppliedEmotionRef.current = currentEmotion;
                lastAppliedIntensityRef.current = currentIntensity;
            }
            
            // 🚩 已删除 applyBlinking(1) 和 applyBreathing
            // 只有当参数真正变化时，model.update() 才会产生较小的 CPU 开销
          }

          if (physics) {
            physics.evaluate(model, dt);
          }
          if (pose) {
            pose.updateParameters(model, dt);
          }

          // 更新模型
          model.update();

          // 脏检查：只有当模型实际更新时才渲染
          try {
            renderer.render(model);
          } catch (err) {
            console.error('[Live2D] Render error:', err);
          }

          scheduleNextFrame();
        };

        // 监听页面可见性变化
        visibilityHandlerRef.current = () => {
          if (document.hidden) {
            isPaused = true;
            clearScheduledFrame();
          } else {
            isPaused = false;
            lastTime = performance.now();
            lastFrameTime = lastTime;
            scheduleNextFrame();
          }
        };

        document.addEventListener('visibilitychange', visibilityHandlerRef.current);
        scheduleNextFrame();

        // 添加鼠标拖拽事件（仅在 Electron 环境下）
        if (isElectron()) {
          const electronAPI = (window as Window & { electronAPI?: { moveWindow: (dx: number, dy: number) => void } }).electronAPI;

          const onMouseDown = (e: MouseEvent) => {
            isDraggingRef.current = true;
            lastMouseRef.current = { x: e.screenX, y: e.screenY };
          };

          const onMouseMove = (e: MouseEvent) => {
            if (!isDraggingRef.current || !electronAPI) return;
            const dx = e.screenX - lastMouseRef.current.x;
            const dy = e.screenY - lastMouseRef.current.y;
            if (dx !== 0 || dy !== 0) {
              electronAPI.moveWindow(dx, dy);
              lastMouseRef.current = { x: e.screenX, y: e.screenY };
            }
          };

          const onMouseUp = () => {
            isDraggingRef.current = false;
          };

          canvas.addEventListener('mousedown', onMouseDown);
          window.addEventListener('mousemove', onMouseMove);
          window.addEventListener('mouseup', onMouseUp);

          // 存储事件处理器以便清理
          mouseHandlersRef.current = { onMouseDown, onMouseMove, onMouseUp };
        }
      })
      .catch((err) => {
        if (disposed) return;
        console.error('[Live2D] Load error:', err);
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });

    return () => {
      disposed = true;

      // 清理可见性监听器
      if (visibilityHandlerRef.current) {
        document.removeEventListener('visibilitychange', visibilityHandlerRef.current);
        visibilityHandlerRef.current = null;
      }

      // 取消动画帧
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (frameTimerId) clearTimeout(frameTimerId);
      animationFrameId = 0;
      frameTimerId = 0;

      // 清理鼠标拖拽事件
      const handlers = mouseHandlersRef.current;
      const canvas = canvasRef.current;
      if (canvas && handlers) {
        if (handlers.onMouseDown) canvas.removeEventListener('mousedown', handlers.onMouseDown);
        if (handlers.onMouseMove) window.removeEventListener('mousemove', handlers.onMouseMove);
        if (handlers.onMouseUp) window.removeEventListener('mouseup', handlers.onMouseUp);
      }

      // 清理资源
      modelRef.current = null;
      rendererRef.current = null;
      animatorRef.current = null;
      paramManagerRef.current = null;
      if (physicsRef.current) {
        CubismPhysics.delete(physicsRef.current);
        physicsRef.current = null;
      }
      if (poseRef.current) {
        CubismPose.delete(poseRef.current);
        poseRef.current = null;
      }
    };
  }, [modelUrl, width, height]);

  // 响应窗口大小变化
  useEffect(() => {
    const renderer = rendererRef.current;
    const canvas = canvasRef.current;
    if (renderer && canvas) {
      const nextWidth = Math.max(1, Math.round(canvas.clientWidth || width));
      const nextHeight = Math.max(1, Math.round(canvas.clientHeight || height));
      renderer.resize(nextWidth, nextHeight);
    }
  }, [width, height]);

  const playMotion = useCallback((name: string) => {
    animatorRef.current?.play(name);
  }, []);

  const getMotionGroupNames = useCallback(() => {
    return animatorRef.current?.getMotionGroupNames() || [];
  }, []);

  const playRandomInGroup = useCallback((groupName: string) => {
    return animatorRef.current?.playRandomInGroup(groupName) || null;
  }, []);

  return {
    canvasRef,
    loading,
    error,
    motionNames,
    playMotion,
    getMotionGroupNames,
    playRandomInGroup,
  };
}

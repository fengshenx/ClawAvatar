/**
 * 创建 Live2D 场景、加载模型、驱动状态动画的渲染循环
 * 每帧从 store 取状态 -> mapping -> lerp -> engine 应用
 */

import { useEffect, useRef, useState } from 'react';
import {
  Live2DModelLoader,
  Live2DAnimator,
  ParameterManager,
  CubismModel,
  Live2DRenderer,
} from '@/engine';
import { useAppStore } from '@/app/state';
import { isElectron } from '@/config';

const DEFAULT_MODEL_URL = '/models/Hiyori';

export interface UseLive2DSceneOptions {
  modelUrl?: string;
  width: number;
  height: number;
}

export function useLive2DScene(options: UseLive2DSceneOptions) {
  const { modelUrl = DEFAULT_MODEL_URL, width, height } = options;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const modelRef = useRef<CubismModel | null>(null);
  const rendererRef = useRef<Live2DRenderer | null>(null);
  const animatorRef = useRef<Live2DAnimator | null>(null);
  const paramManagerRef = useRef<ParameterManager | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [motionNames, setMotionNames] = useState<string[]>([]);

  // 记录上次的状态，用于检测变化时输出日志
  const lastActionNameRef = useRef<string | null>(null);
  const lastGestureSeqRef = useRef(0);
  const idleMotionNameRef = useRef<string | null>(null);
  const lastLoopMotionRef = useRef<string | null>(null);
  const wasPlayingRef = useRef(false);

  // 鼠标拖拽状态
  const isDraggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const mouseHandlersRef = useRef<{
    onMouseDown?: (e: MouseEvent) => void;
    onMouseMove?: (e: MouseEvent) => void;
    onMouseUp?: () => void;
  }>({});

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
    let animationFrameId: number;

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
      .then(async ({ model, renderer }) => {
        if (disposed) return;

        modelRef.current = model;
        rendererRef.current = renderer;
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
        const loop = () => {
          animationFrameId = requestAnimationFrame(loop);

          const currentTime = performance.now();
          if (document.hidden) return;
          const dt = (currentTime - lastTime) / 1000; // 转换为秒
          lastTime = currentTime;

          const model = modelRef.current;
          const renderer = rendererRef.current;
          const animator = animatorRef.current;
          const paramManager = paramManagerRef.current;

          if (!model || !renderer || !animator || !paramManager) return;

          // 更新动画
          try {
            animator.update(dt);
          } catch (err) {
            console.error('[Live2D] Motion update error:', err);
          }

          // 获取当前状态
          const current = useAppStore.getState().current;

          // 处理手势动作
          if (current.gestureSeq > lastGestureSeqRef.current && current.gesture) {
            lastGestureSeqRef.current = current.gestureSeq;
            const played = animator.play(current.gesture);
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

          // 如果没有播放动作，应用表情和呼吸
          if (!animator?.isPlayingMotion()) {
            paramManager.applyEmotion(current.emotion, current.intensity);
            paramManager.applyBreathing(performance.now() / 1000, 1);
            paramManager.applyBlinking(1);
          }

          // 更新模型
          model.update();

          // 渲染
          try {
            renderer.render(model);
          } catch (err) {
            console.error('[Live2D] Render error:', err);
          }

        };

        loop();

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
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }

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

  const playMotion = (name: string) => {
    animatorRef.current?.play(name);
  };

  return {
    canvasRef,
    loading,
    error,
    motionNames,
    playMotion,
  };
}

/**
 * 创建 Three 场景、加载 VRM、驱动状态动画的渲染循环
 * 每帧从 store 取状态 -> mapping -> lerp -> engine 应用
 */

import { useEffect, useRef, useState } from 'react';
import type { VRM } from '@pixiv/three-vrm';
import {
  createScene,
  renderFrame,
  resizeRenderer,
  updateControls,
  loadVrm,
  attachVrmToGroup,
  applyStateMotion,
  applyAnimationParams,
} from '@/engine';
import type { SceneContext } from '@/engine';
import { useAppStore } from '@/app/state';
import {
  stateToAnimationParams,
  lerpAnimationParams,
  type AnimationParams,
} from '@/app/mapping';

const DEFAULT_VRM_URL = '/models/avatar.glb';

export interface UseAvatarSceneOptions {
  vrmUrl?: string;
  width: number;
  height: number;
}

export function useAvatarScene(options: UseAvatarSceneOptions) {
  const { vrmUrl = DEFAULT_VRM_URL, width, height } = options;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<SceneContext | null>(null);
  const vrmRef = useRef<VRM | null>(null);
  const animParamsRef = useRef<AnimationParams>(stateToAnimationParams('idle', 0.8, 'neutral'));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = createScene({ canvas, width, height });
    ctxRef.current = ctx;

    loadVrm({ url: vrmUrl })
      .then((vrm) => {
        vrmRef.current = vrm;
        attachVrmToGroup(vrm, ctx.avatarGroup);
        setLoading(false);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });

    return () => {
      ctxRef.current = null;
      vrmRef.current = null;
    };
  }, [vrmUrl, width, height]);

  useEffect(() => {
    if (!ctxRef.current || !vrmRef.current) return;

    const ctx = ctxRef.current;
    const vrm = vrmRef.current;
    const clock = ctx.clock;

    let rafId: number;

    const loop = () => {
      rafId = requestAnimationFrame(loop);
      const current = useAppStore.getState().current;
      const dt = clock.getDelta();
      const time = clock.getElapsedTime();

      const targetParams = stateToAnimationParams(
        current.state,
        current.intensity,
        current.emotion
      );
      const params = lerpAnimationParams(
        animParamsRef.current,
        targetParams,
        current.intensityDeltaClamp
      );
      animParamsRef.current = params;

      applyStateMotion(ctx.avatarGroup, params, time);

      updateControls(ctx, dt);
      const lookAtTarget = ctx.camera.position.clone();
      applyAnimationParams(vrm, params, time, lookAtTarget);

      if (vrm.update) {
        vrm.update(dt);
      }

      renderFrame(ctx);
    };

    loop();
    return () => cancelAnimationFrame(rafId);
  }, [loading]);

  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    resizeRenderer(ctx, width, height);
  }, [width, height]);

  return { canvasRef, loading, error };
}

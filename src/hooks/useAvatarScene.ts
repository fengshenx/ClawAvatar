/**
 * 创建 Three 场景、加载 VRM、驱动状态动画的渲染循环
 * 每帧从 store 取状态 -> mapping -> lerp -> engine 应用
 */

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import {
  createScene,
  renderFrame,
  resizeRenderer,
  updateControls,
  loadVrm,
  attachVrmToGroup,
  loadVrma,
  setupClipAnimations,
  addVrmaClipsToMixer,
  applyStateMotion,
  applyLookAt,
  applyAnimationParams,
  applyHeadBoneMotion,
  setupAvatarDrag,
} from '@/engine';
import type { VrmaEntry } from '@/engine';
import type { SceneContext } from '@/engine';
import { useAppStore } from '@/app/state';
import { isElectron } from '@/config';

const PRESET_EXPRESSIONS = ['neutral', 'happy', 'sad', 'angry', 'surprised', 'relaxed', 'unknown'];

function extractExpressionsFromVrm(vrm: VRM): string[] {
  const expressionManager = vrm.expressionManager;
  if (!expressionManager) return [];
  return PRESET_EXPRESSIONS.filter((name) => expressionManager.getExpression(name) != null);
}

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
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const playClipRef = useRef<((name: string) => void) | null>(null);
  const clipNamesRef = useRef<string[]>([]);
  const actionsRef = useRef<THREE.AnimationAction[]>([]);
  const sanitizedActionCacheRef = useRef(new Map<THREE.AnimationAction, THREE.AnimationAction>());
  const activeClipIndexRef = useRef<number | null>(null);
  const loadSessionRef = useRef(0);
  const animParamsRef = useRef<AnimationParams>(stateToAnimationParams('idle', 0.8, 'neutral'));
  const lastGestureSeqRef = useRef(0);
  // 记录上次的状态，用于检测变化时输出日志
  const lastActionNameRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clipNames, setClipNames] = useState<string[]>([]);
  const availableExpressionsRef = useRef<string[]>([]);
  const dragCleanupRef = useRef<(() => void) | null>(null);

  function playClipAtFrame(actions: THREE.AnimationAction[], frame: number): void {
    const action = actions[0];
    if (!action) return;
    action.reset();
    action.enabled = true;
    action.setEffectiveWeight(1);
    action.setEffectiveTimeScale(0);
    const fps = 30;
    action.time = frame / fps;
    action.play();
    activeClipIndexRef.current = 0;
  }

  function isFaceTrackName(name: string): boolean {
    const lower = name.toLowerCase();
    return (
      lower.includes('morphtargetinfluences') ||
      lower.includes('expression') ||
      lower.includes('blendshape') ||
      lower.includes('presetexpressionmap') ||
      lower.includes('customexpressionmap') ||
      lower.includes('lookat') ||
      lower.includes('blink') ||
      lower.includes('aa') ||
      lower.includes('ih') ||
      lower.includes('ou') ||
      lower.includes('ee') ||
      lower.includes('oh')
    );
  }

  function toPlayableAction(action: THREE.AnimationAction): THREE.AnimationAction {
    const mixer = mixerRef.current;
    if (!mixer) return action;
    const cached = sanitizedActionCacheRef.current.get(action);
    if (cached) return cached;

    const clip = action.getClip();
    const filteredTracks = clip.tracks.filter((track) => !isFaceTrackName(track.name));
    if (filteredTracks.length === clip.tracks.length) {
      sanitizedActionCacheRef.current.set(action, action);
      return action;
    }

    const safeClip = new THREE.AnimationClip(
      `${clip.name}__bodyOnly`,
      clip.duration,
      filteredTracks.map((track) => track.clone()),
    );
    const safeAction = mixer.clipAction(safeClip);
    sanitizedActionCacheRef.current.set(action, safeAction);
    return safeAction;
  }

  function stopAllActions(actions: THREE.AnimationAction[]) {
    actions.forEach((a) => a.stop());
    for (const action of sanitizedActionCacheRef.current.values()) {
      action.stop();
    }
  }

  useEffect(() => {
    const sessionId = ++loadSessionRef.current;
    let disposed = false;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = createScene({ canvas, width, height, enableControls: !isElectron() });
    ctxRef.current = ctx;
    // Electron 模式下设置 Avatar 拖拽（拖拽时移动窗口）
    if (isElectron()) {
      dragCleanupRef.current = setupAvatarDrag(canvas, ctx, ctx.avatarGroup);
    }

    loadVrm({ url: vrmUrl })
      .then(async ({ vrm, gltf }) => {
        if (disposed || loadSessionRef.current !== sessionId) return;
        vrmRef.current = vrm;
        attachVrmToGroup(vrm, ctx.avatarGroup);

        const expressions = extractExpressionsFromVrm(vrm);
        availableExpressionsRef.current = expressions;
        // 避免首屏先看到 T-pose，等动作系统就绪后再显示
        vrm.scene.visible = false;
        const result = setupClipAnimations(vrm, gltf);
        if (result) {
          mixerRef.current = result.mixer;
          playClipRef.current = (name: string) => {
            const index = clipNamesRef.current.indexOf(name);
            if (index < 0) {
              activeClipIndexRef.current = null;
              return;
            }
            stopAllActions(actionsRef.current);
            const sourceAction = actionsRef.current[index];
            const action = sourceAction ? toPlayableAction(sourceAction) : null;
            if (!action) return;
            action.reset();
            action.enabled = true;
            action.setEffectiveWeight(1);
            action.setEffectiveTimeScale(1);
            action.play();
            activeClipIndexRef.current = index;
          };
          clipNamesRef.current = result.clipNames;
          actionsRef.current = result.actions;
          setClipNames([...result.clipNames]);
          playClipAtFrame(result.actions, 3);
          vrm.scene.visible = true;
          setLoading(false);
          void loadVrmaFromManifest(vrm);
        } else {
          mixerRef.current = null;
          playClipRef.current = null;
          clipNamesRef.current = [];
          actionsRef.current = [];
          activeClipIndexRef.current = null;
          setClipNames([]);
          await loadVrmaFromManifest(vrm);
          if (disposed || loadSessionRef.current !== sessionId) return;
          vrm.scene.visible = true;
          setLoading(false);
        }
      })
      .catch((e) => {
        if (disposed || loadSessionRef.current !== sessionId) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });

    async function loadVrmaFromManifest(vrm: VRM) {
      type Manifest = { animations?: { name: string; url: string }[] };
      let list: { name: string; url: string }[] = [];
      try {
        const res = await fetch('/animations/manifest.json');
        if (disposed || loadSessionRef.current !== sessionId) return;
        if (res.ok) {
          const data = (await res.json()) as Manifest;
          list = data.animations ?? [];
        }
      } catch {
        list = [];
      }
      if (list.length === 0) return;

      const vrmaEntries: VrmaEntry[] = [];
      for (const item of list) {
        if (disposed || loadSessionRef.current !== sessionId) return;
        try {
          const gltf = await loadVrma(item.url);
          if (disposed || loadSessionRef.current !== sessionId) return;
          const anims = gltf.userData?.vrmAnimations;
          if (Array.isArray(anims) && anims.length > 0) {
            anims.forEach((vrmAnimation, i) => {
              const name =
                anims.length === 1 ? item.name : `${item.name} ${i + 1}`;
              vrmaEntries.push({ name, vrmAnimation });
            });
          }
        } catch {
          // ignore
        }
      }
      if (vrmaEntries.length === 0) {
        return;
      }

      const mixer = mixerRef.current;
      const names = clipNamesRef.current;
      const actions = actionsRef.current;

      if (mixer) {
        const existing = new Set(names);
        const uniqueEntries = vrmaEntries.filter((entry) => {
          if (existing.has(entry.name)) return false;
          existing.add(entry.name);
          return true;
        });
        if (uniqueEntries.length === 0) {
          return;
        }
        addVrmaClipsToMixer(vrm, mixer, names, actions, uniqueEntries);
        playClipRef.current = (name: string) => {
          const index = names.indexOf(name);
          if (index < 0) {
            activeClipIndexRef.current = null;
            return;
          }
          stopAllActions(actions);
          const sourceAction = actions[index];
          const action = sourceAction ? toPlayableAction(sourceAction) : null;
          if (!action) return;
          action.reset();
          action.enabled = true;
          action.setEffectiveWeight(1);
          action.setEffectiveTimeScale(1);
          action.play();
          activeClipIndexRef.current = index;
        };
      } else {
        const newMixer = new THREE.AnimationMixer(vrm.scene);
        const newNames: string[] = [];
        const newActions: THREE.AnimationAction[] = [];
        addVrmaClipsToMixer(vrm, newMixer, newNames, newActions, vrmaEntries);
        const playClip = (name: string) => {
          const index = newNames.indexOf(name);
          if (index < 0) {
            activeClipIndexRef.current = null;
            return;
          }
          stopAllActions(newActions);
          const sourceAction = newActions[index];
          const action = sourceAction ? toPlayableAction(sourceAction) : null;
          if (!action) return;
          action.reset();
          action.enabled = true;
          action.setEffectiveWeight(1);
          action.setEffectiveTimeScale(1);
          action.play();
          activeClipIndexRef.current = index;
        };
        mixerRef.current = newMixer;
        playClipRef.current = playClip;
        clipNamesRef.current = newNames;
        actionsRef.current = newActions;
        if (newActions.length > 0 && activeClipIndexRef.current === null) {
          playClipAtFrame(newActions, 3);
        }
      }
      setClipNames([...clipNamesRef.current]);
    }

    return () => {
      disposed = true;
      dragCleanupRef.current?.();
      dragCleanupRef.current = null;
      ctxRef.current = null;
      vrmRef.current = null;
      mixerRef.current = null;
      playClipRef.current = null;
      clipNamesRef.current = [];
      actionsRef.current = [];
      sanitizedActionCacheRef.current = new Map();
      activeClipIndexRef.current = null;
      lastGestureSeqRef.current = 0;
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
      const dt = clock.getDelta();
      const time = clock.getElapsedTime();
      const mixer = mixerRef.current;
      const actions = actionsRef.current;
      const activeIndex = activeClipIndexRef.current;
      const activeAction =
        activeIndex != null && activeIndex >= 0
          ? actions[activeIndex] ?? null
          : null;
      const isClipPlaying = Boolean(activeAction?.enabled && !activeAction.paused);

      if (mixer) {
        mixer.update(dt);
      }

      const current = useAppStore.getState().current;
      if (
        current.gestureSeq > lastGestureSeqRef.current &&
        current.gesture &&
        playClipRef.current
      ) {
        lastGestureSeqRef.current = current.gestureSeq;
        playClipRef.current(current.gesture);
        lastActionNameRef.current = current.gesture;
      }

      if (!isClipPlaying) {
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
      } else {
        // 播放 clip 时仍保持眼神朝向相机，避免视线停在过期目标或被异常轨道锁住
        applyLookAt(vrm, ctx.camera.position.clone());
        const params = stateToAnimationParams(current.state, current.intensity, current.emotion);
        applyAnimationParams(vrm, params, time, ctx.camera.position.clone());
        updateControls(ctx, dt);
      }

      // Ensure expression values written this frame are applied immediately.
      if (vrm.update) {
        vrm.update(dt);
      }

      if (!isClipPlaying) {
        const params = stateToAnimationParams(current.state, current.intensity, current.emotion);
        applyHeadBoneMotion(vrm, params, time);
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

  const onPlayClip = (name: string) => {
    playClipRef.current?.(name);
  };

  const getAvailableExpressions = () => availableExpressionsRef.current;

  return { canvasRef, loading, error, clipNames, onPlayClip, getAvailableExpressions };
}

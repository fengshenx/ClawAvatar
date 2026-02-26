import { CubismModel } from './model/cubismmodel';
import { CubismMotion } from './motion/cubismmotion';
import { CubismMotionQueueManager } from './motion/cubismmotionqueuemanager';
import { CubismModelSettingJson } from './cubismmodelsettingjson';
import { csmVector } from './type/csmvector';
import { CubismIdHandle } from './id/cubismid';

export interface MotionEntry {
  name: string;
  motion: CubismMotion;
}

export interface MotionManifest {
  motions: { name: string; url: string }[];
}

/**
 * Live2D 动画控制器
 * 负责加载和播放 Live2D 动画
 */
export class Live2DAnimator {
  private model: CubismModel;
  private clips: Map<string, CubismMotion> = new Map();
  private motionQueueManager: CubismMotionQueueManager;
  private isPlaying = false;
  private lastTime = 0;
  private motionMeta: Map<string, { group: string; index: number; filename: string }> = new Map();
  private eyeBlinkIds: csmVector<CubismIdHandle> = new csmVector();
  private lipSyncIds: csmVector<CubismIdHandle> = new csmVector();
  private modelSetting: CubismModelSettingJson | null = null;

  constructor(model: CubismModel) {
    this.model = model;
    this.motionQueueManager = new CubismMotionQueueManager();
  }

  /**
   * 加载动画文件
   */
  async loadMotion(name: string, url: string): Promise<void> {
    try {
      const response = await fetch(url);
      const motionBuffer = await response.arrayBuffer();
      const motion = CubismMotion.create(
        motionBuffer,
        motionBuffer.byteLength,
        undefined,
        undefined,
        false
      );
      const meta = this.motionMeta.get(name);
      if (meta && this.modelSetting) {
        const fadeIn = this.modelSetting.getMotionFadeInTimeValue(meta.group, meta.index);
        if (fadeIn >= 0) motion.setFadeInTime(fadeIn);
        const fadeOut = this.modelSetting.getMotionFadeOutTimeValue(meta.group, meta.index);
        if (fadeOut >= 0) motion.setFadeOutTime(fadeOut);
      }
      motion.setEffectIds(this.eyeBlinkIds, this.lipSyncIds);
      this.clips.set(name, motion);
      console.log(`[Live2D] Motion loaded: ${name}`);
    } catch (error) {
      console.error(`[Live2D] Failed to load motion: ${name}`, error);
    }
  }

  /**
   * 批量加载动画
   */
  async loadMotions(motions: { name: string; url: string }[]): Promise<void> {
    const promises = motions.map((m) => this.loadMotion(m.name, m.url));
    await Promise.all(promises);
  }

  /**
   * 从 model3.json 加载动作清单
   */
  async loadMotionFromModelSetting(modelUrl: string): Promise<void> {
    try {
      const modelSetting = await fetchModelSettingBuffer(modelUrl);
      if (!modelSetting) {
        console.warn(`[Live2D] Failed to load model setting under: ${modelUrl}`);
        return;
      }

      const modelJsonBuffer = modelSetting.buffer;
      const setting = new CubismModelSettingJson(modelJsonBuffer, modelJsonBuffer.byteLength);
      this.modelSetting = setting;
      this.eyeBlinkIds.clear();
      this.lipSyncIds.clear();

      for (let i = 0; i < setting.getEyeBlinkParameterCount(); i++) {
        const id = setting.getEyeBlinkParameterId(i);
        if (id) this.eyeBlinkIds.pushBack(id);
      }
      for (let i = 0; i < setting.getLipSyncParameterCount(); i++) {
        const id = setting.getLipSyncParameterId(i);
        if (id) this.lipSyncIds.pushBack(id);
      }

      // 获取所有动作组
      const motions: { name: string; url: string }[] = [];
      const motionGroupNames = setting.getMotionGroupCount();

      for (let i = 0; i < motionGroupNames; i++) {
        const groupName = setting.getMotionGroupName(i);
        const motionCount = setting.getMotionCount(groupName);

        for (let j = 0; j < motionCount; j++) {
          const motionFileName = setting.getMotionFileName(groupName, j);
          const fullUrl = `${modelUrl}/${motionFileName}`;
          // 使用组名加索引作为动作名称
          const motionName = `${groupName}_${j}`;
          this.motionMeta.set(motionName, { group: groupName, index: j, filename: motionFileName });
          motions.push({ name: motionName, url: fullUrl });
        }
      }

      await this.loadMotions(motions);
      console.log(`[Live2D] Loaded ${motions.length} motions from model setting`);
    } catch (error) {
      console.warn(`[Live2D] Failed to load motions from model setting:`, error);
    }
  }

  /**
   * 加载动画清单（兼容旧格式）
   */
  async loadMotionManifest(manifestUrl: string): Promise<void> {
    try {
      const response = await fetch(manifestUrl);
      if (!response.ok) {
        console.warn(`[Live2D] Failed to load motion manifest: ${manifestUrl}`);
        return;
      }
      const text = await response.text();
      const head = text.slice(0, 256).trimStart().toLowerCase();
      if (head.startsWith('<!doctype') || head.startsWith('<html') || head.startsWith('<')) {
        console.warn(`[Live2D] Motion manifest not found: ${manifestUrl}`);
        return;
      }
      let manifest: MotionManifest;
      try {
        manifest = JSON.parse(text) as MotionManifest;
      } catch {
        console.warn(`[Live2D] Motion manifest is not valid JSON: ${manifestUrl}`);
        return;
      }
      if (!manifest || !Array.isArray(manifest.motions)) {
        console.warn(`[Live2D] Motion manifest schema invalid: ${manifestUrl}`);
        return;
      }
      await this.loadMotions(manifest.motions);
    } catch (error) {
      console.warn(`[Live2D] Failed to load motion manifest:`, error);
    }
  }

  /**
   * 播放动画
   */
  play(name: string): string | null {
    const motionName = this.resolveMotionName(name);
    const motion = motionName ? this.clips.get(motionName) : undefined;
    if (!motion) {
      console.warn(`[Live2D] Motion not found: ${name}`);
      return null;
    }

    // 开始新动画
    this.motionQueueManager.startMotion(motion, false);
    this.isPlaying = true;

    const meta = this.motionMeta.get(motionName);
    const filename = meta?.filename || '';
    console.log(`[Live2D] Playing motion: ${motionName}${filename ? ` (${filename})` : ''}`);
    return motionName;
  }

  /**
   * 停止动画
   */
  stop(): void {
    this.motionQueueManager.stopAllMotions();
    this.isPlaying = false;
  }

  /**
   * 更新动画状态
   */
  update(dt: number): void {
    this.lastTime += dt;
    this.motionQueueManager.doUpdateMotion(this.model, this.lastTime);
    this.isPlaying = !this.motionQueueManager.isFinished();
  }

  /**
   * 是否正在播放动画
   */
  isPlayingMotion(): boolean {
    return this.isPlaying;
  }

  /**
   * 获取已加载的动画名称列表
   */
  getLoadedMotionNames(): string[] {
    return Array.from(this.clips.keys());
  }

  private resolveMotionName(input: string): string | null {
    if (!input) return null;
    if (this.clips.has(input)) return input;

    const target = input.trim().toLowerCase();
    const names = this.getLoadedMotionNames();
    const exact = names.find((n) => n.toLowerCase() === target);
    if (exact) return exact;

    const byPrefix = names.find((n) => n.toLowerCase().startsWith(`${target}_`));
    if (byPrefix) return byPrefix;

    return null;
  }
}

function getModelFileBaseName(modelUrl: string): string {
  const normalized = modelUrl.replace(/\/+$/, '');
  const parts = normalized.split('/');
  return parts[parts.length - 1] || '';
}

function looksLikeHtml(buffer: ArrayBuffer): boolean {
  const head = new TextDecoder().decode(buffer.slice(0, 128)).trimStart();
  return head.startsWith('<');
}

async function fetchModelSettingBuffer(
  modelUrl: string
): Promise<{ url: string; buffer: ArrayBuffer } | null> {
  const baseName = getModelFileBaseName(modelUrl);
  const candidates = [
    `${modelUrl}/model3.json`,
    baseName ? `${modelUrl}/${baseName}.model3.json` : '',
    `${modelUrl}/model.json`,
    baseName ? `${modelUrl}/${baseName}.model.json` : '',
  ].filter(Boolean);

  for (const url of candidates) {
    const response = await fetch(url);
    if (!response.ok) continue;
    const buffer = await response.arrayBuffer();
    if (looksLikeHtml(buffer)) continue;
    return { url, buffer };
  }

  return null;
}

import { CubismModel } from './model/cubismmodel';
import { CubismMoc } from './model/cubismmoc';
import { CubismModelSettingJson } from './cubismmodelsettingjson';
import { Live2DManager } from './Live2DManager';
import { Live2DRenderer } from './Live2DRenderer';

export interface Live2DModelLoadOptions {
  /** Live2D 模型文件夹 URL（包含 model.json） */
  modelUrl: string;
  /** 外部传入的渲染 Canvas（可选） */
  canvas?: HTMLCanvasElement;
}

export interface Live2DModelLoadResult {
  /** Live2D 模型实例 */
  model: CubismModel;
  /** 渲染用的 Canvas */
  canvas: HTMLCanvasElement;
  /** Live2D 渲染器 */
  renderer: Live2DRenderer;
  /** 可用的参数名称列表 */
  parameterNames: string[];
  /** 可用的部件名称列表 */
  partNames: string[];
  /** 可用的表情名称列表 */
  expressionNames: string[];
}

/**
 * Live2D 模型加载器
 *
 * Live2D Cubism 4 模型文件结构：
 * public/models/live2d/
 * ├── model3.json           # 模型元数据（Cubism 4）
 * ├── model.moc3            # 模型数据（必需）
 * ├── model.texture.png     # 纹理（必需）
 * ├── model.physics3.json  # 物理模拟（可选）
 * └── motions/              # 动作目录
 */
export class Live2DModelLoader {
  /**
   * 加载 Live2D 模型
   */
  static async load(options: Live2DModelLoadOptions): Promise<Live2DModelLoadResult> {
    const { modelUrl, canvas: externalCanvas } = options;

    // 确保已初始化
    Live2DManager.getInstance().initialize();

    const modelSetting = await fetchModelSettingBuffer(modelUrl);
    if (!modelSetting) {
      throw new Error(`Failed to load model setting json under: ${modelUrl}`);
    }
    const modelJsonBuffer = modelSetting.buffer;

    // 使用 CubismModelSettingJson 解析模型配置
    const setting = new CubismModelSettingJson(modelJsonBuffer, modelJsonBuffer.byteLength);

    // 加载 moc3 文件
    const moc3FileName = setting.getModelFileName();
    const moc3Url = `${modelUrl}/${moc3FileName}`;
    const moc3Response = await fetch(moc3Url);
    if (!moc3Response.ok) {
      throw new Error(`Failed to load moc3 file: ${moc3Url}`);
    }
    const moc3Buffer = await moc3Response.arrayBuffer();

    // 创建模型
    const moc = CubismMoc.create(moc3Buffer, false);
    const model = moc.createModel();

    // 使用外部传入的 Canvas（例如 React 挂载的可见画布），否则创建离屏 Canvas
    const canvas = externalCanvas ?? document.createElement('canvas');
    const canvasWidth = model.getCanvasWidth();
    const canvasHeight = model.getCanvasHeight();
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    // 创建渲染器
    const renderer = new Live2DRenderer({
      canvas,
      width: canvasWidth,
      height: canvasHeight,
    });

    // 初始化渲染器
    renderer.initialize(model);

    // 加载纹理
    const textureCount = setting.getTextureCount();
    for (let i = 0; i < textureCount; i++) {
      const textureFileName = setting.getTextureFileName(i);
      const textureUrl = `${modelUrl}/${textureFileName}`;
      try {
        const texture = await loadImage(textureUrl);
        renderer.setTexture(i, texture);
      } catch (error) {
        console.warn(`[Live2D] Failed to load texture ${i}:`, error);
      }
    }

    // 提取参数名称
    const parameterNames: string[] = [];
    const paramCount = model.getParameterCount();
    for (let i = 0; i < paramCount; i++) {
      const paramId = model.getParameterId(i);
      parameterNames.push(paramId.getString().s);
    }

    // 提取部件名称
    const partNames: string[] = [];
    const partCount = model.getPartCount();
    for (let i = 0; i < partCount; i++) {
      const partId = model.getPartId(i);
      partNames.push(partId.getString().s);
    }

    // 提取表情名称
    const expressionNames: string[] = [];
    const exprCount = setting.getExpressionCount();
    for (let i = 0; i < exprCount; i++) {
      expressionNames.push(setting.getExpressionName(i));
    }

    console.log('[Live2D] Model loaded successfully:', {
      parameterCount: paramCount,
      partCount: partCount,
      expressionCount: expressionNames.length,
    });

    return {
      model,
      canvas,
      renderer,
      parameterNames,
      partNames,
      expressionNames,
    };
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

/**
 * 加载图片
 */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

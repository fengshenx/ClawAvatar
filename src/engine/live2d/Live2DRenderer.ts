import { CubismModel } from './model/cubismmodel';
import { CubismRenderer_WebGL } from './rendering/cubismrenderer_webgl';
import { CubismModelMatrix } from './math/cubismmodelmatrix';
import { CubismMatrix44 } from './math/cubismmatrix44';

export interface Live2DRendererConfig {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

/**
 * Live2D 渲染器
 * 负责 Live2D 模型的渲染输出（WebGL 方式）
 */
export class Live2DRenderer {
  private static readonly MODEL_SCALE = 1;
  private canvas: HTMLCanvasElement;
  // width/height are logical (CSS pixel) sizes used by layout/aspect calculations.
  private width: number;
  private height: number;
  private gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  private renderer: CubismRenderer_WebGL | null = null;
  private textures: (WebGLTexture | null)[] = [];
  private modelCanvasWidth = 0;
  private modelCanvasHeight = 0;
  private renderViewport: number[] = [0, 0, 0, 0];
  private anisotropyExt:
    | EXT_texture_filter_anisotropic
    | { TEXTURE_MAX_ANISOTROPY_EXT: number; MAX_TEXTURE_MAX_ANISOTROPY_EXT: number }
    | null = null;
  private maxAnisotropy = 0;

  constructor(config: Live2DRendererConfig) {
    this.canvas = config.canvas;
    this.width = config.width;
    this.height = config.height;

    // 初始化 WebGL (优先使用 WebGL 2)
    const options: WebGLContextAttributes & {
      desynchronized?: boolean;
    } = {
      antialias: true,
      alpha: true,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
      desynchronized: true,
    };

    let gl =
      (this.canvas.getContext('webgl2', options) ||
        this.canvas.getContext('webgl', options) ||
        this.canvas.getContext('experimental-webgl', options)) as WebGLRenderingContext | WebGL2RenderingContext | null;

    if (!gl) {
      throw new Error('Failed to get WebGL context');
    }
    this.gl = gl;

    // 该 SDK 版本未实现 CubismRenderer_WebGL.create()，需直接 new
    this.renderer = new CubismRenderer_WebGL();

    // 设置 Canvas 像素尺寸（按 DPR 放大）与视口
    this.applyCanvasSize();
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    this.renderViewport[0] = 0;
    this.renderViewport[1] = 0;
    this.renderViewport[2] = gl.drawingBufferWidth;
    this.renderViewport[3] = gl.drawingBufferHeight;

    // 启用混合
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    this.initAnisotropy();
  }

  /**
   * 初始化渲染器（需要在模型加载后调用）
   */
  initialize(model: CubismModel): void {
    if (this.renderer) {
      this.modelCanvasWidth = model.getCanvasWidth();
      this.modelCanvasHeight = model.getCanvasHeight();
      this.renderer.initialize(model);
      if (this.gl) {
        this.renderer.startUp(this.gl as WebGLRenderingContext);
      }
      // Cubism WebGL 渲染路径要求使用预乘 Alpha
      this.renderer.setIsPremultipliedAlpha(true);
      this.renderer.setModelColor(1, 1, 1, 1);
      this.renderer.useHighPrecisionMask(true);
      // NOTE: setClippingMaskBufferSize 会重建 clipping manager。该 SDK 版本中重建后不会自动继承 GL，
      // 会导致 draw 时 this.gl 为 undefined 并在 createTexture 处崩溃，因此这里先不改默认值。
      if (this.maxAnisotropy > 0) {
        this.renderer.setAnisotropy(this.maxAnisotropy);
      }
      this.updateMvpMatrix();
    }
  }

  /**
   * 设置纹理
   */
  setTexture(index: number, image: HTMLImageElement): void {
    if (!this.gl || !this.renderer) return;

    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    if (this.anisotropyExt && this.maxAnisotropy > 0) {
      gl.texParameterf(
        gl.TEXTURE_2D,
        this.anisotropyExt.TEXTURE_MAX_ANISOTROPY_EXT,
        this.maxAnisotropy
      );
    }
    gl.bindTexture(gl.TEXTURE_2D, null);

    this.textures[index] = texture;
    this.renderer.bindTexture(index, texture as WebGLTexture);
  }

  /**
   * 渲染 Live2D 模型到 Canvas
   */
  render(_model: CubismModel): void {
    if (!this.gl || !this.renderer) return;

    const gl = this.gl;

    if (gl.isContextLost()) return;

    // 显式传入 Framebuffer
    this.renderer.setRenderState(null as unknown as WebGLFramebuffer, this.renderViewport);

    // 清空 Canvas
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // 渲染模型
    this.renderer.drawModel();

  }

  /**
   * 调整渲染尺寸
   */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.applyCanvasSize();

    if (this.gl) {
      this.gl.viewport(0, 0, this.gl.drawingBufferWidth, this.gl.drawingBufferHeight);
      this.renderViewport[0] = 0;
      this.renderViewport[1] = 0;
      this.renderViewport[2] = this.gl.drawingBufferWidth;
      this.renderViewport[3] = this.gl.drawingBufferHeight;
    }
    this.updateMvpMatrix();
  }

  /**
   * 获取 Canvas 元素（用于 React 引用）
   */
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * 获取 WebGL 上下文
   */
  getGl(): WebGLRenderingContext | WebGL2RenderingContext | null {
    return this.gl;
  }

  /**
   * 释放资源
   */
  dispose(): void {
    if (this.gl) {
      for (const texture of this.textures) {
        if (texture) {
          this.gl.deleteTexture(texture);
        }
      }
    }
    this.textures = [];
  }

  private updateMvpMatrix(): void {
    if (!this.renderer || this.modelCanvasWidth <= 0 || this.modelCanvasHeight <= 0) return;

    const projection = new CubismMatrix44();
    const modelMatrix = new CubismModelMatrix(this.modelCanvasWidth, this.modelCanvasHeight);

    // 对齐 Demo 的窗口适配逻辑，避免模型落在左下角
    if (this.modelCanvasWidth > 1.0 && this.width < this.height) {
      modelMatrix.setWidth(2.0 * Live2DRenderer.MODEL_SCALE);
      projection.scale(1.0, this.width / Math.max(this.height, 1));
    } else {
      projection.scale(this.height / Math.max(this.width, 1), 1.0);
    }

    projection.multiplyByMatrix(modelMatrix);
    this.renderer.setMvpMatrix(projection);
  }

  private applyCanvasSize(): void {
    const dpr =
      typeof window !== 'undefined' && Number.isFinite(window.devicePixelRatio)
        ? Math.max(1, window.devicePixelRatio)
        : 1;
    this.canvas.width = Math.max(1, Math.round(this.width * dpr));
    this.canvas.height = Math.max(1, Math.round(this.height * dpr));
  }

  private initAnisotropy(): void {
    if (!this.gl) return;
    const ext =
      this.gl.getExtension('EXT_texture_filter_anisotropic') ||
      this.gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic') ||
      this.gl.getExtension('MOZ_EXT_texture_filter_anisotropic');
    if (!ext) return;
    this.anisotropyExt = ext;
    this.maxAnisotropy = this.gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 0;
  }
}

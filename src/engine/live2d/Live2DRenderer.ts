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
  private width: number;
  private height: number;
  private gl: WebGLRenderingContext | null = null;
  private renderer: CubismRenderer_WebGL | null = null;
  private textures: (WebGLTexture | null)[] = [];
  private modelCanvasWidth = 0;
  private modelCanvasHeight = 0;
  private renderViewport: number[] = [0, 0, 0, 0];

  constructor(config: Live2DRendererConfig) {
    this.canvas = config.canvas;
    this.width = config.width;
    this.height = config.height;

    // 初始化 WebGL
    const gl =
      this.canvas.getContext('webgl', {
        antialias: false,
        alpha: true,
        premultipliedAlpha: true,
        powerPreference: 'low-power',
      }) ||
      this.canvas.getContext('experimental-webgl', {
        antialias: false,
        alpha: true,
        premultipliedAlpha: true,
      }) as WebGLRenderingContext;
    if (!gl) {
      throw new Error('Failed to get WebGL context');
    }
    this.gl = gl;

    // 该 SDK 版本未实现 CubismRenderer_WebGL.create()，需直接 new
    this.renderer = new CubismRenderer_WebGL();

    // 设置 Canvas 尺寸
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    // 设置视口
    gl.viewport(0, 0, this.width, this.height);
    this.renderViewport = [0, 0, this.width, this.height];

    // 启用混合
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
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
        this.renderer.startUp(this.gl);
      }
      // Cubism WebGL 渲染路径要求使用预乘 Alpha
      this.renderer.setIsPremultipliedAlpha(true);
      this.renderer.setModelColor(1, 1, 1, 1);
      this.renderer.useHighPrecisionMask(false);
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
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

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

    // 避免每帧 getParameter 带来的同步开销，视口在 resize 时维护
    this.renderer.setRenderState(null as unknown as WebGLFramebuffer, this.renderViewport);

    // 清空 Canvas
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // 渲染模型
    this.renderer.drawModel();

    // 避免每帧 gl.getError() 同步查询
  }

  /**
   * 调整渲染尺寸
   */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;

    if (this.gl) {
      this.gl.viewport(0, 0, width, height);
      this.renderViewport = [0, 0, width, height];
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
  getGl(): WebGLRenderingContext | null {
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
}

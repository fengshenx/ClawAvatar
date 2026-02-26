# ClawAvatar 完全迁移至 Live2D 方案

## 📋 概述

**完全抛弃 VRM，彻底重写渲染层！**

本方案将 ClawAvatar 从 VRM + Three.js 架构**完全迁移**到 Live2D，不保留任何 VRM 相关代码，专注于 Live2D 最佳实践。

**作者：** AI Assistant  
**日期：** 2026-02-26  
**项目：** ClawAvatar  
**版本：** 0.2.0 (Live2D Only)

---

## 🎯 核心决策

### ✅ 保持不变
- OpenClaw Gateway Avatar 插件协议（WebSocket 握手）
- API 接口（`emotion`, `action`, `intensity`, `gesture`）
- 状态管理（Zustand store）
- React UI 框架

### ❌ 完全移除
- **VRM 所有依赖**（`@pixiv/three-vrm`, `@pixiv/three-vrm-animation`）
- **Three.js**（Live2D 有自己的渲染器）
- VRM 模型文件（`.vrm`, `.glb`）
- VRM 动画文件（`.vrma`）
- 所有 `src/engine/` 下的 VRM 相关文件

### 🆕 全新引入
- Live2D Cubism SDK for Web
- Live2D 模型格式（`.moc3`）
- Live2D 动画格式（`.motion3.json`）

---

## 🗂️ 新项目结构

```
src/
├── engine/
│   ├── live2d/
│   │   ├── Live2DManager.ts      # Live2D SDK 管理器（单例）
│   │   ├── Live2DModelLoader.ts  # Live2D 模型加载器
│   │   ├── Live2DRenderer.ts     # Live2D 渲染器
│   │   ├── Live2DAnimator.ts     # Live2D 动画控制器
│   │   ├── ParameterManager.ts   # 参数管理器（表情/动作）
│   │   └── MotionManager.ts      # 动作管理器
│   └── index.ts                  # 导出所有引擎模块
├── hooks/
│   ├── useLive2DScene.ts         # Live2D 场景 Hook（替代 useAvatarScene）
│   └── useElectronAvatarPlugin.ts # 保持不变（WebSocket 握手）
├── app/
│   ├── state.ts                  # Zustand store（保持不变）
│   └── mapping.ts                # 状态→Live2D参数映射
├── ui/
│   └── AvatarStatusIndicator.tsx # UI 组件（保持不变）
└── protocol/
    └── types.ts                  # 类型定义（保持不变）
```

---

## 🛠️ 实施方案

### Step 1: 清理 VRM 依赖

#### 1.1 卸载 VRM 相关包

```bash
npm uninstall @pixiv/three-vrm
npm uninstall @pixiv/three-vrm-animation
npm uninstall three
```

#### 1.2 克隆 Live2D 官方 SDK

```bash
# 克隆 Live2D 官方仓库到临时目录
cd /tmp
git clone https://github.com/Live2D/CubismWebFramework.git
cd CubismWebFramework

# 安装依赖并构建
npm install
npm run build

# 复制到项目
mkdir -p ~/Documents/code/ClawAvatar/src/engine/live2d/Core
cp -r dist/* ~/Documents/code/ClawAvatar/src/engine/live2d/

# 下载 Cubism Core for Web（需要同意协议）
# 访问：https://www.live2d.com/download/cubism-sdk/download-web/
# 下载后解压到 ~/Documents/code/ClawAvatar/src/engine/live2d/Core/
```

#### 1.3 删除 VRM 相关文件

```bash
# 删除 engine 目录下的所有 VRM 文件
rm -rf src/engine/loadVrm.ts
rm -rf src/engine/loadVrma.ts
rm -rf src/engine/avatarRig.ts
rm -rf src/engine/clipAnimations.ts
rm -rf src/engine/vrmaClips.ts
rm -rf src/engine/animation.ts
rm -rf src/engine/renderer.ts

# 删除旧的 VRM 模型文件
rm -rf public/models/avatar.glb
rm -rf public/animations/*.vrma
```

#### 1.4 更新 package.json

```json
{
  "name": "claw-avatar",
  "version": "0.2.0",
  "description": "ClawAvatar - Live2D Avatar Client for OpenClaw",
  "dependencies": {
    "@pixiv/live2d-sdk-cubism-web": "^1.0.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "zustand": "^4.5.2"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "@types/react": "^18.3.3",
    "typescript": "^5.5.2",
    "vite": "^5.3.1"
  }
}
```

---

### Step 2: 创建 Live2D 引擎核心

#### 2.1 Live2D SDK 管理器

**新建文件：** `src/engine/live2d/Live2DManager.ts`

```typescript
import * as live2d from '@pixiv/live2d-sdk-cubism-web';

/**
 * Live2D Cubism SDK 管理器（单例）
 * 负责 SDK 的初始化、配置和生命周期管理
 */
export class Live2DManager {
  private static instance: Live2DManager;
  private cubismSdk: live2d.CubismSDK | null = null;
  private initialized = false;
  
  private constructor() {}
  
  static getInstance(): Live2DManager {
    if (!this.instance) {
      this.instance = new Live2DManager();
    }
    return this.instance;
  }
  
  /**
   * 初始化 Cubism SDK
   * 必须在使用任何 Live2D 功能前调用
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      // 初始化 Cubism SDK
      this.cubismSdk = await live2d.CubismSDK.initialize();
      
      // 设置日志级别
      live2d.CubismSDK.setLogLevel(live2d.LogLevel.LogLevel_Info);
      
      // 设置回调函数
      this.setupCallbacks();
      
      this.initialized = true;
      console.log('[Live2D] Cubism SDK initialized successfully');
    } catch (error) {
      console.error('[Live2D] Failed to initialize Cubism SDK:', error);
      throw error;
    }
  }
  
  /**
   * 释放 SDK 资源
   */
  dispose(): void {
    if (this.cubismSdk) {
      live2d.CubismSDK.dispose();
      this.cubismSdk = null;
      this.initialized = false;
      console.log('[Live2D] Cubism SDK disposed');
    }
  }
  
  /**
   * 检查 SDK 是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized;
  }
  
  /**
   * 设置回调函数（用于调试和监控）
   */
  private setupCallbacks(): void {
    // Moc 合并回调
    live2d.CubismSDK.setMocConsistencyValidation(true);
    
    // 性能监控回调
    if (process.env.NODE_ENV === 'development') {
      live2d.CubismSDK.setRenderingProfiler(true);
    }
  }
}
```

#### 2.2 Live2D 模型加载器

**新建文件：** `src/engine/live2d/Live2DModelLoader.ts`

```typescript
import * as live2d from '@pixiv/live2d-sdk-cubism-web';
import { Live2DManager } from './Live2DManager';

export interface Live2DModelLoadOptions {
  /** Live2D 模型文件夹 URL（包含 model.json） */
  modelUrl: string;
}

export interface Live2DModelLoadResult {
  /** Live2D 模型实例 */
  model: live2d.Live2DModel;
  /** 渲染用的 Canvas */
  canvas: HTMLCanvasElement;
  /** 可用的参数名称列表 */
  parameterNames: string[];
  /** 可用的表情名称列表 */
  expressionNames: string[];
}

/**
 * Live2D 模型加载器
 * 
 * Live2D 模型文件结构：
 * public/models/live2d/
 * ├── model.json              # 模型元数据（必需）
 * ├── model.moc3              # 模型数据（必需）
 * ├── model.texture.png       # 纹理（必需）
 * ├── model.physics3.json     # 物理模拟（可选）
 * └── model.user.json         # 用户参数（可选）
 */
export class Live2DModelLoader {
  /**
   * 加载 Live2D 模型
   */
  static async load(options: Live2DModelLoadOptions): Promise<Live2DModelLoadResult> {
    const { modelUrl } = options;
    
    // 确保已初始化
    await Live2DManager.getInstance().initialize();
    
    // 加载模型 JSON 配置
    const modelJsonUrl = `${modelUrl}/model.json`;
    const modelJsonResponse = await fetch(modelJsonUrl);
    if (!modelJsonResponse.ok) {
      throw new Error(`Failed to load model.json: ${modelJsonUrl}`);
    }
    const modelJson = await modelJsonResponse.json();
    
    // 加载 moc3 文件
    const moc3FileName = modelJson.FileReferences.Moc;
    const moc3Url = `${modelUrl}/${moc3FileName}`;
    const moc3Response = await fetch(moc3Url);
    if (!moc3Response.ok) {
      throw new Error(`Failed to load moc3 file: ${moc3Url}`);
    }
    const moc3Buffer = await moc3Response.arrayBuffer();
    
    // 加载纹理
    const textureFileName = modelJson.FileReferences.Textures[0];
    const textureUrl = `${modelUrl}/${textureFileName}`;
    const textureResponse = await fetch(textureUrl);
    if (!textureResponse.ok) {
      throw new Error(`Failed to load texture: ${textureUrl}`);
    }
    const textureBlob = await textureResponse.blob();
    const textureBitmap = await createImageBitmap(textureBlob);
    
    // 创建渲染用的 Canvas
    const canvas = document.createElement('canvas');
    canvas.width = modelJson.CanvasWidth || 2048;
    canvas.height = modelJson.CanvasHeight || 2048;
    
    // 创建 Live2D 模型
    const model = await live2d.Live2DModel.fromMoc3(moc3Buffer, {
      texture: textureBitmap,
    });
    
    // 加载物理模拟（如果有）
    if (modelJson.FileReferences.Physics) {
      const physicsUrl = `${modelUrl}/${modelJson.FileReferences.Physics}`;
      try {
        const physicsResponse = await fetch(physicsUrl);
        if (physicsResponse.ok) {
          const physicsJson = await physicsResponse.json();
          // TODO: 应用物理模拟设置
          // model.setPhysics(physicsJson);
        }
      } catch (error) {
        console.warn('[Live2D] Failed to load physics:', error);
      }
    }
    
    // 提取参数名称
    const parameterNames: string[] = [];
    for (let i = 0; i < model.getParameterCount(); i++) {
      const param = model.getParameter(i);
      parameterNames.push(param.getName());
    }
    
    // 提取表情名称
    const expressionNames: string[] = [];
    if (modelJson.FileReferences.Expressions) {
      for (const exprName of Object.keys(modelJson.FileReferences.Expressions)) {
        expressionNames.push(exprName);
      }
    }
    
    console.log('[Live2D] Model loaded successfully:', {
      parameterCount: parameterNames.length,
      expressionCount: expressionNames.length,
    });
    
    return {
      model,
      canvas,
      parameterNames,
      expressionNames,
    };
  }
}
```

#### 2.3 Live2D 渲染器

**新建文件：** `src/engine/live2d/Live2DRenderer.ts`

```typescript
import * as live2d from '@pixiv/live2d-sdk-cubism-web';

export interface Live2DRendererConfig {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

/**
 * Live2D 渲染器
 * 负责 Live2D 模型的渲染输出
 */
export class Live2DRenderer {
  private canvas: HTMLCanvasElement;
  private width: number;
  private height: number;
  private context: CanvasRenderingContext2D;
  
  constructor(config: Live2DRendererConfig) {
    this.canvas = config.canvas;
    this.width = config.width;
    this.height = config.height;
    
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D context from canvas');
    }
    this.context = ctx;
  }
  
  /**
   * 渲染 Live2D 模型到 Canvas
   */
  render(model: live2d.Live2DModel): void {
    const renderer = model.getRenderer();
    
    // 清空 Canvas
    this.context.clearRect(0, 0, this.width, this.height);
    
    // 设置渲染模式
    renderer.setRenderMode(live2d.Live2DRenderMode.Live2DRenderMode_FrontOnly);
    
    // 渲染模型
    renderer.draw(this.context);
  }
  
  /**
   * 调整渲染尺寸
   */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
  }
  
  /**
   * 获取 Canvas 元素（用于 React 引用）
   */
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }
}
```

#### 2.4 Live2D 动画控制器

**新建文件：** `src/engine/live2d/Live2DAnimator.ts`

```typescript
import * as live2d from '@pixiv/live2d-sdk-cubism-web';

export interface Live2DAnimationClip {
  name: string;
  motion: live2d.Live2DMotion;
}

/**
 * Live2D 动画控制器
 * 负责加载和播放 Live2D 动画
 */
export class Live2DAnimator {
  private model: live2d.Live2DModel;
  private clips: Map<string, live2d.Live2DMotion> = new Map();
  private currentMotion: live2d.Live2DMotion | null = null;
  private isPlaying = false;
  
  constructor(model: live2d.Live2DModel) {
    this.model = model;
  }
  
  /**
   * 加载动画文件
   */
  async loadMotion(name: string, url: string): Promise<void> {
    try {
      const response = await fetch(url);
      const motionJson = await response.json();
      const motion = await live2d.Live2DMotion.fromMotion3Json(motionJson);
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
    const promises = motions.map(m => this.loadMotion(m.name, m.url));
    await Promise.all(promises);
  }
  
  /**
   * 播放动画
   */
  play(name: string): void {
    const motion = this.clips.get(name);
    if (!motion) {
      console.warn(`[Live2D] Motion not found: ${name}`);
      return;
    }
    
    // 停止当前动画
    if (this.currentMotion) {
      this.currentMotion.finish();
    }
    
    // 开始新动画
    this.currentMotion = motion;
    motion.start();
    this.isPlaying = true;
    
    console.log(`[Live2D] Playing motion: ${name}`);
  }
  
  /**
   * 停止动画
   */
  stop(): void {
    if (this.currentMotion) {
      this.currentMotion.finish();
      this.currentMotion = null;
      this.isPlaying = false;
    }
  }
  
  /**
   * 更新动画状态
   */
  update(dt: number): void {
    if (this.currentMotion && this.isPlaying) {
      this.currentMotion.update(dt);
      
      // 检查动画是否结束
      if (this.currentMotion.isFinished()) {
        this.isPlaying = false;
      }
    }
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
}
```

#### 2.5 参数管理器

**新建文件：** `src/engine/live2d/ParameterManager.ts`

```typescript
import * as live2d from '@pixiv/live2d-sdk-cubism-web';

/**
 * Live2D 参数管理器
 * 负责管理表情参数和动作触发
 */
export class ParameterManager {
  private model: live2d.Live2DModel;
  private parameterMap: Map<string, live2d.Live2DParameter> = new Map();
  
  // 预定义的表情参数映射
  private static readonly EMOTION_MAP: Record<string, Record<string, number>> = {
    neutral: {
      ParamEyeLOpen: 1,
      ParamEyeROpen: 1,
      ParamMouthForm: 0,
    },
    happy: {
      ParamEyeLOpen: 1,
      ParamEyeROpen: 1,
      ParamEyeLSmile: 0.7,
      ParamEyeRSmile: 0.7,
      ParamMouthForm: 0.5,
    },
    sad: {
      ParamEyeLOpen: 0.6,
      ParamEyeROpen: 0.6,
      ParamBrowLY: 0.5,
      ParamBrowRY: 0.5,
      ParamMouthForm: -0.3,
    },
    angry: {
      ParamEyeLOpen: 0.8,
      ParamEyeROpen: 0.8,
      ParamBrowLAngle: 0.3,
      ParamBrowRAngle: 0.3,
      ParamMouthForm: -0.2,
    },
    surprised: {
      ParamEyeLOpen: 1,
      ParamEyeROpen: 1,
      ParamBrowLY: -0.5,
      ParamBrowRY: -0.5,
      ParamMouthForm: 0.8,
    },
    relaxed: {
      ParamEyeLOpen: 0.9,
      ParamEyeROpen: 0.9,
      ParamBrowLAngle: -0.1,
      ParamBrowRAngle: -0.1,
      ParamMouthForm: 0.1,
    },
  };
  
  constructor(model: live2d.Live2DModel) {
    this.model = model;
    
    // 构建参数名到参数对象的映射
    for (let i = 0; i < model.getParameterCount(); i++) {
      const param = model.getParameter(i);
      this.parameterMap.set(param.getName(), param);
    }
  }
  
  /**
   * 应用表情参数
   */
  applyEmotion(emotion: string, intensity: number): void {
    const paramMap = ParameterManager.EMOTION_MAP[emotion];
    if (!paramMap) {
      console.warn(`[ParameterManager] Unknown emotion: ${emotion}`);
      return;
    }
    
    for (const [paramName, value] of Object.entries(paramMap)) {
      const param = this.parameterMap.get(paramName);
      if (param) {
        param.setValue(value * intensity);
      }
    }
  }
  
  /**
   * 应用呼吸动画
   */
  applyBreathing(time: number, weight: number): void {
    const breathAmplitude = 0.04 * weight;
    const breathFreq = 1.2;
    const breath = Math.sin(time * breathFreq) * breathAmplitude;
    
    this.setParameter('ParamBodyY', breath);
    this.setParameter('ParamBodyX', breath * 0.3);
  }
  
  /**
   * 应用眨眼动画
   */
  applyBlinking(weight: number): void {
    // Live2D 通常自带眨眼功能，这里可以调整眨眼权重
    this.setParameter('ParamEyeLOpen', 1 - weight);
    this.setParameter('ParamEyeROpen', 1 - weight);
  }
  
  /**
   * 设置参数值
   */
  setParameter(name: string, value: number): void {
    const param = this.parameterMap.get(name);
    if (param) {
      param.setValue(value);
    }
  }
  
  /**
   * 获取参数值
   */
  getParameter(name: string): number {
    const param = this.parameterMap.get(name);
    return param ? param.getValue() : 0;
  }
  
  /**
   * 获取所有参数名称
   */
  getParameterNames(): string[] {
    return Array.from(this.parameterMap.keys());
  }
}
```

#### 2.6 导出所有模块

**修改文件：** `src/engine/index.ts`

```typescript
export { Live2DManager } from './live2d/Live2DManager';
export { Live2DModelLoader } from './live2d/Live2DModelLoader';
export { Live2DRenderer } from './live2d/Live2DRenderer';
export { Live2DAnimator } from './live2d/Live2DAnimator';
export { ParameterManager } from './live2d/ParameterManager';
```

---

### Step 3: 创建 Live2D 场景 Hook

**新建文件：** `src/hooks/useLive2DScene.ts`

```typescript
import { useEffect, useRef, useState } from 'react';
import * as live2d from '@pixiv/live2d-sdk-cubism-web';
import {
  Live2DModelLoader,
  Live2DRenderer,
  Live2DAnimator,
  ParameterManager,
} from '@/engine';
import { useAppStore } from '@/app/state';
import { isElectron } from '@/config';

const DEFAULT_MODEL_URL = '/models/live2d/model';

export interface UseLive2DSceneOptions {
  modelUrl?: string;
  width: number;
  height: number;
}

export function useLive2DScene(options: UseLive2DSceneOptions) {
  const { modelUrl = DEFAULT_MODEL_URL, width, height } = options;
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modelRef = useRef<live2d.Live2DModel | null>(null);
  const rendererRef = useRef<Live2DRenderer | null>(null);
  const animatorRef = useRef<Live2DAnimator | null>(null);
  const paramManagerRef = useRef<ParameterManager | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [motionNames, setMotionNames] = useState<string[]>([]);
  
  useEffect(() => {
    let disposed = false;
    let animationFrameId: number;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // 加载 Live2D 模型
    Live2DModelLoader.load({ modelUrl })
      .then(async ({ model, canvas: modelCanvas, parameterNames, expressionNames }) => {
        if (disposed) return;
        
        modelRef.current = model;
        
        // 创建渲染器
        const renderer = new Live2DRenderer({
          canvas,
          width,
          height,
        });
        rendererRef.current = renderer;
        
        // 创建动画控制器
        const animator = new Live2DAnimator(model);
        animatorRef.current = animator;
        
        // 加载动作文件
        const manifestUrl = `${modelUrl}/motions.json`;
        try {
          const manifestResponse = await fetch(manifestUrl);
          if (manifestResponse.ok) {
            const manifest = await manifestResponse.json();
            await animator.loadMotions(manifest.motions);
            setMotionNames(animator.getLoadedMotionNames());
          }
        } catch (err) {
          console.warn('[useLive2DScene] Failed to load motion manifest:', err);
        }
        
        // 创建参数管理器
        const paramManager = new ParameterManager(model);
        paramManagerRef.current = paramManager;
        
        setLoading(false);
        
        // 启动渲染循环
        const clock = new THREE.Clock();
        
        const loop = () => {
          animationFrameId = requestAnimationFrame(loop);
          
          const dt = clock.getDelta();
          const time = clock.getElapsedTime();
          
          const model = modelRef.current;
          const renderer = rendererRef.current;
          const animator = animatorRef.current;
          const paramManager = paramManagerRef.current;
          
          if (!model || !renderer || !paramManager) return;
          
          // 更新动画
          animator?.update(dt);
          
          // 获取当前状态
          const current = useAppStore.getState().current;
          
          // 如果没有播放动作，应用表情和呼吸
          if (!animator?.isPlayingMotion()) {
            paramManager.applyEmotion(current.emotion, current.intensity);
            paramManager.applyBreathing(time, 1);
            paramManager.applyBlinking(1);
          }
          
          // 更新模型
          model.update(dt);
          
          // 渲染
          renderer.render(model);
        };
        
        loop();
      })
      .catch((err) => {
        if (disposed) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    
    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrameId);
      
      // 清理资源
      modelRef.current = null;
      rendererRef.current = null;
      animatorRef.current = null;
      paramManagerRef.current = null;
    };
  }, [modelUrl, width, height]);
  
  // 监听动作触发
  useEffect(() => {
    const current = useAppStore.getState().current;
    const gestureSeqRef = useRef(0);
    
    if (current.gestureSeq > gestureSeqRef.current && current.gesture) {
      gestureSeqRef.current = current.gestureSeq;
      animatorRef.current?.play(current.gesture);
    }
  }, [useAppStore.getState().current.gestureSeq]);
  
  // 响应窗口大小变化
  useEffect(() => {
    const renderer = rendererRef.current;
    if (renderer) {
      renderer.resize(width, height);
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
```

---

### Step 4: 更新 App.tsx

**修改文件：** `src/App.tsx`

```typescript
import { useLive2DScene } from '@/hooks/useLive2DScene';

function App() {
  const { canvasRef, loading, error, motionNames, playMotion } = useLive2DScene({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  
  if (loading) {
    return <div>Loading Live2D model...</div>;
  }
  
  if (error) {
    return <div>Error: {error}</div>;
  }
  
  return (
    <div>
      <canvas ref={canvasRef} />
      {/* UI 控件保持不变 */}
    </div>
  );
}

export default App;
```

---

### Step 5: 准备 Live2D 模型

#### 5.1 模型文件结构

```
public/models/live2d/
├── model/
│   ├── model.json              # 模型元数据
│   ├── model.moc3              # 模型数据
│   ├── model.texture.png       # 纹理
│   ├── model.physics3.json     # 物理模拟
│   └── model.user.json         # 用户参数
└── motions.json                # 动画清单
```

#### 5.2 动画清单格式

**文件：** `public/models/live2d/motions.json`

```json
{
  "motions": [
    {
      "name": "greeting",
      "url": "./motions/greeting.motion3.json"
    },
    {
      "name": "v_sign",
      "url": "./motions/v_sign.motion3.json"
    },
    {
      "name": "shoot",
      "url": "./motions/shoot.motion3.json"
    },
    {
      "name": "spin",
      "url": "./motions/spin.motion3.json"
    },
    {
      "name": "model_pose",
      "url": "./motions/model_pose.motion3.json"
    },
    {
      "name": "squat",
      "url": "./motions/squat.motion3.json"
    }
  ]
}
```

---

## ⚠️ 注意事项

### Live2D 模型获取

**推荐方式：**

1. **使用 VRoid Studio**（推荐）
   - 在 VRoid Studio 中创建角色
   - 导出为 Live2D 格式（`.moc3` + `.json`）
   - 下载地址：https://vroid.com/en/studio

2. **使用 Live2D Cubism Editor**
   - 下载地址：https://www.live2d.com/en/download/cubism-sdk/
   - 从头创建或导入现有模型

3. **使用社区模型**
   - Live2D 官方示例：https://www.live2d.com/en/sample/
   - Booth 市场：https://booth.pm/en

### 表情参数映射

**重要：** 不同 Live2D 模型的参数名称可能不同！

如果你使用的模型参数名称与 `EMOTION_MAP` 中定义的不同，需要修改 `ParameterManager.ts` 中的映射表。

查看模型的参数名称：
1. 打开模型的 `model.json`
2. 查看 `Parameters` 字段
3. 更新 `EMOTION_MAP` 中的键名

### 动画文件格式

Live2D 动画使用 `.motion3.json` 格式。

如果你的模型没有预制的动作，可以：
1. 使用 Live2D Cubism Editor 创建动画
2. 导出为 `.motion3.json` 格式
3. 放入 `public/models/live2d/motions/` 目录

---

## 📦 Live2D SDK 安装指南

### **重要说明**

**Live2D Cubism SDK 不是通过 npm 安装的！**

需要从 GitHub 克隆官方仓库，并手动构建。

---

### **步骤 1: 克隆并构建 SDK**

```bash
# 1. 克隆官方仓库
cd /tmp
git clone https://github.com/Live2D/CubismWebFramework.git
cd CubismWebFramework

# 2. 查看版本
git tag

# 3. 切换到稳定版本（可选）
git checkout cubism-sdk-25.4.0

# 4. 安装依赖
npm install

# 5. 构建项目
npm run build
```

**构建输出：** `dist/` 目录包含编译后的 SDK 文件

---

### **步骤 2: 下载 Cubism Core for Web**

**Cubism Core 是 Live2D 的核心库，需要单独下载！**

1. **访问下载页面**：
   - https://www.live2d.com/download/cubism-sdk/download-web/

2. **同意协议**：
   - 需要同意 Live2D 的使用协议
   - **注意协议限制**（个人/商业使用）

3. **下载并解压**：
   ```bash
   # 解压到项目目录
   unzip ~/Downloads/Core.zip -d ~/Documents/code/ClawAvatar/src/engine/live2d/Core/
   ```

---

### **步骤 3: 集成到项目**

```bash
# 复制构建产物
mkdir -p ~/Documents/code/ClawAvatar/src/engine/live2d/dist
cp -r /tmp/CubismWebFramework/dist/* ~/Documents/code/ClawAvatar/src/engine/live2d/dist/

# 或者使用 npm link（更方便开发）
cd /tmp/CubismWebFramework
npm link
cd ~/Documents/code/ClawAvatar
npm link @live2d/cubism-web-framework
```

---

### **步骤 4: 更新 package.json**

```json
{
  "dependencies": {
    "live2d": "file:src/engine/live2d/Core"
  },
  "devDependencies": {
    "@live2d/cubism-web-framework": "file:src/engine/live2d/dist"
  }
}
```

---

### **注意事项**

⚠️ **协议限制**
- Live2D SDK 有**使用协议限制**
- 个人项目：免费
- 商业项目：需要购买许可证
- 详情：https://www.live2d.com/eula/live2d-free-license/

⚠️ **版本兼容性**
- Cubism SDK 5.3（最新）
- 与 Cubism Editor 版本对应
- 模型文件格式：`.moc3`

⚠️ **核心库**
- `Core` 是**闭源的**二进制文件
- 不能修改，只能调用
- 必须从官网下载

---

## 🚀 迁移步骤总结

### 1. 清理 VRM（1天）
```bash
npm uninstall @pixiv/three-vrm @pixiv/three-vrm-animation three
rm -rf src/engine/*.ts
rm -rf public/models/*.glb
rm -rf public/animations/*.vrma
```

### 2. 安装 Live2D（半天）
```bash
npm install @pixiv/live2d-sdk-cubism-web
```

### 3. 创建 Live2D 引擎（3-4天）
- Live2DManager.ts
- Live2DModelLoader.ts
- Live2DRenderer.ts
- Live2DAnimator.ts
- ParameterManager.ts

### 4. 创建场景 Hook（2天）
- useLive2DScene.ts
- 更新 App.tsx

### 5. 准备模型（1-2天）
- 获取/创建 Live2D 模型
- 导出为 `.moc3` 格式
- 准备动作文件

### 6. 测试调试（2-3天）
- 表情测试
- 动作测试
- WebSocket 握手测试
- 性能测试

**总计：9-12 天**

---

## 📚 参考资源

### 官方文档
- [Live2D Cubism SDK for Web](https://www.live2d.com/en/download/cubism-sdk/)
- [Cubism SDK Manual](https://docs.live2d.com/)
- [VRoid Studio](https://vroid.com/en/studio)

### 示例项目
- [Live2D Cubism Web Samples](https://github.com/Live2D/CubismWebSamples)
- [Live2D 官方示例模型](https://www.live2d.com/en/sample/)

### 工具
- [Live2D Viewer](https://www.live2d.com/en/download/viewer/)
- [Live2D Cubism Editor](https://www.live2d.com/en/download/cubism-sdk/)

---

## ✅ 验收标准

- [ ] Live2D 模型正常加载和渲染
- [ ] 所有表情（neutral, happy, sad, angry, surprised, relaxed）正确显示
- [ ] 所有动作（greeting, v sign, shoot, spin, model pose, squat）正常播放
- [ ] WebSocket 握手成功
- [ ] `avatar_express` 事件正常响应
- [ ] 渲染帧率稳定（> 30 FPS）
- [ ] 内存占用合理（< 200MB）

---

*文档版本：* 2.0  
*最后更新：* 2026-02-26  
*状态：* 待实施

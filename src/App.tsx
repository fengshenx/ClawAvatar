/**
 * 主应用：Electron 桌面端
 */

import { useState, useEffect } from 'react';
import { useLive2DScene } from '@/hooks/useLive2DScene';
import { AvatarStatusIndicator } from '@/ui/AvatarStatusIndicator';
import { useElectronAvatarPlugin } from '@/hooks/useElectronAvatarPlugin';

function useWindowSize() {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

function App() {
  const { width, height } = useWindowSize();
  const {
    canvasRef,
    loading,
    error,
    motionNames,
    expressionNames,
    getMotionGroupNames,
    playRandomInGroup,
  } = useLive2DScene({
    width,
    height,
  });
  const port =
    Number(
      import.meta.env?.VITE_AVATAR_EXTENSION_PORT ??
        import.meta.env?.VITE_AVATAR_EXTENSION_WS_PORT ??
        18802,
    ) || 18802;
  const wsUrl = `ws://127.0.0.1:${port}/extension`;
  const plugin = useElectronAvatarPlugin(
    motionNames,
    expressionNames,
    wsUrl,
    getMotionGroupNames,
    playRandomInGroup,
  );

  return (
    <div className="app">
      <div className="app__drag-bar" title="拖拽移动窗口" />
      <div className="app__canvas-wrap">
        <canvas ref={canvasRef} className="app__canvas" />
        <AvatarStatusIndicator status={plugin.status} />
        {loading && (
          <div className="app__overlay">
            <span>加载 Live2D 模型中…</span>
          </div>
        )}
        {error && (
          <div className="app__overlay app__overlay--error">
            <span>Error: {error}</span>
            <p className="app__hint">请查看终端日志</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;

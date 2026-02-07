/**
 * 主应用：Canvas 全屏 + 底部控制区
 * 数据流：按钮 -> protocol/simulate -> app/state -> mapping -> engine
 */

import { useState, useEffect } from 'react';
import { useAvatarScene } from '@/hooks/useAvatarScene';
import { DemoButtons } from '@/ui/DemoButtons';
import { ClipButtons } from '@/ui/ClipButtons';

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
  const { canvasRef, loading, error, clipNames, onPlayClip } = useAvatarScene({
    width,
    height,
  });

  return (
    <div className="app">
      <div className="app__canvas-wrap">
        <canvas ref={canvasRef} className="app__canvas" />
        {loading && (
          <div className="app__overlay">
            <span>加载 VRM 中…</span>
          </div>
        )}
        {error && (
          <div className="app__overlay app__overlay--error">
            <span>{error}</span>
            <p className="app__hint">请将 .vrm 文件放入 public/models/avatar.vrm</p>
          </div>
        )}
      </div>
      <aside className="app__controls">
        <ClipButtons clipNames={clipNames} onPlayClip={onPlayClip} />
        <DemoButtons />
      </aside>
    </div>
  );
}

export default App;

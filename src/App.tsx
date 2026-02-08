/**
 * 主应用：Canvas 全屏 + 底部控制区
 * 数据流：WS/按钮 -> protocol/simulate -> app/state -> mapping -> engine
 * Electron 桌面端：顶部拖拽条、复用同一套 Web Avatar
 */

import { useState, useEffect } from 'react';
import { useAvatarScene } from '@/hooks/useAvatarScene';
import { useAvatarWs } from '@/hooks/useAvatarWs';
import { DemoButtons } from '@/ui/DemoButtons';
import { ClipButtons } from '@/ui/ClipButtons';
import { ConnectionStatus } from '@/ui/ConnectionStatus';
import { UserInput } from '@/ui/UserInput';
import { ElectronControls } from '@/ui/ElectronControls';
import { ExpressionButtons } from '@/ui/ExpressionButtons';
import { isElectron } from '@/config';

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
  const { canvasRef, loading, error, clipNames, onPlayClip, getAvailableExpressions } = useAvatarScene({
    width,
    height,
  });
  const {
    status: wsStatus,
    error: wsError,
    connect: wsConnect,
    disconnect: wsDisconnect,
    sendUserInput,
    sessionId,
    wsUrl,
  } = useAvatarWs();

  return (
    <div className={`app${isElectron() ? ' app--electron' : ''}`}>
      {isElectron() && (
        <div className="app__drag-bar" title="拖拽移动窗口" />
      )}
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
        {isElectron() ? (
          <ElectronControls
            clipNames={clipNames}
            onPlayClip={onPlayClip}
            onGetAvailableExpressions={getAvailableExpressions}
          />
        ) : (
          <>
            <ConnectionStatus
              status={wsStatus}
              error={wsError}
              wsUrl={wsUrl}
              onConnect={wsConnect}
              onDisconnect={wsDisconnect}
            />
            <UserInput
              sessionId={sessionId}
              disabled={wsStatus !== 'connected'}
              onSend={sendUserInput}
            />
            <ClipButtons clipNames={clipNames} onPlayClip={onPlayClip} />
            <ExpressionButtons onGetAvailableExpressions={getAvailableExpressions} />
            <DemoButtons />
          </>
        )}
      </aside>
      {isElectron() && (
        <div className="app__electron-hint" title="视图选项请使用菜单栏「视图」">
          ClawAvatar 桌面端
        </div>
      )}
    </div>
  );
}

export default App;

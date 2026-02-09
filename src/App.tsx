/**
 * 主应用：Canvas 全屏 + 底部控制区
 * 数据流：WS/按钮 -> protocol/simulate -> app/state -> mapping -> engine
 * Electron 桌面端：顶部拖拽条、复用同一套 Web Avatar
 */

import { useState, useEffect, useCallback } from 'react';
import { useAvatarScene } from '@/hooks/useAvatarScene';
import { useAvatarWs } from '@/hooks/useAvatarWs';
import { DemoButtons } from '@/ui/DemoButtons';
import { ClipButtons } from '@/ui/ClipButtons';
import { ConnectionStatus } from '@/ui/ConnectionStatus';
import { UserInput } from '@/ui/UserInput';
import { ElectronControls } from '@/ui/ElectronControls';
import { ExpressionButtons } from '@/ui/ExpressionButtons';
import { isElectron } from '@/config';
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
  const electronMode = isElectron();
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
  } = useAvatarWs(!electronMode);
  const [expressionNames, setExpressionNames] = useState<string[]>([]);
  const plugin = useElectronAvatarPlugin(clipNames, expressionNames);

  useEffect(() => {
    setExpressionNames(getAvailableExpressions());
  }, [clipNames, getAvailableExpressions]);

  const handleControlsMouseEnter = useCallback(() => {
    if (!electronMode || !window.electronAPI) return;
    window.electronAPI.setIgnoreMouseEvents(false, { forward: false });
  }, [electronMode]);

  const handleControlsMouseLeave = useCallback(() => {
    if (!electronMode || !window.electronAPI) return;
    void window.electronAPI.getOptions().then((opts) => {
      window.electronAPI?.setIgnoreMouseEvents(Boolean(opts?.clickThrough), {
        forward: Boolean(opts?.clickThrough),
      });
    });
  }, [electronMode]);

  return (
    <div className={`app${electronMode ? ' app--electron' : ''}`}>
      {electronMode && (
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
      <aside
        className="app__controls"
        onMouseEnter={handleControlsMouseEnter}
        onMouseLeave={handleControlsMouseLeave}
      >
        {electronMode ? (
          <ElectronControls
            clipNames={clipNames}
            onPlayClip={onPlayClip}
            onGetAvailableExpressions={getAvailableExpressions}
            pluginStatus={plugin.status}
            pluginBusy={plugin.busy}
            onPluginConnect={plugin.connect}
            onPluginDisconnect={plugin.disconnect}
            onPluginClearPairing={plugin.clearPairing}
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
      {electronMode && (
        <div className="app__electron-hint" title="视图选项请使用菜单栏「视图」">
          ClawAvatar 桌面端
        </div>
      )}
    </div>
  );
}

export default App;

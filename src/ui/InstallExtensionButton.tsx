/**
 * 安装 OpenClaw 插件按钮
 */
import { useState, useEffect } from 'react';

interface InstallProgress {
  status: 'progress' | 'error' | 'success';
  message: string;
  progress?: number;
}

export function InstallExtensionButton() {
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<InstallProgress | null>(null);
  const [result, setResult] = useState<{ success?: boolean; message?: string } | null>(null);

  // 监听安装进度
  useEffect(() => {
    const cleanup = window.avatarBridge.onInstallProgress((data) => {
      setProgress(data);
      if (data.status === 'error') {
        setInstalling(false);
        setResult({ success: false, message: data.message });
      }
    });
    return cleanup;
  }, []);

  // 安装成功后主动和 gateway 握手，带重试机制
  useEffect(() => {
    if (result?.success) {
      const maxRetries = 5;
      let retries = 0;

      const tryConnect = () => {
        if (retries >= maxRetries) {
          console.log('[InstallExtension] Max retries reached, giving up');
          return;
        }

        retries++;
        const delay = Math.pow(2, retries) * 1000; // 指数退避: 2s, 4s, 8s, 16s, 32s

        window.avatarBridge?.connectPlugin().then(() => {
          // 连接成功
        }).catch(() => {
          // 连接失败，延迟后重试
          setTimeout(tryConnect, delay);
        });
      };

      // 首次尝试
      setTimeout(tryConnect, 1000);

      // 5 秒后自动关闭成功提示
      const timer = setTimeout(() => {
        setResult(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [result?.success]);

  const handleInstall = async () => {
    setInstalling(true);
    setProgress(null);
    setResult(null);

    try {
      const response = await window.avatarBridge.installExtension();
      setResult(response);
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : '安装失败',
      });
    } finally {
      setInstalling(false);
    }
  };

  if (result?.success) {
    return (
      <div className="install-extension install-extension--success">
        <span className="install-extension__icon">✅</span>
        <span className="install-extension__text">{result.message}</span>
      </div>
    );
  }

  if (result?.success === false) {
    return (
      <div className="install-extension install-extension--error">
        <span className="install-extension__icon">❌</span>
        <span className="install-extension__text">{result.error || result.message}</span>
        <button className="install-extension__retry" onClick={handleInstall} disabled={installing}>
          {installing ? '安装中...' : '重试'}
        </button>
      </div>
    );
  }

  // 安装中显示进度
  if (installing && progress) {
    return (
      <div className="install-extension install-extension--progress">
        <div className="install-extension__progress-bar">
          <div
            className="install-extension__progress-fill"
            style={{ width: `${progress.progress || 0}%` }}
          />
        </div>
        <span className="install-extension__text">{progress.message}</span>
      </div>
    );
  }

  return (
    <button
      className="install-extension install-extension--button"
      onClick={handleInstall}
      disabled={installing}
    >
      {installing ? '安装中...' : '📦 安装 OpenClaw 插件'}
    </button>
  );
}

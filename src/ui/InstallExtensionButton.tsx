/**
 * 安装 OpenClaw 插件按钮
 */
import { useState } from 'react';

export function InstallExtensionButton() {
  const [installing, setInstalling] = useState(false);
  const [result, setResult] = useState<{ success?: boolean; message?: string } | null>(null);

  const handleInstall = async () => {
    setInstalling(true);
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

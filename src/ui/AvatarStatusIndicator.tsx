/**
 * Avatar 状态指示器：左下角小圆点，点击显示连接信息
 */

import { useState, useRef, useEffect } from 'react';
import type { PluginStatus } from '@/hooks/useElectronAvatarPlugin';

interface AvatarStatusIndicatorProps {
  status: PluginStatus | null;
}

type Phase = 'idle' | 'connecting' | 'connected' | 'error';

export function AvatarStatusIndicator({ status }: AvatarStatusIndicatorProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const phase = (status?.phase ?? 'idle') as Phase;

  const getStatusClass = () => {
    if (phase === 'connected') return 'connected';
    if (phase === 'error') return 'error';
    if (phase === 'connecting') return 'connecting';
    return 'idle';
  };

  const statusClass = getStatusClass();

  // 点击外部关闭 dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleDropdown = () => setDropdownOpen((v) => !v);

  const statusLabels: Record<Phase, string> = {
    idle: '未配对',
    connecting: '连接中…',
    connected: '已连接',
    error: '连接错误',
  };

  return (
    <div className="avatar-status-indicator">
      <button
        ref={buttonRef}
        className={`avatar-status-indicator__dot avatar-status-indicator__dot--${statusClass}`}
        onClick={toggleDropdown}
      />
      {dropdownOpen && status && (
        <div ref={dropdownRef} className="avatar-status-indicator__dropdown">
          <div className="avatar-status-indicator__info">
            <span className={`avatar-status-indicator__status-dot avatar-status-indicator__status-dot--${statusClass}`} />
            <span className="avatar-status-indicator__label">{statusLabels[phase]}</span>
          </div>
          <div className="avatar-status-indicator__meta">
            <span className="avatar-status-indicator__key">{status.sessionKey}</span>
            <span className="avatar-status-indicator__url">{status.gatewayUrl}</span>
          </div>
        </div>
      )}
    </div>
  );
}

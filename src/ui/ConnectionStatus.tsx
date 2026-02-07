/**
 * WebSocket 连接状态展示（已连 / 未连 / 错误 / 重连中）
 */

import type { AvatarWsStatus } from '@/ws/avatarClient';

interface ConnectionStatusProps {
  status: AvatarWsStatus;
  error: string | null;
  wsUrl: string;
  onConnect: () => void;
  onDisconnect: () => void;
}

const STATUS_LABEL: Record<AvatarWsStatus, string> = {
  idle: '未连接',
  connecting: '连接中…',
  connected: '已连接',
  error: '错误',
  reconnecting: '重连中…',
};

export function ConnectionStatus({
  status,
  error,
  wsUrl,
  onConnect,
  onDisconnect,
}: ConnectionStatusProps) {
  return (
    <div className="connection-status">
      <span
        className={`connection-status__dot connection-status__dot--${status}`}
        title={wsUrl}
      />
      <span className="connection-status__label">{STATUS_LABEL[status]}</span>
      {error && (
        <span className="connection-status__error" title={error}>
          {error}
        </span>
      )}
      <div className="connection-status__actions">
        {status === 'idle' || status === 'error' ? (
          <button type="button" onClick={onConnect} className="connection-status__btn">
            连接
          </button>
        ) : status === 'connected' ? (
          <button type="button" onClick={onDisconnect} className="connection-status__btn">
            断开
          </button>
        ) : null}
      </div>
    </div>
  );
}

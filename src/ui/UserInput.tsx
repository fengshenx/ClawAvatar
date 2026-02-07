/**
 * V4：Channel 客户端用户输入 — 发送 user_input 到 OpenClaw Agent
 */

import { useState } from 'react';

interface UserInputProps {
  sessionId: string;
  disabled: boolean;
  onSend: (text: string) => void;
}

export function UserInput({ sessionId, disabled, onSend }: UserInputProps) {
  const [text, setText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || disabled) return;
    onSend(text.trim());
    setText('');
  };

  return (
    <div className="user-input">
      {sessionId ? (
        <div className="user-input__session" title="当前会话 ID">
          session: <code>{sessionId}</code>
        </div>
      ) : null}
      <form onSubmit={handleSubmit} className="user-input__form">
        <input
          type="text"
          className="user-input__field"
          placeholder="输入消息发送给 Agent…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={disabled}
          aria-label="用户输入"
        />
        <button
          type="submit"
          className="user-input__btn"
          disabled={disabled || !text.trim()}
        >
          发送
        </button>
      </form>
    </div>
  );
}

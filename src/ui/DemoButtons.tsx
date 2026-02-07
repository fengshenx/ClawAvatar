/**
 * 模拟协议事件的按钮组
 * 点击时构造 agent_state / render，调用 store.applyMessage，驱动 Avatar
 */

import { useAppStore } from '@/app/state';
import type { AgentStateMessage, RenderMessage } from '@/protocol/types';

const SESSION_ID = 'demo';

function sendAgentState(state: 'idle' | 'thinking' | 'speaking') {
  const msg: AgentStateMessage = {
    type: 'agent_state',
    session_id: SESSION_ID,
    state,
    detail: null,
    progress: null,
  };
  useAppStore.getState().applyMessage(msg);
}

function sendRenderExample() {
  const msg: RenderMessage = {
    type: 'render',
    session_id: SESSION_ID,
    state: 'speaking',
    emotion: 'happy',
    intensity: 0.8,
  };
  useAppStore.getState().applyMessage(msg);
}

export function DemoButtons() {
  const currentState = useAppStore((s) => s.current.state);

  return (
    <div className="demo-buttons">
      <div className="demo-buttons__state">
        当前状态：<strong>{currentState}</strong>
      </div>
      <div className="demo-buttons__row">
        <button type="button" onClick={() => sendAgentState('idle')}>
          设为 Idle
        </button>
        <button type="button" onClick={() => sendAgentState('thinking')}>
          设为 Thinking
        </button>
        <button type="button" onClick={() => sendAgentState('speaking')}>
          设为 Speaking
        </button>
      </div>
      <div className="demo-buttons__row">
        <button type="button" onClick={sendRenderExample} className="secondary">
          发送示例 Render (speaking + happy)
        </button>
      </div>
    </div>
  );
}

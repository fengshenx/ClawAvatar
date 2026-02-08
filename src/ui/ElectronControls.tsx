import { useAppStore } from '@/app/state';
import { Dropdown } from './Dropdown';
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

interface ElectronControlsProps {
  clipNames: string[];
  onPlayClip: (name: string) => void;
}

export function ElectronControls({ clipNames, onPlayClip }: ElectronControlsProps) {
  const currentState = useAppStore((s) => s.current.state);

  return (
    <div className="electron-controls">
      <div className="electron-controls__row">
        <Dropdown
          trigger={<button className="popup-btn">状态</button>}
          align="left"
        >
          <div style={{ padding: '4px 8px 8px', fontSize: '11px', color: '#64748b' }}>
            当前：<strong style={{ color: '#38bdf8', textTransform: 'uppercase' }}>{currentState}</strong>
          </div>
          <button className="dropdown__btn" onClick={() => sendAgentState('idle')}>
            Idle
          </button>
          <button className="dropdown__btn" onClick={() => sendAgentState('thinking')}>
            Thinking
          </button>
          <button className="dropdown__btn" onClick={() => sendAgentState('speaking')}>
            Speaking
          </button>
          <div style={{ height: '1px', background: '#334155', margin: '6px 0' }} />
          <button className="dropdown__btn" onClick={sendRenderExample}>
            示例: speaking + happy
          </button>
        </Dropdown>

        {clipNames.length > 0 && (
          <Dropdown
            trigger={<button className="popup-btn">动作</button>}
            align="left"
          >
            <div style={{ padding: '4px 8px 8px', fontSize: '11px', color: '#64748b' }}>
              模型动作
            </div>
            {clipNames.map((name, index) => (
              <button
                key={`${index}-${name}`}
                className="dropdown__btn"
                onClick={() => onPlayClip(name)}
              >
                {name}
              </button>
            ))}
          </Dropdown>
        )}
      </div>
    </div>
  );
}

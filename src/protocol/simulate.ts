/**
 * 根据协议消息更新「待应用状态」
 * 按钮触发的消息经此处理，输出下一状态供 app/state 消费
 */

import type { AgentStateType, EmotionType, ProtocolMessage, WireStateType } from './types';

export interface SimulatedState {
  state: AgentStateType;
  emotion: EmotionType;
  intensity: number;
}

const DEFAULT_EMOTION: EmotionType = 'neutral';
const DEFAULT_INTENSITY = 0.8;

/** 将协议 state 映射为前端内部状态（typing/listening → idle） */
function wireStateToInternal(wire: WireStateType): AgentStateType {
  if (wire === 'typing' || wire === 'listening') return 'idle';
  return wire;
}

/**
 * 从协议消息解析出下一组状态/动画参数
 */
export function applyProtocolMessage(
  current: SimulatedState,
  message: ProtocolMessage
): SimulatedState {
  if (message.type === 'agent_state') {
    return {
      state: wireStateToInternal(message.state),
      emotion: current.emotion,
      intensity: current.intensity,
    };
  }
  if (message.type === 'render') {
    return {
      state: wireStateToInternal(message.state),
      emotion: message.emotion ?? current.emotion,
      intensity: message.intensity ?? DEFAULT_INTENSITY,
    };
  }
  return current;
}

/**
 * 创建初始模拟状态
 */
export function createInitialSimulatedState(): SimulatedState {
  return {
    state: 'idle',
    emotion: DEFAULT_EMOTION,
    intensity: DEFAULT_INTENSITY,
  };
}

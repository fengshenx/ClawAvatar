/**
 * 根据协议消息更新「待应用状态」
 * 按钮触发的消息经此处理，输出下一状态供 app/state 消费
 */

import type { AgentStateType, EmotionType, ProtocolMessage, WireStateType } from './types';

export interface SimulatedState {
  state: AgentStateType;
  emotion: EmotionType;
  intensity: number;
  /** render.gesture 动作名（来自协议） */
  gesture: string | null;
  /** 每次收到 gesture 自增，用于触发重复同名动作 */
  gestureSeq: number;
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
      gesture: current.gesture,
      gestureSeq: current.gestureSeq,
    };
  }
  if (message.type === 'render') {
    const nextGesture =
      typeof message.gesture === 'string' && message.gesture.trim()
        ? message.gesture.trim()
        : current.gesture;
    const hasNewGesture =
      typeof message.gesture === 'string' && message.gesture.trim().length > 0;
    return {
      state: wireStateToInternal(message.state),
      emotion: message.emotion ?? current.emotion,
      intensity: message.intensity ?? DEFAULT_INTENSITY,
      gesture: nextGesture,
      gestureSeq: hasNewGesture ? current.gestureSeq + 1 : current.gestureSeq,
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
    gesture: null,
    gestureSeq: 0,
  };
}

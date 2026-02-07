/**
 * V1 事件协议类型定义（与 roadmap 一致，便于后续替换为 WS 事件）
 */

/** Agent 状态：V1 仅用 idle | thinking | speaking */
export type AgentStateType = 'idle' | 'thinking' | 'speaking';

/** 表情（V1 可简化使用） */
export type EmotionType = 'neutral' | 'happy' | 'sad' | 'angry' | 'surprised';

/** 状态切换消息：agent_state */
export interface AgentStateMessage {
  type: 'agent_state';
  session_id: string;
  state: AgentStateType;
  detail: string | null;
  progress: number | null;
}

/** 渲染指令：render（V1 可只处理 state，emotion/intensity 用默认值） */
export interface RenderMessage {
  type: 'render';
  session_id: string;
  state: AgentStateType;
  emotion?: EmotionType;
  intensity?: number;
}

export type ProtocolMessage = AgentStateMessage | RenderMessage;

export function isAgentStateMessage(
  msg: ProtocolMessage
): msg is AgentStateMessage {
  return msg.type === 'agent_state';
}

export function isRenderMessage(msg: ProtocolMessage): msg is RenderMessage {
  return msg.type === 'render';
}

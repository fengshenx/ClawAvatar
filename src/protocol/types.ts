/**
 * V1 事件协议类型定义（与 roadmap 一致，便于后续替换为 WS 事件）
 */

/** 前端内部状态（mapping / 动画用） */
export type AgentStateType = 'idle' | 'thinking' | 'speaking';

/** 协议线上传来的 state（Adapter 可发 typing/listening，前端映射为 idle） */
export type WireStateType =
  | AgentStateType
  | 'listening'
  | 'typing';

/** 表情（V1 可简化使用） */
export type EmotionType = 'neutral' | 'happy' | 'sad' | 'angry' | 'surprised';

/** 状态切换消息：agent_state（state 含 typing/listening 时前端映射为 idle） */
export interface AgentStateMessage {
  type: 'agent_state';
  session_id: string;
  state: WireStateType;
  detail: string | null;
  progress: number | null;
}

/** 渲染指令：render（state 含 typing/listening 时前端映射为 idle） */
export interface RenderMessage {
  type: 'render';
  session_id: string;
  state: WireStateType;
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

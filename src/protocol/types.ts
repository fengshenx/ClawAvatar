/**
 * V1 事件协议类型定义（与 roadmap 一致，便于后续替换为 WS 事件）
 */

/** 前端内部状态（mapping / 动画用），V4 增加 tool_running、error */
export type AgentStateType =
  | 'idle'
  | 'thinking'
  | 'speaking'
  | 'tool_running'
  | 'error';

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

/** 渲染指令：render（state 含 typing/listening 时前端映射为 idle），V4 可选 gesture/gaze/text */
export interface RenderMessage {
  type: 'render';
  session_id: string;
  state: WireStateType;
  emotion?: EmotionType;
  intensity?: number;
  /** 可选，对应 manifest 中的动作名 */
  gesture?: string;
  /** 可选，如 camera / target */
  gaze?: string;
  /** 可选，当前正在“说”的片段 */
  text?: string;
}

/** Channel 客户端 → Adapter：用户输入（V3/V4 上行） */
export interface UserInputMessage {
  type: 'user_input';
  session_id: string;
  text: string;
  context: {
    app: 'desktop' | 'web';
    locale?: string;
  };
}

/** Adapter → Channel 客户端：连接后下发 session_id（V4） */
export interface InitMessage {
  type: 'init';
  session_id: string;
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

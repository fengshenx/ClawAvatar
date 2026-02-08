/**
 * 前端状态机：currentState (idle | thinking | speaking)
 * 与 protocol 解耦，可由按钮或后续 WS 事件更新
 */

import { create } from 'zustand';
import type { AgentStateType, EmotionType } from '@/protocol/types';
import {
  applyProtocolMessage,
  createInitialSimulatedState,
  type SimulatedState,
} from '@/protocol/simulate';
import type { ProtocolMessage } from '@/protocol/types';

export type { AgentStateType };

/** 当前展示状态 + 过渡用 intensity（0→1 做 ease，避免抽搐） */
export interface AppState extends SimulatedState {
  /** 过渡强度变化每帧最大增量，用于 clamp */
  intensityDeltaClamp: number;
}

interface AppStore {
  /** 当前状态与表情强度 */
  current: AppState;
  /** 应用一条协议消息，更新 currentState */
  applyMessage: (message: ProtocolMessage) => void;
  /** 直接设置状态（供 UI 或内部使用） */
  setState: (state: AgentStateType) => void;
  /** 直接设置表情（供 UI 按钮使用） */
  setEmotion: (emotion: EmotionType) => void;
  /** 重置为初始状态 */
  reset: () => void;
}

const initialState: AppState = {
  ...createInitialSimulatedState(),
  intensityDeltaClamp: 0.05,
};

export const useAppStore = create<AppStore>((set) => ({
  current: initialState,

  applyMessage: (message: ProtocolMessage) => {
    set((s) => {
      const next = applyProtocolMessage(s.current, message);
      return { current: { ...s.current, ...next } };
    });
  },

  setState: (state: AgentStateType) => {
    set((s) => ({
      current: { ...s.current, state },
    }));
  },

  setEmotion: (emotion: EmotionType) => {
    set((s) => ({
      current: { ...s.current, emotion },
    }));
  },

  reset: () => set({ current: initialState }),
}));

/** 获取当前 Agent 状态 */
export function getCurrentAgentState(): AgentStateType {
  return useAppStore.getState().current.state;
}

/** 获取当前 emotion */
export function getCurrentEmotion(): EmotionType {
  return useAppStore.getState().current.emotion;
}

/** 获取当前 intensity */
export function getCurrentIntensity(): number {
  return useAppStore.getState().current.intensity;
}

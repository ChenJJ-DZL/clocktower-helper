"use client";

import { createContext, type ReactNode, useContext } from "react";

/**
 * GameActionsContext
 *
 * 提供 useGameController 返回的所有 action 函数，
 * 让子组件无需通过 props 接收，直接通过 useGameActions() 获取。
 *
 * 注意：useGameController 只能实例化一次（内部含 useRef/useState），
 * 因此由 page.tsx 调用并通过此 Context 下发。
 */

import type { useGameController } from "../hooks/useGameController";

// 实际类型安全由 useGameController 的返回值保证
export type GameActionsType = ReturnType<typeof useGameController>;

const GameActionsContext = createContext<GameActionsType | undefined>(
  undefined
);

export function GameActionsProvider({
  controller,
  children,
}: {
  controller: GameActionsType;
  children: ReactNode;
}) {
  return (
    <GameActionsContext.Provider value={controller}>
      {children}
    </GameActionsContext.Provider>
  );
}

/**
 * useGameActions - 获取游戏 action 函数
 *
 * 包含所有来自 useGameController 的函数和计算属性：
 * - confirmKill, executePlayer, killPlayer, checkGameOver 等
 * - nightInfo, nightLogic 等计算属性
 * - toggleStatus, onSeatClick 等交互函数
 *
 * 不包含基础 state/setters（使用 useGameState 获取）
 */
export function useGameActions(): GameActionsType {
  const context = useContext(GameActionsContext);
  if (context === undefined) {
    throw new Error("useGameActions must be used within a GameActionsProvider");
  }
  return context;
}

/**
 * useOptionalGameActions —— Provider 缺失时返回 undefined（不抛）。
 * 给「增强型面板」用：没有 controller 时优雅降级为只读/日志模式。
 */
export function useOptionalGameActions(): GameActionsType | undefined {
  return useContext(GameActionsContext);
}

"use client";

/**
 * 玩家视角上下文（playerView）
 * ============================================================================
 * 【安全默认】`PlayerViewProvider` 不传 `playerView` 时默认 **true = 玩家视角**。
 *   也就是说：忘了包 Provider、忘了传值、新增页面忘记考虑视角，结果都是"安全"的
 *   （不会把说书人信息漏给玩家），而不是反过来。
 *
 * 【StorytellerOnly = 条件渲染，不是隐藏】
 *   `<StorytellerOnly>{...}</StorytellerOnly>` 在玩家视角下返回 `null`，
 *   children 的 React 元素会被直接丢弃、**不会进入 DOM**。
 *   因此"整页静态 HTML 里不含真实角色名"这类断言才有意义
 *   （CSS hidden / opacity-0 / 屏外定位 都会让内容留在 DOM 里，属于不合格实现）。
 *
 * 【谁在什么时候解锁】
 *   只有 components/game/NightActionPage.tsx 的**长按 1.5 秒**手势会把
 *   `playerView` 切成 false（说书人视图）。解锁后：
 *     - 顶部出现醒目横幅「🔓 说书人视图（玩家不可见）」；
 *     - 页面切换步骤 / 卸载 / 60 秒无操作 → 自动恢复玩家视角。
 *   该状态只存在于组件内 useState，不持久化、不写日志、不入快照。
 */

import React, {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

/** 默认值 = 玩家视角（安全默认）。 */
export const PLAYER_VIEW_DEFAULT = true;

const PlayerViewContext = createContext<boolean>(PLAYER_VIEW_DEFAULT);

export interface PlayerViewProviderProps {
  /** true = 玩家视角（默认）；false = 说书人解锁视图 */
  playerView?: boolean;
  children: ReactNode;
}

export function PlayerViewProvider({
  playerView = PLAYER_VIEW_DEFAULT,
  children,
}: PlayerViewProviderProps) {
  const value = useMemo(() => playerView, [playerView]);
  return (
    <PlayerViewContext.Provider value={value}>
      {children}
    </PlayerViewContext.Provider>
  );
}

/** 当前是否处于玩家视角（默认 true）。 */
export function usePlayerView(): boolean {
  return useContext(PlayerViewContext);
}

/** 只在说书人视图下渲染（玩家视角下 children 不进 DOM）。 */
export function StorytellerOnly({ children }: { children: ReactNode }) {
  const playerView = usePlayerView();
  if (playerView) return null;
  return <>{children}</>;
}

/** 只在玩家视角下渲染（例如"请把设备交给玩家"的引导语）。 */
export function PlayerViewOnly({ children }: { children: ReactNode }) {
  const playerView = usePlayerView();
  if (!playerView) return null;
  return <>{children}</>;
}

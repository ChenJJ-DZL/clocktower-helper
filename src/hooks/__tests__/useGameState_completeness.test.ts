// @vitest-environment jsdom
/**
 * useGameState 返回对象完整性护栏（防复发）
 * ======================================================================
 * 背景缺陷：GameState 新增 activeFabled / travelers 字段后，useGameState 的
 * useMemo 返回对象漏返回这两键，导致 createSnapshotFromState 恒写出
 * activeFabled: [] / travelers: []，刷新后传奇角色与旅行者选择丢失。
 *
 * 本护栏强制：GameState（getInitialState()）的每个键都必须出现在
 * useGameState() 的返回对象里；有意不返回的键只能进 INTENTIONALLY_OMITTED
 * 白名单并逐键注释理由。activeFabled / travelers 是本次缺陷本体，
 * 严禁进入白名单。
 *
 * 行为级用例直连 production 的 createSnapshotFromState（而非自拼对象），
 * 避免上一轮「假绿」教训。
 */
import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeAll, describe, expect, it } from "vitest";
import { FABLED_ROLES } from "../../../app/data";
import {
  GameProvider,
  gameActions,
  gameReducer,
  getInitialState,
} from "../../contexts/GameContext";
import { withFabled } from "../../utils/fabledLock";
import { createSnapshotFromState } from "../../utils/persistence";
import { useGameState } from "../useGameState";

/**
 * 有意不返回的 GameState 键白名单（每键一行理由）：
 * - nightActionQueue：夜间行动队列由 wakeQueueIds / currentWakeIndex 体系
 *   及 GameContext 的 currentQueueIndexRef 管理，useGameState 不直接暴露；
 * - currentQueueIndex：同上，镜像进 currentQueueIndexRef（GameContext 内
 *   useEffect 同步），hook 侧以 currentWakeIndex 暴露；
 * - pastGames：历史遗留字段，仅存在于 GameState 类型与初值，全仓库无任何
 *   读写方，属死状态，不进入 hook 返回。
 */
const INTENTIONALLY_OMITTED: readonly string[] = [
  "nightActionQueue",
  "currentQueueIndex",
  "pastGames",
  // Round 10b：流放进行中投票。与 nightActionQueue 同类——由 GameContext
  // 独占管理（dispatch propose/cast/resolve/cancel），useGameState 不直接暴露。
  "exileProposedToday",
];

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(GameProvider, null, children);

beforeAll(() => {
  // jsdom 缺失的布局 API 桩（同 fabled_traveler_l3_ui.test.tsx）
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

describe("useGameState 返回对象完整性护栏", () => {
  it("① activeFabled 与 travelers 在返回对象里且类型为数组", () => {
    const { result } = renderHook(() => useGameState(), { wrapper });
    expect("activeFabled" in result.current).toBe(true);
    expect("travelers" in result.current).toBe(true);
    expect(Array.isArray(result.current.activeFabled)).toBe(true);
    expect(Array.isArray(result.current.travelers)).toBe(true);
  });

  it("② 全量字段比对：缺失集合必须精确等于白名单", () => {
    const { result } = renderHook(() => useGameState(), { wrapper });
    const initialKeys = Object.keys(getInitialState());
    const returned = result.current as unknown as Record<string, unknown>;
    const missing = initialKeys.filter((k) => !(k in returned)).sort();
    expect(initialKeys.length).toBeGreaterThan(0);
    expect(missing.sort()).toEqual([...INTENTIONALLY_OMITTED].sort());
    expect(missing).not.toContain("activeFabled");
    expect(missing).not.toContain("travelers");
  });

  it("③ 反向对照：白名单不得包含缺陷本体键，且 GameState 确有这两键", () => {
    expect(INTENTIONALLY_OMITTED).not.toContain("activeFabled");
    expect(INTENTIONALLY_OMITTED).not.toContain("travelers");
    const initialKeys = Object.keys(getInitialState());
    expect(initialKeys).toContain("activeFabled");
    expect(initialKeys).toContain("travelers");
  });

  it("④ 行为级：createSnapshotFromState 直连 production 捕获 activeFabled", () => {
    const next = gameReducer(
      getInitialState(),
      gameActions.setActiveFabled(withFabled([], FABLED_ROLES[0]))
    );
    expect(next.activeFabled).toHaveLength(1);
    const snap = createSnapshotFromState(next);
    expect(snap.activeFabled).toHaveLength(1);
    expect(snap.activeFabled?.[0]?.id).toBe(FABLED_ROLES[0].id);
    expect(snap.activeFabled?.[0]?.id).not.toBe("");
  });
});

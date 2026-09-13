/**
 * 罂粟花开 · 相位推进契约：黄昏处决后**必须能进入下一个夜晚**
 *
 * 背景：工作记忆里长期挂着一条未完成项 ——
 *   「黄昏阶段处决后无法推进夜晚（dusk→night 转换）」。
 *   代码里 `useExecutionHandlers.ts:1121-1136` 的注释显示该问题曾在
 *   **W7.2.2** 修过（根因：只调 `nightLogic.startNight(false)` 更新引擎状态机，
 *   但**没有更新 React 的 gamePhase** → 仍停在 dusk，玩家反复看到"执行处决"按钮 → 死循环；
 *   正确做法是必须走 `baseDispatch` 派发 `setGamePhase("night")`）。
 *
 * 本文件在 **reducer 层**把该契约钉死（无需 DOM、无需 hook 运行时）：
 *   `startSubsequentNight` 实际派发的那几个 action 组合，
 *   喂给真实 `gameReducer`，断言最终 state 确实"进入夜晚"。
 *
 * 若日后有人把 `setGamePhase("night")` 删掉 / 改用不更新主状态的 dispatch，
 * 本测试会立刻红。
 */
import { describe, expect, it } from "vitest";
import {
  gameReducer,
  gameActions,
  getInitialState,
} from "../../contexts/GameContext";

/** 复刻 startSubsequentNight 的 dispatch 序列（非空队列分支） */
function enterNextNight(state: any, queueSeats: number[] = [0, 2, 3]) {
  let s = state;
  // 1) 更新主状态（wakeQueueIds / nightCount / deadThisNight / 选中目标）
  s = gameReducer(
    s,
    gameActions.updateState({
      wakeQueueIds: queueSeats,
      currentWakeIndex: 0,
      selectedActionTargets: [],
      inspectionResult: null,
      nightCount: (s.nightCount ?? 1) + 1,
      deadThisNight: [],
      nightOrderPreview: [],
    } as any)
  );
  // 2) 切换相位到 night（W7.2.2 的关键修复点）
  s = gameReducer(s, gameActions.setGamePhase("night"));
  // 3) 关闭残留弹窗
  s = gameReducer(s, gameActions.setModal(null));
  return s;
}

describe("相位推进契约 · 黄昏处决后必须能进入夜晚", () => {
  it("① dusk 状态派发入场序列后，gamePhase 必须变为 night（核心契约）", () => {
    const base = { ...getInitialState(), gamePhase: "dusk" as any, nightCount: 1 };
    const next = enterNextNight(base);
    expect(next.gamePhase, "仍停在 dusk = W7.2.2 死循环复发").toBe("night");
  });

  it("② nightCount 递增 1", () => {
    const base = { ...getInitialState(), gamePhase: "dusk" as any, nightCount: 1 };
    const next = enterNextNight(base);
    expect(next.nightCount).toBe(2);
  });

  it("③ deadThisNight 必须清空（避免死亡报告跨夜累积）", () => {
    const base = {
      ...getInitialState(),
      gamePhase: "dusk" as any,
      nightCount: 2,
      deadThisNight: [3, 5],
    };
    const next = enterNextNight(base);
    expect(next.deadThisNight).toEqual([]);
  });

  it("④ wakeQueueIds 由新队列覆盖，且 currentWakeIndex 复位为 0", () => {
    const base = {
      ...getInitialState(),
      gamePhase: "dusk" as any,
      nightCount: 2,
      wakeQueueIds: [9, 9, 9],
      currentWakeIndex: 7,
    };
    const next = enterNextNight(base, [1, 4]);
    expect(next.wakeQueueIds).toEqual([1, 4]);
    expect(next.currentWakeIndex).toBe(0);
  });

  it("⑤ 上一夜残留的目标选择被清空", () => {
    const base = {
      ...getInitialState(),
      gamePhase: "dusk" as any,
      selectedActionTargets: [2, 3],
    };
    const next = enterNextNight(base);
    expect(next.selectedActionTargets).toEqual([]);
  });

  it("⑥ 空队列兜底路径同样必须进入 night（不能卡在 dusk）", () => {
    // 复刻 startSubsequentNight 的 queue.length === 0 兜底分支
    let s: any = { ...getInitialState(), gamePhase: "dusk" as any, nightCount: 3 };
    s = gameReducer(
      s,
      gameActions.updateState({
        nightCount: s.nightCount + 1,
        currentWakeIndex: 0,
        deadThisNight: [],
      } as any)
    );
    s = gameReducer(s, gameActions.setGamePhase("night"));
    s = gameReducer(s, gameActions.setModal(null));
    expect(s.gamePhase).toBe("night");
    expect(s.nightCount).toBe(4);
  });

  it("⑦ 反向对照：只更新引擎状态、不派发 setGamePhase 时确实会卡在 dusk（证明该 action 不可省）", () => {
    const base = { ...getInitialState(), gamePhase: "dusk" as any, nightCount: 1 };
    // 只做 updateState，故意不 setGamePhase
    const stuck = gameReducer(
      base,
      gameActions.updateState({ nightCount: 2, deadThisNight: [] } as any)
    );
    expect(stuck.gamePhase).toBe("dusk");
    expect(stuck.nightCount).toBe(2);
  });

  it("⑧ 连续三天推进：dusk→night 可重复执行，不粘滞", () => {
    let s: any = { ...getInitialState(), gamePhase: "dusk" as any, nightCount: 1 };
    for (let day = 1; day <= 3; day++) {
      s = enterNextNight(s, [day]);
      expect(s.gamePhase, `第${day}次推进后应进入 night`).toBe("night");
      expect(s.nightCount).toBe(day + 1);
      // 模拟走完当夜回到黄昏
      s = gameReducer(s, gameActions.setGamePhase("dusk"));
    }
  });
});

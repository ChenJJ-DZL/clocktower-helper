/**
 * 幽灵票（Ghost Vote）永久性回归测试
 *
 * 官方规则：每名死亡玩家整局游戏只有一张幽灵票，使用后永久消耗，
 * 无论再过多少个夜晚 / 白天，都不得再次使用。
 *
 * 本测试直接驱动**生产模块**（GameContext.gameReducer / undoSnapshot /
 * persistence.createSnapshotFromState），不复制实现细节。
 */
import { describe, it, expect } from "vitest";
import {
  gameReducer,
  getInitialState,
  gameActions,
  type GameState,
} from "../../contexts/GameContext";
import { createSnapshot, restoreSnapshot } from "../undoSnapshot";
import { createSnapshotFromState } from "../persistence";
import type { Seat } from "../../../app/data";

/** 构造一个「死亡且幽灵票已用掉」的座位 */
function deadSeatConsumed(id: number): Seat {
  return {
    id,
    name: `玩家${id + 1}`,
    isDead: true,
    hasGhostVote: false,
  } as unknown as Seat;
}

/** 构造一个「死亡且幽灵票尚在」的座位 */
function deadSeatWithVote(id: number): Seat {
  return {
    id,
    name: `玩家${id + 1}`,
    isDead: true,
    hasGhostVote: true,
  } as unknown as Seat;
}

function aliveSeat(id: number): Seat {
  return {
    id,
    name: `玩家${id + 1}`,
    isDead: false,
    hasGhostVote: true,
  } as unknown as Seat;
}

/** 模拟开局：5 人局，3 号已死且已用掉幽灵票 */
function makeState(): GameState {
  return {
    ...getInitialState(),
    gamePhase: "day",
    nightCount: 2,
    hasCompletedFirstNight: true,
    seats: [aliveSeat(0), aliveSeat(1), deadSeatConsumed(2), aliveSeat(3), aliveSeat(4)],
  };
}

const voteOf = (s: GameState, id: number) =>
  s.seats.find((x) => x.id === id)?.hasGhostVote;

describe("幽灵票永久性（官方规则：整局仅一张）", () => {
  it("基础前提：生产 reducer 的 SET_SEATS 不会凭空复活幽灵票", () => {
    const s0 = makeState();
    const s1 = gameReducer(s0, gameActions.setSeats(s0.seats));
    expect(voteOf(s1, 2)).toBe(false);
  });

  it("【Undo/Redo】撤销后不得复活已消耗的幽灵票", () => {
    // 1. 说书人在「消耗幽灵票之前」存了一个快照（真实场景：每次入黄昏都会存快照）
    const beforeVote: GameState = {
      ...getInitialState(),
      gamePhase: "day",
      nightCount: 2,
      seats: [aliveSeat(0), aliveSeat(1), deadSeatWithVote(2), aliveSeat(3), aliveSeat(4)],
    };
    const snapshot = createSnapshot(beforeVote as any);
    expect(snapshot.seats[2].hasGhostVote).toBe(true);

    // 2. 幽灵票被消耗（生产写法见 useExecutionHandlers.ts:694）
    const state = makeState();
    expect(voteOf(state, 2)).toBe(false);

    // 3. 说书人点了「撤销」→ 会把整份 seats 回滚到消耗之前
    const restored = restoreSnapshot(snapshot);
    const rolledBack: GameState = gameReducer(state, gameActions.updateState(restored as any));

    // 断言：幽灵票必须仍然是「已消耗」——这是官方规则，不可回滚
    expect(voteOf(rolledBack, 2)).toBe(false);
  });

  it("【Redo】重做同样不得复活已消耗的幽灵票", () => {
    const beforeVote: GameState = {
      ...getInitialState(),
      gamePhase: "day",
      nightCount: 2,
      seats: [aliveSeat(0), aliveSeat(1), deadSeatWithVote(2), aliveSeat(3), aliveSeat(4)],
    };
    const snapshot = createSnapshot(beforeVote as any);
    const state = makeState();

    // 先撤销（指针回退），再重做（指针前进）—— 两个方向都不能复活
    const undone = gameReducer(state, gameActions.updateState(restoreSnapshot(snapshot) as any));
    const redone = gameReducer(undone, gameActions.updateState(restoreSnapshot(snapshot) as any));
    expect(voteOf(redone, 2)).toBe(false);
  });

  it("【刷新恢复】从 localStorage 快照恢复中途对局，不得复活已消耗的幽灵票", () => {
    // 场景：玩家消耗幽灵票 → 浏览器刷新 → 系统从**旧快照**恢复
    const staleSnapshot = createSnapshotFromState({
      ...getInitialState(),
      gamePhase: "day",
      nightCount: 2,
      seats: [aliveSeat(0), aliveSeat(1), deadSeatWithVote(2), aliveSeat(3), aliveSeat(4)],
    } as any);

    // 刷新前内存里的真实状态（幽灵票已消耗）
    const liveState = makeState();
    expect(voteOf(liveState, 2)).toBe(false);

    // page.tsx handleContinueGame 的恢复写法：整份 seats 覆盖
    const resumed = gameReducer(
      liveState,
      gameActions.updateState({ seats: staleSnapshot.seats } as any)
    );

    expect(voteOf(resumed, 2)).toBe(false);
  });

  it("【跨天】经过多个夜晚 / 白天推进后，幽灵票仍保持已消耗", () => {
    let s = makeState();
    for (let i = 0; i < 6; i++) {
      s = gameReducer(s, gameActions.setGamePhase(i % 2 === 0 ? "night" : "day"));
      s = gameReducer(s, gameActions.incrementNightCount());
      // 每次相位切换都重新派发一次 seats（模拟 enterDayPhase / enterDuskPhase 的整表重建）
      s = gameReducer(s, gameActions.setSeats(s.seats.map((x) => ({ ...x }))));
    }
    expect(voteOf(s, 2)).toBe(false);
  });

  it("【反向验证】撤销不得误伤存活玩家；只有真正的「复活」才重发幽灵票", () => {
    // 存活玩家 + 一名「死亡且票未用」的玩家，撤销一份「票仍在」的快照
    const snapshot = createSnapshot({
      ...getInitialState(),
      seats: [aliveSeat(0), aliveSeat(1), deadSeatWithVote(2), aliveSeat(3), aliveSeat(4)],
    } as any);
    const state: GameState = {
      ...getInitialState(),
      seats: [aliveSeat(0), aliveSeat(1), deadSeatConsumed(2), aliveSeat(3), aliveSeat(4)],
    };
    const restored = gameReducer(state, gameActions.updateState(restoreSnapshot(snapshot) as any));
    // 存活玩家不受影响（不会被锁存误伤）
    expect(voteOf(restored, 0)).toBe(true);
    // 已消耗的幽灵票不因撤销而复活（官方规则：整局仅一张，用掉即永久）
    expect(voteOf(restored, 2)).toBe(false);

    // 真正的「复活」（死亡 → 存活）才允许重新获得幽灵票
    const revived = gameReducer(
      state,
      gameActions.setSeats(state.seats.map((s) => (s.id === 2 ? { ...s, isDead: false, hasGhostVote: true } : s)))
    );
    expect(voteOf(revived, 2)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import type { GameSnapshot } from "../../types/game";
import { createSnapshotFromState, isRealUnfinishedGame } from "../persistence";

describe("对局未完成状态检测 (isRealUnfinishedGame) 测试", () => {
  it("空快照或未初始化数据不应被判定为未完成对局", () => {
    expect(isRealUnfinishedGame(null)).toBe(false);
    expect(isRealUnfinishedGame(undefined as any)).toBe(false);
  });

  it("停留在 setup、check、scriptSelection、gameOver 阶段不属于未完成对局", () => {
    const baseSnapshot: Partial<GameSnapshot> = {
      nightCount: 1,
      seats: [{ id: 0, role: { id: "washerwoman" } }],
      winResult: null,
    };

    expect(
      isRealUnfinishedGame({ ...baseSnapshot, gamePhase: "setup" } as any)
    ).toBe(false);
    expect(
      isRealUnfinishedGame({ ...baseSnapshot, gamePhase: "check" } as any)
    ).toBe(false);
    expect(
      isRealUnfinishedGame({
        ...baseSnapshot,
        gamePhase: "scriptSelection",
      } as any)
    ).toBe(false);
    expect(
      isRealUnfinishedGame({ ...baseSnapshot, gamePhase: "gameOver" } as any)
    ).toBe(false);
  });

  it("已分出胜负 (winResult 存在) 的对局不属于未完成对局", () => {
    const finishedSnapshot: Partial<GameSnapshot> = {
      gamePhase: "day",
      nightCount: 2,
      seats: [{ id: 0, role: { id: "washerwoman" } }],
      winResult: "Good",
    };
    expect(isRealUnfinishedGame(finishedSnapshot as any)).toBe(false);
  });

  it("未分配角色 (所有座位 role 为 null) 的空桌不属于未完成对局", () => {
    const emptyTableSnapshot: Partial<GameSnapshot> = {
      gamePhase: "firstNight",
      nightCount: 1,
      seats: [
        { id: 0, role: null },
        { id: 1, role: null },
      ],
      winResult: null,
    };
    expect(isRealUnfinishedGame(emptyTableSnapshot as any)).toBe(false);
  });

  it("真正进行中 (firstNight/night/day/dusk) 且已分配角色的对局正确识别为未完成对局", () => {
    const activeSnapshot: Partial<GameSnapshot> = {
      gamePhase: "firstNight",
      nightCount: 1,
      seats: [
        { id: 0, role: { id: "washerwoman", name: "洗衣妇" } },
        { id: 1, role: { id: "imp", name: "小恶魔" } },
      ],
      winResult: null,
      selectedScript: { id: "tb", name: "暗流涌动" },
    };

    expect(isRealUnfinishedGame(activeSnapshot as any)).toBe(true);

    // 白天对局
    expect(
      isRealUnfinishedGame({ ...activeSnapshot, gamePhase: "day" } as any)
    ).toBe(true);

    // 黄昏对局
    expect(
      isRealUnfinishedGame({ ...activeSnapshot, gamePhase: "dusk" } as any)
    ).toBe(true);
  });
});

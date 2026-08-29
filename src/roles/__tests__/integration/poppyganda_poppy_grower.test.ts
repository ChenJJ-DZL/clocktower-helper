import { describe, expect, it } from "vitest";
import { generateDynamicNightQueue } from "../../../utils/dynamicQueueGenerator";
import type { GameStateSnapshot } from "../../../utils/nightStateMachine";

function seatAny(id: number, roleId: string, type: string) {
  return {
    id,
    role: { id: roleId, name: roleId, type },
    isDead: false,
    isAlive: true,
    statusEffects: [],
  };
}

const ORDER = [
  {
    roleId: "minion_info",
    firstNightPriority: 1.5,
    otherNightPriority: 0,
    firstNightOnly: true,
    wakeMessage: "minion_info",
    abilityId: "minion_info",
  },
  {
    roleId: "demon_info",
    firstNightPriority: 2.5,
    otherNightPriority: 0,
    firstNightOnly: true,
    wakeMessage: "demon_info",
    abilityId: "demon_info",
  },
] as any;

function snap(seats: any[], extra: Record<string, any> = {}) {
  return {
    seats,
    nightCount: 2,
    gamePhase: "night",
    statusEffects: {},
    globalEffects: {},
    ...extra,
  } as unknown as GameStateSnapshot;
}

describe("罂粟种植者：迷雾抑制邪恶互认步骤", () => {
  it("首夜罂粟存活且健康 → minion_info 不进入队列", () => {
    const s = snap([
      seatAny(0, "poppy_grower", "townsfolk"),
      seatAny(1, "imp", "demon"),
      seatAny(2, "poisoner", "minion"),
    ]);
    const queue = generateDynamicNightQueue(ORDER, s, {
      isFirstNight: true,
    });
    expect(queue.find((q) => q.roleId === "minion_info")).toBeUndefined();
  });

  it("非首夜正常状态 → 无邪恶互认步骤", () => {
    const s = snap([
      seatAny(0, "poppy_grower", "townsfolk"),
      seatAny(1, "imp", "demon"),
      seatAny(2, "poisoner", "minion"),
    ]);
    const queue = generateDynamicNightQueue(ORDER, s, {
      isFirstNight: false,
    });
    expect(queue.find((q) => q.roleId === "minion_info")).toBeUndefined();
    expect(queue.find((q) => q.roleId === "demon_info")).toBeUndefined();
  });

  it("罂粟种植者死亡触发 → 恢复 minion_info 与 demon_info", () => {
    const deadPoppy = seatAny(0, "poppy_grower", "townsfolk");
    (deadPoppy as any).isDead = true;
    const s = snap(
      [deadPoppy, seatAny(1, "imp", "demon"), seatAny(2, "poisoner", "minion")],
      {
        poppyGrowerDead: true,
      }
    );
    const queue = generateDynamicNightQueue(ORDER, s, {
      isFirstNight: false,
    });
    expect(queue.find((q) => q.roleId === "minion_info")).toBeDefined();
    expect(queue.find((q) => q.roleId === "demon_info")).toBeDefined();
  });

  it("罂粟种植者是纯被动角色：首夜和非首夜均绝不入队唤醒", () => {
    const s = snap([
      seatAny(0, "poppy_grower", "townsfolk"),
      seatAny(1, "imp", "demon"),
      seatAny(2, "washerwoman", "townsfolk"),
    ]);

    const fullOrder = [
      ...ORDER,
      {
        roleId: "washerwoman",
        firstNightPriority: 3,
        otherNightPriority: 0,
        firstNightOnly: true,
        wakeMessage: "washerwoman",
        abilityId: "washerwoman",
      },
    ] as any;

    const firstNightQueue = generateDynamicNightQueue(fullOrder, s, {
      isFirstNight: true,
    });
    expect(
      firstNightQueue.find((q) => q.roleId === "poppy_grower")
    ).toBeUndefined();

    const otherNightQueue = generateDynamicNightQueue(fullOrder, s, {
      isFirstNight: false,
    });
    expect(
      otherNightQueue.find((q) => q.roleId === "poppy_grower")
    ).toBeUndefined();
  });
});

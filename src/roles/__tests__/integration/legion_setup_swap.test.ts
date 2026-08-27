import { describe, expect, it } from "vitest";
import { generateDynamicNightQueue } from "../../../utils/dynamicQueueGenerator";
import type { GameStateSnapshot } from "../../../utils/nightStateMachine";

/**
 * 军团（Legion）专项测试 — 三个关键机制：
 * ① setup 反转：13 镇 + 2 外 + 4 爪 + 3 恶 → 选中 legion 后变为 15 legion + 7 townsfolk
 *    （实际由 useGameState 实施；本测试用 mock snapshot 模拟反转结果）
 * ② 首夜所有军团同时互认：所有军团互为 group（无 3 不在场伪装）
 * ③ 每名军团独立获得 3 不在场镇民身份：demon_info 节点数 = legion 数
 * ④ 投票 0 票与胜负豁免（已由 W8.26.1 在 legion_rules.test.ts 覆盖，本文件不重复）
 */

function makeSnapshot(
  legionCount: number,
  townsfolkCount: number
): GameStateSnapshot {
  const seats: any[] = [];
  // 前 townsfolkCount 个是 townsfolk
  for (let i = 0; i < townsfolkCount; i++) {
    seats.push({
      id: i,
      role: { id: "washerwoman", name: "洗衣妇", type: "townsfolk" },
      isDead: false,
      isAlive: true,
      statusEffects: [],
    });
  }
  // 后续是军团（demon type）
  for (let i = 0; i < legionCount; i++) {
    seats.push({
      id: townsfolkCount + i,
      role: { id: "legion", name: "军团", type: "demon" },
      isDead: false,
      isAlive: true,
      statusEffects: [],
    });
  }
  return {
    seats,
    nightCount: 1,
    gamePhase: "firstNight",
    statusEffects: {},
    globalEffects: { vortoxWorld: false },
  } as unknown as GameStateSnapshot;
}

describe("军团开局角色类型反转后 — 恶魔伪装步骤按军团数量展开", () => {
  it("1 个军团时，demon_info 节点只有 1 个（不做展开）", () => {
    const snap = makeSnapshot(1, 7);
    const queue = generateDynamicNightQueue(
      [{ roleId: "demon_info", firstNightPriority: 80, otherNightPriority: 0, firstNightOnly: true, wakeMessage: "demon_info", abilityId: "demon_info" }] as any,
      snap,
      { isFirstNight: true }
    );
    const demonInfoNodes = queue.filter((q) => q.roleId === "demon_info");
    expect(demonInfoNodes).toHaveLength(1);
  });

  it("3 个军团时，demon_info 节点应有 3 个（每军团一份 3 不在场伪装）", () => {
    const snap = makeSnapshot(3, 4);
    const queue = generateDynamicNightQueue(
      [{ roleId: "demon_info", firstNightPriority: 80, otherNightPriority: 0, firstNightOnly: true, wakeMessage: "demon_info", abilityId: "demon_info" }] as any,
      snap,
      { isFirstNight: true }
    );
    const demonInfoNodes = queue.filter((q) => q.roleId === "demon_info");
    expect(demonInfoNodes).toHaveLength(3);
  });

  it("5 个军团时，demon_info 节点应有 5 个（每军团独立 seatId）", () => {
    const snap = makeSnapshot(5, 2);
    const queue = generateDynamicNightQueue(
      [{ roleId: "demon_info", firstNightPriority: 80, otherNightPriority: 0, firstNightOnly: true, wakeMessage: "demon_info", abilityId: "demon_info" }] as any,
      snap,
      { isFirstNight: true }
    );
    const demonInfoNodes = queue.filter((q) => q.roleId === "demon_info");
    expect(demonInfoNodes).toHaveLength(5);
    // 每个 demon_info 节点都应有不同的 seatId
    const seatIds = new Set(demonInfoNodes.map((n) => n.seatId));
    expect(seatIds.size).toBe(5);
  });

  it("0 个军团时，demon_info 节点不应出现（除非有其他 demon 在场）", () => {
    const snap = makeSnapshot(0, 7);
    // 给一个 vortox 让 demon_info 进入
    snap.seats.push({
      id: 7,
      role: { id: "vortox", name: "涡流", type: "demon" },
      isDead: false,
      isAlive: true,
      statusEffects: [],
    });
    const queue = generateDynamicNightQueue(
      [{ roleId: "demon_info", firstNightPriority: 80, otherNightPriority: 0, firstNightOnly: true, wakeMessage: "demon_info", abilityId: "demon_info" }] as any,
      snap,
      { isFirstNight: true }
    );
    const demonInfoNodes = queue.filter((q) => q.roleId === "demon_info");
    expect(demonInfoNodes).toHaveLength(1); // 仅 vortox 一份
  });

  it("军团的额外节点 roleName 包含「第 N 军团互认」标识", () => {
    const snap = makeSnapshot(2, 5);
    const queue = generateDynamicNightQueue(
      [{ roleId: "demon_info", firstNightPriority: 80, otherNightPriority: 0, firstNightOnly: true, wakeMessage: "demon_info", abilityId: "demon_info" }] as any,
      snap,
      { isFirstNight: true }
    );
    const demonInfoNodes = queue.filter((q) => q.roleId === "demon_info");
    expect(demonInfoNodes).toHaveLength(2);
    const extra = demonInfoNodes.find((n) => n.meta?.isExtraLegionDemon);
    expect(extra).toBeDefined();
    expect(extra?.roleName).toContain("第 2 军团互认");
  });
});

describe("军团 + 罂粟种植者互认 — 罂粟存活时 demon_info 仍进入（军团视同恶魔）", () => {
  it("罂粟种植者存活时，军团在场仍应有 demon_info 节点（军团需要知道伪装）", () => {
    const seats: any[] = [
      {
        id: 0,
        role: { id: "poppy_grower", name: "罂粟种植者", type: "townsfolk" },
        isDead: false,
        isAlive: true,
        statusEffects: [],
      },
      {
        id: 1,
        role: { id: "legion", name: "军团", type: "demon" },
        isDead: false,
        isAlive: true,
        statusEffects: [],
      },
      {
        id: 2,
        role: { id: "legion", name: "军团", type: "demon" },
        isDead: false,
        isAlive: true,
        statusEffects: [],
      },
      {
        id: 3,
        role: { id: "washerwoman", name: "洗衣妇", type: "townsfolk" },
        isDead: false,
        isAlive: true,
        statusEffects: [],
      },
    ];
    const snap = {
      seats,
      nightCount: 1,
      gamePhase: "firstNight",
      statusEffects: {},
      globalEffects: { vortoxWorld: false },
    } as unknown as GameStateSnapshot;
    const queue = generateDynamicNightQueue(
      [
        {
          roleId: "minion_info",
          firstNightPriority: 50,
          otherNightPriority: 0,
          firstNightOnly: true,
          wakeMessage: "minion_info",
          abilityId: "minion_info",
        },
        {
          roleId: "demon_info",
          firstNightPriority: 80,
          otherNightPriority: 0,
          firstNightOnly: true,
          wakeMessage: "demon_info",
          abilityId: "demon_info",
        },
      ] as any,
      snap,
      { isFirstNight: true }
    );
    // 罂粟种植者存活时，minion_info 不进入；但 demon_info 仍要进入（军团视同恶魔）
    expect(queue.find((q) => q.roleId === "minion_info")).toBeUndefined();
    const demonInfoNodes = queue.filter((q) => q.roleId === "demon_info");
    expect(demonInfoNodes).toHaveLength(2); // 2 军团
  });
});

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

describe("军团开局角色类型反转后 — 恶魔伪装步骤统一共享", () => {
  it("1 个军团时，demon_info 节点只有 1 个", () => {
    const snap = makeSnapshot(1, 7);
    const queue = generateDynamicNightQueue(
      [
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
    const demonInfoNodes = queue.filter((q) => q.roleId === "demon_info");
    expect(demonInfoNodes).toHaveLength(1);
  });

  it("3 个军团时，demon_info 节点为全军团共享的 1 个统一节点（共享 3 不在场镇民伪装）", () => {
    const snap = makeSnapshot(3, 4);
    const queue = generateDynamicNightQueue(
      [
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
    const demonInfoNodes = queue.filter((q) => q.roleId === "demon_info");
    expect(demonInfoNodes).toHaveLength(1);
  });

  it("5 个军团时，demon_info 节点依然保持统一共享的 1 个节点（避免重复打扰说书人）", () => {
    const snap = makeSnapshot(5, 2);
    const queue = generateDynamicNightQueue(
      [
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
    const demonInfoNodes = queue.filter((q) => q.roleId === "demon_info");
    expect(demonInfoNodes).toHaveLength(1);
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
      [
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
    const demonInfoNodes = queue.filter((q) => q.roleId === "demon_info");
    expect(demonInfoNodes).toHaveLength(1); // 仅 vortox 一份
  });

  it("无论场上有多少军团，demon_info 均为全队统一共享的 1 个节点（3 个不在场镇民伪装）", () => {
    const snap = makeSnapshot(5, 2);
    const queue = generateDynamicNightQueue(
      [
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
    const demonInfoNodes = queue.filter((q) => q.roleId === "demon_info");
    expect(demonInfoNodes).toHaveLength(1);
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
    expect(queue.find((q) => q.roleId === "minion_info")).toBeUndefined();
    const demonInfoNodes = queue.filter((q) => q.roleId === "demon_info");
    expect(demonInfoNodes).toHaveLength(1); // 全军团共享 1 份伪装信息
  });
});

describe("军团首夜互认 — legion_mutual_recognition 系统步骤", () => {
  it("首夜且军团在场时，军团互认与恶魔伪装合并为唯一的统一互认节点，不再生成独立的 demon_info 步骤", () => {
    const snap = makeSnapshot(3, 4);
    const queue = generateDynamicNightQueue(
      [
        {
          roleId: "legion_mutual_recognition",
          roleName: "军团互认",
          firstNightPriority: 2.25,
          otherNightPriority: 0,
          firstNightOnly: true,
          wakeMessage: "legion_mutual_recognition",
          abilityId: "legion_mutual_recognition",
        },
        {
          roleId: "demon_info",
          roleName: "恶魔互认",
          firstNightPriority: 2.5,
          otherNightPriority: 0,
          firstNightOnly: true,
          wakeMessage: "demon_info",
          abilityId: "demon_info",
        },
      ] as any,
      snap,
      { isFirstNight: true }
    );
    const mutualNodes = queue.filter(
      (q) => q.roleId === "legion_mutual_recognition"
    );
    expect(mutualNodes).toHaveLength(1);
    expect(mutualNodes[0].meta?.isLegionMutualRecognition).toBe(true);
    expect(mutualNodes[0].meta?.isLegionUnified).toBe(true);
    expect(mutualNodes[0].wakeMessage).toContain(
      "请同时唤醒所有的军团玩家（座位号：5号、6号、7号）"
    );
    // 独立的 demon_info 节点已被合并消除
    const demonInfoNodes = queue.filter((q) => q.roleId === "demon_info");
    expect(demonInfoNodes).toHaveLength(0);
  });

  it("非首夜 / 首夜已完成 / 无军团时互认步骤不进入队列", () => {
    const orderEntries = [
      {
        roleId: "legion_mutual_recognition",
        roleName: "军团互认",
        firstNightPriority: 2.25,
        otherNightPriority: 0,
        firstNightOnly: true,
        wakeMessage: "legion_mutual_recognition",
        abilityId: "legion_mutual_recognition",
      },
    ] as any;
    // 非首夜
    let queue = generateDynamicNightQueue(orderEntries, makeSnapshot(2, 3), {
      isFirstNight: false,
    });
    expect(
      queue.find((q) => q.roleId === "legion_mutual_recognition")
    ).toBeUndefined();
    // 首夜已完成（复播防重复）
    const doneSnap = makeSnapshot(2, 3) as any;
    doneSnap.hasCompletedFirstNight = true;
    queue = generateDynamicNightQueue(orderEntries, doneSnap, {
      isFirstNight: true,
    });
    expect(
      queue.find((q) => q.roleId === "legion_mutual_recognition")
    ).toBeUndefined();
    // 无军团
    queue = generateDynamicNightQueue(orderEntries, makeSnapshot(0, 5), {
      isFirstNight: true,
    });
    expect(
      queue.find((q) => q.roleId === "legion_mutual_recognition")
    ).toBeUndefined();
  });

  it("当罂粟种植者在场且健康时，首夜军团互认步骤绝不进队列（军团不互认）", () => {
    const orderEntries = [
      {
        roleId: "legion_mutual_recognition",
        roleName: "军团互认",
        firstNightPriority: 2.25,
        otherNightPriority: 0,
        firstNightOnly: true,
        wakeMessage: "legion_mutual_recognition",
        abilityId: "legion_mutual_recognition",
      },
      {
        roleId: "demon_info",
        roleName: "恶魔互认",
        firstNightPriority: 2.5,
        otherNightPriority: 0,
        firstNightOnly: true,
        wakeMessage: "demon_info",
        abilityId: "demon_info",
      },
    ] as any;

    const snap = makeSnapshot(2, 4); // 2 镇民 + 4 军团
    // 添加存活且健康的罂粟种植者
    snap.seats[0].role = {
      id: "poppy_grower",
      name: "罂粟种植者",
      type: "townsfolk",
    } as any;
    snap.seats[0].isDead = false;
    snap.seats[0].isDrunk = false;
    snap.seats[0].isPoisoned = false;

    const queue = generateDynamicNightQueue(orderEntries, snap, {
      isFirstNight: true,
    });
    // 军团互认步骤被罂粟种植者完全阻止，不进入队列
    expect(
      queue.find((q) => q.roleId === "legion_mutual_recognition")
    ).toBeUndefined();
  });
});

describe("军团非首夜行动队列合并 — 无论多少名军团玩家，夜序生成器仅产出 1 个军团夜间唤醒节点", () => {
  it("3 军团在场时，非首夜仅生成 1 个统一军团唤醒节点，并包含所有存活军团座位提示", () => {
    const snap = makeSnapshot(3, 4);
    const orderEntries = [
      {
        roleId: "legion",
        roleName: "军团",
        firstNightPriority: 0,
        otherNightPriority: 44,
        firstNightOnly: false,
        wakeMessage: "军团夜杀",
        abilityId: "legion_night_kill",
      },
    ] as any;

    const queue = generateDynamicNightQueue(orderEntries, snap, {
      isFirstNight: false,
    });
    const legionNodes = queue.filter((q) => q.roleId === "legion");
    expect(legionNodes).toHaveLength(1);
    expect(legionNodes[0].wakeMessage).toContain(
      "请同时唤醒所有的军团玩家（座位号：5号、6号、7号）"
    );
    expect(legionNodes[0].meta?.isLegionUnified).toBe(true);
    expect(legionNodes[0].meta?.legionSeatIds).toEqual([4, 5, 6]);
  });

  it("7 军团在场时，非首夜仅生成 1 个统一军团唤醒节点，并包含所有存活军团座位提示", () => {
    const snap = makeSnapshot(7, 3);
    const orderEntries = [
      {
        roleId: "legion",
        roleName: "军团",
        firstNightPriority: 0,
        otherNightPriority: 44,
        firstNightOnly: false,
        wakeMessage: "军团夜杀",
        abilityId: "legion_night_kill",
      },
    ] as any;

    const queue = generateDynamicNightQueue(orderEntries, snap, {
      isFirstNight: false,
    });
    const legionNodes = queue.filter((q) => q.roleId === "legion");
    expect(legionNodes).toHaveLength(1);
    expect(legionNodes[0].wakeMessage).toContain(
      "请同时唤醒所有的军团玩家（座位号：4号、5号、6号、7号、8号、9号、10号）"
    );
    expect(legionNodes[0].meta?.isLegionUnified).toBe(true);
    expect(legionNodes[0].meta?.legionSeatIds).toEqual([3, 4, 5, 6, 7, 8, 9]);
  });
});

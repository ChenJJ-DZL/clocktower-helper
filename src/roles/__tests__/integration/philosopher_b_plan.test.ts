/**
 * 哲学家（Philosopher）· L2 引擎契约测试
 *
 * 官方规则（Wiki）："在你的首个白天，选择一名不在场的角色。你获得该能力。
 *   如果该角色在场，该玩家变成酒鬼。"
 * 官方范例 1：「哲学家选择获得筑梦师能力。**从现在起，他将在筑梦师应该行动时
 *   进行行动。**」
 * 官方范例 3：「哲学家选择获得艺术家的能力，但场上已经有一名艺术家。
 *   那名艺术家玩家醉酒。」
 *
 * ── 本测试要钉死的 4 条不变式 ─────────────────────────────────────
 *   I1 身份不变：哲学家 seat.role 仍是 philosopher（❌ 不是 changeRole 变身）
 *   I2 能力落载体：acquiredAbilities 含被选角色 id
 *   I3 夜序路由：被继承角色不在场时，队列里出现「哲学家代打」条目
 *   I4 在场规则：被选角色在场 → 该玩家变酒鬼，哲学家**仍然**获得能力
 *
 * ⚠️ 防假绿自检：把 philosopher.ability.ts 的 acquiredAbilities 写入注释掉，
 *    I2/I3 必须变红。见文件末尾「反例验证」。
 */
import { describe, expect, it } from "vitest";
import type { Seat } from "../../../../app/data";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import { philosopherAbility } from "../../new_engine/philosopher.ability";
import { unifiedRoleDefinition } from "../../unifiedRoleDefinition";
import {
  findAbilityGrantingSeat,
  seatHasAcquiredAbility,
} from "../../../utils/grantedAbilityHelper";
import {
  generateDynamicNightQueue,
  type NightOrderEntry,
} from "../../../utils/dynamicQueueGenerator";

function makeSeat(
  id: number,
  rid: string,
  rname: string,
  rtype: "townsfolk" | "outsider" | "minion" | "demon"
): any {
  return {
    id,
    playerName: `${id + 1}号`,
    isDead: false,
    isDrunk: false,
    isPoisoned: false,
    hasUsedDayAbility: false,
    role: { id: rid, name: rname, type: rtype },
    charadeRole: null,
    statusDetails: [],
    statusEffects: [],
  };
}

async function runPhilosopher(
  seats: any[],
  chosenRoleId: string | null,
  nightCount = 1
) {
  const ctx: any = {
    snapshot: { nightCount, seats } as any,
    actionNode: {
      seatId: 0,
      roleId: "philosopher",
      roleName: "哲学家",
    } as any,
    targetIds: [],
    storytellerInput: chosenRoleId ? { chosenRoleId } : undefined,
    meta: {},
  };
  return runFullAbilityPipeline(philosopherAbility as any, ctx);
}

// ─────────────────────────────────────────────────────────────────────
// I1 + I2：身份不变 / 能力落载体
// ─────────────────────────────────────────────────────────────────────
describe("哲学家 · I1 身份不变 + I2 能力落载体", () => {
  it("选择不在场的筑梦师 → 哲学家身份仍是 philosopher，acquiredAbilities 含 dreamer", async () => {
    const seats = [
      makeSeat(0, "philosopher", "哲学家", "townsfolk"),
      makeSeat(1, "soldier", "士兵", "townsfolk"),
    ];

    const r = await runPhilosopher(seats, "dreamer");

    const philo = r.snapshot.seats.find((s: any) => s.id === 0)!;
    // I1 身份不变（❌ 不是变身成筑梦师）
    expect(philo.role?.id).toBe("philosopher");
    expect(philo.role?.name).toBe("哲学家");
    // I2 能力落载体
    expect(philo.acquiredAbilities).toContain("dreamer");
    expect((philo as any).philosopherGainedRole).toBe("dreamer");
    // SSt 助手判定一致
    expect(seatHasAcquiredAbility(philo, "dreamer")).toBe(true);
  });

  it("未选择角色（未发动）→ 不写入任何能力", async () => {
    const seats = [
      makeSeat(0, "philosopher", "哲学家", "townsfolk"),
      makeSeat(1, "soldier", "士兵", "townsfolk"),
    ];

    const r = await runPhilosopher(seats, null);
    const philo = r.snapshot.seats.find((s: any) => s.id === 0)!;

    expect(philo.acquiredAbilities ?? []).not.toContain("dreamer");
    expect((philo as any).philosopherGainedRole ?? null).toBe(null);
  });

  it("I1 反向断言：哲学家**绝不该**变成被选角色（防 changeRole 回归）", async () => {
    const seats = [
      makeSeat(0, "philosopher", "哲学家", "townsfolk"),
      makeSeat(1, "soldier", "士兵", "townsfolk"),
    ];

    const r = await runPhilosopher(seats, "artist");
    const philo = r.snapshot.seats.find((s: any) => s.id === 0)!;

    // ⭐ 这条是本次修复的核心：旧实现会得到 role.id === "artist"
    expect(philo.role?.id).not.toBe("artist");
    expect(philo.role?.id).toBe("philosopher");
  });
});

// ─────────────────────────────────────────────────────────────────────
// I4：在场规则 —— 该角色玩家变酒鬼，哲学家仍获得能力
// ─────────────────────────────────────────────────────────────────────
describe("哲学家 · I4 在场规则（官方：该角色在场则该玩家变酒鬼）", () => {
  it("选择在场的艺术家 → 1号艺术家变酒鬼，哲学家仍获得 artist 能力", async () => {
    const seats = [
      makeSeat(0, "philosopher", "哲学家", "townsfolk"),
      makeSeat(1, "artist", "艺术家", "townsfolk"),
    ];

    const r = await runPhilosopher(seats, "artist");

    const philo = r.snapshot.seats.find((s: any) => s.id === 0)!;
    const artist = r.snapshot.seats.find((s: any) => s.id === 1)!;

    // 哲学家仍获得能力（官方明确）
    expect(philo.acquiredAbilities).toContain("artist");
    // 在场艺术家变酒鬼
    expect(artist.isDrunk).toBe(true);
    expect(
      (artist.statusEffects ?? []).some(
        (e: any) => e.type === "drunk" && e.source === "philosopher"
      )
    ).toBe(true);
    // 且能力结果里标记了 roleInPlay
    expect(r.meta.abilityResult.roleInPlay).toBe(true);
    expect(r.meta.abilityResult.duplicateSeatId).toBe(1);
  });

  it("选择不在场的角色 → 无人变酒鬼", async () => {
    const seats = [
      makeSeat(0, "philosopher", "哲学家", "townsfolk"),
      makeSeat(1, "soldier", "士兵", "townsfolk"),
    ];

    const r = await runPhilosopher(seats, "dreamer");

    expect(r.meta.abilityResult.roleInPlay).toBe(false);
    expect(r.snapshot.seats.some((s: any) => s.isDrunk)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// I3：夜序路由 —— 被继承角色不在场时，哲学家代打
// ─────────────────────────────────────────────────────────────────────
describe("哲学家 · I3 夜序路由（官方范例 1：在筑梦师应该行动时行动）", () => {
  const dreamerEntry: NightOrderEntry = {
    roleId: "dreamer",
    roleName: "筑梦师",
    firstNightPriority: 30,
    otherNightPriority: 31,
    firstNightOnly: false,
    wakeMessage: "role.dreamer.wake",
    abilityId: "dreamer_ability",
  };

  it("哲学家持有 dreamer 能力 + 场上无筑梦师 → 队列出现哲学家代打条目", () => {
    const seats: any[] = [
      {
        ...makeSeat(0, "philosopher", "哲学家", "townsfolk"),
        acquiredAbilities: ["dreamer"],
        philosopherGainedRole: "dreamer",
      },
      makeSeat(1, "soldier", "士兵", "townsfolk"),
    ];

    const queue = generateDynamicNightQueue(
      [dreamerEntry],
      { nightCount: 2, seats } as any,
      { isFirstNight: false }
    );

    const node = queue.find((n) => n.roleId === "dreamer");
    expect(node, "队列里应有 dreamer 条目（由哲学家代打）").toBeTruthy();
    expect(node!.seatId).toBe(0); // 行动者是哲学家座位
    expect(node!.roleName).toContain("哲学家");
    expect((node as any).meta?.isInheritedAbilityActor).toBe(true);
  });

  it("哲学家未持有 dreamer 能力 → 队列**不**出现 dreamer 条目（防误注入）", () => {
    const seats: any[] = [
      makeSeat(0, "philosopher", "哲学家", "townsfolk"),
      makeSeat(1, "soldier", "士兵", "townsfolk"),
    ];

    const queue = generateDynamicNightQueue(
      [dreamerEntry],
      { nightCount: 2, seats } as any,
      { isFirstNight: false }
    );

    expect(queue.find((n) => n.roleId === "dreamer")).toBeUndefined();
  });

  it("筑梦师本人在场 → 由本人行动，哲学家不代打（避免双份行动）", () => {
    const seats: any[] = [
      {
        ...makeSeat(0, "philosopher", "哲学家", "townsfolk"),
        acquiredAbilities: ["dreamer"],
      },
      makeSeat(1, "dreamer", "筑梦师", "townsfolk"),
    ];

    const queue = generateDynamicNightQueue(
      [dreamerEntry],
      { nightCount: 2, seats } as any,
      { isFirstNight: false }
    );

    const nodes = queue.filter((n) => n.roleId === "dreamer");
    expect(nodes.length).toBe(1);
    expect(nodes[0].seatId).toBe(1); // 是筑梦师本人，不是哲学家
  });

  it("官方：继承「首个夜晚」能力 → 在**选择当晚**即可使用（不等到下一夜）", () => {
    // 官方原文：「如果这个角色能力是"首个夜晚"能力，他会在**当晚**使用该能力。」
    const artistEntry: NightOrderEntry = {
      roleId: "artist",
      roleName: "艺术家",
      firstNightPriority: 40,
      otherNightPriority: 0,
      firstNightOnly: true,
      wakeMessage: "role.artist.wake",
      abilityId: "artist_ability",
    };

    const seats: any[] = [
      {
        ...makeSeat(0, "philosopher", "哲学家", "townsfolk"),
        acquiredAbilities: ["artist"],
        philosopherGainedRole: "artist",
      },
      makeSeat(1, "soldier", "士兵", "townsfolk"),
    ];

    // 第 4 夜选择 → 当晚即可用
    const queue = generateDynamicNightQueue(
      [artistEntry],
      { nightCount: 4, hasCompletedFirstNight: true, seats } as any,
      { isFirstNight: false }
    );

    const node = queue.find((n) => n.roleId === "artist");
    expect(
      node,
      "官方：哲学家获得首夜能力后应在【选择当晚】被唤醒使用"
    ).toBeTruthy();
    expect(node!.seatId).toBe(0);
    expect((node as any).meta?.isInheritedAbilityActor).toBe(true);
  });

  it("能力已消耗（hasUsedDayAbility）→ 队列不再注入（一次性语义）", () => {
    const artistEntry: NightOrderEntry = {
      roleId: "artist",
      roleName: "艺术家",
      firstNightPriority: 40,
      otherNightPriority: 0,
      firstNightOnly: true,
      wakeMessage: "role.artist.wake",
      abilityId: "artist_ability",
    };

    // 关键：哲学家已用掉该能力（白天提问过）
    const seats: any[] = [
      {
        ...makeSeat(0, "philosopher", "哲学家", "townsfolk"),
        acquiredAbilities: ["artist"],
        philosopherGainedRole: "artist",
        hasUsedDayAbility: true,
        artistAbilityUsed: true,
      },
      makeSeat(1, "soldier", "士兵", "townsfolk"),
    ];

    const queue = generateDynamicNightQueue(
      [artistEntry],
      { nightCount: 4, hasCompletedFirstNight: true, seats } as any,
      { isFirstNight: false }
    );

    expect(queue.find((n) => n.roleId === "artist")).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────
// actorId 路由（useNightActionHandler）—— 能力**执行**环节的继承者识别
// ⚠️ 自检暴露的盲区：此前无任何测试覆盖这条路径
// ─────────────────────────────────────────────────────────────────────
describe("哲学家 · actorId 路由（能力执行时认出继承者）", () => {
  it("⭐ 原角色不在场 + 哲学家持有其能力 → 执行时 actorId 应解析为哲学家座位", async () => {
    const { executeViaNewEngine } = await import(
      "../../../hooks/useNightActionHandler"
    );

    const seats: any[] = [
      {
        ...makeSeat(0, "philosopher", "哲学家", "townsfolk"),
        acquiredAbilities: ["fortune_teller"],
        philosopherGainedRole: "fortune_teller",
      },
      makeSeat(1, "soldier", "士兵", "townsfolk"),
      makeSeat(2, "imp", "小恶魔", "demon"),
    ];

    const modals: any[] = [];
    const context: any = {
      seats,
      nightCount: 2,
      gamePhase: "night",
      selectedTargets: [1],
      roles: [],
      vortoxWorld: false,
      getRegistration: () => ({}),
      getMisinformation: {},
      findNearestAliveNeighbor: () => null,
      setSeats: () => {},
      setSelectedActionTargets: () => {},
      setDeadThisNight: () => {},
      dispatch: () => {},
      addLog: () => {},
      continueToNextAction: () => {},
      setCurrentModal: (m: any) => modals.push(m),
      markAbilityUsed: () => {},
      hasUsedAbility: () => false,
      preview: true,
    };

    // 场上没有 fortune_teller 座位 → 必须由哲学家顶上
    const ok = await executeViaNewEngine(context, "fortune_teller");
    expect(ok).toBe(true);

    const confirm = modals.find((m) => m?.type === "NIGHT_ACTION_CONFIRM");
    expect(
      confirm,
      "⭐ actorId 路由断裂：哲学家持有该能力却没能生成行动确认窗"
    ).toBeDefined();
    // 说书人侧必须能看出行动者是谁（1号-哲学家），而不是"未找到"
    expect(confirm.data.roleName).toContain("1号");
  });

  it("⭐ 代打后应标记 inheritedAbilityConsumed（供队列层识别一次性能力已消耗）", async () => {
    const { executeViaNewEngine } = await import(
      "../../../hooks/useNightActionHandler"
    );

    const seats: any[] = [
      {
        ...makeSeat(0, "philosopher", "哲学家", "townsfolk"),
        acquiredAbilities: ["artist"],
        philosopherGainedRole: "artist",
      },
      makeSeat(1, "soldier", "士兵", "townsfolk"),
    ];

    let updatedSeats: any[] = [];
    const context: any = {
      seats,
      nightCount: 2,
      gamePhase: "night",
      selectedTargets: [],
      roles: [],
      vortoxWorld: false,
      getRegistration: () => ({}),
      getMisinformation: {},
      findNearestAliveNeighbor: () => null,
      setSeats: (s: any[]) => {
        updatedSeats = s;
      },
      setSelectedActionTargets: () => {},
      setDeadThisNight: () => {},
      dispatch: () => {},
      addLog: () => {},
      continueToNextAction: () => {},
      setCurrentModal: () => {},
      markAbilityUsed: () => {},
      hasUsedAbility: () => false,
      preview: false,
    };

    await executeViaNewEngine(context, "artist");

    const after = updatedSeats.find((s: any) => s.id === 0);
    expect(
      after?.inheritedAbilityConsumed,
      "⭐ 代打后未标记消耗 → 队列层会反复唤醒一次性能力（空唤醒）"
    ).toContain("artist");
  });

  it("原角色在场 → actorId 解析为原角色本人（哲学家不抢占）", async () => {
    const { executeViaNewEngine } = await import(
      "../../../hooks/useNightActionHandler"
    );

    const seats: any[] = [
      {
        ...makeSeat(0, "philosopher", "哲学家", "townsfolk"),
        acquiredAbilities: ["fortune_teller"],
      },
      { ...makeSeat(1, "fortune_teller", "占卜师", "townsfolk") },
      makeSeat(2, "imp", "小恶魔", "demon"),
    ];

    const modals: any[] = [];
    const context: any = {
      seats,
      nightCount: 2,
      gamePhase: "night",
      selectedTargets: [2],
      roles: [],
      vortoxWorld: false,
      getRegistration: () => ({}),
      getMisinformation: {},
      findNearestAliveNeighbor: () => null,
      setSeats: () => {},
      setSelectedActionTargets: () => {},
      setDeadThisNight: () => {},
      dispatch: () => {},
      addLog: () => {},
      continueToNextAction: () => {},
      setCurrentModal: (m: any) => modals.push(m),
      markAbilityUsed: () => {},
      hasUsedAbility: () => false,
      preview: true,
    };

    await executeViaNewEngine(context, "fortune_teller");
    const confirm = modals.find((m) => m?.type === "NIGHT_ACTION_CONFIRM");
    expect(confirm).toBeDefined();
    // 行动者应是 2号（0基id=1），不是 1号（哲学家）
    expect(confirm.data.roleName).toContain("2号");
  });
});

// ─────────────────────────────────────────────────────────────────────
// SST 助手
// ─────────────────────────────────────────────────────────────────────
describe("哲学家 · SST 助手 granttedAbilityHelper", () => {
  it("findAbilityGrantingSeat 只认继承型角色（普通角色不误判）", () => {
    const seats: any[] = [
      // 普通士兵，即使脏数据带了 acquiredAbilities 也不该被认
      { ...makeSeat(0, "soldier", "士兵", "townsfolk"), acquiredAbilities: ["dreamer"] },
      { ...makeSeat(1, "philosopher", "哲学家", "townsfolk"), acquiredAbilities: ["dreamer"] },
    ];

    const found = findAbilityGrantingSeat(seats, "dreamer");
    expect(found?.id).toBe(1); // 必须是哲学家，不是士兵
  });

  it("继承者死亡 → 能力失效", () => {
    const dead: any = {
      ...makeSeat(0, "philosopher", "哲学家", "townsfolk"),
      acquiredAbilities: ["dreamer"],
      isDead: true,
    };
    expect(seatHasAcquiredAbility(dead, "dreamer")).toBe(false);
  });

  it("同时支持 pixie 与 philosopher，互不干扰", () => {
    const seats: any[] = [
      {
        ...makeSeat(0, "pixie", "小精灵", "townsfolk"),
        acquiredAbilities: ["chef"],
      },
      {
        ...makeSeat(1, "philosopher", "哲学家", "townsfolk"),
        acquiredAbilities: ["dreamer"],
      },
    ];

    expect(findAbilityGrantingSeat(seats, "chef")?.id).toBe(0);
    expect(findAbilityGrantingSeat(seats, "dreamer")?.id).toBe(1);
    expect(findAbilityGrantingSeat(seats, "soldier")).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────
// 反例验证：确保测试不是空跑
// ─────────────────────────────────────────────────────────────────────
describe("哲学家 · 反例验证（防假绿）", () => {
  it("注册表里 philosopher 能力确实存在（否则上面的管道测试是空跑）", () => {
    const abilities = unifiedRoleDefinition.getAllAbilities() as any[];
    const found = abilities.find((a) => a.roleId === "philosopher");
    expect(found, "philosopher 不在能力注册表 → 测试无意义").toBeTruthy();
    expect(found.abilityId).toBe("philosopher_gain");
  });
});

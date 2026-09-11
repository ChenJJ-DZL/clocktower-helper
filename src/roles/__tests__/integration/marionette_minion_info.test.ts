import { describe, expect, it } from "vitest";
import type { Seat } from "../../../../app/data";
import { generateDynamicNightQueue } from "../../../utils/dynamicQueueGenerator";
import { calculateNightInfoViaNewEngine } from "../../../utils/nightInfoAdapter";
import type { GameStateSnapshot } from "../../../utils/nightStateMachine";

/**
 * 提线木偶的爪牙信息可见性（官方规则回归）
 *
 * 官方依据（钟楼百科·提线木偶·角色简介）：
 * - 「提线木偶不会在游戏的首个夜晚被唤醒以得知其他邪恶玩家都有谁，
 *    其他爪牙也不会得知谁是提线木偶。」
 * - 「提线木偶不会因其他角色能力导致他确认自己是爪牙而被唤醒。例如：告密者…」
 * - 「恶魔会知道哪一名玩家是提线木偶。」
 * 相克规则（告密者条目）：「提线木偶不会得知三个不在场的角色，如果提线木偶与告密者
 * 均在场，改为由恶魔额外得知三个不在场角色。」
 */

const SCRIPT = {
  id: "poppyganda",
  name: "罂粟花开",
  roleIds: [
    "washerwoman",
    "librarian",
    "investigator",
    "chef",
    "empath",
    "fortune_teller",
    "soldier",
    "mayor",
    "drunk",
    "saint",
    "recluse",
    "snitch",
    "poisoner",
    "marionette",
    "imp",
    "vortox",
  ],
} as any;

const nightOrder = [
  {
    roleId: "minion_info",
    roleName: "爪牙互认",
    firstNightPriority: 1.5,
    otherNightPriority: 0,
    firstNightOnly: true,
    wakeMessage: "minion_info",
    abilityId: "minion_info",
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

const snapshotOf = (seats: Seat[]) =>
  ({
    seats,
    nightCount: 1,
    gamePhase: "firstNight",
    statusEffects: {},
    globalEffects: {},
  }) as unknown as GameStateSnapshot;

const seat = (id: number, id2: string, name: string, type: string) =>
  ({ id, role: { id: id2, name, type }, isDead: false }) as unknown as Seat;

/** 用户实测的罂粟花开 7 人局：提线木偶是场上唯一爪牙 */
const marionetteOnlyMinion = [
  seat(0, "mayor", "镇长", "townsfolk"),
  seat(1, "drunk", "酒鬼", "outsider"),
  seat(2, "vortox", "涡流", "demon"),
  seat(3, "marionette", "提线木偶", "minion"),
  seat(4, "soldier", "士兵", "townsfolk"),
  seat(5, "chef", "厨师", "townsfolk"),
  seat(6, "empath", "共情者", "townsfolk"),
];

/** 真爪牙 + 提线木偶同场 */
const realMinionPlusMarionette = [
  seat(0, "mayor", "镇长", "townsfolk"),
  seat(1, "poisoner", "投毒者", "minion"),
  seat(2, "imp", "小恶魔", "demon"),
  seat(3, "marionette", "提线木偶", "minion"),
  seat(4, "soldier", "士兵", "townsfolk"),
  seat(5, "chef", "厨师", "townsfolk"),
  seat(6, "empath", "共情者", "townsfolk"),
];

describe("提线木偶不参与爪牙互认（官方规则）", () => {
  it("① 场上唯一爪牙是提线木偶时，首夜不生成「爪牙互认」步骤", () => {
    const queue = generateDynamicNightQueue(
      nightOrder,
      snapshotOf(marionetteOnlyMinion),
      { isFirstNight: true }
    );
    // 旧代码：会把提线木偶（type=minion）当作爪牙唤醒 → 该断言失败
    expect(queue.filter((n) => n.roleId === "minion_info")).toHaveLength(0);
    // 恶魔信息不受影响，仍然保留
    expect(queue.filter((n) => n.roleId === "demon_info")).toHaveLength(1);
  });

  it("② 真爪牙在场时仍会被唤醒，但队友名单不含提线木偶", () => {
    const queue = generateDynamicNightQueue(
      nightOrder,
      snapshotOf(realMinionPlusMarionette),
      { isFirstNight: true }
    );
    const minionStep = queue.find((n) => n.roleId === "minion_info");
    expect(minionStep).toBeDefined();
    // 唤醒的是真爪牙（2号投毒者），不是提线木偶（4号）
    expect(minionStep?.seatId).toBe(1);

    const info = calculateNightInfoViaNewEngine(
      SCRIPT,
      realMinionPlusMarionette,
      1,
      "firstNight",
      null,
      1,
      "minion_info"
    );
    expect(info?.guide).toContain("恶魔是: 3号");
    // 官方：其他爪牙不会得知谁是提线木偶 → 队友名单必须为空，不得出现 4号
    expect(info?.guide).toContain("爪牙队友: 无");
    expect(info?.guide).not.toContain("4号");
  });

  it("③ 恶魔仍然会得知哪一名玩家是提线木偶", () => {
    const info = calculateNightInfoViaNewEngine(
      SCRIPT,
      realMinionPlusMarionette,
      2,
      "firstNight",
      null,
      1,
      "demon_info"
    );
    expect(info?.guide).toContain("提线木偶: 4号");
  });

  it("④ 防御兜底：即使强行以提线木偶为行动者，也不得泄漏邪恶信息", () => {
    const info = calculateNightInfoViaNewEngine(
      SCRIPT,
      marionetteOnlyMinion,
      3,
      "firstNight",
      null,
      1,
      "minion_info"
    );
    expect(info?.guide).toContain("提线木偶不会被唤醒进行爪牙互认");
    expect(info?.guide).not.toContain("恶魔是");
  });
});

describe("提线木偶 × 告密者 相克规则", () => {
  const withSnitch = [
    seat(0, "mayor", "镇长", "townsfolk"),
    seat(1, "snitch", "告密者", "outsider"),
    seat(2, "vortox", "涡流", "demon"),
    seat(3, "marionette", "提线木偶", "minion"),
    seat(4, "soldier", "士兵", "townsfolk"),
    seat(5, "chef", "厨师", "townsfolk"),
    seat(6, "empath", "共情者", "townsfolk"),
  ];

  it("⑤ 告密者+提线木偶同场时，由恶魔额外得知三个不在场角色", () => {
    const info = calculateNightInfoViaNewEngine(
      SCRIPT,
      withSnitch,
      2,
      "firstNight",
      null,
      1,
      "demon_info"
    );
    expect(info?.guide).toContain("提线木偶×告密者相克·恶魔额外伪装");
    // 恶魔本身的不在场伪装必须保留（相克是"额外"得知）
    expect(info?.guide).toContain("不在场伪装:");
  });

  it("⑥ 提线木偶不会因告密者而被唤醒", () => {
    const queue = generateDynamicNightQueue(nightOrder, snapshotOf(withSnitch), {
      isFirstNight: true,
    });
    expect(queue.filter((n) => n.roleId === "minion_info")).toHaveLength(0);
  });
});

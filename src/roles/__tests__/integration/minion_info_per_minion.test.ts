import { describe, expect, it } from "vitest";
import type { Seat } from "../../../../app/data";
import { generateDynamicNightQueue } from "../../../utils/dynamicQueueGenerator";
import { calculateNightInfoViaNewEngine } from "../../../utils/nightInfoAdapter";
import type { GameStateSnapshot } from "../../../utils/nightStateMachine";

/**
 * 爪牙互认：每一名「真爪牙」都必须被逐一唤醒并各自获得应知信息。
 *
 * 官方依据（钟楼百科·爪牙条目）：「所有爪牙在首个夜晚醒来，互相确认身份，
 * 并得知恶魔是谁。」——多人时每名爪牙都要被告知，而不是只有一人。
 *
 * 电子化取舍（用户明确要求）：不需要「同时唤醒」，但必须**逐一步骤**唤醒每一名真爪牙。
 * 提线木偶（提线木偶以为自己善良）不参与，判定走唯一事实来源 isRealMinion。
 */

const SCRIPT = {
  id: "poppyganda",
  name: "罂粟花开",
  roleIds: [
    "mayor",
    "chef",
    "empath",
    "poisoner",
    "baron",
    "spy",
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

const seat = (id: number, roleId: string, name: string, type: string) =>
  ({ id, role: { id: roleId, name, type }, isDead: false }) as unknown as Seat;

/** 2 名真爪牙（投毒者 2号、男爵 5号）+ 提线木偶 4号 */
const twoRealMinions = [
  seat(0, "mayor", "镇长", "townsfolk"),
  seat(1, "poisoner", "投毒者", "minion"),
  seat(2, "imp", "小恶魔", "demon"),
  seat(3, "marionette", "提线木偶", "minion"),
  seat(4, "baron", "男爵", "minion"),
  seat(5, "chef", "厨师", "townsfolk"),
  seat(6, "empath", "共情者", "townsfolk"),
];

/** 3 名真爪牙（2号投毒者、5号男爵、7号间谍）+ 提线木偶 4号 */
const threeRealMinions = [
  seat(0, "mayor", "镇长", "townsfolk"),
  seat(1, "poisoner", "投毒者", "minion"),
  seat(2, "imp", "小恶魔", "demon"),
  seat(3, "marionette", "提线木偶", "minion"),
  seat(4, "baron", "男爵", "minion"),
  seat(5, "chef", "厨师", "townsfolk"),
  seat(6, "spy", "间谍", "minion"),
];

/** 1 名真爪牙 + 提线木偶（回归：行为应与旧版一致） */
const oneRealMinion = twoRealMinions.filter((s) => s.id !== 4);

const minionSteps = (seats: Seat[]) =>
  generateDynamicNightQueue(nightOrder, snapshotOf(seats), {
    isFirstNight: true,
  }).filter((n) => n.roleId === "minion_info");

describe("爪牙互认：每名真爪牙各占一个步骤（逐一唤醒）", () => {
  it("① 2 名真爪牙 → 生成 2 个步骤，行动者分别为 2号 与 5号（座位升序）", () => {
    const steps = minionSteps(twoRealMinions);
    // 旧代码：只有 1 个步骤（只唤醒第一人）→ 该断言失败
    expect(steps).toHaveLength(2);
    expect(steps.map((s) => s.seatId)).toEqual([1, 4]);
  });

  it("② 3 名真爪牙 → 生成 3 个步骤，顺序确定（座位升序）", () => {
    const steps = minionSteps(threeRealMinions);
    expect(steps).toHaveLength(3);
    expect(steps.map((s) => s.seatId)).toEqual([1, 4, 6]);
  });

  it("③ 队列里每个爪牙步骤都能生成「该行动者视角」的信息，且不含自己、不含提线木偶", () => {
    // 按队列节点逐个生成信息，确保「队列确实为每名爪牙都排了步」+「信息是各自视角」
    const views = minionSteps(twoRealMinions).map(
      (node) =>
        calculateNightInfoViaNewEngine(
          SCRIPT,
          twoRealMinions,
          node.seatId,
          "firstNight",
          null,
          1,
          "minion_info"
        )?.guide ?? ""
    );
    // 旧代码：队列只有 1 个节点 → 这里只有 1 条视角 → 该断言失败
    expect(views).toHaveLength(2);

    // 2号投毒者视角：恶魔 3号，队友 5号男爵；不得出现自己(2号)或提线木偶(4号)
    expect(views[0]).toContain("恶魔是: 3号");
    expect(views[0]).toContain("5号");
    expect(views[0]).not.toContain("4号");
    expect(views[0]).not.toContain("爪牙队友: 无");

    // 5号男爵视角：恶魔 3号，队友 2号投毒者；不得出现自己(5号)或提线木偶(4号)
    expect(views[1]).toContain("恶魔是: 3号");
    expect(views[1]).toContain("2号");
    expect(views[1]).not.toContain("4号");
  });

  it("④ 回归：只有 1 名真爪牙时，仍只生成 1 个步骤", () => {
    const steps = minionSteps(oneRealMinion);
    expect(steps).toHaveLength(1);
    expect(steps[0]?.seatId).toBe(1);
  });

  it("⑤ 场上只有提线木偶（无真爪牙）→ 不生成任何爪牙互认步骤", () => {
    const marionetteOnly = [
      seat(0, "mayor", "镇长", "townsfolk"),
      seat(1, "chef", "厨师", "townsfolk"),
      seat(2, "imp", "小恶魔", "demon"),
      seat(3, "marionette", "提线木偶", "minion"),
    ];
    expect(minionSteps(marionetteOnly)).toHaveLength(0);
  });

  it("⑥ 恶魔信息步骤不受影响（仍只有 1 个）", () => {
    const demonSteps = generateDynamicNightQueue(
      nightOrder,
      snapshotOf(threeRealMinions),
      { isFirstNight: true }
    ).filter((n) => n.roleId === "demon_info");
    expect(demonSteps).toHaveLength(1);
  });
});

import { describe, expect, it } from "vitest";
import type { Role, Seat } from "../../../../app/data";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import { snitchAbility } from "../../new_engine/snitch.ability";

/**
 * 告密者 × 提线木偶相克专项测试
 * 官方 Wiki："提线木偶：提线木偶不会得知三个不在场的角色，
 *          如果提线木偶与告密者均在场，改为由恶魔额外得知三个不在场角色。"
 *
 * 验证：
 * ① marionette 存在时，不告知 marionette
 * ② 同时给恶魔额外 3 个不在场角色
 * ③ marionette 不存在时不触发额外推送
 */

function makeSeat(
  id: number,
  roleId: string,
  type: string,
  overrides: Partial<Seat> = {}
): Seat {
  return {
    id,
    role: { id: roleId, name: roleId, type } as Role,
    isDead: false,
    isAlive: true,
    isDrunk: false,
    isPoisoned: false,
    isProtected: false,
    protectedBy: null,
    isRedHerring: false,
    isFortuneTellerRedHerring: false,
    isSentenced: false,
    masterId: null,
    charadeRole: null,
    hasUsedSlayerAbility: false,
    hasUsedVirginAbility: false,
    isDemonSuccessor: false,
    hasAbilityEvenDead: false,
    isEvilConverted: false,
    statusDetails: [],
    ...overrides,
  } as Seat;
}

const pipe = (a: any) => ({
  preCheck: a.preCheck,
  calculate: a.calculate,
  stateUpdate: a.stateUpdate,
  postProcess: a.postProcess,
});

const SCRIPT_ROLES: Role[] = [
  { id: "librarian", name: "图书管理员", type: "townsfolk" },
  { id: "investigator", name: "调查员", type: "townsfolk" },
  { id: "chef", name: "厨师", type: "townsfolk" },
  { id: "empath", name: "共情者", type: "townsfolk" },
  { id: "fortune_teller", name: "占卜师", type: "townsfolk" },
  { id: "monk", name: "僧侣", type: "townsfolk" },
  { id: "ravenkeeper", name: "守鸦人", type: "townsfolk" },
  { id: "undertaker", name: "送葬者", type: "townsfolk" },
  { id: "virgin", name: "贞洁者", type: "townsfolk" },
  { id: "slayer", name: "杀手", type: "townsfolk" },
  { id: "soldier", name: "士兵", type: "townsfolk" },
  { id: "mayor", name: "镇长", type: "townsfolk" },
  { id: "drunk", name: "酒鬼", type: "outsider" },
  { id: "lunatic", name: "疯子", type: "outsider" },
  { id: "damsel", name: "落难少女", type: "outsider" },
  { id: "golem", name: "魔像", type: "outsider" },
  { id: "poisoner", name: "投毒者", type: "minion" },
  { id: "spy", name: "间谍", type: "minion" },
  { id: "baron", name: "男爵", type: "minion" },
  { id: "scarlet_woman", name: "红唇女郎", type: "minion" },
  { id: "imp", name: "小恶魔", type: "demon" },
  { id: "legion", name: "军团", type: "demon" },
];

describe("告密者 × 提线木偶相克", () => {
  it("有 marionette 时：跳过 marionette，且给恶魔额外 3 个不在场角色", async () => {
    const seats: Seat[] = [
      makeSeat(0, "snitch", "outsider"), // 告密者
      makeSeat(1, "marionette", "minion"), // 提线木偶
      makeSeat(2, "poisoner", "minion"),
      makeSeat(3, "imp", "demon"),
      // 4 镇民在场
      makeSeat(4, "washerwoman", "townsfolk"),
      makeSeat(5, "librarian", "townsfolk"),
      makeSeat(6, "chef", "townsfolk"),
      makeSeat(7, "empath", "townsfolk"),
    ];
    const ctx: any = {
      actionNode: { seatId: 0, roleId: "snitch" },
      snapshot: {
        seats,
        gamePhase: "firstNight",
        nightCount: 1,
        scriptRoles: SCRIPT_ROLES,
      },
      meta: {},
      storytellerInput: { marionetteSeatId: 1 }, // marionette 在 1 号
    };
    const res = await runFullAbilityPipeline(pipe(snitchAbility), ctx);
    const r = res.meta.abilityResult as any;

    expect(r.marionetteSkipped).toBe(true);
    // 爪牙推送列表应排除 marionette（1 号）
    expect(r.minionSeatIds).not.toContain(1);
    expect(r.minionSeatIds).toContain(2); // poisoner 仍在
    // 给恶魔额外 3 个不在场角色（与原 absentRoles 不同）
    expect(Array.isArray(r.demonExtraAbsentRoles)).toBe(true);
    expect(r.demonExtraAbsentRoles.length).toBe(3);
    // 额外角色与原 picked 不重叠
    for (const r2 of r.demonExtraAbsentRoles) {
      expect(r.absentRoles).not.toContain(r2);
    }
  });

  it("无 marionette 时：不触发额外推送", async () => {
    const seats: Seat[] = [
      makeSeat(0, "snitch", "outsider"),
      makeSeat(1, "poisoner", "minion"),
      makeSeat(2, "imp", "demon"),
    ];
    const ctx: any = {
      actionNode: { seatId: 0, roleId: "snitch" },
      snapshot: {
        seats,
        gamePhase: "firstNight",
        nightCount: 1,
        scriptRoles: SCRIPT_ROLES,
      },
      meta: {},
      storytellerInput: {}, // 无 marionetteSeatId
    };
    const res = await runFullAbilityPipeline(pipe(snitchAbility), ctx);
    const r = res.meta.abilityResult as any;

    expect(r.marionetteSkipped).toBe(false);
    expect(r.demonExtraAbsentRoles).toEqual([]); // 无额外推送
    // 爪牙推送正常
    expect(r.minionSeatIds).toContain(1);
  });
});

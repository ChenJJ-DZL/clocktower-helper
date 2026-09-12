/**
 * 提线木偶 ×「会泄漏其爪牙身份」的六个来源（官方相克注记）
 *
 * 官方依据（钟楼百科·提线木偶·角色简介）：
 *   「提线木偶不会因其他角色能力导致他确认自己是爪牙而被唤醒。
 *     例如：告密者、传教士、小怪宝、罂粟种植者、帽匠、落难少女等。」
 * 相克原文（src/data/jinxes.json）：
 *   - 提线木偶 × 落难少女：「提线木偶不会得知落难少女在场。」
 *   - 提线木偶 × 罂粟种植者：「罂粟种植者死亡后恶魔会知道谁是提线木偶，但提线木偶什么都不会知道。」
 *   - 提线木偶 × 告密者：见 marionette_minion_info.test.ts
 * 原则：提线木偶全局按"它以为的那个善良角色"处理；凡只有真爪牙才该收到的信息/唤醒，一律排除它。
 */

import { describe, expect, it } from "vitest";
import type { Seat } from "../../../../app/data";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import {
  MARIONETTE_NO_WAKE_NOTE,
  canGuessDamsel,
  isRealMinion,
} from "../../../utils/roleFlags";
import { calculateNightInfoViaNewEngine } from "../../../utils/nightInfoAdapter";
import { hatterAbility } from "../../new_engine/hatter.ability";
import { lil_monstaAbility } from "../../new_engine/lil_monsta.ability";
import { preacherAbility } from "../../new_engine/preacher.ability";

const pipe = (a: any) => ({
  preCheck: a?.preCheck,
  calculate: a?.calculate,
  stateUpdate: a?.stateUpdate,
  postProcess: a?.postProcess,
});

const mkSeat = (
  id: number,
  roleId: string,
  roleName: string,
  roleType: string,
  extra?: Record<string, any>
) =>
  ({
    id,
    playerName: `P${id + 1}`,
    isAlive: true,
    isDead: false,
    role: { id: roleId, name: roleName, type: roleType },
    roleId,
    roleName,
    roleType,
    statusEffects: [],
    statusDetails: [],
    ...(extra || {}),
  }) as any;

const SCRIPT = {
  id: "poppyganda",
  name: "罂粟花开",
  roleIds: [
    "mayor",
    "poppy_grower",
    "poisoner",
    "marionette",
    "imp",
    "snitch",
    "damsel",
    "hatter",
    "preacher",
    "lil_monsta",
    "soldier",
    "chef",
  ],
} as any;

describe("① 传教士 × 提线木偶：不得通知、不得标记", () => {
  it("选中提线木偶 → 不置 preached / 不显示标记，且提示说书人不要告知", async () => {
    const seats = [
      mkSeat(0, "preacher", "传教士", "townsfolk"),
      mkSeat(1, "marionette", "提线木偶", "minion"),
    ];
    const ctx: any = {
      actionNode: { seatId: 0, roleId: "preacher", targetIds: [1] },
      snapshot: { seats, nightCount: 2 },
      meta: {},
      targetIds: [1],
    };
    const res = await runFullAbilityPipeline(pipe(preacherAbility), ctx);
    const target = res.snapshot.seats.find((s: any) => s.id === 1);
    // 提线木偶没有任何真实能力可失去；一旦通知它，等于告诉它"你是爪牙"
    expect(target.preached).toBeFalsy();
    expect((target.statusDetails || []).join()).not.toContain("传教士");
    expect(String((res.meta as any).prompt)).toContain("提线木偶");
    expect(String((res.meta as any).prompt)).toContain("不要唤醒");
  });

  it("回归：选中真爪牙仍然照常失去能力并被告知", async () => {
    const seats = [
      mkSeat(0, "preacher", "传教士", "townsfolk"),
      mkSeat(1, "poisoner", "投毒者", "minion"),
    ];
    const ctx: any = {
      actionNode: { seatId: 0, roleId: "preacher", targetIds: [1] },
      snapshot: { seats, nightCount: 2 },
      meta: {},
      targetIds: [1],
    };
    const res = await runFullAbilityPipeline(pipe(preacherAbility), ctx);
    const target = res.snapshot.seats.find((s: any) => s.id === 1);
    expect(target.preached).toBe(true);
    expect(target.isAbilityDisabled).toBe(true);
  });
});

describe("② 落难少女 × 提线木偶：不得得知、不得被引导猜测", () => {
  it("canGuessDamsel / isRealMinion 判定表", () => {
    expect(isRealMinion(mkSeat(1, "marionette", "提线木偶", "minion"))).toBe(false);
    expect(canGuessDamsel(mkSeat(1, "marionette", "提线木偶", "minion"))).toBe(false);
    expect(canGuessDamsel(mkSeat(2, "poisoner", "投毒者", "minion"))).toBe(true);
    expect(canGuessDamsel(mkSeat(3, "imp", "小恶魔", "demon"))).toBe(false);
    expect(canGuessDamsel(mkSeat(4, "mayor", "镇长", "townsfolk"))).toBe(false);
  });
});

describe("③ 帽匠 / 小怪宝：说书人提示必须显式排除提线木偶", () => {
  it("帽匠死亡提示含排除条款", async () => {
    const seats = [
      mkSeat(0, "hatter", "帽匠", "outsider", { isDead: true }),
      mkSeat(1, "imp", "小恶魔", "demon"),
      mkSeat(2, "marionette", "提线木偶", "minion"),
    ];
    const ctx: any = {
      actionNode: { seatId: 0, roleId: "hatter", targetIds: [] },
      snapshot: { seats, nightCount: 2 },
      meta: {},
      targetIds: [],
    };
    const res = await runFullAbilityPipeline(pipe(hatterAbility), ctx);
    expect(String((res.meta as any).prompt)).toContain(MARIONETTE_NO_WAKE_NOTE);
    expect(hatterAbility.otherNightPriority).not.toBeNull();
  });

  it("小怪宝提示含排除条款", async () => {
    const seats = [
      mkSeat(0, "lil_monsta", "小怪宝", "demon"),
      mkSeat(1, "poisoner", "投毒者", "minion"),
      mkSeat(2, "marionette", "提线木偶", "minion"),
    ];
    const ctx: any = {
      actionNode: { seatId: 0, roleId: "lil_monsta", targetIds: [] },
      snapshot: { seats, nightCount: 2 },
      meta: {},
      targetIds: [],
      storytellerInput: { lilMonstaHolder: 1 },
    };
    const res = await runFullAbilityPipeline(pipe(lil_monstaAbility), ctx);
    expect(String((res.meta as any).prompt)).toContain(MARIONETTE_NO_WAKE_NOTE);
  });
});

describe("④ 罂粟种植者死亡后的邪恶互认：提线木偶什么都不会知道", () => {
  it("爪牙互认提示里带排除条款；恶魔仍被明确告知谁是提线木偶", () => {
    const seats = [
      mkSeat(0, "mayor", "镇长", "townsfolk"),
      mkSeat(1, "poppy_grower", "罂粟种植者", "townsfolk", { isDead: true }),
      mkSeat(2, "poisoner", "投毒者", "minion"),
      mkSeat(3, "marionette", "提线木偶", "minion"),
      mkSeat(4, "imp", "小恶魔", "demon"),
      mkSeat(5, "chef", "厨师", "townsfolk"),
      mkSeat(6, "soldier", "士兵", "townsfolk"),
    ] as unknown as Seat[];

    const minionInfo = calculateNightInfoViaNewEngine(
      SCRIPT,
      seats,
      2,
      "night",
      null,
      2,
      "minion_info"
    );
    expect(String(minionInfo?.guide)).toContain(MARIONETTE_NO_WAKE_NOTE);
    // ⚠️ 爪牙环节的文案里**绝不能**出现提线木偶的座号（否则等于点给同场真爪牙）
    expect(String(minionInfo?.guide)).not.toContain("4号");

    const demonInfo = calculateNightInfoViaNewEngine(
      SCRIPT,
      seats,
      4,
      "night",
      null,
      2,
      "demon_info"
    );
    // 官方：罂粟种植者死亡后恶魔会知道谁是提线木偶
    expect(String(demonInfo?.guide)).toContain("提线木偶: 4号");
    // B1：恶魔互认的 guide 会直接显示在"技能确认页 / 结果页"上（交给玩家点击），
    // 因此那句写给说书人的操作提醒**不得**再留在 guide 里，
    // 改为移到说书人专属字段 storytellerNote（只由 GameConsole 渲染）。
    expect(String(demonInfo?.guide)).not.toContain("请勿让它察觉");
    // 且必须仍然提醒说书人：它不知道自己其实是爪牙
    expect(String((demonInfo as any)?.storytellerNote)).toContain(
      "请勿让它察觉"
    );
    expect(String((demonInfo as any)?.storytellerNote)).toContain(
      "提线木偶: 4号"
    );
  });
});

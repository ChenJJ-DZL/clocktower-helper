import { describe, expect, it } from "vitest";
import type { Role, Seat } from "../../../../app/data";
import { applyLegionRoleSwap } from "../../../utils/legionSetupSwap";
import { marionetteAbility } from "../../new_engine/marionette.ability";

/**
 * 提线木偶（Marionette）专项独立测试
 * 官方 Wiki（罂粟花开 1:1 规格书 21.提线木偶）：
 *   ① 提线木偶会从盲抽袋中抽取到一个镇民或外来者角色，
 *     但他实际上是提线木偶。
 *   ② 提线木偶与恶魔是邻座。
 *   ③ 恶魔会知道哪一名玩家是提线木偶。
 *   ④ 罂粟种植者死亡后，恶魔会知道谁是提线木偶。
 *   ⑤ 告密者相克：提线木偶不会得知三个不在场的角色，
 *     改为由恶魔额外得知三个不在场角色。
 *
 * 提线木偶在 setup 阶段被分配 marionetteMasterSeatId 指向恶魔。
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
    marionetteMasterSeatId: null,
    statusDetails: [],
    ...overrides,
  } as Seat;
}

const SCRIPT_ROLES: Role[] = [
  { id: "librarian", name: "图书管理员", type: "townsfolk" },
  { id: "chef", name: "厨师", type: "townsfolk" },
  { id: "empath", name: "共情者", type: "townsfolk" },
  { id: "poisoner", name: "投毒者", type: "minion" },
  { id: "imp", name: "小恶魔", type: "demon" },
];

describe("提线木偶：onSetup 邻座分配", () => {
  it("⭐ 真实调用生产 onSetup：写入 marionetteMasterSeatId 指向恶魔 + 永久醉酒", () => {
    // ⚠️⚠️ 防假绿关键（2026-09-21 变异检验实测）：
    //   旧版把「找恶魔 → 写 marionetteMasterSeatId」的逻辑**在测试里重抄了一遍**，
    //   等于断言自己的副本 —— 把生产 `onSetup` 整段删掉，测试照样绿（假绿）。
    //   ⇒ 必须 import 生产的 `marionetteAbility.onSetup` 并调用它。
    const seats: Seat[] = [
      makeSeat(0, "washerwoman", "townsfolk"),
      makeSeat(1, "marionette", "minion"),
      makeSeat(2, "imp", "demon"),
    ];
    const onSetup = (marionetteAbility as any).onSetup;
    expect(onSetup, "提线木偶新引擎必须实现 onSetup").toBeTypeOf("function");

    // onSetup 契约：返回 { handled, updates, logs }，updates 是「按座位 id 的增量更新」
    const out: any = onSetup({ seats, selfId: 1 });
    expect(out?.handled, "onSetup 必须返回 handled:true").toBe(true);

    const update = (out?.updates ?? []).find((u: any) => u.id === 1);
    expect(update, "onSetup 必须产出 id=1（提线木偶）的更新项").toBeTruthy();
    expect(
      update?.marionetteMasterSeatId,
      "❌ onSetup 未把提线木偶指向恶魔 —— 提线木偶不知道自己的主人是谁"
    ).toBe(2); // 指向 imp

    // 同链路副作用：开局即永久醉酒（技能不生效，走假信息路径）
    expect(
      update?.isDrunk,
      "❌ 提线木偶未开局即醉酒 —— 会照常获得真实信息（官方要求技能不生效）"
    ).toBe(true);
    const drunkEffect = (update?.statusEffects ?? []).find(
      (e: any) => e.type === "drunk"
    );
    expect(
      drunkEffect,
      "❌ 未写入 type:'drunk' 的 statusEffect —— syncStatusEffectsToSeat 无法翻译为 seat.isDrunk"
    ).toBeTruthy();
    expect(
      drunkEffect?.permanent,
      "提线木偶的醉酒必须是永久醉酒（permanent:true），不能靠夜数过期"
    ).toBe(true);
  });

  it("⭐ 反例：无存活恶魔时不得写入 master（不得造出一个不存在的恶魔 id）", () => {
    const seats: Seat[] = [
      makeSeat(0, "marionette", "minion"),
      makeSeat(1, "imp", "demon", { isDead: true }),
    ];
    const out: any = (marionetteAbility as any).onSetup({ seats, selfId: 0 });
    const update = (out?.updates ?? []).find((u: any) => u.id === 0);
    expect(
      update?.marionetteMasterSeatId,
      "恶魔已死时不得指向它（提线木偶不能盲从一具尸体）"
    ).toBeUndefined();
  });

  it("军团 setup 反转覆盖提线木偶（原爪牙座位转为镇民）", () => {
    const seats: Seat[] = [
      makeSeat(0, "washerwoman", "townsfolk"),
      makeSeat(1, "marionette", "minion"),
      makeSeat(2, "poisoner", "minion"),
      makeSeat(3, "imp", "demon"),
      makeSeat(4, "legion", "demon"),
    ];
    const res = applyLegionRoleSwap({ seats, scriptRoles: SCRIPT_ROLES });
    // 官方规则：军团局反转时，原爪牙座位（含提线木偶）全部转为镇民
    expect(res.seats[1].role?.id).toBe("librarian");
    expect(res.seats[1].role?.type).toBe("townsfolk");
  });
});

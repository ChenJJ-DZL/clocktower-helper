/**
 * 干扰类型角色“默认造成干扰”原则的全链路集成测试
 *
 * 核心原则：该造成干扰的，默认都造成干扰
 * 覆盖角色与机制：
 * 1. 陌客（Recluse）默认注册为邪恶 / 爪牙 / 恶魔
 * 2. 间谍（Spy）默认注册为善良 / 镇民 / 外来者
 * 3. 调查员（Investigator）：陌客默认进入爪牙候选；间谍默认隐藏
 * 4. 洗衣妇（Washerwoman）：间谍默认进入镇民候选
 * 5. 贵族（Noble）：陌客作为邪恶候选；间谍作为善良候选
 * 6. 骑士（Knight）：陌客作为恶魔被排除在非恶魔候选外
 * 7. 神谕者（Oracle）：死亡陌客计为邪恶；死亡间谍计为善良
 * 8. 女裁缝（Seamstress）：陌客判定为邪恶；间谍判定为善良
 */

import { describe, expect, it } from "vitest";
import { getRegistration } from "../../../utils/gameRules";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import { investigatorAbility } from "../../new_engine/investigator.ability";
import { knightAbility } from "../../new_engine/knight.ability";
import { nobleAbility } from "../../new_engine/noble.ability";
import { oracleAbility } from "../../new_engine/oracle.ability";
import { seamstressAbility } from "../../new_engine/seamstress.ability";
import { washerwomanAbility } from "../../new_engine/washerwoman.ability";

describe("干扰类型角色默认设定集成测试（该造成干扰的，默认都造成干扰）", () => {
  it("1. gameRules.getRegistration: 陌客默认邪恶恶魔爪牙，间谍默认善良镇民外来者", () => {
    const recluseSeat: any = {
      id: 0,
      role: { id: "recluse", name: "陌客", type: "outsider" },
      isDead: false,
    };
    const regRecluse = getRegistration(recluseSeat);
    expect(regRecluse.alignment).toBe("Evil");
    expect(regRecluse.registersAsDemon).toBe(true);
    expect(regRecluse.registersAsMinion).toBe(true);

    const spySeat: any = {
      id: 1,
      role: { id: "spy", name: "间谍", type: "minion" },
      isDead: false,
    };
    const regSpy = getRegistration(spySeat);
    expect(regSpy.alignment).toBe("Good");
    expect(regSpy.registersAsTownsfolk).toBe(true);
    expect(regSpy.registersAsOutsider).toBe(true);
  });

  it("2. 调查员（Investigator）：陌客默认进入爪牙候选池（造成干扰）", async () => {
    const seats: any[] = [
      {
        id: 0,
        role: { id: "investigator", name: "调查员", type: "townsfolk" },
        isDead: false,
        isAlive: true,
      },
      {
        id: 1,
        role: { id: "washerwoman", name: "洗衣妇", type: "townsfolk" },
        isDead: false,
        isAlive: true,
      },
      {
        id: 2,
        role: { id: "recluse", name: "陌客", type: "outsider" },
        isDead: false,
        isAlive: true,
      },
      {
        id: 3,
        role: { id: "imp", name: "小恶魔", type: "demon" },
        isDead: false,
        isAlive: true,
      },
    ];

    const ctx = await (runFullAbilityPipeline as any)(investigatorAbility, {
      actionNode: {
        seatId: 0,
        roleId: "investigator",
        abilityId: "investigator_first_night_ability",
      } as any,
      snapshot: { seats, nightCount: 1, gamePhase: "firstNight" } as any,
      meta: { isAbilityActive: true, abilityEffective: true },
    });

    const res = ctx.meta.abilityResult;
    expect(res).toBeDefined();
    expect([res.seat1, res.seat2]).toContain(2);
    expect(res.roleName).toBe("投毒者");
  });

  it("3. 洗衣妇（Washerwoman）：间谍默认注册为镇民候选（造成干扰）", async () => {
    const seats: any[] = [
      {
        id: 0,
        role: { id: "washerwoman", name: "洗衣妇", type: "townsfolk" },
        isDead: false,
        isAlive: true,
      },
      {
        id: 1,
        role: { id: "spy", name: "间谍", type: "minion" },
        isDead: false,
        isAlive: true,
      },
      {
        id: 2,
        role: { id: "imp", name: "小恶魔", type: "demon" },
        isDead: false,
        isAlive: true,
      },
    ];

    const ctx = await (runFullAbilityPipeline as any)(washerwomanAbility, {
      actionNode: {
        seatId: 0,
        roleId: "washerwoman",
        abilityId: "washerwoman_first_night_ability",
      } as any,
      snapshot: { seats, nightCount: 1, gamePhase: "firstNight" } as any,
      meta: { isAbilityActive: true, abilityEffective: true },
    });

    const res = ctx.meta.abilityResult;
    expect(res).toBeDefined();
    expect([res.seat1, res.seat2]).toContain(1);
    expect(res.roleName).toBe("僧侣");
  });

  it("4. 贵族（Noble）：陌客作为邪恶候选被探测，间谍作为善良候选被探测", async () => {
    const seats: any[] = [
      {
        id: 0,
        role: { id: "noble", name: "贵族", type: "townsfolk" },
        isDead: false,
        isAlive: true,
      },
      {
        id: 1,
        role: { id: "recluse", name: "陌客", type: "outsider" },
        isDead: false,
        isAlive: true,
      },
      {
        id: 2,
        role: { id: "spy", name: "间谍", type: "minion" },
        isDead: false,
        isAlive: true,
      },
      {
        id: 3,
        role: { id: "monk", name: "僧侣", type: "townsfolk" },
        isDead: false,
        isAlive: true,
      },
    ];

    const ctx = await (runFullAbilityPipeline as any)(nobleAbility, {
      actionNode: {
        seatId: 0,
        roleId: "noble",
        abilityId: "noble_first_night_ability",
      } as any,
      snapshot: { seats, nightCount: 1, gamePhase: "firstNight" } as any,
      meta: { isAbilityActive: true },
    });

    const res = ctx.meta.abilityResult;
    expect(res).toBeDefined();
    const learnedSeats = [res.seat1, res.seat2, res.seat3];
    expect(learnedSeats).toContain(1);
    expect(learnedSeats).toContain(2);
    expect(learnedSeats).toContain(3);
  });

  it("5. 骑士（Knight）：陌客默认注册为恶魔，被排除在非恶魔候选外", async () => {
    const seats: any[] = [
      {
        id: 0,
        role: { id: "knight", name: "骑士", type: "townsfolk" },
        isDead: false,
        isAlive: true,
      },
      {
        id: 1,
        role: { id: "recluse", name: "陌客", type: "outsider" },
        isDead: false,
        isAlive: true,
      },
      {
        id: 2,
        role: { id: "monk", name: "僧侣", type: "townsfolk" },
        isDead: false,
        isAlive: true,
      },
      {
        id: 3,
        role: { id: "empath", name: "共情者", type: "townsfolk" },
        isDead: false,
        isAlive: true,
      },
    ];

    const ctx = await (runFullAbilityPipeline as any)(knightAbility, {
      actionNode: {
        seatId: 0,
        roleId: "knight",
        abilityId: "knight_first_night_ability",
      } as any,
      snapshot: { seats, nightCount: 1, gamePhase: "firstNight" } as any,
      meta: { isAbilityActive: true },
    });

    const res = ctx.meta.abilityResult;
    expect(res).toBeDefined();
    const learnedSeats = [res.seat1, res.seat2];
    expect(learnedSeats).not.toContain(1);
    expect(learnedSeats).toContain(2);
    expect(learnedSeats).toContain(3);
  });

  it("6. 神谕者（Oracle）：死亡陌客默认计入邪恶死亡数，死亡间谍默认不计入", async () => {
    const seats: any[] = [
      {
        id: 0,
        role: { id: "oracle", name: "神谕者", type: "townsfolk" },
        isDead: false,
        isAlive: true,
      },
      {
        id: 1,
        role: { id: "recluse", name: "陌客", type: "outsider" },
        isDead: true,
        isAlive: false,
      },
      {
        id: 2,
        role: { id: "spy", name: "间谍", type: "minion" },
        isDead: true,
        isAlive: false,
      },
      {
        id: 3,
        role: { id: "monk", name: "僧侣", type: "townsfolk" },
        isDead: true,
        isAlive: false,
      },
    ];

    const ctx = await (runFullAbilityPipeline as any)(oracleAbility, {
      actionNode: {
        seatId: 0,
        roleId: "oracle",
        abilityId: "oracle_nightly_ability",
      } as any,
      snapshot: { seats, nightCount: 2, gamePhase: "night" } as any,
      meta: { isAbilityActive: true },
    });

    const res = ctx.meta.abilityResult;
    expect(res.deadEvilCount).toBe(1);
    expect(res.finalCount).toBe(1);
  });

  it("7. 女裁缝（Seamstress）：陌客默认判定为邪恶，间谍默认判定为善良", async () => {
    const seats: any[] = [
      {
        id: 0,
        role: { id: "seamstress", name: "女裁缝", type: "townsfolk" },
        isDead: false,
        isAlive: true,
      },
      {
        id: 1,
        role: { id: "recluse", name: "陌客", type: "outsider" },
        isDead: false,
        isAlive: true,
      },
      {
        id: 2,
        role: { id: "spy", name: "间谍", type: "minion" },
        isDead: false,
        isAlive: true,
      },
      {
        id: 3,
        role: { id: "imp", name: "小恶魔", type: "demon" },
        isDead: false,
        isAlive: true,
      },
    ];

    const ctx1 = await (runFullAbilityPipeline as any)(seamstressAbility, {
      actionNode: {
        seatId: 0,
        roleId: "seamstress",
        abilityId: "seamstress_once_ability",
      } as any,
      targetIds: [1, 3],
      snapshot: { seats, nightCount: 1, gamePhase: "firstNight" } as any,
      meta: { isAbilityActive: true },
    });
    expect(ctx1.meta.abilityResult.actualSameAlignment).toBe(true);

    const ctx2 = await (runFullAbilityPipeline as any)(seamstressAbility, {
      actionNode: {
        seatId: 0,
        roleId: "seamstress",
        abilityId: "seamstress_once_ability",
      } as any,
      targetIds: [1, 2],
      snapshot: { seats, nightCount: 1, gamePhase: "firstNight" } as any,
      meta: { isAbilityActive: true },
    });
    expect(ctx2.meta.abilityResult.actualSameAlignment).toBe(false);
  });
});

/**
 * 12个角色交互规则全面整改验证测试集
 */

import { describe, expect, it } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import { wraithAbility } from "../../new_engine/wraith.ability";
import { cultLeaderAbility } from "../../new_engine/cult_leader.ability";
import { toymakerAbility } from "../../new_engine/toymaker.ability";
import { beggarAbility } from "../../new_engine/beggar.ability";
import { buddhistAbility } from "../../new_engine/buddhist.ability";
import { astronomerAbility } from "../../new_engine/astronomer.ability";
import { preacherAbility } from "../../new_engine/preacher.ability";
import { ogreAbility } from "../../new_engine/ogre.ability";
import { night_watchmanAbility } from "../../new_engine/night_watchman.ability";
import { ojoAbility } from "../../new_engine/ojo.ability";
import { impAbility } from "../../new_engine/imp.ability";
import { golemAbility } from "../../new_engine/golem.ability";
import { psychopathAbility } from "../../new_engine/psychopath.ability";
import { resolveMayorDemonKill } from "../../../utils/soldierImmunity";

const pipe = (a: any) => ({
  preCheck: a?.preCheck,
  calculate: a?.calculate,
  stateUpdate: a?.stateUpdate,
  postProcess: a?.postProcess,
});

function mkSeat(id: number, roleId: string, roleName: string, roleType: string, extra?: Record<string, any>) {
  return {
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
    ...extra,
  };
}

describe("12角色交互与规则整改专项测试", () => {
  // 1. 亡魂
  it("1. 亡魂 (Wraith): targetConfig 为 min: 0, max: 0", () => {
    expect(wraithAbility.targetConfig?.min).toBe(0);
    expect(wraithAbility.targetConfig?.max).toBe(0);
  });

  // 2. 异教领袖
  it("2. 异教领袖 (Cult Leader): targetConfig 为 min: 0, max: 0，且根据存活邻居邪恶情况告知结果", async () => {
    expect(cultLeaderAbility.targetConfig?.min).toBe(0);
    expect(cultLeaderAbility.targetConfig?.max).toBe(0);

    // 0号异教领袖，1号善良，2号邪恶爪牙 -> 存活邻居刚好1邪恶 -> 告知“是”
    const seats = [
      mkSeat(0, "cult_leader", "异教领袖", "townsfolk"),
      mkSeat(1, "washerwoman", "洗衣妇", "townsfolk"),
      mkSeat(2, "poisoner", "投毒者", "minion", { isEvilConverted: true }),
    ];

    const ctx: any = {
      actionNode: { seatId: 0, roleId: "cult_leader", targetIds: [] },
      snapshot: { seats, nightCount: 1 },
      meta: {},
      targetIds: [],
    };

    const res = await runFullAbilityPipeline(pipe(cultLeaderAbility), ctx);
    const r = res.meta.abilityResult as any;
    expect(r.answer).toBe(true);
    expect(r.evilNeighborCount).toBe(1);
  });

  // 3. 玩具匠
  it("3. 玩具匠 (Toymaker): targetConfig 为 min: 0, max: 0，纯被动", () => {
    expect(toymakerAbility.targetConfig?.min).toBe(0);
    expect(toymakerAbility.targetConfig?.max).toBe(0);
  });

  // 4. 乞丐
  it("4. 乞丐 (Beggar): 白天技能，选择一个座位并标记 beggarTargetId", async () => {
    const seats = [
      mkSeat(0, "beggar", "乞丐", "traveler"),
      mkSeat(1, "washerwoman", "洗衣妇", "townsfolk"),
    ];
    const ctx: any = {
      actionNode: { seatId: 0, roleId: "beggar", targetIds: [1] },
      snapshot: { seats },
      meta: {},
      targetIds: [1],
    };
    const res = await runFullAbilityPipeline(pipe(beggarAbility), ctx);
    const beggarSeat = res.snapshot.seats.find((s: any) => s.id === 0);
    expect(beggarSeat.beggarTargetId).toBe(1);
  });

  // 5. 佛教徒与天文学家
  it("5. 佛教徒 & 天文学家: 均为 min: 0, max: 0", () => {
    expect(buddhistAbility.targetConfig?.min).toBe(0);
    expect(buddhistAbility.targetConfig?.max).toBe(0);
    expect(astronomerAbility.targetConfig?.min).toBe(0);
    expect(astronomerAbility.targetConfig?.max).toBe(0);
  });

  // 6. 传教士
  it("6. 传教士 (Preacher): 主动选人 (min: 1, max: 1)，选中爪牙使其失去能力", async () => {
    expect(preacherAbility.targetConfig?.min).toBe(1);
    expect(preacherAbility.targetConfig?.max).toBe(1);

    const seats = [
      mkSeat(0, "preacher", "传教士", "townsfolk"),
      mkSeat(1, "poisoner", "投毒者", "minion"),
    ];
    const ctx: any = {
      actionNode: { seatId: 0, roleId: "preacher", targetIds: [1] },
      snapshot: { seats, nightCount: 1 },
      meta: {},
      targetIds: [1],
    };
    const res = await runFullAbilityPipeline(pipe(preacherAbility), ctx);
    const minionSeat = res.snapshot.seats.find((s: any) => s.id === 1);
    expect(minionSeat.preached).toBe(true);
    expect(minionSeat.isAbilityDisabled).toBe(true);
  });

  // 7. 食人魔
  it("7. 食人魔 (Ogre): 主动选人 (min: 1, max: 1)，目标为邪恶时食人魔变为邪恶", async () => {
    expect(ogreAbility.targetConfig?.min).toBe(1);
    expect(ogreAbility.targetConfig?.max).toBe(1);
    expect(ogreAbility.targetConfig?.allowSelf).toBe(false);

    const seats = [
      mkSeat(0, "ogre", "食人魔", "outsider"),
      mkSeat(1, "imp", "小恶魔", "demon"),
    ];
    const ctx: any = {
      actionNode: { seatId: 0, roleId: "ogre", targetIds: [1] },
      snapshot: { seats, nightCount: 1 },
      meta: {},
      targetIds: [1],
    };
    const res = await runFullAbilityPipeline(pipe(ogreAbility), ctx);
    const ogreSeat = res.snapshot.seats.find((s: any) => s.id === 0);
    expect(ogreSeat.ogreFriendId).toBe(1);
    expect(ogreSeat.isEvilConverted).toBe(true);
  });

  // 8. 守夜人
  it("8. 守夜人 (Night Watchman): 选一名玩家，目标玩家得知谁是守夜人", async () => {
    expect(night_watchmanAbility.targetConfig?.min).toBe(1);
    expect(night_watchmanAbility.targetConfig?.max).toBe(1);

    const seats = [
      mkSeat(0, "night_watchman", "守夜人", "townsfolk"),
      mkSeat(1, "chef", "厨师", "townsfolk"),
    ];
    const ctx: any = {
      actionNode: { seatId: 0, roleId: "night_watchman", targetIds: [1] },
      snapshot: { seats, nightCount: 1 },
      meta: {},
      targetIds: [1],
    };
    const res = await runFullAbilityPipeline(pipe(night_watchmanAbility), ctx);
    const chefSeat = res.snapshot.seats.find((s: any) => s.id === 1);
    expect(chefSeat.statusDetails).toContain("得知守夜人:1号");
  });

  // 9. 奥赫 (Ojo)
  it("9. 奥赫 (Ojo): 按指定角色名击杀，在场则击杀该玩家", async () => {
    const seats = [
      mkSeat(0, "ojo", "奥乔", "demon"),
      mkSeat(1, "empath", "共情者", "townsfolk"),
    ];
    const ctx: any = {
      actionNode: { seatId: 0, roleId: "ojo", targetIds: [] },
      snapshot: { seats, nightCount: 2 },
      meta: {},
      targetIds: [],
      storytellerInput: { targetRoleId: "empath" },
    };
    const res = await runFullAbilityPipeline(pipe(ojoAbility), ctx);
    const targetSeat = res.snapshot.seats.find((s: any) => s.id === 1);
    expect(targetSeat.isDead).toBe(true);
    expect(targetSeat.deathSource).toBe("ojo");
  });

  // 10. 镇长 (Mayor) 替死
  it("10. 镇长 (Mayor): resolveMayorDemonKill 支持手动指定替死或镇长自身死亡", () => {
    const seats = [
      mkSeat(0, "imp", "小恶魔", "demon"),
      mkSeat(1, "mayor", "镇长", "townsfolk"),
      mkSeat(2, "chef", "厨师", "townsfolk"),
      mkSeat(3, "butler", "管家", "outsider"),
    ];
    const mayorSeat = seats[1];

    // 指定 2号 (厨师) 替死
    const resSub = resolveMayorDemonKill(seats, mayorSeat, 4, undefined, 2);
    expect(resSub.isMayor).toBe(true);
    expect(resSub.substituted).toBe(true);
    expect(resSub.substituteSeat?.id).toBe(2);

    // 指定镇长自己死亡
    const resSelf = resolveMayorDemonKill(seats, mayorSeat, 4, undefined, 1);
    expect(resSelf.isMayor).toBe(true);
    expect(resSelf.substituted).toBe(false);
    expect(resSelf.substituteSeat).toBeNull();
  });

  // 11. 小恶魔攻击镇长与替死联动
  it("11. 小恶魔攻击镇长时，通过 storytellerInput.mayorSubstituteId 指定替死目标", async () => {
    const seats = [
      mkSeat(0, "imp", "小恶魔", "demon"),
      mkSeat(1, "mayor", "镇长", "townsfolk"),
      mkSeat(2, "chef", "厨师", "townsfolk"),
      mkSeat(3, "butler", "管家", "outsider"),
    ];
    const ctx: any = {
      actionNode: { seatId: 0, roleId: "imp", targetIds: [1] },
      snapshot: { seats, nightCount: 2 },
      meta: {},
      targetIds: [1],
      storytellerInput: { mayorSubstituteId: 2 },
    };
    const res = await runFullAbilityPipeline(pipe(impAbility), ctx);
    const mayor = res.snapshot.seats.find((s: any) => s.id === 1);
    const chef = res.snapshot.seats.find((s: any) => s.id === 2);

    // 镇长存活，厨师被标记死亡
    expect(mayor.markedForDeath).toBeFalsy();
    expect(chef.markedForDeath).toBe(true);
    expect(chef.deathSource).toBe("mayor_substitute");
  });

  // 12. 魔像 (Golem)
  it("12. 魔像 (Golem): 提名非恶魔直接处决致死，提名恶魔未产生击杀", async () => {
    // 提名非恶魔
    const seats1 = [
      mkSeat(0, "golem", "魔像", "outsider"),
      mkSeat(1, "washerwoman", "洗衣妇", "townsfolk"),
    ];
    const ctx1: any = {
      actionNode: { seatId: 0, roleId: "golem", targetIds: [1] },
      snapshot: { seats: seats1 },
      meta: {},
      targetIds: [1],
    };
    const res1 = await runFullAbilityPipeline(pipe(golemAbility), ctx1);
    const target1 = res1.snapshot.seats.find((s: any) => s.id === 1);
    expect(target1.isDead).toBe(true);
    expect(target1.deathSource).toBe("golem_nominate");

    // 提名恶魔
    const seats2 = [
      mkSeat(0, "golem", "魔像", "outsider"),
      mkSeat(1, "imp", "小恶魔", "demon"),
    ];
    const ctx2: any = {
      actionNode: { seatId: 0, roleId: "golem", targetIds: [1] },
      snapshot: { seats: seats2 },
      meta: {},
      targetIds: [1],
    };
    const res2 = await runFullAbilityPipeline(pipe(golemAbility), ctx2);
    const target2 = res2.snapshot.seats.find((s: any) => s.id === 1);
    expect(target2.isDead).toBe(false);
  });

  // 13. 精神病患者 (Psychopath)
  it("13. 精神病患者 (Psychopath): 白天公开击杀一名玩家", async () => {
    const seats = [
      mkSeat(0, "psychopath", "精神病患者", "minion"),
      mkSeat(1, "chef", "厨师", "townsfolk"),
    ];
    const ctx: any = {
      actionNode: { seatId: 0, roleId: "psychopath", targetIds: [1] },
      snapshot: { seats },
      meta: {},
      targetIds: [1],
    };
    const res = await runFullAbilityPipeline(pipe(psychopathAbility), ctx);
    const chef = res.snapshot.seats.find((s: any) => s.id === 1);
    expect(chef.isDead).toBe(true);
    expect(chef.deathSource).toBe("psychopath_kill");
  });
});

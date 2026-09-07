import { describe, expect, it } from "vitest";
import type { Seat } from "../../../../app/data";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import {
  balloonistAbility,
  choirBoyAbility,
  farmerAbility,
  plagueDoctorAbility,
  politicianAbility,
  scapegoatAbility,
} from "../../new_engine/abilityRegistry";
import {
  canScapegoatSubstitute,
  checkChoirboyTrigger,
  evaluatePoliticianEndgame,
  getEligibleFarmerSuccessors,
  getValidBalloonistTargets,
} from "../../../utils/expansionMechanics";

const pipe = (a: any) => ({
  preCheck: a?.preCheck,
  calculate: a?.calculate,
  stateUpdate: a?.stateUpdate,
  postProcess: a?.postProcess,
});

describe("《扩展与进阶角色》官方百科范例逐条验证 (Expansion Roles Examples)", () => {
  // =========================================================================
  // 1. 气球驾驶员 (Balloonist) - 2 条官方范例
  // =========================================================================
  describe("气球驾驶员 (Balloonist)", () => {
    it("范例 1: 小艾是维齐尔(爪牙)，小莱是女祭司(镇民)，小美是政客(外来者)。首个夜晚，气球驾驶员得知了小艾。第二个夜晚，气球驾驶员得知了小莱。第三个夜晚，气球驾驶员得知了小美。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "balloonist", name: "气球驾驶员", type: "townsfolk" } as any, isAlive: true, isDead: false },
        { id: 1, role: { id: "vizier", name: "维齐尔", type: "minion" } as any, isAlive: true, isDead: false },
        { id: 2, role: { id: "priestess", name: "女祭司", type: "townsfolk" } as any, isAlive: true, isDead: false },
        { id: 3, role: { id: "politician", name: "政客", type: "outsider" } as any, isAlive: true, isDead: false },
      ] as any;

      // 首个夜晚：得知小艾 (1号, minion)
      const ctxNight1: any = {
        snapshot: { nightCount: 1, seats } as any,
        actionNode: { seatId: 0, roleId: "balloonist", roleName: "气球驾驶员" } as any,
        storytellerInput: { selectedSeatId: 1 },
        meta: { abilityEffective: true },
      };
      const r1 = await runFullAbilityPipeline(pipe(balloonistAbility), ctxNight1);
      expect(r1.meta.abilityResult.targetId).toBe(1);
      expect(r1.meta.abilityResult.targetRoleType).toBe("minion");
      expect(r1.snapshot._abilityResults.balloonist.roleType).toBe("minion");

      // 第二个夜晚：得知小莱 (2号, townsfolk - 与上夜 minion 不同)
      const ctxNight2: any = {
        snapshot: { nightCount: 2, seats, _abilityResults: r1.snapshot._abilityResults } as any,
        actionNode: { seatId: 0, roleId: "balloonist", roleName: "气球驾驶员" } as any,
        storytellerInput: { selectedSeatId: 2 },
        meta: { abilityEffective: true },
      };
      const r2 = await runFullAbilityPipeline(pipe(balloonistAbility), ctxNight2);
      expect(r2.meta.abilityResult.targetId).toBe(2);
      expect(r2.meta.abilityResult.targetRoleType).toBe("townsfolk");
      expect(r2.snapshot._abilityResults.balloonist.roleType).toBe("townsfolk");

      // 第三个夜晚：得知小美 (3号, outsider - 与上夜 townsfolk 不同)
      const ctxNight3: any = {
        snapshot: { nightCount: 3, seats, _abilityResults: r2.snapshot._abilityResults } as any,
        actionNode: { seatId: 0, roleId: "balloonist", roleName: "气球驾驶员" } as any,
        storytellerInput: { selectedSeatId: 3 },
        meta: { abilityEffective: true },
      };
      const r3 = await runFullAbilityPipeline(pipe(balloonistAbility), ctxNight3);
      expect(r3.meta.abilityResult.targetId).toBe(3);
      expect(r3.meta.abilityResult.targetRoleType).toBe("outsider");
      expect(r3.snapshot._abilityResults.balloonist.roleType).toBe("outsider");
    });

    it("范例 2: 小朱是守夜人，小艾是士兵，小兰是解谜大师。首夜得知小朱(镇民)。第二夜气球驾驶员中毒，说书人让他得知了另一个镇民小艾。第三夜气球驾驶员清醒，得知与小艾不同类型的小兰(外来者)。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "balloonist", name: "气球驾驶员", type: "townsfolk" } as any, isAlive: true, isDead: false },
        { id: 1, role: { id: "night_watchman", name: "守夜人", type: "townsfolk" } as any, isAlive: true, isDead: false },
        { id: 2, role: { id: "soldier", name: "士兵", type: "townsfolk" } as any, isAlive: true, isDead: false },
        { id: 3, role: { id: "puzzlemaster", name: "解谜大师", type: "outsider" } as any, isAlive: true, isDead: false },
      ] as any;

      // 首夜得知小朱 (1号, townsfolk)
      const ctx1: any = {
        snapshot: { nightCount: 1, seats } as any,
        actionNode: { seatId: 0, roleId: "balloonist" } as any,
        storytellerInput: { selectedSeatId: 1 },
        meta: { abilityEffective: true },
      };
      const r1 = await runFullAbilityPipeline(pipe(balloonistAbility), ctx1);
      expect(r1.meta.abilityResult.targetId).toBe(1);

      // 第二夜中毒，得知另一个镇民小艾 (2号, townsfolk)
      const ctx2: any = {
        snapshot: { nightCount: 2, seats, _abilityResults: r1.snapshot._abilityResults } as any,
        actionNode: { seatId: 0, roleId: "balloonist" } as any,
        storytellerInput: { selectedSeatId: 2 },
        meta: { abilityEffective: false, isPoisoned: true },
      };
      const r2 = await runFullAbilityPipeline(pipe(balloonistAbility), ctx2);
      expect(r2.meta.abilityResult.targetId).toBe(2);
      expect(r2.meta.isCorrupted).toBe(true);

      // 第三夜恢复清醒，得知小兰 (3号, outsider)
      const ctx3: any = {
        snapshot: { nightCount: 3, seats, _abilityResults: r2.snapshot._abilityResults } as any,
        actionNode: { seatId: 0, roleId: "balloonist" } as any,
        storytellerInput: { selectedSeatId: 3 },
        meta: { abilityEffective: true },
      };
      const r3 = await runFullAbilityPipeline(pipe(balloonistAbility), ctx3);
      expect(r3.meta.abilityResult.targetId).toBe(3);
      expect(r3.meta.abilityResult.targetRoleType).toBe("outsider");
      expect(r3.meta.isCorrupted).toBe(false);
    });
  });

  // =========================================================================
  // 2. 唱诗男孩 (Choirboy) - 2 条官方范例
  // =========================================================================
  describe("唱诗男孩 (Choirboy)", () => {
    it("范例 1: 小恶魔攻击共情者死亡；次夜小恶魔攻击被僧侣保护的国王未死亡；第三夜小恶魔攻击国王死亡。唱诗男孩被唤醒，得知小恶魔身份。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "choir_boy", name: "唱诗男孩", type: "townsfolk" } as any, isAlive: true, isDead: false },
        { id: 1, role: { id: "king", name: "国王", type: "townsfolk" } as any, isAlive: false, isDead: true },
        { id: 2, role: { id: "imp", name: "小恶魔", type: "demon" } as any, isAlive: true, isDead: false },
        { id: 3, role: { id: "monk", name: "僧侣", type: "townsfolk" } as any, isAlive: true, isDead: false },
      ] as any;

      // 验证机制纯函数
      const triggerCheck = checkChoirboyTrigger(seats, [1], 2);
      expect(triggerCheck.triggered).toBe(true);
      expect(triggerCheck.demonSeatId).toBe(2);

      // 管道执行
      const ctx: any = {
        snapshot: {
          nightCount: 3,
          seats,
          isKingKilledByDemon: true,
        } as any,
        actionNode: { seatId: 0, roleId: "choir_boy", isKingKilledByDemon: true } as any,
        meta: { abilityEffective: true },
      };
      const r = await runFullAbilityPipeline(pipe(choirBoyAbility), ctx);
      expect(r.meta.abilityResult.demonFound).toBe(true);
      expect(r.meta.abilityResult.demonSeatId).toBe(2);
      expect(r.meta.isCorrupted).toBe(false);
    });

    it("范例 2: 沙巴洛斯杀死了国王。醉酒的唱诗男孩被唤醒，得知了角色为食人族的玩家是恶魔（错误信息）。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "choir_boy", name: "唱诗男孩", type: "townsfolk" } as any, isAlive: true, isDead: false, isDrunk: true },
        { id: 1, role: { id: "king", name: "国王", type: "townsfolk" } as any, isAlive: false, isDead: true },
        { id: 2, role: { id: "shabaloth", name: "沙巴洛斯", type: "demon" } as any, isAlive: true, isDead: false },
        { id: 3, role: { id: "cannibal", name: "食人族", type: "townsfolk" } as any, isAlive: true, isDead: false },
      ] as any;

      const ctx: any = {
        snapshot: {
          nightCount: 2,
          seats,
          isKingKilledByDemon: true,
        } as any,
        actionNode: { seatId: 0, roleId: "choir_boy", isKingKilledByDemon: true } as any,
        storytellerInput: { selectedSeatId: 3 }, // 假装 3号食人族是恶魔
        meta: { abilityEffective: false, isDrunk: true },
      };
      const r = await runFullAbilityPipeline(pipe(choirBoyAbility), ctx);
      expect(r.meta.abilityResult.demonSeatId).toBe(3);
      expect(r.meta.isCorrupted).toBe(true);
    });
  });

  // =========================================================================
  // 3. 农夫 (Farmer) - 3 条官方范例
  // =========================================================================
  describe("农夫 (Farmer)", () => {
    it("范例 1: 小佳是农夫，恶魔在夜晚杀死他。小文是恐惧之灵(邪恶爪牙)，小美是炼金术士(善良镇民)。小美在当晚变成了农夫，小文无法变成农夫因为他是邪恶玩家。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "farmer", name: "农夫", type: "townsfolk" } as any, isAlive: false, isDead: true },
        { id: 1, role: { id: "fearmonger", name: "恐惧之灵", type: "minion" } as any, isAlive: true, isDead: false },
        { id: 2, role: { id: "alchemist", name: "炼金术士", type: "townsfolk" } as any, isAlive: true, isDead: false },
      ] as any;

      // 检查合格继承者只有小美 (2号)
      const eligible = getEligibleFarmerSuccessors(seats, 0);
      expect(eligible.map((s) => s.id)).toEqual([2]);

      const ctx: any = {
        snapshot: {
          nightCount: 2,
          gamePhase: "night",
          seats,
          deadThisNight: [0],
        } as any,
        actionNode: { seatId: 0, roleId: "farmer", diedAtNight: true } as any,
        storytellerInput: { newFarmerSeatId: 2 },
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(farmerAbility), ctx);
      expect(r.meta.abilityResult.newFarmerId).toBe(2);
      expect(r.snapshot.seats[2].role.id).toBe("farmer");
      expect(r.snapshot.seats[2].statusDetails).toContain("成为新农夫");
    });

    it("范例 2: 在第二个夜晚，农夫死亡，小精灵变成了农夫。在第三个夜晚，新的农夫死亡，善良的异端分子变成了农夫。场上有三名农夫，其中两名已死亡。", async () => {
      let seats: Seat[] = [
        { id: 0, role: { id: "farmer", name: "农夫", type: "townsfolk" } as any, isAlive: false, isDead: true },
        { id: 1, role: { id: "pixie", name: "小精灵", type: "townsfolk" } as any, isAlive: true, isDead: false },
        { id: 2, role: { id: "heretic", name: "异端分子", type: "outsider" } as any, isAlive: true, isDead: false },
      ] as any;

      // 第二夜传承给小精灵 (1号)
      const ctxNight2: any = {
        snapshot: { nightCount: 2, gamePhase: "night", seats, deadThisNight: [0] } as any,
        actionNode: { seatId: 0, roleId: "farmer", diedAtNight: true } as any,
        storytellerInput: { newFarmerSeatId: 1 },
        meta: {},
      };
      const r2 = await runFullAbilityPipeline(pipe(farmerAbility), ctxNight2);
      seats = r2.snapshot.seats;
      expect(seats[1].role?.id).toBe("farmer");

      // 第三夜小精灵农夫死亡，传承给异端分子 (2号)
      seats[1].isDead = true;
      const ctxNight3: any = {
        snapshot: { nightCount: 3, gamePhase: "night", seats, deadThisNight: [1] } as any,
        actionNode: { seatId: 1, roleId: "farmer", diedAtNight: true } as any,
        storytellerInput: { newFarmerSeatId: 2 },
        meta: {},
      };
      const r3 = await runFullAbilityPipeline(pipe(farmerAbility), ctxNight3);
      seats = r3.snapshot.seats;
      expect(seats[2].role?.id).toBe("farmer");

      // 统计农夫数量：3名（0号死农夫，1号死农夫，2号活农夫）
      const farmerCount = seats.filter((s) => s.role?.id === "farmer").length;
      expect(farmerCount).toBe(3);
    });

    it("范例 3: 农夫在夜晚死亡。间谍被当作了善良阵营，并因此变成了农夫，但实际上他仍然保持为邪恶阵营不变。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "farmer", name: "农夫", type: "townsfolk" } as any, isAlive: false, isDead: true },
        { id: 1, role: { id: "spy", name: "间谍", type: "minion" } as any, isAlive: true, isDead: false, registerAsGood: true },
        { id: 2, role: { id: "slayer", name: "杀手", type: "townsfolk" } as any, isAlive: true, isDead: false },
      ] as any;

      const eligible = getEligibleFarmerSuccessors(seats, 0);
      expect(eligible.some((s) => s.id === 1)).toBe(true);

      const ctx: any = {
        snapshot: {
          nightCount: 2,
          gamePhase: "night",
          seats,
          deadThisNight: [0],
        } as any,
        actionNode: { seatId: 0, roleId: "farmer", diedAtNight: true } as any,
        storytellerInput: { newFarmerSeatId: 1 },
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(farmerAbility), ctx);
      expect(r.snapshot.seats[1].role.id).toBe("farmer");
      // 间谍角色变为农夫（townsfolk），但实际阵营保持为邪恶
      expect(r.snapshot.seats[1].role.type).toBe("townsfolk");
      expect(r.snapshot.seats[1].isEvilConverted).toBe(true);
    });
  });

  // =========================================================================
  // 4. 政客 (Politician) - 4 条官方范例
  // =========================================================================
  describe("政客 (Politician)", () => {
    it("范例 1: 3名玩家存活时，政客说服大家不要处决(有人假冒镇长)。当天无处决，邪恶获胜。政客负最大责任，一同获胜。", async () => {
      const politicianSeat: Seat = {
        id: 0,
        role: { id: "politician", name: "政客", type: "outsider" } as any,
        isAlive: true,
        isDead: false,
        isDrunk: false,
        isPoisoned: false,
      } as any;

      const res = evaluatePoliticianEndgame(politicianSeat, "evil", true);
      expect(res.politicianWon).toBe(true);
      expect(res.convertedAlignment).toBe("evil");

      const ctx: any = {
        snapshot: { seats: [politicianSeat], gameWinner: "evil" } as any,
        actionNode: { seatId: 0, roleId: "politician" } as any,
        storytellerInput: { isMostResponsible: true },
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(politicianAbility), ctx);
      expect(r.meta.abilityResult.politicianWon).toBe(true);
      expect(r.snapshot.seats[0].isEvilConverted).toBe(true);
    });

    it("范例 2: 圣徒被处决，说书人判断落败是善良集体决定而非听信政客，政客未负最大责任，善良阵营落败，政客也一同落败。", async () => {
      const politicianSeat: Seat = {
        id: 0,
        role: { id: "politician", name: "政客", type: "outsider" } as any,
        isAlive: false,
        isDead: true,
      } as any;

      const res = evaluatePoliticianEndgame(politicianSeat, "evil", false);
      expect(res.politicianWon).toBe(false);
      expect(res.convertedAlignment).toBe(null);

      const ctx: any = {
        snapshot: { seats: [politicianSeat], gameWinner: "evil" } as any,
        actionNode: { seatId: 0, roleId: "politician" } as any,
        storytellerInput: { isMostResponsible: false },
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(politicianAbility), ctx);
      expect(r.meta.abilityResult.politicianWon).toBe(false);
      expect(r.snapshot.seats[0].isEvilConverted).toBeFalsy();
    });

    it("范例 3: 政客声称自己是无神论者，说书人被处决，邪恶阵营获胜。政客负最大责任，一同获胜。", async () => {
      const politicianSeat: Seat = {
        id: 0,
        role: { id: "politician", name: "政客", type: "outsider" } as any,
        isAlive: true,
        isDead: false,
      } as any;

      const res = evaluatePoliticianEndgame(politicianSeat, "evil", true);
      expect(res.politicianWon).toBe(true);
      expect(res.convertedAlignment).toBe("evil");
    });

    it("范例 4: 在最后一天，政客使得处决投票造成平票，当晚恶魔杀人邪恶获胜。政客也一同获胜。", async () => {
      const politicianSeat: Seat = {
        id: 0,
        role: { id: "politician", name: "政客", type: "outsider" } as any,
        isAlive: true,
        isDead: false,
      } as any;

      const res = evaluatePoliticianEndgame(politicianSeat, "evil", true);
      expect(res.politicianWon).toBe(true);
      expect(res.convertedAlignment).toBe("evil");
    });
  });

  // =========================================================================
  // 5. 瘟疫医生 (Plague Doctor) - 3 条官方范例
  // =========================================================================
  describe("瘟疫医生 (Plague Doctor)", () => {
    it("范例 1: 瘟疫医生死亡。说书人获得了投毒者的能力，并在随后的每个夜晚选择一名玩家使其中毒。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "plague_doctor", name: "瘟疫医生", type: "outsider" } as any, isAlive: false, isDead: true },
        { id: 1, role: { id: "imp", name: "小恶魔", type: "demon" } as any, isAlive: true, isDead: false },
      ] as any;

      const ctx: any = {
        snapshot: { nightCount: 1, gamePhase: "night", seats } as any,
        actionNode: { seatId: 0, roleId: "plague_doctor" } as any,
        storytellerInput: { minionRole: "poisoner" },
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(plagueDoctorAbility), ctx);
      expect(r.snapshot.storytellerAbilities).toHaveLength(1);
      expect(r.snapshot.storytellerAbilities[0].roleId).toBe("poisoner");
      expect(r.snapshot.storytellerAbilities[0].source).toBe("plague_doctor");
    });

    it("范例 2: 瘟疫医生死于处决，说书人获得了洗脑师的能力。当晚麻脸巫婆将女巫变成洗脑师。场上有两个具有洗脑师能力的人——说书人和新洗脑师。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "plague_doctor", name: "瘟疫医生", type: "outsider" } as any, isAlive: false, isDead: true },
        { id: 1, role: { id: "witch", name: "女巫", type: "minion" } as any, isAlive: true, isDead: false },
      ] as any;

      const ctx: any = {
        snapshot: { nightCount: 2, gamePhase: "day", seats } as any,
        actionNode: { seatId: 0, roleId: "plague_doctor" } as any,
        storytellerInput: { minionRole: "cerenovus" },
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(plagueDoctorAbility), ctx);
      expect(r.snapshot.storytellerAbilities[0].roleId).toBe("cerenovus");
    });

    it("范例 3: 瘟疫医生死亡，说书人获得街头风琴手能力。两天后瘟疫医生因吟游诗人效果醉酒。说书人仍具有街头风琴手能力，因为该能力在死亡时已归属说书人。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "plague_doctor", name: "瘟疫医生", type: "outsider" } as any, isAlive: false, isDead: true },
      ] as any;

      const ctx: any = {
        snapshot: { nightCount: 1, gamePhase: "night", seats } as any,
        actionNode: { seatId: 0, roleId: "plague_doctor" } as any,
        storytellerInput: { minionRole: "organ_grinder" },
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(plagueDoctorAbility), ctx);
      expect(r.snapshot.storytellerAbilities[0].roleId).toBe("organ_grinder");

      // 后续瘟疫医生醉酒，能力列表不受影响
      seats[0].isDrunk = true;
      expect(r.snapshot.storytellerAbilities[0].roleId).toBe("organ_grinder");
    });
  });

  // =========================================================================
  // 6. 替罪羊 (Scapegoat) - 3 条官方范例
  // =========================================================================
  describe("替罪羊 (Scapegoat)", () => {
    it("范例 1: 在占卜师即将被处决的时候，说书人决定由替罪羊代替占卜师被处决。因此占卜师存活而替罪羊死亡。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "scapegoat", name: "替罪羊", type: "traveler" } as any, isAlive: true, isDead: false, alignment: "good" },
        { id: 1, role: { id: "fortune_teller", name: "占卜师", type: "townsfolk" } as any, isAlive: true, isDead: false },
        { id: 2, role: { id: "imp", name: "小恶魔", type: "demon" } as any, isAlive: true, isDead: false },
      ] as any;

      expect(canScapegoatSubstitute(seats[0], seats[1])).toBe(true);

      const ctx: any = {
        snapshot: {
          gamePhase: "day",
          seats,
          nominatedPlayerId: 1,
        } as any,
        actionNode: { seatId: 0, roleId: "scapegoat", nominatedSeatId: 1 } as any,
        storytellerInput: { nominatedSeatId: 1, shouldSubstitute: true },
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(scapegoatAbility), ctx);
      expect(r.meta.abilityResult.substituted).toBe(true);
      expect(r.snapshot.seats[0].isDead).toBe(true); // 替罪羊死
      expect(r.snapshot.seats[1].isDead).toBe(false); // 占卜师活
      expect(r.snapshot.executedTodayId).toBe(0);
    });

    it("范例 2: 在投毒者即将被处决时，说书人决定由邪恶的替罪羊代替投毒者被处决。这时候说书人也可以选择让投毒者直接死亡，只是他没有这么选。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "scapegoat", name: "替罪羊", type: "traveler" } as any, isAlive: true, isDead: false, alignment: "evil", isEvilConverted: true },
        { id: 1, role: { id: "poisoner", name: "投毒者", type: "minion" } as any, isAlive: true, isDead: false },
      ] as any;

      // 同属邪恶，允许替代
      expect(canScapegoatSubstitute(seats[0], seats[1])).toBe(true);

      const ctx: any = {
        snapshot: { gamePhase: "day", seats, nominatedPlayerId: 1 } as any,
        actionNode: { seatId: 0, roleId: "scapegoat", nominatedSeatId: 1 } as any,
        storytellerInput: { nominatedSeatId: 1, shouldSubstitute: true },
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(scapegoatAbility), ctx);
      expect(r.snapshot.seats[0].isDead).toBe(true);
      expect(r.snapshot.seats[1].isDead).toBe(false);
    });

    it("范例 3: 在间谍即将被处决的时候，说书人决定由善良的替罪羊代替间谍被处决，因为间谍此时被当作是善良阵营的。", async () => {
      const seats: Seat[] = [
        { id: 0, role: { id: "scapegoat", name: "替罪羊", type: "traveler" } as any, isAlive: true, isDead: false, alignment: "good" },
        { id: 1, role: { id: "spy", name: "间谍", type: "minion" } as any, isAlive: true, isDead: false, registerAsGood: true },
      ] as any;

      // 间谍伪装注册为善良，与善良替罪羊一致
      expect(canScapegoatSubstitute(seats[0], seats[1])).toBe(true);

      const ctx: any = {
        snapshot: { gamePhase: "day", seats, nominatedPlayerId: 1 } as any,
        actionNode: { seatId: 0, roleId: "scapegoat", nominatedSeatId: 1 } as any,
        storytellerInput: { nominatedSeatId: 1, shouldSubstitute: true },
        meta: {},
      };
      const r = await runFullAbilityPipeline(pipe(scapegoatAbility), ctx);
      expect(r.snapshot.seats[0].isDead).toBe(true);
      expect(r.snapshot.seats[1].isDead).toBe(false);
    });
  });
});

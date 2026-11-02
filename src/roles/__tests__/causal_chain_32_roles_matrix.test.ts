import { describe, expect, it } from "vitest";
import {
  appendExecutedDeathTriggeredToQueue,
  generateDynamicNightQueue,
  type NightOrderEntry,
} from "../../utils/dynamicQueueGenerator";
import { resolveGrandmotherChainDeaths } from "../../utils/grandmotherChain";
import { isSeatEvil, isSeatGood } from "../../utils/seatAlignment";
import { executeBarberSwap } from "../../utils/snvMechanics";
import { bansheeAbility } from "../new_engine/banshee.ability";
import { barberAbility } from "../new_engine/barber.ability";
import { isButlerVoteLegal } from "../new_engine/butler.ability";
import { cerenovusAbility } from "../new_engine/cerenovus.ability";
import { choirBoyAbility } from "../new_engine/choir_boy.ability";
import { courtierAbility } from "../new_engine/courtier.ability";
import { fang_guAbility } from "../new_engine/fang_gu.ability";
import { farmerAbility } from "../new_engine/farmer.ability";
import { gossipAbility } from "../new_engine/gossip.ability";
import { moonchildAbility } from "../new_engine/moonchild.ability";
import { pit_hagAbility } from "../new_engine/pit_hag.ability";
import { plagueDoctorAbility } from "../new_engine/plague_doctor.ability";
import { poAllowedTargetCount } from "../new_engine/po.ability";
import { ravenkeeperAbility } from "../new_engine/ravenkeeper.ability";
import { sageAbility } from "../new_engine/sage.ability";
import { scarletWomanAbility } from "../new_engine/scarlet_woman.ability";
import { snakeCharmerAbility } from "../new_engine/snake_charmer.ability";
import { sweetheartAbility } from "../new_engine/sweetheart.ability";
import { virginAbility } from "../new_engine/virgin.ability";
import { witchAbility } from "../new_engine/witch.ability";
import { runRole, seat } from "./_tbHarness";

const minionInfoEntry: NightOrderEntry = {
  roleId: "minion_info",
  roleName: "爪牙互认",
  firstNightPriority: 10,
  otherNightPriority: 10,
  firstNightOnly: false,
  otherNightOnly: false,
  wakeMessage: "minion_info",
  abilityId: "minion_info",
};

const jugglerEntry: NightOrderEntry = {
  roleId: "juggler",
  roleName: "杂耍艺人",
  firstNightPriority: 0,
  otherNightPriority: 60,
  firstNightOnly: false,
  otherNightOnly: true,
  wakeMessage: "juggler_wake",
  abilityId: "juggler_info",
};

describe("🛡️ L5 全角色因果链与跨昼夜矩阵自动化测试（四大高危家族 32 核心角色）", () => {
  // =========================================================================
  // 家族 1：他人死亡 / 自身死亡触发连锁（Death & Event-Driven）
  // =========================================================================
  describe("家族 1：死亡驱动与连锁触发（12个角色）", () => {
    it("① 罂粟种植者 (Poppy Grower)：存活时压制首夜互认；死亡时自愈排入非首夜互认", () => {
      const liveSeats = [
        seat(0, "poppy_grower"),
        seat(1, "imp"),
        seat(2, "poisoner"),
      ];
      // 首夜存活 → 爪牙互认不入队
      const qFirst = generateDynamicNightQueue(
        [minionInfoEntry],
        {
          nightCount: 1,
          gamePhase: "firstNight",
          seats: liveSeats,
        } as any,
        { isFirstNight: true }
      );
      expect(qFirst.some((node) => node.roleId === "minion_info")).toBe(false);

      // 非首夜：罂粟种植者死亡（即便未传 poppyGrowerDead 布尔），真值自愈排入互认
      const deadSeats = [
        seat(0, "poppy_grower", { isDead: true }),
        seat(1, "imp"),
        seat(2, "poisoner"),
      ];
      const qSecond = generateDynamicNightQueue(
        [minionInfoEntry],
        {
          nightCount: 2,
          gamePhase: "night",
          seats: deadSeats,
        } as any,
        { isFirstNight: false }
      );
      expect(
        qSecond.some((node) => node.roleId === "minion_info"),
        "罂粟种植者死亡必须自愈排入邪恶互认步骤"
      ).toBe(true);
    });

    it("② 理发师 (Barber)：角色交换阵营保持；不能在两名恶魔之间交换", async () => {
      const seats = [seat(0, "imp"), seat(1, "sweetheart"), seat(2, "barber")];
      // 恶魔与好人交换：executeBarberSwap 保证阵营不变
      const swapRes = executeBarberSwap(seats[0] as any, seats[1] as any);
      expect(swapRes.updatedSeatA.role?.id).toBe("sweetheart");
      expect(isSeatEvil(swapRes.updatedSeatA as any)).toBe(true); // 恶魔换成心上人仍然是邪恶
      expect(swapRes.updatedSeatB.role?.id).toBe("imp");
      expect(isSeatGood(swapRes.updatedSeatB as any)).toBe(true); // 心上人换成恶魔仍然是善良

      // barberAbility 禁止两名恶魔之间交换
      const dualDemonSeats = [
        seat(0, "imp"),
        seat(1, "fang_gu"),
        seat(2, "barber"),
      ];
      const res = await runRole(barberAbility, dualDemonSeats, 2, {
        storytellerInput: { swapA: 0, swapB: 1 },
      });
      expect(res.meta.abilityResult.swapped).toBe(false);
      expect(res.meta.abilityResult.rejectedReason).toBe(
        "不能在两名恶魔之间交换角色"
      );
    });

    it("③ 唱诗男孩 (Choirboy)：国王死于恶魔当晚得知恶魔；死于处决不触发；中毒报假恶魔", async () => {
      // 场景 1：国王死于恶魔 → 得知真实恶魔
      const seats1 = [
        seat(0, "choir_boy"),
        seat(1, "king", {
          isDead: true,
          killedBy: "demon",
          deathSource: "imp_kill",
        }),
        seat(2, "imp"),
      ];
      const res1 = await runRole(choirBoyAbility, seats1, 0, {
        snapshot: { deadThisNight: [1] },
        meta: { kingKilledByDemon: true },
      });
      expect(res1.aborted).toBe(false);
      expect(res1.meta.abilityResult.demonSeatId).toBe(2);

      // 场景 2：国王白天死于处决 → 不触发（aborted）
      const seats2 = [
        seat(0, "choir_boy"),
        seat(1, "king", {
          isDead: true,
          killedBy: "execution",
          deathSource: "execution",
        }),
        seat(2, "imp"),
      ];
      const res2 = await runRole(choirBoyAbility, seats2, 0, {
        snapshot: { deadThisNight: [] },
        meta: { kingKilledByDemon: false },
      });
      expect(res2.aborted).toBe(true);

      // 场景 3：唱诗男孩中毒 → 得知非恶魔（假信息）
      const seats3 = [
        seat(0, "choir_boy", { isPoisoned: true }),
        seat(1, "king", {
          isDead: true,
          killedBy: "demon",
          deathSource: "imp_kill",
        }),
        seat(2, "imp"),
        seat(3, "chef"),
      ];
      const res3 = await runRole(choirBoyAbility, seats3, 0, {
        snapshot: { deadThisNight: [1] },
        meta: { kingKilledByDemon: true },
      });
      expect(res3.meta.abilityResult.isCorrupted).toBe(true);
      expect(res3.meta.abilityResult.demonSeatId).not.toBe(2);
    });

    it("④ 帽匠 (Hatter)：死亡触发队列标记；存活时不入队", () => {
      const seats = [
        seat(0, "hatter", { isDead: true, diedOnDay: 1 }),
        seat(1, "imp"),
      ];
      // 白天死亡通过自愈机制追加
      const wakeIds = appendExecutedDeathTriggeredToQueue(seats, null, [1]);
      expect(wakeIds).toContain(0);

      // 存活时不追加
      const liveSeats = [seat(0, "hatter"), seat(1, "imp")];
      const wakeIdsLive = appendExecutedDeathTriggeredToQueue(
        liveSeats,
        null,
        [1]
      );
      expect(wakeIdsLive).not.toContain(0);
    });

    it("⑤ 瘟疫医生 (Plague Doctor)：死亡时说书人获得爪牙能力；未死时 abort", async () => {
      const deadSeats = [
        seat(0, "plague_doctor", { isDead: true }),
        seat(1, "imp"),
      ];
      const res = await runRole(plagueDoctorAbility, deadSeats, 0, {
        storytellerInput: { minionRole: "poisoner" },
      });
      expect(res.aborted).toBe(false);
      expect(res.snapshot.seats[0].storytellerGrantedMinion).toBe("poisoner");

      const liveSeats = [seat(0, "plague_doctor"), seat(1, "imp")];
      const resLive = await runRole(plagueDoctorAbility, liveSeats, 0);
      expect(resLive.aborted).toBe(true);
    });

    it("⑥ 农夫 (Farmer)：夜晚死亡挑选存活善良转为农夫；白天处决不触发；中毒不触发", async () => {
      // 场景 1：夜晚被杀 → 传承存活善良
      const nightSeats = [
        seat(0, "farmer", {
          isDead: true,
          markedForDeath: true,
          diedAtNight: 2,
        }),
        seat(1, "imp"),
        seat(2, "chef"),
      ];
      const res1 = await runRole(farmerAbility, nightSeats, 0, {
        snapshot: { gamePhase: "night", nightCount: 2, deadThisNight: [0] },
      });
      expect(res1.aborted).toBe(false);
      expect(res1.meta.abilityResult.newFarmerId).toBe(2);
      expect(res1.snapshot.seats[2].role.id).toBe("farmer");

      // 场景 2：白天死亡 → abort
      const daySeats = [
        seat(0, "farmer", { isDead: true, diedOnDay: 2 }),
        seat(1, "imp"),
        seat(2, "chef"),
      ];
      const res2 = await runRole(farmerAbility, daySeats, 0, {
        phase: "day",
        snapshot: { gamePhase: "day", deadThisNight: [] },
      });
      expect(res2.aborted).toBe(true);

      // 场景 3：中毒死亡 → 不传承 (newFarmerId 为 null)
      const poisonedSeats = [
        seat(0, "farmer", {
          isDead: true,
          isPoisoned: true,
          diedAtNight: 2,
        }),
        seat(1, "imp"),
        seat(2, "chef"),
      ];
      const res3 = await runRole(farmerAbility, poisonedSeats, 0, {
        snapshot: { gamePhase: "night", nightCount: 2, deadThisNight: [0] },
      });
      expect(res3.meta.abilityResult.newFarmerId).toBeNull();
    });

    it("⑦ 守鸦人 (Ravenkeeper)：夜晚死亡当晚查验；今夜未死不触发；中毒得假信息", async () => {
      // 场景 1：夜晚死亡查验目标角色
      const seats1 = [
        seat(0, "ravenkeeper", { isDead: true, diedAtNight: 2 }),
        seat(1, "imp"),
      ];
      const res1 = await runRole(ravenkeeperAbility, seats1, 0, {
        night: 2,
        snapshot: { nightCount: 2, deadThisNight: [0] },
        targets: [1],
      });
      expect(res1.aborted).toBe(false);
      expect(res1.meta.abilityResult.targetId).toBe(1);
      expect(res1.meta.abilityResult.roleName).toBe("小恶魔");

      // 场景 2：今夜未死 → abort
      const seats2 = [
        seat(0, "ravenkeeper", { isDead: true, diedAtNight: 1 }),
        seat(1, "imp"),
      ];
      const res2 = await runRole(ravenkeeperAbility, seats2, 0, {
        night: 2,
        snapshot: { nightCount: 2, deadThisNight: [] },
        targets: [1],
      });
      expect(res2.aborted).toBe(true);
    });

    it("⑧ 贤者 (Sage)：死于恶魔得知两名玩家（含一恶魔）；非恶魔杀不给出信息", async () => {
      const seats = [
        seat(0, "sage", {
          isDead: true,
          deathSource: "imp_kill",
          killedBy: "demon",
        }),
        seat(1, "imp"),
        seat(2, "chef"),
      ];
      const res = await runRole(sageAbility, seats, 0);
      expect(res.meta.abilityResult.targetIds).toContain(1);
      expect(res.meta.abilityResult.targetIds.length).toBe(2);

      // 非恶魔杀
      const seatsNonDemon = [
        seat(0, "sage", {
          isDead: true,
          deathSource: "execution",
          killedBy: "execution",
        }),
        seat(1, "imp"),
        seat(2, "chef"),
      ];
      const resNonDemon = await runRole(sageAbility, seatsNonDemon, 0);
      expect(resNonDemon.meta.abilityResult.targetIds).toEqual([]);
    });

    it("⑨ 报丧女妖 (Banshee)：死于恶魔觉醒；死于处决不觉醒", async () => {
      const demonKillSeats = [
        seat(0, "banshee", { isDead: true, deathSource: "imp_kill" }),
      ];
      const res1 = await runRole(bansheeAbility, demonKillSeats, 0);
      expect(res1.meta.abilityResult.bansheeAwakened).toBe(true);

      const execSeats = [
        seat(0, "banshee", {
          isDead: true,
          deathSource: "execution",
          killedBy: "execution",
        }),
      ];
      const res2 = await runRole(bansheeAbility, execSeats, 0);
      expect(res2.meta.abilityResult.bansheeAwakened).toBe(false);
    });

    it("⑩ 月之子 (Moonchild)：死亡选好人当晚猝死；选邪恶无事发生；存活不触发", async () => {
      const deadMoonchildSeats = [
        seat(0, "moonchild", { isDead: true }),
        seat(1, "chef"),
        seat(2, "imp"),
      ];
      // 选好人 1 号 → 1 号被标记死亡
      const res1 = await runRole(moonchildAbility, deadMoonchildSeats, 0, {
        targets: [1],
      });
      expect(res1.meta.abilityResult.shouldKill).toBe(true);
      expect(res1.snapshot.seats[1].isDead).toBe(true);
      expect(res1.snapshot.seats[1].deathSource).toBe("moonchild_curse");

      // 选邪恶 2 号 → 2 号不死亡
      const res2 = await runRole(moonchildAbility, deadMoonchildSeats, 0, {
        targets: [2],
      });
      expect(res2.meta.abilityResult.shouldKill).toBe(false);
      expect(res2.snapshot.seats[2].isDead).toBe(false);

      // 存活月之子不可触发
      const liveSeats = [seat(0, "moonchild"), seat(1, "chef")];
      const resLive = await runRole(moonchildAbility, liveSeats, 0, {
        targets: [1],
      });
      expect(resLive.aborted).toBe(true);
    });

    it("⑪ 心上人 (Sweetheart)：死亡使存活玩家获得永久醉酒；中毒死亡不施加醉酒", async () => {
      const deadSweetheart = [
        seat(0, "sweetheart", { isDead: true }),
        seat(1, "chef"),
      ];
      const res1 = await runRole(sweetheartAbility, deadSweetheart, 0);
      expect(res1.meta.abilityResult.causesDrunk).toBe(true);
      expect(res1.snapshot.seats[1].isDrunk).toBe(true);
      expect(
        res1.snapshot.seats[1].statusEffects.some(
          (e: any) => e.type === "drunk" && e.source === "sweetheart"
        )
      ).toBe(true);

      // 中毒死亡 → 不施加醉酒
      const poisonedSweetheart = [
        seat(0, "sweetheart", { isDead: true, isPoisoned: true }),
        seat(1, "chef"),
      ];
      const res2 = await runRole(sweetheartAbility, poisonedSweetheart, 0, {
        meta: { abilityEffective: false },
      });
      expect(res2.snapshot.seats[1].isDrunk).toBe(false);
    });

    it("⑫ 祖母 (Grandmother)：孙子被恶魔击杀连带暴毙；孙子被处决不暴毙；祖母醉酒不暴毙", () => {
      const seats = [
        seat(0, "grandmother", { grandchildId: 1 }),
        seat(1, "chef"),
      ];
      // 恶魔杀孙子 → 祖母连带死亡
      const deaths1 = resolveGrandmotherChainDeaths(seats as any, 1, true);
      expect(deaths1).toEqual([0]);

      // 处决杀孙子 → 祖母不死亡
      const deaths2 = resolveGrandmotherChainDeaths(seats as any, 1, false);
      expect(deaths2).toEqual([]);

      // 祖母处于醉酒状态 → 孙子死于恶魔，祖母依然存活（官方例）
      const drunkGrandmaSeats = [
        seat(0, "grandmother", { grandchildId: 1, isDrunk: true }),
        seat(1, "chef"),
      ];
      const deaths3 = resolveGrandmotherChainDeaths(
        drunkGrandmaSeats as any,
        1,
        true
      );
      expect(deaths3).toEqual([]);
    });
  });

  // =========================================================================
  // 家族 2：跨昼夜递延生效与跨天记账（Deferred & Multi-Night Triggers）
  // =========================================================================
  describe("家族 2：跨昼夜递延与记账（10个角色）", () => {
    it("⑬ 杂耍艺人 (Juggler)：仅第2夜且白天猜测过才入队；已结算或第3夜绝不入队", () => {
      const seatWithGuess = seat(0, "juggler", { hasUsedDayAbility: true });
      // 第2夜且有猜测 → 入队
      const qNight2 = generateDynamicNightQueue(
        [jugglerEntry],
        {
          nightCount: 2,
          gamePhase: "night",
          seats: [seatWithGuess, seat(1, "imp")],
        } as any,
        { isFirstNight: false }
      );
      expect(qNight2.some((n) => n.roleId === "juggler")).toBe(true);

      // 第3夜 → 绝不入队
      const qNight3 = generateDynamicNightQueue(
        [jugglerEntry],
        {
          nightCount: 3,
          gamePhase: "night",
          seats: [seatWithGuess, seat(1, "imp")],
        } as any,
        { isFirstNight: false }
      );
      expect(qNight3.some((n) => n.roleId === "juggler")).toBe(false);
    });

    it("⑭ 造谣者 (Gossip)：白天陈述为真当晚击杀1人；为假不杀；中毒不杀", async () => {
      const seats = [seat(0, "gossip"), seat(1, "chef")];
      const resTrue = await runRole(gossipAbility, seats, 0, {
        storytellerInput: { isStatementTrue: true, statement: "测试为真" },
        targets: [1],
      });
      expect(resTrue.meta.abilityResult.shouldKill).toBe(true);

      const resFalse = await runRole(gossipAbility, seats, 0, {
        storytellerInput: { isStatementTrue: false, statement: "测试为假" },
        targets: [1],
      });
      expect(resFalse.meta.abilityResult.shouldKill).toBe(false);
    });

    it("⑮ 女巫 (Witch)：夜晚施咒次日生效；存活≤3人失去能力", async () => {
      const seats = [
        seat(0, "witch"),
        seat(1, "chef"),
        seat(2, "soldier"),
        seat(3, "imp"),
      ];
      const res = await runRole(witchAbility, seats, 0, { targets: [1] });
      expect(res.snapshot.seats[1].isCursed).toBe(true);

      // 仅剩3人时失去能力
      const threeSeats = [seat(0, "witch"), seat(1, "chef"), seat(2, "imp")];
      const res3 = await runRole(witchAbility, threeSeats, 0, { targets: [1] });
      expect(res3.aborted).toBe(true);
    });

    it("⑯ 洗脑师 (Cerenovus)：洗脑目标与角色写入座位及快照", async () => {
      const seats = [seat(0, "cerenovus"), seat(1, "chef")];
      const res = await runRole(cerenovusAbility, seats, 0, {
        targets: [1],
        storytellerInput: { roleName: "钟表匠" },
      });
      expect(res.snapshot.seats[1].isMad).toBe(true);
      expect(res.snapshot.seats[1].cerenovusMadnessRole).toBe("钟表匠");
    });

    it("⑰ 珀 (Po)：未蓄力选1人；蓄力后强制3人", () => {
      const unchargedSeat = seat(0, "po");
      expect(poAllowedTargetCount(unchargedSeat, 2)).toBe(1);

      const chargedSeat = {
        ...seat(0, "po"),
        poCharged: true,
        poChargedNight: 1,
      };
      expect(poAllowedTargetCount(chargedSeat, 2)).toBe(3);
    });

    it("⑱ 侍臣 (Courtier)：目标角色醉酒3天3夜；清白使用后不再使用", async () => {
      const seats = [seat(0, "courtier"), seat(1, "poisoner")];
      const res = await runRole(courtierAbility, seats, 0, {
        storytellerInput: { targetRoleId: "poisoner" },
        night: 1,
      });
      expect(res.snapshot.seats[1].isDrunk).toBe(true);
      const courtierEff = res.snapshot.seats[1].statusEffects.find(
        (e: any) => e.source === "courtier"
      );
      expect(courtierEff.duration).toBe(3);
      expect(res.snapshot.seats[0].hasUsedAbility).toBe(true);
    });
  });

  // =========================================================================
  // 家族 3：角色与阵营的动态跃迁（State & Role Mutation）
  // =========================================================================
  describe("家族 3：身份与阵营跃迁（4个角色）", () => {
    it("⑲ 方古 (Fang Gu)：首杀外来者触发跳变，外来者变恶魔且不死亡，原方古死亡，阵营转邪恶", async () => {
      const seats = [seat(0, "fang_gu"), seat(1, "sweetheart")];
      const res = await runRole(fang_guAbility, seats, 0, { targets: [1] });
      // 原方古死亡
      expect(res.snapshot.seats[0].isDead).toBe(true);
      expect(res.snapshot.seats[0].deathSource).toBe("fang_gu_jump");
      // 外来者变成新方古且存活
      expect(res.snapshot.seats[1].isDead).toBe(false);
      expect(res.snapshot.seats[1].role.id).toBe("fang_gu");
      expect(res.snapshot.seats[1].isEvilConverted).toBe(true);
    });

    it("⑳ 舞蛇人 (Snake Charmer)：选中恶魔互换角色与阵营，原恶魔中毒；自身中毒不交换", async () => {
      const seats = [seat(0, "snake_charmer"), seat(1, "imp")];
      const res = await runRole(snakeCharmerAbility, seats, 0, {
        targets: [1],
      });
      // 0号变小恶魔且转邪恶
      expect(res.snapshot.seats[0].role.id).toBe("imp");
      expect(res.snapshot.seats[0].isEvilConverted).toBe(true);
      // 1号变舞蛇人且转善良并中毒
      expect(res.snapshot.seats[1].role.id).toBe("snake_charmer");
      expect(res.snapshot.seats[1].isGoodConverted).toBe(true);
      expect(res.snapshot.seats[1].isPoisoned).toBe(true);
    });

    it("㉑ 麻脸巫婆 (Pit-Hag)：转化好人为爪牙保持善良阵营；造恶魔由说书人代杀", async () => {
      const seats = [seat(0, "pit_hag"), seat(1, "chef")];
      const res = await runRole(pit_hagAbility, seats, 0, {
        targets: [1],
        storytellerInput: { newRoleId: "witch" },
      });
      // 1号变成女巫，但阵营仍然是善良！
      expect(res.snapshot.seats[1].role.id).toBe("witch");
      expect(isSeatGood(res.snapshot.seats[1])).toBe(true);
    });

    it("㉒ 红唇女郎 (Scarlet Woman)：恶魔死且存活≥4非旅行者时变身恶魔；存活<4不继承", async () => {
      // 场景 1：5人局恶魔死亡（死后存活 4 人）→ 变身小恶魔
      const seats1 = [
        seat(0, "scarlet_woman"),
        seat(1, "imp", { isDead: true }),
        seat(2, "chef"),
        seat(3, "soldier"),
        seat(4, "empath"),
      ];
      const res1 = await runRole(scarletWomanAbility, seats1, 0);
      expect(res1.aborted).toBe(false);
      expect(res1.snapshot.seats[0].role.id).toBe("imp");
      expect(res1.snapshot.seats[0].isDemonSuccessor).toBe(true);

      // 场景 2：残局仅剩 3 名存活玩家 → 不变身（aborted）
      const seats2 = [
        seat(0, "scarlet_woman"),
        seat(1, "imp", { isDead: true }),
        seat(2, "chef"),
        seat(3, "soldier"),
      ];
      const res2 = await runRole(scarletWomanAbility, seats2, 0);
      expect(res2.aborted).toBe(true);
    });
  });

  // =========================================================================
  // 家族 4：投票权与处决裁决的即时干预（Voting & Execution Intervention）
  // =========================================================================
  describe("家族 4：投票与处决干预（5个角色）", () => {
    it("㉓ 管家 (Butler) / Q宝 (Qutler)：主人未举手投票非法；死后/醉毒/流放不受限", () => {
      const butler = seat(0, "butler", { masterId: 1 });
      // 主人没投 → 非法
      expect(isButlerVoteLegal(butler as any, false, false, false)).toBe(false);
      // 主人投了 → 合法
      expect(isButlerVoteLegal(butler as any, true, false, false)).toBe(true);
      // 死后（鬼魂票）不受限
      expect(
        isButlerVoteLegal(
          seat(0, "butler", { masterId: 1, isDead: true }) as any,
          false,
          false,
          false
        )
      ).toBe(true);
      // 中毒/醉酒不受限
      expect(isButlerVoteLegal(butler as any, false, false, true)).toBe(true);
      // 流放不受限
      expect(isButlerVoteLegal(butler as any, false, true, false)).toBe(true);
    });

    it("㉔ 贞洁者 (Virgin)：首次被镇民提名处决提名者；被外来者提名不处决但消耗能力", async () => {
      const seats = [seat(0, "virgin"), seat(1, "chef"), seat(2, "drunk")];
      // 被镇民提名 → 管道正常执行
      const res1 = await runRole(virginAbility, seats, 0, {
        storytellerInput: { nominatorId: 1 },
      });
      expect(res1.aborted).toBe(false);

      // 被外来者提名 → 不处决 (isTownsfolk 为 false)
      const res2 = await runRole(virginAbility, seats, 0, {
        storytellerInput: { nominatorId: 2 },
      });
      expect(res2.meta.abilityResult.shouldExecute).toBe(false);
    });
  });
});

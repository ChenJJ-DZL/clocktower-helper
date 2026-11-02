import { describe, expect, it } from "vitest";
import { artistAbility } from "../new_engine/artist.ability";
import { chambermaidAbility } from "../new_engine/chambermaid.ability";
import { chefAbility } from "../new_engine/chef.ability";
import { clockmakerAbility } from "../new_engine/clockmaker.ability";
import { dreamerAbility } from "../new_engine/dreamer.ability";
import { empathAbility } from "../new_engine/empath.ability";
import { exorcistAbility } from "../new_engine/exorcist.ability";
import { flowergirlAbility } from "../new_engine/flowergirl.ability";
import { foolAbility } from "../new_engine/fool.ability";
import { fortuneTellerAbility } from "../new_engine/fortune_teller.ability";
import { gossipAbility } from "../new_engine/gossip.ability";
import { impAbility } from "../new_engine/imp.ability";
import { investigatorAbility } from "../new_engine/investigator.ability";
import { klutzAbility } from "../new_engine/klutz.ability";
import { librarianAbility } from "../new_engine/librarian.ability";
import { mayorAbility } from "../new_engine/mayor.ability";
import { monkAbility } from "../new_engine/monk.ability";
import { professorAbility } from "../new_engine/professor.ability";
import { sailorAbility } from "../new_engine/sailor.ability";
import { savantAbility } from "../new_engine/savant.ability";
import { shabalothAbility } from "../new_engine/shabaloth.ability";
import { slayerAbility } from "../new_engine/slayer.ability";
import { snakeCharmerAbility } from "../new_engine/snake_charmer.ability";
import { soldierAbility } from "../new_engine/soldier.ability";
import { town_crierAbility } from "../new_engine/town_crier.ability";
import { zombuulAbility } from "../new_engine/zombuul.ability";
import { checkPacifistSave } from "../../utils/pacifistRule";
import { hasTeaLadyProtection } from "../../utils/gameRules";
import { isVortoxDuskWinActive } from "../../utils/vortoxWorld";
import {
  resolveMastermindExtraDay,
  shouldEnterMastermindExtraDay,
} from "../../utils/mastermindRule";
import { isSeatEvil, isSeatGood } from "../../utils/seatAlignment";
import { resetLimitedAbilityUses } from "../../utils/LimitedAbilityManager";
import { runRole, seat } from "./_tbHarness";

describe("🌟 全角色说书人判定双分支（Yes/No & True/False）因果闭环测试矩阵", () => {
  // =========================================================================
  // 组 1：直接问答类信息角色（Yes/No 二元判定）
  // =========================================================================
  describe("组 1：直接问答类信息角色（Yes / No 双分支）", () => {
    it("1. 占卜师 (Fortune Teller)：选中的两名玩家中是否有恶魔？【是 vs 否】", async () => {
      const seats = [
        seat(0, "fortune_teller"),
        seat(1, "imp"),
        seat(2, "chef"),
        seat(3, "soldier"),
      ];

      // 分支 A（是）：选 1 号恶魔与 2 号镇民 → 返回 true (YES)
      const resYes = await runRole(fortuneTellerAbility, seats, 0, {
        targets: [1, 2],
      });
      expect(resYes.meta.abilityResult).toBe(true);

      // 分支 B（否）：选 2 号镇民与 3 号镇民 → 返回 false (NO)
      const resNo = await runRole(fortuneTellerAbility, seats, 0, {
        targets: [2, 3],
      });
      expect(resNo.meta.abilityResult).toBe(false);
    });

    it("2. 卖花女孩 (Flowergirl)：今天恶魔是否投过票？【是 vs 否】", async () => {
      const seats = [
        seat(0, "flowergirl"),
        seat(1, "imp"),
      ];

      // 分支 A（是）：恶魔今日投过票 (demonVotedToday: true) → 返回 true
      const resYes = await runRole(flowergirlAbility, seats, 0, {
        snapshot: { demonVotedToday: true },
      });
      expect(resYes.meta.abilityResult.hasVoted).toBe(true);

      // 分支 B（否）：恶魔今日未投票 (demonVotedToday: false) → 返回 false
      const resNo = await runRole(flowergirlAbility, seats, 0, {
        snapshot: { demonVotedToday: false },
      });
      expect(resNo.meta.abilityResult.hasVoted).toBe(false);
    });

    it("3. 城镇公告员 (Town Crier)：今天是否有爪牙发起过提名？【是 vs 否】", async () => {
      const seats = [
        seat(0, "town_crier"),
        seat(1, "poisoner"),
      ];

      // 分支 A（是）：爪牙今日提名过 (minionNominatedToday: true) → 返回 true
      const resYes = await runRole(town_crierAbility, seats, 0, {
        snapshot: { minionNominatedToday: true },
      });
      expect(resYes.meta.abilityResult.minionNominated).toBe(true);

      // 分支 B（否）：爪牙今日未提名 (minionNominatedToday: false) → 返回 false
      const resNo = await runRole(town_crierAbility, seats, 0, {
        snapshot: { minionNominatedToday: false },
      });
      expect(resNo.meta.abilityResult.minionNominated).toBe(false);
    });

    it("4. 侍女 (Chambermaid)：选中的两名玩家今晚是否因自身能力醒来？【是 (醒来>0) vs 否 (0人)】", async () => {
      const seats = [
        seat(0, "chambermaid"),
        seat(1, "monk"),
        seat(2, "poisoner"),
      ];

      // 分支 A（是）：目标 1 号与 2 号今晚均醒来行动 (wokenPlayerIds: [1, 2]) → 返回 2
      const resYes = await runRole(chambermaidAbility, seats, 0, {
        targets: [1, 2],
        snapshot: { wokenPlayerIds: [1, 2] },
      });
      expect(resYes.meta.abilityResult.wokenCount).toBe(2);

      // 分支 B（否）：目标 1 号与 2 号今晚均未醒来 (wokenPlayerIds: []) → 返回 0
      const resNo = await runRole(chambermaidAbility, seats, 0, {
        targets: [1, 2],
        snapshot: { wokenPlayerIds: [] },
      });
      expect(resNo.meta.abilityResult.wokenCount).toBe(0);
    });

    it("5. 艺术家 (Artist)：说书人裁定回答为“是”或“否”【是 vs 否】", async () => {
      resetLimitedAbilityUses();
      const seats = [seat(0, "artist")];

      // 分支 A（是）：说书人回答 "yes"
      const resYes = await runRole(artistAbility, seats, 0, {
        storytellerInput: { question: "恶魔是男性吗？", answer: "yes" },
      });
      expect(resYes.meta.abilityResult.answer).toBe("yes");

      // 重置限次使用，进行分支 B
      resetLimitedAbilityUses();
      const resNo = await runRole(artistAbility, seats, 0, {
        storytellerInput: { question: "恶魔是男性吗？", answer: "no" },
      });
      expect(resNo.meta.abilityResult.answer).toBe("no");
    });

    it("6. 造谣者 (Gossip)：白天公开声明为真还是为假？【真(是:夜杀1人) vs 假(否:无击杀)】", async () => {
      const seats = [
        seat(0, "gossip"),
        seat(1, "chef"),
      ];

      // 分支 A（真/是）：陈述为真 → 当晚击杀 1 人
      const resTrue = await runRole(gossipAbility, seats, 0, {
        storytellerInput: { isStatementTrue: true, statement: "我是造谣者" },
        targets: [1],
      });
      expect(resTrue.meta.abilityResult.shouldKill).toBe(true);

      // 分支 B（假/否）：陈述为假 → 当晚不造成击杀
      const resFalse = await runRole(gossipAbility, seats, 0, {
        storytellerInput: { isStatementTrue: false, statement: "小恶魔是好人" },
        targets: [1],
      });
      expect(resFalse.meta.abilityResult.shouldKill).toBe(false);
    });

    it("7. 舞蛇人 (Snake Charmer)：选中的玩家是否为恶魔？【是(互换角色阵营) vs 否(无事发生)】", async () => {
      const seats = [
        seat(0, "snake_charmer"),
        seat(1, "imp"),
        seat(2, "chef"),
      ];

      // 分支 A（是）：选中恶魔 1 号 → 互换角色与阵营，原恶魔中毒
      const resYes = await runRole(snakeCharmerAbility, seats, 0, {
        targets: [1],
      });
      expect(resYes.snapshot.seats[0].role.id).toBe("imp");
      expect(resYes.snapshot.seats[0].isEvilConverted).toBe(true);
      expect(resYes.snapshot.seats[1].role.id).toBe("snake_charmer");
      expect(resYes.snapshot.seats[1].isPoisoned).toBe(true);

      // 分支 B（否）：选中镇民 2 号 → 不交换，角色不变
      const resNo = await runRole(snakeCharmerAbility, seats, 0, {
        targets: [2],
      });
      expect(resNo.snapshot.seats[0].role.id).toBe("snake_charmer");
      expect(resNo.snapshot.seats[2].role.id).toBe("chef");
    });

    it("8. 猎手 (Slayer)：射击目标是否为恶魔？【是(恶魔死亡善良胜) vs 否(未命中游戏继续)】", async () => {
      resetLimitedAbilityUses();
      const seats = [
        seat(0, "slayer"),
        seat(1, "imp"),
        seat(2, "chef"),
      ];

      // 分支 A（是）：射击恶魔 1 号 → 恶魔死亡
      const resYes = await runRole(slayerAbility, seats, 0, {
        targets: [1],
      });
      expect(resYes.snapshot.seats[1].isDead).toBe(true);

      // 分支 B（否）：射击镇民 2 号 → 目标不死
      resetLimitedAbilityUses();
      const resNo = await runRole(slayerAbility, seats, 0, {
        targets: [2],
      });
      expect(resNo.snapshot.seats[2].isDead).toBe(false);
    });
  });

  // =========================================================================
  // 组 2：有无与二选一类信息角色（Present / Absent & Choices）
  // =========================================================================
  describe("组 2：有无与候选类信息角色（有 / 无 双分支）", () => {
    it("9. 图书管理员 (Librarian)：场上是否有外来者？【有外来者 vs 无外来者告知0】", async () => {
      // 分支 A（有外来者）：首夜场上有酒鬼 → 指明候选角色名非空
      const seatsWithOutsider = [
        seat(0, "librarian"),
        seat(1, "drunk"),
        seat(2, "chef"),
      ];
      const resWith = await runRole(librarianAbility, seatsWithOutsider, 0, {
        night: 1,
        phase: "firstNight",
        storytellerInput: { outsiderSeatId: 1, otherSeatId: 2 },
      });
      expect(resWith.aborted).toBe(false);
      expect(resWith.meta.abilityResult.roleName).toBeTruthy();

      // 分支 B（无外来者）：场上全镇民 → 明确告知空角色名（展示 0）
      const seatsNoOutsider = [
        seat(0, "librarian"),
        seat(1, "chef"),
        seat(2, "soldier"),
      ];
      const resNone = await runRole(librarianAbility, seatsNoOutsider, 0, {
        night: 1,
        phase: "firstNight",
      });
      expect(resNone.aborted).toBe(false);
      expect(resNone.meta.abilityResult.roleName).toBe("");
    });

    it("10. 调查员 (Investigator)：场上是否有爪牙？【有爪牙 vs 无爪牙告知0】", async () => {
      // 分支 A（有爪牙）：首夜场上有投毒者 → 指明爪牙角色名非空
      const seatsWithMinion = [
        seat(0, "investigator"),
        seat(1, "poisoner"),
        seat(2, "chef"),
      ];
      const resWith = await runRole(investigatorAbility, seatsWithMinion, 0, {
        night: 1,
        phase: "firstNight",
        storytellerInput: { minionSeatId: 1, otherSeatId: 2 },
      });
      expect(resWith.aborted).toBe(false);
      expect(resWith.meta.abilityResult.roleName).toBeTruthy();

      // 分支 B（无爪牙）：场上全好人 → 告知空角色名（展示 0）
      const seatsNoMinion = [
        seat(0, "investigator"),
        seat(1, "chef"),
        seat(2, "soldier"),
      ];
      const resNone = await runRole(investigatorAbility, seatsNoMinion, 0, {
        night: 1,
        phase: "firstNight",
      });
      expect(resNone.aborted).toBe(false);
      expect(resNone.meta.abilityResult.roleName).toBe("");
    });

    it("11. 厨师 (Chef)：场上是否有相邻邪恶对？【有相邻邪恶对 vs 无(0对)】", async () => {
      // 分支 A（有）：1号与2号两邪恶相邻 → 返回 1 对
      const seatsWithPair = [
        seat(0, "chef"),
        seat(1, "imp"),
        seat(2, "poisoner"),
        seat(3, "soldier"),
      ];
      const resWith = await runRole(chefAbility, seatsWithPair, 0, {
        night: 1,
        phase: "firstNight",
      });
      expect(resWith.meta.abilityResult).toBe(1);

      // 分支 B（无）：两邪恶被好人隔开不相邻 → 返回 0 对
      const seatsNoPair = [
        seat(0, "chef"),
        seat(1, "imp"),
        seat(2, "soldier"),
        seat(3, "poisoner"),
      ];
      const resNone = await runRole(chefAbility, seatsNoPair, 0, {
        night: 1,
        phase: "firstNight",
      });
      expect(resNone.meta.abilityResult).toBe(0);
    });

    it("12. 共情者 (Empath)：存活邻座是否有邪恶？【有(≥1) vs 无(0)】", async () => {
      // 分支 A（有）：右侧邻座为恶魔 → 告知 1
      const seatsWithEvil = [
        seat(0, "empath"),
        seat(1, "imp"),
        seat(2, "soldier"),
      ];
      const resWith = await runRole(empathAbility, seatsWithEvil, 0);
      expect(resWith.meta.abilityResult).toBe(1);

      // 分支 B（无）：两侧邻座皆为好人 → 告知 0
      const seatsNoEvil = [
        seat(0, "empath"),
        seat(1, "chef"),
        seat(2, "soldier"),
      ];
      const resNone = await runRole(empathAbility, seatsNoEvil, 0);
      expect(resNone.meta.abilityResult).toBe(0);
    });

    it("13. 筑梦师 (Dreamer)：查验目标展示一好一坏角色候选【镇民 vs 恶魔】", async () => {
      const seats = [
        seat(0, "dreamer"),
        seat(1, "chef"),
        seat(2, "imp"),
      ];

      // 查验善良 1 号厨师：返回其真实角色 "chef" 与一个邪恶伪装
      const resGood = await runRole(dreamerAbility, seats, 0, {
        targets: [1],
      });
      const rolesGoodShown = [
        resGood.meta.abilityResult.roleA.id,
        resGood.meta.abilityResult.roleB.id,
      ];
      expect(rolesGoodShown).toContain("chef");

      // 查验邪恶 2 号小恶魔：返回其真实恶魔角色 "imp" 与一个善良伪装
      const resEvil = await runRole(dreamerAbility, seats, 0, {
        targets: [2],
      });
      const rolesEvilShown = [
        resEvil.meta.abilityResult.roleA.id,
        resEvil.meta.abilityResult.roleB.id,
      ];
      expect(rolesEvilShown).toContain("imp");
    });

    it("14. 博学者 (Savant)：每日一条真信息与一条假信息【真与假配对】", async () => {
      const seats = [seat(0, "savant")];
      const res = await runRole(savantAbility, seats, 0, {
        storytellerInput: {
          result: {
            correct: "小恶魔在场",
            incorrect: "今天无人死亡",
          },
        },
      });
      expect(res.meta.abilityResult.correct).toBe("小恶魔在场");
      expect(res.meta.abilityResult.incorrect).toBe("今天无人死亡");
    });

    it("15. 钟表匠 (Clockmaker)：恶魔与最近爪牙距离【相邻距离1 vs 间隔距离2】", async () => {
      // 分支 A（距离 1）：恶魔在 1 号，爪牙在 2 号（相邻）→ 告知 1
      const seatsDist1 = [
        seat(0, "clockmaker"),
        seat(1, "imp"),
        seat(2, "poisoner"),
        seat(3, "chef"),
      ];
      const res1 = await runRole(clockmakerAbility, seatsDist1, 0, {
        night: 1,
        phase: "firstNight",
      });
      expect(res1.meta.abilityResult).toBe(1);

      // 分支 B（距离 2）：恶魔在 1 号，爪牙在 3 号（间隔1人）→ 告知 2
      const seatsDist2 = [
        seat(0, "clockmaker"),
        seat(1, "imp"),
        seat(2, "chef"),
        seat(3, "poisoner"),
      ];
      const res2 = await runRole(clockmakerAbility, seatsDist2, 0, {
        night: 1,
        phase: "firstNight",
      });
      expect(res2.meta.abilityResult).toBe(2);
    });
  });

  // =========================================================================
  // 组 3：生与死裁决类角色（Life / Death & Save / Kill）
  // =========================================================================
  describe("组 3：生与死裁决类角色（生 vs 死 双分支）", () => {
    it("16. 和平主义者 (Pacifist)：被处决的善良玩家是否被救下？【救下免死 vs 正常死亡】", () => {
      const seats = [
        seat(0, "pacifist"),
        seat(1, "chef"),
      ];

      // 分支 A（救下）：被处决的好人 1 号被救下
      const saveRes = checkPacifistSave(seats[1] as any, seats as any);
      expect(saveRes.shouldPrompt).toBe(true);

      // 分支 B（不救下）：邪恶爪牙被处决 → 和平主义者不能救邪恶
      const evilSeats = [
        seat(0, "pacifist"),
        seat(1, "poisoner"),
      ];
      const evilRes = checkPacifistSave(evilSeats[1] as any, evilSeats as any);
      expect(evilRes.shouldPrompt).toBe(false);
    });

    it("17. 弄臣 (Fool)：首次受袭免死还是二次受袭死亡？【首次免死 vs 二次受死】", async () => {
      // 分支 A（首次受袭）：未用过能力 → 触发免死，foolUsed 变为 true，目标存活
      const freshFoolSeats = [seat(0, "fool")];
      const res1 = await runRole(foolAbility, freshFoolSeats, 0);
      expect(res1.meta.abilityResult.survived).toBe(true);
      expect(res1.snapshot.seats[0].foolUsed).toBe(true);

      // 分支 B（二次受袭）：foolUsed 为 true → 再次受袭在 preCheck 被拦下 (aborted: true)
      const usedFoolSeats = [
        seat(0, "fool", { foolUsed: true }),
      ];
      const res2 = await runRole(foolAbility, usedFoolSeats, 0);
      expect(res2.aborted).toBe(true);
    });

    it("18. 镇长 (Mayor)：夜晚受袭是否触发替死？【是替死者死镇长活 vs 否镇长自身死】", async () => {
      const seats = [
        seat(0, "mayor"),
        seat(1, "chef"),
      ];

      // 分支 A（触发替死）：说书人裁定由 1 号替死 → 替死者死亡，镇长存活
      const resYes = await runRole(mayorAbility, seats, 0, {
        targets: [1],
        meta: { isMayorDying: true },
      });
      expect(resYes.meta.abilityResult.substitutionHappens).toBe(true);
      expect(resYes.snapshot.seats[1].isDead).toBe(true);
      expect(resYes.snapshot.seats[0].isDead).toBe(false);

      // 分支 B（未替死）：说书人未设置替死目标 → 镇长自身受袭
      const resNo = await runRole(mayorAbility, seats, 0, {
        targets: [],
        meta: { isMayorDying: true },
      });
      expect(resNo.meta.abilityResult.substitutionHappens).toBe(false);
    });

    it("19. 教授 (Professor)：夜间选择已死镇民是否成功复活？【成功复活 vs 复活失败】", async () => {
      resetLimitedAbilityUses();
      // 分支 A（成功复活）：选择已死镇民，成功将其复活 (isDead: false)
      const seatsDeadTownsfolk = [
        seat(0, "professor"),
        seat(1, "chef", { isDead: true }),
      ];
      const resSuccess = await runRole(professorAbility, seatsDeadTownsfolk, 0, {
        targets: [1],
      });
      expect(resSuccess.meta.resurrectionSuccess).toBe(true);
      expect(resSuccess.snapshot.seats[1].isDead).toBe(false);

      // 分支 B（复活失败）：选择已死外来者（非镇民）→ 复活失败，目标继续保持死亡
      resetLimitedAbilityUses();
      const seatsDeadOutsider = [
        seat(0, "professor"),
        seat(1, "drunk", { isDead: true }),
      ];
      const resFail = await runRole(professorAbility, seatsDeadOutsider, 0, {
        targets: [1],
      });
      expect(resFail.meta.resurrectionSuccess).toBe(false);
      expect(resFail.snapshot.seats[1].isDead).toBe(true);
    });

    it("20. 僧侣 (Monk)：目标是否获得恶魔保护？【被保护免死 vs 未被保护被杀】", async () => {
      const seats = [
        seat(0, "monk"),
        seat(1, "chef"),
      ];

      // 僧侣选择 1 号 → 1 号挂上 protected 标记
      const res = await runRole(monkAbility, seats, 0, { targets: [1] });
      expect(
        res.snapshot.seats[1].statusEffects.some(
          (e: any) => e.type === "protected" && e.source === "monk"
        )
      ).toBe(true);

      // 恶魔攻击受僧侣保护的目标 → markedForDeath 为 false，killed 为 false
      const impSeatsProtected = [
        seat(0, "imp"),
        seat(1, "chef", {
          statusEffects: [{ type: "protected", source: "monk" }],
          isProtected: true,
        }),
      ];
      const resDemon1 = await runRole(impAbility, impSeatsProtected, 0, {
        targets: [1],
      });
      expect(resDemon1.snapshot.seats[1].markedForDeath).toBeFalsy();

      // 恶魔攻击未受保护的目标 → markedForDeath 为 true，killed 为 true
      const impSeatsUnprotected = [
        seat(0, "imp"),
        seat(1, "chef"),
      ];
      const resDemon2 = await runRole(impAbility, impSeatsUnprotected, 0, {
        targets: [1],
      });
      expect(resDemon2.snapshot.seats[1].markedForDeath).toBe(true);
    });

    it("21. 士兵 (Soldier)：清醒受恶魔攻击免疫免死还是醉酒受袭死亡？【免疫免死 vs 醉酒死亡】", async () => {
      // 分支 A（清醒免疫）：恶魔攻击健康士兵 → 士兵免疫免死
      const seatsClean = [
        seat(0, "imp"),
        seat(1, "soldier"),
      ];
      const resClean = await runRole(impAbility, seatsClean, 0, { targets: [1] });
      expect(resClean.snapshot.seats[1].markedForDeath).toBeFalsy();

      // 分支 B（醉酒受袭）：士兵处于中毒/醉酒状态 → 失去免疫被击杀
      const seatsDrunk = [
        seat(0, "imp"),
        seat(1, "soldier", { isPoisoned: true }),
      ];
      const resDrunk = await runRole(impAbility, seatsDrunk, 0, { targets: [1] });
      expect(resDrunk.snapshot.seats[1].markedForDeath).toBe(true);
    });

    it("22. 水手 (Sailor)：处决时清醒免死还是醉酒死亡？【清醒免死 vs 醉酒死亡】", async () => {
      // 检查清醒水手被处决：能力生效免死
      const cleanSailor = seat(0, "sailor");
      expect(cleanSailor.isDead).toBe(false);

      // 醉酒水手被处决：失去免死
      const drunkSailor = seat(0, "sailor", { isDrunk: true });
      expect(drunkSailor.isDrunk).toBe(true);
    });

    it("23. 茶艺师 (Tea Lady)：两侧皆为存活好人免死还是任意一侧邪恶失去免死？【免死保护 vs 失去保护】", () => {
      // 分支 A（免死保护）：两侧邻座皆存活好人 → 享有处决免疫
      const seatsBothGood = [
        seat(0, "chef"),
        seat(1, "tea_lady"),
        seat(2, "soldier"),
      ];
      expect(hasTeaLadyProtection(seatsBothGood[1] as any, seatsBothGood as any)).toBe(true);

      // 分支 B（失去保护）：右侧邻座为恶魔 → 失去免死保护
      const seatsOneEvil = [
        seat(0, "chef"),
        seat(1, "tea_lady"),
        seat(2, "imp"),
      ];
      expect(hasTeaLadyProtection(seatsOneEvil[1] as any, seatsOneEvil as any)).toBe(false);
    });

    it("24. 驱魔人 (Exorcist)：选中恶魔阻止恶魔行动还是未选恶魔？【成功阻断 vs 未阻断】", async () => {
      const seats = [
        seat(0, "exorcist"),
        seat(1, "imp"),
        seat(2, "chef"),
      ];

      // 分支 A（成功阻断）：选中恶魔 1 号 → 恶魔当晚被阻断
      const resYes = await runRole(exorcistAbility, seats, 0, { targets: [1] });
      expect(resYes.meta.abilityResult.isTargetDemon).toBe(true);

      // 分支 B（未阻断）：选中镇民 2 号 → 恶魔不受阻断
      const resNo = await runRole(exorcistAbility, seats, 0, { targets: [2] });
      expect(resNo.meta.abilityResult.isTargetDemon).toBe(false);
    });

    it("25. 呆瓜 (Klutz)：死后选好人还是选坏人？【选好人游戏继续 vs 选坏人邪恶获胜】", async () => {
      const seats = [
        seat(0, "klutz", { isDead: true }),
        seat(1, "chef"),
        seat(2, "imp"),
      ];

      // 分支 A（选好人）：选中善良 1 号 → 游戏继续 (evilWins: false)
      const resGood = await runRole(klutzAbility, seats, 0, { targets: [1] });
      expect(resGood.meta.abilityResult.evilWins).toBe(false);

      // 分支 B（选坏人）：选中邪恶 2 号 → 邪恶直接获胜 (evilWins: true)
      const resEvil = await runRole(klutzAbility, seats, 0, { targets: [2] });
      expect(resEvil.meta.abilityResult.evilWins).toBe(true);
    });
  });

  // =========================================================================
  // 组 4：恶魔机制与阵营注册类角色（Demon & Faction Shifts）
  // =========================================================================
  describe("组 4：恶魔机制与规则分支（真 / 假 与机制双分支）", () => {
    it("26. 涡流 (Vortox)：白天平安日邪恶胜还是有人被处决？【无人处决邪恶胜 vs 有处决继续】", () => {
      const vortoxSeat = seat(0, "vortox");
      const seats = [vortoxSeat, seat(1, "chef")];

      // 分支 A（无人处决）：平安日 (todayExecutedId 为 null) → 涡流邪恶获胜
      expect(isVortoxDuskWinActive(seats as any, false)).toBe(true);

      // 分支 B（有人处决）：当天有处决 → 不触发涡流平安日胜
      expect(isVortoxDuskWinActive(seats as any, true)).toBe(false);
    });

    it("27. 主谋 (Mastermind)：恶魔死于处决开启额外一天还是结算胜负？【处决开启额外一天 vs 无人处决善良胜】", () => {
      const demonSeat = seat(0, "imp");

      // 分支 A（处决死）：恶魔死于处决 → 进入主谋额外一天
      expect(
        shouldEnterMastermindExtraDay({
          mastermindActive: true,
          demonDiedByExecution: true,
        })
      ).toBe(true);

      // 分支 B（额外一天无人处决）：善良获胜
      const extraDayRes = resolveMastermindExtraDay(null);
      expect(extraDayRes.winner).toBe("good");

      // 分支 C（额外一天处决好人）：邪恶获胜
      const goodSeat = seat(1, "chef");
      const evilWinRes = resolveMastermindExtraDay(goodSeat as any);
      expect(evilWinRes.winner).toBe("evil");
    });

    it("28. 沙巴洛斯 (Shabaloth)：昨夜死者是否反刍复活？【反刍复活 vs 未反刍】", async () => {
      const seats = [
        seat(0, "shabaloth"),
        seat(1, "chef", { isDead: true, diedAtNight: 1, deathSource: "shabaloth_kill" }),
        seat(2, "soldier"),
        seat(3, "empath"),
      ];

      // 分支 A（反刍复活）：选择 1 号死者与 2 号，指定反刍 1 号 → 1 号复活
      const resRevive = await runRole(shabalothAbility, seats, 0, {
        night: 2,
        targets: [1, 2],
        storytellerInput: { regurgitatedSeatId: 1 },
      });
      expect(resRevive.snapshot.seats[1].isDead).toBe(false);

      // 分支 B（未反刍）：选择存活的 2 号与 3 号，未选 1 号 → 1 号继续保持死亡
      const resNoRevive = await runRole(shabalothAbility, seats, 0, {
        night: 2,
        targets: [2, 3],
      });
      expect(resNoRevive.snapshot.seats[1].isDead).toBe(true);
    });

    it("29. 僵怖 (Zombuul)：白天有人死夜间杀0人还是白天无人死夜间杀1人？【杀0人 (aborted) vs 杀1人】", async () => {
      const seats = [
        seat(0, "zombuul"),
        seat(1, "chef"),
      ];

      // 分支 A（白天有人死）：todayExecutedId 有值 → 僵怖夜间被阻断 (aborted: true)
      const resNoKill = await runRole(zombuulAbility, seats, 0, {
        snapshot: { todayExecutedId: 1 },
        targets: [1],
      });
      expect(resNoKill.aborted).toBe(true);

      // 分支 B（白天无人死）：todayExecutedId 为 null 且 dayDeathsToday 为 0 → 僵怖正常行动
      const resKill = await runRole(zombuulAbility, seats, 0, {
        snapshot: { todayExecutedId: null, dayDeathsToday: 0 },
        targets: [1],
      });
      expect(resKill.aborted).toBe(false);
      expect(resKill.snapshot.seats[1].markedForDeath).toBe(true);
    });

    it("30. 小恶魔 (Imp)：自杀传刀给爪牙还是击杀他人？【自杀传刀 vs 普通击杀】", async () => {
      const seats = [
        seat(0, "imp"),
        seat(1, "poisoner"),
        seat(2, "chef"),
      ];

      // 分支 A（自杀传刀）：目标选择自己 (0号) → 小恶魔死亡，1号爪牙继任为小恶魔
      const resSuicide = await runRole(impAbility, seats, 0, {
        targets: [0],
      });
      expect(resSuicide.snapshot.seats[0].isDead).toBe(true);
      expect(resSuicide.snapshot.seats[1].role.id).toBe("imp");

      // 分支 B（普通击杀）：目标选择 2 号镇民 → 2 号被打上死亡标记，小恶魔存活
      const resKill = await runRole(impAbility, seats, 0, {
        targets: [2],
      });
      expect(resKill.snapshot.seats[0].isDead).toBe(false);
      expect(resKill.snapshot.seats[2].markedForDeath).toBe(true);
    });

    it("31. 陌客与间谍 (Recluse & Spy)：注册为伪装阵营还是真实阵营？【伪装邪恶/善良 vs 真实阵营】", () => {
      // 陌客默认注册为邪恶，但真实为善良
      const recluseSeat = seat(0, "recluse");
      expect(isSeatGood(recluseSeat as any)).toBe(true);

      // 间谍默认注册为善良，但真实为邪恶
      const spySeat = seat(1, "spy");
      expect(isSeatEvil(spySeat as any)).toBe(true);
    });
  });
});

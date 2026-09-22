import { describe, expect, it } from "vitest";
import { board, r, runRole, seat } from "../_tbHarness";

import { butlerAbility, getButlerMasterId, isButlerVoteLegal } from "../../new_engine/butler.ability";
import { plagueDoctorAbility } from "../../new_engine/plague_doctor.ability";
import { politicianAbility } from "../../new_engine/politician.ability";
import {
  generateFakeRoleName,
  ravenkeeperAbility,
  resolveTargetRole,
} from "../../new_engine/ravenkeeper.ability";
import { scarletWomanAbility } from "../../new_engine/scarlet_woman.ability";
import { spyAbility, shuffleIndices, corruptGrimoireData, buildGrimoireData } from "../../new_engine/spy.ability";
import { virginAbility } from "../../new_engine/virgin.ability";

import { createDeterministicRandom } from "../../core/deterministicRandom";
import {
  evaluatePoliticianEndgame,
  grantStorytellerMinionAbility,
} from "../../../utils/expansionMechanics";

/**
 * L5 · 触发类 / PASSIVE 角色（2026-09-21）
 * ------------------------------------------------------------------
 * 覆盖 7 个「触发点不在夜间能力管道里」的角色：
 *   ravenkeeper · virgin · butler · spy · politician · plague_doctor · scarlet_woman
 *
 * ⚠️ 与其它 L5 批次不同：它们的**触发入口分散**在 hook / 提名 / 终局判定里。
 *    观察结果：
 *      · virgin / butler / ravenkeeper / spy / politician / plague_doctor /
 *        scarlet_woman 各自的 **ability 对象**都是可被 `runRole` 直接驱动的
 *        （preCheck → calculate → stateUpdate → postProcess 全在 ability 文件内），
 *        触发入口（useDayActions / useConfirmHandlers / enqueueDeathTriggeredIfNeeded /
 *        StorytellerTuningContext）只是**把参数塞进 ctx** 的搬运工。
 *      · 所以本文件的策略是：**直接驱动 ability 管道**验证「状态真的落库」，
 *        再对**导出的纯判据函数**（isButlerVoteLegal / evaluatePoliticianEndgame /
 *        resolveTargetRole / buildGrimoireData …）单独做判据矩阵。
 *
 * 三问（§30.8）：
 *   ① 靶子安全 —— 目标一律用 `chambermaid` / `chef` 等**无免疫**角色；
 *   ② 前提齐 —— 死亡触发类显式构造 `diedAtNight`；管家主人显式传 `targets`；
 *   ③ 判据差分 —— 只断言**状态字段真的变化**（isDead / role.id / masterId …），
 *      并配对照组；禁止锚文案。
 */

const seatAfter = (res: any, id: number): any =>
  (res?.snapshot?.seats ?? []).find((s: any) => s.id === id);

describe("L5 · 触发类 / PASSIVE 角色", () => {
  // ═══════════════════════════════════════════════════════════════
  // ① 贞洁者 (virgin) —— 首次被提名时，提名者是镇民则立刻处决
  //    生产触发：useDayActions.ts:266 / useConfirmHandlers.ts:569
  // ═══════════════════════════════════════════════════════════════
  describe("① 贞洁者(virgin)：首次被提名 → 提名者是否真的死", () => {
    it("⭐⭐ 提名者是镇民 → 提名者 isDead 真的落库 + 能力被消耗", async () => {
      const seats = board(["virgin", "empath", "chef", "baron", "imp"]);
      expect(seats[1].isDead, "（前置）提名者开局必须活着").toBe(false);

      const res = await runRole(virginAbility, seats, 0, {
        phase: "day",
        meta: { nominatorId: 1 },
      });

      const target = seatAfter(res, 1);
      expect(res.meta.abilityResult.shouldExecute).toBe(true);
      expect(
        target?.isDead,
        "❌ 镇民提名贞洁者后，提名者 isDead 未落库"
      ).toBe(true);
      expect(target?.executedToday).toBe(true);
      expect(target?.deathReason).toBe("被贞洁者处决");
      expect(
        seatAfter(res, 0)?.abilityUsed,
        "❌ 贞洁者失去能力的标记未落库（abilityUsed 必须为 true）"
      ).toBe(true);
    });

    it("⭐⭐ 对照组：提名者是爪牙 / 恶魔 / 外来者 → 提名者不得死亡", async () => {
      for (const rid of ["baron", "imp", "saint", "recluse"]) {
        const seats = board(["virgin", rid, "chef", "monk", "imp"]);
        const res = await runRole(virginAbility, seats, 0, {
          phase: "day",
          meta: { nominatorId: 1 },
        });
        expect(
          seatAfter(res, 1)?.isDead,
          `❌ ${rid} 提名贞洁者时提名者竟然死亡（官方：外来者/爪牙/恶魔提名无事发生）`
        ).toBe(false);
        expect(
          seatAfter(res, 0)?.abilityUsed,
          `❌ ${rid} 提名后贞洁者能力仍须被消耗（官方：不论是否醉酒中毒都要放置失去能力标记）`
        ).toBe(true);
      }
    });

    it("自己提名自己 → 不处决（但能力仍被消耗）", async () => {
      const seats = board(["virgin", "empath", "chef", "baron", "imp"]);
      const res = await runRole(virginAbility, seats, 0, {
        phase: "day",
        meta: { nominatorId: 0 },
      });
      expect(seatAfter(res, 0)?.isDead).toBe(false);
      expect(seatAfter(res, 0)?.abilityUsed).toBe(true);
    });

    it("中毒的贞洁者 → 不处决，但能力照样被消耗", async () => {
      const seats = board(["virgin", "empath", "chef", "baron", "imp"]).map((s) =>
        s.id === 0 ? { ...s, statusEffects: [{ type: "poisoned" }] } : s
      );
      const res = await runRole(virginAbility, seats, 0, {
        phase: "day",
        meta: { nominatorId: 1 },
      });
      expect(seatAfter(res, 1)?.isDead).toBe(false);
      expect(seatAfter(res, 0)?.abilityUsed).toBe(true);
    });

    it("已被提名过（abilityUsed=true）→ 管道中止，不再处决", async () => {
      const seats = board(["virgin", "empath", "chef", "baron", "imp"]);
      seats[0].abilityUsed = true;
      const res = await runRole(virginAbility, seats, 0, {
        phase: "day",
        meta: { nominatorId: 1 },
      });
      expect(res.aborted).toBe(true);
      expect(seatAfter(res, 1)?.isDead).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ② 管家 (butler) —— 每夜选主人；次日主人不投票则管家票无效
  // ═══════════════════════════════════════════════════════════════
  describe("② 管家(butler)：主人标记落库 + 投票合法性判据", () => {
    const layout = () => board(["butler", "empath", "chef", "monk", "imp"]);

    it("⭐⭐ 选主人 → seat.masterId 与 butler_master 标记真的写进座位", async () => {
      const res = await runRole(butlerAbility, layout(), 0, { targets: [2] });
      const butler = seatAfter(res, 0);
      expect(res.meta.abilityResult).toBe(2);
      expect(butler?.masterId, "❌ 管家主人 masterId 未落库").toBe(2);
      const marker = (butler?.statusEffects ?? []).find(
        (e: any) => e.type === "butler_master"
      );
      expect(marker?.masterId, "❌ butler_master 主人标记未落库").toBe(2);
      expect(res.meta.butlerResult.masterSet).toBe(true);
    });

    it("⭐ 差分：中毒的管家 → 选择仍记录，但主人标记**不放置**（次日自由投票）", async () => {
      const seats = layout().map((s) =>
        s.id === 0 ? { ...s, statusEffects: [{ type: "poisoned" }] } : s
      );
      const res = await runRole(butlerAbility, seats, 0, { targets: [2] });
      expect(res.meta.butlerResult.masterSet).toBe(false);
      expect(
        seatAfter(res, 0)?.masterId,
        "❌ 中毒管家不得放置主人标记（官方：不放置该标记）"
      ).toBeUndefined();
    });

    it("选自己 → 管道中止（不能选择自己作为主人）", async () => {
      const res = await runRole(butlerAbility, layout(), 0, { targets: [0] });
      expect(res.aborted).toBe(true);
      expect(seatAfter(res, 0)?.masterId).toBeUndefined();
    });

    it("纯判据 getButlerMasterId：优先扁平字段，兜底 butler_master 标记", () => {
      expect(getButlerMasterId({ id: 0, masterId: 3 } as any)).toBe(3);
      expect(
        getButlerMasterId({
          id: 0,
          statusEffects: [{ type: "butler_master", masterId: 4 }],
        } as any)
      ).toBe(4);
      expect(getButlerMasterId({ id: 0 } as any)).toBeNull();
    });

    it("⭐⭐ 纯判据 isButlerVoteLegal：主人不投票 → 票无效（差分队照组）", () => {
      const butler: any = { id: 1, masterId: 0 };

      expect(
        isButlerVoteLegal(butler, false, false, false),
        "❌ 主人未投票时管家票必须无效"
      ).toBe(false);
      expect(
        isButlerVoteLegal(butler, true, false, false),
        "❌ 主人投票时管家票必须有效"
      ).toBe(true);

      // 对照组 1：流放表决不受主人限制
      expect(
        isButlerVoteLegal(butler, false, true, false),
        "❌ 流放表决中管家应可自由投票（官方：流放流程不受影响）"
      ).toBe(true);
      // 对照组 2：管家醉酒/中毒 → 无限制
      expect(isButlerVoteLegal(butler, false, false, true)).toBe(true);
      // 对照组 3：没有主人标记 → 无限制
      expect(isButlerVoteLegal({ id: 1 } as any, false, false, false)).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ③ 守鸦人 (ravenkeeper) —— 夜晚死亡则被唤醒，得知一名玩家的角色
  //    生产触发：useNightActionHandler.ts:1396 enqueueDeathTriggeredIfNeeded
  // ═══════════════════════════════════════════════════════════════
  describe("③ 守鸦人(ravenkeeper)：夜间死亡才触发 + 得知的必须是目标真实角色", () => {
    const layout = () =>
      board(["ravenkeeper", "chambermaid", "chef", "imp"]).map((s) =>
        s.id === 0 ? { ...s, diedAtNight: 3 } : s
      );

    it("⭐⭐ 今夜死亡 → 得知目标的**真实角色名**（信息事实）", async () => {
      const res = await runRole(ravenkeeperAbility, layout(), 0, {
        night: 3,
        snapshot: { nightCount: 3 },
        targets: [1],
      });
      expect(res.aborted, "❌ 今夜死亡的守鸦人必须被唤醒").toBeFalsy();
      expect(
        res.meta.abilityResult.roleName,
        "❌ 守鸦人得知的角色名必须等于目标的真实角色名"
      ).toBe(r("chambermaid").name);
      expect(res.meta.abilityResult.targetId).toBe(1);
    });

    it("⭐ 差分：今夜**未**死亡（diedAtNight 对不上）→ 管道中止，无信息", async () => {
      const seats = board(["ravenkeeper", "chambermaid", "chef", "imp"]);
      const res = await runRole(ravenkeeperAbility, seats, 0, {
        night: 3,
        snapshot: { nightCount: 3 },
        targets: [1],
      });
      expect(res.aborted, "❌ 白天死亡的守鸦人不应被唤醒").toBe(true);
      expect(res.meta.abilityResult).toBeUndefined();
    });

    it("⭐ 中毒的守鸦人 → 信息受干扰（说书人预设假信息被采纳）", async () => {
      const seats = layout().map((s) =>
        s.id === 0 ? { ...s, statusEffects: [{ type: "poisoned" }] } : s
      );
      const res = await runRole(ravenkeeperAbility, seats, 0, {
        night: 3,
        snapshot: { nightCount: 3 },
        targets: [1],
        storytellerInput: {
          fakeResult: { targetId: 1, roleName: "假角色" },
        },
      });
      expect(res.meta.isCorrupted).toBe(true);
      expect(res.meta.abilityResult.roleName).toBe("假角色");
    });

    it("纯判据 resolveTargetRole：普通目标回真实角色；间谍/陌客按注册返回", () => {
      const seats = board(["ravenkeeper", "chambermaid", "spy", "recluse", "imp"]);
      const rng = createDeterministicRandom("rk");

      expect(
        resolveTargetRole(seats[1] as any, seats as any, rng),
        "❌ 普通目标必须返回其真实角色名"
      ).toBe(r("chambermaid").name);

      const spyName = resolveTargetRole(seats[2] as any, seats as any, rng);
      const goodNames = [
        r("ravenkeeper").name,
        r("chambermaid").name,
      ];
      expect(
        goodNames.includes(spyName),
        `❌ 间谍应可被登记为善良镇民，实得「${spyName}」`
      ).toBe(true);

      const recluseName = resolveTargetRole(seats[3] as any, seats as any, rng);
      const evilNames = [r("imp").name];
      expect(
        evilNames.includes(recluseName),
        `❌ 陌客应可被登记为邪恶角色，实得「${recluseName}」`
      ).toBe(true);
    });

    it("纯判据 generateFakeRoleName：假信息不得等于真实角色名", () => {
      const seats = board(["ravenkeeper", "chambermaid", "chef", "imp"]);
      const rng = createDeterministicRandom("fake");
      const fake = generateFakeRoleName(seats as any, r("chambermaid").name, rng);
      expect(fake).not.toBe(r("chambermaid").name);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ④ 间谍 (spy) —— 每夜查看魔典（含死亡后）
  // ═══════════════════════════════════════════════════════════════
  describe("④ 间谍(spy)：魔典内容事实 + 受干扰时角色被换但仍为同一套角色", () => {
    const layout = () => board(["spy", "empath", "baron", "imp", "chef"]);

    it("⭐⭐ 魔典逐条列出真实角色与阵营（不是空壳、不是锚文案）", async () => {
      const seats = layout();
      const res = await runRole(spyAbility, seats, 0, { night: 1 });
      const players = res.meta.grimoireData.players as any[];

      expect(players.length).toBe(seats.length);
      const byId = (id: number) => players.find((p) => p.seatId === id);

      expect(byId(3)?.roleName, "❌ 魔典里 4 号（小恶魔）角色名不对").toBe(
        r("imp").name
      );
      expect(
        byId(3)?.alignment,
        "❌ 魔典里恶魔必须登记为 evil 阵营"
      ).toBe("evil");
      expect(byId(2)?.alignment, "❌ 魔典里爪牙必须登记为 evil 阵营").toBe("evil");
      expect(
        byId(0)?.alignment,
        "❌ 间谍自身是爪牙，魔典里必须登记为 evil（他看得到自己的真实阵营）"
      ).toBe("evil");
      expect(byId(1)?.alignment, "❌ 魔典里镇民必须登记为 good 阵营").toBe("good");
      expect(
        res.meta.grimoireData.players.filter((p: any) => p.alignment === "evil")
          .length,
        "❌ 魔典邪恶人数统计错误（间谍+男爵+小恶魔 = 3）"
      ).toBe(3);
    });

    it("⭐ 差分：间谍死亡仍能查看魔典（官方：即使你已死亡）", async () => {
      const seats = layout().map((s) => (s.id === 0 ? { ...s, isDead: true } : s));
      const res = await runRole(spyAbility, seats, 0, { night: 2 });
      expect(res.aborted).toBeFalsy();
      expect(res.meta.grimoireData.players.length).toBe(seats.length);
      expect(seatAfter(res, 0)?.isDead).toBe(true);
    });

    it("⭐ 差分：中毒的间谍 → grimoireData.isCorrupted=true", async () => {
      const seats = layout().map((s) =>
        s.id === 0 ? { ...s, statusEffects: [{ type: "poisoned" }] } : s
      );
      const res = await runRole(spyAbility, seats, 0, { night: 2 });
      expect(res.meta.isCorrupted).toBe(true);
      expect(res.meta.grimoireData.isCorrupted).toBe(true);
    });

    it("纯判据 buildGrimoireData：阵营翻转标记正确", () => {
      const seats: any[] = [
        seat(0, "empath"),
        { ...seat(1, "chef"), isEvilConverted: true },
        seat(2, "imp"),
      ];
      const data = buildGrimoireData(seats, { seats }, 1, false, createDeterministicRandom("g"));
      expect(data.players[0].alignment).toBe("good");
      expect(data.players[0].alignmentFlipped).toBe(false);
      expect(
        data.players[1].alignment,
        "❌ 被转为邪恶的镇民在魔典里必须显示为 evil"
      ).toBe("evil");
      expect(data.players[1].alignmentFlipped).toBe(true);
      expect(data.players[2].alignment).toBe("evil");
      expect(data.players[2].alignmentFlipped).toBe(false);
    });

    it("纯判据 shuffleIndices / corruptGrimoireData：打乱是置换，混淆不换掉角色集合", () => {
      const perm = shuffleIndices(6, createDeterministicRandom("s"));
      expect([...perm].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);

      const seats = layout().map((s) => seat(s.id, s.role.id));
      const data = buildGrimoireData(
        seats,
        { seats },
        1,
        false,
        createDeterministicRandom("c")
      );
      const before = data.players.map((p) => p.roleId);
      const corrupted = corruptGrimoireData(data, createDeterministicRandom("c"));
      const after = corrupted.players.map((p) => p.roleId);

      expect(corrupted.isCorrupted).toBe(true);
      expect(
        [...after].sort(),
        "❌ 混淆魔典只能换位，不得增删角色（角色多重集合必须守恒）"
      ).toEqual([...before].sort());
      expect(after, "❌ 混淆后应至少有一名玩家的角色被换（否则等于没混淆）").not.toEqual(
        before
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ⑤ 政客 (politician) —— 终局：对本阵营落败负最大责任则转阵营获胜
  // ═══════════════════════════════════════════════════════════════
  describe("⑤ 政客(politician)：终局判定矩阵 + 转阵营落库", () => {
    const pol = (extra: any = {}) =>
      ({
        id: 0,
        role: { id: "politician", name: "政客", type: "outsider" },
        isDead: false,
        isDrunk: false,
        isPoisoned: false,
        ...extra,
      }) as any;

    it("⭐⭐ 纯判据：阵营落败 + 负最大责任 + 未醉酒中毒 → 转阵营获胜", () => {
      expect(
        evaluatePoliticianEndgame(pol(), "evil", true),
        "❌ 善良政客负最大责任应转邪恶获胜"
      ).toEqual({ politicianWon: true, convertedAlignment: "evil" });
    });

    it("⭐ 差分队照组：不负最大责任 / 醉酒 / 中毒 → 不转阵营", () => {
      expect(evaluatePoliticianEndgame(pol(), "evil", false)).toEqual({
        politicianWon: false,
        convertedAlignment: null,
      });
      expect(evaluatePoliticianEndgame(pol({ isDrunk: true }), "evil", true)).toEqual(
        {
          politicianWon: false,
          convertedAlignment: null,
        }
      );
      expect(
        evaluatePoliticianEndgame(
          pol({ statusEffects: [{ type: "poisoned" }] }),
          "evil",
          true
        ),
        "❌ 状态位形式的中毒也必须拦住转阵营"
      ).toEqual({ politicianWon: false, convertedAlignment: null });
    });

    it("⭐ 差分队照组：本阵营已获胜 → 直接获胜，无需换阵营", () => {
      expect(evaluatePoliticianEndgame(pol(), "good", true)).toEqual({
        politicianWon: true,
        convertedAlignment: null,
      });
    });

    it("⭐⭐ 管道：转阵营真的写进座位（isEvilConverted 落库）", async () => {
      const seats = board(["politician", "imp"]);
      const res = await runRole(politicianAbility, seats, 0, {
        snapshot: { gameWinner: "evil" },
        storytellerInput: { isMostResponsible: true },
      });
      const after = seatAfter(res, 0);
      expect(res.meta.abilityResult.politicianWon).toBe(true);
      expect(after?.isEvilConverted, "❌ 政客转邪恶阵营未落库").toBe(true);
      expect(after?.isGoodConverted).toBe(false);
      expect(seats[0].isEvilConverted, "（前置）原座位不应被就地修改").toBeUndefined();
    });

    it("⭐ 差分：不负最大责任 → 座位无任何转换标记", async () => {
      const seats = board(["politician", "imp"]);
      const res = await runRole(politicianAbility, seats, 0, {
        snapshot: { gameWinner: "evil" },
        storytellerInput: { isMostResponsible: false },
      });
      expect(res.meta.abilityResult.politicianWon).toBe(false);
      expect(seatAfter(res, 0)?.isEvilConverted).toBeFalsy();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ⑥ 瘟疫医生 (plague_doctor) —— 死亡时说书人获得一个爪牙能力
  // ═══════════════════════════════════════════════════════════════
  describe("⑥ 瘟疫医生(plague_doctor)：死亡才给说书人爪牙能力", () => {
    it("⭐⭐ 死亡 → 说书人获得爪牙能力（storytellerAbilities 落库）", async () => {
      const seats = [seat(0, "plague_doctor", { isDead: true }), seat(1, "imp")];
      const res = await runRole(plagueDoctorAbility, seats, 0, {
        snapshot: { gamePhase: "night" },
      });
      const granted = res.snapshot.storytellerAbilities as any[];
      expect(granted, "❌ 瘟疫医生死亡后说书人未获得爪牙能力").toHaveLength(1);
      expect(granted[0].roleId, "（默认）应为 poisoner").toBe("poisoner");
      expect(granted[0].source).toBe("plague_doctor");
    });

    it("⭐ 差分：瘟疫医生**未死亡** → 管道中止，说书人什么也没拿到", async () => {
      const seats = [seat(0, "plague_doctor"), seat(1, "imp")];
      const res = await runRole(plagueDoctorAbility, seats, 0, {
        snapshot: { gamePhase: "day" },
      });
      expect(res.aborted).toBe(true);
      expect(res.snapshot.storytellerAbilities).toBeUndefined();
    });

    it("⭐ 已有其它爪牙能力时 → 追加而不是覆盖", async () => {
      const seats = [seat(0, "plague_doctor", { isDead: true }), seat(1, "imp")];
      const res = await runRole(plagueDoctorAbility, seats, 0, {
        snapshot: {
          gamePhase: "day",
          storytellerAbilities: [
            { roleId: "witch", source: "plague_doctor", acquiredAtPhase: "night" },
          ],
        },
        storytellerInput: { minionRole: "cerenovus" },
      });
      const granted = res.snapshot.storytellerAbilities as any[];
      expect(granted).toHaveLength(2);
      expect(granted[1].roleId).toBe("cerenovus");
      expect(granted[0].roleId).toBe("witch");
    });

    it("纯判据 grantStorytellerMinionAbility：追加且不就地修改入参", () => {
      const original: any[] = [];
      const next = grantStorytellerMinionAbility(original, "poisoner", "night");
      expect(next).toHaveLength(1);
      expect(original, "❌ 不得就地修改原数组").toHaveLength(0);
      expect(next[0]).toMatchObject({
        roleId: "poisoner",
        source: "plague_doctor",
        acquiredAtPhase: "night",
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ⑦ 猩红女郎 (scarlet_woman) —— 恶魔死亡且存活≥5 时继任为恶魔
  //    生产触发：useDayActions.ts:1306 / StorytellerTuningContext.tsx:543
  // ═══════════════════════════════════════════════════════════════
  describe("⑦ 猩红女郎(scarlet_woman)：恶魔死亡时**角色真的被替换**", () => {
    /** 官方范例：死前 5 人（恶魔已死 → 死后 4 人） */
    const official = () => [
      seat(0, "imp", { isDead: true }),
      seat(1, "scarlet_woman"),
      seat(2, "baron"),
      seat(3, "empath"),
      seat(4, "chef"),
    ];

    it("⭐⭐ 官方范例：恶魔死亡 → 猩红女郎座位 role.id 变为 imp", async () => {
      const seats = official();
      const res = await runRole(scarletWomanAbility, seats, 1);
      const sw = seatAfter(res, 1);
      expect(sw?.role?.id, "❌ 猩红女郎未继任为恶魔（role.id 未替换）").toBe(
        "imp"
      );
      expect(sw?.roleType).toBe("demon");
      expect(sw?.isDemonSuccessor).toBe(true);
    });

    it("⭐ 差分：恶魔死后存活仅 3 人（死前 4 人）→ 不继任，角色不变", async () => {
      const seats = official().slice(0, 4); // imp(dead) sw baron empath → 存活 3
      const res = await runRole(scarletWomanAbility, seats, 1);
      expect(res.aborted, "❌ 存活不足时不得继任").toBe(true);
      expect(seatAfter(res, 1)?.role?.id).toBe("scarlet_woman");
    });

    it("⭐ 官方「旅行者不计算在内」：含旅行者导致存活非旅行者不足 → 不继任", async () => {
      const seats = [
        ...official().slice(0, 4), // imp(dead) sw baron empath → 存活非旅行者 3
        { ...seat(4, "empath"), role: { id: "scapegoat", name: "替罪羊", type: "traveler" } } as any,
      ];
      const res = await runRole(scarletWomanAbility, seats, 1);
      expect(res.aborted, "❌ 旅行者不得计入存活人数").toBe(true);
      expect(seatAfter(res, 1)?.role?.id).toBe("scarlet_woman");
    });

    it("⭐ 官方前提「能力正常生效」：醉酒的猩红女郎不继任", async () => {
      const seats = official().map((s) =>
        s.id === 1 ? { ...s, isDrunk: true } : s
      );
      const res = await runRole(scarletWomanAbility, seats, 1);
      expect(res.aborted).toBe(true);
      expect(seatAfter(res, 1)?.role?.id).toBe("scarlet_woman");
    });

    it("⭐ 继任后重置能力可用性（abilityUsed 回归 false）", async () => {
      const seats = official().map((s) =>
        s.id === 1
          ? {
              ...s,
              abilityUsed: true,
              statusEffects: [{ type: "butler_master", masterId: 0 }],
            }
          : s
      );
      const res = await runRole(scarletWomanAbility, seats, 1);
      const sw = seatAfter(res, 1);
      expect(sw?.role?.id).toBe("imp");
      expect(sw?.abilityUsed, "❌ 继任为恶魔后 abilityUsed 应重置为 false").toBe(
        false
      );
      expect(sw?.statusEffects).toHaveLength(1);
    });
  });
});

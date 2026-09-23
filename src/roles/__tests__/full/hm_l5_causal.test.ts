/**
 * L5 · 因果链测试 —— 凶宅魅影（21 角色）+ 无上愉悦（16 角色），共 **37 个唯一角色**
 * =====================================================================================
 * 本文件回答的问题是：**能力跑完后，世界真的变了吗？**
 *
 * 🔒 判据来源（逐条可回溯）
 *   · `src/data/officialRoleDocs.json`（官方角色文档，键为**中文名**）—— 唯一权威判据
 *   · `src/data/rolesData.json`（官方夜序表）
 *   · 每条缺陷标注 `文件:行号`
 *
 * 🔒 靶子安全（铁律）：击杀/状态类目标的普通配角固定用
 *   `chambermaid` / `chef` / `gossip` / `grandmother` / `tinker`（纯信息类、无免疫）。
 *   绝不使用 sailor / fool / tea_lady / pacifist / innkeeper / goon / moonchild。
 *
 * 🔒 三问（写每个用例前必答）
 *   ① 靶子安全 —— 见上
 *   ② 前提齐备 —— 显式传 snapshot 字段（如 `isKingKilledByDemon` / `outsiderDiedToday`）
 *   ③ 判据差分 —— 只断言**状态字段真的变化**（isDead / statusEffects / role.id …），
 *      并配负向对照；禁止锚文案
 *
 * ⚠️ 只加测试不改生产。本文件发现的实现缺陷用 `it.fails` 显式记录
 *    （模式见 skill §6.3：一旦生产修好，`it.fails` 会因"意外通过"而报错，提示更新），
 *    并逐条写入 `outputs/凶宅魅影与无上愉悦37角色待修点清单.md`。
 */
import { beforeEach, describe, expect, it } from "vitest";
import { board, runRole } from "../_tbHarness";
import { resetLimitedAbilityUses } from "../../../utils/LimitedAbilityManager";

/**
 * ⚠️ 限次能力（artist / seamstress / philosopher / juggler / assassin / professor …）的
 *   `instanceUses` / `globalUses` 是**模块级单例**，会**跨用例累积**。
 *   ⇒ 必须在每个用例前重置，否则「前一个用例用过、后一个用例被 preCheck 拒绝」
 *     （表现为 `abilityResult === undefined`）。
 *
 * ⚠️ 必须用**无参**调用清空全部：
 *   `resetLimitedAbilityUses(seatId, abilityId)` 只删 `instanceUses`、**不删 `globalUses`**
 *   （`LimitedAbilityManager.ts:171-172`）⇒ 对 `global: true` 的能力（如 `seamstress_check`）**重置无效**。
 *
 * ⚠️ 此前不暴露的原因：P0-A 修复前 `initializeLimitedAbilityManager()` 生产零调用
 *   ⇒ `definitions` 为空 ⇒ 校验恒真且**不记账** ⇒ 用例之间无状态污染。
 */
beforeEach(() => {
  resetLimitedAbilityUses();
});

// ── 凶宅魅影 21 角色 ────────────────────────────────────────────────
import { artistAbility } from "../../new_engine/artist.ability";
import { assassinAbility } from "../../new_engine/assassin.ability";
import { balloonistAbility } from "../../new_engine/balloonist.ability";
import { barberAbility } from "../../new_engine/barber.ability";
import { choirBoyAbility } from "../../new_engine/choir_boy.ability";
import { clockmakerAbility } from "../../new_engine/clockmaker.ability";
import { courtierAbility } from "../../new_engine/courtier.ability";
import { devils_advocateAbility } from "../../new_engine/devils_advocate.ability";
import { fang_guAbility } from "../../new_engine/fang_gu.ability";
import { foolAbility } from "../../new_engine/fool.ability";
import { godfatherAbility } from "../../new_engine/godfather.ability";
import { jugglerAbility } from "../../new_engine/juggler.ability";
import { mathematicianAbility } from "../../new_engine/mathematician.ability";
import { mutantAbility } from "../../new_engine/mutant.ability";
import { no_dashiiAbility } from "../../new_engine/no_dashii.ability";
import { philosopherAbility } from "../../new_engine/philosopher.ability";
import { pukkaAbility } from "../../new_engine/pukka.ability";
import { saintAbility } from "../../new_engine/saint.ability";
import { seamstressAbility } from "../../new_engine/seamstress.ability";
import { town_crierAbility } from "../../new_engine/town_crier.ability";
import { witchAbility } from "../../new_engine/witch.ability";
import { zombuulAbility } from "../../new_engine/zombuul.ability";
// ── 无上愉悦 16 角色 ────────────────────────────────────────────────
import { baronAbility } from "../../new_engine/baron.ability";
import { butlerAbility } from "../../new_engine/butler.ability";
import { chefAbility } from "../../new_engine/chef.ability";
import { drunkAbility } from "../../new_engine/drunk.ability";
import { empathAbility } from "../../new_engine/empath.ability";
import { fortuneTellerAbility } from "../../new_engine/fortune_teller.ability";
import { impAbility } from "../../new_engine/imp.ability";
import { investigatorAbility } from "../../new_engine/investigator.ability";
import { librarianAbility } from "../../new_engine/librarian.ability";
import { monkAbility } from "../../new_engine/monk.ability";
import { poisonerAbility } from "../../new_engine/poisoner.ability";
import { ravenkeeperAbility } from "../../new_engine/ravenkeeper.ability";
import {
  recluseAbility,
  resolveRecluseRegistration,
} from "../../new_engine/recluse.ability";
import { scarletWomanAbility } from "../../new_engine/scarlet_woman.ability";
import { washerwomanAbility } from "../../new_engine/washerwoman.ability";

// ══════════════════════════════════════════════════════════════════════
//  通用工具（只读断言，不改生产）
// ══════════════════════════════════════════════════════════════════════

/** 取管道返回快照里的座位 */
const seatAt = (res: any, id: number): any =>
  (res?.snapshot?.seats ?? []).find((s: any) => s.id === id);

/** 取某座位指定 type（可再限定 source）的状态效果 */
const effects = (
  res: any,
  id: number,
  type: string,
  source?: string
): any[] =>
  ((seatAt(res, id)?.statusEffects ?? []) as any[]).filter(
    (e) => e?.type === type && (source === undefined || e?.source === source)
  );

/** 座位上的语义字段差分（用于「不该发生时必须不发生」） */
const SEAT_KEYS = [
  "isDead",
  "markedForDeath",
  "isPoisoned",
  "isDrunk",
  "isCursed",
  "isProtected",
  "isExecutionProtected",
  "isEvilConverted",
  "role",
] as const;

function changedSeats(before: any[], after: any[]): string[] {
  const out: string[] = [];
  for (const b of before) {
    const a = after.find((x: any) => x.id === b.id);
    for (const k of SEAT_KEYS) {
      if (JSON.stringify(b?.[k]) !== JSON.stringify(a?.[k])) {
        out.push(`${b.id + 1}号.${k}`);
      }
    }
  }
  return out;
}

/** 给座位打上副作用（返回新数组，不改原数组） */
function withEffect(seats: any[], id: number, eff: any): any[] {
  return seats.map((s) =>
    s.id === id
      ? { ...s, statusEffects: [...(s.statusEffects ?? []), eff] }
      : s
  );
}

// 安全靶子（纯信息类 / 无免疫）
const SAFE2 = ["chambermaid", "chef"];
const SAFE3 = ["chambermaid", "chef", "gossip"];
const SAFE4 = ["chambermaid", "chef", "gossip", "tinker"];

// ══════════════════════════════════════════════════════════════════════
//  凶宅魅影 · 21 角色
// ══════════════════════════════════════════════════════════════════════
describe("L5 · 凶宅魅影（haunted_manor）21 角色因果链", () => {
  // ─────────────────────────────────────────────────────────────────
  // 1) 气球驾驶员 (balloonist)
  //    官方：「每个夜晚，你会得知一名与上个夜晚得知的玩家角色类型不同的玩家」
  // ─────────────────────────────────────────────────────────────────
  describe("① 气球驾驶员(balloonist)", () => {
    const L = () => board(["balloonist", ...SAFE4]);

    it("⭐ 主路径：得知一名玩家 + 得知事实落库（_abilityResults.balloonist）", async () => {
      const res = await runRole(balloonistAbility, L(), 0, {
        night: 1,
        phase: "firstNight",
      });
      const ar = res.meta.abilityResult;
      expect(res.aborted, "存活气球驾驶员不应中止").toBeFalsy();
      expect(ar.targetId, "必须得知一名玩家（targetId 非空）").not.toBeNull();
      expect(
        ["townsfolk", "outsider", "minion", "demon"],
        `得知的玩家角色类型必须合法，实得 ${ar.targetRoleType}`
      ).toContain(ar.targetRoleType);
      // ⭐ 状态落库（不是只有文案）
      const saved = res.snapshot._abilityResults?.balloonist;
      expect(saved?.night, "得知记录必须写入 snapshot._abilityResults").toBe(1);
      expect(saved?.roleType, "记录里的角色类型必须与结果一致").toBe(
        ar.targetRoleType
      );
    });

    it("⭐ 差分：上夜已得知「镇民」→ 本夜必须给出不同角色类型", async () => {
      const seats = L();
      const res = await runRole(balloonistAbility, seats, 0, {
        night: 2,
        phase: "night",
        snapshot: {
          _abilityResults: {
            balloonist_1: { targetId: 1, roleType: "townsfolk", night: 1 },
          },
        },
      });
      expect(res.meta.abilityResult.lastLearnedRoleType).toBe("townsfolk");
      expect(
        res.meta.abilityResult.targetRoleType,
        "官方：必须得知与上夜角色类型不同的玩家"
      ).not.toBe("townsfolk");
      expect(res.meta.isCorrupted).toBe(false);
    });

    it("⭐ 负向对照：中毒时 → isCorrupted=true（可给出同类型玩家）", async () => {
      const seats = withEffect(L(), 0, { type: "poisoned", source: "test" });
      const res = await runRole(balloonistAbility, seats, 0, {
        night: 2,
        phase: "night",
        snapshot: {
          _abilityResults: {
            balloonist_1: { targetId: 1, roleType: "townsfolk", night: 1 },
          },
        },
      });
      expect(res.meta.abilityEffective, "中毒时能力必须失效标记").toBe(false);
      expect(res.meta.isCorrupted, "中毒时信息受干扰标记必须为 true").toBe(true);
      expect(
        seatAt(res, 0)?.isDead,
        "中毒不得导致气球驾驶员死亡（不得产生硬效果）"
      ).toBe(false);
    });

    it("负向对照：死亡的气球驾驶员 → 管道中止，无任何信息", async () => {
      const seats = L();
      seats[0].isDead = true;
      const res = await runRole(balloonistAbility, seats, 0, {
        night: 2,
        phase: "night",
      });
      expect(res.aborted, "死亡角色必须中止").toBe(true);
      expect(res.meta.abilityResult).toBeUndefined();
      expect(res.snapshot._abilityResults?.balloonist).toBeUndefined();
    });

    it("⭐⭐ 候选池含**已死亡**玩家：官方「向气球驾驶员展示的玩家可以存活或死亡」", async () => {
      /**
       * ✅ 2026-09-22 按**官方原文**修正（原为 `it.fails` 登记「待修 P2」）。
       *
       * 官方【气球驾驶员】→【角色简介】（逐字）：
       *   「向气球驾驶员展示的玩家**可以存活或死亡**。」
       *   「向气球驾驶员展示的玩家可以善良或邪恶。」
       *
       * 🔴 缺陷形态：候选池写成 `snapshot.seats.filter(s => !s.isDead)`（纯存活池），
       *   且 `targetConfig.allowDead: false` ⇒ 说书人**无法**向气球驾驶员展示死者。
       *
       * ⚠️ **判据必须构造得能区分新旧实现**（本用例首版写错过，记下来）：
       *   无上夜记录时不按角色类型过滤，取 `candidateSeats[0]`（= 池内首个座位）。
       *   · 把气球驾驶员放在 **2 号**、让 **0 号死亡**：
       *       旧实现（纯存活池 `[1,2,3,4]`）⇒ 首个候选 = **1** ⇒ 本断言**红**
       *       修复后（`[0,1,2,3,4]`）      ⇒ 首个候选 = **0（死者）** ⇒ 本断言**绿**
       *   （若把气球驾驶员放在 0 号，池首永远是"自己" ⇒ 新旧实现都是 0 ⇒ **区分不出**，
       *     这正是我第一版写成 `targetId===1` 会假红的原因。）
       */
      const seats = board(["chef", "gossip", "balloonist", "tinker", "artist"]);
      seats[0].isDead = true; // 1号镇民已死

      const res = await runRole(balloonistAbility, seats, 2, {
        night: 2,
        phase: "night",
      });
      expect(
        res.meta.abilityResult.targetId,
        "官方允许展示死亡玩家，候选池不应排除死者（旧实现会给 1）"
      ).toBe(0);

      // 声明侧也要对（两处都改，避免只改一处又埋一个不一致）
      const tc: any = (balloonistAbility as any)?.targetConfig;
      expect(
        tc?.allowDead,
        "`targetConfig.allowDead` 应为 true —— 官方「可以存活或死亡」"
      ).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 2) 数学家 (mathematician)
  // ─────────────────────────────────────────────────────────────────
  describe("② 数学家(mathematician)", () => {
    it("⭐ 主路径：异常能力次数 = snapshot.abnormalAbilityCount，并落库", async () => {
      const res = await runRole(mathematicianAbility, board(["mathematician", ...SAFE4]), 0, {
        night: 2,
        phase: "night",
        snapshot: { abnormalAbilityCount: 3 },
      });
      expect(res.meta.abilityResult.abnormalCount).toBe(3);
      expect(res.meta.abilityResult.actualCount).toBe(3);
      expect(res.snapshot._abilityResults?.mathematician?.abnormalCount).toBe(3);
      // 注：数学家的 isCorrupted 只落在 abilityResult 内（mathematician.ability.ts:75-79），
      //     不像气球驾驶员那样另写一份 meta.isCorrupted —— 见审计清单 P3。
      expect(res.meta.abilityResult.isCorrupted).toBe(false);
    });

    it("⭐ 差分：改变配置（0 → 3）⇒ 结果必须变", async () => {
      const zero = await runRole(mathematicianAbility, board(["mathematician", ...SAFE4]), 0, {
        night: 2,
        phase: "night",
        snapshot: { abnormalAbilityCount: 0 },
      });
      const three = await runRole(mathematicianAbility, board(["mathematician", ...SAFE4]), 0, {
        night: 2,
        phase: "night",
        snapshot: { abnormalAbilityCount: 3 },
      });
      expect(zero.meta.abilityResult.abnormalCount).toBe(0);
      expect(three.meta.abilityResult.abnormalCount).toBe(3);
      expect(zero.meta.abilityResult.abnormalCount).not.toBe(
        three.meta.abilityResult.abnormalCount
      );
    });

    it("⭐ 负向对照：中毒时说书人指定假值 5 → 结果≠真值 3 且标受干扰", async () => {
      const seats = withEffect(
        board(["mathematician", ...SAFE4]),
        0,
        { type: "poisoned", source: "test" }
      );
      const res = await runRole(mathematicianAbility, seats, 0, {
        night: 2,
        phase: "night",
        snapshot: { abnormalAbilityCount: 3 },
        storytellerInput: { fakeResult: 5 },
      });
      expect(res.meta.abilityResult.abnormalCount).toBe(5);
      expect(res.meta.abilityResult.actualCount, "真值仍应可回溯").toBe(3);
      expect(res.meta.abilityResult.isCorrupted).toBe(true);
    });

    it("边界：1 名异常也是合法结果（0 与 1 不得混为一谈）", async () => {
      const res = await runRole(mathematicianAbility, board(["mathematician", ...SAFE4]), 0, {
        night: 2,
        phase: "night",
        snapshot: { abnormalAbilityCount: 1 },
      });
      expect(res.meta.abilityResult.abnormalCount).toBe(1);
      expect(res.meta.abilityResult.abnormalCount).not.toBe(0);
      expect(res.meta.abilityResult.isCorrupted).toBe(false);
    });

    // ⭐ 变异检验护栏（本轮补）：原来只测了「说书人指定假值」的分支，
    //    **自动挑选假值**的分支（pickFakeAbnormalCount）无人覆盖 ——
    //    把它的过滤条件 `n !== abnormalCount` 反转成 `===`，原用例全绿（假绿）。
    it("⭐ 变异检验护栏：中毒且未指定假值时，自动挑选的假值必须 ≠ 真值", async () => {
      const seats = withEffect(
        board(["mathematician", ...SAFE4]),
        0,
        { type: "poisoned", source: "test" }
      );
      const res = await runRole(mathematicianAbility, seats, 0, {
        night: 2,
        phase: "night",
        snapshot: { abnormalAbilityCount: 3 },
      });
      const shown = res.meta.abilityResult.abnormalCount;
      expect(res.meta.abilityResult.isCorrupted, "中毒 ⇒ 受干扰").toBe(true);
      expect(res.meta.abilityResult.actualCount, "真值仍应可回溯").toBe(3);
      expect(
        shown,
        `中毒时自动挑选的假值必须 ≠ 真值 3（实际给出 ${shown}）—— 过滤条件被反转`
      ).not.toBe(3);
      expect(shown, "假值必须落在 0~7 的合法报数域").toBeGreaterThanOrEqual(0);
      expect(shown).toBeLessThanOrEqual(7);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 3) 钟表匠 (clockmaker) —— 首夜一次
  // ─────────────────────────────────────────────────────────────────
  describe("③ 钟表匠(clockmaker)", () => {
    // 0钟表匠 1共情 2投毒 3男爵 4小恶魔 → 恶魔(4) 与爪牙(2,3) 最小环形距离 = 1
    const L = () => board(["clockmaker", "empath", "poisoner", "baron", "imp"]);

    it("⭐ 主路径：恶魔与爪牙最近环形距离 = 真值 1", async () => {
      const res = await runRole(clockmakerAbility, L(), 0, {
        night: 1,
        phase: "firstNight",
      });
      expect(res.aborted, "存活钟表匠不应中止").toBeFalsy();
      expect(
        res.meta.abilityResult,
        "环形距离真值应为 1（小恶魔与男爵相邻）"
      ).toBe(1);
      expect(res.meta.displayInfo.distance).toBe(1);
    });

    it("⭐ 差分：场上无爪牙 ⇒ 距离为 0（不是仍报 1）", async () => {
      const res = await runRole(
        clockmakerAbility,
        board(["clockmaker", "empath", "chef", "tinker", "imp"]),
        0,
        { night: 1, phase: "firstNight" }
      );
      expect(res.meta.abilityResult).toBe(0);
      expect(res.meta.abilityResult).not.toBe(1);
      expect(res.meta.displayInfo.type).toBe("clockmaker_info");
    });

    it("⭐ 负向对照：中毒 → 说书人指定假值 3，且假值 ≠ 真值 1", async () => {
      const seats = withEffect(L(), 0, { type: "poisoned", source: "test" });
      const res = await runRole(clockmakerAbility, seats, 0, {
        night: 1,
        phase: "firstNight",
        storytellerInput: { fakeResult: 3 },
      });
      expect(res.meta.abilityResult).toBe(3);
      expect(res.meta.abilityResult, "假值不得等于真值 1").not.toBe(1);
      expect(res.meta.isAbilityActive).toBe(false);
    });

    it("负向对照：死亡的钟表匠 → 中止，无信息", async () => {
      const seats = L();
      seats[0].isDead = true;
      const res = await runRole(clockmakerAbility, seats, 0, {
        night: 1,
        phase: "firstNight",
      });
      expect(res.aborted).toBe(true);
      expect(res.meta.abilityResult).toBeUndefined();
      expect(res.abortReason).toContain("死亡");
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 4) 女裁缝 (seamstress) —— 每局限一次，选两名玩家
  // ─────────────────────────────────────────────────────────────────
  describe("④ 女裁缝(seamstress)", () => {
    // 0女裁缝 1共情(good) 2投毒(evil) 3厨师(good)
    const L = () => board(["seamstress", "empath", "poisoner", "chef"]);

    it("⭐ 主路径：选两名善良 → sameAlignment=true，并落库", async () => {
      const res = await runRole(seamstressAbility, L(), 0, {
        night: 2,
        phase: "night",
        targets: [1, 3],
      });
      expect(res.aborted).toBeFalsy();
      expect(res.meta.abilityResult.actualSameAlignment).toBe(true);
      expect(res.meta.abilityResult.finalSameAlignment).toBe(true);
      expect(res.meta.abilityResult.targetId1).toBe(1);
      expect(res.meta.abilityResult.targetId2).toBe(3);
    });

    it("⭐ 差分：善良 + 邪恶 → sameAlignment=false", async () => {
      const res = await runRole(seamstressAbility, L(), 0, {
        night: 2,
        phase: "night",
        targets: [1, 2],
      });
      expect(res.meta.abilityResult.actualSameAlignment).toBe(false);
      expect(res.meta.abilityResult.finalSameAlignment).toBe(false);
      expect(res.meta.abilityResult.isTarget2Evil).toBe(true);
    });

    it("负向对照：只选 1 名 / 选择自己 → 必须中止（不得消耗也不得给信息）", async () => {
      const one = await runRole(seamstressAbility, L(), 0, {
        night: 2,
        phase: "night",
        targets: [1],
      });
      expect(one.aborted, "少于 2 名必须中止").toBe(true);
      const self = await runRole(seamstressAbility, L(), 0, {
        night: 2,
        phase: "night",
        targets: [0, 1],
      });
      expect(self.aborted, "选择自己必须中止").toBe(true);
      expect(self.meta.abilityResult).toBeUndefined();
    });

    it("⭐ 负向对照：中毒 → 真实答案被取反（true → false）", async () => {
      const seats = withEffect(L(), 0, { type: "poisoned", source: "test" });
      const res = await runRole(seamstressAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [1, 3],
      });
      expect(res.meta.abilityResult.actualSameAlignment, "真值仍是同阵营").toBe(true);
      expect(
        res.meta.abilityResult.finalSameAlignment,
        "官方：中毒时必须给出 100% 错误信息 → 取反"
      ).toBe(false);
      expect(res.meta.isCorrupted).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 5) 杂耍艺人 (juggler) —— 首个白天一次
  // ─────────────────────────────────────────────────────────────────
  describe("⑤ 杂耍艺人(juggler)", () => {
    // 0杂耍 1共情 2投毒 3厨师
    const L = () => board(["juggler", "empath", "poisoner", "chef"]);

    it("⭐ 主路径：从猜测记录算出猜对数（真值 1），并落库", async () => {
      const res = await runRole(jugglerAbility, L(), 0, {
        night: 1,
        phase: "day",
        snapshot: {
          dayCount: 1,
          jugglerGuesses: [{ targetSeatId: 1, roleName: "共情者" }],
        },
      });
      expect(res.aborted).toBeFalsy();
      expect(res.meta.abilityResult.realCount, "猜对 1 个（2号 确为共情者）").toBe(1);
      expect(res.meta.abilityResult.correctCount).toBe(1);
      expect(res.snapshot._abilityResults?.juggler?.correctCount).toBe(1);
    });

    it("⭐ 差分：猜错角色名 ⇒ 猜对数必须变 0", async () => {
      const res = await runRole(jugglerAbility, L(), 0, {
        night: 1,
        phase: "day",
        snapshot: {
          dayCount: 1,
          jugglerGuesses: [{ targetSeatId: 1, roleName: "士兵" }],
        },
      });
      expect(res.meta.abilityResult.realCount).toBe(0);
      expect(res.meta.abilityResult.realCount).not.toBe(1);
      expect(res.meta.abilityResult.correctCount).toBe(0);
    });

    it("负向对照：非首个白天（dayCount=2）→ 管道中止", async () => {
      const res = await runRole(jugglerAbility, L(), 0, {
        night: 2,
        phase: "day",
        snapshot: {
          dayCount: 2,
          jugglerGuesses: [{ targetSeatId: 1, roleName: "共情者" }],
        },
      });
      expect(res.aborted, "官方：仅在首个白天可以猜测").toBe(true);
      expect(res.meta.abilityResult).toBeUndefined();
      expect(res.abortReason).toContain("首个白天");
    });

    it("⭐ 负向对照：中毒 → 告知数字 ≠ 真实猜对数（互斥）", async () => {
      const seats = withEffect(L(), 0, { type: "poisoned", source: "test" });
      const res = await runRole(jugglerAbility, seats, 0, {
        night: 1,
        phase: "day",
        snapshot: {
          dayCount: 1,
          jugglerGuesses: [{ targetSeatId: 1, roleName: "共情者" }],
        },
      });
      expect(res.meta.abilityResult.realCount).toBe(1);
      expect(
        res.meta.abilityResult.correctCount,
        "中毒时告知的数字不得等于真实猜对数"
      ).not.toBe(res.meta.abilityResult.realCount);
      expect(res.meta.isCorrupted).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 6) 哲学家 (philosopher) —— 首日一次，选一个镇民角色
  // ─────────────────────────────────────────────────────────────────
  describe("⑥ 哲学家(philosopher)", () => {
    it("⭐ 主路径：选择的角色不在场 → 获得其能力（acquiredAbilities 落库）", async () => {
      const res = await runRole(
        philosopherAbility,
        board(["philosopher", ...SAFE4]),
        0,
        { phase: "day", storytellerInput: { chosenRoleId: "soldier" } }
      );
      const self = seatAt(res, 0);
      expect(res.meta.abilityResult.used).toBe(true);
      expect(res.meta.abilityResult.roleInPlay).toBe(false);
      expect(self?.philosopherGainedRole).toBe("soldier");
      expect(self?.acquiredAbilities).toContain("soldier");
      expect(self?.isDrunk, "所选角色不在场 ⇒ 哲学家人不醉酒").toBe(false);
    });

    it("⭐ 差分：所选角色在场 → 那名玩家进入醉酒状态（isDrunk + drunk 效果）", async () => {
      // 0哲学家 1厨师（扮演被选角色）
      const res = await runRole(
        philosopherAbility,
        board(["philosopher", "chef", ...SAFE3]),
        0,
        { phase: "day", storytellerInput: { chosenRoleId: "chef" } }
      );
      const dup = seatAt(res, 1);
      expect(res.meta.abilityResult.roleInPlay).toBe(true);
      expect(res.meta.abilityResult.duplicateSeatId).toBe(1);
      expect(dup?.isDrunk, "官方：该角色在场 ⇒ 该玩家醉酒").toBe(true);
      expect(effects(res, 1, "drunk", "philosopher").length).toBe(1);
    });

    it("负向对照：未选择角色 → used=false，且不写入任何能力", async () => {
      const res = await runRole(philosopherAbility, board(["philosopher", ...SAFE4]), 0, {
        phase: "day",
      });
      expect(res.meta.abilityResult.used).toBe(false);
      expect(res.meta.abilityResult.chosenRoleId).toBeNull();
      expect(seatAt(res, 0)?.acquiredAbilities).toBeUndefined();
    });

    it(
      "✅ 已修 P0-A+P1：哲学家「每局限一次」必须真的生效（第二次发动被拒绝）",
      async () => {
        /**
         * ✅ 2026-09-21 修复（双重根因均已消除）：
         *  ① P0 —— `initializeLimitedAbilityManager()`（`LimitedAbilityManager.ts:98`）
         *     此前**全仓零调用点** ⇒ `definitions` 表为空 ⇒ 校验恒真且不记账。
         *     ⇒ 已在 `LimitedAbilityManager.ts` 末尾加**模块级自初始化**（幂等）修复。
         *  ② P1 —— 调用 id `"philosopher_gain"` 与定义表登记的 `"philosopher_use"` 不一致
         *     ⇒ 已把定义表对齐为 `"philosopher_gain"`。
         *   ⇒ 本用例由 `it.fails`（期望失败）**反转为正向断言**。
         */
        const seats = board(["philosopher", ...SAFE4]);
        await runRole(philosopherAbility, seats, 0, {
          phase: "day",
          storytellerInput: { chosenRoleId: "soldier" },
        });
        const second = await runRole(philosopherAbility, seats, 0, {
          phase: "day",
          storytellerInput: { chosenRoleId: "chef" },
        });
        expect(second.aborted, "每局限一次，二次必须中止").toBe(true);
        expect(second.meta.abilityResult).toBeUndefined();
        expect(second.abortReason).toContain("已经使用过");
      }
    );
  });

  // ─────────────────────────────────────────────────────────────────
  // 7) 艺术家 (artist) —— 每局限一次，白天问一个是非题
  // ─────────────────────────────────────────────────────────────────
  describe("⑦ 艺术家(artist)", () => {
    it("⭐ 主路径：提问与答案落库", async () => {
      const res = await runRole(artistAbility, board(["artist", ...SAFE4]), 0, {
        phase: "day",
        storytellerInput: { question: "恶魔在奇数位吗", answer: "否" },
      });
      expect(res.aborted).toBeFalsy();
      expect(res.meta.abilityResult.question).toBe("恶魔在奇数位吗");
      expect(res.meta.abilityResult.answer).toBe("否");
      expect(res.snapshot._abilityResults?.artist?.answer).toBe("否");
      expect(res.meta.abilityResult.isCorrupted).toBe(false);
    });

    it("⭐ 负向对照：中毒 → isCorrupted=true（答案可能是假）", async () => {
      const seats = withEffect(board(["artist", ...SAFE4]), 0, {
        type: "poisoned",
        source: "test",
      });
      const res = await runRole(artistAbility, seats, 0, {
        phase: "day",
        storytellerInput: { question: "Q", answer: "A" },
      });
      expect(res.meta.abilityResult.isCorrupted).toBe(true);
      expect(res.meta.abilityEffective).toBe(false);
      expect(seatAt(res, 0)?.isDead).toBe(false);
    });

    it(
      "✅ 已修 P0-A：艺术家「每局限一次」必须真的生效（第二次提问被拒绝）",
      async () => {
        /**
         * ✅ 2026-09-21 修复（P0-A）：
         *   `initializeLimitedAbilityManager()`（`LimitedAbilityManager.ts:98`）此前在
         *   `src/` 下**零调用** ⇒ `definitions` 为空 ⇒ `resolveDef()` 返回 undefined
         *   ⇒ `canUseLimitedAbility` / `consumeLimitedAbility` 直接 `return true`（且不记账）
         *   ⇒ 艺术家可无限次提问。
         *   现已在 `LimitedAbilityManager.ts` 末尾加**模块级自初始化**（幂等）修复。
         *   ⇒ 本用例由 `it.fails`（期望失败）**反转为正向断言**：
         *     第二次提问必须被 `preCheck` 拒绝。
         */
        const seats = board(["artist", ...SAFE4]);
        await runRole(artistAbility, seats, 0, {
          phase: "day",
          storytellerInput: { question: "Q1", answer: "A1" },
        });
        const second = await runRole(artistAbility, seats, 0, {
          phase: "day",
          storytellerInput: { question: "Q2", answer: "A2" },
        });
        expect(second.aborted).toBe(true);
        expect(second.meta.abilityResult).toBeUndefined();
        expect(second.abortReason).toContain("已经使用过");
      }
    );

    it("负向对照：死亡的艺术家 → 中止", async () => {
      const seats = board(["artist", ...SAFE4]);
      seats[0].isDead = true;
      const res = await runRole(artistAbility, seats, 0, {
        phase: "day",
        storytellerInput: { question: "Q", answer: "A" },
      });
      expect(res.aborted).toBe(true);
      expect(res.meta.abilityResult).toBeUndefined();
      expect(effects(res, 0, "poisoned").length).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 8) 城镇公告员 (town_crier) —— 每夜得知今天是否有爪牙提名
  // ─────────────────────────────────────────────────────────────────
  describe("⑧ 城镇公告员(town_crier)", () => {
    const L = () => board(["town_crier", ...SAFE4]);

    it("⭐ 主路径：今天有爪牙提名 → true，并落库", async () => {
      const res = await runRole(town_crierAbility, L(), 0, {
        night: 2,
        phase: "night",
        snapshot: { minionNominatedToday: true },
      });
      expect(res.meta.abilityResult.minionNominated).toBe(true);
      expect(res.snapshot._abilityResults?.town_crier?.minionNominated).toBe(true);
      expect(res.meta.isCorrupted).toBe(false);
    });

    it("⭐ 差分：今天无爪牙提名 → false", async () => {
      const res = await runRole(town_crierAbility, L(), 0, {
        night: 2,
        phase: "night",
        snapshot: { minionNominatedToday: false },
      });
      expect(res.meta.abilityResult.minionNominated).toBe(false);
      expect(res.meta.isCorrupted).toBe(false);
      expect(res.meta.displayInfo.type).toBe("town_crier_info");
    });

    it("⭐ 负向对照：中毒 → 真值被取反（true → false）", async () => {
      const seats = withEffect(L(), 0, { type: "poisoned", source: "test" });
      const res = await runRole(town_crierAbility, seats, 0, {
        night: 2,
        phase: "night",
        snapshot: { minionNominatedToday: true },
      });
      expect(res.meta.isCorrupted).toBe(true);
      expect(
        res.meta.abilityResult.minionNominated,
        "中毒时给出与真值相反的信息"
      ).toBe(false);
      expect(res.meta.isPoisoned).toBe(true);
    });

    it("负向对照：死亡的城镇公告员 → 中止", async () => {
      const seats = L();
      seats[0].isDead = true;
      const res = await runRole(town_crierAbility, seats, 0, {
        night: 2,
        phase: "night",
      });
      expect(res.aborted).toBe(true);
      expect(res.meta.abilityResult).toBeUndefined();
      expect(res.abortReason).toContain("死亡");
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 9) 侍臣 (courtier) —— 每局限一次，使某个角色醉酒三天三夜
  // ─────────────────────────────────────────────────────────────────
  describe("⑨ 侍臣(courtier)", () => {
    const L = () => board(["courtier", "chef", "poisoner", "empath", "imp"]);

    it("⭐ 主路径：目标角色在场 → 该玩家 isDrunk + drunk(courtier) 效果（3 夜）+ 侍臣已用", async () => {
      const res = await runRole(courtierAbility, L(), 0, {
        night: 1,
        phase: "firstNight",
        storytellerInput: { targetRoleId: "chef" },
      });
      const target = seatAt(res, 1);
      expect(res.meta.abilityResult.effective).toBe(true);
      expect(target?.isDrunk, "官方：目标角色在场 ⇒ 该玩家醉酒").toBe(true);
      const eff = effects(res, 1, "drunk", "courtier");
      expect(eff.length).toBe(1);
      expect(eff[0].duration, "官方：醉酒三天三夜").toBe(3);
      expect(seatAt(res, 0)?.hasUsedAbility, "侍臣能力被消耗").toBe(true);
    });

    it("⭐ 差分：目标角色不在场 → 无人醉酒，但能力照样被消耗", async () => {
      const res = await runRole(courtierAbility, L(), 0, {
        night: 1,
        phase: "firstNight",
        storytellerInput: { targetRoleId: "soldier" },
      });
      expect(res.meta.abilityResult.targetInPlay).toBe(false);
      expect(res.meta.abilityResult.effective).toBe(false);
      expect(
        (res.snapshot.seats ?? []).some((s: any) => s.isDrunk === true),
        "角色不在场 ⇒ 不得有人醉酒"
      ).toBe(false);
      expect(seatAt(res, 0)?.hasUsedAbility).toBe(true);
    });

    it("⭐ 负向对照：中毒的侍臣 → 目标不得醉酒（但能力被消耗）", async () => {
      const seats = withEffect(L(), 0, { type: "poisoned", source: "test" });
      const res = await runRole(courtierAbility, seats, 0, {
        night: 1,
        phase: "firstNight",
        storytellerInput: { targetRoleId: "chef" },
      });
      expect(res.meta.abilityResult.isAbilityActive).toBe(false);
      expect(res.meta.abilityResult.targetInPlay, "目标在场仍应记录").toBe(true);
      expect(
        effects(res, 1, "drunk", "courtier").length,
        "中毒时不得放置醉酒标记"
      ).toBe(0);
    });

    it("边界：死亡的侍臣 → 中止", async () => {
      const seats = L();
      seats[0].isDead = true;
      const res = await runRole(courtierAbility, seats, 0, {
        night: 1,
        phase: "firstNight",
        storytellerInput: { targetRoleId: "chef" },
      });
      expect(res.aborted).toBe(true);
      expect(res.abortReason).toContain("死亡");
      expect(effects(res, 1, "drunk", "courtier").length).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 10) 唱诗男孩 (choir_boy) —— 国王被恶魔杀死时得知恶魔
  // ─────────────────────────────────────────────────────────────────
  describe("⑩ 唱诗男孩(choir_boy)", () => {
    // 0唱诗男孩 1厨师 2修补匠（代替国王位）3投毒者 4小恶魔
    // ⚠️ `king` 不在 `app/data.ts` 的角色表内（该剧本用旗标 `isKingKilledByDemon`
    //    表达"国王被恶魔杀死"，因此这里用普通镇民占位即可）
    const L = () => board(["choir_boy", "chef", "tinker", "poisoner", "imp"]);

    it("⭐ 主路径：国王被恶魔杀死 → 得知真恶魔座位（事实正确性）", async () => {
      const res = await runRole(choirBoyAbility, L(), 0, {
        night: 2,
        phase: "night",
        snapshot: { isKingKilledByDemon: true },
      });
      expect(res.aborted).toBeFalsy();
      expect(res.meta.abilityResult.demonFound).toBe(true);
      expect(
        res.meta.abilityResult.demonSeatId,
        "必须指向真正的恶魔座位（4号）"
      ).toBe(4);
      expect(res.snapshot._abilityResults?.choirBoy?.demonSeatId).toBe(4);
    });

    it("⭐ 负向对照：国王没有被恶魔杀死 → 中止，无任何信息", async () => {
      const res = await runRole(choirBoyAbility, L(), 0, {
        night: 2,
        phase: "night",
        snapshot: { isKingKilledByDemon: false },
      });
      expect(res.aborted, "条件不满足必须中止").toBe(true);
      expect(res.meta.abilityResult).toBeUndefined();
      expect(res.snapshot._abilityResults?.choirBoy).toBeUndefined();
    });

    it("⭐ 负向对照：中毒 → 指出的玩家 ≠ 真恶魔", async () => {
      const seats = withEffect(L(), 0, { type: "poisoned", source: "test" });
      const res = await runRole(choirBoyAbility, seats, 0, {
        night: 2,
        phase: "night",
        snapshot: { isKingKilledByDemon: true },
      });
      expect(res.meta.isCorrupted).toBe(true);
      expect(
        res.meta.abilityResult.demonSeatId,
        "中毒时不得指出真恶魔（官方范例：指向食人族玩家）"
      ).not.toBe(4);
      expect(res.meta.abilityResult.demonSeatId).not.toBeNull();
    });

    it("⭐⭐ 事件触发角色**不得**出现在静态夜序表：官方「如果恶魔杀死了国王」才唤醒", async () => {
      /**
       * ✅ 2026-09-22 按**官方**修正（原为 `it.fails` 登记「待修 P1」）。
       *
       * 官方【唱诗男孩】：「**如果恶魔杀死了国王**，你会得知哪名玩家是恶魔。[+国王]」
       *   ⇒ **事件触发**（国王死亡时才唤醒），官方夜序表
       *     （`src/data/rolesData.json::otherNightOrder`）给出 **0 = 无常驻夜间槽位**。
       *
       * 🔴 缺陷形态：`choir_boy.ability.ts` 申报 `otherNightPriority: 84`
       *   ⇒ 静态队列**每夜**都排它（说书人每夜看到多余步骤）。
       * ✅ 修法：① 申报值归 **0**；② 动态唤醒由
       *   `deathEventWatch: { roleId: "king" }` 负责
       *   （`dynamicQueueGenerator::resolveDeathEventWakeups` 在国王死亡当晚插入队列，
       *    且静态队列**自动排除**声明了 deathEventWatch 的角色）。
       *
       * ⚠️ 判据说明（首版写错、记下来）：`buildFullNightOrder()` 对
       *   `priority > 0` 才生成条目 ⇒ 归零后 choir_boy **根本不在表里**
       *   （`find()` 返回 `undefined`）⇒ **不能断言 `otherNightPriority === 0`**，
       *   正确的官方契约是「**不出现在静态夜序表**」= `toBeUndefined()`。
       */
      const { buildFullNightOrder } = await import(
        "../../../utils/invariantTesting/engineConfig"
      );
      const e = buildFullNightOrder().find((x: any) => x.roleId === "choir_boy");
      expect(
        e,
        "唱诗男孩是事件触发角色，不应出现在静态夜序表（官方 rolesData.otherNightOrder = 0）"
      ).toBeUndefined();
      // 正向对照：确认它确实**申报了动态唤醒钩子**（不是"删掉了就绿"）
      expect(
        (choirBoyAbility as any).deathEventWatch?.roleId,
        "必须以 deathEventWatch 订阅国王死亡，否则事件触发路径丢失"
      ).toBe("king");
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 11) 畸形秀演员 (mutant) —— 被动；真实路径是日间门禁（LEGACY）
  // ─────────────────────────────────────────────────────────────────
  describe("⑪ 畸形秀演员(mutant)", () => {
    it("⭐ 主路径：已暴露身份 → snapshot.mutantRevealed 落库", async () => {
      const res = await runRole(mutantAbility, board(["mutant", ...SAFE4]), 0, {
        night: 2,
        phase: "night",
        storytellerInput: { mutantRevealed: true },
      });
      expect(res.meta.abilityResult.mutantRevealed).toBe(true);
      expect(res.meta.abilityResult.canBeExecuted).toBe(true);
      expect(res.snapshot.mutantRevealed).toBe(true);
      expect(res.snapshot._abilityResults?.mutant?.mutantRevealed).toBe(true);
    });

    it("⭐ 负向对照：未暴露 → 不写入任何快照标记", async () => {
      const res = await runRole(mutantAbility, board(["mutant", ...SAFE4]), 0, {
        night: 2,
        phase: "night",
      });
      expect(res.meta.abilityResult.mutantRevealed).toBe(false);
      expect(res.meta.abilityResult.canBeExecuted).toBe(false);
      expect(res.snapshot.mutantRevealed).toBeUndefined();
    });

    it("负向对照：死亡的畸形秀演员 → 中止", async () => {
      const seats = board(["mutant", ...SAFE4]);
      seats[0].isDead = true;
      const res = await runRole(mutantAbility, seats, 0, {
        night: 2,
        phase: "night",
        storytellerInput: { mutantRevealed: true },
      });
      expect(res.aborted).toBe(true);
      expect(res.snapshot.mutantRevealed).toBeUndefined();
      expect(res.abortReason).toContain("死亡");
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 12) 理发师 (barber) —— 死亡当晚，恶魔可交换两名玩家角色
  // ─────────────────────────────────────────────────────────────────
  describe("⑫ 理发师(barber)", () => {
    // 0理发师 1厨师 2共情者 3投毒者 4小恶魔
    const L = () => board(["barber", "chef", "empath", "poisoner", "imp"]);

    it("⭐ 主路径：指定两名玩家 → 两座位 role 真的互换", async () => {
      const seats = L();
      const beforeA = seats[1].role.id;
      const beforeB = seats[2].role.id;
      const res = await runRole(barberAbility, seats, 0, {
        night: 2,
        phase: "night",
        storytellerInput: { swapA: 1, swapB: 2 },
      });
      expect(res.meta.abilityResult.swapped).toBe(true);
      expect(seatAt(res, 1)?.role?.id, "1 号应拿到原 2 号的角色").toBe(beforeB);
      expect(seatAt(res, 2)?.role?.id, "2 号应拿到原 1 号的角色").toBe(beforeA);
      expect(seatAt(res, 1)?.role?.id).not.toBe(beforeA);
    });

    it("⭐ 负向对照：未指定交换对象 → 谁的角色都不变，也不记账", async () => {
      const seats = L();
      const before = JSON.parse(JSON.stringify(seats));
      const res = await runRole(barberAbility, seats, 0, {
        night: 2,
        phase: "night",
      });
      expect(res.meta.abilityResult.swapped).toBe(false);
      expect(res.snapshot.barberSwap).toBeUndefined();
      expect(
        changedSeats(before, res.snapshot.seats).filter((c) => c.endsWith(".role")),
        "未指定交换时不得改动任何角色"
      ).toEqual([]);
    });

    it("边界：交换不得就地修改入参座位数组（不可变性）", async () => {
      const seats = L();
      const beforeA = seats[1].role.id;
      const beforeB = seats[2].role.id;
      const res = await runRole(barberAbility, seats, 0, {
        night: 2,
        phase: "night",
        storytellerInput: { swapA: 1, swapB: 2 },
      });
      expect(seats[1].role.id, "原数组不得被就地改写（A）").toBe(beforeA);
      expect(seats[2].role.id, "原数组不得被就地改写（B）").toBe(beforeB);
      expect(seatAt(res, 1)?.role?.id).toBe(beforeB);
    });

    it(
      "✅ 已修 P1（2026-09-21）：理发师是「夜晚死亡才触发」⇒ triggerTiming=ON_DEATH ⇒ deathTriggered 门控生效",
      async () => {
        const { buildFullNightOrder } = await import(
          "../../../utils/invariantTesting/engineConfig"
        );
        const e = buildFullNightOrder().find((x: any) => x.roleId === "barber");
        expect(
          e?.deathTriggered,
          "理发师必须受「夜晚死亡」门控（deathTriggered=true）"
        ).toBe(true);
      }
    );
  });

  // ─────────────────────────────────────────────────────────────────
  // 13) 弄臣 (fool) —— 首次被处决不死
  // ─────────────────────────────────────────────────────────────────
  describe("⑬ 弄臣(fool)", () => {
    it("⭐ 主路径：存活且今日被处决 → 免死生效：不死亡 + foolUsed 落库", async () => {
      const seats = board(["fool", ...SAFE4]);
      // 处决结算会把 executedToday 挂到被处决者座位上（useGameController.ts:509-515）
      seats[0] = { ...seats[0], executedToday: true };
      const res = await runRole(foolAbility, seats, 0, {
        night: 2,
        phase: "night",
      });
      expect(res.aborted, "存活弄臣不应中止").toBeFalsy();
      // ⭐ 状态落库（不是只有文案）
      expect(res.meta.abilityResult.survived, "免死必须真的生效").toBe(true);
      const self = seatAt(res, 0);
      expect(self?.isDead, "官方：首次被处决时不会死亡").toBe(false);
      expect(self?.foolUsed, "免死已用标记必须落库").toBe(true);
      expect(self?.hasUsedFoolAbility).toBe(true);
      expect(res.snapshot._abilityResults?.fool?.survived).toBe(true);
    });

    it("⭐ 负向对照：免死已用尽 → 必须中止且状态零改动", async () => {
      const seats = board(["fool", ...SAFE4]);
      seats[0] = { ...seats[0], executedToday: true, foolUsed: true };
      const res = await runRole(foolAbility, seats, 0, {
        night: 2,
        phase: "night",
      });
      expect(res.aborted, "免死已用尽必须中止（不得再救）").toBe(true);
      expect(res.abortReason, "中止理由必须说明免死已失效/已使用").toContain(
        "免死"
      );
      expect(
        seatAt(res, 0)?.isDead,
        "中止后不得改动死亡状态（免死不得二次生效）"
      ).toBe(false);
      expect(res.meta.abilityResult).toBeUndefined();
    });

    it("边界：弄臣在能力触发前已死亡 → 中止（不得误免死）", async () => {
      const seats = board(["fool", ...SAFE4]);
      seats[0] = { ...seats[0], isDead: true };
      const res = await runRole(foolAbility, seats, 0, {
        night: 2,
        phase: "night",
      });
      expect(res.aborted).toBe(true);
      expect(res.abortReason).toContain("已死亡");
      expect(seatAt(res, 0)?.foolUsed, "不得凭空消耗免死").toBeUndefined();
      expect(res.snapshot._abilityResults?.fool).toBeUndefined();
    });

    /**
     * ✅ 2026-09-22 **已修**（原为 `it.fails` 登记「免死能力零接线」）—— 现转为正向断言。
     *
     * 原登记的两条根因**都已消除**：
     *   ① 处决流程不再「绕过」弄臣 —— `killPlayer`（处决 + 能力击杀的唯一咽喉）
     *      现在会在 `commitSeats` **之前** `canFoolSurvive(...)` 提前返回
     *      （见 `useGameController.ts::killPlayer` 的详细注释）。
     *   ② `preCheck` 与「处决先置 `isDead=true`」的互斥**不再成立**：
     *      被免死挡下的处决**根本不会**把弄臣置为 `isDead` ⇒ 不存在那个冲突状态。
     *
     * ⚠️ 原 body 构造的是「弄臣已被置为 `isDead=true, executedToday=true` 再跑管道」
     *   —— 修复后这是一个**不可达状态**；若继续用 `it.fails` 会退化成
     *   「永远失败 ⇒ 恒过」的**无意义登记**（假绿的温和形态）⇒ 改为断言**可达**契约。
     *
     * 🔎 本用例同时覆盖**消费**（官方：免死只生效一次）——
     *   这正是另一处缺口：`foolUsed` 的生产写入点原本只有 PASSIVE 的 `fool.ability.ts`，
     *   恶魔夜杀路径从不消费 ⇒ 弄臣对恶魔击杀**永久免疫**。
     *   修法：管道后置中间件 `createFoolImmunityConsumer`（`middlewarePipeline.ts`，
     *   由 `buildAbilityPipe` 注入，`preview` 时被跳过 ⇒ 不会出现「提示 ≠ 结算」）。
     */
    it("✅ 弄臣首次免死已接线：存活 + 未被保护 ⇒ 恶魔击杀后**不死且必须消费**免死", async () => {
      const seats = board(["fang_gu", "fool", ...SAFE4]);
      const res = await runRole(fang_guAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [1],
      });
      const f = seatAt(res, 1);
      expect(f?.isDead, "官方：首次面临死亡的弄臣不会死亡").toBe(false);
      expect(
        f?.foolUsed,
        "首次免死后必须消费 foolUsed —— 未消费 ⇒ 弄臣对恶魔击杀永久免疫"
      ).toBe(true);
      expect(f?.hasUsedFoolAbility).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 14) 圣徒 (saint，外来者) —— 被处决则邪恶获胜
  // ─────────────────────────────────────────────────────────────────
  describe("⑭ 圣徒(saint，外来者)", () => {
    it("⭐ 主路径：被处决 → gamePhase=gameOver 且 winner=evil（状态落库）", async () => {
      const seats = board(["saint", ...SAFE4]);
      seats[0] = { ...seats[0], isDead: true, executedToday: true };
      const res = await runRole(saintAbility, seats, 0, {
        phase: "day",
      });
      expect(res.aborted).toBeFalsy();
      expect(res.snapshot.gamePhase, "官方：宣布游戏结束").toBe("gameOver");
      expect(res.snapshot.gameResult?.winner).toBe("evil");
      expect(res.snapshot.gameResult?.reason).toContain("圣徒");
    });

    it("⭐ 负向对照：圣徒未被处决 → 中止，游戏不得结束", async () => {
      const seats = board(["saint", ...SAFE4]);
      const res = await runRole(saintAbility, seats, 0, { phase: "day" });
      expect(res.aborted).toBe(true);
      expect(res.snapshot.gamePhase).not.toBe("gameOver");
      expect(res.snapshot.gameResult).toBeUndefined();
    });

    it("⭐ 边界：圣徒中毒/醉酒时被处决 → 诅咒仍生效（角色固有规则）", async () => {
      const seats = withEffect(board(["saint", ...SAFE4]), 0, {
        type: "poisoned",
        source: "test",
      });
      seats[0] = { ...seats[0], isDead: true, executedToday: true };
      const res = await runRole(saintAbility, seats, 0, { phase: "day" });
      expect(res.meta.isAbilityActive, "官方：固有规则不受醉酒中毒影响").toBe(true);
      expect(res.snapshot.gamePhase).toBe("gameOver");
      expect(res.snapshot.gameResult?.winner).toBe("evil");
    });

    it("⭐⭐ 官方契约成立 + 钉住架构债：外来者版 saint 走 legacy 通路，行为已双重覆盖", async () => {
      /**
       * ✅ 2026-09-22 复核结论（原为 `it.fails` 登记「待修 P1」，**判据错位**）：
       *
       * 官方【圣徒】（逐字）：「如果你死于处决，你的阵营落败。」
       *   官方【角色简介】：「如果圣徒因处决而死亡，游戏结束。善良阵营落败，邪恶阵营获胜。」
       *   「如果圣徒因处决**以外**的任何方式死亡——例如被恶魔杀死——游戏仍会继续。」
       *
       * **官方规则层面无缺陷** —— 行为已被两处独立覆盖：
       *   ① `src/roles/__tests__/full_game_lifecycle.test.ts`「圣徒被处决 → 邪恶阵营胜利」
       *      （**legacy `checkGameEnd`** 通路，即生产实际走的那条）
       *   ② 本文件 ⑭「主路径：被处决 → gameOver + winner=evil」（新引擎 `saintAbility`）
       *
       * ⚠️ 唯余**架构债**（**不是**官方规则缺陷，故不再用 `it.fails` 冒充"待修缺陷"）：
       *   `saint.ability.ts` 注册的 `roleId` 是 `saint_townsfolk`（**镇民版**圣徒），
       *   而凶宅魅影/窃窃私语用的是**外来者版** `saint`
       *   ⇒ `isRoleMigrated("saint") === false` ⇒ 生产对该角色走 legacy 通路（行为正确）。
       *   若将来要让外来者圣徒也走新引擎，应**新增** `roleId: "saint"` 的注册，
       *   **不要**把 `saint_townsfolk` 改名（会打断镇民版）。
       *
       * ⇒ 本条改为：**断言官方契约成立** + **钉住架构债现状**
       *   （若哪天完成迁移，这条会红并提醒同步更新说明 —— 这是我们要的棘轮行为）。
       */
      const { isRoleMigrated } = await import("../../../utils/nightInfoAdapter");
      expect(
        isRoleMigrated("saint"),
        "⚠️ 架构债（非官方缺陷）：外来者版 saint 未迁新引擎（saint.ability.ts 注册为 saint_townsfolk）" +
          "⇒ 生产走 legacy 通路；官方行为由 full_game_lifecycle + 本文件 ⑭ 双重覆盖。" +
          "若已迁移到新引擎 ⇒ 请把本条改成 isRoleMigrated===true 并更新说明。"
      ).toBe(false);

      // ⭐ 官方契约（必须成立的那件事）：死于处决 ⇒ 游戏结束、邪恶获胜
      const seats = board(["saint", ...SAFE4]);
      seats[0] = { ...seats[0], isDead: true, executedToday: true };
      const res = await runRole(saintAbility, seats, 0, { phase: "day" });
      expect(res.snapshot.gamePhase, "官方：宣布游戏结束").toBe("gameOver");
      expect(res.snapshot.gameResult?.winner, "官方：善良落败、邪恶获胜").toBe("evil");

      // ⭐ 官方负向：非处决死因 ⇒ 游戏继续（不得误判终局）
      const seats2 = board(["saint", ...SAFE4]);
      seats2[0] = { ...seats2[0], isDead: true }; // 已死但**非处决**
      const res2 = await runRole(saintAbility, seats2, 0, { phase: "day" });
      expect(
        res2.aborted,
        "官方：圣徒因处决以外的方式死亡 ⇒ 游戏仍会继续（能力不应触发）"
      ).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 15) 女巫 (witch) —— 每夜诅咒；仅剩 3 名存活时失去能力
  // ─────────────────────────────────────────────────────────────────
  describe("⑮ 女巫(witch)", () => {
    // 0女巫 1厨师 2共情者 3投毒者 4小恶魔（存活 5 人）
    const L = () => board(["witch", "chef", "empath", "poisoner", "imp"]);

    it("⭐ 主路径：诅咒目标 → isCursed + cursed(witch) 效果落库", async () => {
      const res = await runRole(witchAbility, L(), 0, {
        night: 2,
        phase: "night",
        targets: [1],
      });
      const target = seatAt(res, 1);
      expect(res.meta.abilityResult.cursed).toBe(true);
      expect(target?.isCursed).toBe(true);
      expect(effects(res, 1, "cursed", "witch").length).toBe(1);
      expect(res.snapshot.witchCurse?.[1]).toBe(true);
    });

    it("⭐ 负向对照：仅剩 3 名存活玩家 → 女巫失去能力，管道中止", async () => {
      const seats = L();
      seats[2].isDead = true;
      seats[3].isDead = true;
      const res = await runRole(witchAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [1],
      });
      expect(res.aborted, "官方：只剩三名存活玩家时失去此能力").toBe(true);
      expect(seatAt(res, 1)?.isCursed).toBeUndefined();
      expect(res.abortReason).toContain("3");
    });

    // ⭐ 变异检验护栏（本轮补）：原来只测了「3 人存活 ⇒ 中止」这一侧，
    //    阈值从 `<= 3` 放宽到 `<= 4` 时原用例**照样绿**（3<=4 仍然中止）。
    //    必须补「4 人存活 ⇒ 仍然有效」才能把阈值钉死。
    it("⭐ 变异检验护栏：仅剩 4 名存活玩家时女巫仍然有效（阈值必须是 3，不得放宽）", async () => {
      const seats = L();
      seats[3].isDead = true; // 5 名存活 → 4 名存活
      const res = await runRole(witchAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [1],
      });
      expect(
        res.aborted,
        "官方只规定「只有三名存活的玩家」时失去能力 —— 4 名存活时仍须正常诅咒"
      ).toBe(false);
      expect(
        seatAt(res, 1)?.isCursed,
        "4 名存活时诅咒必须真的落库"
      ).toBe(true);
    });

    it("边界：只改了目标一人（不得污染其他座位）", async () => {
      const res = await runRole(witchAbility, L(), 0, {
        night: 2,
        phase: "night",
        targets: [1],
      });
      for (const sid of [0, 2, 3, 4]) {
        expect(
          seatAt(res, sid)?.isCursed,
          `${sid + 1}号 不应被诅咒`
        ).toBeUndefined();
      }
      expect(effects(res, 1, "cursed", "witch").length).toBe(1);
    });

    it(
      "✅ 已修 P0-B：中毒的女巫**不得**施加诅咒（stateUpdate 已消费 abilityEffective）",
      async () => {
        /**
         * ✅ 2026-09-21 修复：`witch.ability.ts` 的 `stateUpdate` 此前**完全不读**
         *   `ctx.meta.abilityEffective`（全文件计数 0）⇒ 中毒/醉酒的女巫照样把目标
         *   标成 `isCursed` 并写 `snapshot.witchCurse`；
         *   而 `useNightActionHandler.ts:1542-1546` 会把 `witchCurse` 桥接成 legacy
         *   `witchCursedId`，再由 `useDayActions.ts:226-228` 在**白天提名时真的杀人**。
         *   ⇒ 已在 `stateUpdate` 开头加门控（blocked 分支**不写 `seats`、不写 `witchCurse`**）。
         *   ⇒ 本用例由 `it.fails`（期望失败）**反转为正向断言**。
         */
        const seats = withEffect(L(), 0, { type: "poisoned", source: "test" });
        const res = await runRole(witchAbility, seats, 0, {
          night: 2,
          phase: "night",
          targets: [1],
        });
        expect(res.meta.abilityEffective, "（前置）中毒 ⇒ abilityEffective=false").toBe(
          false
        );
        // 官方「被诅咒」标记放置条件：若此时女巫醉酒中毒，不放置该标记
        expect(
          seatAt(res, 1)?.isCursed,
          "中毒女巫不得放置诅咒标记"
        ).not.toBe(true);
      }
    );
  });

  // ─────────────────────────────────────────────────────────────────
  // 16) 教父 (godfather) —— 白天有外来者死亡才杀人
  // ─────────────────────────────────────────────────────────────────
  describe("⑯ 教父(godfather)", () => {
    const L = () => board(["godfather", ...SAFE4]);

    it("⭐ 主路径：今天有外来者死亡 → 目标死亡且有来源标记", async () => {
      const res = await runRole(godfatherAbility, L(), 0, {
        night: 2,
        phase: "night",
        targets: [1],
        snapshot: { outsiderDiedToday: true },
      });
      const target = seatAt(res, 1);
      expect(res.meta.abilityResult.killed).toBe(true);
      expect(target?.isDead, "教父击杀必须落地死亡").toBe(true);
      expect(target?.deathSource, "死亡来源必须可追溯").toBe("godfather_kill");
      expect(res.snapshot.lastKill?.minionRole).toBe("godfather");
    });

    it("⭐ 负向对照：今天没有外来者死亡 → 中止，无人死亡", async () => {
      const seats = L();
      const before = JSON.parse(JSON.stringify(seats));
      const res = await runRole(godfatherAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [1],
        snapshot: { outsiderDiedToday: false },
      });
      expect(res.aborted, "官方：只有外来者白天死亡时才能行动").toBe(true);
      expect(changedSeats(before, res.snapshot.seats)).toEqual([]);
      expect(seatAt(res, 1)?.isDead).toBe(false);
    });

    it("负向对照：死亡的教父 → 中止", async () => {
      const seats = L();
      seats[0].isDead = true;
      const res = await runRole(godfatherAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [1],
        snapshot: { outsiderDiedToday: true },
      });
      expect(res.aborted).toBe(true);
      expect(seatAt(res, 1)?.isDead).toBe(false);
      expect(res.abortReason).toContain("死亡");
    });

    it(
      "✅ 已修 P0-B：中毒的教父**不得**杀人（stateUpdate 已消费 abilityEffective）",
      async () => {
        const seats = withEffect(L(), 0, { type: "poisoned", source: "test" });
        const res = await runRole(godfatherAbility, seats, 0, {
          night: 2,
          phase: "night",
          targets: [1],
          snapshot: { outsiderDiedToday: true },
        });
        expect(res.meta.abilityEffective).toBe(false);
        // 官方「死亡」标记放置条件：教父未醉酒中毒
        expect(seatAt(res, 1)?.isDead, "中毒教父不得杀死玩家").toBe(false);
      }
    );
  });

  // ─────────────────────────────────────────────────────────────────
  // 17) 刺客 (assassin) —— 每局限一次，无视保护杀人
  // ─────────────────────────────────────────────────────────────────
  describe("⑰ 刺客(assassin)", () => {
    const L = () => board(["assassin", ...SAFE4]);

    it("⭐ 主路径：无视保护杀死目标（死亡来源可追溯）", async () => {
      const res = await runRole(assassinAbility, L(), 0, {
        night: 2,
        phase: "night",
        targets: [1],
      });
      const target = seatAt(res, 1);
      expect(res.meta.assassinationSuccess).toBe(true);
      expect(target?.isDead).toBe(true);
      expect(target?.deathSource).toBe("assassin_kill");
      expect(target?.assassinated).toBe(true);
    });

    it("⭐ 负向对照：首夜 → 中止（官方：刺客首夜不行动）", async () => {
      const res = await runRole(assassinAbility, L(), 0, {
        night: 1,
        phase: "firstNight",
        targets: [1],
        snapshot: { isFirstNight: true },
      });
      expect(res.aborted).toBe(true);
      expect(seatAt(res, 1)?.isDead).toBe(false);
      expect(res.abortReason).toContain("首夜");
    });

    it("⭐ 负向对照：中毒 → 暗杀失败（目标不死），但能力仍被消耗", async () => {
      const seats = withEffect(L(), 0, { type: "poisoned", source: "test" });
      const res = await runRole(assassinAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [1],
      });
      expect(res.meta.assassinationSuccess).toBe(false);
      expect(seatAt(res, 1)?.isDead, "中毒刺客不得杀死目标").toBe(false);
      expect(seatAt(res, 1)?.assassinated).toBeUndefined();
    });

    it("边界：不选目标（min=0）→ 不消耗能力", async () => {
      const res = await runRole(assassinAbility, L(), 0, {
        night: 2,
        phase: "night",
        targets: [],
      });
      expect(res.meta.assassinationSuccess).toBeUndefined();
      expect(
        (res.snapshot.seats ?? []).some((s: any) => s.isDead === true),
        "未选择目标时不得有人死亡"
      ).toBe(false);
      expect(changedSeats(board(["assassin", ...SAFE4]), res.snapshot.seats)).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 18) 魔鬼代言人 (devils_advocate) —— 保护目标次日免于处决
  // ─────────────────────────────────────────────────────────────────
  describe("⑱ 魔鬼代言人(devils_advocate)", () => {
    const L = () => board(["devils_advocate", ...SAFE4]);

    it("⭐ 主路径：目标获得处决保护（状态 + 效果落库）", async () => {
      const res = await runRole(devils_advocateAbility, L(), 0, {
        night: 2,
        phase: "night",
        targets: [1],
      });
      const target = seatAt(res, 1);
      expect(res.meta.abilityResult.protected).toBe(true);
      expect(target?.isExecutionProtected).toBe(true);
      expect(effects(res, 1, "execution_protected", "devils_advocate").length).toBe(1);
      expect(res.snapshot.lastDevilsAdvocateTarget).toBe(1);
    });

    it("⭐ 负向对照：连续两晚选择同一名存活玩家 → 中止", async () => {
      const res = await runRole(devils_advocateAbility, L(), 0, {
        night: 3,
        phase: "night",
        targets: [1],
        snapshot: { lastDevilsAdvocateTarget: 1 },
      });
      expect(res.aborted, "官方：不能连续两晚选择同一名玩家").toBe(true);
      expect(res.abortReason).toContain("连续");
      expect(seatAt(res, 1)?.isExecutionProtected).toBeUndefined();
    });

    it("⭐ 负向对照：中毒 → 不新增保护（其余座位的旧保护被清理）", async () => {
      const seats = withEffect(L(), 0, { type: "poisoned", source: "test" });
      const res = await runRole(devils_advocateAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [1],
      });
      expect(res.meta.abilityResult.protected).toBe(false);
      expect(
        effects(res, 1, "execution_protected", "devils_advocate").length,
        "中毒时不得新增处决保护"
      ).toBe(0);
      expect(seatAt(res, 1)?.isExecutionProtected).toBe(false);
    });

    it("边界：未选择目标 → 不快照记账，无保护", async () => {
      const res = await runRole(devils_advocateAbility, L(), 0, {
        night: 2,
        phase: "night",
        targets: [],
      });
      expect(res.snapshot.lastDevilsAdvocateTarget).toBeUndefined();
      expect(
        (res.snapshot.seats ?? []).some((s: any) => s.isExecutionProtected === true)
      ).toBe(false);
      expect(res.meta.abilityResult?.protected).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 19) 诺-达鲺 (no_dashii) —— 杀人 + 邻近两名镇民中毒
  // ─────────────────────────────────────────────────────────────────
  describe("⑲ 诺-达鲺(no_dashii)", () => {
    // 0诺-达 1共情者(镇民) 2厨师(镇民) 3投毒者 4方古
    const L = () => board(["no_dashii", "empath", "chef", "poisoner", "fang_gu"]);

    it("⭐ 主路径：目标死亡 + 邻近镇民中毒（状态落库）", async () => {
      const res = await runRole(no_dashiiAbility, L(), 0, {
        night: 2,
        phase: "night",
        targets: [2],
      });
      expect(res.meta.abilityResult.killed).toBe(true);
      expect(seatAt(res, 2)?.isDead, "被选中的玩家必须死亡").toBe(true);
      expect(seatAt(res, 2)?.deathSource).toBe("no_dashii_kill");
      const adjacent: number[] = res.meta.abilityResult.poisonedAdjacent;
      expect(adjacent.length, "官方：总是有两名最近的镇民中毒").toBe(2);
      for (const sid of adjacent) {
        expect(
          effects(res, sid, "poisoned", "no_dashii").length,
          `${sid + 1}号 应带诺-达鲺中毒标记`
        ).toBe(1);
      }
    });

    it("⭐ 负向对照：目标被保护 → 不死，但邻近镇民照样中毒", async () => {
      const seats = withEffect(L(), 2, { type: "protected", source: "monk" });
      const res = await runRole(no_dashiiAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [2],
      });
      expect(res.meta.abilityResult.killed).toBe(false);
      expect(res.meta.abilityResult.blockedByProtection).toBe(true);
      expect(seatAt(res, 2)?.isDead, "受保护目标不得死亡").toBe(false);
      expect(res.meta.abilityResult.poisonedAdjacent.length).toBe(2);
    });

    it(
      "✅ 已修 P0-B：中毒的诺-达鲺**不得**杀人也不得下毒",
      async () => {
        const seats = withEffect(L(), 0, { type: "poisoned", source: "test" });
        const res = await runRole(no_dashiiAbility, seats, 0, {
          night: 2,
          phase: "night",
          targets: [2],
        });
        expect(res.meta.abilityEffective).toBe(false);
        expect(seatAt(res, 2)?.isDead, "中毒恶魔不得杀人").toBe(false);
      }
    );

    it("⭐⭐ 中毒对象：官方「无论这些镇民是存活还是死亡」⇒ **已死亡的最近镇民也要中毒**", async () => {
      /**
       * ✅ 2026-09-22 按**官方原文**修正（原为 `it.fails` 登记「待修 P1」）。
       *
       * 官方【诺-达鲺】→【角色简介】（逐字）：
       *   「在诺-达鲺顺时针和逆时针方向上最近的镇民中毒，
       *     **无论这些镇民是存活还是死亡**。……
       *     总是会有两名镇民玩家因此中毒，诺-达鲺的效果会跳过与他相邻的非镇民角色。」
       *
       * 🔴 缺陷形态：`snvMechanics.getNoDashiiPoisonTargets` 曾用 `!s.isDead` 过滤
       *   ⇒ 跳过「已死亡的最近镇民」继续往外找 ⇒ **中毒对象错位**
       *   （本该中毒的死镇民没被标记、更远的活镇民被误标），
       *   且与官方「**总是**两名镇民中毒」不符。
       */
      const seats = L();
      seats[1].isDead = true; // 2号共情者（镇民）已死
      const res = await runRole(no_dashiiAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [2],
      });
      expect(
        res.meta.abilityResult.poisonedAdjacent,
        "官方：死亡的镇民同样要被诺-达鲺标记中毒（不得跳过它去找更远的人）"
      ).toContain(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 20) 方古 (fang_gu) —— 杀外来者 ⇒ 转化 + 原方古死亡
  // ─────────────────────────────────────────────────────────────────
  describe("⑳ 方古(fang_gu)", () => {
    // 0方古 1理发师(外来者) 2共情者 3厨师 4投毒者
    const L = () => board(["fang_gu", "barber", "empath", "chef", "poisoner"]);

    it("⭐ 主路径：击杀非外来者 → 目标死亡，方古不死", async () => {
      const res = await runRole(fang_guAbility, L(), 0, {
        night: 2,
        phase: "night",
        targets: [2],
      });
      expect(res.meta.abilityResult.killed).toBe(true);
      expect(seatAt(res, 2)?.isDead).toBe(true);
      expect(seatAt(res, 2)?.deathSource).toBe("fang_gu_kill");
      expect(seatAt(res, 0)?.isDead, "非外来者 ⇒ 不触发转化，方古存活").toBe(false);
    });

    it("⭐ 差分：击杀外来者 → 目标变方古（不死亡）且原方古死亡", async () => {
      const res = await runRole(fang_guAbility, L(), 0, {
        night: 2,
        phase: "night",
        targets: [1],
      });
      const converted = seatAt(res, 1);
      expect(res.meta.abilityResult.becomesFangGu).toBe(true);
      expect(converted?.role?.id, "外来者必须变成方古").toBe("fang_gu");
      expect(converted?.isDead, "转化的外来者不死亡").toBe(false);
      expect(converted?.isEvilConverted).toBe(true);
      expect(seatAt(res, 0)?.isDead, "官方：原来的方古代替他死亡").toBe(true);
      expect(res.snapshot.fangGuHasJumped).toBe(true);
    });

    it("⭐ 负向对照：已跳变过一次 → 再次击杀外来者时正常死亡", async () => {
      const res = await runRole(fang_guAbility, L(), 0, {
        night: 3,
        phase: "night",
        targets: [1],
        snapshot: { fangGuHasJumped: true },
      });
      expect(res.meta.abilityResult.becomesFangGu).toBe(false);
      expect(seatAt(res, 1)?.isDead, "限一次用尽 ⇒ 外来者正常死亡").toBe(true);
      expect(seatAt(res, 1)?.role?.id).toBe("barber");
      expect(seatAt(res, 0)?.isDead).toBe(false);
    });

    it(
      "✅ 已修 P0-B：中毒的方古**不得**击杀外来者、也不得触发转化",
      async () => {
        const seats = withEffect(L(), 0, { type: "poisoned", source: "test" });
        const res = await runRole(fang_guAbility, seats, 0, {
          night: 2,
          phase: "night",
          targets: [2],
        });
        expect(res.meta.abilityEffective).toBe(false);
        expect(seatAt(res, 2)?.isDead, "中毒方古不得杀人").toBe(false);
      }
    );
  });

  // ─────────────────────────────────────────────────────────────────
  // 21) 普卡 (pukka) —— 今晚下毒；上一名中毒者毒发死亡
  // ─────────────────────────────────────────────────────────────────
  describe("㉑ 普卡(pukka)", () => {
    const L = () => board(["pukka", ...SAFE4]);

    it("⭐ 主路径：新目标中毒（写入普卡中毒标记）", async () => {
      const res = await runRole(pukkaAbility, L(), 0, {
        night: 2,
        phase: "night",
        targets: [1],
      });
      const t = seatAt(res, 1);
      expect(t?.isPoisoned, "官方：所选玩家中毒").toBe(true);
      expect(
        (t?.statusDetails ?? []).some((d: any) =>
          typeof d === "string" ? d.includes("普卡中毒") : d?.source === "pukka"
        ),
        "必须写入普卡中毒标记"
      ).toBe(true);
      expect(t?.isDead, "新中毒者当晚不死亡").toBe(false);
    });

    it("⭐ 差分：上一名中毒者毒发死亡 + 中毒标记被清除", async () => {
      const seats = board(["pukka", ...SAFE4]);
      seats[1] = {
        ...seats[1],
        statusDetails: ["普卡中毒（永久）"],
        isPoisoned: true,
      };
      const res = await runRole(pukkaAbility, seats, 0, {
        night: 3,
        phase: "night",
        targets: [2],
      });
      const old = seatAt(res, 1);
      expect(old?.isDead, "官方：上个因你中毒的玩家会死亡").toBe(true);
      expect(old?.deathSource).toBe("pukka_poison_death");
      expect(old?.isPoisoned, "毒发后恢复健康").toBe(false);
      expect(
        (old?.statusDetails ?? []).some((d: any) =>
          typeof d === "string" ? d.includes("普卡中毒") : d?.source === "pukka"
        ),
        "中毒标记应被清除"
      ).toBe(false);
    });

    it("⭐ 负向对照：中毒的普卡 → 新目标不得中毒（能力失效）", async () => {
      const seats = withEffect(L(), 0, { type: "poisoned", source: "test" });
      const res = await runRole(pukkaAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [1],
      });
      expect(res.meta.abilityEffective).toBe(false);
      expect(seatAt(res, 1)?.isPoisoned, "中毒普卡不得让目标中毒").not.toBe(true);
      expect(seatAt(res, 1)?.isDead).toBe(false);
    });

    // ⭐ 变异检验护栏（本轮补）：原「差分」用例把旧中毒标记写成**字符串** `"普卡中毒（永久）"`，
    //    于是 `d?.source === "pukka"` 这条**对象分支**无人覆盖 ——
    //    把它改成 `"pukka_x"` 原用例照样绿（假绿）。
    it("⭐ 变异检验护栏：旧中毒标记写成对象 {source:'pukka'} 时同样要毒发死亡", async () => {
      const seats = board(["pukka", ...SAFE4]);
      seats[1] = {
        ...seats[1],
        statusDetails: [{ source: "pukka", note: "普卡中毒" }],
        isPoisoned: true,
      };
      const res = await runRole(pukkaAbility, seats, 0, {
        night: 3,
        phase: "night",
        targets: [2],
      });
      expect(res.meta.abilityEffective, "（前置）清醒普卡 ⇒ 能力生效").toBe(true);
      expect(
        seatAt(res, 1)?.isDead,
        "官方：新目标被下毒时，上一名中毒者当晚死亡 ⇒ 对象形态的旧标记必须同样被识别"
      ).toBe(true);
      expect(
        ((seatAt(res, 1)?.statusDetails ?? []) as any[]).some(
          (d: any) => typeof d !== "string" && d?.source === "pukka"
        ),
        "毒发后必须清掉普卡中毒标记"
      ).toBe(false);
    });

    it("负向对照：未选择目标 → 中止", async () => {
      const res = await runRole(pukkaAbility, L(), 0, {
        night: 2,
        phase: "night",
        targets: [],
      });
      expect(res.aborted).toBe(true);
      expect(res.abortReason).toBeTruthy();
      expect(
        (res.snapshot.seats ?? []).some((s: any) => s.isDead === true)
      ).toBe(false);
    });

    it("⭐⭐ 醉酒夜的普卡**不得**让旧中毒者毒发；且中毒标记必须保留（官方：恢复清醒后仍会杀他）", async () => {
      /**
       * ✅ 2026-09-22 按**官方原文**修正（原为 `it.fails` 登记「待修 P1」）。
       *
       * 官方【普卡】→【角色简介】（逐字）：
       *   「如果**普卡在上一个夜晚选择玩家时是清醒的，但是当晚醉酒了，该玩家不会死亡**。
       *     但是当普卡恢复清醒，中毒效果会恢复，且会在随后的夜晚杀死该玩家。」
       *
       * 🔴 缺陷形态：`pukka.ability.ts` 的「旧目标毒发」分支**没读 `isAbilityEffective`**
       *   ⇒ 醉/毒的普卡当晚照样让旧目标毒发身亡（而同一函数「下毒」那一支是读了门控的）。
       */
      const seats = board(["pukka", ...SAFE4]);
      seats[1] = {
        ...seats[1],
        statusDetails: ["普卡中毒（永久）"],
        isPoisoned: true,
      };
      seats[0] = { ...seats[0], isDrunk: true };
      const res = await runRole(pukkaAbility, seats, 0, {
        night: 3,
        phase: "night",
        targets: [2],
      });
      expect(res.meta.abilityEffective).toBe(false);
      // 官方：「…但是当晚醉酒了，该玩家不会死亡」
      expect(
        seatAt(res, 1)?.isDead,
        "醉酒普卡当晚不得让旧中毒者死亡"
      ).toBe(false);
      // 官方：「当普卡恢复清醒，中毒效果会恢复，且会在**随后的夜晚**杀死该玩家」
      // ⇒ 本次只跳过毒发，**中毒标记不能清**
      const marks: any[] = seatAt(res, 1)?.statusDetails ?? [];
      expect(
        marks.some((d: any) =>
          typeof d === "string" ? d.includes("普卡中毒") : d?.source === "pukka"
        ),
        "中毒标记被清掉了 —— 普卡恢复清醒后就再也杀不死他了（应保留标记、只跳过本次毒发）"
      ).toBe(true);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════
//  无上愉悦（high_pleasure）· 16 角色（与凶宅魅影**零重叠**）
// ══════════════════════════════════════════════════════════════════════
describe("L5 · 无上愉悦（high_pleasure）16 角色因果链", () => {
  // ─────────────────────────────────────────────────────────────────
  // 1) 洗衣妇 (washerwoman) —— 首夜：一名镇民玩家 + 干扰项
  //    官方：「你在首个夜晚得知一名镇民玩家。」
  // ─────────────────────────────────────────────────────────────────
  describe("① 洗衣妇(washerwoman)", () => {
    // 0洗衣妇 1厨师 2侍女 3八卦男 4修补匠
    const L = () => board(["washerwoman", "chef", "chambermaid", "gossip", "tinker"]);
    const preset = { seat1: 1, seat2: 2, roleName: "厨师" };

    it("⭐ 主路径：预置信息原样落地（座位 + 角色名 + 落库 + 落座标记）", async () => {
      const res = await runRole(washerwomanAbility, L(), 0, {
        night: 1,
        phase: "firstNight",
        meta: { initialNightInfo: { washerwomanInfo: preset } },
      });
      expect(res.aborted, "存活洗衣妇首夜不应中止").toBeFalsy();
      expect(res.meta.abilityResult.seat1).toBe(1);
      expect(res.meta.abilityResult.seat2).toBe(2);
      expect(res.meta.abilityResult.roleName).toBe("厨师");
      // ⭐ 状态落库（不是只有文案）
      expect(res.snapshot._abilityResults?.washerwoman?.roleName).toBe("厨师");
      // ⭐ 落座标记写在 seat.statusDetails（utils/seatMarks.ts 唯一通路）
      expect(seatAt(res, 1)?.statusDetails ?? []).toContain("洗衣目标");
      expect(seatAt(res, 2)?.statusDetails ?? []).toContain("洗衣目标");
      expect(seatAt(res, 3)?.statusDetails ?? []).not.toContain("洗衣目标");
      expect(res.meta.isCorrupted).toBe(false);
    });

    it("⭐ 差分：换预置角色名 ⇒ 结果与落库同步改变", async () => {
      const a = await runRole(washerwomanAbility, L(), 0, {
        night: 1,
        phase: "firstNight",
        meta: { initialNightInfo: { washerwomanInfo: preset } },
      });
      const b = await runRole(washerwomanAbility, L(), 0, {
        night: 1,
        phase: "firstNight",
        meta: {
          initialNightInfo: {
            washerwomanInfo: { seat1: 3, seat2: 4, roleName: "占卜师" },
          },
        },
      });
      expect(a.meta.abilityResult.roleName).toBe("厨师");
      expect(b.meta.abilityResult.roleName).toBe("占卜师");
      expect(a.meta.abilityResult.seat1).not.toBe(b.meta.abilityResult.seat1);
      expect(a.snapshot._abilityResults?.washerwoman?.roleName).not.toBe(
        b.snapshot._abilityResults?.washerwoman?.roleName
      );
    });

    it("⭐ 负向对照：中毒 → 信息受干扰（且假角色名 ≠ 真值）", async () => {
      const seats = withEffect(L(), 0, { type: "poisoned", source: "test" });
      const res = await runRole(washerwomanAbility, seats, 0, {
        night: 1,
        phase: "firstNight",
        meta: { initialNightInfo: { washerwomanInfo: preset } },
      });
      expect(res.meta.abilityEffective).toBe(false);
      expect(res.meta.isCorrupted).toBe(true);
      expect(res.meta.washerwomanResult.isCorrupted).toBe(true);
      expect(
        res.meta.abilityResult.roleName,
        "中毒时不得给出真值（否则等于明示自己中毒）"
      ).not.toBe("厨师");
      expect(
        seatAt(res, 0)?.isDead,
        "中毒不得产生硬效果（洗衣妇不得死亡）"
      ).toBe(false);
    });

    it("边界：非首夜 → 管道中止，无任何信息落库", async () => {
      const res = await runRole(washerwomanAbility, L(), 0, {
        night: 2,
        phase: "night",
      });
      expect(res.aborted).toBe(true);
      expect(res.abortReason).toContain("非首夜");
      expect(res.meta.abilityResult).toBeUndefined();
      expect(res.snapshot._abilityResults?.washerwoman).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 2) 调查员 (investigator) —— 首夜：一名爪牙玩家 + 干扰项
  //    官方：「你在首个夜晚得知一名爪牙角色。」
  // ─────────────────────────────────────────────────────────────────
  describe("② 调查员(investigator)", () => {
    const L = () => board(["investigator", "poisoner", "chambermaid", "gossip", "tinker"]);

    it("⭐ 主路径：预置信息落地 + 落库 hasMinion + 落座标记", async () => {
      const res = await runRole(investigatorAbility, L(), 0, {
        night: 1,
        phase: "firstNight",
        meta: {
          initialNightInfo: {
            investigatorInfo: { seat1: 1, seat2: 2, roleName: "投毒者" },
          },
        },
      });
      expect(res.aborted).toBeFalsy();
      expect(res.meta.abilityResult.roleName).toBe("投毒者");
      expect(res.meta.abilityResult.seat1).toBe(1);
      expect(res.meta.abilityResult.seat2).toBe(2);
      expect(res.actionNode.meta.investigatorResult.hasMinion).toBe(true);
      expect(res.snapshot._abilityResults?.investigator?.seat1).toBe(1);
      expect(seatAt(res, 1)?.statusDetails ?? []).toContain("调查目标");
      expect(seatAt(res, 2)?.statusDetails ?? []).toContain("调查目标");
    });

    it("⭐ 边界：场上无爪牙（roleName 为空）→ hasMinion=false 且不落座标记", async () => {
      const res = await runRole(investigatorAbility, L(), 0, {
        night: 1,
        phase: "firstNight",
        meta: {
          initialNightInfo: {
            investigatorInfo: { seat1: undefined, seat2: undefined, roleName: "" },
          },
        },
      });
      expect(res.meta.abilityResult.roleName).toBe("");
      expect(res.actionNode.meta.investigatorResult.hasMinion).toBe(false);
      expect(seatAt(res, 1)?.statusDetails ?? []).not.toContain("调查目标");
      expect(seatAt(res, 2)?.statusDetails ?? []).not.toContain("调查目标");
    });

    it("⭐ 负向对照：中毒 → isCorrupted=true 且爪牙名 ≠ 真值", async () => {
      const seats = withEffect(L(), 0, { type: "poisoned", source: "test" });
      const res = await runRole(investigatorAbility, seats, 0, {
        night: 1,
        phase: "firstNight",
        meta: {
          initialNightInfo: {
            investigatorInfo: { seat1: 1, seat2: 2, roleName: "投毒者" },
          },
        },
      });
      expect(res.meta.abilityEffective).toBe(false);
      expect(res.meta.isCorrupted).toBe(true);
      expect(res.meta.abilityResult.roleName).not.toBe("投毒者");
      expect(res.actionNode.meta.investigatorResult.isCorrupted).toBe(true);
    });

    it("边界：非首夜 → 管道中止", async () => {
      const res = await runRole(investigatorAbility, L(), 0, {
        night: 2,
        phase: "night",
      });
      expect(res.aborted).toBe(true);
      expect(res.abortReason).toContain("非首夜");
      expect(res.meta.abilityResult).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 3) 厨师 (chef) —— 首夜：邪恶相邻对数（圆形座位，死亡也计入）
  //    官方：「你在首个夜晚得知邪恶玩家相邻而坐的对数。」
  // ─────────────────────────────────────────────────────────────────
  describe("③ 厨师(chef)", () => {
    // 0厨师 1投毒 2小恶魔 3侍女 4八卦男 → 唯一邪恶对 = (投毒,小恶魔)
    const L1 = () => board(["chef", "poisoner", "imp", "chambermaid", "tinker"]);
    // 0厨师 1投毒 2小恶魔 3男爵 4侍女 → 邪恶对 = (投毒,小恶魔) + (小恶魔,男爵)
    const L2 = () => board(["chef", "poisoner", "imp", "baron", "chambermaid"]);

    it("⭐ 主路径：邪恶相邻对数 = 真值 1，并落库", async () => {
      const res = await runRole(chefAbility, L1(), 0, {
        night: 1,
        phase: "firstNight",
      });
      expect(res.aborted).toBeFalsy();
      expect(res.meta.abilityResult, "投毒者与小恶魔相邻 ⇒ 1 对").toBe(1);
      expect(res.meta.abilityResultTrue, "真值必须可回溯").toBe(1);
      expect(res.actionNode.meta.chefResult.evilPairCount).toBe(1);
      expect(res.snapshot._abilityResults?.chef).toBe(1);
      expect(res.meta.isCorrupted).toBe(false);
    });

    it("⭐ 差分：多一名与恶魔相邻的爪牙 ⇒ 对数 1 → 2", async () => {
      const one = await runRole(chefAbility, L1(), 0, {
        night: 1,
        phase: "firstNight",
      });
      const two = await runRole(chefAbility, L2(), 0, {
        night: 1,
        phase: "firstNight",
      });
      expect(one.meta.abilityResult).toBe(1);
      expect(two.meta.abilityResult).toBe(2);
      expect(two.snapshot._abilityResults?.chef).toBe(2);
    });

    it("⭐ 负向对照：中毒 + 说书人预设假值 5 → 结果是 5、真值仍可回溯、标受干扰", async () => {
      const seats = withEffect(L1(), 0, { type: "poisoned", source: "test" });
      const res = await runRole(chefAbility, seats, 0, {
        night: 1,
        phase: "firstNight",
        storytellerInput: { fakeResult: 5 },
      });
      expect(res.meta.abilityEffective).toBe(false);
      expect(res.meta.abilityResult).toBe(5);
      expect(res.meta.abilityResultTrue, "真值不得被假值覆盖").toBe(1);
      expect(res.meta.isCorrupted).toBe(true);
      expect(res.actionNode.meta.chefResult.isCorrupted).toBe(true);
    });

    it("边界：非首夜 → 管道中止（厨师仅首夜唤醒）", async () => {
      const res = await runRole(chefAbility, L1(), 0, {
        night: 2,
        phase: "night",
      });
      expect(res.aborted).toBe(true);
      expect(res.abortReason).toContain("非首夜");
      expect(res.snapshot._abilityResults?.chef).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 4) 图书管理员 (librarian) —— 首夜：一名外来者玩家 + 干扰项
  //    官方：「你在首个夜晚得知一名外来者角色。」
  // ─────────────────────────────────────────────────────────────────
  describe("④ 图书管理员(librarian)", () => {
    // 0图书管理员 1酒鬼(外来者) 2厨师 3侍女 4修补匠
    const L = () => board(["librarian", "drunk", "chef", "chambermaid", "tinker"]);

    it("⭐ 主路径：预置外来者信息落地 + 落库 hasOutsider + 落座标记", async () => {
      const res = await runRole(librarianAbility, L(), 0, {
        night: 1,
        phase: "firstNight",
        meta: {
          initialNightInfo: {
            librarianInfo: { seat1: 1, seat2: 2, roleName: "酒鬼" },
          },
        },
      });
      expect(res.aborted).toBeFalsy();
      expect(res.meta.abilityResult.roleName).toBe("酒鬼");
      expect(res.meta.abilityResult.seat1).toBe(1);
      expect(res.actionNode.meta.librarianResult.hasOutsider).toBe(true);
      expect(res.snapshot._abilityResults?.librarian?.roleName).toBe("酒鬼");
      expect(seatAt(res, 1)?.statusDetails ?? []).toContain("图书目标");
      expect(seatAt(res, 2)?.statusDetails ?? []).toContain("图书目标");
    });

    it("⭐ 边界：场上无外来者（roleName 为空）→ hasOutsider=false，且不落标记", async () => {
      const res = await runRole(librarianAbility, L(), 0, {
        night: 1,
        phase: "firstNight",
        meta: {
          initialNightInfo: {
            librarianInfo: { seat1: undefined, seat2: undefined, roleName: "" },
          },
        },
      });
      expect(res.meta.abilityResult.roleName).toBe("");
      expect(res.actionNode.meta.librarianResult.hasOutsider).toBe(false);
      expect(seatAt(res, 1)?.statusDetails ?? []).not.toContain("图书目标");
      expect(seatAt(res, 2)?.statusDetails ?? []).not.toContain("图书目标");
    });

    it("⭐ 负向对照：中毒 → isCorrupted=true 且外来者名 ≠ 真值", async () => {
      const seats = withEffect(L(), 0, { type: "poisoned", source: "test" });
      const res = await runRole(librarianAbility, seats, 0, {
        night: 1,
        phase: "firstNight",
        meta: {
          initialNightInfo: {
            librarianInfo: { seat1: 1, seat2: 2, roleName: "酒鬼" },
          },
        },
      });
      expect(res.meta.abilityEffective).toBe(false);
      expect(res.meta.isCorrupted).toBe(true);
      expect(res.meta.abilityResult.roleName).not.toBe("酒鬼");
      expect(res.actionNode.meta.librarianResult.isCorrupted).toBe(true);
    });

    it("边界：非首夜 → 管道中止", async () => {
      const res = await runRole(librarianAbility, L(), 0, {
        night: 2,
        phase: "night",
      });
      expect(res.aborted).toBe(true);
      expect(res.abortReason).toContain("非首夜");
      expect(res.meta.abilityResult).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 5) 共情者 (empath) —— 每晚：左右最近存活邻座的邪恶人数（0/1/2）
  //    官方：「每个夜晚，你会得知你的两个存活邻座中有多少是邪恶的。」
  // ─────────────────────────────────────────────────────────────────
  describe("⑤ 共情者(empath)", () => {
    // 0共情 1投毒(恶) 2厨师 3修补匠 4小恶魔(恶) → 两邻皆邪恶 = 2
    const L2 = () => board(["empath", "poisoner", "chef", "tinker", "imp"]);
    // 0共情 1侍女 2厨师 3修补匠 4八卦男 → 两邻皆善良 = 0
    const L0 = () => board(["empath", "chambermaid", "chef", "tinker", "gossip"]);

    it("⭐ 主路径：左右邻座皆邪恶 → 2，并落库", async () => {
      const res = await runRole(empathAbility, L2(), 0, {
        night: 2,
        phase: "night",
      });
      expect(res.aborted).toBeFalsy();
      expect(res.meta.abilityResult).toBe(2);
      expect(res.actionNode.meta.empathResult.evilNeighborCount).toBe(2);
      expect(res.snapshot._abilityResults?.empath).toBe(2);
      expect(res.meta.isCorrupted).toBe(false);
    });

    it("⭐ 差分：邻座换阵营 ⇒ 0 与 2 必须不同", async () => {
      const zero = await runRole(empathAbility, L0(), 0, {
        night: 2,
        phase: "night",
      });
      const two = await runRole(empathAbility, L2(), 0, {
        night: 2,
        phase: "night",
      });
      expect(zero.meta.abilityResult).toBe(0);
      expect(two.meta.abilityResult).toBe(2);
      expect(zero.meta.abilityResult).not.toBe(two.meta.abilityResult);
      expect(zero.snapshot._abilityResults?.empath).toBe(0);
    });

    it("⭐ 负向对照：中毒 → 数字必须 ≠ 真值（100% 错误）且标受干扰", async () => {
      const seats = withEffect(L2(), 0, { type: "poisoned", source: "test" });
      const res = await runRole(empathAbility, seats, 0, {
        night: 2,
        phase: "night",
      });
      expect(res.meta.abilityEffective).toBe(false);
      expect(res.meta.isCorrupted).toBe(true);
      expect(
        res.meta.abilityResult,
        "中毒时不得给出真值 2"
      ).not.toBe(2);
      expect(res.actionNode.meta.empathResult.isCorrupted).toBe(true);
    });

    it("边界：死亡的共情者 → 管道中止", async () => {
      const seats = L2();
      seats[0] = { ...seats[0], isDead: true };
      const res = await runRole(empathAbility, seats, 0, {
        night: 2,
        phase: "night",
      });
      expect(res.aborted).toBe(true);
      expect(res.abortReason).toContain("已死亡");
      expect(res.meta.abilityResult).toBeUndefined();
      expect(res.snapshot._abilityResults?.empath).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 6) 占卜师 (fortune_teller) —— 每晚：两名玩家中是否有恶魔（含红罗刹）
  //    官方：「每个夜晚，你选择两名玩家：你会得知其中是否有恶魔。」
  // ─────────────────────────────────────────────────────────────────
  describe("⑥ 占卜师(fortune_teller)", () => {
    // 0占卜师 1小恶魔 2侍女 3厨师 4修补匠
    const L = () => board(["fortune_teller", "imp", "chambermaid", "chef", "tinker"]);

    it("⭐ 主路径：选中恶魔 → true，并落库目标与结果", async () => {
      const res = await runRole(fortuneTellerAbility, L(), 0, {
        night: 2,
        phase: "night",
        targets: [1, 2],
      });
      expect(res.aborted).toBeFalsy();
      expect(res.meta.abilityResult, "1号是小恶魔 ⇒ 必须点头").toBe(true);
      expect(res.meta.selectedTargets).toEqual([1, 2]);
      expect(res.actionNode.meta.fortuneTellerResult.selectedTargets).toEqual([1, 2]);
      expect(res.snapshot._abilityResults?.fortune_teller?.result).toBe(true);
      expect(res.meta.isCorrupted).toBe(false);
    });

    it("⭐ 差分：同夜换一对善良玩家 ⇒ 结果 true → false", async () => {
      const yes = await runRole(fortuneTellerAbility, L(), 0, {
        night: 2,
        phase: "night",
        targets: [1, 2],
      });
      const no = await runRole(fortuneTellerAbility, L(), 0, {
        night: 2,
        phase: "night",
        targets: [2, 3],
      });
      expect(yes.meta.abilityResult).toBe(true);
      expect(no.meta.abilityResult, "侍女+厨师皆善良 ⇒ 必须摇头").toBe(false);
      expect(no.snapshot._abilityResults?.fortune_teller?.result).toBe(false);
    });

    it("⭐ 负向对照：中毒 → 结果与真值相反（100% 错误）", async () => {
      const seats = withEffect(L(), 0, { type: "poisoned", source: "test" });
      const res = await runRole(fortuneTellerAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [1, 2],
      });
      expect(res.meta.abilityEffective).toBe(false);
      expect(res.meta.isCorrupted).toBe(true);
      expect(
        res.meta.abilityResult,
        "中毒时真值 true ⇒ 必须报 false"
      ).toBe(false);
      expect(seatAt(res, 1)?.isDead).toBe(false);
    });

    it("边界：只选 1 名玩家 → 中止（官方：恰好两名）", async () => {
      const res = await runRole(fortuneTellerAbility, L(), 0, {
        night: 2,
        phase: "night",
        targets: [1],
      });
      expect(res.aborted).toBe(true);
      expect(res.abortReason).toContain("恰好两名");
      expect(res.meta.abilityResult).toBeUndefined();
      expect(res.snapshot._abilityResults?.fortune_teller).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 7) 僧侣 (monk) —— 非首夜：保护一名玩家（中毒则不放置标记）
  //    官方：「每个夜晚*，选择除你以外的一名玩家：他在今晚免受恶魔杀害。」
  // ─────────────────────────────────────────────────────────────────
  describe("⑦ 僧侣(monk)", () => {
    const L = () => board(["monk", "chambermaid", "chef", "gossip", "tinker"]);

    it("⭐ 主路径：目标获得 protected 效果（source=monk）并落库", async () => {
      const res = await runRole(monkAbility, L(), 0, {
        night: 2,
        phase: "night",
        targets: [1],
      });
      expect(res.aborted).toBeFalsy();
      expect(effects(res, 1, "protected", "monk").length).toBe(1);
      expect(effects(res, 1, "protected", "monk")[0].expiresAtNight).toBe(3);
      expect(res.meta.monkResult.isProtected).toBe(true);
      expect(res.snapshot._abilityResults?.monk?.targetId).toBe(1);
    });

    it("⭐ 差分：本夜改保护另一人 ⇒ 旧保护被【替换】而不是叠加", async () => {
      const first = await runRole(monkAbility, L(), 0, {
        night: 2,
        phase: "night",
        targets: [1],
      });
      const second = await runRole(monkAbility, first.snapshot.seats, 0, {
        night: 3,
        phase: "night",
        targets: [2],
      });
      expect(effects(second, 2, "protected", "monk").length).toBe(1);
      expect(
        effects(second, 1, "protected", "monk").length,
        "僧侣每夜只能保护一人：旧目标必须被清除"
      ).toBe(0);
      expect(second.meta.monkResult.targetId).toBe(2);
    });

    it("⭐ 负向对照：中毒 → 不放置任何保护标记（但仍记录选择）", async () => {
      const seats = withEffect(L(), 0, { type: "poisoned", source: "test" });
      const res = await runRole(monkAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [1],
      });
      expect(res.meta.abilityEffective).toBe(false);
      expect(
        effects(res, 1, "protected", "monk").length,
        "中毒僧侣不得放置保护标记"
      ).toBe(0);
      expect(res.meta.monkResult.isProtected).toBe(false);
      expect(res.meta.monkResult.targetId, "选择仍须记录").toBe(1);
    });

    it("边界：首夜不唤醒 → 管道中止", async () => {
      const res = await runRole(monkAbility, L(), 0, {
        night: 1,
        phase: "firstNight",
        targets: [1],
      });
      expect(res.aborted).toBe(true);
      expect(res.abortReason).toContain("首夜");
      expect(effects(res, 1, "protected", "monk").length).toBe(0);
    });

    it("边界：选自己 → 中止（官方：除你以外）", async () => {
      const res = await runRole(monkAbility, L(), 0, {
        night: 2,
        phase: "night",
        targets: [0],
      });
      expect(res.aborted).toBe(true);
      expect(res.abortReason).toContain("自己");
      expect(res.meta.monkResult).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 8) 守鸦人 (ravenkeeper) —— 夜晚死亡时，查看一名玩家的角色
  //    官方：「如果你在夜晚死亡，你会被唤醒并得知一名玩家的角色。」
  // ─────────────────────────────────────────────────────────────────
  describe("⑧ 守鸦人(ravenkeeper)", () => {
    // 0守鸦人 1小恶魔 2侍女 3厨师 4修补匠
    const L = () => board(["ravenkeeper", "imp", "chambermaid", "chef", "tinker"]);
    /** 首夜/其他夜通用的「今晚死亡」座位 */
    const dyingRavenkeeper = (seats: any[]) => {
      seats[0] = { ...seats[0], markedForDeath: true, diedAtNight: 2 };
      return seats;
    };

    it("⭐ 主路径：今晚死亡 → 得知目标真实角色并落库", async () => {
      const res = await runRole(ravenkeeperAbility, dyingRavenkeeper(L()), 0, {
        night: 2,
        phase: "night",
        targets: [1],
      });
      expect(res.aborted, "夜晚死亡的守鸦人必须被唤醒").toBeFalsy();
      expect(res.meta.abilityResult.targetId).toBe(1);
      expect(res.meta.abilityResult.roleName).toBe("小恶魔");
      expect(res.snapshot._abilityResults?.ravenkeeper?.roleName).toBe("小恶魔");
      expect(res.meta.isCorrupted).toBe(false);
    });

    it("⭐ 负向对照：今晚没死 → 中止（技能不触发）", async () => {
      const res = await runRole(ravenkeeperAbility, L(), 0, {
        night: 2,
        phase: "night",
        targets: [1],
      });
      expect(res.aborted).toBe(true);
      expect(res.abortReason).toContain("今晚未死亡");
      expect(res.meta.abilityResult).toBeUndefined();
      expect(res.snapshot._abilityResults?.ravenkeeper).toBeUndefined();
    });

    it("⭐ 负向对照：死亡但中毒 → 角色名 ≠ 真值且标受干扰", async () => {
      const seats = withEffect(dyingRavenkeeper(L()), 0, {
        type: "poisoned",
        source: "test",
      });
      const res = await runRole(ravenkeeperAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [1],
      });
      expect(res.meta.abilityEffective).toBe(false);
      expect(res.meta.isCorrupted).toBe(true);
      expect(res.meta.abilityResult.roleName).not.toBe("小恶魔");
      expect(res.meta.abilityResult.targetId, "目标选择仍须记录").toBe(1);
    });

    it("边界：未选择目标 → 中止", async () => {
      const res = await runRole(ravenkeeperAbility, dyingRavenkeeper(L()), 0, {
        night: 2,
        phase: "night",
      });
      expect(res.aborted).toBe(true);
      expect(res.abortReason).toContain("未选择目标");
      expect(res.snapshot._abilityResults?.ravenkeeper).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 9) 管家 (butler) —— 非首夜：选一名主人（投票受主人约束）
  //    官方：「每个夜晚，选择一名玩家为你的主人。投票时，只有主人投票了你才能投票。」
  // ─────────────────────────────────────────────────────────────────
  describe("⑨ 管家(butler)", () => {
    const L = () => board(["butler", "chambermaid", "chef", "gossip", "tinker"]);

    it("⭐ 主路径：masterId + butler_master 效果落座位，并写入 _abilityResults", async () => {
      const res = await runRole(butlerAbility, L(), 0, {
        night: 2,
        phase: "night",
        targets: [1],
      });
      expect(res.aborted).toBeFalsy();
      expect(seatAt(res, 0)?.masterId).toBe(1);
      expect(effects(res, 0, "butler_master", "butler").length).toBe(1);
      expect(res.meta.butlerResult.masterSet).toBe(true);
      expect(res.snapshot._abilityResults?.butler?.masterId).toBe(1);
    });

    it("⭐ 差分：改选另一名主人 ⇒ masterId 随之替换（旧标记被清除）", async () => {
      const first = await runRole(butlerAbility, L(), 0, {
        night: 2,
        phase: "night",
        targets: [1],
      });
      const second = await runRole(butlerAbility, first.snapshot.seats, 0, {
        night: 3,
        phase: "night",
        targets: [2],
      });
      expect(seatAt(second, 0)?.masterId).toBe(2);
      expect(effects(second, 0, "butler_master", "butler").length).toBe(1);
      expect(effects(second, 0, "butler_master", "butler")[0].masterId).toBe(2);
    });

    it("⭐ 负向对照：中毒 → 不放置主人标记（次日可自由投票）", async () => {
      const seats = withEffect(L(), 0, { type: "poisoned", source: "test" });
      const res = await runRole(butlerAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [1],
      });
      expect(res.meta.abilityEffective).toBe(false);
      expect(seatAt(res, 0)?.masterId, "中毒时不得落主人字段").toBeUndefined();
      expect(effects(res, 0, "butler_master", "butler").length).toBe(0);
      expect(res.meta.butlerResult.masterSet).toBe(false);
      expect(res.meta.butlerResult.masterId, "选择仍须记录").toBe(1);
    });

    it("边界：选自己当主人 → 中止", async () => {
      const res = await runRole(butlerAbility, L(), 0, {
        night: 2,
        phase: "night",
        targets: [0],
      });
      expect(res.aborted).toBe(true);
      expect(res.abortReason).toContain("自己");
      expect(seatAt(res, 0)?.masterId).toBeUndefined();
    });

    it("边界：未选择主人 → 中止", async () => {
      const res = await runRole(butlerAbility, L(), 0, {
        night: 2,
        phase: "night",
      });
      expect(res.aborted).toBe(true);
      expect(res.abortReason).toContain("未选择主人");
      expect(res.snapshot._abilityResults?.butler).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 10) 酒鬼 (drunk) —— 首夜设置：伪装成某镇民 + 永久醉酒
  //     官方：「你不知道自己是酒鬼。你以为自己是某个镇民角色，但其实你不是。」
  // ─────────────────────────────────────────────────────────────────
  describe("⑩ 酒鬼(drunk)", () => {
    const L = () => board(["drunk", "chef", "chambermaid", "gossip", "tinker"]);

    it("⭐ 主路径：说书人指定 fakeRole → 落座位 + 永久 drunk 效果", async () => {
      const res = await runRole(drunkAbility, L(), 0, {
        night: 1,
        phase: "firstNight",
        storytellerInput: {
          fakeRole: { id: "chef", name: "厨师", type: "townsfolk" },
        },
      });
      expect(res.aborted).toBeFalsy();
      expect(seatAt(res, 0)?.fakeRole?.id).toBe("chef");
      expect(seatAt(res, 0)?.fakeRole?.name).toBe("厨师");
      const drunkFx = effects(res, 0, "drunk", "drunk");
      expect(drunkFx.length).toBe(1);
      expect(drunkFx[0].permanent, "酒鬼醉酒是角色固有属性").toBe(true);
      expect(res.meta.drunkSetupApplied).toBe(true);
    });

    it("⭐ 差分：不指定 fakeRole ⇒ 自动挑中一名【在场镇民】且不得是酒鬼自己", async () => {
      const res = await runRole(drunkAbility, L(), 0, {
        night: 1,
        phase: "firstNight",
      });
      expect(res.meta.fakeRole.type).toBe("townsfolk");
      expect(res.meta.fakeRole.id).not.toBe("drunk");
      expect(["chef", "chambermaid", "gossip", "tinker"]).toContain(
        res.meta.fakeRole.id
      );
    });

    it("⭐ 负向对照：非首夜 → 设置不重复执行（fakeRole 不覆盖）", async () => {
      const res = await runRole(drunkAbility, L(), 0, {
        night: 2,
        phase: "night",
      });
      expect(res.aborted).toBe(true);
      expect(res.abortReason).toContain("无需再次执行");
      expect(res.meta.drunkSetupApplied).toBeUndefined();
      expect(seatAt(res, 0)?.fakeRole).toBeUndefined();
    });

    it("边界：酒鬼已死亡 → 中止", async () => {
      const seats = L();
      seats[0] = { ...seats[0], isDead: true };
      const res = await runRole(drunkAbility, seats, 0, {
        night: 1,
        phase: "firstNight",
      });
      expect(res.aborted).toBe(true);
      expect(res.abortReason).toContain("已死亡");
      expect(seatAt(res, 0)?.fakeRole).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 11) 陌客 / 隐士 (recluse) —— 被动：可能被当作邪恶/爪牙/恶魔
  //     官方：「你可能被当作邪恶阵营、爪牙或恶魔角色，即使你已死亡。」
  // ─────────────────────────────────────────────────────────────────
  describe("⑪ 隐士(recluse)", () => {
    it("⭐ 主路径：被动干扰激活并落库（无需存活/状态检查）", async () => {
      const res = await runRole(recluseAbility, board(["recluse", ...SAFE4]), 0, {
        night: 2,
        phase: "night",
      });
      expect(res.aborted, "陌客被动无条件通过").toBeFalsy();
      expect(res.meta.recluseActive).toBe(true);
      expect(res.snapshot._abilityResults?.recluse?.active).toBe(true);
      expect(res.actionNode.meta.recluseActive).toBe(true);
    });

    it("⭐ 跨角色因果链：陌客默认被厨师当作邪恶（1 对）↔ 说书人关闭后（0 对）", async () => {
      // 0厨师 1陌客 2投毒者 3侍女 4修补匠
      const L = () => board(["chef", "recluse", "poisoner", "chambermaid", "tinker"]);
      const asEvil = await runRole(chefAbility, L(), 0, {
        night: 1,
        phase: "firstNight",
      });
      const asGood = await runRole(chefAbility, L(), 0, {
        night: 1,
        phase: "firstNight",
        storytellerInput: { forceChefRecluseEvil: false },
      });
      expect(
        asEvil.meta.abilityResult,
        "默认登记邪恶 ⇒ 陌客+投毒者构成 1 对"
      ).toBe(1);
      expect(
        asGood.meta.abilityResult,
        "关闭登记 ⇒ 陌客不再被当作邪恶 ⇒ 0 对"
      ).toBe(0);
      expect(asEvil.meta.abilityResultTrue).not.toBe(asGood.meta.abilityResultTrue);
    });

    it("⭐ 边界：陌客已死亡仍生效（官方「即使你已死亡」）", async () => {
      const seats = board(["recluse", ...SAFE4]);
      seats[0] = { ...seats[0], isDead: true };
      const res = await runRole(recluseAbility, seats, 0, {
        night: 2,
        phase: "night",
      });
      expect(res.aborted, "死亡不得使被动失效").toBeFalsy();
      expect(res.snapshot._abilityResults?.recluse?.active, "死亡仍须记录激活").toBe(
        true
      );
      expect(seatAt(res, 0)?.isDead).toBe(true);
    });

    it("⭐ 差分：说书人覆盖登记 ⇒ 同一夜的陌客可被分别当作邪恶/善良", () => {
      const rec = board(["recluse"])[0];
      const evil = resolveRecluseRegistration(1, "k_evil", {}, undefined, rec);
      const good = resolveRecluseRegistration(
        1,
        "k_good",
        {},
        { recluseOverride: { 1: { registersAsEvil: false, registersAsRoleType: null } } },
        rec
      );
      expect(evil.registersAsEvil).toBe(true);
      expect(evil.registersAsRoleType).toBe("minion");
      expect(good.registersAsEvil).toBe(false);
      expect(good.registersAsRoleType).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 12) 投毒者 (poisoner) —— 每晚：一名玩家当晚+次日白天中毒
  //     官方：「每个夜晚，选择一名玩家：他在当晚和明天白天中毒。」
  // ─────────────────────────────────────────────────────────────────
  describe("⑫ 投毒者(poisoner)", () => {
    const L = () => board(["poisoner", "chambermaid", "chef", "gossip", "tinker"]);

    it("⭐ 主路径：目标获得 poisoned 效果并落库", async () => {
      const res = await runRole(poisonerAbility, L(), 0, {
        night: 1,
        phase: "firstNight",
        targets: [1],
      });
      expect(res.aborted).toBeFalsy();
      expect(effects(res, 1, "poisoned", "poisoner").length).toBe(1);
      expect(effects(res, 1, "poisoned", "poisoner")[0].expiresAtNight).toBe(2);
      expect(res.meta.poisonerResult.poisoned).toBe(true);
      expect(res.snapshot._abilityResults?.poisoner?.targetId).toBe(1);
    });

    it("⭐ 差分：改毒另一人 ⇒ 毒落在新目标身上（旧目标的毒由【黄昏清理】负责，不在此处）", async () => {
      // ⚠️ 不可跨夜串联断言：poisoned 效果带 expiresAtNight，
      //    由 useGameFlow.clearExpiredNightEffects（useGameFlow.ts:357-369）
      //    在黄昏统一清除。本用例只验「每夜只毒一人」的本夜语义。
      const a = await runRole(poisonerAbility, L(), 0, {
        night: 1,
        phase: "firstNight",
        targets: [1],
      });
      const b = await runRole(poisonerAbility, L(), 0, {
        night: 1,
        phase: "firstNight",
        targets: [2],
      });
      expect(effects(a, 1, "poisoned", "poisoner").length).toBe(1);
      expect(effects(a, 2, "poisoned", "poisoner").length).toBe(0);
      expect(effects(b, 2, "poisoned", "poisoner").length).toBe(1);
      expect(b.meta.poisonerResult.targetId).toBe(2);
      expect(b.snapshot._abilityResults?.poisoner?.poisoned).toBe(true);
    });

    it("⭐ 负向对照：中毒的投毒者 → 不下毒（但仍记录选择）", async () => {
      const seats = withEffect(L(), 0, { type: "poisoned", source: "test" });
      const res = await runRole(poisonerAbility, seats, 0, {
        night: 1,
        phase: "firstNight",
        targets: [1],
      });
      expect(res.meta.abilityEffective).toBe(false);
      expect(
        effects(res, 1, "poisoned", "poisoner").length,
        "中毒的投毒者不得下毒"
      ).toBe(0);
      expect(res.meta.poisonerResult.poisoned).toBe(false);
      expect(res.meta.poisonerResult.targetId, "选择仍须记录").toBe(1);
    });

    it("边界：目标是死者 → 中止（官方：不能对死亡玩家下毒）", async () => {
      const seats = L();
      seats[1] = { ...seats[1], isDead: true };
      const res = await runRole(poisonerAbility, seats, 0, {
        night: 1,
        phase: "firstNight",
        targets: [1],
      });
      expect(res.aborted).toBe(true);
      expect(res.abortReason).toContain("不能对死亡玩家下毒");
      expect(effects(res, 1, "poisoned", "poisoner").length).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 13) 红罗刹 (scarlet_woman) —— 恶魔死且存活≥4（非旅行者）时变身恶魔
  //     官方：「若恶魔死亡时存活玩家≥5（你除外），你变成那名恶魔。」
  // ─────────────────────────────────────────────────────────────────
  describe("⑬ 红罗刹(scarlet_woman)", () => {
    /** 恶魔已死 + 存活非旅行者 5 人 */
    const L = () => {
      const seats = board([
        "scarlet_woman",
        "chambermaid",
        "chef",
        "gossip",
        "tinker",
        "imp",
      ]);
      seats[5] = { ...seats[5], isDead: true };
      return seats;
    };

    it("⭐ 主路径：恶魔已死且存活≥4 → 变身小恶魔（role/roleId/roleType 全替换）", async () => {
      const res = await runRole(scarletWomanAbility, L(), 0, {
        night: 2,
        phase: "night",
      });
      expect(res.aborted).toBeFalsy();
      const self = seatAt(res, 0);
      expect(self?.role?.id).toBe("imp");
      expect(self?.role?.type).toBe("demon");
      expect(self?.roleId).toBe("imp");
      expect(self?.isDemonSuccessor).toBe(true);
      expect(res.meta.transformed).toBe(true);
    });

    it("⭐ 差分：存活人数不足 4 → 不触发变身", async () => {
      // 0红罗刹 1侍女 2厨师 3小恶魔(已死) ⇒ 存活非旅行者仅 3 人
      const seats = board(["scarlet_woman", "chambermaid", "chef", "imp"]);
      seats[3] = { ...seats[3], isDead: true };
      const res = await runRole(scarletWomanAbility, seats, 0, {
        night: 2,
        phase: "night",
      });
      expect(res.aborted).toBe(true);
      expect(res.abortReason).toContain("变身条件不满足");
      expect(seatAt(res, 0)?.role?.id, "未变身时角色不得改变").toBe(
        "scarlet_woman"
      );
      expect(res.meta.transformed).toBeUndefined();
    });

    it("⭐ 负向对照：恶魔未死 → 不触发变身", async () => {
      const seats = L();
      seats[5] = { ...seats[5], isDead: false };
      const res = await runRole(scarletWomanAbility, seats, 0, {
        night: 2,
        phase: "night",
      });
      expect(res.aborted).toBe(true);
      expect(res.meta.demonDead).toBe(false);
      expect(seatAt(res, 0)?.role?.id).toBe("scarlet_woman");
    });

    it("⭐ 负向对照：自身中毒 → 条件满足也不变身（abilityEffective 参与判定）", async () => {
      const seats = withEffect(L(), 0, { type: "poisoned", source: "test" });
      const res = await runRole(scarletWomanAbility, seats, 0, {
        night: 2,
        phase: "night",
      });
      expect(res.meta.abilityEffective).toBe(false);
      expect(res.aborted, "中毒红罗刹不得变身").toBe(true);
      expect(seatAt(res, 0)?.role?.id).toBe("scarlet_woman");
    });

    it("边界：红罗刹已死亡 → 中止", async () => {
      const seats = L();
      seats[0] = { ...seats[0], isDead: true };
      const res = await runRole(scarletWomanAbility, seats, 0, {
        night: 2,
        phase: "night",
      });
      expect(res.aborted).toBe(true);
      expect(res.abortReason).toContain("已死亡");
      expect(seatAt(res, 0)?.role?.id).toBe("scarlet_woman");
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 14) 男爵 (baron) —— 设置阶段：镇民 -2、外来者 +2
  //     官方：「场上会多出两个外来者。」
  // ─────────────────────────────────────────────────────────────────
  describe("⑭ 男爵(baron)", () => {
    const L = () => board(["baron", ...SAFE4]);

    it("⭐ 主路径：setupConfig 镇民 -2 / 外来者 +2，并标记 baronAdjusted", async () => {
      const res = await runRole(baronAbility, L(), 0, {
        snapshot: { setupConfig: { townsfolkCount: 7, outsiderCount: 0 } },
      });
      expect(res.snapshot.setupConfig.townsfolkCount).toBe(5);
      expect(res.snapshot.setupConfig.outsiderCount).toBe(2);
      expect(res.snapshot.setupConfig.baronAdjusted).toBe(true);
      expect(res.meta.adjustmentApplied).toBe(true);
    });

    it("⭐ 差分：不同起始人数 ⇒ 调整结果随之变化", async () => {
      const a = await runRole(baronAbility, L(), 0, {
        snapshot: { setupConfig: { townsfolkCount: 7, outsiderCount: 0 } },
      });
      const b = await runRole(baronAbility, L(), 0, {
        snapshot: { setupConfig: { townsfolkCount: 5, outsiderCount: 1 } },
      });
      expect(a.snapshot.setupConfig.townsfolkCount).toBe(5);
      expect(b.snapshot.setupConfig.townsfolkCount).toBe(3);
      expect(b.snapshot.setupConfig.outsiderCount).toBe(3);
    });

    it("⭐ 差分：说书人显式指定被替换的角色 → 写入 setupConfig 摘要", async () => {
      const res = await runRole(baronAbility, L(), 0, {
        snapshot: { setupConfig: { townsfolkCount: 7, outsiderCount: 0 } },
        storytellerInput: {
          removedTownsfolk: ["厨师", "侍女"],
          addedOutsiders: ["酒鬼", "陌客"],
        },
      });
      expect(res.snapshot.setupConfig.removedTownsfolk).toEqual(["厨师", "侍女"]);
      expect(res.snapshot.setupConfig.addedOutsiders).toEqual(["酒鬼", "陌客"]);
      expect(res.meta.displayInfo.removedTownsfolk.length).toBe(2);
    });

    it("边界：缺少 setupConfig → 不得崩溃，人数按 0 下限处理", async () => {
      const res = await runRole(baronAbility, L(), 0, {});
      expect(res.snapshot.setupConfig.townsfolkCount, "不得为负").toBe(0);
      expect(res.snapshot.setupConfig.outsiderCount).toBe(2);
      expect(res.snapshot.setupConfig.baronAdjusted).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 15) 小恶魔 (imp) —— 非首夜：杀人；自杀则传刀给爪牙
  //     官方：「每个夜晚*，选择一名玩家：他死亡。如果你自杀，一名爪牙变成小恶魔。」
  // ─────────────────────────────────────────────────────────────────
  describe("⑮ 小恶魔(imp)", () => {
    const L = () => board(["imp", "chambermaid", "chef", "gossip", "tinker"]);

    it("⭐ 主路径：目标被标记死亡（markedForDeath + dieAtNight + 来源）并落库", async () => {
      const res = await runRole(impAbility, L(), 0, {
        night: 2,
        phase: "night",
        targets: [1],
      });
      expect(res.aborted).toBeFalsy();
      const t = seatAt(res, 1);
      expect(t?.markedForDeath).toBe(true);
      expect(t?.diedAtNight).toBe(2);
      expect(t?.deathSource).toBe("imp_kill");
      expect(res.meta.impResult.killed).toBe(true);
      expect(res.snapshot._abilityResults?.imp?.actualKilledId).toBe(1);
    });

    it("⭐ 负向对照：目标受僧侣保护 → 不死亡且落库 killed=false", async () => {
      const seats = withEffect(L(), 1, { type: "protected", source: "monk" });
      const res = await runRole(impAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [1],
      });
      expect(seatAt(res, 1)?.markedForDeath, "受保护目标不得死亡").toBeUndefined();
      expect(res.meta.impResult.killed).toBe(false);
      expect(res.meta.impResult.log.blockedByProtection).toBe(true);
      expect(seatAt(res, 1)?.isDead).toBe(false);
    });

    it("⭐ 差分：自杀传刀 → 原恶魔死亡 + 指定爪牙变成新小恶魔", async () => {
      const seats = board(["imp", "poisoner", "chef", "gossip", "tinker"]);
      const res = await runRole(impAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [0],
        storytellerInput: { successorSeatId: 1 },
      });
      expect(res.meta.impResult.isSuicide).toBe(true);
      expect(seatAt(res, 0)?.isDead).toBe(true);
      expect(seatAt(res, 0)?.deathSource).toBe("suicide");
      expect(seatAt(res, 1)?.role?.id, "爪牙必须变成新的小恶魔").toBe("imp");
      expect(seatAt(res, 1)?.isDemonSuccessor).toBe(true);
    });

    it("⭐ 负向对照：中毒的小恶魔 → 不杀人（但记录选择）", async () => {
      const seats = withEffect(L(), 0, { type: "poisoned", source: "test" });
      const res = await runRole(impAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [1],
      });
      expect(res.meta.abilityEffective).toBe(false);
      expect(
        seatAt(res, 1)?.markedForDeath,
        "中毒小恶魔不得杀死目标"
      ).toBeUndefined();
      expect(res.meta.impResult.killed).toBe(false);
      expect(res.meta.impResult.targetId, "选择仍须记录").toBe(1);
    });

    it("边界：首夜不唤醒 → 管道中止", async () => {
      const res = await runRole(impAbility, L(), 0, {
        night: 1,
        phase: "firstNight",
        targets: [1],
      });
      expect(res.aborted).toBe(true);
      expect(res.abortReason).toContain("首夜");
      expect(seatAt(res, 1)?.markedForDeath).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 16) 僵怖 (zombuul) —— 白天无人死亡才杀人
  // ─────────────────────────────────────────────────────────────────
  describe("⑯ 僵怖(zombuul)", () => {
    const L = () => board(["zombuul", ...SAFE4]);

    it("⭐ 主路径：白天无人死亡 → 目标死亡（状态 + 来源落库）", async () => {
      const res = await runRole(zombuulAbility, L(), 0, {
        night: 2,
        phase: "night",
        targets: [1],
        snapshot: { lastDuskExecution: null, dayDeathsToday: 0 },
      });
      const t = seatAt(res, 1);
      expect(t?.isDead).toBe(true);
      expect(t?.markedForDeath).toBe(true);
      expect(t?.deathSource).toBe("zombuul_kill");
    });

    it("⭐ 负向对照：今天白天有人死亡 → 僵怖不被唤醒，无人死亡", async () => {
      const seats = L();
      const before = JSON.parse(JSON.stringify(seats));
      const res = await runRole(zombuulAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [1],
        snapshot: { lastDuskExecution: 2 },
      });
      expect(res.aborted, "官方：如果今天白天有人死亡，不要唤醒僵怖").toBe(true);
      expect(changedSeats(before, res.snapshot.seats)).toEqual([]);
      expect(seatAt(res, 1)?.isDead).toBe(false);
    });

    it("⭐ 边界：被处决过的僵怖（zombuulTrulyDead）→ 中止", async () => {
      const seats = L();
      seats[0] = { ...seats[0], isDead: true, zombuulTrulyDead: true };
      const res = await runRole(zombuulAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [1],
        snapshot: { lastDuskExecution: null },
      });
      expect(res.aborted, "真正死亡后不得再行动").toBe(true);
      expect(res.abortReason).toContain("死亡");
      expect(seatAt(res, 1)?.isDead).toBe(false);
    });

    it("负向对照：受保护的士兵式目标（protected 效果）→ 不死亡", async () => {
      const seats = withEffect(L(), 1, { type: "protected", source: "monk" });
      const res = await runRole(zombuulAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [1],
        snapshot: { lastDuskExecution: null, dayDeathsToday: 0 },
      });
      expect(seatAt(res, 1)?.isDead, "受保护目标不得死亡").toBe(false);
      expect(res.meta.abilityResult).toBeUndefined();
    });

    it(
      "✅ 已修 P0-B：中毒的僵怖**不得**杀人",
      async () => {
        const seats = withEffect(L(), 0, { type: "poisoned", source: "test" });
        const res = await runRole(zombuulAbility, seats, 0, {
          night: 2,
          phase: "night",
          targets: [1],
          snapshot: { lastDuskExecution: null, dayDeathsToday: 0 },
        });
        expect(res.meta.abilityEffective).toBe(false);
        // 官方「死亡」标记放置条件：僵怖未醉酒中毒
        expect(seatAt(res, 1)?.isDead, "中毒僵怖不得杀人").toBe(false);
      }
    );
  });
});

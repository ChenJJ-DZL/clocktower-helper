import { beforeEach, describe, expect, it } from "vitest";
import {
  canUseLimitedAbility,
  resetLimitedAbilityUses,
} from "../../../utils/LimitedAbilityManager";
import { board, runRole, seat } from "../_tbHarness";
import { artistAbility } from "../../new_engine/artist.ability";
import { barberAbility } from "../../new_engine/barber.ability";
import { cerenovusAbility } from "../../new_engine/cerenovus.ability";
import { clockmakerAbility } from "../../new_engine/clockmaker.ability";
import { dreamerAbility } from "../../new_engine/dreamer.ability";
import { evil_twinAbility } from "../../new_engine/evil_twin.ability";
import { fang_guAbility } from "../../new_engine/fang_gu.ability";
import { flowergirlAbility } from "../../new_engine/flowergirl.ability";
import { jugglerAbility } from "../../new_engine/juggler.ability";
import { klutzAbility } from "../../new_engine/klutz.ability";
import { mathematicianAbility } from "../../new_engine/mathematician.ability";
import { mutantAbility } from "../../new_engine/mutant.ability";
import { no_dashiiAbility } from "../../new_engine/no_dashii.ability";
import { oracleAbility } from "../../new_engine/oracle.ability";
import { philosopherAbility } from "../../new_engine/philosopher.ability";
import { pit_hagAbility } from "../../new_engine/pit_hag.ability";
import { sageAbility } from "../../new_engine/sage.ability";
import { savantAbility } from "../../new_engine/savant.ability";
import { seamstressAbility } from "../../new_engine/seamstress.ability";
import { snakeCharmerAbility } from "../../new_engine/snake_charmer.ability";
import { sweetheartAbility } from "../../new_engine/sweetheart.ability";
import { town_crierAbility } from "../../new_engine/town_crier.ability";
import { vigormortisAbility } from "../../new_engine/vigormortis.ability";
import { vortoxAbility } from "../../new_engine/vortox.ability";
import { witchAbility } from "../../new_engine/witch.ability";

/**
 * L5 · 因果链层 · 梦殒春宵 / 游园惊梦（25 唯一角色，每角色 ≥3 用例）
 * ==================================================================
 * 本文件补的是 `sects_minion_demon_l5.test.ts`（8 角色）与
 * `info_roles_more_l5.test.ts`（9 角色）**没有覆盖到 / 只有 1 条**的部分，
 * 使每个角色在 L5 层都达到 **≥3 用例**（主路径 + 差分 + 负向对照）。
 *
 * 🔒 判据设计
 *   · 效果类：断言**特征状态字段真的落库**（isDead / isCursed / isMad /
 *     isPoisoned / isDrunk / role / snapshot 记账字段），并配一条负向对照。
 *   · 信息类：断言 **`abilityResult` 的事实正确性**（由布局直接决定的硬事实），
 *     并做**差分**（只改配置 ⇒ 结果必须跟着变）。
 *
 * 🔒 靶子安全：普通配角一律用 chambermaid / gossip / grandmother / tinker，
 *   以及本剧本的外来者 barber / sweetheart（均无免疫/免死）。
 *   绝不使用 sailor / fool / tea_lady / pacifist / innkeeper / goon / moonchild。
 *
 * ⚠️ 只加测试不改生产；发现的实现疑虑只写入报告（附 file:line）。
 */

const SAFE = ["chambermaid", "gossip", "grandmother", "tinker"];
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const after = (res: any, id: number): any =>
  (res?.snapshot?.seats ?? []).find((s: any) => s.id === id);
const snap = (res: any, key: string): any => res?.snapshot?.[key];

/**
 * 限次能力（艺术家/女裁缝/哲学家/杂耍艺人）模块级状态隔离。
 *
 * ⚠️⚠️ 2026-09-21 修正（P0-A 修复后暴露）：必须用**无参**调用清空全部。
 *   `resetLimitedAbilityUses(seatId, abilityId)` 的分支（`LimitedAbilityManager.ts:171-172`）
 *   **只删 `instanceUses`，不删 `globalUses`**
 *   ⇒ 对 `global: true` 的能力（如 `seamstress_check`）**重置无效**
 *   ⇒ 用例 ① 记账后，用例 ② 会在 `preCheck` 被拒绝（`abilityResult` 为 undefined）。
 *
 *   此前不暴露的原因：`initializeLimitedAbilityManager()` 生产零调用 ⇒ `definitions` 为空
 *   ⇒ `canUseLimitedAbility` 恒 true 且**不记账** ⇒ 测试间无状态污染。
 *   修好 P0-A（模块级自初始化）后，记账真正生效 ⇒ 这个隔离缺陷才浮现。
 */
beforeEach(() => {
  resetLimitedAbilityUses();
});

// ══════════════════════════════════════════════════════════════════════════
//  一 · 信息类角色（事实正确性 + 差分 + 负向）
// ══════════════════════════════════════════════════════════════════════════
describe("L5 · 镇民 · 信息类", () => {
  describe("钟表匠 clockmaker", () => {
    it("① 主路径：恶魔与爪牙相邻 ⇒ 距离为 1（裸 number）", async () => {
      const seats = board(["clockmaker", "imp", "poisoner", "chambermaid", "tinker"]);
      const res = await runRole(clockmakerAbility, seats, 0, {
        night: 1,
        phase: "firstNight",
      });
      const d = res?.meta?.abilityResult;
      expect(typeof d, `❌ 结果必须是裸 number（实际 ${JSON.stringify(d)}）`).toBe("number");
      expect(d, `❌ 1号小恶魔与2号投毒者相邻 ⇒ 距离应为 1（实际 ${d}）`).toBe(1);
      expect(after(res, 0)?.isDead, "❌ 纯信息能力不得改变任何座位状态").toBe(false);
    });
    it("② 差分：爪牙挪远 ⇒ 距离必须随之变化", async () => {
      const A = board(["clockmaker", "imp", "poisoner", "chambermaid", "tinker"]);
      const B = board(["clockmaker", "imp", "chambermaid", "tinker", "poisoner"]);
      const ra = await runRole(clockmakerAbility, A, 0, { night: 1, phase: "firstNight" });
      const rb = await runRole(clockmakerAbility, B, 0, { night: 1, phase: "firstNight" });
      expect(ra?.meta?.abilityResult, "❌ 配置 A 距离应为 1").toBe(1);
      expect(rb?.meta?.abilityResult, "❌ 配置 B 中恶魔↔爪牙环形距离应为 2").toBe(2);
      expect(
        ra?.meta?.abilityResult !== rb?.meta?.abilityResult,
        "❌ 两种布局的距离不同，结果却相同 ⇒ 没有真正读场上位置"
      ).toBe(true);
    });
    it("③ 负向对照：场上无爪牙 ⇒ 距离必须为 0（不得猜测）", async () => {
      const seats = board(["clockmaker", "chambermaid", "gossip", "tinker", "grandmother"]);
      const res = await runRole(clockmakerAbility, seats, 0, {
        night: 1,
        phase: "firstNight",
      });
      expect(
        res?.meta?.abilityResult,
        `❌ 无恶魔/爪牙时官方为「无事发生」，实现应为 0（实际 ${res?.meta?.abilityResult}）`
      ).toBe(0);
      expect(after(res, 1)?.isDead).toBe(false);
    });
  });

  describe("筑梦师 dreamer", () => {
    it("① 主路径：目标是善良 ⇒ 两个候选之一必为其真实角色", async () => {
      const seats = board(["dreamer", "chambermaid", "gossip", "tinker", "imp"]);
      const res = await runRole(dreamerAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [1],
      });
      const r = res?.meta?.abilityResult;
      expect(r?.targetId, "❌ 结果必须带所选目标 id").toBe(1);
      expect(r?.actualRole?.id, "❌ 结果必须带目标真实角色").toBe("chambermaid");
      const ids = [r?.roleA?.id, r?.roleB?.id];
      expect(
        ids.includes("chambermaid"),
        `❌ 官方：「其中一个为该玩家真实角色」⇒ 候选里必须含 chambermaid（实际 ${JSON.stringify(ids)}）`
      ).toBe(true);
      expect(
        ids.filter(Boolean).length,
        "❌ 必须给出两个角色候选"
      ).toBe(2);
    });
    it("② 差分：目标是邪恶 ⇒ 两个候选之一必为其真实角色（imp）", async () => {
      const seats = board(["dreamer", "imp", "chambermaid", "gossip", "tinker"]);
      const res = await runRole(dreamerAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [1],
      });
      const ids = [res?.meta?.abilityResult?.roleA?.id, res?.meta?.abilityResult?.roleB?.id];
      expect(
        ids.includes("imp"),
        `❌ 目标是小恶魔 ⇒ 候选里必须含 imp（实际 ${JSON.stringify(ids)}）`
      ).toBe(true);
      expect(res?.meta?.abilityResult?.actualRole?.id).toBe("imp");
    });
    it("③ 负向对照：受干扰（醉酒）⇒ 两个候选**都不得**是真实角色", async () => {
      const seats = board(["dreamer", "chambermaid", "gossip", "tinker", "imp"]);
      // ⚠️ preCheck 读的是 `statusEffects`（不是裸 isDrunk 字段）⇒ 必须带效果
      seats[0].statusEffects = [{ type: "drunk" }];
      const res = await runRole(dreamerAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [1],
      });
      const ids = [res?.meta?.abilityResult?.roleA?.id, res?.meta?.abilityResult?.roleB?.id];
      expect(
        ids.includes("chambermaid"),
        `❌ 醉酒筑梦师必须给出**错误**信息，但候选里出现了真实角色（${JSON.stringify(ids)}）`
      ).toBe(false);
      expect(ids.filter(Boolean).length, "❌ 仍须给出两个候选").toBe(2);
      expect(res?.meta?.abilityResult?.actualRole?.id).toBe("chambermaid");
    });
  });

  describe("数学家 mathematician", () => {
    it("① 主路径：abnormalAbilityCount=3 ⇒ 如实告知 3", async () => {
      const seats = board(["mathematician", ...SAFE]);
      const res = await runRole(mathematicianAbility, seats, 0, {
        night: 2,
        phase: "night",
        snapshot: { abnormalAbilityCount: 3 },
      });
      const r = res?.meta?.abilityResult;
      expect(r?.abnormalCount, "❌ 应告知异常数 3").toBe(3);
      expect(r?.actualCount, "❌ actualCount 应为真实值 3").toBe(3);
      expect(r?.isCorrupted, "❌ 未受干扰时 isCorrupted 必须为 false").toBe(false);
    });
    it("② 差分：abnormalAbilityCount 变化 ⇒ 告知值必须变", async () => {
      const seats = board(["mathematician", ...SAFE]);
      const r1 = await runRole(mathematicianAbility, seats, 0, {
        night: 2,
        phase: "night",
        snapshot: { abnormalAbilityCount: 1 },
      });
      const r2 = await runRole(mathematicianAbility, seats, 0, {
        night: 2,
        phase: "night",
        snapshot: { abnormalAbilityCount: 4 },
      });
      expect(r1?.meta?.abilityResult?.abnormalCount).toBe(1);
      expect(r2?.meta?.abilityResult?.abnormalCount).toBe(4);
      expect(
        r1?.meta?.abilityResult?.abnormalCount !== r2?.meta?.abilityResult?.abnormalCount,
        "❌ 异常数 1→4，告知值却没变 ⇒ 没读 snapshot"
      ).toBe(true);
    });
    it("③ 负向对照：受干扰 ⇒ 必须给出≠真实的假数字并标 isCorrupted", async () => {
      const seats = board(["mathematician", ...SAFE]);
      // ⚠️ mathematician 的 preCheck 是 commonPreCheckAlive ⇒ 它会把
      //   `meta.abilityEffective` 重算为 `!(drunk||poisoned)`（覆盖外部注入）,
      //   所以「受干扰」必须通过**座位状态效果**表达（这也是生产真实路径）。
      seats[0].statusEffects = [{ type: "drunk" }];
      const res = await runRole(mathematicianAbility, seats, 0, {
        night: 2,
        phase: "night",
        snapshot: { abnormalAbilityCount: 3 },
        storytellerInput: { fakeResult: 6 },
      });
      expect(res?.meta?.abilityResult?.isCorrupted, "❌ 受干扰必须标记 isCorrupted").toBe(true);
      expect(res?.meta?.abilityResult?.abnormalCount, "❌ 受干扰应采纳说书人假值 6").toBe(6);
      expect(
        res?.meta?.abilityResult?.abnormalCount !== res?.meta?.abilityResult?.actualCount,
        "❌ 受干扰时告知值不得等于真实值"
      ).toBe(true);
    });
  });

  describe("卖花女孩 flowergirl", () => {
    it("① 主路径：恶魔今日投过票 ⇒ hasVoted=true（且 actualVoted 保留真值）", async () => {
      const seats = board(["flowergirl", ...SAFE]);
      const res = await runRole(flowergirlAbility, seats, 0, {
        night: 2,
        phase: "night",
        snapshot: { demonVotedToday: true },
      });
      expect(res?.meta?.abilityResult?.hasVoted).toBe(true);
      expect(res?.meta?.abilityResult?.actualVoted).toBe(true);
      expect(res?.meta?.abilityResult?.isCorrupted).toBe(false);
    });
    it("② 差分：恶魔今日未投票 ⇒ hasVoted=false", async () => {
      const seats = board(["flowergirl", ...SAFE]);
      const res = await runRole(flowergirlAbility, seats, 0, {
        night: 2,
        phase: "night",
        snapshot: { demonVotedToday: false },
      });
      expect(res?.meta?.abilityResult?.hasVoted).toBe(false);
      expect(res?.meta?.abilityResult?.actualVoted).toBe(false);
      expect(res?.meta?.abilityResult?.isCorrupted).toBe(false);
    });
    it("③ 负向对照：涡流在场 ⇒ 信息必须反转（真实 true → 告知 false）", async () => {
      const seats = board(["flowergirl", "vortox", "gossip", "tinker", "grandmother"]);
      const res = await runRole(flowergirlAbility, seats, 0, {
        night: 2,
        phase: "night",
        snapshot: { demonVotedToday: true },
      });
      expect(res?.meta?.abilityResult?.isCorrupted, "❌ 涡流在场必须标 isCorrupted").toBe(true);
      expect(
        res?.meta?.abilityResult?.hasVoted,
        "❌ 涡流局镇民信息必须错误 ⇒ 真实 true 应告知 false"
      ).toBe(false);
    });
  });

  describe("城镇公告员 town_crier", () => {
    it("① 主路径：今日有爪牙提名 ⇒ minionNominated=true", async () => {
      const seats = board(["town_crier", ...SAFE]);
      const res = await runRole(town_crierAbility, seats, 0, {
        night: 2,
        phase: "night",
        snapshot: { minionNominatedToday: true },
      });
      expect(res?.meta?.abilityResult?.minionNominated).toBe(true);
      expect(snap(res, "_abilityResults")?.town_crier?.minionNominated, "❌ 结果必须落 _abilityResults.town_crier").toBe(true);
      expect(res?.meta?.isCorrupted).toBe(false);
    });
    it("② 差分：今日无爪牙提名 ⇒ false", async () => {
      const seats = board(["town_crier", ...SAFE]);
      const res = await runRole(town_crierAbility, seats, 0, {
        night: 2,
        phase: "night",
        snapshot: { minionNominatedToday: false },
      });
      expect(res?.meta?.abilityResult?.minionNominated).toBe(false);
      expect(res?.meta?.isCorrupted).toBe(false);
    });
    it("③ 负向对照：公告员中毒 ⇒ 信息反转（真 true → 假 false）", async () => {
      const seats = board(["town_crier", ...SAFE]);
      seats[0].statusEffects = [{ type: "poisoned" }];
      const res = await runRole(town_crierAbility, seats, 0, {
        night: 2,
        phase: "night",
        snapshot: { minionNominatedToday: true },
      });
      expect(res?.meta?.isCorrupted, "❌ 中毒必须标记 isCorrupted").toBe(true);
      expect(
        res?.meta?.abilityResult?.minionNominated,
        "❌ 中毒者信息必须错误 ⇒ true 应反为 false"
      ).toBe(false);
    });
  });

  describe("神谕者 oracle", () => {
    it("① 主路径：1 名死亡的邪恶 ⇒ deadEvilCount=1", async () => {
      const seats = board(["oracle", "imp", "chambermaid", "gossip", "tinker"]);
      seats[1].isDead = true;
      const res = await runRole(oracleAbility, seats, 0, {
        night: 2,
        phase: "night",
        snapshot: { deadThisNight: [1] },
      });
      expect(res?.meta?.abilityResult?.deadEvilCount, "❌ 死亡的邪恶玩家应为 1 名").toBe(1);
      expect(res?.meta?.abilityResult?.finalCount).toBe(1);
      expect(after(res, 0)?.isDead).toBe(false);
    });
    it("② 差分：2 名死亡的邪恶 ⇒ 2；无死亡 ⇒ 0", async () => {
      const seats = board(["oracle", "imp", "witch", "chambermaid", "tinker"]);
      seats[1].isDead = true;
      seats[2].isDead = true;
      const two = await runRole(oracleAbility, seats, 0, {
        night: 2,
        phase: "night",
        snapshot: { deadThisNight: [1, 2] },
      });
      // ⚠️ deadEvilCount 判的是「座位 isDead 或在 deadThisNight 里」⇒
      //   要构造 0，必须换一副**无人死亡**的棋盘（否则 1/2 号仍算死亡）
      const clean = board(["oracle", "imp", "witch", "chambermaid", "tinker"]);
      const zero = await runRole(oracleAbility, clean, 0, {
        night: 2,
        phase: "night",
        snapshot: { deadThisNight: [] },
      });
      expect(two?.meta?.abilityResult?.deadEvilCount).toBe(2);
      expect(zero?.meta?.abilityResult?.deadEvilCount).toBe(0);
      expect(
        two?.meta?.abilityResult?.finalCount !== zero?.meta?.abilityResult?.finalCount,
        "❌ 死亡邪恶数 2→0，最终告知值却没变"
      ).toBe(true);
    });
    it("③ 负向对照：涡流局 ⇒ 告知值必须 ≠ 真实值", async () => {
      const seats = board(["oracle", "imp", "chambermaid", "gossip", "tinker"]);
      seats[1].isDead = true;
      const res = await runRole(oracleAbility, seats, 0, {
        night: 2,
        phase: "night",
        snapshot: { deadThisNight: [1], isVortoxWorld: true },
      });
      expect(res?.meta?.abilityResult?.deadEvilCount).toBe(1);
      expect(
        res?.meta?.abilityResult?.finalCount !== 1,
        `❌ 涡流局神谕者必须得到错误数字（实际 ${res?.meta?.abilityResult?.finalCount}）`
      ).toBe(true);
    });
  });

  describe("博学者 savant", () => {
    it("① 主路径：说书人给了一对信息 ⇒ 原样产出且标 isCorrupted=false", async () => {
      const seats = board(["savant", ...SAFE]);
      const res = await runRole(savantAbility, seats, 0, {
        night: 2,
        phase: "day",
        storytellerInput: { result: { correct: "甲是真的", incorrect: "乙是假的" } },
      });
      expect(res?.meta?.abilityResult?.correct).toBe("甲是真的");
      expect(res?.meta?.abilityResult?.incorrect).toBe("乙是假的");
      expect(res?.meta?.isCorrupted).toBe(false);
    });
    it("② 差分：换一对信息 ⇒ 输出必须跟着变", async () => {
      const seats = board(["savant", ...SAFE]);
      const a = await runRole(savantAbility, seats, 0, {
        night: 2,
        phase: "day",
        storytellerInput: { result: { correct: "C1", incorrect: "W1" } },
      });
      const b = await runRole(savantAbility, seats, 0, {
        night: 2,
        phase: "day",
        storytellerInput: { result: { correct: "C2", incorrect: "W2" } },
      });
      expect(a?.meta?.abilityResult?.correct).toBe("C1");
      expect(b?.meta?.abilityResult?.correct).toBe("C2");
      expect(
        a?.meta?.abilityResult?.correct !== b?.meta?.abilityResult?.correct,
        "❌ 换了输入，博学者输出没变"
      ).toBe(true);
    });
    it("③ 负向对照：说书人未填内容 ⇒ 必须标 needsStorytellerInput，且**不得**用占位文案冒充", async () => {
      const seats = board(["savant", ...SAFE]);
      const res = await runRole(savantAbility, seats, 0, {
        night: 2,
        phase: "day",
      });
      expect(res?.meta?.abilityResult?.needsStorytellerInput, "❌ 未填内容必须标 needsStorytellerInput").toBe(true);
      expect(res?.meta?.abilityResult?.correct, "❌ 不得伪造内容").toBe("");
      expect(
        JSON.stringify(res?.meta?.displayInfo ?? {}).includes("正确信息"),
        "❌ 不得再用「正确信息」占位词污染结果（P0-6）"
      ).toBe(false);
    });
  });

  describe("女裁缝 seamstress", () => {
    it("① 主路径：两名目标同为善良 ⇒ sameAlignment=true", async () => {
      const seats = board(["seamstress", "chambermaid", "gossip", "tinker", "imp"]);
      const res = await runRole(seamstressAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [1, 2],
      });
      expect(res?.meta?.abilityResult?.sameAlignment).toBe(true);
      expect(res?.meta?.abilityResult?.actualSameAlignment).toBe(true);
      expect(res?.meta?.abilityResult?.isCorrupted).toBe(false);
    });
    it("② 差分：一善良一邪恶 ⇒ sameAlignment=false", async () => {
      const seats = board(["seamstress", "chambermaid", "gossip", "tinker", "imp"]);
      const res = await runRole(seamstressAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [1, 4],
      });
      expect(res?.meta?.abilityResult?.sameAlignment).toBe(false);
      expect(res?.meta?.abilityResult?.actualSameAlignment).toBe(false);
      expect(res?.meta?.abilityResult?.isTarget2Evil, "❌ 5号小恶魔应判为邪恶").toBe(true);
    });
    it("③ 负向对照：只选 1 名目标 ⇒ 必须中止且不产生结果", async () => {
      const seats = board(["seamstress", "chambermaid", "gossip", "tinker", "imp"]);
      const res = await runRole(seamstressAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [1],
      });
      expect(res?.aborted, "❌ 官方要求选两名玩家 ⇒ 只选一人必须中止").toBe(true);
      expect(res?.meta?.abilityResult, "❌ 中止时不得产出结果").toBeUndefined();
    });
  });

  describe("艺术家 artist", () => {
    it("① 主路径：说书人答「是」⇒ answer 必须为 true", async () => {
      const seats = board(["artist", ...SAFE]);
      const res = await runRole(artistAbility, seats, 0, {
        night: 2,
        phase: "day",
        storytellerInput: { question: "恶魔在奇数位吗？", answer: true },
      });
      expect(res?.meta?.abilityResult?.answer).toBe(true);
      expect(res?.meta?.abilityResult?.question).toBe("恶魔在奇数位吗？");
      expect(res?.meta?.abilityResult?.isCorrupted).toBe(false);
    });
    it("② 差分：答「否」⇒ answer=false（且与①相反）", async () => {
      const seats = board(["artist", ...SAFE]);
      const yes = await runRole(artistAbility, seats, 0, {
        night: 2,
        phase: "day",
        storytellerInput: { question: "Q", answer: true },
      });
      /**
       * ⚠️ 同一 `it` 内的**第二次**限次能力调用前必须手动重置：
       * `beforeEach` 只在 **it 与 it 之间**运行，**不会**在同一 it 的两次 runRole 之间运行。
       * 艺术家是「每局限一次」 ⇒ 不重置的话第二次会被 preCheck 拒绝（`abilityResult` = undefined）。
       * （P0-A 修好之前定义表为空、根本不记账，所以这个缺陷一直没暴露。）
       */
      resetLimitedAbilityUses();
      const no = await runRole(artistAbility, seats, 0, {
        night: 2,
        phase: "day",
        storytellerInput: { question: "Q", answer: false },
      });
      expect(yes?.meta?.abilityResult?.answer).toBe(true);
      expect(no?.meta?.abilityResult?.answer).toBe(false);
    });
    it("③ 负向对照：受干扰（醉酒）⇒ 标记 isCorrupted 且不得擅自替换说书人答案", async () => {
      const seats = board(["artist", ...SAFE]);
      seats[0].statusEffects = [{ type: "drunk" }];
      const res = await runRole(artistAbility, seats, 0, {
        night: 2,
        phase: "day",
        storytellerInput: { question: "Q", answer: true },
      });
      expect(res?.meta?.abilityResult?.isCorrupted, "❌ 受干扰必须标记 isCorrupted").toBe(true);
      expect(res?.meta?.abilityResult?.answer, "❌ 答案由说书人给出，不得被引擎篡改").toBe(true);
    });
  });

  describe("杂耍艺人 juggler", () => {
    it("① 主路径：5 次猜测中猜对 2 个 ⇒ correctCount=2", async () => {
      const seats = board(["juggler", "chambermaid", "gossip", "tinker", "grandmother"]);
      const res = await runRole(jugglerAbility, seats, 0, {
        night: 2,
        phase: "night",
        snapshot: { dayCount: 1 },
        storytellerInput: {
          guesses: [
            { targetSeatId: 1, roleName: "侍女" }, // 对
            { targetSeatId: 2, roleName: "造谣者" }, // 对
            { targetSeatId: 3, roleName: "小恶魔" }, // 错
          ],
        },
      });
      expect(res?.meta?.abilityResult?.realCount, "❌ 应猜对 2 个").toBe(2);
      expect(res?.meta?.abilityResult?.correctCount).toBe(2);
      expect(snap(res, "_abilityResults")?.juggler?.used, "❌ 使用后必须记账 used").toBe(true);
    });
    it("② 差分：改猜测 ⇒ 猜对数必须变", async () => {
      const seats = board(["juggler", "chambermaid", "gossip", "tinker", "grandmother"]);
      const r0 = await runRole(jugglerAbility, seats, 0, {
        night: 2,
        phase: "night",
        snapshot: { dayCount: 1 },
        storytellerInput: {
          guesses: [{ targetSeatId: 1, roleName: "小恶魔" }],
        },
      });
      resetLimitedAbilityUses(0, "juggler_guess");
      const r1 = await runRole(jugglerAbility, seats, 0, {
        night: 2,
        phase: "night",
        snapshot: { dayCount: 1 },
        storytellerInput: {
          guesses: [{ targetSeatId: 1, roleName: "侍女" }],
        },
      });
      expect(r0?.meta?.abilityResult?.realCount).toBe(0);
      expect(r1?.meta?.abilityResult?.realCount).toBe(1);
    });
    it("③ 负向对照：非首个白天（dayCount=2）⇒ 必须中止", async () => {
      const seats = board(["juggler", "chambermaid", "gossip", "tinker", "grandmother"]);
      const res = await runRole(jugglerAbility, seats, 0, {
        night: 2,
        phase: "night",
        snapshot: { dayCount: 2 },
        storytellerInput: {
          guesses: [{ targetSeatId: 1, roleName: "侍女" }],
        },
      });
      expect(res?.aborted, "❌ 官方：杂耍艺人只在首个白天猜测 ⇒ 第 2 天必须中止").toBe(true);
      expect(res?.meta?.abilityResult, "❌ 中止时不得产出结果").toBeUndefined();
    });
  });

  describe("贤者 sage", () => {
    it("① 主路径：被恶魔杀死 ⇒ 得出 2 名玩家且其中一名是恶魔", async () => {
      const seats = board(["sage", "imp", "chambermaid", "gossip", "tinker"]);
      const res = await runRole(sageAbility, seats, 0, {
        night: 2,
        phase: "night",
        storytellerInput: { killedByDemon: true },
      });
      const ids: number[] = res?.meta?.abilityResult?.targetIds ?? [];
      expect(ids.length, "❌ 官方：得知 2 名邪恶玩家").toBe(2);
      expect(ids.includes(1), `❌ 其中一名必须是恶魔（imp 在 1 号位，实际 ${JSON.stringify(ids)}）`).toBe(true);
      expect(res?.meta?.abilityResult?.found).toBe(true);
    });
    it("② 差分：恶魔换座位 ⇒ 结果里指向的恶魔座位必须跟着变", async () => {
      const a = await runRole(
        sageAbility,
        board(["sage", "imp", "chambermaid", "gossip", "tinker"]),
        0,
        { night: 2, phase: "night", storytellerInput: { killedByDemon: true } }
      );
      const b = await runRole(
        sageAbility,
        board(["sage", "chambermaid", "imp", "gossip", "tinker"]),
        0,
        { night: 2, phase: "night", storytellerInput: { killedByDemon: true } }
      );
      expect((a?.meta?.abilityResult?.targetIds ?? []).includes(1)).toBe(true);
      expect((b?.meta?.abilityResult?.targetIds ?? []).includes(2)).toBe(true);
    });
    it("③ 负向对照：非被恶魔杀死 ⇒ 无线索（空数组）", async () => {
      const seats = board(["sage", "imp", "chambermaid", "gossip", "tinker"]);
      const res = await runRole(sageAbility, seats, 0, {
        night: 2,
        phase: "night",
        storytellerInput: { killedByDemon: false },
      });
      expect(res?.meta?.abilityResult?.targetIds).toEqual([]);
      expect(res?.meta?.abilityResult?.found).toBe(false);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  二 · 外来者
// ══════════════════════════════════════════════════════════════════════════
describe("L5 · 外来者", () => {
  describe("畸形秀演员 mutant", () => {
    it("① 主路径：已暴露 ⇒ snapshot.mutantRevealed=true 且可被处决", async () => {
      const seats = board(["mutant", ...SAFE]);
      const res = await runRole(mutantAbility, seats, 0, {
        night: 2,
        phase: "night",
        storytellerInput: { mutantRevealed: true },
      });
      expect(snap(res, "mutantRevealed")).toBe(true);
      expect(res?.meta?.abilityResult?.canBeExecuted).toBe(true);
      expect(
        (res?.snapshot?.seats ?? []).every((s: any) => s.isDead === false),
        "❌ 变种人能力不得误杀任何座位"
      ).toBe(true);
    });
    it("② 差分：未暴露 ⇒ 不得落 mutantRevealed", async () => {
      const seats = board(["mutant", ...SAFE]);
      const res = await runRole(mutantAbility, seats, 0, {
        night: 2,
        phase: "night",
      });
      expect(snap(res, "mutantRevealed"), "❌ 未暴露不得落库").toBeUndefined();
      expect(res?.meta?.abilityResult?.canBeExecuted).toBe(false);
    });
    it("③ 负向对照：行动者已死亡 ⇒ 必须中止", async () => {
      const seats = board(["mutant", ...SAFE]);
      seats[0].isDead = true;
      const before = clone(seats);
      const res = await runRole(mutantAbility, seats, 0, {
        night: 2,
        phase: "night",
        storytellerInput: { mutantRevealed: true },
      });
      expect(res?.aborted, "❌ 已死亡者不得发动能力").toBe(true);
      expect(snap(res, "mutantRevealed")).toBeUndefined();
      expect(after(res, 1)?.isDead).toBe(before[1].isDead);
    });
  });

  describe("心上人 sweetheart", () => {
    it("① 主路径：死亡 ⇒ 说书人选定的玩家真的醉酒且带来源标记", async () => {
      const seats = board(["sweetheart", ...SAFE]);
      seats[0].isDead = true;
      const res = await runRole(sweetheartAbility, seats, 0, {
        night: 2,
        phase: "night",
        storytellerInput: { drunkTarget: 2 },
      });
      const victim = after(res, 2);
      expect(victim?.isDrunk, "❌ 3号必须醉酒").toBe(true);
      expect(
        (victim?.statusEffects ?? []).some(
          (e: any) => e.type === "drunk" && e.source === "sweetheart"
        ),
        "❌ 醉酒必须带 source=sweetheart 标记"
      ).toBe(true);
      expect(snap(res, "sweetheartDrunkTargetId"), "❌ 必须记账醉酒目标").toBe(2);
    });
    it("② 差分：换一名目标 ⇒ 只有新目标醉酒", async () => {
      const seats = board(["sweetheart", ...SAFE]);
      seats[0].isDead = true;
      const res = await runRole(sweetheartAbility, seats, 0, {
        night: 2,
        phase: "night",
        storytellerInput: { drunkTarget: 3 },
      });
      expect(after(res, 3)?.isDrunk, "❌ 4号必须醉酒").toBe(true);
      expect(after(res, 2)?.isDrunk, "❌ 未被选中的 3号不得醉酒").toBe(false);
    });
    it("③ 负向对照：未指定目标 ⇒ 无人醉酒（不得随机选人）", async () => {
      const seats = board(["sweetheart", ...SAFE]);
      seats[0].isDead = true;
      const res = await runRole(sweetheartAbility, seats, 0, {
        night: 2,
        phase: "night",
      });
      expect(
        (res?.snapshot?.seats ?? []).some((s: any) => s.isDrunk === true),
        "❌ 未指定目标却出现醉酒者"
      ).toBe(false);
      expect(snap(res, "sweetheartDrunkTargetId")).toBeNull();
    });
  });

  describe("理发师 barber", () => {
    it("① 主路径：死亡当晚指定交换 ⇒ 两人 role 真的互换并记账", async () => {
      const seats = board(["barber", ...SAFE]);
      seats[0].isDead = true;
      const res = await runRole(barberAbility, seats, 0, {
        night: 2,
        phase: "night",
        storytellerInput: { swapA: 1, swapB: 2 },
      });
      expect(after(res, 1)?.role?.id, "❌ 2号应拿到 3号的角色 gossip").toBe("gossip");
      expect(after(res, 2)?.role?.id, "❌ 3号应拿到 2号的角色 chambermaid").toBe("chambermaid");
      expect(snap(res, "barberSwap")).toEqual({ a: 1, b: 2 });
    });
    it("② 差分：交换顺序改变 ⇒ 结果一致（交换是对称操作）", async () => {
      const seats = board(["barber", ...SAFE]);
      seats[0].isDead = true;
      const res = await runRole(barberAbility, seats, 0, {
        night: 2,
        phase: "night",
        storytellerInput: { swapA: 2, swapB: 1 },
      });
      expect(after(res, 1)?.role?.id).toBe("gossip");
      expect(after(res, 2)?.role?.id).toBe("chambermaid");
      expect(snap(res, "barberSwap")).toEqual({ a: 2, b: 1 });
    });
    it("③ 负向对照：未指定交换 ⇒ 角色不得改动", async () => {
      const seats = board(["barber", ...SAFE]);
      seats[0].isDead = true;
      const before = clone(seats);
      const res = await runRole(barberAbility, seats, 0, {
        night: 2,
        phase: "night",
      });
      expect(after(res, 1)?.role?.id).toBe(before[1].role.id);
      expect(after(res, 2)?.role?.id).toBe(before[2].role.id);
      expect(snap(res, "barberSwap")).toBeUndefined();
    });
  });

  describe("呆瓜 klutz", () => {
    it("① 主路径：已死 + 选中邪恶玩家 ⇒ 邪恶阵营立即获胜", async () => {
      const seats = board(["klutz", "chambermaid", "gossip", "tinker", "imp"]);
      seats[0].isDead = true;
      const res = await runRole(klutzAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [4],
      });
      expect(res?.meta?.abilityResult?.isEvil, "❌ 5号小恶魔应判为邪恶").toBe(true);
      expect(res?.meta?.abilityResult?.evilWins, "❌ 选中邪恶 ⇒ 邪恶获胜").toBe(true);
      expect(snap(res, "gameOver"), "❌ 游戏必须真的结束").toBe(true);
      expect(snap(res, "klutzTriggered")).toBe(true);
    });
    it("② 差分：选中善良玩家 ⇒ 邪恶不获胜、游戏不结束", async () => {
      const seats = board(["klutz", "chambermaid", "gossip", "tinker", "imp"]);
      seats[0].isDead = true;
      const res = await runRole(klutzAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [1],
      });
      expect(res?.meta?.abilityResult?.isEvil).toBe(false);
      expect(res?.meta?.abilityResult?.evilWins).toBe(false);
      expect(snap(res, "gameOver")).toBe(false);
    });
    it("③ 负向对照：已触发过 ⇒ 不得二次触发（不得重复结束游戏）", async () => {
      const seats = board(["klutz", "chambermaid", "gossip", "tinker", "imp"]);
      seats[0].isDead = true;
      const res = await runRole(klutzAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [4],
        snapshot: { klutzTriggered: true },
      });
      expect(res?.aborted, "❌ 官方：每局一次 ⇒ 已触发必须中止").toBe(true);
      expect(res?.meta?.abilityResult).toBeUndefined();
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  三 · 爪牙
// ══════════════════════════════════════════════════════════════════════════
describe("L5 · 爪牙", () => {
  describe("镜像双子 evil_twin", () => {
    it("① 主路径：首夜互知 ⇒ 落 evilTwinPair + 对立双子 isGoodTwin", async () => {
      const seats = board(["evil_twin", ...SAFE]);
      const res = await runRole(evil_twinAbility, seats, 0, {
        night: 1,
        phase: "firstNight",
      });
      const pair = snap(res, "evilTwinPair");
      expect(pair?.evilSeatId, "❌ 邪恶方必然是行动者（0号）").toBe(0);
      expect(typeof pair?.goodSeatId, "❌ 必须配一名对立双子").toBe("number");
      expect(after(res, pair.goodSeatId)?.isGoodTwin, "❌ 对立双子座位必须被标记").toBe(true);
      expect(res?.meta?.evilTwinResult?.twinRevealed).toBe(true);
    });
    it("② 差分：说书人指定 twinId ⇒ 必须尊重（不得自行配对）", async () => {
      const seats = board(["evil_twin", ...SAFE]);
      const res = await runRole(evil_twinAbility, seats, 0, {
        night: 1,
        phase: "firstNight",
        storytellerInput: { twinId: 3 },
      });
      expect(snap(res, "evilTwinPair")?.goodSeatId).toBe(3);
      expect(after(res, 3)?.isGoodTwin).toBe(true);
      expect(after(res, 1)?.isGoodTwin, "❌ 未被指定的座位不得被标记").toBe(false);
    });
    it("③ 负向对照：邪恶双子已死亡 ⇒ 必须中止（I3 不变式）", async () => {
      const seats = board(["evil_twin", ...SAFE]);
      seats[0].isDead = true;
      const res = await runRole(evil_twinAbility, seats, 0, {
        night: 1,
        phase: "firstNight",
      });
      expect(res?.aborted, "❌ 死亡玩家不得发动能力").toBe(true);
      expect(snap(res, "evilTwinPair"), "❌ 已死不得配对").toBeUndefined();
    });
  });

  describe("女巫 witch", () => {
    it("① 主路径：诅咒目标 ⇒ 落 isCursed + statusEffects + 快照记账", async () => {
      const seats = board(["witch", ...SAFE]);
      const res = await runRole(witchAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [1],
      });
      expect(after(res, 1)?.isCursed).toBe(true);
      expect(
        (after(res, 1)?.statusEffects ?? []).some(
          (e: any) => e.type === "cursed" && e.source === "witch"
        ),
        "❌ 必须落 cursed/source=witch 标记"
      ).toBe(true);
      expect(snap(res, "witchCurse")?.[1], "❌ 必须记账 witchCurse[1]").toBe(true);
    });
    it("② 差分：换目标 ⇒ 只有新目标被诅咒", async () => {
      const seats = board(["witch", ...SAFE]);
      const res = await runRole(witchAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [2],
      });
      expect(snap(res, "witchCurse")?.[2]).toBe(true);
      expect(
        after(res, 1)?.isCursed,
        "❌ 未被诅咒的座位不得带 isCursed"
      ).not.toBe(true);
    });
    it("③ 负向对照：仅剩 3 名存活 ⇒ 官方「你失去此能力」，必须中止且不诅咒", async () => {
      const seats = [
        seat(0, "witch"),
        seat(1, "chambermaid"),
        seat(2, "gossip"),
        seat(3, "grandmother", { isDead: true }),
        seat(4, "tinker", { isDead: true }),
      ];
      const res = await runRole(witchAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [1],
      });
      expect(res?.aborted).toBe(true);
      expect(
        after(res, 1)?.isCursed,
        "❌ 已失去能力者不得再诅咒"
      ).not.toBe(true);
    });
  });

  describe("洗脑师 cerenovus", () => {
    it("① 主路径：选目标+角色 ⇒ 落 isMad + 疯狂角色名 + 快照 madRoles", async () => {
      const seats = board(["cerenovus", ...SAFE]);
      const res = await runRole(cerenovusAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [1],
        storytellerInput: { roleName: "小恶魔" },
      });
      expect(after(res, 1)?.isMad, "❌ 目标必须被标记需要疯狂").toBe(true);
      expect(after(res, 1)?.cerenovusMadnessRole).toBe("小恶魔");
      expect(snap(res, "madRoles")?.[1], "❌ 必须记账 madRoles[1]").toBe("小恶魔");
    });
    it("② 负向对照：选自己 ⇒ 必须中止（洗脑师不能选自己）", async () => {
      const seats = board(["cerenovus", ...SAFE]);
      const res = await runRole(cerenovusAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [0],
      });
      expect(res?.aborted, "❌ 洗脑师不得选自己").toBe(true);
      expect(after(res, 0)?.isMad, "❌ 中止后不得给自己上疯狂").toBeUndefined();
    });
    it("③ 负向对照（门控）：abilityEffective=false ⇒ 不得施加疯狂（P0 已修）", async () => {
      const seats = board(["cerenovus", ...SAFE]);
      const res = await runRole(cerenovusAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [1],
        meta: { abilityEffective: false },
        storytellerInput: { roleName: "小恶魔" },
      });
      expect(after(res, 1)?.isMad, "❌ 受干扰的洗脑师不得施加疯狂").toBeUndefined();
      expect(
        res?.meta?.cerenovusResult?.blockedByDrunkOrPoison,
        "❌ 必须记录「被醉酒/中毒阻断」"
      ).toBe(true);
    });
  });

  describe("麻脸巫婆 pit_hag", () => {
    it("① 主路径：目标变不在场角色 ⇒ role 改写 + roleChanges 记账", async () => {
      const seats = board(["pit_hag", ...SAFE]);
      const res = await runRole(pit_hagAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [1],
        storytellerInput: { newRoleId: "soldier" },
      });
      expect(after(res, 1)?.role?.id).toBe("soldier");
      expect(snap(res, "roleChanges")).toContainEqual({ seatId: 1, newRole: "soldier" });
      expect(snap(res, "isDemonCreatedByPitHag"), "❌ 非恶魔变换不得标记造恶魔").toBe(false);
    });
    it("② 差分：造出恶魔 ⇒ 置 isDemonCreatedByPitHag / deathDecidedByStoryteller", async () => {
      const seats = board(["pit_hag", ...SAFE]);
      const res = await runRole(pit_hagAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [1],
        storytellerInput: { newRoleId: "vortox" },
      });
      expect(after(res, 1)?.role?.type).toBe("demon");
      expect(snap(res, "isDemonCreatedByPitHag")).toBe(true);
      expect(snap(res, "deathDecidedByStoryteller")).toBe(true);
    });
    it("③ 负向对照：所选角色已在场 ⇒ 官方「无事发生」", async () => {
      const seats = board(["pit_hag", ...SAFE]);
      const res = await runRole(pit_hagAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [1],
        storytellerInput: { newRoleId: "gossip" }, // gossip 已在 3 号位
      });
      expect(after(res, 1)?.role?.id, "❌ 已在场角色不得被改写").toBe("chambermaid");
      expect(snap(res, "roleChanges"), "❌ 无事发生不得记账").toBeUndefined();
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  四 · 恶魔
// ══════════════════════════════════════════════════════════════════════════
describe("L5 · 恶魔", () => {
  describe("方古 fang_gu", () => {
    it("① 主路径：击杀镇民 ⇒ 死亡 + deathSource=fang_gu_kill", async () => {
      const seats = board(["fang_gu", ...SAFE]);
      const res = await runRole(fang_guAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [1],
      });
      expect(after(res, 1)?.isDead).toBe(true);
      expect(after(res, 1)?.deathSource).toBe("fang_gu_kill");
      expect(snap(res, "lastKill")?.demonRole).toBe("fang_gu");
    });
    it("② 主路径：击杀外来者 ⇒ 外来者变方古不死亡、原方古代替死亡（每局一次）", async () => {
      const seats = board(["fang_gu", "barber", "gossip", "grandmother", "tinker"]);
      const res = await runRole(fang_guAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [1],
      });
      expect(after(res, 1)?.role?.id).toBe("fang_gu");
      expect(after(res, 1)?.isDead, "❌ 跳变后外来者不死").toBe(false);
      expect(after(res, 0)?.isDead, "❌ 原方古必须代替死亡").toBe(true);
      expect(after(res, 0)?.deathSource).toBe("fang_gu_jump");
      expect(snap(res, "fangGuHasJumped")).toBe(true);
    });
    it("③ 负向对照：已跳变过 ⇒ 再杀外来者不得跳变（官方「每局仅一次」）", async () => {
      const seats = board(["fang_gu", "barber", "gossip", "grandmother", "tinker"]);
      const res = await runRole(fang_guAbility, seats, 0, {
        night: 4,
        phase: "night",
        targets: [1],
        snapshot: { fangGuHasJumped: true },
      });
      expect(after(res, 1)?.role?.id, "❌ 已跳变过不得再改目标角色").toBe("barber");
      expect(after(res, 1)?.isDead, "❌ 应改为正常击杀").toBe(true);
      expect(after(res, 1)?.deathSource).toBe("fang_gu_kill");
    });
  });

  describe("亡骨魔 vigormortis", () => {
    it("① 主路径：击杀镇民 ⇒ 死亡 + deathSource=vigormortis_kill", async () => {
      const seats = board(["vigormortis", ...SAFE]);
      const res = await runRole(vigormortisAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [1],
      });
      expect(after(res, 1)?.isDead).toBe(true);
      expect(after(res, 1)?.deathSource).toBe("vigormortis_kill");
      expect(snap(res, "vigormortisPoisonedTownsfolkId"), "❌ 击杀镇民不得置中毒目标").toBeNull();
    });
    it("② 主路径：击杀爪牙 ⇒ 死亡但保留能力 + 邻近镇民中毒", async () => {
      const seats = board(["vigormortis", "witch", "chambermaid", "gossip", "grandmother"]);
      const res = await runRole(vigormortisAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [1],
        storytellerInput: { poisonedTownsfolkId: 2 },
      });
      expect(after(res, 1)?.isDead).toBe(true);
      expect(after(res, 1)?.keepsAbilityDead, "❌ 官方：被你杀死的爪牙保留能力").toBe(true);
      expect(after(res, 2)?.isPoisoned).toBe(true);
      expect(snap(res, "vigormortisPoisonedTownsfolkId")).toBe(2);
    });
    it("③ 负向对照：击杀爪牙但未指定中毒目标 ⇒ 不得凭空毒人", async () => {
      const seats = board(["vigormortis", "witch", "chambermaid", "gossip", "grandmother"]);
      const res = await runRole(vigormortisAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [1],
      });
      expect(after(res, 1)?.isDead).toBe(true);
      expect(
        (res?.snapshot?.seats ?? []).some((s: any) => s.isPoisoned === true),
        "❌ 未指定中毒目标却出现中毒者"
      ).toBe(false);
    });
  });

  describe("诺-达鲺 no_dashii", () => {
    it("① 主路径：击杀目标 + 邻近两名镇民中毒 + 快照记账", async () => {
      const seats = board(["no_dashii", ...SAFE]);
      const res = await runRole(no_dashiiAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [2],
      });
      expect(after(res, 2)?.isDead).toBe(true);
      expect(after(res, 2)?.deathSource).toBe("no_dashii_kill");
      expect(snap(res, "noDashiiPoisoned")).toEqual([1, 3]);
      expect(after(res, 1)?.isPoisoned).toBe(true);
      expect(after(res, 3)?.isPoisoned).toBe(true);
    });
    it("② 差分：恶魔邻居换人 ⇒ 中毒名单必须跟着变", async () => {
      const A = board(["no_dashii", ...SAFE]);
      const ra = await runRole(no_dashiiAbility, A, 0, {
        night: 2,
        phase: "night",
        targets: [2],
      });
      // 1 号位换成外来者（barber，非镇民）⇒ 顺时针最近镇民变成 2 号；
      // 逆时针 4 号位是 tinker（**外来者**，非镇民）⇒ 继续走到 3 号 gossip
      const B = board(["no_dashii", "barber", "chambermaid", "gossip", "tinker"]);
      const rb = await runRole(no_dashiiAbility, B, 0, {
        night: 2,
        phase: "night",
        targets: [2],
      });
      expect(snap(ra, "noDashiiPoisoned")).toEqual([1, 3]);
      expect(snap(rb, "noDashiiPoisoned")).toEqual([2, 3]);
    });
    it("③ 负向对照：恶魔两侧都不是镇民 ⇒ 中毒名单为空", async () => {
      const seats = board(["no_dashii", "barber", "sweetheart", "mutant", "klutz"]);
      const res = await runRole(no_dashiiAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [1],
      });
      expect(
        snap(res, "noDashiiPoisoned"),
        "❌ 官方：中毒的是「与你邻近的两名**镇民**」，非镇民邻居不得中毒"
      ).toEqual([]);
      expect(
        (res?.snapshot?.seats ?? []).some((s: any) => s.isPoisoned === true),
        "❌ 不应出现中毒者"
      ).toBe(false);
    });
  });

  describe("涡流 vortox", () => {
    it("① 主路径：击杀目标 ⇒ 死亡 + deathSource=vortox_kill + vortoxActive", async () => {
      const seats = board(["vortox", ...SAFE]);
      const res = await runRole(vortoxAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [1],
      });
      expect(after(res, 1)?.isDead).toBe(true);
      expect(after(res, 1)?.deathSource).toBe("vortox_kill");
      expect(snap(res, "vortoxActive"), "❌ 涡流在场必须置 vortoxActive").toBe(true);
      expect(snap(res, "lastKill")?.killed).toBe(true);
    });
    it("② 负向对照（门控）：abilityEffective=false ⇒ 不得杀人（P0 已修）", async () => {
      const seats = board(["vortox", ...SAFE]);
      const res = await runRole(vortoxAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [1],
        meta: { abilityEffective: false },
      });
      expect(after(res, 1)?.isDead, "❌ 受干扰（中毒/醉酒）的涡流不得杀人").toBe(false);
      expect(snap(res, "lastKill")?.killed, "❌ 必须记账「未击杀」").toBe(false);
      expect(after(res, 1)?.markedForDeath).not.toBe(true);
    });
    it("③ 负向对照：目标受保护 ⇒ 不得死亡", async () => {
      const seats = board(["vortox", ...SAFE]);
      seats[1].isProtected = true;
      const res = await runRole(vortoxAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [1],
      });
      expect(after(res, 1)?.isDead, "❌ 受保护目标不得死亡").toBe(false);
      expect(res?.meta?.vortoxResult?.blockedByProtection, "❌ 必须标记「被保护挡下」").toBe(true);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  五 · 舞蛇人（镇民 · 交换类，单独成组）
// ══════════════════════════════════════════════════════════════════════════
describe("L5 · 镇民 · 舞蛇人 snake_charmer", () => {
  it("① 主路径：选中恶魔 ⇒ 交换角色与阵营，原恶魔中毒", async () => {
    const seats = board(["snake_charmer", "imp", "chambermaid", "gossip", "tinker"]);
    const res = await runRole(snakeCharmerAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1],
    });
    expect(res?.meta?.abilityResult?.swapTriggered).toBe(true);
    expect(after(res, 0)?.role?.id, "❌ 舞蛇人应拿走恶魔角色").toBe("imp");
    expect(after(res, 1)?.role?.id, "❌ 原恶魔应变成舞蛇人").toBe("snake_charmer");
    expect(after(res, 1)?.isPoisoned, "❌ 原恶魔必须中毒").toBe(true);
    expect(snap(res, "snakeCharmerSwapped")).toEqual({ selfId: 0, demonId: 1 });
  });
  it("② 负向对照：选中非恶魔 ⇒ 无事发生（不得交换）", async () => {
    const seats = board(["snake_charmer", "imp", "chambermaid", "gossip", "tinker"]);
    const res = await runRole(snakeCharmerAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [2], // 侍女，不是恶魔
    });
    expect(res?.meta?.abilityResult?.swapTriggered).toBe(false);
    expect(after(res, 0)?.role?.id, "❌ 未选中恶魔不得交换").toBe("snake_charmer");
    expect(after(res, 2)?.isPoisoned).toBe(false);
  });
  it("③ 差分：目标被标记为「恶魔继承者」⇒ 同样视为恶魔并触发交换", async () => {
    const seats = board(["snake_charmer", "chambermaid", "gossip", "tinker", "grandmother"]);
    seats[1].isDemonSuccessor = true;
    const res = await runRole(snakeCharmerAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1],
    });
    expect(res?.meta?.abilityResult?.isDemon).toBe(true);
    expect(res?.meta?.abilityResult?.swapTriggered).toBe(true);
    expect(after(res, 0)?.role?.id, "❌ 继承者同样应触发交换").toBe("chambermaid");
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  六 · 镇民 · 哲学家（一次性取得能力；原实现无 L5 覆盖，本次补齐）
// ══════════════════════════════════════════════════════════════════════════
describe("L5 · 镇民 · 哲学家 philosopher", () => {
  it("① 主路径：选**不在场**镇民 ⇒ 哲学家获得该能力，且无人醉酒", async () => {
    const seats = board(["philosopher", "chambermaid", "gossip", "tinker", "grandmother"]);
    const res = await runRole(philosopherAbility, seats, 0, {
      night: 1,
      phase: "day",
      storytellerInput: { chosenRoleId: "soldier" },
    });
    const r = res?.meta?.philosopherResult;
    expect(r?.chosenRoleId, "❌ 必须记录所选角色").toBe("soldier");
    expect(r?.roleInPlay, "❌ soldier 不在场 ⇒ roleInPlay 必须为 false").toBe(false);
    expect(r?.used, "❌ 发动后 used 必须为 true").toBe(true);

    const self = after(res, 0);
    expect(
      (self?.acquiredAbilities ?? []).includes("soldier"),
      `❌ 官方：「哲学家获得该角色的能力」⇒ acquiredAbilities 必须含 soldier（实际 ${JSON.stringify(self?.acquiredAbilities)}）`
    ).toBe(true);
    expect(self?.philosopherGainedRole, "❌ 座位必须落 philosopherGainedRole").toBe("soldier");
    expect(self?.role?.id, "❌ 身份不变（能力叠加，不是改写身份）").toBe("philosopher");
    expect(snap(res, "philosopherGainedRole"), "❌ 快照必须记账").toBe("soldier");
    expect(
      (res?.snapshot?.seats ?? []).some((s: any) => s.isDrunk === true),
      "❌ 所选角色不在场 ⇒ 不得有任何人变酒鬼"
    ).toBe(false);
  });

  it("② 差分：选**在场**镇民 ⇒ 该玩家变成酒鬼（带 source=philosopher），哲学家仍获得能力", async () => {
    const seats = board(["philosopher", "chambermaid", "gossip", "tinker", "grandmother"]);
    const res = await runRole(philosopherAbility, seats, 0, {
      night: 1,
      phase: "day",
      storytellerInput: { chosenRoleId: "gossip" }, // gossip 在 3 号位
    });
    const r = res?.meta?.philosopherResult;
    expect(r?.roleInPlay, "❌ gossip 在场 ⇒ roleInPlay 必须为 true").toBe(true);
    expect(r?.duplicateSeatId, "❌ 必须定位到在场的 3 号位").toBe(2);

    const dup = after(res, 2);
    expect(dup?.isDrunk, "❌ 官方：「该角色玩家变成酒鬼」").toBe(true);
    expect(
      (dup?.statusEffects ?? []).some(
        (e: any) => e.type === "drunk" && e.source === "philosopher"
      ),
      "❌ 必须落 drunk/source=philosopher 标记"
    ).toBe(true);
    // 未被选中的座位不得被牵连
    expect(after(res, 1)?.isDrunk, "❌ 1 号未被牵连").not.toBe(true);
    expect(
      (after(res, 0)?.acquiredAbilities ?? []).includes("gossip"),
      "❌ 无论所选角色是否在场，哲学家都获得该能力"
    ).toBe(true);
  });

  it("③ 负向对照：说书人未指定角色 ⇒ 一律不落地（used=false 且不获得能力）", async () => {
    const seats = board(["philosopher", ...SAFE]);
    const res = await runRole(philosopherAbility, seats, 0, {
      night: 1,
      phase: "day",
    });
    const r = res?.meta?.philosopherResult;
    expect(r?.used, "❌ 未指定角色 ⇒ used 必须为 false").toBe(false);
    expect(r?.chosenRoleId, "❌ 不得凭空获得某个角色能力").toBeNull();
    expect(after(res, 0)?.philosopherGainedRole, "❌ 不得落 philosopherGainedRole").toBeUndefined();
    expect(after(res, 0)?.acquiredAbilities, "❌ 不得写入 acquiredAbilities").toBeUndefined();
    expect(snap(res, "philosopherGainedRole"), "❌ 快照不得记账").toBeNull();
    expect(
      (res?.snapshot?.seats ?? []).some((s: any) => s.isDrunk === true),
      "❌ 未发动能力却出现酒鬼"
    ).toBe(false);
    expect(
      String(res?.meta?.prompt ?? ""),
      "❌ 未发动时应提示说书人确认，而不是静默跳过"
    ).toContain("确认是否发动能力");
  });

  it("④ ✅ 已修 P0-A+P1：哲学家「每局限一次」已生效（首次成功、二次被拒）", async () => {
    // ⚠️ 实测：`philosopher.ability.ts` 用的是 `"philosopher_gain"`
    //   （:25 preCheck / :83 stateUpdate），而限次注册表里登记的是
    //   `"philosopher_use"`（`utils/LimitedAbilityManager.ts:30`）。
    //   `resolveDef()` 查不到定义时**静默 return true**（同文件 :122 / :137），
    //   ⇒ `preCheckLimitedAbility` 的 abort 分支是**死代码**，
    //     「一次性能力」形同虚设（与同文件 :36-50 注释描述的 artist/seamstress
    //      旧 P0 完全同类，只是这两个 id 当时没被一起对齐）。
    //   `juggler.ability.ts:30` 的 `"juggler_guess"` **连定义都没有**，同一问题。
    //   ⇒ 本条按**当前行为**钉住，作为「一旦修好就会变红」的缺陷登记。
    const seats = board(["philosopher", "chambermaid", "gossip", "tinker", "grandmother"]);
    const first = await runRole(philosopherAbility, seats, 0, {
      night: 1,
      phase: "day",
      storytellerInput: { chosenRoleId: "soldier" },
    });
    expect(first?.aborted, "❌ 首次发动不得中止").not.toBe(true);
    expect(first?.meta?.philosopherResult?.used).toBe(true);

    /**
     * ✅ 2026-09-21 修复后：`philosopher_gain` 已在定义表注册，
     *   且第一次调用**已记账** ⇒ 此处必须为 `false`（不可再发动第二次）。
     *   （修复前定义表为空 ⇒ 静默放行 ⇒ 恒 `true`。）
     */
    expect(
      canUseLimitedAbility(0, "philosopher_gain"),
      "❌ 首次发动后，哲学家不应再被允许发动第二次（限次已生效）"
    ).toBe(false);

    const second = await runRole(philosopherAbility, seats, 0, {
      night: 2,
      phase: "day",
      storytellerInput: { chosenRoleId: "soldier" },
    });
    expect(
      second?.aborted,
      "❌ 哲学家「每局限一次」⇒ 第二次发动必须被 preCheck 中止"
    ).toBe(true);
  });

  it("⑤ 负向对照：哲学家已死亡 ⇒ 必须中止（commonPreCheckAlive）", async () => {
    const seats = board(["philosopher", ...SAFE]);
    seats[0].isDead = true;
    const res = await runRole(philosopherAbility, seats, 0, {
      night: 1,
      phase: "day",
      storytellerInput: { chosenRoleId: "soldier" },
    });
    expect(res?.aborted, "❌ 已死亡者不得发动能力").toBe(true);
    expect(after(res, 0)?.philosopherGainedRole).toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  ✅ 2026-09-21 修复 P1-17：舞蛇人「醉酒/中毒时仍交换」门控
// ══════════════════════════════════════════════════════════════════════════
//  官方核心规则：**醉酒或中毒的玩家失去其能力**（说书人只装作他仍有能力、走过场执行）。
//  官方【舞蛇人】：「每个夜晚，你要选择一名存活玩家：他中毒直到下个黄昏。**如果他明天
//    被处决，他会死亡而你变成他的角色。**」
//  🔴 原实现：`calculate` 里 `swapTriggered: isDemon` —— **只判目标是不是恶魔**，
//    完全没考虑自身醉酒/中毒 ⇒ 醉酒的舞蛇人选中恶魔照样完成交换。
//  ✅ 修法：`swapTriggered: isDemon && isAbilityActive`，其中 `isAbilityActive` 用
//    **本地判定** `isSeatDisabled`（SST）——因为本文件 `preCheck` 是自有实现，
//    `ctx.meta.abilityEffective` 可能恒为 `undefined`（`?? true` 会变假门控）。
describe("L5 · 【修复】舞蛇人 snake_charmer：醉酒/中毒不得交换角色（P1-17）", () => {
  const at = (res: any, id: number) =>
    (res?.snapshot?.seats ?? []).find((s: any) => s.id === id);
  const mk = (drunkIt: boolean) => {
    const seats = board(["snake_charmer", "imp", "chef", "empath"]);
    if (drunkIt) seats[0].statusEffects = [{ type: "drunk" }];
    return seats;
  };
  const run = (seats: any[]) =>
    runRole(snakeCharmerAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1],
    });

  it("① ⭐ 阳性对照：清醒 + 选中恶魔 ⇒ 交换（证明能力本身能生效）", async () => {
    const res = await run(mk(false));
    expect(
      res.meta?.abilityResult?.swapTriggered,
      "❌ 阳性对照失败：清醒舞蛇人选中恶魔应触发交换"
    ).toBe(true);
    expect(at(res, 0)?.role?.id, "❌ 舞蛇人应变成恶魔的角色").toBe("imp");
  });

  it("② 醉酒 + 选中恶魔 ⇒ 不得交换、不得施加中毒", async () => {
    const res = await run(mk(true));
    expect(
      res.meta?.abilityResult?.swapTriggered,
      "❌ 醉酒舞蛇人不得触发交换（官方：醉酒/中毒失去能力）"
    ).toBe(false);
    expect(
      at(res, 0)?.role?.id,
      "❌ 醉酒舞蛇人的角色不得改变"
    ).toBe("snake_charmer");
    const targetFx = (at(res, 1)?.statusEffects ?? []) as any[];
    expect(
      targetFx.some((e: any) => e.source === "snake_charmer"),
      "❌ 醉酒舞蛇人不得令目标中毒"
    ).toBe(false);
  });
});

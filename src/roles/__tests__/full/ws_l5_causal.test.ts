/**
 * L5 · 因果链层
 * ==================================================================
 * 剧本：**窃窃私语（whispering_secrets）** + **无名之墓（tomb_of_the_unknown）**
 * 覆盖：两剧本并集 **32 个唯一角色**（6 个同属两剧本）
 * 日期：2026-09-21 ｜ 验收标准：`outputs/角色全层测试规范.md` §0/§5/§9
 *
 * ── 本层断言什么（与 L2/L3/L4 的分工）────────────────────────────
 *   L2：声明契约（targetConfig / 触发时机）
 *   L3：说书人 UI 渲染
 *   L4：真实浏览器点击流
 *   **L5（本文件）：跑完管道后 `snapshot` 上的状态字段真的变了**
 *       断言一律锚 `isDead / deathSource / statusEffects / role.id / convertedAlignment`
 *       这类**状态字段**，**绝不用文案代替状态**（§0 硬门槛）。
 *
 * ── 三条通用铁律的应用 ────────────────────────────────────────
 *   ① 靶子安全：目标只用 `chambermaid/gossip/tinker/chef/baron` 等**无免疫**角色，
 *      绝不用 sailor/fool/tea_lady/pacifist/innkeeper/goon/moonchild 当靶子。
 *   ② 前提齐备：`runRole` 默认 snapshot 只有 nightCount/gamePhase/seats/statusEffects/
 *      statusEffectMap/isVortoxWorld/reminders/log。凡角色读别的字段（
 *      `lastDuskExecution` / `todayExecutedId` / `abnormalAbilityCount` /
 *      `demonVotedToday` / `setupConfig` …）**必须显式传**，
 *      否则会静默走默认值 → 测试绿但没测到目标分支。
 *      典型：`zombuul` 读 `snapshot.lastDuskExecution !== null`，
 *      而 `undefined !== null` 恒真 ⇒ 不显式传 `null` 会把"白天有人死"误判成常态。
 *   ③ 先怀疑测试再怀疑实现：规则分歧一律回到 `officialRoleDocs.json` 官方原文
 *      （已逐条摘录在 `ws_l1_l2.test.ts` 的 ROLE_SPEC.official）。
 *
 * ── ⚠️ `it.fails` 的用法（已知缺陷登记）──────────────────────────
 *   本文件用 `it.fails` 记录了 **7 个实测确认的 P1 缺陷**，分两类：
 *
 *   【A 类 · 效果类角色不消费 abilityEffective —— 6 个】
 *   （`zombuul` / `shabaloth` / `witch` / `gambler` / `sailor` / `gossip`）
 *   的 `stateUpdate` **没有消费 `meta.abilityEffective`** ⇒ 醉酒/中毒时
 *   效果照旧生效（探针实测：abilityEffective=false 但目标仍然死亡/被诅咒/被醉酒）。
 *   官方（醉酒与中毒）：「中毒的玩家会失去能力……他的能力**不会真实地影响游戏**。」
 *
 *   【B 类 · 信息类角色中毒兜底可撞真值 —— 1 个】
 *   `chambermaid.ability.ts:114-117` 中毒兜底把 wokenCount 硬编码为 1，
 *   与真实值 1 相撞 ⇒ 中毒者得到**完全正确**的信息（违反本文件
 *   `pickFakeWokenCount` 自述的「结果必须 100% 错误」契约）。
 *
 *   ⇒ 断言"官方正确行为"必然红 ⇒ 用 `it.fails` 钉住：
 *     ① 它同时是**缺陷文档**；② 它也是**回归护栏**（谁修好了它会立刻红，
 *        强迫把该用例从 `it.fails` 移出）。详见审计清单。
 */
import { beforeEach, describe, expect, it } from "vitest";

import { board, r, runRole, seat } from "../_tbHarness";
import {
  initializeLimitedAbilityManager,
  resetLimitedAbilityUses,
} from "../../../utils/LimitedAbilityManager";
import { checkGameEnd } from "../../../../app/gameLogic";
import { roles, scripts } from "../../../../app/data";
import {
  generateAndSortQuickStartLineup,
  STANDARD_COMPOSITIONS,
} from "../../../utils/quickStartGenerator";

import { chambermaidAbility } from "../../new_engine/chambermaid.ability";
import { gossipAbility } from "../../new_engine/gossip.ability";
import { oracleAbility } from "../../new_engine/oracle.ability";
import { mathematicianAbility } from "../../new_engine/mathematician.ability";
import { artistAbility } from "../../new_engine/artist.ability";
import { flowergirlAbility } from "../../new_engine/flowergirl.ability";
import { innkeeperAbility } from "../../new_engine/innkeeper.ability";
import { foolAbility } from "../../new_engine/fool.ability";
import {
  recluseAbility,
  resolveRecluseRegistration,
} from "../../new_engine/recluse.ability";
import { politicianAbility } from "../../new_engine/politician.ability";
import { spyAbility } from "../../new_engine/spy.ability";
import { witchAbility } from "../../new_engine/witch.ability";
import { assassinAbility } from "../../new_engine/assassin.ability";
import { devils_advocateAbility } from "../../new_engine/devils_advocate.ability";
import { vortoxAbility } from "../../new_engine/vortox.ability";
import { poAbility } from "../../new_engine/po.ability";
import { zombuulAbility } from "../../new_engine/zombuul.ability";
import { plagueDoctorAbility } from "../../new_engine/plague_doctor.ability";
import { undertakerAbility } from "../../new_engine/undertaker.ability";
import { gamblerAbility } from "../../new_engine/gambler.ability";
import { savantAbility } from "../../new_engine/savant.ability";
import { jugglerAbility } from "../../new_engine/juggler.ability";
import { clockmakerAbility } from "../../new_engine/clockmaker.ability";
import { sailorAbility } from "../../new_engine/sailor.ability";
import { farmerAbility } from "../../new_engine/farmer.ability";
import { scapegoatAbility } from "../../new_engine/scapegoat.ability";
import { drunkAbility } from "../../new_engine/drunk.ability";
import { mutantAbility } from "../../new_engine/mutant.ability";
import { baronAbility } from "../../new_engine/baron.ability";
import { poisonerAbility } from "../../new_engine/poisoner.ability";
import { shabalothAbility } from "../../new_engine/shabaloth.ability";

// ─── 通用工具 ────────────────────────────────────────────────────────

/** 取结果 ctx 里某座位的最新状态 */
const at = (res: any, id: number): any =>
  (res?.snapshot?.seats ?? []).find((s: any) => s.id === id);

/** 把某座位标记为中毒（走 statusEffects；abilityPriority 中间件据此置 abilityEffective=false） */
const poison = (seats: any[], id = 0): any[] =>
  seats.map((s: any) =>
    s.id === id
      ? { ...s, statusEffects: [...(s.statusEffects ?? []), { type: "poisoned" }] }
      : s
  );

const effectsOf = (seat: any): any[] => (seat?.statusEffects ?? []) as any[];
const hasEffect = (seat: any, type: string, source?: string): boolean =>
  effectsOf(seat).some((e) => e.type === type && (source === undefined || e.source === source));

/** 万能棋盘：6 席，无任何免疫角色（靶子安全） */
const SAFE = ["chambermaid", "gossip", "tinker", "chef", "baron", "imp"] as const;
const safeBoard = (firstRole: string) => board([firstRole, ...SAFE.slice(0, 5)]);

beforeEach(() => {
  // ⚠️ 限次能力定义表只由 initializeLimitedAbilityManager() 灌入（模块级单例）。
  //   不调用它 → definitions 为空 → resolveDef 查不到 → canUse/consume **静默返回 true**
  //   ⇒ 「艺术家每局限一次」在测试里形同虚设（假绿）。必须先初始化再清账。
  initializeLimitedAbilityManager();
  // 限量能力是模块级单例 → 每个用例前清账，避免跨用例污染
  resetLimitedAbilityUses();
});

// ═══════════════════════════════════════════════════════════════════════
describe("L5 · 窃窃私语 + 无名之墓 · 32 角色因果链", () => {
  // ─────────────────────────── 侍女 ───────────────────────────
  describe("① 侍女(chambermaid)：得知两名目标里有几人被唤醒", () => {
    it("⭐⭐ 目标确有被唤醒记录 → wokenCount 等于事实值，且结果落库", async () => {
      const seats = safeBoard("chambermaid");
      const res = await runRole(chambermaidAbility, seats, 0, {
        targets: [1, 2],
        snapshot: { wokenPlayerIds: [1] },
      });
      expect(res.aborted).toBeFalsy();
      expect(res.meta.abilityResult.wokenCount, "❌ 唤醒人数与事实不符").toBe(1);
      expect(res.meta.abilityResult.targetIds).toEqual([1, 2]);
      expect(
        res.snapshot._abilityResults?.chambermaid?.wokenCount,
        "❌ 侍女结果未落进 snapshot._abilityResults"
      ).toBe(1);
    });

    it("⭐ 负向对照：只选 1 名目标 → 管道中止（官方要求恰好两名）", async () => {
      const res = await runRole(chambermaidAbility, safeBoard("chambermaid"), 0, {
        targets: [1],
      });
      expect(res.aborted, "❌ 目标数不足时仍应中止").toBe(true);
      expect(res.meta.abilityResult).toBeUndefined();
      expect(String(res.abortReason)).toContain("2名");
    });

    it.fails("⚠️[已知缺陷 it.fails] 中毒 → 结果必须 100% 错（从 0~2 中排除真实值）", async () => {
      const seats = poison(safeBoard("chambermaid"));
      const res = await runRole(chambermaidAbility, seats, 0, {
        targets: [1, 2],
        snapshot: { wokenPlayerIds: [1] },
      });
      expect(res.meta.abilityResult.isDrunk, "❌ 中毒标记未透出").toBe(true);
      expect(res.meta.abilityResult.targetIds).toEqual([1, 2]);
      // 官方（醉酒与中毒）：「中毒的玩家会失去能力……他的能力不会真实地影响游戏。」
      // 本文件 `pickFakeWokenCount`（chambermaid.ability.ts:25）自己声明契约
      // 「结果必须 100% 错误」——但 calculate 的 `else` 兜底分支
      // （chambermaid.ability.ts:114-117）把 wokenCount 硬编码成 1，
      // 恰与真实值 1 相撞 ⇒ 中毒者拿到的是**与真值完全相同**的信息。
      // 根因：内层 `!isAbilityActive || hasVortox` 是死条件（外层已保证 true），
      // 真正的假值逻辑 pickFakeWokenCount 在中毒路径上永远跑不到。
      expect(
        res.meta.abilityResult.wokenCount,
        "缺陷：chambermaid.ability.ts:114 中毒兜底硬编码 wokenCount=1，可撞真值"
      ).not.toBe(1);
    });

    it("⭐ 涡流在场 → 与中毒同样反转（官方：涡流下镇民信息必错）", async () => {
      const seats = board(["chambermaid", "gossip", "tinker", "chef", "baron", "vortox"]);
      const res = await runRole(chambermaidAbility, seats, 0, {
        targets: [1, 2],
        snapshot: { wokenPlayerIds: [1, 2] },
      });
      expect(
        res.meta.abilityResult.wokenCount,
        "❌ 涡流在场时侍女仍报真实值（2）"
      ).not.toBe(2);
      expect(res.aborted, "❌ 涡流下侍女仍应被唤醒（只是信息是假的）").toBeFalsy();
      expect(res.meta.abilityResult.targetIds).toEqual([1, 2]);
    });
  });

  // ─────────────────────────── 造谣者 ───────────────────────────
  describe("② 造谣者(gossip)：声明正确才推进死亡标记", () => {
    it("⭐⭐ 声明正确 → shouldKill=true 且写入 MARK_FOR_DEATH", async () => {
      const res = await runRole(gossipAbility, safeBoard("gossip"), 0, {
        phase: "day",
        targets: [1],
        storytellerInput: { statement: "恶魔坐在 6 号", isStatementTrue: true },
      });
      expect(res.meta.abilityResult.shouldKill, "❌ 声明正确却不算击杀").toBe(true);
      expect(res.meta.stateUpdates?.type).toBe("MARK_FOR_DEATH");
      expect(res.meta.stateUpdates?.targetId).toBe(1);
      expect(res.meta.stateUpdates?.reason).toBe("造谣者的声明正确");
    });

    it("⭐ 负向对照：声明错误 → shouldKill=false 且**不得**写出任何死亡标记", async () => {
      const res = await runRole(gossipAbility, safeBoard("gossip"), 0, {
        phase: "day",
        targets: [1],
        storytellerInput: { statement: "恶魔坐在 6 号", isStatementTrue: false },
      });
      expect(res.meta.abilityResult.shouldKill).toBe(false);
      expect(res.aborted, "❌ 声明错误不是「中止」，而是「正常结算成不击杀」").toBeFalsy();
      expect(
        res.meta.stateUpdates,
        "❌ 声明错误时不应产生任何状态更新"
      ).toBeUndefined();
    });

    it("⭐ 边界：造谣者已死亡 → 管道中止，不产生击杀", async () => {
      const seats = safeBoard("gossip");
      seats[0].isDead = true;
      const res = await runRole(gossipAbility, seats, 0, {
        phase: "day",
        targets: [1],
        storytellerInput: { statement: "x", isStatementTrue: true },
      });
      expect(res.aborted, "❌ 死亡造谣者不应发动").toBe(true);
      expect(res.meta.abilityResult).toBeUndefined();
      expect(res.meta.stateUpdates).toBeUndefined();
    });

    it("✅ 已修 P0-B：中毒的造谣者 → 官方：不应产生击杀", async () => {
      const res = await runRole(gossipAbility, poison(safeBoard("gossip")), 0, {
        phase: "day",
        targets: [1],
        storytellerInput: { statement: "x", isStatementTrue: true },
      });
      // 官方：「中毒的玩家会失去能力……他的能力不会真实地影响游戏」
      // ⇒ 能力仍被"走过场"发动（不 abort），但**世界不得发生任何变化**。
      expect(res.aborted, "中毒 ≠ 不发动；说书人仍走过场").toBeFalsy();
      expect(
        res.meta.stateUpdates,
        "❌ 中毒的造谣者仍产出了击杀指令 —— stateUpdate 未消费 meta.abilityEffective"
      ).toBeUndefined();
      expect(
        res.meta.isCorrupted,
        "受干扰必须留下可观测标记（供说书人知道技能被发动但未生效）"
      ).toBe(true);
    });
  });

  // ─────────────────────────── 神谕者 ───────────────────────────
  describe("③ 神谕者(oracle)：数的是「死亡的邪恶玩家」", () => {
    it("⭐⭐ 恶魔死亡 → deadEvilCount 事实值 = 1", async () => {
      const seats = safeBoard("oracle");
      seats[5] = { ...seats[5], isDead: true }; // imp 死亡
      const res = await runRole(oracleAbility, seats, 0, { night: 2 });
      expect(res.aborted).toBeFalsy();
      expect(res.meta.abilityResult.deadEvilCount, "❌ 死亡邪恶计数错误").toBe(1);
      expect(res.meta.abilityResult.finalCount).toBe(1);
      expect(res.meta.isCorrupted).not.toBe(true);
    });

    it("⭐ 负向对照：死者全是善良 → 报 0（不是「随便一个数」）", async () => {
      const seats = safeBoard("oracle");
      seats[1] = { ...seats[1], isDead: true }; // gossip 善良死亡
      const res = await runRole(oracleAbility, seats, 0, { night: 2 });
      expect(res.meta.abilityResult.deadEvilCount, "❌ 善良死亡不该计入").toBe(0);
      expect(res.meta.abilityResult.finalCount).toBe(0);
      expect(res.aborted).toBeFalsy();
    });

    it("⭐⭐ 中毒 → finalCount 必须 ≠ deadEvilCount 且打上 isCorrupted", async () => {
      const seats = poison(safeBoard("oracle"));
      seats[5] = { ...seats[5], isDead: true };
      const res = await runRole(oracleAbility, seats, 0, { night: 2 });
      expect(res.meta.isCorrupted, "❌ 中毒未标记 isCorrupted").toBe(true);
      expect(res.meta.abilityResult.deadEvilCount, "（真值仍应被记录，供说书人核对）").toBe(1);
      expect(
        res.meta.abilityResult.finalCount,
        "❌ 中毒时仍报真值（官方：中毒者获得错误信息）"
      ).not.toBe(res.meta.abilityResult.deadEvilCount);
    });
  });

  // ─────────────────────────── 数学家 ───────────────────────────
  describe("④ 数学家(mathematician)：异常生效计数", () => {
    it("⭐ 异常次数 3 → 如实报 3", async () => {
      const res = await runRole(mathematicianAbility, safeBoard("mathematician"), 0, {
        night: 2,
        snapshot: { abnormalAbilityCount: 3 },
      });
      expect(res.meta.abilityResult.abnormalCount).toBe(3);
      expect(res.meta.abilityResult.actualCount).toBe(3);
      expect(res.meta.abilityResult.isCorrupted).toBe(false);
    });

    it("⭐ 边界：异常次数为 0 是**合法值**（禁用 toBeTruthy）", async () => {
      const res = await runRole(mathematicianAbility, safeBoard("mathematician"), 0, {
        night: 2,
        snapshot: { abnormalAbilityCount: 0 },
      });
      expect(typeof res.meta.abilityResult.abnormalCount).toBe("number");
      expect(res.meta.abilityResult.abnormalCount).toBe(0);
      expect(res.aborted).toBeFalsy();
    });

    it("⭐⭐ 中毒 → 报出的数与真实值不同 + isCorrupted=true", async () => {
      const res = await runRole(
        mathematicianAbility,
        poison(safeBoard("mathematician")),
        0,
        { night: 2, snapshot: { abnormalAbilityCount: 3 } }
      );
      expect(res.meta.abilityResult.isCorrupted).toBe(true);
      expect(res.meta.abilityResult.abnormalCount, "❌ 中毒仍报真值 3").not.toBe(3);
      expect(res.meta.abilityResult.actualCount, "（真值仍应被记录，供说书人核对）").toBe(3);
    });
  });

  // ─────────────────────────── 艺术家 ───────────────────────────
  describe("⑤ 艺术家(artist)：每局限一次的是非问答", () => {
    it("⭐⭐ 提问 → 问题与答案原样产出（说书人输入不丢）", async () => {
      const res = await runRole(artistAbility, safeBoard("artist"), 0, {
        phase: "day",
        storytellerInput: { question: "恶魔是男的吗？", answer: "否" },
      });
      expect(res.meta.abilityResult.question).toBe("恶魔是男的吗？");
      expect(res.meta.abilityResult.answer).toBe("否");
      expect(res.meta.displayInfo?.type).toBe("artist_answer");
    });

    it("⭐⭐ 负向对照：**同一次行动重复发动** → 第二次必须被拒（每局限一次）", async () => {
      const seats = safeBoard("artist");
      const first = await runRole(artistAbility, seats, 0, {
        phase: "day",
        storytellerInput: { question: "q", answer: "a" },
      });
      expect(first.aborted).toBeFalsy();
      const second = await runRole(artistAbility, seats, 0, {
        phase: "day",
        storytellerInput: { question: "q2", answer: "a2" },
      });
      expect(second.aborted, "❌ 艺术家第二次发动未被拦住").toBe(true);
      expect(String(second.abortReason)).toContain("已经使用过");
      expect(second.meta.abilityResult).toBeUndefined();
    });

    it("⭐ 边界：艺术家已死亡 → 管道中止", async () => {
      const seats = safeBoard("artist");
      seats[0].isDead = true;
      const res = await runRole(artistAbility, seats, 0, {
        phase: "day",
        storytellerInput: { question: "q", answer: "a" },
      });
      expect(res.aborted).toBe(true);
      expect(res.meta.abilityResult).toBeUndefined();
      expect(at(res, 0).isDead, "❌ 死亡状态不应被管道改写").toBe(true);
    });
  });

  // ─────────────────────────── 卖花女孩 ───────────────────────────
  describe("⑥ 卖花女孩(flowergirl)：恶魔今日是否投过票", () => {
    it("⭐ 恶魔投过票 → hasVoted=true", async () => {
      const res = await runRole(flowergirlAbility, safeBoard("flowergirl"), 0, {
        night: 2,
        snapshot: { demonVotedToday: true },
      });
      expect(res.meta.abilityResult.hasVoted).toBe(true);
      expect(res.meta.abilityResult.actualVoted).toBe(true);
      expect(res.meta.abilityResult.isCorrupted).toBe(false);
    });

    it("⭐ 负向对照：恶魔没投票 → hasVoted=false（与上一条相反）", async () => {
      const res = await runRole(flowergirlAbility, safeBoard("flowergirl"), 0, {
        night: 2,
        snapshot: { demonVotedToday: false },
      });
      expect(res.meta.abilityResult.hasVoted).toBe(false);
      expect(res.meta.abilityResult.actualVoted).toBe(false);
      expect(res.meta.abilityResult.isCorrupted).toBe(false);
    });

    it("⭐⭐ 涡流在场 → 信息反转（hasVoted 与真值相反）", async () => {
      const seats = board(["flowergirl", "gossip", "tinker", "chef", "baron", "vortox"]);
      const res = await runRole(flowergirlAbility, seats, 0, {
        night: 2,
        snapshot: { demonVotedToday: true },
      });
      expect(res.meta.abilityResult.isCorrupted, "❌ 涡流未标记干扰").toBe(true);
      expect(res.meta.abilityResult.actualVoted, "（真值仍应被记录）").toBe(true);
      expect(
        res.meta.abilityResult.hasVoted,
        "❌ 涡流下卖花女孩仍报真值"
      ).toBe(false);
    });
  });

  // ─────────────────────────── 旅店老板 ───────────────────────────
  describe("⑦ 旅店老板(innkeeper)：两人免死 + 一人醉酒", () => {
    it("⭐⭐ 选两名目标 → 两人都有 protected、其中一人 drunk 落库", async () => {
      const res = await runRole(innkeeperAbility, safeBoard("innkeeper"), 0, {
        night: 2,
        targets: [1, 2],
      });
      expect(res.aborted).toBeFalsy();
      expect(hasEffect(at(res, 1), "protected", "innkeeper"), "❌ 1 号未获保护").toBe(true);
      expect(hasEffect(at(res, 2), "protected", "innkeeper"), "❌ 2 号未获保护").toBe(true);
      const drunkId = res.meta.abilityResult.drunkId;
      expect([1, 2]).toContain(drunkId);
      expect(
        hasEffect(at(res, drunkId), "drunk", "innkeeper"),
        "❌ 说书人指定的醉酒目标未落库"
      ).toBe(true);
    });

    it("⭐ 负向对照：只选 1 名 → 中止且**不得**给任何人上保护", async () => {
      const res = await runRole(innkeeperAbility, safeBoard("innkeeper"), 0, {
        night: 2,
        targets: [1],
      });
      expect(res.aborted).toBe(true);
      expect(hasEffect(at(res, 1), "protected", "innkeeper")).toBe(false);
      expect(at(res, 1).isProtected).toBeUndefined();
    });

    it("⭐⭐ 中毒 → 能力失效：无保护、无醉酒", async () => {
      const res = await runRole(
        innkeeperAbility,
        poison(safeBoard("innkeeper")),
        0,
        { night: 2, targets: [1, 2] }
      );
      expect(hasEffect(at(res, 1), "protected", "innkeeper"), "❌ 中毒旅店老板仍给保护").toBe(false);
      expect(hasEffect(at(res, 2), "protected", "innkeeper")).toBe(false);
      expect(
        effectsOf(at(res, 1)).some((e) => e.type === "drunk") ||
          effectsOf(at(res, 2)).some((e) => e.type === "drunk"),
        "❌ 中毒旅店老板仍使他人醉酒（官方：能力不生效）"
      ).toBe(false);
    });
  });

  // ─────────────────────────── 弄臣 ───────────────────────────
  describe("⑧ 弄臣(fool)：首次免死", () => {
    it("⭐⭐ 存活且未用过 → 免死生效且标记落库", async () => {
      const res = await runRole(foolAbility, safeBoard("fool"), 0);
      expect(res.meta.abilityResult.survived, "❌ 首次免死未生效").toBe(true);
      const self = at(res, 0);
      expect(self.isDead, "❌ 免死生效后仍被判死").toBe(false);
      expect(self.foolUsed).toBe(true);
      expect(self.hasUsedFoolAbility).toBe(true);
    });

    it("⭐ 负向对照：免死已用过（foolUsed=true）→ 管道中止", async () => {
      const seats = safeBoard("fool");
      seats[0].foolUsed = true;
      const res = await runRole(foolAbility, seats, 0);
      expect(res.aborted, "❌ 免死已用过仍再次生效").toBe(true);
      expect(res.meta.abilityResult).toBeUndefined();
      expect(at(res, 0).foolUsed).toBe(true);
    });

    it("⭐ 边界：中毒的弄臣 → 不触发免死（官方：能力失效）", async () => {
      const res = await runRole(foolAbility, poison(safeBoard("fool")), 0);
      expect(res.aborted, "❌ 中毒弄臣仍免死").toBe(true);
      expect(res.meta.abilityResult).toBeUndefined();
      expect(at(res, 0).foolUsed).toBeUndefined();
    });
  });

  // ─────────────────────────── 圣徒（legacy 通路）───────────────────────────
  describe("⑨ 圣徒(saint)：处决诅咒走 legacy checkGameEnd", () => {
    const live = () => [
      seat(0, "saint"),
      seat(1, "gossip"),
      seat(2, "tinker"),
      seat(3, "chef"),
      seat(4, "imp"),
    ];

    it("⭐⭐ 圣徒死于处决 → 终局 + 邪恶获胜", () => {
      const res = checkGameEnd(live() as any, "execution", 0);
      expect(res.isGameOver, "❌ 圣徒被处决未结束游戏").toBe(true);
      expect(res.winner).toBe("Evil");
      expect(String(res.reason)).toContain("圣徒");
    });

    it("⭐⭐ 负向对照：圣徒被**夜杀** → 游戏继续", () => {
      const seats = live();
      seats[0] = { ...seats[0], isDead: true };
      const res = checkGameEnd(seats as any, "night_death", null);
      expect(res.isGameOver, "❌ 夜杀圣徒错误触发终局").toBe(false);
      expect(res.winner ?? null, "❌ 夜杀圣徒不得判邪恶获胜").not.toBe("Evil");
      expect(String(res.reason ?? "")).not.toContain("圣徒");
    });

    it("⭐ 边界：被处决的是**别人** → 与圣徒无关", () => {
      const res = checkGameEnd(live() as any, "execution", 2);
      expect(res.isGameOver).toBe(false);
      expect(res.winner ?? null).not.toBe("Evil");
      expect(String(res.reason ?? "")).not.toContain("圣徒");
    });
  });

  // ─────────────────────────── 陌客 ───────────────────────────
  describe("⑩ 陌客(recluse)：被当作邪恶的登记判据", () => {
    it("⭐ 默认登记 → 被当作邪恶爪牙", () => {
      const meta: any = {};
      const reg = resolveRecluseRegistration(2, "k1", meta);
      expect(reg.registersAsEvil).toBe(true);
      expect(reg.registersAsRoleType).toBe("minion");
      // 同一 cacheKey 必须复用同一结果（同一次能力内不得自相矛盾）
      expect(resolveRecluseRegistration(2, "k1", meta)).toBe(reg);
    });

    it("⭐⭐ 说书人覆盖优先于默认值", () => {
      const meta: any = {};
      const reg = resolveRecluseRegistration(2, "k2", meta, {
        recluseOverride: { 2: { registersAsEvil: false, registersAsRoleType: null } },
      });
      expect(reg.registersAsEvil, "❌ 说书人覆盖未生效").toBe(false);
      expect(reg.registersAsRoleType).toBeNull();
      expect(
        resolveRecluseRegistration(2, "k2", meta).registersAsEvil,
        "❌ 覆盖值未被缓存（第二次调用又摇回默认随机）"
      ).toBe(false);
    });

    it("⭐⭐ 同一 cacheKey 必须复用同一结果（同一次能力内不得自相矛盾）", () => {
      const meta: any = {};
      const a = resolveRecluseRegistration(2, "k3", meta);
      const b = resolveRecluseRegistration(2, "k3", meta);
      expect(a).toBe(b);
      expect(a).toEqual(b);
      // 座位级 registerAsEvil=false 时登记为善良
      const meta2: any = {};
      const c = resolveRecluseRegistration(
        3,
        "k4",
        meta2,
        undefined,
        { id: 3, registerAsEvil: false, registerAsDemon: false }
      );
      expect(c.registersAsEvil).toBe(false);
    });

    it("⭐ 被动管道不产生任何棋盘变更（陌客不改状态，只改「被如何看待」）", async () => {
      const seats = safeBoard("recluse");
      const before = JSON.stringify(seats.map((s) => ({ id: s.id, isDead: s.isDead })));
      const res = await runRole(recluseAbility, seats, 0, { phase: "night" });
      const after = JSON.stringify(
        res.snapshot.seats.map((s: any) => ({ id: s.id, isDead: s.isDead }))
      );
      expect(after, "❌ 陌客被动管道不应改死亡状态").toBe(before);
      expect(res.meta.recluseActive).toBe(true);
      expect(at(res, 0).isDead).toBe(false);
    });
  });

  // ─────────────────────────── 政客 ───────────────────────────
  describe("⑪ 政客(politician)：终局转阵营", () => {
    it("⭐⭐ 本阵营落败 + 负最大责任 → 真的转邪恶阵营", async () => {
      const res = await runRole(politicianAbility, board(["politician", "imp"]), 0, {
        snapshot: { gameWinner: "evil" },
        storytellerInput: { isMostResponsible: true },
      });
      const self = at(res, 0);
      expect(res.meta.abilityResult.politicianWon).toBe(true);
      expect(res.meta.abilityResult.convertedAlignment).toBe("evil");
      expect(self.isEvilConverted, "❌ 转阵营未落库").toBe(true);
      expect(self.isGoodConverted).toBe(false);
    });

    it("⭐ 负向对照：不负最大责任 → 不改任何阵营字段", async () => {
      const res = await runRole(politicianAbility, board(["politician", "imp"]), 0, {
        snapshot: { gameWinner: "evil" },
        storytellerInput: { isMostResponsible: false },
      });
      expect(res.meta.abilityResult.politicianWon).toBe(false);
      expect(res.meta.abilityResult.convertedAlignment).toBeNull();
      expect(at(res, 0).isEvilConverted).toBeUndefined();
    });

    it("⭐ 边界：中毒的政客 → 即使负最大责任也不转阵营", async () => {
      const seats = poison(board(["politician", "imp"]));
      const res = await runRole(politicianAbility, seats, 0, {
        snapshot: { gameWinner: "evil" },
        storytellerInput: { isMostResponsible: true },
      });
      expect(res.meta.abilityResult.politicianWon).toBe(false);
      expect(at(res, 0).isEvilConverted).toBeUndefined();
      expect(at(res, 0).isGoodConverted).toBeUndefined();
    });
  });

  // ─────────────────────────── 间谍 ───────────────────────────
  describe("⑫ 间谍(spy)：魔典内容事实", () => {
    it("⭐⭐ 魔典逐条与场上真实角色/阵营一致", async () => {
      const seats = board(["spy", "gossip", "baron", "imp", "chef"]);
      const res = await runRole(spyAbility, seats, 0, { night: 2 });
      const players = res.meta.grimoireData.players as any[];
      expect(players.length).toBe(seats.length);
      const byId = (id: number) => players.find((p) => p.seatId === id);
      expect(byId(3)?.roleName).toBe(r("imp").name);
      expect(byId(3)?.alignment).toBe("evil");
      expect(byId(1)?.alignment).toBe("good");
      expect(
        players.filter((p) => p.alignment === "evil").length,
        "❌ 邪恶计数错误（间谍+男爵+小恶魔=3）"
      ).toBe(3);
    });

    it("⭐ 负向对照：中毒的间谍 → grimoireData.isCorrupted=true", async () => {
      const res = await runRole(spyAbility, poison(board(["spy", "gossip", "baron", "imp", "chef"])), 0, {
        night: 2,
      });
      expect(res.meta.isCorrupted).toBe(true);
      expect(res.meta.grimoireData.isCorrupted).toBe(true);
      expect(res.meta.grimoireData.players.length).toBe(5);
    });

    it("⭐ 边界：间谍虽死仍能查看魔典（官方：即使你已死亡）", async () => {
      const seats = board(["spy", "gossip", "baron", "imp", "chef"]);
      seats[0] = { ...seats[0], isDead: true };
      const res = await runRole(spyAbility, seats, 0, { night: 2 });
      expect(res.aborted).toBeFalsy();
      expect(res.meta.grimoireData.players.length).toBe(5);
      expect(at(res, 0).isDead).toBe(true);
    });
  });

  // ─────────────────────────── 女巫 ───────────────────────────
  describe("⑬ 女巫(witch)：诅咒发起提名者", () => {
    it("⭐⭐ 选目标 → isCursed + cursed 效果 + snapshot.witchCurse 三处落库", async () => {
      const res = await runRole(witchAbility, safeBoard("witch"), 0, {
        night: 2,
        targets: [1],
      });
      expect(res.aborted).toBeFalsy();
      expect(at(res, 1).isCursed, "❌ 目标未标记被诅咒").toBe(true);
      expect(hasEffect(at(res, 1), "cursed", "witch"), "❌ cursed 效果未落库").toBe(true);
      expect(res.snapshot.witchCurse?.[1], "❌ snapshot.witchCurse 未落库").toBe(true);
    });

    it("⭐ 负向对照：场上仅 3 名存活 → 女巫失去能力，管道中止", async () => {
      const seats = board(["witch", "gossip", "tinker", "chef", "baron", "imp"]);
      seats[2] = { ...seats[2], isDead: true };
      seats[3] = { ...seats[3], isDead: true };
      seats[5] = { ...seats[5], isDead: true }; // 存活 = witch/gossip/baron = 3
      const res = await runRole(witchAbility, seats, 0, { night: 2, targets: [1] });
      expect(res.aborted, "❌ 存活 3 人时女巫应失去能力").toBe(true);
      expect(at(res, 1).isCursed).toBeUndefined();
      expect(String(res.abortReason)).toContain("3");
    });

    it("⭐ 边界：女巫已死亡 → 管道中止，无诅咒", async () => {
      const seats = safeBoard("witch");
      seats[0] = { ...seats[0], isDead: true };
      const res = await runRole(witchAbility, seats, 0, { night: 2, targets: [1] });
      expect(res.aborted).toBe(true);
      expect(at(res, 1).isCursed).toBeUndefined();
      expect(res.snapshot.witchCurse ?? undefined).toBeUndefined();
    });

    it.fails("⚠️[已知缺陷 it.fails] 中毒的女巫 → 官方：不应诅咒任何人", async () => {
      const res = await runRole(witchAbility, poison(safeBoard("witch")), 0, {
        night: 2,
        targets: [1],
      });
      // 官方（醉酒与中毒）：「中毒的玩家会失去能力……他的能力不会真实地影响游戏」
      expect(res.aborted).toBeFalsy();
      expect(
        at(res, 1).isCursed,
        "（缺陷现状：中毒的女巫仍然诅咒成功）"
      ).toBe(true);
      expect(
        at(res, 1).isCursed,
        "缺陷：witch.ability.ts::stateUpdate 未消费 meta.abilityEffective"
      ).toBeUndefined();
    });
  });

  // ─────────────────────────── 刺客 ───────────────────────────
  describe("⑭ 刺客(assassin)：无视一切保护的暗杀", () => {
    it("⭐⭐ 选目标 → isDead + deathSource=assassin_kill + assassinated", async () => {
      const res = await runRole(assassinAbility, safeBoard("assassin"), 0, {
        night: 2,
        targets: [1],
      });
      const target = at(res, 1);
      expect(target.isDead, "❌ 刺客目标未死亡").toBe(true);
      expect(target.deathSource).toBe("assassin_kill");
      expect(target.assassinated).toBe(true);
      expect(res.meta.assassinationSuccess).toBe(true);
    });

    it("⭐⭐ 负向对照：首夜 → 管道中止（官方「在夜晚时*」= 首夜不行动）", async () => {
      const seats = safeBoard("assassin");
      const res = await runRole(assassinAbility, seats, 0, {
        night: 1,
        phase: "firstNight",
        snapshot: { isFirstNight: true },
        targets: [1],
      });
      expect(res.aborted, "❌ 刺客首夜不应行动").toBe(true);
      expect(at(res, 1).isDead).toBe(false);
      expect(at(res, 1).deathSource).toBeUndefined();
    });

    it("⭐⭐ 中毒 → 能力失效：目标不死（官方：中毒者能力不影响游戏）", async () => {
      const res = await runRole(assassinAbility, poison(safeBoard("assassin")), 0, {
        night: 2,
        targets: [1],
      });
      expect(res.meta.assassinationSuccess).toBe(false);
      expect(at(res, 1).isDead, "❌ 中毒刺客仍杀死目标").toBe(false);
      expect(at(res, 1).deathSource).toBeUndefined();
    });

    it("⭐ 边界：目标为僵怖 → 转为 zombuulNightSaved（官方：僵怖仅处决能杀）", async () => {
      const seats = board(["assassin", "zombuul", "tinker", "chef", "baron", "imp"]);
      const res = await runRole(assassinAbility, seats, 0, { night: 2, targets: [1] });
      const target = at(res, 1);
      expect(target.isDead, "❌ 夜杀僵怖不应真死").toBe(false);
      expect(target.zombuulNightSaved).toBe(true);
      expect(target.zombuulSavedSource).toBe("assassin");
    });
  });

  // ─────────────────────────── 魔鬼代言人 ───────────────────────────
  describe("⑮ 魔鬼代言人(devils_advocate)：处决豁免", () => {
    it("⭐⭐ 选目标 → isExecutionProtected + execution_protected 效果 + 记录上次目标", async () => {
      const res = await runRole(devils_advocateAbility, safeBoard("devils_advocate"), 0, {
        night: 2,
        targets: [1],
      });
      const target = at(res, 1);
      expect(target.isExecutionProtected, "❌ 目标未获处决豁免").toBe(true);
      expect(hasEffect(target, "execution_protected", "devils_advocate")).toBe(true);
      expect(res.snapshot.lastDevilsAdvocateTarget).toBe(1);
    });

    it("⭐⭐ 负向对照：连续两晚选同一人 → 管道中止（官方：与上个夜晚不同）", async () => {
      const res = await runRole(devils_advocateAbility, safeBoard("devils_advocate"), 0, {
        night: 2,
        targets: [1],
        snapshot: { lastDevilsAdvocateTarget: 1 },
      });
      expect(res.aborted, "❌ 连续两晚选同一存活玩家应被拒").toBe(true);
      expect(at(res, 1).isExecutionProtected).toBeUndefined();
      expect(String(res.abortReason)).toContain("连续");
    });

    it("⭐ 边界：中毒 → 不放置保护（官方：中毒时能力不生效）", async () => {
      const res = await runRole(
        devils_advocateAbility,
        poison(safeBoard("devils_advocate")),
        0,
        { night: 2, targets: [1] }
      );
      expect(res.meta.abilityResult.protected).toBe(false);
      expect(at(res, 1).isExecutionProtected).toBe(false);
      expect(hasEffect(at(res, 1), "execution_protected")).toBe(false);
    });
  });

  // ─────────────────────────── 涡流 ───────────────────────────
  describe("⑯ 涡流(vortox)：每夜必杀", () => {
    it("⭐⭐ 选目标 → isDead + deathSource=vortox_kill + lastKill", async () => {
      const res = await runRole(vortoxAbility, safeBoard("vortox"), 0, {
        night: 2,
        targets: [1],
      });
      const target = at(res, 1);
      expect(target.isDead, "❌ 涡流未杀死目标").toBe(true);
      expect(target.deathSource).toBe("vortox_kill");
      expect(res.snapshot.lastKill?.killed).toBe(true);
      expect(res.snapshot.lastKill?.demonRole).toBe("vortox");
      expect(res.snapshot.vortoxActive).toBe(true);
    });

    it("⭐⭐ 负向对照：中毒的涡流 → 不下杀手（P0 已修，本用例钉住）", async () => {
      const res = await runRole(vortoxAbility, poison(safeBoard("vortox")), 0, {
        night: 2,
        targets: [1],
      });
      expect(at(res, 1).isDead, "❌ 中毒涡流仍杀人").toBe(false);
      expect(at(res, 1).deathSource).toBeUndefined();
      expect(res.snapshot.lastKill?.killed).toBe(false);
      expect(res.meta.isCorrupted).toBe(true);
    });

    it("⭐ 边界：目标受保护 → 不死且 blockedByProtection=true", async () => {
      const seats = safeBoard("vortox");
      seats[1] = { ...seats[1], statusEffects: [{ type: "protected", source: "innkeeper" }] };
      const res = await runRole(vortoxAbility, seats, 0, { night: 2, targets: [1] });
      expect(at(res, 1).isDead).toBe(false);
      expect(res.meta.abilityResult.blockedByProtection).toBe(true);
      expect(res.snapshot.lastKill?.killed).toBe(false);
    });
  });

  // ─────────────────────────── 珀 ───────────────────────────
  describe("⑰ 珀(po)：最多三名，且「未选人 ⇒ 下次必选三名」", () => {
    it("⭐⭐ 选满 3 名 → 三人全死且死因一致", async () => {
      const res = await runRole(poAbility, safeBoard("po"), 0, {
        night: 2,
        targets: [1, 2, 3],
      });
      for (const id of [1, 2, 3]) {
        expect(at(res, id).isDead, `❌ ${id + 1}号未死亡`).toBe(true);
        expect(at(res, id).deathSource).toBe("po_kill");
      }
      expect(res.meta.abilityResult.killedTargetIds).toEqual([1, 2, 3]);
      expect(res.snapshot.poCharged, "❌ 使用后应进入「已充能」（下夜可选 1 人）").toBe(false);
    });

    it("⭐ 负向对照：超过 3 名目标 → 管道中止", async () => {
      const res = await runRole(poAbility, safeBoard("po"), 0, {
        night: 2,
        targets: [1, 2, 3, 4],
      });
      expect(res.aborted, "❌ 珀超过 3 名目标应被拒").toBe(true);
      expect(at(res, 1).isDead).toBe(false);
      expect(String(res.abortReason)).toContain("3");
    });

    it("⭐⭐ 边界：选择 0 名 → 无人死亡但必须充能（官方：下次要选三名）", async () => {
      const res = await runRole(poAbility, safeBoard("po"), 0, {
        night: 2,
        targets: [],
      });
      expect(res.aborted).toBeFalsy();
      expect(res.snapshot.poCharged, "❌ 珀「上次未选人」状态未落库").toBe(true);
      expect(at(res, 1).isDead).toBe(false);
      expect(at(res, 2).isDead).toBe(false);
    });

    it("⭐ 中毒 → 不杀人且 poCharged=false", async () => {
      const res = await runRole(poAbility, poison(safeBoard("po")), 0, {
        night: 2,
        targets: [1, 2, 3],
      });
      expect(at(res, 1).isDead).toBe(false);
      expect(at(res, 2).isDead).toBe(false);
      expect(res.snapshot.poCharged).toBe(false);
    });
  });

  // ─────────────────────────── 僵怖 ───────────────────────────
  describe("⑱ 僵怖(zombuul)：白天无人死才杀人", () => {
    it("⭐⭐ 白天无人死亡 → 目标死亡 + zombuul_kill", async () => {
      const res = await runRole(zombuulAbility, safeBoard("zombuul"), 0, {
        night: 2,
        snapshot: { lastDuskExecution: null, dayDeathsToday: 0 },
        targets: [1],
      });
      expect(res.aborted, "❌ 白天无人死时僵怖必须被唤醒").toBeFalsy();
      expect(at(res, 1).isDead, "❌ 僵怖未杀死目标").toBe(true);
      expect(at(res, 1).deathSource).toBe("zombuul_kill");
      expect(at(res, 1).markedForDeath).toBe(true);
    });

    it("⭐⭐ 负向对照：白天有人被处决 → 僵怖不唤醒、无人死亡", async () => {
      const res = await runRole(zombuulAbility, safeBoard("zombuul"), 0, {
        night: 2,
        snapshot: { lastDuskExecution: 2, dayDeathsToday: 1 },
        targets: [1],
      });
      expect(res.aborted, "❌ 白天有人死时僵怖不应被唤醒").toBe(true);
      expect(at(res, 1).isDead).toBe(false);
      expect(String(res.abortReason)).toContain("白天有人死亡");
    });

    it("⭐ 边界：目标已死 → 不重复结算（validTargets 过滤）", async () => {
      const seats = safeBoard("zombuul");
      seats[1] = { ...seats[1], isDead: true };
      const res = await runRole(zombuulAbility, seats, 0, {
        night: 2,
        snapshot: { lastDuskExecution: null, dayDeathsToday: 0 },
        targets: [1],
      });
      expect(res.meta.validTargets, "❌ 已死目标应被过滤").toEqual([]);
      expect(at(res, 1).isDead).toBe(true);
      expect(at(res, 1).deathSource).toBeUndefined();
    });

    it.fails("⚠️[已知缺陷 it.fails] 中毒的僵怖 → 官方：不应杀人", async () => {
      const res = await runRole(zombuulAbility, poison(safeBoard("zombuul")), 0, {
        night: 2,
        snapshot: { lastDuskExecution: null, dayDeathsToday: 0 },
        targets: [1],
      });
      expect(res.aborted).toBeFalsy();
      expect(at(res, 1).isDead, "（缺陷现状：中毒的僵怖仍然杀人）").toBe(true);
      expect(
        at(res, 1).isDead,
        "缺陷：zombuul.ability.ts::updateKillState 未消费 meta.abilityEffective"
      ).toBe(false);
    });
  });

  // ─────────────────────────── 瘟疫医生 ───────────────────────────
  describe("⑲ 瘟疫医生(plague_doctor)：死亡时说书人获得爪牙能力", () => {
    it("⭐⭐ 死亡 → storytellerAbilities 追加一条且来源正确", async () => {
      const seats = [seat(0, "plague_doctor", { isDead: true }), seat(1, "imp")];
      const res = await runRole(plagueDoctorAbility, seats, 0, {
        snapshot: { gamePhase: "night" },
      });
      const granted = res.snapshot.storytellerAbilities as any[];
      expect(granted).toHaveLength(1);
      expect(granted[0].roleId).toBe("poisoner");
      expect(granted[0].source).toBe("plague_doctor");
      expect(res.meta.abilityResult.storytellerAcquired).toBe(true);
    });

    it("⭐⭐ 负向对照：尚未死亡 → 管道中止，说书人什么也没拿到", async () => {
      const seats = [seat(0, "plague_doctor"), seat(1, "imp")];
      const res = await runRole(plagueDoctorAbility, seats, 0, {
        snapshot: { gamePhase: "night" },
      });
      expect(res.aborted).toBe(true);
      expect(res.snapshot.storytellerAbilities).toBeUndefined();
      expect(String(res.abortReason)).toContain("尚未死亡");
    });

    it("⭐ 边界：已有其它爪牙能力 → 追加而不是覆盖", async () => {
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
      expect(granted[0].roleId).toBe("witch");
      expect(granted[1].roleId).toBe("cerenovus");
    });
  });

  // ─────────────────────────── 送葬者 ───────────────────────────
  describe("⑳ 送葬者(undertaker)：得知今日被处决者的角色", () => {
    const executed = () => {
      const seats = safeBoard("undertaker");
      // safeBoard 布局：0=undertaker 1=chambermaid 2=gossip **3=tinker** 4=chef 5=baron
      // → 要把「被处决者」钉在 tinker 上，必须用 3 号位（不是 2 号位）
      seats[3] = { ...seats[3], isDead: true, executedToday: true };
      return seats;
    };

    it("⭐⭐ 今日有处决死者 → 报出**该座位的真实角色名**", async () => {
      const res = await runRole(undertakerAbility, executed(), 0, {
        night: 2,
        snapshot: { todayExecutedId: 3 },
      });
      expect(res.aborted).toBeFalsy();
      expect(res.meta.abilityResult.executedSeatId, "❌ 被处决座位号识别错误").toBe(3);
      expect(
        res.meta.abilityResult.roleName,
        "❌ 送葬者得知的角色名与死者真实角色不符"
      ).toBe(r("tinker").name);
    });

    it("⭐⭐ 负向对照：今日无人死于处决 → 管道中止（官方：可能不被唤醒）", async () => {
      const res = await runRole(undertakerAbility, safeBoard("undertaker"), 0, {
        night: 2,
        snapshot: { todayExecutedId: null },
      });
      expect(res.aborted, "❌ 无今日处决时送葬者不应产出信息").toBe(true);
      expect(res.meta.abilityResult).toBeUndefined();
      expect(String(res.abortReason)).toContain("处决");
    });

    it("⭐ 边界：首夜 → 管道中止（官方「每个夜晚*」）", async () => {
      const res = await runRole(undertakerAbility, executed(), 0, {
        night: 1,
        phase: "firstNight",
        snapshot: { todayExecutedId: 3 },
      });
      expect(res.aborted).toBe(true);
      expect(res.meta.abilityResult).toBeUndefined();
      expect(String(res.abortReason), "❌ 首夜应因「不唤醒」而中止").toContain("首夜");
    });

    it("⭐ 中毒 → 报出的角色名必须与真值不同", async () => {
      const res = await runRole(undertakerAbility, poison(executed()), 0, {
        night: 2,
        snapshot: { todayExecutedId: 3 },
      });
      expect(res.meta.isCorrupted, "❌ 中毒未标记 isCorrupted").toBe(true);
      expect(res.meta.abilityResult.executedSeatId).toBe(3);
      expect(
        res.meta.abilityResult.roleName,
        "❌ 中毒送葬者仍报真实角色名"
      ).not.toBe(r("tinker").name);
    });
  });

  // ─────────────────────────── 赌徒 ───────────────────────────
  describe("㉑ 赌徒(gambler)：猜错即死", () => {
    it("⭐⭐ 猜错 → 本人死亡 + deathSource=gambler_guess_fail", async () => {
      const res = await runRole(gamblerAbility, safeBoard("gambler"), 0, {
        night: 2,
        targets: [1],
        storytellerInput: { guessedRole: "imp" },
      });
      const self = at(res, 0);
      expect(res.meta.abilityResult.isGuessCorrect).toBe(false);
      expect(self.isDead, "❌ 赌徒猜错却未死").toBe(true);
      expect(self.deathSource).toBe("gambler_guess_fail");
      expect(self.diedAtNight).toBe(2);
    });

    it("⭐⭐ 负向对照：猜对 → 本人存活，无死亡字段", async () => {
      // safeBoard 布局：0=赌徒 1=chambermaid 2=gossip … → 猜 1 号位就得猜 chambermaid
      // ⚠️ gambler.ability.ts:36-37 用 **role.id** 比对（不是角色名）
      const res = await runRole(gamblerAbility, safeBoard("gambler"), 0, {
        night: 2,
        targets: [1],
        storytellerInput: { guessedRole: "chambermaid" },
      });
      expect(
        res.meta.abilityResult.isGuessCorrect,
        "❌ 目标 1 号位是 chambermaid，猜 chambermaid 应判对"
      ).toBe(true);
      expect(res.meta.abilityResult.shouldDie).toBe(false);
      expect(at(res, 0).isDead).toBe(false);
      expect(at(res, 0).deathSource).toBeUndefined();
    });

    it("⭐ 边界：本人受保护 → 猜错也不死", async () => {
      const seats = safeBoard("gambler");
      seats[0] = { ...seats[0], statusEffects: [{ type: "protected", source: "innkeeper" }] };
      const res = await runRole(gamblerAbility, seats, 0, {
        night: 2,
        targets: [1],
        storytellerInput: { guessedRole: "imp" },
      });
      expect(res.meta.abilityResult.isProtected).toBe(true);
      expect(at(res, 0).isDead).toBe(false);
      expect(res.meta.abilityResult.shouldDie).toBe(false);
    });

    it("✅ 已修 P0-B：中毒的赌徒 → 官方：能力不生效，不应死亡", async () => {
      const res = await runRole(gamblerAbility, poison(safeBoard("gambler")), 0, {
        night: 2,
        targets: [1],
        storytellerInput: { guessedRole: "imp" },
      });
      // 官方（醉酒与中毒）：「中毒的玩家会失去能力……他的能力不会真实地影响游戏」
      // ⇒ 计算阶段仍会跑（说书人走过场，`abilityResult` 照常产出），
      //   但 **world 不得变化** —— 赌徒不得死亡。
      expect(res.meta.abilityResult.isGuessCorrect, "计算产物：仍会判猜错").toBe(false);
      expect(res.meta.abilityResult.shouldDie, "计算产物：仍会判该死").toBe(true);
      expect(
        at(res, 0).isDead,
        "❌ 中毒的赌徒仍然死亡 —— stateUpdate 未消费 meta.abilityEffective"
      ).toBe(false);
      expect(
        res.meta.isCorrupted,
        "受干扰必须留下可观测标记（供说书人知道技能被发动但未生效）"
      ).toBe(true);
    });
  });

  // ─────────────────────────── 博学者 ───────────────────────────
  describe("㉒ 博学者(savant)：一真一假两条信息", () => {
    it("⭐ 说书人填了内容 → 原样产出且不打干扰标记", async () => {
      const res = await runRole(savantAbility, safeBoard("savant"), 0, {
        phase: "day",
        storytellerInput: { result: { correct: "真信息", incorrect: "假信息" } },
      });
      expect(res.meta.abilityResult.correct).toBe("真信息");
      expect(res.meta.abilityResult.incorrect).toBe("假信息");
      expect(res.meta.isCorrupted).toBe(false);
      expect(res.meta.hasVortox).toBe(false);
    });

    it("⭐⭐ 负向对照：涡流在场 → isCorrupted + hasVortox 双标记（P0-5 修复钉住）", async () => {
      const seats = board(["savant", "gossip", "tinker", "chef", "baron", "vortox"]);
      const res = await runRole(savantAbility, seats, 0, {
        phase: "day",
        storytellerInput: { result: { correct: "真信息", incorrect: "假信息" } },
      });
      expect(res.meta.hasVortox, "❌ 涡流在场未标记 hasVortox").toBe(true);
      expect(res.meta.isCorrupted).toBe(true);
      expect(res.meta.abilityResult).toBeDefined();
    });

    it("⭐⭐ 边界：无说书人输入 → needsStorytellerInput（**禁止**用占位词冒充信息）", async () => {
      const res = await runRole(savantAbility, safeBoard("savant"), 0, { phase: "day" });
      expect(res.meta.abilityResult.needsStorytellerInput, "❌ 未给出「待填写」标记").toBe(true);
      expect(res.meta.abilityResult.correct, "❌ 不得回退成占位字符串").toBe("");
      expect(res.meta.abilityResult.correct).not.toBe("正确信息");
    });

    /**
     * ⭐⭐ **判别对**：只给 `fakeResult`（不给 `result`）时，
     *   「受干扰分支」与「正常分支」的输出**必然不同** —— 这是唯一能把
     *   `isCorrupted` 的取值**观测出来**的方式（只给 `result` 时两分支输出相同）。
     *
     * ⚠️ 变异检验记录（2026-09-21）：把 `isCorrupted` 里的 `|| hasVortox` 删掉，
     *   下面两条**依然全绿** —— 不是测试漏，而是该条件**等价变异体（不可观测）**：
     *   探针实测涡流局 `meta = { abilityEffective:false, isAbilityActive:true,
     *   hasVortox:true, isCorrupted:true }` ⇒ 管道中间件 `abilityPriorityCalculation`
     *   已把涡流局的 `abilityEffective` 置 false，`!abilityEffective` **先一步**成立，
     *   所以 `|| hasVortox` 恒被覆盖。
     *   ⇒ 结论：它是**冗余（防御性）写法，不是缺陷**。保留是对的 ——
     *     万一将来中间件不再为涡流置 `abilityEffective=false`（如按角色类型分流），
     *     这一行仍能兜住「涡流局必须全假」。**不要删**。
     */
    it("⭐⭐ 判别对 A：涡流局 + 只说书人给了 fakeResult ⇒ 必须走受干扰分支（产出 fake 内容）", async () => {
      const seats = board(["savant", "gossip", "tinker", "chef", "baron", "vortox"]);
      const res = await runRole(savantAbility, seats, 0, {
        phase: "day",
        storytellerInput: { fakeResult: { correct: "涡流假1", incorrect: "涡流假2" } },
      });
      expect(res.meta.isCorrupted, "❌ 涡流局未判定为受干扰").toBe(true);
      expect(res.meta.abilityResult.correct, "❌ 未走受干扰分支取 fakeResult").toBe("涡流假1");
      expect(res.meta.abilityResult.incorrect).toBe("涡流假2");
      expect(
        res.meta.abilityResult.needsStorytellerInput,
        "❌ 走了正常分支（fakeResult 没被消费）"
      ).toBeUndefined();
    });

    it("⭐⭐ 判别对 B：无涡流 + 只说书人给了 fakeResult ⇒ 必须走正常分支（fakeResult 不得被消费）", async () => {
      const res = await runRole(savantAbility, safeBoard("savant"), 0, {
        phase: "day",
        storytellerInput: { fakeResult: { correct: "不该被用1", incorrect: "不该被用2" } },
      });
      expect(res.meta.isCorrupted, "❌ 无涡流却判定为受干扰").toBe(false);
      expect(res.meta.abilityResult.correct, "❌ fakeResult 被错误消费").not.toBe("不该被用1");
      expect(
        res.meta.abilityResult.needsStorytellerInput,
        "❌ 无 storytellerInput.result ⇒ 应明确标记「待填写」"
      ).toBe(true);
    });
  });

  // ─────────────────────────── 杂耍艺人 ───────────────────────────
  describe("㉓ 杂耍艺人(juggler)：首个白天猜角色", () => {
    // ⚠️ safeBoard 的实际布局是 0=juggler 1=**chambermaid** 2=**gossip** 3=tinker …
    //    （不是 1=gossip / 2=tinker）—— 猜测表必须与之严格对齐，
    //    否则「逐条比对」永远比不中，correctCount 恒为 0。
    it("⭐⭐ 两条猜测全对 → correctCount=2", async () => {
      const res = await runRole(jugglerAbility, safeBoard("juggler"), 0, {
        phase: "day",
        storytellerInput: {
          guesses: [
            { targetSeatId: 1, roleName: r("chambermaid").name },
            { targetSeatId: 2, roleName: r("gossip").name },
          ],
        },
      });
      expect(res.meta.abilityResult.correctCount, "❌ 猜对数量统计错误").toBe(2);
      expect(res.meta.abilityResult.realCount).toBe(2);
      expect(res.meta.abilityResult.isCorrupted).toBe(false);
    });

    it("⭐ 负向对照：只有一条对 → correctCount=1（差分证明它真在逐条比对）", async () => {
      const res = await runRole(jugglerAbility, safeBoard("juggler"), 0, {
        phase: "day",
        storytellerInput: {
          guesses: [
            { targetSeatId: 1, roleName: r("chambermaid").name },
            { targetSeatId: 2, roleName: "完全不对的角色" },
          ],
        },
      });
      expect(res.meta.abilityResult.correctCount).toBe(1);
      expect(res.meta.abilityResult.realCount).toBe(1);
      expect(res.meta.abilityResult.isCorrupted).toBe(false);
    });

    it("⭐⭐ 边界：非首个白天（dayCount=2）→ 管道中止", async () => {
      const res = await runRole(jugglerAbility, safeBoard("juggler"), 0, {
        phase: "day",
        snapshot: { dayCount: 2 },
        storytellerInput: {
          guesses: [{ targetSeatId: 1, roleName: r("gossip").name }],
        },
      });
      expect(res.aborted, "❌ 杂耍艺人非首日仍可猜测").toBe(true);
      expect(String(res.abortReason)).toContain("首个白天");
      expect(res.meta.abilityResult).toBeUndefined();
    });

    it("⭐ 中毒 → isCorrupted 且报出的数字 ≠ 真实猜对数", async () => {
      const res = await runRole(jugglerAbility, poison(safeBoard("juggler")), 0, {
        phase: "day",
        storytellerInput: {
          guesses: [
            { targetSeatId: 1, roleName: r("chambermaid").name },
            { targetSeatId: 2, roleName: r("gossip").name },
          ],
        },
      });
      expect(res.meta.isCorrupted).toBe(true);
      expect(res.meta.abilityResult.realCount, "（真值仍应被记录）").toBe(2);
      expect(
        res.meta.abilityResult.correctCount,
        "❌ 中毒杂耍艺人仍报真实猜对数 2"
      ).not.toBe(2);
    });
  });

  // ─────────────────────────── 钟表匠 ───────────────────────────
  describe("㉔ 钟表匠(clockmaker)：首夜得知恶魔↔爪牙最近距离", () => {
    it("⭐⭐ 相邻布局 → 环形距离 = 1", async () => {
      const seats = board(["clockmaker", "imp", "poisoner", "gossip", "tinker"]);
      const res = await runRole(clockmakerAbility, seats, 0, { night: 1, phase: "firstNight" });
      expect(typeof res.meta.abilityResult).toBe("number");
      expect(res.meta.abilityResult, "❌ 邻座距离应为 1").toBe(1);
      expect(res.aborted).toBeFalsy();
    });

    it("⭐⭐ 负向对照：换布局（距离 2）→ 结果必须跟着变", async () => {
      const seats = board(["clockmaker", "imp", "gossip", "tinker", "poisoner"]);
      const res = await runRole(clockmakerAbility, seats, 0, { night: 1, phase: "firstNight" });
      expect(res.meta.abilityResult, "❌ 环形距离计算错误").toBe(2);
      expect(res.meta.abilityResult).not.toBe(1);
      expect(res.aborted).toBeFalsy();
    });

    it("⭐ 边界：场上无爪牙 → 距离记 0（不是 undefined/NaN）", async () => {
      const seats = board(["clockmaker", "imp", "gossip", "tinker", "chef"]);
      const res = await runRole(clockmakerAbility, seats, 0, { night: 1, phase: "firstNight" });
      expect(res.meta.abilityResult).toBe(0);
      expect(res.aborted).toBeFalsy();
      expect(Number.isNaN(res.meta.abilityResult)).toBe(false);
    });

    it("⭐⭐ 中毒 → 报出的距离 ≠ 真实距离（假信息必须错）", async () => {
      const seats = poison(board(["clockmaker", "imp", "poisoner", "gossip", "tinker"]));
      const res = await runRole(clockmakerAbility, seats, 0, {
        night: 1,
        phase: "firstNight",
        meta: { initialNightInfo: { clockmakerInfo: 1 } },
      });
      expect(res.meta.isAbilityActive).toBe(false);
      expect(res.aborted).toBeFalsy();
      expect(
        res.meta.abilityResult,
        "❌ 中毒钟表匠仍报真实距离 1"
      ).not.toBe(1);
    });
  });

  // ─────────────────────────── 水手 ───────────────────────────
  describe("㉕ 水手(sailor)：你或目标之一醉酒", () => {
    it("⭐⭐ 目标为镇民 → **目标**醉酒（水手自己不清醒）", async () => {
      const res = await runRole(sailorAbility, safeBoard("sailor"), 0, {
        night: 2,
        targets: [1],
      });
      expect(res.meta.abilityResult.drunkId, "❌ 目标为镇民时醉酒者应为目标").toBe(1);
      expect(at(res, 1).isDrunk, "❌ 目标未被标记醉酒").toBe(true);
      expect(hasEffect(at(res, 1), "drunk", "sailor")).toBe(true);
      expect(at(res, 0).isDrunk).toBe(false);
    });

    it("⭐⭐ 负向对照：目标非镇民（恶魔）→ **水手自己**醉酒", async () => {
      const res = await runRole(sailorAbility, safeBoard("sailor"), 0, {
        night: 2,
        targets: [5], // imp
      });
      expect(res.meta.abilityResult.drunkId, "❌ 目标非镇民时醉酒者应为水手本人").toBe(0);
      expect(at(res, 0).isDrunk, "❌ 水手未被标记醉酒").toBe(true);
      expect(hasEffect(at(res, 0), "drunk", "sailor")).toBe(true);
      expect(at(res, 5).isDrunk).toBe(false);
    });

    it("⭐ 边界：目标不存在 → 管道中止", async () => {
      const res = await runRole(sailorAbility, safeBoard("sailor"), 0, {
        night: 2,
        targets: [99],
      });
      expect(res.aborted).toBe(true);
      expect(res.meta.abilityResult).toBeUndefined();
      expect(at(res, 0).isDrunk).toBe(false);
    });

    it.fails("⚠️[已知缺陷 it.fails] 中毒的水手 → 官方：不应让任何人醉酒", async () => {
      const res = await runRole(sailorAbility, poison(safeBoard("sailor")), 0, {
        night: 2,
        targets: [1],
      });
      // 官方（醉酒与中毒）：「中毒的玩家会失去能力……他的能力不会真实地影响游戏」
      expect(res.aborted).toBeFalsy();
      expect(res.meta.abilityResult, "（缺陷现状：中毒水手仍判定出了醉酒者）").toBeDefined();
      expect(
        effectsOf(at(res, 1)).some((e) => e.type === "drunk") ||
          effectsOf(at(res, 0)).some((e) => e.type === "drunk"),
        "缺陷：sailor.ability.ts::stateUpdate 未消费 meta.abilityEffective"
      ).toBe(false);
    });
  });

  // ─────────────────────────── 农夫 ───────────────────────────
  describe("㉖ 农夫(farmer)：夜晚死亡才传承", () => {
    const nightDead = () => {
      const seats = safeBoard("farmer");
      seats[0] = { ...seats[0], isDead: true };
      return seats;
    };

    it("⭐⭐ 夜晚死亡 → 说书人指定的善良玩家**角色真的变成农夫**", async () => {
      const res = await runRole(farmerAbility, nightDead(), 0, {
        night: 2,
        snapshot: { gamePhase: "night" },
        storytellerInput: { newFarmerSeatId: 2 },
      });
      const heir = at(res, 2);
      expect(res.meta.abilityResult.hasTransfer).toBe(true);
      expect(res.meta.abilityResult.newFarmerId).toBe(2);
      expect(heir.role?.id, "❌ 继承者的 role.id 未替换为 farmer").toBe("farmer");
      expect(heir.roleType).toBe("townsfolk");
      expect((heir.statusDetails ?? []).join("|")).toContain("成为新农夫");
    });

    it("⭐⭐ 负向对照：白天死亡 → 管道中止（官方：当你在**夜晚**死亡时）", async () => {
      const seats = safeBoard("farmer");
      seats[0] = { ...seats[0], isDead: true };
      const res = await runRole(farmerAbility, seats, 0, {
        night: 2,
        snapshot: { gamePhase: "day" },
      });
      expect(res.aborted, "❌ 白天死亡的农夫不应传承").toBe(true);
      expect(res.meta.abilityResult).toBeUndefined();
      // safeBoard 布局 2 号位 = gossip（不是 tinker）→ 断言「2 号位角色原封不动」
      expect(at(res, 2).role?.id, "❌ 白天死亡不应改动任何人").toBe("gossip");
    });

    it("⭐ 边界：中毒 → 无传承，且不写 hasTransfer", async () => {
      const res = await runRole(farmerAbility, poison(nightDead()), 0, {
        night: 2,
        snapshot: { gamePhase: "night" },
        storytellerInput: { newFarmerSeatId: 2 },
      });
      expect(res.meta.abilityResult.hasTransfer).toBe(false);
      expect(res.meta.abilityResult.newFarmerId).toBeNull();
      expect(at(res, 2).role?.id, "❌ 中毒农夫仍传承").toBe("gossip");
    });
  });

  // ─────────────────────────── 替罪羊 ───────────────────────────
  describe("㉗ 替罪羊(scapegoat)：代替同阵营玩家被处决", () => {
    it("⭐⭐ 同阵营被处决 → 替罪羊死、原玩家活、executedTodayId 指向替罪羊", async () => {
      const res = await runRole(scapegoatAbility, safeBoard("scapegoat"), 0, {
        phase: "day",
        storytellerInput: { nominatedSeatId: 1 },
      });
      expect(res.aborted, "❌ 同阵营时替罪羊应可替代").toBeFalsy();
      expect(at(res, 0).isDead, "❌ 替罪羊未死亡").toBe(true);
      expect(at(res, 1).isDead, "❌ 原被处决者竟也死亡").toBe(false);
      expect(res.snapshot.executedTodayId, "❌ executedTodayId 未指向替罪羊").toBe(0);
      expect(res.snapshot.deadTodayIds).toContain(0);
    });

    it("⭐⭐ 负向对照：被处决者是**异阵营** → 管道中止，两人都不死", async () => {
      // safeBoard 布局：0=scapegoat(外来者/善良) … 4=chef(镇民/善良) **5=baron(爪牙/邪恶)**
      // → 异阵营的代表只能是 5 号位（4 号位 chef 与替罪羊同为善良，应当允许替代）
      const res = await runRole(scapegoatAbility, safeBoard("scapegoat"), 0, {
        phase: "day",
        storytellerInput: { nominatedSeatId: 5 }, // baron = 爪牙（邪恶）
      });
      expect(res.aborted, "❌ 异阵营不得替代（官方：你的阵营的一名玩家）").toBe(true);
      expect(at(res, 0).isDead).toBe(false);
      expect(at(res, 5).isDead).toBe(false);
    });

    it("⭐ 边界：说书人裁定不替代 → 无任何状态变更", async () => {
      const res = await runRole(scapegoatAbility, safeBoard("scapegoat"), 0, {
        phase: "day",
        storytellerInput: { nominatedSeatId: 1, shouldSubstitute: false },
      });
      expect(res.meta.abilityResult.substituted).toBe(false);
      expect(res.meta.abilityResult.executedSeatId).toBe(1);
      expect(at(res, 0).isDead).toBe(false);
      expect(res.snapshot.executedTodayId).toBeUndefined();
    });
  });

  // ─────────────────────────── 酒鬼 ───────────────────────────
  describe("㉘ 酒鬼(drunk)：首夜设置「以为的镇民」+ 永久醉酒", () => {
    it("⭐⭐ 首夜 → fakeRole 与 permanent drunk 双落库", async () => {
      const res = await runRole(drunkAbility, safeBoard("drunk"), 0, {
        night: 1,
        phase: "firstNight",
        storytellerInput: { fakeRole: { id: "chef", name: "厨师", type: "townsfolk" } },
      });
      const self = at(res, 0);
      expect(self.fakeRole?.id, "❌ fakeRole 未落库").toBe("chef");
      const drunkEffect = effectsOf(self).find(
        (e) => e.type === "drunk" && e.source === "drunk"
      );
      expect(drunkEffect, "❌ 永久醉酒效果未落库").toBeTruthy();
      expect(drunkEffect.permanent).toBe(true);
      expect(res.meta.drunkSetupApplied).toBe(true);
    });

    it("⭐⭐ 负向对照：非首夜 → 管道中止（fakeRole 只设一次）", async () => {
      const res = await runRole(drunkAbility, safeBoard("drunk"), 0, {
        night: 2,
        phase: "night",
      });
      expect(res.aborted, "❌ 非首夜不应再设置酒鬼").toBe(true);
      expect(res.meta.drunkSetupApplied).not.toBe(true);
      expect(at(res, 0).fakeRole).toBeUndefined();
    });

    it("⭐ 边界：酒鬼已死亡 → 管道中止", async () => {
      const seats = safeBoard("drunk");
      seats[0] = { ...seats[0], isDead: true };
      const res = await runRole(drunkAbility, seats, 0, {
        night: 1,
        phase: "firstNight",
      });
      expect(res.aborted).toBe(true);
      expect(at(res, 0).fakeRole).toBeUndefined();
      expect(effectsOf(at(res, 0)).some((e) => e.type === "drunk")).toBe(false);
    });
  });

  // ─────────────────────────── 畸形秀演员 ───────────────────────────
  describe("㉙ 畸形秀演员(mutant)：暴露后可被处决（真实路径 = mutantGate）", () => {
    it("⭐⭐ 已暴露身份 → snapshot.mutantRevealed 落库", async () => {
      const res = await runRole(mutantAbility, safeBoard("mutant"), 0, {
        phase: "day",
        storytellerInput: { mutantRevealed: true },
      });
      expect(res.meta.abilityResult.canBeExecuted).toBe(true);
      expect(res.snapshot.mutantRevealed, "❌ mutantRevealed 未落库").toBe(true);
      expect(res.meta.mutantResult?.mutantRevealed).toBe(true);
    });

    it("⭐⭐ 负向对照：未暴露 → 不得写下任何标记（不能「未暴露也能被处决」）", async () => {
      const res = await runRole(mutantAbility, safeBoard("mutant"), 0, { phase: "day" });
      expect(res.meta.abilityResult.canBeExecuted).toBe(false);
      expect(res.snapshot.mutantRevealed).toBeUndefined();
      expect(res.meta.mutantResult).toBeUndefined();
    });

    it("⭐ 边界：已死亡 → 管道中止", async () => {
      const seats = safeBoard("mutant");
      seats[0] = { ...seats[0], isDead: true };
      const res = await runRole(mutantAbility, seats, 0, { phase: "day" });
      expect(res.aborted).toBe(true);
      expect(res.meta.abilityResult).toBeUndefined();
      expect(res.snapshot.mutantRevealed).toBeUndefined();
    });
  });

  // ─────────────────────────── 男爵 ───────────────────────────
  describe("㉚ 男爵(baron)：+2 外来者 / −2 镇民", () => {
    it("⭐⭐ 管道把 setupConfig 调成 镇民 −2 / 外来者 +2", async () => {
      const res = await runRole(baronAbility, board(["baron", "imp"]), 0, {
        snapshot: { setupConfig: { townsfolkCount: 7, outsiderCount: 2 } },
      });
      const cfg = res.snapshot.setupConfig;
      expect(cfg.outsiderCount, "❌ 外来者未 +2").toBe(4);
      expect(cfg.townsfolkCount, "❌ 镇民未 −2").toBe(5);
      expect(cfg.baronAdjusted, "❌ baronAdjusted 未落库").toBe(true);
      expect(res.meta.displayInfo?.type).toBe("baron_setup_adjustment");
    });

    it("⭐⭐ 负向对照：真实开局抽样 —— 男爵按官方把镇民换成外来者，且**总人数不变**", () => {
      const PLAYERS = 9;
      const base = STANDARD_COMPOSITIONS[PLAYERS];
      const tomb = scripts.find((s) => s.id === "tomb_of_the_unknown")!;

      // ⚠️ 官方（男爵）「增加的外来者角色总是会替换掉原本的镇民角色」= +2 外来者 / −2 镇民。
      //    但 `computeSetupComposition`（setupComposition.ts:101-118）在**外来者池不足**时
      //    只加到池子上限 `room = pool − base.outsider`，并吐 warnings（P0-10 修复语义：
      //    宁可少配 + 告警，也不静默改名单）。
      //    无名之墓的外来者只有 3 名（drunk / scapegoat / mutant）⇒ 9 人局上限只够 +1。
      //    所以这里不能用恒定的 `base.outsider + 2` 当预言机，必须按**池子上限**算期望。
      const outsiderPool = (roles as any[]).filter(
        (rr) => (tomb.roleIds as string[]).includes(rr.id) && rr.type === "outsider"
      ).length;
      const gain = Math.min(2, outsiderPool - base.outsider);

      let found: any = null;
      for (let i = 0; i < 800 && !found; i++) {
        const out = generateAndSortQuickStartLineup(tomb as any, roles as any, PLAYERS);
        if (out.hasBaron) found = out;
      }
      expect(found, "800 次都没抽到男爵，抽样异常").not.toBeNull();
      expect(found.hasBaron, "❌ hasBaron 标记未透出").toBe(true);
      expect(
        found.composition.outsider,
        "❌ 外来者数 ≠ 基础 + min(2, 池子上限)"
      ).toBe(base.outsider + gain);
      expect(found.composition.townsfolk, "❌ 镇民未被等量换出").toBe(
        base.townsfolk - gain
      );
      expect(
        found.composition.outsider +
          found.composition.townsfolk +
          found.composition.minion +
          found.composition.demon,
        "❌ 男爵只改结构、不改总人数"
      ).toBe(PLAYERS);
    });

    it("⭐ 边界：setupConfig 缺失（默认 0）→ 不得出现负数镇民", async () => {
      const res = await runRole(baronAbility, board(["baron", "imp"]), 0, {
        snapshot: { setupConfig: {} },
      });
      expect(res.snapshot.setupConfig.townsfolkCount).toBe(0);
      expect(res.snapshot.setupConfig.outsiderCount).toBe(2);
      expect(
        res.snapshot.setupConfig.townsfolkCount >= 0,
        "❌ 镇民人数出现负数（应被 Math.max(0,…) 兜住）"
      ).toBe(true);
    });
  });

  // ─────────────────────────── 投毒者 ───────────────────────────
  describe("㉛ 投毒者(poisoner)：下毒落库", () => {
    it("⭐⭐ 选目标 → poisoned 效果 + 双持久化记录 + 过期夜次正确", async () => {
      const res = await runRole(poisonerAbility, safeBoard("poisoner"), 0, {
        night: 2,
        targets: [1],
      });
      const target = at(res, 1);
      const eff = effectsOf(target).find(
        (e) => e.type === "poisoned" && e.source === "poisoner"
      );
      expect(eff, "❌ 中毒效果未落库").toBeTruthy();
      expect(eff.expiresAtNight, "❌ 毒应持续到下一夜（当晚+明天白天）").toBe(3);
      expect(res.meta.abilityResult).toBe(1);
      expect(res.snapshot._abilityResults?.poisoner?.poisoned).toBe(true);
    });

    it("⭐⭐ 负向对照：**中毒的投毒者** → 记录选择但**不放置**中毒标记", async () => {
      const res = await runRole(poisonerAbility, poison(safeBoard("poisoner")), 0, {
        night: 2,
        targets: [1],
      });
      expect(res.meta.poisonerResult?.poisoned, "❌ 中毒投毒者不应下毒").toBe(false);
      expect(at(res, 1).isPoisoned ?? false, "❌ 目标被标记 isPoisoned").toBe(false);
      expect(
        effectsOf(at(res, 1)).some((e) => e.type === "poisoned" && e.source === "poisoner"),
        "❌ 中毒投毒者仍放置了毒标记"
      ).toBe(false);
    });

    it("⭐ 边界：目标已死亡 → 管道中止", async () => {
      const seats = safeBoard("poisoner");
      seats[1] = { ...seats[1], isDead: true };
      const res = await runRole(poisonerAbility, seats, 0, { night: 2, targets: [1] });
      expect(res.aborted, "❌ 不应能对死者下毒").toBe(true);
      expect(String(res.abortReason)).toContain("死亡玩家");
      expect(effectsOf(at(res, 1)).some((e) => e.type === "poisoned")).toBe(false);
    });
  });

  // ─────────────────────────── 沙巴洛斯 ───────────────────────────
  describe("㉜ 沙巴洛斯(shabaloth)：双杀 + 反刍", () => {
    it("⭐⭐ 选两名 → 两人全死且死因为 shabaloth_kill", async () => {
      const res = await runRole(shabalothAbility, safeBoard("shabaloth"), 0, {
        night: 2,
        targets: [1, 2],
      });
      expect(res.aborted).toBeFalsy();
      expect(at(res, 1).isDead).toBe(true);
      expect(at(res, 2).isDead).toBe(true);
      expect(at(res, 1).deathSource).toBe("shabaloth_kill");
      expect(at(res, 2).deathSource).toBe("shabaloth_kill");
    });

    it("⭐⭐ 负向对照：只选 1 名 → 管道中止（官方：要选择两名）", async () => {
      const res = await runRole(shabalothAbility, safeBoard("shabaloth"), 0, {
        night: 2,
        targets: [1],
      });
      expect(res.aborted, "❌ 不足两名目标应被拒").toBe(true);
      expect(at(res, 1).isDead).toBe(false);
      expect(String(res.abortReason)).toContain("2");
    });

    it("⭐⭐ 边界：反刍 → 上夜的死者被复活并带 resurrected 标记", async () => {
      const seats = safeBoard("shabaloth");
      seats[3] = { ...seats[3], isDead: true, markedForDeath: true, diedAtNight: 1, deathSource: "shabaloth_kill" };
      const res = await runRole(shabalothAbility, seats, 0, {
        night: 2,
        targets: [1, 2],
        snapshot: { regurgitatedSeatId: 3 },
      });
      const revived = at(res, 3);
      expect(revived.isDead, "❌ 反刍目标未复活").toBe(false);
      expect(revived.deathSource).toBeUndefined();
      expect(hasEffect(revived, "resurrected", "shabaloth")).toBe(true);
    });

    it.fails("⚠️[已知缺陷 it.fails] 中毒的沙巴洛斯 → 官方：不应杀人", async () => {
      const res = await runRole(shabalothAbility, poison(safeBoard("shabaloth")), 0, {
        night: 2,
        targets: [1, 2],
      });
      // 官方（醉酒与中毒）：「中毒的玩家会失去能力……他的能力不会真实地影响游戏」
      expect(res.aborted).toBeFalsy();
      expect(at(res, 1).isDead, "（缺陷现状：中毒沙巴洛斯仍然杀人）").toBe(true);
      expect(
        at(res, 1).isDead,
        "缺陷：shabaloth.ability.ts::updateKillState 未消费 meta.abilityEffective"
      ).toBe(false);
    });
  });
});

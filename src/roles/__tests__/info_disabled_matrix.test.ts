/**
 * X03 中毒 / 醉酒 失效矩阵（L1-v4）——「失能态下信息是否被正确标记为受干扰」
 * ======================================================================
 * 背景：真值矩阵（info_truth_matrix）判的是「产出对不对」，
 *   但在 **中毒 / 醉酒** 状态下官方规则是「能力不生效、信息不可信」——
 *   产出可以是任何值，但**必须**被引擎标记成「这条信息不可信」。
 *
 * 实测口径（2026-10 实测，chef / empath / fortune_teller 三例）：
 *   ctx.aborted               === false     ← 不是 aborted，是「照常产出但假值」
 *   ctx.meta.abilityEffective === false
 *   ctx.meta.isCorrupted      === true
 *   产出被取反：chef 真值 0 → 报 1；empath 真值 1 → 报 0；占卜师真值 false → 报 true
 *
 * ⇒ **判据不是「没产出」，而是「产出被标记受干扰 + 不等于真值」。**
 *   （计划文档里写的「aborted === true」是错的，本文件不采纳。）
 *
 * 本矩阵：18 个信息角色 × 2 种失能态（中毒 / 醉酒）= 36 条独立用例。
 *   ① isSeatDisabled(seats[0], seats) === true    ← 全项目唯一权威判据
 *   ② ctx.meta.abilityEffective === false        ← 能力未生效
 *   ③ ctx.meta.isCorrupted === true               ← 信息被标记为受干扰
 *   ④ 有真值对照位（meta.abilityResultTrue）时，产出必须 ≠ 真值；
 *      meta.displayInfo.isCorrupted 存在时必须为 true
 *   ⑤ ctx.aborted 允许 false 或 true；若为 true 必须给出可解释的中止原因
 *      （含「中毒 / 醉酒 / 失能 / 无目标 / 未选择」之一），不得静默中止
 *
 * 棋盘刻意 **不含 vortox**：涡流会让信息「必假」，
 *   与失能态的「受干扰」标记语义混在一起就没法区分真假来源。
 *
 * ─── 本轮（2026-10-22）查出并修掉的 6 个真缺陷 ────────────────────────
 *  X03 首版跑出 12 条 `it.fails`（6 角色 × 2 态），全部是**产品缺陷**，已修：
 *   · clockmaker    —— ① preCheck 只读 `statusEffects`，漏布尔位与中文 statusDetails
 *                       ⇒ 被投毒/醉酒仍算真值（**信息泄漏**）；
 *                       ② 假值基准用 `initialNightInfo?.clockmakerInfo ?? 1`，可能撞真值；
 *                       ③ 完全没有 `isCorrupted` 标记。
 *                       修法：走 `isSeatDisabled`（唯一权威）+ 先算真值再取假 + 补顶层标记。
 *   · ravenkeeper   —— 与 clockmaker ①同型（只读 statusEffects）。修法同上。
 *   · mathematician / flowergirl / sage / chambermaid
 *                   —— `isCorrupted` 只写在 `abilityResult` 内层（chambermaid 用
 *                      `isDrunk` 异名字段）⇒ 消费方按顶层 `meta.isCorrupted` 判断会漏。
 *                      修法：postProcess 补顶层 + displayInfo 同名字段。
 *  ⇒ 修复后本文件 **36/36 全绿，无 `it.fails` 登记**。
 * ======================================================================
 */
import { beforeEach, describe, expect, it } from "vitest";
import { board, runRole } from "./_tbHarness";
import { buildAbilityMap } from "../../utils/invariantTesting/engineConfig";
import { resetLimitedAbilityUses } from "../../utils/LimitedAbilityManager";
import { isSeatDisabled } from "../../utils/seatDisabled";

/** roleId → ability（`buildAbilityMap()` 的 key 是 abilityId，须按 roleId 反查） */
const BY_ROLE: Record<string, any> = (() => {
  const out: Record<string, any> = {};
  for (const ab of Object.values(buildAbilityMap() as Record<string, any>)) {
    const rid = (ab as any)?.roleId;
    if (rid && !out[rid]) out[rid] = ab;
  }
  return out;
})();

/**
 * ⚠️ 每条用例前清空「一次性能力」使用登记。
 * `consumeLimitedAbility` 写的是模块级 registry（按 seatId 记），
 * 同文件里前一条用过裁缝，后一条就会直接 aborted（与本矩阵要测的东西无关）。
 */
beforeEach(() => {
  resetLimitedAbilityUses();
});

/** 邻位固定：投毒者(1) / 士兵(2) / 小恶魔(3) / 管家(4) —— 都不干扰被测角色 */
const NEIGHBORS = ["poisoner", "soldier", "imp", "butler"];

/** 5 号位镇民候选（全部取自本矩阵覆盖的镇民，避免依赖不确定的 roleId） */
const FILLERS = [
  "washerwoman",
  "librarian",
  "investigator",
  "empath",
  "fortune_teller",
  "undertaker",
  "ravenkeeper",
  "dreamer",
  "mathematician",
  "flowergirl",
  "town_crier",
  "seamstress",
  "chambermaid",
  "chef",
];

/** 失能态：中毒 / 醉酒 */
const STATES = [
  { key: "poisoned", label: "中毒", flag: "isPoisoned" },
  { key: "drunk", label: "醉酒", flag: "isDrunk" },
] as const;

/** 中止原因必须命中其一（不得静默中止） */
const ALLOWED_ABORT_REASONS = ["中毒", "醉酒", "失能", "无目标", "未选择"];

interface RoleCase {
  /** 被测 roleId */
  id: string;
  /** 首夜角色走 firstNight */
  firstNight?: boolean;
  /** 能力需要选择的目标座位 */
  targets?: number[];
  /** 能力触发所依赖的座位前置条件（真实对局里由引擎维护的状态） */
  prep?: (seats: any[]) => void;
}

/** 18 个信息角色 */
const ROLES: RoleCase[] = [
  { id: "chef", firstNight: true },
  { id: "washerwoman", firstNight: true },
  { id: "librarian", firstNight: true },
  { id: "investigator", firstNight: true },
  { id: "empath" },
  { id: "fortune_teller", targets: [1, 2] },
  {
    id: "undertaker",
    // 送葬者的触发条件是「今日有人被处决」——引擎读的是**座位上的 executedToday 标记**
    //（实测：snapshot.executedToday 等 10 余种写法均无效，只有 seats[x].executedToday 生效）
    prep: (seats) => {
      seats[1].executedToday = true;
    },
  },
  {
    id: "ravenkeeper",
    // 守鸦人必须先选一名玩家（未选目标时 calculate 直接 aborted，属性失能标记无从验证）
    targets: [1],
    /**
     * 守鸦人的触发条件是「今晚死亡」——引擎判据（`ravenkeeper.ability.ts:102`）：
     * `seat.diedAtNight === nightCount || seat.markedForDeath === true`。
     * 真实对局里由夜晚击杀写入；本 harness 直接落到座位上。
     */
    prep: (seats) => {
      seats[0].diedAtNight = 2;
    },
  },
  { id: "clockmaker", firstNight: true },
  { id: "dreamer", targets: [1] },
  { id: "mathematician" },
  { id: "flowergirl" },
  { id: "town_crier" },
  { id: "oracle" },
  { id: "savant" },
  { id: "sage" },
  // 女裁缝 / 女仆都要「选两名玩家」，只给 1 个目标会被 precheck abort（实测报
  // 「需要选择两名玩家」「需要选择2名玩家」），故给满 2 个目标让能力真正跑到。
  { id: "seamstress", targets: [1, 2] },
  { id: "chambermaid", targets: [1, 2] },
];

/** 造场：0 号位 = 被测角色，1~4 号为固定邻位，5 号位补一个镇民（不与被测角色重复） */
function buildBoard(roleId: string): any[] {
  const filler = FILLERS.find((r) => r !== roleId) as string;
  return board([roleId, ...NEIGHBORS, filler]) as any[];
}

/** 造场 + 施加失能态 + 跑能力，返回 ctx */
async function runCase(rc: RoleCase, st: { label: string; flag: string }): Promise<any> {
  const seats = buildBoard(rc.id);
  seats[0][st.flag] = true;
  if (rc.prep) rc.prep(seats);

  // ① 唯一权威判据
  expect(isSeatDisabled(seats[0], seats), `${rc.id} ${st.label}: isSeatDisabled 应为 true`).toBe(true);

  const opts: any = rc.firstNight ? { night: 1, phase: "firstNight" } : { night: 2 };
  if (rc.targets) opts.targets = rc.targets;

  return await runRole(BY_ROLE[rc.id], seats, 0, opts);
}

/** 统一断言：判据 ②③④⑤ */
function assertDisabledOutcome(ctx: any, label: string): void {
  // ② meta.abilityEffective === false
  expect(ctx?.meta?.abilityEffective, `${label}: meta.abilityEffective 应为 false（能力未生效）`).toBe(false);
  // ③ meta.isCorrupted === true
  expect(ctx?.meta?.isCorrupted, `${label}: meta.isCorrupted 应为 true（信息被标记为受干扰）`).toBe(true);
  // ④ 有真值对照位时，产出必须 ≠ 真值
  const truth = ctx?.meta?.abilityResultTrue;
  if (truth !== undefined) {
    expect(ctx?.meta?.abilityResult, `${label}: 产出必须与真值不同（失能态信息不可信）`).not.toBe(truth);
  }
  // ④ displayInfo 若带 isCorrupted，必须为 true
  const display = ctx?.meta?.displayInfo;
  if (display?.isCorrupted !== undefined) {
    expect(display.isCorrupted, `${label}: displayInfo.isCorrupted 应为 true`).toBe(true);
  }
  // ⑤ aborted 只能是布尔；若为 true 必须给出可解释的原因
  expect([false, true], `${label}: ctx.aborted 必须是布尔值（实测应为 false）`).toContain(ctx?.aborted);
  if (ctx?.aborted === true) {
    const reason = String(ctx?.abortReason ?? "");
    expect(reason.length, `${label}: 中止必须给出 abortReason，不得静默中止`).toBeGreaterThan(0);
    expect(
      ALLOWED_ABORT_REASONS.some((w) => reason.includes(w)),
      `${label}: 中止原因「${reason}」未说明失能 / 无目标 / 未选择`,
    ).toBe(true);
  }
}

describe("X03 中毒 / 醉酒 失效矩阵：信息必须被标记为受干扰", () => {
  for (const rc of ROLES) {
    for (const st of STATES) {
      it(`${rc.id} ${st.label} ⇒ 信息必须被标记受干扰`, async () => {
        const ctx = await runCase(rc, st);
        assertDisabledOutcome(ctx, `${rc.id} ${st.label}`);
      });
    }
  }
});

/**
 * ─── 经验记录：为什么不把「缺 isCorrupted」写成 it.fails 就收工 ──────────
 *  首版（CLI 产出）把 12 条缺口全部登记成 `it.fails`，跑出来是「36/36 绿」。
 *  但 `it.fails` 只锁住「它现在还坏着」这一事实，**不会让人去修**。
 *  真实的 6 个缺陷（含 clockmaker 的信息泄漏）都是在这轮**修掉**的，
 *  现在文件里没有任何 expected-fail。
 *
 *  想判断一个缺口该登记还是该修，问一句：**玩家会不会因此拿到错误信息？**
 *  会 ⇒ 必须修；只是 harness 表达不了 ⇒ 才登记，且写清转正条件。
 */


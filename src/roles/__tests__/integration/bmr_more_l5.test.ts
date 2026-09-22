import { describe, expect, it } from "vitest";
import { board, runRole } from "../_tbHarness";
import { resetLimitedAbilityUses } from "../../../utils/LimitedAbilityManager";
import { sailorAbility } from "../../new_engine/sailor.ability";
import { exorcistAbility } from "../../new_engine/exorcist.ability";
import { innkeeperAbility } from "../../new_engine/innkeeper.ability";
import { gamblerAbility } from "../../new_engine/gambler.ability";
import { courtierAbility } from "../../new_engine/courtier.ability";
import { professorAbility } from "../../new_engine/professor.ability";
import { minstrelAbility } from "../../new_engine/minstrel.ability";
import { teaLadyAbility } from "../../new_engine/tea_lady.ability";
import { pacifistAbility } from "../../new_engine/pacifist.ability";
import { foolAbility } from "../../new_engine/fool.ability";
import { moonchildAbility } from "../../new_engine/moonchild.ability";
import { goonAbility } from "../../new_engine/goon.ability";
import { mastermindAbility } from "../../new_engine/mastermind.ability";

/**
 * L5 · 黯月初升 · 其余 13 角色因果链（2026-09-21）
 * ------------------------------------------------------------------
 * ⚠️ 为什么补这一层：
 *   `bmr_demon_l5.test.ts` 只覆盖了 4 个恶魔，本文件补齐审计里 **L5 = 0** 的
 *   13 个角色（sailor / exorcist / innkeeper / gambler / courtier / professor /
 *   minstrel / tea_lady / pacifist / fool / moonchild / goon / mastermind）。
 *   文案对了 ≠ 状态真的变了；本文件只回答一个问题：
 *   **「这个能力跑完之后，世界（或说书人收到的指令）真的变了吗？」**
 *
 * 🔒 判据设计（本文件统一）—— 差分，不是终态：
 *   深拷贝 `before` → 跑能力管道 → 比 `after`，要求「至少一个语义字段发生变化」。
 *   只看终态（如 `isDead === true`）分不清「本能力造成的」和「开局就有的」⇒ 测不出回归。
 *
 * 🔒 靶子选择铁律（踩坑后固化）：
 *   **目标绝不能是有免疫/免死能力的角色。**
 *   黯月初升禁用靶子：sailor(水手免死) / fool(愚者首次免死) / tea_lady / pacifist /
 *   innkeeper / goon / moonchild。
 *   本文件安全靶子：chambermaid(侍女·镇民) / gossip(造谣者·镇民) / tinker(修补匠·外来者)。
 *   需要「邪恶」时用 imp(小恶魔) ；需要「爪牙」时用 mastermind/godfather(主谋/教父)。
 *
 * 🔒 前提齐（照 `bmr_demon_l5.test.ts` 的教训）：
 *   `runRole` 默认 snapshot **只有**
 *     nightCount / gamePhase / seats / statusEffects / statusEffectMap /
 *     isVortoxWorld / reminders / log
 *   —— 其它字段默认 `undefined`。若角色用 `=== true` / `!== null` / `?? ` 读它们，
 *   **必须显式在 `opts.snapshot` / `opts.meta` / `opts.storytellerInput` 里传**，
 *   否则测试会「跑到别的分支」而假绿/假红。
 *   本文件涉及：`exorcist.lastExorcistTarget`、`mastermind.demonExecutedToday`、
 *   `gambler/courtier/minstrel/pacifist/moonchild` 的说书人输入、`goon.chooserSeatId`。
 *
 * 🔒 形态说明（重要，避免误判为「没落库」）：
 *   引擎把角色效果分成两种落库形态：
 *     ① **直接改座位** —— sailor / innkeeper / gambler / courtier / professor /
 *        tea_lady / fool / goon 在 `stateUpdate` 里改 `snapshot.seats`；
 *     ② **只产出指令** —— minstrel / pacifist / moonchild 在 `stateUpdate` 里**只写
 *        `meta.stateUpdates`**（由 `GameController` 消费），本身不碰 seats。
 *   对 ② 断言 `meta.stateUpdates` 才是锚在**源头变量**上；断言座位会恒绿（假绿）。
 *
 * ✅ 变异检验记录（2026-09-21，逐角色证明「不是假绿」）：
 *   手法：`cp` 备份 13 个 `*.ability.ts` → 把各自的 `stateUpdate: [...]` 改成 `[]`
 *        → 跑本文件 → **13/13 全红** → `cp` 还原 → 复跑 **13/13 全绿**。
 *   被变异的 13 个文件：sailor / exorcist / innkeeper / gambler / courtier /
 *        professor / minstrel / tea_lady / pacifist / fool / moonchild / goon / mastermind
 *   （tea_lady / pacifist / fool 是 PASSIVE 角色，同样走 stateUpdate，故同样有效）
 *   ⇒ 每条用例的断言都**确实锚在该角色的 stateUpdate 产量上**，无一恒绿。
 */

/** 语义字段：变化即代表能力真的落库 */
const SEMANTIC_KEYS = [
  "isDead",
  "markedForDeath",
  "diedAtNight",
  "deathSource",
  "deathSourceSeatId",
  "statusEffects",
  "isPoisoned",
  "isDrunk",
  "poCharged",
  "pukkaPoisonQueue",
  // 以下为本次新增角色（L5 缺口）的特征落库字段
  "foolUsed", // fool：首次免死已消耗
  "hasUsedFoolAbility", // fool：同上（引擎双写）
  "hasUsedAbility", // courtier：每局限一次已消耗
  "protectedByTeaLady", // tea_lady：受茶艺师保护
  "alignment", // goon：阵营被改写
  "isEvilConverted", // goon：转为邪恶标记
] as const;

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** 比较某座位在 before/after 间发生变化的语义字段 */
function changedKeys(beforeSeat: any, afterSeat: any): string[] {
  return SEMANTIC_KEYS.filter(
    (k) => JSON.stringify(beforeSeat?.[k]) !== JSON.stringify(afterSeat?.[k])
  );
}

/** 取某座位在结果 ctx 中的最新状态 */
function seatAfter(res: any, id: number): any {
  return (res?.snapshot?.seats ?? []).find((s: any) => s.id === id);
}

/** 结果里的说书人指令（minstrel / pacifist / moonchild 的唯一落库形态） */
function stateUpdatesOf(res: any): any {
  return res?.meta?.stateUpdates;
}

describe("L5 · 黯月初升 · 其余 13 角色因果链（差分判据）", () => {
  it("① 水手(sailor)：选「镇民」→ 目标醉酒；选「非镇民」→ 水手自己醉酒", async () => {
    const layout = ["sailor", "chambermaid", "imp", "gossip", "tinker"];

    // A：目标 = 1号 chambermaid（镇民）⇒ 官方「你或他之一醉酒」，此处目标醉酒
    const A = board(layout);
    const beforeA = clone(A);
    const ra = await runRole(sailorAbility, A, 0, {
      night: 2,
      phase: "night",
      targets: [1],
    });

    // B：目标 = 2号 imp（恶魔，非镇民）⇒ 水手自己醉酒
    const B = board(layout);
    const beforeB = clone(B);
    const rb = await runRole(sailorAbility, B, 0, {
      night: 2,
      phase: "night",
      targets: [2],
    });

    expect(ra.aborted, "❌ 水手 A 组被中止").not.toBe(true);
    expect(rb.aborted, "❌ 水手 B 组被中止").not.toBe(true);

    // 差分：谁醉酒必须随「目标是否镇民」而换人
    expect(
      changedKeys(beforeA[1], seatAfter(ra, 1)).length,
      "❌ 水手选中镇民，但目标 1号状态完全没变 —— 目标没被致醉"
    ).toBeGreaterThan(0);
    expect(
      changedKeys(beforeA[0], seatAfter(ra, 0)).length,
      "❌ 水手选中镇民时，水手自己不该醉酒（stateUpdate 打错座位）"
    ).toBe(0);
    expect(
      changedKeys(beforeB[0], seatAfter(rb, 0)).length,
      "❌ 水手选中的是非镇民，但水手自己状态完全没变 —— 水手没被致醉"
    ).toBeGreaterThan(0);
    expect(
      changedKeys(beforeB[2], seatAfter(rb, 2)).length,
      "❌ 水手选中的是非镇民时，目标不该醉酒（stateUpdate 打错座位）"
    ).toBe(0);

    // 特征字段：醉酒者必须有 isDrunk 与 drunk 效果
    expect(seatAfter(ra, 1).isDrunk, "❌ 1号 isDrunk 应为 true").toBe(true);
    expect(
      (seatAfter(ra, 1).statusEffects ?? []).some((e: any) => e.type === "drunk"),
      "❌ 1号 缺少 drunk 状态效果"
    ).toBe(true);
    expect(seatAfter(rb, 0).isDrunk, "❌ 水手 isDrunk 应为 true").toBe(true);
  });

  it("② 驱魔人(exorcist)：选中恶魔 → 恶魔当夜被封锁（snapshot.demonBlocked）", async () => {
    const layout = ["exorcist", "chambermaid", "imp", "gossip", "tinker"];

    // A：目标 = 2号 imp（恶魔）⇒ 封锁
    const A = board(layout);
    const ra = await runRole(exorcistAbility, A, 0, {
      night: 2,
      phase: "night",
      targets: [2],
    });

    // B：目标 = 1号 chambermaid（非恶魔）⇒ 不封锁
    const B = board(layout);
    const rb = await runRole(exorcistAbility, B, 0, {
      night: 2,
      phase: "night",
      targets: [1],
    });

    // 差分：封锁标记必须随「目标是否恶魔」变化
    expect(
      stateUpdatesOf(ra),
      "❌ 驱魔人不需要说书人指令，此处仅确认无干扰"
    ).toBeUndefined();
    expect(
      ra.snapshot.demonBlocked,
      "❌ 驱魔人选中恶魔，但 snapshot.demonBlocked 不是 true —— 恶魔当夜不会被封锁"
    ).toBe(true);
    expect(
      rb.snapshot.demonBlocked === true,
      "❌ 驱魔人选中的不是恶魔，却也把 demonBlocked 置为 true"
    ).toBe(false);

    // 特征字段：命中记录必须落到 lastExorcistTarget，供「不能连续两晚同一人」使用
    expect(ra.snapshot.lastExorcistTarget, "❌ 未记录 lastExorcistTarget").toBe(2);
    expect(ra.meta.abilityResult.isTargetDemon, "❌ isTargetDemon 应为 true").toBe(true);
    /**
     * ⚠️ 实现细节（非缺陷，但断言不能写 `=== false`）：
     *   `exorcist.ability.ts:49-52` 的写法是
     *     `(targetSeat?.role?.type === "demon" || targetSeat?.isDemonSuccessor) && isAbilityActive`
     *   ⇒ 目标非恶魔时左侧是 `false || undefined === undefined` ⇒ 整体 `undefined`。
     *   `undefined` 是合法的「否」（postProcess 用 `r?.isTargetDemon` 判断，行为正确），
     *   但值是**三态**（true / undefined），所以这里只能断言「**不是 true**」。
     *   📌 记录：可选布尔字段用 `x || y` 兜底会产生 `undefined`，属全项目同类风险（见手册模式 E）。
     */
    expect(
      rb.meta.abilityResult.isTargetDemon === true,
      "❌ 驱魔人选中的不是恶魔，isTargetDemon 却为 true"
    ).toBe(false);

    // 对照组：「连续两晚同一目标」必须被拒绝（官方：与上个夜晚不同）
    const C = board(layout);
    const rc = await runRole(exorcistAbility, C, 0, {
      night: 3,
      phase: "night",
      targets: [2],
      snapshot: { lastExorcistTarget: 2 },
    });
    expect(
      rc.aborted,
      "❌ 驱魔人连续两晚选了同一目标却没被中止（官方：必须与上个夜晚不同）"
    ).toBe(true);
  });

  it("③ 旅店老板(innkeeper)：两名目标当夜免死 + 其中恰好一人醉酒", async () => {
    const seats = board(["innkeeper", "chambermaid", "gossip", "imp", "tinker"]);
    const before = clone(seats);

    const res = await runRole(innkeeperAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1, 2],
    });

    expect(res.aborted, "❌ 旅店老板被中止").not.toBe(true);

    const s1 = seatAfter(res, 1);
    const s2 = seatAfter(res, 2);
    expect(
      changedKeys(before[1], s1).length + changedKeys(before[2], s2).length,
      "❌ 旅店老板选了两名目标，但两个座位状态完全没变 —— 保护/醉酒都没落库"
    ).toBeGreaterThan(0);

    // 官方：两名目标「当晚不会死亡」⇒ 各自必须有 protected 效果
    expect(
      (s1.statusEffects ?? []).some((e: any) => e.type === "protected"),
      "❌ 1号 缺少 protected（旅店老板的保护没落库）"
    ).toBe(true);
    expect(
      (s2.statusEffects ?? []).some((e: any) => e.type === "protected"),
      "❌ 2号 缺少 protected（旅店老板的保护没落库）"
    ).toBe(true);

    // 官方：「其中一人会醉酒」⇒ 恰一人
    const drunkCount = [s1, s2].filter((s: any) =>
      (s.statusEffects ?? []).some((e: any) => e.type === "drunk")
    ).length;
    expect(
      drunkCount,
      `❌ 官方原文是「其中一人会醉酒」，实际醉酒 ${drunkCount} 人`
    ).toBe(1);
  });

  it("④ 赌徒(gambler)：猜错 → 自己死亡并落死因；猜对 → 毫发无伤", async () => {
    const layout = ["gambler", "chambermaid", "gossip", "imp", "tinker"];

    // A：猜错（1号是 chambermaid，却猜 imp）⇒ 赌徒死亡
    const A = board(layout);
    const beforeA = clone(A);
    const ra = await runRole(gamblerAbility, A, 0, {
      night: 2,
      phase: "night",
      targets: [1],
      storytellerInput: { guessedRole: "imp" },
    });

    // B：猜对 ⇒ 无事发生
    const B = board(layout);
    const beforeB = clone(B);
    const rb = await runRole(gamblerAbility, B, 0, {
      night: 2,
      phase: "night",
      targets: [1],
      storytellerInput: { guessedRole: "chambermaid" },
    });

    // 差分：同一次选择，只因「猜对/猜错」不同，赌徒命运必须相反
    expect(
      changedKeys(beforeA[0], seatAfter(ra, 0)).length,
      "❌ 赌徒猜错了，但赌徒自身状态完全没变 —— 官方：猜错你会死亡"
    ).toBeGreaterThan(0);
    expect(seatAfter(ra, 0).isDead, "❌ 猜错后赌徒应死亡").toBe(true);
    expect(
      seatAfter(ra, 0).deathSource,
      `❌ 赌徒死亡的 deathSource 必须是 gambler_guess_fail（实际 ${seatAfter(ra, 0).deathSource}）`
    ).toBe("gambler_guess_fail");

    expect(
      changedKeys(beforeB[0], seatAfter(rb, 0)).length,
      "❌ 赌徒猜对了，赌徒状态却发生了变化 —— 官方：猜对无事发生"
    ).toBe(0);
    expect(seatAfter(rb, 0).isDead, "❌ 猜对后赌徒不应死亡").toBe(false);
  });

  it("⑤ 廷臣(courtier)：目标角色在场 → 其持有者醉酒3天3夜；不在场 → 不生效但消耗次数", async () => {
    const layout = ["courtier", "chambermaid", "gossip", "imp", "tinker"];

    // A：指定角色 chambermaid 在场 ⇒ 该持有者（1号）醉酒
    const A = board(layout);
    const beforeA = clone(A);
    const ra = await runRole(courtierAbility, A, 0, {
      night: 2,
      phase: "night",
      storytellerInput: { targetRoleId: "chambermaid" },
    });

    // B：指定一个不在场的角色 ⇒ 无事发生（但仍消耗每局限一次）
    const B = board(layout);
    const beforeB = clone(B);
    const rb = await runRole(courtierAbility, B, 0, {
      night: 2,
      phase: "night",
      storytellerInput: { targetRoleId: "not_a_role_in_play" },
    });

    expect(
      changedKeys(beforeA[1], seatAfter(ra, 1)).length,
      "❌ 廷臣点名的角色在场，但其持有者状态完全没变 —— 醉酒没落库"
    ).toBeGreaterThan(0);
    expect(seatAfter(ra, 1).isDrunk, "❌ 1号 isDrunk 应为 true").toBe(true);
    expect(
      (seatAfter(ra, 1).statusEffects ?? []).some(
        (e: any) => e.type === "drunk" && e.source === "courtier"
      ),
      "❌ 1号 缺少 courtier 来源的 drunk 效果"
    ).toBe(true);

    // 差分：角色不在场时，任何座位都不该变化
    expect(
      changedKeys(beforeB[1], seatAfter(rb, 1)).length,
      "❌ 廷臣点名的角色不在场，却有座位被改动"
    ).toBe(0);

    // 特征字段：无论是否生效，廷臣自己必须被标记「已消耗」
    expect(seatAfter(ra, 0).hasUsedAbility, "❌ 廷臣 A 组未标记 hasUsedAbility").toBe(true);
    expect(seatAfter(rb, 0).hasUsedAbility, "❌ 廷臣 B 组未标记 hasUsedAbility").toBe(true);
    expect(ra.snapshot.courtierUsed, "❌ snapshot.courtierUsed 应为 true").toBe(true);
  });

  it("⑥ 教授(professor)：死亡镇民 → 复活；死亡恶魔 → 不复活", async () => {
    const layout = ["professor", "chambermaid", "imp", "gossip", "tinker"];

    // A：目标 = 1号 chambermaid（已死亡·镇民）⇒ 起死回生
    const A = board(layout);
    (A[1] as any).isDead = true;
    const beforeA = clone(A);
    resetLimitedAbilityUses(); // 每局限一次，清掉同文件其它用例可能留下的消耗
    const ra = await runRole(professorAbility, A, 0, {
      night: 2,
      phase: "night",
      targets: [1],
    });

    // B：目标 = 2号 imp（已死亡·恶魔）⇒ 无事发生（官方：外来者/爪牙/恶魔则无事发生）
    const B = board(layout);
    (B[2] as any).isDead = true;
    const beforeB = clone(B);
    resetLimitedAbilityUses();
    const rb = await runRole(professorAbility, B, 0, {
      night: 2,
      phase: "night",
      targets: [2],
    });

    expect(ra.aborted, "❌ 教授 A 组被中止").not.toBe(true);
    expect(
      changedKeys(beforeA[1], seatAfter(ra, 1)).length,
      "❌ 教授选中死亡的镇民，但目标状态完全没变 —— 复活没落库"
    ).toBeGreaterThan(0);
    expect(seatAfter(ra, 1).isDead, "❌ 被复活的镇民 isDead 应为 false").toBe(false);
    expect(
      (seatAfter(ra, 1).statusEffects ?? []).some((e: any) => e.type === "resurrected"),
      "❌ 被复活者缺少 resurrected 效果"
    ).toBe(true);

    // 差分：目标不是镇民（恶魔）⇒ 不复活
    expect(
      seatAfter(rb, 2).isDead,
      "❌ 教授选中死亡的恶魔却把他复活了（官方：外来者/爪牙/恶魔则无事发生）"
    ).toBe(true);
  });

  it("⑦ 吟游诗人(minstrel)：爪牙被处决 → 除自己外所有人醉酒；镇民/恶魔被处决 → 不触发", async () => {
    // A：被处决者 = 3号 mastermind（爪牙）⇒ 触发
    //   ⚠️ 前提齐：官方要求「爪牙**死于处决**」，所以被处决者必须先落 `isDead`
    //      （stateUpdate 会剔除已死亡座位 —— 漏了这一步就会把「被处决者自己」
    //       也算进醉酒名单，测试假红）
    const A = board(["minstrel", "chambermaid", "mastermind", "gossip", "tinker"]);
    (A[2] as any).isDead = true;
    const ra = await runRole(minstrelAbility, A, 0, {
      night: 2,
      phase: "day",
      storytellerInput: { executedSeatId: 2 },
    });

    // B：被处决者 = 1号 chambermaid（镇民）⇒ 不触发
    const B = board(["minstrel", "chambermaid", "gossip", "imp", "tinker"]);
    const rb = await runRole(minstrelAbility, B, 0, {
      night: 2,
      phase: "day",
      storytellerInput: { executedSeatId: 1 },
    });

    // C：被处决者 = 恶魔（不是爪牙）⇒ 不触发
    const C = board(["minstrel", "chambermaid", "imp", "gossip", "tinker"]);
    const rc = await runRole(minstrelAbility, C, 0, {
      night: 2,
      phase: "day",
      storytellerInput: { executedSeatId: 2 },
    });

    // ⚠️ 吟游诗人 stateUpdate 只产出 `meta.stateUpdates`（由 GameController 消费），
    //    不改座位 ⇒ 断言必须锚在指令上，断言座位会恒绿（假绿）。
    expect(
      stateUpdatesOf(ra)?.type,
      "❌ 爪牙被处决，但吟游诗人没有产出 MARK_ALL_FOR_DRUNK 指令"
    ).toBe("MARK_ALL_FOR_DRUNK");
    expect(
      stateUpdatesOf(ra)?.targetIds?.length,
      "❌ MARK_ALL_FOR_DRUNK 的目标列表为空"
    ).toBeGreaterThan(0);
    // 特征字段：吟游诗人自己不在醉酒的名单里；已死亡的座位也不在
    expect(
      stateUpdatesOf(ra)?.targetIds?.includes(0),
      "❌ 吟游诗人自己不应出现在醉酒名单里"
    ).toBe(false);
    expect(
      stateUpdatesOf(ra)?.targetIds?.includes(2),
      "❌ 被处决而死去的爪牙不应出现在醉酒名单里"
    ).toBe(false);

    // 差分：不是爪牙 ⇒ 什么都不产出
    expect(
      stateUpdatesOf(rb),
      "❌ 被处决的是镇民，吟游诗人却触发了（官方：爪牙死于处决时才触发）"
    ).toBeUndefined();
    expect(
      stateUpdatesOf(rc),
      "❌ 被处决的是恶魔（不是爪牙），吟游诗人却触发了"
    ).toBeUndefined();
  });

  it("⑧ 茶女(tea_lady)：两侧邻居均善良 → 两人免死；一侧邪恶 → 不保护", async () => {
    // A：茶女两侧邻居均善良（1号 chambermaid / 4号 tinker）⇒ 保护两人
    const A = board(["tea_lady", "chambermaid", "gossip", "imp", "tinker"]);
    const beforeA = clone(A);
    const ra = await runRole(teaLadyAbility, A, 0, { night: 2, phase: "night" });

    // B：茶女一侧邻居是邪恶（1号 imp）⇒ 不保护
    const B = board(["tea_lady", "imp", "chambermaid", "gossip", "tinker"]);
    const beforeB = clone(B);
    const rb = await runRole(teaLadyAbility, B, 0, { night: 2, phase: "night" });

    expect(ra.aborted, "❌ 茶女 A 组被中止").not.toBe(true);
    expect(
      ra.meta.abilityResult.protectedIds.length,
      "❌ 两侧邻居均善良，茶女应保护 2 人"
    ).toBe(2);
    expect(
      changedKeys(beforeA[1], seatAfter(ra, 1)).length,
      "❌ 茶女应保护的邻居状态完全没变 —— 保护没落库"
    ).toBeGreaterThan(0);
    expect(seatAfter(ra, 1).protectedByTeaLady, "❌ 1号 未打上 protectedByTeaLady").toBe(true);

    // 差分：一侧邪恶 ⇒ 一个都不保护
    expect(
      rb.meta.abilityResult.protectedIds.length,
      "❌ 一侧邻居是邪恶，茶女却仍在保护（官方：两侧均为善良时才免死）"
    ).toBe(0);
    expect(
      changedKeys(beforeB[1], seatAfter(rb, 1)).length,
      "❌ 茶女不该保护时却改动了座位状态"
    ).toBe(0);
  });

  it("⑨ 和平主义者(pacifist)：善良被处决+说书人救 → 取消死亡；非善良 → 救不了", async () => {
    const layout = ["pacifist", "chambermaid", "mastermind", "gossip", "tinker"];

    // A：善良被处决 + 说书人选择拯救 ⇒ CANCEL_DEATH
    const A = board(layout);
    const ra = await runRole(pacifistAbility, A, 0, {
      night: 2,
      phase: "day",
      storytellerInput: { executedSeatId: 1, shouldSave: true },
    });

    // B：爪牙被处决（即使说书人标了 shouldSave）⇒ 官方只保「善良玩家」
    const B = board(layout);
    const rb = await runRole(pacifistAbility, B, 0, {
      night: 2,
      phase: "day",
      storytellerInput: { executedSeatId: 2, shouldSave: true },
    });

    // C：善良被处决但说书人不救 ⇒ 不产出
    const C = board(layout);
    const rc = await runRole(pacifistAbility, C, 0, {
      night: 2,
      phase: "day",
      storytellerInput: { executedSeatId: 1, shouldSave: false },
    });

    // ⚠️ 同吟游诗人：stateUpdate 只产出 `meta.stateUpdates`，断言锚在指令上。
    expect(
      stateUpdatesOf(ra)?.type,
      "❌ 善良玩家被处决且说书人选择拯救，和平主义者却没产出 CANCEL_DEATH"
    ).toBe("CANCEL_DEATH");
    expect(stateUpdatesOf(ra)?.targetId, "❌ CANCEL_DEATH 打错了座位").toBe(1);

    // 差分：邪恶被处决 ⇒ 无指令；善良但不救 ⇒ 无指令
    expect(
      stateUpdatesOf(rb),
      "❌ 被处决的是爪牙（邪恶），和平主义者却要救他（官方：只保善良玩家）"
    ).toBeUndefined();
    expect(rb.meta.abilityResult.isGoodExecuted, "❌ 爪牙应被判为非善良").toBe(false);
    expect(
      stateUpdatesOf(rc),
      "❌ 说书人没有选择拯救，和平主义者却产出了 CANCEL_DEATH"
    ).toBeUndefined();
  });

  it("⑩ 愚人(fool)：首次免死生效并消耗；已消耗/醉酒时不再免死", async () => {
    const layout = ["fool", "chambermaid", "gossip", "imp", "tinker"];

    // A：未使用过 ⇒ 免死生效并标记已消耗
    const A = board(layout);
    const beforeA = clone(A);
    const ra = await runRole(foolAbility, A, 0, { night: 2, phase: "night" });

    expect(ra.aborted, "❌ 愚人 A 组被中止").not.toBe(true);
    expect(
      changedKeys(beforeA[0], seatAfter(ra, 0)).length,
      "❌ 愚人首次免死没有落下任何状态变化（foolUsed / hasUsedFoolAbility 未写）"
    ).toBeGreaterThan(0);
    expect(seatAfter(ra, 0).foolUsed, "❌ foolUsed 应为 true").toBe(true);
    expect(seatAfter(ra, 0).hasUsedFoolAbility, "❌ hasUsedFoolAbility 应为 true").toBe(true);
    expect(seatAfter(ra, 0).isDead, "❌ 免死生效后 isDead 应为 false").toBe(false);

    // 对照 B：免死已用过 ⇒ 必须被拒绝，且不再改动状态
    const B = board(layout);
    (B[0] as any).hasUsedFoolAbility = true;
    const beforeB = clone(B);
    const rb = await runRole(foolAbility, B, 0, { night: 2, phase: "night" });
    expect(rb.aborted, "❌ 愚人免死已用过，却仍被允许再次免死").toBe(true);
    expect(
      changedKeys(beforeB[0], seatAfter(rb, 0)).length,
      "❌ 愚人免死已用过，状态却被再次改动"
    ).toBe(0);

    // 对照 C：醉酒 ⇒ 官方「清醒时」才免死，醉酒状态下不得免死
    const C = board(layout);
    (C[0] as any).isDrunk = true;
    const rc = await runRole(foolAbility, C, 0, { night: 2, phase: "night" });
    expect(rc.aborted, "❌ 愚人醉酒时不应能免死（官方：清醒时首次死亡免死）").toBe(true);
  });

  it("⑪ 月之子(moonchild)：选中的是善良 → 当晚死亡指令；邪恶 → 无事发生", async () => {
    const layout = ["moonchild", "chambermaid", "imp", "gossip", "tinker"];

    // A：目标 = 1号 chambermaid（善良）⇒ MARK_FOR_DEATH
    const A = board(layout);
    const ra = await runRole(moonchildAbility, A, 0, {
      night: 2,
      phase: "night",
      targets: [1],
    });

    // B：目标 = 2号 imp（邪恶）⇒ 无事发生
    const B = board(layout);
    const rb = await runRole(moonchildAbility, B, 0, {
      night: 2,
      phase: "night",
      targets: [2],
    });

    // ⚠️ 月之子 stateUpdate 同样只产出 `meta.stateUpdates`（注释明说「在 GameController 中实现」）
    expect(
      stateUpdatesOf(ra)?.type,
      "❌ 月之子选中善良玩家，却没有产出 MARK_FOR_DEATH 指令（当晚不会有人死）"
    ).toBe("MARK_FOR_DEATH");
    expect(stateUpdatesOf(ra)?.targetId, "❌ MARK_FOR_DEATH 打错了座位").toBe(1);

    // 差分：目标邪恶 ⇒ 无指令
    expect(
      stateUpdatesOf(rb),
      "❌ 月之子选中邪恶玩家却产出了死亡指令（官方：若是邪恶则无事发生）"
    ).toBeUndefined();
    expect(rb.meta.abilityResult.shouldKill, "❌ shouldKill 应为 false").toBe(false);
  });

  it("⑫ 暴徒(goon)：被邪恶玩家选择 → 转为邪恶 + 选择者醉酒；被善良选择 → 保持善良", async () => {
    const layout = ["goon", "chambermaid", "imp", "gossip", "tinker"];

    // A：选择者 = 2号 imp（邪恶）⇒ 莽夫转邪恶、选择者醉酒
    const A = board(layout);
    const beforeA = clone(A);
    const ra = await runRole(goonAbility, A, 0, {
      night: 2,
      phase: "night",
      meta: { chooserSeatId: 2 },
    });

    // B：选择者 = 1号 chambermaid（善良）⇒ 莽夫保持善良
    const B = board(layout);
    const beforeB = clone(B);
    const rb = await runRole(goonAbility, B, 0, {
      night: 2,
      phase: "night",
      meta: { chooserSeatId: 1 },
    });

    // 差分：莽夫的阵营必须随「选择者阵营」而反转
    expect(
      seatAfter(ra, 0).alignment,
      `❌ 被邪恶玩家选择后，莽夫阵营应为 evil（实际 ${seatAfter(ra, 0).alignment}）`
    ).toBe("evil");
    expect(seatAfter(ra, 0).isEvilConverted, "❌ isEvilConverted 应为 true").toBe(true);
    expect(
      changedKeys(beforeA[0], seatAfter(ra, 0)).length,
      "❌ 莽夫阵营变化没有落库"
    ).toBeGreaterThan(0);

    expect(
      seatAfter(rb, 0).alignment,
      `❌ 被善良玩家选择后，莽夫阵营应为 good（实际 ${seatAfter(rb, 0).alignment}）`
    ).toBe("good");
    expect(seatAfter(rb, 0).isEvilConverted, "❌ isEvilConverted 应为 false").toBe(false);
    expect(
      seatAfter(ra, 0).alignment !== seatAfter(rb, 0).alignment,
      "❌ 邪恶/善良选择者下莽夫阵营相同 —— 说明它没在读选择者阵营"
    ).toBe(true);

    // 特征字段：选择莽夫的人必须醉酒
    expect(seatAfter(ra, 2).isDrunk, "❌ 选择莽夫的邪恶玩家 2号 应醉酒").toBe(true);
    expect(
      (seatAfter(ra, 2).statusEffects ?? []).some(
        (e: any) => e.type === "drunk" && e.source === "goon"
      ),
      "❌ 2号 缺少 goon 来源的 drunk 效果"
    ).toBe(true);
    expect(
      changedKeys(beforeA[2], seatAfter(ra, 2)).length,
      "❌ 选择者醉酒没有落库"
    ).toBeGreaterThan(0);
  });

  it("⑬ 主谋(mastermind)：恶魔白天被处决 → 游戏延长；未发生 → 不触发", async () => {
    const layout = ["mastermind", "chambermaid", "gossip", "imp", "tinker"];

    // A：恶魔今日被处决 ⇒ mastermindActive
    const A = board(layout);
    const ra = await runRole(mastermindAbility, A, 0, {
      night: 2,
      phase: "day",
      snapshot: { demonExecutedToday: true },
    });

    // B：恶魔未被处决 ⇒ 不触发
    const B = board(layout);
    const rb = await runRole(mastermindAbility, B, 0, {
      night: 2,
      phase: "day",
      snapshot: { demonExecutedToday: false },
    });

    expect(
      ra.snapshot.mastermindActive,
      "❌ 恶魔白天被处决，但 snapshot.mastermindActive 未置为 true —— 游戏不会延长"
    ).toBe(true);
    expect(ra.meta.abilityResult.gameExtended, "❌ gameExtended 应为 true").toBe(true);

    // 差分：条件不满足时不得置位
    expect(
      rb.snapshot.mastermindActive === true,
      "❌ 恶魔没有被处决，主谋却仍然激活了"
    ).toBe(false);
    expect(rb.meta.abilityResult.gameExtended, "❌ gameExtended 应为 false").toBe(false);
  });
});

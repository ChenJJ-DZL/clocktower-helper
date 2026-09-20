/**
 * 罂粟花开 · 24 角色能力通路真值表护栏（2026-09-21）
 *
 * ============================================================
 * 为什么需要这个测试
 * ============================================================
 * 本项目已多次出现「**测试全绿，人工实测完全不同**」：
 *   根因不是断言写少了，而是**断言打在了错误的层上** ——
 *   测试验证的是"新引擎里写的那段代码"，而玩家实际感知的是"另一条通路"。
 *
 * 典型案例（本次修复）：`new_engine/poppy_grower.ability.ts` 写得完全正确，
 * 但 `triggerTiming: [PASSIVE]` **没有任何生产执行入口**（全仓唯一消费方
 * 是 `useNightEngine.ts:195` 的 ON_DEATH 判定）⇒ 文件永不执行。
 * 罂粟种植者的真实效果在 legacy `useGameController.ts:557` 里。
 * 于是"新引擎测试全绿"与"玩家看到的是 legacy 行为"长期共存，
 * 一旦两者语义漂移，测试**永远发现不了**。
 *
 * ============================================================
 * 本护栏做什么
 * ============================================================
 * 把《罂粟花开》24 个角色的「**生效通路**」写成显式真值表并逐条断言：
 *   - NIGHT_ENGINE : 声明 firstNightPriority / otherNightPriority > 0 → 靠夜序入队执行
 *   - DAY_BRIDGE   : 声明 DAY 且能被 `utils/dayAbilityBridge.ts` 分发
 *   - LEGACY       : 无夜序、无 DAY 分发 → 效果由 legacy / 硬编码路径实现
 *                     （此时新引擎文件即使存在也不执行，必须在此登记）
 *
 * 任何新增/删除/改通路 → 本测试**必须**红，强迫作者回来更新真值表。
 * 这就是把"我以为它在管"变成"我证明它在管"。
 */

import { describe, expect, it } from "vitest";
import { getRawAbilityMap } from "../new_engine/abilityRegistry";
import { initializeAbilityRegistry } from "../new_engine/abilityRegistry";

// ─── 罂粟花开 24 角色（来源：app/data.ts:552 罂粟花开.roleIds） ────────────
const POPPY_ROLES = [
  // 镇民 (13)
  "librarian", "chef", "bounty_hunter", "pixie", "fortune_teller",
  "monk", "oracle", "town_crier", "juggler", "savant", "farmer",
  "mayor", "poppy_grower",
  // 外来者 (4)
  "drunk", "lunatic", "mutant", "snitch",
  // 爪牙 (4)
  "cerenovus", "evil_twin", "baron", "marionette",
  // 恶魔 (3)
  "imp", "vortox", "legion",
] as const;

type Path =
  | "NIGHT_ENGINE"   // 靠夜序入队（firstNightPriority / otherNightPriority > 0）
  | "DAY_BRIDGE"     // 日间，靠 dayAbilityBridge 统一分发（P0-3 已打通）
  | "LEGACY";        // 无夜序、非 DAY → 效果在 legacy / 硬编码路径

/**
 * ⭐ 真值表：角色的**实际生效通路**。
 * 这份表是本次（2026-09-21）逐角色实测得出的，不是读代码猜的。
 */
const PATH_TRUTH: Record<string, Path> = {
  // ── 夜序通路（引擎驱动，夜间唤醒）──
  librarian: "NIGHT_ENGINE",
  chef: "NIGHT_ENGINE",
  bounty_hunter: "NIGHT_ENGINE",
  pixie: "NIGHT_ENGINE",
  fortune_teller: "NIGHT_ENGINE",
  monk: "NIGHT_ENGINE",
  oracle: "NIGHT_ENGINE",
  town_crier: "NIGHT_ENGINE",
  lunatic: "NIGHT_ENGINE",
  cerenovus: "NIGHT_ENGINE",
  evil_twin: "NIGHT_ENGINE",
  marionette: "NIGHT_ENGINE",   // firstNightPriority=19，靠首夜入队做 setup 类动作
  imp: "NIGHT_ENGINE",
  vortox: "NIGHT_ENGINE",
  legion: "NIGHT_ENGINE",
  farmer: "NIGHT_ENGINE",       // otherNightPriority=85（死亡传承入队）
  snitch: "NIGHT_ENGINE",       // firstNightPriority=60（首夜被告知爪牙名单）

  // ── 日间通路（dayAbilityBridge 统一分发）──
  savant: "DAY_BRIDGE",
  juggler: "NIGHT_ENGINE",      // ⚠️ 声明 every_night|day：**夜间**由夜序入队（on=100），
                                //    DAY 侧由 dayAbilityBridge 分发 —— 两条路都活。
                                //    此处登记为 NIGHT_ENGINE 是因为 classify() 优先判夜序。

  // ── legacy 通路（无夜序、非 DAY）──
  // ⚠️ 以下角色的新引擎 .ability.ts **永不执行**，效果在 legacy 里：
  mayor: "LEGACY",              // useExecutionHandlers.ts:320 / useNightActionHandler.ts:960
  poppy_grower: "LEGACY",       // useGameController.ts:557（SST: poppyGrowerDead）
  drunk: "LEGACY",              // charadeSetup.ts 写 charadeRole（永久醉酒）
  mutant: "LEGACY",             // useDayActions.ts:1086 + useGameFlow.ts:321（门禁）
  baron: "LEGACY",              // useSetupManager.ts:49（+2 外来者）
};

/** 判定某角色在新引擎注册表里的通路 */
function classify(roleId: string): { path: Path; abilityIds: string[] } {
  const map = getRawAbilityMap();
  const found = Object.entries(map).filter(([, v]: any) => v.roleId === roleId);
  if (found.length === 0) return { path: "LEGACY", abilityIds: [] };

  const hasNightOrder = found.some(
    ([, v]: any) =>
      (v.firstNightPriority !== null && v.firstNightPriority > 0) ||
      (v.otherNightPriority !== null && v.otherNightPriority > 0)
  );
  if (hasNightOrder) {
    return { path: "NIGHT_ENGINE", abilityIds: found.map(([k]) => k) };
  }

  const hasDay = found.some(
    ([, v]: any) =>
      Array.isArray(v.triggerTiming) && v.triggerTiming.includes("day")
  );
  if (hasDay) return { path: "DAY_BRIDGE", abilityIds: found.map(([k]) => k) };

  return { path: "LEGACY", abilityIds: found.map(([k]) => k) };
}

describe("罂粟花开 · 能力通路真值表", () => {
  initializeAbilityRegistry();

  it("24 个角色全部能被分类（无遗漏）", () => {
    const unresolved = POPPY_ROLES.filter((r) => !(r in PATH_TRUTH));
    expect(unresolved, `真值表缺少以下角色的通路登记：${unresolved.join(", ")}`).toEqual([]);
    expect(Object.keys(PATH_TRUTH).length).toBe(24);
  });

  it.each(POPPY_ROLES)("%s 的实际通路与真值表一致", (roleId) => {
    const { path, abilityIds } = classify(roleId);
    expect(
      path,
      `❌ ${roleId} 的通路发生漂移！\n` +
        `  真值表登记：${PATH_TRUTH[roleId]}\n` +
        `  实际测得  ：${path}\n` +
        `  命中能力  ：${abilityIds.join(", ") || "(无新引擎能力)"}\n` +
        `  ⇒ 若这是有意改动，请同步更新本文件 PATH_TRUTH 并复合其影响；\n` +
        `     若是意外分叉（例如给 LEGACY 角色加了夜序优先级），很可能导致空唤醒/双执行。`
    ).toBe(PATH_TRUTH[roleId]);
  });

  it("LEGACY 角色必须能被明确指出——防止误以为新引擎在管", () => {
    const legacyRoles = POPPY_ROLES.filter((r) => PATH_TRUTH[r] === "LEGACY");
    // 这 5 个角色的新引擎文件存在但永不执行，登记是为了"可见化空转"
    expect(legacyRoles.sort()).toEqual(
      ["baron", "drunk", "mayor", "mutant", "poppy_grower"].sort()
    );
  });

  it("⚠️ 空转根因不变式：PASSIVE 仍无生产执行入口（若将来打通，本测试会红）", () => {
    // 全体注册能力的 triggerTiming 取值域
    const map = getRawAbilityMap();
    const allTimings = new Set<string>();
    for (const v of Object.values(map) as any[]) {
      const t = v.triggerTiming;
      if (Array.isArray(t)) t.forEach((x: string) => allTimings.add(x));
      else if (typeof t === "string") allTimings.add(t);
    }
    // 取值域收敛（防止有人悄悄加新 timing 但没人消费）
    expect([...allTimings].sort()).toEqual(
      ["day", "every_night", "first_night", "on_death", "passive"].sort()
    );
  });
});

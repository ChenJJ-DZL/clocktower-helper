/**
 * 复杂剧本压测（固化 vitest 版本）
 *
 * 针对《黯月初升》(BMR) 与《梦殒春宵/教派与紫罗兰》(S&V)：
 * - 连续 5 夜模拟，跨夜推进死亡/中毒/复活状态
 * - 断言全量不变式全绿（I1-I11）
 *
 * 运行：npx vitest run src/utils/invariantTesting/stress.test.ts
 */
import { beforeEach, describe, expect, it } from "vitest";
import { BMR_ROLES, runStressGame, SV_ROLES } from "./stressTest";

import { resetLimitedAbilityUses } from "../../utils/LimitedAbilityManager";
/**
 * ⚠️ 2026-09-21 补：限次能力的 `instanceUses` / `globalUses` 是**模块级单例**、
 *   会**跨用例累积**。用例 A 用过之后，用例 B 会被 `preCheck` 拒绝
 *   （表现为 `abilityResult === undefined`）。
 *
 *   ⚠️ 此前不暴露：P0-A 修复前 `initializeLimitedAbilityManager()` 生产零调用
 *   ⇒ `definitions` 为空 ⇒ 校验恒真且**不记账** ⇒ 用例之间无污染。
 *   修好 P0-A（模块级自初始化）后，记账才真正生效 ⇒ 必须在每个用例前重置。
 *
 *   ⚠️ 必须用**无参**调用清空全部 ——
 *   `resetLimitedAbilityUses(seatId, abilityId)` 只删 `instanceUses`、
 *   **不删 `globalUses`**，对 `global: true` 的能力（如女裁缝）重置无效。
 */
beforeEach(() => {
  resetLimitedAbilityUses();
});

describe("复杂剧本压测（BMR + S&V）", () => {
  it("黯月初升：20局×5夜 不变式全绿（多重死亡/复活/保护抵消）", async () => {
    const results: string[] = [];
    let failed = 0;
    for (let g = 0; g < 20; g++) {
      const seed = 20260801 + g;
      const report = await runStressGame(BMR_ROLES, 9, 5, seed);
      if (!report.passed) {
        failed++;
        results.push(`局${g + 1}(seed=${seed}) 失败`);
      }
    }
    expect(failed).toBe(0);
  });

  it("梦殒春宵：20局×5夜 不变式全绿（疯狂/变异/伪装身份/交换）", async () => {
    const results: string[] = [];
    let failed = 0;
    for (let g = 0; g < 20; g++) {
      const seed = 20260801 + g;
      const report = await runStressGame(SV_ROLES, 9, 5, seed);
      if (!report.passed) {
        failed++;
        results.push(`局${g + 1}(seed=${seed}) 失败`);
      }
    }
    expect(failed).toBe(0);
  });
});

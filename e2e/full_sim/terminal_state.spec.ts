import { expect, test } from "@playwright/test";
import { runFullGameSim } from "../helpers/fullSimRunner";

/**
 * 🏁 终局四条专项 —— 把「整局游戏符合规则」的最后一环钉死
 * ================================================================
 * 背景（2026-10-21）：9 剧本矩阵在 `SIM_CYCLES=6` 下**多数局跑不到终局**
 * ⇒ I7 的终局校验**从来没被触发过**（"没跑到" 伪装成 "通过"）。
 *
 * 本专项改用 **5 人局**（配比 3 镇民 + 1 爪牙 + 1 恶魔，官方标准表），
 * 死亡 3 人即到「存活 ≤2 ⇒ 邪恶胜」阈值，通常 3~5 个昼夜即终局，因此：
 *   · `requireGameOver: true` ⇒ 跑不到终局直接报 I7-reach（不许静默跳过）；
 *   · 到达终局后由 `utils/terminalRules` **独立反算官方四条**并与 UI 胜方比对
 *     （I7-rules）—— 判反了会红，而不是"只要有胜利字样就算过"。
 *
 * 运行：SIM_TERMINAL_CYCLES=12 npx playwright test e2e/full_sim/terminal_state.spec.ts
 */
const MAX_CYCLES = Number(process.env.SIM_TERMINAL_CYCLES ?? "12");

/** 挑两个机制差异最大的官方剧本：暗流涌动（基础）/ 黯月初升（复杂死亡与保护） */
const TERMINAL_CASES = [
  { name: "暗流涌动", players: 5, seed: 91001 },
  { name: "黯月初升", players: 5, seed: 91002 },
];

for (const entry of TERMINAL_CASES) {
  test.describe(`终局四条 · ${entry.name}（${entry.players} 人）`, () => {
    test.setTimeout(20 * 60 * 1000);

    test(`seed=${entry.seed} 必须跑到终局，且胜负符合官方四条`, async ({
      page,
    }) => {
      const summary = await runFullGameSim(page, {
        script: entry.name,
        players: entry.players,
        seed: entry.seed,
        maxCycles: MAX_CYCLES,
        requireGameOver: true,
        reportName: `terminal_${entry.seed}`,
      });

      // 1) 必须真的终局（requireGameOver 已在 runner 内报 I7-reach，这里再显式断言一次）
      expect(
        summary.gameover,
        `${entry.name} 在 ${MAX_CYCLES} 个昼夜内没有终局 —— 不能算通过`
      ).toBe(true);

      // 2) 终局四条必须成立且与 UI 一致
      expect(
        summary.terminal,
        "到达终局但没有产出终局判据（runner 逻辑缺失）"
      ).toBeTruthy();
      expect(summary.terminal?.expected, "四条规则都算不出胜方").not.toBeNull();
      expect(
        summary.terminal?.ok,
        `终局判定与官方四条不一致：${summary.terminal?.reason ?? ""}`
      ).toBe(true);
    });
  });
}

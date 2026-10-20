import { test } from "@playwright/test";
import { runFullGameSim } from "../helpers/fullSimRunner";

/**
 * ⭐⭐ 全真随机整局模拟 · 单剧本深跑
 * ================================================================
 * 与「钉死阵容逐角色脚本」互补：本文件**不预设任何角色/目标**，
 * 完全随机发牌 + 随机技能目标 + 随机提名 + 随机投票，
 * 逐步骤抓快照校验 I0–I14（见 helpers/fullSim.ts 头注释）。
 *
 * 默认跑罂粟花开（24 角色池，机制最复杂）。可用环境变量覆盖：
 *   SIM_SCRIPT=暗流涌动 SIM_PLAYERS=11 SEED=20261020 SIM_CYCLES=8
 *
 * ⚠️ 2026-10-21 重构：驱动/判据/落盘已抽到 `helpers/fullSimRunner.ts`，
 *   本文件只做参数绑定。9 剧本矩阵见 `all_scripts.spec.ts`。
 */
const SCRIPT = process.env.SIM_SCRIPT ?? "罂粟花开";
const PLAYERS = Number(process.env.SIM_PLAYERS ?? "11");
const SEED = Number(process.env.SEED ?? "20261020");
const MAX_CYCLES = Number(process.env.SIM_CYCLES ?? "8");

test.describe(`全真随机整局 · ${SCRIPT} ${PLAYERS}人 seed=${SEED}`, () => {
  test.setTimeout(25 * 60 * 1000); // 整局真实点击流，给足 25 分钟

  test("随机技能/提名/投票跑完整局 ⇒ 不变量全程零违规", async ({ page }) => {
    await runFullGameSim(page, {
      script: SCRIPT,
      players: PLAYERS,
      seed: SEED,
      maxCycles: MAX_CYCLES,
      reportName: "full_sim_report",
    });
  });
});

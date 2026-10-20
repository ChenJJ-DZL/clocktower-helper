import { test } from "@playwright/test";
import { ALL_SCRIPTS, runFullGameSim } from "../helpers/fullSimRunner";

/**
 * ⭐⭐ 9 剧本整局矩阵 —— 「整局游戏都符合规则」的覆盖底线
 * ================================================================
 * 背景（2026-10-21）：此前只有 `poppyganda_random_11.spec.ts` 一局随机整局
 * 模拟，且剧本名**硬编码**为罂粟花开 ⇒ 其余 8 个剧本的整局链路
 * （发牌 → 夜间技能 → 白天提名投票 → 终局判定）**没有任何端到端证据**，
 * 只有逐角色脚本。本文件对 9 个剧本各跑一局固定 seed 的随机整局，
 * 逐步骤校验 I0–I14。
 *
 * ⚠️ 判据与驱动力全部复用 `helpers/fullSimRunner.ts`，不另立一套，
 *   避免「两套判据各自为政」。
 * ⚠️ 发牌已可复现（`utils/dealRng.ts`），所以 seed 固定即可回归。
 * ⚠️ 单局耗时随剧本复杂度浮动（约 30 秒 ~ 4 分钟），9 局建议在 nightly 跑。
 */
const MAX_CYCLES = Number(process.env.SIM_CYCLES ?? "6");

for (const entry of ALL_SCRIPTS) {
  test.describe(`9 剧本矩阵 · ${entry.name}`, () => {
    test.setTimeout(25 * 60 * 1000);

    test(`seed=${entry.seed} 随机整局 ⇒ 零违规`, async ({ page }) => {
      await runFullGameSim(page, {
        script: entry.name,
        players: entry.players,
        seed: entry.seed,
        maxCycles: MAX_CYCLES,
        reportName: `full_sim_${entry.seed}`,
      });
    });
  });
}

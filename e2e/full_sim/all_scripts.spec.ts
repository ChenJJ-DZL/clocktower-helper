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
/**
 * 圈数上限的语义：**不是覆盖目标，是卡死兜底**。
 *   · 默认 20 圈：15 人局要死 13 人才到「存活 ≤2」，实测需要 8~12 圈；
 *     上限设 6 会让 7/9 剧本「没跑到终局」，却被当成通过（I7 从未触发）。
 *   · 达到上限但未终局 ⇒ 只记一条告警（`hitCycleCap`），**不算违规**：
 *     矩阵的职责是「角色技能与流程合规」，终局判据由 5 人局的 terminal_state 专项负责。
 *   · 真卡死（驱动超时）由驱动自己抛错，与本上限无关。
 */
const MAX_CYCLES = Number(process.env.SIM_CYCLES ?? "20");

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

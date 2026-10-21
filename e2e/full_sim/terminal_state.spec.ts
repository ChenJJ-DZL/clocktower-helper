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

/** 9 个剧本全覆盖：每局 5 人，死亡 3 人即到「存活 ≤2」阈值，通常 1~5 昼夜终局 */
const TERMINAL_CASES = [
  { name: "暗流涌动", players: 5, seed: 91001 },
  { name: "黯月初升", players: 5, seed: 91002 },
  { name: "梦殒春宵", players: 5, seed: 91003 },
  { name: "窃窃私语", players: 5, seed: 91004 },
  { name: "无名之墓", players: 5, seed: 91005 },
  { name: "无上愉悦", players: 5, seed: 91006 },
  { name: "凶宅魅影", players: 5, seed: 91007 },
  { name: "游园惊梦", players: 5, seed: 91008 },
  { name: "罂粟花开", players: 5, seed: 91009 },
];

/**
 * ⚠️ 已知卡死（不是「跳过」，是**断言它仍然失败**）。
 *   Playwright 的 `test.fail()` 语义：本用例预期失败 —— 若哪天修好了，
 *   它会变成 "unexpectedly passed" 直接报红，强制把条目移回 TERMINAL_CASES。
 *   ⇒ 缺陷保持可见，且不会被误当成通过。
 *
 * 📌 2026-10-21：**已清零**。
 *   · 游园惊梦（91008）：剧本级「第 3 个白天结束 ⇒ 邪恶自动获胜」现在真的触发，
 *     3 个昼夜终局；根因是 `useLogicDispatcher` 把胜负副作用写在 `setSeats` updater
 *     里，`setGamePhase("gameOver")` 被丢弃，状态卡在「已有胜负 + 阶段仍是 day」。
 *   · 凶宅魅影（91007）：根因是普卡把**对象**写进 `statusDetails`（类型是 string[]），
 *     进黄昏时 `cleanseTempStatuses` 的 `.includes()` 抛
 *     `includes is not a function` ⇒ 「进入黄昏处决阶段」永远失败、白天推进不到夜晚。
 *   两个剧本修好后都是 "unexpectedly passed"（棘轮正常报警），已移到 TERMINAL_CASES。
 */
const KNOWN_STUCK: Array<{
  name: string;
  players: number;
  seed: number;
  reason: string;
}> = [];

for (const entry of [...TERMINAL_CASES, ...KNOWN_STUCK]) {
  const stuck = KNOWN_STUCK.find((x) => x.seed === entry.seed);
  test.describe(`终局四条 · ${entry.name}（${entry.players} 人）`, () => {
    test.setTimeout(20 * 60 * 1000);

    test(`seed=${entry.seed} 必须跑到终局，且胜负符合官方四条`, async ({
      page,
    }) => {
      // 已知卡死：断言「仍然失败」，修好后会报 unexpectedly passed
      if (stuck) test.fail(true, stuck.reason);
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
      // 通用四条算不出胜方时，必须由**专属规则**给出胜因（两者必居其一）
      expect(
        summary.terminal?.expected !== null ||
          summary.terminal?.special === true,
        "既不符合通用四条，也没有专属胜因"
      ).toBe(true);
      expect(
        summary.terminal?.ok,
        `终局判定与官方四条不一致：${summary.terminal?.reason ?? ""}`
      ).toBe(true);
    });
  });
}

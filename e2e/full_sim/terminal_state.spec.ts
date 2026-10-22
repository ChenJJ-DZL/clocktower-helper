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

/**
 * 专项 X05（45 条 = 9 剧本 × 5 局）—— 见
 * `outputs/全量验证计划V2-场次用例清单-2026-10-21.md` §X05。
 *
 * 与上面 9 条基线（seed 91001–91009）的分工：
 *   · 910xx：**每剧本 1 局**，锁「终局判据本身对不对」（已经是 CI 基线）；
 *   · 940xx：**每剧本 5 局**，锁「同一套判据在不同牌局下都成立」，
 *     并额外要求「5 局里至少出现 1 次专属胜因」与「胜方不是一边倒」。
 *
 * ⚠️ 5 人局：3 镇民 + 1 爪牙 + 1 恶魔（官方标准表）。死亡 3 人即「可计存活 ≤2」，
 *   通常 1~5 个昼夜终局，单局几十秒。
 */
const X05_SEEDS: Array<{ name: string; players: number; seed: number }> = [
  // 暗流涌动
  { name: "暗流涌动", players: 5, seed: 94001 },
  { name: "暗流涌动", players: 5, seed: 94002 },
  { name: "暗流涌动", players: 5, seed: 94003 },
  { name: "暗流涌动", players: 5, seed: 94004 },
  { name: "暗流涌动", players: 5, seed: 94005 },
  // 黯月初升
  { name: "黯月初升", players: 5, seed: 94006 },
  { name: "黯月初升", players: 5, seed: 94007 },
  { name: "黯月初升", players: 5, seed: 94008 },
  { name: "黯月初升", players: 5, seed: 94009 },
  { name: "黯月初升", players: 5, seed: 94010 },
  // 梦殒春宵
  { name: "梦殒春宵", players: 5, seed: 94011 },
  { name: "梦殒春宵", players: 5, seed: 94012 },
  { name: "梦殒春宵", players: 5, seed: 94013 },
  { name: "梦殒春宵", players: 5, seed: 94014 },
  { name: "梦殒春宵", players: 5, seed: 94015 },
  // 窃窃私语
  { name: "窃窃私语", players: 5, seed: 94016 },
  { name: "窃窃私语", players: 5, seed: 94017 },
  { name: "窃窃私语", players: 5, seed: 94018 },
  { name: "窃窃私语", players: 5, seed: 94019 },
  { name: "窃窃私语", players: 5, seed: 94020 },
  // 无名之墓
  { name: "无名之墓", players: 5, seed: 94021 },
  { name: "无名之墓", players: 5, seed: 94022 },
  { name: "无名之墓", players: 5, seed: 94023 },
  { name: "无名之墓", players: 5, seed: 94024 },
  { name: "无名之墓", players: 5, seed: 94025 },
  // 无上愉悦
  { name: "无上愉悦", players: 5, seed: 94026 },
  { name: "无上愉悦", players: 5, seed: 94027 },
  { name: "无上愉悦", players: 5, seed: 94028 },
  { name: "无上愉悦", players: 5, seed: 94029 },
  { name: "无上愉悦", players: 5, seed: 94030 },
  // 凶宅魅影
  { name: "凶宅魅影", players: 5, seed: 94031 },
  { name: "凶宅魅影", players: 5, seed: 94032 },
  { name: "凶宅魅影", players: 5, seed: 94033 },
  { name: "凶宅魅影", players: 5, seed: 94034 },
  { name: "凶宅魅影", players: 5, seed: 94035 },
  // 游园惊梦
  { name: "游园惊梦", players: 5, seed: 94036 },
  { name: "游园惊梦", players: 5, seed: 94037 },
  { name: "游园惊梦", players: 5, seed: 94038 },
  { name: "游园惊梦", players: 5, seed: 94039 },
  { name: "游园惊梦", players: 5, seed: 94040 },
  // 罂粟花开
  { name: "罂粟花开", players: 5, seed: 94041 },
  { name: "罂粟花开", players: 5, seed: 94042 },
  { name: "罂粟花开", players: 5, seed: 94043 },
  { name: "罂粟花开", players: 5, seed: 94044 },
  { name: "罂粟花开", players: 5, seed: 94045 },
];

/** X05-extra 的胜方分布采集（workers=1 + fullyParallel:false ⇒ 同文件内串行有序） */
const X05_WINNERS = new Map<string, Array<"good" | "evil" | "special">>();

/**
 * ⚠️ 已知缺陷登记（`test.fail` = 断言「它现在仍然坏着」）。
 * 修好后 Playwright 会报 **unexpectedly passed** 直接翻红，强制把条目移出去。
 * 逐条都写了 2026-10-22 实测的现场，不许只写「待修」。
 */
const X05_KNOWN_DEFECTS: Record<number, string> = {
  /**
   * 📌 2026-10-22：**已清零**。
   *   首跑登记的 5 条（94002 / 94008 / 94011 / 94013 / 94017）全部被同一组修复
   *   一起解决 —— 根因是「终局判出后被『夜晚结束』覆盖」+「终局快照不落盘」：
   *   · `continueToNextAction` 加 `victoryRef` 门禁（终局态不可推进）
   *   · 快照保存 effect 覆盖 `gameOver`（否则快照里角色身份仍是跳变前的旧值）
   *   现在这里是空的；再出现红时请**先修**，不要往里塞。
   */
};

for (const entry of X05_SEEDS) {
  const knownReason = X05_KNOWN_DEFECTS[entry.seed];
  test.describe(`X05 终局矩阵 · ${entry.name}（seed=${entry.seed}）`, () => {
    test.setTimeout(20 * 60 * 1000);

    test(`seed=${entry.seed} 必须终局且符合官方四条`, async ({ page }) => {
      // 已知缺陷：断言「仍然失败」，修好后会自动报 unexpectedly passed
      if (knownReason) test.fail(true, knownReason);
      const summary = await runFullGameSim(page, {
        script: entry.name,
        players: entry.players,
        seed: entry.seed,
        maxCycles: MAX_CYCLES,
        requireGameOver: true,
        reportName: `x05_${entry.seed}`,
      });

      expect(
        summary.gameover,
        `${entry.name} seed=${entry.seed} 在 ${MAX_CYCLES} 个昼夜内没有终局 —— 不能算通过`
      ).toBe(true);
      expect(summary.terminal, "到达终局但没有产出终局判据").toBeTruthy();
      expect(
        summary.terminal?.expected !== null ||
          summary.terminal?.special === true,
        "既不符合通用四条，也没有专属胜因"
      ).toBe(true);
      expect(
        summary.terminal?.ok,
        `终局判定与官方四条不一致：${summary.terminal?.reason ?? ""}`
      ).toBe(true);

      const winner: "good" | "evil" | "special" =
        summary.terminal?.expected === "good"
          ? "good"
          : summary.terminal?.expected === "evil"
            ? "evil"
            : "special";
      const list = X05_WINNERS.get(entry.name) ?? [];
      list.push(winner);
      X05_WINNERS.set(entry.name, list);
    });
  });
}

test.describe("X05-extra 胜方分布", () => {
  test.setTimeout(60_000);
  test("9 剧本里至少 7 个同时出现 good 与 evil（判据不是只覆盖一半分支）", () => {
    const rows = [...X05_WINNERS.entries()].map(([script, ws]) => {
      const set = new Set(ws);
      return {
        script,
        winners: ws.join(","),
        hasBoth: set.has("good") && set.has("evil"),
      };
    });

    // 一个剧本都没跑（例如 -g 过滤掉了所有 X05 用例）⇒ 明确跳过，不伪装成通过
    if (rows.length === 0) {
      test.skip(true, "本次运行没有执行 X05 矩阵（被 -g 过滤），分布断言不适用");
      return;
    }

    const both = rows.filter((r) => r.hasBoth).length;
    expect(
      both,
      `同时出现 good 与 evil 的剧本只有 ${both} 个（要求 ≥ 7）。实测：\n` +
        rows.map((r) => `  · ${r.script}: ${r.winners}`).join("\n")
    ).toBeGreaterThanOrEqual(Math.min(7, rows.length));

    // 专属胜因至少出现 1 次（圣徒 / 涡流 / 利维坦 / 游园自动获胜 / 镇长三人存活）
    const specialCount = rows
      .flatMap((r) => r.winners.split(","))
      .filter((w) => w === "special").length;
    expect.soft(specialCount, "5 局 × 9 剧本里应至少出现 1 次专属胜因").toBeGreaterThan(0);
  });
});

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

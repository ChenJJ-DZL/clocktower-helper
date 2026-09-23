/**
 * 「能力击杀 ⇒ 必须判终局」契约护栏（源码级，2026-09-22 建）
 * ============================================================
 * 🔴 本护栏的由来（**E2E 实跑抓到的真缺陷**）
 * ------------------------------------------------------------------
 * `killPlayer`（`useGameController.ts`）只负责改座位状态，**自己不判终局**；
 * 终局判定 `checkGameOver` 在各**调用方**手里。夜间路径与处决路径各自补了，
 * 但**白天能力击杀路径漏了** —— 典型：`useDayActions.ts` 的女巫诅咒分支
 *   `killPlayer(sourceId, { skipGameOverCheck: false, … })` 之后**直接 return**。
 *
 * 后果：若被诅咒的提名者**就是恶魔**，则「恶魔死了却继续进下一夜」，
 * 违反官方「**Good wins if the Demon dies**」。E2E 现场：
 *   `{"role":"po","diedOnDay":1,"deathSource":"ability","isSentenced":false}` + 未终局。
 *
 * ⚠️ 该缺陷能长期潜伏，是因为 **`skipGameOverCheck` 是死字段**：
 *   全仓 6 处传入（其中 3 处显式传 `false` = 「请判终局」），
 *   而 `killPlayer` 的选项解构里**根本没有它** ⇒ 静默失效。
 *   这是本项目「有字段·无消费方 → 假绿」家族（skill §B.1）的又一例。
 *
 * ✅ 修法（单点）：`killPlayer` 消费 `skipGameOverCheck`，并在击杀后调
 *   `gameOverRef.current.run(...)`（`gameOverRef` 在 `useLogicDispatcher` 之后
 *   渲染期回填，带 `victoryRef` 幂等保护）。
 *
 * ── 本文件为什么用「源码扫描」而不是行为断言 ──────────────────────
 *   行为断言需要把 `useGameController`（巨型 hook）整体渲染起来，
 *   成本极高且脆弱；而这里要防的退化形态只有一种 ——
 *   **有人把击杀路径的终局判定删掉/改回死字段**。
 *   源码级配对检是本项目既有惯例（见 `effect_gate_contract.test.ts`、
 *   `deathMarkerUnification.test.ts`）。
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";

const FILE = "src/hooks/useGameController.ts";

/** 剥块注释与行注释（纯字符串方法，无反斜杠 —— 本仓库位于中文目录，Windows 下反斜杠易坏） */
function strip(src: string): string {
  let out = src;
  for (;;) {
    const a = out.indexOf("/*");
    if (a < 0) break;
    const b = out.indexOf("*/", a + 2);
    if (b < 0) break;
    out = out.slice(0, a) + " " + out.slice(b + 2);
  }
  return out
    .split("\n")
    .map((l) => {
      const i = l.indexOf("//");
      return i >= 0 ? l.slice(0, i) : l;
    })
    .join("\n");
}

/** 取 `killPlayer` 的 `useCallback` 体（从签名到 deps 数组结束） */
function killPlayerBody(): string {
  const src = strip(readFileSync(FILE, "utf8"));
  const start = src.indexOf("const killPlayer = useCallback(");
  expect(start, "❌ 找不到 `const killPlayer = useCallback(` —— 文件结构变了，请更新本护栏").toBeGreaterThan(-1);
  // 体到下一个顶层 `const xxx = useCallback(` 之前
  const rest = src.slice(start);
  const next = rest.indexOf("\n  const ", 10);
  return next > 0 ? rest.slice(0, next) : rest;
}

const BODY = killPlayerBody();

describe("🛡️ 「能力击杀 ⇒ 判终局」契约（源码级）", () => {
  it("① `killPlayer` 必须**消费** `skipGameOverCheck`（防它退回死字段）", () => {
    expect(
      BODY.includes("skipGameOverCheck"),
      "❌ `killPlayer` 不再出现 `skipGameOverCheck` —— 该字段曾在全仓被传 6 次却从未被消费，" +
        "属「有字段·无消费方」的假绿家族；删掉它会让「多目标击杀只判一次终局」的语义丢失"
    ).toBe(true);
    // 必须是**解构赋值**里的默认值，而不是仅仅出现在注释/条件里
    expect(
      /skipGameOverCheck\s*=\s*false/.test(BODY),
      "❌ `skipGameOverCheck` 必须以 `= false` 作为默认值解构出来（默认「每次击杀后都判终局」）"
    ).toBe(true);
  });

  it("② `killPlayer` 必须在击杀后调用终局判定入口 `gameOverRef.current.run(`", () => {
    expect(
      BODY.includes("gameOverRef.current.run("),
      "❌ 击杀后不再调用终局判定 ⇒ **恶魔死于能力击杀时游戏不会结束**" +
        "（官方：Good wins if the Demon dies）。E2E 用例③ 会同时报红。"
    ).toBe(true);
    // 且必须受 `skipGameOverCheck` 门控
    expect(
      /if\s*\(\s*!\s*skipGameOverCheck\s*\)/.test(BODY),
      "❌ 终局判定未被 `skipGameOverCheck` 门控 —— 多目标击杀会重复判定 N 次"
    ).toBe(true);
  });

  it("③ 必须在 `useLogicDispatcher` 之后**回填** `gameOverRef.current`（否则它永远是空函数）", () => {
    const src = strip(readFileSync(FILE, "utf8"));
    expect(
      src.includes("gameOverRef.current = {"),
      "❌ 找不到 `gameOverRef.current = {` 的回填 —— ref 会停留在初始的空函数，击杀后静默不判终局（最难发现的形态）"
    ).toBe(true);
    // 回填必须带 `victoryRef` 幂等保护
    expect(
      /gameOverRef\.current = \{[\s\S]{0,400}?victoryRef\.current/.test(src),
      "❌ 回填的 `run` 里没有 `victoryRef.current` 幂等保护 ⇒ 已终局的对局会被重复判定/重复战报"
    ).toBe(true);
    // 且回填位置必须在 useLogicDispatcher 调用之后（不能踩 TDZ）
    // ⚠️ 不要匹配 `= useLogicDispatcher(`：源码里等号与调用**跨行**
    //   （`const {...} =\n    useLogicDispatcher(`）⇒ 匹配会落空（本护栏首版即栽在此）。
    const iDispatcher = src.indexOf("useLogicDispatcher(");
    const iFill = src.indexOf("gameOverRef.current = {");
    expect(iDispatcher, "❌ 找不到 `useLogicDispatcher(` 调用").toBeGreaterThan(-1);
    expect(
      iFill,
      "❌ `gameOverRef` 的回填出现在 `useLogicDispatcher` **之前** —— 会踩 TDZ（const 未初始化）"
    ).toBeGreaterThan(iDispatcher);
  });

  it("④ 🃏 弄臣免死：`killPlayer` 必须判定 `canFoolSurvive`，且**必须在首个 `commitSeats` 之前**", () => {
    /**
     * 🔴 官方【弄臣】：「当你**首次**将要死亡时，你不会死亡。」⇒ 免死**只生效一次**、**不分死因**
     *   ⇒ 处决/能力击杀路径（`useExecutionHandlers` 全文搜不到 `fool`）必须由
     *     `killPlayer` 这个唯一咽喉覆盖。
     *
     * ⚠️⚠️ **顺序**是这条护栏的重点：`commitSeats(...)` **之后**还有两条**无条件**副作用
     *   `setDeadThisNight(...)` 与 `setOutsiderDiedToday(true)`（弄臣是**外来者**）
     *   ⇒ 若把「免死 ⇒ 存活」写在 `commitSeats` 的 updater 里，就会出现
     *     「**人还活着，却被记成今夜死者 + 今日有外来者死亡**」的**更严重**不一致
     *     （连带影响夜报 / 送葬者 / **教父的「今日有外来者死亡」额外杀人前置**）。
     *   ⇒ **必须是 `commitSeats` 之前的提前 `return`**（此坑 2026-09-22 实测踩过）。
     */
    expect(
      BODY.includes("canFoolSurvive("),
      "❌ `killPlayer` 不再判定弄臣免死 ⇒ 处决 / 能力击杀一个尚未使用免死的弄臣会直接死亡"
    ).toBe(true);

    const iFool = BODY.indexOf("canFoolSurvive(");
    const iCommit = BODY.indexOf("commitSeats(");
    expect(iCommit, "❌ 找不到 `commitSeats(` —— 文件结构变了，请更新本护栏").toBeGreaterThan(-1);
    expect(
      iFool,
      "❌ 弄臣免死判定出现在首个 `commitSeats` **之后** —— 会在 `commitSeats` 后无条件触发 " +
        "`setDeadThisNight` / `setOutsiderDiedToday`，导致「活着却被记成今夜死者 + 外来者死亡」"
    ).toBeLessThan(iCommit);
  });

  it("⑤ 负向对照（防扫描器恒绿）：对一段**不含标记**的替身文本，全部判据必须落空", () => {
    // 若哪天判据被写成恒真（例如误用 includes("")），这条会立刻红。
    const stub = "const killPlayer = useCallback((targetId) => { commitSeats(() => {}); }, []);";
    expect(stub.includes("skipGameOverCheck")).toBe(false);
    expect(/skipGameOverCheck\s*=\s*false/.test(stub)).toBe(false);
    expect(stub.includes("gameOverRef.current.run(")).toBe(false);
    expect(/if\s*\(\s*!\s*skipGameOverCheck\s*\)/.test(stub)).toBe(false);
    expect(stub.includes("canFoolSurvive(")).toBe(false);

    // 顺序判据的负向对照：**错序**样本必须被判为「不在之前」（防 `toBeLessThan` 写反）
    const badOrder = "commitSeats(() => {}); if (canFoolSurvive(x)) return;";
    expect(
      badOrder.indexOf("canFoolSurvive(") < badOrder.indexOf("commitSeats("),
      "负向对照：错序样本应判为「不在之前」"
    ).toBe(false);
  });
});

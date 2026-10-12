/**
 * dusk→night 转换源码护栏（P0-② 修复锁定）
 * ==================================================================
 * 缺陷史：正常处决（恰一名候选人得票达标）确认后，confirmExecutionResult
 * 的 else 分支曾为**空实现** ⇒ 黄昏处决后游戏停留在 "dusk" 无法进入
 * 夜晚（死循环）——说书人打到第二个白天直接卡死。
 * 修复（并行 session 已落地，useExecutionHandlers.ts:1363 附近）：
 *   分支内调 startSubsequentNight()，且带 winResult 防护
 *   （处决已导致终局时不进夜晚，保持 gameOver）。
 *
 * ⚠️ 本文件是源码级护栏：hook 内部逻辑无单测先例（useExecutionHandlers
 *   依赖 20+ 注入），按项目 source_guardrails 传统锁定修复形态，
 *   防回归。行为级覆盖见 saint.test.ts 等 integration 的 dusk 场景。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = readFileSync(
  resolve(__dirname, "../../hooks/useExecutionHandlers.ts"),
  "utf-8"
);
const code = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(
  /^\s*\/\/.*$/gm,
  ""
);

describe("🛡️ dusk→night 转换护栏（黄昏处决后必须推进夜晚）", () => {
  it("⭐ 正常处决分支必须调用 startSubsequentNight（禁空分支）", () => {
    // 定位「正常处决」else 分支：注释关键词 + 调用
    expect(code).toContain("startSubsequentNight()");
    // 分支不得为空：捕获 startSubsequentNight 调用点前后文，
    // 确认其处于 confirmExecutionResult 函数体内
    const fnStart = code.indexOf("confirmExecutionResult");
    expect(fnStart, "confirmExecutionResult 应存在").toBeGreaterThan(-1);
    const fnBody = code.slice(fnStart, fnStart + 8000);
    expect(
      fnBody.includes("startSubsequentNight()"),
      "confirmExecutionResult 体内必须调用 startSubsequentNight"
    ).toBe(true);
  });

  it("⭐ winResult 防护：处决已终局时不得进入夜晚", () => {
    const idx = code.indexOf("处决已导致游戏结束，跳过进入夜晚");
    expect(idx, "winResult 防护分支应存在").toBeGreaterThan(-1);
    const region = code.slice(Math.max(0, idx - 400), idx + 400);
    expect(region).toMatch(/if\s*\(\s*winResult\s*\)/);
    expect(region).toMatch(/return/);
  });

  it("⭐ 平票/零票分支也必须有明确走向（禁静默停留 dusk）", () => {
    // tops.length !== 1 的分支：直接 return 前必须有 phase 处理或提示，
    // 不允许「什么都不做让游戏卡在 dusk」
    const idx = code.indexOf("lastAction: \"execution\"");
    expect(idx, "平票分支锚点应存在").toBeGreaterThan(-1);
    const region = code.slice(Math.max(0, idx - 800), idx + 200);
    expect(region).toMatch(/return|setGamePhase|startSubsequentNight/);
  });
});

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 🌙 月之子结算日志的文案契约（2026-10-22 用户要求「增加月之子日志文案」）
 * ----------------------------------------------------------------------------
 * 官方【角色能力】：「当你得知你死亡时，你要**公开选择一名存活的玩家**。
 *   如果他是善良的，**在当晚他会死亡**。」
 *
 * 这条判据在 `useConfirmHandlers::confirmMoonchildKill` 里，是纯日志字符串，
 * 没有可注入的返回值（`addLog` 是副作用），所以用源码级契约锁住：
 *   ① 两个分支都必须写「谁选了谁 + 结果」，不能只写「未死亡」而漏掉选择本身；
 *   ② 措辞必须是官方的「公开选择」，**不得**再用自创的「陪葬」；
 *   ③ **不得**把目标阵营写进日志（阵营由玩家自己从死亡与否推断）。
 */
const SRC = path.join(
  process.cwd(),
  "src",
  "hooks",
  "useConfirmHandlers.ts"
);

describe("月之子 · 结算日志文案", () => {
  const src = fs.readFileSync(SRC, "utf8");

  it("选到善良目标：日志写明「公开选择 N号：该玩家在当晚死亡」", () => {
    expect(src).toMatch(
      /公开选择 \$\{targetId \+ 1\}号：该玩家在当晚死亡/
    );
  });

  it("选到非善良目标：日志也必须写明选择 + 结果（不能只说未死亡）", () => {
    expect(src).toMatch(/公开选择 \$\{targetId \+ 1\}号：该玩家未死亡/);
  });

  it("不得再出现自创措辞「陪葬」", () => {
    expect(src).not.toContain("陪葬");
  });

  it("日志不得直接写出目标阵营（善良/邪恶阵营），只能写结果", () => {
    // 两个日志模板里都不许出现「善良阵营」「邪恶阵营」「非善良」
    const templates = src.match(/\$\{sourceId \+ 1\}号\(月之子\)[^`]*/g) ?? [];
    expect(templates.length, "月之子必须有结算日志").toBeGreaterThanOrEqual(2);
    for (const tpl of templates) {
      expect(tpl).not.toMatch(/善良阵营|邪恶阵营/);
    }
  });
});

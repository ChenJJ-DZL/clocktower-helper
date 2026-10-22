import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ✊✌️✋ 精神病患者（Psychopath）猜拳结算的规则契约
 * ----------------------------------------------------------------------------
 * 官方（`officialRoleDocs.json` · 精神病患者）：
 * 【角色能力】「如果你被处决，提名你的玩家需要和你猜拳，**只有你输了**你才会死亡。」
 * 【运作方式】「如果精神病患者在猜拳中输了，那么他死亡。
 *    **如果精神病患者在猜拳中平局或获胜，他会仍然存活。**
 *    不论猜拳是哪种结果，白天阶段会随即结束。」
 * 【范例】三次猜拳里精神病患者全部存活，**没有任何一处提到提名者死亡**。
 *
 * 🔴 修复前的真缺陷（2026-10-22 文案对账批 2）：
 *   1. `resolveLunaticRps` 在「赢/平」分支里 `killPlayer(nominatorId)` ——
 *      官方根本不让提名者死，属自创规则 + 方向错误；
 *   2. 弹窗按钮与说明也写着「提名者死亡」。
 *
 * 这条判据只能源码级锁：`resolveLunaticRps` 是 React hook 内的 useCallback，
 * 没有可注入的返回值（killPlayer 是副作用）。
 */
const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("精神病患者猜拳 · 只有他输了他才死", () => {
  const handler = read("src/hooks/useExecutionHandlers.ts");
  const modal = read("src/components/modals/LunaticRpsModal.tsx");

  it("赢/平分支不得处决提名者", () => {
    const start = handler.indexOf("const resolveLunaticRps");
    expect(start, "找不到 resolveLunaticRps").toBeGreaterThan(-1);
    const end = handler.indexOf("const confirmShootResult", start);
    const body = handler.slice(start, end === -1 ? start + 4000 : end);

    expect(
      /killPlayer\(\s*nominatorId/.test(body),
      "官方：赢/平只是「他仍然存活」，不得杀死提名者"
    ).toBe(false);
    expect(body).toContain("他不会死亡，处决取消");
  });

  it("输的分支仍然是处决精神病患者本人（防修过头）", () => {
    const start = handler.indexOf("const resolveLunaticRps");
    const end = handler.indexOf("const confirmShootResult", start);
    const body = handler.slice(start, end === -1 ? start + 4000 : end);
    expect(body).toMatch(/executePlayer\(targetId,\s*\{\s*skipLunaticRps:\s*true/);
  });

  it("弹窗文案不得再写「提名者死亡」（按旧文案的两处具体串判）", () => {
    // 旧按钮文案：精神病患者赢/平（提名者死亡）
    expect(modal).not.toContain("（提名者死亡）");
    // 旧说明：若精神病患者赢：他不死，提名他的人死亡
    expect(modal).not.toContain("提名他的人死亡");
    expect(modal).toContain("精神病患者赢/平（他存活）");
    expect(modal).toContain("若精神病患者赢或平：他不会死亡，处决取消");
  });
});

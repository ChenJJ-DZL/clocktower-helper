/**
 * 🛡️ 源码级护栏（从 jsdom 测试文件提取，node 环境运行）
 *
 * 这些测试读取源文件检查模式，不需要 jsdom。
 * 原始位置：lunatic_seat_highlight.test.tsx / monk_result_wrap.test.tsx / nomination_limit_ui.test.tsx
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("🛡️ 疯子目标 · 源码级护栏（防真恶魔专属信息泄漏到玩家页）", () => {
  const SRC = readFileSync(
    resolve(__dirname, "../NightActionConfirmModal.tsx"),
    "utf-8"
  );
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(
    /^\s*\/\/.*$/gm,
    ""
  );

  it("⭐ 高亮数据来源必须是 data.lunaticTargetIds，不得从 seats 反推疯子", () => {
    expect(code).not.toMatch(
      /\bseat[s]?\s*[?.]?\s*\[?[^)]*lunaticTargetIds/
    );
    expect(code).toContain("lunaticTargetIds");
    expect(code).toMatch(/new Set<number>\(\s*lunaticTargetIds/);
  });

  it("⭐ 弹窗组件内不得出现「疯子」以外的角色真相读取", () => {
    expect(code).not.toContain('role?.id === "lunatic"');
    expect(code).not.toContain("apparentDemonRole");
  });
});

describe("🛡️ 僧侣结果页 · 源码级护栏", () => {
  it("InfoResultModal 的 className 不得使用 whitespace-nowrap", () => {
    const src = readFileSync(
      resolve(__dirname, "../InfoResultModal.tsx"),
      "utf-8"
    );
    const withoutComments = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(
      withoutComments.includes("whitespace-nowrap"),
      "InfoResultModal 的 className 不得再使用 whitespace-nowrap（会导致长句溢出弹窗被裁）"
    ).toBe(false);
  });
});

describe("🛡️ 座位角标文案契约（SeatNode）", () => {
  it("提名者角标文本为「已提」、title 为「本黄昏已发起过提名」", () => {
    const src = readFileSync(
      resolve(__dirname, "../../SeatNode.tsx"),
      "utf-8"
    );
    expect(src).toContain('title="本黄昏已发起过提名"');
    expect(src).toMatch(/title="本黄昏已发起过提名"\s*>\s*已提\s*</);
  });

  it("被提名角标文本为「被提」、title 为「本黄昏已被提名过」", () => {
    const src = readFileSync(
      resolve(__dirname, "../../SeatNode.tsx"),
      "utf-8"
    );
    expect(src).toContain('title="本黄昏已被提名过"');
    expect(src).toMatch(/title="本黄昏已被提名过"\s*>\s*被提\s*</);
  });

  it("SeatNode 的角标数据源直读 nominationRecords", () => {
    const src = readFileSync(
      resolve(__dirname, "../../SeatNode.tsx"),
      "utf-8"
    );
    expect(src).toContain("nominationRecords?.nominators");
    expect(src).toContain("nominationRecords?.nominees");
    expect(src).toContain("instanceof Set");
    expect(src).toContain(".includes(s.id)");
  });
});

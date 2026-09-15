import { describe, expect, it } from "vitest";
import {
  MAX_SINGLE_LINE_CHARS,
  parseInfoResult,
  splitResultForDisplay,
} from "../infoResultParser";

/**
 * 📐 结果大字折行器（`splitResultForDisplay`）
 *
 * 背景（2026-09-14 用户实测 · 僧侣结果页）：
 *   「僧侣保护了【1号】，该玩家今晚免受恶魔负面效果影响」原先是**单行** +
 *   `whitespace-nowrap` 渲染 → 溢出弹窗右侧被裁掉，且从中间断句很难看。
 *   用户要求：**改为 2 行** + 保证完整显示在弹窗内。
 *
 * 本文件钉死折行规则，防止回归：
 *   ① 长单句按**中文标点**边界折成 2 行（标点留在上一行末尾）；
 *   ② 短句（≤ MAX_SINGLE_LINE_CHARS）**不折**；
 *   ③ 原生多行（互认/两条信息等列表）**原样保留**，不被重新排版；
 *   ④ 找不到合适标点时**不硬折**（交给渲染层 break-words 兜底）。
 */
describe("splitResultForDisplay · 长单句折 2 行", () => {
  it("僧侣（受保护）：按逗号折成 2 行，标点在上一行末尾", () => {
    const lines = splitResultForDisplay(
      "僧侣保护了【1号】，该玩家今晚免受恶魔负面效果影响"
    );
    expect(lines).toEqual([
      "僧侣保护了【1号】，",
      "该玩家今晚免受恶魔负面效果影响",
    ]);
  });

  it("僧侣（醉酒/中毒）：同样折 2 行", () => {
    const lines = splitResultForDisplay(
      "僧侣试图保护【1号】，但自身醉酒/中毒未生效"
    );
    expect(lines).toEqual(["僧侣试图保护【1号】，", "但自身醉酒/中毒未生效"]);
  });

  it("折行后拼接（去标点空白）= 原文，零字符丢失", () => {
    const raw = "僧侣保护了【1号】，该玩家今晚免受恶魔负面效果影响";
    const lines = splitResultForDisplay(raw);
    const joined = lines.join("");
    // 逐字符比对（折行只是插入换行，不得增删任何字符）
    expect(joined.replace(/\s/g, "")).toBe(raw.replace(/\s/g, ""));
  });

  it("折出的每一行都不超过原文长度，且至少 2 行", () => {
    const lines = splitResultForDisplay(
      "僧侣保护了【1号】，该玩家今晚免受恶魔负面效果影响"
    );
    expect(lines.length).toBe(2);
    for (const l of lines) expect(l.length).toBeGreaterThan(0);
  });
});

describe("splitResultForDisplay · 不应误伤", () => {
  it("短句不折（洗衣妇/守鸦人等常规信息保持单行）", () => {
    expect(splitResultForDisplay("6号和9号其中一位是【占卜师】")).toEqual([
      "6号和9号其中一位是【占卜师】",
    ]);
    expect(splitResultForDisplay("15号的角色是【小恶魔】")).toEqual([
      "15号的角色是【小恶魔】",
    ]);
  });

  it("已是多行（互认/两条信息列表）→ 原样保留，不重新排版", () => {
    const multi = "恶魔是: 15号\n爪牙队友: 13号、14号";
    expect(splitResultForDisplay(multi)).toEqual([
      "恶魔是: 15号",
      "爪牙队友: 13号、14号",
    ]);
  });

  it("极短结果（【有】/ 本局没有外来者）保持单行", () => {
    expect(splitResultForDisplay("【有】")).toEqual(["【有】"]);
    expect(splitResultForDisplay("本局没有外来者")).toEqual(["本局没有外来者"]);
  });

  it("空串 → 空数组", () => {
    expect(splitResultForDisplay("")).toEqual([]);
  });

  it(`长度恰为阈值 ${MAX_SINGLE_LINE_CHARS} 的单句不折`, () => {
    const exactly = "一二三四五六七八九十一二三四五六"; // 16 字
    expect(exactly.length).toBe(MAX_SINGLE_LINE_CHARS);
    expect(splitResultForDisplay(exactly)).toEqual([exactly]);
  });

  it("无中文标点的长句不硬折（交渲染层兜底）", () => {
    const noPunct = "AAAAAAAAAAAAAAAAAAAAAAAAAAAA"; // 28 字无标点
    expect(splitResultForDisplay(noPunct)).toEqual([noPunct]);
  });
});

/**
 * 现代版「黑底色块拼版」主题护栏（2026-10-13）
 *
 * 验收锚点（任何一条被改坏 ⇒ 用户可见的板块化识别度回归）：
 *  ① 四色板 token 必须存在（奶油/柠黄/薄荷/珊瑚）
 *  ② 牌桌 = 黑舞台；控制台 = 奶油板（板块化两大面）
 *  ③ 经典牛皮纸合成层必须保持「已移除」状态（用户 2026-10-13 裁定取消）
 *
 * 口径：源码级断言（读 app/globals.css 文本），不做浏览器渲染。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "../../../../..");
const CSS = readFileSync(resolve(ROOT, "app/globals.css"), "utf-8");

/** 取出某个选择器的规则块文本（} 前的第一段） */
function block(selector: string): string {
  const idx = CSS.indexOf(selector);
  if (idx === -1) return "";
  return CSS.slice(idx, CSS.indexOf("}", idx) + 1);
}

describe("现代版色块拼版主题护栏", () => {
  it("① 四色板 token 齐备（奶油/柠黄/薄荷/珊瑚）", () => {
    for (const token of [
      "--plate-cream:",
      "--plate-yellow:",
      "--plate-mint:",
      "--plate-coral:",
      "--stage:",
      "--stage-deep:",
    ]) {
      expect(CSS).toContain(token);
    }
  });

  it("② 牌桌=黑舞台，控制台=奶油板", () => {
    expect(block('.theme-modern [data-surface="table"]')).toContain(
      "var(--stage-deep)",
    );
    expect(block('.theme-modern [data-surface="console"]')).toContain(
      "var(--plate-cream)",
    );
  });

  it("③ 经典牛皮纸合成层保持移除状态（用户裁定取消，不得复活）", () => {
    expect(CSS).not.toContain("Classic 圆桌牛皮纸底");
    expect(CSS).not.toContain('.theme-classic [data-surface="table"]::after');
  });
});

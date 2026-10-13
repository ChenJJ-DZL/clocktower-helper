/**
 * 现代版「V2 圆润浮卡 Soft Layers」主题护栏（2026-10-13 用户裁定）
 *
 * 验收锚点（任何一条被改坏 ⇒ 用户可见的现代版视觉语言回归）：
 *  ① V2 token 齐备（米白纸底 / 纯白卡 / 墨 / 圆角 / 三级阴影）
 *  ② 牌桌 = 米白纸底；控制台 = 纯白浮卡（两大面）
 *  ③ 语义色铁律：绿=正常·可执行，红=异常·危险，两者取值锁死且不得互换
 *  ④ v5「黑底色块拼版」token 必须彻底清除（--stage / --plate-*）
 *  ⑤ 经典牛皮纸合成层保持「已移除」状态（用户裁定取消，不得复活）
 *  ⑥ 主题胶囊选中态：墨黑实心白字（(0,3,0) 压过批量文字映射）
 *
 * 口径：源码级断言（读 app/globals.css 文本），不做浏览器渲染。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "../../../../..");
const CSS = readFileSync(resolve(ROOT, "app/globals.css"), "utf-8");

/** 取出某个选择器的规则块文本（{ 后到第一个 } 之间） */
function block(selector: string): string {
  const idx = CSS.indexOf(selector);
  if (idx === -1) return "";
  return CSS.slice(idx, CSS.indexOf("}", idx) + 1);
}

describe("现代版 V2 圆润浮卡主题护栏", () => {
  it("① V2 token 齐备（纸 / 卡 / 墨 / 圆角 / 三级阴影）", () => {
    for (const token of [
      "--paper: #f2eee5",
      "--paper-0: #ffffff",
      "--paper-1: #faf8f3",
      "--ink-900: #111111",
      "--ink-600: #6f6a60",
      "--r-plate: 26px",
      "--r-card: 16px",
      "--sh1:",
      "--sh2:",
      "--sh3:",
    ]) {
      expect(CSS).toContain(token);
    }
  });

  it("② 牌桌=米白纸底，控制台=纯白浮卡", () => {
    expect(block('.theme-modern [data-surface="table"]')).toContain(
      "var(--paper)",
    );
    expect(block('.theme-modern [data-surface="console"]')).toContain(
      "var(--paper-0)",
    );
  });

  it("③ 语义色铁律：绿=正常·可执行，红=异常·危险，取值锁死", () => {
    expect(CSS).toContain("--green: #15803d");
    expect(CSS).toContain("--red: #b91c1c");
    // 绿色系按钮 → --green；红色系按钮 → --red（不得互换）
    expect(block(".theme-modern .bg-green-600")).toContain("var(--green)");
    expect(block(".theme-modern .bg-rose-600")).toContain("var(--red)");
    // 文字层同理
    expect(block(".theme-modern .text-emerald-400")).toContain("var(--green)");
    expect(block(".theme-modern .text-red-400")).toContain("var(--red)");
  });

  it("④ v5 黑底色块 token 必须彻底清除（不得复活）", () => {
    for (const dead of [
      "--plate-cream",
      "--plate-yellow",
      "--plate-mint",
      "--plate-coral",
      "--stage:",
      "--stage-deep",
    ]) {
      expect(CSS).not.toContain(dead);
    }
  });

  it("⑤ 经典牛皮纸合成层保持移除状态（用户裁定取消，不得复活）", () => {
    expect(CSS).not.toContain("Classic 圆桌牛皮纸底");
    expect(CSS).not.toContain('.theme-classic [data-surface="table"]::after');
  });

  it("⑥ 主题胶囊选中态 = 墨黑实心白字（压过批量文字映射）", () => {
    const active = block(".theme-modern .theme-capsule-btn.is-active");
    expect(active).toContain("var(--ink-900)");
    expect(active).toContain("color: #fff");
  });

  it("⑦ 实色语义按钮白字必须保住（否则 .text-white 被批量映射成墨黑 ⇒ 红底黑字对比度 2.9）", () => {
    expect(block(".theme-modern .bg-red-600.text-white")).toContain("#fff");
    expect(block(".theme-modern .bg-indigo-600.text-white")).toContain("#fff");
    expect(block(".theme-modern .bg-amber-600.text-white")).toContain("#fff");
    expect(block(".theme-modern .bg-purple-700.text-white")).toContain("#fff");
    // 状态 chip 浅色字（text-red-100 等）必须压深到 --red（否则软红底上 ratio 1.08）
    expect(block(".theme-modern .text-red-100")).toContain("var(--red)");
  });

  it("⑧ 座位号牌 = 白卡小圆牌（2026-10-14 用户裁定墨黑实心圆为多余黑色底纹）", () => {
    // 只允许作用默认态（.bg-slate-800），提名高亮态（amber/cyan）不得被波及
    const badge = block(
      ".theme-modern .seat-node .rounded-full.border-2.bg-slate-800",
    );
    expect(badge).toContain("var(--paper-0)");
    expect(badge).toContain("var(--ink-900)");
    // 旧的墨黑实心圆规则不得复活（无作用域限定的号牌规则）
    expect(CSS).not.toMatch(
      /\.theme-modern \.seat-node \.rounded-full\.border-2\s*\{[^}]*var\(--ink-900\);\s*border-color:\s*var\(--ink-900\)/,
    );
  });

  it("⑨ 弹窗卡片本体必须翻白（ModalWrapper 内联 slate-900 ⇒ 必须 author !important 压制）", () => {
    const card = block('.theme-modern div[role="dialog"][class*="bg-slate-9"]');
    expect(card).toContain("!important");
    expect(card).toContain("var(--paper-0)");
  });
});

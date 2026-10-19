/**
 * 座位徽标白字护栏（2026-10-19 用户反馈）
 * ==================================================================
 * 现象：现代 UI 下「镜像双子」徽标（bg-red-800 + text-white）文字与底色过近。
 * 根因：`.theme-modern .text-white { color: var(--ink-900) }` 全站压深；
 *   而「实色底保白字」白名单只**枚举**了 red-500/600 等档位，
 *   漏掉 red-700/800、purple-800、pink-600、cyan-600、amber-800 ⇒ 深底深字。
 * 修法：改为**结构判据**——`.seat-token` 内凡同时带 `bg-*` 与 `text-white`
 *   的元素一律白字（特异性 0,4,0 > 0,2,0，无需 !important）。
 *
 * 实测（temp/contrast_probe.mjs，真实级联 + WCAG 对比度）：
 *   镜像双子 现代 8.36 / 经典 7.95；12 类徽标 0 个低于 3.0。
 *
 * 本护栏钉住：规则存在、白字、位于 .seat-token 作用域内（不污染全站）。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../../../..");
const CSS = readFileSync(resolve(ROOT, "app/globals.css"), "utf-8");

describe("座位徽标白字契约", () => {
  it("① 存在「seat-token 内 bg-* + text-white ⇒ 白字」的结构判据", () => {
    // 允许属性选择器的引号写法差异
    const ruleRe =
      /\.theme-modern \.seat-token \[class\*=["']bg-["']\]\[class\*=["']text-white["']\]\s*\{([^}]*)\}/;
    const m = CSS.match(ruleRe);
    expect(m, "缺少座位徽标白字规则（深底徽标会再次变成深字）").toBeTruthy();
    expect(m![1]).toMatch(/color:\s*#fff/);
  });

  it("② 全站 text-white → 墨色 的映射仍在（说明该规则确有必要且优先级成立）", () => {
    expect(CSS).toMatch(/\.theme-modern \.text-white,[\s\S]{0,200}color:\s*var\(--ink-900\)/);
  });

  it("③ 规则作用域限定在 .seat-token 内（不外溢到全站按钮）", () => {
    const idx = CSS.indexOf('.theme-modern .seat-token [class*="bg-"]');
    expect(idx).toBeGreaterThan(-1);
    // 选择器必须以 .theme-modern .seat-token 开头，禁止写成裸 [class*=...]
    const selectorStart = CSS.lastIndexOf("*/", idx) > -1 ? idx : idx;
    expect(CSS.slice(selectorStart - 2, idx + 40)).toContain(".theme-modern .seat-token");
  });
});

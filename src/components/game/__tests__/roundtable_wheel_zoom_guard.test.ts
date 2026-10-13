/**
 * 🔒 RoundTable 滚轮缩放契约（源码级防漂移）
 *
 * ⭐ 缺陷背景（2026-10-13 用户报告 + Playwright 实测复现）：
 *   「选择完传奇角色/旅行者后，整个 UI 缩小到很小的比例」。
 *
 *   根因：ModalWrapper（传奇/旅行者选人弹窗）虽 portal 到
 *   `scale-layout-modal-root`，但 **wheel 事件沿 React 组件树（而非 DOM 树）
 *   冒泡**，钻进 RoundTable 的 onWheel ⇒ 用户在弹窗里滚动 15 人列表时
 *   每格滚轮都在 `scale -= deltaY*0.002`，滚到底被钳在 0.5 下限
 *   （实测：弹窗内滚 10 格，座位 112px→56px、中央面板 522px→266px）。
 *
 *   修复（RoundTable.handleWheel）两条铁律，本测试以源码级断言钉死：
 *     ① 事件源在弹窗内（closest('[role="dialog"]')）⇒ 直接放行；
 *     ② 仅 Ctrl/⌘ 修饰键按下才缩放（普通滚轮/触控板双指滑动不误触）。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = readFileSync(
  join(__dirname, "../board/RoundTable.tsx"),
  "utf8"
);

// 提取 handleWheel 函数体（从声明到下一个同级函数声明之前）
const wheelFn = (() => {
  const start = SRC.indexOf("const handleWheel");
  expect(start, "RoundTable.tsx 必须存在 handleWheel").toBeGreaterThan(-1);
  const end = SRC.indexOf("const handleResetView", start);
  return SRC.slice(start, end > start ? end : start + 3000);
})();

describe("RoundTable 滚轮缩放契约（防「弹窗滚动 ⇒ 全桌缩小」回归）", () => {
  it("① handleWheel 必须先拦截弹窗内滚轮（portal 事件沿 React 树冒泡）", () => {
    expect(wheelFn).toMatch(/closest\(\s*['"`]\[role="dialog"\]['"`]\s*\)/);
  });

  it("② 弹窗拦截必须在缩放逻辑之前（先 return 再 setScale）", () => {
    const guardPos = wheelFn.indexOf('closest(\'[role="dialog"]\')');
    const scalePos = wheelFn.indexOf("setScale");
    expect(guardPos).toBeGreaterThan(-1);
    expect(scalePos).toBeGreaterThan(guardPos);
  });

  it("③ 普通（无修饰键）滚轮禁止缩放：必须检查 ctrlKey/metaKey", () => {
    expect(wheelFn).toMatch(/!\s*e\.ctrlKey\s*&&\s*!\s*e\.metaKey/);
  });

  it("④ preventDefault 只能在两道闸门之后（不破坏弹窗原生滚动）", () => {
    const guardPos = wheelFn.indexOf('closest(\'[role="dialog"]\')');
    const modPos = wheelFn.search(/!\s*e\.ctrlKey\s*&&\s*!\s*e\.metaKey/);
    const pdPos = wheelFn.indexOf("preventDefault");
    expect(pdPos).toBeGreaterThan(guardPos);
    expect(pdPos).toBeGreaterThan(modPos);
  });

  it("⑤ 缩放上下限钳制保留（0.5 ~ 2.5）", () => {
    expect(wheelFn).toMatch(/minScale\s*=\s*0\.5/);
    expect(wheelFn).toMatch(/maxScale\s*=\s*2\.5/);
  });
});

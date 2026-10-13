/**
 * 🔒 暮色面板（TwilightPanel）· 全屏「技能确认」范式护栏（源码级）
 *
 * 用户要求（2026-10-13）：暮色的旅行者弹窗大小与 UI 缩放，要参考其他角色
 *   「技能确认」环节的**全屏弹窗 + 大号文字**，让小屏设备更易操作。
 *
 * 范式锚点（与 NightActionConfirmModal 同一套）：
 *   ① ModalWrapper `size="fullscreen90"` + `widthRatio 0.98` + `maxWidthPx 1560`
 *   ② `AdaptiveSeatGrid` + `SEAT_CARD_FONT`（列数/卡高/cqi 字号按人数自适应，触控友好）
 *   ③ 大号设计字号：唤醒 text-3xl sm:text-4xl / 能力 text-xl sm:text-2xl
 *   ④ 流程强制阶段：`hideClose` + 禁遮罩关闭（唯一出口 =「暮色结束，入夜」）
 *   ⑤ E2E 文案锚点逐字保留（twilight_traveler.spec.ts 依赖）
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(join(__dirname, "../TwilightPanel.tsx"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("TwilightPanel 全屏技能确认范式", () => {
  it("① 走 ModalWrapper fullscreen90 + 满宽（widthRatio/maxWidthPx）", () => {
    expect(src).toContain("<ModalWrapper");
    expect(src).toContain('size="fullscreen90"');
    expect(src).toContain("widthRatio={0.98}");
    expect(src).toContain("maxWidthPx={1560}");
  });

  it("② 选人网格用 AdaptiveSeatGrid + SEAT_CARD_FONT（触控友好）", () => {
    expect(src).toContain("<AdaptiveSeatGrid");
    expect(src).toContain("SEAT_CARD_FONT.primary");
    expect(src).toContain("SEAT_CARD_FONT.tertiary");
    // 禁止退回到固定 5 列小按钮
    expect(src).not.toContain("grid-cols-5");
  });

  it("③ 大号设计字号：唤醒 text-3xl sm:text-4xl、能力 text-xl sm:text-2xl", () => {
    expect(src).toContain("text-3xl sm:text-4xl font-black");
    expect(src).toContain("text-xl sm:text-2xl");
    // 说书人操作提示不得缩回 text-sm
    expect(src).not.toMatch(/说书人操作[\s\S]{0,80}text-sm/);
  });

  it("④ 流程强制阶段：hideClose + 禁遮罩关闭（无死 ✕、无点背景溜走）", () => {
    expect(src).toContain("hideClose");
    expect(src).toContain("closeOnOverlayClick={false}");
  });

  it("⑤ E2E 文案锚点逐字保留", () => {
    for (const anchor of [
      "🌆 暮色",
      "唤醒：",
      "步骤 ",
      "选择目标玩家",
      "已选 ",
      "暮色结束，入夜",
    ]) {
      expect(src, `文案锚点「${anchor}」必须保留`).toContain(anchor);
    }
  });
});

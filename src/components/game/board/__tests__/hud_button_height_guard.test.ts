/**
 * 圆桌中央 HUD：传奇角色按钮与旅行者按钮等高契约（2026-10-13 用户反馈）
 * ==================================================================
 * 用户反馈：传奇角色按钮（两行结构）明显高于旅行者按钮（单行结构）。
 * 修复：两按钮统一 `min-h-[68px]`。
 * 本护栏以源码级断言钉住：两处按钮 className 均须携带 min-h-[68px]，
 * 缺任一处即红（防止后续改动再次让两按钮高度分叉）。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = readFileSync(
  resolve(__dirname, "../TableCenterHUD.tsx"),
  "utf-8"
);

describe("TableCenterHUD 传奇/旅行者按钮等高契约", () => {
  it("① 传奇角色按钮携带 min-h-[68px]", () => {
    // 锚定传奇按钮特征：flex items-center gap-2 开头 + 后续 min-h
    expect(SRC).toMatch(
      /flex items-center gap-2 px-4 py-2 min-h-\[68px\] rounded-2xl border-2/
    );
  });

  it("② 旅行者按钮携带 min-h-[68px] 且 flex 居中", () => {
    expect(SRC).toMatch(
      /flex items-center justify-center px-4 py-2 min-h-\[68px\] rounded-2xl border-2/
    );
  });

  it("③ 两按钮 padding 基线一致（px-4 py-2），防止只改高度不改内距造成视觉失衡", () => {
    const matches = SRC.match(/px-4 py-2 min-h-\[68px\]/g) ?? [];
    expect(matches.length).toBe(2);
  });
});

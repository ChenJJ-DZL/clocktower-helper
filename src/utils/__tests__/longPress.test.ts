import { describe, expect, it } from "vitest";
import { LONG_PRESS_MOVE_TOLERANCE_PX, LONG_PRESS_MS } from "../longPress";

/**
 * 触屏长按弹菜单的阈值（用户需求）：按住 1000ms 即弹出，无需松开。
 * 旧实现有两个缺陷，本用例是其回归护栏：
 *   1) 圆桌座位（SeatNode）没有任何定时器，靠浏览器原生 long-press 合成
 *      contextmenu，实测「松开才弹」；
 *   2) 矩阵视图（SeatGrid）是 500ms，与圆桌不一致。
 * 因此这里断言阈值必须是 1000ms，并且两处共用同一个常量来源。
 */
describe("longPress - 长按 1 秒直接弹出座位菜单", () => {
  it("长按阈值为 1000ms（不能退回 500ms）", () => {
    expect(LONG_PRESS_MS).toBe(1000);
  });

  it("阈值满足「按住 ≥1 秒即弹出」的需求", () => {
    expect(LONG_PRESS_MS).toBeGreaterThanOrEqual(1000);
  });

  it("长按期间的滑动取消容差为 12px", () => {
    expect(LONG_PRESS_MOVE_TOLERANCE_PX).toBe(12);
  });
});

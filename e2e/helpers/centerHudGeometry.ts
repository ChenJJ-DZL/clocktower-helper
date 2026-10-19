import type { Page } from "@playwright/test";

/**
 * 中央面板 vs 座位环 · 几何量测 helper（E2E 用）
 * ==================================================================
 * 判据（与 temp/measure_ui.mjs 一致）：
 *   把座位环拟合成椭圆 —— rx/ry 取 `max|dx| / cos(π/N)`。
 *   ⚠️ 不能用「平均 |dx|」：等角度分布的 |cos| 平均值只有 2/π ≈ 0.637，
 *      会把真实半轴低估约 36%（2026-10-19 实测踩过：误判「面板比环还宽」）。
 *
 *   面板四角归一化值 (dx/rx)² + (dy/ry)²：
 *     · < 1.0  ⇒ 不与座位本体相交（座位内沿椭圆）
 *     · < 0.95 ⇒ 留出肉眼可见的安全间隙（本仓库的目标线）
 */

export interface CenterHudGeometry {
  panel: { w: number; h: number };
  ring: { rx: number; ry: number; seatRadius: number };
  /** 四角对「座位中心环」的归一化最大值 */
  maxCornerRing: number;
  /** 四角对「座位内沿环」（中心环减座位半径）的归一化最大值 */
  maxCornerInner: number;
  /** 面板与座位矩形的相交面积列表（>0 即真重叠） */
  overlapSeats: Array<{ id: string | null; area: number }>;
}

export async function measureCenterHud(page: Page): Promise<CenterHudGeometry> {
  return page.evaluate(() => {
    const seatEls = Array.from(document.querySelectorAll(".seat-node"));
    if (seatEls.length === 0) throw new Error("no seats rendered");

    let root: HTMLElement = seatEls[0] as HTMLElement;
    while (
      root.parentElement &&
      !String(root.parentElement.className || "").includes("overflow-hidden")
    ) {
      root = root.parentElement;
    }
    const rootRect = root.getBoundingClientRect();
    const seats = seatEls.map((el) => {
      const r = el.getBoundingClientRect();
      return {
        id: el.getAttribute("data-seat-id"),
        cx: r.left + r.width / 2,
        cy: r.top + r.height / 2,
        w: r.width,
      };
    });
    const cx = rootRect.left + rootRect.width / 2;
    const cy = rootRect.top + rootRect.height / 2;
    const k = Math.cos(Math.PI / seats.length);
    const rx = Math.max(...seats.map((s) => Math.abs(s.cx - cx))) / k;
    const ry = Math.max(...seats.map((s) => Math.abs(s.cy - cy))) / k;
    const seatRadius = seats.reduce((a, s) => a + s.w / 2, 0) / seats.length;

    const panel = document.querySelector(".compass-ring");
    if (!panel) throw new Error("no .compass-ring panel");
    const pr = panel.getBoundingClientRect();

    const norm = (px: number, py: number, ax: number, ay: number) =>
      Math.pow((px - cx) / ax, 2) + Math.pow((py - cy) / ay, 2);
    const corners: Array<[number, number]> = [
      [pr.left, pr.top],
      [pr.right, pr.top],
      [pr.left, pr.bottom],
      [pr.right, pr.bottom],
    ];

    const overlaps = seats
      .map((s) => {
        const ox = Math.max(
          0,
          Math.min(pr.right, s.cx + s.w / 2) - Math.max(pr.left, s.cx - s.w / 2)
        );
        const oy = Math.max(
          0,
          Math.min(pr.bottom, s.cy + s.w / 2) - Math.max(pr.top, s.cy - s.w / 2)
        );
        return { id: s.id, area: Math.round(ox * oy) };
      })
      .filter((x) => x.area > 0);

    return {
      panel: { w: Math.round(pr.width), h: Math.round(pr.height) },
      ring: {
        rx: Math.round(rx),
        ry: Math.round(ry),
        seatRadius: Math.round(seatRadius),
      },
      maxCornerRing: Math.max(...corners.map(([x, y]) => norm(x, y, rx, ry))),
      maxCornerInner: Math.max(
        ...corners.map(([x, y]) => norm(x, y, rx - seatRadius, ry - seatRadius))
      ),
      overlapSeats: overlaps,
    };
  });
}

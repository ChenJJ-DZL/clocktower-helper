import { describe, expect, test } from "vitest";
import { computeVoteGrid } from "../voteGrid";

/** 汇总人类可读的行分布，如 7 人 → "4+3" */
function shape(count: number): string {
  return computeVoteGrid(count)
    .rows.map((r) => r.count)
    .join("+");
}

describe("举手表决网格布局", () => {
  test("1~3 人单行铺满", () => {
    expect(shape(1)).toBe("1");
    expect(shape(2)).toBe("2");
    expect(shape(3)).toBe("3");
  });

  test("常见人数：末行空缺最少", () => {
    expect(shape(4)).toBe("4");
    expect(shape(5)).toBe("5");
    expect(shape(6)).toBe("3+3");
    expect(shape(7)).toBe("4+3");
    expect(shape(8)).toBe("4+4");
    expect(shape(9)).toBe("3+3+3");
    expect(shape(10)).toBe("5+5");
    expect(shape(11)).toBe("4+4+3");
    expect(shape(12)).toBe("4+4+4");
    expect(shape(13)).toBe("5+5+3");
    expect(shape(14)).toBe("5+5+4");
    expect(shape(15)).toBe("5+5+5");
  });

  test("列数始终落在 1~5", () => {
    for (let n = 0; n <= 20; n++) {
      const { columns } = computeVoteGrid(n);
      expect(columns).toBeGreaterThanOrEqual(1);
      expect(columns).toBeLessThanOrEqual(5);
    }
  });

  test("行覆盖完整且不重叠", () => {
    for (let n = 0; n <= 20; n++) {
      const { rows } = computeVoteGrid(n);
      const covered = rows.reduce((acc, r) => acc + r.count, 0);
      expect(covered).toBe(n);
      rows.forEach((r, i) => {
        expect(r.start).toBe(
          i === 0 ? 0 : rows[i - 1].start + rows[i - 1].count
        );
      });
    }
  });

  test("每行不超过列数，且末行最空", () => {
    for (let n = 6; n <= 15; n++) {
      const { columns, rows } = computeVoteGrid(n);
      const maxCount = Math.max(...rows.map((r) => r.count));
      expect(maxCount).toBeLessThanOrEqual(columns);
      expect(rows[rows.length - 1].count).toBeLessThanOrEqual(maxCount);
    }
  });

  test("0 人与负数/小数容错", () => {
    expect(computeVoteGrid(0).rows).toEqual([]);
    expect(computeVoteGrid(-3).rows).toEqual([]);
    expect(shape(7.9)).toBe("4+3");
  });
});

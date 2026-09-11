import { describe, expect, it } from "vitest";
import {
  createDeterministicRandom,
  nightInfoSeed,
} from "../deterministicRandom";

describe("确定性随机（夜间提示与结果必须一致）", () => {
  it("同一种子产生完全相同的序列", () => {
    const a = createDeterministicRandom("nightinfo|librarian|3|1");
    const b = createDeterministicRandom("nightinfo|librarian|3|1");
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("不同种子产生不同序列（跨角色/跨夜互不干扰）", () => {
    const a = createDeterministicRandom(nightInfoSeed("librarian", 3, 1));
    const b = createDeterministicRandom(nightInfoSeed("librarian", 3, 2));
    const c = createDeterministicRandom(nightInfoSeed("librarian", 4, 1));
    expect(Array.from({ length: 8 }, () => a())).not.toEqual(
      Array.from({ length: 8 }, () => b())
    );
    expect(Array.from({ length: 8 }, () => a())).not.toEqual(
      Array.from({ length: 8 }, () => c())
    );
  });

  it("取值落在 [0,1) 区间", () => {
    const rng = createDeterministicRandom("x");
    for (let i = 0; i < 500; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

/**
 * 发牌随机源单测（2026-10-20）
 *
 * 事故背景：E2E 里同一个 `SEED` 跑两次阵容完全不同（实测一次涡流局、一次
 * 军团×7 局）。根因是「发牌」与「渲染路径的随机调用」共用全局 `Math.random`，
 * 后者调用次数随渲染批次变化 ⇒ 发牌拿到的序列位置每次不同。
 *
 * 修复 = 发牌改用独立随机源 `nextDealRandom()`（`utils/dealRng.ts`）。
 * 本文件锁三件事：
 *   1. 未注入时行为与 `Math.random` 一致（生产不变）；
 *   2. 注入同 seed ⇒ 序列完全一致（可复现）；
 *   3. 注入**不污染**全局 `Math.random`（渲染路径不受影响）。
 */
import { afterEach, describe, expect, it } from "vitest";
import { nextDealRandom, setDealRng } from "../dealRng";
import { shuffle } from "../quickStartGenerator";

/** 与 `dealRng.ts` 内部同款 LCG，供测试构造「同 seed 同序列」 */
function makeLcg(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

describe("发牌随机源 dealRng", () => {
  afterEach(() => setDealRng(null));

  it("未注入时返回 [0,1) 随机数（等价 Math.random，生产行为不变）", () => {
    setDealRng(null);
    for (let i = 0; i < 20; i++) {
      const v = nextDealRandom();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("注入同一 seed ⇒ 两次序列完全一致（可复现）", () => {
    setDealRng(makeLcg(999));
    const a = [nextDealRandom(), nextDealRandom(), nextDealRandom()];
    setDealRng(makeLcg(999));
    const b = [nextDealRandom(), nextDealRandom(), nextDealRandom()];
    expect(a).toEqual(b);
  });

  it("不同 seed ⇒ 序列不同（不是恒定值）", () => {
    setDealRng(makeLcg(1));
    const a = [nextDealRandom(), nextDealRandom()];
    setDealRng(makeLcg(2));
    const b = [nextDealRandom(), nextDealRandom()];
    expect(a).not.toEqual(b);
  });

  it("🔴 注入不污染全局 Math.random（渲染路径的随机不被改写）", () => {
    const orig = Math.random;
    const before = orig();
    setDealRng(() => 0.5);
    expect(nextDealRandom()).toBe(0.5);
    expect(Math.random).toBe(orig); // 仍是原生实现
    expect(typeof before).toBe("number");
  });

  it("shuffle 走发牌随机源：同 seed ⇒ 同排列，不同 seed ⇒ 不同排列", () => {
    const pool = Array.from({ length: 11 }, (_, i) => i);
    setDealRng(makeLcg(999));
    const s1 = shuffle(pool);
    setDealRng(makeLcg(999));
    const s2 = shuffle(pool);
    setDealRng(makeLcg(1000));
    const s3 = shuffle(pool);

    expect(s1).toEqual(s2);
    expect(s1).not.toEqual(s3);
    expect([...s1].sort((x, y) => x - y)).toEqual(pool); // 元素守恒
  });
});

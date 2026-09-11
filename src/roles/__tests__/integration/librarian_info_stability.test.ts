import { describe, expect, it } from "vitest";
import {
  createDeterministicRandom,
  nightInfoSeed,
} from "../../core/deterministicRandom";
import {
  generateFakeInfo,
  generateRealInfo,
} from "../../new_engine/librarian.ability";

// 7 人局·暗流涌动 简化座位（含 2 名外来者，保证随机分支被走到）
const seats: any[] = [
  { id: 0, isDead: false, role: { id: "drunk", name: "酒鬼", type: "outsider" } },
  { id: 1, isDead: false, role: { id: "saint", name: "圣徒", type: "outsider" } },
  {
    id: 2,
    isDead: false,
    role: { id: "washerwoman", name: "洗衣妇", type: "townsfolk" },
  },
  { id: 3, isDead: false, role: { id: "chef", name: "厨师", type: "townsfolk" } },
  { id: 4, isDead: false, role: { id: "imp", name: "小恶魔", type: "demon" } },
  { id: 5, isDead: false, role: { id: "baron", name: "男爵", type: "minion" } },
];

const seedFor = (actorId: number, night: number) =>
  nightInfoSeed("librarian", actorId, night);

describe("图书管理员：提示预演与实际执行必须给出同一份信息（回归）", () => {
  it("醉酒/中毒的假信息在同种子下完全一致", () => {
    const a = generateFakeInfo(
      seats,
      0,
      undefined,
      createDeterministicRandom(seedFor(0, 1))
    );
    const b = generateFakeInfo(
      seats,
      0,
      undefined,
      createDeterministicRandom(seedFor(0, 1))
    );
    expect(b).toEqual(a);
  });

  it("真实信息在同种子下完全一致", () => {
    const a = generateRealInfo(seats, 0, createDeterministicRandom(seedFor(0, 1)));
    const b = generateRealInfo(seats, 0, createDeterministicRandom(seedFor(0, 1)));
    expect(b).toEqual(a);
  });

  it("不同夜次会重新随机（不会整局锁死同一个答案）", () => {
    const results = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((n) =>
        JSON.stringify(
          generateRealInfo(seats, 0, createDeterministicRandom(seedFor(0, n)))
        )
      )
    );
    expect(results.size).toBeGreaterThan(1);
  });
});

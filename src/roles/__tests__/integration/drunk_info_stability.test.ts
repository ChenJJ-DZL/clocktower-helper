import { describe, expect, it } from "vitest";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import {
  createDeterministicRandom,
  nightInfoSeed,
} from "../../core/deterministicRandom";
import { drunkAbility, selectFakeRole } from "../../new_engine/drunk.ability";

const seat = (id: number, roleId: string, type: string) => ({
  id,
  playerName: `P${id + 1}`,
  isDead: false,
  isAlive: true,
  role: { id: roleId, name: roleId, type },
  statusEffects: [],
});

// 5 人局简化座位：4号是酒鬼，1/2/3号在场镇民
const seats = () => [
  seat(0, "poisoner", "minion"),
  seat(1, "soldier", "townsfolk"),
  seat(2, "chef", "townsfolk"),
  seat(3, "washerwoman", "townsfolk"),
  seat(4, "drunk", "outsider"),
];

const mkCtx = (nightCount: number, storytellerInput?: any): MiddlewareContext => ({
  snapshot: {
    nightCount,
    gamePhase: nightCount === 1 ? "firstNight" : "night",
    seats: seats(),
    statusEffects: {},
  },
  actionNode: {
    seatId: 4,
    roleId: "drunk",
    roleName: "酒鬼",
    priority: 0,
    isFirstNightOnly: false,
    abilityId: "drunk_first_night_ability",
    wakeMessage: "",
    firstNightPriority: null,
    otherNightPriority: null,
    targetIds: [],
    processed: false,
    success: false,
    meta: {},
  },
  targetIds: [],
  storytellerInput,
  meta: {},
  aborted: false,
});

const seedFor = (actorId: number, night: number) =>
  nightInfoSeed("drunk", actorId, night);

const runCalculate = async (nightCount: number, storytellerInput?: any) => {
  const ctx = await drunkAbility.calculate[0](mkCtx(nightCount, storytellerInput));
  return ctx.meta.fakeRole as { id: string; name: string; type: string };
};

describe("酒鬼：提示预演与实际执行必须给出同一个伪装身份（回归）", () => {
  it("同一夜重复计算（预演 / 执行）选中的镇民身份完全一致", async () => {
    const a = await runCalculate(1);
    const b = await runCalculate(1);
    expect(b).toEqual(a);
    expect(["soldier", "chef", "washerwoman"]).toContain(a.id);
  });

  it("不同夜次会重新随机（跨夜不会整局锁死同一个伪装身份）", async () => {
    const seen = new Set<string>();
    for (let n = 1; n <= 12; n++) {
      seen.add(JSON.stringify(await runCalculate(n)));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("说书人显式指定 fakeRole 时不参与随机", async () => {
    const fakeRole = { id: "butler", name: "管家", type: "townsfolk" };
    const a = await runCalculate(1, { fakeRole });
    const b = await runCalculate(1, { fakeRole });
    expect(b).toEqual(a);
    expect(a).toEqual(fakeRole);
  });

  it("底层 selectFakeRole：同种子一致，跨夜仍随机", () => {
    const s = seats();
    const a = selectFakeRole(s, 4, undefined, createDeterministicRandom(seedFor(4, 1)));
    const b = selectFakeRole(s, 4, undefined, createDeterministicRandom(seedFor(4, 1)));
    expect(b).toEqual(a);

    const seen = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) =>
        JSON.stringify(
          selectFakeRole(s, 4, undefined, createDeterministicRandom(seedFor(4, n)))
        )
      )
    );
    expect(seen.size).toBeGreaterThan(1);
  });
});

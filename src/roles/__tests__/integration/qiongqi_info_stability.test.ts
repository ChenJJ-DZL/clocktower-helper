import { describe, expect, it } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import {
  createDeterministicRandom,
  nightInfoSeed,
} from "../../core/deterministicRandom";
import { pickRandomAlive, qiongqiAbility } from "../../new_engine/qiongqi.ability";

// 穷奇：每夜选择一名玩家死亡。种子 = (角色id, 行动者座位, 夜次)
const seedFor = (actorId: number, night: number) =>
  nightInfoSeed("qiongqi", actorId, night);

const ROLE_NAMES: Record<string, string> = {
  qiongqi: "穷奇",
  saint: "圣徒",
  baron: "男爵",
  empath: "共情者",
  chef: "厨师",
};

function seat(id: number, roleId: string, type: string, dead = false) {
  return {
    id,
    playerName: `P${id + 1}`,
    isDead: dead,
    isAlive: !dead,
    role: { id: roleId, name: ROLE_NAMES[roleId] ?? roleId, type },
    statusEffects: [] as Array<{ type: string }>,
  };
}

/** 最小座位集：穷奇 + 1 名外来者（活尸目标）+ 3 名存活玩家 */
function makeSeats() {
  return [
    seat(0, "qiongqi", "demon"),
    seat(1, "saint", "outsider"),
    seat(2, "baron", "minion"),
    seat(3, "empath", "townsfolk"),
    seat(4, "chef", "townsfolk"),
  ];
}

function makeCtx(opts: { preview?: boolean } = {}) {
  const ctx: MiddlewareContext = {
    snapshot: {
      nightCount: 2,
      gamePhase: "night",
      // 今天白天有外来者死亡 → 活尸分支（会额外随机杀死一名玩家）
      outsiderDiedToday: true,
      seats: makeSeats(),
      statusEffects: {},
    },
    actionNode: {
      seatId: 0,
      roleId: "qiongqi",
      roleName: "穷奇",
      priority: 0,
      isFirstNightOnly: false,
      abilityId: "qiongqi_night_kill",
      wakeMessage: "",
      firstNightPriority: null,
      otherNightPriority: 46,
      targetIds: [1],
      processed: false,
      success: false,
      meta: {},
    },
    targetIds: [1],
    storytellerInput: {},
    meta: {},
    aborted: false,
    preview: !!opts.preview,
  };
  return ctx;
}

const pipe = (a: any) => ({
  preCheck: a.preCheck,
  calculate: a.calculate,
  stateUpdate: a.stateUpdate,
  postProcess: a.postProcess,
});

describe("穷奇：活尸分支的额外死者必须稳定（回归）", () => {
  it("同种子下额外死者完全一致（排除目标与穷奇本人）", () => {
    const seats = makeSeats();
    const a = pickRandomAlive(seats, new Set([1, 0]), createDeterministicRandom(seedFor(0, 2)));
    const b = pickRandomAlive(seats, new Set([1, 0]), createDeterministicRandom(seedFor(0, 2)));
    expect(b?.id).toBe(a?.id);
    expect([2, 3, 4]).toContain(a?.id);
  });

  it("不同夜次的种子会重新随机", () => {
    const seats = makeSeats();
    const ids = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map(
        (n) =>
          pickRandomAlive(seats, new Set([1, 0]), createDeterministicRandom(seedFor(0, n)))?.id
      )
    );
    expect(ids.size).toBeGreaterThan(1);
  });

  it("全部候选被排除时返回 null", () => {
    const seats = makeSeats();
    expect(
      pickRandomAlive(
        seats,
        new Set(seats.map((s) => s.id)),
        createDeterministicRandom(seedFor(0, 2))
      )
    ).toBeNull();
  });

  it("预览只跑 calculate（不产生额外死者），重复完整执行选中同一名额外死者", async () => {
    const preview = await runFullAbilityPipeline(
      pipe(qiongqiAbility),
      makeCtx({ preview: true })
    );
    // 预览不执行 stateUpdate：不会选出额外死者
    expect(preview.meta.qiongqiResult).toBeUndefined();

    const first = await runFullAbilityPipeline(pipe(qiongqiAbility), makeCtx());
    const second = await runFullAbilityPipeline(pipe(qiongqiAbility), makeCtx());

    const firstRecord = first.meta.qiongqiResult as any;
    const secondRecord = second.meta.qiongqiResult as any;
    expect(firstRecord.aliveDead).toBe(true);
    expect(secondRecord.extraTargetId).toBe(firstRecord.extraTargetId);
    expect([2, 3, 4]).toContain(firstRecord.extraTargetId);
  });
});

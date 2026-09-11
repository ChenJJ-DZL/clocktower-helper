import { describe, expect, it } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import {
  createDeterministicRandom,
  nightInfoSeed,
} from "../../core/deterministicRandom";
import { lizAbility, pickSuccessor } from "../../new_engine/liz.ability";

// 利兹：每夜可选死亡并传位。种子 = (角色id, 行动者座位, 夜次)
const seedFor = (actorId: number, night: number) =>
  nightInfoSeed("liz", actorId, night);

const ROLE_NAMES: Record<string, string> = {
  liz: "利兹",
  baron: "男爵",
  poisoner: "投毒者",
  empath: "共情者",
};

function seat(id: number, roleId: string, type: string, isAlive = true) {
  return {
    id,
    playerName: `P${id + 1}`,
    isDead: !isAlive,
    isAlive,
    role: { id: roleId, name: ROLE_NAMES[roleId] ?? roleId, type },
    statusEffects: [] as Array<{ type: string }>,
  };
}

/** 最小座位集：利兹 + 2 名存活爪牙 + 1 名镇民 */
function makeSeats() {
  return [
    seat(0, "liz", "demon"),
    seat(1, "baron", "minion"),
    seat(2, "poisoner", "minion"),
    seat(3, "empath", "townsfolk"),
  ];
}

function makeCtx(opts: { preview?: boolean; nightCount?: number } = {}) {
  const ctx: MiddlewareContext = {
    snapshot: {
      nightCount: opts.nightCount ?? 2,
      gamePhase: "night",
      seats: makeSeats(),
      statusEffects: {},
    },
    actionNode: {
      seatId: 0,
      roleId: "liz",
      roleName: "利兹",
      priority: 0,
      isFirstNightOnly: false,
      abilityId: "liz_night_ability",
      wakeMessage: "",
      firstNightPriority: null,
      otherNightPriority: 45,
      targetIds: [],
      processed: false,
      success: false,
      meta: {},
    },
    targetIds: [],
    // 说书人选择「利兹死亡」→ 随机一名存活爪牙继任
    storytellerInput: { lizDies: true },
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

describe("利兹：提示预演与实际执行必须选中同一名继任爪牙（回归）", () => {
  it("同种子下继任者完全一致", () => {
    const minions = makeSeats().filter((s) => s.role.type === "minion");
    const a = pickSuccessor(minions, createDeterministicRandom(seedFor(0, 2)));
    const b = pickSuccessor(minions, createDeterministicRandom(seedFor(0, 2)));
    expect(b?.id).toBe(a?.id);
    expect(a?.id === 1 || a?.id === 2).toBe(true);
  });

  it("不同夜次的种子会重新随机", () => {
    const minions = makeSeats().filter((s) => s.role.type === "minion");
    const ids = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map(
        (n) => pickSuccessor(minions, createDeterministicRandom(seedFor(0, n)))?.id
      )
    );
    expect(ids.size).toBeGreaterThan(1);
  });

  it("预览（只跑 calculate）与完整执行得出同一名继任者", async () => {
    const preview = await runFullAbilityPipeline(
      pipe(lizAbility),
      makeCtx({ preview: true })
    );
    const executed = await runFullAbilityPipeline(pipe(lizAbility), makeCtx());

    const previewSuccessor = (preview.meta.abilityResult as any)?.successorId;
    expect(executed.meta.abilityResult).toEqual(preview.meta.abilityResult);
    expect((executed.meta.lizResult as any)?.successorId).toBe(previewSuccessor);
    expect([1, 2]).toContain(previewSuccessor);
  });
});

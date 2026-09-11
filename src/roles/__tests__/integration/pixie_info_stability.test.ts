import { describe, expect, it } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import {
  createDeterministicRandom,
  nightInfoSeed,
} from "../../core/deterministicRandom";
import { pickPixieRole, pixieAbility } from "../../new_engine/pixie.ability";

// 小精灵：首夜得知一个「在场镇民角色」。种子 = (角色id, 行动者座位, 夜次)
const seedFor = (actorId: number, night: number) =>
  nightInfoSeed("pixie", actorId, night);

const ROLE_NAMES: Record<string, string> = {
  pixie: "小精灵",
  empath: "共情者",
  chef: "厨师",
  imp: "小恶魔",
};

function seat(id: number, roleId: string, type: string, poisoned = false) {
  return {
    id,
    playerName: `P${id + 1}`,
    isDead: false,
    isAlive: true,
    isDrunk: false,
    isPoisoned: poisoned,
    role: { id: roleId, name: ROLE_NAMES[roleId] ?? roleId, type },
    statusEffects: poisoned ? [{ type: "poisoned" }] : [],
  };
}

/** 最小座位集：小精灵自己 + 2 名在场镇民 + 1 名恶魔 */
function makeSeats(poisonedSelf = false) {
  return [
    seat(0, "pixie", "townsfolk", poisonedSelf),
    seat(1, "empath", "townsfolk"),
    seat(2, "chef", "townsfolk"),
    seat(3, "imp", "demon"),
  ];
}

/** 与 pixie.ability 内部一致：在场镇民（排除小精灵自己） */
function inPlayTownsfolk(seats: any[]) {
  return seats
    .filter((s) => s.role?.type === "townsfolk" && s.id !== 0)
    .map((s) => s.role);
}

/** 兜底的不在场镇民池中取两项，用于受干扰分支 */
const outOfPlay = [
  { id: "washerwoman", name: "洗衣妇", type: "townsfolk" },
  { id: "librarian", name: "图书管理员", type: "townsfolk" },
  { id: "investigator", name: "调查员", type: "townsfolk" },
];

function makeCtx(opts: { preview?: boolean; poisoned?: boolean } = {}) {
  const ctx: MiddlewareContext = {
    snapshot: {
      nightCount: 1,
      gamePhase: "firstNight",
      seats: makeSeats(!!opts.poisoned),
      statusEffects: {},
    },
    actionNode: {
      seatId: 0,
      roleId: "pixie",
      roleName: "小精灵",
      priority: 0,
      isFirstNightOnly: true,
      abilityId: "pixie_first_night",
      wakeMessage: "",
      firstNightPriority: 50,
      otherNightPriority: null,
      targetIds: [],
      processed: false,
      success: false,
      meta: {},
    },
    targetIds: [],
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

describe("小精灵：提示预演与实际执行必须告知同一个角色（回归）", () => {
  it("同种子下得知的在场镇民角色完全一致", () => {
    const seats = makeSeats();
    const a = pickPixieRole(
      inPlayTownsfolk(seats),
      outOfPlay,
      true,
      createDeterministicRandom(seedFor(0, 1))
    );
    const b = pickPixieRole(
      inPlayTownsfolk(seats),
      outOfPlay,
      true,
      createDeterministicRandom(seedFor(0, 1))
    );
    expect(b).toEqual(a);
    expect(["empath", "chef"]).toContain(a.id);
  });

  it("受干扰时告知的角色来自不在场池，且同种子下完全一致", () => {
    const a = pickPixieRole(
      inPlayTownsfolk(makeSeats()),
      outOfPlay,
      false,
      createDeterministicRandom(seedFor(0, 1))
    );
    const b = pickPixieRole(
      inPlayTownsfolk(makeSeats()),
      outOfPlay,
      false,
      createDeterministicRandom(seedFor(0, 1))
    );
    expect(b).toEqual(a);
    expect(outOfPlay.map((r) => r.id)).toContain(a.id);
  });

  it("不同夜次的种子会重新随机", () => {
    const seats = makeSeats();
    const ids = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map(
        (n) =>
          pickPixieRole(
            inPlayTownsfolk(seats),
            outOfPlay,
            true,
            createDeterministicRandom(seedFor(0, n))
          ).id
      )
    );
    expect(ids.size).toBeGreaterThan(1);
  });

  it("预览（只跑 calculate）与完整执行告知同一个角色", async () => {
    const preview = await runFullAbilityPipeline(
      pipe(pixieAbility),
      makeCtx({ preview: true })
    );
    const executed = await runFullAbilityPipeline(pipe(pixieAbility), makeCtx());

    expect(executed.meta.abilityResult).toEqual(preview.meta.abilityResult);
    expect((executed.meta.pixieResult as any)?.roleId).toBe(
      (preview.meta.abilityResult as any)?.roleId
    );
    // 正常信息必须是在场镇民
    expect(["empath", "chef"]).toContain(
      (preview.meta.abilityResult as any)?.roleId
    );
  });

  it("中毒时：预览与完整执行告知同一个（不在场的）假角色", async () => {
    const preview = await runFullAbilityPipeline(
      pipe(pixieAbility),
      makeCtx({ preview: true, poisoned: true })
    );
    const executed = await runFullAbilityPipeline(
      pipe(pixieAbility),
      makeCtx({ poisoned: true })
    );

    const previewRoleId = (preview.meta.abilityResult as any)?.roleId;
    expect((executed.meta.abilityResult as any)?.roleId).toBe(previewRoleId);
    expect(["empath", "chef"]).not.toContain(previewRoleId);
  });
});

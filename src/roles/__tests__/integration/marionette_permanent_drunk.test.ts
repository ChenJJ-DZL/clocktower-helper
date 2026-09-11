import { describe, expect, test } from "vitest";
import { abilityPriorityCalculation } from "../../../utils/abilityPriorityMiddleware";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import { marionetteAbility } from "../../new_engine/marionette.ability";

/**
 * 提线木偶「永久醉酒」回归测试
 *
 * 官方依据（钟楼百科·提线木偶）：
 *   "认为自己是提线木偶的玩家所抽取到的善良角色对应的能力不会产生任何效果，
 *    但说书人会假装这些效果生效了。这与酒鬼的运作方式相似。"
 * 官方依据（钟楼百科·酒鬼）：
 *   "酒鬼没有任何能力。…如果那个镇民能够获取信息，说书人可以对酒鬼给出错误的信息作为替代"
 */

const NAMES: Record<string, string> = {
  marionette: "提线木偶",
  imp: "小恶魔",
  empath: "共情者",
  drunk: "酒鬼",
};

function seat(id: number, rid: string, rt: string, extra: Record<string, any> = {}) {
  return {
    id,
    playerName: `P${id + 1}`,
    isDead: false,
    isAlive: true,
    isDrunk: false,
    isPoisoned: false,
    role: { id: rid, name: NAMES[rid] || rid, type: rt },
    charadeRole:
      rid === "marionette"
        ? { id: "empath", name: "共情者", type: "townsfolk" }
        : null,
    statusEffects: [] as any[],
    hasAbilityEvenDead: false,
    ...extra,
  };
}

function ctx(seatId: number, seats: any[]): MiddlewareContext {
  return {
    snapshot: { nightCount: 1, gamePhase: "firstNight", seats, statusEffects: {} },
    actionNode: {
      seatId,
      roleId: "marionette",
      roleName: "提线木偶",
      priority: 19,
      isFirstNightOnly: false,
      abilityId: "marionette_passive",
      wakeMessage: "...",
      firstNightPriority: 19,
      otherNightPriority: null,
      targetIds: [],
      processed: false,
      success: false,
      meta: {},
    },
    targetIds: [],
    meta: {},
    aborted: false,
  } as any;
}

const pipe = (a: any) => ({
  preCheck: a.preCheck,
  calculate: a.calculate,
  stateUpdate: a.stateUpdate,
  postProcess: a.postProcess,
});

/** 跑一遍管道，拿到提线木偶座位的最终状态 */
async function runMarionette(extraSelf: Record<string, any> = {}) {
  const seats = [
    seat(0, "marionette", "minion", extraSelf),
    seat(1, "imp", "demon"),
  ];
  const out = await runFullAbilityPipeline(
    pipe(marionetteAbility),
    ctx(0, seats)
  );
  return out.snapshot.seats as any[];
}

describe("提线木偶：自带永久醉酒（与酒鬼同链路）", () => {
  test("① 管道执行后，提线木偶座位上写入了永久的 drunk 状态效果", async () => {
    const seats = await runMarionette();
    const self = seats.find((s) => s.id === 0);
    const drunk = (self.statusEffects ?? []).find(
      (e: any) => e.type === "drunk"
    );
    expect(drunk).toBeTruthy();
    expect(drunk.permanent).toBe(true);
  });

  test("② 该永久醉酒使能力判定为「不生效」（abilityEffective=false），信息类能力走假信息路径", async () => {
    const seats = await runMarionette();
    const mid = await abilityPriorityCalculation({
      ...ctx(0, seats),
      meta: { abilityEffective: true },
    } as any);
    expect(mid.meta.abilityEffective).toBe(false);
    expect(mid.meta.isDrunk).toBe(true);
    expect(mid.meta.prioritySource).toBe("drunk");
  });

  test("③ 负向对照：没有该效果的提线木偶不会被判定为能力失效", async () => {
    // 直接用一个「裸」提线木偶座位（无 drunk 效果）——这正是修复前的状态
    const bare = await abilityPriorityCalculation(
      ctx(0, [seat(0, "marionette", "minion"), seat(1, "imp", "demon")]) as any
    );
    expect(bare.meta.abilityEffective ?? true).not.toBe(false);
  });

  test("④ 永久醉酒不会污染其他座位", async () => {
    const seats = await runMarionette();
    const imp = seats.find((s) => s.id === 1);
    expect(
      (imp.statusEffects ?? []).some((e: any) => e.type === "drunk")
    ).toBe(false);
  });

  test("⑤ 重复执行不会叠加多个 drunk 效果（幂等）", async () => {
    const seats = await runMarionette();
    const again = await runFullAbilityPipeline(
      pipe(marionetteAbility),
      ctx(0, seats) as any
    );
    const self = (again.snapshot.seats as any[]).find((s) => s.id === 0);
    const drunkEffects = (self.statusEffects ?? []).filter(
      (e: any) => e.type === "drunk"
    );
    expect(drunkEffects.length).toBe(1);
  });

  test("⑥ 酒鬼的既有行为不被回归破坏（仍为永久醉酒 + 能力失效）", async () => {
    const drunkSeat = seat(0, "drunk", "outsider", {
      isDrunk: true,
      charadeRole: { id: "empath", name: "共情者", type: "townsfolk" },
      statusEffects: [
        { type: "drunk", source: "drunk", permanent: true },
      ],
    });
    const mid = await abilityPriorityCalculation(
      ctx(0, [drunkSeat, seat(1, "imp", "demon")]) as any
    );
    expect(mid.meta.abilityEffective).toBe(false);
    expect(mid.meta.prioritySource).toBe("drunk");
  });
});

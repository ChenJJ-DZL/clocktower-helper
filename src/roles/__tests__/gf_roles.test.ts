/**
 * 国风角色官方规则定向测试（Wave D1：穷奇/饕餮/梼杌/鸩）
 * 对齐来源：钟楼百科 wiki（2026-08-15 爬取）
 * 运行：npx vitest run src/roles/__tests__/gf_roles.test.ts
 */
import { describe, expect, it } from "vitest";
import {
  buildAbilityMap,
  buildFullNightOrder,
  simulateNight,
} from "../../utils/invariantTesting";

function mkSeat(
  id: number,
  roleId: string,
  type: string,
  o: Record<string, any> = {}
) {
  return {
    id,
    playerName: `P${id + 1}`,
    role: { id: roleId, name: roleId, type },
    isAlive: true,
    isDead: false,
    isDrunk: false,
    isPoisoned: false,
    statusEffects: [] as any[],
    hasAbilityEvenDead: false,
    ...o,
  };
}

function snapshot(seats: any[], extra: Record<string, any> = {}) {
  return {
    nightCount: 2,
    gamePhase: "night",
    seats,
    statusEffects: {},
    deadThisNight: [],
    todayExecutedId: null,
    lastDuskExecution: null,
    ...extra,
  };
}

async function runNight(snap: any, pickTargets?: any) {
  const abilityMap = buildAbilityMap();
  const fullNightOrder = buildFullNightOrder();
  return simulateNight(snap, {
    nightCount: snap.nightCount,
    fullNightOrder,
    abilityMap,
    seed: 7,
    pickTargets,
  });
}

describe("Wave D1 国风角色官方规则", () => {
  it("穷奇：白天有外来者死亡 → 目标活尸 + 额外一名玩家死亡", async () => {
    const seats = [
      mkSeat(0, "qiongqi", "demon"),
      mkSeat(1, "outsider_dummy", "outsider", {
        isDead: true,
        isAlive: false,
        diedAtNight: 1,
      }),
      mkSeat(2, "investigator", "townsfolk"),
      mkSeat(3, "chef", "townsfolk"),
      mkSeat(4, "washerwoman", "townsfolk"),
    ];
    const r = await runNight(
      snapshot(seats, { outsiderDiedToday: true }),
      (node: any) => (node.roleId === "qiongqi" ? [2] : [])
    );
    const target = r.finalSnapshot.seats.find((s: any) => s.id === 2);
    const dead = r.finalSnapshot.seats.filter((s: any) => s.isDead).length;
    expect(target.isDead).toBe(true);
    expect(target.statusEffects.some((e: any) => e.type === "alive_dead")).toBe(
      true
    );
    expect(dead).toBeGreaterThanOrEqual(2); // 活尸 + 额外死亡
  });

  it("穷奇：无外来者死亡 → 正常击杀（无活尸标记）", async () => {
    const seats = [
      mkSeat(0, "qiongqi", "demon"),
      mkSeat(1, "butler", "outsider"),
      mkSeat(2, "investigator", "townsfolk"),
      mkSeat(3, "chef", "townsfolk"),
      mkSeat(4, "washerwoman", "townsfolk"),
    ];
    const r = await runNight(snapshot(seats), (node: any) =>
      node.roleId === "qiongqi" ? [2] : []
    );
    const target = r.finalSnapshot.seats.find((s: any) => s.id === 2);
    expect(target.isDead).toBe(true);
    expect(target.statusEffects.some((e: any) => e.type === "alive_dead")).toBe(
      false
    );
  });

  it("饕餮：目标角色类型互不相同 → 全部死亡", async () => {
    const seats = [
      mkSeat(0, "taotie", "demon"),
      mkSeat(1, "investigator", "townsfolk"),
      mkSeat(2, "chef", "townsfolk"),
      mkSeat(3, "butler", "outsider"),
      mkSeat(4, "poisoner", "minion"),
    ];
    const r = await runNight(snapshot(seats), (node: any) =>
      node.roleId === "taotie" ? [2, 3, 4] : []
    );
    const dead = r.finalSnapshot.seats
      .filter((s: any) => s.isDead)
      .map((s: any) => s.id)
      .sort();
    expect(dead.join(",")).toBe("2,3,4");
  });

  it("饕餮：目标存在相同角色类型 → 无人死亡", async () => {
    const seats = [
      mkSeat(0, "taotie", "demon"),
      mkSeat(1, "investigator", "townsfolk"),
      mkSeat(2, "chef", "townsfolk"),
      mkSeat(3, "butler", "outsider"),
      mkSeat(4, "poisoner", "minion"),
    ];
    const r = await runNight(snapshot(seats), (node: any) =>
      node.roleId === "taotie" ? [1, 2] : []
    );
    expect(r.finalSnapshot.seats.filter((s: any) => s.isDead).length).toBe(0);
  });

  it("梼杌：恶魔杀梼杌 → 爪牙失去能力，梼杌存活", async () => {
    const seats = [
      mkSeat(0, "imp", "demon"),
      mkSeat(1, "taowu", "demon"),
      mkSeat(2, "poisoner", "minion"),
      mkSeat(3, "chef", "townsfolk"),
      mkSeat(4, "butler", "outsider"),
    ];
    const r = await runNight(snapshot(seats), (node: any) =>
      node.roleId === "imp" ? [1] : []
    );
    const taowu = r.finalSnapshot.seats.find((s: any) => s.id === 1);
    const minion = r.finalSnapshot.seats.find((s: any) => s.id === 2);
    expect(taowu.isDead).toBe(false);
    expect(
      minion.statusEffects.some((e: any) => e.type === "lost_ability")
    ).toBe(true);
  });

  it("梼杌：无爪牙可替死 → 梼杌死亡", async () => {
    const seats = [
      mkSeat(0, "imp", "demon"),
      mkSeat(1, "taowu", "demon"),
      mkSeat(2, "chef", "townsfolk"),
      mkSeat(3, "chef", "townsfolk"),
      mkSeat(4, "butler", "outsider"),
    ];
    const r = await runNight(snapshot(seats), (node: any) =>
      node.roleId === "imp" ? [1] : []
    );
    expect(r.finalSnapshot.seats.find((s: any) => s.id === 1).isDead).toBe(
      true
    );
  });

  it("鸩：限一次毒杀在场镇民角色；重复使用被拦截；不在场无影响", async () => {
    const { runFullAbilityPipeline } = await import(
      "../../utils/middlewarePipeline"
    );
    const abilityMap = buildAbilityMap();
    const ability = abilityMap.zhen_night_ability;
    expect(ability).toBeDefined();

    const seats = [
      mkSeat(0, "zhen", "demon"),
      mkSeat(1, "investigator", "townsfolk"),
      mkSeat(2, "chef", "townsfolk"),
      mkSeat(3, "butler", "outsider"),
      mkSeat(4, "poisoner", "minion"),
    ];
    const node: any = {
      seatId: 0,
      roleId: "zhen",
      roleName: "鸩",
      abilityId: "zhen_night_ability",
      targetIds: [],
      meta: {},
      priority: 44,
    };

    // 1. 毒杀在场角色
    const out1 = await runFullAbilityPipeline(
      {
        preCheck: ability.preCheck,
        calculate: ability.calculate,
        stateUpdate: ability.stateUpdate,
        postProcess: ability.postProcess,
      },
      {
        snapshot: snapshot(seats),
        actionNode: node,
        targetIds: [],
        storytellerInput: { roleId: "investigator" },
        meta: {},
        aborted: false,
      } as any
    );
    const victim = out1.snapshot.seats.find((s: any) => s.id === 1);
    expect(victim.isDead).toBe(true);
    expect(victim.statusEffects.some((e: any) => e.type === "poisoned")).toBe(
      true
    );

    // 2. 第二次使用 → 限次拦截
    const out2 = await runFullAbilityPipeline(
      {
        preCheck: ability.preCheck,
        calculate: ability.calculate,
        stateUpdate: ability.stateUpdate,
        postProcess: ability.postProcess,
      },
      {
        snapshot: out1.snapshot,
        actionNode: node,
        targetIds: [],
        storytellerInput: { roleId: "chef" },
        meta: {},
        aborted: false,
      } as any
    );
    expect(out2.aborted).toBe(true);

    // 3. 不在场角色 → 无影响
    const out3 = await runFullAbilityPipeline(
      {
        preCheck: ability.preCheck,
        calculate: ability.calculate,
        stateUpdate: ability.stateUpdate,
        postProcess: ability.postProcess,
      },
      {
        snapshot: snapshot(seats),
        actionNode: node,
        targetIds: [],
        storytellerInput: { roleId: "mayor" },
        meta: {},
        aborted: false,
      } as any
    );
    expect(out3.snapshot.seats.filter((s: any) => s.isDead).length).toBe(0);
  });
});

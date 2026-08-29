import { describe, expect, test } from "vitest";
import { generateDynamicNightQueue } from "../../../utils/dynamicQueueGenerator";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import { nightOrderParser } from "../../../utils/nightOrderParser";
import { scarletWomanAbility } from "../../new_engine/scarlet_woman.ability";

function s(id: number, rid: string, rt: string, o?: { dead?: boolean }) {
  const n: Record<string, string> = {
    scarlet_woman: "红唇女郎",
    imp: "小恶魔",
    soldier: "士兵",
    chef: "厨师",
    washerwoman: "洗衣妇",
    butler: "管家",
    mayor: "镇长",
  };
  return {
    id,
    playerName: `P${id + 1}`,
    isDead: !!o?.dead,
    isAlive: !o?.dead,
    isDrunk: false,
    isPoisoned: false,
    role: { id: rid, name: n[rid] || rid, type: rt },
    statusEffects: [],
    hasAbilityEvenDead: false,
  };
}
function ctx(sid: number): MiddlewareContext {
  return {
    snapshot: {
      nightCount: 2,
      gamePhase: "night",
      seats: [
        s(0, "scarlet_woman", "minion"),
        s(1, "imp", "demon", { dead: true }),
        s(2, "soldier", "townsfolk"),
        s(3, "chef", "townsfolk"),
        s(4, "washerwoman", "townsfolk"),
        s(5, "butler", "outsider"),
        s(6, "mayor", "townsfolk"),
      ],
      statusEffects: {},
    },
    actionNode: {
      seatId: sid,
      roleId: "scarlet_woman",
      roleName: "红唇女郎",
      priority: 0,
      isFirstNightOnly: false,
      abilityId: "sw_passive",
      wakeMessage: "...",
      firstNightPriority: null,
      otherNightPriority: null,
      targetIds: [],
      processed: false,
      success: false,
      meta: {},
    },
    targetIds: [],
    meta: {},
    aborted: false,
  };
}
const pipe = (a: any) => ({
  preCheck: a.preCheck,
  calculate: a.calculate,
  stateUpdate: a.stateUpdate,
  postProcess: a.postProcess,
});

describe("红唇女郎 引擎集成测试", () => {
  test("≥5人存活恶魔死-变恶魔", async () => {
    expect(
      (await runFullAbilityPipeline(pipe(scarletWomanAbility), ctx(0))).aborted
    ).toBe(false);
  });

  test("红唇女郎是被动能力角色，绝不进入首夜或非首夜的夜间行动唤醒队列", () => {
    const fullNightOrder = [
      ...nightOrderParser.getFirstNightOrder().map((item) => ({
        roleId: item.roleId,
        roleName: item.roleName,
        firstNightPriority: item.firstNightOrder,
        otherNightPriority: 0,
        firstNightOnly: true,
        otherNightOnly: false,
      })),
      ...nightOrderParser.getOtherNightOrder().map((item) => ({
        roleId: item.roleId,
        roleName: item.roleName,
        firstNightPriority: 0,
        otherNightPriority: item.otherNightOrder,
        firstNightOnly: false,
        otherNightOnly: true,
      })),
    ];
    const snapshot: any = {
      nightCount: 1,
      gamePhase: "firstNight",
      seats: [
        s(0, "scarlet_woman", "minion"),
        s(1, "imp", "demon"),
        s(2, "chef", "townsfolk"),
        s(3, "poisoner", "minion"),
        s(4, "washerwoman", "townsfolk"),
      ],
    };

    // 首夜队列测试
    const firstNightQueue = generateDynamicNightQueue(
      fullNightOrder as any,
      snapshot,
      { isFirstNight: true }
    );
    const swFirstNight = firstNightQueue.find(
      (node) => node.roleId === "scarlet_woman"
    );
    expect(swFirstNight).toBeUndefined();

    // 非首夜队列测试
    snapshot.nightCount = 2;
    snapshot.gamePhase = "night";
    const otherNightQueue = generateDynamicNightQueue(
      fullNightOrder as any,
      snapshot,
      { isFirstNight: false }
    );
    const swOtherNight = otherNightQueue.find(
      (node) => node.roleId === "scarlet_woman"
    );
    expect(swOtherNight).toBeUndefined();
  });
});

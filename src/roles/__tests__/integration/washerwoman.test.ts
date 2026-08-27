/**
 * 洗衣妇 (Washerwoman) 引擎集成测试
 * 调用 runFullAbilityPipeline 执行真实中间件管道
 */
import { describe, expect, test } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import { washerwomanAbility } from "../../new_engine/washerwoman.ability";

function makeSeat(
  id: number,
  roleId: string,
  roleType: string,
  opts?: {
    isDead?: boolean;
    isDrunk?: boolean;
    isPoisoned?: boolean;
    isAlive?: boolean;
  }
) {
  const isAlive = opts?.isAlive ?? !(opts?.isDead ?? false);
  const statusEffects: Array<{ type: string }> = [];
  if (opts?.isDrunk) statusEffects.push({ type: "drunk" });
  if (opts?.isPoisoned) statusEffects.push({ type: "poisoned" });
  const names: Record<string, string> = {
    washerwoman: "洗衣妇",
    chef: "厨师",
    empath: "共情者",
    soldier: "士兵",
    butler: "管家",
    saint: "圣徒",
    recluse: "陌客",
    drunk: "酒鬼",
    spy: "间谍",
    poisoner: "投毒者",
    baron: "男爵",
    scarlet_woman: "红唇女郎",
    imp: "小恶魔",
    mayor: "镇长",
  };
  return {
    id,
    playerName: `玩家${id + 1}`,
    isDead: !isAlive,
    isAlive,
    isDrunk: opts?.isDrunk ?? false,
    isPoisoned: opts?.isPoisoned ?? false,
    role: { id: roleId, name: names[roleId] || roleId, type: roleType },
    effectiveRole: null,
    charadeRole: null,
    statusEffects,
    hasAbilityEvenDead: false,
  };
}

function makeContext(opts: {
  seatId: number;
  nightCount: number;
  gamePhase: string;
  seats: ReturnType<typeof makeSeat>[];
  isPreview?: boolean;
}): MiddlewareContext {
  return {
    snapshot: {
      nightCount: opts.nightCount,
      gamePhase: opts.gamePhase,
      seats: opts.seats,
      statusEffects: {},
    },
    actionNode: {
      seatId: opts.seatId,
      roleId: "washerwoman",
      roleName: "洗衣妇",
      priority: 52,
      isFirstNightOnly: true,
      abilityId: "washerwoman_first_night_ability",
      wakeMessage: "洗衣妇，睁开你的眼睛...",
      firstNightPriority: 52,
      otherNightPriority: null,
      targetIds: [],
      processed: false,
      success: false,
      meta: {},
    },
    targetIds: [],
    meta: {},
    aborted: false,
    preview: opts.isPreview ?? false,
  };
}

describe("洗衣妇 引擎集成测试", () => {
  test("首夜正常获取信息（5人局）", async () => {
    const seats = [
      makeSeat(0, "washerwoman", "townsfolk"),
      makeSeat(1, "chef", "townsfolk"),
      makeSeat(2, "soldier", "townsfolk"),
      makeSeat(3, "butler", "outsider"),
      makeSeat(4, "imp", "demon"),
    ];
    const ctx = makeContext({
      seatId: 0,
      nightCount: 1,
      gamePhase: "firstNight",
      seats,
    });

    const result = await runFullAbilityPipeline(
      {
        preCheck: washerwomanAbility.preCheck,
        calculate: washerwomanAbility.calculate,
        stateUpdate: washerwomanAbility.stateUpdate,
        postProcess: washerwomanAbility.postProcess,
      },
      ctx
    );

    // 管道不应中止
    expect(result.aborted).toBe(false);
    // 应生成能力结果
    const abilityResult = result.meta.abilityResult;
    expect(abilityResult).toBeDefined();
    expect(abilityResult.seat1).toBeDefined();
    expect(abilityResult.seat2).toBeDefined();
    expect(abilityResult.roleName).toBeDefined();
    // 两名玩家不相同
    expect(abilityResult.seat1).not.toBe(abilityResult.seat2);
    // 角色名是镇民
    const isTownsfolk = seats.some(
      (s) =>
        s.role.name === abilityResult.roleName && s.role.type === "townsfolk"
    );
    expect(isTownsfolk || abilityResult.roleName === "洗衣妇").toBe(true);
  });

  test("非首夜不唤醒", async () => {
    const seats = [
      makeSeat(0, "washerwoman", "townsfolk"),
      makeSeat(1, "chef", "townsfolk"),
    ];
    const ctx = makeContext({
      seatId: 0,
      nightCount: 2,
      gamePhase: "night",
      seats,
    });

    const result = await runFullAbilityPipeline(
      {
        preCheck: washerwomanAbility.preCheck,
        calculate: washerwomanAbility.calculate,
      },
      ctx
    );
    expect(result.aborted).toBe(true);
  });

  test("死亡后不触发", async () => {
    const seats = [
      makeSeat(0, "washerwoman", "townsfolk", { isDead: true }),
      makeSeat(1, "chef", "townsfolk"),
    ];
    const ctx = makeContext({
      seatId: 0,
      nightCount: 1,
      gamePhase: "firstNight",
      seats,
    });

    const result = await runFullAbilityPipeline(
      {
        preCheck: washerwomanAbility.preCheck,
        calculate: washerwomanAbility.calculate,
      },
      ctx
    );
    expect(result.aborted).toBe(true);
  });

  test("醉酒时仍执行但标记受干扰", async () => {
    const seats = [
      makeSeat(0, "washerwoman", "townsfolk", { isDrunk: true }),
      makeSeat(1, "chef", "townsfolk"),
      makeSeat(2, "soldier", "townsfolk"),
      makeSeat(3, "butler", "outsider"),
    ];
    const ctx = makeContext({
      seatId: 0,
      nightCount: 1,
      gamePhase: "firstNight",
      seats,
    });

    const result = await runFullAbilityPipeline(
      {
        preCheck: washerwomanAbility.preCheck,
        calculate: washerwomanAbility.calculate,
        stateUpdate: washerwomanAbility.stateUpdate,
        postProcess: washerwomanAbility.postProcess,
      },
      ctx
    );
    expect(result.aborted).toBe(false);
    expect(result.meta.isCorrupted).toBe(true);
    // 仍然返回镇民角色名（规则要求）
    expect(result.meta.abilityResult.roleName).toBeDefined();
  });

  test("间谍可被当作镇民候选", async () => {
    const seats = [
      makeSeat(0, "washerwoman", "townsfolk"),
      makeSeat(1, "spy", "minion"),
      makeSeat(2, "imp", "demon"),
      makeSeat(3, "butler", "outsider"),
      makeSeat(4, "saint", "outsider"),
    ];
    const ctx = makeContext({
      seatId: 0,
      nightCount: 1,
      gamePhase: "firstNight",
      seats,
    });

    const result = await runFullAbilityPipeline(
      {
        preCheck: washerwomanAbility.preCheck,
        calculate: washerwomanAbility.calculate,
      },
      ctx
    );
    expect(result.aborted).toBe(false);
    // 有间谍的情况下仍然能返回结果
    expect(result.meta.abilityResult).toBeDefined();
  });

  test("无镇民在场时返回洗衣妇自身", async () => {
    // 模拟极端: 仅洗衣妇是镇民，其余全是外来者/爪牙/恶魔
    const seats = [
      makeSeat(0, "washerwoman", "townsfolk"),
      makeSeat(1, "butler", "outsider"),
      makeSeat(2, "saint", "outsider"),
      makeSeat(3, "baron", "minion"),
      makeSeat(4, "imp", "demon"),
      makeSeat(5, "drunk", "outsider"),
    ];
    const ctx = makeContext({
      seatId: 0,
      nightCount: 1,
      gamePhase: "firstNight",
      seats,
    });

    const result = await runFullAbilityPipeline(
      {
        preCheck: washerwomanAbility.preCheck,
        calculate: washerwomanAbility.calculate,
        stateUpdate: washerwomanAbility.stateUpdate,
        postProcess: washerwomanAbility.postProcess,
      },
      ctx
    );
    expect(result.aborted).toBe(false);
    // 规则: 无其他镇民候选时，返回洗衣妇自身
    const abilityResult = result.meta.abilityResult;
    expect(abilityResult).toBeDefined();
    // seat1或seat2中应有一个是洗衣妇自身(seatId=0)
    expect(abilityResult.seat1 === 0 || abilityResult.seat2 === 0).toBe(true);
    // 角色名应为"洗衣妇"或可能是某个被当作镇民的爪牙的伪装
    expect(typeof abilityResult.roleName).toBe("string");
  });

  test("postProcess 生成提示词和日志", async () => {
    const seats = [
      makeSeat(0, "washerwoman", "townsfolk"),
      makeSeat(1, "chef", "townsfolk"),
      makeSeat(2, "soldier", "townsfolk"),
    ];
    const ctx = makeContext({
      seatId: 0,
      nightCount: 1,
      gamePhase: "firstNight",
      seats,
    });

    const result = await runFullAbilityPipeline(
      {
        preCheck: washerwomanAbility.preCheck,
        calculate: washerwomanAbility.calculate,
        stateUpdate: washerwomanAbility.stateUpdate,
        postProcess: washerwomanAbility.postProcess,
      },
      ctx
    );
    expect(result.meta.prompt).toBeDefined();
    expect(result.meta.prompt).toContain("洗衣妇");
    expect(result.meta.abilityLog).toBeDefined();
    expect(result.meta.displayInfo).toBeDefined();
  });
});

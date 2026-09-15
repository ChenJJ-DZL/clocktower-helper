import { describe, expect, it } from "vitest";
import type { Seat } from "../../../app/data";
import { bounty_hunter } from "../../roles/townsfolk/bounty_hunter";
import { generateDynamicNightQueue } from "../dynamicQueueGenerator";
import { buildFullNightOrder } from "../invariantTesting/engineConfig";
import { generateNightTimeline } from "../nightLogic";

/**
 * 🏹 赏金猎人「不是每夜发动」——队列层回归护栏。
 *
 * 官方（json/full/all_characters.json · 赏金猎人）：
 *   「在你的首个夜晚，你会得知一名邪恶玩家。
 *     每当你**得知**的玩家死亡，你会在**当晚**得知另一名邪恶玩家。」
 *   规则细节：「每当放置"得知"提示标记的玩家死亡时，将"得知"提示标记放置在一名
 *            新的邪恶玩家的角色标记旁。**当晚**，唤醒赏金猎人…」
 *
 * ⇒ 这不是一个"每夜唤醒"的能力。旧实现给出 `otherNightPriority: 105` +
 *   `firstNightOnly: false`，于是 `generateNightOrderFromParser` 算出
 *   `firstNightOnly = false` → **条目每夜入场**，说书人每夜被空唤醒、
 *   且每夜白送一名邪恶玩家（用户实测缺陷）。
 *
 * ⚠️ 本测试**导入真实模块**（真实能力注册表 + 真实队列生成器），
 *    一旦把 `requiresKnownTargetDead` 的门控去掉、或把栅栏条件写反，
 *    这里必须变红。绝不重新实现被测逻辑。
 */

function seat(id: number, roleId: string, overrides: Partial<Seat> = {}): Seat {
  const type =
    roleId === "imp"
      ? "demon"
      : roleId === "poisoner" || roleId === "baron"
        ? "minion"
        : "townsfolk";
  return {
    id,
    role: { id: roleId, name: roleId, type } as any,
    isDead: false,
    isDrunk: false,
    isPoisoned: false,
    isProtected: false,
    protectedBy: null,
    isRedHerring: false,
    isFortuneTellerRedHerring: false,
    isSentenced: false,
    masterId: null,
    charadeRole: null,
    hasUsedSlayerAbility: false,
    hasUsedVirginAbility: false,
    isDemonSuccessor: false,
    hasAbilityEvenDead: false,
    isEvilConverted: false,
    statusDetails: [],
    ...overrides,
  } as Seat;
}

/** 用真实的"能力注册表 → 夜序条目"通道取全量夜序（绝不在测试里手搓条目） */
const fullNightOrder = () => buildFullNightOrder();

describe("赏金猎人：非每夜唤醒（队列层门控）", () => {
  it("夜序条目被标记为条件唤醒（requiresKnownTargetDead = true）", () => {
    const entry = fullNightOrder().find((e) => e.roleId === "bounty_hunter");
    expect(entry, "赏金猎人未出现在夜序条目中").toBeTruthy();
    expect(
      entry!.requiresKnownTargetDead,
      "未声明 requiresKnownTargetDead → 队列层不再拦它 → 每夜都会白唤醒赏金猎人"
    ).toBe(true);
  });

  it("非首夜 + 已知目标仍存活 → 队列里不得出现赏金猎人", () => {
    const seats = [
      seat(0, "bounty_hunter"),
      seat(1, "imp"),
      seat(2, "poisoner"),
      seat(3, "baron"),
    ];
    const snapshot = {
      nightCount: 2,
      gamePhase: "night",
      seats,
      statusEffects: {},
      deadThisNight: [],
      // 已知 3 号（baron），仍然存活
      bountyHunterKnownTargets: [3],
    } as any;

    const queue = generateDynamicNightQueue(fullNightOrder(), snapshot, {
      isFirstNight: false,
    });
    expect(
      queue.some((n) => n.roleId === "bounty_hunter"),
      "已知目标仍存活，赏金猎人却被排进了夜间队列（旧缺陷回归）"
    ).toBe(false);
  });

  it("非首夜 + 已知目标已死亡 → 当晚必须唤醒赏金猎人", () => {
    const seats = [
      seat(0, "bounty_hunter"),
      seat(1, "imp"),
      seat(2, "poisoner"),
      seat(3, "baron", { isDead: true } as any),
    ];
    const snapshot = {
      nightCount: 2,
      gamePhase: "night",
      seats,
      statusEffects: {},
      deadThisNight: [3],
      bountyHunterKnownTargets: [3],
    } as any;

    const queue = generateDynamicNightQueue(fullNightOrder(), snapshot, {
      isFirstNight: false,
    });
    const bh = queue.find((n) => n.roleId === "bounty_hunter");
    expect(bh, "已知目标已死亡，赏金猎人却没被唤醒（官方：当晚得知另一名邪恶玩家）").toBeTruthy();
    expect(bh!.seatId).toBe(0);
  });

  it("已知目标是「本夜被杀」（isDead 尚未落地）也算数", () => {
    const seats = [
      seat(0, "bounty_hunter"),
      seat(1, "imp"),
      seat(2, "poisoner"),
      // baron 刚刚被标记为本夜死亡，但 isDead 还没落地
      seat(3, "baron"),
    ];
    const snapshot = {
      nightCount: 3,
      gamePhase: "night",
      seats,
      statusEffects: {},
      deadThisNight: [3],
      bountyHunterKnownTargets: [3],
    } as any;

    const queue = generateDynamicNightQueue(fullNightOrder(), snapshot, {
      isFirstNight: false,
    });
    expect(
      queue.some((n) => n.roleId === "bounty_hunter"),
      "本夜被杀的已知目标必须触发当晚唤醒"
    ).toBe(true);
  });

  it("首夜必须唤醒（回归护栏：门控不得误伤首夜）", () => {
    const seats = [
      seat(0, "bounty_hunter"),
      seat(1, "imp"),
      seat(2, "poisoner"),
      seat(3, "baron"),
    ];
    const snapshot = {
      nightCount: 1,
      gamePhase: "firstNight",
      seats,
      statusEffects: {},
      deadThisNight: [],
      // ⚠️ 故意塞一枚"搁在存活玩家身上的已知标记"：若首夜短路被删除，
      //    这条用例必须变红（否则与"空 known 兜底"殊途同归 = 假绿）。
      bountyHunterKnownTargets: [3],
    } as any;

    const queue = generateDynamicNightQueue(fullNightOrder(), snapshot, {
      isFirstNight: true,
    });
    expect(
      queue.some((n) => n.roleId === "bounty_hunter"),
      "首夜必须唤醒赏金猎人（官方：在你的首个夜晚，你会得知一名邪恶玩家）"
    ).toBe(true);
  });

  it("完全没有「得知」记录时不做拦截（异常兜底，交回执行期判定）", () => {
    const seats = [
      seat(0, "bounty_hunter"),
      seat(1, "imp"),
      seat(2, "poisoner"),
    ];
    const snapshot = {
      nightCount: 2,
      gamePhase: "night",
      seats,
      statusEffects: {},
      deadThisNight: [],
      bountyHunterKnownTargets: [],
    } as any;

    const queue = generateDynamicNightQueue(fullNightOrder(), snapshot, {
      isFirstNight: false,
    });
    expect(
      queue.some((n) => n.roleId === "bounty_hunter"),
      "无已知记录的异常局面应放行，由执行期的 preCheck 兜底"
    ).toBe(true);
  });
});

describe("赏金猎人：legacy 角色定义的 shouldWake 门控（旧通道同样不得每夜唤醒）", () => {
  it("legacy 定义声明了 shouldWake（否则旧通道仍会每夜入选）", () => {
    expect(
      typeof bounty_hunter.shouldWake,
      "legacy bounty_hunter 未声明 shouldWake → generateNightTimeline 会每夜无条件收录"
    ).toBe("function");
  });

  it("legacy shouldWake：首夜 true", () => {
    const seats = [seat(0, "bounty_hunter"), seat(1, "imp")];
    expect(bounty_hunter.shouldWake!(true, seats, 0)).toBe(true);
  });

  it("legacy shouldWake：首夜即便存在「赏金已知」标记也必须 true（首夜短路不能被兜底掩盖）", () => {
    // ⚠️ 假绿陷阱：若首夜短路被删掉，只靠「无标记 → true」的兜底也能让上面的用例变绿，
    //    测试就区分不了"首夜短路生效"与"兜底恰好也返回 true"。
    //    这里故意放一个**存活**的"赏金已知"座位：只有首夜短路存在时才返回 true，
    //    兜底路径会走到最后一行 → 返回 false。
    const seats = [
      seat(0, "bounty_hunter"),
      seat(1, "imp"),
      seat(2, "baron", { statusDetails: ["赏金已知"] } as any),
    ];
    expect(
      bounty_hunter.shouldWake!(true, seats, 0),
      "首夜必须无条件唤醒（官方：在你的首个夜晚，你会得知一名邪恶玩家）"
    ).toBe(true);
  });

  it("legacy shouldWake：非首夜 + 已知标记仍在存活的玩家身上 → false", () => {
    const seats = [
      seat(0, "bounty_hunter"),
      seat(1, "imp"),
      seat(2, "baron", { statusDetails: ["赏金已知"] } as any),
    ];
    expect(bounty_hunter.shouldWake!(false, seats, 2)).toBe(false);
  });

  it("legacy shouldWake：非首夜 + 已知标记所在玩家已死 → true", () => {
    const seats = [
      seat(0, "bounty_hunter"),
      seat(1, "imp"),
      seat(2, "baron", { statusDetails: ["赏金已知"], isDead: true } as any),
    ];
    expect(bounty_hunter.shouldWake!(false, seats, 2)).toBe(true);
  });
});

describe("赏金猎人：legacy 时间线（generateNightTimeline）不得每夜收录", () => {
  /** 该角色在时间线里是否被排入（按 roleId 判定，不依赖座位索引） */
  const inTimeline = (steps: any[], roleId: string) =>
    steps.some((s) => s.roleId === roleId);

  it("非首夜 + 已知目标仍存活 → 时间线里不得有赏金猎人", () => {
    const seats = [
      seat(0, "bounty_hunter"),
      seat(1, "imp"),
      seat(2, "baron", { statusDetails: ["赏金已知"] } as any),
      seat(3, "washerwoman"),
    ];
    const steps = generateNightTimeline(seats, false, 2);
    expect(
      inTimeline(steps, "bounty_hunter"),
      "旧通道（generateNightTimeline）仍把赏金猎人排进了次夜时间线 → 说书人被空唤醒"
    ).toBe(false);
  });

  it("非首夜 + 已知目标已死亡 → 时间线里必须有赏金猎人", () => {
    const seats = [
      seat(0, "bounty_hunter"),
      seat(1, "imp"),
      seat(2, "baron", { statusDetails: ["赏金已知"], isDead: true } as any),
      seat(3, "washerwoman"),
    ];
    const steps = generateNightTimeline(seats, false, 3);
    expect(
      inTimeline(steps, "bounty_hunter"),
      "已知目标已死亡却没排进时间线（官方：当晚得知另一名邪恶玩家）"
    ).toBe(true);
  });

  it("首夜 → 时间线里必须有赏金猎人", () => {
    const seats = [
      seat(0, "bounty_hunter"),
      seat(1, "imp"),
      seat(2, "washerwoman"),
    ];
    const steps = generateNightTimeline(seats, true, 0);
    expect(inTimeline(steps, "bounty_hunter")).toBe(true);
  });
});

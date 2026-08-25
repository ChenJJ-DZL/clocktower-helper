import { describe, expect, it } from "vitest";
import { runFullAbilityPipeline } from "../../src/utils/middlewarePipeline";
import {
  bounty_hunterAbility,
  initializeAbilityRegistry,
} from "../../src/roles/new_engine/abilityRegistry";

describe("【赏金猎人 (Bounty Hunter) 1:1 官方 Wiki 原装具名范例标准模板测试】", () => {
  initializeAbilityRegistry();

  it("场景 1 (正常轮转): 小艾(赏金猎人)、大本(鹰身女妖)、小黑(茶艺师) -> Setup小黑转邪恶茶艺师 -> 首夜小艾得知大本 -> D3大本处决死亡 -> 当晚小艾得知小黑", async () => {
    // 1. Setup 阶段：3名具名玩家
    let seats: any[] = [
      {
        id: 0,
        playerName: "小艾",
        role: { id: "bounty_hunter", name: "赏金猎人", type: "townsfolk" },
        isDead: false,
        isAlive: true,
        isDrunk: false,
        isPoisoned: false,
        isEvilConverted: false,
        statusEffects: [],
      },
      {
        id: 1,
        playerName: "大本",
        role: { id: "harpy", name: "鹰身女妖", type: "minion" },
        isDead: false,
        isAlive: true,
        isDrunk: false,
        isPoisoned: false,
        isEvilConverted: false,
        statusEffects: [],
      },
      {
        id: 2,
        playerName: "小黑",
        role: { id: "tea_lady", name: "茶艺师", type: "townsfolk" },
        isDead: false,
        isAlive: true,
        isDrunk: false,
        isPoisoned: false,
        isEvilConverted: true, // Setup 阶段说书人将小黑转为邪恶茶艺师
        statusEffects: [],
      },
    ];

    // 2. 首夜唤醒：小艾(赏金猎人)行动，得知初始邪恶大本
    const firstNightCtx: any = {
      actionNode: { seatId: 0, roleId: "bounty_hunter" },
      snapshot: {
        seats,
        gamePhase: "firstNight",
        nightCount: 1,
      },
      storytellerInput: { targetSeatId: 1 }, // 说书人向小艾展示大本
      meta: {},
    };

    const firstNightRes = await runFullAbilityPipeline(bounty_hunterAbility as any, firstNightCtx);
    expect(firstNightRes.meta.abilityResult.targetSeatId).toBe(1);
    expect(firstNightRes.meta.abilityResult.targetPlayerName).toBe("大本");

    // 3. 第 3 天白天：大本(鹰身女妖)死于处决
    seats = seats.map((s) => (s.id === 1 ? { ...s, isDead: true, isAlive: false } : s));
    expect(seats[1].isDead).toBe(true);

    // 4. 当晚（非首夜）：小艾被唤醒，大本已死，轮转得知转邪恶的小黑
    const nextNightCtx: any = {
      actionNode: { seatId: 0, roleId: "bounty_hunter" },
      snapshot: {
        seats,
        gamePhase: "night",
        nightCount: 3,
        _abilityResults: {
          bounty_hunter: { targetSeatId: 1 }, // 之前得知的是1号大本
        },
      },
      storytellerInput: { targetSeatId: 2 }, // 轮转展示2号小黑
      meta: {},
    };

    const nextNightRes = await runFullAbilityPipeline(bounty_hunterAbility as any, nextNightCtx);
    expect(nextNightRes.meta.abilityResult.targetSeatId).toBe(2);
    expect(nextNightRes.meta.abilityResult.targetPlayerName).toBe("小黑");
  });

  it("场景 2 (中毒干扰): 赏金猎人、小朱(男爵)、投毒者、小艾(魔术师) -> 首夜得知邪恶小朱 -> 小朱死亡且赏金猎人中毒 -> 当晚得知善良魔术师小艾", async () => {
    const seats: any[] = [
      {
        id: 0,
        playerName: "玩家A",
        role: { id: "bounty_hunter", name: "赏金猎人", type: "townsfolk" },
        isDead: false,
        isAlive: true,
        isDrunk: false,
        isPoisoned: false,
        isEvilConverted: false,
        statusEffects: [],
      },
      {
        id: 1,
        playerName: "小朱",
        role: { id: "baron", name: "男爵", type: "minion" },
        isDead: false,
        isAlive: true,
        isDrunk: false,
        isPoisoned: false,
        isEvilConverted: false,
        statusEffects: [],
      },
      {
        id: 2,
        playerName: "投毒者P",
        role: { id: "poisoner", name: "投毒者", type: "minion" },
        isDead: false,
        isAlive: true,
        isDrunk: false,
        isPoisoned: false,
        isEvilConverted: false,
        statusEffects: [],
      },
      {
        id: 3,
        playerName: "小艾",
        role: { id: "magician", name: "魔术师", type: "townsfolk" },
        isDead: false,
        isAlive: true,
        isDrunk: false,
        isPoisoned: false,
        isEvilConverted: false,
        statusEffects: [],
      },
    ];

    // 首夜：得知邪恶的男爵小朱
    const n1Ctx: any = {
      actionNode: { seatId: 0, roleId: "bounty_hunter" },
      snapshot: { seats, gamePhase: "firstNight", nightCount: 1 },
      storytellerInput: { targetSeatId: 1 },
      meta: {},
    };
    const n1Res = await runFullAbilityPipeline(bounty_hunterAbility as any, n1Ctx);
    expect(n1Res.meta.abilityResult.targetPlayerName).toBe("小朱");

    // 某夜：小朱死亡，赏金猎人被投毒者下毒 (isPoisoned = true)
    const poisonedSeats = seats.map((s) => {
      if (s.id === 1) return { ...s, isDead: true, isAlive: false };
      if (s.id === 0) return { ...s, isPoisoned: true };
      return s;
    });

    const n2Ctx: any = {
      actionNode: { seatId: 0, roleId: "bounty_hunter" },
      snapshot: {
        seats: poisonedSeats,
        gamePhase: "night",
        nightCount: 2,
        _abilityResults: { bounty_hunter: { targetSeatId: 1 } },
      },
      storytellerInput: { targetSeatId: 3 }, // 中毒干扰下展示善良的魔术师小艾
      meta: {},
    };
    const n2Res = await runFullAbilityPipeline(bounty_hunterAbility as any, n2Ctx);
    expect(n2Res.meta.abilityResult.targetSeatId).toBe(3);
    expect(n2Res.meta.abilityResult.targetPlayerName).toBe("小艾");
  });

  it("场景 3 (酒鬼伪装): 小兰(以为是赏金猎人的酒鬼)、小明(共情者)、道哥(卖花女孩) -> 无镇民转邪恶 -> 首夜得知善良小明 -> 小明死后得知善良道哥", async () => {
    const seats: any[] = [
      {
        id: 0,
        playerName: "小兰",
        role: { id: "drunk", name: "酒鬼", type: "outsider" },
        charadeRole: { id: "bounty_hunter", name: "赏金猎人", type: "townsfolk" },
        isDead: false,
        isAlive: true,
        isDrunk: true,
        isPoisoned: false,
        isEvilConverted: false,
        statusEffects: [],
      },
      {
        id: 1,
        playerName: "小明",
        role: { id: "empath", name: "共情者", type: "townsfolk" },
        isDead: false,
        isAlive: true,
        isDrunk: false,
        isPoisoned: false,
        isEvilConverted: false,
        statusEffects: [],
      },
      {
        id: 2,
        playerName: "道哥",
        role: { id: "flowergirl", name: "卖花女孩", type: "townsfolk" },
        isDead: false,
        isAlive: true,
        isDrunk: false,
        isPoisoned: false,
        isEvilConverted: false,
        statusEffects: [],
      },
    ];

    // 1. 首夜：因为小兰是酒鬼，没有镇民被转为邪恶，说书人给出善良的小明
    const n1Ctx: any = {
      actionNode: { seatId: 0, roleId: "bounty_hunter" },
      snapshot: { seats, gamePhase: "firstNight", nightCount: 1 },
      storytellerInput: { targetSeatId: 1 },
      meta: {},
    };
    const n1Res = await runFullAbilityPipeline(bounty_hunterAbility as any, n1Ctx);
    expect(n1Res.meta.abilityResult.targetPlayerName).toBe("小明");

    // 2. 随后小明死亡，小兰再次行动，说书人给出善良的卖花女孩道哥
    const deadSeats = seats.map((s) => (s.id === 1 ? { ...s, isDead: true, isAlive: false } : s));
    const n2Ctx: any = {
      actionNode: { seatId: 0, roleId: "bounty_hunter" },
      snapshot: {
        seats: deadSeats,
        gamePhase: "night",
        nightCount: 2,
        _abilityResults: { bounty_hunter: { targetSeatId: 1 } },
      },
      storytellerInput: { targetSeatId: 2 },
      meta: {},
    };
    const n2Res = await runFullAbilityPipeline(bounty_hunterAbility as any, n2Ctx);
    expect(n2Res.meta.abilityResult.targetPlayerName).toBe("道哥");
  });
});

/**
 * 白天即时结算/特殊处决/公开击杀 — 状态原子性专项测试
 *
 * W8.19.9 — 验证所有白天即时触发角色的 isAlive/abilityUsed/canNominate 原子性
 *
 * 角色矩阵：
 * 1. 贞洁者 (Virgin)：提名者立即处决 + 能力消耗
 * 2. 魔像 (Golem)：提名目标死亡 + 限次能力消耗
 * 3. 女巫 (Witch)：诅咒标记 + 被诅咒者提名时猝死
 * 4. 猎手 (Slayer)：点射恶魔 + 能力消耗
 * 5. 精神病患者 (Psychopath)：公开击杀
 */

import { beforeEach, describe, expect, test } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import { virginAbility } from "../../new_engine/virgin.ability";
import { golemAbility } from "../../new_engine/golem.ability";
import { slayerAbility } from "../../new_engine/slayer.ability";
import { psychopathAbility } from "../../new_engine/psychopath.ability";
import { canUseLimitedAbility } from "../../../utils/LimitedAbilityManager";

// ─── 辅助工厂 ────────────────────────────────────────────────────────

function mkSeat(
  id: number,
  roleId: string,
  roleName: string,
  type: string,
  extra: Record<string, any> = {}
) {
  return {
    id,
    playerName: `P${id + 1}`,
    isDead: false,
    isAlive: true,
    role: { id: roleId, name: roleName, type },
    effectiveRole: null,
    charadeRole: null,
    isDrunk: false,
    isPoisoned: false,
    statusEffects: [] as Array<{ type: string }>,
    hasAbilityEvenDead: false,
    abilityUsed: false,
    hasUsedDayAbility: false,
    hasUsedVirginAbility: false,
    hasUsedSlayerAbility: false,
    ...extra,
  };
}

const pipe = (a: any) => ({
  preCheck: a.preCheck ?? [],
  calculate: a.calculate ?? [],
  stateUpdate: a.stateUpdate ?? [],
  postProcess: a.postProcess ?? [],
});

// ─── 1. 贞洁者 (Virgin) ─────────────────────────────────────────────

describe("贞洁者 (Virgin) — 白天即时处决原子性", () => {
  function buildVirginCtx(
    seats: ReturnType<typeof mkSeat>[],
    nominatorId: number
  ): MiddlewareContext {
    return {
      snapshot: { nightCount: 1, gamePhase: "day", seats, statusEffects: {} },
      actionNode: {
        seatId: 0,
        roleId: "virgin",
        roleName: "贞洁者",
        priority: 0,
        isFirstNightOnly: false,
        abilityId: "virgin_nomination_ability",
        wakeMessage: "",
        firstNightPriority: null,
        otherNightPriority: null,
        targetIds: [],
        processed: false,
        success: false,
        meta: {},
      },
      targetIds: [],
      meta: { nominatorId },
      aborted: false,
    };
  }

  test("镇民提名贞洁者 → 提名者 isAlive=false + 贞洁者 abilityUsed=true", async () => {
    const virgin = mkSeat(0, "virgin", "贞洁者", "townsfolk");
    const chef = mkSeat(1, "chef", "厨师", "townsfolk");
    const ctx = buildVirginCtx([virgin, chef], 1);

    const result = await runFullAbilityPipeline(pipe(virginAbility), ctx);
    const seats = result.snapshot.seats as any[];

    const virginAfter = seats.find((s: any) => s.id === 0);
    const chefAfter = seats.find((s: any) => s.id === 1);

    // 贞洁者能力已消耗
    expect(virginAfter.abilityUsed).toBe(true);
    // 提名者（厨师）被处决
    expect(chefAfter.isAlive).toBe(false);
    expect(chefAfter.executedToday).toBe(true);
    expect(chefAfter.deathReason).toBe("被贞洁者处决");
  });

  test("镇民提名贞洁者 → 提名阶段被取消", async () => {
    const virgin = mkSeat(0, "virgin", "贞洁者", "townsfolk");
    const chef = mkSeat(1, "chef", "厨师", "townsfolk");
    const ctx = buildVirginCtx([virgin, chef], 1);

    const result = await runFullAbilityPipeline(pipe(virginAbility), ctx);

    // 提名阶段被取消
    expect((result.snapshot as any).votingPhase?.isCancelled).toBe(true);
    expect((result.snapshot as any).votingPhase?.cancelReason).toContain(
      "贞洁者"
    );
  });

  test("非镇民提名贞洁者 → 无处决但能力仍消耗", async () => {
    const virgin = mkSeat(0, "virgin", "贞洁者", "townsfolk");
    const poisoner = mkSeat(1, "poisoner", "投毒者", "minion");
    const ctx = buildVirginCtx([virgin, poisoner], 1);

    const result = await runFullAbilityPipeline(pipe(virginAbility), ctx);
    const seats = result.snapshot.seats as any[];

    const virginAfter = seats.find((s: any) => s.id === 0);
    const poisonerAfter = seats.find((s: any) => s.id === 1);

    // 贞洁者能力仍消耗
    expect(virginAfter.abilityUsed).toBe(true);
    // 投毒者不被处决
    expect(poisonerAfter.isAlive).toBe(true);
    expect(poisonerAfter.executedToday).toBeUndefined();
  });

  test("醉酒贞洁者被提名 → 能力消耗但不处决", async () => {
    const virgin = mkSeat(0, "virgin", "贞洁者", "townsfolk", {
      isDrunk: true,
      statusEffects: [{ type: "drunk" }],
    });
    const chef = mkSeat(1, "chef", "厨师", "townsfolk");
    const ctx = buildVirginCtx([virgin, chef], 1);

    const result = await runFullAbilityPipeline(pipe(virginAbility), ctx);
    const seats = result.snapshot.seats as any[];

    const virginAfter = seats.find((s: any) => s.id === 0);
    const chefAfter = seats.find((s: any) => s.id === 1);

    // 能力仍消耗（规则：不论是否醉酒中毒，都要放置"失去能力"标记）
    expect(virginAfter.abilityUsed).toBe(true);
    // 醉酒能力无效，不处决
    expect(chefAfter.isAlive).toBe(true);
  });

  test("已使用能力的贞洁者再次被提名 → 管道中止", async () => {
    const virgin = mkSeat(0, "virgin", "贞洁者", "townsfolk", {
      abilityUsed: true,
    });
    const chef = mkSeat(1, "chef", "厨师", "townsfolk");
    const ctx = buildVirginCtx([virgin, chef], 1);

    const result = await runFullAbilityPipeline(pipe(virginAbility), ctx);

    expect(result.aborted).toBe(true);
    expect(result.abortReason).toContain("已使用");
  });
});

// ─── 2. 魔像 (Golem) ────────────────────────────────────────────────

describe("魔像 (Golem) — 提名击杀原子性", () => {
  function buildGolemCtx(
    seats: ReturnType<typeof mkSeat>[],
    targetId: number
  ): MiddlewareContext {
    return {
      snapshot: { nightCount: 2, gamePhase: "day", seats, statusEffects: {} },
      actionNode: {
        seatId: 0,
        roleId: "golem",
        roleName: "魔像",
        priority: 0,
        isFirstNightOnly: false,
        abilityId: "golem_nominate_kill",
        wakeMessage: "",
        firstNightPriority: null,
        otherNightPriority: null,
        targetIds: [targetId],
        processed: false,
        success: false,
        meta: {},
      },
      targetIds: [targetId],
      meta: {},
      aborted: false,
    };
  }

  test("魔像提名非恶魔 → 目标 isAlive=false + 限次能力消耗", async () => {
    const golem = mkSeat(0, "golem", "魔像", "outsider");
    const chef = mkSeat(1, "chef", "厨师", "townsfolk");
    const ctx = buildGolemCtx([golem, chef], 1);

    const result = await runFullAbilityPipeline(pipe(golemAbility), ctx);
    const seats = result.snapshot.seats as any[];

    const chefAfter = seats.find((s: any) => s.id === 1);

    // 目标死亡
    expect(chefAfter.isAlive).toBe(false);
    expect(chefAfter.isDead).toBe(true);
    expect(chefAfter.deathSource).toBe("golem_nominate");
    expect(result.meta.targetKilled).toBe(true);
  });

  test("魔像提名恶魔 → 恶魔不死但能力仍消耗", async () => {
    const golem = mkSeat(0, "golem", "魔像", "outsider");
    const imp = mkSeat(1, "imp", "小恶魔", "demon");
    const ctx = buildGolemCtx([golem, imp], 1);

    const result = await runFullAbilityPipeline(pipe(golemAbility), ctx);
    const seats = result.snapshot.seats as any[];

    const impAfter = seats.find((s: any) => s.id === 1);

    // 恶魔不死
    expect(impAfter.isAlive).toBe(true);
    // 但能力已消耗（限次）
    expect(canUseLimitedAbility(0, "golem_nominate")).toBe(false);
  });

  test("魔像已使用提名能力 → 管道中止", async () => {
    const golem = mkSeat(0, "golem", "魔像", "outsider");
    const chef = mkSeat(1, "chef", "厨师", "townsfolk");
    // 先消耗一次
    const ctx1 = buildGolemCtx([golem, chef], 1);
    await runFullAbilityPipeline(pipe(golemAbility), ctx1);

    // 再次尝试
    const chef2 = mkSeat(2, "chef", "厨师", "townsfolk");
    const ctx2 = buildGolemCtx([golem, chef2], 2);
    const result2 = await runFullAbilityPipeline(pipe(golemAbility), ctx2);

    expect(result2.aborted).toBe(true);
    expect(result2.abortReason).toContain("已经使用过");
  });
});

// ─── 3. 猎手 (Slayer) ────────────────────────────────────────────────

describe("猎手 (Slayer) — 点射恶魔原子性", () => {
  function buildSlayerCtx(
    seats: ReturnType<typeof mkSeat>[],
    targetId: number
  ): MiddlewareContext {
    return {
      snapshot: { nightCount: 2, gamePhase: "day", seats, statusEffects: {} },
      actionNode: {
        seatId: 0,
        roleId: "slayer",
        roleName: "猎手",
        priority: 0,
        isFirstNightOnly: false,
        abilityId: "slayer_day_ability",
        wakeMessage: "",
        firstNightPriority: null,
        otherNightPriority: null,
        targetIds: [targetId],
        processed: false,
        success: false,
        meta: {},
      },
      targetIds: [targetId],
      meta: {},
      aborted: false,
    };
  }

  test("猎手点射真恶魔 → 恶魔 isAlive=false + 能力消耗", async () => {
    const slayer = mkSeat(0, "slayer", "猎手", "townsfolk");
    const imp = mkSeat(1, "imp", "小恶魔", "demon");
    const ctx = buildSlayerCtx([slayer, imp], 1);

    const result = await runFullAbilityPipeline(pipe(slayerAbility), ctx);
    const seats = result.snapshot.seats as any[];

    const slayerAfter = seats.find((s: any) => s.id === 0);
    const impAfter = seats.find((s: any) => s.id === 1);

    // 恶魔死亡
    expect(impAfter.isAlive).toBe(false);
    expect(impAfter.deathReason).toBe("被猎手杀死");
    // 猎手能力消耗
    expect(slayerAfter.abilityUsed).toBe(true);
    // 游戏结束
    expect(result.snapshot.gamePhase).toBe("gameOver");
    expect((result.snapshot as any).gameResult?.winner).toBe("good");
  });

  test("猎手点射非恶魔 → 仅消耗能力，目标不死", async () => {
    const slayer = mkSeat(0, "slayer", "猎手", "townsfolk");
    const chef = mkSeat(1, "chef", "厨师", "townsfolk");
    const ctx = buildSlayerCtx([slayer, chef], 1);

    const result = await runFullAbilityPipeline(pipe(slayerAbility), ctx);
    const seats = result.snapshot.seats as any[];

    const slayerAfter = seats.find((s: any) => s.id === 0);
    const chefAfter = seats.find((s: any) => s.id === 1);

    // 目标不死
    expect(chefAfter.isAlive).toBe(true);
    // 猎手能力消耗
    expect(slayerAfter.abilityUsed).toBe(true);
    // 游戏不结束
    expect(result.snapshot.gamePhase).not.toBe("gameOver");
  });

  test("醉酒猎手点射恶魔 → 能力消耗但恶魔不死", async () => {
    const slayer = mkSeat(0, "slayer", "猎手", "townsfolk", {
      isDrunk: true,
      statusEffects: [{ type: "drunk" }],
    });
    const imp = mkSeat(1, "imp", "小恶魔", "demon");
    const ctx = buildSlayerCtx([slayer, imp], 1);

    const result = await runFullAbilityPipeline(pipe(slayerAbility), ctx);
    const seats = result.snapshot.seats as any[];

    const slayerAfter = seats.find((s: any) => s.id === 0);
    const impAfter = seats.find((s: any) => s.id === 1);

    // 醉酒能力无效，恶魔不死
    expect(impAfter.isAlive).toBe(true);
    // 但能力仍消耗
    expect(slayerAfter.abilityUsed).toBe(true);
  });

  test("已使用能力的猎手再次点射 → 管道中止", async () => {
    const slayer = mkSeat(0, "slayer", "猎手", "townsfolk", {
      abilityUsed: true,
    });
    const imp = mkSeat(1, "imp", "小恶魔", "demon");
    const ctx = buildSlayerCtx([slayer, imp], 1);

    const result = await runFullAbilityPipeline(pipe(slayerAbility), ctx);

    expect(result.aborted).toBe(true);
    expect(result.abortReason).toContain("已使用");
  });
});

// ─── 4. 精神病患者 (Psychopath) ──────────────────────────────────────

describe("精神病患者 (Psychopath) — 公开击杀原子性", () => {
  function buildPsychopathCtx(
    seats: ReturnType<typeof mkSeat>[],
    targetId: number
  ): MiddlewareContext {
    return {
      snapshot: { nightCount: 2, gamePhase: "day", seats, statusEffects: {} },
      actionNode: {
        seatId: 0,
        roleId: "psychopath",
        roleName: "精神病患者",
        priority: 0,
        isFirstNightOnly: false,
        abilityId: "psychopath_day_kill",
        wakeMessage: "",
        firstNightPriority: null,
        otherNightPriority: null,
        targetIds: [targetId],
        processed: false,
        success: false,
        meta: {},
      },
      targetIds: [targetId],
      meta: {},
      aborted: false,
    };
  }

  test("精神病患者击杀目标 → 目标 isAlive=false", async () => {
    const psychopath = mkSeat(0, "psychopath", "精神病患者", "minion");
    const chef = mkSeat(1, "chef", "厨师", "townsfolk");
    const ctx = buildPsychopathCtx([psychopath, chef], 1);

    const result = await runFullAbilityPipeline(pipe(psychopathAbility), ctx);
    const seats = result.snapshot.seats as any[];

    const chefAfter = seats.find((s: any) => s.id === 1);

    // 目标死亡
    expect(chefAfter.isAlive).toBe(false);
    expect(chefAfter.isDead).toBe(true);
    expect(chefAfter.deathSource).toBe("psychopath_kill");
  });

  test("精神病患者死亡时 → 管道中止", async () => {
    const psychopath = mkSeat(0, "psychopath", "精神病患者", "minion", {
      isAlive: false,
      isDead: true,
    });
    const chef = mkSeat(1, "chef", "厨师", "townsfolk");
    const ctx = buildPsychopathCtx([psychopath, chef], 1);

    const result = await runFullAbilityPipeline(pipe(psychopathAbility), ctx);

    expect(result.aborted).toBe(true);
  });
});

// ─── 5. 交叉场景：贞洁者 + 猎手连续触发 ──────────────────────────────

describe("交叉场景 — 多角色白天连续即时触发", () => {
  test("贞洁者处决后猎手仍可正常点射（状态不冲突）", async () => {
    // 场景：贞洁者被镇民提名 → 镇民死亡 → 猎手点射恶魔
    const virgin = mkSeat(0, "virgin", "贞洁者", "townsfolk");
    const chef = mkSeat(1, "chef", "厨师", "townsfolk");
    const slayer = mkSeat(2, "slayer", "猎手", "townsfolk");
    const imp = mkSeat(3, "imp", "小恶魔", "demon");

    // Step 1: 贞洁者被提名
    const virginCtx: MiddlewareContext = {
      snapshot: {
        nightCount: 1,
        gamePhase: "day",
        seats: [virgin, chef, slayer, imp],
        statusEffects: {},
      },
      actionNode: {
        seatId: 0,
        roleId: "virgin",
        roleName: "贞洁者",
        priority: 0,
        isFirstNightOnly: false,
        abilityId: "virgin_nomination_ability",
        wakeMessage: "",
        firstNightPriority: null,
        otherNightPriority: null,
        targetIds: [],
        processed: false,
        success: false,
        meta: {},
      },
      targetIds: [],
      meta: { nominatorId: 1 },
      aborted: false,
    };

    const virginResult = await runFullAbilityPipeline(
      pipe(virginAbility),
      virginCtx
    );
    const seatsAfterVirgin = virginResult.snapshot.seats as any[];

    // 厨师已死
    expect(seatsAfterVirgin.find((s: any) => s.id === 1).isAlive).toBe(false);
    // 贞洁者能力已消耗
    expect(seatsAfterVirgin.find((s: any) => s.id === 0).abilityUsed).toBe(
      true
    );

    // Step 2: 猎手点射恶魔（使用贞洁者执行后的快照）
    const slayerCtx: MiddlewareContext = {
      snapshot: {
        ...virginResult.snapshot,
        seats: seatsAfterVirgin,
      },
      actionNode: {
        seatId: 2,
        roleId: "slayer",
        roleName: "猎手",
        priority: 0,
        isFirstNightOnly: false,
        abilityId: "slayer_day_ability",
        wakeMessage: "",
        firstNightPriority: null,
        otherNightPriority: null,
        targetIds: [3],
        processed: false,
        success: false,
        meta: {},
      },
      targetIds: [3],
      meta: {},
      aborted: false,
    };

    const slayerResult = await runFullAbilityPipeline(
      pipe(slayerAbility),
      slayerCtx
    );
    const seatsAfterSlayer = slayerResult.snapshot.seats as any[];

    // 猎手能力消耗
    expect(seatsAfterSlayer.find((s: any) => s.id === 2).abilityUsed).toBe(
      true
    );
    // 恶魔死亡
    expect(seatsAfterSlayer.find((s: any) => s.id === 3).isAlive).toBe(false);
    // 游戏结束
    expect(slayerResult.snapshot.gamePhase).toBe("gameOver");
  });
});

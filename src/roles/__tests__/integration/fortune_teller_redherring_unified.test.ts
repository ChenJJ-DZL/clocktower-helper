import { describe, expect, it } from "vitest";
import { fortuneTellerAbility } from "../../new_engine/fortune_teller.ability";
import { fortuneTellerBoonManager } from "../../../utils/FortuneTellerBoonManager";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";

/**
 * 占卜师「天敌红罗刹」单一事实来源（回归）。
 *
 * 背景（2026-09-14 用户实测）：
 *  工程里同时存在**两套彼此独立**的红罗刹机制 ——
 *  ① 座位标记 `isRedHerring` / `isFortuneTellerRedHerring`（useGameFlow 开局写、说书人可见、会存档）
 *  ② 内存 Map `fortuneTellerBoonManager`（占卜师能力内部**又自己随机挑一次**、说书人不可见、不存档）
 *  官方只允许**恰好 1 名**天敌红罗刹 → 两套各自随机必然打架。
 *
 * 本文件先钉死"两套必须收敛到同一个座位"，再断言实现细节。
 *
 * ⚠️ 夹具铁律：只喂**生产真的会写的**状态。座位标记由生产在开局写入，
 * 本测试即模拟"开局已经写好了 N 号是天敌"这一真实前提。
 */

function makeSeat(
  id: number,
  roleId: string,
  roleName: string,
  roleType: string,
  extra: Record<string, unknown> = {}
) {
  return {
    id,
    playerName: "玩家" + (id + 1),
    isDead: false,
    role: { id: roleId, name: roleName, type: roleType },
    statusEffects: [],
    ...extra,
  };
}

/**
 * 一副最小牌局：
 *  0 号占卜师 / 1 厨师 / 2 士兵 / 3 圣徒（=说书人钦定的天敌红罗刹）
 *  / 4 投毒者 / 5 小恶魔
 */
const makeSeats = (redHerringSeatId: number | null) =>
  [
    makeSeat(0, "fortune_teller", "占卜师", "townsfolk"),
    makeSeat(1, "chef", "厨师", "townsfolk"),
    makeSeat(2, "soldier", "士兵", "townsfolk"),
    makeSeat(3, "saint", "圣徒", "outsider"),
    makeSeat(4, "poisoner", "投毒者", "minion"),
    makeSeat(5, "imp", "小恶魔", "demon"),
  ].map((s) =>
    s.id === redHerringSeatId
      ? {
          ...s,
          isRedHerring: true,
          isFortuneTellerRedHerring: true,
          statusDetails: ["天敌红罗剎"],
        }
      : s
  );

function makeContext(opts: {
  seats: ReturnType<typeof makeSeats>;
  gameId: string;
  targetIds: number[];
  nightCount?: number;
}): MiddlewareContext {
  return {
    snapshot: {
      nightCount: opts.nightCount ?? 1,
      gamePhase: "firstNight",
      seats: opts.seats,
      statusEffects: {},
      gameId: opts.gameId,
    },
    actionNode: {
      seatId: 0,
      roleId: "fortune_teller",
      roleName: "占卜师",
      priority: 57,
      isFirstNightOnly: false,
      abilityId: "fortune_teller_night_ability",
      wakeMessage: "占卜师",
      firstNightPriority: 57,
      otherNightPriority: 91,
      targetIds: opts.targetIds,
      processed: false,
      success: false,
      meta: {},
    },
    targetIds: opts.targetIds,
    meta: {},
    aborted: false,
    preview: false,
  };
}

async function run(opts: {
  seats: ReturnType<typeof makeSeats>;
  gameId: string;
  targetIds: number[];
}) {
  return runFullAbilityPipeline(
    {
      preCheck: fortuneTellerAbility.preCheck,
      calculate: fortuneTellerAbility.calculate,
      stateUpdate: fortuneTellerAbility.stateUpdate,
      postProcess: fortuneTellerAbility.postProcess,
    },
    makeContext(opts)
  );
}

const uniqueGameId = (tag: string) =>
  `ft-redherring-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

describe("占卜师天敌红罗刹：两套机制必须收敛为同一个座位（回归）", () => {
  it("① 说书人已在开局把 3 号标记为天敌 → 占卜 3 号必须报「有」", async () => {
    const gameId = uniqueGameId("marked-hit");
    const seats = makeSeats(3);
    // 3 号（圣徒/善良）与 1 号（厨师/善良）都没有恶魔
    const ctx = await run({ seats, gameId, targetIds: [3, 1] });
    expect(ctx.meta.abilityResult).toBe(true);
  });

  it("② 说书人标记了 3 号 → 占卜纯净的 1+2 号必须报「无」", async () => {
    const gameId = uniqueGameId("marked-miss");
    const seats = makeSeats(3);
    const ctx = await run({ seats, gameId, targetIds: [1, 2] });
    expect(ctx.meta.abilityResult).toBe(false);
  });

  it("③ 内部 Boon 不得偏离说书人标记的座位（否则会出现第 2 名「假恶魔」）", async () => {
    const gameId = uniqueGameId("boon-align");
    const seats = makeSeats(3);
    await run({ seats, gameId, targetIds: [3, 1] });
    // 关键断言：内存 Boon 必须等于说书人标记的座位，而不是自己另随机一个
    expect(fortuneTellerBoonManager.getCurrentBoon(gameId)).toBe(3);
  });

  it("④ 说书人标记在 3 号 → 占卜「3 号 + 真恶魔 5 号」仍为「有」（不得因重复而抵消）", async () => {
    const gameId = uniqueGameId("marked-plus-demon");
    const seats = makeSeats(3);
    const ctx = await run({ seats, gameId, targetIds: [3, 5] });
    expect(ctx.meta.abilityResult).toBe(true);
  });

  it("⑤ 未标记天敌时不报假恶魔（无占卜师红罗刹的纯净局面）", async () => {
    const gameId = uniqueGameId("no-marker");
    const seats = makeSeats(null);
    const ctx = await run({ seats, gameId, targetIds: [1, 2] });
    expect(ctx.meta.abilityResult).toBe(false);
  });

  it("⑥ 说书人显式指定 boonSeatId 优先于座位标记（手动覆盖通道保留）", async () => {
    const gameId = uniqueGameId("explicit");
    const seats = makeSeats(3);
    const ctx = await runFullAbilityPipeline(
      {
        preCheck: fortuneTellerAbility.preCheck,
        calculate: fortuneTellerAbility.calculate,
        stateUpdate: fortuneTellerAbility.stateUpdate,
        postProcess: fortuneTellerAbility.postProcess,
      },
      {
        ...makeContext({ seats, gameId, targetIds: [2, 1] }),
        storytellerInput: { boonSeatId: 2 },
      }
    );
    expect(fortuneTellerBoonManager.getCurrentBoon(gameId)).toBe(2);
    expect(ctx.meta.abilityResult).toBe(true);
  });

  it("⑦ 每局只允许 1 名天敌：标记座位被占后不再产生第二个", async () => {
    const gameId = uniqueGameId("single");
    const seats = makeSeats(3);
    await run({ seats, gameId, targetIds: [3, 1] });
    const flagged = seats.filter(
      (s: any) => s.isRedHerring || s.isFortuneTellerRedHerring
    );
    expect(flagged).toHaveLength(1);
    expect(flagged[0].id).toBe(3);
  });
});

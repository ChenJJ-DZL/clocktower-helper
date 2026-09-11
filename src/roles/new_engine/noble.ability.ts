/**
 * 贵族（Noble）新引擎技能实现
 *
 * 【角色能力】"在你的首个夜晚，你会得知三名玩家，其中一名是邪恶的。"
 *
 * 首夜获得信息，被告知三名玩家中有一名是邪恶阵营。
 * 醉酒/中毒时可能得知三名全善良或虚假信息。
 */
import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  createDeterministicRandom,
  type DeterministicRandom,
  nightInfoSeed,
} from "../core/deterministicRandom";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

interface NobleInfo {
  seat1: number;
  seat2: number;
  seat3: number;
}

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const seat = ctx.snapshot.seats.find(
    (s: any) => s.id === ctx.actionNode.seatId
  );
  if (!seat?.isAlive) return { ...ctx, aborted: true, abortReason: "已死亡" };
  const effects =
    seat.statusEffects ?? ctx.snapshot.statusEffects?.[seat.id] ?? [];
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      isPoisoned: effects.some(
        (e: any) => e.type === "poisoned" || e.type === "drunk"
      ),
    },
  };
};

const firstNightCheck = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const nc = ctx.snapshot.nightCount ?? 0;
  if (nc !== 1 && ctx.snapshot.gamePhase !== "firstNight")
    return { ...ctx, aborted: true, abortReason: "非首夜" };
  return ctx;
};

/** Fisher-Yates 洗牌（用 rng 而非 Math.random，保证预演/执行结果一致） */
export function shuffleWith<T>(
  arr: T[],
  rng: DeterministicRandom = Math.random
): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * 计算贵族可用的候选池（排除自身与死亡玩家）。
 * evilCandidates 含真实邪恶 + 默认注册为邪恶的陌客；
 * goodCandidates 含真实善良 + 默认注册为善良的间谍。
 */
export function getNobleCandidates(seats: any[], selfSeatId: number) {
  const pool = seats.filter((s: any) => s.id !== selfSeatId && !s.isDead);

  const evilCandidates = pool.filter((s: any) => {
    if (s.role?.id === "recluse") {
      return s.registerAsEvil !== false;
    }
    if (s.role?.id === "spy") {
      return s.registerAsEvil === true;
    }
    return (
      (s.role && (s.role.type === "minion" || s.role.type === "demon")) ||
      !!s.isEvilConverted
    );
  });

  const goodCandidates = pool.filter((s: any) => {
    if (s.role?.id === "recluse") {
      return s.registerAsEvil === false;
    }
    if (s.role?.id === "spy") {
      return s.registerAsGood !== false && s.registerAsEvil !== true;
    }
    return (
      s.role &&
      (s.role.type === "townsfolk" || s.role.type === "outsider") &&
      !s.isEvilConverted
    );
  });

  return { pool, evilCandidates, goodCandidates };
}

/**
 * 选出告知贵族的三名玩家。
 *
 * 抽取 rng 参数：同一夜同一角色的「提示预演」与「实际执行」必须选中同一组
 * 玩家，否则说书人照提示念的三人与结果弹窗 / 魔典标记对不上。
 */
export function selectNobleTrio(
  seats: any[],
  selfSeatId: number,
  isCorrupted: boolean,
  rng: DeterministicRandom = Math.random
): any[] {
  const { pool, evilCandidates, goodCandidates } = getNobleCandidates(
    seats,
    selfSeatId
  );

  let chosen: any[] = [];

  if (isCorrupted || evilCandidates.length === 0 || goodCandidates.length < 2) {
    // 严格保证选出的 3 人中邪恶玩家数量 != 1（0 邪或 >=2 邪），绝对杜绝真信息穿透
    if (goodCandidates.length >= 3) {
      chosen = shuffleWith(goodCandidates, rng).slice(0, 3);
    } else if (evilCandidates.length >= 2 && goodCandidates.length >= 1) {
      const shuffledEvil = shuffleWith(evilCandidates, rng);
      const shuffledGood = shuffleWith(goodCandidates, rng);
      chosen = shuffleWith(
        [shuffledEvil[0], shuffledEvil[1], shuffledGood[0]],
        rng
      );
    } else {
      let attempts = 0;
      let valid = false;
      while (attempts < 30 && !valid) {
        attempts++;
        const trio = shuffleWith(pool, rng).slice(0, 3);
        const evilCount = trio.filter((s) =>
          evilCandidates.some((e) => e.id === s.id)
        ).length;
        if (evilCount !== 1) {
          chosen = trio;
          valid = true;
        }
      }
      if (!valid) {
        chosen = [...pool].slice(0, 3);
      }
    }
  } else {
    const shuffledEvil = shuffleWith(evilCandidates, rng);
    const shuffledGood = shuffleWith(goodCandidates, rng);
    chosen = shuffleWith([shuffledEvil[0], shuffledGood[0], shuffledGood[1]], rng);
  }

  return chosen;
}

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const hasVortox =
    Boolean(
      ctx.snapshot.globalEffects?.vortoxWorld ??
        (ctx.snapshot as any).vortoxWorld ??
        (ctx.snapshot as any).isVortoxWorld
    ) ||
    ctx.snapshot.seats.some(
      (s: any) => s.role?.id === "vortox" && !s.isDead
    );

  const isCorrupted =
    Boolean(ctx.meta.isPoisoned) ||
    Boolean(ctx.meta.isDrunk) ||
    ctx.meta.abilityEffective === false ||
    hasVortox;

  // 🎲 确定性随机：同一夜、同一角色的重复计算（提示预演 / 实际执行）必须一致
  const rng = createDeterministicRandom(
    nightInfoSeed("noble", ctx.actionNode.seatId, ctx.snapshot.nightCount ?? 1)
  );

  const chosen = selectNobleTrio(
    ctx.snapshot.seats,
    ctx.actionNode.seatId,
    isCorrupted,
    rng
  );

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        seat1: chosen[0]?.id ?? 0,
        seat2: chosen[1]?.id ?? 0,
        seat3: chosen[2]?.id ?? 0,
      },
      isCorrupted: ctx.meta.isPoisoned,
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as NobleInfo | undefined;
  if (!r) return ctx;
  return {
    ...ctx,
    actionNode: {
      ...ctx.actionNode,
      meta: { ...ctx.actionNode.meta, nobleResult: r },
    },
    snapshot: {
      ...ctx.snapshot,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        noble: r,
      },
    },
    meta: { ...ctx.meta, nobleResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as NobleInfo | undefined;
  if (!r?.seat1) return ctx;
  const tag = ctx.meta.isCorrupted ? "【受干扰】" : "";
  const log = `[Noble]${tag} 得知三名玩家中含一名邪恶: ${r.seat1 + 1}号, ${r.seat2 + 1}号, ${r.seat3 + 1}号`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【贵族】，告知${r.seat1 + 1}、${r.seat2 + 1}、${r.seat3 + 1}号中含一名邪恶。`,
      abilityLog: `贵族${tag}得知三名玩家中有一名邪恶`,
      displayInfo: {
        type: "noble_info",
        players: [r.seat1, r.seat2, r.seat3],
        log,
        isCorrupted: ctx.meta.isCorrupted,
      },
    },
  };
};

export const nobleAbility = createRoleAbility({
  roleId: "noble",
  abilityId: "noble_first_night_ability",
  abilityName: "贵族探测",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT],
  firstNightPriority: 66,
  otherNightPriority: null,
  firstNightOnly: true,
  wakePromptId: "role.noble.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck, firstNightCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

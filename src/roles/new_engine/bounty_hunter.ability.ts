/**
 * 赏金猎人（Bounty Hunter）新引擎技能实现
 *
 * 官方 Wiki（罂粟花开 1:1 规格书）：
 *   1. 设置调整阶段：会有一名镇民转变为邪恶阵营（[会有一名镇民转变为邪恶阵营]）。
 *   2. 首夜：得知一名邪恶玩家。
 *   3. 得知玩家死亡时：每当你得知的玩家死亡，你会在当晚得知另一名邪恶玩家
 *      （不能重复告知同一人）。
 *
 * 实现要点：
 *   - setupConfig.bountyHunterEvilConvertedId 记录被转邪恶的镇民 seatId
 *   - snapshot.bountyHunterKnownTargets: number[]  维护已告知列表
 *   - 死亡轮转：由 useNightEngine 在 deadThisNight 结算时注入新 actionNode，
 *     并设 ctx.meta.isRotationTrigger = true
 */
import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

// 计算阶段：选择一名邪恶玩家（支持转邪恶镇民、说书人指定输入、首夜及后续击杀死亡轮转）
const calculateResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const isActive = ctx.meta.abilityEffective !== false;
  const storytellerTarget =
    ctx.storytellerInput?.targetSeatId ??
    ctx.storytellerInput?.targetId ??
    ctx.storytellerInput?.overrideResult;

  const knownTargets: number[] =
    (ctx.snapshot as any).bountyHunterKnownTargets ?? [];

  let targetId: number | null = null;

  if (storytellerTarget !== undefined && storytellerTarget !== null) {
    targetId = Number(storytellerTarget);
  } else {
    // 排除：自己 + 已告知 + （默认）已死亡
    const aliveEvils = ctx.snapshot.seats.filter(
      (s: any) =>
        s.isAlive &&
        s.id !== ctx.actionNode.seatId &&
        s.role &&
        !knownTargets.includes(s.id) &&
        (s.role.type === "minion" ||
          s.role.type === "demon" ||
          s.isEvilConverted ||
          s.alignment === "evil")
    );

    if (!isActive) {
      // 醉酒/中毒：从善良存活玩家中选目标（虚假信息）
      const goodOnes = ctx.snapshot.seats.filter(
        (s: any) =>
          s.isAlive &&
          s.id !== ctx.actionNode.seatId &&
          s.role &&
          !s.isEvilConverted &&
          s.alignment !== "evil" &&
          (s.role.type === "townsfolk" || s.role.type === "outsider")
      );
      if (goodOnes.length > 0) {
        targetId = goodOnes[Math.floor(Math.random() * goodOnes.length)].id;
      }
    }

    // 如果未选中（正常情况或虚假失败），从邪恶玩家中随机选
    if (targetId === null && aliveEvils.length > 0) {
      targetId = aliveEvils[Math.floor(Math.random() * aliveEvils.length)].id;
    }
  }

  const targetSeat =
    targetId !== null
      ? ctx.snapshot.seats.find((s: any) => s.id === targetId)
      : null;

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetId,
        targetSeatId: targetId,
        targetPlayerName:
          targetSeat?.playerName ??
          (targetId !== null ? `${targetId + 1}号` : null),
        evilFound: targetId !== null,
        isRotationTrigger: (ctx.meta as any).isRotationTrigger === true,
      },
      isCorrupted: !isActive,
    },
  };
};

// 保存结果到快照
const saveResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  let updatedSeats = ctx.snapshot.seats;
  if (r?.targetId != null) {
    // 把新目标加入 knownTargets（避免重复告知）
    const knownTargets: number[] =
      (ctx.snapshot as any).bountyHunterKnownTargets ?? [];
    const nextKnown = knownTargets.includes(r.targetId)
      ? knownTargets
      : [...knownTargets, r.targetId];

    updatedSeats = ctx.snapshot.seats.map((s: any) => {
      if (s.id === r.targetId) {
        const details = s.statusDetails || [];
        return {
          ...s,
          statusDetails: details.includes("赏金已知")
            ? details
            : [...details, "赏金已知"],
        };
      }
      return s;
    });

    return {
      ...ctx,
      snapshot: {
        ...ctx.snapshot,
        seats: updatedSeats,
        bountyHunterKnownTargets: nextKnown,
        _abilityResults: {
          ...((ctx.snapshot as any)._abilityResults ?? {}),
          bounty_hunter: r,
        },
      },
      meta: { ...ctx.meta, bountyHunterResult: r },
    };
  }
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      seats: updatedSeats,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        bounty_hunter: r,
      },
    },
    meta: { ...ctx.meta, bountyHunterResult: r },
  };
};

// 日志输出
const logResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const tag = ctx.meta.isCorrupted ? "【受干扰】" : "";
  const rot = r?.isRotationTrigger ? "（死亡轮转）" : "";
  const log =
    r?.targetId != null
      ? `[BountyHunter]${tag}${rot} 得知 ${r.targetId + 1}号是邪恶玩家`
      : "[BountyHunter] 未发现邪恶玩家";
  console.log(log);
  return { ...ctx, meta: { ...ctx.meta, abilityLog: log } };
};

export const bounty_hunterAbility = createRoleAbility({
  roleId: "bounty_hunter",
  abilityId: "bounty_hunter_reveal",
  abilityName: "悬赏猎杀",
  triggerTiming: [
    AbilityTriggerTiming.FIRST_NIGHT,
    AbilityTriggerTiming.EVERY_NIGHT,
  ],
  firstNightPriority: 72,
  otherNightPriority: 105,
  firstNightOnly: false,
  wakePromptId: "role.bounty_hunter.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [commonPreCheckAlive],
  calculate: [calculateResult],
  stateUpdate: [saveResult],
  postProcess: [logResult],
});

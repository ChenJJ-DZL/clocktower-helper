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

    // 如果未选中（正常情况或虚假失败），从邪恶玩家中选择：
    // 🎯 规则：只要有其他邪恶玩家在场，优先得知非恶魔的其他玩家（爪牙、转邪恶镇民等），避免开局直接暴露恶魔
    if (targetId === null && aliveEvils.length > 0) {
      const nonDemonEvils = aliveEvils.filter(
        (s: any) => s.role?.type !== "demon"
      );
      const pool = nonDemonEvils.length > 0 ? nonDemonEvils : aliveEvils;
      targetId = pool[Math.floor(Math.random() * pool.length)].id;
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

// 日志输出与 UI 展示信息
const logResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const tag = ctx.meta.isCorrupted ? "【受干扰】" : "";
  const rot = r?.isRotationTrigger ? "（死亡轮转）" : "";
  const selfSeatId = ctx.actionNode.seatId;

  let abilityLog = "";
  let prompt = "";

  if (r?.targetId != null) {
    abilityLog = `赏金猎人${tag}${rot}得知：${r.targetId + 1}号玩家是邪恶的`;
    prompt = `唤醒${selfSeatId + 1}号【赏金猎人】，指向${r.targetId + 1}号玩家（告诉他${r.targetId + 1}号玩家是邪恶的）。`;
  } else {
    abilityLog = `赏金猎人${tag}${rot}未发现邪恶玩家`;
    prompt = `唤醒${selfSeatId + 1}号【赏金猎人】，未发现新的邪恶玩家。`;
  }

  console.log(`[BountyHunter] ${abilityLog}`);

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityLog,
      prompt,
      displayInfo: {
        type: "bounty_hunter_info",
        targetId: r?.targetId,
        targetPlayerName: r?.targetPlayerName,
        isCorrupted: ctx.meta.isCorrupted ?? false,
        isRotationTrigger: r?.isRotationTrigger ?? false,
        log: abilityLog,
      },
    },
  };
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

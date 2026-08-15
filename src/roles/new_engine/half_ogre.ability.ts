/**
 * 半兽人（Half-Ogre/Lycanthrope）新引擎技能实现
 *
 * 每个夜晚*，你要选择一名存活玩家：如果他是善良的，他死亡，并且当晚恶魔不会造成死亡。
 * 会有一名善良玩家始终被当作邪恶阵营。
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import { createSettlementPostProcess } from "../../utils/abilitySettlement";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

// 前置校验：检查是否为除首夜外的夜晚
const preCheckNightExceptFirst = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot } = context;

  if (snapshot.nightCount === 1) {
    return {
      ...context,
      aborted: true,
      abortReason: "半兽人首夜不行动",
    };
  }

  return context;
};

// 计算半兽人攻击结果
const calculateAttackResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, targetIds } = context;
  const targetId = targetIds[0];
  const targetSeat = snapshot.seats.find((s) => s.id === targetId);

  if (targetSeat) {
    // 判断目标阵营（考虑失足效果的逻辑在更高层处理）
    const isTargetEvil = targetSeat.role.alignment === "evil";

    // 计算结果
    const shouldKill = !isTargetEvil;

    return {
      ...context,
      meta: {
        ...context.meta,
        targetId,
        isTargetEvil,
        shouldKill,
      },
    };
  }

  return context;
};

// 状态落地：善良目标死亡（标记落地，黎明由 UI/settleDawn 结算 isDead）
const stateUpdateAttack = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta, snapshot } = context;
  const targetId = meta.targetId;
  if (targetId == null) return context;
  if (meta.shouldKill !== true) return context;

  const seats = (snapshot.seats ?? []) as any[];
  const targetIdx = seats.findIndex((s) => s.id === targetId);
  if (targetIdx < 0) return context;
  const target = seats[targetIdx];
  if (target.isDead || target.markedForDeath) return context;

  const nextSeats = [...seats];
  nextSeats[targetIdx] = {
    ...target,
    markedForDeath: true,
    diedAtNight: snapshot.nightCount,
    deathSource: "half_ogre_attack",
    deathSourceSeatId: context.actionNode.seatId,
  };
  return {
    ...context,
    snapshot: {
      ...snapshot,
      seats: nextSeats,
      lastKill: {
        demonId: context.actionNode.seatId,
        targetId,
        demonRole: "half_ogre",
      },
    },
  };
};

export const halfOgreAbility = createRoleAbility({
  roleId: "half_ogre",
  effectSemantics: "kill",
  abilityId: "half_ogre_night_attack",
  abilityName: "夜晚攻击",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: null,
  otherNightPriority: 44, // 需要在恶魔之前行动
  firstNightOnly: false,
  wakePromptId: "role.half_ogre.wake",
  targetConfig: {
    min: 1,
    max: 1,
    allowSelf: true, // 半兽人可以选择自己
    allowDead: false,
  },
  preCheck: [commonPreCheckAlive, preCheckNightExceptFirst],
  calculate: [calculateAttackResult],
  stateUpdate: [stateUpdateAttack],
  postProcess: [
    async (context) => {
      console.log(
        `半兽人攻击了玩家 ${context.meta.targetId}，判断为 ${
          context.meta.isTargetEvil ? "邪恶" : "善良"
        }，${context.meta.shouldKill ? "会" : "不会"}造成死亡`
      );
      return context;
    },
    // 🔧 结算产物（此前缺失 → I9 违规）
    createSettlementPostProcess("半兽人", { resultType: "half_ogre_attack" }),
  ],
});

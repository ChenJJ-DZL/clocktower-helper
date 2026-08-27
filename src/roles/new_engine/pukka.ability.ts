/**
 * 普卡（Pukka）新引擎技能实现
 */

import { createSettlementPostProcess } from "../../utils/abilitySettlement";
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import type { GameStateSnapshot } from "../../utils/nightStateMachine";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// 前置校验：检查是否存活
const preCheckAlive = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode } = context;
  const seat = snapshot.seats.find((s) => s.id === actionNode.seatId);

  if (!seat?.isAlive) {
    return {
      ...context,
      aborted: true,
      abortReason: "普卡已死亡，技能失效",
    };
  }

  return context;
};

// 计算阶段：验证目标合法性
const calculatePoisonTargets = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, targetIds, actionNode } = context;

  if (!targetIds || targetIds.length === 0) {
    return {
      ...context,
      aborted: true,
      abortReason: "普卡必须选择一名玩家",
    };
  }

  const targetId = targetIds[0];
  const targetSeat = snapshot.seats.find((s) => s.id === targetId);

  if (!targetSeat) {
    return {
      ...context,
      aborted: true,
      abortReason: "目标玩家不存在",
    };
  }

  if (!targetSeat.isAlive) {
    return {
      ...context,
      aborted: true,
      abortReason: "不能选择已死亡的玩家",
    };
  }

  // 检查保护机制
  const isProtected =
    targetSeat.statusEffects?.some((e: any) => e.type === "protected") ||
    (targetSeat as any).protectedByInnkeeper === true;

  return {
    ...context,
    meta: { ...context.meta, targetId, isProtected },
  };
};

// 状态更新：使目标中毒
const updatePoisonState = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta } = context;
  const { targetId, isProtected } = meta as {
    targetId: number;
    isProtected: boolean;
  };

  if (isProtected) {
    return context; // 目标被保护，不中毒
  }

  // 生成新的状态快照（不可变）
  const newSnapshot: GameStateSnapshot = {
    ...snapshot,
    seats: snapshot.seats.map((seat) => {
      // 🔧 修复（引擎 P0）：普卡两阶段机制——"上个因你中毒的玩家死亡"。
      //   原实现只下毒不结算死亡，导致毒发永远不发生（夜晚报告永远平安夜）。
      //   官方规则：普卡每晚选一名玩家中毒；之前中毒的玩家在普卡下次攻击后死亡。
      //   此处：1) 旧中毒目标标记死亡（若仍存活） 2) 清除其普卡中毒标记（毒发后恢复健康）
      // 旧中毒目标识别：statusDetails 字符串"普卡中毒"或对象 {source:"pukka"}
      const oldPoison = (seat.statusDetails || []).some((d: any) => {
        if (typeof d === "string") return d.includes("普卡中毒");
        return d?.source === "pukka";
      });
      if (oldPoison && !seat.isDead) {
        return {
          ...seat,
          isAlive: false,
          isDead: true,
          markedForDeath: true,
          diedAtNight: snapshot.nightCount,
          killedBy: "pukka",
          deathSource: "pukka_poison_death",
          deathSourceSeatId: (context.actionNode as any)?.seatId ?? null,
          // 清除普卡中毒标记（毒发后恢复健康）
          statusDetails: (seat.statusDetails || []).filter((d: any) => {
            if (typeof d === "string") return !d.includes("普卡中毒");
            return d?.source !== "pukka";
          }),
          isPoisoned: false,
        };
      }
      // 新目标：下毒
      if (seat.id === targetId) {
        return {
          ...seat,
          isPoisoned: true,
          statusDetails: [
            ...(seat.statusDetails || []).filter((d: any) => {
              if (typeof d === "string") return !d.includes("普卡中毒");
              return d?.source !== "pukka";
            }),
            {
              type: "poison",
              source: "pukka",
              timestamp: Date.now(),
            },
            "普卡中毒（永久）",
          ],
        };
      }
      return seat;
    }),
  };

  return { ...context, snapshot: newSnapshot };
};

export const pukkaAbility = createRoleAbility({
  roleId: "pukka",
  effectSemantics: "poison",
  abilityId: "pukka_poison",
  abilityName: "普卡毒杀",
  triggerTiming: [
    AbilityTriggerTiming.FIRST_NIGHT,
    AbilityTriggerTiming.EVERY_NIGHT,
  ],
  firstNightPriority: 45,
  otherNightPriority: 47,
  targetConfig: { min: 1, max: 1, allowSelf: true, allowDead: false },
  preCheck: [preCheckAlive],
  calculate: [calculatePoisonTargets],
  stateUpdate: [updatePoisonState],
  // 🔧 结算产物（此前为空 → I9 违规）
  postProcess: [
    createSettlementPostProcess("普卡", {
      resultType: "pukka_poison",
      buildLog: (ctx) =>
        ctx.targetIds?.[0] != null
          ? `普卡对 ${(ctx.targetIds[0] ?? 0) + 1} 号玩家下毒，该玩家将于明晚毒发死亡。`
          : "普卡未选择下毒目标。",
    }),
  ],
});

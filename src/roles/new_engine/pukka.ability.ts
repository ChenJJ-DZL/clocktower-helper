/**
 * 普卡（Pukka）新引擎技能实现
 */

import { createSettlementPostProcess } from "../../utils/abilitySettlement";
import type { MiddlewareContext } from "../../utils/middlewareTypes";
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

  if (!seat || seat.isDead) {
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

  if (targetSeat.isDead) {
    return {
      ...context,
      aborted: true,
      abortReason: "不能选择已死亡的玩家",
    };
  }

  return {
    ...context,
    meta: { ...context.meta, targetId },
  };
};

// 状态更新：使目标中毒，旧目标毒发死亡
const updatePoisonState = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta } = context;
  const isAbilityEffective = meta?.abilityEffective ?? true;
  const targetId = (meta as any)?.targetId as number;

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
      /**
       * ✅ 2026-09-22 按**官方原文**修正：补 `isAbilityEffective` 门控
       * ------------------------------------------------------------------
       * 官方【普卡】→【角色简介】（逐字）：
       *   「如果**普卡在上一个夜晚选择玩家时是清醒的，但是当晚醉酒了，该玩家不会死亡**。
       *     但是当普卡恢复清醒，中毒效果会恢复，且会在随后的夜晚杀死该玩家。」
       *   「如果醉酒状态的普卡选择了一名玩家，该玩家不会中毒，也不会在下一个夜晚死亡。」
       *
       * 🔴 缺陷形态：本分支原先**只判 `oldPoison && !seat.isDead`**，
       *   完全没读 `isAbilityEffective` ⇒ 醉/毒的普卡当晚**照样让旧目标毒发身亡**
       *   （而同一函数里「下毒」那一支是读了门控的 ⇒ 两条支路语义不一致）。
       * ✅ 修法：把「毒发」也纳入门控。注意**不清除中毒标记** ——
       *   官方「当普卡恢复清醒，中毒效果会恢复，且会在**随后的夜晚**杀死该玩家」
       *   ⇒ 本次跳过即可，标记留着，等普卡恢复清醒的那晚再毒发。
       */
      if (oldPoison && !seat.isDead && isAbilityEffective) {
        return {
          ...seat,
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
      if (seat.id === targetId && isAbilityEffective) {
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

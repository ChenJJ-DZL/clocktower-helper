/**
 * 魔鬼代言人（Devil's Advocate）新引擎技能实现
 *
 * 修复: 取消注释，用统一命名 devils_advocate
 */

import { createSettlementPostProcess } from "../../utils/abilitySettlement";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

const preCheckAlive = async (context: any) => {
  const { snapshot, actionNode } = context;
  const seat = snapshot.seats.find((s: any) => s.id === actionNode.seatId);
  if (!seat?.isAlive) {
    return { ...context, aborted: true, abortReason: "玩家已死亡，技能失效" };
  }
  return { ...context, meta: { ...context.meta, isAlive: true } };
};

const calculate = async (context: any) => {
  const { snapshot, targetIds, meta } = context;
  const isAbilityActive = meta?.abilityEffective ?? true;
  const targetId = targetIds?.[0] ?? null;

  if (targetId == null) {
    return { ...context, meta: { ...context.meta, abilityResult: { targetId: null, protected: false } } };
  }

  // 检查是否与昨夜选择的目标相同（存活状态下不能连续选同一人）
  const lastTarget = (snapshot as any).lastDevilsAdvocateTarget;
  if (lastTarget != null && targetId === lastTarget) {
    return {
      ...context,
      aborted: true,
      abortReason: "不能连续两晚选择同一存活玩家",
    };
  }

  return {
    ...context,
    meta: {
      ...context.meta,
      abilityResult: {
        targetId,
        protected: isAbilityActive,
      },
    },
  };
};

const stateUpdate = async (context: any) => {
  const { snapshot, meta, actionNode } = context;
  const r = meta.abilityResult;
  if (!r || r.targetId == null) return context;

  const targetId = r.targetId;
  const isProtected = r.protected;

  const seats = snapshot.seats.map((seat: any) => {
    // 先清除旧的魔鬼代言人处决保护
    const filteredEffects = (seat.statusEffects ?? []).filter(
      (e: any) => e.source !== "devils_advocate" && e.type !== "execution_protected"
    );

    if (seat.id === targetId && isProtected) {
      filteredEffects.push({
        type: "execution_protected",
        source: "devils_advocate",
        sourceSeatId: actionNode.seatId,
        expiresAtDusk: true,
      });
      return {
        ...seat,
        isExecutionProtected: true,
        statusEffects: filteredEffects,
      };
    }

    return {
      ...seat,
      isExecutionProtected: false,
      statusEffects: filteredEffects,
    };
  });

  return {
    ...context,
    snapshot: {
      ...snapshot,
      seats,
      lastDevilsAdvocateTarget: targetId,
      _abilityResults: {
        ...((snapshot as any)._abilityResults ?? {}),
        devils_advocate: r,
      },
    },
  };
};

export const devils_advocateAbility = createRoleAbility({
  roleId: "devils_advocate",
  abilityId: "devils_advocate_protection",
  abilityName: "死亡豁免",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: 37,
  otherNightPriority: 28,
  firstNightOnly: false,
  wakePromptId: "role.devils_advocate.wake",
  targetConfig: { min: 1, max: 1, allowSelf: true, allowDead: false },
  preCheck: [preCheckAlive],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [
    async (context) => {
      console.log("[DA] protection set");
      return context;
    },
    // 🔧 结算产物
    createSettlementPostProcess("魔鬼代言人", {
      resultType: "devils_advocate_protection",
      buildLog: (ctx) =>
        ctx.targetIds?.[0] != null
          ? `魔鬼代言人保护了 ${(ctx.targetIds[0] ?? 0) + 1} 号玩家免受处决死亡。`
          : "魔鬼代言人未选择保护目标。",
    }),
  ],
});

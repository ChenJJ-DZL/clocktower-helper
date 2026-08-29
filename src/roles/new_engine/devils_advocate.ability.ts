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
  calculate: [],
  stateUpdate: [],
  postProcess: [
    async (context) => {
      console.log("[DA] protection set");
      return context;
    },
    // 🔧 结算产物（此前缺失 → I9 违规）
    createSettlementPostProcess("魔鬼代言人", {
      resultType: "devils_advocate_protection",
      buildLog: (ctx) =>
        ctx.targetIds?.[0] != null
          ? `魔鬼代言人保护了 ${(ctx.targetIds[0] ?? 0) + 1} 号玩家免受死亡。`
          : "魔鬼代言人未选择保护目标。",
    }),
  ],
});

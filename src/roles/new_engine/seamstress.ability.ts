/**
 * 女裁缝（Seamstress）新引擎技能实现
 *
 * 每局游戏限一次，在夜晚时，你可以选择除你以外的两名玩家：你会得知他们是否为同一阵营。
 */

import type { Seat } from "../../../app/data";
import {
  canUseLimitedAbility,
  consumeLimitedAbility,
} from "../../utils/LimitedAbilityManager";
import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

// 前置校验：检查是否已使用能力
const preCheckLimitedAbility = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { actionNode } = context;
  const seatId = actionNode.seatId;

  if (!canUseLimitedAbility(seatId, "seamstress_check")) {
    return {
      ...context,
      aborted: true,
      abortReason: "女裁缝已经使用过能力了",
    };
  }

  return context;
};

// 前置校验：检查是否选择了两名目标
const preCheckTargets = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { targetIds, actionNode } = context;

  if (!targetIds || targetIds.length !== 2) {
    return {
      ...context,
      aborted: true,
      abortReason: "需要选择两名玩家",
    };
  }

  // 确保没有选择自己
  if (targetIds.includes(actionNode.seatId)) {
    return {
      ...context,
      aborted: true,
      abortReason: "女裁缝不能选择自己",
    };
  }

  return context;
};

// 计算结果：判断两名玩家是否为同一阵营
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta, targetIds } = context;
  const isAbilityActive =
    meta.abilityEffective !== undefined
      ? meta.abilityEffective
      : (meta.isAbilityActive ?? true);

  if (!targetIds || targetIds.length !== 2) {
    return context;
  }

  const [targetId1, targetId2] = targetIds;
  const target1 = snapshot.seats.find((s: Seat) => s.id === targetId1);
  const target2 = snapshot.seats.find((s: Seat) => s.id === targetId2);

  if (!target1 || !target2) {
    return context;
  }

  // 判断玩家1是否为邪恶（陌客默认邪恶造成干扰，间谍默认善良造成干扰）
  const isTarget1Evil = (() => {
    if (target1.role?.id === "recluse") {
      return (target1 as any).registerAsEvil !== false;
    }
    if (target1.role?.id === "spy") {
      return (target1 as any).registerAsEvil === true;
    }
    if (target1.isEvilConverted) return true;
    if (target1.isGoodConverted) return false;
    if ((target1 as any).alignment === "evil") return true;
    if ((target1 as any).alignment === "good") return false;
    return (
      target1.role != null &&
      (target1.role.type === "minion" || target1.role.type === "demon")
    );
  })();

  // 判断玩家2是否为邪恶（陌客默认邪恶造成干扰，间谍默认善良造成干扰）
  const isTarget2Evil = (() => {
    if (target2.role?.id === "recluse") {
      return (target2 as any).registerAsEvil !== false;
    }
    if (target2.role?.id === "spy") {
      return (target2 as any).registerAsEvil === true;
    }
    if (target2.isEvilConverted) return true;
    if (target2.isGoodConverted) return false;
    if ((target2 as any).alignment === "evil") return true;
    if ((target2 as any).alignment === "good") return false;
    return (
      target2.role != null &&
      (target2.role.type === "minion" || target2.role.type === "demon")
    );
  })();

  // 实际结果：是否同一阵营（考虑陌客/间谍伪装注册）
  const actualSameAlignment = isTarget1Evil === isTarget2Evil;

  // 最终显示的信息
  let finalSameAlignment = actualSameAlignment;

  if (!isAbilityActive) {
    // 🔧 醉酒/中毒时，返回 100% 错误信息（与真实相反）
    finalSameAlignment = !actualSameAlignment;
  }

  const isCorrupted = !isAbilityActive;
  const result = {
    targetId1,
    targetId2,
    isTarget1Evil,
    isTarget2Evil,
    actualSameAlignment,
    finalSameAlignment,
    sameAlignment: finalSameAlignment,
    isCorrupted,
  };

  return {
    ...context,
    meta: {
      ...context.meta,
      isCorrupted,
      abilityResult: result,
    },
  };
};

// 状态更新：标记能力已使用
const markAbilityUsed = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { actionNode, meta } = context;

  if (meta.abilityResult && !context.aborted) {
    consumeLimitedAbility(actionNode.seatId, "seamstress_check");
  }

  return context;
};

export const seamstressAbility = createRoleAbility({
  roleId: "seamstress",
  abilityId: "seamstress_once_ability",
  abilityName: "阵营辨识",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: 63,
  otherNightPriority: 99,
  firstNightOnly: false,
  wakePromptId: "role.seamstress.wake",
  targetConfig: {
    min: 2,
    max: 2,
    allowSelf: false,
    allowDead: true,
  },
  preCheck: [commonPreCheckAlive, preCheckLimitedAbility, preCheckTargets],
  calculate: [calculateResult],
  stateUpdate: [markAbilityUsed],
  postProcess: [
    async (context) => {
      const { meta } = context;
      const result = meta.abilityResult;
      const isCorrupted = meta.isCorrupted ?? result?.isCorrupted ?? false;
      if (result) {
        const answer = result.finalSameAlignment ? "是" : "否";
        const tag = isCorrupted ? "【受干扰】" : "";
        const log = `女裁缝得知${tag}：${result.targetId1 + 1}号和${result.targetId2 + 1}号玩家${answer}同一阵营`;
        console.log(log);
        return {
          ...context,
          meta: {
            ...context.meta,
            isCorrupted,
            abilityLog: log,
            displayInfo: {
              type: "seamstress_info",
              targetId1: result.targetId1,
              targetId2: result.targetId2,
              sameAlignment: result.finalSameAlignment ?? false,
              isCorrupted,
              log,
            },
          },
        };
      }
      return context;
    },
  ],
});

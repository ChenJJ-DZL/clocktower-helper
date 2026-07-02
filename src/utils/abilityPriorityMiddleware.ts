/**
 * 能力生效优先级中间件
 * 实现官方规则的优先级判定：咖啡师>酿酒师>涡流>醉酒/中毒>自身能力限制
 */

import type { MiddlewareContext } from "./middlewareTypes";

/**
 * 全局优先级计算中间件
 * 应插入到所有技能的 calculate 阶段最前面，统一计算能力最终生效状态
 */
export const abilityPriorityCalculation = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta } = context;
  const seat = snapshot.seats.find((s) => s.id === context.actionNode.seatId);
  if (!seat) return context;

  const effects = seat.statusEffects ?? [];

  // 1. 最高优先级：咖啡师效果（直接让能力必生效/必不生效）
  const baristaEffect = effects.find((e: any) => e.type === "barista");
  if (baristaEffect) {
    return {
      ...context,
      meta: {
        ...meta,
        abilityEffective: baristaEffect.data?.isAbilityEffective ?? true,
        prioritySource: "barista",
      },
    };
  }

  // 2. 第二优先级：酿酒师效果
  const brewmasterEffect = effects.find((e: any) => e.type === "brewmaster");
  if (brewmasterEffect) {
    return {
      ...context,
      meta: {
        ...meta,
        abilityEffective: brewmasterEffect.data?.isAbilityEffective ?? true,
        prioritySource: "brewmaster",
      },
    };
  }

  // 3. 第三优先级：涡流世界（所有镇民能力必出错误信息）
  if (snapshot.globalEffects?.vortoxWorld && seat.role?.type === "townsfolk") {
    return {
      ...context,
      meta: {
        ...meta,
        abilityEffective: false,
        vortoxAffected: true,
        prioritySource: "vortox",
      },
    };
  }

  // 4. 第四优先级：醉酒/中毒
  if (effects.some((e: any) => e.type === "drunk" || e.type === "poisoned")) {
    const isDrunk = effects.some((e: any) => e.type === "drunk");
    return {
      ...context,
      meta: {
        ...meta,
        abilityEffective: false,
        isDrunk,
        isPoisoned: !isDrunk,
        prioritySource: isDrunk ? "drunk" : "poisoned",
      },
    };
  }

  // 5. 最低优先级：保持原有状态
  return {
    ...context,
    meta: {
      ...meta,
      abilityEffective: meta.abilityEffective ?? true,
      prioritySource: "normal",
    },
  };
};

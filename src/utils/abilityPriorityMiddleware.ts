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
  const { snapshot } = context;
  const meta = context.meta || {};
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
  // 提线木偶以为自己镇民 → 应当被反相；酒鬼以为自己是镇民但本身是 outsider → 不应反相
  // （酒鬼的认知覆盖仅是"骗他自己"，他不具有镇民能力；提线木偶则真以为自己获得
  //  了某个镇民能力并由说书人假装执行其流程，因此会被反相。）
  // 非信息获取类镇民：技能效果（如保护、免死、醉酒、处决拦截等）绝不受涡流干扰，100% 正常生效
  const NON_INFO_TOWNSFOLK_ROLES = new Set([
    "monk",
    "slayer",
    "soldier",
    "virgin",
    "mayor",
    "innkeeper",
    "exorcist",
    "courtier",
    "professor",
    "sailor",
    "tea_lady",
    "pacifist",
    "fool",
    "snake_charmer",
    "huntsman",
    "preacher",
    "poppy_grower",
    "farmer",
    "acrobat",
    "banshee",
    "cult_leader",
    "engineer",
    "golem",
    "nightwatchman",
  ]);

  const isDrunkRole = seat.role?.id === "drunk";
  const effectiveType = isDrunkRole
    ? "outsider" // 酒鬼永远按 outsider 处理，不被反相
    : ((seat as any).charadeRole?.type ?? seat.role?.type ?? "");
  const effectiveRoleId = isDrunkRole
    ? "drunk"
    : ((seat as any).charadeRole?.id ?? seat.role?.id ?? "");

  const hasAliveVortoxDemon = snapshot.seats.some(
    (s: any) => s.role?.id === "vortox" && !s.isDead
  );
  const isVortoxWorld = Boolean(
    (snapshot.globalEffects?.vortoxWorld ??
      snapshot.vortoxWorld ??
      snapshot.isVortoxWorld) ||
      hasAliveVortoxDemon
  );

  // 仅信息获取类镇民在涡流下获得 100% 错误信息；非信息类镇民能力完全正常生效
  if (
    isVortoxWorld &&
    effectiveType === "townsfolk" &&
    !NON_INFO_TOWNSFOLK_ROLES.has(effectiveRoleId)
  ) {
    return {
      ...context,
      meta: {
        ...meta,
        abilityEffective: false,
        vortoxAffected: true,
        isCorrupted: true,
        prioritySource: "vortox",
      },
    };
  }

  // 4. 第四优先级：醉酒/中毒
  // 🔧 同时检查新引擎 statusEffects 和遗留字段（isPoisoned/isDrunk）作为兜底
  const poisonedFromEffects = effects.some((e: any) => e.type === "poisoned");
  const drunkFromEffects = effects.some((e: any) => e.type === "drunk");
  const poisonedFromLegacy = !!(seat as any).isPoisoned;
  const drunkFromLegacy = !!(seat as any).isDrunk;
  const isPoisoned = poisonedFromEffects || poisonedFromLegacy;
  const isDrunk = drunkFromEffects || drunkFromLegacy;

  if (isPoisoned || isDrunk) {
    return {
      ...context,
      meta: {
        ...meta,
        abilityEffective: false,
        isDrunk,
        isPoisoned,
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

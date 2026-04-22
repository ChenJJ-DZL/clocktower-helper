/**
 * 角色技能标准接口
 * 所有角色的夜间/日间技能都必须实现此接口，确保技能处理流程标准化
 */

import type {
  CalculateMiddleware,
  MiddlewareContext,
  PostProcessMiddleware,
  PreCheckMiddleware,
  StateUpdateMiddleware,
} from "../../utils/middlewareTypes";

/**
 * 通用前置校验中间件：仅检查是否存活，不阻止醉酒/中毒玩家触发能力
 * 官方规则：醉酒/中毒仅影响能力结果，不影响触发时机和能力消耗
 */
export const commonPreCheckAlive = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode } = context;
  const seat = snapshot.seats.find((s) => s.id === actionNode.seatId);

  if (!seat?.isAlive) {
    return { ...context, aborted: true, abortReason: "玩家已死亡，技能失效" };
  }

  const isDrunk = seat.statusEffects.some((e: any) => e.type === "drunk");
  const isPoisoned = seat.statusEffects.some((e: any) => e.type === "poisoned");

  return {
    ...context,
    meta: {
      ...context.meta,
      isDrunk,
      isPoisoned,
      // 能力是否有效（false表示醉酒/中毒，效果需要被干扰）
      abilityEffective: !(isDrunk || isPoisoned),
    },
  };
};

// 技能触发时机
export enum AbilityTriggerTiming {
  /** 首夜唤醒 */
  FIRST_NIGHT = "first_night",
  /** 每个夜晚唤醒 */
  EVERY_NIGHT = "every_night",
  /** 白天主动使用 */
  DAY = "day",
  /** 死亡时触发 */
  ON_DEATH = "on_death",
  /** 被动触发 */
  PASSIVE = "passive",
}

// 角色技能标准接口
export interface IRoleAbility {
  /** 角色唯一ID */
  roleId: string;
  /** 技能唯一ID */
  abilityId: string;
  /** 技能名称 */
  abilityName: string;
  /** 触发时机 */
  triggerTiming: AbilityTriggerTiming[];
  /** 唤醒优先级（越小越先唤醒） */
  wakePriority: number;
  /** 是否仅首夜生效 */
  firstNightOnly: boolean;
  /** 唤醒时的说书人提示词ID */
  wakePromptId: string;
  /** 目标选择配置 */
  targetConfig: {
    /** 最小目标数 */
    min: number;
    /** 最大目标数 */
    max: number;
    /** 是否允许选择自己 */
    allowSelf: boolean;
    /** 是否允许选择死者 */
    allowDead: boolean;
  };

  // 技能处理中间件
  preCheck: PreCheckMiddleware[];
  calculate: CalculateMiddleware[];
  stateUpdate: StateUpdateMiddleware[];
  postProcess: PostProcessMiddleware[];
}

// 默认空技能实现，方便角色继承
export const DefaultRoleAbility: Omit<
  IRoleAbility,
  "roleId" | "abilityId" | "abilityName"
> = {
  triggerTiming: [],
  wakePriority: 999,
  firstNightOnly: false,
  wakePromptId: "default_wake",
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [commonPreCheckAlive],
  calculate: [],
  stateUpdate: [],
  postProcess: [],
};

/**
 * 创建角色技能的工厂函数
 */
export function createRoleAbility(
  config: Partial<IRoleAbility> &
    Pick<IRoleAbility, "roleId" | "abilityId" | "abilityName">
): IRoleAbility {
  return {
    ...DefaultRoleAbility,
    ...config,
  };
}

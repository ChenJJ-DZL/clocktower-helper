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

  const effects = seat.statusEffects ?? [];
  const isDrunk = effects.some((e: any) => e.type === "drunk");
  const isPoisoned = effects.some((e: any) => e.type === "poisoned");

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

// ─── 全局机制规则（声明式，规则即数据）─────────────────────────────────
// 跨角色"全局介入"机制统一为数据声明：能力文件声明规则，管线按 type 分派
// 通用解释器执行（见 src/utils/globalRuleEngine.ts）。新增全局角色 = 只加声明。

/** 规则生效阶段（对应管线执行阶段） */
export type GlobalRulePhase =
  | "before_calculate" // calculate 前（如目标重定向）
  | "after_calculate" // calculate 后（如信息替换）
  | "after_execute"; // 全部执行后（如目标收集）

/** 规则类型（解释器按此分派） */
export type GlobalRuleType =
  | "target_redirect" // 目标重定向（掮客：brokerSwap）
  | "info_override" // 信息替换（酿酒师：brewerEffect）
  | "target_collect"; // 目标收集（引路人：nightEvilTargets）

/** 全局机制规则声明 */
export interface GlobalRule {
  /** 规则唯一 ID（如 "broker_redirect"） */
  id: string;
  /** 规则类型 */
  type: GlobalRuleType;
  /** 生效阶段 */
  phase: GlobalRulePhase;
  /** 同阶段多规则顺序（小先执行，默认 100） */
  order?: number;
  /** 声明者角色 id（collectGlobalRules 自动填充） */
  owner?: string;
}

// ─── 效果语义（I11 校验依据）────────────────────────────────────────────
// 能力"行为意图"声明：I11 校验"声明的效果真的落地"，防止"发动了但没做该做的
// 事"的空转能力（如原舞蛇人只透传 meta 不交换角色）。默认 "info"（纯信息，
// 不改变世界状态，无需效果落地校验）。

export type EffectSemantics =
  | "info" // 纯信息（默认）：得知事实，不改变世界
  | "kill" // 击杀：目标死亡（或触发免疫豁免）
  | "poison" // 中毒：目标中毒
  | "drunk" // 醉酒：目标醉酒
  | "swap" // 交换：角色/阵营交换
  | "transform" // 转化：角色/阵营转变
  | "revive" // 复活：死者复活
  | "protect"; // 保护：目标获得免死保护

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
  /** setup 阶段钩子（可选）：在 useSeatManager.changeRole 时触发 */
  onSetup?: (context: { seats: any[]; selfId: number }) => any;
  /** 首夜唤醒优先级（越小越先唤醒），null 表示首夜不唤醒 */
  firstNightPriority: number | null;
  /** 其他夜晚唤醒优先级（越小越先唤醒），null 表示其他夜不唤醒 */
  otherNightPriority: number | null;
  /** 是否仅首夜生效 */
  firstNightOnly: boolean;
  /** 是否仅在非首夜生效（首夜不唤醒），用于僧侣、送葬者、守鸦人等 */
  otherNightOnly: boolean;
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
  /** 全局机制规则声明（跨角色介入；管线按声明自动应用，见 globalRuleEngine） */
  globalRules?: GlobalRule[];
  /** 效果语义（I11 校验"声明的效果真的落地"；默认 info） */
  effectSemantics?: EffectSemantics;

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
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  otherNightOnly: false,
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
  globalRules: [],
  effectSemantics: "info",
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

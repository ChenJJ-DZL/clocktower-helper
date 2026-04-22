import type { Seat } from "../../app/data";

/**
 * 统一角色能力定义机制
 * 整合roleAbility.types.ts、角色定义系统等组件
 * 提供统一的能力定义、注册和执行接口
 */

import { unifiedEventBus } from "../utils/unifiedEventBus";
import type {
  AbilityTriggerTiming,
  IRoleAbility,
} from "./core/roleAbility.types";

export interface UnifiedAbilityConfig {
  /** 角色ID */
  roleId: string;
  /** 能力ID */
  abilityId: string;
  /** 能力名称 */
  abilityName: string;
  /** 触发时机 */
  triggerTiming: AbilityTriggerTiming[];
  /** 唤醒优先级 */
  wakePriority: number;
  /** 是否仅首夜生效 */
  firstNightOnly: boolean;
  /** 唤醒提示词ID */
  wakePromptId: string;
  /** 目标选择配置 */
  targetConfig: {
    min: number;
    max: number;
    allowSelf: boolean;
    allowDead: boolean;
  };
  /** 前置条件检查函数 */
  preCondition?: (seat: Seat, context: AbilityContext) => boolean;
  /** 能力执行函数 */
  execute: (context: AbilityContext) => Promise<AbilityResult>;
  /** 后置处理函数 */
  postProcess?: (result: AbilityResult, context: AbilityContext) => void;
}

export interface AbilityContext {
  /** 执行能力的玩家 */
  actor: Seat;
  /** 目标玩家列表 */
  targets: Seat[];
  /** 是否为第一夜 */
  isFirstNight: boolean;
  /** 当前夜晚计数 */
  nightCount: number;
  /** 额外数据 */
  extraData?: Record<string, any>;
  /** 所有座位 */
  allSeats: Seat[];
}

export interface AbilityResult {
  /** 是否成功 */
  success: boolean;
  /** 结果数据 */
  data: any;
  /** 错误信息（如果失败） */
  error?: string;
  /** 影响的目标ID列表 */
  affectedTargetIds: number[];
  /** 状态更新 */
  statusUpdates?: Array<{
    seatId: number;
    status: string;
    duration?: string;
    details?: string;
  }>;
}

/**
 * 统一角色能力管理器
 */
class UnifiedRoleDefinition {
  private abilityRegistry: Map<string, UnifiedAbilityConfig> = new Map();

  /**
   * 注册能力
   */
  registerAbility(config: UnifiedAbilityConfig): void {
    const key = `${config.roleId}:${config.abilityId}`;
    this.abilityRegistry.set(key, config);
    console.log(
      `[UnifiedRoleDefinition] 注册能力: ${config.abilityName} (${key})`
    );
  }

  /**
   * 获取能力配置
   */
  getAbility(
    roleId: string,
    abilityId: string
  ): UnifiedAbilityConfig | undefined {
    const key = `${roleId}:${abilityId}`;
    return this.abilityRegistry.get(key);
  }

  /**
   * 获取角色的所有能力
   */
  getRoleAbilities(roleId: string): UnifiedAbilityConfig[] {
    const abilities: UnifiedAbilityConfig[] = [];

    // 使用Array.from()避免downlevelIteration问题
    Array.from(this.abilityRegistry.entries()).forEach(([key, ability]) => {
      if (key.startsWith(`${roleId}:`)) {
        abilities.push(ability);
      }
    });

    return abilities;
  }

  /**
   * 检查角色在指定时机是否有能力
   */
  hasAbilityAtTiming(roleId: string, timing: AbilityTriggerTiming): boolean {
    const abilities = this.getRoleAbilities(roleId);
    return abilities.some((ability) => ability.triggerTiming.includes(timing));
  }

  /**
   * 执行能力
   */
  async executeAbility(
    roleId: string,
    abilityId: string,
    context: AbilityContext
  ): Promise<AbilityResult> {
    const ability = this.getAbility(roleId, abilityId);

    if (!ability) {
      return {
        success: false,
        data: null,
        error: `能力未找到: ${roleId}:${abilityId}`,
        affectedTargetIds: [],
      };
    }

    // 检查前置条件
    if (ability.preCondition && !ability.preCondition(context.actor, context)) {
      return {
        success: false,
        data: null,
        error: "前置条件不满足",
        affectedTargetIds: [],
      };
    }

    // 发布能力触发事件
    unifiedEventBus.emit("ability:triggered", {
      seatId: context.actor.id,
      roleId,
      abilityId,
      targets: context.targets.map((t) => t.id),
    });

    try {
      // 执行能力
      const result = await ability.execute(context);

      // 发布能力完成事件
      unifiedEventBus.emit("ability:resolved", {
        seatId: context.actor.id,
        roleId,
        abilityId,
        success: result.success,
        result: result.data,
      });

      // 执行后置处理
      if (ability.postProcess) {
        ability.postProcess(result, context);
      }

      // 更新状态
      if (result.statusUpdates) {
        this.applyStatusUpdates(result.statusUpdates, context.allSeats);
      }

      return result;
    } catch (error) {
      console.error(
        `[UnifiedRoleDefinition] 能力执行失败: ${roleId}:${abilityId}`,
        error
      );

      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "未知错误",
        affectedTargetIds: [],
      };
    }
  }


  /**
   * 转换旧版能力定义到新版
   */
  convertLegacyAbility(legacyAbility: IRoleAbility): UnifiedAbilityConfig {
    return {
      roleId: legacyAbility.roleId,
      abilityId: legacyAbility.abilityId,
      abilityName: legacyAbility.abilityName,
      triggerTiming: legacyAbility.triggerTiming,
      wakePriority: legacyAbility.wakePriority,
      firstNightOnly: legacyAbility.firstNightOnly,
      wakePromptId: legacyAbility.wakePromptId,
      targetConfig: legacyAbility.targetConfig,
      execute: async (context: AbilityContext) => {
        // 默认实现，需要根据具体能力重写
        return {
          success: true,
          data: {},
          affectedTargetIds: context.targets.map((t) => t.id),
        };
      },
    };
  }

  /**
   * 应用状态更新
   */
  private applyStatusUpdates(
    updates: Array<{
      seatId: number;
      status: string;
      duration?: string;
      details?: string;
    }>,
    allSeats: Seat[]
  ): void {
    for (const update of updates) {
      const seat = allSeats.find((s) => s.id === update.seatId);
      if (seat) {
        // 这里需要根据实际的状态更新逻辑来实现
        console.log(
          `[UnifiedRoleDefinition] 更新状态: 座位${seat.id + 1} - ${update.status}`
        );

        // 发布状态更新事件
        unifiedEventBus.emit("state:updated", {
          entity: "seat",
          id: seat.id,
          changes: {
            status: update.status,
            statusDetails: update.details,
          },
        });
      }
    }
  }

  /**
   * 获取所有已注册的能力
   */
  getAllAbilities(): UnifiedAbilityConfig[] {
    return Array.from(this.abilityRegistry.values());
  }

  /**
   * 清除所有注册的能力
   */
  clearRegistry(): void {
    this.abilityRegistry.clear();
    console.log("[UnifiedRoleDefinition] 已清除所有能力注册");
  }
}

// 导出单例
export const unifiedRoleDefinition = new UnifiedRoleDefinition();

// 导出类型
export type { IRoleAbility } from "./core/roleAbility.types";
export { AbilityTriggerTiming } from "./core/roleAbility.types";

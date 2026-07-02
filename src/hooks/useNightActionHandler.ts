/**
 * 夜晚行动处理 Hook
 * 统一处理角色夜晚行动的确认和执行
 *
 * 职责：
 * 1. 从角色定义中获取处理函数（旧系统）
 * 2. 回退到新引擎能力注册表（当旧 handler 不存在时）
 * 3. 应用状态更新 + 状态同步（statusEffects ↔ Seat 布尔字段）
 */

import { useCallback } from "react";
import type { Role, Seat } from "../../app/data";
import { getRoleDefinition } from "../roles";
import { getRawAbilityMap } from "../roles/new_engine/abilityRegistry";
import type { NightInfoResult } from "../types/game";
import type { ModalType } from "../types/modal";
import type { NightActionContext } from "../types/roleDefinition";
import { computeIsPoisoned } from "../utils/gameRules";
import { runFullAbilityPipeline } from "../utils/middlewarePipeline";
import type { GameStateSnapshot } from "../utils/middlewareTypes";

export interface NightActionHandlerContext {
  nightInfo: NightInfoResult | null;
  seats: Seat[];
  selectedTargets: number[];
  gamePhase: string;
  nightCount: number;
  roles: Role[];
  isConfirmed?: boolean;
  actionData?: any;
  vortoxWorld: boolean;
  getRegistration: (seat: Seat, viewer?: Role | null) => any;
  getMisinformation: { [key: string]: (data: any) => any };
  findNearestAliveNeighbor: (
    originId: number,
    direction: 1 | -1
  ) => Seat | null;

  // 状态更新函数
  setSeats: React.Dispatch<React.SetStateAction<Seat[]>>;
  setSelectedActionTargets: React.Dispatch<React.SetStateAction<number[]>>;

  // 辅助函数
  addLog: (message: string) => void;
  continueToNextAction: (latestSeats?: Seat[]) => void;
  setCurrentModal: React.Dispatch<React.SetStateAction<ModalType>>;
  preview?: boolean; // 预览模式：只计算不修改状态，弹出确认窗
  markAbilityUsed: (roleId: string, seatId: number) => void;
  hasUsedAbility: (roleId: string, seatId: number) => boolean;
  reviveSeat: (seat: Seat) => Seat;
  insertIntoWakeQueueAfterCurrent: (seatId: number, options?: any) => void;
}

// ---------------------------------------------------------------------------
// Status sync helpers
// ---------------------------------------------------------------------------

/** 将 React Seat 的遗留布尔字段翻译为新引擎 statusEffects[] */
function translateLegacyStatusesToEffects(seat: Seat): any[] {
  const effects: any[] = [];
  if (seat.isPoisoned) effects.push({ type: "poisoned", source: "legacy" });
  if (seat.isProtected) effects.push({ type: "protected", source: "legacy" });
  if (seat.isDrunk) effects.push({ type: "drunk", source: "legacy" });
  return effects;
}

/** 将新引擎 statusEffects[] 翻译回 React Seat 的布尔字段 */
export function syncStatusEffectsToSeat(prev: Seat, updated: any): Partial<Seat> {
  const effects: any[] = (updated as any).statusEffects || [];
  const hasPoison = effects.some((e: any) => e.type === "poisoned");
  const hasProtect = effects.some((e: any) => e.type === "protected");
  const hasDrunk = effects.some((e: any) => e.type === "drunk");
  const markedDead = !!(updated as any).markedForDeath;

  // 同步到 statuses 和 statusDetails（供 legacy 读取）
  const extraStatuses: any[] = [];
  const extraDetails: string[] = [];
  if (hasPoison && !prev.isPoisoned) {
    extraStatuses.push({ effect: "Poison", duration: "至下个黄昏" });
    extraDetails.push("新引擎中毒（黄昏清除）");
  }
  if (hasProtect && !prev.isProtected) {
    extraStatuses.push({ effect: "Protected", duration: "至天亮" });
    extraDetails.push("新引擎保护（天亮清除）");
  }
  if (hasDrunk && !prev.isDrunk) {
    extraStatuses.push({ effect: "Drunk", duration: "至下个黄昏" });
    extraDetails.push("新引擎致醉（黄昏清除）");
  }

  return {
    isPoisoned: prev.isPoisoned || hasPoison,
    isProtected: prev.isProtected || hasProtect,
    isDrunk: prev.isDrunk || hasDrunk,
    isDead: prev.isDead || markedDead,
    statuses: [...(prev.statuses || []), ...extraStatuses],
    statusDetails: [...(prev.statusDetails || []), ...extraDetails],
  };
}

// ---------------------------------------------------------------------------
// executeViaNewEngine — 核心桥接函数
// ---------------------------------------------------------------------------

/**
 * 通过新引擎中间件管道执行角色能力（异步）
 *
 * 预览模式（context.preview = true）：
 *   1. 只执行 preCheck + calculate，生成预览信息
 *   2. 弹出 NIGHT_ACTION_CONFIRM 确认窗
 *   3. 用户确认后由确认窗的 onConfirm 回调再次调用本函数（preview=false）
 *
 * 非预览模式：
 *   1. 执行完整 preCheck → calculate → stateUpdate → postProcess
 *   2. 合并状态更新，同步 statusEffects → React Seat 布尔字段
 *   3. 处理 markedForDeath → isDead
 *   4. 推进队列
 */
export async function executeViaNewEngine(
  context: NightActionHandlerContext,
  roleId: string
): Promise<boolean> {
  const abilityMap = getRawAbilityMap();
  const abilityKey = Object.keys(abilityMap).find(
    (k) => k.startsWith(roleId) || abilityMap[k].roleId === roleId
  );
  const ability = abilityKey ? abilityMap[abilityKey] : null;

  if (!ability) {
    console.warn(
      `[NightActionHandler] 角色 ${roleId} 既无旧 handler 也无新引擎能力，跳过`
    );
    return false;
  }

  // ---------- 构建 MiddlewareContext ----------
  // 双向翻译：将 React Seat 的遗留字段翻译为 statusEffects
  const snapshotSeats: any[] = context.seats.map((s) => {
    const legacyEffects = translateLegacyStatusesToEffects(s);
    return {
      ...s,
      isAlive: !s.isDead,
      statusEffects: [...legacyEffects, ...((s as any).statusEffects || [])],
    };
  });

  const gameStateSnapshot: GameStateSnapshot = {
    nightCount: context.nightCount,
    seats: snapshotSeats,
    statusEffects: {},
    gamePhase: context.gamePhase,
  };

  const roleName = context.nightInfo?.effectiveRole?.name ?? roleId;
  const actorId = context.nightInfo?.seat?.id ?? -1;

  const middlewareContext = {
    snapshot: gameStateSnapshot,
    actionNode: {
      seatId: actorId,
      roleId,
      roleName,
      priority: 0,
      isFirstNightOnly: false,
      abilityId: abilityKey ?? `${roleId}_ability`,
      wakeMessage: "",
      firstNightPriority: null,
      otherNightPriority: null,
      targetIds: context.selectedTargets ?? [],
      processed: false,
      success: false,
      meta: {},
    },
    targetIds: context.selectedTargets ?? [],
    storytellerInput: context.actionData,
    meta: {},
    aborted: false,
    preview: !!context.preview,
  };

  try {
    // 管道会自动处理 preview：preview 模式只走 preCheck+calculate
    const resultContext = await runFullAbilityPipeline(
      {
        preCheck: ability.preCheck,
        calculate: ability.calculate,
        stateUpdate: ability.stateUpdate,
        postProcess: ability.postProcess,
      },
      middlewareContext
    );

    // 管道中止（死亡/非首夜等）— 无论预览还是真实模式都应自动跳过
    if (resultContext.aborted) {
      context.addLog(
        `[系统] ⚠️ ${roleId} 能力被跳过: ${resultContext.abortReason ?? "管道中止"}`
      );
      context.continueToNextAction();
      return true;
    }

    // ============ 预览模式 ============
    if (context.preview) {
      console.log(`[executeViaNewEngine] PREVIEW mode for ${roleId}, targets:`, context.selectedTargets);
      
      // 从 calculate 阶段提取预览信息
      const displayInfo = resultContext.meta.displayInfo;
      const abilityResult = resultContext.meta.abilityResult;
      const isCorrupted = resultContext.meta.isCorrupted;

      // 构建目标描述
      const targetDescriptions: string[] = (context.selectedTargets || []).map(
        (tid) => `${tid + 1}号`
      );
      if (targetDescriptions.length === 0) {
        targetDescriptions.push("（无目标）");
      }

      // 推断行动描述
      let actionDescription = "行动";
      if (displayInfo?.log) {
        actionDescription = displayInfo.log;
      } else if (resultContext.meta.abilityLog) {
        actionDescription = resultContext.meta.abilityLog;
      } else if (ability) {
        actionDescription = (ability as any).abilityName || "执行能力";
      }

      // 检查是否需要说书人选择（如 spy_info, demon_info 等系统步骤）
      const isSystemStep = ["spy_info", "demon_info", "minion_info"].includes(
        roleId
      );
      const targetConfig = (ability as any).targetConfig;
      const minTargets = targetConfig?.min ?? 0;

      if (isSystemStep || minTargets === 0) {
        // 无目标系统步骤：直接确认执行，不弹窗
        context.setCurrentModal(null);
        // 触发真实执行（不走 preview）
        const realContext = { ...context, preview: false };
        return executeViaNewEngine(realContext, roleId);
      }

      // 弹窗确认
      const safeTargets = [...(context.selectedTargets || [])];
      context.setCurrentModal({
        type: "NIGHT_ACTION_CONFIRM",
        data: {
          roleName,
          actionDescription,
          targetDescriptions,
          extraNote: isCorrupted
            ? "该角色处于醉酒/中毒状态，能力可能不生效"
            : undefined,
          onConfirm: async () => {
            console.log(`[executeViaNewEngine] onConfirm FIRED for ${roleId}, targets:`, safeTargets);
            // 用户确认后，用同一套参数执行真实管道
            const realContext: NightActionHandlerContext = {
              ...context,
              preview: false,
              selectedTargets: safeTargets,
            };
            await executeViaNewEngine(realContext, roleId);
          },
          onCancel: () => {
            console.log(`[executeViaNewEngine] onCancel for ${roleId}`);
            // 取消：清空选择，让说书人重新选
            context.setSelectedActionTargets([]);
          },
        },
      });

      return true;
    }

    // ============ 非预览模式：执行完整管道 ============
    console.log(`[executeViaNewEngine] FULL EXECUTION for ${roleId}, targets:`, context.selectedTargets);

    // 从 snapshot 中提取更新后的座位状态，并同步状态
    const updatedSeats = resultContext.snapshot.seats as Seat[];
    console.log(`[executeViaNewEngine] Syncing ${updatedSeats.length} seats from engine snapshot`);
    
    if (updatedSeats && updatedSeats.length > 0) {
      context.setSeats((prevSeats) =>
        prevSeats.map((prev) => {
          const updated = updatedSeats.find((u: any) => u.id === prev.id);
          if (updated) {
            // 合并更新 + 双向状态同步
            const syncedFields = syncStatusEffectsToSeat(prev, updated);
            const hasNewPoison = syncedFields.isPoisoned && !prev.isPoisoned;
            if (hasNewPoison) {
              console.log(`[executeViaNewEngine] ⚠️ POISON APPLIED to seat ${prev.id} (${prev.role?.name || 'unknown'})`);
            }
            return { ...prev, ...updated, ...syncedFields, id: prev.id };
          }
          return prev;
        })
      );
    }

    // 记录日志
    const abilityLog =
      resultContext.meta.abilityLog || resultContext.meta.prompt;
    if (abilityLog) {
      context.addLog(`[能力] ${abilityLog}`);
    }

    // 清空选中的目标
    context.setSelectedActionTargets([]);

    // 处理弹窗
    const modal = resultContext.meta.modal as ModalType | undefined;
    if (modal) {
      context.setCurrentModal(modal);
    } else {
      context.continueToNextAction(updatedSeats ?? undefined);
    }

    // 标记能力已使用
    if (actorId !== undefined && actorId >= 0) {
      context.markAbilityUsed(roleId, actorId);
    }

    return true;
  } catch (error) {
    console.error(`[NightActionHandler] 角色 ${roleId} 新引擎执行失败:`, error);
    return false;
  }
}

/**
 * 使用角色定义的 handler 处理夜晚行动
 */
export function useNightActionHandler() {
  /**
   * 处理夜晚行动确认
   * 从角色定义中获取 handler 并执行
   * 回退到新引擎能力注册表
   */
  const handleNightAction = useCallback(
    async (context: NightActionHandlerContext): Promise<boolean> => {
      const { nightInfo } = context;

      if (!nightInfo) {
        return false;
      }

      const roleId = nightInfo.effectiveRole.id;
      const roleDef = getRoleDefinition(roleId);

      // ====== 新引擎优先：只要有新引擎能力就直接走新引擎 ======
      const abilityMap = getRawAbilityMap();
      const hasNewEngine = Object.values(abilityMap).some(
        (a: any) => a.roleId === roleId
      );
      if (hasNewEngine) {
        return executeViaNewEngine(context, roleId);
      }

      // ====== UI配置层回退（仅限无新引擎能力的角色） ======
      if (!roleDef) {
        console.warn(`[useNightActionHandler] 未找到角色定义: ${roleId}`);
        return false;
      }

      const isFirstNight = context.gamePhase === "firstNight";
      const nightConfig = isFirstNight
        ? roleDef.firstNight || roleDef.night
        : roleDef.night;

      if (!nightConfig || !nightConfig.handler) {
        return false;
      }

      // ====== 旧 handler 路径（仅兼容无双引擎角色） ======
      const { seats, selectedTargets, gamePhase, nightCount } = context;

      const actionContext: NightActionContext = {
        seats,
        targets: selectedTargets,
        selfId: nightInfo.seat.id,
        gamePhase: gamePhase as any,
        nightCount,
        roles: context.roles,
        isConfirmed: context.isConfirmed,
        actionData: context.actionData,
        vortoxWorld: context.vortoxWorld,
        getRegistration: context.getRegistration,
        getMisinformation: context.getMisinformation,
        findNearestAliveNeighbor: context.findNearestAliveNeighbor,
        isActorDisabledByPoisonOrDrunk: (seat: Seat) =>
          computeIsPoisoned(seat, seats) ||
          seat.isDrunk ||
          seat.role?.id === "drunk",
        addLog: context.addLog,
        helpers: {
          setSeats: context.setSeats,
          addLog: context.addLog,
          setCurrentModal: context.setCurrentModal,
          continueToNextAction: context.continueToNextAction,
          markAbilityUsed: context.markAbilityUsed,
          hasUsedAbility: context.hasUsedAbility,
          reviveSeat: context.reviveSeat,
          insertIntoWakeQueueAfterCurrent:
            context.insertIntoWakeQueueAfterCurrent,
        },
      };

      try {
        if (!nightConfig.handler) return false;
        const result = nightConfig.handler(actionContext);
        if (!result) return false;

        let updatedSeats: Seat[] | null = null;
        if (result.updates && result.updates.length > 0) {
          context.setSeats((prevSeats) => {
            updatedSeats = prevSeats.map((seat) => {
              const update = result.updates.find((u) => u.id === seat.id);
              if (update) {
                const { id, ...updates } = update;
                return { ...seat, ...updates };
              }
              return seat;
            });
            return updatedSeats!;
          });
        }

        if (result.logs) {
          if (result.logs.privateLog) {
            context.addLog(result.logs.privateLog);
          }
          if (result.logs.publicLog) {
            context.addLog(result.logs.publicLog);
          }
        }

        context.setSelectedActionTargets([]);

        if (result.modal) {
          context.setCurrentModal(result.modal);
        } else if (!context.preview) {
          context.continueToNextAction(updatedSeats ?? undefined);
        }

        return true;
      } catch (error) {
        console.error(
          `[useNightActionHandler] 处理角色 ${roleId} 的夜晚行动时出错:`,
          error
        );
        return false;
      }
    },
    []
  );

  return {
    handleNightAction,
  };
}

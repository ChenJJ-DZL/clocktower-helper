/**
 * 夜晚行动处理 Hook
 * 统一处理角色夜晚行动的确认和执行
 *
 * 职责：
 * 1. 从角色定义中获取处理函数（旧系统）
 * 2. 回退到新引擎能力注册表（当旧 handler 不存在时）
 * 3. 应用状态更新
 */

import { useCallback } from "react";
import type { Role, Seat } from "../../app/data";
import { getRoleDefinition } from "../roles";
import { getRawAbilityMap } from "../roles/new_engine/abilityRegistry";
import type { NightInfoResult } from "../types/game";
import type { ModalType } from "../types/modal";
import type {
  NightActionContext,
} from "../types/roleDefinition";
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
  preview?: boolean; // 预览模式：执行行动但不推进队列
  markAbilityUsed: (roleId: string, seatId: number) => void;
  hasUsedAbility: (roleId: string, seatId: number) => boolean;
  reviveSeat: (seat: Seat) => Seat;
  insertIntoWakeQueueAfterCurrent: (seatId: number, options?: any) => void;
}

/**
 * 通过新引擎中间件管道执行角色能力（异步）
 * 在旧 handler 不存在时作为桥接回退
 */
async function executeViaNewEngine(
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

  // 构建 MiddlewareContext
  const snapshotSeats: any[] = context.seats.map((s) => ({
    ...s,
    isAlive: !s.isDead,
  }));

  const gameStateSnapshot: GameStateSnapshot = {
    nightCount: context.nightCount,
    seats: snapshotSeats,
    statusEffects: {},
    gamePhase: context.gamePhase,
  };

  const middlewareContext = {
    snapshot: gameStateSnapshot,
    actionNode: {
      seatId: context.nightInfo?.seat?.id ?? -1,
      roleId,
      roleName: context.nightInfo?.effectiveRole?.name ?? roleId,
      priority: 0,
      isFirstNightOnly: false,
      abilityId: abilityKey ?? `${roleId}_ability`,
      wakeMessage: "",
      wakePriority: 0,
      targetIds: context.selectedTargets ?? [],
      processed: false,
      success: false,
      meta: {},
    },
    targetIds: context.selectedTargets ?? [],
    storytellerInput: context.actionData,
    meta: {},
    aborted: false,
  };

  try {
    const resultContext = await runFullAbilityPipeline(
      {
        preCheck: ability.preCheck,
        calculate: ability.calculate,
        stateUpdate: ability.stateUpdate,
        postProcess: ability.postProcess,
      },
      middlewareContext
    );

    // 如果管道中止（死亡/非首夜等）
    if (resultContext.aborted) {
      context.addLog(
        `[系统] ⚠️ ${roleId} 能力被跳过: ${resultContext.abortReason ?? "管道中止"}`
      );
      if (!context.preview) {
        context.continueToNextAction();
      }
      return true; // 中止不算失败，是被合法跳过
    }

    // 从 snapshot 中提取更新后的座位状态
    const updatedSeats = resultContext.snapshot.seats as Seat[];
    if (updatedSeats && updatedSeats.length > 0) {
      context.setSeats((prevSeats) =>
        prevSeats.map((prev) => {
          const updated = updatedSeats.find((u: any) => u.id === prev.id);
          if (updated) {
            // 合并更新（保留旧字段，覆盖新字段）
            return { ...prev, ...updated, id: prev.id };
          }
          return prev;
        })
      );
    }

    // 记录日志（从 postProcess 的输出中提取）
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
    } else if (!context.preview) {
      // 非预览模式，推进到下一个行动
      context.continueToNextAction(updatedSeats ?? undefined);
    }

    // 标记能力已使用
    const actorId = context.nightInfo?.seat?.id;
    if (actorId !== undefined) {
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

      if (!roleDef) {
        console.warn(`[useNightActionHandler] 未找到角色定义: ${roleId}`);
        // 尝试新引擎能力
        return executeViaNewEngine(context, roleId);
      }

      // 确定使用首夜还是普通夜晚的配置
      const isFirstNight = context.gamePhase === "firstNight";
      const nightConfig = isFirstNight
        ? roleDef.firstNight || roleDef.night
        : roleDef.night;

      // 旧 handler 不存在 → 桥接到新引擎
      if (!nightConfig || !nightConfig.handler) {
        return executeViaNewEngine(context, roleId);
      }

      // ====== 旧 handler 路径（向后兼容） ======
      const { seats, selectedTargets, gamePhase, nightCount } = context;

      // 构建夜晚行动上下文
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

      // 调用角色定义的 handler
      try {
        if (!nightConfig.handler) return false;
        const result = nightConfig.handler(actionContext);
        if (!result) return false;

        // 应用状态更新
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

        // 记录日志
        if (result.logs) {
          if (result.logs.privateLog) {
            context.addLog(result.logs.privateLog);
          }
          if (result.logs.publicLog) {
            context.addLog(result.logs.publicLog);
          }
        }

        // 清空选中的目标
        context.setSelectedActionTargets([]);

        // 处理弹窗触发
        if (result.modal) {
          context.setCurrentModal(result.modal);
        } else if (!context.preview) {
          // 如果没有弹窗且非预览模式，自动进入下一个行动
          context.continueToNextAction(updatedSeats ?? undefined);
        }
        // 预览模式下不推进队列，由调用方决定何时推进

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

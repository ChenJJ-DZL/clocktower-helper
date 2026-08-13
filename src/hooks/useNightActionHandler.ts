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
import {
  getAbilityForRole,
  getRawAbilityMap,
} from "../roles/new_engine/abilityRegistry";
import type { NightInfoResult } from "../types/game";
import type { ModalType } from "../types/modal";
import type { NightActionContext } from "../types/roleDefinition";
import { computeIsPoisoned } from "../utils/gameRules";
import { runAbilityPipeline } from "../utils/middlewarePipeline";
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
  /** 🔧 今日被处决玩家ID（送葬者/食人族等读取，guide 路径已用，能力管道需同步传入） */
  todayExecutedId?: number | null;
  getRegistration: (seat: Seat, viewer?: Role | null) => any;
  getMisinformation: { [key: string]: (data: any) => any };
  findNearestAliveNeighbor: (
    originId: number,
    direction: 1 | -1
  ) => Seat | null;

  // 状态更新函数
  setSeats: React.Dispatch<React.SetStateAction<Seat[]>>;
  setSelectedActionTargets: React.Dispatch<React.SetStateAction<number[]>>;
  // 🔧 新引擎管道（imp.ability 等）只设 markedForDeath → isDead，
  //    绕过了 killPlayer → setDeadThisNight 的写入，导致天亮报告永远"平安夜"、送葬者失效。
  //    此处显式传入 setDeadThisNight，让 executeViaNewEngine 在同步
  //    markedForDeath 后补调，保证天亮报告 / 送葬者等依赖 deadThisNight 的逻辑正确。
  setDeadThisNight?: React.Dispatch<React.SetStateAction<number[]>>;
  // 🔧 女巫诅咒桥接：新引擎快照 witchCurse → legacy witchCursedId（useDayActions 消费端）。
  //   无此桥接时女巫诅咒写入快照后永不落地，被诅咒者发起提名不死亡（引擎 P0）。
  setWitchCursedId?: (id: number | null) => void;
  setWitchActive?: (v: boolean) => void;
  // 🔧 恶魔死亡判胜：新引擎击杀（executeViaNewEngine）只补记 deadThisNight，
  //   从不触发 checkGameOver → 恶魔夜晚被杀后游戏不立即结束，继续跑白天/黄昏
  //   流程（官方规则：恶魔死亡立即善良获胜）。此回调用于击杀恶魔后立即判胜。
  checkGameOver?: (
    updatedSeats: Seat[],
    executedPlayerId?: number | null,
    isEndOfDay?: boolean
  ) => void;

  // 辅助函数
  addLog: (message: string) => void;
  continueToNextAction: (latestSeats?: Seat[]) => void;
  setCurrentModal: React.Dispatch<React.SetStateAction<ModalType>>;
  preview?: boolean; // 预览模式：只计算不修改状态，弹出确认窗
  markAbilityUsed: (roleId: string, seatId: number) => void;
  hasUsedAbility: (roleId: string, seatId: number) => boolean;
  reviveSeat: (seat: Seat) => Seat;
  insertIntoWakeQueueAfterCurrent: (seatId: number, options?: any) => void;
  /** 🔧 守鸦人修复：恶魔杀守鸦人后动态插入新引擎觉醒节点 */
  enqueueRavenkeeperIfNeeded?: (targetId: number) => void;
}

// ---------------------------------------------------------------------------
// Status sync helpers
// ---------------------------------------------------------------------------

/** 将 React Seat 的遗留布尔字段翻译为新引擎 statusEffects[] */
function translateLegacyStatusesToEffects(seat: Seat): any[] {
  // 🔧 不再把 legacy 布尔字段（isPoisoned/isProtected/isDrunk）翻译为 statusEffects：
  //   1. legacy 效果无 expiresAtNight，clearExpiredNightEffects 永远清不掉 → 每夜累积
  //   2. 结算路径（abilityPriorityCalculation）与 guide 路径（computeIsPoisoned）
  //      均有 legacy 字段兜底检测（isPoisoned/isProtected/isDrunk），无需翻译。
  //   3. 新引擎角色（投毒者/僧侣等）写入带 source 的 statusEffects，由引擎自身管理过期。
  return [];
}

/** 将新引擎 statusEffects[] 翻译回 React Seat 的布尔字段 */
export function syncStatusEffectsToSeat(
  prev: Seat,
  updated: any
): Partial<Seat> {
  const effects: any[] = (updated as any).statusEffects || [];
  const hasPoison = effects.some((e: any) => e.type === "poisoned");
  const hasProtect = effects.some((e: any) => e.type === "protected");
  const hasDrunk = effects.some((e: any) => e.type === "drunk");
  const markedDead = !!(updated as any).markedForDeath;
  // 🔧 修复：新引擎大量角色（shabaloth/po/zombuul/assassin/hunter 等）击杀时
  //   只设 `isAlive: false`（引擎字段）而不设 markedForDeath/isDead，
  //   导致 syncStatusEffectsToSeat 翻译不落地 → 天亮报告永远"平安夜"、死亡标记缺失、
  //   送葬者失效、游戏拖入死循环。此处将 `isAlive === false` 一并翻译为 isDead。
  const engineDead = (updated as any).isAlive === false;

  // 🔧 以新引擎 statusEffects 为准同步 legacy 展示字段：
  //   仅当新引擎存在该效果时为 true；不存在时显式清除，
  //   避免 `prev || hasX` 导致中毒/醉酒状态永不重置（信息不一致的根源）。
  const isPoisoned = hasPoison;
  const isProtected = hasProtect;
  const isDrunk = hasDrunk;

  // 同步到 statuses 和 statusDetails（供 legacy 读取）
  // 先移除旧的"新引擎"标记，再按当前状态追加，避免重复累积
  const extraStatuses: any[] = [];
  const extraDetails: string[] = [];
  if (isPoisoned) {
    extraStatuses.push({ effect: "Poison", duration: "至下个黄昏" });
    extraDetails.push("新引擎中毒（黄昏清除）");
  }
  if (isProtected) {
    extraStatuses.push({ effect: "Protected", duration: "至天亮" });
    extraDetails.push("新引擎保护（天亮清除）");
  }
  if (isDrunk) {
    extraStatuses.push({ effect: "Drunk", duration: "至下个黄昏" });
    extraDetails.push("新引擎致醉（黄昏清除）");
  }

  const stripEngineStatuses = (list: any[] | undefined) =>
    (list || []).filter(
      (x: any) =>
        !(
          x.effect === "Poison" ||
          x.effect === "Protected" ||
          x.effect === "Drunk"
        )
    );
  const stripEngineDetails = (list: any[] | undefined) =>
    (list || []).filter(
      (d: string) =>
        !d.includes("新引擎中毒") &&
        !d.includes("新引擎保护") &&
        !d.includes("新引擎致醉")
    );

  return {
    isPoisoned,
    isProtected,
    isDrunk,
    isDead: prev.isDead || markedDead || engineDead,
    statuses: [...stripEngineStatuses(prev.statuses), ...extraStatuses],
    statusDetails: [...stripEngineDetails(prev.statusDetails), ...extraDetails],
    // 🔧 显式保留引擎状态效果数组，确保管道 abilityPriorityCalculation 能读取到中毒/醉酒/保护
    statusEffects: effects,
  };
}

/**
 * 消费能力管道的 meta.stateUpdates 指令。
 *
 * 部分能力（赌徒/水手/吟游诗人/吟游歌手/造谣者/月之子等）不直接改 snapshot.seats，
 * 而是通过 meta.stateUpdates 下发结构化变更指令；此前全项目无消费点，
 * 导致这些角色的能力「计算了但不生效」。本函数在 executeViaNewEngine 执行
 * 完整管道后应用这些指令，使能力真正落地。
 *
 * 支持指令类型：
 * - MARK_FOR_DEATH      → 标记目标死亡（赌徒猜错/造谣者声明正确/月之子诅咒）
 * - CANCEL_DEATH        → 取消死亡（和平主义者处决不死亡，兼容 legacy 双保险）
 * - ADD_DRUNK           → 使单目标醉酒（水手）
 * - MARK_ALL_FOR_DRUNK  → 使多个目标醉酒（吟游诗人/吟游歌手使爪牙醉酒）
 *
 * @param seats      当前座位列表（来自引擎快照，已含管道状态变更）
 * @param updates    resultContext.meta.stateUpdates
 * @param nightCount 当前夜晚编号（用于标记死亡夜晚与醉酒过期）
 */
export function applyStateUpdates(
  seats: Seat[],
  updates: any,
  nightCount: number
): Seat[] {
  if (!updates || !updates.type) return seats;
  const { type, targetId, targetIds, reason } = updates;

  switch (type) {
    case "MARK_FOR_DEATH": {
      // 赌徒猜错 / 造谣者声明正确 / 月之子诅咒 → 目标标记死亡
      if (targetId == null) return seats;
      return seats.map((s) =>
        s.id === targetId
          ? {
              ...s,
              markedForDeath: true,
              diedAtNight: nightCount,
              deathSource: reason ?? "state_update",
              statusDetails: [
                ...(s.statusDetails || []),
                `死亡原因：${reason ?? "能力触发"}`,
              ],
            }
          : s
      );
    }
    case "CANCEL_DEATH": {
      // 和平主义者：处决不死亡
      if (targetId == null) return seats;
      return seats.map((s) =>
        s.id === targetId
          ? {
              ...s,
              isDead: false,
              markedForDeath: false,
              isCandidate: false,
              voteCount: undefined,
            }
          : s
      );
    }
    case "ADD_DRUNK":
    case "MARK_ALL_FOR_DRUNK": {
      // 水手致醉（单目标）/ 吟游诗人·吟游歌手使爪牙醉酒（多目标）
      const ids =
        type === "MARK_ALL_FOR_DRUNK"
          ? (targetIds ?? [])
          : targetId != null
            ? [targetId]
            : [];
      if (ids.length === 0) return seats;
      return seats.map((s) => {
        if (!ids.includes(s.id)) return s;
        // 先移除同源的旧醉酒效果，避免跨夜累积
        const baseEffects = (s.statusEffects ?? []).filter(
          (e: any) => !(e.type === "drunk" && (e.source === "sailor" || e.source === "minstrel" || e.source === "bard"))
        );
        return {
          ...s,
          isDrunk: true,
          statusEffects: [
            ...baseEffects,
            {
              type: "drunk",
              source: type === "ADD_DRUNK" ? "sailor" : "minstrel",
              appliedAtNight: nightCount,
              expiresAtNight: nightCount + 1,
              duration: 1,
            },
          ],
          statuses: [
            ...(s.statuses ?? []).filter(
              (st: any) => !(st.effect === "Drunk" && st.duration === "至下个黄昏")
            ),
            { effect: "Drunk", duration: "至下个黄昏" },
          ],
          statusDetails: [
            ...(s.statusDetails || []).filter((d) => !d.includes("醉酒（至下个黄昏）")),
            "醉酒（至下个黄昏）",
          ],
        };
      });
    }
    default:
      console.warn(`[NightActionHandler] 未知 stateUpdates 类型: ${type}`);
      return seats;
  }
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
  const ability = getAbilityForRole(roleId);

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
    // 🔧 送葬者修复：能力管道快照补传 todayExecutedId。
    //   guide 路径（nightInfoGenerator）用上下文 todayExecutedId 找到被处决者，
    //   但 executeViaNewEngine 构造的快照此前不含该字段，导致送葬者
    //   preCheck 的 executedTodayCheck 找不到被处决者 → aborted → 结算弹窗不展示。
    todayExecutedId: context.todayExecutedId ?? null,
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
      abilityId: ability.abilityId ?? `${roleId}_ability`,
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
    const resultContext = await runAbilityPipeline(ability, middlewareContext);

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
      console.log(
        `[executeViaNewEngine] PREVIEW mode for ${roleId}, targets:`,
        context.selectedTargets
      );

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

      // 🔧 信息角色一致性修复：preview 模式下 postProcess 不会执行（displayInfo 不存在），
      //   但 calculate 已算出 abilityResult（含中毒/Vortox 干扰的最终结果）。
      //   此前 NIGHT_ACTION_CONFIRM 弹窗只显示 abilityName（如"占卜"），
      //   而结算弹窗 FORTUNE_TELLER_RESULT 显示 result（含假信息），
      //   导致说书人在预览弹窗看到中性文案、结算弹窗看到假信息——两处不一致。
      //   此处当 abilityResult 为 boolean 时，preview 与结算共享同一份结果描述：
      //   "占卜师探查【3号和5号】：没有恶魔"（受中毒干扰）。
      //   后续扩展其他信息角色时只需在 displayInfo 已有角色分支即可（不变）。
      const selectedTargets = context.selectedTargets || [];
      if (typeof abilityResult === "boolean" && selectedTargets.length > 0) {
        const targetLabels = selectedTargets
          .map((id) => `${id + 1}号`)
          .join("和");
        const resultText = abilityResult ? "有恶魔" : "没有恶魔";
        const corruptionTag = isCorrupted ? "【受中毒/醉酒干扰】" : "";
        actionDescription = `${roleName}${corruptionTag}探查【${targetLabels}】：${resultText}`;
      }

      // 检查是否是系统步骤（如 demon_info, minion_info）
      const isSystemStep = ["demon_info", "minion_info"].includes(
        roleId
      );
      const targetConfig = (ability as any).targetConfig;
      const minTargets = targetConfig?.min ?? 0;

      if (isSystemStep) {
        // 系统信息步骤：直接确认执行，不弹窗
        context.setCurrentModal(null);
        const realContext = { ...context, preview: false };
        return executeViaNewEngine(realContext, roleId);
      }

      if (minTargets === 0) {
        // 不需要选择目标的能力（信息角色、间谍魔典等）
        // 间谍特殊：需要弹出对局记录/魔典查看界面
        if (roleId === "spy") {
          context.setCurrentModal({ type: "SPY_RECORDS", data: null });
          return true;
        }
        // 执行后需要 UI 确认，不要自动跳过
        context.setCurrentModal({
          type: "NIGHT_ACTION_CONFIRM",
          data: {
            roleName,
            actionDescription: displayInfo?.log || actionDescription,
            targetDescriptions: ["（信息获取 - 无目标）"],
            extraNote: isCorrupted
              ? "该角色处于醉酒/中毒状态，能力可能不生效"
              : undefined,
            onConfirm: async () => {
              const realContext: NightActionHandlerContext = {
                ...context,
                preview: false,
              };
              await executeViaNewEngine(realContext, roleId);
            },
            onCancel: () => {
              context.setSelectedActionTargets([]);
            },
          },
        });
        return true;
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
            console.log(
              `[executeViaNewEngine] onConfirm FIRED for ${roleId}, targets:`,
              safeTargets
            );
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
    console.log(
      `[executeViaNewEngine] FULL EXECUTION for ${roleId}, targets:`,
      context.selectedTargets
    );

    // 从 snapshot 中提取更新后的座位状态，并同步状态
    let updatedSeats = resultContext.snapshot.seats as Seat[];
    console.log(
      `[executeViaNewEngine] Syncing ${updatedSeats.length} seats from engine snapshot`
    );

    // 🔧 消费能力管道的 stateUpdates 指令（赌徒/水手/吟游诗人等角色经此下发状态变更）
    const stateUpdates = resultContext.meta.stateUpdates;
    if (stateUpdates) {
      updatedSeats = applyStateUpdates(updatedSeats, stateUpdates, context.nightCount);
      console.log(
        `[executeViaNewEngine] Applied stateUpdates: ${stateUpdates.type}`
      );
    }

    // 同步 updatedSeats 的引擎字段（statusEffects → isPoisoned/isDrunk 等），
    // 确保 computeIsPoisoned 能读取到最新中毒状态
    // 同时同步管家/侍从的主人选择（butlerResult → seat.masterId）
    const butlerRec =
      (resultContext as any)?.actionNode?.meta?.butlerResult ||
      (resultContext as any)?.snapshot?._abilityResults?.butler;
    const syncedSeats: Seat[] = updatedSeats
      ? updatedSeats.map((u: any) => {
          const prev = context.seats.find((s) => s.id === u.id);
          if (!prev) return u as Seat;
          const synced = syncStatusEffectsToSeat(prev, u);
          let next = { ...prev, ...u, ...synced, id: prev.id } as Seat;
          // 🔧 管家/侍从：把引擎算出的主人同步到 seat.masterId（否则投票校验读不到主人）
          if (
            butlerRec &&
            butlerRec.masterSet &&
            (next.role?.id === "butler" || next.role?.id === "qutler")
          ) {
            next = { ...next, masterId: butlerRec.masterId as number };
          }
          return next;
        })
      : [];

    if (syncedSeats.length > 0) {
      context.setSeats(syncedSeats);
      // 🔧 补调 setDeadThisNight：新引擎管道（imp.ability 等）只设 markedForDeath → isDead，
      //   不调 killPlayer 也不记录 deadThisNight，导致天亮报告永远"平安夜"、
      //   送葬者技能失效。此处比较 prev / new isDead，对新增死亡补记。
      const prevSeats = context.seats;
      const newlyDead: number[] = [];
      syncedSeats.forEach((newSeat) => {
        const prevSeat = prevSeats.find((s) => s.id === newSeat.id);
        if (newSeat.isDead && (!prevSeat || !prevSeat.isDead)) {
          if (!newlyDead.includes(newSeat.id)) newlyDead.push(newSeat.id);
        }
      });
      if (newlyDead.length > 0 && context.setDeadThisNight) {
        context.setDeadThisNight((prev: number[]) => {
          const set = new Set(prev);
          for (const id of newlyDead) set.add(id);
          return Array.from(set);
        });
      }
      // 🔧 守鸦人修复：恶魔杀守鸦人后动态插入新引擎觉醒节点
      //   （W8.10.5 把守鸦人改为 deathTriggered 条件入队，但夜间开始生成队列时
      //    守鸦人还活着 → 被过滤；小恶魔正常杀人路径又未调用入队函数，
      //    导致守鸦人被恶魔杀后永远不觉醒。此处对 newlyDead 中守鸦人补调。）
      if (newlyDead.length > 0 && context.enqueueRavenkeeperIfNeeded) {
        for (const id of newlyDead) {
          const deadSeat = syncedSeats.find((s) => s.id === id);
          if (deadSeat?.role?.id === "ravenkeeper") {
            // 🔧 守鸦人修复：就地修改 syncedSeats 闭包引用设置 hasAbilityEvenDead=true，
            //   让下方 continueToNextAction(syncedSeats) 传入的 latestSeats 含该标记，
            //   否则 updateSnapshot→calculateNightInfo 生成 nightInfo.seat 时 isDead=true
            //   且 hasAbilityEvenDead=undefined → preProcessAbility blocked → 守鸦人永远无法行动
            deadSeat.hasAbilityEvenDead = true;
            context.enqueueRavenkeeperIfNeeded(id);
          }
        }
      }

      // 🔧 恶魔死亡判胜：新引擎击杀的 newlyDead 中若含恶魔，立即触发 checkGameOver。
      //   此前只补记 deadThisNight，胜利判定拖到白天流程才触发 → 恶魔被杀后
      //   游戏继续跑白天/黄昏/提名（官方规则：恶魔死亡立即善良获胜）。
      if (newlyDead.length > 0 && context.checkGameOver) {
        const deadDemon = newlyDead.find((id) => {
          const seat = syncedSeats.find((s) => s.id === id);
          return seat?.role?.type === "demon";
        });
        if (deadDemon != null) {
          context.checkGameOver(syncedSeats, deadDemon, false);
          context.addLog(`⚔️ 恶魔 ${deadDemon + 1} 号死亡，触发胜负判定`);
        }
      }

      // 🔧 女巫诅咒桥接：新引擎快照 witchCurse → legacy witchCursedId。
      //   女巫能力 stateUpdate 写入 snapshot.witchCurse = { [targetId]: true }，
      //   useDayActions（白天提名触发死亡）只认 legacy witchCursedId state，
      //   此处桥接保证诅咒在白天生效。
      const witchCurse = (resultContext as any)?.snapshot?.witchCurse;
      if (witchCurse && context.setWitchCursedId) {
        const cursedId = Object.keys(witchCurse)
          .map(Number)
          .find((id) => witchCurse[id] === true);
        if (cursedId != null) {
          context.setWitchCursedId(cursedId);
          context.setWitchActive?.(true);
          context.addLog(`🧙 女巫诅咒了 ${cursedId + 1} 号玩家`);
        }
      }
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
    const displayInfo = resultContext.meta.displayInfo as any;
    if (modal) {
      context.setCurrentModal(modal);
    } else if (
      displayInfo &&
      typeof displayInfo.type === "string" &&
      displayInfo.type.endsWith("_info") &&
      displayInfo.log
    ) {
      // 🔧 信息类角色（洗衣妇/共情者/送葬者/图书管理员/调查员/厨师/守鸦人等）
      //   统一弹结果窗：此前 postProcess 只生成 displayInfo（console 日志），
      //   未设置 meta.modal，导致结算结果不展示。此处用 displayInfo.log 作为
      //   结果文本弹出 INFO_RESULT，确认后继续推进队列。
      //
      //   🔧 信息一致性修复：结算弹窗优先复用 guide（控制台"当前的行动"文案）
      //   中的信息——说书人按 guide 告知玩家后，结算弹窗应显示同一份信息。
      //   此前 guide（nightInfoGenerator 的 legacy dialog）与结算
      //   （新引擎 postProcess displayInfo）各自独立随机，同一角色两处信息
      //   不一致（如 guide 说"5号和3号"、结算说"5号和9号"），说书人无所适从。
      //   此处统一为 guide 的信息；guide 缺信息（如 fallback"准备执行技能"）时
      //   回退 displayInfo.log。
      const guideText = context.nightInfo?.guide || "";
      const guideMatch = guideText.match(/告诉他(.+?)[。.]?$/);
      const guideInfo =
        guideMatch && guideMatch[1] && !guideText.includes("准备执行技能")
          ? guideMatch[1].trim()
          : "";
      const resultText = guideInfo
        ? `${roleName}获得信息：${guideInfo}`
        : displayInfo.log;
      const infoSynced = syncedSeats.length > 0 ? syncedSeats : undefined;
      context.setCurrentModal({
        type: "INFO_RESULT",
        data: {
          roleName,
          resultText,
          onNext: () => {
            context.setCurrentModal(null);
            context.continueToNextAction(infoSynced);
          },
        },
      });
    } else {
      // 🔧 修复：使用 syncedSeats 而非 updatedSeats，确保中毒/醉酒等状态已同步到旧系统字段
      context.continueToNextAction(syncedSeats.length > 0 ? syncedSeats : undefined);
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

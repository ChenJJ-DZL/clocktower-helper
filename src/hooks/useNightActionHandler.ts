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
import { LEGION_MUTUAL_RECOGNITION_ID } from "../roles/demon/demonFirstNightHelper";
import { EVIL_CONVERTED_NOTICE_ID } from "../utils/nightStepIds";
import {
  getAbilityForRole,
  getRawAbilityMap,
} from "../roles/new_engine/abilityRegistry";
import type { NightInfoResult } from "../types/game";
import {
  getLunaticNightHint,
  getPlayerFacingRole,
  sanitizePlayerFacingText,
} from "../utils/playerView";
import {
  buildCorruptedInfoMask,
  classifyCorruptedInfoRole,
  discardDisguisedSideEffects,
  ensureNotTruth,
  isDisguisedIneffectiveActor,
  isPlayerInfoCorrupted,
} from "../utils/corruptedInfo";
import { isInformationRole } from "../utils/informationRoles";
import type { ModalType } from "../types/modal";
import type { NightActionContext } from "../types/roleDefinition";
import { resolveEvilTwinPair } from "../utils/evilTwinHelper";
import {
  applyFarmerSuccession,
  FARMER_SUCCESSOR_RESULT_TEXT,
  findFarmerSuccessionTrigger,
} from "../utils/farmerSuccession";
import { computeIsPoisoned } from "../utils/gameRules";
import { runAbilityPipeline } from "../utils/middlewarePipeline";
import type { GameStateSnapshot } from "../utils/middlewareTypes";
import { calculateNightInfoViaNewEngine } from "../utils/nightInfoAdapter";
import { checkAndUpdatePixieAbility } from "../utils/pixieHelper";

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
  setEvilTwinPair?: (pair: { evilId: number; goodId: number } | null) => void;
  dispatch?: (action: any) => void;

  // 辅助函数
  addLog: (message: string) => void;
  continueToNextAction: (latestSeats?: Seat[]) => void;
  setCurrentModal: React.Dispatch<React.SetStateAction<ModalType>>;
  preview?: boolean; // 预览模式：只计算不修改状态，弹出确认窗
  markAbilityUsed: (roleId: string, seatId: number) => void;
  hasUsedAbility: (roleId: string, seatId: number) => boolean;
  /** 撤销到上一步快照（用于「撤销本次行动」）。注意：无脑调用会回退到无关操作，
   *  只应在「该角色本夜行动已执行」时使用。 */
  undo?: () => void;
  reviveSeat: (seat: Seat) => Seat;
  insertIntoWakeQueueAfterCurrent: (seatId: number, options?: any) => void;
  /** 🔧 守鸦人修复：恶魔杀守鸦人后动态插入新引擎觉醒节点 */
  enqueueRavenkeeperIfNeeded?: (targetId: number) => void;
}

// ---------------------------------------------------------------------------
// Status sync helpers
// ---------------------------------------------------------------------------

/** 将 React Seat 的遗留布尔字段翻译为新引擎 statusEffects[] */
function translateLegacyStatusesToEffects(_seat: Seat): any[] {
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
          (e: any) =>
            !(
              e.type === "drunk" &&
              (e.source === "sailor" ||
                e.source === "minstrel" ||
                e.source === "bard")
            )
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
              (st: any) =>
                !(st.effect === "Drunk" && st.duration === "至下个黄昏")
            ),
            { effect: "Drunk", duration: "至下个黄昏" },
          ],
          statusDetails: [
            ...(s.statusDetails || []).filter(
              (d) => !d.includes("醉酒（至下个黄昏）")
            ),
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
  //
  // 「重复执行 = 替换」通用规则（覆盖所有主动技能角色）：
  //   执行某角色的能力前，先清除**该角色本夜先前留下**的状态效果，
  //   避免同一角色同夜二次执行时效果叠加（僧侣两次保护、投毒者两次下毒…）。
  //   只清「同源 + 同夜」的效果，不会误伤昨夜遗留或其他角色施加的效果。
  const isOwnSameNightEffect = (e: any) =>
    !!e &&
    e.source === roleId &&
    (e.appliedAtNight === context.nightCount ||
      (e.appliedAtNight === undefined &&
        e.expiresAtNight === context.nightCount + 1));

  const snapshotSeats: any[] = context.seats.map((s) => {
    const legacyEffects = translateLegacyStatusesToEffects(s);
    const ownEffects = ((s as any).statusEffects || []).filter(
      (e: any) => !isOwnSameNightEffect(e)
    );
    return {
      ...s,
      isAlive: !s.isDead,
      statusEffects: [...legacyEffects, ...ownEffects],
    };
  });

  const isVortox = Boolean(
    context.vortoxWorld ||
      context.seats.some(
        (s) =>
          (s.role?.id === "vortox" || (s as any).roleId === "vortox") &&
          !s.isDead
      )
  );

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
    evilTwinPair: (context as any).evilTwinPair ?? null,
    globalEffects: { vortoxWorld: isVortox },
    vortoxWorld: isVortox,
    isVortoxWorld: isVortox,
  };

  const actorId =
    context.nightInfo?.seat?.id ??
    (ability as any).seatId ??
    context.seats.find((s) => s.role?.id === roleId)?.id ??
    context.seats.find(
      (s) =>
        s.role?.id === "pixie" &&
        !s.isDead &&
        ((s as any).pixieCopiedRole === roleId ||
          (s as any).acquiredAbilities?.includes?.(roleId))
    )?.id ??
    -1;
  const actorSeat = context.seats.find((s) => s.id === actorId);
  const rawRoleName =
    context.nightInfo?.effectiveRole?.name || actorSeat?.role?.name || roleId;
  const seatPrefix = actorId >= 0 ? `${actorId + 1}号-` : "";
  const roleName = `${seatPrefix}${rawRoleName.replace(/^\d+号[-_]/, "")}`;

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
    // 注意：在 preview 模式下，如果 preCheck 通过但 calculate 因目标未选而 abort，绝不能跳过，而是继续打开确认窗让玩家选人！
    if (
      resultContext.meta._preCheckAborted ||
      (!context.preview && resultContext.aborted)
    ) {
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

      // 男爵：纯被动设置角色，不唤醒且不弹窗，直接推进
      if (roleId === "baron") {
        console.log("[executeViaNewEngine] 男爵为被动设置角色，跳过夜间行动");
        context.continueToNextAction();
        return true;
      }

      // 首夜小恶魔：首夜恶魔不杀人，转为恶魔互认（demon_info）步骤
      if (context.gamePhase === "firstNight" && roleId === "imp") {
        const demonInfo = calculateNightInfoViaNewEngine(
          (context as any).selectedScript ?? null,
          context.seats,
          actorId,
          "firstNight",
          null,
          1,
          "demon_info"
        );
        const displayName = `${seatPrefix}恶魔互认`;
        const guideInfo =
          demonInfo?.guide ||
          demonInfo?.guideText ||
          `${displayName}信息已生成`;

        context.setCurrentModal({
          type: "NIGHT_ACTION_CONFIRM",
          data: {
            roleName: displayName,
            actionDescription: "恶魔爪牙互认与伪装角色告知",
            targetDescriptions: ["（首夜信息 - 无目标）"],
            onConfirm: () => {
              context.setCurrentModal({
                type: "INFO_RESULT",
                data: {
                  roleName: displayName,
                  resultText: guideInfo,
                  onNext: () => {
                    context.setCurrentModal(null);
                    context.continueToNextAction();
                  },
                },
              });
            },
            onCancel: () => {
              context.setCurrentModal(null);
            },
          },
        });
        return true;
      }

      // 检查是否是系统步骤（如 demon_info, minion_info, good_twin_info）
      const isGoodTwinStep = roleId === "good_twin_info";
      const isSystemStep = [
        "demon_info",
        "minion_info",
        LEGION_MUTUAL_RECOGNITION_ID,
        "good_twin_info",
        EVIL_CONVERTED_NOTICE_ID,
      ].includes(roleId);
      /**
       * 🌀 A2：疯子（lunatic）在确认弹窗里的目标数量必须**照假恶魔**（如沙巴洛斯选 2 人），
       * 而能力注册表里的 targetConfig 是静态的 1/1。因此疯子优先采用
       * nightInfo.targetLimit（由 nightInfoGenerator 按 apparentDemonRole 计算）。
       */
      const isLunaticActor =
        actorSeat?.role?.id === "lunatic" || roleId === "lunatic";
      const targetConfig = isLunaticActor
        ? (context.nightInfo?.targetLimit ?? (ability as any)?.targetConfig)
        : (ability as any)?.targetConfig || context.nightInfo?.targetLimit;
      const minTargets = targetConfig?.min ?? 0;
      const maxTargets = targetConfig?.max ?? 0;
      const allowSelf = targetConfig?.allowSelf ?? true;
      const aliveOnly = targetConfig?.aliveOnly ?? false;

      if (isSystemStep) {
        if (isGoodTwinStep) {
          const { evilTwinSeat } = resolveEvilTwinPair(
            context.seats,
            (context as any).evilTwinPair
          );
          const evilSeatNo = evilTwinSeat
            ? `${evilTwinSeat.id + 1}号`
            : "对立玩家";
          const displayName = `${seatPrefix}${rawRoleName || "善良双子"}(双子告知)`;
          const actionDesc = `告知对立双子：${evilSeatNo}是镜像双子`;
          const guideInfo = `唤醒${actorId + 1}号【${rawRoleName || "对立双子"}】，告知他：${evilSeatNo}是镜像双子。`;

          context.setCurrentModal({
            type: "NIGHT_ACTION_CONFIRM",
            data: {
              roleName: displayName,
              actionDescription: actionDesc,
              targetDescriptions: [`【双子告知】${evilSeatNo}是镜像双子`],
              onConfirm: () => {
                context.setCurrentModal({
                  type: "INFO_RESULT",
                  data: {
                    roleName: displayName,
                    resultText: `【双子告知】${evilSeatNo}是镜像双子`,
                    onNext: () => {
                      context.setCurrentModal(null);
                      context.continueToNextAction();
                    },
                  },
                });
              },
              onCancel: () => {
                context.setCurrentModal(null);
              },
            },
          });
          return true;
        }

        const isLegion =
          roleId === LEGION_MUTUAL_RECOGNITION_ID ||
          (roleId === "demon_info" &&
            context.nightInfo?.seat?.role?.id === "legion");
        const displayName = isLegion
          ? "军团互认"
          : `${seatPrefix}${
              roleId === "minion_info" ? "爪牙互认" : "恶魔互认"
            }`;
        const actionDesc =
          roleId === "minion_info"
            ? "恶魔爪牙互认与信息告知"
            : isLegion
              ? "军团首夜全员统一互认与伪装角色告知"
              : "恶魔爪牙互认与伪装角色告知";
        const guideInfo =
          context.nightInfo?.guide ||
          context.nightInfo?.guideText ||
          `${displayName}信息已生成`;

        const isEvilSystemStep =
          roleId === "demon_info" || roleId === "minion_info" || isLegion;
        const hasAliveWraith = context.seats.some(
          (s) => s.role?.id === "wraith" && !s.isDead
        );
        const systemExtraNote =
          hasAliveWraith && isEvilSystemStep
            ? "⚠️ 场上有存活的亡魂，请将亡魂与邪恶玩家共同唤醒并在场监督。"
            : undefined;

        context.setCurrentModal({
          type: "NIGHT_ACTION_CONFIRM",
          data: {
            roleName: displayName,
            actionDescription: actionDesc,
            targetDescriptions: ["（首夜信息 - 无目标）"],
            extraNote: systemExtraNote,
            onConfirm: () => {
              context.setCurrentModal({
                type: "INFO_RESULT",
                data: {
                  roleName: displayName,
                  resultText: guideInfo,
                  onNext: () => {
                    context.setCurrentModal(null);
                    context.continueToNextAction();
                  },
                },
              });
            },
            onCancel: () => {
              context.setCurrentModal(null);
            },
          },
        });
        return true;
      }

      if (maxTargets === 0 && roleId !== "ojo" && roleId !== "brewer") {
        // 不需要选择目标的能力（信息角色、间谍魔典等）
        // 间谍特殊：需要弹出对局记录/魔典查看界面
        if (roleId === "spy") {
          context.setCurrentModal({ type: "SPY_RECORDS", data: null });
          return true;
        }

        const { evilTwinSeat, isGoodTwin } = resolveEvilTwinPair(
          context.seats,
          (context as any).evilTwinPair
        );
        const isGoodTwinActor =
          (context.gamePhase === "firstNight" || context.nightCount === 1) &&
          evilTwinSeat &&
          isGoodTwin(actorId);

        const mergedActionDesc = isGoodTwinActor
          ? `【双子告知】${evilTwinSeat.id + 1}号是镜像双子\n${displayInfo?.log || actionDescription}`
          : displayInfo?.log || actionDescription;

        const mergedTargets = isGoodTwinActor
          ? [`【双子告知】${evilTwinSeat.id + 1}号是镜像双子`]
          : ["（信息获取 - 无目标）"];

        const hasAliveWraith = context.seats.some(
          (s) => s.role?.id === "wraith" && !s.isDead
        );
        const isEvilActor =
          actorSeat?.role?.type === "demon" ||
          actorSeat?.role?.type === "minion" ||
          (actorSeat?.role as any)?.team === "evil" ||
          (actorSeat as any)?.isEvilConverted === true ||
          ["demon_info", "minion_info"].includes(roleId);
        const wraithNote =
          hasAliveWraith && isEvilActor
            ? "⚠️ 场上有存活的亡魂，请将亡魂与邪恶玩家共同唤醒并在场监督。"
            : undefined;

        const combinedNotes = [
          isCorrupted ? "该角色处于醉酒/中毒状态，能力可能不生效" : null,
          wraithNote,
        ].filter(Boolean);

        // 执行后需要 UI 确认，不要自动跳过
        context.setCurrentModal({
          type: "NIGHT_ACTION_CONFIRM",
          data: {
            roleName,
            actionDescription: mergedActionDesc,
            targetDescriptions: mergedTargets,
            extraNote:
              combinedNotes.length > 0 ? combinedNotes.join("\n") : undefined,
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

      // 弹窗确认（含弹窗内安全防窥选人交互）
      const safeTargets = [...(context.selectedTargets || [])];

      const { evilTwinSeat, isGoodTwin } = resolveEvilTwinPair(
        context.seats,
        (context as any).evilTwinPair
      );
      const isGoodTwinActiveActor =
        (context.gamePhase === "firstNight" || context.nightCount === 1) &&
        evilTwinSeat &&
        isGoodTwin(actorId);

      const openActiveSkillModal = () => {
        const hasToymaker =
          context.seats.some((s) => s.role?.id === "toymaker") ||
          ((context as any).snapshot as any)?.fabled?.some?.((f: any) =>
            typeof f === "string" ? f === "toymaker" : f?.id === "toymaker"
          );
        const isDemonActor =
          actorSeat?.role?.type === "demon" ||
          [
            "imp",
            "po",
            "zombuul",
            "pukka",
            "shabaloth",
            "fang_gu",
            "vigormortis",
            "vigor_mortis",
            "no_dashii",
            "vortox",
            "ojo",
            "al_hadikhia",
            "legion",
            "kazali",
            "leviathan",
            "riot",
            "lil_monsta",
            "taowu",
            "qiongqi",
            "taotie",
            "zhen",
          ].includes(roleId);
        const effectiveMinTargets =
          hasToymaker && isDemonActor ? 0 : minTargets;

        const hasAliveWraith = context.seats.some(
          (s) => s.role?.id === "wraith" && !s.isDead
        );
        const isEvilActor =
          actorSeat?.role?.type === "demon" ||
          actorSeat?.role?.type === "minion" ||
          (actorSeat?.role as any)?.team === "evil" ||
          (actorSeat as any)?.isEvilConverted === true ||
          ["demon_info", "minion_info"].includes(roleId);
        const wraithNote =
          hasAliveWraith && isEvilActor
            ? "⚠️ 场上有存活的亡魂，请将亡魂与邪恶玩家共同唤醒并在场监督。"
            : undefined;

        const extraNotes: string[] = [];
        if (isGoodTwinActiveActor) {
          extraNotes.push(
            `👥【双子告知】已告知该玩家：${evilTwinSeat.id + 1}号是镜像双子`
          );
        }
        // ⚠️ 原本在 isCorrupted（中毒/醉酒/涡流）时向确认弹窗追加
        // 「该角色处于醉酒/中毒状态，能力可能不生效」——已移除：
        // 技能确认页会视情况**交给玩家亲手点击**，「受干扰」属说书人视角信息，不得让玩家看到。
        // 说书人仍可在控制台的「当前的行动」中看到「行动（受干扰）」（GameConsole 保留）。
        if (wraithNote) {
          extraNotes.push(wraithNote);
        }
        if (hasToymaker && isDemonActor) {
          extraNotes.push("🎭 玩具匠在场：恶魔可选择不选目标（空刀）跳过攻击");
        }
        const extraNote =
          extraNotes.length > 0 ? extraNotes.join("\n") : undefined;
        // 🌀 A4：真恶魔（含 legion 等统一行动恶魔）在确认页要看到疯子本夜的选择。
        //    提示内容由 utils/playerView.ts 统一生成（多目标全列、0 目标也有明确文案）。

        // 😈 小恶魔自杀转火：若在进入前已明确选择自杀，且有多名存活爪牙，直接弹出爪牙晋升选择面板
        const isInitialImpSuicide =
          roleId === "imp" && safeTargets[0] === actorId;
        if (isInitialImpSuicide) {
          const aliveMinions = context.seats.filter(
            (s) => s.role?.type === "minion" && !s.isDead && s.id !== actorId
          );
          if (aliveMinions.length > 1) {
            context.setCurrentModal({
              type: "STORYTELLER_SELECT",
              data: {
                sourceId: actorId,
                roleId: "imp",
                roleName: "小恶魔",
                title: "😈 小恶魔自戕转火传位",
                description: `${actorId + 1}号小恶魔选择自杀！场上有 ${aliveMinions.length} 名存活爪牙，请选择由哪位爪牙晋升为新的【小恶魔】：`,
                targetCount: 1,
                filterCandidates: (s: Seat) =>
                  aliveMinions.some((m) => m.id === s.id),
                confirmLabel: "确认晋升为小恶魔",
                onConfirm: async (targetIds: number[]) => {
                  const chosenMinionId = targetIds[0];
                  const realContext: NightActionHandlerContext = {
                    ...context,
                    preview: false,
                    selectedTargets: safeTargets,
                    actionData: { successorSeatId: chosenMinionId },
                  };
                  await executeViaNewEngine(realContext, roleId);
                },
              },
            } as any);
            return;
          } else if (aliveMinions.length === 1) {
            actionDescription = `小恶魔选择自杀，将传位给爪牙【${aliveMinions[0].id + 1}号 ${aliveMinions[0].role?.name}】成为新小恶魔。`;
          }
        }

        context.setCurrentModal({
          type: "NIGHT_ACTION_CONFIRM",
          data: {
            roleName,
            roleId,
            actionDescription,
            targetDescriptions,
            targetLimit: { min: effectiveMinTargets, max: maxTargets },
            actorSeatId: actorId,
            allowSelf,
            aliveOnly,
            initialSelectedTargets: safeTargets,
            requiresRoleSelection: ["cerenovus", "ojo", "brewer"].includes(
              roleId
            ),
            availableRoles: context.roles,
            selectedScript: (context as any).selectedScript,
            extraNote,
            // 🌀 A4：真恶魔的确认页必须看到「疯子本夜选择了谁」（官方：恶魔知道）。
            lunaticHint: isDemonActor
              ? (getLunaticNightHint(context.seats as Seat[]) ?? undefined)
              : undefined,
            onConfirm: async (
              chosenTargets?: number[],
              chosenRoleIdOrRole?: any
            ) => {
              const finalTargets =
                chosenTargets !== undefined ? chosenTargets : safeTargets;
              console.log(
                `[executeViaNewEngine] onConfirm FIRED for ${roleId}, targets:`,
                finalTargets,
                chosenRoleIdOrRole
              );

              // 🎭 玩具匠跳过攻击判定
              if (finalTargets.length === 0 && hasToymaker && isDemonActor) {
                context.addLog(
                  "🎭 玩具匠在场：恶魔选择跳过攻击，今晚无人被恶魔杀死"
                );
                const realContext: NightActionHandlerContext = {
                  ...context,
                  preview: false,
                  selectedTargets: [],
                };
                await executeViaNewEngine(realContext, roleId);
                return;
              }

              // 🎭 镇长替死技能修正弹窗
              const aliveCount = context.seats.filter((s) => !s.isDead).length;
              const targetedMayor = context.seats.find(
                (s) =>
                  finalTargets.includes(s.id) &&
                  s.role?.id === "mayor" &&
                  !s.isDead &&
                  !s.isDrunk &&
                  !s.isPoisoned &&
                  aliveCount >= 3
              );
              if (
                isDemonActor &&
                targetedMayor &&
                context.actionData?.mayorSubstituteId === undefined
              ) {
                context.setCurrentModal({
                  type: "STORYTELLER_SELECT",
                  data: {
                    sourceId: actorId,
                    roleId: "mayor",
                    roleName: "镇长",
                    title: "🎭 技能修正：镇长替死判定",
                    description: `恶魔攻击了【${targetedMayor.id + 1}号-镇长】！作为说书人，你可以选择由另一名存活玩家替死，或者选择镇长本人正常死亡：`,
                    targetCount: 1,
                    filterCandidates: (s: Seat) => !s.isDead,
                    confirmLabel: "确认替死/击杀目标",
                    onConfirm: async (targetIds: number[]) => {
                      const chosenSubId = targetIds[0];
                      const realContext: NightActionHandlerContext = {
                        ...context,
                        preview: false,
                        selectedTargets: finalTargets,
                        actionData: {
                          ...(context.actionData || {}),
                          mayorSubstituteId: chosenSubId,
                        },
                      };
                      await executeViaNewEngine(realContext, roleId);
                    },
                  },
                } as any);
                return;
              }

              // 😈 小恶魔自杀转火：若有多名存活爪牙，弹出爪牙晋升选择面板
              const isImpSuicide =
                roleId === "imp" && finalTargets[0] === actorId;
              if (isImpSuicide) {
                const aliveMinions = context.seats.filter(
                  (s) =>
                    s.role?.type === "minion" && !s.isDead && s.id !== actorId
                );
                if (aliveMinions.length > 1) {
                  context.setCurrentModal({
                    type: "STORYTELLER_SELECT",
                    data: {
                      sourceId: actorId,
                      roleId: "imp",
                      roleName: "小恶魔",
                      title: "😈 小恶魔自戕转火传位",
                      description: `${actorId + 1}号小恶魔选择自杀！场上有 ${aliveMinions.length} 名存活爪牙，请选择由哪位爪牙晋升为新的【小恶魔】：`,
                      targetCount: 1,
                      filterCandidates: (s: Seat) =>
                        aliveMinions.some((m) => m.id === s.id),
                      confirmLabel: "确认晋升为小恶魔",
                      onConfirm: async (targetIds: number[]) => {
                        const chosenMinionId = targetIds[0];
                        const realContext: NightActionHandlerContext = {
                          ...context,
                          preview: false,
                          selectedTargets: finalTargets,
                          actionData: { successorSeatId: chosenMinionId },
                        };
                        await executeViaNewEngine(realContext, roleId);
                      },
                    },
                  } as any);
                  return;
                }
              }

              // 🧠 洗脑师：已在行动确认窗内同时选定目标与角色，无需二级弹窗，直接执行管道
              if (roleId === "cerenovus") {
                if (finalTargets.length !== 1) {
                  alert("洗脑师必须选择一名玩家");
                  return;
                }
                const chosenRoleId =
                  typeof chosenRoleIdOrRole === "string"
                    ? chosenRoleIdOrRole
                    : chosenRoleIdOrRole?.id;
                if (!chosenRoleId) {
                  alert("洗脑师必须选择一个角色");
                  return;
                }
                const selectedRole = context.roles.find(
                  (r) => r.id === chosenRoleId
                );
                const chosenRoleName = selectedRole?.name || chosenRoleId;
                const realContext: NightActionHandlerContext = {
                  ...context,
                  preview: false,
                  selectedTargets: finalTargets,
                  actionData: { roleName: chosenRoleName, chosenRoleId },
                };
                await executeViaNewEngine(realContext, roleId);
                return;
              }

              // 👁️ 奥乔：选择角色名进行暗杀
              if (roleId === "ojo") {
                const chosenRoleId =
                  typeof chosenRoleIdOrRole === "string"
                    ? chosenRoleIdOrRole
                    : chosenRoleIdOrRole?.id;
                if (!chosenRoleId) {
                  alert("奥乔必须选择一个角色");
                  return;
                }
                const selectedRole = context.roles.find(
                  (r) => r.id === chosenRoleId
                );
                const chosenRoleName = selectedRole?.name || chosenRoleId;
                const aliveTargetSeat = context.seats.find(
                  (s) => s.role?.id === chosenRoleId && !s.isDead
                );
                if (!aliveTargetSeat) {
                  context.setCurrentModal({
                    type: "STORYTELLER_SELECT",
                    data: {
                      sourceId: actorId,
                      roleId: "ojo",
                      roleName: "奥乔",
                      title: "👁️ 奥乔空刀替死指派",
                      description: `奥乔选择了角色【${chosenRoleName}】，但该角色当前不在场或已死亡！请说书人指定一名存活玩家死亡：`,
                      targetCount: 1,
                      filterCandidates: (s: Seat) => !s.isDead,
                      confirmLabel: "确认击杀该玩家",
                      onConfirm: async (targetIds: number[]) => {
                        const fallbackTargetId = targetIds[0];
                        const realContext: NightActionHandlerContext = {
                          ...context,
                          preview: false,
                          selectedTargets: [],
                          actionData: {
                            ...(context.actionData || {}),
                            targetRoleId: chosenRoleId,
                            fallbackTargetId,
                          },
                        };
                        await executeViaNewEngine(realContext, roleId);
                      },
                    },
                  } as any);
                  return;
                } else {
                  const realContext: NightActionHandlerContext = {
                    ...context,
                    preview: false,
                    selectedTargets: [aliveTargetSeat.id],
                    actionData: {
                      ...(context.actionData || {}),
                      targetRoleId: chosenRoleId,
                    },
                  };
                  await executeViaNewEngine(realContext, roleId);
                  return;
                }
              }

              // 🍺 酿酒师：选择镇民角色并预设信息
              if (roleId === "brewer") {
                const chosenRoleId =
                  typeof chosenRoleIdOrRole === "string"
                    ? chosenRoleIdOrRole
                    : chosenRoleIdOrRole?.id;
                if (!chosenRoleId) {
                  alert("酿酒师必须选择一个镇民角色");
                  return;
                }
                const selectedRole = context.roles.find(
                  (r) => r.id === chosenRoleId
                );
                const chosenRoleName = selectedRole?.name || chosenRoleId;
                const realContext: NightActionHandlerContext = {
                  ...context,
                  preview: false,
                  selectedTargets: [],
                  actionData: {
                    ...(context.actionData || {}),
                    targetRoleId: chosenRoleId,
                    roleId: chosenRoleId,
                    message: `由酿酒师给出的【${chosenRoleName}】预设信息`,
                    info: `由酿酒师给出的【${chosenRoleName}】预设信息`,
                  },
                };
                await executeViaNewEngine(realContext, roleId);
                return;
              }

              // 用户确认后，用选中的目标参数执行真实管道
              const realContext: NightActionHandlerContext = {
                ...context,
                preview: false,
                selectedTargets: finalTargets,
              };
              await executeViaNewEngine(realContext, roleId);
            },
            onCancel: () => {
              const alreadyExecuted =
                actorId !== null &&
                actorId !== undefined &&
                context.hasUsedAbility(roleId, actorId);
              console.log(`[executeViaNewEngine] onCancel for ${roleId}`, {
                alreadyExecuted,
              });
              context.setSelectedActionTargets([]);
              // 「撤销本次行动」：只有本夜该角色确实已执行过才回退，
              // 否则会连上一步无关操作一起撤掉。
              if (alreadyExecuted) {
                context.undo?.();
              }
            },
          },
        });
      };

      // 情况 3：主动技能角色，先单独唤醒告知“X号是镜像双子”，再触发技能确认弹窗和技能结果弹窗
      if (isGoodTwinActiveActor) {
        context.setCurrentModal({
          type: "NIGHT_ACTION_CONFIRM",
          data: {
            roleName: `${roleName}（双子告知）`,
            actionDescription: `👥【双子告知】请先告知${actorId + 1}号玩家：\n${evilTwinSeat.id + 1}号是镜像双子！`,
            targetDescriptions: [
              `【双子告知】${evilTwinSeat.id + 1}号是镜像双子`,
            ],
            onConfirm: () => {
              openActiveSkillModal();
            },
            onCancel: () => {
              context.setSelectedActionTargets([]);
            },
          },
        });
        return true;
      }

      openActiveSkillModal();
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

    // 提取双子对信息（供后续状态同步与结果展示共用）
    const evilTwinPair = (resultContext as any)?.snapshot?.evilTwinPair;

    // 🔧 消费能力管道的 stateUpdates 指令（赌徒/水手/吟游诗人等角色经此下发状态变更）
    const stateUpdates = resultContext.meta.stateUpdates;
    if (stateUpdates) {
      updatedSeats = applyStateUpdates(
        updatedSeats,
        stateUpdates,
        context.nightCount
      );
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
    // 🔧 方古跳变消费（W8.14.14）：引擎 stateUpdate 已把外来者 role 改为 fang_gu、
    //   原方古标记死亡。此处读取 fangGuJump（新方古座位 id），确保：
    //   ① 新方古 role 正确同步到 UI（`...u` 已含 role，此处再兜底防 prev 覆盖）；
    //   ② 跳变当晚原方古死亡标记落地（isDead）→ 后续判胜/队列正确。
    const fangGuJump =
      ((resultContext as any)?.snapshot?.fangGuJump ??
      (resultContext as any)?.meta?.fangGuJump ??
      (resultContext as any)?.snapshot?._abilityResults?.fang_gu?.becomesFangGu)
        ? (resultContext as any)?.snapshot?._abilityResults?.fang_gu?.targetId
        : null;
    const fangGuActorId = (resultContext as any)?.actionNode?.seatId;
    let syncedSeats: Seat[] = updatedSeats
      ? updatedSeats.map((u: any) => {
          const prev = context.seats.find((s) => s.id === u.id);
          if (!prev) return u as Seat;
          const synced = syncStatusEffectsToSeat(prev, u);
          let next = {
            ...prev,
            ...u,
            ...synced,
            id: prev.id,
            statusDetails: Array.from(
              new Set([
                ...(synced.statusDetails || []),
                ...(u.statusDetails || []),
              ])
            ),
          } as Seat;
          // 🔧 管家/侍从：把引擎算出的主人同步到 seat.masterId（否则投票校验读不到主人）
          if (
            butlerRec?.masterSet &&
            (next.role?.id === "butler" || next.role?.id === "qutler")
          ) {
            next = { ...next, masterId: butlerRec.masterId as number };
          }
          // 🔧 方古跳变：新方古（原外来者）role 强制同步为 fang_gu/demon
          if (fangGuJump != null && u.id === fangGuJump) {
            next = {
              ...next,
              role: {
                ...(next.role ?? {}),
                id: "fang_gu",
                name: "方古",
                type: "demon",
              },
              isEvilConverted: true,
              isGoodConverted: false,
            } as Seat;
          }
          // 🔧 方古跳变：原方古（行动者）死亡标记兜底同步
          if (
            fangGuJump != null &&
            u.id === fangGuActorId &&
            next.isDead !== true
          ) {
            next = {
              ...next,
              isAlive: false,
              isDead: true,
              markedForDeath: true,
              deathSource: (next as any).deathSource || "fang_gu_jump",
            } as Seat;
          }
          // 🧠 洗脑师：疯狂角色与状态同步
          if ((u as any).cerenovusMadnessRole || (u as any).isMad) {
            next = {
              ...next,
              isMad: true,
              cerenovusMadnessRole:
                (u as any).cerenovusMadnessRole ||
                (next as any).cerenovusMadnessRole,
            };
          }
          return next;
        })
      : [];

    // 🎭 酒鬼 / 提线木偶：官方明确"这些能力不会产生任何效果"（提线木偶条目：
    //    「认为自己是提线木偶的玩家所抽取到的善良角色对应的能力不会产生任何效果，
    //      但说书人会假装这些效果生效了。这与酒鬼的运作方式相似。」）
    //    因此这里**丢弃管道对座位状态的改动**：不真杀、不真改状态、不影响他人。
    //    玩家页仍会看到"生效了"的结果（由上面的假值校验层给出）。
    syncedSeats = discardDisguisedSideEffects(
      context.seats,
      syncedSeats,
      actorSeat as any
    );
    if (isDisguisedIneffectiveActor(actorSeat as any)) {
      context.addLog(
        `[规则] ${(actorSeat?.id ?? 0) + 1}号 的能力按官方规则不产生任何效果（酒鬼/提线木偶）`
      );
    }

    if (syncedSeats.length > 0) {
      syncedSeats = checkAndUpdatePixieAbility(syncedSeats, context.addLog);
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

      // 🌾 农夫遇害传承：如果死者中有农夫且未中毒/醉酒，弹出选择新农夫面板
      // 判定抽到纯函数里（含「中毒/醉酒农夫不触发」的官方边界），便于单测覆盖
      const deadFarmerId = findFarmerSuccessionTrigger(
        prevSeats as any,
        newlyDead,
        (seat, all) => computeIsPoisoned(seat as any, all as any)
      );
      const aliveGoodCandidates = syncedSeats.filter(
        (s) =>
          !s.isDead &&
          !s.isEvilConverted &&
          s.role?.type !== "demon" &&
          s.role?.type !== "minion" &&
          s.role?.id !== "farmer"
      );

      if (deadFarmerId !== undefined && aliveGoodCandidates.length > 0) {
        context.setCurrentModal({
          type: "STORYTELLER_SELECT",
          data: {
            sourceId: deadFarmerId,
            roleId: "farmer",
            roleName: "农夫",
            title: "🌾 农夫遇害传承",
            description: `${deadFarmerId + 1}号【农夫】在夜间遇害！请为农夫选择一名存活善良玩家成为新【农夫】：`,
            targetCount: 1,
            filterCandidates: (s: Seat) =>
              aliveGoodCandidates.some((c) => c.id === s.id),
            confirmLabel: "确认转变为新农夫",
            onConfirm: (targetIds: number[]) => {
              const targetId = targetIds[0];
              if (targetId === undefined || targetId === null) {
                // 没选到人（理论上弹窗会禁用确认）→ 不改变任何座位，直接继续流程
                context.continueToNextAction();
                return;
              }

              // 1) 身份**整体替换**为新农夫（唯一事实来源：role 对象 + legacy roleId/roleName/roleType + 标记），
              //    这样界面立刻显示为「农夫」，技能也随之按农夫解析。
              const finalSeats = applyFarmerSuccession(
                syncedSeats as any,
                targetId
              ).seats as unknown as Seat[];
              context.setSeats(finalSeats);

              // 2) 让引擎把该玩家当作农夫处理：插入后续唤醒队列并带 roleOverride
              //    （沿用「方古跳变」的既有范式，否则后续步骤仍按旧角色解析）。
              context.insertIntoWakeQueueAfterCurrent?.(targetId, {
                roleOverride: {
                  id: "farmer",
                  name: "农夫",
                  type: "townsfolk",
                } as any,
                logLabel: `🌾 新农夫（${targetId + 1}号 · 身份变更）`,
              });

              context.addLog(
                `🌾 农夫传承完成：${targetId + 1}号玩家转变为新【农夫】`
              );

              // 3) 立即唤醒新农夫并展示结果页「你的身份变为【农夫】」（走既有 INFO_RESULT 机制，确认后继续夜间流程）
              context.setCurrentModal({
                type: "INFO_RESULT",
                data: {
                  roleName: "农夫",
                  resultText: FARMER_SUCCESSOR_RESULT_TEXT,
                  onNext: () => {
                    context.setCurrentModal(null);
                    context.continueToNextAction(finalSeats);
                  },
                },
              } as any);
            },
          },
        } as any);
        return true;
      }

      // 🔧 方古跳变入队（W8.14.14）：原方古（行动者）死亡后，新方古（原外来者）
      //   继承恶魔身份——若本夜队列已不含方古节点（原方古节点已处理），
      //   需把新方古插入后续队列，否则第 2 夜起无恶魔杀人 → 平安夜死局（SV 实测 P0）。
      if (fangGuJump != null && context.insertIntoWakeQueueAfterCurrent) {
        const newFangGu = syncedSeats.find((s) => s.id === fangGuJump);
        const actorSeat = syncedSeats.find((s) => s.id === fangGuActorId);
        if (
          newFangGu &&
          newFangGu.role?.id === "fang_gu" &&
          !newFangGu.isDead &&
          actorSeat?.isDead
        ) {
          // 仅当原方古确实死亡（跳变成立）且新方古存活时插入队列
          context.insertIntoWakeQueueAfterCurrent(fangGuJump, {
            roleOverride: {
              id: "fang_gu",
              name: "方古",
              type: "demon",
              firstNightOrder: 0,
              otherNightOrder: 50,
            } as any,
            logLabel: `方古跳变 → 新方古（${fangGuJump + 1}号）`,
          });
          context.addLog(
            `🔄 方古跳变：${(fangGuActorId ?? 0) + 1}号死亡，${
              fangGuJump + 1
            }号成为新方古`
          );
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

      // 👥 镜像双子桥接：新引擎快照 evilTwinPair → legacy evilTwinPair & isGoodTwin
      if (evilTwinPair) {
        const goodSeatId = evilTwinPair.goodSeatId ?? evilTwinPair.goodId;
        const evilSeatId = evilTwinPair.evilSeatId ?? evilTwinPair.evilId;
        if (goodSeatId !== undefined) {
          syncedSeats.forEach((s) => {
            s.isGoodTwin = s.id === goodSeatId;
          });
          if (context.dispatch) {
            context.dispatch({
              type: "UPDATE_STATE",
              updates: {
                evilTwinPair: {
                  evilId: evilSeatId,
                  goodId: goodSeatId,
                  evilSeatId,
                  goodSeatId,
                },
                seats: syncedSeats,
              },
            });
          }
        }
      }

      // 🧠 洗脑师桥接：新引擎快照/meta cerenovusResult → state cerenovusTarget
      const cerenovusRes =
        (resultContext as any)?.meta?.cerenovusResult ||
        (resultContext as any)?.snapshot?._abilityResults?.cerenovus ||
        (resultContext as any)?.snapshot?.cerenovusTarget;
      if (
        cerenovusRes &&
        cerenovusRes.targetId != null &&
        cerenovusRes.roleName
      ) {
        if (context.dispatch) {
          context.dispatch({
            type: "UPDATE_STATE",
            updates: {
              cerenovusTarget: {
                targetId: cerenovusRes.targetId,
                roleName: cerenovusRes.roleName,
                checkedToday: false,
              },
            },
          });
        }
      }
    }

    // 记录日志（统一补充行动者座位号前缀，确保魔典与各模块能精准溯源关联）
    const rawAbilityLog =
      resultContext.meta.abilityLog || resultContext.meta.prompt;
    if (rawAbilityLog) {
      const actorSeatNo =
        actorId !== undefined && actorId >= 0 ? actorId + 1 : undefined;
      let formattedLog = rawAbilityLog;
      if (
        actorSeatNo !== undefined &&
        !rawAbilityLog.includes(`${actorSeatNo}号`)
      ) {
        formattedLog = `【${actorSeatNo}号-${roleName}】${rawAbilityLog.replace(new RegExp(`^${roleName}`), "")}`;
      }
      context.addLog(`[能力] ${formattedLog}`);
    }

    // 清空选中的目标
    context.setSelectedActionTargets([]);

    // 处理弹窗
    const modal = resultContext.meta.modal as ModalType | undefined;
    const displayInfo = resultContext.meta.displayInfo as any;

    // ─── 🎭 受干扰 / 伪装身份（酒鬼·提线木偶）玩家视角假值校验层 ──────────────
    // 用户实测两个 bug：
    //   ① 酒鬼厨师：控制台显示「行动（受干扰）」，结果页却是真值「场上有 2 对…」；
    //   ② 提线木偶伪装赏金猎人：拿到了正确的技能结果页（真值全泄露）。
    // 根因相同：控制台的受干扰标记来自 React Seat 的 isDrunk/isPoisoned，
    // 而结果文案来自能力管道产出的 displayInfo.log；新引擎链路**只打标记、
    // 不做假值替换**（假值替换只存在于 legacy 的 utils/nightLogic.ts）。
    // 于是只要管道算出真值，结果页就会把它直接交给玩家。
    // 这里在"结果文案的唯一出口"强制替换成假值（说书人设定值 > 确定性假值），
    // 绝不保留"没有假值就直接显示真值"这条路径。
    /** 该角色的结果是否属于"信息"（需要假值）——包含赏金猎人/博学者等表外角色。 */
    const producesPlayerInfo =
      classifyCorruptedInfoRole(roleId) !== null ||
      isInformationRole(roleId, actorSeat?.role?.type ?? "unknown");
    const isCorruptedForPlayer =
      producesPlayerInfo &&
      isPlayerInfoCorrupted({
        roleId,
        metaIsCorrupted: resultContext.meta.isCorrupted === true,
        metaAbilityEffective:
          resultContext.meta.abilityEffective === undefined
            ? undefined
            : resultContext.meta.abilityEffective !== false,
        nightInfoIsPoisoned: Boolean(context.nightInfo?.isPoisoned),
        actorSeat: actorSeat as any,
        isVortoxWorld: isVortox,
        roleIsInformation: true,
      });
    /**
     * 生成本次行动的"真值 vs 玩家可见假值"对照。
     * @returns null 表示"无需/不能脱敏"（非信息类 or 未受干扰）
     */
    const maskCorruptedResult = (truthText: string, trueValue?: unknown) => {
      if (!isCorruptedForPlayer || !producesPlayerInfo || !truthText) return null;
      const masked = buildCorruptedInfoMask({
        roleId,
        roleName,
        truthText,
        trueValue,
        actorSeatId: actorId,
        nightCount: context.nightCount,
        candidateSeatIds: context.seats
          .filter((s) => s.id !== actorId)
          .map((s) => s.id),
        targetCount: Array.isArray(trueValue) ? trueValue.length : 1,
      });
      const playerText = sanitizePlayerFacingText(
        ensureNotTruth(
          masked.playerText,
          truthText,
          roleId,
          actorId,
          context.nightCount
        )
      );
      return { ...masked, playerText };
    };

    if (modal) {
      // 🎭 受干扰时，走专属 modal 的信息类角色（占卜师/筑梦师/博学者/艺术家…）
      //    同样必须换成假值：这里对 modal.data 里的结果文本字段做统一处理。
      const maskedModal = (() => {
        const data: any = (modal as any).data;
        if (!data || !isCorruptedForPlayer || !producesPlayerInfo) return modal;
        const fieldKeys = ["result", "resultText", "text", "answer", "message"];
        const next = { ...data };
        let changed = false;
        for (const key of fieldKeys) {
          const v = next[key];
          if (typeof v !== "string" || v.length === 0) continue;
          const mask = maskCorruptedResult(v, data.targetId ?? data.answer);
          if (!mask) continue;
          next[key] = mask.playerText;
          next.realResultText = mask.truthText;
          next.isCorruptedResult = true;
          changed = true;
        }
        return changed ? ({ ...modal, data: next } as ModalType) : modal;
      })();
      context.setCurrentModal(maskedModal);
    } else if (
      displayInfo &&
      typeof displayInfo.type === "string" &&
      displayInfo.log
    ) {
      // 🔧 所有角色统一弹结果窗（信息类 + 行动类）
      //   此前仅 displayInfo.type 以 "_info" 结尾的角色才弹窗，
      //   导致僧侣/投毒者/小恶魔等行动类角色无结果展示。
      //   现在改为：只要有 displayInfo.log 就弹出 INFO_RESULT。
      // 🎯 赏金猎人：直接向玩家展示“X号玩家是邪恶的”
      let customResultText: string | null = null;
      if (roleId === "bounty_hunter") {
        const targetId =
          displayInfo?.targetId ??
          resultContext.meta.bountyHunterResult?.targetId ??
          (resultContext as any)?.actionNode?.storytellerInput?.targetSeatId ??
          (resultContext as any)?.actionNode?.storytellerInput?.targetId ??
          context.selectedTargets?.[0];
        if (targetId != null) {
          customResultText = `${targetId + 1}号玩家是邪恶的`;
        }
      }

      // 🧠 洗脑师：立即唤醒被洗脑的人，弹窗告诉他洗脑师的结果，格式为“你需要疯狂证明自己是【xx角色】”
      if (roleId === "cerenovus") {
        const cerenovusRes =
          (resultContext as any)?.meta?.cerenovusResult ||
          (resultContext as any)?.snapshot?._abilityResults?.cerenovus ||
          (resultContext as any)?.snapshot?.cerenovusTarget;
        const targetId =
          cerenovusRes?.targetId ??
          displayInfo?.targetId ??
          context.selectedTargets?.[0];
        const madRoleName =
          cerenovusRes?.roleName ??
          (context.actionData as any)?.roleName ??
          displayInfo?.roleName;
        if (targetId != null && madRoleName) {
          customResultText = `唤醒${targetId + 1}号玩家\n你需要疯狂证明自己是【${madRoleName}】`;
          if (context.insertIntoWakeQueueAfterCurrent) {
            context.insertIntoWakeQueueAfterCurrent(targetId, {
              logLabel: `${targetId + 1}号(洗脑唤醒)`,
            });
          }
        }
      }

      // 👥 镜像双子：直接向玩家展示“对立双子是X号XX角色”
      if (roleId === "evil_twin") {
        const goodTwinId =
          displayInfo?.twinId ??
          evilTwinPair?.goodSeatId ??
          evilTwinPair?.goodId ??
          resultContext.meta.evilTwinResult?.twinId ??
          syncedSeats.find((s) => s.isGoodTwin)?.id;
        const goodTwinSeat = syncedSeats.find((s) => s.id === goodTwinId);
        if (goodTwinSeat) {
          customResultText = `对立双子是${goodTwinSeat.id + 1}号【${goodTwinSeat.role?.name || "未知"}】角色`;
        }
      }

      // 🤹 杂耍艺人：统一展示“得知的数字为X”
      if (roleId === "juggler") {
        const actorSeat =
          syncedSeats.find((s) => s.id === actorId) ||
          context.seats.find((s) => s.id === actorId);
        let count =
          displayInfo?.correctCount ??
          resultContext.meta.jugglerResult?.correctCount ??
          (resultContext as any)?.snapshot?._abilityResults?.juggler
            ?.correctCount ??
          (actorSeat as any)?.dayAbilityResult?.correctCount ??
          0;

        // 若受到涡流或中毒/醉酒影响，且未被替换为假数字
        const isCorrupted =
          resultContext.meta.isCorrupted ||
          resultContext.meta.abilityEffective === false ||
          context.vortoxWorld ||
          syncedSeats.some((s) => s.role?.id === "vortox" && !s.isDead) ||
          actorSeat?.isDrunk ||
          actorSeat?.role?.id === "drunk";

        const realCount = (actorSeat as any)?.dayAbilityResult?.correctCount;
        if (isCorrupted && realCount !== undefined && count === realCount) {
          const fakeCandidates = [0, 1, 2, 3, 4, 5].filter(
            (v) => v !== realCount
          );
          count =
            fakeCandidates.length > 0
              ? fakeCandidates[
                  Math.floor(Math.random() * fakeCandidates.length)
                ]
              : realCount === 0
                ? 1
                : 0;
        }

        customResultText = `得知的数字为${count}`;
      }

      // 👥 对立双子在夜间获知“X号是镜像双子”
      const { evilTwinSeat, isGoodTwin } = resolveEvilTwinPair(
        syncedSeats.length > 0 ? syncedSeats : context.seats,
        evilTwinPair || (context as any)?.evilTwinPair
      );
      const isGoodTwinActor =
        (context.gamePhase === "firstNight" || context.nightCount === 1) &&
        evilTwinSeat &&
        isGoodTwin(actorId);
      if (isGoodTwinActor && evilTwinSeat) {
        const twinNotice = `【双子告知】${evilTwinSeat.id + 1}号是镜像双子`;
        if (customResultText) {
          if (!customResultText.includes(twinNotice)) {
            customResultText = `${twinNotice}\n${customResultText}`;
          }
        } else if (displayInfo?.log) {
          if (!displayInfo.log.includes(twinNotice)) {
            displayInfo.log = `${twinNotice}\n${displayInfo.log}`;
          }
        } else {
          customResultText = twinNotice;
        }
      }

      const guideText = context.nightInfo?.guide || "";
      const guideMatch = guideText.match(/告诉他(.+?)[。.]?$/);
      const guideInfo =
        guideMatch?.[1] && !guideText.includes("准备执行技能")
          ? guideMatch[1]
              .trim()
              .replace(/^[:：]\s*/, "")
              .replace(/[）)]+$/, "")
          : "";
      /**
       * 🎭 B1（玩家视角脱敏）：INFO_RESULT 会内联到玩家页，因此：
       *   1. 优先使用引擎显式给出的 displayInfo.playerFacingLog
       *      （如疯子：只显示"你以【假恶魔】身份选择了 X"）；
       *   2. 其余文案一律过一遍 sanitizePlayerFacingText，剥掉
       *      【受干扰】/（虚假信息）/（中毒、醉酒状态，此为假信息）这类说书人标记；
       *   3. 角色名前缀改用 playerFacingRole（疯子 → 其假恶魔名）。
       * 说书人控制台与日志仍使用真实 roleName（见上方 addLog 分支），真相不丢。
       */
      const playerFacingRoleObj =
        context.nightInfo?.playerFacingRole ?? getPlayerFacingRole(actorSeat);
      const playerFacingRoleLabel = playerFacingRoleObj?.name
        ? seatPrefix +
          String(playerFacingRoleObj.name).replace(/^\d+号[-_]/, "")
        : roleName;
      const rawResultText =
        (displayInfo as any).playerFacingLog ||
        customResultText ||
        displayInfo.log ||
        (guideInfo
          ? `${playerFacingRoleLabel}获得信息：${guideInfo}`
          : "技能已执行");

      // 🎭 受干扰 / 酒鬼·提线木偶：玩家可见结果必须替换为假值。
      const trueValue =
        typeof resultContext.meta.abilityResult === "number" ||
        typeof resultContext.meta.abilityResult === "boolean"
          ? resultContext.meta.abilityResult
          : Array.isArray((displayInfo as any)?.targetIds) &&
              (displayInfo as any).targetIds.length > 0
            ? (displayInfo as any).targetIds
            : (displayInfo as any)?.targetId != null
              ? [(displayInfo as any).targetId]
              : (context.selectedTargets ?? []);
      const corruptedMask = maskCorruptedResult(rawResultText, trueValue);
      const resultText = corruptedMask
        ? corruptedMask.playerText
        : sanitizePlayerFacingText(rawResultText);
      const infoSynced = syncedSeats.length > 0 ? syncedSeats : undefined;
      context.setCurrentModal({
        type: "INFO_RESULT",
        data: {
          roleName: playerFacingRoleLabel,
          resultText,
          // 说书人侧真值对照：只在解锁视图/控制台渲染（玩家页不读）
          realResultText: corruptedMask ? corruptedMask.truthText : undefined,
          isCorruptedResult: Boolean(corruptedMask),
          onNext: () => {
            context.setCurrentModal(null);
            context.continueToNextAction(infoSynced);
          },
        },
      });
    } else {
      // 🔧 修复：使用 syncedSeats 而非 updatedSeats，确保中毒/醉酒等状态已同步到旧系统字段
      context.setCurrentModal(null);
      context.continueToNextAction(
        syncedSeats.length > 0 ? syncedSeats : undefined
      );
    }

    // 标记能力已使用
    if (actorId !== undefined && actorId >= 0) {
      context.markAbilityUsed(roleId, actorId);
      const actorSeat = syncedSeats.find((s) => s.id === actorId);
      if (actorSeat && actorSeat.role?.id === "pixie" && roleId !== "pixie") {
        (actorSeat as any).pixieAbilityUsed = true;
      }
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

      // 男爵：纯被动设置角色，不唤醒且不弹窗，直接推进
      if (roleId === "baron") {
        console.log("[handleNightAction] 男爵为被动设置角色，跳过夜间行动");
        context.continueToNextAction();
        return true;
      }

      // 首夜小恶魔：首夜恶魔不杀人，转为恶魔互认（demon_info）步骤
      if (context.gamePhase === "firstNight" && roleId === "imp") {
        const actorId = nightInfo.seat?.id ?? -1;
        const seatPrefix = actorId >= 0 ? `${actorId + 1}号-` : "";
        const demonInfo = calculateNightInfoViaNewEngine(
          (context as any).selectedScript ?? null,
          context.seats,
          actorId,
          "firstNight",
          null,
          1,
          "demon_info"
        );
        const displayName = `${seatPrefix}恶魔互认`;
        const guideInfo =
          demonInfo?.guide ||
          demonInfo?.guideText ||
          `${displayName}信息已生成`;

        if (context.preview) {
          context.setCurrentModal({
            type: "NIGHT_ACTION_CONFIRM",
            data: {
              roleName: displayName,
              actionDescription: "恶魔爪牙互认与伪装角色告知",
              targetDescriptions: ["（首夜信息 - 无目标）"],
              onConfirm: () => {
                context.setCurrentModal({
                  type: "INFO_RESULT",
                  data: {
                    roleName: displayName,
                    resultText: guideInfo,
                    onNext: () => {
                      context.setCurrentModal(null);
                      context.continueToNextAction();
                    },
                  },
                });
              },
              onCancel: () => {
                context.setCurrentModal(null);
              },
            },
          });
          return true;
        }

        context.setCurrentModal({
          type: "INFO_RESULT",
          data: {
            roleName: displayName,
            resultText: guideInfo,
            onNext: () => {
              context.setCurrentModal(null);
              context.continueToNextAction();
            },
          },
        });
        return true;
      }

      // ====== 系统信息步骤（爪牙互认 / 恶魔互认 / 军团互认 / 双子告知）：驱动确认与结果展示 ======
      const isGoodTwinStep = roleId === "good_twin_info";
      const isSystemStep =
        roleId === "minion_info" ||
        roleId === "demon_info" ||
        roleId === LEGION_MUTUAL_RECOGNITION_ID ||
        roleId === EVIL_CONVERTED_NOTICE_ID ||
        isGoodTwinStep;

      if (isSystemStep) {
        const actorId = nightInfo.seat?.id ?? -1;
        const seatPrefix = actorId >= 0 ? `${actorId + 1}号-` : "";
        if (isGoodTwinStep) {
          const { evilTwinSeat } = resolveEvilTwinPair(
            context.seats,
            (context as any).evilTwinPair
          );
          const evilSeatNo = evilTwinSeat
            ? `${evilTwinSeat.id + 1}号`
            : "对立玩家";
          const displayName = `${seatPrefix}${nightInfo.effectiveRole?.name || "善良双子"}(双子告知)`;
          const actionDesc = `告知对立双子：${evilSeatNo}是镜像双子`;
          const guideInfo = `唤醒${actorId + 1}号【${nightInfo.effectiveRole?.name || "对立双子"}】，告知他：${evilSeatNo}是镜像双子。`;

          if (context.preview) {
            context.setCurrentModal({
              type: "NIGHT_ACTION_CONFIRM",
              data: {
                roleName: displayName,
                actionDescription: actionDesc,
                targetDescriptions: [`【双子告知】${evilSeatNo}是镜像双子`],
                onConfirm: () => {
                  context.setCurrentModal({
                    type: "INFO_RESULT",
                    data: {
                      roleName: displayName,
                      resultText: `【双子告知】${evilSeatNo}是镜像双子`,
                      onNext: () => {
                        context.setCurrentModal(null);
                        context.continueToNextAction();
                      },
                    },
                  });
                },
                onCancel: () => {
                  context.setCurrentModal(null);
                },
              },
            });
            return true;
          }

          context.setCurrentModal({
            type: "INFO_RESULT",
            data: {
              roleName: displayName,
              resultText: `【双子告知】${evilSeatNo}是镜像双子`,
              onNext: () => {
                context.setCurrentModal(null);
                context.continueToNextAction();
              },
            },
          });
          return true;
        }

        // 🏹 赏金猎人「阵营告知」：官方——被转变的玩家从一开始就属于邪恶阵营，
        //    「应该在首个夜晚立即告知他是邪恶的」。行动者 = 被转变的那名镇民。
        if (roleId === EVIL_CONVERTED_NOTICE_ID) {
          const actorId = nightInfo.seat?.id ?? -1;
          const seatPrefix = actorId >= 0 ? `${actorId + 1}号-` : "";
          const displayName = `${seatPrefix}阵营告知`;
          const actionDesc = "告知该玩家：你已经属于邪恶阵营";
          const guideInfo =
            nightInfo.guide ||
            nightInfo.guideText ||
            `${displayName}：告知其已属于邪恶阵营`;

          if (context.preview) {
            context.setCurrentModal({
              type: "NIGHT_ACTION_CONFIRM",
              data: {
                roleName: displayName,
                actionDescription: actionDesc,
                targetDescriptions: ["（首夜信息 - 无目标）"],
                onConfirm: () => {
                  context.setCurrentModal({
                    type: "INFO_RESULT",
                    data: {
                      roleName: displayName,
                      resultText: guideInfo,
                      onNext: () => {
                        context.setCurrentModal(null);
                        context.continueToNextAction();
                      },
                    },
                  });
                },
                onCancel: () => {
                  context.setCurrentModal(null);
                },
              },
            });
            return true;
          }

          context.setCurrentModal({
            type: "INFO_RESULT",
            data: {
              roleName: displayName,
              resultText: guideInfo,
              onNext: () => {
                context.setCurrentModal(null);
                context.continueToNextAction();
              },
            },
          });
          return true;
        }

        const isLegion =
          roleId === LEGION_MUTUAL_RECOGNITION_ID ||
          (roleId === "demon_info" && nightInfo.seat?.role?.id === "legion");
        const baseName =
          roleId === "minion_info"
            ? "爪牙互认"
            : isLegion
              ? "军团互认"
              : "恶魔互认";
        const displayName = isLegion ? "军团互认" : `${seatPrefix}${baseName}`;
        const actionDesc =
          roleId === "minion_info"
            ? "恶魔爪牙互认与信息告知"
            : isLegion
              ? "军团首夜全员统一互认与伪装角色告知"
              : "恶魔爪牙互认与伪装角色告知";
        const guideInfo =
          nightInfo.guide || nightInfo.guideText || `${displayName}信息已生成`;

        if (context.preview) {
          context.setCurrentModal({
            type: "NIGHT_ACTION_CONFIRM",
            data: {
              roleName: displayName,
              actionDescription: actionDesc,
              targetDescriptions: ["（首夜信息 - 无目标）"],
              onConfirm: () => {
                context.setCurrentModal({
                  type: "INFO_RESULT",
                  data: {
                    roleName: displayName,
                    resultText: guideInfo,
                    onNext: () => {
                      context.setCurrentModal(null);
                      context.continueToNextAction();
                    },
                  },
                });
              },
              onCancel: () => {
                context.setCurrentModal(null);
              },
            },
          });
          return true;
        }

        context.setCurrentModal({
          type: "INFO_RESULT",
          data: {
            roleName: displayName,
            resultText: guideInfo,
            onNext: () => {
              context.setCurrentModal(null);
              context.continueToNextAction();
            },
          },
        });
        return true;
      }

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
        isActorDisabledByPoisonOrDrunk: (seat: Seat) => {
          const hasVortox =
            Boolean(context.vortoxWorld) ||
            seats.some((s) => s.role?.id === "vortox" && !s.isDead);
          const isTownsfolk =
            seat.role?.type === "townsfolk" ||
            (seat.role?.id === "drunk" &&
              seat.charadeRole?.type === "townsfolk") ||
            (seat.role?.id === "marionette" &&
              seat.charadeRole?.type === "townsfolk");
          if (isTownsfolk && hasVortox) return true;
          return (
            computeIsPoisoned(seat, seats) ||
            seat.isDrunk ||
            seat.role?.id === "drunk" ||
            seat.role?.id === "marionette"
          );
        },
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

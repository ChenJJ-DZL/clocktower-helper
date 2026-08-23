/**
 * 新夜晚引擎 React 适配器 Hook
 *
 * 集成状态（更正原"已完全替代旧版 useNightLogic"的过期表述）：
 * - 已���入主流程（useGameController 实例化本 Hook），负责夜晚队列编排与
 *   能力管道执行。
 * - 与仍在大量引用的 legacy 系统 src/utils/nightLogic.ts 并存，迁移进行中，
 *   尚未"完全替代"旧系统。
 * - processDemonKill 为兼容旧接口的空桩，实际恶魔击杀由 imp 能力管道在
 *   executeNightAbility 中完成。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  GamePhase,
  LogEntry,
  Script,
  Seat,
  WinResult,
} from "../../app/data";
import { getRawAbilityMap } from "../roles/new_engine/abilityRegistry";
import { AbilityTriggerTiming } from "../roles/core/roleAbility.types";
import { unifiedRoleDefinition } from "../roles/unifiedRoleDefinition";
import type { NightInfoResult } from "../types/game";
import type { ModalType } from "../types/modal";
import type { NightOrderEntry } from "../utils/dynamicQueueGenerator";
import { createSnapshotFromGameState } from "../utils/historySnapshot";
import { NightEngine, type NightEngineState } from "../utils/nightEngineFacade";
import { nightOrderParser } from "../utils/nightOrderParser";
import type {
  NightActionNode,
  GameStateSnapshot as NightStateMachineSnapshot,
} from "../utils/nightStateMachine";
import { unifiedEventBus } from "../utils/unifiedEventBus";

// ============================================================
// 类型定义（原 useNightLogic 中的类型已内联至此，旧引擎已废弃）
// ============================================================

/** 新引擎 Hook 的输入接口 */
export interface NightLogicGameState {
  seats: Seat[];
  gamePhase: GamePhase;
  nightCount: number;
  hasCompletedFirstNight?: boolean;
  executedPlayerId: number | null;
  wakeQueueIds: number[];
  currentWakeIndex: number;
  selectedActionTargets: number[];
  gameLogs: LogEntry[];
  selectedScript: Script | null;
  deadThisNight: number[];
  currentDuskExecution: number | null;
  pukkaPoisonQueue: Array<{ targetId: number; nightsUntilDeath: number }>;
  todayDemonVoted: boolean;
  todayMinionNominated: boolean;
  todayExecutedId: number | null;
  witchCursedId: number | null;
  witchActive: boolean;
  cerenovusTarget: { targetId: number; roleName: string } | null;
  voteRecords: Array<{ voterId: number; isDemon: boolean }>;
  nominationMap: Record<number, number>;
  poChargeState: Record<number, boolean>;
  goonDrunkedThisNight: boolean;
  isVortoxWorld: boolean;
  outsiderDiedToday: boolean;
  nightInfo: NightInfoResult | null;
  nightQueuePreviewTitle: string;
}

/** 新引擎 Hook 的 Actions 接口 */
export interface NightLogicActions {
  setSeats: React.Dispatch<React.SetStateAction<Seat[]>>;
  setGamePhase: React.Dispatch<React.SetStateAction<GamePhase>>;
  setNightCount: React.Dispatch<React.SetStateAction<number>>;
  setWakeQueueIds: React.Dispatch<React.SetStateAction<number[]>>;
  setCurrentWakeIndex: React.Dispatch<React.SetStateAction<number>>;
  setSelectedActionTargets: React.Dispatch<React.SetStateAction<number[]>>;
  setInspectionResult: React.Dispatch<React.SetStateAction<string | null>>;
  setDeadThisNight: React.Dispatch<React.SetStateAction<number[]>>;
  setLastDuskExecution: React.Dispatch<React.SetStateAction<number | null>>;
  setCurrentDuskExecution: React.Dispatch<React.SetStateAction<number | null>>;
  setPukkaPoisonQueue: React.Dispatch<
    React.SetStateAction<Array<{ targetId: number; nightsUntilDeath: number }>>
  >;
  setTodayDemonVoted: React.Dispatch<React.SetStateAction<boolean>>;
  setTodayMinionNominated: React.Dispatch<React.SetStateAction<boolean>>;
  setTodayExecutedId: React.Dispatch<React.SetStateAction<number | null>>;
  setWitchCursedId: React.Dispatch<React.SetStateAction<number | null>>;
  setWitchActive: React.Dispatch<React.SetStateAction<boolean>>;
  setCerenovusTarget: React.Dispatch<
    React.SetStateAction<{ targetId: number; roleName: string } | null>
  >;
  setVoteRecords: React.Dispatch<
    React.SetStateAction<Array<{ voterId: number; isDemon: boolean }>>
  >;
  setVotedThisRound?: React.Dispatch<React.SetStateAction<number[]>>;
  hasExecutedThisDay?: boolean;
  setHasExecutedThisDay?: React.Dispatch<React.SetStateAction<boolean>>;
  setWinResult?: React.Dispatch<React.SetStateAction<WinResult>>;
  setWinReason?: React.Dispatch<React.SetStateAction<string | null>>;
  setNominationMap: React.Dispatch<
    React.SetStateAction<Record<number, number>>
  >;
  setGoonDrunkedThisNight: React.Dispatch<React.SetStateAction<boolean>>;
  setIsVortoxWorld: React.Dispatch<React.SetStateAction<boolean>>;
  setCurrentModal: React.Dispatch<React.SetStateAction<ModalType>>;
  setPendingNightQueue: React.Dispatch<React.SetStateAction<Seat[] | null>>;
  setNightOrderPreview: React.Dispatch<
    React.SetStateAction<
      Array<{ roleName: string; seatNo: number; order: number }>
    >
  >;
  setNightQueuePreviewTitle: React.Dispatch<React.SetStateAction<string>>;
  setStartTime: React.Dispatch<React.SetStateAction<Date | null>>;
  setMayorRedirectTarget: React.Dispatch<React.SetStateAction<number | null>>;
  addLog: (message: string) => void;
  addLogWithDeduplication: (
    msg: string,
    playerId?: number,
    roleName?: string
  ) => void;
  killPlayer: (
    targetId: number,
    options?: {
      source?: "demon" | "execution" | "ability";
      recordNightDeath?: boolean;
      keepInWakeQueue?: boolean;
      seatTransformer?: (seat: Seat) => Seat;
      skipGameOverCheck?: boolean;
      executedPlayerId?: number | null;
      onAfterKill?: (latestSeats: Seat[]) => void;
      skipMayorRedirectCheck?: boolean;
      mayorId?: number;
      skipLunaticRps?: boolean;
      forceExecution?: boolean;
    }
  ) => void;
  saveHistory: () => void;
  resetRegistrationCache: (key: string) => void;
  getSeatRoleId: (seat?: Seat | null) => string | null;
  getDemonDisplayName: (roleId?: string, fallbackName?: string) => string;
  enqueueRavenkeeperIfNeeded: (targetId: number) => void;
  continueToNextAction: () => void;
  currentWakeIndexRef: React.MutableRefObject<number>;
}

/**
 * 从 unifiedRoleDefinition 的能力注册表生成 NightOrderEntry
 * 优先度直接取自 ability 文件（已对齐 JSON 官方规则）
 */
function generateNightOrderFromParser(): NightOrderEntry[] {
  const allAbilities = unifiedRoleDefinition.getAllAbilities();
  const firstNightOrder = nightOrderParser.getFirstNightOrder();
  const otherNightOrder = nightOrderParser.getOtherNightOrder();

  const entries: NightOrderEntry[] = [];

  for (const ability of allAbilities) {
    const fn = ability.firstNightPriority;
    const on = ability.otherNightPriority;
    const hasFn = fn !== null && fn > 0;
    const hasOn = on !== null && on > 0;

    if (!hasFn && !hasOn) continue; // 无夜晚行动

    const firstNightItem = firstNightOrder.find(
      (item) => item.roleId === ability.roleId
    );
    const otherNightItem = otherNightOrder.find(
      (item) => item.roleId === ability.roleId
    );

    entries.push({
      roleId: ability.roleId,
      roleName:
        firstNightItem?.roleName || otherNightItem?.roleName || ability.roleId,
      abilityId: ability.abilityId,
      firstNightPriority: hasFn ? fn! : 0,
      otherNightPriority: hasOn ? on! : 0,
      firstNightOnly: hasFn && !hasOn,
      otherNightOnly: (ability as any).otherNightOnly ?? (hasOn && !hasFn),
      wakeMessage: ability.wakePromptId || `${ability.roleId}请行动`,
      // 间谍死后仍可唤醒查看魔典（规则明确允许）
      deadActorWakes: ability.roleId === "spy",
      // 🔧 送葬者：仅当日有玩家死于处决时才入队（平票/镇长免疫等无人死亡场景不应唤醒）
      requiresExecutedToday: ability.roleId === "undertaker",
      // 🔧 死亡触发型角色（守鸦人 ON_DEATH）：仅当晚死亡时入队
      deathTriggered:
        ability.triggerTiming?.includes(AbilityTriggerTiming.ON_DEATH) ?? false,
    });
  }

  // 首夜系统信息步骤（爪牙信息与恶魔信息）
  entries.push({
    roleId: "minion_info",
    roleName: "爪牙信息",
    abilityId: "minion_info",
    firstNightPriority: 1.5,
    otherNightPriority: 0,
    firstNightOnly: true,
    otherNightOnly: false,
    wakeMessage: "minion_info",
  });
  entries.push({
    roleId: "demon_info",
    roleName: "恶魔信息",
    abilityId: "demon_info",
    firstNightPriority: 2.5,
    otherNightPriority: 0,
    firstNightOnly: true,
    otherNightOnly: false,
    wakeMessage: "demon_info",
  });

  entries.sort((a, b) => {
    const pa =
      a.firstNightPriority > 0 ? a.firstNightPriority : a.otherNightPriority;
    const pb =
      b.firstNightPriority > 0 ? b.firstNightPriority : b.otherNightPriority;
    return pa - pb;
  });
  return entries;
}

/**
 * 构建能力映射表 - 从 abilityRegistry 获取原始 IRoleAbility（保留中间件管道）
 * NightEngine.submitAction 需要 preCheck/calculate/stateUpdate/postProcess 中间件
 */
function buildAbilityMap() {
  const rawMap = getRawAbilityMap();
  const keys = Object.keys(rawMap);
  console.log(`[NightEngine] 构建能力映射表，共 ${keys.length} 个能力`);
  return rawMap;
}

// 从正式配置源动态获取
export const ENGINE_CONFIG = {
  fullNightOrder: generateNightOrderFromParser(),
  abilityMap: buildAbilityMap(),
};

// 转换为 NightStateMachine 的快照格式
function convertToNightStateMachineSnapshot(
  snapshot: ReturnType<typeof createSnapshotFromGameState>
): NightStateMachineSnapshot {
  return {
    nightCount: snapshot.nightCount,
    hasCompletedFirstNight: (snapshot as any).hasCompletedFirstNight ?? false,
    seats: snapshot.seats,
    statusEffects: {},
    gamePhase: snapshot.phase,
    // 🔧 守鸦人修复：把 deadThisNight 传给 NightEngine，
    //   供 generateDynamicNightQueue 判断死亡触发型角色（守鸦人等）是否入队
    deadThisNight: [...(snapshot.deadThisNight ?? [])],
    // 🔧 送葬者修复：把 todayExecutedId 传给 NightEngine，
    //   供 generateDynamicNightQueue 判断"今日有玩家死于处决"是否成立
    todayExecutedId: snapshot.todayExecutedId ?? null,
  };
}

export function useNightEngine(gameState: NightLogicGameState) {
  // 从 gameState 创建初始快照
  const initialSnapshot = useMemo(() => {
    const snap = createSnapshotFromGameState(gameState);
    return convertToNightStateMachineSnapshot(snap);
  }, [gameState]);

  // 初始化夜晚引擎实例（仅创建一次，后续通过updateSnapshot更新状态）
  const engine = useMemo(() => {
    return new NightEngine(initialSnapshot, ENGINE_CONFIG);
  }, [initialSnapshot]);

  // 当外部快照更新时，同步到引擎内部
  useEffect(() => {
    const snap = createSnapshotFromGameState(gameState);
    engine.updateSnapshot(convertToNightStateMachineSnapshot(snap));
  }, [engine, gameState]);

  // 🔧 持有最新 gameState 的 ref：startNight 可能在处决/继承等状态变更后
  //    立即被调用（同一事件循环），此时闭包中的 gameState 还是旧值，
  //    导致引擎快照未同步红唇继承等最新状态（Bug：新恶魔不在夜间队列）。
  const gameStateRef = useRef(gameState);
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  // 同步引擎状态到 React State
  const [engineState, setEngineState] = useState<NightEngineState>(
    engine.state
  );
  const [waitingForInput, setWaitingForInput] = useState(false);
  const [currentPrompt, setCurrentPrompt] = useState<string | null>(null);
  const [currentNode, setCurrentNode] = useState<NightActionNode | null>(null);

  // 监听事件总线的状态变更
  useEffect(() => {
    const syncState = () => {
      const newState = engine.state;
      setEngineState(newState);
      // 同步所有对外暴露的状态，确保与旧版接口一致
      setCurrentNode(newState.currentNode || null);
      setCurrentPrompt(newState.currentNode?.wakeMessage || null);
    };

    const handleNightStarted = syncState;
    const handleNightWake = syncState;
    const handleActionCompleted = () => {
      setWaitingForInput(false);
      syncState();
    };
    const handleNightEnded = () => {
      setWaitingForInput(false);
      setCurrentNode(null);
      setCurrentPrompt(null);
      syncState();
    };
    const handleStateUpdated = syncState;
    const handleAbilityTriggered = () => setWaitingForInput(true);

    const id1 = unifiedEventBus.on("night:started", handleNightStarted);
    const id2 = unifiedEventBus.on("night:wake", handleNightWake);
    const id3 = unifiedEventBus.on(
      "night:action_completed",
      handleActionCompleted
    );
    const id4 = unifiedEventBus.on("night:ended", handleNightEnded);
    const id5 = unifiedEventBus.on("state:updated", handleStateUpdated);
    const id6 = unifiedEventBus.on("ability:triggered", handleAbilityTriggered);

    return () => {
      unifiedEventBus.off("night:started", id1);
      unifiedEventBus.off("night:wake", id2);
      unifiedEventBus.off("night:action_completed", id3);
      unifiedEventBus.off("night:ended", id4);
      unifiedEventBus.off("state:updated", id5);
      unifiedEventBus.off("ability:triggered", id6);
      engine.reset();
    };
  }, [engine]);

  // 暴露对外接口，与旧版 useNightLogic 保持兼容
  const handleNext = useCallback(() => {
    setWaitingForInput(false);
    engine.nextAction();
  }, [engine]);

  const handleSkip = useCallback(() => {
    setWaitingForInput(false);
    engine.skipCurrent();
  }, [engine]);

  const handleTargetSelect = useCallback(
    async (targetIds: number[], storytellerInput?: any) => {
      setWaitingForInput(false);
      const snapshot = await engine.submitAction(targetIds, storytellerInput);
      return snapshot;
    },
    [engine]
  );

  const startNight = useCallback(
    (isFirst: boolean) => {
      // 🔧 使用 ref 中的最新 gameState 重建快照并同步引擎，避免闭包旧值
      //    导致红唇继承/处决死亡等最新状态未进入引擎快照。
      const latest = gameStateRef.current;
      const snap = createSnapshotFromGameState(latest);
      engine.updateSnapshot(convertToNightStateMachineSnapshot(snap));
      const nightCount = isFirst ? 1 : latest.nightCount + 1;
      engine.startNight(nightCount);
    },
    [engine]
  );

  const finalizeNightStart = useCallback(
    (_queue: any[], isFirst: boolean) => {
      // 新引擎内部已经处理了队列，这里只需触发开始
      const latest = gameStateRef.current;
      const snap = createSnapshotFromGameState(latest);
      engine.updateSnapshot(convertToNightStateMachineSnapshot(snap));
      const nightCount = isFirst ? 1 : latest.nightCount + 1;
      engine.startNight(nightCount);
    },
    [engine]
  );

  const endNight = useCallback(() => {
    engine.endNight();
  }, [engine]);

  // 兼容旧接口的空桩：恶魔击杀的实际效果由 imp 能力的中间件管道
  // （calculate/stateUpdate）在 useNightActionHandler.executeNightAbility 中完成，
  // 此处仅返回 "resolved" 以维持 nightLogic.processDemonKill(...) 的调用契约。
  const processDemonKill = useCallback(
    (
      _targetId: number,
      _options: {
        skipMayorRedirectCheck?: boolean;
        mayorId?: number | null;
      } = {}
    ): "pending" | "resolved" => {
      return "resolved";
    },
    []
  );

  // 🔧 守鸦人修复：新引擎版动态入队（恶魔杀守鸦人后插入觉醒节点）。
  //   夜间开始生成队列时守鸦人存活（deathTriggered 被过滤），小恶魔杀他后
  //   useNightActionHandler 在 newlyDead 检测处调用本函数，把守鸦人觉醒节点
  //   插入当前节点之后 → 守鸦人被恶魔杀当晚觉醒并获得信息。
  const enqueueRavenkeeperIfNeeded = useCallback(
    (targetId: number) => {
      const entry = ENGINE_CONFIG.fullNightOrder.find(
        (e) => e.roleId === "ravenkeeper"
      );
      if (!entry) return;
      engine.enqueueWakeNode({
        seatId: targetId,
        roleId: "ravenkeeper",
        roleName: entry.roleName || "守鸦人",
        priority: entry.otherNightPriority || 80,
        isFirstNightOnly: false,
        abilityId: entry.abilityId,
        wakeMessage: entry.wakeMessage,
        firstNightPriority: entry.firstNightPriority || 0,
        otherNightPriority: entry.otherNightPriority || 80,
        targetIds: [],
        processed: false,
        success: false,
        meta: {},
      });
    },
    [engine]
  );

  return useMemo(
    () => ({
      // 兼容旧版接口的字段
      currentPrompt,
      currentNode,
      waitingForInput,
      queue: engineState.queue,
      currentIndex: engineState.currentIndex,
      isNightStarted: engineState.isNightStarted,
      isNightEnded: engineState.isNightEnded,

      // 兼容旧版接口的方法
      handleNext,
      handleSkip,
      handleTargetSelect,
      startNight,
      finalizeNightStart,
      endNight,
      processDemonKill,
      // 🔧 守鸦人修复：新引擎版动态入队（恶魔杀守鸦人后插入觉醒节点）
      enqueueRavenkeeperIfNeeded,

      // 新引擎扩展字段
      engineState,
      engine,
    }),
    [
      currentPrompt,
      currentNode,
      waitingForInput,
      engineState,
      handleNext,
      handleSkip,
      handleTargetSelect,
      startNight,
      finalizeNightStart,
      endNight,
      processDemonKill,
      enqueueRavenkeeperIfNeeded,
      engine,
    ]
  );
}

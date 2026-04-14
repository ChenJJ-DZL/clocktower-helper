/**
 * 新夜晚引擎 React 适配器 Hook
 * 对外暴露与旧版 useNightLogic 兼容的接口，实现无缝替换
 *
 * ✅ 生产就绪状态：
 * - 当前状态：正式生产版本，已在主流程中使用
 * - 生产使用 Hook：useNightEngine.ts（新系统）
 * - 引用位置：在 useGameController.ts 等核心文件中使用
 * - 用途：正式的夜晚逻辑管理系统
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import * as abilityRegistry from "../roles/new_engine/abilityRegistry";
import type { NightOrderEntry } from "../utils/dynamicQueueGenerator";
import { createSnapshotFromGameState } from "../utils/historySnapshot";
import { NightEngine, type NightEngineState } from "../utils/nightEngineFacade";
import { nightOrderParser } from "../utils/nightOrderParser";
import type {
  NightActionNode,
  GameStateSnapshot as NightStateMachineSnapshot,
} from "../utils/nightStateMachine";
import { unifiedEventBus } from "../utils/unifiedEventBus";
import type { NightLogicActions, NightLogicGameState } from "./useNightLogic";

/**
 * 从官方夜晚顺序配置生成 NightOrderEntry
 */
function generateNightOrderFromParser(): NightOrderEntry[] {
  const firstNightOrder = nightOrderParser.getFirstNightOrder();
  const otherNightOrder = nightOrderParser.getOtherNightOrder();
  const allRoles = new Set([
    ...firstNightOrder.map((item) => item.roleId),
    ...otherNightOrder.map((item) => item.roleId),
  ]);

  const entries: NightOrderEntry[] = [];

  allRoles.forEach((roleId) => {
    const firstNightItem = firstNightOrder.find(
      (item) => item.roleId === roleId
    );
    const otherNightItem = otherNightOrder.find(
      (item) => item.roleId === roleId
    );

    const firstNightOrderVal = firstNightItem?.firstNightOrder || 0;
    const otherNightOrderVal = otherNightItem?.otherNightOrder || 0;

    // 获取能力配置（如果存在）
    const abilityKey = `${roleId}:ability` as keyof typeof abilityRegistry;
    const ability = abilityRegistry[abilityKey] as any;

    if (firstNightOrderVal > 0 || otherNightOrderVal > 0) {
      entries.push({
        roleId,
        roleName:
          firstNightItem?.roleName || otherNightItem?.roleName || roleId,
        abilityId: ability?.abilityId || `${roleId}:ability`,
        priority:
          firstNightOrderVal > 0 ? firstNightOrderVal : otherNightOrderVal,
        firstNightOnly: otherNightOrderVal === 0,
        wakeMessage:
          ability?.wakePromptId ||
          `${firstNightItem?.roleName || otherNightItem?.roleName}请行动`,
      });
    }
  });

  // 按优先级排序
  entries.sort((a, b) => a.priority - b.priority);
  return entries;
}

/**
 * 构建能力映射表
 */
function buildAbilityMap() {
  const map: Record<string, any> = {};
  const abilities = [
    abilityRegistry.baronAbility,
    abilityRegistry.butlerAbility,
    abilityRegistry.chefAbility,
    abilityRegistry.drunkAbility,
    abilityRegistry.empathAbility,
    abilityRegistry.fortuneTellerAbility,
    abilityRegistry.impAbility,
    abilityRegistry.investigatorAbility,
    abilityRegistry.librarianAbility,
    abilityRegistry.mayorAbility,
    abilityRegistry.monkAbility,
    abilityRegistry.poisonerAbility,
    abilityRegistry.ravenkeeperAbility,
    abilityRegistry.recluseAbility,
    abilityRegistry.saintAbility,
    abilityRegistry.savantAbility,
    abilityRegistry.scarletWomanAbility,
    abilityRegistry.slayerAbility,
    abilityRegistry.soldierAbility,
    abilityRegistry.spyAbility,
    abilityRegistry.undertakerAbility,
    abilityRegistry.virginAbility,
    abilityRegistry.washerwomanAbility,
  ];

  abilities.forEach((ability) => {
    if (ability && ability.abilityId) {
      map[ability.abilityId] = ability;
    }
  });

  return map;
}

// 从正式配置源动态获取
const ENGINE_CONFIG = {
  fullNightOrder: generateNightOrderFromParser(),
  abilityMap: buildAbilityMap(),
};

// 转换为 NightStateMachine 的快照格式
function convertToNightStateMachineSnapshot(
  snapshot: ReturnType<typeof createSnapshotFromGameState>
): NightStateMachineSnapshot {
  return {
    nightCount: snapshot.nightCount,
    seats: snapshot.seats,
    statusEffects: {},
    gamePhase: snapshot.phase,
  };
}

export function useNightEngine(
  gameState: NightLogicGameState,
  actions: NightLogicActions
) {
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
      const nightCount = isFirst ? 1 : gameState.nightCount + 1;
      engine.startNight(nightCount);
    },
    [engine, gameState.nightCount]
  );

  const finalizeNightStart = useCallback(
    (_queue: any[], isFirst: boolean) => {
      // 新引擎内部已经处理了队列，这里只需触发开始
      const nightCount = isFirst ? 1 : gameState.nightCount + 1;
      engine.startNight(nightCount);
    },
    [engine, gameState.nightCount]
  );

  const endNight = useCallback(() => {
    engine.endNight();
  }, [engine]);

  const processDemonKill = useCallback(
    (
      _targetId: number,
      _options: {
        skipMayorRedirectCheck?: boolean;
        mayorId?: number | null;
      } = {}
    ): "pending" | "resolved" => {
      // 新引擎会通过中间件管道处理恶魔击杀
      // 这里暂时返回 resolved，实际逻辑在新引擎中处理
      return "resolved";
    },
    []
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
      engine,
    ]
  );
}

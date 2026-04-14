/**
 * 新夜晚引擎 React 适配器 Hook
 * 对外暴露与旧版 useNightLogic 兼容的接口，实现无缝替换
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { impAbility } from "../roles/demon/imp.ability";
import { fortuneTellerAbility } from "../roles/townsfolk/fortune_teller.ability";
import type { NightOrderEntry } from "../utils/dynamicQueueGenerator";
import { gameEventBus } from "../utils/gameEventBus";
import { NightEngine, type NightEngineState } from "../utils/nightEngineFacade";
import type {
  GameStateSnapshot,
  NightActionNode,
} from "../utils/nightStateMachine";

// 夜晚顺序配置（暗流涌动核心角色）
const mockNightOrder: NightOrderEntry[] = [
  {
    roleId: "washerwoman",
    roleName: "洗衣妇",
    abilityId: "washerwoman:ability",
    priority: 3,
    firstNightOnly: true,
    wakeMessage: "请让洗衣妇查看两名玩家，其中一名是镇民",
  },
  {
    roleId: "librarian",
    roleName: "图书管理员",
    abilityId: "librarian:ability",
    priority: 4,
    firstNightOnly: true,
    wakeMessage: "请让图书管理员查看两名玩家，其中一名是外来者",
  },
  {
    roleId: "investigator",
    roleName: "调查员",
    abilityId: "investigator:ability",
    priority: 5,
    firstNightOnly: true,
    wakeMessage: "请让调查员查看两名玩家，其中一名是爪牙",
  },
  {
    roleId: "chef",
    roleName: "厨师",
    abilityId: "chef:ability",
    priority: 6,
    firstNightOnly: true,
    wakeMessage: "请告诉厨师有多少对邪恶玩家是邻座",
  },
  {
    roleId: "empath",
    roleName: "共情者",
    abilityId: "empath:ability",
    priority: 7,
    firstNightOnly: false,
    wakeMessage: "请告诉共情者他的邻座中有多少名邪恶玩家",
  },
  {
    roleId: "fortune_teller",
    roleName: "占卜师",
    abilityId: "fortune_teller:ability",
    priority: 10,
    firstNightOnly: false,
    wakeMessage: "请让占卜师选择两名玩家，占卜其中是否有恶魔",
  },
  {
    roleId: "ravenkeeper",
    roleName: "渡鸦看守者",
    abilityId: "ravenkeeper:ability",
    priority: 13,
    firstNightOnly: false,
    wakeMessage: "请让死亡的渡鸦看守者查看一名玩家的身份",
  },
  {
    roleId: "imp",
    roleName: "小恶魔",
    abilityId: "imp:ability",
    priority: 100,
    firstNightOnly: false,
    wakeMessage: "请让小恶魔选择一名玩家进行击杀",
  },
];
// 配置后续可从配置中心动态获取
const ENGINE_CONFIG = {
  fullNightOrder: mockNightOrder,
  abilityMap: {
    [impAbility.abilityId]: impAbility,
    [fortuneTellerAbility.abilityId]: fortuneTellerAbility,
  },
};

export function useNightEngine(initialSnapshot: GameStateSnapshot) {
  // 初始化夜晚引擎实例（仅创建一次，后续通过updateSnapshot更新状态）
  const engine = useMemo(() => {
    return new NightEngine(initialSnapshot, ENGINE_CONFIG);
  }, [initialSnapshot]); // 移除initialSnapshot依赖，避免无限重建实例

  // 当外部快照更新时，同步到引擎内部
  useEffect(() => {
    engine.updateSnapshot(initialSnapshot);
  }, [engine, initialSnapshot]);

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

    gameEventBus.on("night:started", handleNightStarted);
    gameEventBus.on("night:wake", handleNightWake);
    gameEventBus.on("night:action_completed", handleActionCompleted);
    gameEventBus.on("night:ended", handleNightEnded);
    gameEventBus.on("state:updated", handleStateUpdated);
    gameEventBus.on("ability:triggered", handleAbilityTriggered);

    return () => {
      gameEventBus.off("night:started", handleNightStarted);
      gameEventBus.off("night:wake", handleNightWake);
      gameEventBus.off("night:action_completed", handleActionCompleted);
      gameEventBus.off("night:ended", handleNightEnded);
      gameEventBus.off("state:updated", handleStateUpdated);
      gameEventBus.off("ability:triggered", handleAbilityTriggered);
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
    (nightCount: number) => {
      engine.startNight(nightCount);
    },
    [engine]
  );

  const endNight = useCallback(() => {
    engine.endNight();
  }, [engine]);

  return {
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
    endNight,

    // 新引擎扩展字段
    engineState,
    engine,
  };
}

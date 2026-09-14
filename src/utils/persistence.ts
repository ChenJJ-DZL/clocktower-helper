"use client";

import type { GameState } from "../contexts/GameContext";
import type { GameRecord, GameSnapshot } from "../types/game";
import { applyCharadePermanentDrunk } from "./charadeSetup";

const STORAGE_KEY = "clocktower_game_records";
const SNAPSHOT_KEY = "clocktower_current_snapshot";

/**
 * 对局记录最多保留条数。
 * 单条记录含完整对局快照（座位/状态/日志），体积可观，上限过大仍会写爆
 * localStorage 配额（QuotaExceededError），导致保存静默失败、记录丢失。
 */
const MAX_GAME_RECORDS = 12;

/**
 * 从 localStorage 加载所有游戏记录
 */
export function loadGameRecords(): GameRecord[] {
  try {
    if (typeof window === "undefined") return [];
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const records = JSON.parse(stored) as GameRecord[];
    return records;
  } catch (error) {
    console.error(
      "Failed to load game records, clearing corrupted data:",
      error
    );
    // 数据损坏时清除 localStorage 中的记录
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    return [];
  }
}

/**
 * 保存一条游戏记录到 localStorage
 */
export function saveGameRecord(record: GameRecord): void {
  try {
    if (typeof window === "undefined") return;
    const records = loadGameRecords();
    // 如果已存在相同 ID 的记录，替换它
    const existingIndex = records.findIndex((r) => r.id === record.id);
    if (existingIndex >= 0) {
      records[existingIndex] = record;
    } else {
      records.unshift(record);
    }
    // 🔧 限长：避免 localStorage 配额溢出（QuotaExceededError）
    if (records.length > MAX_GAME_RECORDS) records.length = MAX_GAME_RECORDS;

    // 🔧 配额兜底：只限条数不足以保证写得下（历史记录可能单条超大），
    //    写入失败时逐条丢弃最旧记录重试，直到成功或只剩 1 条，
    //    避免"保存失败且用户毫无感知"。
    for (;;) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
        break;
      } catch (quotaError) {
        if (records.length <= 1) throw quotaError;
        records.length = records.length - 1;
      }
    }
  } catch (error) {
    console.error("Failed to save game record:", error);
  }
}

/**
 * 删除一条游戏记录
 */
export function deleteGameRecord(recordId: string): void {
  try {
    if (typeof window === "undefined") return;
    const records = loadGameRecords();
    const filtered = records.filter((r) => r.id !== recordId);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error("Failed to delete game record:", error);
  }
}

/**
 * 从 GameState 生成 GameSnapshot
 */
/**
 * 安全深拷贝：值为 undefined/null 时原样返回，避免 JSON.parse('undefined') 抛错
 */
function safeJsonClone(value: unknown): any {
  if (value === undefined || value === null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

export function createSnapshotFromState(state: GameState): GameSnapshot {
  return {
    gamePhase: state.gamePhase,
    nightCount: state.nightCount,
    deadThisNight: [...state.deadThisNight],
    executedPlayerId: state.executedPlayerId,
    wakeQueueIds: [...state.wakeQueueIds],
    currentWakeIndex: state.currentWakeIndex,
    selectedActionTargets: [...state.selectedActionTargets],
    currentHint: state.currentHint
      ? safeJsonClone(state.currentHint)
      : state.currentHint,
    inspectionResult: state.inspectionResult,
    inspectionResultKey: state.inspectionResultKey,
    todayDemonVoted: state.todayDemonVoted,
    todayMinionNominated: state.todayMinionNominated,
    todayExecutedId: state.todayExecutedId,
    witchCursedId: state.witchCursedId,
    witchActive: state.witchActive,
    cerenovusTarget: state.cerenovusTarget
      ? { ...state.cerenovusTarget }
      : null,
    isVortoxWorld: state.isVortoxWorld,
    fangGuConverted: state.fangGuConverted,
    jugglerGuesses: safeJsonClone(state.jugglerGuesses),
    evilTwinPair: state.evilTwinPair ? { ...state.evilTwinPair } : null,
    outsiderDiedToday: state.outsiderDiedToday,
    gossipStatementToday: state.gossipStatementToday,
    gossipTrueTonight: state.gossipTrueTonight,
    gossipSourceSeatId: state.gossipSourceSeatId,
    timer: state.timer,
    startTime: state.startTime ? state.startTime.toISOString() : null,
    selectedRole: state.selectedRole,
    spyDisguiseMode: state.spyDisguiseMode,
    spyDisguiseProbability: state.spyDisguiseProbability,
    poppyGrowerDead: state.poppyGrowerDead,
    pukkaPoisonQueue: safeJsonClone(state.pukkaPoisonQueue),
    poChargeState: { ...state.poChargeState },
    usedOnceAbilities: safeJsonClone(state.usedOnceAbilities),
    usedDailyAbilities: safeJsonClone(state.usedDailyAbilities),
    balloonistKnownTypes: JSON.parse(
      JSON.stringify(state.balloonistKnownTypes)
    ),
    hasExecutedThisDay: state.hasExecutedThisDay,
    votedThisRound: [...state.votedThisRound],
    lastDuskExecution: state.lastDuskExecution,
    currentDuskExecution: state.currentDuskExecution,
    history: safeJsonClone(state.history),
    historyIndex: state.historyIndex ?? -1,
    reminderTokens: safeJsonClone(state.reminderTokens ?? {}),
    seats: safeJsonClone(state.seats),
    initialSeats: safeJsonClone(state.initialSeats),
    victorySnapshot: safeJsonClone(state.victorySnapshot),
    winResult: state.winResult,
    winReason: state.winReason,
    mayorRedirectTarget: state.mayorRedirectTarget,
    damselGuessed: state.damselGuessed,
    damselGuessUsedBy: [...state.damselGuessUsedBy],
    klutzChoiceTarget: state.klutzChoiceTarget,
    shamanKeyword: state.shamanKeyword,
    shamanTriggered: state.shamanTriggered,
    shamanConvertTarget: state.shamanConvertTarget,
    autoRedHerringInfo: state.autoRedHerringInfo,
    dayAbilityLogs: safeJsonClone(state.dayAbilityLogs),
    nominationMap: { ...state.nominationMap },
    nominationRecords: {
      nominators: Array.from(state.nominationRecords?.nominators || []),
      nominees: Array.from(state.nominationRecords?.nominees || []),
    },
    mastermindFinalDay: state.mastermindFinalDay
      ? { ...state.mastermindFinalDay }
      : null,
    remainingDays: state.remainingDays,
    goonDrunkedThisNight: state.goonDrunkedThisNight,
    hadesiaChoices: { ...state.hadesiaChoices },
    virginGuideInfo: state.virginGuideInfo,
    voteRecords: safeJsonClone(state.voteRecords),
    seatNotes: { ...state.seatNotes },
    hadesiaChoiceEnabled: state.hadesiaChoiceEnabled,
    lastExecutedPlayerId: state.lastExecutedPlayerId,
    fangGuConvertedSeatId: null,
    selectedScript: state.selectedScript
      ? safeJsonClone(state.selectedScript)
      : null,
    scriptId: state.selectedScript?.id,
    scriptName: state.selectedScript?.name,
  };
}

/**
 * 判断一个快照是否是真正意义上的“未完成进行中对局”
 * 排除 setup, check, scriptSelection, gameOver, 以及未分配角色的空桌
 */
export function isRealUnfinishedGame(snapshot: GameSnapshot | null): boolean {
  if (!snapshot) return false;
  // 排除非实质游戏流程阶段
  const nonGamePhases = ["scriptSelection", "setup", "check", "gameOver"];
  if (!snapshot.gamePhase || nonGamePhases.includes(snapshot.gamePhase)) {
    return false;
  }
  // 排除已分胜负的已结束对局
  if (snapshot.winResult) return false;
  // 必须有座位且已分配角色
  if (!snapshot.seats || snapshot.seats.length === 0) return false;
  const hasAssignedRoles = snapshot.seats.some((s: any) => s.role?.id);
  if (!hasAssignedRoles) return false;
  return true;
}

/**
 * 保存当前游戏快照到 localStorage（用于意外关闭后恢复）
 */
export function saveCurrentSnapshot(snapshot: GameSnapshot): void {
  try {
    if (typeof window === "undefined") return;
    // 🔧 截断 history 只保留最近 5 条轻量记录，避免深层历史递归膨胀溢出 localStorage 配额
    const slim = {
      ...snapshot,
      history: Array.isArray(snapshot.history)
        ? snapshot.history.slice(-5).map((h) => ({
            ...h,
            history: [],
          }))
        : [],
    };
    try {
      window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(slim));
    } catch (innerError: any) {
      if (
        innerError?.name === "QuotaExceededError" ||
        innerError?.code === 22 ||
        innerError?.code === 1014
      ) {
        // 配额超限兜底：清理历史记录与多余日志，只保存纯净当前状态
        const minimal = {
          ...slim,
          history: [],
          dayAbilityLogs: [],
        };
        // 清理过期的游戏档案
        const records = loadGameRecords();
        if (records.length > 5) {
          try {
            window.localStorage.setItem(
              STORAGE_KEY,
              JSON.stringify(records.slice(0, 5))
            );
          } catch {}
        }
        window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(minimal));
      } else {
        throw innerError;
      }
    }
  } catch (error) {
    console.warn("Failed to save current snapshot:", error);
  }
}

/**
 * 把历史存档里残留的 `isAlive` 死亡标记迁移为统一的 `isDead`。
 *
 * 背景（2026-09-14 死亡标记统一）：
 *   项目曾同时使用 `isDead: true` 与 `isAlive: false` 表示「已死亡」。
 *   统一后全仓只认 `isDead`，但 **localStorage 里的旧快照**
 *   （尤其只写了 `isAlive: false` 的引擎路径，如 shabaloth/po/zombuul/assassin）
 *   若原样加载，会被当成**活人** → 死亡玩家复活、天亮播报错乱。
 *   因此在**加载边界**做一次性迁移，转换后不留 `isAlive` 字段。
 *
 * 幂等：已迁移过的快照再跑一次无变化。
 */
export function migrateLegacyDeathMarkers(
  snapshot: GameSnapshot | null
): GameSnapshot | null {
  if (!snapshot || !Array.isArray((snapshot as any).seats)) return snapshot;
  let touched = false;
  const seats = (snapshot as any).seats.map((seat: any) => {
    if (!seat || typeof seat !== "object") return seat;
    if (!("isAlive" in seat)) return seat;
    touched = true;
    const { isAlive, ...rest } = seat;
    // 旧语义：isAlive 明确为 false ⇒ 已死亡；否则沿用已有 isDead
    const isDead = isAlive === false ? true : rest.isDead === true;
    return { ...rest, isDead };
  });
  return touched ? ({ ...(snapshot as any), seats } as GameSnapshot) : snapshot;
}

/**
 * 读档兜底：给酒鬼 / 提线木偶补上「永久醉酒」。
 *
 * 为什么要在读档处也做（而不只在游戏开始处）：
 *   旧版本存档（或"未设伪装"的进行中对局）可能只有 `charadeRole` 而没有
 *   `statusEffects: [{ type:"drunk", permanent:true }]` → 中间件会判其能力**有效**
 *   → 信息类能力（如赏金猎人）**泄漏真值**。用户在**进行中的对局**里遇到的就是这种。
 * 幂等：已带该效果的座位原样保留。
 */
export function migrateCharadePermanentDrunk(
  snapshot: GameSnapshot | null
): GameSnapshot | null {
  if (!snapshot || !Array.isArray((snapshot as any).seats)) return snapshot;
  const seats = (snapshot as any).seats;
  const next = applyCharadePermanentDrunk(seats as any[]);
  return next === seats ? snapshot : ({ ...(snapshot as any), seats: next } as GameSnapshot);
}

/**
 * 从 localStorage 加载当前游戏快照
 */
export function loadCurrentSnapshot(): GameSnapshot | null {
  try {
    if (typeof window === "undefined") return null;
    const stored = window.localStorage.getItem(SNAPSHOT_KEY);
    if (!stored) return null;
    const snapshot = JSON.parse(stored) as GameSnapshot;
    // 🔧 死亡标记统一迁移（见 migrateLegacyDeathMarkers 注释）
    const migrated = migrateLegacyDeathMarkers(snapshot);
    // 🍺 酒鬼 / 提线木偶的「永久醉酒」兜底（见 utils/charadeSetup.ts 注释）：
    //   旧存档可能只落了伪装身份而没落 drunk 效果 → 信息类能力会泄漏真值。
    return migrateCharadePermanentDrunk(migrated);
  } catch (error) {
    console.error(
      "Failed to load current snapshot, clearing corrupted data:",
      error
    );
    // 数据损坏时清除 localStorage 中的快照
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(SNAPSHOT_KEY);
    }
    return null;
  }
}

/**
 * 清除当前游戏快照
 */
export function clearCurrentSnapshot(): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(SNAPSHOT_KEY);
  } catch (error) {
    console.error("Failed to clear current snapshot:", error);
  }
}

/**
 * 生成唯一 ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

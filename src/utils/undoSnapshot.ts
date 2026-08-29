/**
 * undoSnapshot - 原子级 Undo/Redo 快照序列化与恢复工具模块
 */

/**
 * 快照字段列表：所有需要在 undo/redo 时恢复的状态字段
 */
export const SNAPSHOT_KEYS = [
  "seats",
  "initialSeats",
  "gamePhase",
  "nightCount",
  "hasCompletedFirstNight",
  "executedPlayerId",
  "lastExecutedPlayerId",
  "todayExecutedId",
  "hasExecutedThisDay",
  "deadThisNight",
  "wakeQueueIds",
  "currentWakeIndex",
  "nightActionQueue",
  "currentQueueIndex",
  "selectedActionTargets",
  "gameLogs",
  "currentHint",
  "selectedScript",
  "reminderTokens",
  "seatNotes",
  "nominationRecords",
  "nominationMap",
  "votedThisRound",
  "voteRecords",
  "todayDemonVoted",
  "todayMinionNominated",
  "witchCursedId",
  "witchActive",
  "cerenovusTarget",
  "jugglerGuesses",
  "evilTwinPair",
  "outsiderDiedToday",
  "gossipStatementToday",
  "gossipTrueTonight",
  "gossipSourceSeatId",
  "damselGuessed",
  "damselGuessUsedBy",
  "shamanKeyword",
  "shamanTriggered",
  "shamanConvertTarget",
  "pukkaPoisonQueue",
  "poChargeState",
  "usedOnceAbilities",
  "usedDailyAbilities",
  "balloonistKnownTypes",
  "balloonistCompletedIds",
  "hadesiaChoices",
  "winResult",
  "winReason",
  "activeFabled",
] as const;

/**
 * 创建状态快照（深拷贝）
 */
export function createSnapshot(
  state: Record<string, any>
): Record<string, any> {
  const snapshot: Record<string, any> = {};
  for (const key of SNAPSHOT_KEYS) {
    const val = state[key];
    if (val !== undefined) {
      if (key === "nominationRecords") {
        snapshot[key] = {
          nominators: Array.from(val?.nominators || []),
          nominees: Array.from(val?.nominees || []),
        };
      } else if (typeof val === "object" && val !== null) {
        snapshot[key] = JSON.parse(JSON.stringify(val));
      } else {
        snapshot[key] = val;
      }
    }
  }
  return snapshot;
}

/**
 * 从快照对象恢复状态
 */
export function restoreSnapshot(
  snapshot: Record<string, any>
): Record<string, any> {
  const updates: Record<string, any> = {};
  for (const key of SNAPSHOT_KEYS) {
    if (snapshot[key] !== undefined) {
      if (key === "nominationRecords") {
        const nr = snapshot[key];
        updates[key] = {
          nominators: new Set(
            Array.isArray(nr?.nominators) ? nr.nominators : []
          ),
          nominees: new Set(Array.isArray(nr?.nominees) ? nr.nominees : []),
        };
      } else if (typeof snapshot[key] === "object" && snapshot[key] !== null) {
        updates[key] = JSON.parse(JSON.stringify(snapshot[key]));
      } else {
        updates[key] = snapshot[key];
      }
    }
  }
  updates.currentModal = null;
  updates.contextMenu = null;
  return updates;
}

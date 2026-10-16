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
  "travelers",
  // 🌆 暮色（官方 Dusk）阶段：步骤游标 + 官员/窃贼投票目标
  //    （漏登记 ⇒ 撤销/重做与 localStorage 快照都会丢掉这些字段，
  //      表现为"选了目标、入夜后失效"）
  "twilightStepIndex",
  "twilightVoteTargets",
  "travelerHookChoices",
  "travelerAlignments",
  // 🥣 乞丐投票标记账本（tokens + 得知的阵营）——
  //    漏登记 ⇒ 撤销/重做与刷新恢复会把"收到的标记"清零，乞丐突然又能投票
  "beggarState",
  // 🎴 传奇角色说书人状态（fibbin / 天使 / 革命者 / 哨兵 / 圣洁之魂 / 摆渡人 / 玩具匠）
  //    ⚠️ 2026-10-16 实测：只加了 persistence + types 而漏了本处 ⇒
  //       三处白名单契约测试当场变红（`snapshot_keys_contract`）。切记三处同改。
  "fabledState",
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

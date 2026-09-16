/**
 * app/gameLogic.ts
 *
 * 说明：
 * - 这是给 Jest 的“纯逻辑”测试使用的一组最小核心函数。
 * - 运行时游戏逻辑主要在 hooks（例如 `src/hooks/useGameController.ts`）中；
 *   但单测不应依赖 React hooks，因此这里提供无副作用的纯函数实现。
 */

import {
  hasExecutionProof,
  hasTeaLadyProtection,
  isActorDisabledByPoisonOrDrunk,
  isGoodAlignment,
} from "../src/utils/gameRules";
import { isVortoxWorldActive } from "../src/utils/vortoxWorld";
import type { GamePhase, Seat } from "./data";
import { roles } from "./data";

// --- 类型定义 ---

export type Faction = "Good" | "Evil";

export interface GameEndResult {
  isGameOver: boolean;
  winner: Faction | null; // null 表示游戏未结束
  reason: string | null;
}

export interface NightActionSnapshot {
  // Meta
  roleId: string;
  index: number;

  // Constraints (The "Truth")
  targetLimit: { min: number; max: number };
  canSelectDead: boolean;
  canSelectSelf: boolean;
  validTargetIds: number[]; // Pre-calculated list of selectable seats

  // UI Helpers (Pre-calculated)
  guideText: string;
  actionText: string;

  interaction?: {
    type: "choose_player" | "confirm" | "other";
    amount: number; // Legacy support
  };
}

export interface GameStateSnapshot {
  seats: Seat[];
  gamePhase: GamePhase;
  winner: Faction | null;
  winReason: string | null;
  nextActionHint?: string;
  // Logs generated during this pure transition
  logs: string[];
}

// Context for logic decisions that depend on external state
export interface GameContext {
  isMastermindActive?: boolean;
  todayHasExecution?: boolean;
  damselGuessed?: boolean;
  klutzGuessedEvil?: boolean;
  isVortoxWorld?: boolean;
  evilTwinPair?: {
    goodId?: number;
    evilId?: number;
    goodSeatId?: number;
    evilSeatId?: number;
  } | null;
  executedSeatId?: number | null; // For historical context if needed
  isMoonchildActive?: boolean;
  pacifistSaves?: boolean;
  // 利维坦相关状态
  leviathanDay?: number; // 当前是第几个白天（从1开始）
  goodExecutionsCount?: number; // 善良玩家被处决的数量
  // 恐惧之灵相关状态
  fearmongerTargetId?: number | null; // 恐惧之灵选定的目标
  fearmongerNominated?: boolean; // 恐惧之灵是否已提名目标
  // 异端分子相关状态
  hereticActive?: boolean; // 异端分子是否在场且生效
  // 无神论者相关状态
  atheistPresent?: boolean; // 无神论者是否在场
  storytellerExecuted?: boolean; // 说书人是否被处决
  // 炸弹人相关状态
  boomdandyExploded?: boolean; // 炸弹人是否已爆炸
  boomdandyVoteTied?: boolean; // 炸弹人爆炸后的投票是否平局
  // 祖母与利维坦
  grandmotherGrandchildId?: number | null; // 祖母的孙子ID（用于检查）
}

export type GameAction =
  | {
      type: "KILL_PLAYER";
      targetId: number;
      source: string;
      killerRoleId?: string;
      force?: boolean;
    }
  | { type: "EXECUTE_PLAYER"; targetId: number }
  | {
      type: "CHECK_GAME_OVER";
      executedId?: number;
      lastAction?: "execution" | "night_death" | "check_phase";
      context?: GameContext;
    }
  | { type: "IMP_STAR_PASS"; oldImpId: number; newImpId: number }
  | { type: "DECLARE_MAYOR_WIN" };

export function processGameEvent(
  currentSeats: Seat[],
  currentPhase: GamePhase,
  action: GameAction,
  externalContext: GameContext = {} // Use this context for game over checks
): GameStateSnapshot {
  // 1. Deep Clone State
  const nextSeats: Seat[] = JSON.parse(JSON.stringify(currentSeats));
  const logs: string[] = [];
  const nextPhase = currentPhase;
  let winner: Faction | null = null;
  let winReason: string | null = null;
  let nextActionHint: string | undefined;

  // MERGE Context: Action-specific context takes precedence over global external context
  const context = {
    ...externalContext,
    ...(action.type === "CHECK_GAME_OVER" ? action.context : {}),
  };

  // 2. Process Action
  switch (action.type) {
    case "KILL_PLAYER": {
      const target = nextSeats.find((s) => s.id === action.targetId);
      if (!target) break;

      // Skip if already dead (unless zombuul logic handled inside)
      if (target.isDead) {
        if (target.role?.id !== "zombuul" || target.isZombuulTrulyDead) {
          break;
        }
      }

      const source = action.source;
      const killerRoleId = action.killerRoleId;

      // --- Protection Checks ---
      // 1. Sailor (Health immunity)
      if (
        target.role?.id === "sailor" &&
        !isActorDisabledByPoisonOrDrunk(target)
      ) {
        logs.push(`🍺 ${target.id + 1}号 [水手] 免疫死亡`);
        break;
      }
      // 2. Fool (First death immunity)
      if (target.role?.id === "fool" && killerRoleId !== "assassin") {
        const alreadyTriggered = (target.statusDetails || []).some((d) =>
          d.includes("弄臣免死已触发")
        );
        if (!alreadyTriggered && !isActorDisabledByPoisonOrDrunk(target)) {
          target.statusDetails = [
            ...(target.statusDetails || []),
            "弄臣免死已触发",
          ];
          logs.push(`🃏 ${target.id + 1}号 [弄臣] 免死一次`);
          break;
        }
      }
      // 3. Soldier (Demon immunity)
      if (
        source === "demon" &&
        target.role?.id === "soldier" &&
        !isActorDisabledByPoisonOrDrunk(target)
      ) {
        logs.push(`🛡️ ${target.id + 1}号 [士兵] 免疫恶魔攻击`);
        break;
      }
      // 4. Protected Checks (Monk, Innkeeper, etc.)
      if (target.isProtected && target.protectedBy !== null) {
        const protector = nextSeats.find((s) => s.id === target.protectedBy);
        if (protector) {
          const pid = protector.role?.id;
          // 保护者自己中毒/醉酒时，保护不生效
          if (
            pid === "monk" &&
            source === "demon" &&
            !isActorDisabledByPoisonOrDrunk(protector)
          ) {
            logs.push(`🛡️ ${target.id + 1}号 被僧侣保护`);
            break;
          }
          if (
            pid === "innkeeper" &&
            source !== "execution" &&
            !isActorDisabledByPoisonOrDrunk(protector)
          ) {
            logs.push(`🛡️ ${target.id + 1}号 被旅店老板保护`);
            break;
          }
        }
      }
      // 5. Tea Lady
      if (
        killerRoleId !== "assassin" &&
        hasTeaLadyProtection(target, nextSeats)
      ) {
        logs.push(`🛡️ ${target.id + 1}号 被茶艺师保护`);
        break;
      }

      // --- Apply Death ---
      // Zombuul Logic
      if (target.role?.id === "zombuul") {
        const zombuulLives = target.zombuulLives ?? 1;
        const isTrulyDead = target.isZombuulTrulyDead;
        const isFirstDeath = !target.isFirstDeathForZombuul;

        if (isFirstDeath && zombuulLives > 0 && !isTrulyDead) {
          target.isDead = false; // Remains "Alive" physically
          target.isFirstDeathForZombuul = true;
          target.zombuulLives = zombuulLives - 1;
          target.statusDetails = [...(target.statusDetails || []), "僵怖假死"];
          logs.push(`${target.id + 1}号(僵怖) 假死`);
        } else {
          target.isDead = true;
          target.isZombuulTrulyDead = true;
          target.zombuulLives = 0;
          logs.push(`${target.id + 1}号(僵怖) 真正死亡`);

          // Trigger death events for Zombuul true death
          handlePostDeathTriggers(
            target,
            nextSeats,
            logs,
            action.source || "unknown"
          );
        }
      } else {
        target.isDead = true;
        logs.push(`${target.id + 1}号 死亡`);

        // Trigger death events
        handlePostDeathTriggers(
          target,
          nextSeats,
          logs,
          action.source || "unknown"
        );
      }

      // --- Side Effects (Hint for Modal) ---
      if (target.role?.id === "barber_mr") {
        nextActionHint = "BARBER_SWAP_NEEDED";
        logs.push("理发师死亡，触发交换");
      }

      break;
    }
    case "EXECUTE_PLAYER": {
      const target = nextSeats.find((s) => s.id === action.targetId);
      if (!target) break;

      // 1. Tea Lady
      if (hasTeaLadyProtection(target, nextSeats)) {
        logs.push(`🛡️ ${target.id + 1}号 被茶艺师保护，免于处决`);
        nextActionHint = "EXECUTION_BLOCKED";
        break;
      }

      // 2. Pacifist
      const activePacifist = nextSeats.find(
        (s) =>
          s.role?.id === "pacifist" &&
          !s.isDead &&
          !isActorDisabledByPoisonOrDrunk(s)
      );
      if (activePacifist && isGoodAlignment(target)) {
        // Pure logic heuristic: Use context flag
        if (context.pacifistSaves) {
          logs.push(`☮️ ${target.id + 1}号 被和平主义者救下`);
          nextActionHint = "PACIFIST_SAVED";
          break;
        }
      }

      // 3. Generic Execution Proof
      if (hasExecutionProof(target)) {
        logs.push(`🛡️ ${target.id + 1}号 免于处决`);
        nextActionHint = "EXECUTION_BLOCKED";
        break;
      }

      // Execute
      target.isDead = true;
      target.isSentenced = true;
      logs.push(`${target.id + 1}号 被处决`);

      // Trigger death events
      handlePostDeathTriggers(target, nextSeats, logs, "execution");
      break;
    }
    case "CHECK_GAME_OVER": {
      // Logic handled below
      break;
    }
    case "IMP_STAR_PASS": {
      const oldImp = nextSeats.find((s) => s.id === action.oldImpId);
      const newImp = nextSeats.find((s) => s.id === action.newImpId);

      if (!oldImp) break;

      // 1. Kill old Imp
      oldImp.isDead = true;
      logs.push(`${oldImp.id + 1}号(小恶魔) 选择自杀`);

      // 2. Pass to new Imp
      if (newImp) {
        const impRole = roles.find((r) => r.id === "imp");
        if (impRole) {
          newImp.role = impRole;
          newImp.displayRole = impRole; // Update display too? Usually UI handles display.
          newImp.isDemonSuccessor = true;
          newImp.statusDetails = [...(newImp.statusDetails || []), "小恶魔传"];
          logs.push(`${oldImp.id + 1}号(小恶魔) 传位给 ${newImp.id + 1}号`);
        }
      }
      // Note: Wake Queue cleanup and DeadThisNight update must be handled by Controller side effects
      break;
    }
    case "DECLARE_MAYOR_WIN": {
      winner = "Good";
      winReason = "镇长身份获胜";
      break;
    }
  }

  // 3. Universal Game Over Check
  let lastActionType: "execution" | "night_death" | "check_phase" =
    "check_phase";
  let executedId: number | null = null;

  if (action.type === "EXECUTE_PLAYER") {
    lastActionType = "execution";
    executedId = action.targetId;
  } else if (action.type === "KILL_PLAYER" && action.source === "demon") {
    lastActionType = "night_death";
  } else if (action.type === "CHECK_GAME_OVER" && action.lastAction) {
    lastActionType = action.lastAction;
    executedId = action.executedId ?? null;
  }

  const result = checkGameEnd(nextSeats, lastActionType, executedId, context);
  winner = result.winner;
  winReason = result.reason;

  return {
    seats: nextSeats,
    gamePhase: nextPhase,
    winner,
    winReason,
    logs,
    nextActionHint,
  };
}

// --- 基础辅助函数 ---

export function initializeSeats(count: number): Seat[] {
  if (count <= 0) return [];
  return Array.from({ length: count }).map((_, idx) => ({
    id: idx,
    role: null,
    displayRole: null,
    charadeRole: null,
    apparentDemonRole: null,
    isDead: false,
    hasGhostVote: true,
    isEvilConverted: false,
    isGoodConverted: false,
    isDrunk: false,
    isPoisoned: false,
    isProtected: false,
    protectedBy: null,
    isRedHerring: false,
    isFortuneTellerRedHerring: false,
    isSentenced: false,
    masterId: null,
    hasUsedSlayerAbility: false,
    hasUsedDayAbility: false,
    hasUsedVirginAbility: false,
    hasBeenNominated: false,
    isDemonSuccessor: false,
    hasAbilityEvenDead: false,
    statusDetails: [],
    statuses: [],
    grandchildId: null,
    isGrandchild: false,
    isFirstDeathForZombuul: false,
    isZombuulTrulyDead: false,
    zombuulLives: 1,
  }));
}

export function allPlayersHaveRoles(seats: Seat[]): boolean {
  return seats.every((s) => !!s.role);
}

export function assignRoles(seats: Seat[], roleIds: string[]): Seat[] {
  if (seats.length !== roleIds.length) {
    throw new Error(
      `座位数量(${seats.length})与角色数量(${roleIds.length})不匹配`
    );
  }

  return seats.map((s, idx) => {
    const id = roleIds[idx];
    const role = roles.find((r) => r.id === id);
    if (!role) throw new Error(`找不到角色ID: ${id}`);
    return {
      ...s,
      role,
      // Drunk：默认标记为醉酒（测试用）
      isDrunk: id === "drunk" || id === "drunk_mr" ? true : s.isDrunk,
    };
  });
}

export function killPlayer(
  seats: Seat[],
  targetId: number,
  _options?: { isNightPhase?: boolean; checkProtection?: boolean }
): Seat[] {
  return seats.map((s) => (s.id === targetId ? { ...s, isDead: true } : s));
}

export function getAlivePlayerCount(seats: Seat[]): number {
  return seats.filter((s) => !s.isDead).length;
}

export function getDeadPlayerCount(seats: Seat[]): number {
  return seats.filter((s) => s.isDead).length;
}

export function canUseAbility(seat: Seat): boolean {
  if (!seat.role) return false;
  if (seat.isDead && !seat.hasAbilityEvenDead) return false;
  return true;
}

/**
 * 判断玩家是否属于邪恶阵营
 * (基于角色类型或转正状态，军团视为邪恶)
 */
export function isPlayerEvil(seat: Seat): boolean {
  if (seat.isEvilConverted) return true;
  if (seat.isGoodConverted) return false;
  if (!seat.role) return false;
  // 默认规则：恶魔(demon)、爪牙(minion)或军团(legion)是邪恶的
  return (
    seat.role.type === "demon" ||
    seat.role.type === "minion" ||
    seat.role.id === "legion"
  );
}

export function isPlayerDemon(seat: Seat): boolean {
  if (!seat.role) return false;
  return seat.role.type === "demon" || seat.role.id === "legion";
}

export function isPlayerMinion(seat: Seat): boolean {
  if (!seat.role) return false;
  return seat.role.type === "minion" || seat.role.id === "legion";
}

// --- 核心胜负判定逻辑 (Priority Pyramid) ---

/**
 * 检查游戏是否结束及胜负方
 * @param seats 当前座位状态
 * @param lastAction 导致检查的最后一个动作
 * @param executedPlayerId 如果是处决，被处决的玩家ID
 * @param options 其他选项：主谋状态、特殊猜测状态、旋涡状态等
 */
export function checkGameEnd(
  seats: Seat[],
  lastAction: "execution" | "night_death" | "check_phase",
  executedPlayerId: number | null = null,
  options: GameContext = {}
): GameEndResult {
  const {
    isMastermindActive = false,
    damselGuessed = false,
    klutzGuessedEvil = false,
    isVortoxWorld = false,
    evilTwinPair,
    leviathanDay = 0,
    goodExecutionsCount = 0,
    fearmongerTargetId = null,
    fearmongerNominated = false,
    hereticActive = false,
    atheistPresent = false,
    storytellerExecuted = false,
    boomdandyExploded = false,
    boomdandyVoteTied = false,
    grandmotherGrandchildId = null,
  } = options;

  // 0. 特殊即时胜利/失败触发 (未在金字塔中明确列出，但属于即时结算，置于顶层)
  if (damselGuessed) {
    return { isGameOver: true, winner: "Evil", reason: "爪牙猜中落难少女" };
  }
  if (klutzGuessedEvil) {
    return { isGameOver: true, winner: "Evil", reason: "呆瓜误判" };
  }

  const aliveSeats = seats.filter((s) => !s.isDead);
  const aliveCount = aliveSeats.length;

  const hasLegionInPlay = seats.some((s) => s.role?.id === "legion");

  // --- 1. 【第一优先级】检查恶魔是否全灭 (包含红唇女郎、僵尸、军团等) ---
  const livingDemons = aliveSeats.filter(
    (s) => s.role?.type === "demon" || s.role?.id === "legion"
  );
  // 统计“死而未僵”的恶魔 (僵尸 Zombuul 特判)
  const zombuulActive = seats.filter(
    (s) => s.role?.id === "zombuul" && s.isDead && !s.isZombuulTrulyDead
  );
  const totalEffectiveDemons = livingDemons.length + zombuulActive.length;

  // 1.1 恶魔全灭 -> 好人获胜 (除非受阻)
  if (totalEffectiveDemons === 0) {
    if (hasLegionInPlay) {
      return {
        isGameOver: true,
        winner: "Good",
        reason: "所有军团已被彻底消灭",
      };
    }

    // 特例：主谋 (Mastermind) 触发用于在处决导致恶魔死亡时延续游戏
    if (isMastermindActive && lastAction === "execution") {
      const demonDied =
        seats.find((s) => s.id === executedPlayerId)?.role?.type === "demon" ||
        seats.find((s) => s.id === executedPlayerId)?.role?.id === "legion";
      if (demonDied) {
        return {
          isGameOver: false,
          winner: null,
          reason: "主谋使游戏在恶魔死后继续",
        };
      }
    }

    // 检查邪恶双子阻挡
    let goodWinBlockedByTwin = false;
    const evilTwinSeat = seats.find(
      (s) =>
        s.role?.id === "evil_twin" && !s.isDead && !s.isPoisoned && !s.isDrunk
    );
    if (evilTwinSeat) {
      const goodTwinId =
        evilTwinPair?.goodSeatId ?? evilTwinPair?.goodId;
      const goodTwinSeat =
        (goodTwinId !== undefined
          ? seats.find((s) => s.id === goodTwinId)
          : null) ||
        seats.find((s) => s.isGoodTwin && !s.isDead) ||
        seats.find(
          (s) =>
            s.id !== evilTwinSeat.id &&
            !s.isDead &&
            (s.role?.type === "townsfolk" || s.role?.type === "outsider") &&
            !s.isEvilConverted
        );
      if (goodTwinSeat && !goodTwinSeat.isDead) {
        goodWinBlockedByTwin = true;
      }
    }

    if (!goodWinBlockedByTwin) {
      return { isGameOver: true, winner: "Good", reason: "恶魔已被彻底消灭" };
    }
    // ⚠️ 被双子阻止 → 善良**无法**获胜，但**不代表**邪恶立刻获胜：
    //    官方 Evil Twin："Good can't win if you both live."
    //      → 只剥夺善良的胜利条件，游戏继续（好人还需处决邪恶双子）。
    //    此时若人数已到官方阈值（仅剩 2 人非旅行者存活）→ 邪恶仍然获胜：
    //      官方 Evil Twin Tips："evil will win if the Evil Twin and the Demon are
    //      both alive when just 3 players are left alive"
    //      （3 人 → 好人无处分票，下一轮必然只剩 2 人 → 邪恶胜）。
    //    因此这里**继续向下**走 1.5 的人数阈值判定，而非直接 return。
  }

  // --- 1.2 【处决特殊结算】特殊角色导致邪恶获胜 (圣徒、地精、双子) ---
  if (lastAction === "execution" && executedPlayerId !== null) {
    const executedSeat = seats.find((s) => s.id === executedPlayerId);
    if (executedSeat && !executedSeat.isPoisoned && !executedSeat.isDrunk) {
      if (executedSeat.role?.id === "saint")
        return { isGameOver: true, winner: "Evil", reason: "圣徒被处决" };
      if (executedSeat.role?.id === "goblin")
        return { isGameOver: true, winner: "Evil", reason: "地精被处决" };

      // 镜像双子（Evil Twin）：若存活的善良双子被处决，邪恶阵营直接获胜
      const evilTwin = seats.find(
        (s) =>
          s.role?.id === "evil_twin" && !s.isDead && !s.isPoisoned && !s.isDrunk
      );
      if (evilTwin) {
        const designatedGoodId =
          evilTwinPair?.goodSeatId ?? evilTwinPair?.goodId;
        const hasExplicitDesignation =
          designatedGoodId !== undefined || seats.some((s) => s.isGoodTwin);
        const isGoodTwin = hasExplicitDesignation
          ? executedSeat.id === designatedGoodId ||
            !!executedSeat.isGoodTwin
          : executedSeat.id !== evilTwin.id &&
            executedSeat.role?.id !== "evil_twin" &&
            !executedSeat.isEvilConverted &&
            (executedSeat.role?.type === "townsfolk" ||
              executedSeat.role?.type === "outsider");
        if (isGoodTwin) {
          return {
            isGameOver: true,
            winner: "Evil",
            reason: "善良双子被处决（镜像双子胜利）",
          };
        }
      }
    }
  }

  // --- 1.5 【核心】邪恶阵营终局条件 ---
  // 旅行者(traveler)不计入阵营人数（与投票门槛逻辑一致）
  const aliveNonTraveler = aliveSeats.filter(
    (s) => s.role?.type !== "traveler"
  );
  const aliveEvil = aliveNonTraveler.filter((s) => isPlayerEvil(s));
  const aliveGood = aliveNonTraveler.filter((s) => !isPlayerEvil(s));
  const aliveNonTravelerCount = aliveNonTraveler.length;

  // ⚠️⚠️ 2026-09-15 修正：**删除杜撰的「存活邪恶 ≥ 存活善良」终局规则**。
  //
  //   官方规则书（Running the Game → Ending the Game）**只有一条**邪恶终局条件：
  //     "Good wins if the Demon dies.
  //      **Evil wins if only two players are left alive** (Travelers and Fabled do
  //      not count toward this).
  //      If both teams would win at the same time, good wins.
  //      … **if there is any way for the losing team to win, keep the game going.**"
  //   Glossary · Evil: "Evil wins when just 2 players are alive (not counting Travelers)."
  //
  //   旧实现（commit 7c42dbc 凭空插入、提交信息未提、无缺陷报告支撑）用
  //   `aliveEvil.length >= aliveGood.length` 在 **3 人及以上**时就判邪恶胜：
  //     · 4 人存活、2 好 : 2 恶  → 误判邪恶胜（用户截图实测）
  //     · 3 人存活、2 恶 : 1 好  → 误判邪恶胜（善良次日仍可提名处决恶魔）
  //   这与官方「固定阈值 = 2 人」及「善良还有翻盘路径就别判负」**直接冲突**。
  //
  //   保留的**唯一**提前判负情形，是官方明确点名的例子：
  //     全场存活者**全为邪恶**（善良已无人可提名恶魔）→ 邪恶胜。

  // ⭐⭐ 官方优先规则：「If both teams would win at the same time, good wins.」
  //
  //   镇长和平获胜与邪恶人数阈值用的是**两套不同的计数口径**（官方明写）：
  //     · 镇长：**恰好 3 人存活，旅行者算玩家**
  //       "Travellers count as players for the Mayor's victory, so must be exiled first."
  //     · 邪恶：**非旅行者仅剩 2 人**
  //       "Evil wins if only two players are left alive (Travelers and Fabled do not
  //        count toward this)."
  //   ⇒ 两套口径可以**同时成立**，此时官方裁定**善良优先**：
  //     例：镇长 + 恶魔 + 1 名旅行者 = 存活 3 人 / 非旅行者 2 人
  //         · 镇长条件成立（3 人含旅行者）→ 善良胜
  //         · 邪恶条件成立（非旅行者 2 人）→ 邪恶胜
  //         · 官方并行成立 → **善良胜**
  //   ⚠️ 因此这一判定必须放在人数阈值**之前**，否则邪恶会抢先返回。
  //   （本项目未建模 Fabled，故无需处理「Fabled 不计入」的附加条款。）
  const hasMayorPeacefulWin =
    lastAction === "execution" &&
    executedPlayerId === null && // 平安日：当日无人被处决
    aliveCount === 3 && // 恰好 3 人存活（aliveSeats 含旅行者 → 与官方口径一致）
    aliveSeats.some(
      (s) => s.role?.id === "mayor" && !s.isPoisoned && !s.isDrunk
    );

  // ⭐ 官方优先规则：「If both teams would win at the same time, good wins.」
  //   镇长和平获胜是**硬性**胜利条件，必须放在人数阈值**与军团分支之前**结算：
  //     · 放阈值之前 → 否则「镇长 + 恶魔 + 旅行者」被人数阈值抢先判邪恶；
  //     · 放军团分支之前 → 否则军团局（如 镇长 + 2 邪恶存活、平安日）会漏判。
  if (hasMayorPeacefulWin) {
    return {
      isGameOver: true,
      winner: "Good",
      reason: "镇长触发和平获胜条件",
    };
  }

  if (hasLegionInPlay) {
    // 军团在场专属规则：
    // 军团开局占全场多数，故豁免常规人数阈值判定
    // 邪恶获胜条件：存活善良人数 <= 1（无法达成全灭恶魔）或存活总人数 <= 2 且有军团存活
    if (
      aliveGood.length <= 1 ||
      (aliveCount <= 2 && totalEffectiveDemons > 0)
    ) {
      return {
        isGameOver: true,
        winner: "Evil",
        reason: "善良阵营存活人数不足以战胜军团，邪恶阵营获胜",
      };
    }
  } else {
    // 官方点名允许的提前结束：存活者**全部为邪恶** → 善良无法提名恶魔
    if (
      totalEffectiveDemons > 0 &&
      aliveGood.length === 0 &&
      aliveEvil.length > 0
    ) {
      return {
        isGameOver: true,
        winner: "Evil",
        reason: "存活玩家全为邪恶阵营，善良无法提名恶魔",
      };
    }

    // --- 3. 【第三优先级】官方固定阈值：**仅剩 2 人存活**（旅行者不计入）---
    // 官方原文："Evil wins if only two players are left alive (Travelers and Fabled
    //            do not count toward this)."
    //
    // ⚠️ 不附加"恶魔必须存活"的条件：
    //    分支 1.1 已在恶魔全灭时返回善良胜（除非被双子阻挡）。能走到这里的
    //    「恶魔全灭」只可能是**被存活的邪恶双子阻挡**——此时善良无法获胜
    //    （官方："Good can't win if you both live."），而人数已到阈值，
    //    邪恶获胜（官方 Evil Twin Tips 印证 3 人 → 2 人的必然收敛）。
    if (aliveNonTravelerCount <= 2) {
      return {
        isGameOver: true,
        winner: "Evil",
        reason: "存活人数仅剩 2 人",
      };
    }
  }

  // --- 4. 【额外层】涡流（镇长和平获胜已上移至 1.5 之前，见 `hasMayorPeacefulWin`）---
  // 🌪️ 涡流世界判定（2026-09-15 收口）
  //   官方：涡流**存活**时所有信息为假，且「每个白天若无人被处决 → 邪恶获胜」。
  //   ⚠️ 旧实现**完全依赖调用方传入的 `isVortoxWorld`**：一旦调用方漏传/传了陈旧值
  //      （如 `processGameEvent` 走外部 context、或涡流刚死但 state 未刷新），
  //      涡流平安日获胜会**静默失效**，游戏卡在白天。
  //   ✅ 现在改为**从 seats 自推导**：座位上有存活涡流（或伪装成涡流的酒鬼/提线木偶）
  //      即成立，与 `GameStage` / `roleActionHandlers` / `useNightActionHandler` 同源
  //      （唯一事实来源 `src/utils/vortoxWorld.ts`）。
  //      入参 `isVortoxWorld` 仅作为「额外成立」的补充（保持向后兼容，
  //      例如涡流已死但本轮仍按涡流世界结算的历史行为）。
  const vortoxInSeats = isVortoxWorldActive(seats);
  const vortoxEffective = isVortoxWorld || vortoxInSeats;
  if (lastAction === "check_phase" && vortoxEffective) {
    const todayHasExecution = (options as any).todayHasExecution === true;
    if (!todayHasExecution) {
      return {
        isGameOver: true,
        winner: "Evil",
        reason: "涡流：今日无人被处决",
      };
    }
  }
  if (lastAction === "execution" && executedPlayerId === null) {
    // 涡流 (Vortox): 平安日直接邪恶获胜
    if (vortoxEffective) {
      return {
        isGameOver: true,
        winner: "Evil",
        reason: "涡流：今日无人被处决",
      };
    }
    // 主谋 (Mastermind): 额外一天若无人被处决 -> 邪恶获胜
    if (isMastermindActive) {
      return {
        isGameOver: true,
        winner: "Evil",
        reason: "主谋翻盘：额外一天无人处决",
      };
    }
    // 镇长 (Mayor): 和平获胜已**上移**到「1.5 邪恶人数阈值之前」统一结算
    //   —— 官方优先规则「两条同时成立时善良优先」要求它先于人数阈值。
    //   ⚠️ 唯一事实来源 = 上方 `hasMayorPeacefulWin`，此处**不得**重复实现
    //      （否则两处口径会分叉：一处含旅行者、一处不含）。
  }

  // --- 5. 【特殊角色胜利条件】利维坦、恐惧之灵、异端分子、无神论者、炸弹人等 ---
  // 5.1 利维坦 (Leviathan) 胜利条件
  const leviathanPresent = seats.some(
    (s) => s.role?.id === "leviathan" && !s.isDead
  );
  if (leviathanPresent) {
    // 条件1: 多于一名善良玩家被处决
    if (goodExecutionsCount > 1) {
      return {
        isGameOver: true,
        winner: "Evil",
        reason: "利维坦：多于一名善良玩家被处决",
      };
    }
    // 条件2: 第五个白天结束时利维坦存活
    if (leviathanDay >= 5) {
      return {
        isGameOver: true,
        winner: "Evil",
        reason: "利维坦：第五个白天结束时存活",
      };
    }
  }

  // 5.2 恐惧之灵 (Fearmonger) 胜利条件
  if (
    fearmongerTargetId !== null &&
    fearmongerNominated &&
    lastAction === "execution" &&
    executedPlayerId === fearmongerTargetId
  ) {
    const executedSeat = seats.find((s) => s.id === executedPlayerId);
    if (executedSeat && !executedSeat.isPoisoned && !executedSeat.isDrunk) {
      return {
        isGameOver: true,
        winner: "Evil",
        reason: "恐惧之灵：选定的目标被处决",
      };
    }
  }

  // 5.3 异端分子 (Heretic) 反转胜利条件
  if (hereticActive) {
    // 异端分子在场时，如果游戏即将结束且好人获胜，则反转结果为邪恶获胜
    // 这个检查需要在所有其他胜利条件之后执行，但为了简化，我们在这里处理
    // 注意：实际实现中，异端分子应该在游戏结束检查的最后一步进行反转
    // 由于实现复杂，暂时标记为TODO
  }

  // 5.4 无神论者 (Atheist) 胜利条件
  if (!atheistPresent && storytellerExecuted) {
    return {
      isGameOver: true,
      winner: "Evil",
      reason: "无神论者：说书人被处决且无神论者不在场",
    };
  }

  // 5.5 炸弹人 (Boomdandy) 胜利条件
  if (boomdandyExploded && boomdandyVoteTied) {
    // 炸弹人爆炸后投票平局，进入夜晚阶段，邪恶阵营极有可能获胜
    // 这里我们只标记游戏未结束，让夜晚继续
    // 实际实现可能需要特殊处理
  }

  // 5.6 祖母与利维坦特殊条件
  if (
    leviathanPresent &&
    grandmotherGrandchildId !== null &&
    lastAction === "execution" &&
    executedPlayerId === grandmotherGrandchildId
  ) {
    // 孙子死于处决且利维坦在场，邪恶获胜
    return {
      isGameOver: true,
      winner: "Evil",
      reason: "祖母与利维坦：孙子被处决",
    };
  }

  return { isGameOver: false, winner: null, reason: null };
}

// ======================================================================
//  Death Triggers (Grandmother / Scarlet Woman)
// ======================================================================

function handlePostDeathTriggers(
  target: Seat,
  seats: Seat[],
  logs: string[],
  deathSource: string = "unknown"
) {
  // 1. 祖母 (Grandmother) 孙子连带死亡
  if (deathSource === "demon") {
    // 找出所有活着的祖母，检查被杀死的玩家是否是她们的孙子
    seats.forEach((grandmaSeat) => {
      if (
        grandmaSeat.role?.id === "grandmother" &&
        !grandmaSeat.isDead &&
        grandmaSeat.grandchildId === target.id
      ) {
        // Assuming onKillPlayer and onAddLog are defined elsewhere or need to be adapted
        // For this context, we'll simulate the effect on the seats array and logs
        const killedGrandma = seats.find((s) => s.id === grandmaSeat.id);
        if (killedGrandma) {
          killedGrandma.isDead = true;
          logs.push(
            `祖母技能：孙子 ${target.id + 1} 号位被恶魔杀害，${grandmaSeat.id + 1}号(老祖母) 👵 殉情`
          );
          // Recursively trigger for Grandmother death (safe to prevent infinite loop by source check)
          handlePostDeathTriggers(
            killedGrandma,
            seats,
            logs,
            "grandmother_death"
          );
        }
      }
    });
  }

  // 2. Scarlet Woman Trigger (scarlet_woman)
  // 官方规则：如果在恶魔死前有 5 名或更多存活玩家（即恶魔死后存活玩家 >= 4 人，排除旅行者），红唇女郎立刻成为恶魔。
  if (target.role?.type === "demon" && !target.isDemonSuccessor) {
    // 计算存活玩家（此时 target 已被标记为 dead，所以 aliveCount 是幸存者人数）
    const aliveCount = seats.filter(
      (s) => !s.isDead && s.role?.type !== "traveler"
    ).length;

    if (aliveCount >= 4) {
      const sw = seats.find(
        (s) =>
          s.role?.id === "scarlet_woman" &&
          !s.isDead &&
          !s.isDemonSuccessor &&
          !s.isDrunk &&
          !s.isPoisoned
      );
      if (sw) {
        sw.isDemonSuccessor = true;
        // 继承恶魔角色（通常是 Imp）
        sw.role = target.role;
        sw.statusDetails = [...(sw.statusDetails || []), "红唇继任"];
        sw.displayRole = target.role; // UI Update
        logs.push(
          `💋 ${sw.id + 1}号(红唇女郎) 😈 恶魔死亡（死前存活≥5人），继任成为新的恶魔！`
        );
      }
    }
  }

  // 3. Moonchild Trigger (moonchild)
  // 如果月之子死亡，标记触发陪葬状态（实际死亡在夜晚执行或立即执行取决于逻辑，此处标记日志）
  if (target.role?.id === "moonchild") {
    logs.push(
      `🌙 ${target.id + 1}号(月之子) 死亡，请让其公开选择一名存活玩家诅咒`
    );
  }
}

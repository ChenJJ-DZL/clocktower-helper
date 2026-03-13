/**
 * app/gameLogic.ts
 *
 * 说明：
 * - 这是给 Jest 的“纯逻辑”测试使用的一组最小核心函数。
 * - 运行时游戏逻辑主要在 hooks（例如 `src/hooks/useGameController.ts`）中；
 *   但单测不应依赖 React hooks，因此这里提供无副作用的纯函数实现。
 */

import type { Seat, Role, GamePhase } from "./data";

import { roles } from "./data";
import {
  hasExecutionProof,
  hasTeaLadyProtection,
  isActorDisabledByPoisonOrDrunk,
  isGoodAlignment
} from "../src/utils/gameRules";

// --- 类型定义 ---

export type Faction = 'Good' | 'Evil';

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
    type: 'choose_player' | 'confirm' | 'other';
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
  damselGuessed?: boolean;
  klutzGuessedEvil?: boolean;
  isVortoxWorld?: boolean;
  evilTwinPair?: { goodId: number; evilId: number } | null;
  executedSeatId?: number | null; // For historical context if needed
  isMoonchildActive?: boolean;
  pacifistSaves?: boolean;
}

export type GameAction =
  | { type: 'KILL_PLAYER'; targetId: number; source: string; killerRoleId?: string; force?: boolean }
  | { type: 'EXECUTE_PLAYER'; targetId: number }
  | { type: 'REVIVE_PLAYER'; targetId: number }
  | { type: 'NIGHT_ACTION'; roleId: string; targets: number[]; info?: any }
  | { type: 'CHECK_GAME_OVER'; executedId?: number; lastAction?: 'execution' | 'night_death' | 'check_phase'; context?: GameContext }
  | { type: 'IMP_STAR_PASS'; oldImpId: number; newImpId: number }
  | { type: 'DECLARE_MAYOR_WIN' };

export function processGameEvent(
  currentSeats: Seat[],
  currentPhase: GamePhase,
  action: GameAction,
  externalContext: GameContext = {} // Use this context for game over checks
): GameStateSnapshot {
  // 1. Deep Clone State
  const nextSeats: Seat[] = JSON.parse(JSON.stringify(currentSeats));
  const logs: string[] = [];
  let nextPhase = currentPhase;
  let winner: Faction | null = null;
  let winReason: string | null = null;
  let nextActionHint: string | undefined = undefined;

  // MERGE Context: Action-specific context takes precedence over global external context
  const context = { ...externalContext, ...(action.type === 'CHECK_GAME_OVER' ? action.context : {}) };


  // 2. Process Action
  switch (action.type) {
    case 'KILL_PLAYER': {
      const target = nextSeats.find(s => s.id === action.targetId);
      if (!target) break;

      // Skip if already dead (unless zombuul logic handled inside)
      if (target.isDead) {
        if (target.role?.id !== 'zombuul' || target.isZombuulTrulyDead) {
          break;
        }
      }

      const source = action.source;
      const killerRoleId = action.killerRoleId;

      // --- Protection Checks ---
      // 1. Sailor (Health immunity)
      if (target.role?.id === 'sailor' && !isActorDisabledByPoisonOrDrunk(target)) {
        logs.push(`🍺 ${target.id + 1}号 [水手] 免疫死亡`);
        break;
      }
      // 2. Fool (First death immunity)
      if (target.role?.id === 'fool' && killerRoleId !== 'assassin') {
        const alreadyTriggered = (target.statusDetails || []).some(d => d.includes('弄臣免死已触发'));
        if (!alreadyTriggered && !isActorDisabledByPoisonOrDrunk(target)) {
          target.statusDetails = [...(target.statusDetails || []), '弄臣免死已触发'];
          logs.push(`🃏 ${target.id + 1}号 [弄臣] 免死一次`);
          break;
        }
      }
      // 3. Soldier (Demon immunity)
      if (source === 'demon' && target.role?.id === 'soldier' && !isActorDisabledByPoisonOrDrunk(target)) {
        logs.push(`🛡️ ${target.id + 1}号 [士兵] 免疫恶魔攻击`);
        break;
      }
      // 4. Protected Checks (Monk, Innkeeper, etc.)
      if (target.isProtected && target.protectedBy !== null) {
        const protector = nextSeats.find(s => s.id === target.protectedBy);
        if (protector) {
          const pid = protector.role?.id;
          if (pid === 'monk' && source === 'demon') {
            logs.push(`🛡️ ${target.id + 1}号 被僧侣保护`);
            break;
          }
          if (pid === 'innkeeper' && source !== 'execution') {
            logs.push(`🛡️ ${target.id + 1}号 被旅店老板保护`);
            break;
          }
        }
      }
      // 5. Tea Lady
      if (killerRoleId !== 'assassin' && hasTeaLadyProtection(target, nextSeats)) {
        logs.push(`🛡️ ${target.id + 1}号 被茶艺师保护`);
        break;
      }

      // --- Apply Death ---
      // Zombuul Logic
      if (target.role?.id === 'zombuul') {
        const zombuulLives = target.zombuulLives ?? 1;
        const isTrulyDead = target.isZombuulTrulyDead;
        const isFirstDeath = !target.isFirstDeathForZombuul;

        if (isFirstDeath && zombuulLives > 0 && !isTrulyDead) {
          target.isDead = false; // Remains "Alive" physically
          target.isFirstDeathForZombuul = true;
          target.zombuulLives = zombuulLives - 1;
          target.statusDetails = [...(target.statusDetails || []), '僵怖假死'];
          logs.push(`${target.id + 1}号(僵怖) 假死`);
        } else {
          target.isDead = true;
          target.isZombuulTrulyDead = true;
          target.zombuulLives = 0;
          logs.push(`${target.id + 1}号(僵怖) 真正死亡`);

          // Trigger death events for Zombuul true death
          handlePostDeathTriggers(target, nextSeats, logs, action.source || 'unknown');
        }
      } else {
        target.isDead = true;
        logs.push(`${target.id + 1}号 死亡`);

        // Trigger death events
        handlePostDeathTriggers(target, nextSeats, logs, action.source || 'unknown');
      }

      // --- Side Effects (Hint for Modal) ---
      if (target.role?.id === 'barber_mr') {
        nextActionHint = 'BARBER_SWAP_NEEDED';
        logs.push('理发师死亡，触发交换');
      }

      break;
    }
    case 'EXECUTE_PLAYER': {
      const target = nextSeats.find(s => s.id === action.targetId);
      if (!target) break;

      // 1. Tea Lady
      if (hasTeaLadyProtection(target, nextSeats)) {
        logs.push(`🛡️ ${target.id + 1}号 被茶艺师保护，免于处决`);
        nextActionHint = 'EXECUTION_BLOCKED';
        break;
      }

      // 2. Pacifist
      const activePacifist = nextSeats.find(s =>
        s.role?.id === 'pacifist' &&
        !s.isDead &&
        !isActorDisabledByPoisonOrDrunk(s)
      );
      if (activePacifist && isGoodAlignment(target)) {
        // Pure logic heuristic: Use context flag
        if (context.pacifistSaves) {
          logs.push(`☮️ ${target.id + 1}号 被和平主义者救下`);
          nextActionHint = 'PACIFIST_SAVED';
          break;
        }
      }

      // 3. Generic Execution Proof
      if (hasExecutionProof(target)) {
        logs.push(`🛡️ ${target.id + 1}号 免于处决`);
        nextActionHint = 'EXECUTION_BLOCKED';
        break;
      }

      // Execute
      target.isDead = true;
      target.isSentenced = true;
      logs.push(`${target.id + 1}号 被处决`);

      // Trigger death events
      handlePostDeathTriggers(target, nextSeats, logs, 'execution');
      break;
    }
    case 'CHECK_GAME_OVER': {
      // Logic handled below
      break;
    }
    case 'REVIVE_PLAYER': {
      const target = nextSeats.find(s => s.id === action.targetId);
      if (!target) break;

      target.isDead = false;
      target.isEvilConverted = false;
      // Keep Zombuul state if needed, but usually revive resets it? 
      // Let's assume standard revive resets logic
      target.isZombuulTrulyDead = false;
      target.zombuulLives = 1; // Reset or keep? Usually completely fresh.
      target.isDrunk = false;
      target.isPoisoned = (target.statusDetails || []).includes('永久中毒');

      logs.push(`${target.id + 1}号 复活`);
      break;
    }
    case 'IMP_STAR_PASS': {
      const oldImp = nextSeats.find(s => s.id === action.oldImpId);
      const newImp = nextSeats.find(s => s.id === action.newImpId);

      if (!oldImp) break;

      // 1. Kill old Imp
      oldImp.isDead = true;
      logs.push(`${oldImp.id + 1}号(小恶魔) 选择自杀`);

      // 2. Pass to new Imp
      if (newImp) {
        const impRole = roles.find(r => r.id === 'imp');
        if (impRole) {
          newImp.role = impRole;
          newImp.displayRole = impRole; // Update display too? Usually UI handles display.
          newImp.isDemonSuccessor = true;
          newImp.statusDetails = [...(newImp.statusDetails || []), '小恶魔传'];
          logs.push(`${oldImp.id + 1}号(小恶魔) 传位给 ${newImp.id + 1}号`);
        }
      }
      // Note: Wake Queue cleanup and DeadThisNight update must be handled by Controller side effects
      break;
    }
    case 'DECLARE_MAYOR_WIN': {
      winner = 'Good';
      winReason = '市长身份获胜';
      break;
    }
  }

  // 3. Universal Game Over Check
  let lastActionType: 'execution' | 'night_death' | 'check_phase' = 'check_phase';
  let executedId: number | null = null;

  if (action.type === 'EXECUTE_PLAYER') {
    lastActionType = 'execution';
    executedId = action.targetId;
  } else if (action.type === 'KILL_PLAYER' && action.source === 'demon') {
    lastActionType = 'night_death';
  } else if (action.type === 'CHECK_GAME_OVER' && action.lastAction) {
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
    nextActionHint
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
    throw new Error(`座位数量(${seats.length})与角色数量(${roleIds.length})不匹配`);
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
 * (基于角色类型或转正状态)
 */
export function isPlayerEvil(seat: Seat): boolean {
  if (seat.isEvilConverted) return true;
  if (seat.isGoodConverted) return false;
  if (!seat.role) return false;
  // 默认规则：恶魔(demon)和爪牙(minion)是邪恶的
  return seat.role.type === 'demon' || seat.role.type === 'minion';
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
  lastAction: 'execution' | 'night_death' | 'check_phase',
  executedPlayerId: number | null = null,
  options: {
    isMastermindActive?: boolean;
    damselGuessed?: boolean;
    klutzGuessedEvil?: boolean;
    isVortoxWorld?: boolean;
    evilTwinPair?: { goodId: number; evilId: number } | null;
  } = {}
): GameEndResult {
  const { isMastermindActive = false, damselGuessed = false, klutzGuessedEvil = false, isVortoxWorld = false, evilTwinPair } = options;

  // 0. 特殊即时胜利/失败触发 (未在金字塔中明确列出，但属于即时结算，置于顶层)
  if (damselGuessed) {
    return { isGameOver: true, winner: 'Evil', reason: '爪牙猜中落难少女' };
  }
  if (klutzGuessedEvil) {
    return { isGameOver: true, winner: 'Evil', reason: '呆瓜误判' };
  }

  const aliveSeats = seats.filter(s => !s.isDead);
  const aliveCount = aliveSeats.length;

  // --- 1. 【第一优先级】检查恶魔是否全灭 (包含红唇女郎、僵尸等继承状态) ---
  const livingDemons = aliveSeats.filter(s => s.role?.type === 'demon');
  // 统计“死而未僵”的恶魔 (僵尸 Zombuul 特判)
  const zombuulActive = seats.filter(s =>
    s.role?.id === 'zombuul' && s.isDead && !s.isZombuulTrulyDead
  );
  const totalEffectiveDemons = livingDemons.length + zombuulActive.length;

  // 1.1 恶魔全灭 -> 好人获胜 (除非受阻)
  if (totalEffectiveDemons === 0) {
    // 特例：主谋 (Mastermind) 触发用于在处决导致恶魔死亡时延续游戏
    if (isMastermindActive && lastAction === 'execution') {
      const demonDied = seats.find(s => s.id === executedPlayerId)?.role?.type === 'demon';
      if (demonDied) {
        return { isGameOver: false, winner: null, reason: '主谋使游戏在恶魔死后继续' };
      }
    }

    // 检查邪恶双子阻挡
    let goodWinBlockedByTwin = false;
    if (evilTwinPair) {
      const evilTwinIndex = seats.findIndex(s => s.id === evilTwinPair.evilId);
      const goodTwinIndex = seats.findIndex(s => s.id === evilTwinPair.goodId);
      if (evilTwinIndex !== -1 && goodTwinIndex !== -1) {
        const evilTwinSeat = seats[evilTwinIndex];
        const goodTwinSeat = seats[goodTwinIndex];
        // 只要有一对双子活着且健康，好人就无法获胜
        if (!evilTwinSeat.isDead && !goodTwinSeat.isDead && !evilTwinSeat.isPoisoned && !evilTwinSeat.isDrunk) {
          goodWinBlockedByTwin = true;
        }
      }
    }

    if (!goodWinBlockedByTwin) {
      return { isGameOver: true, winner: 'Good', reason: '恶魔已被彻底消灭' };
    }
    // 如果被双子阻止，游戏继续（除非触发下面的邪恶胜利）
  }

  // --- 2. 【第二优先级】特殊角色导致邪恶获胜 (圣徒、地精) ---
  if (lastAction === 'execution' && executedPlayerId !== null) {
    const executedSeat = seats.find(s => s.id === executedPlayerId);
    if (executedSeat && !executedSeat.isPoisoned && !executedSeat.isDrunk) {
      if (executedSeat.role?.id === 'saint') return { isGameOver: true, winner: 'Evil', reason: '圣徒被处决' };
      if (executedSeat.role?.id === 'goblin') return { isGameOver: true, winner: 'Evil', reason: '地精被处决' };
    }
  }

  // --- 3. 【第三优先级】存活人数判定 ---
  // 只有在恶魔还活着的情况下（或者恶魔死了但好人被双子阻止赢），人数不足才判邪恶赢
  if (aliveCount <= 2) {
    return { isGameOver: true, winner: 'Evil', reason: '存活人数仅剩 2 人且恶魔存活' };
  }

  // --- 4. 【额外层】市长/涡流 ---
  if (lastAction === 'execution' && executedPlayerId === null) {
    // 涡流 (Vortox): 平安日直接邪恶获胜
    if (isVortoxWorld) {
      return { isGameOver: true, winner: 'Evil', reason: '涡流：今日无人被处决' };
    }
    // 主谋 (Mastermind): 额外一天若无人被处决 -> 邪恶获胜
    if (isMastermindActive) {
      return { isGameOver: true, winner: 'Evil', reason: '主谋翻盘：额外一天无人处决' };
    }
    // 市长 (Mayor): 仅剩3人且平安日 -> 好人获胜
    if (aliveCount === 3) {
      const mayor = aliveSeats.find(s => s.role?.id === 'mayor' && !s.isPoisoned && !s.isDrunk);
      if (mayor) {
        return { isGameOver: true, winner: 'Good', reason: '市长触发和平获胜条件' };
      }
    }
  }

  return { isGameOver: false, winner: null, reason: null };
}

// ======================================================================
//  Death Triggers (Grandmother / Scarlet Woman)
// ======================================================================

function handlePostDeathTriggers(target: Seat, seats: Seat[], logs: string[], deathSource: string = 'unknown') {
  // 1. 祖母 (Grandmother) 孙子连带死亡
  if (deathSource === 'demon') {
    // 找出所有活着的祖母，检查被杀死的玩家是否是她们的孙子
    seats.forEach((grandmaSeat) => {
      if (grandmaSeat.role?.id === 'grandmother' && !grandmaSeat.isDead && grandmaSeat.grandchildId === target.id) {
        // Assuming onKillPlayer and onAddLog are defined elsewhere or need to be adapted
        // For this context, we'll simulate the effect on the seats array and logs
        const killedGrandma = seats.find(s => s.id === grandmaSeat.id);
        if (killedGrandma) {
          killedGrandma.isDead = true;
          logs.push(`祖母技能：孙子 ${target.id + 1} 号位被恶魔杀害，${grandmaSeat.id + 1}号(老祖母) 👵 殉情`);
          // Recursively trigger for Grandmother death (safe to prevent infinite loop by source check)
          handlePostDeathTriggers(killedGrandma, seats, logs, 'grandmother_death');
        }
      }
    });
  }

  // 2. Scarlet Woman Trigger (scarlet_woman)
  // 规则：如果恶魔死亡，且场上存活玩家（包括红唇）>= 5人，红唇女郎成为恶魔。
  if (target.role?.type === 'demon' && !target.isDemonSuccessor) {
    // 计算存活玩家（此时 target 已被标记为 dead，所以 aliveCount 是幸存者人数）
    const aliveCount = seats.filter(s => !s.isDead && s.role?.type !== 'traveler').length;

    if (aliveCount >= 5) {
      const sw = seats.find(s => s.role?.id === 'scarlet_woman' && !s.isDead && !s.isDemonSuccessor);
      if (sw) {
        sw.isDemonSuccessor = true;
        // 继承恶魔角色（通常是 Imp）
        sw.role = target.role;
        sw.statusDetails = [...(sw.statusDetails || []), "红唇继任"];
        sw.displayRole = target.role; // UI Update
        logs.push(`💋 ${sw.id + 1}号(红唇女郎) 😈 恶魔死亡，场上存活≥5人，继任成为新的恶魔！`);
      }
    }
  }

  // 3. Moonchild Trigger (moonchild)
  // 如果月之子死亡，标记触发陪葬状态（实际死亡在夜晚执行或立即执行取决于逻辑，此处标记日志）
  if (target.role?.id === 'moonchild') {
    logs.push(`🌙 ${target.id + 1}号(月之子) 死亡，请让其公开选择一名存活玩家诅咒`);
  }
}

"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { roles, Role, Seat, StatusEffect, LogEntry, GamePhase, WinResult, groupedRoles, typeLabels, typeColors, typeBgColors, RoleType, scripts, Script } from "./data";

// --- 辅助类型 ---
interface NightHintState { 
  isPoisoned: boolean; 
  reason?: string; 
  guide: string; 
  speak: string; 
  action?: string;
  fakeInspectionResult?: string;
}

interface NightInfoResult {
  seat: Seat;
  effectiveRole: Role;
  isPoisoned: boolean;
  reason?: string;
  guide: string;
  speak: string;
  action: string;
}

// 对局记录数据结构
interface GameRecord {
  id: string; // 唯一ID
  scriptName: string; // 剧本名称
  startTime: string; // 游戏开始时间
  endTime: string; // 游戏结束时间
  duration: number; // 游戏总时长（秒）
  winResult: WinResult; // 游戏结果
  winReason: string | null; // 胜利原因
  seats: Seat[]; // 座位信息（游戏结束时的状态）
  gameLogs: LogEntry[]; // 游戏日志
}

const phaseNames: Record<string, string> = {
  setup: "准备阶段", 
  check: "核对身份", 
  firstNight: "首夜", 
  day: "白天", 
  dusk: "黄昏/处决", 
  night: "夜晚", 
  dawnReport: "天亮结算", 
  gameOver: "游戏结束"
};

// --- 工具函数 ---
const formatTimer = (s: number) => {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
};

const getSeatPosition = (index: number, total: number = 15) => {
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
  // 增大半径，确保座位之间不重叠，不遮挡序号和状态标签
  // 座位图标 w-24 h-24 (96px)，加上左上角序号标签和右上角状态标签的偏移
  // 需要更大的半径来避免重叠
  const radius = 55; // 增大半径，增加座位间距，避免遮挡
  const x = 50 + radius * Math.cos(angle);
  const y = 50 + radius * Math.sin(angle);
  return { x: x.toFixed(2), y: y.toFixed(2) };
};

const getRandom = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// 获取玩家的注册阵营（用于查验类技能）
// 间谍：虽然是爪牙，但可以被注册为"Good"（善良）
// 隐士：虽然是外来者，但可以被注册为"Evil"（邪恶）
// viewingRole: 执行查验的角色，用于判断是否需要应用注册判定
export const getRegisteredAlignment = (
  targetPlayer: Seat, 
  viewingRole?: Role | null,
  spyDisguiseMode?: 'off' | 'default' | 'on',
  spyDisguiseProbability?: number
): 'Good' | 'Evil' => {
  if (!targetPlayer.role) return 'Good';
  
  // 真实阵营判断
  const isActuallyEvil = targetPlayer.role.type === 'demon' || 
                         targetPlayer.role.type === 'minion' || 
                         targetPlayer.isDemonSuccessor;
  const isActuallyGood = !isActuallyEvil;
  
  // 间谍的注册判定：允许注册为"Good"
  if (targetPlayer.role.id === 'spy') {
    // 如果查看者不是查验类角色，或者间谍伪装模式关闭，返回真实阵营（邪恶）
    if (!viewingRole || spyDisguiseMode === 'off') {
      return 'Evil';
    }
    // 开启伪装模式：根据概率决定是否注册为善良
    if (spyDisguiseMode === 'on') {
      const probability = spyDisguiseProbability ?? 0.8;
      return Math.random() < probability ? 'Good' : 'Evil';
    }
    // 默认模式：使用默认概率80%注册为善良
    return Math.random() < 0.8 ? 'Good' : 'Evil';
  }
  
  // 隐士的注册判定：允许注册为"Evil"
  if (targetPlayer.role.id === 'recluse') {
    // 隐士可能在查验中被注册为邪恶或恶魔
    // 使用概率判断：大约30%概率注册为邪恶（与原有的isEvil中隐士判断一致）
    return Math.random() < 0.3 ? 'Evil' : 'Good';
  }
  
  // 默认返回真实阵营
  return isActuallyEvil ? 'Evil' : 'Good';
};

// 判断玩家是否被注册为恶魔（用于占卜师等角色）
// 隐士可能被注册为恶魔，间谍不相关（占卜师检查的是恶魔，不是邪恶）
export const isRegisteredAsDemon = (
  targetPlayer: Seat
): boolean => {
  if (!targetPlayer.role) return false;
  
  // 真实恶魔
  if (targetPlayer.role.type === 'demon' || targetPlayer.isDemonSuccessor) {
    return true;
  }
  
  // 隐士可能被注册为恶魔（类似于被注册为邪恶）
  if (targetPlayer.role.id === 'recluse') {
    // 隐士可能在查验中被注册为恶魔
    // 使用概率判断：大约30%概率注册为恶魔
    return Math.random() < 0.3;
  }
  
  return false;
};

// 判断玩家是否被注册为爪牙（用于调查员等角色）
// 间谍虽然是爪牙，但可能被注册为"Good"（善良），此时不应被调查员看到
// viewingRole: 执行查验的角色，用于判断是否需要应用注册判定
export const isRegisteredAsMinion = (
  targetPlayer: Seat,
  viewingRole?: Role | null,
  spyDisguiseMode?: 'off' | 'default' | 'on',
  spyDisguiseProbability?: number
): boolean => {
  if (!targetPlayer.role) return false;
  
  // 真实爪牙
  if (targetPlayer.role.type === 'minion') {
    // 如果是间谍，需要检查注册判定
    if (targetPlayer.role.id === 'spy') {
      // 如果查看者不是查验类角色，或者间谍伪装模式关闭，返回真实类型（是爪牙）
      if (!viewingRole || spyDisguiseMode === 'off') {
        return true;
      }
      // 如果间谍被注册为善良，则不应被注册为爪牙
      const registeredAlignment = getRegisteredAlignment(
        targetPlayer,
        viewingRole,
        spyDisguiseMode,
        spyDisguiseProbability
      );
      // 如果被注册为善良，则不被注册为爪牙；如果被注册为邪恶，则被注册为爪牙
      return registeredAlignment === 'Evil';
    }
    // 其他爪牙总是被注册为爪牙
    return true;
  }
  
  // 隐士可能被注册为爪牙（如果被注册为邪恶，可能在某些查验中被视为爪牙）
  // 但根据规则，调查员检查的是"爪牙"，隐士通常不会被注册为爪牙类型
  // 这里保持原逻辑：隐士不会被注册为爪牙类型
  
  return false;
};

// 统一的身份注册判定：返回"此刻在查看者眼中"的阵营/类型
// 包含隐士/间谍的干扰效果，并在一次调用内保持一致的随机结果
type RegistrationResult = {
  alignment: 'Good' | 'Evil';
  roleType: RoleType | null;
  registersAsDemon: boolean;
  registersAsMinion: boolean;
};

const getRegistration = (
  targetPlayer: Seat,
  viewingRole?: Role | null,
  spyDisguiseMode?: 'off' | 'default' | 'on',
  spyDisguiseProbability?: number
): RegistrationResult => {
  const role = targetPlayer.role;
  if (!role) {
    return { alignment: 'Good', roleType: null, registersAsDemon: false, registersAsMinion: false };
  }

  // 真实基准
  let registeredRoleType: RoleType | null = targetPlayer.isDemonSuccessor ? 'demon' : role.type;
  let registeredAlignment: 'Good' | 'Evil' =
    registeredRoleType === 'demon' || registeredRoleType === 'minion' ? 'Evil' : 'Good';

  // 间谍：可能注册为善良镇民/外来者
  if (role.id === 'spy') {
    if (viewingRole && spyDisguiseMode !== 'off') {
      const probability = spyDisguiseMode === 'on' ? (spyDisguiseProbability ?? 0.8) : 0.8;
      const looksGood = Math.random() < probability;
      if (looksGood) {
        registeredAlignment = 'Good';
        registeredRoleType = Math.random() < 0.5 ? 'townsfolk' : 'outsider';
      } else {
        registeredAlignment = 'Evil';
        registeredRoleType = 'minion';
      }
    } else {
      registeredAlignment = 'Evil';
      registeredRoleType = 'minion';
    }
  }

  // 隐士：可能注册为爪牙或恶魔
  if (role.id === 'recluse') {
    const roll = Math.random();
    if (roll < 0.33) {
      registeredAlignment = 'Evil';
      registeredRoleType = 'minion';
    } else if (roll < 0.66) {
      registeredAlignment = 'Evil';
      registeredRoleType = 'demon';
    } else {
      registeredAlignment = 'Good';
      registeredRoleType = 'outsider';
    }
  }

  return {
    alignment: registeredAlignment,
    roleType: registeredRoleType,
    registersAsDemon: registeredRoleType === 'demon',
    registersAsMinion: registeredRoleType === 'minion',
  };
};

const getSeatRoleId = (seat?: Seat | null): string | null => {
  if (!seat) return null;
  const role = seat.role?.id === 'drunk' ? seat.charadeRole : seat.role;
  return role ? role.id : null;
};

// 判断玩家是否为邪恶阵营（真实阵营）
const isEvil = (seat: Seat): boolean => {
  if (!seat.role) return false;
  return seat.role.type === 'demon' || 
         seat.role.type === 'minion' || 
         seat.isDemonSuccessor ||
         (seat.role.id === 'recluse' && Math.random() < 0.3);
};

// 判断玩家在胜负条件计算中是否属于邪恶阵营（仅计算爪牙和恶魔，隐士永远属于善良阵营）
const isEvilForWinCondition = (seat: Seat): boolean => {
  if (!seat.role) return false;
  return seat.role.type === 'demon' || 
         seat.role.type === 'minion' || 
         seat.isDemonSuccessor;
};

const isGoodAlignment = (seat: Seat): boolean => {
  if (!seat.role) return false;
  const roleType = seat.role.type;
  return roleType !== 'demon' && roleType !== 'minion' && !seat.isDemonSuccessor;
};

const getAliveNeighbors = (allSeats: Seat[], targetId: number): Seat[] => {
  const originIndex = allSeats.findIndex((s) => s.id === targetId);
  if (originIndex === -1 || allSeats.length <= 1) return [];
  const total = allSeats.length;
  const neighbors: Seat[] = [];

  for (let step = 1; step < total && neighbors.length < 2; step++) {
    const left = allSeats[(originIndex - step + total) % total];
    if (!left.isDead && left.id !== targetId) {
      neighbors.push(left);
    }
    if (neighbors.length >= 2) break;

    const right = allSeats[(originIndex + step) % total];
    if (!right.isDead && right.id !== targetId && !neighbors.some(n => n.id === right.id)) {
      neighbors.push(right);
    }
  }

  return neighbors;
};

const hasTeaLadyProtection = (targetSeat: Seat | undefined, allSeats: Seat[]): boolean => {
  if (!targetSeat) return false;
  const neighbors = getAliveNeighbors(allSeats, targetSeat.id);
  return neighbors.some(
    (neighbor) =>
      getSeatRoleId(neighbor) === 'tea_lady' &&
      isGoodAlignment(neighbor) &&
      isGoodAlignment(targetSeat)
  );
};

const hasExecutionProof = (seat?: Seat | null): boolean => {
  if (!seat) return false;
  return (seat.statuses || []).some((status) => status.effect === 'ExecutionProof');
};

// 判断是否应该显示假信息（根据中毒/酒鬼状态和概率）
// 返回true表示应该显示假信息，false表示显示真信息
const shouldShowFakeInfo = (
  targetSeat: Seat,
  drunkFirstInfoMap: Map<number, boolean>
): { showFake: boolean; isFirstTime: boolean } => {
  const isDrunk = targetSeat.isDrunk || targetSeat.role?.id === "drunk";
  const isPoisoned = targetSeat.isPoisoned;
  
  if (isDrunk && !isPoisoned) {
    // 酒鬼状态：首次一定假，之后90%假，10%真
    const isFirstTime = !drunkFirstInfoMap.has(targetSeat.id);
    if (isFirstTime) {
      drunkFirstInfoMap.set(targetSeat.id, true);
      return { showFake: true, isFirstTime: true };
    }
    // 90%概率假，10%概率真
    return { showFake: Math.random() < 0.9, isFirstTime: false };
  } else if (isPoisoned && !isDrunk) {
    // 中毒状态：95%假，5%真
    return { showFake: Math.random() < 0.95, isFirstTime: false };
  } else if (isPoisoned && isDrunk) {
    // 同时中毒和酒鬼：优先按中毒处理（95%假，5%真）
    return { showFake: Math.random() < 0.95, isFirstTime: false };
  }
  
  // 健康状态：显示真信息
  return { showFake: false, isFirstTime: false };
};

// 生成误导性错误信息（用于中毒/酒鬼状态）
// 根据真实结果生成合理的错误信息，而不是简单的随机值
const getMisinformation = {
  // 占卜师：根据真实结果生成误导性假信息
  // 如果真实是"否"（查的是好人），有概率返回"是"（误导为恶魔）
  // 如果真实是"是"（查的是恶魔），也可能返回"否"（误导为好人）
  fortuneTeller: (realResult: boolean): string => {
    if (realResult) {
      // 真实结果是"是"（有恶魔），中毒时70%概率返回"否"（误导），30%概率返回"是"（正确但可能是巧合）
      return Math.random() < 0.7 ? "❌ 否" : "✅ 是";
    } else {
      // 真实结果是"否"（无恶魔，查的是好人），中毒时80%概率返回"是"（误导为有恶魔），20%概率返回"否"（正确但可能是巧合）
      return Math.random() < 0.8 ? "✅ 是" : "❌ 否";
    }
  },
  
  // 共情者：根据真实数字生成错误的数字
  // 确保返回一个合理的错误值（0、1或2），而不是返回0或null
  empath: (realCount: number): number => {
    // 真实数字是0、1或2，生成一个不同的错误数字
    const possibleValues = [0, 1, 2].filter(v => v !== realCount);
    if (possibleValues.length === 0) {
      // 理论上不会发生，但作为保险
      return realCount === 0 ? 1 : 0;
    }
    // 从可能的错误值中随机选择一个
    return getRandom(possibleValues);
  }
};

// --- 核心计算逻辑 ---
const calculateNightInfo = (
  selectedScript: Script | null,
  seats: Seat[], 
  currentSeatId: number, 
  gamePhase: GamePhase,
  lastDuskExecution: number | null,
  fakeInspectionResult?: string,
  drunkFirstInfoMap?: Map<number, boolean>,
  isEvilWithJudgmentFn?: (seat: Seat) => boolean,
  poppyGrowerDead?: boolean,
  gameLogs?: LogEntry[],
  spyDisguiseMode?: 'off' | 'default' | 'on',
  spyDisguiseProbability?: number,
  deadThisNight: number[] = []
): NightInfoResult | null => {
  // 使用传入的判定函数，如果没有则使用默认的isEvil
  const checkEvil = isEvilWithJudgmentFn || isEvil;
  
  // 创建用于厨师/共情者查验的判断函数，考虑间谍和隐士的注册判定
  const checkEvilForChefEmpath = (seat: Seat): boolean => {
    // 使用统一注册判定，传入当前查看的角色（厨师或共情者）
    const registration = getRegistration(
      seat,
      effectiveRole,
      spyDisguiseMode,
      spyDisguiseProbability
    );
    return registration.alignment === 'Evil';
  };
  // 查找最近的存活邻居（跳过所有死亡玩家和自己）
  const findNearestAliveNeighbor = (
    originId: number,
    direction: 1 | -1
  ): Seat | null => {
    const originIndex = seats.findIndex((s) => s.id === originId);
    if (originIndex === -1 || seats.length <= 1) return null;
    for (let step = 1; step < seats.length; step++) {
      const seat = seats[(originIndex + direction * step + seats.length) % seats.length];
      if (!seat.isDead && seat.id !== originId) {
        return seat;
      }
    }
    return null;
  };
  const targetSeat = seats.find(s => s.id === currentSeatId);
  if (!targetSeat || !targetSeat.role) return null;

  const effectiveRole = targetSeat.role.id === "drunk" ? targetSeat.charadeRole : targetSeat.role;
  if (!effectiveRole) return null;
  const diedTonight = deadThisNight.includes(targetSeat.id);

  // 检查是否中毒：包括普通中毒、永久中毒（舞蛇人制造）、亡骨魔中毒、酒鬼状态
  const hasPermanentPoison = targetSeat.statusDetails?.includes('永久中毒') || false;
  const hasVigormortisPoison = targetSeat.statusDetails?.includes('亡骨魔中毒') || false;
  const isPoisoned = targetSeat.isPoisoned || hasPermanentPoison || hasVigormortisPoison || targetSeat.isDrunk || targetSeat.role.id === "drunk";
  const reason = hasPermanentPoison ? "永久中毒" : hasVigormortisPoison ? "亡骨魔中毒" : targetSeat.isPoisoned ? "中毒" : targetSeat.isDrunk ? "酒鬼" : "";
  
  // 判断是否应该显示假信息
  const fakeInfoCheck = drunkFirstInfoMap 
    ? shouldShowFakeInfo(targetSeat, drunkFirstInfoMap)
    : { showFake: isPoisoned, isFirstTime: false };
  const shouldShowFake = fakeInfoCheck.showFake;
  
  let guide = "", speak = "", action = "";

  if (effectiveRole.id === 'imp') {
    if (gamePhase === 'firstNight') {
      // 检查罂粟种植者状态：如果罂粟种植者在场且存活，恶魔不知道爪牙是谁
      const poppyGrower = seats.find(s => s.role?.id === 'poppy_grower');
      const shouldHideMinions = poppyGrower && !poppyGrower.isDead && poppyGrowerDead === false;
      
      if (shouldHideMinions) {
        guide = `🌺 罂粟种植者在场，你不知道你的爪牙是谁。`;
        speak = `"罂粟种植者在场，你不知道你的爪牙是谁。"`;
        action = "无信息";
      } else {
        const minions = seats.filter(s => s.role?.type === 'minion').map(s => `${s.id+1}号`);
        guide = `👿 爪牙列表：${minions.length > 0 ? minions.join(', ') : '无'}。`;
        // 8. 台词融入指引内容
        speak = `"${minions.length > 0 ? `你的爪牙是 ${minions.join('、')}。` : '场上没有爪牙。'}请确认你的爪牙。"`;
        action = "展示爪牙";
      }
    } else {
      guide = "👉 让小恶魔选人杀害。";
      // 8. 台词融入指引内容
      speak = '"请选择一名玩家杀害。你可以选择任意一名活着的玩家，但不能选择自己。"';
      action = "杀害";
    }
  } else if (effectiveRole.id === 'poisoner') {
    guide = "🧪 选择一名玩家下毒。"; 
    // 8. 台词融入指引内容
    speak = '"请选择一名玩家下毒。被你下毒的玩家今晚会看到错误的信息。"'; 
    action = "投毒";
  } else if (effectiveRole.id === 'pukka') {
    if (gamePhase === 'firstNight') {
      // 检查罂粟种植者状态：如果罂粟种植者在场且存活，恶魔不知道爪牙是谁
      const poppyGrower = seats.find(s => s.role?.id === 'poppy_grower');
      const shouldHideMinions = poppyGrower && !poppyGrower.isDead && poppyGrowerDead === false;
      
      if (shouldHideMinions) {
        guide = `🌺 罂粟种植者在场，你不知道你的爪牙是谁。`;
        speak = `"罂粟种植者在场，你不知道你的爪牙是谁。"`;
        action = "无信息";
      } else {
        const minions = seats.filter(s => s.role?.type === 'minion' && s.id !== currentSeatId).map(s => `${s.id+1}号`);
        guide = `👿 爪牙列表：${minions.length > 0 ? minions.join(', ') : '无'}。`;
        speak = `"${minions.length > 0 ? `你的爪牙是 ${minions.join('、')}。` : '场上没有爪牙。'}请确认你的爪牙。"`;
        action = "展示爪牙";
      }
    } else {
      guide = "🧪 选择一名玩家：他中毒。上个因你的能力中毒的玩家会死亡并恢复健康。"; 
      speak = '"请选择一名玩家。他中毒。上个因你的能力中毒的玩家会死亡并恢复健康。"'; 
      action = "投毒";
    }
  } else if (effectiveRole.id === 'monk') {
    if (isPoisoned) {
      guide = "⚠️ [异常] 中毒/醉酒状态下无法保护玩家，但可以正常选择。"; 
      // 8. 台词融入指引内容
      speak = '"请选择一名玩家。但由于你处于中毒/醉酒状态，无法提供保护效果。"'; 
    } else {
      guide = "🛡️ 选择一名玩家保护。"; 
      // 8. 台词融入指引内容
      speak = '"请选择一名玩家保护。被你保护的玩家今晚不会被恶魔杀害，但不能保护自己。"'; 
    }
    action = "保护";
  } else if (effectiveRole.id === 'fortune_teller') {
    guide = "🔮 查验2人。若有恶魔/红罗刹->是。"; 
    // 8. 台词融入指引内容
    speak = '"请选择两名玩家查验。如果其中一人是恶魔或红罗刹，我会告诉你"是"，否则告诉你"否"。'; 
    action = "查验";
  } else if (effectiveRole.id === 'butler') {
    guide = "选择主人。"; 
    // 9. 管家手势交流
    speak = '"请通过手势选择你的主人。指向你选择的玩家，我会确认。"'; 
    action = "标记";
  } else if (effectiveRole.id === 'empath') {
    const leftNeighbor = findNearestAliveNeighbor(currentSeatId, -1);
    const rightNeighbor = findNearestAliveNeighbor(currentSeatId, 1);
    // 邻居去重，避免在极端少人时左右指向同一人
    const neighbors = [leftNeighbor, rightNeighbor].filter(
      (s, idx, arr): s is Seat => !!s && arr.findIndex((t) => t?.id === s.id) === idx
    );
    if (neighbors.length > 0) {
      let c = 0;
      neighbors.forEach((neighbor) => {
        if (checkEvilForChefEmpath(neighbor)) c++;
      });
      // 使用 getMisinformation.empath 生成误导性错误数字
      const fakeC = getMisinformation.empath(c);
      if (shouldShowFake) {
        guide = `⚠️ [异常] 真实:${c}。请报伪造数据: ${fakeC} (比划${fakeC})`;
        // 8. 台词融入指引内容
        speak = `"你的左右邻居中有 ${fakeC} 名邪恶玩家。"（向他比划数字 ${fakeC}）`;
      } else {
        guide = `👂 真实信息: ${c} (比划${c})`;
        // 8. 台词融入指引内容
        speak = `"你的左右邻居中有 ${c} 名邪恶玩家。"（向他比划数字 ${c}）`;
      }
      action = "告知";
    } else {
      guide = "⚠️ 周围没有存活邻居，信息无法生成，示0或手动说明。";
      speak = '"你没有存活的邻居可供检测，请示意0或由说书人说明。"' ;
      action = "展示";
    }
  } else if (effectiveRole.id === 'washerwoman' && gamePhase==='firstNight') {
    try {
      // 洗衣妇：首夜得知一名村民的具体身份，并被告知该村民在X号或Y号（其中一个是真实的，另一个是干扰项）
      const townsfolkSeats = seats.filter(s => s.role?.type === 'townsfolk' && s.role && s.id !== currentSeatId);
      
      if(townsfolkSeats.length > 0 && seats.length >= 2) {
        // 正常时：从场上实际存在的村民中随机选择一个
        const validTownsfolk = townsfolkSeats.filter(s => s.role !== null);
        if (validTownsfolk.length === 0) {
          guide = "⚠️ 未找到可用的村民信息，改为手动指定或示0。"; 
          speak = '"场上没有可用的村民信息，请你手动指定两个座位或比划0。"';
          action = "展示";
        } else {
          const realTownsfolk = getRandom(validTownsfolk);
          const realRole = realTownsfolk.role!; // 此时确保不为null
          
          // 真实村民的座位号
          const realSeatNum = realTownsfolk.id + 1;
          
          // 选择干扰项座位（不能是自己，不能是真实村民的座位）
          const availableSeats = seats.filter(s => s.id !== currentSeatId && s.id !== realTownsfolk.id);
          const decoySeat = availableSeats.length > 0 ? getRandom(availableSeats) : realTownsfolk;
          const decoySeatNum = decoySeat.id + 1;
          
          // 随机决定真实座位和干扰项座位的显示顺序（符合游戏规则）
          const shouldSwap = Math.random() < 0.5;
          const seat1Num = shouldSwap ? decoySeatNum : realSeatNum;
          const seat2Num = shouldSwap ? realSeatNum : decoySeatNum;
          
          if (shouldShowFake) {
            // 中毒/酒鬼时：指引处先展示正确信息，然后生成错误的干扰信息
            // 确保错误信息一定为假：选择的角色和座位号必须不匹配
            
            // 1. 随机选择一个村民角色作为错误信息中的角色
            const otherTownsfolk = validTownsfolk.filter(s => s.id !== realTownsfolk.id);
            const wrongTownsfolk = otherTownsfolk.length > 0 ? getRandom(otherTownsfolk) : realTownsfolk;
            const wrongRole = wrongTownsfolk.role!;
            
            // 2. 选择两个座位号，确保这两个座位号上的角色都不是错误信息中的角色
            // 排除：自己、真实座位、干扰项座位，以及任何座位上是错误角色的座位
            const wrongSeats = seats.filter(s => 
              s.id !== currentSeatId && 
              s.id !== realTownsfolk.id && 
              s.id !== decoySeat.id &&
              s.role?.id !== wrongRole.id  // 确保座位上的角色不是错误角色
            );
            
            // 如果过滤后没有足够的座位，则从所有座位中选择（排除自己、真实座位、干扰项座位）
            const fallbackSeats = seats.filter(s => 
              s.id !== currentSeatId && 
              s.id !== realTownsfolk.id && 
              s.id !== decoySeat.id
            );
            
            const availableWrongSeats = wrongSeats.length >= 2 ? wrongSeats : fallbackSeats;
            
            // 随机打乱座位数组，确保随机性
            const shuffledSeats = [...availableWrongSeats].sort(() => Math.random() - 0.5);
            const wrongSeat1 = shuffledSeats[0] || decoySeat;
            const wrongSeat2 = shuffledSeats.length > 1 ? shuffledSeats[1] : wrongSeat1;
            
            // 最终验证：确保两个座位号上的角色都不是错误角色（如果相同则重新选择）
            let finalWrongSeat1 = wrongSeat1;
            let finalWrongSeat2 = wrongSeat2;
            
            // 如果第一个座位上的角色恰好是错误角色，尝试找另一个
            if (finalWrongSeat1.role?.id === wrongRole.id) {
              const alternative = shuffledSeats.find(s => s.id !== finalWrongSeat1.id && s.role?.id !== wrongRole.id);
              if (alternative) finalWrongSeat1 = alternative;
            }
            
            // 如果第二个座位上的角色恰好是错误角色，尝试找另一个
            if (finalWrongSeat2.role?.id === wrongRole.id) {
              const alternative = shuffledSeats.find(s => s.id !== finalWrongSeat2.id && s.id !== finalWrongSeat1.id && s.role?.id !== wrongRole.id);
              if (alternative) finalWrongSeat2 = alternative;
            }
            
            // 如果两个座位相同，尝试找不同的座位
            if (finalWrongSeat1.id === finalWrongSeat2.id) {
              const differentSeat = shuffledSeats.find(s => s.id !== finalWrongSeat1.id);
              if (differentSeat) finalWrongSeat2 = differentSeat;
            }
            
            const wrongSeat1Num = finalWrongSeat1.id + 1;
            const wrongSeat2Num = finalWrongSeat2.id + 1;
            
            // 指引：显示正确信息（给说书人看）+ 错误信息（给说书人看）
            guide = `⚠️ [异常] 真实信息：【${realRole.name}】在 ${seat1Num}号 或 ${seat2Num}号（真实：${realSeatNum}号）\n请展示错误信息：【${wrongRole.name}】在 ${wrongSeat1Num}号 或 ${wrongSeat2Num}号（${wrongSeat1Num}号是${finalWrongSeat1.role?.name || '无角色'}，${wrongSeat2Num}号是${finalWrongSeat2.role?.name || '无角色'}，均为假信息）`;
            // 台词：只显示错误信息（给玩家看）
            speak = `"你得知【${wrongRole.name}】在 ${wrongSeat1Num}号 或 ${wrongSeat2Num}号。"`;
          } else {
            // 正常时：展示真实信息（真实村民角色 + 真实座位和干扰项，顺序随机）
            guide = `👀 真实信息: 【${realRole.name}】在 ${seat1Num}号 或 ${seat2Num}号（真实：${realSeatNum}号）`;
            speak = `"你得知【${realRole.name}】在 ${seat1Num}号 或 ${seat2Num}号。"`;
          }
          action = "展示";
        }
      } else { 
        guide = "⚠️ 未能生成洗衣妇信息，请手动指定两个座位或示0。"; 
        speak = '"场上没有合适的村民信息，请你手动指定两个座位，或比划0示意无信息。"'; 
        action = "展示";
      }
    } catch (_error) {
      guide = "⚠️ 信息生成出现问题，请手动选择座位或示0。";
      speak = '"信息无法自动生成，请你手动指定要告知的两个座位，或比划0。"';
      action = "展示";
    }
  } else if (effectiveRole.id === 'librarian' && gamePhase==='firstNight') {
    try {
      // 图书管理员：首夜得知一名外来者的具体身份，并被告知该外来者在X号或Y号（其中一个是真实的，另一个是干扰项）
      const outsiderSeats = seats.filter(s => s.role?.type === 'outsider' && s.role && s.id !== currentSeatId);
      
      if(outsiderSeats.length > 0 && seats.length >= 2) {
        // 正常时：从场上实际存在的外来者中随机选择一个
        const validOutsiders = outsiderSeats.filter(s => s.role !== null);
        if (validOutsiders.length === 0) {
          guide = "⚠️ 未找到可用的外来者信息，改为手动指定或示0。"; 
          speak = '"场上没有可用的外来者信息，请你手动指定两个座位或比划0。"';
          action = "展示";
        } else {
          // 检查场上是否有酒鬼
          const hasDrunk = validOutsiders.some(s => s.role?.id === 'drunk');
          const nonDrunkOutsiders = validOutsiders.filter(s => s.role?.id !== 'drunk');
          
          // 随机选择外来者座位，保留酒鬼保护机制
          let realOutsider: Seat;
          if (hasDrunk && nonDrunkOutsiders.length > 0 && Math.random() < 0.7) {
            // 如果场上有酒鬼，70%概率选择非酒鬼的外来者（避免暴露酒鬼）
            realOutsider = getRandom(nonDrunkOutsiders);
          } else {
            // 30%概率或没有其他外来者时，从所有外来者中随机选择（包括酒鬼）
            realOutsider = getRandom(validOutsiders);
          }
          
          // 确保选择的角色确实在该座位上
          const realRole = realOutsider.role!; // 此时确保不为null，且该角色确实在 realOutsider 座位上
          const realSeatNum = realOutsider.id + 1; // 真实座位号
          
          // 选择干扰项座位（不能是自己，不能是真实外来者的座位）
          const availableSeats = seats.filter(s => s.id !== currentSeatId && s.id !== realOutsider.id);
          const decoySeat = availableSeats.length > 0 ? getRandom(availableSeats) : realOutsider;
          const decoySeatNum = decoySeat.id + 1;
          
          // 随机决定真实座位和干扰项座位的显示顺序（符合游戏规则）
          const shouldSwap = Math.random() < 0.5;
          const seat1Num = shouldSwap ? decoySeatNum : realSeatNum;
          const seat2Num = shouldSwap ? realSeatNum : decoySeatNum;
        
          if (shouldShowFake) {
            // 中毒/酒鬼时：指引处先展示正确信息，然后生成错误的干扰信息
            // 确保错误信息一定为假：选择的角色和座位号必须不匹配
            
            // 1. 获取所有可能的外来者角色列表（根据当前剧本过滤）
            const allOutsiderRoles = roles.filter(r => r.type === 'outsider' && r.id !== effectiveRole.id);
            const outsiderRoles = selectedScript 
              ? allOutsiderRoles.filter(r => 
                  !r.script || 
                  r.script === selectedScript.name ||
                  (selectedScript.id === 'trouble_brewing' && !r.script) ||
                  (selectedScript.id === 'bad_moon_rising' && (!r.script || r.script === '暗月初升')) ||
                  (selectedScript.id === 'sects_and_violets' && (!r.script || r.script === '梦陨春宵')) ||
                  (selectedScript.id === 'midnight_revelry' && (!r.script || r.script === '夜半狂欢'))
                )
              : allOutsiderRoles;
            
            // 2. 随机选择一个外来者角色作为错误信息中的角色
            const otherRoles = outsiderRoles.filter(r => r.id !== realRole.id);
            const wrongRole = otherRoles.length > 0 ? getRandom(otherRoles) : realRole;
            
            // 3. 选择两个座位号，确保这两个座位号上的角色都不是错误信息中的角色
            const wrongSeats = seats.filter(s => 
              s.id !== currentSeatId && 
              s.id !== realOutsider.id && 
              s.id !== decoySeat.id &&
              s.role?.id !== wrongRole.id
            );
            
            const fallbackSeats = seats.filter(s => 
              s.id !== currentSeatId && 
              s.id !== realOutsider.id && 
              s.id !== decoySeat.id
            );
            
            const availableWrongSeats = wrongSeats.length >= 2 ? wrongSeats : fallbackSeats;
            
            // 随机打乱座位数组，确保随机性
            const shuffledSeats = [...availableWrongSeats].sort(() => Math.random() - 0.5);
            let finalWrongSeat1 = shuffledSeats[0] || decoySeat;
            let finalWrongSeat2 = shuffledSeats.length > 1 ? shuffledSeats[1] : finalWrongSeat1;
            
            // 最终验证：确保两个座位号上的角色都不是错误角色
            if (finalWrongSeat1.role?.id === wrongRole.id) {
              const alternative = shuffledSeats.find(s => s.id !== finalWrongSeat1.id && s.role?.id !== wrongRole.id);
              if (alternative) finalWrongSeat1 = alternative;
            }
            
            if (finalWrongSeat2.role?.id === wrongRole.id) {
              const alternative = shuffledSeats.find(s => s.id !== finalWrongSeat2.id && s.id !== finalWrongSeat1.id && s.role?.id !== wrongRole.id);
              if (alternative) finalWrongSeat2 = alternative;
            }
            
            if (finalWrongSeat1.id === finalWrongSeat2.id) {
              const differentSeat = shuffledSeats.find(s => s.id !== finalWrongSeat1.id && s.id !== finalWrongSeat2.id);
              if (differentSeat) finalWrongSeat1 = differentSeat;
            }
            
            // 指引：显示正确信息（给说书人看）+ 错误信息（给说书人看）
            guide = `⚠️ [异常] 真实信息：【${realRole.name}】在 ${seat1Num}号 或 ${seat2Num}号（真实：${realSeatNum}号）\n请展示错误信息：【${wrongRole.name}】在 ${finalWrongSeat1.id+1}号 或 ${finalWrongSeat2.id+1}号（${finalWrongSeat1.id+1}号是${finalWrongSeat1.role?.name || '无角色'}，${finalWrongSeat2.id+1}号是${finalWrongSeat2.role?.name || '无角色'}，均为假信息）`;
            // 台词：只显示错误信息（给玩家看）
            speak = `"你得知【${wrongRole.name}】在 ${finalWrongSeat1.id+1}号 或 ${finalWrongSeat2.id+1}号。"`;
          } else {
            // 正常时：展示真实信息（真实外来者角色 + 真实座位和干扰项，顺序随机）
            guide = `👀 真实信息: 【${realRole.name}】在 ${seat1Num}号 或 ${seat2Num}号（真实：${realSeatNum}号）`;
            speak = `"你得知【${realRole.name}】在 ${seat1Num}号 或 ${seat2Num}号。"`;
          }
          action = "展示";
        }
      } else { 
        guide = "⚠️ 未能生成图书管理员信息，请手动指定两个座位或示0。"; 
        speak = '"场上没有合适的外来者信息，请你手动指定两个座位，或比划0示意无信息。"'; 
        action = "展示";
      }
    } catch (_error) {
      guide = "⚠️ 信息生成出现问题，请手动选择座位或示0。";
      speak = '"信息无法自动生成，请你手动指定要告知的两个座位，或比划0。"';
      action = "展示";
    }
  } else if (effectiveRole.id === 'investigator' && gamePhase==='firstNight') {
    // 调查员：首夜得知一名爪牙的具体身份，并被告知该爪牙在X号或Y号（其中一个是真实的，另一个是干扰项）
    // 使用注册判定：只包含被注册为爪牙的玩家（考虑间谍的伪装与隐士的干扰）
    const minionSeats = seats.filter(s => 
      s.role && 
      s.id !== currentSeatId &&
      getRegistration(
        s,
        effectiveRole,
        spyDisguiseMode,
        spyDisguiseProbability
      ).registersAsMinion
    );
    
    if(minionSeats.length > 0 && seats.length >= 2) {
      // 正常时：随机选择一个实际存在的爪牙，确保角色存在
      const validMinions = minionSeats.filter(s => s.role !== null);
      if (validMinions.length === 0) {
        guide = "无此角色。示0。"; 
        speak = '"场上没有爪牙角色，请比划0。"';
        action = "展示";
      } else {
        const realMinion = getRandom(validMinions);
        const realRole = realMinion.role!; // 此时确保不为null
        
        // 真实爪牙的座位号
        const realSeatNum = realMinion.id + 1;
        
        // 选择干扰项座位：从全场所有座位中随机选择（不能是自己，不能是真实爪牙的座位）
        // 确保不偏向任何阵营，完全随机选择
        const availableSeats = seats.filter(s => s.id !== currentSeatId && s.id !== realMinion.id);
        // 使用 getRandom 函数确保完全随机，不偏向任何阵营
        const decoySeat = availableSeats.length > 0 ? getRandom(availableSeats) : realMinion;
        const decoySeatNum = decoySeat.id + 1;
        
        // 随机决定真实座位和干扰项座位的显示顺序（符合游戏规则）
        const shouldSwap = Math.random() < 0.5;
        const seat1Num = shouldSwap ? decoySeatNum : realSeatNum;
        const seat2Num = shouldSwap ? realSeatNum : decoySeatNum;
        
        if (shouldShowFake) {
          // 中毒/酒鬼时：指引处先展示正确信息，然后生成错误的干扰信息
          // 确保错误信息一定为假：选择的角色和座位号必须不匹配
          
          // 1. 随机选择一个爪牙角色作为错误信息中的角色（根据当前剧本过滤）
          const allMinionRoles = roles.filter(r => r.type === 'minion' && r.id !== effectiveRole.id);
          const filteredMinionRoles = selectedScript 
            ? allMinionRoles.filter(r => 
                !r.script || 
                r.script === selectedScript.name ||
                (selectedScript.id === 'trouble_brewing' && !r.script) ||
                (selectedScript.id === 'bad_moon_rising' && (!r.script || r.script === '暗月初升')) ||
                (selectedScript.id === 'sects_and_violets' && (!r.script || r.script === '梦陨春宵')) ||
                (selectedScript.id === 'midnight_revelry' && (!r.script || r.script === '夜半狂欢'))
              )
            : allMinionRoles;
          const wrongRole: Role = filteredMinionRoles.filter(r => r.id !== realRole.id).length > 0 
            ? getRandom(filteredMinionRoles.filter(r => r.id !== realRole.id))
            : getRandom(filteredMinionRoles);
          
          // 2. 选择错误的座位号：优先从善良玩家中选择，如果没有足够的善良玩家，允许使用邪恶玩家的座位
          // 同时确保这些座位号上的角色都不是错误信息中的角色
          // 善良玩家包括：townsfolk（镇民）和 outsider（外来者）
          // 邪恶玩家包括：minion（爪牙）、demon（恶魔）、isDemonSuccessor（恶魔继任者）
          const goodSeats = seats.filter(s => {
            if (!s.role || s.id === currentSeatId || s.id === realMinion.id || s.id === decoySeat.id) return false;
            // 排除邪恶阵营
            if (isEvil(s)) return false;
            // 只保留善良玩家（镇民和外来者）
            // 同时确保座位上的角色不是错误角色（因为错误角色是爪牙，善良玩家不可能是爪牙，所以这个检查是多余的，但为了逻辑清晰保留）
            return (s.role.type === 'townsfolk' || s.role.type === 'outsider') && s.role.id !== wrongRole.id;
          });
          
          // 如果过滤后没有足够的座位，则从所有善良玩家中选择（排除自己、真实座位、干扰项座位）
          const fallbackGoodSeats = seats.filter(s => {
            if (!s.role || s.id === currentSeatId || s.id === realMinion.id || s.id === decoySeat.id) return false;
            if (isEvil(s)) return false;
            return s.role.type === 'townsfolk' || s.role.type === 'outsider';
          });
          
          // 如果善良玩家仍然不够，允许使用邪恶玩家的座位（反正信息本身是假的）
          const allAvailableSeats = seats.filter(s => {
            if (!s.role || s.id === currentSeatId || s.id === realMinion.id || s.id === decoySeat.id) return false;
            // 确保座位上的角色不是错误角色
            return s.role.id !== wrongRole.id;
          });
          
          // 优先使用善良玩家，如果不够则使用所有可用座位
          let availableGoodSeats = goodSeats.length >= 2 ? goodSeats : fallbackGoodSeats;
          if (availableGoodSeats.length < 2) {
            // 如果没有足够的善良玩家，使用所有可用座位（包括邪恶玩家）
            availableGoodSeats = allAvailableSeats.length >= 2 ? allAvailableSeats : fallbackGoodSeats.length > 0 ? fallbackGoodSeats : allAvailableSeats;
          }
          
          // 确保至少有一个可用座位（极端情况下的回退）
          if (availableGoodSeats.length === 0) {
            // 如果完全没有可用座位，使用干扰项座位作为最后的回退
            availableGoodSeats = [decoySeat];
          }
          
          // 随机打乱座位数组，确保随机性
          const shuffledSeats = [...availableGoodSeats].sort(() => Math.random() - 0.5);
          let finalWrongSeat1 = shuffledSeats[0] || decoySeat;
          let finalWrongSeat2 = shuffledSeats.length > 1 ? shuffledSeats[1] : finalWrongSeat1;
          
          // 最终验证：确保两个座位号上的角色都不是错误角色
          if (finalWrongSeat1.role?.id === wrongRole.id) {
            const alternative = shuffledSeats.find(s => s.id !== finalWrongSeat1.id && s.role?.id !== wrongRole.id);
            if (alternative) {
              finalWrongSeat1 = alternative;
            } else {
              // 如果找不到替代，使用干扰项座位（虽然可能不符合要求，但至少不会报错）
              finalWrongSeat1 = decoySeat;
            }
          }
          
          if (finalWrongSeat2.role?.id === wrongRole.id) {
            const alternative = shuffledSeats.find(s => s.id !== finalWrongSeat2.id && s.id !== finalWrongSeat1.id && s.role?.id !== wrongRole.id);
            if (alternative) {
              finalWrongSeat2 = alternative;
            } else {
              // 如果找不到替代，使用干扰项座位或第一个座位（虽然可能不符合要求，但至少不会报错）
              finalWrongSeat2 = finalWrongSeat1.id !== decoySeat.id ? decoySeat : finalWrongSeat1;
            }
          }
          
          // 如果两个座位相同，尝试找不同的座位
          if (finalWrongSeat1.id === finalWrongSeat2.id && shuffledSeats.length > 1) {
            const differentSeat = shuffledSeats.find(s => s.id !== finalWrongSeat1.id);
            if (differentSeat) {
              finalWrongSeat2 = differentSeat;
            } else {
              // 如果找不到不同的座位，使用干扰项座位（如果不同）
              if (decoySeat.id !== finalWrongSeat1.id) {
                finalWrongSeat2 = decoySeat;
              }
            }
          }
          
          const wrongSeat1Num = finalWrongSeat1.id + 1;
          const wrongSeat2Num = finalWrongSeat2.id + 1;
          
          // 指引：显示正确信息（给说书人看）+ 错误信息（给说书人看）
          guide = `⚠️ [异常] 真实信息：【${realRole.name}】在 ${seat1Num}号 或 ${seat2Num}号（真实：${realSeatNum}号）\n请展示错误信息：【${wrongRole.name}】在 ${wrongSeat1Num}号 或 ${wrongSeat2Num}号（${wrongSeat1Num}号是${finalWrongSeat1.role?.name || '无角色'}，${wrongSeat2Num}号是${finalWrongSeat2.role?.name || '无角色'}，均为假信息）`;
          // 台词：只显示错误信息（给玩家看）
          speak = `"你得知【${wrongRole.name}】在 ${wrongSeat1Num}号 或 ${wrongSeat2Num}号。"`;
        } else {
          // 正常时：展示真实信息（真实爪牙角色 + 真实座位和干扰项，顺序随机）
          guide = `👀 真实信息: 【${realRole.name}】在 ${seat1Num}号 或 ${seat2Num}号（真实：${realSeatNum}号）`;
          speak = `"你得知【${realRole.name}】在 ${seat1Num}号 或 ${seat2Num}号。"`;
        }
        action = "展示";
      }
    } else { 
      guide = "无此角色。示0。"; 
      speak = '"场上没有爪牙角色，请比划0。"'; 
      action = "展示";
    }
  } else if (effectiveRole.id === 'chef' && gamePhase==='firstNight') {
    let pairs = 0;
    for (let i = 0; i < seats.length; i++) {
      const next = (i + 1) % seats.length;
      if (checkEvilForChefEmpath(seats[i]) && checkEvilForChefEmpath(seats[next]) && !seats[i].isDead && !seats[next].isDead) {
        pairs++;
      }
    }
    if (shouldShowFake) {
      const fakePairs = pairs === 0 ? 1 : (pairs >= 2 ? pairs - 1 : pairs + 1);
      guide = `⚠️ [异常] 真实:${pairs}对。请报: ${fakePairs}对`;
      // 8. 台词融入指引内容
      speak = `"场上有 ${fakePairs} 对邪恶玩家相邻而坐。"（向他比划数字 ${fakePairs}）`;
    } else {
      guide = `👀 真实信息: ${pairs}对邪恶相邻`;
      // 8. 台词融入指引内容
      speak = `"场上有 ${pairs} 对邪恶玩家相邻而坐。"（向他比划数字 ${pairs}）`;
    }
    action = "告知";
  } else if (effectiveRole.id === 'undertaker' && gamePhase !== 'firstNight') {
    // 10. 送葬者查看"上一个黄昏"的处决记录
    if (lastDuskExecution !== null) {
      const executed = seats.find(s => s.id === lastDuskExecution);
      if (executed) {
        guide = `👀 真实信息: 上一个黄昏被处决的是【${executed.role?.name}】`;
        // 8. 台词融入指引内容
        speak = `"上一个黄昏被处决的玩家是【${executed.role?.name}】。"`;
      } else {
        guide = "上一个黄昏无人被处决。";
        // 8. 台词融入指引内容
        speak = '"上一个黄昏无人被处决。"';
      }
    } else {
      guide = "上一个黄昏无人被处决。";
      // 8. 台词融入指引内容
      speak = '"上一个黄昏无人被处决。"';
    }
    action = "告知";
  } else if (effectiveRole.id === 'spy') {
    guide = "📖 间谍查看魔典。"; 
    speak = '"请查看魔典。"'; 
    action="展示";
  } else if (effectiveRole.id === 'ravenkeeper') {
    if (!targetSeat.isDead || !diedTonight) { 
      guide = "你尚未在本夜死亡，不会被唤醒。"; 
      speak = "（摇头示意无效）"; 
      action = "跳过";
    } else { 
      guide = "查验一身份。"; 
      speak = '"请选择一名玩家。"'; 
      action = "查验";
    }
  } 
  // ========== 夜半狂欢角色处理 ==========
  else if (effectiveRole.id === 'professor_mr' && gamePhase !== 'firstNight') {
    // 教授：每局游戏一次，选择一名死亡的玩家，该玩家复活
    guide = "🔬 每局游戏一次，选择一名死亡的玩家复活。"; 
    speak = '"请选择一名死亡的玩家。如果他是镇民，该玩家复活。"'; 
    action = "none";
  } else if (effectiveRole.id === 'snake_charmer_mr') {
    // 舞蛇人：每晚选择一名存活的玩家，如果选中了恶魔，交换角色和阵营
    guide = "🐍 选择一名存活的玩家，如果选中了恶魔，你和他交换角色和阵营，然后他中毒。"; 
    speak = '"请选择一名存活的玩家。如果你选中了恶魔，你和他交换角色和阵营，然后他中毒。"'; 
    action = "mark";
  } else if (effectiveRole.id === 'savant_mr') {
    // 博学者：每个白天可以私下询问说书人两条信息（一真一假）
    guide = "📚 每个白天，你可以私下询问说书人以得知两条信息：一个是正确的，一个是错误的。"; 
    speak = '"每个白天，你可以私下询问说书人以得知两条信息：一个是正确的，一个是错误的。"'; 
        action = "告知";
  } else if (effectiveRole.id === 'noble' && gamePhase === 'firstNight') {
    // 贵族：首夜得知三名玩家，其中恰好有一名是邪恶的
    const allPlayers = seats.filter(s => s.id !== currentSeatId && s.role);
    if (allPlayers.length >= 3) {
      const evilPlayers = allPlayers.filter(s => 
        getRegistration(
          s,
          effectiveRole,
          spyDisguiseMode,
          spyDisguiseProbability
        ).alignment === 'Evil'
      );
      const goodPlayers = allPlayers.filter(s => 
        getRegistration(
          s,
          effectiveRole,
          spyDisguiseMode,
          spyDisguiseProbability
        ).alignment === 'Good'
      );
      
      let selectedPlayers: Seat[] = [];
      if (evilPlayers.length > 0 && goodPlayers.length >= 2) {
        // 选择1个邪恶玩家和2个善良玩家
        const evil = getRandom(evilPlayers);
        const good1 = getRandom(goodPlayers);
        const good2 = getRandom(goodPlayers.filter(p => p.id !== good1.id));
        selectedPlayers = [evil, good1, good2].sort(() => Math.random() - 0.5);
      } else {
        // 如果邪恶玩家不足或善良玩家不足，随机选择3个
        selectedPlayers = [...allPlayers].sort(() => Math.random() - 0.5).slice(0, 3);
      }
          
          if (shouldShowFake) {
        // 中毒/酒鬼时：生成错误的信息
        const wrongPlayers = seats.filter(s => 
          s.id !== currentSeatId && 
          !selectedPlayers.some(p => p.id === s.id) &&
          s.role
        );
        const fakePlayers = wrongPlayers.length >= 3 
          ? [...wrongPlayers].sort(() => Math.random() - 0.5).slice(0, 3)
          : selectedPlayers;
        guide = `⚠️ [异常] 真实信息：${selectedPlayers.map(p => `${p.id+1}号`).join('、')}，其中恰好有一名是邪恶的\n请展示错误信息：${fakePlayers.map(p => `${p.id+1}号`).join('、')}`;
        speak = `"你得知 ${fakePlayers.map(p => `${p.id+1}号`).join('、')}。其中恰好有一名是邪恶的。"`;
          } else {
        guide = `👀 真实信息: ${selectedPlayers.map(p => `${p.id+1}号`).join('、')}，其中恰好有一名是邪恶的`;
        speak = `"你得知 ${selectedPlayers.map(p => `${p.id+1}号`).join('、')}。其中恰好有一名是邪恶的。"`;
          }
          action = "展示";
      } else {
      guide = "玩家不足。"; 
      speak = '"场上玩家不足。"'; 
        action = "展示";
      }
  } else if (effectiveRole.id === 'balloonist') {
    // 气球驾驶员：被动信息技能，每晚自动得知一名不同角色类型的玩家座位号
    // 检查历史记录，找出已经给过的角色类型
    const typeNames: Record<string, string> = { 
      townsfolk: "镇民", 
      outsider: "外来者", 
      minion: "爪牙", 
      demon: "恶魔" 
    };
    
    const allTypes: RoleType[] = ['townsfolk', 'outsider', 'minion', 'demon'];
    const givenTypes = new Set<RoleType>();
    
    // 从历史记录中提取已经给过的角色类型
    if (gameLogs) {
      gameLogs.forEach(log => {
        // 查找气球驾驶员的日志，格式类似："X号(气球驾驶员) 得知 Y号，角色类型：镇民"
        const match = log.message.match(/(\d+)号\(气球驾驶员\).*角色类型[：:](.+)/);
        if (match) {
          const typeName = match[2].trim();
          // 根据类型名称找到对应的 RoleType
          for (const [type, name] of Object.entries(typeNames)) {
            if (name === typeName) {
              givenTypes.add(type as RoleType);
              break;
            }
          }
        }
      });
    }
    
    // 找出还没有给过的角色类型
    const remainingTypes = allTypes.filter(type => !givenTypes.has(type));
    
    let targetType: RoleType | null = null;
    let targetSeatId: number | null = null;
    
    if (shouldShowFake) {
      // 中毒时：返回重复阵营的角色的座位号（从已给过的类型中随机选一个，如果已给过的类型为空，则从所有类型中选）
      const typesToChooseFrom = givenTypes.size > 0 ? Array.from(givenTypes) : allTypes;
      targetType = getRandom(typesToChooseFrom);
    } else if (remainingTypes.length > 0) {
      // 正常情况：从未给过的类型中随机选一个
      targetType = getRandom(remainingTypes);
    } else {
      // 所有类型都已给过，随机选择一个
      targetType = getRandom(allTypes);
    }
    
    // 找到该类型的角色（排除自己）
    if (targetType) {
      const candidates = seats.filter(s => 
        s.role && 
        s.id !== currentSeatId && 
        !s.isDead &&
        s.role.type === targetType
      );
      
      if (candidates.length > 0) {
        const selected = getRandom(candidates);
        targetSeatId = selected.id;
      }
    }
    
    if (targetSeatId !== null && targetType) {
      guide = `🎈 你得知 ${targetSeatId+1}号，角色类型：${typeNames[targetType]}`;
      speak = `"你得知 ${targetSeatId+1}号，角色类型：${typeNames[targetType]}。"`;
      action = "无行动";
    } else {
      guide = "🎈 无可用信息。";
      speak = '"无可用信息。"';
      action = "无行动";
    }
  } else if (effectiveRole.id === 'amnesiac') {
    // 失意者：每个白天可以询问说书人一次猜测
    guide = "🧠 每个白天，你可以询问说书人一次猜测，你会得知你的猜测有多准确。"; 
    speak = '"每个白天，你可以询问说书人一次猜测，你会得知你的猜测有多准确。"'; 
    action = "告知";
  } else if (effectiveRole.id === 'engineer') {
    // 工程师：每局游戏一次，可以选择让恶魔变成你选择的一个恶魔角色，或让所有爪牙变成你选择的爪牙角色
    guide = "🔧 每局游戏一次，选择让恶魔变成你选择的一个恶魔角色，或让所有爪牙变成你选择的爪牙角色。"; 
    speak = '"每局游戏一次，请选择让恶魔变成你选择的一个恶魔角色，或让所有爪牙变成你选择的爪牙角色。"'; 
    action = "mark";
  } else if (effectiveRole.id === 'fisherman') {
    // 渔夫：每局游戏一次，在白天时可以询问说书人一些建议
    guide = "🎣 每局游戏一次，在白天时，你可以询问说书人一些建议来帮助你的团队获胜。"; 
    speak = '"每局游戏一次，在白天时，你可以询问说书人一些建议来帮助你的团队获胜。"'; 
    action = "告知";
  } else if (effectiveRole.id === 'ranger') {
    // 巡山人：每局游戏一次，选择一名存活的玩家，如果选中了落难少女，她会变成一个不在场的镇民角色
    guide = "🏔️ 每局游戏一次，选择一名存活的玩家，如果选中了落难少女，她会变成一个不在场的镇民角色。"; 
    speak = '"请选择一名存活的玩家。如果选中了落难少女，她会变成一个不在场的镇民角色。"'; 
    action = "mark";
  } else if (effectiveRole.id === 'farmer') {
    // 农夫：如果你在夜晚死亡，一名存活的善良玩家会变成农夫
    guide = "🌾 如果你在夜晚死亡，一名存活的善良玩家会变成农夫。"; 
    speak = '"如果你在夜晚死亡，一名存活的善良玩家会变成农夫。"'; 
    action = "告知";
  } else if (effectiveRole.id === 'poppy_grower') {
    // 罂粟种植者：爪牙和恶魔不知道彼此。如果你死亡，他们会在当晚得知彼此
    guide = "🌺 爪牙和恶魔不知道彼此。如果你死亡，他们会在当晚得知彼此。"; 
    speak = '"爪牙和恶魔不知道彼此。如果你死亡，他们会在当晚得知彼此。"'; 
    action = "告知";
  } else if (effectiveRole.id === 'atheist') {
    // 无神论者：说书人可以打破游戏规则。如果说书人被处决，好人阵营获胜
    guide = "🚫 说书人可以打破游戏规则。如果说书人被处决，好人阵营获胜，即使你已死亡。"; 
    speak = '"说书人可以打破游戏规则。如果说书人被处决，好人阵营获胜，即使你已死亡。"'; 
    action = "告知";
  } else if (effectiveRole.id === 'cannibal') {
    // 食人族：你拥有最后被处决的玩家的能力。如果该玩家是邪恶的，你会中毒直到下一个善良玩家被处决
    guide = "🍖 你拥有最后被处决的玩家的能力。如果该玩家是邪恶的，你会中毒直到下一个善良玩家被处决。"; 
    speak = '"你拥有最后被处决的玩家的能力。如果该玩家是邪恶的，你会中毒直到下一个善良玩家被处决。"'; 
    action = "告知";
  } else if (effectiveRole.id === 'drunk_mr') {
    // 酒鬼：不知道自己是酒鬼，以为自己是镇民
    guide = "🍺 你不知道你是酒鬼。你以为你是一个镇民角色，但其实你不是。"; 
    speak = '"你不知道你是酒鬼。你以为你是一个镇民角色，但其实你不是。"'; 
    action = "告知";
  } else if (effectiveRole.id === 'barber_mr') {
    // 理发师：如果你死亡，在当晚恶魔可以选择两名玩家交换角色
    guide = "💇 如果你死亡，在当晚恶魔可以选择两名玩家(不能选择其他恶魔)交换角色。"; 
    speak = '"如果你死亡，在当晚恶魔可以选择两名玩家(不能选择其他恶魔)交换角色。"'; 
    action = "告知";
  } else if (effectiveRole.id === 'damsel' && gamePhase === 'firstNight') {
    // 落难少女：所有爪牙都知道落难少女在场
    guide = "👸 所有爪牙都知道落难少女在场。"; 
    speak = '"所有爪牙都知道落难少女在场。"'; 
    action = "告知";
  } else if (effectiveRole.id === 'golem') {
    // 魔像：每局游戏一次，只能发起一次提名。如果提名的玩家不是恶魔，他死亡
    guide = "🗿 每局游戏一次，你只能发起一次提名。当你发起提名时，如果你提名的玩家不是恶魔，他死亡。"; 
    speak = '"每局游戏一次，你只能发起一次提名。当你发起提名时，如果你提名的玩家不是恶魔，他死亡。"'; 
      action = "告知";
  } else if (effectiveRole.id === 'poisoner_mr') {
    // 投毒者：每晚选择一名玩家，他当晚和明天白天中毒
    guide = "🧪 选择一名玩家：他当晚和明天白天中毒。"; 
    speak = '"请选择一名玩家。他当晚和明天白天中毒。"'; 
    action = "poison";
  } else if (effectiveRole.id === 'pit_hag_mr') {
    // 麻脸巫婆：每晚选择一名玩家和一个角色，如果该角色不在场，他变成该角色
    guide = "🧹 选择一名玩家和一个角色，如果该角色不在场，他变成该角色。如果因此创造了一个恶魔，当晚的死亡由说书人决定。"; 
    speak = '"请选择一名玩家和一个角色。如果该角色不在场，他变成该角色。如果因此创造了一个恶魔，当晚的死亡由说书人决定。"'; 
    action = "mark";
  } else if (effectiveRole.id === 'lunatic_mr') {
    // 精神病患者：每个白天，在提名开始前，可以公开选择一名玩家死亡
    guide = "🔪 每个白天，在提名开始前，你可以公开选择一名玩家：他死亡。如果你被处决，提名你的玩家必须和你玩石头剪刀布；只有你输了才会死亡。"; 
    speak = '"每个白天，在提名开始前，你可以公开选择一名玩家。他死亡。如果你被处决，提名你的玩家必须和你玩石头剪刀布；只有你输了才会死亡。"'; 
    action = "告知";
  } else if (effectiveRole.id === 'shaman' && gamePhase === 'firstNight') {
    // 灵言师：首夜得知一个关键词
    const keywords = ['月亮', '星星', '太阳', '海洋', '山峰', '森林', '河流', '火焰', '风暴', '彩虹'];
    const keyword = getRandom(keywords);
    guide = `🔮 真实信息: 关键词是【${keyword}】。第一个公开说出这个关键词的善良玩家会在当晚变成邪恶。`; 
    speak = `"你的关键词是【${keyword}】。第一个公开说出这个关键词的善良玩家会在当晚变成邪恶。"`; 
    action = "告知";
  } else if (effectiveRole.id === 'vigormortis_mr') {
    // 亡骨魔：每晚选择一名玩家，他死亡。被你杀死的爪牙保留他的能力，且与他邻近的两名镇民之一中毒
    if (gamePhase === 'firstNight') {
      // 检查罂粟种植者状态：如果罂粟种植者在场且存活，恶魔不知道爪牙是谁
      const poppyGrower = seats.find(s => s.role?.id === 'poppy_grower');
      const shouldHideMinions = poppyGrower && !poppyGrower.isDead && poppyGrowerDead === false;
      
      if (shouldHideMinions) {
        guide = `🌺 罂粟种植者在场，你不知道你的爪牙是谁。`;
        speak = `"罂粟种植者在场，你不知道你的爪牙是谁。"`;
        action = "无信息";
      } else {
        const minions = seats.filter(s => s.role?.type === 'minion' && s.id !== currentSeatId).map(s => `${s.id+1}号`);
        guide = `👿 爪牙列表：${minions.length > 0 ? minions.join(', ') : '无'}。`;
        speak = `"${minions.length > 0 ? `你的爪牙是 ${minions.join('、')}。` : '场上没有爪牙。'}请确认你的爪牙。"`;
        action = "展示";
      }
    } else {
        guide = "⚔️ 选择一名玩家：他死亡。被你杀死的爪牙保留他的能力，且与他邻近的两名镇民之一中毒。"; 
        speak = '"请选择一名玩家。他死亡。被你杀死的爪牙保留他的能力，且与他邻近的两名镇民之一中毒。"'; 
        action = "kill";
    }
  } else if (effectiveRole.id === 'zombuul') {
    // 僵怖：每晚如果今天白天没有人死亡，你会被唤醒并要选择一名玩家：他死亡
    if (gamePhase === 'firstNight') {
      // 检查罂粟种植者状态：如果罂粟种植者在场且存活，恶魔不知道爪牙是谁
      const poppyGrower = seats.find(s => s.role?.id === 'poppy_grower');
      const shouldHideMinions = poppyGrower && !poppyGrower.isDead && poppyGrowerDead === false;
      
      if (shouldHideMinions) {
        guide = `🌺 罂粟种植者在场，你不知道你的爪牙是谁。`;
        speak = `"罂粟种植者在场，你不知道你的爪牙是谁。"`;
        action = "无信息";
      } else {
        const minions = seats.filter(s => s.role?.type === 'minion' && s.id !== currentSeatId).map(s => `${s.id+1}号`);
        guide = `👿 爪牙列表：${minions.length > 0 ? minions.join(', ') : '无'}。`;
        speak = `"${minions.length > 0 ? `你的爪牙是 ${minions.join('、')}。` : '场上没有爪牙。'}请确认你的爪牙。"`;
        action = "展示";
      }
    } else {
      // 非首夜：如果上一个黄昏没有处决（lastDuskExecution === null），僵怖应该被唤醒
      if (lastDuskExecution === null) {
        guide = "⚔️ 选择一名玩家：他死亡。";
        speak = '"请选择一名玩家。他死亡。"';
        action = "kill";
      } else {
        // 如果上一个黄昏有处决，僵怖不应该被唤醒（这个检查在startNight中已经处理，但这里作为双重保障）
        guide = "💤 今天白天有人死亡或处决，无需行动。";
        speak = '"今天白天有人死亡或处决，你无需行动。"';
        action = "跳过";
      }
    }
  } else if (effectiveRole.id === 'hadesia') {
    // 哈迪寂亚：每晚选择三名玩家（所有玩家都会得知你选择了谁），他们秘密决定自己的命运，如果他们全部存活，他们全部死亡
    if (gamePhase === 'firstNight') {
      // 检查罂粟种植者状态：如果罂粟种植者在场且存活，恶魔不知道爪牙是谁
      const poppyGrower = seats.find(s => s.role?.id === 'poppy_grower');
      const shouldHideMinions = poppyGrower && !poppyGrower.isDead && poppyGrowerDead === false;
      
      if (shouldHideMinions) {
        guide = `🌺 罂粟种植者在场，你不知道你的爪牙是谁。`;
        speak = `"罂粟种植者在场，你不知道你的爪牙是谁。"`;
        action = "无信息";
      } else {
        const minions = seats.filter(s => s.role?.type === 'minion' && s.id !== currentSeatId).map(s => `${s.id+1}号`);
        guide = `👿 爪牙列表：${minions.length > 0 ? minions.join(', ') : '无'}。`; 
        speak = `"${minions.length > 0 ? `你的爪牙是 ${minions.join('、')}。` : '场上没有爪牙。'}请确认你的爪牙。"`; 
        action = "展示";
      }
    } else {
      guide = "⚔️ 选择三名玩家（所有玩家都会得知你选择了谁）：他们秘密决定自己的命运，如果他们全部存活，他们全部死亡。"; 
      speak = '"请选择三名玩家。所有玩家都会得知你选择了谁。他们秘密决定自己的命运，如果他们全部存活，他们全部死亡。"'; 
        action = "kill";
    }
  } else if (effectiveRole.type === 'minion' && gamePhase === 'firstNight') {
    // 爪牙首夜：被告知恶魔是谁（除非罂粟种植者在场且存活）
    const poppyGrower = seats.find(s => s.role?.id === 'poppy_grower');
    const shouldHideDemon = poppyGrower && !poppyGrower.isDead && poppyGrowerDead === false;
    
    if (shouldHideDemon) {
      guide = `🌺 罂粟种植者在场，你不知道恶魔是谁。`;
      speak = `"罂粟种植者在场，你不知道恶魔是谁。"`;
      action = "无信息";
    } else {
      // 找到恶魔（包括小恶魔继任者）
      const demons = seats.filter(s => 
        (s.role?.type === 'demon' || s.isDemonSuccessor) && s.id !== currentSeatId
      ).map(s => `${s.id+1}号`);
      guide = `👿 恶魔列表：${demons.length > 0 ? demons.join(', ') : '无'}。`;
      speak = `"${demons.length > 0 ? `恶魔是 ${demons.join('、')}。` : '场上没有恶魔。'}请确认恶魔。"`;
      action = "展示恶魔";
    }
  } else {
    guide = "💤 无行动。"; 
    speak = "（无）"; 
    action = "跳过";
  }
  
  // 修复：首晚小恶魔没有技能，将 nightActionType 设置为 'none'
  let finalEffectiveRole = effectiveRole;
  if (effectiveRole.id === 'imp' && gamePhase === 'firstNight') {
    finalEffectiveRole = { ...effectiveRole, nightActionType: 'none' };
  }
  
  return { seat: targetSeat, effectiveRole: finalEffectiveRole, isPoisoned, reason, guide, speak, action };
};

// ======================================================================
//  暗流涌动 / 暗流涌动剧本 / 游戏的第一部分
//  - 当前组件中，除「加载动画」(showIntroLoading / triggerIntroLoading 及对应 JSX)
//    之外的所有状态、逻辑与界面，均属于「暗流涌动」剧本（游戏的第一部分）的实现。
//  - 未来若新增其他剧本，可通过拆分/复用这里的结构作为参考。
// ======================================================================
export default function Home() {
  // ===========================
  //      STATE 定义 (完整，前置)
  // ===========================
  const [mounted, setMounted] = useState(false);
  const [showIntroLoading, setShowIntroLoading] = useState(true); // Intro 加载动画（不属于具体剧本）
  const [seats, setSeats] = useState<Seat[]>([]);
  const [initialSeats, setInitialSeats] = useState<Seat[]>([]);
  
  const [gamePhase, setGamePhase] = useState<GamePhase>("scriptSelection");
  const [selectedScript, setSelectedScript] = useState<Script | null>(null);
  const [nightCount, setNightCount] = useState(1);
  const [deadThisNight, setDeadThisNight] = useState<number[]>([]); // 改为存储玩家ID
  const [executedPlayerId, setExecutedPlayerId] = useState<number | null>(null);
  const [gameLogs, setGameLogs] = useState<LogEntry[]>([]);
  const [winResult, setWinResult] = useState<WinResult>(null);
  const [winReason, setWinReason] = useState<string | null>(null);
  
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [timer, setTimer] = useState(0);
  
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; seatId: number } | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [longPressingSeats, setLongPressingSeats] = useState<Set<number>>(new Set()); // 正在长按的座位
  
  const [wakeQueueIds, setWakeQueueIds] = useState<number[]>([]);
  const [currentWakeIndex, setCurrentWakeIndex] = useState(0);
  const [selectedActionTargets, setSelectedActionTargets] = useState<number[]>([]);
  const [inspectionResult, setInspectionResult] = useState<string | null>(null);
  const [inspectionResultKey, setInspectionResultKey] = useState(0); // 占卜师结果刷新用，强制重新渲染结果弹窗
  const [currentHint, setCurrentHint] = useState<NightHintState>({ isPoisoned: false, guide: "", speak: "" });
  
  // 保存每个角色的 hint 信息，用于"上一步"时恢复（不重新生成）
  const hintCacheRef = useRef<Map<string, NightHintState>>(new Map());
  // 记录酒鬼是否首次获得信息（首次一定是假的）
  const drunkFirstInfoRef = useRef<Map<number, boolean>>(new Map());

  const [showShootModal, setShowShootModal] = useState<number | null>(null);
  const [showNominateModal, setShowNominateModal] = useState<number | null>(null);
  const [showDayActionModal, setShowDayActionModal] = useState<{type: 'slayer'|'nominate', sourceId: number} | null>(null);
  const [showDrunkModal, setShowDrunkModal] = useState<number | null>(null);
  const [showVirginTriggerModal, setShowVirginTriggerModal] = useState<{source: Seat, target: Seat} | null>(null);
  const [showRavenkeeperFakeModal, setShowRavenkeeperFakeModal] = useState<number | null>(null);
  const [showRavenkeeperResultModal, setShowRavenkeeperResultModal] = useState<{targetId: number, roleName: string, isFake: boolean} | null>(null);
  const [showVoteInputModal, setShowVoteInputModal] = useState<number | null>(null);
  const [voteInputValue, setVoteInputValue] = useState<string>('');
  const [showVoteErrorToast, setShowVoteErrorToast] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showGameRecordsModal, setShowGameRecordsModal] = useState(false);
  const [gameRecords, setGameRecords] = useState<GameRecord[]>([]);
  const [showRoleInfoModal, setShowRoleInfoModal] = useState(false);
  const [showExecutionResultModal, setShowExecutionResultModal] = useState<{message: string, isVirginTrigger?: boolean} | null>(null);
  const [showShootResultModal, setShowShootResultModal] = useState<{message: string, isDemonDead: boolean} | null>(null);
  const [showKillConfirmModal, setShowKillConfirmModal] = useState<number | null>(null); // 恶魔确认杀死玩家
  const [showMayorRedirectModal, setShowMayorRedirectModal] = useState<{targetId: number; demonName: string} | null>(null); // 市长被攻击时的转移提示
  const [mayorRedirectTarget, setMayorRedirectTarget] = useState<number | null>(null); // 市长转移的目标
  const [showPoisonConfirmModal, setShowPoisonConfirmModal] = useState<number | null>(null); // 投毒者确认下毒
  const [showPoisonEvilConfirmModal, setShowPoisonEvilConfirmModal] = useState<number | null>(null); // 投毒者确认对邪恶玩家下毒
  const [showNightDeathReportModal, setShowNightDeathReportModal] = useState<string | null>(null); // 夜晚死亡报告
  const [showHadesiaKillConfirmModal, setShowHadesiaKillConfirmModal] = useState<number[] | null>(null); // 哈迪寂亚确认杀死3名玩家
  const [showMoonchildKillModal, setShowMoonchildKillModal] = useState<{ sourceId: number; onResolve: (latestSeats?: Seat[]) => void } | null>(null); // 月之子死亡连锁提示
  const [showRestartConfirmModal, setShowRestartConfirmModal] = useState<boolean>(false); // 重开确认弹窗
  const [poppyGrowerDead, setPoppyGrowerDead] = useState(false); // 罂粟种植者是否已死亡
  const [lastExecutedPlayerId, setLastExecutedPlayerId] = useState<number | null>(null); // 最后被处决的玩家ID（用于食人族）
  const [damselGuessed, setDamselGuessed] = useState(false); // 落难少女是否已被猜测
  const [shamanKeyword, setShamanKeyword] = useState<string | null>(null); // 灵言师的关键词
  const [spyDisguiseMode, setSpyDisguiseMode] = useState<'off' | 'default' | 'on'>('default'); // 间谍伪装干扰模式：关闭干扰、默认、开启干扰
  const [spyDisguiseProbability, setSpyDisguiseProbability] = useState(0.8); // 间谍伪装干扰概率（默认80%）
  const [pukkaPoisonQueue, setPukkaPoisonQueue] = useState<{ targetId: number; nightsUntilDeath: number }[]>([]); // 普卡中毒->死亡队列

  const seatsRef = useRef(seats);
  const fakeInspectionResultRef = useRef<string | null>(null);
  const consoleContentRef = useRef<HTMLDivElement>(null);
  const moonchildChainPendingRef = useRef(false);
  const longPressTimerRef = useRef<Map<number, NodeJS.Timeout>>(new Map()); // 存储每个座位的长按定时器

  // 根据selectedScript过滤角色的辅助函数
  const getFilteredRoles = useCallback((roleList: Role[]): Role[] => {
    if (!selectedScript) return [];
    return roleList.filter(r => 
      !r.script || 
      r.script === selectedScript.name ||
      (selectedScript.id === 'trouble_brewing' && !r.script) ||
      (selectedScript.id === 'bad_moon_rising' && (!r.script || r.script === '暗月初升')) ||
      (selectedScript.id === 'sects_and_violets' && (!r.script || r.script === '梦陨春宵')) ||
      (selectedScript.id === 'midnight_revelry' && (!r.script || r.script === '夜半狂欢'))
    );
  }, [selectedScript]);

  // 根据selectedScript过滤后的groupedRoles
  const filteredGroupedRoles = useMemo(() => {
    if (!selectedScript) return {} as Record<string, Role[]>;
    const filtered = getFilteredRoles(roles);
    return filtered.reduce((acc, role) => {
      if (!acc[role.type]) acc[role.type] = [];
      acc[role.type].push(role);
      return acc;
    }, {} as Record<string, Role[]>);
  }, [selectedScript, getFilteredRoles]);
  const introTimeoutRef = useRef<any>(null);
  
  // 历史记录用于"上一步"功能
  const [history, setHistory] = useState<Array<{
    seats: Seat[];
    gamePhase: GamePhase;
    nightCount: number;
    executedPlayerId: number | null;
    wakeQueueIds: number[];
    currentWakeIndex: number;
    selectedActionTargets: number[];
    gameLogs: LogEntry[];
    currentHint?: NightHintState; // 保存 hint 信息
    selectedScript: Script | null; // 保存选中的剧本
  }>>([]);
  
  // 提名记录：记录谁提名了谁
  const [nominationRecords, setNominationRecords] = useState<{
    nominators: Set<number>; // 已经提名过的玩家
    nominees: Set<number>; // 已经被提名过的玩家
  }>({ nominators: new Set(), nominees: new Set() });
  
  // 上一个黄昏的处决记录（用于送葬者）
  const [lastDuskExecution, setLastDuskExecution] = useState<number | null>(null);
  // 当前黄昏的处决记录（在进入新黄昏时，会更新lastDuskExecution）
  const [currentDuskExecution, setCurrentDuskExecution] = useState<number | null>(null);
  
  // 使用ref存储最新状态，避免Hook依赖问题
  const gameStateRef = useRef({
    seats,
    gamePhase,
    nightCount,
    executedPlayerId,
    wakeQueueIds,
    currentWakeIndex,
    selectedActionTargets,
    gameLogs,
    selectedScript
  });
  
  const triggerIntroLoading = useCallback(() => {
    setShowIntroLoading(true);
    if (introTimeoutRef.current) {
      clearTimeout(introTimeoutRef.current);
    }
    introTimeoutRef.current = setTimeout(() => {
      setShowIntroLoading(false);
      introTimeoutRef.current = null;
    }, 2000);
  }, []);

  // 更新ref
  useEffect(() => {
    gameStateRef.current = {
      seats,
      gamePhase,
      nightCount,
      executedPlayerId,
      wakeQueueIds,
      currentWakeIndex,
      selectedActionTargets,
      gameLogs,
      selectedScript
    };
  }, [seats, gamePhase, nightCount, executedPlayerId, wakeQueueIds, currentWakeIndex, selectedActionTargets, gameLogs, selectedScript]);

  // 从localStorage读取对局记录
  const loadGameRecords = useCallback(() => {
    try {
      const stored = localStorage.getItem('clocktower_game_records');
      if (stored) {
        const records = JSON.parse(stored) as GameRecord[];
        setGameRecords(records);
      }
    } catch (error) {
      console.error('读取对局记录失败:', error);
    }
  }, []);

  // 保存对局记录到localStorage
  const saveGameRecord = useCallback((record: GameRecord) => {
    try {
      const stored = localStorage.getItem('clocktower_game_records');
      let records: GameRecord[] = stored ? JSON.parse(stored) : [];
      // 将新记录添加到开头
      records = [record, ...records];
      // 最多保存100条记录
      if (records.length > 100) {
        records = records.slice(0, 100);
      }
      localStorage.setItem('clocktower_game_records', JSON.stringify(records));
      setGameRecords(records);
    } catch (error) {
      console.error('保存对局记录失败:', error);
    }
  }, []);

  // --- Effects ---
  useEffect(() => {
      setMounted(true);
      loadGameRecords(); // 加载对局记录
      setSeats(Array.from({ length: 15 }, (_, i) => ({ 
      id: i, 
      role: null, 
      charadeRole: null, 
      isDead: false, 
      isDrunk: false, 
      isPoisoned: false, 
      isProtected: false, 
      protectedBy: null,
      isRedHerring: false, 
      isFortuneTellerRedHerring: false, 
      isSentenced: false, 
      masterId: null, 
      hasUsedSlayerAbility: false, 
      hasUsedVirginAbility: false, 
      hasBeenNominated: false,
      isDemonSuccessor: false, 
      hasAbilityEvenDead: false,
      statusDetails: [],
      statuses: [],
      grandchildId: null,
      isGrandchild: false,
      zombuulLives: 1
      })));
      triggerIntroLoading();
  }, [triggerIntroLoading]);

  useEffect(() => {
    return () => {
      if (introTimeoutRef.current) {
        clearTimeout(introTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => { 
    setTimer(0); 
  }, [gamePhase]);
  
  useEffect(() => { 
      if(!mounted) return;
      const i = setInterval(() => setTimer(t => t + 1), 1000); 
      return () => clearInterval(i); 
  }, [mounted]);
  
  useEffect(() => { 
    seatsRef.current = seats; 
  }, [seats]);

  const addLog = useCallback((msg: string) => {
    setGameLogs(p => [...p, { day: nightCount, phase: gamePhase, message: msg }]);
  }, [nightCount, gamePhase]);

  // 添加日志并去重：每个玩家每晚只保留最后一次行动
  const addLogWithDeduplication = useCallback((msg: string, playerId?: number, roleName?: string) => {
    setGameLogs(prev => {
      // 如果提供了玩家ID和角色名，先删除该玩家在该阶段之前的日志
      if (playerId !== undefined && roleName) {
        const filtered = prev.filter(log => 
          !(log.message.includes(`${playerId+1}号(${roleName})`) && log.phase === gamePhase)
        );
        return [...filtered, { day: nightCount, phase: gamePhase, message: msg }];
      }
      // 否则直接添加
      return [...prev, { day: nightCount, phase: gamePhase, message: msg }];
    });
  }, [nightCount, gamePhase]);

  const cleanStatusesForNewDay = useCallback(() => {
    setSeats(prev => prev.map(s => {
      const remaining = (s.statuses || []).filter(status => 
        status.effect === 'ExecutionProof' || status.duration !== 'Night'
      );
      return { ...s, statuses: remaining };
    }));
  }, []);

  const isEvilWithJudgment = useCallback((seat: Seat): boolean => {
    // 默认使用isEvil函数
    return isEvil(seat);
  }, []);

  const enqueueRavenkeeperIfNeeded = useCallback((targetId: number) => {
    const targetSeat = seats.find(s => s.id === targetId);
    if (getSeatRoleId(targetSeat) !== 'ravenkeeper') return;
    setWakeQueueIds(prev => {
      if (prev.includes(targetId)) return prev;
      const insertionIndex = Math.min(currentWakeIndex + 1, prev.length);
      const next = [...prev];
      next.splice(insertionIndex, 0, targetId);
      return next;
    });
  }, [seats, currentWakeIndex]);

  const nightInfo = useMemo(() => {
    if ((gamePhase === "firstNight" || gamePhase === "night") && wakeQueueIds.length > 0 && currentWakeIndex >= 0 && currentWakeIndex < wakeQueueIds.length) {
      return calculateNightInfo(selectedScript, seats, wakeQueueIds[currentWakeIndex], gamePhase, lastDuskExecution, fakeInspectionResultRef.current || undefined, drunkFirstInfoRef.current, isEvilWithJudgment, poppyGrowerDead, gameLogs, spyDisguiseMode, spyDisguiseProbability, deadThisNight);
    }
    return null;
  }, [selectedScript, seats, currentWakeIndex, gamePhase, wakeQueueIds, lastDuskExecution, isEvilWithJudgment, poppyGrowerDead, gameLogs, spyDisguiseMode, spyDisguiseProbability, deadThisNight]);

  useEffect(() => {
    if (nightInfo) {
      // 生成缓存 key：用于"上一步"时恢复 hint，不重新生成
      const hintKey = `${gamePhase}-${currentWakeIndex}-${nightInfo.seat.id}`;
      
      // 检查缓存中是否有该角色的 hint（用于"上一步"时恢复）
      const cachedHint = hintCacheRef.current.get(hintKey);
      if (cachedHint) {
        setCurrentHint(cachedHint);
        if (cachedHint.fakeInspectionResult) {
          fakeInspectionResultRef.current = cachedHint.fakeInspectionResult;
        }
        return; // 使用缓存的 hint，不重新计算
      }
      
      // 没有缓存，重新计算 hint
      let fakeResult = currentHint.fakeInspectionResult;
      // 占卜师的假信息现在在玩家选择后根据真实结果生成（在 toggleTarget 函数中）
      // 这里不再预先生成假信息，因为需要先知道玩家选择了谁才能计算真实结果
      if (nightInfo.effectiveRole.id !== 'fortune_teller' || !nightInfo.isPoisoned) {
        fakeInspectionResultRef.current = null;
      }

      const newHint: NightHintState = { 
        isPoisoned: nightInfo.isPoisoned, 
        reason: nightInfo.reason, 
        guide: nightInfo.guide, 
        speak: nightInfo.speak,
        fakeInspectionResult: fakeResult
      };
      
      // 气球驾驶员：自动记录日志（被动信息技能）
      if (nightInfo.effectiveRole.id === 'balloonist' && nightInfo.guide.includes('你得知')) {
        // 从 guide 中提取信息：格式为 "🎈 你得知 X号，角色类型：镇民"
        const match = nightInfo.guide.match(/你得知 (\d+)号，角色类型[：:](.+)/);
        if (match) {
          const seatNum = match[1];
          const typeName = match[2].trim();
          // 检查是否已经记录过（避免重复记录）
          const alreadyLogged = gameLogs.some(log => 
            log.message.includes(`${nightInfo.seat.id+1}号(气球驾驶员)`) && 
            log.message.includes(`得知 ${seatNum}号`) &&
            log.phase === gamePhase
          );
          if (!alreadyLogged) {
            addLogWithDeduplication(
              `${nightInfo.seat.id+1}号(气球驾驶员) 得知 ${seatNum}号，角色类型：${typeName}`,
              nightInfo.seat.id,
              '气球驾驶员'
            );
          }
        }
      }
      
      // 保存到缓存
      hintCacheRef.current.set(hintKey, newHint);
      setCurrentHint(newHint);
      
      if (selectedActionTargets.length > 0 && seats.find(s=>s.id===selectedActionTargets[0])?.id !== wakeQueueIds[currentWakeIndex]) {
        setSelectedActionTargets([]); 
        setInspectionResult(null);
        fakeInspectionResultRef.current = null;
      }
    }
  }, [currentWakeIndex, gamePhase, nightInfo, seats, selectedActionTargets, currentHint.fakeInspectionResult, gameLogs, addLogWithDeduplication]);

  // 夜晚阶段切换角色时，自动滚动控制台到顶部
  useEffect(() => {
    if ((gamePhase === 'firstNight' || gamePhase === 'night') && consoleContentRef.current) {
      consoleContentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [currentWakeIndex, gamePhase]);

  // 组件卸载时清理所有长按定时器
  useEffect(() => {
    return () => {
      longPressTimerRef.current.forEach((timer) => {
        clearTimeout(timer);
      });
      longPressTimerRef.current.clear();
    };
  }, []);

  // 游戏结束时保存对局记录
  const gameRecordSavedRef = useRef(false);
  useEffect(() => {
    if (gamePhase === 'gameOver' && winResult !== null && selectedScript && !gameRecordSavedRef.current) {
      const endTime = new Date();
      const duration = startTime ? Math.floor((endTime.getTime() - startTime.getTime()) / 1000) : timer;
      
      const record: GameRecord = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        scriptName: selectedScript.name,
        startTime: startTime ? startTime.toISOString() : new Date().toISOString(),
        endTime: endTime.toISOString(),
        duration: duration,
        winResult: winResult,
        winReason: winReason,
        seats: JSON.parse(JSON.stringify(seats)), // 深拷贝座位信息
        gameLogs: [...gameLogs] // 拷贝游戏日志
      };
      
      saveGameRecord(record);
      gameRecordSavedRef.current = true;
    }
    
    // 当游戏重新开始时，重置保存标记
    if (gamePhase === 'scriptSelection' || gamePhase === 'setup') {
      gameRecordSavedRef.current = false;
    }
  }, [gamePhase, winResult, selectedScript, startTime, timer, winReason, seats, gameLogs, saveGameRecord]);

  // 检查游戏结束条件
  const checkGameOver = useCallback((updatedSeats: Seat[], executedPlayerId?: number | null) => {
    // 计算存活人数：僵怖假死状态（isFirstDeathForZombuul=true但isZombuulTrulyDead=false）应该被算作存活
    const aliveCount = updatedSeats.filter(s => {
      // 僵怖特殊处理：假死状态算作存活
      if (s.role?.id === 'zombuul' && s.isFirstDeathForZombuul && !s.isZombuulTrulyDead) {
        return true;
      }
      return !s.isDead;
    }).length;
    
    // 优先检查：当场上仅存2位存活玩家时，游戏结束，宣布邪恶阵营获胜
    // 这个检查应该优先于其他检查，因为这是立即胜利条件
    if (aliveCount <= 2) {
      setWinResult('evil');
      setWinReason(`场上仅存${aliveCount}位存活玩家`);
      setGamePhase('gameOver');
      addLog(`游戏结束：场上仅存${aliveCount}位存活玩家，邪恶阵营获胜`);
      return true;
    }
    
    // 检查：当场上所有存活玩家都是邪恶阵营时，立即宣布邪恶阵营获胜
    // 注意：在胜负条件计算中，仅计算爪牙和恶魔，隐士永远属于善良阵营
    // 僵怖假死状态应该被算作存活
    const aliveSeats = updatedSeats.filter(s => {
      // 僵怖特殊处理：假死状态算作存活
      if (s.role?.id === 'zombuul' && s.isFirstDeathForZombuul && !s.isZombuulTrulyDead) {
        return true;
      }
      return !s.isDead;
    });
    if (aliveSeats.length > 0) {
      const allEvil = aliveSeats.every(s => isEvilForWinCondition(s));
      if (allEvil) {
        setWinResult('evil');
        setWinReason('场上所有存活玩家都是邪恶阵营');
        setGamePhase('gameOver');
        addLog(`游戏结束：场上所有存活玩家都是邪恶阵营，邪恶阵营获胜`);
        return true;
      }
    }
    
    // 优先检查：圣徒被处决导致邪恶方获胜（优先级高于恶魔死亡判定）
    // 这个检查必须在恶魔死亡检查之前，确保圣徒被处决的判定优先级更高
    if (executedPlayerId !== null && executedPlayerId !== undefined) {
      const executedPlayer = updatedSeats.find(s => s.id === executedPlayerId);
      if (executedPlayer && executedPlayer.role?.id === 'saint' && !executedPlayer.isPoisoned) {
        setWinResult('evil');
        setWinReason('圣徒被处决');
        setGamePhase('gameOver');
        addLog("游戏结束：圣徒被处决，邪恶胜利");
        return true;
      }
    }
    
    // 检查是否有活着的恶魔（包括原小恶魔和"小恶魔（传）"）
    // 注意：僵怖假死状态（isFirstDeathForZombuul=true但isZombuulTrulyDead=false）不算真正死亡
    const aliveDemon = updatedSeats.find(s => {
      if (s.role?.type !== 'demon' && !s.isDemonSuccessor) return false;
      // 僵怖特殊处理：只有真正死亡（isZombuulTrulyDead=true）才算死亡
      if (s.role?.id === 'zombuul') {
        return !s.isZombuulTrulyDead;
      }
      return !s.isDead;
    });
    
    // 检查是否有死亡的恶魔（包括原小恶魔和"小恶魔（传）"）
    // 注意：僵怖假死状态不算真正死亡
    const deadDemon = updatedSeats.find(s => {
      if (s.role?.type !== 'demon' && !s.isDemonSuccessor) return false;
      // 僵怖特殊处理：只有真正死亡（isZombuulTrulyDead=true）才算死亡
      if (s.role?.id === 'zombuul') {
        return s.isZombuulTrulyDead === true;
      }
      return s.isDead;
    });
    
    // 如果原小恶魔死亡，但存在活着的"小恶魔（传）"，游戏继续
    // 只有当所有恶魔（包括"小恶魔（传）"）都死亡时，好人才胜利
    if (deadDemon && !aliveDemon) {
      setWinResult('good');
      // 判断是原小恶魔还是"小恶魔（传）"死亡
      if (deadDemon.isDemonSuccessor) {
        setWinReason('小恶魔（传）死亡');
        addLog("游戏结束：小恶魔（传）死亡，好人胜利");
      } else {
        setWinReason('小恶魔死亡');
        addLog("游戏结束：小恶魔死亡，好人胜利");
      }
      setGamePhase('gameOver');
      return true;
    }
    
    // 如果没有活着的恶魔，检查是否有红唇女郎可以继任
    // 注意：红唇女郎的变身逻辑主要在 executePlayer 中处理
    // 这里只是检查，如果存活玩家数量 < 5 或没有红唇女郎，判定好人胜利
    if (!aliveDemon) {
      const scarletWoman = updatedSeats.find(s => 
        s.role?.id === 'scarlet_woman' && !s.isDead && !s.isDemonSuccessor
      );
      // 如果存活玩家数量 < 5 或没有红唇女郎，判定好人胜利
      if (aliveCount < 5 || !scarletWoman) {
        setWinResult('good');
        setWinReason('恶魔死亡');
        setGamePhase('gameOver');
        addLog("游戏结束：恶魔死亡，好人胜利");
        return true;
      }
      // 如果存活玩家数量 >= 5 且有红唇女郎，游戏继续（红唇女郎的变身在 executePlayer 中处理）
    }
    
    const mayor = updatedSeats.find(s => s.role?.id === 'mayor' && !s.isDead);
    if (aliveCount === 3 && mayor && gamePhase === 'day') {
      setWinResult('good');
      setWinReason('3人存活且无人被处决（市长能力）');
      setGamePhase('gameOver');
      addLog("游戏结束：3人存活且无人被处决，好人胜利");
      return true;
    }
    
    return false;
  }, [addLog, gamePhase]);

  if (!mounted) return null;
  
  // ======================================================================
  //  游戏流程 / 剧本流程 / 通用流程
  //  - 以下与 gamePhase 相关的状态、函数和处理逻辑，
  //    定义了当前剧本（暗流涌动）的整套通用流程：
  //    「准备阶段 (setup) → 核对身份 (check) → 首夜 (firstNight)
  //      → 白天 (day) → 黄昏/处决 (dusk) → 夜晚 (night)
  //      → 天亮结算 (dawnReport) → 游戏结束 (gameOver)」。
  //  - 未来如果开发新的剧本，可以整体复制 / 修改这一段流程代码，
  //    作为新剧本的“游戏流程 / 剧本流程 / 通用流程”模板。
  // ======================================================================
  // --- Handlers ---
  const isTargetDisabled = (s: Seat) => {
    if (!nightInfo) return true;
    const rid = nightInfo.effectiveRole.id;
    if (rid === 'monk' && s.id === nightInfo.seat.id) return true;
    if (rid === 'poisoner' && s.isDead) return true;
    if (rid === 'ravenkeeper' && !deadThisNight.includes(nightInfo.seat.id)) return true;
    // 7. 修复小恶魔选择问题 - 首夜不能选人，非首夜可以选择
    if (rid === 'imp' && gamePhase === 'firstNight') return true;
    // 小恶魔可以选择自己（用于身份转移）
    // 管家不能选择自己作为主人
    if (rid === 'butler' && s.id === nightInfo.seat.id) return true;
    return false;
  };

  const handleSeatClick = (id: number) => {
    if(gamePhase==='setup') {
      // 保存操作前的状态到历史记录
      saveHistory();
      if(selectedRole) {
        if(seats.some(s=>s.role?.id===selectedRole.id)) {
          alert("该角色已入座");
          return;
        }
        setSeats(p=>p.map(s=>s.id===id?{...s,role:selectedRole}:s)); 
        setSelectedRole(null);
      } else {
        setSeats(p=>p.map(s=>s.id===id?{...s,role:null}:s));
      }
    }
  };

  const handlePreStartNight = () => {
      const active = seats.filter(s => s.role);
    if (active.length === 0) {
      alert("请先安排座位");
      return;
    }
    const compact = active.map((s, i) => ({ ...s, id: i }));
      
    // 自动为酒鬼分配一个未被使用的镇民角色作为伪装
    let updatedCompact = [...compact];
    const drunk = updatedCompact.find(s => s.role?.id === "drunk" && !s.charadeRole);
    if(drunk) {
      // 获取所有已被使用的镇民角色ID
      const usedTownsfokIds = new Set(updatedCompact.map(s => s.role?.id).filter(Boolean));
      
      // 从当前剧本的镇民角色中筛选出未被使用的
      const availableTownsfok = (filteredGroupedRoles['townsfolk'] || groupedRoles['townsfolk'] || [])
        .filter(r => !usedTownsfokIds.has(r.id));
      
      if(availableTownsfok.length > 0) {
        // 随机选择一个未被使用的镇民角色作为酒鬼的伪装
        const charadeRole = getRandom(availableTownsfok);
        updatedCompact = updatedCompact.map(s => 
          s.id === drunk.id 
            ? { ...s, charadeRole, isDrunk: true } 
            : s
        );
      } else {
        // 如果没有未被使用的镇民角色，从所有镇民角色中随机选择一个（即使已被使用）
        const allTownsfok = filteredGroupedRoles['townsfolk'] || groupedRoles['townsfolk'] || [];
        if(allTownsfok.length > 0) {
          const charadeRole = getRandom(allTownsfok);
          updatedCompact = updatedCompact.map(s => 
            s.id === drunk.id 
              ? { ...s, charadeRole, isDrunk: true } 
              : s
          );
        }
      }
    }
    
    setSeats(updatedCompact);

    setTimeout(() => {
        const withRed = [...updatedCompact];
          if(!withRed.some(s => s.isRedHerring)) {
            const good = withRed.filter(s => ["townsfolk","outsider"].includes(s.role?.type || ""));
            if(good.length > 0) {
              const t = getRandom(good);
              withRed[t.id] = { 
                ...withRed[t.id], 
                isRedHerring: true, 
                statusDetails: [...(withRed[t.id].statusDetails || []), "红罗刹"] 
              };
            }
        }
        setSeats(withRed); 
        setInitialSeats(JSON.parse(JSON.stringify(withRed))); 
      setGamePhase("check");
    }, 100);
  };

  const confirmDrunkCharade = (r: Role) => {
    // 立即更新座位显示
    setSeats(p => {
      const updated = p.map(s => s.id === showDrunkModal ? { ...s, charadeRole: r, isDrunk: true } : s);
      setShowDrunkModal(null);
      setTimeout(() => {
        const active = updated.filter(s => s.role);
        const compact = active.map((s, i) => ({ ...s, id: i }));
        const withRed = [...compact];
          if(!withRed.some(s => s.isRedHerring)) {
            const good = withRed.filter(s => ["townsfolk","outsider"].includes(s.role?.type || ""));
            if(good.length > 0) {
              const t = getRandom(good);
              withRed[t.id] = { 
                ...withRed[t.id], 
                isRedHerring: true, 
                statusDetails: [...(withRed[t.id].statusDetails || []), "红罗刹"] 
              };
            }
        }
        setSeats(withRed); 
        setInitialSeats(JSON.parse(JSON.stringify(withRed))); 
        setGamePhase("check");
      }, 100);
      return updated;
    });
  };

  const startNight = (isFirst: boolean) => {
    // 保存历史记录
    saveHistory();
    const nightlyDeaths: number[] = [];
    
    // 对于非首夜，在进入夜晚前，将当前黄昏的处决记录保存为"上一个黄昏的处决记录"
    // 这样送葬者在夜晚时就能看到上一个黄昏的处决信息
    if (!isFirst) {
      if (currentDuskExecution !== null) {
        setLastDuskExecution(currentDuskExecution);
        // 清空当前黄昏的处决记录，准备记录新的处决
        setCurrentDuskExecution(null);
      }
      // 如果当前黄昏没有处决，保持上一个黄昏的记录（如果有的话）
      // 如果上一个黄昏也没有处决，lastDuskExecution保持为null
    }
    
    if(isFirst) setStartTime(new Date());
    
    // 普卡特殊处理：按队列推进中毒->死亡流程
    const pukkaDeaths: number[] = [];
    const nextPukkaQueue = pukkaPoisonQueue
      .map(entry => {
        const targetSeat = seats.find(s => s.id === entry.targetId);
        // 如果目标已经死亡（被处决或其他效果），移出队列
        if (targetSeat?.isDead) return null;
        const nightsLeft = entry.nightsUntilDeath - 1;
        if (nightsLeft <= 0) {
          pukkaDeaths.push(entry.targetId);
          return null;
        }
        return { ...entry, nightsUntilDeath: nightsLeft };
      })
      .filter((v): v is { targetId: number; nightsUntilDeath: number } => !!v);
    if (pukkaDeaths.length > 0) {
      pukkaDeaths.forEach((id, idx) => {
        nightlyDeaths.push(id);
        const isLast = idx === pukkaDeaths.length - 1;
        killPlayer(id, {
          seatTransformer: seat => {
            const filteredStatuses = (seat.statusDetails || []).filter(st => st !== '普卡中毒');
            return { ...seat, isPoisoned: false, statusDetails: filteredStatuses };
          },
          skipGameOverCheck: !isLast, // 最后一次再检查游戏结束，避免重复检查
        });
        addLog(`${id+1}号 因普卡的中毒效果死亡并恢复健康`);
      });
    }
    // 更新普卡队列（存活者继续保持中毒状态）
    setPukkaPoisonQueue(nextPukkaQueue);
    
    setSeats(p => p.map(s => {
      // 检查是否有永久中毒标记（舞蛇人制造的中毒）或亡骨魔中毒标记
      const hasPermanentPoison = s.statusDetails?.includes('永久中毒') || false;
      const hasVigormortisPoison = s.statusDetails?.includes('亡骨魔中毒') || false;
      const hasPukkaPoison = s.statusDetails?.includes('普卡中毒') || false;
      const filteredStatuses = (s.statuses || []).filter(status => status.effect !== 'ExecutionProof' && status.duration !== '1 Day');
      return {
        ...s, 
        statuses: filteredStatuses,
        // 如果有永久中毒标记、亡骨魔中毒标记或普卡中毒标记，保持 isPoisoned 为 true，否则重置为 false
        isPoisoned: hasPermanentPoison || hasVigormortisPoison || hasPukkaPoison, 
        isProtected: false,
        protectedBy: null,
        voteCount: undefined, 
        isCandidate: false
      };
    }));
    setDeadThisNight(nightlyDeaths);
    fakeInspectionResultRef.current = null;
    
    // 对于非首夜，检查上一个黄昏是否有处决
    // 如果上一个黄昏没有处决，送葬者不应该被唤醒
    let previousDuskExecution = lastDuskExecution;
    if (isFirst) {
      // 首夜没有上一个黄昏，清除处决记录
      previousDuskExecution = null;
    }
    // 注意：lastDuskExecution 在进入夜晚时应该保持为上一个黄昏的处决记录
    // 在进入新的黄昏时会被更新
    
    // 夜半狂欢：首夜时，如果罂粟种植者在场，爪牙和恶魔不知道彼此
    // 如果罂粟种植者不在场或已死亡，爪牙和恶魔知道彼此
    const poppyGrower = seats.find(s => s.role?.id === 'poppy_grower');
    if (isFirst) {
      // 首夜时：如果罂粟种植者在场且存活，设置 poppyGrowerDead 为 false；否则为 true
      if (poppyGrower && !poppyGrower.isDead) {
        setPoppyGrowerDead(false); // 罂粟种植者在场且存活，爪牙和恶魔不知道彼此
      } else {
        setPoppyGrowerDead(true); // 罂粟种植者不在场或已死亡，爪牙和恶魔知道彼此
      }
    }
    
    // 夜半狂欢：首夜时，落难少女告知所有爪牙
    if (isFirst) {
      const damsel = seats.find(s => s.role?.id === 'damsel');
      if (damsel) {
        const minions = seats.filter(s => s.role?.type === 'minion' && !s.isDead);
        if (minions.length > 0) {
          const minionNames = minions.map(s => `${s.id+1}号`).join('、');
          addLog(`落难少女在场，所有爪牙(${minionNames})都知道这个信息`);
        }
      }
      
      // 夜半狂欢：首夜时，灵言师得知关键词
      const shaman = seats.find(s => s.role?.id === 'shaman');
      if (shaman) {
        const keywords = ['月亮', '星星', '太阳', '海洋', '山峰', '森林', '河流', '火焰', '风暴', '彩虹'];
        const keyword = getRandom(keywords);
        setShamanKeyword(keyword);
        addLog(`灵言师(${shaman.id+1}号)的关键词是【${keyword}】`);
      }
    }
    
    const q = seats
      .filter(s => s.role)
      .filter(s => 
        !s.isDead || 
        s.hasAbilityEvenDead || 
        s.isFirstDeathForZombuul || 
        (getSeatRoleId(s) === 'ravenkeeper' && nightlyDeaths.includes(s.id))
      )
      .sort((a,b) => {
        const ra = a.role?.id === 'drunk' ? a.charadeRole : a.role;
        const rb = b.role?.id === 'drunk' ? b.charadeRole : b.role;
        return (isFirst ? (ra?.firstNightOrder??0) : (ra?.otherNightOrder??0)) - (isFirst ? (rb?.firstNightOrder??0) : (rb?.otherNightOrder??0));
      });
    const validQueue = q.filter(s => {
      const r = s.role?.id === 'drunk' ? s.charadeRole : s.role;
      const roleId = r?.id;
      const diedTonight = nightlyDeaths.includes(s.id);
      // 6. 跳过在夜晚死亡的玩家（小恶魔杀害的玩家），但守鸦人死亡的当晚需要被唤醒，亡骨魔杀死的爪牙（保留能力）也需要被唤醒
      // 僵怖假死状态（isFirstDeathForZombuul=true）也需要被唤醒
      if (roleId === 'ravenkeeper' && !diedTonight) {
        return false;
      }
      if (s.isDead && !diedTonight && !s.hasAbilityEvenDead && !s.isFirstDeathForZombuul) {
        return false;
      }
      // 送葬者：如果上一个黄昏没有处决，不应该被唤醒
      if (r?.id === 'undertaker' && !isFirst && previousDuskExecution === null) {
        return false;
      }
      // 僵怖：如果上一个黄昏有处决，不应该被唤醒（只有在白天没有人死亡时才被唤醒）
      if (r?.id === 'zombuul' && !isFirst && previousDuskExecution !== null) {
        return false;
      }
      return isFirst ? (r?.firstNightOrder ?? 0) > 0 : (r?.otherNightOrder ?? 0) > 0;
    });
    setWakeQueueIds(validQueue.map(s => s.id)); 
    setCurrentWakeIndex(0); 
    setSelectedActionTargets([]);
    setInspectionResult(null);
    setGamePhase(isFirst ? "firstNight" : "night"); 
    if(!isFirst) setNightCount(n => n + 1);
  };

  const toggleTarget = (id: number) => {
      if(!nightInfo) return;
    
    // 保存历史记录
    saveHistory();
    
    // 确定最大选择数量
    let max = 1;
    if (nightInfo.effectiveRole.id === 'fortune_teller') max = 2;
    if (nightInfo.effectiveRole.id === 'hadesia' && gamePhase !== 'firstNight') max = 3;
    let newT = [...selectedActionTargets];
    
    if (newT.includes(id)) {
      newT = newT.filter(t => t !== id);
    } else {
      if (max === 1) {
        newT = [id]; 
      } else {
        if (newT.length >= max) {
          newT.shift();
        }
        newT.push(id);
      }
    }
    
      setSelectedActionTargets(newT);
    
    // 投毒者选择目标后立即显示确认弹窗
    if(nightInfo.effectiveRole.id === 'poisoner' && nightInfo.effectiveRole.nightActionType === 'poison' && newT.length > 0) {
      const targetId = newT[newT.length - 1];
      const target = seats.find(s => s.id === targetId);
      const isEvilPlayer = target && (['minion','demon'].includes(target.role?.type||'') || target.isDemonSuccessor);
      if(isEvilPlayer) {
        setShowPoisonEvilConfirmModal(targetId);
      } else {
        setShowPoisonConfirmModal(targetId);
      }
      // 只更新高亮，不执行下毒，等待确认
      // 注意：保留永久中毒标记（舞蛇人制造）和亡骨魔中毒标记
      setSeats(p => p.map(s => {
        const hasPermanentPoison = s.statusDetails?.includes('永久中毒') || false;
        const hasVigormortisPoison = s.statusDetails?.includes('亡骨魔中毒') || false;
        return {...s, isPoisoned: hasPermanentPoison || hasVigormortisPoison};
      }));
      return;
    }
    
    // 小恶魔选择目标后立即显示确认弹窗
    if(nightInfo.effectiveRole.id === 'imp' && nightInfo.effectiveRole.nightActionType === 'kill' && gamePhase !== 'firstNight' && newT.length > 0) {
      const targetId = newT[newT.length - 1];
      setShowKillConfirmModal(targetId);
      return;
    }
    
    // 1. 统一高亮显示 - 所有选中操作都有视觉反馈
    if(newT.length > 0) {
      const tid = newT[newT.length - 1];
      const action = nightInfo.effectiveRole.nightActionType;
      if(action === 'poison') {
        // 普卡特殊处理：只设置中毒，不立即死亡，并更新上一个中毒目标
        if (nightInfo.effectiveRole.id === 'pukka') {
          // 将目标放入普卡队列：当前夜晚中毒，下一夜死亡
          setPukkaPoisonQueue(prev => {
            const filtered = prev.filter(entry => entry.targetId !== tid);
            return [...filtered, { targetId: tid, nightsUntilDeath: 1 }];
          });
          // 注意：保留永久中毒标记（舞蛇人制造）和亡骨魔中毒标记，同时保留既有的普卡中毒标记
          setSeats(p => p.map(s => {
            const hasPermanentPoison = s.statusDetails?.includes('永久中毒') || false;
            const hasVigormortisPoison = s.statusDetails?.includes('亡骨魔中毒') || false;
            const hasPukkaPoison = s.statusDetails?.includes('普卡中毒') || false;
            const updatedStatusDetails = s.id === tid 
              ? Array.from(new Set([...(s.statusDetails || []), '普卡中毒']))
              : (s.statusDetails || []);
            const shouldBePoisoned = s.id === tid || hasPermanentPoison || hasVigormortisPoison || hasPukkaPoison;
            return {...s, isPoisoned: shouldBePoisoned, statusDetails: updatedStatusDetails};
          }));
          if (nightInfo) {
            // 7. 行动日志去重：移除该玩家之前的操作记录，只保留最新的
            setGameLogs(prev => {
              const filtered = prev.filter(log => 
                !(log.message.includes(`${nightInfo.seat.id+1}号(普卡)`) && log.phase === gamePhase)
              );
              return [...filtered, { day: nightCount, phase: gamePhase, message: `${nightInfo.seat.id+1}号(普卡) 对 ${tid+1}号 下毒` }];
            });
          }
        } else {
          // 其他投毒者（投毒者、夜半狂欢投毒者）的正常处理
          // 注意：保留永久中毒标记（舞蛇人制造）和亡骨魔中毒标记
          setSeats(p => p.map(s => {
            const hasPermanentPoison = s.statusDetails?.includes('永久中毒') || false;
            const hasVigormortisPoison = s.statusDetails?.includes('亡骨魔中毒') || false;
            return {...s, isPoisoned: s.id === tid || hasPermanentPoison || hasVigormortisPoison};
          }));
          if (nightInfo) {
            // 7. 行动日志去重：移除该玩家之前的操作记录，只保留最新的
            setGameLogs(prev => {
              const filtered = prev.filter(log => 
                !(log.message.includes(`${nightInfo.seat.id+1}号(投毒者)`) && log.phase === gamePhase)
              );
              return [...filtered, { day: nightCount, phase: gamePhase, message: `${nightInfo.seat.id+1}号(投毒者) 对 ${tid+1}号 下毒` }];
            });
          }
        }
      }
      if(action === 'protect') {
        if (nightInfo) {
          // 使用nightInfo.isPoisoned和seats状态双重检查，确保判断准确
          const monkSeat = seats.find(s => s.id === nightInfo.seat.id);
          const isMonkPoisoned = nightInfo.isPoisoned || 
                                 (monkSeat ? (monkSeat.isPoisoned || monkSeat.isDrunk || monkSeat.role?.id === "drunk") : false);
          
          // 如果僧侣中毒/醉酒，绝对不能设置保护效果，但可以正常选择玩家
          if (isMonkPoisoned) {
            // 强制清除所有保护状态，确保不会有任何保护效果
            setSeats(p => p.map(s => {
              // 如果这个玩家是被当前僧侣保护的，清除保护
              if (s.protectedBy === nightInfo.seat.id) {
                return {...s, isProtected: false, protectedBy: null};
              }
              return s;
            }));
            // 记录日志：选择但无保护效果
            setGameLogs(prev => {
              const filtered = prev.filter(log => 
                !(log.message.includes(`${nightInfo.seat.id+1}号(僧侣)`) && log.phase === gamePhase)
              );
              return [...filtered, { day: nightCount, phase: gamePhase, message: `${nightInfo.seat.id+1}号(僧侣) 选择保护 ${tid+1}号，但中毒/醉酒状态下无保护效果` }];
            });
          } else {
            // 健康状态下正常保护：先清除所有保护，然后只设置目标玩家的保护
            setSeats(p => {
              const updated = p.map(s => ({...s, isProtected: false, protectedBy: null}));
              return updated.map(s => s.id === tid ? {...s, isProtected: true, protectedBy: nightInfo.seat.id} : s);
            });
            setGameLogs(prev => {
              const filtered = prev.filter(log => 
                !(log.message.includes(`${nightInfo.seat.id+1}号(僧侣)`) && log.phase === gamePhase)
              );
              return [...filtered, { day: nightCount, phase: gamePhase, message: `${nightInfo.seat.id+1}号(僧侣) 保护 ${tid+1}号` }];
            });
          }
        }
      }
      if(action === 'mark' && nightInfo.effectiveRole.id === 'devils_advocate' && newT.length === 1) {
        const targetId = newT[0];
        setSeats(p => p.map(s => {
          const filtered = (s.statuses || []).filter(status => status.effect !== 'ExecutionProof');
          if (s.id === targetId) {
            const nextStatuses: StatusEffect[] = [...filtered, { effect: 'ExecutionProof', duration: '1 Day', sourceId: nightInfo.seat.id }];
            return { ...s, statuses: nextStatuses };
          }
          return { ...s, statuses: filtered };
        }));
        setGameLogs(prev => {
          const filtered = prev.filter(log => 
            !(log.message.includes(`${nightInfo.seat.id+1}号(魔鬼代言人)`) && log.phase === gamePhase)
          );
          return [...filtered, { day: nightCount, phase: gamePhase, message: `${nightInfo.seat.id+1}号(魔鬼代言人) 选择保护 ${targetId+1}号 免于今日处决` }];
        });
      }
      if(action === 'mark' && nightInfo.effectiveRole.id === 'butler') {
        setSeats(p => p.map(s => ({...s, masterId: tid})));
        if (nightInfo) {
          // 7. 行动日志去重
          setGameLogs(prev => {
            const filtered = prev.filter(log => 
              !(log.message.includes(`${nightInfo.seat.id+1}号(管家)`) && log.phase === gamePhase)
            );
            return [...filtered, { day: nightCount, phase: gamePhase, message: `${nightInfo.seat.id+1}号(管家) 选择 ${tid+1}号 为主人` }];
          });
        }
      }
      // 小恶魔需要确认，不立即执行死亡
      if(action === 'kill' && nightInfo.effectiveRole.id === 'imp' && gamePhase !== 'firstNight') {
        // 只更新选择，不执行杀死，等待确认
      }
      // ========== 夜半狂欢角色处理 ==========
      if(action === 'mark' && nightInfo.effectiveRole.id === 'snake_charmer_mr' && newT.length === 1) {
        // 舞蛇人：选择一名玩家，如果选中了恶魔，交换角色和阵营
        const targetSeat = seats.find(s => s.id === newT[0]);
        if (targetSeat && targetSeat.role && (targetSeat.role.type === 'demon' || targetSeat.isDemonSuccessor)) {
          // 选中了恶魔，交换角色和阵营
          const snakeCharmerSeat = nightInfo.seat;
          const demonRole = targetSeat.role;
          const snakeCharmerRole = snakeCharmerSeat.role;
          
          setSeats(p => p.map(s => {
            if (s.id === snakeCharmerSeat.id) {
              return { ...s, role: demonRole, isDemonSuccessor: targetSeat.isDemonSuccessor };
            } else if (s.id === targetSeat.id) {
              // 旧恶魔（新舞蛇人）：永久中毒，使用 statusDetails 标记
              const statusDetails = s.statusDetails || [];
              const hasPermanentPoison = statusDetails.includes('永久中毒');
              return { 
                ...s, 
                role: snakeCharmerRole, 
                isPoisoned: true, 
                isDemonSuccessor: false,
                statusDetails: hasPermanentPoison ? statusDetails : [...statusDetails, '永久中毒']
              };
            }
            return s;
          }));
          
          setGameLogs(prev => [...prev, { 
            day: nightCount, 
            phase: gamePhase, 
            message: `${snakeCharmerSeat.id+1}号(舞蛇人) 选择 ${targetSeat.id+1}号，交换角色和阵营，${targetSeat.id+1}号中毒` 
          }]);
        } else {
          // 没有选中恶魔，只记录选择
          setGameLogs(prev => {
            const filtered = prev.filter(log => 
              !(log.message.includes(`${nightInfo.seat.id+1}号(舞蛇人)`) && log.phase === gamePhase)
            );
            return [...filtered, { day: nightCount, phase: gamePhase, message: `${nightInfo.seat.id+1}号(舞蛇人) 选择 ${newT[0]+1}号` }];
          });
        }
      }
      // 气球驾驶员已改为被动信息技能，不再需要主动选择处理
      if(action === 'kill' && (nightInfo.effectiveRole.id === 'vigormortis_mr' || nightInfo.effectiveRole.id === 'hadesia') && gamePhase !== 'firstNight' && newT.length === 1) {
        // 夜半狂欢恶魔：选择1名玩家后立即显示确认弹窗
        setShowKillConfirmModal(newT[0]);
        return;
      }
      if(action === 'kill' && nightInfo.effectiveRole.id === 'hadesia' && gamePhase !== 'firstNight' && newT.length === 3) {
        // 哈迪寂亚：选择3名玩家后立即显示确认弹窗
        setShowKillConfirmModal(newT[0]); // 使用第一个作为确认，实际处理需要特殊逻辑
        return;
      }
      if(action === 'poison' && nightInfo.effectiveRole.id === 'poisoner_mr' && newT.length > 0) {
        // 夜半狂欢投毒者：选择目标后立即显示确认弹窗
        const targetId = newT[newT.length - 1];
        const target = seats.find(s => s.id === targetId);
        const isEvilPlayer = target && (['minion','demon'].includes(target.role?.type||'') || target.isDemonSuccessor);
        if(isEvilPlayer) {
          setShowPoisonEvilConfirmModal(targetId);
        } else {
          setShowPoisonConfirmModal(targetId);
        }
        // 注意：保留永久中毒标记（舞蛇人制造）和亡骨魔中毒标记
        setSeats(p => p.map(s => {
          const hasPermanentPoison = s.statusDetails?.includes('永久中毒') || false;
          const hasVigormortisPoison = s.statusDetails?.includes('亡骨魔中毒') || false;
          return {...s, isPoisoned: hasPermanentPoison || hasVigormortisPoison};
        }));
        return;
      }
    } else {
      const action = nightInfo.effectiveRole.nightActionType;
      if(action === 'poison') {
        // 注意：保留永久中毒标记（舞蛇人制造）和亡骨魔中毒标记
        setSeats(p => p.map(s => {
          const hasPermanentPoison = s.statusDetails?.includes('永久中毒') || false;
          const hasVigormortisPoison = s.statusDetails?.includes('亡骨魔中毒') || false;
          return {...s, isPoisoned: hasPermanentPoison || hasVigormortisPoison};
        }));
      }
      if(action === 'protect') {
        setSeats(p => p.map(s => ({...s, isProtected: false, protectedBy: null})));
      }
      if(action === 'mark' && nightInfo.effectiveRole.id === 'devils_advocate') {
        setSeats(p => p.map(s => ({
          ...s,
          statuses: (s.statuses || []).filter(status => status.effect !== 'ExecutionProof')
        })));
      }
    }
    
    if(nightInfo.effectiveRole.nightActionType === 'inspect') {
      if (newT.length === 2) {
        // 每次选中两人时，实时重新计算结果，并刷新弹窗动画
        let resultText: string;
        // 先计算真实结果
        // 占卜师判断逻辑：查验2人，若有恶魔/红罗刹则显示"是"，其他显示"否"
        // 使用注册判定：隐士可能被注册为恶魔
        const hasEvil = newT.some(tid => { 
          const t = seats.find(x=>x.id===tid); 
          if (!t || !t.role) return false;
          // 检查是否注册为恶魔（包括隐士的注册判定）
          const registration = getRegistration(
            t,
            nightInfo.effectiveRole,
            spyDisguiseMode,
            spyDisguiseProbability
          );
          const isDemon = registration.registersAsDemon;
          // 检查是否是红罗刹（兼容旧数据：既看 isRedHerring 标记，也看状态文字中是否含"红罗刹"）
          const isRedHerring = t.isRedHerring === true || (t.statusDetails || []).includes("红罗刹");
          return isDemon || isRedHerring;
        });
        
        // 如果占卜师中毒/酒鬼，使用误导性信息生成逻辑
        if (currentHint.isPoisoned) {
          const targetSeat = seats.find(s => s.id === nightInfo.seat.id);
          if (targetSeat) {
            // 判断是否应该显示假信息（根据酒鬼/中毒状态和概率）
            const fakeInfoCheck = drunkFirstInfoRef.current 
              ? shouldShowFakeInfo(targetSeat, drunkFirstInfoRef.current)
              : { showFake: currentHint.isPoisoned, isFirstTime: false };
            
            if (fakeInfoCheck.showFake) {
              // 显示假信息：根据真实结果生成误导性信息
              resultText = getMisinformation.fortuneTeller(hasEvil);
              // 更新缓存的假信息结果
              fakeInspectionResultRef.current = resultText;
            } else {
              // 显示真信息
              resultText = hasEvil ? "✅ 是" : "❌ 否";
            }
          } else {
            resultText = hasEvil ? "✅ 是" : "❌ 否";
          }
        } else {
          // 健康状态：显示真实结果
          resultText = hasEvil ? "✅ 是" : "❌ 否";
        }
        
        // 旧逻辑已移除，保留此注释作为标记
        if (false) {
          // 占卜师判断逻辑：查验2人，若有恶魔/红罗刹则显示"是"，其他显示"否"
          const hasEvil = newT.some(tid => { 
            const t = seats.find(x=>x.id===tid); 
            if (!t || !t.role) return false;
            // 检查是否是恶魔
            const isDemon = t.role.type === 'demon' || t.isDemonSuccessor;
            // 检查是否是红罗刹（兼容旧数据：既看 isRedHerring 标记，也看状态文字中是否含“红罗刹”）
            const isRedHerring = t.isRedHerring === true || (t.statusDetails || []).includes("红罗刹");
            return isDemon || isRedHerring;
          });
          resultText = hasEvil ? "✅ 是" : "❌ 否";
        }
        setInspectionResult(resultText);
        setInspectionResultKey(k => k + 1); // 触发结果弹窗重新挂载，产生“重新浮现”效果

        if (nightInfo) {
          // 行动日志去重：占卜师每次选择都更新日志，只保留最后一次
          addLogWithDeduplication(
            `${nightInfo.seat.id+1}号(占卜师) 查验 ${newT.map(t=>t+1).join('号、')}号 -> ${resultText}`,
            nightInfo.seat.id,
            '占卜师'
          );
      }
    } else {
        // 目标数不足 2 时，清空当前显示结果，等待重新选择
        setInspectionResult(null);
      }
    }
    
    if(nightInfo.effectiveRole.nightActionType === 'inspect_death' && newT.length === 1) {
      const t = seats.find(s=>s.id===newT[0]);
      if (!currentHint.isPoisoned) {
        // 健康状态：直接弹出结果弹窗显示真实身份
        if (t?.role) {
          setShowRavenkeeperResultModal({
            targetId: newT[0],
            roleName: t.role.name,
            isFake: false
          });
        }
      } else {
        // 中毒/醉酒状态：先弹出选择假身份的弹窗
        setShowRavenkeeperFakeModal(newT[0]);
      }
    }
  };

  const handleConfirmAction = () => {
    if(!nightInfo) return;
    
    // 检查是否有待确认的操作（投毒者和恶魔的确认弹窗已在toggleTarget中处理）
    // 如果有打开的确认弹窗，不继续流程
    if(showKillConfirmModal !== null || showPoisonConfirmModal !== null || showPoisonEvilConfirmModal !== null || showHadesiaKillConfirmModal !== null || 
       showRavenkeeperResultModal !== null || showRavenkeeperFakeModal !== null || showMoonchildKillModal !== null) {
      return;
    }
    
    // 没有待确认的操作，继续流程
    continueToNextAction();
  };
  
  const continueToNextAction = () => {
    // 保存历史记录
    saveHistory();
    
    // 检查是否有玩家在夜晚死亡，需要跳过他们的环节（但亡骨魔杀死的爪牙保留能力，需要被唤醒）
    const currentDead = seats.filter(s => {
      const roleId = getSeatRoleId(s);
      const diedTonight = deadThisNight.includes(s.id);
      if (roleId === 'ravenkeeper' && diedTonight) return false;
      return s.isDead && !s.hasAbilityEvenDead;
    });
    setWakeQueueIds(prev => prev.filter(id => !currentDead.find(d => d.id === id)));
    
    // 如果当前玩家已死亡（且不保留能力），跳过到下一个
    const currentId = wakeQueueIds[currentWakeIndex];
    const currentSeat = currentId !== undefined ? seats.find(s => s.id === currentId) : null;
    const currentRoleId = getSeatRoleId(currentSeat);
    const currentDiedTonight = currentSeat ? deadThisNight.includes(currentSeat.id) : false;
    if (currentId !== undefined && currentSeat?.isDead && !currentSeat.hasAbilityEvenDead && !(currentRoleId === 'ravenkeeper' && currentDiedTonight)) {
        setCurrentWakeIndex(p => p + 1);
        setInspectionResult(null);
        setSelectedActionTargets([]);
        fakeInspectionResultRef.current = null;
        return;
    }
    
    if(currentWakeIndex < wakeQueueIds.length - 1) { 
      setCurrentWakeIndex(p => p + 1); 
      setInspectionResult(null);
      setSelectedActionTargets([]);
      fakeInspectionResultRef.current = null;
    } else {
      // 夜晚结束，显示死亡报告
      // 检测夜晚期间死亡的玩家（通过deadThisNight记录）
      if(deadThisNight.length > 0) {
        const deadNames = deadThisNight.map(id => `${id+1}号`).join('、');
        setShowNightDeathReportModal(`昨晚${deadNames}玩家死亡`);
      } else {
        setShowNightDeathReportModal("昨天是个平安夜");
      }
    }
  };
  
  // 确认夜晚死亡报告后进入白天
  const confirmNightDeathReport = () => {
    setShowNightDeathReportModal(null);
    
    // 白天开始：清理仅限夜晚的状态，但保留魔鬼代言人的跨日保护
    cleanStatusesForNewDay();
    
    // 清除所有保护状态（僧侣的保护只在夜晚有效）
    setSeats(p => p.map(s => ({...s, isProtected: false, protectedBy: null})));
    
    // 检查罂粟种植者是否死亡，如果死亡，告知爪牙和恶魔彼此
    const poppyGrower = seats.find(s => s.role?.id === 'poppy_grower');
    if (poppyGrower && poppyGrower.isDead && !poppyGrowerDead) {
      setPoppyGrowerDead(true);
      const minions = seats.filter(s => s.role?.type === 'minion' && !s.isDead);
      const demons = seats.filter(s => (s.role?.type === 'demon' || s.isDemonSuccessor) && !s.isDead);
      const minionNames = minions.map(s => `${s.id+1}号`).join('、');
      const demonNames = demons.map(s => `${s.id+1}号`).join('、');
      if (minions.length > 0 && demons.length > 0) {
        addLog(`罂粟种植者已死亡，爪牙(${minionNames})和恶魔(${demonNames})现在得知彼此`);
      }
    }
    
    // 检查农夫是否在夜晚死亡，如果死亡，转换一名善良玩家为农夫
    const deadFarmer = deadThisNight.find(id => {
      const seat = seats.find(s => s.id === id);
      return seat?.role?.id === 'farmer';
    });
    if (deadFarmer !== undefined) {
      const aliveGood = seats.filter(s => 
        !s.isDead && 
        s.id !== deadFarmer &&
        (s.role?.type === 'townsfolk' || s.role?.type === 'outsider')
      );
      if (aliveGood.length > 0) {
        const newFarmer = getRandom(aliveGood);
        const farmerRole = roles.find(r => r.id === 'farmer');
        setSeats(p => p.map(s => 
          s.id === newFarmer.id ? { ...s, role: farmerRole || s.role } : s
        ));
        addLog(`${deadFarmer+1}号(农夫)在夜晚死亡，${newFarmer.id+1}号变成农夫`);
      }
    }
    
    setDeadThisNight([]); // 清空夜晚死亡记录
    // 使用seatsRef确保获取最新的seats状态，然后检查游戏结束条件
    const currentSeats = seatsRef.current;
    // 检查游戏结束条件（包括存活人数）
    if (checkGameOver(currentSeats)) {
      return;
    }
    setGamePhase("day");
  };
  
  const getDemonDisplayName = (roleId?: string, fallbackName?: string) => {
    switch (roleId) {
      case 'hadesia': return '哈迪寂亚';
      case 'vigormortis_mr': return '亡骨魔';
      case 'imp': return '小恶魔';
      case 'zombuul': return '僵怖';
      case 'shabaloth': return '沙巴洛斯';
      case 'fang_gu': return '方古';
      case 'vigormortis': return '亡骨魔';
      case 'no_dashii': return '诺-达';
      case 'vortox': return '涡流';
      case 'po': return '珀';
      default: return fallbackName || '恶魔';
    }
  };

  type KillPlayerOptions = {
    recordNightDeath?: boolean;
    keepInWakeQueue?: boolean;
    seatTransformer?: (seat: Seat) => Seat;
    skipGameOverCheck?: boolean;
    executedPlayerId?: number | null;
    onAfterKill?: (latestSeats: Seat[]) => void;
  };

  const killPlayer = useCallback(
    (targetId: number, options: KillPlayerOptions = {}) => {
      const seatsSnapshot = seatsRef.current || seats;
      const targetSeat = seatsSnapshot.find(s => s.id === targetId);
      if (!targetSeat) return;

      // 茶艺师动态保护：实时计算邻座是否提供保护
      if (hasTeaLadyProtection(targetSeat, seatsSnapshot)) {
        addLog(`${targetId + 1}号 被茶艺师保护，未死亡`);
        return;
      }

      const {
        recordNightDeath = true,
        keepInWakeQueue = false,
        seatTransformer,
        skipGameOverCheck,
        executedPlayerId = null,
        onAfterKill,
      } = options;

      const shouldSkipGameOver = skipGameOverCheck ?? targetSeat.role?.id === 'moonchild';

      let updatedSeats: Seat[] = [];
      setSeats(prev => {
        updatedSeats = prev.map(s => {
          if (s.id !== targetId) return s;
          let next: Seat = { ...s, isDead: true };
          // 僵怖假死状态再次被杀死：算作真正死亡
          if (s.role?.id === 'zombuul' && s.isFirstDeathForZombuul && !s.isZombuulTrulyDead) {
            next = { ...next, isZombuulTrulyDead: true };
          }
          if (seatTransformer) {
            next = seatTransformer(next);
          }
          return next;
        });
        return updatedSeats;
      });

      if (!keepInWakeQueue) {
        setWakeQueueIds(prev => prev.filter(id => id !== targetId));
      }

      if (recordNightDeath) {
        setDeadThisNight(prev => (prev.includes(targetId) ? prev : [...prev, targetId]));
      }

      enqueueRavenkeeperIfNeeded(targetId);

      const finalize = (latestSeats?: Seat[]) => {
        const seatsToUse = latestSeats || updatedSeats;
        if (!shouldSkipGameOver) {
          moonchildChainPendingRef.current = false;
          checkGameOver(seatsToUse, executedPlayerId);
        }
        onAfterKill?.(seatsToUse);
      };

      if (targetSeat.role?.id === 'moonchild') {
        moonchildChainPendingRef.current = true;
        setShowMoonchildKillModal({
          sourceId: targetId,
          onResolve: finalize,
        });
        return;
      }

      finalize(updatedSeats);
    },
    [seats, enqueueRavenkeeperIfNeeded, checkGameOver]
  );

  type KillProcessResult = 'pending' | 'resolved';

  const processDemonKill = (
    targetId: number,
    options: { skipMayorRedirectCheck?: boolean; mayorId?: number | null } = {}
  ): KillProcessResult => {
    if (!nightInfo) return 'resolved';
    const seatsSnapshot = seatsRef.current || seats;
    const target = seatsSnapshot.find(s => s.id === targetId);
    if (!target) return 'resolved';

    // 检查保护是否有效：如果被保护，必须检查保护者（僧侣）是否中毒/醉酒
    let isEffectivelyProtected = false;
    if (target.isProtected && target.protectedBy !== null) {
      const protector = seatsSnapshot.find(s => s.id === target.protectedBy);
      if (protector) {
        // 如果保护者中毒/醉酒，保护绝对无效，无论isProtected是否为true
        const isProtectorPoisoned = protector.isPoisoned || protector.isDrunk || protector.role?.id === "drunk";
        if (isProtectorPoisoned) {
          // 保护者中毒/醉酒，保护无效，同时清除错误的保护状态
          isEffectivelyProtected = false;
          setSeats(p => p.map(s => 
            s.id === targetId ? {...s, isProtected: false, protectedBy: null} : s
          ));
        } else {
          // 保护者健康，保护有效
          isEffectivelyProtected = true;
        }
      } else {
        // 保护者不存在，保护无效
        isEffectivelyProtected = false;
      }
    }
    const teaLadyProtected = hasTeaLadyProtection(target, seatsSnapshot);
    // 如果玩家被保护，记录日志说明保护生效（僧侣的保护对所有恶魔都有效）
    if (isEffectivelyProtected) {
      const protector = seatsSnapshot.find(s => s.id === target.protectedBy);
      const demonName = getDemonDisplayName(nightInfo.effectiveRole.id, nightInfo.effectiveRole.name);
      if (protector) {
        addLogWithDeduplication(
          `${nightInfo.seat.id+1}号(${demonName}) 试图杀害 ${targetId+1}号，但 ${targetId+1}号 被 ${protector.id+1}号(僧侣) 保护`,
          nightInfo.seat.id,
          demonName
        );
      }
    }
    if (teaLadyProtected) {
      addLog(`${targetId+1}号 被茶艺师保护，未被夜晚杀害`);
    }
    
    // 检查目标是否可以被杀死：僵怖假死状态可以被杀死
    const canBeKilled = target && !isEffectivelyProtected && !teaLadyProtected && target.role?.id !== 'soldier' && 
      (!target.isDead || (target.role?.id === 'zombuul' && target.isFirstDeathForZombuul && !target.isZombuulTrulyDead));

    // 市长特殊处理：允许死亡转移
    if (canBeKilled && !options.skipMayorRedirectCheck && target.role?.id === 'mayor') {
      const aliveCandidates = seats.filter(s => !s.isDead && s.id !== targetId);
      if (aliveCandidates.length > 0) {
        setMayorRedirectTarget(null);
        setShowKillConfirmModal(null);
        setShowMayorRedirectModal({
          targetId,
          demonName: getDemonDisplayName(nightInfo.effectiveRole.id, nightInfo.effectiveRole.name)
        });
        return 'pending';
      }
    }
    
    const mayorNote = options.mayorId !== undefined && options.mayorId !== null 
      ? `（由${options.mayorId + 1}号市长转移）`
      : '';

    if(canBeKilled) {
      // 夜半狂欢亡骨魔特殊处理：杀死爪牙时，爪牙保留能力，且邻近的两名镇民之一中毒
      if (nightInfo.effectiveRole.id === 'vigormortis_mr' && target.role?.type === 'minion') {
        // 找到邻近的两名镇民
        const targetIndex = seats.findIndex(s => s.id === targetId);
        const totalSeats = seats.length;
        const leftIndex = (targetIndex - 1 + totalSeats) % totalSeats;
        const rightIndex = (targetIndex + 1) % totalSeats;
        const leftNeighbor = seats[leftIndex];
        const rightNeighbor = seats[rightIndex];
        const townsfolkNeighbors = [leftNeighbor, rightNeighbor].filter(s => 
          s.role?.type === 'townsfolk' && !s.isDead
        );
        
        // 随机选择一名镇民中毒
        const poisonedNeighbor = townsfolkNeighbors.length > 0 ? getRandom(townsfolkNeighbors) : null;
        
        if (poisonedNeighbor) {
          setSeats(p => p.map(s => {
            if (s.id === poisonedNeighbor.id) {
              const statusDetails = [...(s.statusDetails || [])];
              if (!statusDetails.includes('亡骨魔中毒')) {
                statusDetails.push('亡骨魔中毒');
              }
              return { ...s, isPoisoned: true, statusDetails };
            }
            return s;
          }));
        }

        killPlayer(targetId, {
          keepInWakeQueue: true, // 保留能力，需要夜晚继续唤醒
          seatTransformer: seat => ({ ...seat, hasAbilityEvenDead: true }),
          onAfterKill: () => {
            if (nightInfo) {
              addLogWithDeduplication(
                `${nightInfo.seat.id+1}号(亡骨魔) 杀害 ${targetId+1}号(爪牙)${mayorNote}，爪牙保留能力${poisonedNeighbor ? `，${poisonedNeighbor.id+1}号(邻近镇民)中毒` : ''}`,
                nightInfo.seat.id,
                '亡骨魔'
              );
            }
          }
        });
      } else {
        // 正常杀死其他玩家
        killPlayer(targetId, {
          onAfterKill: () => {
            if (nightInfo) {
              const demonName = getDemonDisplayName(nightInfo.effectiveRole.id, nightInfo.effectiveRole.name);
              addLogWithDeduplication(
                `${nightInfo.seat.id+1}号(${demonName}) 杀害 ${targetId+1}号${mayorNote}，${targetId+1}号已在夜晚死亡`,
                nightInfo.seat.id,
                demonName
              );
            }
          }
        });
      }
    }
    return 'resolved';
  };

  // 确认杀死玩家
  const confirmKill = () => {
    if(!nightInfo || showKillConfirmModal === null) return;
    const targetId = showKillConfirmModal;
    const impSeat = nightInfo.seat;
    
    // 如果小恶魔选择自己，触发身份转移
    if (targetId === impSeat.id && nightInfo.effectiveRole.id === 'imp') {
      // 找到所有活着的爪牙
      const aliveMinions = seats.filter(s => 
        s.role?.type === 'minion' && 
        !s.isDead && 
        s.id !== impSeat.id
      );
      
      if (aliveMinions.length > 0) {
        // 随机选择一个爪牙作为新的小恶魔
        const newImp = getRandom(aliveMinions);
        const newImpRole = roles.find(r => r.id === 'imp');
        
        setSeats(p => {
          const updated = p.map(s => {
            if (s.id === impSeat.id) {
              // 原小恶魔死亡
              return { ...s, isDead: true };
            } else if (s.id === newImp.id) {
              // 新小恶魔：标记为恶魔继任者，更新角色为小恶魔，添加"小恶魔（传）"标记
              const statusDetails = [...(s.statusDetails || []), '小恶魔（传）'];
              return { 
                ...s, 
                role: newImpRole || s.role,
                isDemonSuccessor: true,
                statusDetails: statusDetails
              };
            }
            return s;
          });
          
          // 从唤醒队列中移除已死亡的原小恶魔
          setWakeQueueIds(prev => prev.filter(id => id !== impSeat.id));
          
          // 检查游戏结束（不应该结束，因为新小恶魔还在）
          checkGameOver(updated);
          return updated;
        });
        
        // 记录原小恶魔的死亡
        setDeadThisNight(p => [...p, impSeat.id]);
        enqueueRavenkeeperIfNeeded(impSeat.id);
        
        if (nightInfo) {
          addLogWithDeduplication(
            `${impSeat.id+1}号(小恶魔) 选择自己，身份转移给 ${newImp.id+1}号(${newImp.role?.name})，${impSeat.id+1}号已在夜晚死亡`,
            impSeat.id,
            '小恶魔'
          );
          
          // 显眼的高亮提示：提醒说书人唤醒新恶魔玩家
          console.warn('%c⚠️ 重要提醒：小恶魔传位成功 ⚠️', 'color: #FFD700; font-size: 20px; font-weight: bold; background: #1a1a1a; padding: 10px; border: 3px solid #FFD700;');
          console.warn(`%c请立即唤醒 ${newImp.id+1}号玩家，向其出示"你是小恶魔"卡牌！`, 'color: #FF6B6B; font-size: 16px; font-weight: bold; background: #1a1a1a; padding: 8px;');
          console.warn(`%c注意：新恶魔今晚不行动，从下一夜开始才会进入唤醒队列。`, 'color: #4ECDC4; font-size: 14px; background: #1a1a1a; padding: 5px;');
        }
      } else {
        // 如果没有活着的爪牙，小恶魔不能选择自己
        alert("场上没有活着的爪牙，无法转移身份");
        setShowKillConfirmModal(null);
        return;
      }
    } else {
      const result = processDemonKill(targetId);
      if (result === 'pending') return;
    }
    setShowKillConfirmModal(null);
    if (moonchildChainPendingRef.current) return;
    continueToNextAction();
  };

  const confirmMayorRedirect = (redirectTargetId: number | null) => {
    if (!nightInfo || !showMayorRedirectModal) return;
    const mayorId = showMayorRedirectModal.targetId;
    const demonName = showMayorRedirectModal.demonName;

    setShowMayorRedirectModal(null);

    if (redirectTargetId === null) {
      // 不转移，市长自己死亡
      processDemonKill(mayorId, { skipMayorRedirectCheck: true });
      setShowKillConfirmModal(null);
      continueToNextAction();
      return;
    }

    addLogWithDeduplication(
      `${nightInfo.seat.id+1}号(${demonName}) 攻击市长 ${mayorId+1}号，死亡转移给 ${redirectTargetId+1}号`,
      nightInfo.seat.id,
      demonName
    );

    processDemonKill(redirectTargetId, { skipMayorRedirectCheck: true, mayorId });
    setShowKillConfirmModal(null);
    if (moonchildChainPendingRef.current) return;
    continueToNextAction();
  };

  // 确认哈迪寂亚杀死3名玩家
  const confirmHadesiaKill = () => {
    if(!nightInfo || !showHadesiaKillConfirmModal || showHadesiaKillConfirmModal.length !== 3) return;
    const targetIds = showHadesiaKillConfirmModal;
    
    // 哈迪寂亚：三名玩家秘密决定自己的命运，如果他们全部存活，他们全部死亡
    // 这里简化处理：说书人需要手动决定哪些玩家死亡
    // 所有玩家都会得知哈迪寂亚选择了谁
    const targetNames = targetIds.map(id => `${id+1}号`).join('、');
    addLog(`${nightInfo.seat.id+1}号(哈迪寂亚) 选择了 ${targetNames}，所有玩家都会得知这个选择`);
    addLog(`请说书人决定 ${targetNames} 的命运。如果他们全部存活，他们全部死亡。`);
    
    // 这里需要说书人手动处理，暂时只记录日志
    setShowHadesiaKillConfirmModal(null);
    setSelectedActionTargets([]);
    continueToNextAction();
  };

  const confirmMoonchildKill = (targetId: number) => {
    if (!showMoonchildKillModal) return;
    const { sourceId, onResolve } = showMoonchildKillModal;
    setShowMoonchildKillModal(null);

    addLog(`${sourceId + 1}号(月之子) 选择 ${targetId + 1}号 与其陪葬`);

    killPlayer(targetId, {
      onAfterKill: latestSeats => {
        onResolve?.(latestSeats);
        if (!moonchildChainPendingRef.current) {
          continueToNextAction();
        }
      }
    });
  };
  
  // 确认下毒（善良玩家）
  const confirmPoison = () => {
    const targetId = showPoisonConfirmModal;
    if(!nightInfo || targetId === null) return;
    
    // 注意：保留永久中毒标记（舞蛇人制造）和亡骨魔中毒标记
    setSeats(p => p.map(s => {
      const hasPermanentPoison = s.statusDetails?.includes('永久中毒') || false;
      const hasVigormortisPoison = s.statusDetails?.includes('亡骨魔中毒') || false;
      return {...s, isPoisoned: s.id === targetId || hasPermanentPoison || hasVigormortisPoison};
    }));
    addLogWithDeduplication(
      `${nightInfo.seat.id+1}号(投毒者) 对 ${targetId+1}号 下毒`,
      nightInfo.seat.id,
      '投毒者'
    );
    setShowPoisonConfirmModal(null);
    setSelectedActionTargets([]);
    continueToNextAction();
  };
  
  // 确认对邪恶玩家下毒（二次确认）
  const confirmPoisonEvil = () => {
    const targetId = showPoisonEvilConfirmModal;
    if(!nightInfo || targetId === null) return;
    
    // 注意：保留永久中毒标记（舞蛇人制造）和亡骨魔中毒标记
    setSeats(p => p.map(s => {
      const hasPermanentPoison = s.statusDetails?.includes('永久中毒') || false;
      const hasVigormortisPoison = s.statusDetails?.includes('亡骨魔中毒') || false;
      return {...s, isPoisoned: s.id === targetId || hasPermanentPoison || hasVigormortisPoison};
    }));
    addLogWithDeduplication(
      `${nightInfo.seat.id+1}号(投毒者) 对 ${targetId+1}号(队友) 下毒`,
      nightInfo.seat.id,
      '投毒者'
    );
    setShowPoisonEvilConfirmModal(null);
    setSelectedActionTargets([]);
    continueToNextAction();
  };

  const executePlayer = (id: number) => {
    const seatsSnapshot = seatsRef.current || seats;
    const t = seatsSnapshot.find(s => s.id === id);
    if (!t) return;

    // 茶艺师动态保护：邻座善良茶艺师保护的善良玩家无法被处决
    if (hasTeaLadyProtection(t, seatsSnapshot)) {
      addLog(`${id+1}号 被茶艺师保护，处决无效`);
      setExecutedPlayerId(id);
      setCurrentDuskExecution(id);
      return;
    }
    
    // 魔鬼代言人保护：当日处决免疫
    if (hasExecutionProof(t)) {
      addLog(`${id+1}号 受到魔鬼代言人保护，处决无效`);
      setExecutedPlayerId(id);
      setCurrentDuskExecution(id);
      return;
    }
    
    const isZombuul = t.role?.id === 'zombuul';
    const zombuulLives = t.zombuulLives ?? 1;
    
    const markDeath = (overrides: Partial<Seat> = {}) =>
      seats.map(s => s.id === id ? { ...s, isDead: true, ...overrides } : s);
    
    // 僵怖第一次被处决：假死，保留夜间行动，但消耗一次僵怖生命
    if (isZombuul && zombuulLives > 0 && !t.isZombuulTrulyDead && !t.isFirstDeathForZombuul) {
      const updatedSeats = seats.map(s => {
        if (s.id !== id) return s;
        const details = s.statusDetails || [];
        const hasFakeDeathTag = details.includes('僵怖假死');
        return {
          ...s,
          // UI 可以通过状态标签体现假死，但逻辑上仍视为存活
          isDead: false,
          isFirstDeathForZombuul: true,
          isZombuulTrulyDead: false,
          zombuulLives: Math.max(0, zombuulLives - 1),
          statusDetails: hasFakeDeathTag ? details : [...details, '僵怖假死']
        };
      });
      
      setSeats(updatedSeats);
      addLog(`${id+1}号(僵怖) 被处决（假死，游戏继续）`);
      setExecutedPlayerId(id);
      setCurrentDuskExecution(id);
      
      // 检查其他即时结束条件（如圣徒），正常情况下不会结束
      if (checkGameOver(updatedSeats, id)) {
        return;
      }
      
      setTimeout(() => {
        startNight(false);
      }, 500);
      return;
    }
    
    // 10. 检查小恶魔是否被处决 - 先检查红唇女郎
    let newSeats = markDeath(isZombuul ? { isZombuulTrulyDead: true, zombuulLives: 0 } : {});
    
    // 优先检查：圣徒被处决导致邪恶方获胜（优先级高于恶魔死亡判定）
    // 这个检查必须在恶魔死亡检查之前，确保圣徒被处决的判定优先级更高
    // 虽然通常不会同时发生，但在复杂结算中要注意优先级
    if (t?.role?.id === 'saint' && !t.isPoisoned) {
      setSeats(newSeats);
      addLog(`${id+1}号 被处决`);
      setExecutedPlayerId(id);
      setCurrentDuskExecution(id);
      setWinResult('evil');
      setWinReason('圣徒被处决');
      setGamePhase('gameOver');
      addLog("游戏结束：圣徒被处决，邪恶胜利");
      return;
    }
    
    // 10. 立即检查恶魔是否死亡（包括所有恶魔类型）
    if ((t.role?.type === 'demon' || t.isDemonSuccessor)) {
      // 僵怖特殊处理：耗尽僵怖生命后再被处决才算真正死亡
      if (isZombuul) {
        const updatedSeats = newSeats.map(s => 
          s.id === id ? { ...s, isZombuulTrulyDead: true, zombuulLives: 0 } : s
        );
        setSeats(updatedSeats);
        addLog(`${id+1}号(僵怖) 被处决（真正死亡）`);
        setWinResult('good');
        setWinReason('僵怖被处决');
        setGamePhase('gameOver');
        addLog("游戏结束：僵怖被处决，好人胜利");
        setExecutedPlayerId(id);
        setCurrentDuskExecution(id);
        return;
      }
      
      // 计算处决后的存活玩家数量
      const aliveCount = newSeats.filter(s => !s.isDead).length;
      
      // 检查红唇女郎是否可以变成恶魔
      const scarletWoman = newSeats.find(s => 
        s.role?.id === 'scarlet_woman' && !s.isDead && !s.isDemonSuccessor
      );
      
      // 如果存活玩家数量 >= 5 且红唇女郎存活，让红唇女郎变成恶魔
      if (aliveCount >= 5 && scarletWoman) {
        // 获取被处决的恶魔角色
        const demonRole = t.role;
        if (demonRole) {
          // 将红唇女郎变成恶魔
          const updatedSeats = newSeats.map(s => {
            if (s.id === scarletWoman.id) {
              const statusDetails = [...(s.statusDetails || []), '恶魔（传）'];
              return {
                ...s,
                role: demonRole,
                isDemonSuccessor: true,
                statusDetails: statusDetails
              };
            }
            return s;
          });
          
          setSeats(updatedSeats);
          addLog(`${id+1}号(${demonRole.name}) 被处决`);
          addLog(`${scarletWoman.id+1}号(红唇女郎) 变成新的${demonRole.name}`);
          
          // 继续游戏，不触发游戏结束
          setExecutedPlayerId(id);
          setCurrentDuskExecution(id);
          
          // 检查游戏结束条件（不应该结束，因为新恶魔还在）
          if (checkGameOver(updatedSeats)) {
            return;
          }
          
          // 进入下一个夜晚
          setTimeout(() => {
            startNight(false);
          }, 500);
          return;
        }
      }
      
      // 如果不满足红唇女郎变身条件，判定好人胜利
      setSeats(newSeats);
      addLog(`${id+1}号(${t.role?.name || '小恶魔'}) 被处决`);
      setWinResult('good');
      setWinReason(`${t.role?.name || '小恶魔'}被处决`);
      setGamePhase('gameOver');
      addLog("游戏结束：恶魔被处决，好人胜利");
      return;
    }
    
    // 无神论者特殊处理：如果说书人被处决（这里用特殊标记表示），好人获胜
    // 注意：实际游戏中，说书人不会被处决，这里只是逻辑标记
    if (t?.role?.id === 'atheist') {
      // 无神论者被处决时，检查是否有特殊标记表示"说书人被处决"
      // 实际游戏中需要说书人手动标记
      // 这里简化处理：如果无神论者被处决，说书人可以手动触发好人获胜
      addLog(`${id+1}号(无神论者) 被处决。如果说书人被处决，好人阵营获胜。`);
    }
    
    // 食人族：获得最后被处决玩家的能力
    const cannibal = seats.find(s => s.role?.id === 'cannibal' && !s.isDead);
    if (cannibal && t && t.role) {
      // 检查被处决的玩家是否是邪恶阵营
      const roleType = t.role.type as RoleType;
      const isEvilExecuted = (roleType === 'demon' || roleType === 'minion' || t.isDemonSuccessor);
      setSeats(p => p.map(s => {
        if (s.id === cannibal.id) {
          // 检查是否有永久中毒（舞蛇人制造）或亡骨魔中毒
          // 这些永久中毒不能被食人族的能力清除
          const hasPermanentPoison = s.statusDetails?.includes('永久中毒') || false;
          const hasVigormortisPoison = s.statusDetails?.includes('亡骨魔中毒') || false;
          // 如果被处决的是善良玩家，清除临时中毒（食人族能力造成的中毒）
          // 但必须保留永久中毒和亡骨魔中毒
          // 如果被处决的是邪恶玩家，设置临时中毒，但也要保留永久中毒
          const shouldBePoisoned = isEvilExecuted || hasPermanentPoison || hasVigormortisPoison;
          return { 
            ...s, 
            isPoisoned: shouldBePoisoned,
            // 记录最后被处决的玩家ID，用于后续能力处理
            masterId: id
          };
        }
        return s;
      }));
      if (isEvilExecuted) {
        addLog(`${cannibal.id+1}号(食人族) 获得 ${id+1}号的能力，但因该玩家是邪恶的，食人族中毒直到下一个善良玩家被处决`);
      } else {
        addLog(`${cannibal.id+1}号(食人族) 获得 ${id+1}号的能力`);
      }
    }
    
    setSeats(newSeats);
    addLog(`${id+1}号 被处决`); 
    setExecutedPlayerId(id);
    // 10. 记录当前黄昏的处决（用于送葬者）
    // 这个记录会在进入下一个黄昏时，更新为lastDuskExecution
    setCurrentDuskExecution(id);
    
    // 立即检查游戏结束条件（包括存活人数和恶魔死亡）
    // 注意：圣徒被处决的检查已经在前面优先处理了，checkGameOver 内部也会检查作为双重保障
    if (checkGameOver(newSeats, id)) {
      return;
    }
    
    // 无神论者特殊胜利条件：如果说书人被处决，好人阵营获胜
    // 注意：这里需要说书人手动标记"说书人被处决"
    // 暂时不自动触发，需要说书人手动处理
    
    // 5. 屏蔽浏览器弹窗，直接进入夜晚
    setTimeout(() => { 
      startNight(false); 
    }, 500);
  };

  const handleDayAction = (id: number) => {
    if(!showDayActionModal) return;
    const {type, sourceId} = showDayActionModal; 
    setShowDayActionModal(null);
    if(type==='nominate') {
      // 8. 检查提名限制
      if (nominationRecords.nominators.has(sourceId)) {
        // 5. 屏蔽浏览器弹窗
        return;
      }
      if (nominationRecords.nominees.has(id)) {
        // 5. 屏蔽浏览器弹窗
        return;
      }
      
      // 贞洁者（处女）逻辑处理
      // 规则：当你第一次被提名时，如果提名你的玩家是镇民，他立刻被处决。
      // 关键点：无论提名者是谁，只要处女被提名，技能就必须永久失效（即使不触发处决）
      const target = seats.find(s => s.id === id);
      const nominatorSeat = seats.find(s => s.id === sourceId);
      
      // 检查是否是处女且是首次被提名（无论提名者是谁，只要被提名过就标记）
      if (target?.role?.id === 'virgin' && !target.hasBeenNominated && !target.isPoisoned) {
        // 【关键修复】无论提名者是谁（镇民、外来者、爪牙、恶魔），只要处女被提名，
        // 就必须立即标记技能已使用（hasUsedVirginAbility = true）和已提名（hasBeenNominated = true）
        // 这是官方规则要求：技能在第一次被提名时强制结算，之后永久失效
        const updatedSeats = seats.map(s => 
          s.id === id ? { ...s, hasBeenNominated: true, hasUsedVirginAbility: true } : s
        );
        
        // 检查提名者是否是真正的镇民（不是酒鬼伪装的）
        // 注意：即使提名者是中毒状态，也会被立即处决
        const isRealTownsfolk = nominatorSeat && 
                                nominatorSeat.role?.type === 'townsfolk' && 
                                nominatorSeat.role?.id !== 'drunk' &&
                                !nominatorSeat.isDrunk;
        
        if (isRealTownsfolk) {
          // 情况1：提名者是镇民 -> 触发处决，提名者立即死亡
          // 贞洁者首次被提名且提名者是镇民，立即处决提名者（无视任何规则，包括中毒状态），并立即进入下一个黑夜
          const finalSeats = updatedSeats.map(s => 
            s.id === sourceId ? { ...s, isDead: true } : s
          );
          setSeats(finalSeats);
          addLog(`${sourceId+1}号 提名 ${id+1}号`);
          addLog(`${sourceId+1}号 提名贞洁者被处决`);
          // 优先检查：圣徒被处决导致邪恶方获胜（优先级高于其他检查）
          const executedPlayer = finalSeats.find(s => s.id === sourceId);
          if (executedPlayer && executedPlayer.role?.id === 'saint' && !executedPlayer.isPoisoned) {
            setWinResult('evil');
            setWinReason('圣徒被处决');
            setGamePhase('gameOver');
            addLog("游戏结束：圣徒被处决，邪恶胜利");
            return;
          }
          // 检查游戏结束条件
          if (checkGameOver(finalSeats, sourceId)) {
            return;
          }
          // 贞洁者触发后，显示弹窗，点击确认后进入下一个黑夜
          setShowExecutionResultModal({ message: `${sourceId+1}号玩家被处决`, isVirginTrigger: true });
          return;
        } else {
          // 情况2：提名者不是镇民（外来者、爪牙、恶魔等）-> 不触发处决，但技能已永久失效
          // 重要：即使技能不触发，hasUsedVirginAbility 和 hasBeenNominated 已经在上面设置为 true
          // 后续真正的镇民再次提名处女时，技能不会再触发（因为 hasUsedVirginAbility 已经是 true）
          setSeats(updatedSeats);
          // 继续正常的提名流程（不在这里记录日志，让后面的代码统一处理）
        }
      }
      
      // 魔像特殊逻辑：如果提名的玩家不是恶魔，他死亡
      if (nominatorSeat?.role?.id === 'golem') {
        const target = seats.find(s => s.id === id);
        const isDemon = target && (target.role?.type === 'demon' || target.isDemonSuccessor);
        if (!isDemon) {
          // 不是恶魔，目标死亡
          setSeats(p => p.map(s => s.id === id ? { ...s, isDead: true } : s));
          addLog(`${sourceId+1}号(魔像) 提名 ${id+1}号，${id+1}号不是恶魔，${id+1}号死亡`);
          // 检查游戏结束
          const updatedSeats = seats.map(s => s.id === id ? { ...s, isDead: true } : s);
          // 优先检查：圣徒被处决导致邪恶方获胜（优先级高于其他检查）
          const executedPlayer = updatedSeats.find(s => s.id === id);
          if (executedPlayer && executedPlayer.role?.id === 'saint' && !executedPlayer.isPoisoned) {
            setWinResult('evil');
            setWinReason('圣徒被处决');
            setGamePhase('gameOver');
            addLog("游戏结束：圣徒被处决，邪恶胜利");
            return;
          }
          if (checkGameOver(updatedSeats, id)) {
            return;
          }
          // 标记魔像已使用能力
          setSeats(p => p.map(s => s.id === sourceId ? { ...s, hasUsedSlayerAbility: true } : s));
          return;
        }
        // 是恶魔，正常提名流程
        setSeats(p => p.map(s => s.id === sourceId ? { ...s, hasUsedSlayerAbility: true } : s));
      }
      
      // 更新提名记录
      setNominationRecords(prev => ({
        nominators: new Set(prev.nominators).add(sourceId),
        nominees: new Set(prev.nominees).add(id)
      }));
      addLog(`${sourceId+1}号 提名 ${id+1}号`); 
      setVoteInputValue('');
      setShowVoteErrorToast(false);
      setShowVoteInputModal(id);
    } else if(type==='slayer') {
      // 开枪可以在任意环节，但只有健康猎手选中恶魔才有效
      const shooter = seats.find(s => s.id === sourceId);
      if (!shooter || shooter.hasUsedSlayerAbility) return;
      // 死亡的猎手不能行动
      if (shooter.isDead) {
        addLog(`${sourceId+1}号 已死亡，无法开枪`);
        setShowShootResultModal({ message: "无事发生（射手已死亡）", isDemonDead: false });
        return;
      }
      
      const target = seats.find(s => s.id === id);
      if (!target) return;
      
      // 标记为已使用开枪能力
      setSeats(p => p.map(s => s.id === sourceId ? { ...s, hasUsedSlayerAbility: true } : s));
      
      // 对尸体开枪：能力被消耗，但无效果
      if (target.isDead) {
        addLog(`${sourceId+1}号 对 ${id+1}号的尸体开枪，未产生效果`);
        setShowShootResultModal({ message: "无事发生（目标已死亡）", isDemonDead: false });
        return;
      }
      
      // 只有健康状态的真正猎手选中恶魔才有效
      const isRealSlayer = shooter.role?.id === 'slayer' && !shooter.isPoisoned && !shooter.isDead;
      const targetRegistration = getRegistration(
        target,
        shooter.role,
        spyDisguiseMode,
        spyDisguiseProbability
      );
      const isDemon = targetRegistration.registersAsDemon;
      
      if (isRealSlayer && isDemon) {
        // 恶魔死亡，游戏立即结束
        setSeats(p => {
          const newSeats = p.map(s => s.id === id ? { ...s, isDead: true } : s);
          addLog(`${sourceId+1}号(猎手) 开枪击杀 ${id+1}号(小恶魔)`);
          checkGameOver(newSeats);
          return newSeats;
        });
        // 显示弹窗：恶魔死亡
        setShowShootResultModal({ message: "恶魔死亡", isDemonDead: true });
      } else {
        addLog(`${sourceId+1}号${shooter.role?.id === 'slayer' ? '(猎手)' : ''} 开枪，但 ${id+1}号 不是恶魔或开枪者不是健康猎手`);
        // 显示弹窗：无事发生
        setShowShootResultModal({ message: "无事发生", isDemonDead: false });
      }
    }
  };

  const submitVotes = (v: number) => {
    if(showVoteInputModal===null) return;
    
    // 验证票数：必须是自然数（>=1），且不超过开局时的玩家数
    const initialPlayerCount = initialSeats.length > 0 
      ? initialSeats.filter(s => s.role !== null).length 
      : seats.filter(s => s.role !== null).length;
    
    // 验证票数范围
    if (isNaN(v) || v < 1 || !Number.isInteger(v)) {
      alert(`票数必须是自然数（大于等于1的整数）`);
      return;
    }
    
    if (v > initialPlayerCount) {
      alert(`票数不能超过开局时的玩家数（${initialPlayerCount}人）`);
      return;
    }
    
    // 保存历史记录
    saveHistory();
    
    const alive = seats.filter(s=>!s.isDead).length;
    const threshold = Math.ceil(alive/2);
    // 票数达到50%才会上处决台
    setSeats(p=>p.map(s=>s.id===showVoteInputModal?{...s,voteCount:v,isCandidate:v>=threshold}:s));
    addLog(`${showVoteInputModal+1}号 获得 ${v} 票${v>=threshold ? ' (上台)' : ''}`);
    setVoteInputValue('');
    setShowVoteErrorToast(false);
    setShowVoteInputModal(null);
  };

  const executeJudgment = () => {
    // 保存历史记录
    saveHistory();
    
    const cands = seats.filter(s=>s.isCandidate).sort((a,b)=>(b.voteCount||0)-(a.voteCount||0));
    if(cands.length===0) { 
      // 6. 弹窗公示处决结果
      setShowExecutionResultModal({ message: "无人上台，无人被处决" });
      return; 
    }
    const max = cands[0].voteCount || 0;
    const alive = seats.filter(s=>!s.isDead).length;
    const threshold = Math.ceil(alive/2);
    
    // 只有票数最高的才会被处决（即使有多人上台）
    const tops = cands.filter(c => c.voteCount === max && (c.voteCount || 0) >= threshold);
    if(tops.length>1) { 
      // 6. 弹窗公示处决结果
      setShowExecutionResultModal({ message: "平票，平安日，无人被处决" });
    } else if(tops.length === 1) {
      const executed = tops[0];
      executePlayer(executed.id);
      // 6. 弹窗公示处决结果
      setShowExecutionResultModal({ message: `${executed.id+1}号被处决` });
    } else {
      // 6. 弹窗公示处决结果
      setShowExecutionResultModal({ message: `最高票数 ${max} 未达到半数 ${threshold}，无人被处决` });
    }
  };
  
  // 6. 确认处决结果后继续游戏
  const confirmExecutionResult = () => {
    const isVirginTrigger = showExecutionResultModal?.isVirginTrigger;
    setShowExecutionResultModal(null);
    
    // 如果是贞洁者触发的处决，点击确认后自动进入下一个黑夜
    if (isVirginTrigger) {
      startNight(false);
      return;
    }
    
    const cands = seats.filter(s=>s.isCandidate).sort((a,b)=>(b.voteCount||0)-(a.voteCount||0));
    if(cands.length===0) {
      startNight(false);
      return;
    }
    const max = cands[0].voteCount || 0;
    const alive = seats.filter(s=>!s.isDead).length;
    const threshold = Math.ceil(alive/2);
    const tops = cands.filter(c => c.voteCount === max && (c.voteCount || 0) >= threshold);
    if(tops.length !== 1) {
      startNight(false);
    }
  };
  
  // 确认开枪结果后继续游戏
  const confirmShootResult = () => {
    setShowShootResultModal(null);
    // 如果恶魔死亡，游戏已经结束，不需要额外操作
    // 如果无事发生，继续游戏流程
  };

  const handleContextMenu = (e: React.MouseEvent, seatId: number) => { 
    e.preventDefault(); 
    setContextMenu({x:e.clientX,y:e.clientY,seatId}); 
  };

  // 触屏长按处理：开始长按
  const handleTouchStart = (e: React.TouchEvent, seatId: number) => {
    e.stopPropagation();
    // 清除可能存在的旧定时器
    const existingTimer = longPressTimerRef.current.get(seatId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    // 添加长按状态，用于视觉反馈
    setLongPressingSeats(prev => new Set(prev).add(seatId));
    // 获取触摸位置
    const touch = e.touches[0];
    // 设置0.5秒后触发右键菜单
    const timer = setTimeout(() => {
      setContextMenu({x:touch.clientX, y:touch.clientY, seatId});
      longPressTimerRef.current.delete(seatId);
      setLongPressingSeats(prev => {
        const next = new Set(prev);
        next.delete(seatId);
        return next;
      });
    }, 500);
    longPressTimerRef.current.set(seatId, timer);
  };

  // 触屏长按处理：结束触摸（取消长按）
  const handleTouchEnd = (e: React.TouchEvent, seatId: number) => {
    e.stopPropagation();
    const timer = longPressTimerRef.current.get(seatId);
    if (timer) {
      clearTimeout(timer);
      longPressTimerRef.current.delete(seatId);
    }
    // 清除长按状态
    setLongPressingSeats(prev => {
      const next = new Set(prev);
      next.delete(seatId);
      return next;
    });
  };

  // 触屏长按处理：触摸移动（取消长按）
  const handleTouchMove = (e: React.TouchEvent, seatId: number) => {
    e.stopPropagation();
    const timer = longPressTimerRef.current.get(seatId);
    if (timer) {
      clearTimeout(timer);
      longPressTimerRef.current.delete(seatId);
    }
    // 清除长按状态
    setLongPressingSeats(prev => {
      const next = new Set(prev);
      next.delete(seatId);
      return next;
    });
  };

  const handleMenuAction = (action: string) => {
    if(!contextMenu) return;
    if(action==='nominate') { 
      // 只能在黄昏环节提名
      if (gamePhase !== 'dusk') {
        // 5. 屏蔽浏览器弹窗，使用控制台提示
        setContextMenu(null);
        return;
      }
      setShowDayActionModal({ type: 'nominate', sourceId: contextMenu.seatId });
    } else if(action==='slayer') {
      // 开枪可以在任意环节（除了setup阶段）
      const shooter = seats.find(s => s.id === contextMenu.seatId);
      if (!shooter || shooter.hasUsedSlayerAbility) {
        setContextMenu(null);
        return;
      }
      setShowDayActionModal({ type: 'slayer', sourceId: contextMenu.seatId });
    }
    setContextMenu(null);
  };

  const toggleStatus = (type: string) => {
    if(!contextMenu) return;
    setSeats(p => {
      let updated;
      if (type === 'redherring') {
        // 场上“红罗刹”唯一：选择新的红罗刹时，清除其他玩家的红罗刹标记和图标
        updated = p.map(s => {
          if (s.id === contextMenu.seatId) {
            const details = s.statusDetails || [];
            return {
              ...s,
              isRedHerring: true,
              statusDetails: details.includes("红罗刹")
                ? details
                : [...details, "红罗刹"],
            };
          } else {
            const details = s.statusDetails || [];
            return {
              ...s,
              isRedHerring: false,
              statusDetails: details.filter(d => d !== "红罗刹"),
            };
          }
        });
      } else {
        updated = p.map(s => s.id === contextMenu.seatId ? {
          ...s,
          isDead: type === 'dead' ? !s.isDead : s.isDead,
          isPoisoned: type === 'poison' ? !s.isPoisoned : s.isPoisoned,
          isDrunk: type === 'drunk' ? !s.isDrunk : s.isDrunk,
        } : s);
      }
      // 8. 恶魔可以死在任意环节，当被标记死亡后，游戏立即结束
      if (type === 'dead') {
        // 立即检查游戏结束条件（包括存活人数和恶魔死亡）
        if (checkGameOver(updated)) {
          return updated;
        }
      }
      return updated;
    });
    setContextMenu(null);
  };

  const confirmRavenkeeperFake = (r: Role) => {
    // 选择假身份后，弹出结果弹窗显示假身份
    const targetId = showRavenkeeperFakeModal;
    if (targetId !== null) {
      setShowRavenkeeperResultModal({
        targetId: targetId,
        roleName: r.name,
        isFake: true
      });
    }
    setShowRavenkeeperFakeModal(null);
  };

  const confirmRavenkeeperResult = () => {
    if (!showRavenkeeperResultModal || !nightInfo) return;
    
    const { targetId, roleName, isFake } = showRavenkeeperResultModal;
    const target = seats.find(s => s.id === targetId);
    
    // 记录日志
    if (isFake) {
      addLogWithDeduplication(
        `${nightInfo.seat.id+1}号(守鸦人) 查验 ${targetId+1}号 -> 伪造: ${roleName}`,
        nightInfo.seat.id,
        '守鸦人'
      );
    } else {
      addLogWithDeduplication(
        `${nightInfo.seat.id+1}号(守鸦人) 查验 ${targetId+1}号 -> ${roleName}`,
        nightInfo.seat.id,
        '守鸦人'
      );
    }
    
    // 关闭弹窗
    setShowRavenkeeperResultModal(null);
  };

  // 注意：此函数已不再使用，处女的逻辑现在在 handleDayAction 中直接处理
  // 保留此函数仅为了兼容性，但不会被调用
  const confirmVirginTrigger = () => {
    if (!showVirginTriggerModal) return;
    const { source, target } = showVirginTriggerModal;
    // 使用 hasBeenNominated 而不是 hasUsedVirginAbility
    if (target.role?.id === 'virgin' && !target.hasBeenNominated && !target.isPoisoned) {
      setSeats(p => {
        const newSeats = p.map(s => 
          s.id === source.id ? { ...s, isDead: true } : 
          s.id === target.id ? { ...s, hasBeenNominated: true, hasUsedVirginAbility: true } : s
        );
        addLog(`${source.id+1}号 提名贞洁者被处决`);
        checkGameOver(newSeats);
        return newSeats;
      });
      setShowVirginTriggerModal(null);
    } else {
      setShowVirginTriggerModal(null);
    }
  };

  const handleRestart = () => {
    setShowRestartConfirmModal(true);
  };

  const confirmRestart = () => {
    // 如果游戏正在进行（不是scriptSelection阶段），先保存对局记录
    if (gamePhase !== 'scriptSelection' && selectedScript) {
      // 添加重开游戏的日志
      const updatedLogs = [...gameLogs, { day: nightCount, phase: gamePhase, message: "说书人重开了游戏" }];
      
      // 立即保存对局记录
      const endTime = new Date();
      const duration = startTime ? Math.floor((endTime.getTime() - startTime.getTime()) / 1000) : timer;
      
      const record: GameRecord = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        scriptName: selectedScript.name,
        startTime: startTime ? startTime.toISOString() : new Date().toISOString(),
        endTime: endTime.toISOString(),
        duration: duration,
        winResult: null, // 重开，无胜负结果
        winReason: "说书人重开了游戏",
        seats: JSON.parse(JSON.stringify(seats)), // 深拷贝座位信息
        gameLogs: updatedLogs // 包含重开日志的完整日志
      };
      
      saveGameRecord(record);
    }
    
    window.location.reload();
  };

  // 切换剧本：如果游戏正在进行，先结束游戏并保存记录
  const handleSwitchScript = () => {
    // 如果游戏正在进行（不是scriptSelection阶段），先结束游戏并保存记录
    if (gamePhase !== 'scriptSelection' && selectedScript) {
      // 添加结束游戏的日志
      const updatedLogs = [...gameLogs, { day: nightCount, phase: gamePhase, message: "说书人结束了游戏" }];
      
      // 立即保存对局记录
      const endTime = new Date();
      const duration = startTime ? Math.floor((endTime.getTime() - startTime.getTime()) / 1000) : timer;
      
      const record: GameRecord = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        scriptName: selectedScript.name,
        startTime: startTime ? startTime.toISOString() : new Date().toISOString(),
        endTime: endTime.toISOString(),
        duration: duration,
        winResult: null, // 说书人结束，无胜负结果
        winReason: "说书人结束了游戏",
        seats: JSON.parse(JSON.stringify(seats)), // 深拷贝座位信息
        gameLogs: updatedLogs // 包含结束日志的完整日志
      };
      
      saveGameRecord(record);
    }
    
    // 切换到剧本选择页面
    triggerIntroLoading();
    setGamePhase('scriptSelection');
    setSelectedScript(null);
    setNightCount(1);
    setExecutedPlayerId(null);
    setWakeQueueIds([]);
    setCurrentWakeIndex(0);
    setSelectedActionTargets([]);
    // 注意：这里不清空gameLogs，保留游戏记录，用户可以在复盘时查看
    setWinResult(null);
    setDeadThisNight([]);
    setPukkaPoisonQueue([]); // 清空普卡队列，防止旧局状态泄漏
    setSelectedRole(null);
    setInspectionResult(null);
    setCurrentHint({ isPoisoned: false, guide: "", speak: "" });
    setTimer(0);
    setStartTime(null);
    setHistory([]);
    setWinReason(null);
    hintCacheRef.current.clear();
    drunkFirstInfoRef.current.clear();
    setSeats(Array.from({ length: 15 }, (_, i) => ({ 
      id: i, 
      role: null, 
      charadeRole: null, 
      isDead: false, 
      isDrunk: false, 
      isPoisoned: false, 
      isProtected: false, 
      protectedBy: null,
      isRedHerring: false, 
      isFortuneTellerRedHerring: false, 
      isSentenced: false, 
      masterId: null, 
      hasUsedSlayerAbility: false, 
      hasUsedVirginAbility: false, 
      hasBeenNominated: false,
      isDemonSuccessor: false, 
      hasAbilityEvenDead: false,
      statusDetails: [],
      statuses: [],
      grandchildId: null,
      isGrandchild: false,
      zombuulLives: 1
    })));
    setInitialSeats([]);
  };

  // 重置游戏到setup阶段（再来一局）
  const handleNewGame = () => {
    triggerIntroLoading();
    setGamePhase('scriptSelection');
    setSelectedScript(null);
    setNightCount(1);
    setExecutedPlayerId(null);
    setWakeQueueIds([]);
    setCurrentWakeIndex(0);
    setSelectedActionTargets([]);
    setGameLogs([]);
    setWinResult(null);
    setDeadThisNight([]);
    setSelectedRole(null);
    setInspectionResult(null);
    setCurrentHint({ isPoisoned: false, guide: "", speak: "" });
    setTimer(0);
    setStartTime(null);
    setHistory([]);
    setWinReason(null);
    hintCacheRef.current.clear();
    drunkFirstInfoRef.current.clear();
    setSeats(Array.from({ length: 15 }, (_, i) => ({ 
      id: i, 
      role: null, 
      charadeRole: null, 
      isDead: false, 
      isDrunk: false, 
      isPoisoned: false, 
      isProtected: false, 
      protectedBy: null,
      isRedHerring: false, 
      isFortuneTellerRedHerring: false, 
      isSentenced: false, 
      masterId: null, 
      hasUsedSlayerAbility: false, 
      hasUsedVirginAbility: false, 
      hasBeenNominated: false,
      isDemonSuccessor: false, 
      hasAbilityEvenDead: false,
      statusDetails: [],
      statuses: [],
      grandchildId: null,
      isGrandchild: false,
      zombuulLives: 1
    })));
    setInitialSeats([]);
  };

  // 9. 保存历史记录 - 改为普通函数，使用ref避免Hook依赖问题
  const saveHistory = () => {
    const state = gameStateRef.current;
    setHistory(prev => [...prev, {
      seats: JSON.parse(JSON.stringify(state.seats)),
      gamePhase: state.gamePhase,
      nightCount: state.nightCount,
      executedPlayerId: state.executedPlayerId,
      wakeQueueIds: [...state.wakeQueueIds],
      currentWakeIndex: state.currentWakeIndex,
      selectedActionTargets: [...state.selectedActionTargets],
      gameLogs: [...state.gameLogs],
      currentHint: JSON.parse(JSON.stringify(currentHint)), // 保存当前 hint
      selectedScript: state.selectedScript // 保存选中的剧本
    }]);
  };

  // 9.1 控制面板的"上一步"：只退回流程，不改变已生成的信息
  // 支持无限次后退，直到当前夜晚/阶段的开始
  const handleStepBack = () => {
    if (currentWakeIndex > 0) {
      setCurrentWakeIndex(currentWakeIndex - 1);
      // hint 会从缓存中恢复，不重新生成
    }
    // 如果已经是第一个，但还有历史记录，可以继续后退到上一个阶段
    else if (history.length > 0) {
      const lastState = history[history.length - 1];
      // 如果上一个状态是夜晚阶段，恢复并设置到最后一个唤醒索引
      if (lastState.gamePhase === gamePhase && lastState.wakeQueueIds.length > 0) {
        setSeats(lastState.seats);
        setGamePhase(lastState.gamePhase);
        setNightCount(lastState.nightCount);
        setExecutedPlayerId(lastState.executedPlayerId);
        setWakeQueueIds(lastState.wakeQueueIds);
        setCurrentWakeIndex(Math.max(0, lastState.wakeQueueIds.length - 1));
        setSelectedActionTargets(lastState.selectedActionTargets);
        setGameLogs(lastState.gameLogs);
        setHistory(prev => prev.slice(0, -1));
      }
    }
  };
  
  // 9.2 全局上一步：撤销当前动作，清除缓存，重新生成信息
  // 支持无限次撤回，直到"选择剧本"页面
  const handleGlobalUndo = () => {
    // 如果在"选择剧本"页面，无效
    if (gamePhase === 'scriptSelection') {
      return;
    }
    
    if (history.length === 0) {
      // 如果历史记录为空，尝试回到"选择剧本"页面
      setGamePhase('scriptSelection');
      setSelectedScript(null);
      setNightCount(1);
      setExecutedPlayerId(null);
      setWakeQueueIds([]);
      setCurrentWakeIndex(0);
      setSelectedActionTargets([]);
      setGameLogs([]);
      setWinResult(null);
      setWinReason(null);
      setDeadThisNight([]);
      setSelectedRole(null);
      setInspectionResult(null);
      setCurrentHint({ isPoisoned: false, guide: "", speak: "" });
      setTimer(0);
      setStartTime(null);
      hintCacheRef.current.clear();
      drunkFirstInfoRef.current.clear();
      setSeats(Array.from({ length: 15 }, (_, i) => ({ 
        id: i, 
        role: null, 
        charadeRole: null, 
        isDead: false, 
        isDrunk: false, 
        isPoisoned: false, 
        isProtected: false, 
        protectedBy: null,
        isRedHerring: false, 
        isFortuneTellerRedHerring: false, 
        isSentenced: false, 
        masterId: null, 
        hasUsedSlayerAbility: false, 
        hasUsedVirginAbility: false, 
        isDemonSuccessor: false, 
        hasAbilityEvenDead: false,
        statusDetails: [],
        statuses: [],
        grandchildId: null,
      isGrandchild: false,
      zombuulLives: 1
      })));
      setInitialSeats([]);
      return;
    }
    
    const lastState = history[history.length - 1];
    setSeats(lastState.seats);
    setGamePhase(lastState.gamePhase);
    setNightCount(lastState.nightCount);
    setExecutedPlayerId(lastState.executedPlayerId);
    setWakeQueueIds(lastState.wakeQueueIds);
    setCurrentWakeIndex(lastState.currentWakeIndex);
    setSelectedActionTargets(lastState.selectedActionTargets);
    setGameLogs(lastState.gameLogs);
    setSelectedScript(lastState.selectedScript); // 恢复选中的剧本
    
    // 清除 hint 缓存，让信息重新生成（符合"全局上一步"的需求）
    hintCacheRef.current.clear();
    
    // 不恢复 hint，让 useEffect 重新计算（这样信息会重新生成）
    
    setHistory(prev => prev.slice(0, -1));
  };

  // --- Render ---
  return (
    <div 
      className={`flex h-screen text-white overflow-hidden relative ${
        gamePhase==='day'?'bg-sky-900':
        gamePhase==='dusk'?'bg-stone-900':
        'bg-gray-950'
      }`} 
      onClick={()=>{setContextMenu(null);setShowMenu(false);}}
    >
      {/* ===== 通用加载动画（不属于“暗流涌动”等具体剧本） ===== */}
      {showIntroLoading && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black">
          <div className="font-sans text-5xl md:text-7xl font-black tracking-[0.1em] text-red-400 animate-breath-shadow">
            拜甘教
          </div>
          <div className="mt-8 flex flex-col items-center gap-3">
            <div className="h-10 w-10 rounded-full border-4 border-red-500 border-t-transparent animate-spin" />
            <div className="text-base md:text-lg font-semibold text-red-200/90 font-sans tracking-widest">
              祈祷中 ···
            </div>
          </div>
        </div>
      )}
      {/* ===== 暗流涌动剧本（游戏第一部分）主界面 ===== */}
      <div className="w-3/5 relative flex items-center justify-center border-r border-gray-700">
        {/* 2. 万能上一步按钮 - 固定位置在左侧圆桌右上角 */}
        {/* 支持无限次撤回，直到"选择剧本"页面，在"选择剧本"页面无效 */}
        {gamePhase !== 'scriptSelection' && (
          <button
            onClick={handleGlobalUndo}
            className="absolute top-4 right-4 z-50 px-4 py-2 bg-blue-600 rounded-xl font-bold text-sm shadow-lg hover:bg-blue-700 transition-colors"
          >
            <div className="flex flex-col items-center">
              <div>⬅️ 万能上一步</div>
              <div className="text-xs font-normal opacity-80">（撤销当前动作）</div>
            </div>
          </button>
        )}
        <div className="absolute pointer-events-none text-center z-0 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="text-6xl font-bold opacity-50 mb-4">{phaseNames[gamePhase]}</div>
          <div className="text-xs text-gray-500 opacity-40 mb-2">
            design by{" "}
            <span className="font-bold italic">Bai  Gan Group</span>
          </div>
          {gamePhase==='scriptSelection' && (
            <div className="text-5xl font-mono text-yellow-300">请选择剧本</div>
          )}
          {gamePhase!=='setup' && gamePhase!=='scriptSelection' && (
            <div className="text-5xl font-mono text-yellow-300">{formatTimer(timer)}</div>
          )}
        </div>
        <div className="relative w-[70vmin] h-[70vmin]">
              {seats.map((s,i)=>{
            const p=getSeatPosition(i, seats.length);
            const colorClass = s.role ? typeColors[s.role.type] : 'border-gray-600 text-gray-400';
            return (
              <div 
                key={s.id} 
                onClick={(e)=>{e.stopPropagation();handleSeatClick(s.id)}} 
                onContextMenu={(e)=>handleContextMenu(e,s.id)}
                onTouchStart={(e)=>handleTouchStart(e,s.id)}
                onTouchEnd={(e)=>handleTouchEnd(e,s.id)}
                onTouchMove={(e)=>handleTouchMove(e,s.id)}
                  style={{left:`${p.x}%`,top:`${p.y}%`,transform:'translate(-50%,-50%)'}} 
                className={`absolute w-24 h-24 rounded-full border-4 flex items-center justify-center cursor-pointer z-30 bg-gray-900 transition-all duration-300
                  ${colorClass} 
                  ${nightInfo?.seat.id===s.id?'ring-4 ring-yellow-400 scale-110 shadow-[0_0_30px_yellow]':''} 
                  ${s.isDead?'grayscale opacity-60':''} 
                  ${selectedActionTargets.includes(s.id)?'ring-4 ring-green-500 scale-105':''}
                  ${longPressingSeats.has(s.id)?'ring-4 ring-blue-400 animate-pulse':''}
                `}
              >
                {/* 长按进度指示器 */}
                {longPressingSeats.has(s.id) && (
                  <div className="absolute inset-0 rounded-full border-4 border-blue-400 animate-ping opacity-75"></div>
                )}
                {/* 座位号 - 左上角 */}
                <div className="absolute -top-5 -left-5 w-9 h-9 bg-gray-800 rounded-full border-2 border-gray-600 flex items-center justify-center text-base font-bold z-40">
                  {s.id+1}
                  </div>
                
                {/* 角色名称 */}
                <span className="text-sm font-bold text-center leading-tight px-1">
                  {s.role?.id==='drunk'?`${s.charadeRole?.name || s.role?.name}\n(酒)`:
                   s.isDemonSuccessor && s.role?.id === 'imp'?`${s.role?.name}\n(传)`:
                   s.role?.name||"空"}
                </span>
                
                {/* 状态图标 - 底部 */}
                <div className="absolute -bottom-3 flex gap-1">
                  {s.isPoisoned&&<span className="text-lg">🧪</span>}
                  {s.isProtected&&<span className="text-lg">🛡️</span>}
                  {s.isRedHerring&&<span className="text-lg">😈</span>}
                </div>
                
                {/* 右上角提示区域 */}
                <div className="absolute -top-5 -right-5 flex flex-col gap-1 items-end z-40">
                  {/* 主人标签 */}
                  {seats.some(seat => seat.masterId === s.id) && (
                    <span className="text-xs bg-purple-600 px-2 py-0.5 rounded-full shadow font-bold">
                      主人
                    </span>
                  )}
                  {/* 处决台标签 */}
                  {s.isCandidate && (
                    <span className="text-xs bg-red-600 px-2 py-0.5 rounded-full shadow font-bold animate-pulse">
                      ⚖️{s.voteCount}
                    </span>
                  )}
                </div>
              </div>
            );
              })}
          </div>
      </div>

      <div className={`w-2/5 flex flex-col border-l border-gray-800 z-40 transition-all duration-500 ${
        gamePhase === 'scriptSelection' 
          ? 'bg-gray-800/90' 
          : 'bg-gray-900/95'
      }`}>
        <div className="px-4 py-2 pb-4 border-b flex items-center justify-between relative">
          <span className="font-bold text-purple-400 text-xl scale-[1.3] flex items-center justify-center h-8 flex-shrink-0">控制台</span>
          <div className="flex items-center flex-shrink-0">
            <button 
              onClick={()=>setShowGameRecordsModal(true)} 
              className="px-2 py-1 bg-green-600 border rounded text-sm shadow-lg h-8 flex items-center justify-center scale-[1.3] flex-shrink-0 mr-[28px]"
            >
              对局记录
            </button>
            <button 
              onClick={()=>setShowReviewModal(true)} 
              className="px-2 py-1 bg-indigo-600 border rounded text-sm shadow-lg h-8 flex items-center justify-center scale-[1.3] flex-shrink-0 mr-[22px]"
            >
              复盘
            </button>
            <div className="relative flex-shrink-0">
              <button 
                onClick={(e)=>{e.stopPropagation();setShowMenu(!showMenu)}} 
                className="px-2 py-1 bg-gray-800 border rounded text-sm shadow-lg h-8 flex items-center justify-center scale-[1.3]"
              >
                ☰
              </button>
              {showMenu && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-gray-800 border rounded-lg shadow-xl z-[1000]">
                <button 
                  onClick={()=>{setShowRoleInfoModal(true);setShowMenu(false)}} 
                  className="w-full p-4 text-left text-blue-400 hover:bg-gray-700 border-b border-gray-700"
                >
                  📖 角色信息
                </button>
                <button 
                  onClick={()=>{handleSwitchScript();setShowMenu(false)}} 
                  className="w-full p-4 text-left text-purple-400 hover:bg-gray-700 border-b border-gray-700"
                >
                  🔀 切换剧本
                </button>
                <button 
                  onClick={handleRestart} 
                  className="w-full p-4 text-left text-red-400 hover:bg-gray-700"
                >
                  🔄 重开
                </button>
              </div>
            )}
            </div>
          </div>
          {nightInfo && (
            <span className="text-3xl font-bold text-white absolute left-1/2 -translate-x-1/2 top-full mt-2">
              当前是<span className="text-yellow-300">{nightInfo.seat.id+1}号{nightInfo.effectiveRole.name}</span>在行动
            </span>
          )}
        </div>
          <div ref={consoleContentRef} className="flex-1 overflow-y-auto p-4 text-base">
          {/* 剧本选择页面 */}
          {gamePhase==='scriptSelection' && (
            <div className="flex flex-col items-center justify-center min-h-full">
              <h2 className="text-4xl font-bold mb-2 text-white">选择剧本</h2>
              <p className="text-gray-400 italic mb-8">更多剧本开发中…</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
                {scripts.map(script => (
                  <button
                    key={script.id}
                    onClick={() => {
                      // 保存选择剧本前的状态到历史记录
                      saveHistory();
                      setSelectedScript(script);
                      setGameLogs([]); // 选择新剧本时清空之前的游戏记录
                      setGamePhase('setup');
                    }}
                    className="p-8 bg-gray-800 border-4 border-gray-600 rounded-2xl hover:border-blue-500 hover:bg-gray-700 transition-all text-center flex flex-col items-center justify-center"
                  >
                    <div className="text-2xl font-bold text-white mb-2">{script.name}</div>
                    <div className="text-sm text-gray-400">难度：{script.difficulty}</div>
                    {script.description && (
                      <div className="text-sm text-gray-300 mt-2">{script.description}</div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* 4. 白天控制台增加说书人提示 */}
          {gamePhase==='day' && (
            <div className="mb-4 p-3 bg-gray-800/50 border border-yellow-500/30 rounded-lg text-sm text-gray-300 leading-relaxed">
              <p className="mb-2 font-bold text-yellow-400 text-sm">📖 说书人提示</p>
              <p className="mb-2 text-xs">你的目标是主持一场有趣好玩且参与度高的游戏。</p>
              <p className="mb-2 text-xs">有些事你可以做，但不意味着你应该去做。你是否只顾自己取乐而给玩家们添乱？你是否正在牺牲玩家的乐趣来放纵自己？比如说当小恶魔在夜里将自己杀死时，你"可以"将陌客当作是爪牙并让他因此变成一个善良的小恶魔，但这并不意味着这样做是有趣或平衡的。比如说你"可以"说服一名迷惑的善良阵营玩家，告诉他他是邪恶阵营的，但这并不意味着玩家在得知真相后会享受这个过程。又比如说你"可以"给博学者提供完全没用的信息，但显然提供有趣且独特的信息会更好。</p>
              <p className="mb-2 text-xs">作为说书人，你在每一局游戏当中都需要做出很多有趣的决定。而这每一个决定的目的都应该是使游戏变得更好玩，为大家带来更多乐趣。这通常意味着你需要给善良阵营制造尽可能多的混乱，将他们引入歧途，因为这对所有人来说都是有趣的。但请牢记在心，维持游戏的公平性是同样重要的，你主持游戏是为了让玩家都能够享受到游戏中的精彩。</p>
                      </div>
          )}
          {gamePhase==='setup' && (
            <div className="space-y-6">
              {Object.entries(filteredGroupedRoles).map(([type, list]) => (
                <div key={type}>
                  <h3 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wider">{typeLabels[type] || type}</h3>
                  <div className="grid grid-cols-3 gap-3">
                    {list.map(r=>{
                      const isTaken=seats.some(s=>s.role?.id===r.id);
                      return (
                        <button 
                          key={r.id} 
                          onClick={(e)=>{e.stopPropagation();if(!isTaken)setSelectedRole(r)}} 
                          className={`p-3 border rounded-lg text-sm font-medium transition-all ${
                            isTaken?'opacity-30 cursor-not-allowed bg-gray-800':'' 
                          } ${typeBgColors[r.type]} ${
                            selectedRole?.id===r.id?'ring-4 ring-white scale-105':''
                          }`}
                        >
                          {r.name}
                        </button>
                      );
                    })}
                      </div>
                      </div>
              ))}
                  </div>
              )}
          
          {gamePhase==='check' && (
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-4">核对身份</h2>
              <div className="bg-gray-800 p-4 rounded-xl text-left text-base space-y-3 max-h-[60vh] overflow-y-auto">
                {seats.filter(s=>s.role).map(s=>{
                  // 酒鬼应该显示伪装角色的名称，而不是"酒鬼"
                  const displayRole = s.role?.id === 'drunk' && s.charadeRole ? s.charadeRole : s.role;
                  const displayName = displayRole?.name || '';
                  return (
                    <div key={s.id} className="flex justify-between border-b border-gray-700 pb-2">
                      <span>{s.id+1}号</span>
                      <span className={s.role?.type==='demon'?'text-red-500 font-bold':''}>
                        {displayName}
                        {s.role?.id==='drunk' && <span className="text-gray-400 text-sm">(酒鬼)</span>}
                        {s.isRedHerring && ' [红罗刹]'}
                      </span>
                    </div>
                  );
                })}
          </div>
      </div>
          )}
          
          {(gamePhase==='firstNight'||gamePhase==='night') && nightInfo ? (
            <div className="space-y-4 animate-fade-in mt-10">
              <div className={`p-4 rounded-xl border-2 ${
                currentHint.isPoisoned?'bg-red-900/20 border-red-500':'bg-gray-800 border-gray-600'
              }`}>
                {currentHint.isPoisoned && (
                  <div className="text-red-400 font-bold mb-3 text-base flex items-center gap-2">
                    ⚠️ {currentHint.reason}
                  </div>
                )}
                <div className="mb-2 text-sm text-gray-400 font-bold uppercase">📖 指引：</div>
                <p className="text-base mb-4 leading-relaxed whitespace-pre-wrap font-medium">{currentHint.guide}</p>
                <div className="mb-2 text-sm text-yellow-400 font-bold uppercase">🗣️ 台词：</div>
                <p className="text-lg font-serif bg-black/40 p-3 rounded-xl border-l-4 border-yellow-500 italic text-yellow-100">
                  {currentHint.speak}
                </p>
              </div>
                      
              {nightInfo.effectiveRole.nightActionType === 'spy_info' && (
                <div className="bg-black/50 p-3 rounded-xl h-56 overflow-y-auto text-xs flex gap-3">
                  <div className="w-1/2">
                    <h4 className="text-purple-400 mb-2 font-bold border-b pb-1 text-sm">魔典</h4>
                    {seats.filter(s=>s.role).map(s => (
                      <div key={s.id} className="py-0.5 border-b border-gray-700 flex justify-between">
                        <span>{s.id+1}号</span>
                        <span className={s.role?.type==='demon'?'text-red-500':''}>
                          {s.role?.name}
                        </span>
    </div>
                    ))}
                  </div>
                  <div className="w-1/2">
                    <h4 className="text-yellow-400 mb-2 font-bold border-b pb-1 text-sm">行动日志</h4>
                    <div className="space-y-2 max-h-56 overflow-y-auto">
                      {/* 5. 按天数分开显示日志 */}
                      {(() => {
                        const logsByDay = gameLogs.reduce((acc, log) => {
                          const dayKey = log.day;
                          if (!acc[dayKey]) acc[dayKey] = [];
                          acc[dayKey].push(log);
                          return acc;
                        }, {} as Record<number, LogEntry[]>);
                        
                        return Object.entries(logsByDay).reverse().map(([day, logs]) => (
                          <div key={day} className="mb-2">
                            <div className="text-yellow-300 font-bold mb-1 text-xs">
                              {logs[0]?.phase === 'firstNight' ? '第1夜' : 
                               logs[0]?.phase === 'night' ? `第${day}夜` :
                               logs[0]?.phase === 'day' ? `第${day}天` :
                               logs[0]?.phase === 'dusk' ? `第${day}天黄昏` : `第${day}轮`}
                            </div>
                            {logs.reverse().map((l, i) => (
                              <div key={i} className="py-1 border-b border-gray-700 text-gray-300 text-xs pl-2">
                                {l.message}
                              </div>
                            ))}
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                </div>
              )}
              
              {/* 7. 修复小恶魔选择问题 - 确保小恶魔在非首夜可以显示选择按钮 */}
              {nightInfo.effectiveRole.nightActionType!=='spy_info' && nightInfo.effectiveRole.nightActionType!=='none' && (
                <div className="grid grid-cols-3 gap-3 mt-4">
                  {seats.filter(s=>{
                    // 占卜师可以选择任意2名玩家（包括自己和已死亡玩家）
                    if (nightInfo.effectiveRole.id === 'fortune_teller') {
                      return s.role !== null; // 只要有角色就可以选择
                    }
                    // 小恶魔在非首夜可以选择任意活着的玩家
                    if (nightInfo.effectiveRole.id === 'imp' && gamePhase !== 'firstNight') {
                      return s.role && !s.isDead;
                    }
                    // 僵怖可以选择任意活着的玩家（包括假死状态的僵怖自己）
                    if (nightInfo.effectiveRole.id === 'zombuul') {
                      // 僵怖假死状态算作存活
                      if (s.role?.id === 'zombuul' && s.isFirstDeathForZombuul && !s.isZombuulTrulyDead) {
                        return true;
                      }
                      return s.role && !s.isDead;
                    }
                    // 其他角色根据规则过滤
                    return s.role && (nightInfo.effectiveRole.id==='ravenkeeper' || !s.isDead);
                  }).map(s=>(
                    <button 
                      key={s.id} 
                      onClick={()=>toggleTarget(s.id)} 
                      disabled={isTargetDisabled(s)} 
                      className={`p-3 border-2 rounded-lg text-sm font-bold transition-all ${
                        selectedActionTargets.includes(s.id)?
                          'bg-green-600 border-white scale-105 shadow-lg ring-4 ring-green-500':
                          'bg-gray-700 border-gray-600 hover:bg-gray-600'
                      } ${isTargetDisabled(s)?'opacity-30 cursor-not-allowed':''}`}
                    >
                      [{s.id+1}] {s.role?.name}
                    </button>
                  ))}
                </div>
              )}
              
              {inspectionResult && (
                <div
                  key={inspectionResultKey}
                  className="bg-blue-600 p-4 rounded-xl text-center font-bold text-2xl shadow-2xl mt-4 animate-bounce"
                >
                  {inspectionResult}
                </div>
              )}
            </div>
          ) : ((gamePhase==='firstNight'||gamePhase==='night') && !nightInfo && (
            <div className="text-center text-gray-500 mt-20 text-xl">正在计算行动...</div>
          ))}
          
          {gamePhase==='dusk' && (
            <div className="mt-4 bg-gray-800 p-3 rounded-xl">
              <h3 className="text-lg font-bold mb-2 text-orange-400">⚖️ 处决台</h3>
              {seats.filter(s=>s.isCandidate).sort((a,b)=>(b.voteCount||0)-(a.voteCount||0)).map((s,i)=>(
                <div 
                  key={s.id} 
                  className={`flex justify-between p-2 border-b border-gray-600 ${
                    i===0?'text-red-400 font-bold':''
                  }`}
                >
                  <span>{s.id+1}号 {s.role?.name}</span>
                  <span>{s.voteCount}票</span>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className="p-4 border-t border-gray-700 bg-gray-900 flex gap-3 justify-center z-50">
          {gamePhase==='setup' && (
            <button 
              onClick={handlePreStartNight} 
              className="w-full py-3 bg-indigo-600 rounded-xl font-bold text-base shadow-xl"
            >
              开始游戏 (首夜)
            </button>
          )}
          {gamePhase==='check' && (
            <button 
              onClick={()=>startNight(true)} 
              className="w-full py-3 bg-green-600 rounded-xl font-bold text-base shadow-xl"
            >
              确认无误，入夜
            </button>
          )}
          {(gamePhase==='firstNight'||gamePhase==='night') && (
            <>
              <button 
                onClick={handleStepBack} 
                className="flex-1 py-3 bg-gray-700 rounded-xl font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={currentWakeIndex === 0 && history.length === 0}
              >
                上一步
              </button>
              <button 
                onClick={handleConfirmAction} 
                disabled={
                  // 3. 占卜师必须选择2名玩家才能确认
                  (nightInfo?.effectiveRole.id === 'fortune_teller' && selectedActionTargets.length !== 2) ||
                  // 恶魔在非首夜必须选择1名玩家才能确认，首夜不需要选择
                  (nightInfo?.effectiveRole.id === 'imp' && 
                   gamePhase !== 'firstNight' && 
                   nightInfo?.effectiveRole.nightActionType !== 'none' && 
                   selectedActionTargets.length !== 1) ||
                  // 投毒者必须选择1名玩家才能确认
                  (nightInfo?.effectiveRole.id === 'poisoner' && 
                   nightInfo?.effectiveRole.nightActionType !== 'none' && 
                   selectedActionTargets.length !== 1) ||
                  // 守鸦人必须选择1名玩家并确认结果后才能继续（仅当守鸦人死亡时）
                  (nightInfo?.effectiveRole.id === 'ravenkeeper' && 
                   nightInfo?.effectiveRole.nightActionType === 'inspect_death' && 
                   nightInfo?.seat.isDead &&
                   (selectedActionTargets.length !== 1 || showRavenkeeperResultModal !== null || showRavenkeeperFakeModal !== null))
                }
                className="flex-[2] py-3 bg-white text-black rounded-xl font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                确认 / 下一步
              </button>
              {/* 伪装身份识别列表 */}
              {(() => {
                const spySeats = seats.filter(s => s.role?.id === 'spy');
                const chefSeat = seats.find(s => s.role?.id === 'chef');
                const empathSeat = seats.find(s => s.role?.id === 'empath');
                const hasInterferenceRoles = spySeats.length > 0 && (chefSeat || empathSeat);
                
                if (hasInterferenceRoles) {
                  return (
                    <div className="w-full mt-3 p-3 bg-gray-800 rounded-xl border border-gray-600">
                      <h4 className="text-sm font-bold mb-2 text-yellow-400">🎭 伪装身份识别</h4>
                      <div className="mb-2 text-xs text-gray-300">
                        {spySeats.map(s => (
                          <div key={s.id} className="mb-1">
                            {s.id + 1}号 - 间谍
                          </div>
                        ))}
                        {(chefSeat || empathSeat) && (
                          <div className="mt-2 text-gray-400">
                            可能受影响：{chefSeat && '厨师'} {chefSeat && empathSeat && '、'} {empathSeat && '共情者'}
                          </div>
                        )}
                      </div>
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-gray-300 flex-shrink-0">干扰模式：</label>
                          <div className="flex gap-1 flex-1">
                            <button
                              onClick={() => setSpyDisguiseMode('off')}
                              className={`flex-1 py-1 px-2 text-xs rounded ${
                                spyDisguiseMode === 'off' 
                                  ? 'bg-red-600 text-white' 
                                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                              }`}
                            >
                              关闭干扰
                            </button>
                            <button
                              onClick={() => setSpyDisguiseMode('default')}
                              className={`flex-1 py-1 px-2 text-xs rounded ${
                                spyDisguiseMode === 'default' 
                                  ? 'bg-blue-600 text-white' 
                                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                              }`}
                            >
                              默认
                            </button>
                            <button
                              onClick={() => setSpyDisguiseMode('on')}
                              className={`flex-1 py-1 px-2 text-xs rounded ${
                                spyDisguiseMode === 'on' 
                                  ? 'bg-green-600 text-white' 
                                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                              }`}
                            >
                              开启干扰
                            </button>
                          </div>
                        </div>
                        {spyDisguiseMode === 'on' && (
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-gray-300 flex-shrink-0">干扰概率：</label>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={spyDisguiseProbability * 100}
                              onChange={(e) => setSpyDisguiseProbability(parseInt(e.target.value) / 100)}
                              className="flex-1"
                            />
                            <span className="text-xs text-gray-300 w-12 text-right">
                              {Math.round(spyDisguiseProbability * 100)}%
                            </span>
                          </div>
                        )}
                        {spyDisguiseMode === 'default' && (
                          <div className="text-xs text-gray-400">
                            默认概率：80%
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
            </>
          )}
          {gamePhase==='day' && (
            <button 
              onClick={()=>{
                // 保存历史记录
                saveHistory();
                // 进入新黄昏时，将当前黄昏的处决记录保存为"上一个黄昏的处决记录"
                // 这样送葬者在夜晚时就能看到上一个黄昏的处决信息
                if (currentDuskExecution !== null) {
                  setLastDuskExecution(currentDuskExecution);
                } else {
                  // 如果当前黄昏没有处决，保持上一个黄昏的记录（如果有的话）
                  // 如果上一个黄昏也没有处决，lastDuskExecution保持为null
                }
                // 清空当前黄昏的处决记录，准备记录新的处决
                setCurrentDuskExecution(null);
                setGamePhase('dusk');
                // 重置所有提名状态，允许重新提名
                setSeats(p => p.map(s => ({...s, voteCount: undefined, isCandidate: false})));
                // 重置提名记录
                setNominationRecords({ nominators: new Set(), nominees: new Set() });
              }} 
              className="w-full py-3 bg-orange-600 rounded-xl font-bold text-base"
            >
              进入黄昏 (提名)
            </button>
          )}
          {gamePhase==='dusk' && (
            <>
              <button 
                onClick={executeJudgment} 
                className="flex-[2] py-3 bg-red-600 rounded-xl font-bold text-lg shadow-lg animate-pulse"
              >
                执行处决
              </button>
              <button 
                onClick={()=>startNight(false)} 
                className="flex-1 py-3 bg-indigo-600 rounded-xl font-bold text-sm"
              >
                直接入夜
              </button>
            </>
          )}
          {gamePhase==='dawnReport' && (
            <button 
              onClick={()=>setGamePhase('day')} 
              className="w-full py-3 bg-yellow-500 text-black rounded-xl font-bold text-base"
            >
              进入白天
            </button>
          )}
        </div>
      </div>

      {/* Modals */}
      {showDrunkModal!==null && (
        <div className="fixed inset-0 z-[3000] bg-black/95 flex items-center justify-center">
          <div className="bg-gray-800 p-8 rounded-2xl w-[800px] border-2 border-yellow-500">
            <h2 className="mb-6 text-center text-3xl text-yellow-400">🍺 请为酒鬼选择伪装 (互斥)</h2>
            <div className="grid grid-cols-4 gap-4">
              {groupedRoles['townsfolk'].map(r=>{
                const isTaken=seats.some(s=>s.role?.id===r.id);
                return (
                  <button 
                    key={r.id} 
                    onClick={()=>!isTaken && confirmDrunkCharade(r)} 
                    disabled={isTaken} 
                    className={`p-4 border-2 rounded-xl text-lg font-bold ${
                      isTaken?'opacity-20 cursor-not-allowed border-gray-700':'border-blue-500 hover:bg-blue-900'
                    }`}
                  >
                    {r.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
      
      {showVoteInputModal!==null && (
        <div className="fixed inset-0 z-[3000] bg-black/90 flex items-center justify-center">
          <div className="bg-gray-800 p-8 rounded-2xl text-center border-2 border-blue-500 relative">
            <h3 className="text-3xl font-bold mb-6">🗳️ 输入票数</h3>
            <input 
              autoFocus 
              type="number" 
              min="1"
              max={initialSeats.length > 0 
                ? initialSeats.filter(s => s.role !== null).length 
                : seats.filter(s => s.role !== null).length}
              step="1"
              value={voteInputValue}
              className="w-full p-4 bg-gray-700 rounded-xl mb-6 text-center text-4xl font-mono" 
              onChange={(e) => {
                const value = e.target.value;
                const initialPlayerCount = initialSeats.length > 0 
                  ? initialSeats.filter(s => s.role !== null).length 
                  : seats.filter(s => s.role !== null).length;
                
                // 如果输入为空，允许继续输入
                if (value === '') {
                  setVoteInputValue('');
                  return;
                }
                
                const numValue = parseInt(value);
                // 检查是否符合要求：必须是有效数字，且不超过开局时的玩家数
                if (isNaN(numValue) || numValue < 1 || !Number.isInteger(numValue) || numValue > initialPlayerCount) {
                  // 不符合要求，清空输入并显示浮窗
                  setVoteInputValue('');
                  setShowVoteErrorToast(true);
                  // 3秒后自动消失
                  setTimeout(() => {
                    setShowVoteErrorToast(false);
                  }, 3000);
                } else {
                  // 符合要求，更新输入值
                  setVoteInputValue(value);
                }
              }}
              onKeyDown={(e)=>{if(e.key==='Enter')submitVotes(parseInt(voteInputValue)||0)}} 
            />
            {showVoteErrorToast && (
              <div 
                className="absolute left-0 right-0 bg-red-600/30 text-white text-sm px-4 py-2 rounded-lg shadow-lg z-10"
                style={{
                  top: 'calc(2rem + 1.5rem + 1.5rem + 1rem + 1.125rem)'
                }}
              >
                票数不得超过开局时的玩家数
              </div>
            )}
            <button 
              onClick={()=>submitVotes(parseInt(voteInputValue)||0)} 
              className="w-full py-4 bg-indigo-600 rounded-xl text-2xl font-bold"
            >
              确认
            </button>
          </div>
        </div>
      )}
      
      {showDayActionModal && (
        <div className="fixed inset-0 z-[3000] bg-black/80 flex items-center justify-center">
          <div className="bg-gray-800 p-8 rounded-2xl w-[500px] text-center">
            <h2 className="mb-6 text-3xl font-bold text-red-400">
              {showDayActionModal.type==='slayer'?'💥 开枪':'🗣️ 提名'}
            </h2>
            <div className="flex flex-wrap gap-3 justify-center">
              {seats.filter(s=>{
                // 暗月初升剧本：存活玩家可以提名死人
                // 其他剧本：只能提名存活玩家
                if (showDayActionModal?.type === 'nominate' && selectedScript?.id === 'bad_moon_rising') {
                  // 暗月初升：可以提名死人（包括僵怖假死状态）
                  return s.role !== null;
                }
                // 其他情况：只能提名存活玩家
                return !s.isDead;
              }).map(s=>{
                // 8. 提名限制：检查是否已被提名或被提名过
                const isDisabled = showDayActionModal?.type === 'nominate' && (
                  nominationRecords.nominees.has(s.id) || 
                  nominationRecords.nominators.has(showDayActionModal.sourceId)
                );
                return (
                  <button 
                    key={s.id} 
                    onClick={()=>{
                      if (!isDisabled) {
                        handleDayAction(s.id);
                        setShowDayActionModal(null);
                        setShowShootModal(null);
                        setShowNominateModal(null);
                      }
                    }} 
                    disabled={isDisabled}
                    className={`p-4 border-2 rounded-xl text-xl font-bold transition-all ${
                      isDisabled ? 'opacity-30 cursor-not-allowed bg-gray-700' : 
                      'hover:bg-gray-700'
                    }`}
                  >
                    {s.id+1}号 {s.role?.name}
                  </button>
                );
              })}
            </div>
            <button 
              onClick={()=>{
                setShowDayActionModal(null);
                setShowShootModal(null);
                setShowNominateModal(null);
              }} 
              className="mt-8 w-full py-3 bg-gray-600 rounded-xl text-xl"
            >
              取消
            </button>
          </div>
        </div>
      )}
      
      {showVirginTriggerModal && (
        <div className="fixed inset-0 z-[3000] bg-black/90 flex items-center justify-center">
          <div className="bg-indigo-900 p-10 rounded-2xl text-center border-4 border-white">
            <h2 className="text-4xl font-bold text-yellow-300 mb-6">✨ 贞洁者触发！</h2>
            <div className="flex gap-6 justify-center">
              <button 
                onClick={()=>setShowVirginTriggerModal(null)} 
                className="px-6 py-4 bg-gray-600 rounded-xl text-xl"
              >
                取消
              </button>
              <button 
                onClick={confirmVirginTrigger} 
                className="px-6 py-4 bg-red-600 rounded-xl text-xl font-bold"
              >
                处决提名者
              </button>
            </div>
          </div>
        </div>
      )}
      
      {showRavenkeeperFakeModal!==null && (
        <div className="fixed inset-0 z-[3000] bg-black/90 flex items-center justify-center">
          <div className="bg-gray-800 p-8 rounded-2xl w-[600px] border-2 border-purple-500">
            <h2 className="text-2xl font-bold mb-6 text-center">🧛 (中毒) 编造结果</h2>
            <div className="grid grid-cols-3 gap-3">
              {roles.map(r=>(
                <button 
                  key={r.id} 
                  onClick={()=>confirmRavenkeeperFake(r)} 
                  className="p-3 border rounded-lg text-sm font-medium hover:bg-purple-900"
                >
                  {r.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      
      {showRavenkeeperResultModal && (
        <div className="fixed inset-0 z-[3000] bg-black/90 flex items-center justify-center">
          <div className="bg-gray-800 p-8 rounded-2xl w-[600px] border-2 border-blue-500 text-center">
            <h2 className="text-3xl font-bold mb-6 text-blue-400">🧛 守鸦人查验结果</h2>
            <p className="text-2xl font-bold text-white mb-8">
              {showRavenkeeperResultModal.targetId+1}号玩家的真实身份是{showRavenkeeperResultModal.roleName}
              {showRavenkeeperResultModal.isFake && <span className="text-red-400 text-xl block mt-2">(中毒/醉酒状态，此为假消息)</span>}
            </p>
            <button
              onClick={confirmRavenkeeperResult}
              className="px-12 py-4 bg-blue-600 rounded-xl font-bold text-2xl hover:bg-blue-700 transition-colors"
            >
              确认
            </button>
          </div>
        </div>
      )}

      {showMoonchildKillModal && (
        <div className="fixed inset-0 z-[3200] bg-black/90 flex items-center justify-center">
          <div className="bg-gray-800 p-8 rounded-2xl w-[600px] border-2 border-purple-500 text-center">
            <h2 className="text-3xl font-bold mb-4 text-purple-300">🌙 月之子已死</h2>
            <p className="text-lg text-gray-200 mb-6">请选择一名玩家与其陪葬</p>
            <div className="grid grid-cols-3 gap-3 max-h-[320px] overflow-y-auto">
              {seats
                .filter(s => !s.isDead && s.id !== showMoonchildKillModal.sourceId)
                .map(s => (
                  <button
                    key={s.id}
                    onClick={() => confirmMoonchildKill(s.id)}
                    className="p-3 border-2 border-purple-400 rounded-xl text-lg font-bold hover:bg-purple-900 transition-colors"
                  >
                    {s.id + 1}号 {s.role?.name ?? ''}
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
      
      {gamePhase==="dawnReport" && (
        <div className="fixed inset-0 z-[3000] bg-black/95 flex items-center justify-center">
          <div className="bg-gray-800 p-12 rounded-3xl text-center border-4 border-yellow-500 min-w-[500px]">
            <h2 className="text-6xl mb-8">🌅 天亮了！</h2>
            <p className="text-3xl text-gray-300 mb-10">
              昨晚死亡：<span className="text-red-500 font-bold">
                {deadThisNight.length>0 ? deadThisNight.map(id => `${id+1}号`).join('、') : "平安夜"}
              </span>
            </p>
            <button 
              onClick={()=>setGamePhase('day')} 
              className="px-12 py-5 bg-yellow-500 text-black font-bold rounded-full text-3xl"
            >
              开始白天
            </button>
          </div>
        </div>
      )}
      
      {gamePhase==="gameOver" && (
        <div className="fixed inset-0 z-[4000] bg-black/95 flex items-center justify-center">
          <div className="text-center">
            <h1 className={`text-8xl font-bold mb-10 ${
              winResult==='good'?'text-blue-500':'text-red-500'
            }`}>
              {winResult==='good'?'🏆 善良阵营胜利':'👿 邪恶阵营获胜'}
            </h1>
            {winReason && (
              <p className="text-xl text-gray-400 mb-8">
                胜利依据：{winReason}
              </p>
            )}
            <div className="flex gap-6 justify-center">
              <button 
                onClick={handleNewGame} 
                className="px-10 py-5 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-3xl font-bold transition-colors"
              >
                再来一局
              </button>
              <button 
                onClick={()=>setShowReviewModal(true)} 
                className="px-10 py-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full text-3xl font-bold transition-colors"
              >
                本局复盘
              </button>
            </div>
          </div>
        </div>
      )}
      
      {showReviewModal && (
        <div className="fixed inset-0 z-[5000] bg-black/95 flex flex-col p-10 overflow-auto">
          <div className="flex justify-between items-center mb-6">
              <h2 className="text-4xl">📜 对局复盘</h2>
            <button 
              onClick={()=>setShowReviewModal(false)} 
              className="px-6 py-2 bg-gray-700 hover:bg-gray-600 rounded text-lg"
            >
              关闭
            </button>
          </div>
          <div className="bg-black/50 p-6 rounded-xl flex gap-6 h-[calc(100vh-12rem)]">
            <div className="w-1/3">
              <h4 className="text-purple-400 mb-4 font-bold border-b pb-2 text-xl">📖 当前座位信息</h4>
              <div className="space-y-2 max-h-[calc(100vh-16rem)] overflow-y-auto">
                {seats.filter(s=>s.role).map(s => (
                  <div key={s.id} className="py-2 border-b border-gray-700 flex justify-between items-center">
                    <span className="font-bold">{s.id+1}号</span>
                    <div className="flex flex-col items-end">
                      <span className={s.role?.type==='demon'?'text-red-500 font-bold':s.role?.type==='minion'?'text-orange-500':'text-blue-400'}>
                        {s.role?.name}
                        {s.role?.id==='drunk'&&` (伪:${s.charadeRole?.name})`}
                        {s.isRedHerring && ' [红罗刹]'}
                      </span>
                      {s.isDead && <span className="text-xs text-gray-500 mt-1">💀 已死亡</span>}
                      {s.isPoisoned && <span className="text-xs text-green-500 mt-1">🧪 中毒</span>}
                      {s.isProtected && <span className="text-xs text-blue-500 mt-1">🛡️ 受保护</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="w-2/3">
              <h4 className="text-yellow-400 mb-4 font-bold border-b pb-2 text-xl">📋 操作记录</h4>
              <div className="space-y-4 max-h-[calc(100vh-16rem)] overflow-y-auto">
                {(() => {
                  // 按阶段顺序组织日志：firstNight -> night -> day -> dusk
                  const phaseOrder: Record<string, number> = {
                    'firstNight': 1,
                    'night': 2,
                    'day': 3,
                    'dusk': 4
                  };
                  
                  // 按天数和阶段分组
                  const logsByDayAndPhase = gameLogs.reduce((acc, log) => {
                    const key = `${log.day}_${log.phase}`;
                    if (!acc[key]) acc[key] = [];
                    acc[key].push(log);
                    return acc;
                  }, {} as Record<string, LogEntry[]>);
                  
                  // 转换为数组并排序
                  const sortedLogs = Object.entries(logsByDayAndPhase).sort((a, b) => {
                    const [dayA, phaseA] = a[0].split('_');
                    const [dayB, phaseB] = b[0].split('_');
                    const dayNumA = parseInt(dayA);
                    const dayNumB = parseInt(dayB);
                    if (dayNumA !== dayNumB) return dayNumA - dayNumB;
                    return (phaseOrder[phaseA] || 999) - (phaseOrder[phaseB] || 999);
                  });
                  
                  return sortedLogs.map(([key, logs]) => {
                    const [day, phase] = key.split('_');
                    const phaseName = 
                      phase === 'firstNight' ? '第1夜' : 
                      phase === 'night' ? `第${day}夜` :
                      phase === 'day' ? `第${day}天` :
                      phase === 'dusk' ? `第${day}天黄昏` : `第${day}轮`;
                    
                    return (
                      <div key={key} className="mb-4 bg-gray-900/50 p-4 rounded-lg">
                        <div className="text-yellow-300 font-bold mb-3 text-lg border-b border-yellow-500/30 pb-2">
                          {phaseName}
                        </div>
                        <div className="space-y-2">
                          {logs.map((l, i) => (
                            <div key={i} className="py-2 border-b border-gray-700 text-gray-300 text-sm pl-2">
                              {l.message}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  });
                })()}
                {gameLogs.length === 0 && (
                  <div className="text-gray-500 text-center py-8">
                    暂无操作记录
                  </div>
                )}
                {gamePhase === 'gameOver' && winReason && (
                  <div className="mt-6 pt-4 border-t-2 border-yellow-500">
                    <div className={`text-lg font-bold ${
                      winResult === 'good' ? 'text-blue-400' : 'text-red-400'
                    }`}>
                      {winResult === 'good' ? '🏆 善良阵营胜利' : '👿 邪恶阵营获胜'}：{winReason}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showGameRecordsModal && (
        <div className="fixed inset-0 z-[5000] bg-black/95 flex flex-col p-10 overflow-auto">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-4xl">📚 对局记录</h2>
            <button 
              onClick={()=>setShowGameRecordsModal(false)} 
              className="px-6 py-2 bg-gray-700 hover:bg-gray-600 rounded text-lg"
            >
              关闭
            </button>
          </div>
          <div className="space-y-4 max-h-[calc(100vh-8rem)] overflow-y-auto">
            {gameRecords.length === 0 ? (
              <div className="text-center text-gray-500 py-20">
                <p className="text-2xl mb-4">暂无对局记录</p>
                <p className="text-sm">完成游戏后，记录会自动保存到这里</p>
              </div>
            ) : (
              gameRecords.map((record) => {
                const startDate = new Date(record.startTime);
                const endDate = new Date(record.endTime);
                const startTimeStr = startDate.toLocaleString('zh-CN', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false
                });
                const endTimeStr = endDate.toLocaleString('zh-CN', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false
                });
                const durationStr = formatTimer(record.duration);
                
                // 按阶段顺序组织日志
                const phaseOrder: Record<string, number> = {
                  'firstNight': 1,
                  'night': 2,
                  'day': 3,
                  'dusk': 4
                };
                
                const logsByDayAndPhase = record.gameLogs.reduce((acc, log) => {
                  const key = `${log.day}_${log.phase}`;
                  if (!acc[key]) acc[key] = [];
                  acc[key].push(log);
                  return acc;
                }, {} as Record<string, LogEntry[]>);
                
                const sortedLogs = Object.entries(logsByDayAndPhase).sort((a, b) => {
                  const [dayA, phaseA] = a[0].split('_');
                  const [dayB, phaseB] = b[0].split('_');
                  const dayNumA = parseInt(dayA);
                  const dayNumB = parseInt(dayB);
                  if (dayNumA !== dayNumB) return dayNumA - dayNumB;
                  return (phaseOrder[phaseA] || 999) - (phaseOrder[phaseB] || 999);
                });
                
                return (
                  <div key={record.id} className="bg-gray-900/50 p-6 rounded-xl border border-gray-700">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-2xl font-bold text-white mb-2">{record.scriptName}</h3>
                        <div className="text-sm text-gray-400 space-y-1">
                          <p>开始时间：{startTimeStr}</p>
                          <p>结束时间：{endTimeStr}</p>
                          <p>游戏时长：{durationStr}</p>
                        </div>
                      </div>
                      <div className={`text-xl font-bold px-4 py-2 rounded ${
                        record.winResult === 'good' 
                          ? 'bg-blue-900/50 text-blue-400 border border-blue-500' 
                          : record.winResult === 'evil'
                          ? 'bg-red-900/50 text-red-400 border border-red-500'
                          : 'bg-gray-700/50 text-gray-300 border border-gray-500'
                      }`}>
                        {record.winResult === 'good' 
                          ? '🏆 善良阵营胜利' 
                          : record.winResult === 'evil'
                          ? '👿 邪恶阵营获胜'
                          : '🔄 游戏未完成'}
                      </div>
                    </div>
                    {record.winReason && (
                      <p className="text-sm text-gray-300 mb-4">
                        {record.winResult ? '胜利依据' : '结束原因'}：{record.winReason}
                      </p>
                    )}
                    
                    <div className="grid grid-cols-2 gap-6 mt-6">
                      <div>
                        <h4 className="text-purple-400 mb-3 font-bold border-b pb-2">📖 座位信息</h4>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {record.seats.filter(s=>s.role).map(s => (
                            <div key={s.id} className="py-1 border-b border-gray-700 flex justify-between items-center text-sm">
                              <span className="font-bold">{s.id+1}号</span>
                              <div className="flex flex-col items-end">
                                <span className={s.role?.type==='demon'?'text-red-500 font-bold':s.role?.type==='minion'?'text-orange-500':'text-blue-400'}>
                                  {s.role?.name}
                                  {s.role?.id==='drunk'&&` (伪:${s.charadeRole?.name})`}
                                  {s.isRedHerring && ' [红罗刹]'}
                                </span>
                                {s.isDead && <span className="text-xs text-gray-500">💀 已死亡</span>}
                                {s.isPoisoned && <span className="text-xs text-green-500">🧪 中毒</span>}
                                {s.isProtected && <span className="text-xs text-blue-500">🛡️ 受保护</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      <div>
                        <h4 className="text-yellow-400 mb-3 font-bold border-b pb-2">📋 操作记录</h4>
                        <div className="space-y-3 max-h-64 overflow-y-auto">
                          {sortedLogs.map(([key, logs]) => {
                            const [day, phase] = key.split('_');
                            const phaseName = 
                              phase === 'firstNight' ? '第1夜' : 
                              phase === 'night' ? `第${day}夜` :
                              phase === 'day' ? `第${day}天` :
                              phase === 'dusk' ? `第${day}天黄昏` : `第${day}轮`;
                            
                            return (
                              <div key={key} className="bg-gray-800/50 p-2 rounded text-xs">
                                <div className="text-yellow-300 font-bold mb-1">{phaseName}</div>
                                <div className="space-y-1">
                                  {logs.map((l, i) => (
                                    <div key={i} className="text-gray-300 pl-2 text-xs">
                                      {l.message}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                          {record.gameLogs.length === 0 && (
                            <div className="text-gray-500 text-center py-4 text-sm">暂无操作记录</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {showRoleInfoModal && (
        <div className="fixed inset-0 z-[5000] bg-black/95 flex flex-col p-8 overflow-auto">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-4xl">📖 角色信息</h2>
            <button 
              onClick={()=>setShowRoleInfoModal(false)} 
              className="px-6 py-2 bg-gray-700 hover:bg-gray-600 rounded text-lg"
            >
              确认
            </button>
          </div>
          <div className="space-y-8">
            {Object.entries(groupedRoles).map(([type, roleList]) => (
              <div key={type} className="bg-gray-900/50 p-6 rounded-xl">
                <h3 className={`text-2xl font-bold mb-4 ${typeColors[type]}`}>
                  {typeLabels[type]}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {roleList.map((role) => (
                    <div 
                      key={role.id} 
                      className={`p-4 border-2 rounded-lg ${typeColors[type]} ${typeBgColors[type]} transition-all hover:scale-105`}
                    >
                      <div className="font-bold text-lg mb-2">{role.name}</div>
                      <div className="text-sm text-gray-300 leading-relaxed">
                        {role.ability}
                      </div>
                      {(role.firstNight || role.otherNight) && (
                        <div className="mt-3 pt-3 border-t border-gray-700 text-xs text-gray-400">
                          {role.firstNight && role.otherNight && (
                            <div>首夜与其他夜晚行动</div>
                          )}
                          {role.firstNight && !role.otherNight && (
                            <div>仅首夜行动</div>
                          )}
                          {!role.firstNight && role.otherNight && (
                            <div>其他夜晚行动</div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {contextMenu && (() => {
        const targetSeat = seats.find(s => s.id === contextMenu.seatId);
        if (!targetSeat) return null;
        return (
        <div 
          className="absolute bg-gray-800 border-2 border-gray-500 rounded-xl shadow-2xl z-[3000] w-48 overflow-hidden" 
          style={{top:contextMenu.y,left:contextMenu.x}}
        >
          {gamePhase==='dusk' && !targetSeat.isDead && (
            <button 
              onClick={()=>handleMenuAction('nominate')} 
              disabled={nominationRecords.nominators.has(contextMenu.seatId)}
              className={`block w-full text-left px-6 py-4 hover:bg-purple-900 text-purple-300 font-bold text-lg border-b border-gray-600 ${
                nominationRecords.nominators.has(contextMenu.seatId) ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              🗣️ 提名
            </button>
          )}
          {/* 开枪可以在任意环节（除了setup阶段） */}
          {!targetSeat.isDead && gamePhase !== 'setup' && (
            <button 
              onClick={()=>handleMenuAction('slayer')} 
              disabled={targetSeat.hasUsedSlayerAbility}
              className={`block w-full text-left px-6 py-4 hover:bg-red-900 text-red-300 font-bold text-lg border-b border-gray-600 ${
                targetSeat.hasUsedSlayerAbility ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              💥 开枪
            </button>
          )}
          <button 
            onClick={()=>toggleStatus('dead')} 
            className="block w-full text-left px-6 py-3 hover:bg-gray-700 text-lg font-medium"
          >
            💀 切换死亡
          </button>
          {/* 在核对身份阶段，允许选择红罗刹（仅限善良阵营），爪牙和恶魔为灰色不可选 */}
          {gamePhase === 'check' && targetSeat.role && (
            <button
              onClick={()=>!['minion','demon'].includes(targetSeat.role!.type) && toggleStatus('redherring')}
              disabled={['minion','demon'].includes(targetSeat.role.type)}
              className={`block w-full text-left px-6 py-3 text-lg font-medium border-t border-gray-700 whitespace-nowrap ${
                ['minion','demon'].includes(targetSeat.role.type)
                  ? 'text-gray-500 cursor-not-allowed bg-gray-800'
                  : 'hover:bg-red-900 text-red-300'
              }`}
            >
              🎭 选为红罗刹
            </button>
          )}
        </div>
        );
      })()}
      
      
      {/* 6. 处决结果弹窗 */}
      {showExecutionResultModal && (
        <div className="fixed inset-0 z-[5000] bg-black/80 flex items-center justify-center">
          <div className="bg-gray-800 border-4 border-red-500 rounded-2xl p-8 max-w-md text-center">
            <h2 className="text-4xl font-bold text-red-400 mb-6">⚖️ 处决结果</h2>
            <p className="text-3xl font-bold text-white mb-8">{showExecutionResultModal.message}</p>
            <button
              onClick={confirmExecutionResult}
              className="px-12 py-4 bg-green-600 rounded-xl font-bold text-2xl hover:bg-green-700 transition-colors"
            >
              确认
            </button>
          </div>
        </div>
      )}
      
      {/* 开枪结果弹窗 */}
      {showShootResultModal && (
        <div className="fixed inset-0 z-[5000] bg-black/80 flex items-center justify-center">
          <div className={`bg-gray-800 border-4 ${showShootResultModal.isDemonDead ? 'border-red-500' : 'border-yellow-500'} rounded-2xl p-8 max-w-md text-center`}>
            <h2 className={`text-4xl font-bold mb-6 ${showShootResultModal.isDemonDead ? 'text-red-400' : 'text-yellow-400'}`}>
              {showShootResultModal.isDemonDead ? '💥 恶魔死亡' : '💥 开枪结果'}
            </h2>
            <p className="text-3xl font-bold text-white mb-8">{showShootResultModal.message}</p>
            <button
              onClick={confirmShootResult}
              className="px-12 py-4 bg-green-600 rounded-xl font-bold text-2xl hover:bg-green-700 transition-colors"
            >
              确认
            </button>
          </div>
        </div>
      )}
      
      {/* 恶魔确认杀死玩家弹窗 */}
      {showKillConfirmModal !== null && (
        <div className="fixed inset-0 z-[5000] bg-black/80 flex items-center justify-center">
          <div className="bg-gray-800 border-4 border-red-500 rounded-2xl p-8 max-w-md text-center">
            {nightInfo && nightInfo.effectiveRole.id === 'imp' && showKillConfirmModal === nightInfo.seat.id ? (
              <>
                <h2 className="text-4xl font-bold text-red-400 mb-6">👑 确认转移身份</h2>
                <p className="text-3xl font-bold text-white mb-4">确认选择自己吗？</p>
                <p className="text-xl text-yellow-400 mb-8">身份将转移给场上的一个爪牙，你将在夜晚死亡</p>
              </>
            ) : (
              <>
                <h2 className="text-4xl font-bold text-red-400 mb-6">💀 确认杀死玩家</h2>
                <p className="text-3xl font-bold text-white mb-8">确认杀死{showKillConfirmModal+1}号玩家吗？</p>
              </>
            )}
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => {
                  setShowKillConfirmModal(null);
                  setSelectedActionTargets([]);
                }}
                className="px-8 py-4 bg-gray-600 rounded-xl font-bold text-xl hover:bg-gray-700 transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmKill}
                className="px-8 py-4 bg-red-600 rounded-xl font-bold text-xl hover:bg-red-700 transition-colors"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 市长被攻击时的死亡转移弹窗 */}
      {showMayorRedirectModal && (
        <div className="fixed inset-0 z-[5100] bg-black/80 flex items-center justify-center px-4">
          <div className="bg-gray-800 border-4 border-yellow-500 rounded-2xl p-8 max-w-4xl w-full text-center">
            <h2 className="text-4xl font-bold text-yellow-300 mb-4">🏛️ 市长被攻击</h2>
            <p className="text-2xl text-white mb-2">
              恶魔（{showMayorRedirectModal.demonName}）攻击了 {showMayorRedirectModal.targetId+1}号(市长)。
            </p>
            <p className="text-xl text-yellow-200 mb-6">是否要转移死亡目标？选择一名存活玩家代替死亡，或让市长死亡。</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-[320px] overflow-y-auto mb-6">
              {seats
                .filter(s => !s.isDead && s.id !== showMayorRedirectModal.targetId)
                .map(seat => (
                  <button
                    key={seat.id}
                    onClick={() => setMayorRedirectTarget(seat.id)}
                    className={`p-4 rounded-xl border-2 transition-colors text-left ${
                      mayorRedirectTarget === seat.id ? 'border-yellow-400 bg-yellow-400/20' : 'border-gray-600 bg-gray-700/60'
                    }`}
                  >
                    <div className="text-2xl font-bold text-white">{seat.id+1}号</div>
                    <div className="text-sm text-gray-200">{seat.role?.name || '未分配'}</div>
                    {seat.isProtected && <div className="text-xs text-green-300 mt-1">被保护</div>}
                  </button>
                ))}
            </div>
            <div className="flex flex-wrap gap-4 justify-center">
              <button
                onClick={() => {
                  setMayorRedirectTarget(null);
                  confirmMayorRedirect(null);
                }}
                className="px-8 py-4 bg-red-600 rounded-xl font-bold text-xl hover:bg-red-700 transition-colors"
              >
                不转移，让市长死亡
              </button>
              <button
                disabled={mayorRedirectTarget === null}
                onClick={() => mayorRedirectTarget !== null && confirmMayorRedirect(mayorRedirectTarget)}
                className={`px-8 py-4 rounded-xl font-bold text-xl transition-colors ${
                  mayorRedirectTarget === null
                    ? 'bg-gray-600 text-gray-300 cursor-not-allowed'
                    : 'bg-yellow-500 text-black hover:bg-yellow-400'
                }`}
              >
                {mayorRedirectTarget !== null ? `转移给 ${mayorRedirectTarget+1}号` : '请选择替死玩家'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* 投毒者确认下毒弹窗（善良玩家） */}
      {showPoisonConfirmModal !== null && (
        <div className="fixed inset-0 z-[5000] bg-black/80 flex items-center justify-center">
          <div className="bg-gray-800 border-4 border-purple-500 rounded-2xl p-8 max-w-md text-center">
            <h2 className="text-4xl font-bold text-purple-400 mb-6">🧪 确认下毒</h2>
            <p className="text-3xl font-bold text-white mb-8">确认对{showPoisonConfirmModal+1}号玩家下毒吗？</p>
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => {
                  setShowPoisonConfirmModal(null);
                  setSelectedActionTargets([]);
                }}
                className="px-8 py-4 bg-gray-600 rounded-xl font-bold text-xl hover:bg-gray-700 transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmPoison}
                className="px-8 py-4 bg-purple-600 rounded-xl font-bold text-xl hover:bg-purple-700 transition-colors"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* 投毒者确认对邪恶玩家下毒弹窗（二次确认） */}
      {showPoisonEvilConfirmModal !== null && (
        <div className="fixed inset-0 z-[5000] bg-black/80 flex items-center justify-center">
          <div className="bg-gray-800 border-4 border-red-500 rounded-2xl p-8 max-w-md text-center">
            <h2 className="text-4xl font-bold text-red-400 mb-6">⚠️ 警告</h2>
            <p className="text-3xl font-bold text-white mb-4">该玩家是邪恶阵营</p>
            <p className="text-2xl font-bold text-yellow-400 mb-8">确认对{showPoisonEvilConfirmModal+1}号玩家下毒吗？</p>
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => {
                  setShowPoisonEvilConfirmModal(null);
                  setSelectedActionTargets([]);
                }}
                className="px-8 py-4 bg-gray-600 rounded-xl font-bold text-xl hover:bg-gray-700 transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmPoisonEvil}
                className="px-8 py-4 bg-red-600 rounded-xl font-bold text-xl hover:bg-red-700 transition-colors"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* 夜晚死亡报告弹窗 */}
      {showNightDeathReportModal && (
        <div className="fixed inset-0 z-[5000] bg-black/80 flex items-center justify-center">
          <div className="bg-gray-800 border-4 border-blue-500 rounded-2xl p-8 max-w-md text-center">
            <h2 className="text-4xl font-bold text-blue-400 mb-6">🌙 夜晚报告</h2>
            <p className="text-3xl font-bold text-white mb-8">{showNightDeathReportModal}</p>
            <button
              onClick={confirmNightDeathReport}
              className="px-12 py-4 bg-green-600 rounded-xl font-bold text-2xl hover:bg-green-700 transition-colors"
            >
              确认
            </button>
          </div>
        </div>
      )}
      
      {/* 重开确认弹窗 */}
      {showRestartConfirmModal && (
        <div className="fixed inset-0 z-[5000] bg-black/80 flex items-center justify-center">
          <div className="bg-gray-800 border-4 border-red-500 rounded-2xl p-8 max-w-md text-center">
            <h2 className="text-4xl font-bold text-red-400 mb-6">🔄 确认重开</h2>
            <p className="text-3xl font-bold text-white mb-8">确定重开游戏吗？</p>
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => setShowRestartConfirmModal(false)}
                className="px-8 py-4 bg-gray-600 rounded-xl font-bold text-xl hover:bg-gray-700 transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmRestart}
                className="px-8 py-4 bg-red-600 rounded-xl font-bold text-xl hover:bg-red-700 transition-colors"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

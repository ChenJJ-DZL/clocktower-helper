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

// 暗流涌动标准阵容（用于校验/自动重排）
const troubleBrewingPresets = [
  { total: 5, townsfolk: 3, outsider: 0, minion: 1, demon: 1 },
  { total: 6, townsfolk: 3, outsider: 1, minion: 1, demon: 1 },
  { total: 7, townsfolk: 5, outsider: 0, minion: 1, demon: 1 },
  { total: 8, townsfolk: 5, outsider: 1, minion: 1, demon: 1 },
  { total: 9, townsfolk: 5, outsider: 2, minion: 1, demon: 1 },
  { total: 10, townsfolk: 7, outsider: 0, minion: 2, demon: 1 },
  { total: 11, townsfolk: 7, outsider: 1, minion: 2, demon: 1 },
  { total: 12, townsfolk: 7, outsider: 2, minion: 2, demon: 1 },
  { total: 13, townsfolk: 9, outsider: 0, minion: 3, demon: 1 },
  { total: 14, townsfolk: 9, outsider: 1, minion: 3, demon: 1 },
  { total: 15, townsfolk: 9, outsider: 4, minion: 2, demon: 1 },
];

// --- 工具函数 ---
const formatTimer = (s: number) => {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
};

const getSeatPosition = (index: number, total: number = 15, isPortrait: boolean = false) => {
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
  // 竖屏时使用椭圆形布局（垂直方向更长）
  if (isPortrait) {
    // 计算座位13（index=12）和座位14（index=13）之间的纵向距离作为基准
    const seat13Index = 12; // 座位13（显示编号13，实际index是12）
    const seat14Index = 13; // 座位14（显示编号14，实际index是13）
    
    const angle13 = (seat13Index / total) * 2 * Math.PI - Math.PI / 2;
    const angle14 = (seat14Index / total) * 2 * Math.PI - Math.PI / 2;
    
    // 目标纵向距离：座位13和14之间的理想纵向间距（百分比）
    // 这个值可以根据实际显示效果调整，增大=拉长椭圆，减小=压缩椭圆
    const targetVerticalDistance = 3.5; // 目标纵向距离（百分比），可根据需要调整
    
    // 根据目标距离计算合适的radiusY
    // 公式：distance = radiusY * |sin(angle14) - sin(angle13)|
    // 所以：radiusY = distance / |sin(angle14) - sin(angle13)|
    const sinDiff = Math.abs(Math.sin(angle14) - Math.sin(angle13));
    const calculatedRadiusY = sinDiff > 0 ? targetVerticalDistance / sinDiff : 54;
    
    // 使用计算出的radiusY，但设置合理的范围限制
    const radiusX = 44; // 水平半径保持不变
    const radiusY = Math.max(45, Math.min(65, calculatedRadiusY)); // 限制在45-65之间，避免过大或过小
    
    const x = 50 + radiusX * Math.cos(angle);
    const y = 50 + radiusY * Math.sin(angle);
    return { x: x.toFixed(2), y: y.toFixed(2) };
  } else {
    // 横屏时使用圆形布局
    const radius = 55; // 增大半径，增加座位间距，避免遮挡
    const x = 50 + radius * Math.cos(angle);
    const y = 50 + radius * Math.sin(angle);
    return { x: x.toFixed(2), y: y.toFixed(2) };
  }
};

const getRandom = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// 获取玩家的注册阵营（用于查验类技能）
// 间谍：虽然是爪牙，但可以被注册为"Good"（善良）
// 隐士：虽然是外来者，但可以被注册为"Evil"（邪恶）
// viewingRole: 执行查验的角色，用于判断是否需要应用注册判定
type RegistrationCacheOptions = {
  cache?: Map<string, RegistrationResult>;
  cacheKey?: string;
};

const buildRegistrationCacheKey = (
  targetPlayer: Seat,
  viewingRole?: Role | null,
  spyDisguiseMode?: 'off' | 'default' | 'on',
  spyDisguiseProbability?: number,
  options?: RegistrationCacheOptions
): string | null => {
  if (!options?.cache || !options.cacheKey) return null;
  const targetRoleId = targetPlayer.role?.id ?? 'none';
  const viewerId = viewingRole?.id ?? 'none';
  const disguise = spyDisguiseMode ?? 'default';
  const probability = spyDisguiseProbability ?? 'default';
  const successor = targetPlayer.isDemonSuccessor ? 'succ' : 'normal';
  return `${options.cacheKey}-t${targetPlayer.id}-${targetRoleId}-v${viewerId}-${disguise}-${probability}-${successor}`;
};

const getRegisteredAlignment = (
  targetPlayer: Seat, 
  viewingRole?: Role | null,
  spyDisguiseMode?: 'off' | 'default' | 'on',
  spyDisguiseProbability?: number,
  options?: RegistrationCacheOptions
): 'Good' | 'Evil' => {
  const registration = getRegistration(
    targetPlayer,
    viewingRole,
    spyDisguiseMode,
    spyDisguiseProbability,
    options
  );
  return registration.alignment;
};

// 判断玩家是否被注册为恶魔（用于占卜师等角色）
// 隐士可能被注册为恶魔，间谍不相关（占卜师检查的是恶魔，不是邪恶）
const isRegisteredAsDemon = (
  targetPlayer: Seat,
  options?: RegistrationCacheOptions
): boolean => {
  const registration = getRegistration(
    targetPlayer,
    undefined,
    undefined,
    undefined,
    options
  );
  return registration.registersAsDemon;
};

// 判断玩家是否被注册为爪牙（用于调查员等角色）
// 间谍虽然是爪牙，但可能被注册为"Good"（善良），此时不应被调查员看到
// viewingRole: 执行查验的角色，用于判断是否需要应用注册判定
const isRegisteredAsMinion = (
  targetPlayer: Seat,
  viewingRole?: Role | null,
  spyDisguiseMode?: 'off' | 'default' | 'on',
  spyDisguiseProbability?: number,
  options?: RegistrationCacheOptions
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
        spyDisguiseProbability,
        options
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
  spyDisguiseProbability?: number,
  options?: RegistrationCacheOptions
): RegistrationResult => {
  const role = targetPlayer.role;
  if (!role) {
    return { alignment: 'Good', roleType: null, registersAsDemon: false, registersAsMinion: false };
  }

  const cacheKey = buildRegistrationCacheKey(
    targetPlayer,
    viewingRole,
    spyDisguiseMode,
    spyDisguiseProbability,
    options
  );
  if (cacheKey && options?.cache?.has(cacheKey)) {
    return options.cache.get(cacheKey)!;
  }

  // 真实基准
  let registeredRoleType: RoleType | null = targetPlayer.isDemonSuccessor ? 'demon' : role.type;
  let registeredAlignment: 'Good' | 'Evil' =
    registeredRoleType === 'demon' || registeredRoleType === 'minion' ? 'Evil' : 'Good';

  // 灵言师等效果转换为邪恶阵营时，保持原角色类型但阵营视为邪恶
  if (targetPlayer.isEvilConverted) {
    registeredAlignment = 'Evil';
  }

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

  const result: RegistrationResult = {
    alignment: registeredAlignment,
    roleType: registeredRoleType,
    registersAsDemon: registeredRoleType === 'demon',
    registersAsMinion: registeredRoleType === 'minion',
  };
  if (cacheKey && options?.cache) {
    options.cache.set(cacheKey, result);
  }
  return result;
};

const getSeatRoleId = (seat?: Seat | null): string | null => {
  if (!seat) return null;
  const role = seat.role?.id === 'drunk' ? seat.charadeRole : seat.role;
  return role ? role.id : null;
};

// 清理临时状态：用于复活、变身、交换等场景
const cleanseSeatStatuses = (seat: Seat, opts?: { keepDeathState?: boolean }): Seat => {
  const preservedDetails = (seat.statusDetails || []).filter(detail => detail === '永久中毒');
  const preservedStatuses = (seat.statuses || []).filter(st => st.duration === 'permanent');
  const base = {
    ...seat,
    isPoisoned: preservedDetails.includes('永久中毒'),
    isDrunk: false,
    isSentenced: false,
    hasAbilityEvenDead: false,
    isEvilConverted: false,
    isGoodConverted: false,
    statusDetails: preservedDetails,
    statuses: preservedStatuses,
    isFirstDeathForZombuul: opts?.keepDeathState ? seat.isFirstDeathForZombuul : false,
  };
  if (opts?.keepDeathState) {
    return { ...base, isDead: seat.isDead };
  }
  return { ...base, isDead: false };
};

// 统一计算中毒来源（永久、亡骨魔、普卡、日毒、状态标记）
const getPoisonSources = (seat: Seat) => {
  const details = seat.statusDetails || [];
  const statuses = seat.statuses || [];
  // 检查所有带清除时间的中毒标记
  const poisonPatterns = [
    /永久中毒/,
    /亡骨魔中毒（.*清除）/,
    /普卡中毒（.*清除）/,
    /投毒（.*清除）/,
    /诺-达中毒（.*清除）/,
    /食人族中毒（.*清除）/,
    /舞蛇人中毒（.*清除）/
  ];
  const hasAnyPoisonMark = poisonPatterns.some(pattern => 
    details.some(d => pattern.test(d))
  );
  return {
    permanent: details.some(d => d.includes('永久中毒')),
    vigormortis: details.some(d => d.includes('亡骨魔中毒')),
    pukka: details.some(d => d.includes('普卡中毒')),
    dayPoison: details.some(d => d.includes('投毒') && d.includes('清除')),
    noDashii: details.some(d => d.includes('诺-达中毒')),
    cannibal: details.some(d => d.includes('食人族中毒')),
    snakeCharmer: details.some(d => d.includes('舞蛇人中毒')),
    statusPoison: statuses.some(st => st.effect === 'Poison' && st.duration !== 'expired'),
    direct: seat.isPoisoned,
    anyMark: hasAnyPoisonMark,
  };
};

const computeIsPoisoned = (seat: Seat) => {
  const src = getPoisonSources(seat);
  return src.permanent || src.vigormortis || src.pukka || src.dayPoison || 
         src.noDashii || src.cannibal || src.snakeCharmer || 
         src.statusPoison || src.direct || src.anyMark;
};

// 统一添加中毒标记（带清除时间）
const addPoisonMark = (
  seat: Seat, 
  poisonType: 'permanent' | 'vigormortis' | 'pukka' | 'poisoner' | 'poisoner_mr' | 'no_dashii' | 'cannibal' | 'snake_charmer',
  clearTime: string
): { statusDetails: string[], statuses: StatusEffect[] } => {
  const details = seat.statusDetails || [];
  const statuses = seat.statuses || [];
  
  let markText = '';
  switch(poisonType) {
    case 'permanent':
      markText = '永久中毒';
      break;
    case 'vigormortis':
      markText = `亡骨魔中毒（${clearTime}清除）`;
      break;
    case 'pukka':
      markText = `普卡中毒（${clearTime}清除）`;
      break;
    case 'poisoner':
      markText = `投毒（${clearTime}清除）`;
      break;
    case 'poisoner_mr':
      markText = `投毒（${clearTime}清除）`;
      break;
    case 'no_dashii':
      markText = `诺-达中毒（${clearTime}清除）`;
      break;
    case 'cannibal':
      markText = `食人族中毒（${clearTime}清除）`;
      break;
    case 'snake_charmer':
      markText = `舞蛇人中毒（永久）`;
      break;
  }
  
  // 移除同类型的旧标记，添加新标记
  const filteredDetails = details.filter(d => {
    if (poisonType === 'permanent' || poisonType === 'snake_charmer') {
      return !d.includes('永久中毒') && !d.includes('舞蛇人中毒');
    } else if (poisonType === 'vigormortis') {
      return !d.includes('亡骨魔中毒');
    } else if (poisonType === 'pukka') {
      return !d.includes('普卡中毒');
    } else if (poisonType === 'poisoner' || poisonType === 'poisoner_mr') {
      return !d.includes('投毒');
    } else if (poisonType === 'no_dashii') {
      return !d.includes('诺-达中毒');
    } else if (poisonType === 'cannibal') {
      return !d.includes('食人族中毒');
    }
    return true;
  });
  
  const newDetails = [...filteredDetails, markText];
  const newStatuses = [...statuses, { effect: 'Poison', duration: clearTime }];
  
  return { statusDetails: newDetails, statuses: newStatuses };
};

// 统一添加酒鬼标记（带清除时间）
const addDrunkMark = (
  seat: Seat,
  drunkType: 'sweetheart' | 'goon' | 'sailor' | 'innkeeper' | 'courtier' | 'philosopher' | 'minstrel',
  clearTime: string
): { statusDetails: string[], statuses: StatusEffect[] } => {
  const details = seat.statusDetails || [];
  const statuses = seat.statuses || [];
  
  let markText = '';
  switch(drunkType) {
    case 'sweetheart':
      markText = `心上人致醉（${clearTime}清除）`;
      break;
    case 'goon':
      markText = `莽夫使其醉酒（${clearTime}清除）`;
      break;
    case 'sailor':
      markText = `水手致醉（${clearTime}清除）`;
      break;
    case 'innkeeper':
      markText = `旅店老板致醉（${clearTime}清除）`;
      break;
    case 'courtier':
      markText = `侍臣致醉（${clearTime}清除）`;
      break;
    case 'philosopher':
      markText = `哲学家致醉（${clearTime}清除）`;
      break;
    case 'minstrel':
      markText = `吟游诗人致醉（${clearTime}清除）`;
      break;
  }
  
  // 移除同类型的旧标记，添加新标记
  const filteredDetails = details.filter(d => {
    if (drunkType === 'sweetheart') {
      return !d.includes('心上人致醉');
    } else if (drunkType === 'goon') {
      return !d.includes('莽夫使其醉酒');
    } else if (drunkType === 'sailor') {
      return !d.includes('水手致醉');
    } else if (drunkType === 'innkeeper') {
      return !d.includes('旅店老板致醉');
    } else if (drunkType === 'courtier') {
      return !d.includes('侍臣致醉');
    } else if (drunkType === 'philosopher') {
      return !d.includes('哲学家致醉');
    } else if (drunkType === 'minstrel') {
      return !d.includes('吟游诗人致醉');
    }
    return true;
  });
  
  const newDetails = [...filteredDetails, markText];
  const newStatuses = [...statuses, { effect: 'Drunk', duration: clearTime }];
  
  return { statusDetails: newDetails, statuses: newStatuses };
};

// 判断玩家是否为邪恶阵营（真实阵营）
const isEvil = (seat: Seat): boolean => {
  if (!seat.role) return false;
  if (seat.isGoodConverted) return false;
  return seat.isEvilConverted === true ||
         seat.role.type === 'demon' || 
         seat.role.type === 'minion' || 
         seat.isDemonSuccessor ||
         (seat.role.id === 'recluse' && Math.random() < 0.3);
};

// 判断玩家在胜负条件计算中是否属于邪恶阵营（仅计算爪牙和恶魔，隐士永远属于善良阵营）
const isEvilForWinCondition = (seat: Seat): boolean => {
  if (!seat.role) return false;
  if (seat.isGoodConverted) return false;
  return seat.isEvilConverted === true ||
         seat.role.type === 'demon' || 
         seat.role.type === 'minion' || 
         seat.isDemonSuccessor;
};

const isGoodAlignment = (seat: Seat): boolean => {
  if (!seat.role) return false;
  const roleType = seat.role.type;
  if (seat.isEvilConverted) return false;
  if (seat.isGoodConverted) return true;
  return roleType !== 'demon' && roleType !== 'minion' && !seat.isDemonSuccessor;
};

// 用于渲染的阵营颜色：优先考虑转换标记
const getDisplayRoleType = (seat: Seat): string | null => {
  if (!seat.role) return null;
  if (seat.isEvilConverted) return 'demon';
  if (seat.isGoodConverted) return 'townsfolk';
  return seat.role.type;
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
  drunkFirstInfoMap: Map<number, boolean>,
  forceFake: boolean = false
): { showFake: boolean; isFirstTime: boolean } => {
  if (forceFake) {
    return { showFake: true, isFirstTime: false };
  }
  // 实时检测中毒和酒鬼状态
  const isDrunk = targetSeat.isDrunk || targetSeat.role?.id === "drunk";
  const isPoisoned = computeIsPoisoned(targetSeat);
  
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
  deadThisNight: number[] = [],
  balloonistKnownTypes?: Record<number, string[]>,
  addLogCb?: (msg: string) => void,
  registrationCache?: Map<string, RegistrationResult>,
  registrationCacheKey?: string,
  vortoxWorld?: boolean,
  demonVotedToday?: boolean,
  minionNominatedToday?: boolean,
  executedToday?: number | null,
  hasUsedAbilityFn?: (roleId: string, seatId: number) => boolean
): NightInfoResult | null => {
  // 使用传入的判定函数，如果没有则使用默认的isEvil
  const checkEvil = isEvilWithJudgmentFn || isEvil;
  const registrationOptions: RegistrationCacheOptions | undefined = registrationCache
    ? { cache: registrationCache, cacheKey: registrationCacheKey }
    : undefined;
  const getCachedRegistration = (player: Seat, viewer?: Role | null) =>
    getRegistration(player, viewer, spyDisguiseMode, spyDisguiseProbability, registrationOptions);
  const buildRegistrationGuideNote = (viewer: Role): string | null => {
    const typeLabels: Record<RoleType, string> = {
      townsfolk: "镇民",
      outsider: "外来者",
      minion: "爪牙",
      demon: "恶魔",
    };
    const affected = seats.filter(
      (s) => s.role && (s.role.id === "spy" || s.role.id === "recluse")
    );
    if (affected.length === 0) return null;
    const lines = affected.map((s) => {
      const reg = getCachedRegistration(s, viewer);
      const typeLabel = reg.roleType ? typeLabels[reg.roleType] || reg.roleType : "无类型";
      const status =
        reg.registersAsDemon
          ? "在眼中 = 恶魔"
          : reg.registersAsMinion
            ? "在眼中 = 爪牙"
            : `在眼中 = ${reg.alignment === "Evil" ? "邪恶" : "善良"} / 类型 ${typeLabel}`;
      return `${s.id + 1}号【${s.role?.name ?? "未知"}】：${status}`;
    });
    return `📌 注册判定（仅说书人可见）：\n${lines.join("\n")}`;
  };
  
  // 创建用于厨师/共情者查验的判断函数，考虑间谍和隐士的注册判定
  const checkEvilForChefEmpath = (seat: Seat): boolean => {
    // 使用统一注册判定，传入当前查看的角色（厨师或共情者）
    const registration = getCachedRegistration(seat, effectiveRole);
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

  // 实时检查是否中毒：使用computeIsPoisoned函数统一计算所有中毒来源
  const isPoisoned = computeIsPoisoned(targetSeat);
  // 实时检查是否酒鬼：包括永久酒鬼角色和临时酒鬼状态
  const isDrunk = targetSeat.isDrunk || targetSeat.role?.id === "drunk";
  
  // 确定中毒/酒鬼原因（用于日志显示）
  const poisonSources = getPoisonSources(targetSeat);
  let reason = "";
  if (poisonSources.permanent || poisonSources.snakeCharmer) {
    reason = "永久中毒";
  } else if (poisonSources.vigormortis) {
    reason = "亡骨魔中毒";
  } else if (poisonSources.pukka) {
    reason = "普卡中毒";
  } else if (poisonSources.dayPoison || poisonSources.noDashii) {
    reason = "投毒";
  } else if (poisonSources.cannibal) {
    reason = "食人族中毒";
  } else if (isPoisoned) {
    reason = "中毒";
  } else if (isDrunk) {
    reason = "酒鬼";
  }
  
  // 判断是否应该显示假信息
  const fakeInfoCheck = drunkFirstInfoMap 
    ? shouldShowFakeInfo(targetSeat, drunkFirstInfoMap, vortoxWorld)
    : { showFake: isPoisoned || !!vortoxWorld, isFirstTime: false };
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
      guide = "🧪 选择一名玩家：他中毒。下一个夜晚开始前，他会因中毒而死亡并恢复健康。"; 
      speak = '"请选择一名玩家。他现在中毒，将在下一个夜晚开始前死亡并恢复健康。"'; 
      action = "投毒";
    }
  } else if (effectiveRole.id === 'innkeeper') {
    // 旅店老板：选择两名玩家，他们当晚不会死亡，其中一人醉酒到下个黄昏
    guide = "🏨 选择两名玩家：他们当晚不会被恶魔杀死，但其中一人会醉酒到下个黄昏。"; 
    speak = '"请选择两名玩家。他们今晚不会被恶魔杀死，但其中一人会醉酒到下个黄昏。"'; 
    action = "protect";
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
    const regNote = buildRegistrationGuideNote(effectiveRole);
    if (regNote) guide += `\n${regNote}`;
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
      const regNote = buildRegistrationGuideNote(effectiveRole);
      if (regNote) guide += `\n\n${regNote}`;
      action = "告知";
    } else {
      guide = "⚠️ 周围没有存活邻居，信息无法生成，示0或手动说明。";
      speak = '"你没有存活的邻居可供检测，请示意0或由说书人说明。"' ;
      action = "展示";
    }
  } else if (effectiveRole.id === 'clockmaker' && gamePhase === 'firstNight') {
    const aliveDemons = seats.filter(s => !s.isDead && (s.role?.type === 'demon' || s.isDemonSuccessor));
    const aliveMinions = seats.filter(s => !s.isDead && s.role?.type === 'minion');
    let distance = 0;
    if (aliveDemons.length > 0 && aliveMinions.length > 0) {
      const total = seats.length;
      let minDist = Infinity;
      aliveDemons.forEach(d => {
        aliveMinions.forEach(m => {
          const diff = Math.abs(d.id - m.id);
          const ringDist = Math.min(diff, total - diff);
          minDist = Math.min(minDist, ringDist);
        });
      });
      distance = minDist === Infinity ? 0 : minDist;
    }
    let report = distance;
    if (shouldShowFake) {
      if (report <= 1) report = 2;
      else report = Math.max(1, report + (Math.random() < 0.5 ? -1 : 1));
    }
    const info = distance === 0 ? "场上缺少恶魔或爪牙" : `${report}`;
    guide = distance === 0 ? "👀 场上缺少恶魔或爪牙，无法给出距离" : `👀 最近距离：${report}`;
    speak = distance === 0 ? '"场上暂无法得知距离。"' : `"恶魔与爪牙最近的距离是 ${report}。"`;
    action = "告知";
    addLogCb?.(`${currentSeatId+1}号(钟表匠) 得知距离 ${info}${shouldShowFake ? '（假信息）' : ''}`);
  } else if (effectiveRole.id === 'mathematician') {
    let failCount = 0;
    let shown = failCount;
    if (shouldShowFake) {
      shown = Math.max(0, failCount + (failCount === 0 ? 1 : (Math.random() < 0.5 ? -1 : 1)));
    }
    guide = `👀 本夜有 ${shown} 人能力未生效`;
    speak = `"今晚有 ${shown} 人的能力未生效。"`;
    action = "告知";
    addLogCb?.(`${currentSeatId+1}号(数学家) 得知 ${shown} 人未生效${shouldShowFake ? '（假信息）' : ''}`);
  } else if (effectiveRole.id === 'flowergirl') {
    const real = !!demonVotedToday;
    const shown = shouldShowFake ? !real : real;
    guide = `👀 真实：${real ? '有' : '无'} 恶魔投票；展示：${shown ? '有' : '无'}`;
    speak = `"今天${shown ? '有' : '没有'}恶魔投过票。"`;
    action = "告知";
    addLogCb?.(`${currentSeatId+1}号(卖花女孩) 得知今天${shown ? '有' : '无'}恶魔投票${shouldShowFake ? '（假信息）' : ''}`);
  } else if (effectiveRole.id === 'town_crier') {
    const real = !!minionNominatedToday;
    const shown = shouldShowFake ? !real : real;
    guide = `👀 真实：${real ? '有' : '无'} 爪牙发起提名；展示：${shown ? '有' : '无'}`;
    speak = `"今天${shown ? '有' : '没有'}爪牙发起提名。"`;
    action = "告知";
    addLogCb?.(`${currentSeatId+1}号(城镇公告员) 得知今天${shown ? '有' : '无'}爪牙提名${shouldShowFake ? '（假信息）' : ''}`);
  } else if (effectiveRole.id === 'oracle' && gamePhase !== 'firstNight') {
    const deadEvil = seats.filter(s => s.isDead && isEvil(s)).length;
    const shown = shouldShowFake
      ? Math.max(0, deadEvil + (deadEvil === 0 ? 1 : (Math.random() < 0.5 ? -1 : 1)))
      : deadEvil;
    guide = `👀 死亡邪恶人数：真实 ${deadEvil}，展示 ${shown}`;
    speak = `"有 ${shown} 名死亡玩家是邪恶的。"`;
    action = "告知";
    addLogCb?.(`${currentSeatId+1}号(神谕者) 得知 ${shown} 名死亡邪恶${shouldShowFake ? '（假信息）' : ''}`);
  } else if (effectiveRole.id === 'dreamer') {
    guide = "🛌 选择一名玩家：告知一善一恶角色名，其中一个是其身份。";
    speak = '"请选择一名玩家。"';
    action = "查验";
  } else if (effectiveRole.id === 'seamstress') {
    if (hasUsedAbilityFn && hasUsedAbilityFn('seamstress', currentSeatId)) {
      guide = "一次性能力已用完。";
      speak = '"你的能力已用完。"';
      action = "跳过";
    } else {
      guide = "🧵 一局一次：选择两名玩家，得知是否同阵营。";
      speak = '"请选择两名玩家。"';
      action = "查验";
    }
  } else if (effectiveRole.id === 'washerwoman' && gamePhase==='firstNight') {
    try {
      // 洗衣妇：首夜得知一名村民的具体身份，并被告知该村民在X号或Y号（其中一个是真实的，另一个是干扰项）
      const townsfolkSeats = seats.filter(s => s.role?.type === 'townsfolk' && s.role && s.id !== currentSeatId);
      
      if (townsfolkSeats.length === 0) {
        guide = "🚫 根据当前角色配置，本局实际上没有镇民 (Townsfolk)。\n你应当告诉【洗衣妇】：‘本局游戏中没有镇民。’ 请直接使用这句台词，不要编造虚假的两名玩家。";
        speak = '"本局游戏中没有镇民。"';
        action = "告知";
      } else if(townsfolkSeats.length > 0 && seats.length >= 2) {
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
      const regNote = buildRegistrationGuideNote(effectiveRole);
      if (regNote) guide += `\n\n${regNote}`;
    } catch (_error) {
      guide = "⚠️ 信息生成出现问题，请手动选择座位或示0。";
      speak = '"信息无法自动生成，请你手动指定要告知的两个座位，或比划0。"';
      action = "展示";
    }
  } else if (effectiveRole.id === 'librarian' && gamePhase==='firstNight') {
    try {
      // 图书管理员：首夜得知一名外来者的具体身份，并被告知该外来者在X号或Y号（其中一个是真实的，另一个是干扰项）
      const outsiderSeats = seats.filter(s => s.role?.type === 'outsider' && s.role && s.id !== currentSeatId);
      
      if (outsiderSeats.length === 0) {
        guide = "🚫 根据当前角色配置，本局实际上没有外来者 (Outsiders)。\n你应当告诉【图书管理员】：‘本局游戏中没有外来者。’ 请直接使用这句台词，不要编造虚假的两名玩家。";
        speak = '"本局游戏中没有外来者。"';
        action = "告知";
      } else if(outsiderSeats.length > 0 && seats.length >= 2) {
        // 正常时：从场上实际存在的外来者中随机选择一个
        const validOutsiders = outsiderSeats.filter(s => s.role !== null);
        if (validOutsiders.length === 0) {
          guide = "🚫 根据当前角色配置，本局实际上没有外来者 (Outsiders)。\n你应当告诉【图书管理员】：‘本局游戏中没有外来者。’ 请直接使用这句台词，不要编造虚假的两名玩家。"; 
          speak = '"本局游戏中没有外来者。"';
          action = "告知";
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
      getCachedRegistration(s, effectiveRole).registersAsMinion
    );
    
    if (minionSeats.length === 0) {
      guide = "🚫 根据当前角色配置，本局实际上没有爪牙 (Minions)。\n你应当告诉【调查员】：‘本局游戏中没有爪牙。’ 请直接使用这句台词，不要编造虚假的两名玩家。";
      speak = '"本局游戏中没有爪牙。"';
      action = "告知";
    } else if(minionSeats.length > 0 && seats.length >= 2) {
      // 正常时：随机选择一个实际存在的爪牙，确保角色存在
      const validMinions = minionSeats.filter(s => s.role !== null);
      if (validMinions.length === 0) {
        guide = "🚫 根据当前角色配置，本局实际上没有爪牙 (Minions)。\n你应当告诉【调查员】：‘本局游戏中没有爪牙。’ 请直接使用这句台词，不要编造虚假的两名玩家。"; 
        speak = '"本局游戏中没有爪牙。"';
        action = "告知";
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
      guide = "🚫 根据当前角色配置，本局实际上没有爪牙 (Minions)。\n你应当告诉【调查员】：‘本局游戏中没有爪牙。’ 请直接使用这句台词，不要编造虚假的两名玩家。"; 
      speak = '"本局游戏中没有爪牙。"'; 
      action = "告知";
    }
    const regNote = buildRegistrationGuideNote(effectiveRole);
    if (regNote) guide += `\n\n${regNote}`;
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
    const regNoteChef = buildRegistrationGuideNote(effectiveRole);
    if (regNoteChef) guide += `\n\n${regNoteChef}`;
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
      guide = "上一个黄昏无人被处决，因此【送葬者】本夜不会被唤醒，这是正常规则。";
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
    action = "revive";
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
        getCachedRegistration(s, effectiveRole).alignment === 'Evil'
      );
      const goodPlayers = allPlayers.filter(s => 
        getCachedRegistration(s, effectiveRole).alignment === 'Good'
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
        addLogCb?.(`${currentSeatId+1}号(贵族) 得知 ${fakePlayers.map(p => `${p.id+1}号`).join('、')}（假信息）`);
          } else {
        guide = `👀 真实信息: ${selectedPlayers.map(p => `${p.id+1}号`).join('、')}，其中恰好有一名是邪恶的`;
        speak = `"你得知 ${selectedPlayers.map(p => `${p.id+1}号`).join('、')}。其中恰好有一名是邪恶的。"`;
        addLogCb?.(`${currentSeatId+1}号(贵族) 得知 ${selectedPlayers.map(p => `${p.id+1}号`).join('、')}，其中恰好一名是邪恶的`);
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
    const knownTypeLabels = balloonistKnownTypes?.[targetSeat.id] || [];
    knownTypeLabels.forEach(label => {
      const matched = Object.entries(typeNames).find(([, name]) => name === label);
      if (matched) {
        givenTypes.add(matched[0] as RoleType);
      }
    });
    
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
      addLogCb?.(`${currentSeatId+1}号(气球驾驶员) 得知 ${targetSeatId+1}号，角色类型：${typeNames[targetType]}${shouldShowFake ? '（中毒/酒鬼信息）' : ''}`);
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
  } else if (effectiveRole.id === 'shabaloth') {
    // 沙巴洛斯：每晚选择两名玩家，他们死亡。上夜被你杀死的玩家之一可能被你反刍
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
      guide = "⚔️ 选择两名玩家：他们死亡。你的上个夜晚选择过且当前死亡的玩家之一可能会被你反刍。\n\n提示：本工具当前仅自动处理“每夜杀两人”，尚未实现沙巴洛斯的复活（反刍）效果，请说书人按规则手动裁定是否复活。"; 
      speak = '"请选择两名玩家，他们会在今晚死亡。（本工具暂未实现偶尔复活的部分，请你按规则手动裁定。）"'; 
      action = "kill";
    }
  } else if (effectiveRole.id === 'po') {
    // 珀：可以选择不杀人以蓄力，下次爆发杀3人
    if (gamePhase === 'firstNight') {
      // 首夜：认爪牙（受罂粟种植者影响）
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
      guide = "⚔️ 珀：你可以选择一名玩家杀死；如果你选择本夜不杀任何玩家，则本夜不会有人因你而死，但下一夜你必须选择三名玩家杀死。\n\n操作提示：\n- 若你想“本夜不杀（蓄力）”，请不要选择任何目标，直接点击下方“确认 / 下一步”；\n- 若你上次已经选择不杀人，本夜应选择三名不同的玩家作为目标。"; 
      speak = '"你可以选择一名玩家杀死；如果你本夜不选择任何玩家，下一个夜晚你必须选择三名玩家杀死。"'; 
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
  } else if (effectiveRole.id === 'evil_twin' && gamePhase === 'firstNight') {
    // 镜像双子：首夜需要选择一名善良玩家作为对手
    guide = "👥 选择一名善良玩家作为你的对手。你与这名玩家互相知道对方是什么角色。如果其中善良玩家被处决，邪恶阵营获胜。如果你们都存活，善良阵营无法获胜。"; 
    speak = '"请选择一名善良玩家作为你的对手。你与这名玩家互相知道对方是什么角色。如果其中善良玩家被处决，邪恶阵营获胜。如果你们都存活，善良阵营无法获胜。"'; 
    action = "mark";
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
  } 
  // ========== 梦陨春宵角色处理 ==========
  else if (effectiveRole.id === 'philosopher') {
    // 哲学家：每局游戏限一次，夜晚选择一个善良角色，获得该角色的能力，原角色醉酒
    guide = "🧙 每局游戏限一次，选择一个善良角色：你获得该角色的能力。如果这个角色在场，他醉酒。"; 
    speak = '"每局游戏限一次，请选择一个善良角色。你获得该角色的能力。如果这个角色在场，他醉酒。"'; 
    action = "mark";
  } else if (effectiveRole.id === 'witch') {
    // 女巫：每晚选择一名玩家，如果他明天白天发起提名，他死亡。如果只有三名存活的玩家，你失去此能力。
    const aliveCount = seats.filter(s => !s.isDead).length;
    if (aliveCount <= 3) {
      guide = "⚠️ 只有三名或更少存活的玩家，你失去此能力。"; 
      speak = '"只有三名或更少存活的玩家，你失去此能力。"'; 
      action = "跳过";
    } else {
      guide = "🧹 选择一名玩家，如果他明天白天发起提名，他死亡。"; 
      speak = '"请选择一名玩家。如果他明天白天发起提名，他死亡。"'; 
      action = "mark";
    }
  } else if (effectiveRole.id === 'cerenovus') {
    // 洗脑师：每晚选择一名玩家和一个善良角色，他明天白天和夜晚需要"疯狂"地证明自己是这个角色
    guide = "🧠 选择一名玩家和一个善良角色，他明天白天和夜晚需要\"疯狂\"地证明自己是这个角色，不然他可能被处决。"; 
    speak = '"请选择一名玩家和一个善良角色。他明天白天和夜晚需要"疯狂"地证明自己是这个角色，不然他可能被处决。"'; 
    action = "mark";
  } else if (effectiveRole.id === 'pit_hag') {
    // 麻脸巫婆：每晚选择一名玩家和一个角色，如果该角色不在场，他变成该角色
    guide = "🧹 选择一名玩家和一个角色，如果该角色不在场，他变成该角色。如果因此创造了一个恶魔，当晚的死亡由说书人决定。"; 
    speak = '"请选择一名玩家和一个角色。如果该角色不在场，他变成该角色。如果因此创造了一个恶魔，当晚的死亡由说书人决定。"'; 
    action = "mark";
  } else if (effectiveRole.id === 'fang_gu') {
    // 方古：每晚选择一名玩家：他死亡。被该能力杀死的外来者改为变成邪恶的方古且你代替他死亡，但每局游戏仅能成功转化一次。
    if (gamePhase === 'firstNight') {
      // 检查罂粟种植者状态
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
      guide = "⚔️ 选择一名玩家：他死亡。被该能力杀死的外来者改为变成邪恶的方古且你代替他死亡，但每局游戏仅能成功转化一次。"; 
      speak = '"请选择一名玩家。他死亡。被该能力杀死的外来者改为变成邪恶的方古且你代替他死亡，但每局游戏仅能成功转化一次。"'; 
      action = "kill";
    }
  } else if (effectiveRole.id === 'no_dashii') {
    // 诺-达：每晚选择一名玩家：他死亡。与你邻近的两名镇民中毒。
    if (gamePhase === 'firstNight') {
      // 检查罂粟种植者状态
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
      guide = "⚔️ 选择一名玩家：他死亡。与你邻近的两名镇民中毒。"; 
      speak = '"请选择一名玩家。他死亡。与你邻近的两名镇民中毒。"'; 
      action = "kill";
    }
  } else if (effectiveRole.id === 'vortox') {
    // 涡流：每晚选择一名玩家：他死亡。镇民玩家的能力都会产生错误信息，如果白天没人被处决，邪恶阵营获胜。
    if (gamePhase === 'firstNight') {
      // 检查罂粟种植者状态
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
      guide = "⚔️ 选择一名玩家：他死亡。镇民玩家的能力都会产生错误信息，如果白天没人被处决，邪恶阵营获胜。"; 
      speak = '"请选择一名玩家。他死亡。镇民玩家的能力都会产生错误信息，如果白天没人被处决，邪恶阵营获胜。"'; 
      action = "kill";
    }
  } else if (effectiveRole.id === 'sage') {
    // 贤者：如果恶魔杀死了你，在当晚你会被唤醒并得知两名玩家，其中一名是杀死你的那个恶魔。
    if (!targetSeat.isDead || !diedTonight) { 
      guide = "你尚未在本夜被恶魔杀死，不会被唤醒。"; 
      speak = "（摇头示意无效）"; 
      action = "跳过";
    } else {
      guide = "查验两名玩家，其中一名是杀死你的恶魔。"; 
      speak = '"请选择两名玩家。其中一名是杀死你的那个恶魔。"'; 
      action = "inspect";
    }
  } else {
    guide = "💤 无行动。"; 
    speak = "（无）"; 
    action = "跳过";
  }
  
  // 首夜提示：镇民酒鬼的假信息说明
  if (gamePhase === 'firstNight' && targetSeat.role?.id === 'drunk' && effectiveRole.type === 'townsfolk') {
    guide = `${guide}\n\n注意：此玩家真实身份是【酒鬼 (Drunk)】，本次为“假${effectiveRole.name}”信息，系统已按酒鬼中毒规则生成可能错误的信息。`;
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
  const [isPortrait, setIsPortrait] = useState(false); // 是否为竖屏设备
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
  const checkLongPressTimerRef = useRef<NodeJS.Timeout | null>(null); // 核对身份列表长按定时器
  const longPressTriggeredRef = useRef<Set<number>>(new Set()); // 座位长按是否已触发（避免短按被阻断）
  const seatContainerRef = useRef<HTMLDivElement | null>(null); // 椭圆桌容器
  const seatRefs = useRef<Record<number, HTMLDivElement | null>>({}); // 每个座位元素引用
  
  const [wakeQueueIds, setWakeQueueIds] = useState<number[]>([]);
  const [currentWakeIndex, setCurrentWakeIndex] = useState(0);
  const [selectedActionTargets, setSelectedActionTargets] = useState<number[]>([]);
  const [inspectionResult, setInspectionResult] = useState<string | null>(null);
  const [inspectionResultKey, setInspectionResultKey] = useState(0); // 占卜师结果刷新用，强制重新渲染结果弹窗
  const [currentHint, setCurrentHint] = useState<NightHintState>({ isPoisoned: false, guide: "", speak: "" });
  // ——— 记录白天事件 & 一次性/全局状态（梦陨春宵新增角色需要） ———
  const [todayDemonVoted, setTodayDemonVoted] = useState(false);
  const [todayMinionNominated, setTodayMinionNominated] = useState(false);
  const [todayExecutedId, setTodayExecutedId] = useState<number | null>(null);
  const [witchCursedId, setWitchCursedId] = useState<number | null>(null);
  const [witchActive, setWitchActive] = useState(false);
  const [cerenovusTarget, setCerenovusTarget] = useState<{ targetId: number; roleName: string } | null>(null);
  const [isVortoxWorld, setIsVortoxWorld] = useState(false);
  const [fangGuConverted, setFangGuConverted] = useState(false);
  const [jugglerGuesses, setJugglerGuesses] = useState<Record<number, { playerId: number; roleId: string }[]>>({});
  const [evilTwinPair, setEvilTwinPair] = useState<{ evilId: number; goodId: number } | null>(null);
  
  // 保存每个角色的 hint 信息，用于"上一步"时恢复（不重新生成）
  const hintCacheRef = useRef<Map<string, NightHintState>>(new Map());
  // 记录酒鬼是否首次获得信息（首次一定是假的）
  const drunkFirstInfoRef = useRef<Map<number, boolean>>(new Map());

  const [showShootModal, setShowShootModal] = useState<number | null>(null);
  const [showNominateModal, setShowNominateModal] = useState<number | null>(null);
  const [showDayActionModal, setShowDayActionModal] = useState<{type: 'slayer'|'nominate'|'lunaticKill', sourceId: number} | null>(null);
  const [showDayAbilityModal, setShowDayAbilityModal] = useState<{
    roleId: string;
    seatId: number;
  } | null>(null);
  const [dayAbilityForm, setDayAbilityForm] = useState<{
    info1?: string;
    info2?: string;
    guess?: string;
    feedback?: string;
    advice?: string;
    engineerMode?: 'demon' | 'minion';
    engineerRoleId?: string;
  }>({});
  const [showDrunkModal, setShowDrunkModal] = useState<number | null>(null);
  const [baronSetupCheck, setBaronSetupCheck] = useState<{
    recommended: { townsfolk: number; outsider: number; minion: number; demon: number; total: number };
    current: { townsfolk: number; outsider: number; minion: number; demon: number };
    playerCount: number;
  } | null>(null);
  const [compositionError, setCompositionError] = useState<{
    standard: { townsfolk: number; outsider: number; minion: number; demon: number; total: number };
    actual: { townsfolk: number; outsider: number; minion: number; demon: number };
    playerCount: number;
    hasBaron: boolean;
  } | null>(null);
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
  const [showMayorThreeAliveModal, setShowMayorThreeAliveModal] = useState(false); // 3人生存且有市长时的处决前提醒
  const [showPoisonConfirmModal, setShowPoisonConfirmModal] = useState<number | null>(null); // 投毒者确认下毒
  const [showPoisonEvilConfirmModal, setShowPoisonEvilConfirmModal] = useState<number | null>(null); // 投毒者确认对邪恶玩家下毒
  const [showNightDeathReportModal, setShowNightDeathReportModal] = useState<string | null>(null); // 夜晚死亡报告
  const [showHadesiaKillConfirmModal, setShowHadesiaKillConfirmModal] = useState<number[] | null>(null); // 哈迪寂亚确认杀死3名玩家
  const [showMoonchildKillModal, setShowMoonchildKillModal] = useState<{ sourceId: number; onResolve: (latestSeats?: Seat[]) => void } | null>(null); // 月之子死亡连锁提示
  const [showStorytellerDeathModal, setShowStorytellerDeathModal] = useState<{ sourceId: number } | null>(null); // 麻脸巫婆造新恶魔后的说书人死亡选择
  const [showSweetheartDrunkModal, setShowSweetheartDrunkModal] = useState<{ sourceId: number; onResolve: (latestSeats?: Seat[]) => void } | null>(null); // 心上人死亡致醉
  const [goonDrunkedThisNight, setGoonDrunkedThisNight] = useState(false); // 本夜莽夫是否已让首个选择者醉酒
  const [showPitHagModal, setShowPitHagModal] = useState<{targetId: number | null; roleId: string | null} | null>(null); // 麻脸巫婆变更角色
  const [showBarberSwapModal, setShowBarberSwapModal] = useState<{demonId: number; firstId: number | null; secondId: number | null} | null>(null); // 理发师死亡后交换
  const [showRangerModal, setShowRangerModal] = useState<{targetId: number; roleId: string | null} | null>(null); // 巡山人变身落难少女
  const [showDamselGuessModal, setShowDamselGuessModal] = useState<{minionId: number | null; targetId: number | null} | null>(null); // 爪牙猜测落难少女
  const [drunkPrompted, setDrunkPrompted] = useState(false); // 是否已提示酒鬼伪装
  const [showNightOrderModal, setShowNightOrderModal] = useState(false); // 首夜叫醒顺位预览
  const [nightOrderPreview, setNightOrderPreview] = useState<{ roleName: string; seatNo: number; order: number }[]>([]);
  const [pendingNightQueue, setPendingNightQueue] = useState<Seat[] | null>(null);
  const [nightQueuePreviewTitle, setNightQueuePreviewTitle] = useState<string>(""); // 预览标题文案
  const finalizeNightStart = useCallback((queue: Seat[], isFirst: boolean) => {
    setWakeQueueIds(queue.map(s => s.id)); 
    setCurrentWakeIndex(0); 
    setSelectedActionTargets([]);
    setInspectionResult(null);
    setGamePhase(isFirst ? "firstNight" : "night"); 
    if(!isFirst) setNightCount(n => n + 1);
    setShowNightOrderModal(false);
    setPendingNightQueue(null);
  }, []);
  const getDisplayRoleForSeat = useCallback((seat?: Seat | null) => {
    if (!seat) return null;
    return seat.role?.id === 'drunk' ? seat.charadeRole : seat.role;
  }, []);
  const [showFirstNightOrderModal, setShowFirstNightOrderModal] = useState(false); // 首夜顺位提示
  const [firstNightOrder, setFirstNightOrder] = useState<{seatId: number; role: Role}[]>([]);
  const [showRestartConfirmModal, setShowRestartConfirmModal] = useState<boolean>(false); // 重开确认弹窗
  const [poppyGrowerDead, setPoppyGrowerDead] = useState(false); // 罂粟种植者是否已死亡
  const [showKlutzChoiceModal, setShowKlutzChoiceModal] = useState<{ sourceId: number; onResolve?: (latestSeats?: Seat[]) => void } | null>(null); // 呆瓜死亡后选择
  const [klutzChoiceTarget, setKlutzChoiceTarget] = useState<number | null>(null);
  const [lastExecutedPlayerId, setLastExecutedPlayerId] = useState<number | null>(null); // 最后被处决的玩家ID（用于食人族）
  const [damselGuessed, setDamselGuessed] = useState(false); // 落难少女是否已被猜测
  const [shamanKeyword, setShamanKeyword] = useState<string | null>(null); // 灵言师的关键词
  const [shamanTriggered, setShamanTriggered] = useState(false); // 灵言师关键词是否已触发
  const [showShamanConvertModal, setShowShamanConvertModal] = useState(false); // 灵言师触发转阵营
  const [shamanConvertTarget, setShamanConvertTarget] = useState<number | null>(null);
  const [spyDisguiseMode, setSpyDisguiseMode] = useState<'off' | 'default' | 'on'>('default'); // 间谍伪装干扰模式：关闭干扰、默认、开启干扰
  const [spyDisguiseProbability, setSpyDisguiseProbability] = useState(0.8); // 间谍伪装干扰概率（默认80%）
  const [showSpyDisguiseModal, setShowSpyDisguiseModal] = useState(false); // 伪装身份识别浮窗
  const [pukkaPoisonQueue, setPukkaPoisonQueue] = useState<{ targetId: number; nightsUntilDeath: number }[]>([]); // 普卡中毒->死亡队列
  const [poChargeState, setPoChargeState] = useState<Record<number, boolean>>({}); // 珀：是否已蓄力（上夜未杀人）
  const [autoRedHerringInfo, setAutoRedHerringInfo] = useState<string | null>(null); // 自动分配红罗刹结果提示
  const [dayAbilityLogs, setDayAbilityLogs] = useState<{ id: number; roleId: string; text: string; day: number }[]>([]);
  const [damselGuessUsedBy, setDamselGuessUsedBy] = useState<number[]>([]); // 已进行过落难少女猜测的爪牙ID

  // 通用一次性/限次能力使用记录（按角色ID+座位ID存储）
  const [usedOnceAbilities, setUsedOnceAbilities] = useState<Record<string, number[]>>({});
  const [usedDailyAbilities, setUsedDailyAbilities] = useState<Record<string, { day: number; seats: number[] }>>({});
  const [nominationMap, setNominationMap] = useState<Record<number, number>>({});
  const [showLunaticRpsModal, setShowLunaticRpsModal] = useState<{ targetId: number; nominatorId: number | null } | null>(null);
  const [balloonistKnownTypes, setBalloonistKnownTypes] = useState<Record<number, string[]>>({});
  const [balloonistCompletedIds, setBalloonistCompletedIds] = useState<number[]>([]); // 已知完所有类型的气球驾驶员
  // 哈迪寂亚：记录三名目标的生/死选择，默认“生”
  const [hadesiaChoices, setHadesiaChoices] = useState<Record<number, 'live' | 'die'>>({});
  const [virginGuideInfo, setVirginGuideInfo] = useState<{
    targetId: number;
    nominatorId: number;
    isFirstTime: boolean;
    nominatorIsTownsfolk: boolean;
  } | null>(null);
  const [showRoleSelectModal, setShowRoleSelectModal] = useState<{
    type: 'philosopher' | 'cerenovus' | 'pit_hag';
    targetId: number;
    onConfirm: (roleId: string) => void;
  } | null>(null); // 角色选择弹窗（替换 prompt）
  const [voteRecords, setVoteRecords] = useState<Array<{ voterId: number; isDemon: boolean }>>([]); // 投票记录（用于卖花女孩）
  const [remainingDays, setRemainingDays] = useState<number | null>(null); // 剩余日间数（evil_twin 相关）
  const [showMadnessCheckModal, setShowMadnessCheckModal] = useState<{
    targetId: number;
    roleName: string;
    day: number;
  } | null>(null); // 疯狂判定弹窗
  const [showSaintExecutionConfirmModal, setShowSaintExecutionConfirmModal] = useState<{
    targetId: number;
    skipLunaticRps?: boolean;
  } | null>(null); // 圣徒处决强警告弹窗

  const seatsRef = useRef(seats);
  const fakeInspectionResultRef = useRef<string | null>(null);
  const consoleContentRef = useRef<HTMLDivElement>(null);
  const currentActionTextRef = useRef<HTMLSpanElement>(null);
  const moonchildChainPendingRef = useRef(false);
  const longPressTimerRef = useRef<Map<number, NodeJS.Timeout>>(new Map()); // 存储每个座位的长按定时器
  const registrationCacheRef = useRef<Map<string, RegistrationResult>>(new Map()); // 同夜查验结果缓存
  const registrationCacheKeyRef = useRef<string>('');

  const resetRegistrationCache = useCallback((key: string) => {
    registrationCacheRef.current = new Map();
    registrationCacheKeyRef.current = key;
  }, []);

  const getRegistrationCached = useCallback(
    (targetPlayer: Seat, viewingRole?: Role | null) => {
      const cacheKey = registrationCacheKeyRef.current || `${gamePhase}-${nightCount}`;
      return getRegistration(
        targetPlayer,
        viewingRole,
        spyDisguiseMode,
        spyDisguiseProbability,
        { cache: registrationCacheRef.current, cacheKey }
      );
    },
    [spyDisguiseMode, spyDisguiseProbability, gamePhase, nightCount]
  );

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

  const hasUsedAbility = useCallback((roleId: string, seatId: number) => {
    return (usedOnceAbilities[roleId] || []).includes(seatId);
  }, [usedOnceAbilities]);

  const markAbilityUsed = useCallback((roleId: string, seatId: number) => {
    // 记录一次性能力已用，并在座位状态中打标
    setSeats(prev => prev.map(s => {
      if (s.id !== seatId) return s;
      const detail = '一次性能力已用';
      const statusDetails = s.statusDetails || [];
      return statusDetails.includes(detail)
        ? s
        : { ...s, statusDetails: [...statusDetails, detail] };
    }));
    setUsedOnceAbilities(prev => {
      const existed = prev[roleId] || [];
      if (existed.includes(seatId)) return prev;
      return { ...prev, [roleId]: [...existed, seatId] };
    });
  }, []);

  const hasUsedDailyAbility = useCallback((roleId: string, seatId: number) => {
    const entry = usedDailyAbilities[roleId];
    if (!entry) return false;
    if (entry.day !== nightCount) return false;
    return entry.seats.includes(seatId);
  }, [usedDailyAbilities, nightCount]);

  const markDailyAbilityUsed = useCallback((roleId: string, seatId: number) => {
    setUsedDailyAbilities(prev => {
      const currentDay = nightCount;
      const entry = prev[roleId];
      const seatsForDay = entry && entry.day === currentDay ? entry.seats : [];
      if (seatsForDay.includes(seatId)) return prev;
      return { ...prev, [roleId]: { day: currentDay, seats: [...seatsForDay, seatId] } };
    });
  }, [nightCount]);

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
      if (typeof window === 'undefined') return; // 服务器端不执行
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
      if (typeof window === 'undefined') return; // 服务器端不执行
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
      try {
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
      } catch (error) {
        console.error('初始化失败:', error);
        // 即使出错也要设置 mounted，避免白屏
        setMounted(true);
      }
  }, []); // 只在组件挂载时执行一次

  useEffect(() => {
    return () => {
      if (introTimeoutRef.current) {
        clearTimeout(introTimeoutRef.current);
      }
    };
  }, []);

  // setup 阶段自动提示酒鬼伪装
  useEffect(() => {
    if (gamePhase !== 'setup') return;
    const drunkSeat = seats.find(s => s.role?.id === 'drunk' && (!s.charadeRole || s.charadeRole.type !== 'townsfolk'));
    if (drunkSeat && showDrunkModal === null && !drunkPrompted) {
      setDrunkPrompted(true);
      setShowDrunkModal(drunkSeat.id);
    }
  }, [gamePhase, seats, showDrunkModal, drunkPrompted]);

  useEffect(() => { 
    setTimer(0); 
  }, [gamePhase]);
  
  useEffect(() => { 
      if(!mounted) return;
      const i = setInterval(() => setTimer(t => t + 1), 1000); 
      return () => clearInterval(i); 
  }, [mounted]);

  // 间谍/隐士查验结果在同一夜晚保持一致：伪装参数变化时刷新缓存
  useEffect(() => {
    if (gamePhase === 'firstNight' || gamePhase === 'night') {
      resetRegistrationCache(`${gamePhase}-${nightCount}-disguise`);
    }
  }, [spyDisguiseMode, spyDisguiseProbability, resetRegistrationCache]);

  // 进入新的夜晚阶段时，重置同夜查验结果缓存，保证当晚内一致、跨夜独立
  useEffect(() => {
    if (gamePhase === 'firstNight' || gamePhase === 'night') {
      resetRegistrationCache(`${gamePhase}-${nightCount}`);
    }
  }, [gamePhase, nightCount, resetRegistrationCache]);

  // 检测设备方向和屏幕尺寸
  useEffect(() => {
    if (!mounted) return;
    
    const checkOrientation = () => {
      // 检测是否为竖屏：高度大于宽度，或者使用媒体查询
      const isPortraitMode = window.innerHeight > window.innerWidth || 
                            window.matchMedia('(orientation: portrait)').matches;
      setIsPortrait(isPortraitMode);
    };
    
    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    
    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, [mounted]);
  
  useEffect(() => { 
    seatsRef.current = seats; 
  }, [seats]);

  // 自动识别当前是否处于涡流恶魔环境（镇民信息应为假）
  useEffect(() => {
    const aliveVortox = seats.some(
      s => !s.isDead && ((s.role?.id === 'vortox') || (s.isDemonSuccessor && s.role?.id === 'vortox'))
    );
    setIsVortoxWorld(aliveVortox);
  }, [seats]);

  // 预留的一次性/配对状态，后续在梦陨春宵角色逻辑中使用
  useEffect(() => {
    // 目前仅用于保持状态引用，防止未使用警告
  }, [fangGuConverted, jugglerGuesses, evilTwinPair, usedOnceAbilities, witchActive, cerenovusTarget, witchCursedId, todayExecutedId]);

  // 清理已离场的气球驾驶员记录
  useEffect(() => {
    setBalloonistKnownTypes(prev => {
      const activeIds = new Set(seats.filter(s => s.role?.id === 'balloonist').map(s => s.id));
      const next: Record<number, string[]> = {};
      activeIds.forEach(id => {
        if (prev[id]) next[id] = prev[id];
      });
      return next;
    });
  }, [seats]);

  const addLog = useCallback((msg: string) => {
    setGameLogs(p => [...p, { day: nightCount, phase: gamePhase, message: msg }]);
  }, [nightCount, gamePhase]);

  // 气球驾驶员：当已知完所有类型时写说明日志（只写一次）
  useEffect(() => {
    const allLabels = ['镇民', '外来者', '爪牙', '恶魔'];
    const newlyCompleted: number[] = [];
    Object.entries(balloonistKnownTypes).forEach(([idStr, known]) => {
      const id = Number(idStr);
      if (!Number.isNaN(id) && allLabels.every(label => known.includes(label)) && !balloonistCompletedIds.includes(id)) {
        newlyCompleted.push(id);
      }
    });
    if (newlyCompleted.length > 0) {
      newlyCompleted.forEach(id => {
        addLog(`气球驾驶员 ${id + 1}号 已在前几夜得知所有角色类型（镇民、外来者、爪牙、恶魔），从今夜起将不再被唤醒，这符合规则。`);
      });
      setBalloonistCompletedIds(prev => [...prev, ...newlyCompleted]);
    }
  }, [balloonistKnownTypes, balloonistCompletedIds, addLog]);

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
      return calculateNightInfo(
        selectedScript,
        seats,
        wakeQueueIds[currentWakeIndex],
        gamePhase,
        lastDuskExecution,
        fakeInspectionResultRef.current || undefined,
        drunkFirstInfoRef.current,
        isEvilWithJudgment,
        poppyGrowerDead,
        gameLogs,
        spyDisguiseMode,
        spyDisguiseProbability,
        deadThisNight,
        balloonistKnownTypes,
        addLog,
        registrationCacheRef.current,
        registrationCacheKeyRef.current || `${gamePhase}-${nightCount}`,
        isVortoxWorld,
        todayDemonVoted,
        todayMinionNominated,
        todayExecutedId,
        hasUsedAbility
      );
    }
    return null;
  }, [selectedScript, seats, currentWakeIndex, gamePhase, wakeQueueIds, lastDuskExecution, isEvilWithJudgment, poppyGrowerDead, spyDisguiseMode, spyDisguiseProbability, deadThisNight, balloonistKnownTypes, addLog, nightCount, isVortoxWorld]);

  const currentNightRole = useMemo(() => {
    if (!nightInfo) return null;
    const seat = nightInfo.seat;
    const role = getDisplayRoleForSeat(seat);
    return { seatNo: seat.id + 1, roleName: role?.name || seat.role?.name || '未知角色' };
  }, [nightInfo, getDisplayRoleForSeat]);

  const nextNightRole = useMemo(() => {
    if (!nightInfo) return null;
    const nextId = wakeQueueIds[currentWakeIndex + 1];
    if (nextId === undefined) return null;
    const seat = seats.find(s => s.id === nextId);
    const role = getDisplayRoleForSeat(seat);
    const seatNo = seat ? seat.id + 1 : nextId + 1;
    return { seatNo, roleName: role?.name || seat?.role?.name || '未知角色' };
  }, [nightInfo, wakeQueueIds, currentWakeIndex, seats, getDisplayRoleForSeat]);

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
      if (nightInfo.effectiveRole.id === 'balloonist' && nightInfo.guide.includes('你得知') && !nightInfo.isPoisoned) {
        // 从 guide 中提取信息：格式为 "🎈 你得知 X号，角色类型：镇民"
        const match = nightInfo.guide.match(/你得知 (\d+)号，角色类型[：:](.+)/);
        if (match) {
          const seatNum = match[1];
          const typeName = match[2].trim();
          addLogWithDeduplication(
            `${nightInfo.seat.id+1}号(气球驾驶员) 得知 ${seatNum}号，角色类型：${typeName}`,
            nightInfo.seat.id,
            '气球驾驶员'
          );
          // 记录已知类型，防止重复
          setBalloonistKnownTypes(prev => {
            const known = prev[nightInfo.seat.id] || [];
            if (known.includes(typeName)) return prev;
            return { ...prev, [nightInfo.seat.id]: [...known, typeName] };
          });
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

  // 动态调整"当前是X号X角色在行动"的字体大小，确保不超出容器
  const adjustActionTextSize = useCallback(() => {
    if (currentActionTextRef.current && nightInfo) {
      const textElement = currentActionTextRef.current;
      const container = textElement.parentElement;
      if (!container) return;

      // 重置字体大小
      textElement.style.fontSize = '';
      
      // 获取容器宽度和文本宽度
      const containerWidth = container.offsetWidth;
      const textWidth = textElement.scrollWidth;
      
      // 如果文本超出容器，则缩小字体
      if (textWidth > containerWidth) {
        const baseFontSize = 30; // text-3xl 对应的大约30px
        const scale = containerWidth / textWidth;
        const newFontSize = Math.max(baseFontSize * scale * 0.95, 12); // 最小12px，留5%边距
        textElement.style.fontSize = `${newFontSize}px`;
      }
    }
  }, [nightInfo]);

  useEffect(() => {
    adjustActionTextSize();
    // 窗口大小改变时重新计算
    window.addEventListener('resize', adjustActionTextSize);
    return () => {
      window.removeEventListener('resize', adjustActionTextSize);
    };
  }, [adjustActionTextSize, currentWakeIndex]);

  // 组件卸载时清理所有长按定时器
  useEffect(() => {
    return () => {
      longPressTimerRef.current.forEach((timer) => {
        clearTimeout(timer);
      });
      longPressTimerRef.current.clear();
      longPressTriggeredRef.current.clear();
      if (checkLongPressTimerRef.current) {
        clearTimeout(checkLongPressTimerRef.current);
        checkLongPressTimerRef.current = null;
      }
      seatRefs.current = {};
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
  const checkGameOver = useCallback((updatedSeats: Seat[], executedPlayerIdArg?: number | null, preserveWinReason?: boolean) => {
    // 防御性检查：确保updatedSeats不为空且是有效数组
    if (!updatedSeats || updatedSeats.length === 0) {
      console.error('checkGameOver: updatedSeats为空或无效');
      return false;
    }
    
    // 计算存活人数（仅统计已分配角色的玩家）；僵怖假死状态（isFirstDeathForZombuul=true但isZombuulTrulyDead=false）算作存活
    const aliveSeats = updatedSeats.filter(s => {
      // 确保seat对象有效并且已经分配角色，未分配的空座位不计入存活人数
      if (!s || !s.role) return false;
      // 僵怖特殊处理：假死状态算作存活
      if (s.role?.id === 'zombuul' && s.isFirstDeathForZombuul && !s.isZombuulTrulyDead) {
        return true;
      }
      return !s.isDead;
    });
    const aliveCount = aliveSeats.length;
    
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

    const executionTargetId = executedPlayerIdArg ?? executedPlayerId;
    
    // 优先检查：镜像双子（evil_twin）- 如果善良双子被处决，邪恶阵营获胜
    if (executionTargetId !== null && executionTargetId !== undefined && evilTwinPair) {
      const executedPlayer = updatedSeats.find(s => s.id === executionTargetId);
      if (executedPlayer && executedPlayer.id === evilTwinPair.goodId) {
        setWinResult('evil');
        setWinReason('镜像双子：善良双子被处决');
        setGamePhase('gameOver');
        addLog("游戏结束：镜像双子善良双子被处决，邪恶阵营获胜");
        return true;
      }
    }
    
    // 优先检查：圣徒被处决导致邪恶方获胜（优先级高于恶魔死亡判定）
    // 这个检查必须在恶魔死亡检查之前，确保圣徒被处决的判定优先级更高
    if (executionTargetId !== null && executionTargetId !== undefined) {
      const executedPlayer = updatedSeats.find(s => s.id === executionTargetId);
      // “刚刚死于处决的圣徒”立即触发邪恶获胜，优先级最高
      const justExecutedSaint =
        executedPlayer &&
        executedPlayer.role?.id === 'saint' &&
        !executedPlayer.isPoisoned &&
        executedPlayer.isDead;
      if (justExecutedSaint) {
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
    
    // 检查镜像双子（evil_twin）- 如果两个双子都存活，善良阵营无法获胜
    if (evilTwinPair) {
      const evilTwin = updatedSeats.find(s => s.id === evilTwinPair.evilId);
      const goodTwin = updatedSeats.find(s => s.id === evilTwinPair.goodId);
      const bothAlive = evilTwin && !evilTwin.isDead && goodTwin && !goodTwin.isDead;
      if (bothAlive && deadDemon && !aliveDemon) {
        // 恶魔死亡但双子都存活，善良无法获胜，游戏继续
        addLog("镜像双子：两个双子都存活，善良阵营无法获胜，游戏继续");
        return false;
      }
    }
    
    // 如果原小恶魔死亡，但存在活着的"小恶魔（传）"，游戏继续
    // 只有当所有恶魔（包括"小恶魔（传）"）都死亡时，好人才胜利
    if (deadDemon && !aliveDemon) {
      setWinResult('good');
      // 判断是原小恶魔还是"小恶魔（传）"死亡
      // 如果 preserveWinReason 为 true，则不覆盖 winReason（比如猎手击杀的情况）
      if (!preserveWinReason) {
        if (deadDemon.isDemonSuccessor) {
          setWinReason('小恶魔（传）死亡');
          addLog("游戏结束：小恶魔（传）死亡，好人胜利");
        } else {
          setWinReason('小恶魔死亡');
          addLog("游戏结束：小恶魔死亡，好人胜利");
        }
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
    
    const mayorAlive = aliveSeats.some(s => s.role?.id === 'mayor');
    if (aliveCount === 3 && mayorAlive && gamePhase === 'day') {
      setWinResult('good');
      setWinReason('3人存活且无人被处决（市长能力）');
      setGamePhase('gameOver');
      addLog("因为场上只剩 3 名存活玩家且今天无人被处决，【市长】触发能力，好人立即获胜。");
      return true;
    }
    
    return false;
  }, [addLog, gamePhase, evilTwinPair, executedPlayerId]);
  
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
  // 恶魔无技能夜晚（如首夜仅展示信息、跳过回合）时，禁止选择任何目标
  const demonActionDisabled = useMemo(() => {
    if (!nightInfo) return false;
    if (nightInfo.effectiveRole.type !== 'demon') return false;
    const act = nightInfo.action || '';
    // 首夜且行为不是直接杀人时，视为无技能
    if (gamePhase === 'firstNight' && !act.includes('杀')) return true;
    // 明确的跳过/无信息/仅展示
    if (['跳过', '无信息', '展示'].some(k => act.includes(k))) return true;
    return false;
  }, [nightInfo, gamePhase]);

  const isTargetDisabled = (s: Seat) => {
    if (!nightInfo) return true;
    if (demonActionDisabled) return true;
    const rid = nightInfo.effectiveRole.id;
    if (rid === 'monk' && s.id === nightInfo.seat.id) return true;
    if (rid === 'poisoner' && s.isDead) return true;
    if (rid === 'ravenkeeper' && !deadThisNight.includes(nightInfo.seat.id)) return true;
    // 镜像双子：只能选择善良玩家
    if (rid === 'evil_twin' && gamePhase === 'firstNight') {
      if (!s.role) return true;
      if (s.role.type !== 'townsfolk' && s.role.type !== 'outsider') return true;
    }
    // 7. 修复小恶魔选择问题 - 首夜不能选人，非首夜可以选择
    if (rid === 'imp' && gamePhase === 'firstNight') return true;
    // 小恶魔可以选择自己（用于身份转移）
    // 管家不能选择自己作为主人
    if (rid === 'butler' && s.id === nightInfo.seat.id) return true;
    // 教授：只能选择死亡玩家，且用过能力后禁用
    if (rid === 'professor_mr') {
      if (hasUsedAbility('professor_mr', nightInfo.seat.id)) return true;
      const targetRole = s.role?.id === 'drunk' ? s.charadeRole : s.role;
      if (!s.isDead) return true;
      return !targetRole || targetRole.type !== 'townsfolk';
    }
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

  const getStandardComposition = useCallback((playerCount: number, hasBaron: boolean) => {
    const base = troubleBrewingPresets.find(p => p.total === playerCount);
    const fallbackMinion = Math.max(1, Math.floor((playerCount - 1) / 6));
    const fallbackOutsider = Math.max(0, Math.floor((playerCount - 3) / 3));
    const fallbackTownsfolk = Math.max(0, playerCount - fallbackOutsider - fallbackMinion - 1);

    const minion = base?.minion ?? fallbackMinion;
    const outsiderBase = base?.outsider ?? fallbackOutsider;
    const townsfolkBase = base?.townsfolk ?? fallbackTownsfolk;
    const demon = base?.demon ?? 1;

    const outsider = outsiderBase + (hasBaron ? 2 : 0);
    const townsfolk = Math.max(0, townsfolkBase - (hasBaron ? 2 : 0));

    return {
      townsfolk,
      outsider,
      minion,
      demon,
      total: playerCount,
    };
  }, []);

  const validateBaronSetup = useCallback((activeSeats: Seat[]) => {
    const hasBaronInSeats = activeSeats.some(s => s.role?.id === "baron");
    if (selectedScript?.id !== 'trouble_brewing' || !hasBaronInSeats) return true;

    const recommended = getStandardComposition(activeSeats.length, true);
    const actualCounts = {
      townsfolk: activeSeats.filter(s => s.role?.type === 'townsfolk').length,
      outsider: activeSeats.filter(s => s.role?.type === 'outsider').length,
      minion: activeSeats.filter(s => s.role?.type === 'minion').length,
      demon: activeSeats.filter(s => s.role?.type === 'demon').length,
    };

    if (actualCounts.townsfolk !== recommended.townsfolk || actualCounts.outsider !== recommended.outsider) {
      setBaronSetupCheck({
        recommended,
        current: actualCounts,
        playerCount: activeSeats.length,
      });
      return false;
    }

    return true;
  }, [getStandardComposition, selectedScript]);

  // 完整的阵容校验函数（用于校验《暗流涌动》的标准配置）
  const validateCompositionSetup = useCallback((activeSeats: Seat[]) => {
    // 只对《暗流涌动》剧本进行校验
    if (selectedScript?.id !== 'trouble_brewing') return true;

    const playerCount = activeSeats.length;
    
    // 校验7-15人局（覆盖所有可能出现的情况）
    if (playerCount < 7 || playerCount > 15) return true;

    const hasBaron = activeSeats.some(s => s.role?.id === "baron");
    const standard = getStandardComposition(playerCount, hasBaron);
    
    const actual = {
      townsfolk: activeSeats.filter(s => s.role?.type === 'townsfolk').length,
      outsider: activeSeats.filter(s => s.role?.type === 'outsider').length,
      minion: activeSeats.filter(s => s.role?.type === 'minion').length,
      demon: activeSeats.filter(s => s.role?.type === 'demon').length,
    };

    // 检查是否与标准配置一致
    if (
      actual.townsfolk !== standard.townsfolk ||
      actual.outsider !== standard.outsider ||
      actual.minion !== standard.minion ||
      actual.demon !== standard.demon
    ) {
      setCompositionError({
        standard,
        actual,
        playerCount,
        hasBaron,
      });
      return false;
    }

    // 校验通过，清除错误
    setCompositionError(null);
    return true;
  }, [getStandardComposition, selectedScript]);

  const proceedToCheckPhase = useCallback((seatsToUse: Seat[]) => {
    setAutoRedHerringInfo(null);
    const active = seatsToUse.filter(s => s.role);
    const compact = active.map((s, i) => ({ ...s, id: i }));

    setTimeout(() => {
      const withRed = [...compact];
      const hasFortuneTeller = withRed.some(s => s.role?.id === "fortune_teller");
      if (hasFortuneTeller && !withRed.some(s => s.isRedHerring)) {
        const good = withRed.filter(s => ["townsfolk","outsider"].includes(s.role?.type || ""));
        if (good.length > 0) {
          const t = getRandom(good);
          withRed[t.id] = { 
            ...withRed[t.id], 
            isRedHerring: true, 
            statusDetails: [...(withRed[t.id].statusDetails || []), "红罗刹"] 
          };
          const redRoleName = withRed[t.id].role?.name || '未知角色';
          addLog(`红罗刹分配：${t.id+1}号（${redRoleName}）`);
          setAutoRedHerringInfo(`${t.id + 1}号（${redRoleName}）`);
        }
      }
      
      // 检查是否有送葬者，如果有则添加说明日志
      const hasUndertaker = withRed.some(s => s.role?.id === "undertaker");
      if (hasUndertaker) {
        addLog(`【送葬者】只在非首夜的夜晚被唤醒，且只会看到"今天黄昏被处决并死亡的玩家"。`);
      }
      
      setSeats(withRed); 
      setInitialSeats(JSON.parse(JSON.stringify(withRed))); 
      setGamePhase("check");
    }, 100);
  }, [addLog]);

  const handlePreStartNight = () => {
      const active = seats.filter(s => s.role);
    if (active.length === 0) {
      alert("请先安排座位");
      return;
    }
    // 若酒鬼在场且未分配镇民伪装，强制弹窗选择后再继续
    const pendingDrunk = active.find(s => s.role?.id === "drunk" && (!s.charadeRole || s.charadeRole.type !== 'townsfolk'));
    if (pendingDrunk) {
      setAutoRedHerringInfo(null);
      setShowDrunkModal(pendingDrunk.id);
      return;
    }
    // 完整的阵容校验（必须在validateBaronSetup之前，因为它是更通用的校验）
    if (!validateCompositionSetup(active)) return;
    if (!validateBaronSetup(active)) return;
    const compact = active.map((s, i) => ({ ...s, id: i }));
      
    // 自动为酒鬼分配一个未被使用的镇民角色作为伪装（仅在已分配或无酒鬼时继续）
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
    
    proceedToCheckPhase(updatedCompact);
  };

  const handleBaronAutoRebalance = useCallback(() => {
    if (!baronSetupCheck) return;
    const recommended = baronSetupCheck.recommended;
    const outsiderPool = filteredGroupedRoles['outsider'] || groupedRoles['outsider'] || roles.filter(r => r.type === 'outsider');
    const townsfolkPool = filteredGroupedRoles['townsfolk'] || groupedRoles['townsfolk'] || roles.filter(r => r.type === 'townsfolk');

    setSeats(prev => {
      let updated = [...prev];
      const active = updated.filter(s => s.role);
      if (active.length === 0) return prev;

      const usedIds = new Set<string>(active.map(s => s.role?.id).filter(Boolean) as string[]);
      const pickRole = (pool: Role[]) => {
        if (pool.length === 0) return null;
        const candidate = pool.find(r => !usedIds.has(r.id)) || pool[0];
        if (candidate) usedIds.add(candidate.id);
        return candidate;
      };

      const outsiderSeats = active.filter(s => s.role?.type === 'outsider');
      const townsfolkSeats = active.filter(s => s.role?.type === 'townsfolk');

      if (outsiderSeats.length < recommended.outsider) {
        const need = recommended.outsider - outsiderSeats.length;
        const candidates = townsfolkSeats.slice(0, need);
        candidates.forEach(seat => {
          const newRole = pickRole(outsiderPool);
          if (!newRole) return;
          updated = updated.map(s => s.id === seat.id ? cleanseSeatStatuses({
            ...s,
            role: newRole,
            charadeRole: null,
            isDrunk: newRole.id === 'drunk',
            isPoisoned: false,
            isRedHerring: false,
            isFortuneTellerRedHerring: false,
            statusDetails: [],
          }, { keepDeathState: true }) : s);
        });
      } else if (outsiderSeats.length > recommended.outsider) {
        const need = outsiderSeats.length - recommended.outsider;
        const candidates = outsiderSeats.slice(0, need);
        candidates.forEach(seat => {
          const newRole = pickRole(townsfolkPool);
          if (!newRole) return;
          updated = updated.map(s => s.id === seat.id ? cleanseSeatStatuses({
            ...s,
            role: newRole,
            charadeRole: null,
            isDrunk: false,
            isPoisoned: false,
            isRedHerring: false,
            isFortuneTellerRedHerring: false,
            statusDetails: [],
          }, { keepDeathState: true }) : s);
        });
      }

      return updated;
    });

    setBaronSetupCheck(null);
    setTimeout(() => handlePreStartNight(), 120);
  }, [baronSetupCheck, filteredGroupedRoles, groupedRoles, roles, handlePreStartNight]);

  const confirmDrunkCharade = (r: Role) => {
    if (showDrunkModal === null) return;
    const updated = seats.map(s => s.id === showDrunkModal ? { ...s, charadeRole: r, isDrunk: true } : s);
    setShowDrunkModal(null);
    addLog(`酒鬼伪装：${showDrunkModal + 1}号展示【${r.name}】卡，实际是酒鬼。请对其说“你是${r.name}”。`);

    const active = updated.filter(s => s.role);
    if (!validateBaronSetup(active)) {
      setSeats(updated);
      return;
    }

    proceedToCheckPhase(active);
  };

  const confirmNightOrderPreview = useCallback(() => {
    if (!pendingNightQueue) {
      setShowNightOrderModal(false);
      return;
    }
    finalizeNightStart(pendingNightQueue, true);
  }, [pendingNightQueue, finalizeNightStart]);

  const closeNightOrderPreview = useCallback(() => {
    setPendingNightQueue(null);
    setNightOrderPreview([]);
    setShowNightOrderModal(false);
    setNightQueuePreviewTitle("");
  }, []);

  const startNight = (isFirst: boolean) => {
    // 保存历史记录
    saveHistory();
    // 白天事件与标记重置
    setTodayDemonVoted(false);
    setTodayMinionNominated(false);
    setTodayExecutedId(null);
    setWitchCursedId(null);
    setWitchActive(false);
    setCerenovusTarget(null);
    setVoteRecords([]); // 重置投票记录
    resetRegistrationCache(`${isFirst ? 'firstNight' : 'night'}-${isFirst ? 1 : nightCount + 1}`);
    setNominationMap({});
    const nightlyDeaths: number[] = [];
    setGoonDrunkedThisNight(false);
    setNightQueuePreviewTitle(isFirst ? `第1夜叫醒顺位` : "");
    
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
            const nextSeat = { ...seat, statusDetails: filteredStatuses };
            return { ...nextSeat, isPoisoned: computeIsPoisoned(nextSeat) };
          },
          skipGameOverCheck: !isLast, // 最后一次再检查游戏结束，避免重复检查
        });
        addLog(`${id+1}号 因普卡的中毒效果死亡并恢复健康`);
      });
    }
    // 更新普卡队列（存活者继续保持中毒状态）
    setPukkaPoisonQueue(nextPukkaQueue);
    
    setSeats(p => p.map(s => {
      // 清除所有带清除时间的标记（根据清除时间判断）
      const filteredStatusDetails = (s.statusDetails || []).filter(st => {
        // 保留永久标记
        if (st.includes('永久中毒') || st.includes('永久')) return true;
        // 清除所有带"次日黄昏清除"、"下个黄昏清除"、"至下个黄昏"的标记
        if (st.includes('次日黄昏清除') || st.includes('下个黄昏清除') || st.includes('至下个黄昏')) return false;
        // 保留其他标记（如"下一夜死亡时"、"下一个善良玩家被处决时"等特殊清除条件）
        return true;
      });
      
      const filteredStatuses = (s.statuses || []).filter(status => {
        if (status.effect === 'ExecutionProof') return true;
        // 清除所有带"Night+Day"、"1 Day"等标准清除时间的状态
        if (status.duration === '1 Day' || status.duration === 'Night+Day') return false;
        // 保留其他状态
        return true;
      });
      
      // 检查是否应该保留酒鬼状态（永久酒鬼角色或没有临时酒鬼标记）
      const hasTemporaryDrunk = (s.statusDetails || []).some(d => 
        d.includes('心上人致醉') || d.includes('莽夫使其醉酒') || 
        d.includes('水手致醉') || d.includes('旅店老板致醉') || 
        d.includes('侍臣致醉') || d.includes('哲学家致醉') || 
        d.includes('吟游诗人致醉')
      );
      const keepDrunk = s.role?.id === 'drunk' || (s.isDrunk && !hasTemporaryDrunk);
      
      const poisonedAfterClean = computeIsPoisoned({
        ...s,
        statusDetails: filteredStatusDetails,
        statuses: filteredStatuses,
      });
      
      return {
        ...s, 
        statuses: filteredStatuses,
        statusDetails: filteredStatusDetails,
        isPoisoned: poisonedAfterClean,
        isDrunk: keepDrunk,
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
    } else {
      // 非首夜：检查是否有送葬者且上一个黄昏没有处决
      const hasUndertaker = seats.some(s => s.role?.id === 'undertaker' && !s.isDead);
      if (hasUndertaker && previousDuskExecution === null) {
        addLog(`本黄昏无人被处决，因此今晚【送葬者】不会被唤醒，这是正常规则。`);
      }
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
      // 注意：日志已在startNight函数中添加（在构建队列之前），这里不需要重复添加
      if (r?.id === 'undertaker' && !isFirst && previousDuskExecution === null) {
        return false;
      }
      // 僵怖：如果上一个黄昏有处决，不应该被唤醒（只有在白天没有人死亡时才被唤醒）
      if (r?.id === 'zombuul' && !isFirst && previousDuskExecution !== null) {
        return false;
      }
      // 气球驾驶员：四种类型都已知后不再唤醒
      if (r?.id === 'balloonist') {
        const known = balloonistKnownTypes[s.id] || [];
        const allTypesKnown = ['镇民','外来者','爪牙','恶魔'].every(t => known.includes(t));
        if (allTypesKnown) return false;
        // 首夜也需要按规则给出信息，避免被错误跳过
        if (isFirst) return true;
      }
      return isFirst ? (r?.firstNightOrder ?? 0) > 0 : (r?.otherNightOrder ?? 0) > 0;
    });
    
    if (isFirst) {
      setPendingNightQueue(validQueue);
      setNightOrderPreview(validQueue
        .map(s => {
          const r = s.role?.id === 'drunk' ? s.charadeRole : s.role;
          return { roleName: r?.name || '未知角色', seatNo: s.id + 1, order: r?.firstNightOrder ?? 999 };
        })
        .sort((a,b)=> (a.order ?? 999) - (b.order ?? 999)));
      setShowNightOrderModal(true);
      return;
    }

    finalizeNightStart(validQueue, isFirst);
  };

  const toggleTarget = (id: number) => {
      if(!nightInfo) return;
    
    // 保存历史记录
    saveHistory();
    
    // 确定最大选择数量
    let max = 1;
    if (nightInfo.effectiveRole.id === 'fortune_teller') max = 2;
    if (nightInfo.effectiveRole.id === 'hadesia' && gamePhase !== 'firstNight') max = 3;
    if (nightInfo.effectiveRole.id === 'seamstress') max = 2;
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
      // 只更新高亮，不执行下毒，等待确认；保持其他中毒来源
      setSeats(p => p.map(s => {
        return {...s, isPoisoned: computeIsPoisoned(s)};
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
            if (s.id === tid) {
              // 普卡：当前夜晚中毒，下一夜死亡并恢复健康，所以清除时间是"下一夜死亡时"
              const clearTime = '下一夜死亡时';
              const { statusDetails, statuses } = addPoisonMark(s, 'pukka', clearTime);
              const nextSeat = { ...s, statusDetails, statuses };
              return { ...nextSeat, isPoisoned: computeIsPoisoned(nextSeat) };
            }
            return { ...s, isPoisoned: computeIsPoisoned(s) };
          }));
          if (nightInfo) {
            // 7. 行动日志去重：移除该玩家之前的操作记录，只保留最新的
            setGameLogs(prev => {
              const filtered = prev.filter(log => 
                !(log.message.includes(`${nightInfo.seat.id+1}号(普卡)`) && log.phase === gamePhase)
              );
              return [
                ...filtered, 
                { 
                  day: nightCount, 
                  phase: gamePhase, 
                  message: `${nightInfo.seat.id+1}号(普卡) 今晚令 ${tid+1}号 中毒，他会在下一个夜晚开始前死亡并恢复健康`
                }
              ];
            });
          }
        } else {
          // 其他投毒者（投毒者、夜半狂欢投毒者）的正常处理
          // 注意：保留永久中毒标记（舞蛇人制造）和亡骨魔中毒标记
          setSeats(p => p.map(s => {
            if (s.id === tid) {
              // 投毒者：当晚和明天白天中毒，在次日黄昏清除
              const clearTime = '次日黄昏';
              const { statusDetails, statuses } = addPoisonMark(s, 
                nightInfo.effectiveRole.id === 'poisoner_mr' ? 'poisoner_mr' : 'poisoner', 
                clearTime
              );
              const nextSeat = { ...s, statusDetails, statuses };
              return { ...nextSeat, isPoisoned: computeIsPoisoned(nextSeat) };
            }
            return { ...s, isPoisoned: computeIsPoisoned(s) };
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
      // 莽夫：每夜首个以自身能力选择莽夫的玩家会醉酒至下个黄昏，莽夫阵营暂随选择者（以状态提示）
      if (!goonDrunkedThisNight) {
        const targetSeat = seats.find(s => s.id === tid);
        const chooserSeat = seats.find(s => s.id === nightInfo.seat.id);
        const isActional = ['kill', 'poison', 'protect', 'mark', 'kill_or_skip'].includes(nightInfo.effectiveRole.nightActionType || '');
        const validChooser = chooserSeat && !chooserSeat.isDead;
        if (targetSeat?.role?.id === 'goon' && !targetSeat.isDead && isActional && validChooser) {
          setGoonDrunkedThisNight(true);
          const chooserId = nightInfo.seat.id;
          setSeats(p => p.map(s => {
            if (s.id === chooserId) {
              // 莽夫：首个选择者醉酒至下个黄昏
              const clearTime = '下个黄昏';
              const { statusDetails, statuses } = addDrunkMark(s, 'goon', clearTime);
              return { ...s, isDrunk: true, statusDetails, statuses };
            }
            if (s.id === targetSeat.id) {
              const detail = '莽夫阵营暂随选择者';
              const statusDetails = Array.from(new Set([...(s.statusDetails || []), detail]));
              return { ...s, statusDetails };
            }
            return s;
          }));
          addLog(`${chooserId+1}号 以能力选择了 ${targetSeat.id+1}号(莽夫)，${chooserId+1}号 醉酒至下个黄昏，莽夫阵营暂随选择者`);
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
              return { ...s, role: demonRole, isDemonSuccessor: targetSeat.isDemonSuccessor, isEvilConverted: true, isGoodConverted: false };
            } else if (s.id === targetSeat.id) {
              // 旧恶魔（新舞蛇人）：永久中毒，使用 statusDetails 标记
              const { statusDetails, statuses } = addPoisonMark(s, 'snake_charmer', '永久');
              return { 
                ...s, 
                role: snakeCharmerRole, 
                isPoisoned: true, 
                isDemonSuccessor: false,
                isGoodConverted: true,
                isEvilConverted: false,
                statusDetails,
                statuses
              };
            }
            return s;
          }));
          
          setGameLogs(prev => [...prev, { 
            day: nightCount, 
            phase: gamePhase, 
            message: `${snakeCharmerSeat.id+1}号(舞蛇人) 选择 ${targetSeat.id+1}号，交换角色和阵营，${targetSeat.id+1}号中毒（舞蛇人转邪，恶魔转善）` 
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
      // ========== 梦陨春宵角色处理 ==========
      if(action === 'mark' && nightInfo.effectiveRole.id === 'philosopher' && newT.length === 1) {
        // 哲学家：每局游戏限一次，选择一个善良角色，获得该角色的能力，原角色醉酒
        if (hasUsedAbility('philosopher', nightInfo.seat.id)) {
          addLog(`${nightInfo.seat.id+1}号(哲学家) 已用完一次性能力`);
          return;
        }
        setShowRoleSelectModal({
          type: 'philosopher',
          targetId: newT[0],
          onConfirm: (roleId: string) => {
            const targetRole = roles.find(r => r.id === roleId && (r.type === 'townsfolk' || r.type === 'outsider'));
            if (!targetRole) {
              alert('角色无效或非善良角色');
              return;
            }
            const targetSeatId = newT[0];
            setSeats(prev => prev.map(s => {
              if (s.id === nightInfo.seat.id) {
                return { ...s, role: targetRole };
              }
              if (s.role?.id === targetRole.id) {
                // 哲学家：原角色从当晚开始醉酒三天三夜
                const clearTime = '三天三夜后';
                const { statusDetails, statuses } = addDrunkMark(s, 'philosopher', clearTime);
                return { ...s, isDrunk: true, statusDetails, statuses };
              }
              return s;
            }));
            addLog(`${nightInfo.seat.id+1}号(哲学家) 获得 ${targetRole.name} 的能力`);
            markAbilityUsed('philosopher', nightInfo.seat.id);
            setShowRoleSelectModal(null);
            continueToNextAction();
          }
        });
        return;
      }
      if(action === 'mark' && nightInfo.effectiveRole.id === 'witch' && newT.length === 1) {
        // 女巫：每晚选择一名玩家，如果他明天白天发起提名，他死亡
        const targetId = newT[0];
        const aliveCount = seats.filter(s => !s.isDead).length;
        if (aliveCount <= 3) {
          addLog(`${nightInfo.seat.id+1}号(女巫) 只有三名或更少存活的玩家，失去此能力`);
          return;
        }
        setWitchCursedId(targetId);
        setWitchActive(true);
        addLogWithDeduplication(
          `${nightInfo.seat.id+1}号(女巫) 诅咒 ${targetId+1}号，若其明天发起提名则死亡`,
          nightInfo.seat.id,
          '女巫'
        );
      }
      if(action === 'mark' && nightInfo.effectiveRole.id === 'evil_twin' && newT.length === 1) {
        // 镜像双子：首夜选择一名善良玩家作为对手
        const targetId = newT[0];
        const targetSeat = seats.find(s => s.id === targetId);
        if (!targetSeat) return;
        // 验证目标必须是善良玩家
        const isGood = targetSeat.role && (targetSeat.role.type === 'townsfolk' || targetSeat.role.type === 'outsider');
        if (!isGood) {
          alert('镜像双子必须选择一名善良玩家作为对手');
          return;
        }
        setEvilTwinPair({ evilId: nightInfo.seat.id, goodId: targetId });
        addLog(`${nightInfo.seat.id+1}号(镜像双子) 选择 ${targetId+1}号 作为对手`);
        continueToNextAction();
        return;
      }
      if(action === 'mark' && nightInfo.effectiveRole.id === 'cerenovus' && newT.length === 1) {
        // 洗脑师：每晚选择一名玩家和一个善良角色
        const targetId = newT[0];
        setShowRoleSelectModal({
          type: 'cerenovus',
          targetId,
          onConfirm: (roleId: string) => {
            const targetRole = roles.find(r => r.id === roleId && (r.type === 'townsfolk' || r.type === 'outsider'));
            if (!targetRole) {
              alert('角色无效或非善良角色');
              return;
            }
            setCerenovusTarget({ targetId, roleName: targetRole.name });
            addLogWithDeduplication(`${nightInfo.seat.id+1}号(洗脑师) 要求 ${targetId+1}号 疯狂扮演 ${targetRole.name}`, nightInfo.seat.id, '洗脑师');
            setShowRoleSelectModal(null);
          }
        });
        return;
      }
      if(action === 'mark' && nightInfo.effectiveRole.id === 'pit_hag' && newT.length === 1) {
        // 麻脸巫婆：每晚选择一名玩家和一个角色，如果该角色不在场，他变成该角色
        const targetId = newT[0];
        setShowRoleSelectModal({
          type: 'pit_hag',
          targetId,
          onConfirm: (roleId: string) => {
            const targetRole = roles.find(r => r.id === roleId);
            if (!targetRole) {
              alert('角色不存在');
              return;
            }
            const exists = seats.some(s => (getSeatRoleId(s) === targetRole.id) || (s.isDemonSuccessor && targetRole.type === 'demon'));
            if (exists) {
              addLog(`${nightInfo.seat.id+1}号(麻脸巫婆) 选择 ${targetId+1}号 变为 ${targetRole.name} 失败：场上已有该角色`);
              setShowRoleSelectModal(null);
              continueToNextAction();
              return;
            }
            setSeats(prev => prev.map(s => {
              if (s.id === targetId) {
                const cleaned = cleanseSeatStatuses({ ...s, isDemonSuccessor: false }, { keepDeathState: true });
                const nextSeat = { ...cleaned, role: targetRole, charadeRole: null };
                if (s.hasAbilityEvenDead) {
                  addLog(`${s.id+1}号因亡骨魔获得的“死而有能”效果在变身为 ${targetRole.name} 时已失效。`);
                }
                return nextSeat;
              }
              return s;
            }));
            addLog(`${nightInfo.seat.id+1}号(麻脸巫婆) 将 ${targetId+1}号 变为 ${targetRole.name}`);
            setShowRoleSelectModal(null);
            if (targetRole.type === 'demon') {
              setShowStorytellerDeathModal({ sourceId: targetId });
            }
            // 新角色当夜按顺位加入唤醒队列，可在本夜发动能力
            insertIntoWakeQueueAfterCurrent(targetId, { roleOverride: targetRole, logLabel: `${targetId+1}号(${targetRole.name})` });
            continueToNextAction();
          }
        });
        return;
      }
      // 气球驾驶员已改为被动信息技能，不再需要主动选择处理
      if(action === 'kill' && nightInfo.effectiveRole.id === 'vigormortis_mr' && gamePhase !== 'firstNight' && newT.length === 1) {
        // 夜半狂欢恶魔：选择1名玩家后立即显示确认弹窗
        setShowKillConfirmModal(newT[0]);
        return;
      }
      if(action === 'kill' && nightInfo.effectiveRole.id === 'hadesia' && gamePhase !== 'firstNight' && newT.length === 3) {
        // 哈迪寂亚：选择3名玩家后弹窗确认，允许说书人决定谁会死亡
        const initChoices: Record<number, 'live' | 'die'> = {};
        newT.forEach(id => { initChoices[id] = 'live'; });
        setHadesiaChoices(initChoices);
        setShowHadesiaKillConfirmModal(newT);
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
          return {...s, isPoisoned: computeIsPoisoned(s)};
        }));
        return;
      }
      // 梦陨春宵恶魔：选择目标后立即显示确认弹窗
      if(action === 'kill' && ['fang_gu', 'no_dashii', 'vortox'].includes(nightInfo.effectiveRole.id) && gamePhase !== 'firstNight' && newT.length === 1) {
        setShowKillConfirmModal(newT[0]);
        return;
      }
    } else {
      const action = nightInfo.effectiveRole.nightActionType;
      if(action === 'poison') {
        // 注意：保留永久中毒标记（舞蛇人制造）和亡骨魔中毒标记
        setSeats(p => p.map(s => {
          return {...s, isPoisoned: computeIsPoisoned(s)};
        }));
      }
      if(action === 'protect') {
        // 僧侣/旅店老板保护效果在确认时统一落地
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
      const rid = nightInfo.effectiveRole.id;
      if (rid === 'dreamer' && newT.length === 1) {
        const target = seats.find(s => s.id === newT[0]);
        if (target) {
          const goodRoles = getFilteredRoles(roles).filter(r => ['townsfolk','outsider'].includes(r.type));
          const evilRoles = getFilteredRoles(roles).filter(r => ['minion','demon'].includes(r.type));
          const good = getRandom(goodRoles);
          const evil = getRandom(evilRoles);
          let shownGood = good;
          let shownEvil = evil;
          const targetAlignment = target.role?.type;
          const targetIsGood = targetAlignment === 'townsfolk' || targetAlignment === 'outsider';
          const targetIsEvil = targetAlignment === 'minion' || targetAlignment === 'demon' || target?.isDemonSuccessor;
          const shouldFake = currentHint.isPoisoned || isVortoxWorld;
          if (shouldFake) {
            // 给出一对与真实阵营不符的组合
            if (targetIsGood) {
              // 给两恶或错配
              shownGood = evil;
            } else if (targetIsEvil) {
              shownEvil = good;
            } else {
              shownGood = evil;
              shownEvil = good;
            }
          }
          const resultText = `善良：${shownGood?.name || '未知'} / 邪恶：${shownEvil?.name || '未知'}`;
          setInspectionResult(resultText);
          setInspectionResultKey(k => k + 1);
          addLogWithDeduplication(
            `${nightInfo.seat.id+1}号(筑梦师) 查验 ${target.id+1}号 -> ${resultText}${shouldFake ? '（假信息）' : ''}`,
            nightInfo.seat.id,
            '筑梦师'
          );
        }
      } else if (rid === 'seamstress') {
        if (hasUsedAbility('seamstress', nightInfo.seat.id)) {
          setInspectionResult("已用完一次性能力");
          setInspectionResultKey(k => k + 1);
          return;
        }
        if (newT.length === 2) {
          const [aId, bId] = newT;
          const a = seats.find(s => s.id === aId);
          const b = seats.find(s => s.id === bId);
          if (!a || !b) return;
          const same = isEvilForWinCondition(a) === isEvilForWinCondition(b);
          const shouldFake = currentHint.isPoisoned || isVortoxWorld;
          const shownSame = shouldFake ? !same : same;
          const text = shownSame ? "✅ 同阵营" : "❌ 不同阵营";
          setInspectionResult(text);
          setInspectionResultKey(k => k + 1);
          addLogWithDeduplication(
            `${nightInfo.seat.id+1}号(女裁缝) 查验 ${aId+1}号 与 ${bId+1}号 -> ${text}${shouldFake ? '（假信息）' : ''}`,
            nightInfo.seat.id,
            '女裁缝'
          );
          markAbilityUsed('seamstress', nightInfo.seat.id);
        } else {
          setInspectionResult(null);
        }
      } else if (newT.length === 2) {
        // 占卜师等双查验逻辑
        let resultText: string;
        const checkedTargets = newT.map(tid => {
          const t = seats.find(x=>x.id===tid); 
          if (!t || !t.role) return null;
          const registration = getRegistrationCached(t, nightInfo.effectiveRole);
          const isDemon = registration.registersAsDemon;
          const isRedHerring = t.isRedHerring === true || (t.statusDetails || []).includes("红罗刹");
          return { seat: t, isDemon, isRedHerring };
        }).filter((t): t is { seat: Seat; isDemon: boolean; isRedHerring: boolean } => t !== null);
        
        const hasEvil = checkedTargets.some(t => t.isDemon || t.isRedHerring);
        
        if (currentHint.isPoisoned || isVortoxWorld) {
          const targetSeat = seats.find(s => s.id === nightInfo.seat.id);
          if (targetSeat) {
            const fakeInfoCheck = drunkFirstInfoRef.current 
              ? shouldShowFakeInfo(targetSeat, drunkFirstInfoRef.current, isVortoxWorld)
              : { showFake: currentHint.isPoisoned || isVortoxWorld, isFirstTime: false };
            if (fakeInfoCheck.showFake) {
              resultText = getMisinformation.fortuneTeller(hasEvil);
              fakeInspectionResultRef.current = resultText;
            } else {
              resultText = hasEvil ? "✅ 是" : "❌ 否";
            }
          } else {
            resultText = hasEvil ? "✅ 是" : "❌ 否";
          }
        } else {
          resultText = hasEvil ? "✅ 是" : "❌ 否";
        }
        setInspectionResult(resultText);
        setInspectionResultKey(k => k + 1);
        
        // 添加详细日志说明查验结果的原因（说明为什么是/否）
        const targetIds = newT.map(t => t + 1).join('号与');
        const resultTextClean = resultText === "✅ 是" ? "是" : "否";
        const reason = hasEvil 
          ? `因为其中有人被注册为恶魔（可能是真恶魔，也可能是隐士/红罗刹的误导）`
          : `因为其中没有人被注册为恶魔`;
        addLogWithDeduplication(
          `占卜师查验 ${targetIds}号：结果【${resultTextClean}】，${reason}。`,
          nightInfo.seat.id,
          '占卜师'
        );
      } else {
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
    if (nightInfo.effectiveRole.id === 'sage' && nightInfo.effectiveRole.nightActionType === 'inspect' && newT.length === 2) {
      const [aId, bId] = newT;
      const shouldFake = currentHint.isPoisoned || isVortoxWorld;
      let infoIds = [aId, bId];
      const killerId = nightInfo.seat.id;
      if (!shouldFake) {
        if (!infoIds.includes(killerId)) {
          infoIds[0] = killerId;
        }
      } else {
        // 假信息：随机两名存活玩家
        const aliveIds = seats.filter(s => !s.isDead).map(s => s.id);
        const shuffled = [...aliveIds].sort(() => Math.random() - 0.5);
        infoIds = shuffled.slice(0, 2);
      }
      addLog(`${nightInfo.seat.id+1}号(贤者) 得知 ${infoIds.map(x=>x+1).join('号、')}号，其中一人是杀死自己的恶魔${shouldFake ? '（假信息）' : ''}`);
      setInspectionResult(`你得知：${infoIds.map(x=>`${x+1}号`).join('、')}（其中一人为恶魔）`);
      setInspectionResultKey(k => k + 1);
      return;
    }
  };

  const handleConfirmAction = () => {
    if(!nightInfo) return;
    // 麻脸巫婆：选择玩家与目标角色进行变更
    if (nightInfo.effectiveRole.id === 'pit_hag_mr') {
      if (selectedActionTargets.length !== 1) return;
      const targetId = selectedActionTargets[0];
      if (!showPitHagModal) {
        setShowPitHagModal({ targetId, roleId: null });
        return;
      }
      if (!showPitHagModal.roleId) return;
      const targetSeat = seats.find(s => s.id === targetId);
      const newRole = roles.find(r => r.id === showPitHagModal.roleId);
      if (!targetSeat || !newRole) return;
      // 不能变成场上已存在的角色
      const roleAlreadyInPlay = seats.some(s => getSeatRoleId(s) === newRole.id);
      if (roleAlreadyInPlay) {
        alert('该角色已在场上，无法变身为已存在角色。');
        return;
      }

      setSeats(prev => prev.map(s => {
        if (s.id !== targetId) return s;
        const cleaned = cleanseSeatStatuses({
          ...s,
          isDemonSuccessor: false,
          // 保留僵怖真实死亡标记，其他死亡/中毒状态全部清理
          isZombuulTrulyDead: s.isZombuulTrulyDead,
        }, { keepDeathState: true });
        const nextSeat = { ...cleaned, role: newRole, charadeRole: null };
        if (s.hasAbilityEvenDead) {
          addLog(`${s.id+1}号因亡骨魔获得的“死而有能”效果在变身为 ${newRole.name} 时已失效。`);
        }
        return nextSeat;
      }));

      const createdNewDemon = newRole.type === 'demon' && targetSeat?.role?.type !== 'demon';
      // 如果创造了新的恶魔，提示说书人决定当晚死亡
      if (createdNewDemon) {
        addLog(`${nightInfo.seat.id+1}号(麻脸巫婆) 将 ${targetId+1}号 变为恶魔，今晚的死亡由说书人决定`);
      } else {
        addLog(`${nightInfo.seat.id+1}号(麻脸巫婆) 将 ${targetId+1}号 变为 ${newRole.name}`);
      }

      // 动态调整唤醒队列：让目标在本夜后续按照行动顺序被唤醒
      insertIntoWakeQueueAfterCurrent(targetId, { roleOverride: newRole, logLabel: `${targetId+1}号(${newRole.name})` });

      setShowPitHagModal(null);
      setSelectedActionTargets([]);

      if (createdNewDemon) {
        setShowStorytellerDeathModal({ sourceId: targetId });
        return;
      }

      continueToNextAction();
      return;
    }
    // 如果有待确认的弹窗（杀人/投毒/哈迪寂亚/守鸦人/月之子/理发师等）未处理，则不继续
    if (showKillConfirmModal !== null || showPoisonConfirmModal !== null || showPoisonEvilConfirmModal !== null || showHadesiaKillConfirmModal !== null || 
        showRavenkeeperResultModal !== null || showRavenkeeperFakeModal !== null || showMoonchildKillModal !== null || showBarberSwapModal !== null || showStorytellerDeathModal !== null || showSweetheartDrunkModal !== null || showKlutzChoiceModal !== null) {
      return;
    }
    // 教授（夜半狂欢）：一次性复活一名死亡玩家
    if (nightInfo.effectiveRole.id === 'professor_mr' && gamePhase !== 'firstNight') {
      if (hasUsedAbility('professor_mr', nightInfo.seat.id)) {
        continueToNextAction();
        return;
      }
      const availableReviveTargets = seats.filter(s => {
        const r = s.role?.id === 'drunk' ? s.charadeRole : s.role;
        return s.isDead && r && r.type === 'townsfolk' && !s.isDemonSuccessor;
      });
      if (availableReviveTargets.length === 0) {
        addLog(`${nightInfo.seat.id+1}号(教授) 无可复活的镇民，跳过`);
        continueToNextAction();
        return;
      }
      if (selectedActionTargets.length !== 1) {
        return; // 需选择一名死亡玩家
      }
      const targetId = selectedActionTargets[0];
      const targetSeat = seats.find(s => s.id === targetId);
      if (!targetSeat || !targetSeat.isDead) return;
      const targetRole = targetSeat.role?.id === 'drunk' ? targetSeat.charadeRole : targetSeat.role;
      if (!targetRole || targetSeat.isDemonSuccessor || targetRole.type !== 'townsfolk') {
        alert('教授只能复活死亡的镇民。');
        return;
      }
      const hadEvenDead = !!targetSeat.hasAbilityEvenDead;
      // 复活：清理死亡/中毒相关状态
      setSeats(prev => prev.map(s => {
        if (s.id !== targetId) return s;
        return reviveSeat({
          ...s,
          isEvilConverted: false,
          isZombuulTrulyDead: s.isZombuulTrulyDead, // 保留僵怖真实死亡标记
        });
      }));
      // 移除普卡队列中的目标
      setPukkaPoisonQueue(prev => prev.filter(entry => entry.targetId !== targetId));
      setDeadThisNight(prev => prev.filter(id => id !== targetId));
      addLog(`${nightInfo.seat.id+1}号(教授) 复活了 ${targetId+1}号`);
      if (hadEvenDead) {
        addLog(`${targetId+1}号此前因亡骨魔获得的“死而有能”效果随着复活已失效。`);
      }
      markAbilityUsed('professor_mr', nightInfo.seat.id);
      setSelectedActionTargets([]);
      insertIntoWakeQueueAfterCurrent(targetId, { logLabel: `${targetId+1}号(复活)` });
      continueToNextAction();
      return;
    }
    // 巡山人：命中落难少女则变成未在场镇民
    if (nightInfo.effectiveRole.id === 'ranger' && gamePhase !== 'firstNight') {
      if (hasUsedAbility('ranger', nightInfo.seat.id)) {
        continueToNextAction();
        return;
      }
      if (selectedActionTargets.length !== 1) return;
      const targetId = selectedActionTargets[0];
      const targetSeat = seats.find(s => s.id === targetId);
      if (!targetSeat || targetSeat.isDead) return;
      const targetRoleId = getSeatRoleId(targetSeat);
      markAbilityUsed('ranger', nightInfo.seat.id);
      setSelectedActionTargets([]);
      if (targetRoleId !== 'damsel') {
        addLog(`${nightInfo.seat.id+1}号(巡山人) 选择了 ${targetId+1}号，但未命中落难少女`);
        continueToNextAction();
        return;
      }
      setShowRangerModal({ targetId, roleId: null });
      return;
    }

    // 沙巴洛斯：每晚选择两名玩家杀死（暂不实现复活效果）
    if (nightInfo.effectiveRole.id === 'shabaloth' && gamePhase !== 'firstNight') {
      if (selectedActionTargets.length !== 2) return;
      const targets = [...selectedActionTargets];
      setSelectedActionTargets([]);
      let remaining = targets.length;
      targets.forEach((tid, idx) => {
        killPlayer(tid, {
          skipGameOverCheck: idx < targets.length - 1,
          onAfterKill: () => {
            remaining -= 1;
            if (remaining === 0) {
              addLog(`${nightInfo.seat.id+1}号(沙巴洛斯) 杀死了 ${targets.map(x=>x+1).join('、')}号（本工具暂未实现其复活效果，请说书人按规则手动裁定是否复活）`);
              continueToNextAction();
            }
          }
        });
      });
      return;
    }

    // 珀：支持“本夜不杀（蓄力）”与下夜“三连杀”
    if (nightInfo.effectiveRole.id === 'po' && gamePhase !== 'firstNight') {
      const seatId = nightInfo.seat.id;
      const charged = poChargeState[seatId] === true;
      const uniqueTargets = Array.from(new Set(selectedActionTargets));

      // 未蓄力：允许0或1个目标；0=本夜不杀（蓄力），1=普通杀一人
      if (!charged) {
        if (uniqueTargets.length > 1) return;
        if (uniqueTargets.length === 0) {
          // 本夜不杀人：蓄力
          setPoChargeState(prev => ({ ...prev, [seatId]: true }));
          addLog(`${seatId+1}号(珀) 本夜未杀人，蓄力一次，下一个夜晚将爆发杀 3 人。`);
          continueToNextAction();
          return;
        }
        const targetId = uniqueTargets[0];
        setPoChargeState(prev => ({ ...prev, [seatId]: false }));
        setSelectedActionTargets([]);
        killPlayer(targetId, {
          onAfterKill: () => {
            addLog(`${seatId+1}号(珀) 杀死了 ${targetId+1}号`);
            continueToNextAction();
          }
        });
        return;
      }

      // 已蓄力：必须选择3名不同目标，本夜爆发杀 3 人
      if (uniqueTargets.length !== 3) return;
      setPoChargeState(prev => ({ ...prev, [seatId]: false }));
      setSelectedActionTargets([]);
      let remaining = uniqueTargets.length;
      uniqueTargets.forEach((tid, idx) => {
        killPlayer(tid, {
          skipGameOverCheck: idx < uniqueTargets.length - 1,
          onAfterKill: () => {
            remaining -= 1;
            if (remaining === 0) {
              addLog(`${seatId+1}号(珀) 爆发杀死了 ${uniqueTargets.map(x=>x+1).join('、')}号`);
              continueToNextAction();
            }
          }
        });
      });
      return;
    }

    // 旅店老板：确认两名目标，给予保护并随机致醉一人
    if (nightInfo.effectiveRole.id === 'innkeeper' && gamePhase !== 'firstNight') {
      if (selectedActionTargets.length !== 2) return;
      const [aId, bId] = selectedActionTargets;
      setSelectedActionTargets([]);
      const drunkTargetId = Math.random() < 0.5 ? aId : bId;
      setSeats(prev => prev.map(s => {
        if (s.id === aId || s.id === bId) {
          const base = { ...s, isProtected: true, protectedBy: nightInfo.seat.id };
          if (s.id === drunkTargetId) {
            const clearTime = '次日黄昏';
            const { statusDetails, statuses } = addDrunkMark(base, 'innkeeper', clearTime);
            const nextSeat = { ...base, statusDetails, statuses };
            return { ...nextSeat, isDrunk: true };
          }
          return base;
        }
        return s;
      }));
      addLog(`${nightInfo.seat.id+1}号(旅店老板) 今晚保护了 ${aId+1}号 与 ${bId+1}号，他们不会被恶魔杀死，其中一人醉酒到下个黄昏（信息可能错误）`);
      continueToNextAction();
      return;
    }
    
    // 检查是否有待确认的操作（投毒者和恶魔的确认弹窗已在toggleTarget中处理）
    // 如果有打开的确认弹窗，不继续流程
    if(showKillConfirmModal !== null || showPoisonConfirmModal !== null || showPoisonEvilConfirmModal !== null || showHadesiaKillConfirmModal !== null || 
       showRavenkeeperResultModal !== null || showRavenkeeperFakeModal !== null || showMoonchildKillModal !== null || showSweetheartDrunkModal !== null || showKlutzChoiceModal !== null) {
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
      const killerRoleId = nightInfo?.effectiveRole.id;

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

      // 默认：月之子/呆瓜死亡不立刻结算，等待后续选择
      const shouldSkipGameOver = skipGameOverCheck ?? (targetSeat.role?.id === 'moonchild' || targetSeat.role?.id === 'klutz');

      let updatedSeats: Seat[] = [];
      setSeats(prev => {
        updatedSeats = prev.map(s => {
          if (s.id !== targetId) return s;
          let next: Seat = { ...s, isDead: true };
          // 僵怖假死状态再次被杀死：算作真正死亡
          if (s.role?.id === 'zombuul' && s.isFirstDeathForZombuul && !s.isZombuulTrulyDead) {
            next = { ...next, isZombuulTrulyDead: true };
          }
          // 呆瓜死亡标记，避免重复触发
          if (s.role?.id === 'klutz') {
            const details = Array.from(new Set([...(s.statusDetails || []), '呆瓜已触发']));
            next = { ...next, statusDetails: details };
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

      // 理发师（夜半狂欢版）死亡：恶魔当晚可选择两名玩家交换角色（不能选择恶魔）
      if (targetSeat.role?.id === 'barber_mr') {
        const demon = seatsSnapshot.find(s => (s.role?.type === 'demon' || s.isDemonSuccessor) && !s.isDead);
        if (demon) {
          setShowBarberSwapModal({ demonId: demon.id, firstId: null, secondId: null });
          addLog(`${targetSeat.id + 1}号(理发师)死亡，恶魔可选择两名玩家交换角色`);
        }
      }

      const finalize = (latestSeats?: Seat[]) => {
        // 使用最新的 seats 状态，按优先级选择：入参 → 最新引用 → 本次更新快照 → 状态闭包
        const seatsToUse =
          (latestSeats && latestSeats.length ? latestSeats : null) ??
          (seatsRef.current && seatsRef.current.length ? seatsRef.current : null) ??
          (updatedSeats && updatedSeats.length ? updatedSeats : null) ??
          (seats && seats.length ? seats : null);

        if (!seatsToUse || seatsToUse.length === 0) {
          console.error('killPlayer finalize: seatsToUse为空或无效，跳过游戏结束检查');
          onAfterKill?.(seatsToUse || []);
          return;
        }

        const finalSeats = seatsToUse;

        // 诺-达：杀人后邻近两名镇民中毒（永久，直到游戏结束）
        if (killerRoleId === 'no_dashii') {
          const neighbors = getAliveNeighbors(finalSeats, targetId).filter(s => s.role?.type === 'townsfolk');
          const poisoned = neighbors.slice(0, 2);
          if (poisoned.length > 0) {
            setSeats(p => p.map(s => {
              if (poisoned.some(pz => pz.id === s.id)) {
                const clearTime = '永久';
                const { statusDetails, statuses } = addPoisonMark(s, 'no_dashii', clearTime);
                const nextSeat = { ...s, statusDetails, statuses };
                return { ...nextSeat, isPoisoned: computeIsPoisoned(nextSeat) };
              }
              return { ...s, isPoisoned: computeIsPoisoned(s) };
            }));
            addLog(`诺-达使 ${poisoned.map(p => `${p.id+1}号`).join('、')}号 中毒`);
          }
        }

        // 方古：若杀死外来者且未转化过，则目标变恶魔，自己死亡
        if (killerRoleId === 'fang_gu' && !fangGuConverted) {
          const targetRole = targetSeat.role;
          const isOutsider = targetRole?.type === 'outsider';
          if (isOutsider) {
            const fangGuRole = roles.find(r => r.id === 'fang_gu');
            setSeats(p => p.map(s => {
              if (s.id === targetId) {
                return cleanseSeatStatuses({ ...s, role: fangGuRole || s.role, isDemonSuccessor: false });
              }
              if (s.id === (nightInfo?.seat.id ?? -1)) {
                return { ...s, isDead: true };
              }
              return s;
            }));
            setFangGuConverted(true);
            if (nightInfo?.seat.id !== undefined) {
              addLog(`${nightInfo.seat.id+1}号(方古) 杀死外来者 ${targetId+1}号，目标转化为方古，原方古死亡`);
            }
            onAfterKill?.(finalSeats);
            return;
          }
        }

        if (!shouldSkipGameOver) {
          moonchildChainPendingRef.current = false;
          checkGameOver(finalSeats, executedPlayerId);
        }
        onAfterKill?.(finalSeats);
      };

      if (targetSeat.role?.id === 'klutz' && !targetSeat.isDead && !(targetSeat.statusDetails || []).includes('呆瓜已触发')) {
        setShowKlutzChoiceModal({
          sourceId: targetId,
          onResolve: finalize,
        });
        addLog(`${targetId + 1}号(呆瓜) 死亡，必须选择一名存活玩家`);
        return;
      }

      if (targetSeat.role?.id === 'sweetheart') {
        setShowSweetheartDrunkModal({
          sourceId: targetId,
          onResolve: finalize,
        });
        addLog(`${targetId + 1}号(心上人) 死亡，将导致一名玩家今晚至次日黄昏醉酒`);
        return;
      }

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
    const killerRoleId = nightInfo.effectiveRole.id;
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
    
    // 检查目标是否可以被杀死：僵怖假死状态可以被杀死
    const canBeKilled = target && !isEffectivelyProtected && !teaLadyProtected && target.role?.id !== 'soldier' && 
      (!target.isDead || (target.role?.id === 'zombuul' && target.isFirstDeathForZombuul && !target.isZombuulTrulyDead));

    // 如果因为保护或士兵能力导致无法杀死（且目标存活），添加统一日志说明
    if (target && !target.isDead && !canBeKilled) {
      const demonName = getDemonDisplayName(nightInfo.effectiveRole.id, nightInfo.effectiveRole.name);
      let protectionReason = '';
      
      if (target.role?.id === 'soldier') {
        protectionReason = '士兵能力';
      } else if (isEffectivelyProtected) {
        protectionReason = '僧侣保护';
      } else if (teaLadyProtected) {
        protectionReason = '茶艺师保护';
      }
      
      if (protectionReason) {
        addLogWithDeduplication(
          `小恶魔选择了 ${targetId+1} 号，但因为【${protectionReason}】，${targetId+1} 号没有死亡。今晚依然可能是平安夜。`,
          nightInfo.seat.id,
          demonName
        );
      }
    }

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
              // 亡骨魔中毒是永久的
              const clearTime = '永久';
              const { statusDetails, statuses } = addPoisonMark(s, 'vigormortis', clearTime);
              const nextSeat = { ...s, statusDetails, statuses };
              return { ...nextSeat, isPoisoned: computeIsPoisoned(nextSeat) };
            }
            return { ...s, isPoisoned: computeIsPoisoned(s) };
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
              // 涡流：标记假信息环境
              if (killerRoleId === 'vortox') {
                setIsVortoxWorld(true);
              }
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
        
        let updatedSeats: Seat[] = [];
        setSeats(p => {
          updatedSeats = p.map(s => {
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
          
          return updatedSeats;
        });
        
        // 检查游戏结束（不应该结束，因为新小恶魔还在）
        // 使用setTimeout确保状态更新后再检查
        setTimeout(() => {
          const currentSeats = seatsRef.current || updatedSeats;
          checkGameOver(currentSeats);
        }, 0);
        
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

    const targetSeat = seats.find(s => s.id === targetId);
    const isGood = targetSeat?.role && ['townsfolk', 'outsider'].includes(targetSeat.role.type);

    if (isGood) {
      addLog(`${sourceId + 1}号(月之子) 选择 ${targetId + 1}号 与其陪葬（善良，今晚死亡）`);
      killPlayer(targetId, {
        onAfterKill: latestSeats => {
          onResolve?.(latestSeats);
          moonchildChainPendingRef.current = false;
          if (!moonchildChainPendingRef.current) {
            continueToNextAction();
          }
        }
      });
    } else {
      addLog(`${sourceId + 1}号(月之子) 选择 ${targetId + 1}号，但该目标非善良，未死亡`);
      moonchildChainPendingRef.current = false;
      onResolve?.();
      if (!moonchildChainPendingRef.current) {
        continueToNextAction();
      }
    }
  };
  
  const confirmSweetheartDrunk = (targetId: number) => {
    if (!showSweetheartDrunkModal) return;
    const { sourceId, onResolve } = showSweetheartDrunkModal;
    setShowSweetheartDrunkModal(null);

    setSeats(prev => prev.map(s => {
      if (s.id !== targetId) return s;
      // 心上人：死亡时使一名玩家今晚至次日黄昏醉酒
      const clearTime = '次日黄昏';
      const { statusDetails, statuses } = addDrunkMark(s, 'sweetheart', clearTime);
      return { ...s, isDrunk: true, statusDetails, statuses };
    }));
    addLog(`${sourceId + 1}号(心上人) 死亡，使 ${targetId + 1}号 今晚至次日黄昏醉酒`);

    onResolve?.();
    continueToNextAction();
  };

  const confirmKlutzChoice = () => {
    if (!showKlutzChoiceModal) return;
    const { sourceId, onResolve } = showKlutzChoiceModal;
    if (klutzChoiceTarget === null) {
      alert('请选择一名存活玩家');
      return;
    }
    const target = seats.find(s => s.id === klutzChoiceTarget);
    if (!target || target.isDead) {
      alert('必须选择一名存活玩家');
      return;
    }
    setShowKlutzChoiceModal(null);
    setKlutzChoiceTarget(null);
    const seatsToUse = seatsRef.current || seats;
    const isEvilPick = isEvilForWinCondition(target);
    if (isEvilPick) {
      addLog(`${sourceId + 1}号(呆瓜) 选择了 ${target.id + 1}号（邪恶），善良阵营立即失败`);
      setWinResult('evil');
      setWinReason('呆瓜误判');
      setGamePhase('gameOver');
      return;
    }
    addLog(`${sourceId + 1}号(呆瓜) 选择了 ${target.id + 1}号（非邪恶），无事发生`);
    if (onResolve) {
      onResolve(seatsToUse);
    } else {
      checkGameOver(seatsToUse);
    }
  };
  
  const confirmStorytellerDeath = (targetId: number | null) => {
    if (!showStorytellerDeathModal) return;
    const sourceId = showStorytellerDeathModal.sourceId;
    setShowStorytellerDeathModal(null);

    if (targetId === null) {
      const confirmed = window.confirm('你确认要让本晚无人死亡吗？这会让本局更偏离标准规则，只建议在你非常确定时使用。');
      if (!confirmed) return;
      addLog(`说书人选择本晚无人死亡（因${sourceId + 1}号变为新恶魔），这是一次偏离标准规则的特殊裁决。`);
      continueToNextAction();
      return;
    }

    addLog(`说书人指定 ${targetId + 1}号 当晚死亡（因${sourceId + 1}号变恶魔）`);
    killPlayer(targetId, {
      onAfterKill: () => {
        continueToNextAction();
      }
    });
  };
  
  // 确认下毒（善良玩家）
  const confirmPoison = () => {
    const targetId = showPoisonConfirmModal;
    if(!nightInfo || targetId === null) return;
    
    // 注意：保留永久中毒标记（舞蛇人制造）和亡骨魔中毒标记
    setSeats(p => p.map(s => {
      if (s.id === targetId) {
        // 投毒者：当晚和明天白天中毒，在次日黄昏清除
        const clearTime = '次日黄昏';
        const { statusDetails, statuses } = addPoisonMark(s, 
          nightInfo.effectiveRole.id === 'poisoner_mr' ? 'poisoner_mr' : 'poisoner', 
          clearTime
        );
        const nextSeat = { ...s, statusDetails, statuses };
        return { ...nextSeat, isPoisoned: computeIsPoisoned(nextSeat) };
      }
      return { ...s, isPoisoned: computeIsPoisoned(s) };
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
      if (s.id === targetId) {
        // 投毒者：当晚和明天白天中毒，在次日黄昏清除
        const clearTime = '次日黄昏';
        const { statusDetails, statuses } = addPoisonMark(s, 
          nightInfo.effectiveRole.id === 'poisoner_mr' ? 'poisoner_mr' : 'poisoner', 
          clearTime
        );
        const nextSeat = { ...s, statusDetails, statuses };
        return { ...nextSeat, isPoisoned: computeIsPoisoned(nextSeat) };
      }
      return { ...s, isPoisoned: computeIsPoisoned(s) };
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

  // 哈迪寂亚：设置单个玩家的命运（生/死）
  const setHadesiaChoice = (id: number, choice: 'live' | 'die') => {
    setHadesiaChoices(prev => ({ ...prev, [id]: choice }));
  };

  const confirmHadesia = () => {
    if (!nightInfo || !showHadesiaKillConfirmModal) return;
    const baseTargets = showHadesiaKillConfirmModal;
    const demonName = getDemonDisplayName(nightInfo.effectiveRole.id, nightInfo.effectiveRole.name);
    const choiceMap = baseTargets.reduce<Record<number, 'live' | 'die'>>((acc, id) => {
      acc[id] = hadesiaChoices[id] || 'live';
      return acc;
    }, {});

    const allChooseLive = baseTargets.every(id => choiceMap[id] === 'live');
    const finalTargets = allChooseLive ? baseTargets : baseTargets.filter(id => choiceMap[id] === 'die');

    const choiceDesc = baseTargets.map(id => `[${id+1}号:${choiceMap[id] === 'die' ? '死' : '生'}]`).join('、');
    addLog(`${nightInfo.seat.id+1}号(${demonName}) 选择了 ${choiceDesc}`);
    if (allChooseLive) {
      addLog(`三名玩家都选择“生”，按规则三人全部死亡`);
    } else if (finalTargets.length > 0) {
      addLog(`选择“死”的玩家：${finalTargets.map(x=>x+1).join('、')}号将立即死亡`);
    } else {
      addLog('未选择“死”的玩家，未触发死亡');
    }

    if (finalTargets.length > 0) {
      let remaining = finalTargets.length;
      finalTargets.forEach(tid => {
        killPlayer(tid, {
          onAfterKill: () => {
            remaining -= 1;
            if (remaining === 0) {
              addLog(`${nightInfo.seat.id+1}号(${demonName}) 处决了 ${finalTargets.map(x=>x+1).join('、')}号`);
              continueToNextAction();
            }
          }
        });
      });
    } else {
      continueToNextAction();
    }

    setShowHadesiaKillConfirmModal(null);
    setSelectedActionTargets([]);
    setHadesiaChoices({});
  };

  const executePlayer = (id: number, options?: { skipLunaticRps?: boolean; forceExecution?: boolean }) => {
    const seatsSnapshot = seatsRef.current || seats;
    const t = seatsSnapshot.find(s => s.id === id);
    if (!t) return;
    const skipLunaticRps = options?.skipLunaticRps;
    const forceExecution = options?.forceExecution;

    // 圣徒处决前强提醒：未确认时不继续后续逻辑
    if (t.role?.id === 'saint' && !forceExecution) {
      setShowSaintExecutionConfirmModal({ targetId: id, skipLunaticRps });
      return;
    }

    if (t.role?.id === 'lunatic_mr' && !skipLunaticRps) {
      const nominatorId = nominationMap[id] ?? null;
      setShowLunaticRpsModal({ targetId: id, nominatorId });
      setShowExecutionResultModal({ message: `${id+1}号等待石头剪刀布决定生死` });
      return;
    }

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
      setTodayExecutedId(id);
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
      
      // 主谋特殊处理：如果主谋在游戏开始时存活，且恶魔在首夜被处决，邪恶阵营获胜
      if (gamePhase === 'firstNight') {
        const mastermind = seatsSnapshot.find(s => 
          s.role?.id === 'mastermind' && !s.isDead
        );
        if (mastermind) {
          setSeats(newSeats);
          addLog(`${id+1}号 被处决`);
          setExecutedPlayerId(id);
          setCurrentDuskExecution(id);
          setWinResult('evil');
          setWinReason('主谋：恶魔在首夜被处决');
          setGamePhase('gameOver');
          addLog(`游戏结束：主谋在场，恶魔在首夜被处决，邪恶阵营获胜`);
          return;
        }
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
          const hasPermanentPoison = s.statusDetails?.some(d => d.includes('永久中毒')) || false;
          const hasVigormortisPoison = s.statusDetails?.some(d => d.includes('亡骨魔中毒')) || false;
          // 如果被处决的是善良玩家，清除临时中毒（食人族能力造成的中毒）
          // 但必须保留永久中毒和亡骨魔中毒
          // 如果被处决的是邪恶玩家，设置临时中毒，但也要保留永久中毒
          if (isEvilExecuted) {
            // 食人族中毒直到下一个善良玩家被处决
            const clearTime = '下一个善良玩家被处决时';
            const { statusDetails, statuses } = addPoisonMark(s, 'cannibal', clearTime);
            const nextSeat = { ...s, statusDetails, statuses };
            return { 
              ...nextSeat, 
              isPoisoned: computeIsPoisoned(nextSeat),
              // 记录最后被处决的玩家ID，用于后续能力处理
              masterId: id
            };
          } else {
            // 清除食人族中毒，但保留永久中毒和亡骨魔中毒
            const filteredDetails = (s.statusDetails || []).filter(d => !d.includes('食人族中毒'));
            const filteredStatuses = (s.statuses || []).filter(st => 
              !(st.effect === 'Poison' && s.statusDetails?.some(d => d.includes('食人族中毒')))
            );
            const nextSeat = { ...s, statusDetails: filteredDetails, statuses: filteredStatuses };
            return { 
              ...nextSeat, 
              isPoisoned: computeIsPoisoned(nextSeat),
              // 记录最后被处决的玩家ID，用于后续能力处理
              masterId: id
            };
          }
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
    setTodayExecutedId(id);
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

  const confirmSaintExecution = () => {
    if (!showSaintExecutionConfirmModal) return;
    const { targetId, skipLunaticRps } = showSaintExecutionConfirmModal;
    setShowSaintExecutionConfirmModal(null);
    executePlayer(targetId, { skipLunaticRps, forceExecution: true });
  };

  const cancelSaintExecution = () => {
    setShowSaintExecutionConfirmModal(null);
  };

  const executeNomination = (sourceId: number, id: number, options?: { virginGuideOverride?: { isFirstTime: boolean; nominatorIsTownsfolk: boolean } }) => {
    // 8. 检查提名限制
    if (nominationRecords.nominators.has(sourceId)) {
      addLog(`系统限制：每名玩家每天只能发起一次提名。这是为了减少混乱，不是官方规则的一部分。`);
      return;
    }
    if (nominationRecords.nominees.has(id)) {
      addLog(`系统限制：每名玩家每天只能被提名一次。这是为了减少混乱，不是官方规则的一部分。`);
      return;
    }
    // 女巫：若被诅咒者发起提名且仍有超过3名存活，则其立即死亡
    if (witchActive && witchCursedId !== null) {
      const aliveCount = seats.filter(s => !s.isDead).length;
      if (aliveCount > 3 && witchCursedId === sourceId) {
        addLog(`${sourceId+1}号 发起提名，触发女巫诅咒，立刻死亡`);
        killPlayer(sourceId, { skipGameOverCheck: false, recordNightDeath: false });
        setWitchCursedId(null);
        setWitchActive(false);
        return;
      }
    }
    setNominationMap(prev => ({ ...prev, [id]: sourceId }));
    const nominatorSeat = seats.find(s => s.id === sourceId);
    if (nominatorSeat?.role?.type === 'minion') {
      setTodayMinionNominated(true);
    }

    const target = seats.find(s => s.id === id);
    const virginOverride = options?.virginGuideOverride;

    // 贞洁者（处女）逻辑处理
    if (target?.role?.id === 'virgin' && !target.isPoisoned) {
      const isFirstNomination = virginOverride?.isFirstTime ?? !target.hasBeenNominated;
      const currentSeats = seats;

      if (!isFirstNomination) {
        const updatedSeats = currentSeats.map(s =>
          s.id === id ? { ...s, hasBeenNominated: true, hasUsedVirginAbility: true } : s
        );
        setSeats(updatedSeats);
        // 已经提名过：按普通提名继续
        addLog(`提示：${id+1}号【贞洁者】已在本局被提名过一次，她的能力已经失效。本次提名不会再立即处决提名者。`);
      } else {
        const updatedSeats = currentSeats.map(s =>
          s.id === id ? { ...s, hasBeenNominated: true, hasUsedVirginAbility: true } : s
        );

        const isRealTownsfolk = virginOverride?.nominatorIsTownsfolk ?? (
          nominatorSeat &&
          nominatorSeat.role?.type === 'townsfolk' &&
          nominatorSeat.role?.id !== 'drunk' &&
          !nominatorSeat.isDrunk
        );

        if (isRealTownsfolk) {
          const finalSeats = updatedSeats.map(s =>
            s.id === sourceId ? { ...s, isDead: true } : s
          );
          setSeats(finalSeats);
          addLog(`${sourceId+1}号 提名 ${id+1}号`);
          addLog(`${sourceId+1}号 提名贞洁者被处决`);
          const executedPlayer = finalSeats.find(s => s.id === sourceId);
          if (executedPlayer && executedPlayer.role?.id === 'saint' && !executedPlayer.isPoisoned) {
            setWinResult('evil');
            setWinReason('圣徒被处决');
            setGamePhase('gameOver');
            addLog("游戏结束：圣徒被处决，邪恶胜利");
            return;
          }
          if (checkGameOver(finalSeats, sourceId)) {
            return;
          }
          setShowExecutionResultModal({ message: `${sourceId+1}号玩家被处决`, isVirginTrigger: true });
          return;
        } else {
          setSeats(updatedSeats);
          // 不触发处决，继续普通提名
        }
      }
    }

    // 魔像特殊逻辑：如果提名的玩家不是恶魔，他死亡
    if (nominatorSeat?.role?.id === 'golem') {
      const targetSeat = seats.find(s => s.id === id);
      const isDemon = targetSeat && (targetSeat.role?.type === 'demon' || targetSeat.isDemonSuccessor);
      if (!isDemon) {
        setSeats(p => p.map(s => s.id === id ? { ...s, isDead: true } : s));
        addLog(`${sourceId+1}号(魔像) 提名 ${id+1}号，${id+1}号不是恶魔，${id+1}号死亡`);
        const updatedSeats = seats.map(s => s.id === id ? { ...s, isDead: true } : s);
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
        setSeats(p => p.map(s => s.id === sourceId ? { ...s, hasUsedSlayerAbility: true } : s));
        return;
      }
      setSeats(p => p.map(s => s.id === sourceId ? { ...s, hasUsedSlayerAbility: true } : s));
    }

    setNominationRecords(prev => ({
      nominators: new Set(prev.nominators).add(sourceId),
      nominees: new Set(prev.nominees).add(id)
    }));
    addLog(`${sourceId+1}号 提名 ${id+1}号`); 
    setVoteInputValue('');
    setShowVoteErrorToast(false);
    setShowVoteInputModal(id);
  };

  const handleVirginGuideConfirm = () => {
    if (!virginGuideInfo) return;
    executeNomination(virginGuideInfo.nominatorId, virginGuideInfo.targetId, {
      virginGuideOverride: {
        isFirstTime: virginGuideInfo.isFirstTime,
        nominatorIsTownsfolk: virginGuideInfo.nominatorIsTownsfolk
      }
    });
    setVirginGuideInfo(null);
    setShowDayActionModal(null);
    setShowNominateModal(null);
    setShowShootModal(null);
  };

  const handleDayAction = (id: number) => {
    if(!showDayActionModal) return;
    const {type, sourceId} = showDayActionModal; 
    setShowDayActionModal(null);
    if(type==='nominate') {
      executeNomination(sourceId, id);
    } else if(type==='lunaticKill') {
      saveHistory();
      const killer = seats.find(s => s.id === sourceId);
      if (!killer || killer.role?.id !== 'lunatic_mr') return;
      if (hasUsedDailyAbility('lunatic_mr', sourceId)) {
        addLog(`${sourceId+1}号(精神病患者) 尝试再次使用日杀能力，但本局每名精神病患者只能日杀一次，当前已用完。`);
        setShowExecutionResultModal({ message: "精神病患者每局只能日杀一次，当前已用完。" });
        return;
      }
      const target = seats.find(s => s.id === id);
      if (!target) return;
      if (target.isDead) {
        addLog(`${sourceId+1}号(精神病患者) 试图在白天杀死 ${id+1}号，但对方已死亡`);
        setShowExecutionResultModal({ message: `${id+1}号已死亡，未产生新的死亡` });
      } else {
        const updatedSeats = seats.map(s => s.id === id ? { ...s, isDead: true, isSentenced: false } : s);
        setSeats(updatedSeats);
        addLog(`${sourceId+1}号(精神病患者) 在提名前公开杀死 ${id+1}号`);
        checkGameOver(updatedSeats, id);
      }
      markDailyAbilityUsed('lunatic_mr', sourceId);
      addLog(`精神病患者本局的日杀能力已经使用完毕，之后不能再发动。`);
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
      const targetRegistration = getRegistrationCached(target, shooter.role);
      const isDemon = targetRegistration.registersAsDemon;
      
      if (isRealSlayer && isDemon) {
        // 恶魔死亡，游戏立即结束
        setSeats(p => {
          const newSeats = p.map(s => s.id === id ? { ...s, isDead: true } : s);
          addLog(`${sourceId+1}号(猎手) 开枪击杀 ${id+1}号(小恶魔)`);
          addLog(`【猎手】的子弹击中了恶魔，按照规则，游戏立即结束，不再进行今天的处决和后续夜晚。`);
          // 先设置胜利原因，然后调用 checkGameOver 并保留 winReason
          setWinReason('猎手击杀恶魔');
          checkGameOver(newSeats, undefined, true);
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

  type DayAbilityConfig = {
    roleId: string;
    title: string;
    description: string;
    usage: 'daily' | 'once';
    actionType?: 'lunaticKill';
    logMessage: (seat: Seat) => string;
  };

  const handleDayAbilityTrigger = (seat: Seat, config: DayAbilityConfig) => {
    if (!seat.role || seat.isDead) return;
    if (config.usage === 'once' && hasUsedAbility(config.roleId, seat.id)) return;
    if (config.usage === 'daily' && hasUsedDailyAbility(config.roleId, seat.id)) return;
    saveHistory();
    if (config.actionType === 'lunaticKill') {
      setShowDayActionModal({ type: 'lunaticKill', sourceId: seat.id });
      return;
    }
    // 交互式日间能力：需要弹窗输入/确认
    if (['savant_mr', 'amnesiac', 'fisherman', 'engineer'].includes(config.roleId)) {
      setShowDayAbilityModal({ roleId: config.roleId, seatId: seat.id });
      setDayAbilityForm({});
      return;
    }
    addLog(config.logMessage(seat));
    if (config.usage === 'once') {
      markAbilityUsed(config.roleId, seat.id);
    } else {
      markDailyAbilityUsed(config.roleId, seat.id);
    }
  };

  const reviveSeat = useCallback((seat: Seat): Seat => {
    // 复活时清理所有临时负面状态与死而有能，只保留永久中毒等持续效果
    return cleanseSeatStatuses({
      ...seat,
      isEvilConverted: false,
      isZombuulTrulyDead: seat.isZombuulTrulyDead,
    });
  }, []);

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
    
    // 记录投票者是否为恶魔（用于卖花女孩）
    const voteRecord = voteRecords.find(r => r.voterId === showVoteInputModal);
    const isDemonVote = voteRecord?.isDemon || false;
    if (isDemonVote) {
      setTodayDemonVoted(true);
    }
    
    const alive = seats.filter(s=>!s.isDead).length;
    const threshold = Math.ceil(alive/2);
    // 票数达到50%才会上处决台
    setSeats(p=>p.map(s=>s.id===showVoteInputModal?{...s,voteCount:v,isCandidate:v>=threshold}:s));
    addLog(`${showVoteInputModal+1}号 获得 ${v} 票${v>=threshold ? ' (上台)' : ''}${isDemonVote ? '（恶魔投票）' : ''}`);
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
      // 茶艺师：若她存活且两侧邻居均为善良，则邻居不能被处决
      const teaLady = seats.find(s => s.role?.id === 'tea_lady' && !s.isDead);
      if (teaLady) {
        const neighbors = getAliveNeighbors(seats, teaLady.id);
        const left = neighbors[0];
        const right = neighbors[1];
        const protectsNeighbor =
          left && right &&
          (executed.id === left.id || executed.id === right.id) &&
          isGoodAlignment(left) &&
          isGoodAlignment(right);
        if (protectsNeighbor) {
          const msg = `由于【茶艺师】能力，${executed.id+1}号（茶艺师的善良邻居）本次处决无效，请重新计票或宣布平安日。`;
          addLog(msg);
          setShowExecutionResultModal({ message: msg });
          return;
        }
      }
      if (executed.role?.id === 'lunatic_mr') {
        executePlayer(executed.id);
        return;
      }
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
      // 平票/无人处决 -> 若为涡流环境，邪恶立即胜利
      if (isVortoxWorld && todayExecutedId === null) {
        setWinResult('evil');
        setWinReason('涡流：白天无人处决');
        setGamePhase('gameOver');
        addLog('涡流在场且今日无人处决，邪恶阵营胜利');
        return;
      }
      startNight(false);
    }
  };

  const enterDuskPhase = useCallback(() => {
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
    setNominationMap({});
    setShowMayorThreeAliveModal(false);
  }, [currentDuskExecution]);

  const declareMayorImmediateWin = useCallback(() => {
    setShowMayorThreeAliveModal(false);
    setWinResult('good');
    setWinReason('3人存活且今日不处决（市长能力）');
    setGamePhase('gameOver');
    addLog('市长在场且剩余3人，今日选择不处决，好人胜利');
  }, [addLog]);

  const handleDayEndTransition = useCallback(() => {
    const aliveCount = seats.filter(s => !s.isDead).length;
    const mayorAlive = seats.some(s => s.role?.id === 'mayor' && !s.isDead);
    if (aliveCount === 3 && mayorAlive) {
      setShowMayorThreeAliveModal(true);
      return;
    }
    enterDuskPhase();
  }, [seats, enterDuskPhase]);

  const resolveLunaticRps = (didLunaticLose: boolean) => {
    if (!showLunaticRpsModal) return;
    const { targetId, nominatorId } = showLunaticRpsModal;
    const nominatorNote = nominatorId !== null ? `（提名者：${nominatorId+1}号）` : '';
    if (didLunaticLose) {
      addLog(`${targetId+1}号(精神病患者) 在石头剪刀布中落败${nominatorNote}，被处决`);
      executePlayer(targetId, { skipLunaticRps: true });
      setShowExecutionResultModal({ message: `${targetId+1}号被处决（石头剪刀布落败）` });
    } else {
      if (nominatorId !== null) {
        addLog(`${targetId+1}号(精神病患者) 在石头剪刀布中获胜或打平${nominatorNote}，提名者被处决`);
        const updatedSeats = seats.map(s => s.id === nominatorId ? { ...s, isDead: true, isSentenced: true } : s);
        setSeats(updatedSeats);
        checkGameOver(updatedSeats, nominatorId);
        setShowExecutionResultModal({ message: `${nominatorId+1}号被处决（因精神病患者猜拳获胜）` });
      } else {
        addLog(`${targetId+1}号(精神病患者) 在石头剪刀布中获胜或打平${nominatorNote}，处决取消`);
        setShowExecutionResultModal({ message: `${targetId+1}号存活（处决取消）` });
      }
      setSeats(p => p.map(s => ({ ...s, isCandidate: false, voteCount: undefined })));
      setNominationRecords({ nominators: new Set(), nominees: new Set() });
      setNominationMap({});
    }
    setShowLunaticRpsModal(null);
  };
  
  // 确认开枪结果后继续游戏
  const confirmShootResult = () => {
    setShowShootResultModal(null);
    // 如果恶魔死亡，游戏已经结束，不需要额外操作
    // 如果无事发生，继续游戏流程
  };

  const openContextMenuForSeat = (seatId: number, anchorMode: 'seat' | 'center' = 'seat') => {
    const containerRect = seatContainerRef.current?.getBoundingClientRect();
    const seatRect = seatRefs.current[seatId]?.getBoundingClientRect();
    // 触屏/竖屏需求：强制圆桌范围内居中显示
    let targetX = 0;
    let targetY = 0;
    if (anchorMode === 'center' && containerRect) {
      targetX = containerRect.left + containerRect.width / 2;
      targetY = containerRect.top + containerRect.height / 2;
    } else {
      targetX = seatRect ? seatRect.left + seatRect.width / 2 : 0;
      targetY = seatRect ? seatRect.top + seatRect.height / 2 : 0;
    }

    if (containerRect) {
      const menuW = 192; // 12rem ≈ 192px
      const menuH = 240; // 预估高度，稍大以避免遮挡
      const pad = 6;
      const minX = containerRect.left + pad + menuW / 2;
      const maxX = containerRect.right - pad - menuW / 2;
      const minY = containerRect.top + pad + menuH / 2;
      const maxY = containerRect.bottom - pad - menuH / 2;
      targetX = Math.min(Math.max(targetX, minX), maxX);
      targetY = Math.min(Math.max(targetY, minY), maxY);
    }

    setContextMenu({ x: targetX, y: targetY, seatId });
  };

  const handleContextMenu = (e: React.MouseEvent, seatId: number) => { 
    e.preventDefault(); 
    const seat = seats.find(s => s.id === seatId);
    if (gamePhase === 'check' && seat?.role?.id === 'drunk') {
      setShowDrunkModal(seatId);
      return;
    }
    if (isPortrait) {
      openContextMenuForSeat(seatId, 'center');
    } else {
      setContextMenu({x:e.clientX,y:e.clientY,seatId}); 
    }
  };

  // 触屏长按处理：开始长按
  const handleTouchStart = (e: React.TouchEvent, seatId: number) => {
    e.stopPropagation();
    e.preventDefault();
    // 清除可能存在的旧定时器
    const existingTimer = longPressTimerRef.current.get(seatId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    // 添加长按状态，用于视觉反馈
    setLongPressingSeats(prev => new Set(prev).add(seatId));
    longPressTriggeredRef.current.delete(seatId);
    // 获取触摸位置
    const touch = e.touches[0];
    // 设置0.5秒后触发右键菜单/酒鬼伪装
    const timer = setTimeout(() => {
      const seat = seats.find(s => s.id === seatId);
      if (gamePhase === 'check' && seat?.role?.id === 'drunk') {
        setShowDrunkModal(seatId);
      } else {
        openContextMenuForSeat(seatId, 'center');
      }
      longPressTriggeredRef.current.add(seatId);
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
    e.preventDefault();
    const timer = longPressTimerRef.current.get(seatId);
    if (timer) {
      clearTimeout(timer);
      longPressTimerRef.current.delete(seatId);
      // 若未触发长按，视为一次点击（用于触屏落座/选中）
      if (!longPressTriggeredRef.current.has(seatId)) {
        handleSeatClick(seatId);
      }
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
    e.preventDefault();
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

  const canToggleRedHerring = useCallback((seatId: number) => {
    const seat = seats.find(s => s.id === seatId);
    if (!seat || !seat.role) return false;
    if (['minion', 'demon'].includes(seat.role.type)) return false;
    const hasFortuneTeller = seats.some(s => s.role?.id === 'fortune_teller');
    return hasFortuneTeller;
  }, [seats]);

  const clearCheckLongPressTimer = () => {
    if (checkLongPressTimerRef.current) {
      clearTimeout(checkLongPressTimerRef.current);
      checkLongPressTimerRef.current = null;
    }
  };

  const handleCheckTouchStart = (e: React.TouchEvent, seatId: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canToggleRedHerring(seatId)) return;
    clearCheckLongPressTimer();
    checkLongPressTimerRef.current = setTimeout(() => {
      toggleStatus('redherring', seatId);
      clearCheckLongPressTimer();
    }, 500);
  };

  const handleCheckTouchEnd = (e: React.TouchEvent, seatId: number) => {
    e.preventDefault();
    e.stopPropagation();
    clearCheckLongPressTimer();
  };

  const handleCheckTouchMove = (e: React.TouchEvent, seatId: number) => {
    e.preventDefault();
    e.stopPropagation();
    clearCheckLongPressTimer();
  };

  const handleCheckContextMenu = (e: React.MouseEvent, seatId: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canToggleRedHerring(seatId)) return;
    toggleStatus('redherring', seatId);
  };

  const insertIntoWakeQueueAfterCurrent = useCallback((seatId: number, opts?: { roleOverride?: Role | null; logLabel?: string }) => {
    if (!['night','firstNight'].includes(gamePhase)) return;
    let inserted = false;
    setWakeQueueIds(prev => {
      if (prev.includes(seatId)) return prev;
      const processed = prev.slice(0, currentWakeIndex + 1);
      if (processed.includes(seatId)) return prev;
      const seatsSnapshot = seatsRef.current || seats;
      const target = seatsSnapshot.find(s => s.id === seatId);
      const roleSource = opts?.roleOverride || (target?.role?.id === 'drunk' ? target.charadeRole || target?.role : target?.role);
      if (!roleSource) return prev;
      const order = gamePhase === 'firstNight' ? (roleSource.firstNightOrder ?? 0) : (roleSource.otherNightOrder ?? 0);
      if (order <= 0) return prev;
      // processed 已在上面声明（第4717行）
      const rest = prev.slice(currentWakeIndex + 1);
      const getOrder = (id: number) => {
        const s = seatsSnapshot.find(x => x.id === id);
        if (!s || !s.role) return Number.MAX_SAFE_INTEGER;
        const r = s.role.id === 'drunk' ? s.charadeRole || s.role : s.role;
        return gamePhase === 'firstNight' ? (r?.firstNightOrder ?? Number.MAX_SAFE_INTEGER) : (r?.otherNightOrder ?? Number.MAX_SAFE_INTEGER);
      };
      const insertAt = rest.findIndex(id => order < getOrder(id));
      const nextRest = [...rest];
      if (insertAt >= 0) {
        nextRest.splice(insertAt, 0, seatId);
      } else {
        nextRest.push(seatId);
      }
      inserted = true;
      return [...processed, ...nextRest];
    });
      if (inserted && opts?.logLabel) {
        addLog(`${opts.logLabel} 已加入本夜唤醒队列`);
      }
    }, [gamePhase, currentWakeIndex, seats, addLog]);

  // 将目标玩家转为邪恶阵营（灵言师关键词触发），保持原角色但计入邪恶胜负
  const convertPlayerToEvil = useCallback((targetId: number) => {
    setSeats(prev => prev.map(s => {
      if (s.id !== targetId) return s;
      const cleaned = cleanseSeatStatuses({
        ...s,
        isEvilConverted: true,
        isDemonSuccessor: false,
        charadeRole: null,
      }, { keepDeathState: true });
      return cleaned;
    }));
    insertIntoWakeQueueAfterCurrent(targetId, { logLabel: `${targetId+1}号(转为邪恶)` });
  }, [insertIntoWakeQueueAfterCurrent]);

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
    } else if (action === 'damselGuess') {
      const seat = seats.find(s => s.id === contextMenu.seatId);
      const hasDamsel = seats.some(s => s.role?.id === 'damsel');
      const alreadyUsed = damselGuessUsedBy.includes(contextMenu.seatId);
      if (!seat || seat.role?.type !== 'minion' || seat.isDead || !hasDamsel || alreadyUsed || gamePhase !== 'day') {
        setContextMenu(null);
        return;
      }
      setShowDamselGuessModal({ minionId: contextMenu.seatId, targetId: null });
    }
    setContextMenu(null);
  };

  const toggleStatus = (type: string, seatId?: number) => {
    const targetSeatId = seatId ?? contextMenu?.seatId;
    if(targetSeatId === undefined || targetSeatId === null) return;
    
    setSeats(p => {
      let updated;
      if (type === 'redherring') {
        // 检查场上是否存在占卜师
        const hasFortuneTeller = p.some(s => s.role?.id === "fortune_teller");
        const targetSeat = p.find(s => s.id === targetSeatId);
        const isRemoving = targetSeat?.isRedHerring === true;
        
        // 如果尝试添加红罗刹但场上没有占卜师，则不允许
        if (!isRemoving && !hasFortuneTeller) {
          return p; // 不进行任何更改
        }
        
        // 场上"红罗刹"唯一：选择新的红罗刹时，清除其他玩家的红罗刹标记和图标
        updated = p.map(s => {
          if (s.id === targetSeatId) {
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
        
        // 只有在成功设置（而不是移除）红罗刹时才添加日志
        // 注意：这里使用setTimeout是为了在setSeats完成后再添加日志，避免在回调中直接调用
        if (!isRemoving) {
          setTimeout(() => {
            addLog(`你将 ${targetSeatId + 1} 号玩家设为本局唯一的【红罗刹】（占卜师永远视 ta 为邪恶）。`);
          }, 0);
        }
      } else {
        updated = p.map(s => {
          if (s.id !== targetSeatId) return s;
          if (type === 'dead') {
            if (s.isDead) {
              return reviveSeat(s);
            }
            return { ...s, isDead: true };
          }
          if (type === 'poison') return { ...s, isPoisoned: !s.isPoisoned };
          if (type === 'drunk') return { ...s, isDrunk: !s.isDrunk };
          return s;
        });
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
    if (type === 'dead') {
      const target = seats.find(s => s.id === targetSeatId);
      if (target && target.isDead && ['night','firstNight'].includes(gamePhase)) {
        insertIntoWakeQueueAfterCurrent(target.id);
      }
    }
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
    resetRegistrationCache('idle');
    setAutoRedHerringInfo(null);
    setShowNightOrderModal(false);
    setNightOrderPreview([]);
    setPendingNightQueue(null);
    setDrunkPrompted(false);
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
    resetRegistrationCache('idle');
    setAutoRedHerringInfo(null);
    setShowNightOrderModal(false);
    setNightOrderPreview([]);
    setPendingNightQueue(null);
    setDrunkPrompted(false);
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
  if (!mounted) return null;

  // 人数小于等于 9 时放大座位及文字
  const seatScale = seats.length <= 9 ? 1.3 : 1;

  const currentNightNumber = gamePhase === 'firstNight' ? 1 : nightCount;
  const currentWakeSeat = nightInfo ? seats.find(s => s.id === nightInfo.seat.id) : null;
  const nextWakeSeatId = (gamePhase === 'firstNight' || gamePhase === 'night') && currentWakeIndex + 1 < wakeQueueIds.length ? wakeQueueIds[currentWakeIndex + 1] : null;
  const nextWakeSeat = nextWakeSeatId !== null ? seats.find(s => s.id === nextWakeSeatId) : null;
  const getDisplayRole = (seat: Seat | null | undefined) => {
    if (!seat) return null;
    const base = seat.role?.id === 'drunk' ? seat.charadeRole : seat.role;
    return base;
  };
  const currentWakeRole = getDisplayRole(currentWakeSeat);
  const nextWakeRole = getDisplayRole(nextWakeSeat);
  return (
    <div 
      className={`flex ${isPortrait ? 'flex-col' : 'flex-row'} ${isPortrait ? 'min-h-screen' : 'h-screen'} text-white ${isPortrait ? 'overflow-y-auto' : 'overflow-hidden'} relative ${
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
      {compositionError && (
        <div className="fixed inset-0 z-[9900] bg-black/70 flex items-center justify-center px-4">
          <div className="bg-gray-900 border-4 border-red-500 rounded-2xl p-6 max-w-xl w-full space-y-4 shadow-2xl">
            <div className="text-xl font-bold text-red-400">❌ 阵容配置错误</div>
            {compositionError.hasBaron ? (
              <div className="text-sm leading-6 text-gray-100 space-y-3">
                <p className="font-semibold text-yellow-300">
                  场上存在【男爵】。
                </p>
                <p>
                  {compositionError.playerCount} 人局时，外来者应为 <span className="font-bold text-yellow-200">{compositionError.standard.outsider} 人</span>
                  {(() => {
                    // 从标准配置表中查找基础配置（无男爵时的配置）
                    const basePreset = troubleBrewingPresets.find(p => p.total === compositionError.playerCount);
                    const baseOutsider = basePreset?.outsider ?? 0;
                    return `（而不是 ${baseOutsider}）`;
                  })()}。
                </p>
                <p className="font-semibold text-yellow-200">
                  请增加 2 名外来者（从镇民中替换），或者移除男爵后再开始游戏。
                </p>
                <div className="text-sm text-gray-300 space-y-2 bg-gray-800/60 rounded-lg p-3 border border-gray-700 mt-3">
                  <div className="font-semibold mb-1">当前配置：</div>
                  <div>
                    {compositionError.actual.townsfolk} 镇民 / {compositionError.actual.outsider} 外来者 / {compositionError.actual.minion} 爪牙 / {compositionError.actual.demon} 恶魔
                  </div>
                  <div className="font-semibold mt-2 mb-1">标准配置应为（含男爵）：</div>
                  <div>
                    {compositionError.standard.townsfolk} 镇民 / {compositionError.standard.outsider} 外来者 / {compositionError.standard.minion} 爪牙 / {compositionError.standard.demon} 恶魔
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm leading-6 text-gray-100 space-y-3">
                <p>
                  当前为 <span className="font-bold text-white">{compositionError.playerCount} 人局</span>，标准配置应为
                  <span className="font-semibold text-yellow-200">
                    【{compositionError.standard.townsfolk} 镇民 / {compositionError.standard.outsider} 外来者 / {compositionError.standard.minion} 爪牙 / {compositionError.standard.demon} 恶魔】
                  </span>。
                </p>
                <p>
                  你现在的配置是
                  <span className="font-semibold text-red-300">
                    【{compositionError.actual.townsfolk} 镇民 / {compositionError.actual.outsider} 外来者 / {compositionError.actual.minion} 爪牙 / {compositionError.actual.demon} 恶魔】
                  </span>。
                </p>
                <p className="text-sm text-gray-300 font-semibold">
                  请调整角色数量后再点击开始游戏。
                </p>
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setCompositionError(null);
                  // 同时在控制台输出错误信息
                  console.error('阵容配置错误：', {
                    当前配置: compositionError.actual,
                    标准配置: compositionError.standard,
                    人数: compositionError.playerCount,
                    有男爵: compositionError.hasBaron,
                  });
                }}
                className="flex-1 py-3 rounded-xl bg-red-600 text-white font-bold hover:bg-red-500 transition"
              >
                我知道了
              </button>
            </div>
          </div>
        </div>
      )}
      {baronSetupCheck && (
        <div className="fixed inset-0 z-[9900] bg-black/70 flex items-center justify-center px-4">
          <div className="bg-gray-900 border-4 border-yellow-500 rounded-2xl p-6 max-w-xl w-full space-y-4 shadow-2xl">
            <div className="text-xl font-bold text-yellow-300">⚠️ Setup 校验</div>
            <p className="text-sm leading-6 text-gray-100">
              检测到你选择了【男爵 (Baron)】，但当前【镇民/外来者】数量不符规则。
            </p>
            <div className="text-sm text-gray-200 space-y-2 bg-gray-800/60 rounded-lg p-3 border border-gray-700">
              <div>当前：{baronSetupCheck.current.townsfolk} 个镇民、{baronSetupCheck.current.outsider} 个外来者</div>
              <div className="font-semibold text-yellow-200">
                建议调整为：{baronSetupCheck.recommended.townsfolk} 个镇民、{baronSetupCheck.recommended.outsider} 个外来者
              </div>
              <div className="text-xs text-gray-400">
                （共 {baronSetupCheck.recommended.total} 人局，含男爵自动将 2 名镇民替换为 2 名外来者）
              </div>
            </div>
            <p className="text-sm text-gray-300">
              你可以点击【自动重排】由系统重新分配，或点击【我手动调整】后再继续。
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleBaronAutoRebalance}
                className="flex-1 py-3 rounded-xl bg-yellow-500 text-black font-bold hover:bg-yellow-400 transition"
              >
                自动重排
              </button>
              <button
                onClick={()=>setBaronSetupCheck(null)}
                className="flex-1 py-3 rounded-xl bg-gray-700 text-gray-100 font-bold hover:bg-gray-600 transition"
              >
                我手动调整
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ===== 暗流涌动剧本（游戏第一部分）主界面 ===== */}
      <div className={`${isPortrait ? 'w-full order-2 border-t' : 'w-3/5 h-screen border-r'} relative flex items-center justify-center border-gray-700 ${isPortrait ? 'py-8 min-h-[70vh]' : ''}`}>
        {/* 竖屏时，圆桌容器下移，为顶部按钮留出空间 */}
        {isPortrait && <div className="absolute top-0 left-0 right-0 h-16"></div>}
        {/* 2. 万能上一步按钮和伪装身份识别按钮 - 竖屏时移到顶部，避免与圆桌重叠 */}
        {/* 支持无限次撤回，直到"选择剧本"页面，在"选择剧本"页面无效 */}
        {gamePhase !== 'scriptSelection' && (
          <div className={`absolute ${isPortrait ? 'top-2 left-2 right-2 flex-row justify-end' : 'top-4 right-4 flex-col'} z-50 flex gap-2`}>
            <button
              onClick={handleGlobalUndo}
              className={`${isPortrait ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'} bg-blue-600 rounded-xl font-bold shadow-lg hover:bg-blue-700 transition-colors`}
            >
              <div className={`flex ${isPortrait ? 'flex-row items-center gap-1' : 'flex-col items-center'}`}>
                <div>⬅️ 万能上一步</div>
                {!isPortrait && <div className="text-xs font-normal opacity-80">（撤销当前动作）</div>}
              </div>
            </button>
            <button
              onClick={() => setShowSpyDisguiseModal(true)}
              className={`${isPortrait ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'} bg-purple-600 rounded-xl font-bold shadow-lg hover:bg-purple-700 transition-colors`}
            >
              <div className="flex items-center justify-center">
                <div>🎭 伪装身份识别</div>
              </div>
            </button>
          </div>
        )}
        <div className={`absolute pointer-events-none text-center z-0 ${isPortrait ? 'top-[calc(45%+3rem)]' : 'top-1/2'} left-1/2 -translate-x-1/2 -translate-y-1/2`}>
          <div className={`${isPortrait ? 'text-xl' : 'text-6xl'} font-bold opacity-50 ${isPortrait ? 'mb-1' : 'mb-4'}`}>{phaseNames[gamePhase]}</div>
          <div className={`${isPortrait ? 'text-[9px]' : 'text-xs'} text-gray-500 opacity-40 ${isPortrait ? 'mb-0.5' : 'mb-2'}`}>
            design by{" "}
            <span className="font-bold italic">Bai  Gan Group</span>
          </div>
          {gamePhase==='scriptSelection' && (
            <div className={`${isPortrait ? 'text-xl' : 'text-5xl'} font-mono text-yellow-300`}>请选择剧本</div>
          )}
          {gamePhase!=='setup' && gamePhase!=='scriptSelection' && (
            <div className={`${isPortrait ? 'text-xl' : 'text-5xl'} font-mono text-yellow-300`}>{formatTimer(timer)}</div>
          )}
        </div>
        <div 
          ref={seatContainerRef}
          className={`relative ${isPortrait ? 'w-[80vw] h-[95vw] max-w-[85vw] max-h-[100vw] mt-16' : 'w-[70vmin] h-[70vmin]'}`}>
              {seats.map((s,i)=>{
            const p=getSeatPosition(i, seats.length, isPortrait);
            const displayType = getDisplayRoleType(s);
            const colorClass = displayType ? typeColors[displayType] : 'border-gray-600 text-gray-400';
            const shouldEnlargeSeats = seats.length <= 9;
            const seatScale = shouldEnlargeSeats ? 1.3 : 1;
            const roleName =
              s.role?.id==='drunk'
                ? `${s.charadeRole?.name || s.role?.name} (酒)`
                : s.isDemonSuccessor && s.role?.id === 'imp'
                  ? `${s.role?.name} (传)`
                  : s.role?.name||"空";
            return (
              <div 
                key={s.id} 
                onClick={(e)=>{e.stopPropagation();handleSeatClick(s.id)}} 
                onContextMenu={(e)=>handleContextMenu(e,s.id)}
                onTouchStart={(e)=>handleTouchStart(e,s.id)}
                onTouchEnd={(e)=>handleTouchEnd(e,s.id)}
                onTouchMove={(e)=>handleTouchMove(e,s.id)}
                ref={(el)=>{seatRefs.current[s.id]=el}}
                  style={{
                    left:`${p.x}%`,
                    top:`${p.y}%`,
                    transform:'translate(-50%,-50%)',
                    width: `calc(${isPortrait ? '3rem' : '6rem'} * ${seatScale})`,
                    height: `calc(${isPortrait ? '3rem' : '6rem'} * ${seatScale})`,
                    WebkitUserSelect: 'none',
                    userSelect: 'none',
                    touchAction: 'manipulation',
                  }} 
                className="absolute flex items-center justify-center"
              >
                <div
                  className={`relative w-full h-full rounded-full ${isPortrait ? 'border-2' : 'border-4'} flex items-center justify-center cursor-pointer z-30 bg-gray-900 transition-all duration-300
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
                <div className={`absolute ${isPortrait ? '-top-2 -left-2 w-5 h-5 text-[10px]' : '-top-5 -left-5 w-9 h-9 text-base'} bg-gray-800 rounded-full border-2 border-gray-600 flex items-center justify-center font-bold z-40`}>
                  {s.id+1}
                  </div>
                
                {/* 角色名称 */}
                <span 
                  className="font-bold text-center leading-tight px-1 whitespace-nowrap"
                  style={{ fontSize: `${(isPortrait ? 8 : 14) * seatScale}px` }}
                >
                  {roleName}
                </span>
                
                {/* 状态图标 - 底部 */}
                <div className={`absolute ${isPortrait ? '-bottom-1.5' : '-bottom-3'} flex gap-0.5`}>
                  {s.isPoisoned&&<span className={isPortrait ? 'text-xs' : 'text-lg'} title="中毒">🧪</span>}
                  {s.isProtected&&<span className={isPortrait ? 'text-xs' : 'text-lg'} title="受保护">🛡️</span>}
                  {s.isRedHerring&&<span className={isPortrait ? 'text-xs' : 'text-lg'} title="这是占卜师的固定误判对象。">😈</span>}
                </div>
                {/* 状态徽标 - 内环底部 */}
                <div 
                  className={`absolute inset-x-0.5 ${isPortrait ? 'bottom-0.5' : 'bottom-2'} flex flex-wrap gap-0.5 justify-center leading-tight text-center`}
                  style={{ fontSize: `${(isPortrait ? 6 : 10) * seatScale}px` }}
                >
                  {(s.statusDetails || []).map(st => (
                    <span key={st} className="px-2 py-0.5 rounded-full bg-gray-800/90 border border-gray-600 text-yellow-200 whitespace-nowrap text-center">{st}</span>
                  ))}
                  {s.hasUsedSlayerAbility && (
                    <span className="px-2 py-0.5 rounded-full bg-red-900/70 border border-red-700 text-red-100 whitespace-nowrap text-center">猎手已用</span>
                  )}
                  {s.hasUsedVirginAbility && (
                    <span className="px-2 py-0.5 rounded-full bg-purple-900/70 border border-purple-700 text-purple-100 whitespace-nowrap text-center">处女失效</span>
                  )}
                  {s.hasAbilityEvenDead && (
                    <span className="px-2 py-0.5 rounded-full bg-green-900/70 border border-green-700 text-green-100 whitespace-nowrap text-center">死而有能</span>
                  )}
                  {s.isDemonSuccessor && (
                    <span className="px-2 py-0.5 rounded-full bg-red-800/80 border border-red-700 text-white whitespace-nowrap text-center">恶魔（传）</span>
                  )}
                </div>
                
                {/* 右上角提示区域 */}
                <div className={`absolute ${isPortrait ? '-top-1.5 -right-1.5' : '-top-5 -right-5'} flex flex-col gap-0.5 items-end z-40`}>
                  {/* 主人标签 */}
                  {seats.some(seat => seat.masterId === s.id) && (
                    <span className={`${isPortrait ? 'text-[7px] px-0.5 py-0.5' : 'text-xs px-2 py-0.5'} bg-purple-600 rounded-full shadow font-bold`}>
                      主人
                    </span>
                  )}
                  {/* 处决台标签 */}
                  {s.isCandidate && (
                    <span className={`${isPortrait ? 'text-[7px] px-0.5 py-0.5' : 'text-xs px-2 py-0.5'} bg-red-600 rounded-full shadow font-bold animate-pulse`}>
                      ⚖️{s.voteCount}
                    </span>
                  )}
                </div>
                </div>
              </div>
            );
              })}
          </div>
      </div>

      <div className={`${isPortrait ? 'w-full order-1 border-b' : 'w-2/5 h-screen border-l'} flex flex-col border-gray-800 z-40 transition-all duration-500 ${
        gamePhase === 'scriptSelection' 
          ? 'bg-gray-800/90' 
          : 'bg-gray-900/95'
      }`}>
        <div className={`px-4 ${isPortrait ? 'py-2 pb-3' : 'py-2 pb-4'} border-b flex items-center justify-between relative`}>
          <span className={`font-bold text-purple-400 ${isPortrait ? 'text-lg' : 'text-xl scale-[1.3]'} flex items-center justify-center ${isPortrait ? 'h-7' : 'h-8'} flex-shrink-0`}>控制台</span>
          <div className="flex items-center flex-shrink-0 gap-1">
            <button 
              onClick={()=>setShowGameRecordsModal(true)} 
              className={`${isPortrait ? 'px-2 py-1 text-sm h-7' : 'px-2 py-1 text-sm h-8 scale-[1.3] mr-[28px]'} bg-green-600 border rounded shadow-lg flex items-center justify-center flex-shrink-0`}
            >
              对局记录
            </button>
            <button 
              onClick={()=>setShowReviewModal(true)} 
              className={`${isPortrait ? 'px-2 py-1 text-sm h-7' : 'px-2 py-1 text-sm h-8 scale-[1.3] mr-[22px]'} bg-indigo-600 border rounded shadow-lg flex items-center justify-center flex-shrink-0`}
            >
              复盘
            </button>
            <div className="relative flex-shrink-0">
              <button 
                onClick={(e)=>{e.stopPropagation();setShowMenu(!showMenu)}} 
                className={`${isPortrait ? 'px-2 py-1 text-sm h-7' : 'px-2 py-1 text-sm h-8 scale-[1.3]'} bg-gray-800 border rounded shadow-lg flex items-center justify-center`}
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
            <span 
              ref={currentActionTextRef}
              className={`${isPortrait ? 'text-xl' : 'text-3xl'} font-bold text-white absolute left-1/2 -translate-x-1/2 top-full mt-2 whitespace-nowrap text-center overflow-hidden`}
              style={{ maxWidth: '100%' }}
            >
              当前是第{currentNightNumber}夜：轮到
              <span className="text-yellow-300">
                {nightInfo.seat.id+1}号{currentWakeRole?.name || nightInfo.effectiveRole.name}
              </span>
              行动。
              下一个将是
              <span className="text-cyan-300">
                {nextWakeSeat && nextWakeRole ? `${nextWakeSeat.id+1}号${nextWakeRole.name}` : '（本夜结束）'}
              </span>
              。
            </span>
          )}
        </div>
          <div ref={consoleContentRef} className={`flex-1 overflow-y-auto ${isPortrait ? 'p-3' : 'p-4'} ${isPortrait ? 'text-sm' : 'text-base'}`}>
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
          {gamePhase==='day' && (() => {
            const dayAbilityConfigs: DayAbilityConfig[] = [
              {
                roleId: 'savant_mr',
                title: '博学者每日提问',
                description: '每个白天一次，向说书人索取一真一假的两条信息。',
                usage: 'daily',
                logMessage: seat => `${seat.id+1}号(博学者) 使用今日提问，请准备一真一假两条信息`
              },
              {
                roleId: 'amnesiac',
                title: '失意者每日猜测',
                description: '每个白天一次，向说书人提交本回合的猜测并获得反馈。',
                usage: 'daily',
                logMessage: seat => `${seat.id+1}号(失意者) 提交今日猜测，请给出反馈`
              },
              {
                roleId: 'fisherman',
                title: '渔夫灵感',
                description: '每局一次，向说书人索取获胜建议。',
                usage: 'once',
                logMessage: seat => `${seat.id+1}号(渔夫) 使用一次性灵感，请提供获胜建议`
              },
              {
                roleId: 'engineer',
                title: '工程师改装',
                description: '每局一次，改造恶魔或爪牙阵营（请手动选择变更）。',
                usage: 'once',
                logMessage: seat => `${seat.id+1}号(工程师) 启动改装，请根据需求手动调整恶魔/爪牙`
              },
              {
                roleId: 'lunatic_mr',
                title: '精神病患者日杀',
                description: '提名前公开杀死一名玩家。处决时需与提名者猜拳决定生死。',
                usage: 'daily',
                actionType: 'lunaticKill',
                logMessage: seat => `${seat.id+1}号(精神病患者) 准备发动日间杀人`
              }
            ];
            const entries = seats
              .filter(s => s.role && dayAbilityConfigs.some(c => c.roleId === s.role!.id))
              .map(seat => {
                const config = dayAbilityConfigs.find(c => c.roleId === seat.role?.id);
                return config ? { seat, config } : null;
              })
              .filter((v): v is { seat: Seat; config: DayAbilityConfig } => !!v);
            if (entries.length === 0) return null;
            return (
              <div className="mb-4 p-3 bg-gray-800/40 border border-blue-500/30 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-bold text-blue-300">🌞 白天主动技能</p>
                  <span className="text-xs text-gray-400">每日/一次性能力快速触发</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {entries.map(({ seat, config }) => {
                    const used = config.usage === 'once'
                      ? hasUsedAbility(config.roleId, seat.id)
                      : hasUsedDailyAbility(config.roleId, seat.id);
                    const disabled = seat.isDead || used;
                    const statusLabel = seat.isDead
                      ? '已死亡'
                      : used
                        ? (config.usage === 'once' ? '已用完' : '今日已用')
                        : '可使用';
                    return (
                      <div key={`${config.roleId}-${seat.id}`} className="p-3 border border-gray-700 rounded-lg bg-gray-900/40">
                        <div className="flex items-center justify-between mb-1">
                          <div className="font-bold text-white">{seat.id+1}号 {seat.role?.name}</div>
                          <span className="text-xs text-gray-400">{statusLabel}</span>
                        </div>
                        <p className="text-xs text-gray-400 mb-2 leading-relaxed">{config.description}</p>
                        <button
                          onClick={() => handleDayAbilityTrigger(seat, config)}
                          disabled={disabled}
                          className={`w-full py-2 rounded-lg text-sm font-bold transition ${
                            disabled ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white'
                          }`}
                        >
                          触发
                        </button>
                      </div>
                    );
                  })}
                </div>
                {dayAbilityLogs.length > 0 && (
                  <div className="mt-3 space-y-1 text-xs text-gray-300">
                    <div className="font-bold text-blue-200">今日反馈记录</div>
                    {dayAbilityLogs
                      .filter(l => l.day === nightCount)
                      .map((l, idx) => (
                        <div key={`${l.roleId}-${l.id}-${idx}`} className="px-2 py-1 bg-gray-800/60 rounded border border-gray-700">
                          {l.id+1}号 {getSeatRoleId(seats.find(s=>s.id===l.id)) === l.roleId ? '' : ''}{roles.find(r=>r.id===l.roleId)?.name || l.roleId}：{l.text}
                        </div>
                      ))}
                    {dayAbilityLogs.filter(l => l.day === nightCount).length === 0 && (
                      <div className="text-gray-500">尚无记录</div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
          {gamePhase==='day' && !damselGuessed && seats.some(s=>s.role?.type==='minion' && !s.isDead && !damselGuessUsedBy.includes(s.id)) && seats.some(s=>s.role?.id==='damsel') && (
            <div className="mb-4 p-3 bg-gray-800/40 border border-pink-500/40 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-bold text-pink-300">👸 爪牙猜测落难少女</p>
                <span className="text-xs text-gray-400">每名爪牙每局一次，猜中则邪恶立刻获胜</span>
              </div>
              <button
                onClick={()=>setShowDamselGuessModal({ minionId: null, targetId: null })}
                className="w-full py-2 rounded-lg bg-pink-600 hover:bg-pink-500 text-white font-bold text-sm"
              >
                发起猜测
              </button>
            </div>
          )}
          {gamePhase==='day' && shamanKeyword && !shamanTriggered && (
            <div className="mb-4 p-3 bg-gray-800/40 border border-purple-500/40 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-bold text-purple-300">🔮 灵言师关键词已被说出</p>
                <span className="text-xs text-gray-400">选择第一个说出关键词的善良玩家</span>
              </div>
              <button
                onClick={()=>setShowShamanConvertModal(true)}
                className="w-full py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm"
              >
                触发阵营转换
              </button>
            </div>
          )}
          {gamePhase==='setup' && (() => {
            // 计算各阵营数量
            const playerCount = seats.filter(s => s.role !== null).length;
            const actualTownsfolkCount = seats.filter(s => s.role?.type === 'townsfolk').length;
            const actualOutsiderCount = seats.filter(s => s.role?.type === 'outsider').length;
            const actualMinionCount = seats.filter(s => s.role?.type === 'minion').length;
            const actualDemonCount = seats.filter(s => s.role?.type === 'demon').length;
            
            // 检查影响外来者数量的角色
            const hasBaron = seats.some(s => s.role?.id === 'baron');
            const hasGodfather = seats.some(s => s.role?.id === 'godfather');
            const hasFangGu = seats.some(s => s.role?.id === 'fang_gu');
            const hasVigormortis = seats.some(s => s.role?.id === 'vigormortis' || s.role?.id === 'vigormortis_mr');
            const hasBalloonist = seats.some(s => s.role?.id === 'balloonist');
            
            // 基于"保持当前村民数量不变"计算建议
            // 血染钟楼规则：
            // - 外来者数 = floor(总玩家数 / 3) + 修正值
            // - 爪牙数 = floor((总玩家数 - 3) / 2)
            // - 恶魔数 = 1
            // - 总玩家数 = 村民数 + 外来者数 + 爪牙数 + 恶魔数
            
            const calculateRecommendations = (townsfolkCount: number) => {
            const recommendations: Array<{
              outsider: number;
              minion: number;
              demon: number;
              total: number;
              modifiers: string[];
              note?: string;
            }> = [];

            // 以村民数为基准的官方建议表
            const presets = [
              { total: 5, townsfolk: 3, outsider: 0, minion: 1, demon: 1 },
              { total: 6, townsfolk: 3, outsider: 1, minion: 1, demon: 1 },
              { total: 7, townsfolk: 5, outsider: 0, minion: 1, demon: 1 },
              { total: 8, townsfolk: 5, outsider: 1, minion: 1, demon: 1 },
              { total: 9, townsfolk: 5, outsider: 2, minion: 1, demon: 1 },
              { total: 10, townsfolk: 7, outsider: 0, minion: 2, demon: 1 },
              { total: 11, townsfolk: 7, outsider: 1, minion: 2, demon: 1 },
              { total: 12, townsfolk: 7, outsider: 2, minion: 2, demon: 1 },
              { total: 13, townsfolk: 9, outsider: 0, minion: 3, demon: 1 },
              { total: 14, townsfolk: 9, outsider: 1, minion: 3, demon: 1 },
              { total: 15, townsfolk: 9, outsider: 2, minion: 3, demon: 1 },
            ];

            presets
              .filter(p => p.townsfolk === townsfolkCount)
              .forEach(p => {
                recommendations.push({
                  outsider: p.outsider,
                  minion: p.minion,
                  demon: p.demon,
                  total: p.total,
                  modifiers: [],
                  note: `总人数${p.total}人`,
                });
              });

            recommendations.sort((a, b) => a.total - b.total);

            return recommendations.slice(0, 5); // 最多显示5个建议
            };
            
            const recommendations = calculateRecommendations(actualTownsfolkCount);
            
            // 检查当前配置是否匹配某个建议
            const currentMatch = recommendations.find(r => 
              r.outsider === actualOutsiderCount &&
              r.minion === actualMinionCount &&
              r.demon === actualDemonCount
            );
            
            const isValid = currentMatch !== undefined;
            
            return (
              <div className="space-y-6">
                {/* 阵营角色数量校验提示 */}
                {actualTownsfolkCount > 0 && (
                  <div className={`p-4 rounded-lg border-2 ${isValid ? 'bg-green-900/30 border-green-500 text-green-200' : 'bg-yellow-900/30 border-yellow-500 text-yellow-200'}`}>
                    <div className="font-bold mb-2">📊 阵营角色数量建议</div>
                    <div className="text-sm space-y-1">
                      <div>当前村民数：{actualTownsfolkCount}人（保持不变）</div>
                      <div className="mt-2 font-semibold">建议配置：</div>
                      {recommendations.length > 0 ? (
                        <div className="space-y-1 ml-2">
                          {recommendations.map((rec, idx) => {
                            const isCurrent = rec.outsider === actualOutsiderCount && 
                                            rec.minion === actualMinionCount && 
                                            rec.demon === actualDemonCount;
                            return (
                              <div key={idx} className={isCurrent ? 'text-green-300 font-bold' : ''}>
                                {rec.outsider}外来者、{rec.minion}爪牙、{rec.demon}恶魔
                                {rec.note && <span className="text-xs opacity-75 ml-1">（{rec.note}）</span>}
                                {isCurrent && <span className="ml-2">✓ 当前配置</span>}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-xs opacity-75 ml-2">无有效配置</div>
                      )}
                      <div className="mt-2 text-xs opacity-75">
                        实际：{actualOutsiderCount}外来者、{actualMinionCount}爪牙、{actualDemonCount}恶魔
                      </div>
                      {!isValid && (
                        <div className="mt-2 text-yellow-300 font-bold">⚠️ 当前配置不在建议范围内！</div>
                      )}
                    </div>
                  </div>
                )}
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
            );
          })()}
          
          {gamePhase==='check' && (
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-4">核对身份</h2>
              {autoRedHerringInfo && (
                <div className="mb-4 px-4 py-3 rounded-lg bg-red-900/40 border border-red-500 text-red-200 font-semibold">
                  🎭 红罗刹自动分配：{autoRedHerringInfo}
                </div>
              )}
              {selectedScript && (
                <div className="mb-4 px-4 py-3 rounded-lg bg-gray-800/80 border border-yellow-500/70 text-left text-sm text-gray-100 space-y-1">
                  <div className="font-bold text-yellow-300 mb-1">🌙 夜晚行动说明（{selectedScript.name}）</div>
                  {(() => {
                    const scriptRoles = roles.filter(r => {
                      if (selectedScript.id === 'trouble_brewing') return !r.script;
                      if (selectedScript.id === 'bad_moon_rising') return r.script === '暗月初升';
                      if (selectedScript.id === 'sects_and_violets') return r.script === '梦陨春宵';
                      if (selectedScript.id === 'midnight_revelry') return r.script === '夜半狂欢';
                      return false;
                    });
                    const onlyFirst = scriptRoles.filter(r => r.firstNight && !r.otherNight);
                    const onlyOther = scriptRoles.filter(r => !r.firstNight && r.otherNight);
                    const bothNights = scriptRoles.filter(r => r.firstNight && r.otherNight);
                    const passive = scriptRoles.filter(r => !r.firstNight && !r.otherNight);
                    const renderLine = (label: string, list: typeof scriptRoles) => {
                      if (!list.length) return null;
                      return (
                        <div>
                          <span className="font-semibold">{label}</span>
                          <span className="text-gray-300">
                            ：{list.map(r => r.name).join('、')}
                          </span>
                        </div>
                      );
                    };
                    return (
                      <>
                        {renderLine('只在首夜被唤醒的角色', onlyFirst)}
                        {renderLine('只在之后夜晚被唤醒的角色', onlyOther)}
                        {renderLine('首夜和之后夜晚都会被唤醒的角色', bothNights)}
                        {renderLine('从不在夜里被唤醒、但始终生效的角色', passive)}
                      </>
                    );
                  })()}
                  <div className="text-xs text-gray-400 mt-1">
                    提示：若某角色今晚未被叫醒，通常是因为规则只在首夜或之后夜晚才叫醒，而非程序漏掉。
                  </div>
                </div>
              )}
              <div className="bg-gray-800 p-4 rounded-xl text-left text-base space-y-3 max-h-[80vh] overflow-y-auto check-identity-scrollbar">
                {seats.filter(s=>s.role).map(s=>{
                  // 酒鬼应该显示伪装角色的名称，而不是"酒鬼"
                  const displayRole = s.role?.id === 'drunk' && s.charadeRole ? s.charadeRole : s.role;
                  const displayName = displayRole?.name || '';
                  const canRedHerring = canToggleRedHerring(s.id);
                  return (
                    <div 
                      key={s.id} 
                      className="flex flex-col gap-1 border-b border-gray-700 pb-2 select-none"
                      style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
                      onContextMenu={(e)=>handleCheckContextMenu(e, s.id)}
                      onTouchStart={(e)=>handleCheckTouchStart(e, s.id)}
                      onTouchEnd={(e)=>handleCheckTouchEnd(e, s.id)}
                      onTouchMove={(e)=>handleCheckTouchMove(e, s.id)}
                    >
                      <div className="flex justify-between">
                        <span>{s.id+1}号</span>
                        <span className={s.role?.type==='demon'?'text-red-500 font-bold':''}>
                          {displayName}
                          {s.role?.id==='drunk' && <span className="text-gray-400 text-sm">(酒鬼)</span>}
                          {s.isRedHerring && ' [红罗刹]'}
                          {!canRedHerring && s.isRedHerring && <span className="text-xs text-gray-500 ml-1">(仅占卜师在场可更改)</span>}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2 text-[11px] text-gray-300">
                        {s.statusDetails?.length ? (
                          s.statusDetails.map(st => (
                            <span key={st} className={`px-2 py-0.5 rounded bg-gray-700 text-yellow-300 border border-gray-600 ${st.includes('投毒') ? 'whitespace-nowrap' : ''}`}>{st}</span>
                          ))
                        ) : (
                          <span className="text-gray-500">无特殊状态</span>
                        )}
                        {s.hasUsedSlayerAbility && (
                          <span className="px-2 py-0.5 rounded bg-red-900/60 text-red-200 border border-red-700">猎手已用</span>
                        )}
                        {s.hasUsedVirginAbility && (
                          <span className="px-2 py-0.5 rounded bg-purple-900/60 text-purple-200 border border-purple-700">处女已失效</span>
                        )}
                        {s.hasAbilityEvenDead && (
                          <span className="px-2 py-0.5 rounded bg-green-900/60 text-green-200 border border-green-700">死而有能</span>
                        )}
                        {s.isDemonSuccessor && (
                          <span className="px-2 py-0.5 rounded bg-red-800/70 text-white border border-red-600">恶魔（传）</span>
                        )}
                      </div>
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
        {gamePhase==='check' && (() => {
          // 酒鬼必须先分配镇民伪装身份，未分配或分配非镇民时禁止入夜
          const hasPendingDrunk = seats.some(s => s.role?.id === 'drunk' && (!s.charadeRole || s.charadeRole.type !== 'townsfolk'));
          return (
            <div className="w-full flex flex-col gap-2">
              <button 
                onClick={()=>!hasPendingDrunk && startNight(true)} 
                disabled={hasPendingDrunk}
                className="w-full py-3 bg-green-600 rounded-xl font-bold text-base shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                确认无误，入夜
              </button>
              {hasPendingDrunk && (
                <div className="text-center text-yellow-300 text-sm font-semibold">
                  场上有酒鬼未选择镇民伪装身份，请长按其座位分配后再入夜
                </div>
              )}
            </div>
          );
        })()}
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
                  // 旅店老板：必须选择两名玩家
                  (nightInfo?.effectiveRole.id === 'innkeeper' &&
                   gamePhase !== 'firstNight' &&
                   selectedActionTargets.length !== 2) ||
                  // 沙巴洛斯：非首夜必须选择2名玩家
                  (nightInfo?.effectiveRole.id === 'shabaloth' &&
                   gamePhase !== 'firstNight' &&
                   selectedActionTargets.length !== 2) ||
                  // 珀：未蓄力时最多选择1人，已蓄力时必须选择3人
                  (nightInfo?.effectiveRole.id === 'po' &&
                   gamePhase !== 'firstNight' && (() => {
                     const seatId = nightInfo.seat.id;
                     const charged = poChargeState[seatId] === true;
                     const uniqueCount = new Set(selectedActionTargets).size;
                     return (!charged && uniqueCount > 1) || (charged && uniqueCount !== 3);
                   })()) ||
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
            </>
          )}
          {gamePhase==='day' && (
            <>
              {/* 剩余日间按钮（evil_twin 相关） */}
              {evilTwinPair && (
                <div className="w-full mb-2 flex gap-2">
                  <input
                    type="number"
                    min="0"
                    value={remainingDays ?? ''}
                    onChange={(e) => setRemainingDays(e.target.value ? parseInt(e.target.value) : null)}
                    placeholder="剩余日间数"
                    className="flex-1 px-3 py-2 bg-gray-700 rounded-lg text-center"
                  />
                  <button
                    onClick={() => {
                      if (remainingDays !== null && remainingDays > 0) {
                        setRemainingDays(remainingDays - 1);
                        addLog(`剩余日间数：${remainingDays - 1}`);
                      }
                    }}
                    className="px-4 py-2 bg-purple-600 rounded-lg font-bold"
                    disabled={remainingDays === null || remainingDays <= 0}
                  >
                    -1
                  </button>
                </div>
              )}
              {/* 疯狂判定按钮（洗脑师相关） */}
              {cerenovusTarget && (
                <button
                  onClick={() => {
                    const target = seats.find(s => s.id === cerenovusTarget.targetId);
                    if (target) {
                      setShowMadnessCheckModal({
                        targetId: cerenovusTarget.targetId,
                        roleName: cerenovusTarget.roleName,
                        day: nightCount
                      });
                    }
                  }}
                  className="w-full mb-2 py-2 bg-purple-600 rounded-xl font-bold text-sm"
                >
                  🧠 检查 {cerenovusTarget.targetId + 1}号 是否疯狂扮演 {cerenovusTarget.roleName}
                </button>
              )}
              <button 
                onClick={handleDayEndTransition} 
                className="w-full py-3 bg-orange-600 rounded-xl font-bold text-base"
              >
                进入黄昏 (提名)
              </button>
            </>
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
      {showNightOrderModal && (
        <div className="fixed inset-0 z-[3200] bg-black/90 flex items-center justify-center px-4">
          <div className="bg-gray-900 border-4 border-yellow-500 rounded-2xl p-6 max-w-4xl w-full space-y-4 shadow-2xl max-h-[80vh] overflow-hidden">
            <div className="text-2xl font-bold text-yellow-300 text-center">🌙 今晚要叫醒的角色顺位表</div>
            <p className="text-sm text-gray-200 text-center">
              按首夜顺位排序，方便逐一叫醒。确认后进入首夜。
            </p>
            <div className="grid grid-cols-1 gap-3 max-h-[64vh] overflow-y-auto">
              {nightOrderPreview.map((item, idx) => (
                <div key={`${item.roleName}-${item.seatNo}-${idx}`} className="p-3 rounded-xl border border-gray-700 bg-gray-800/80 flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm text-gray-400">顺位 {item.order || '—'}</span>
                    <span className="text-base font-bold text-white">[{item.seatNo}号] {item.roleName}</span>
                  </div>
                  <span className="text-xs text-gray-500">第{idx + 1} 唤醒</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={closeNightOrderPreview}
                className="flex-1 py-3 rounded-xl bg-gray-700 text-gray-100 font-bold hover:bg-gray-600 transition"
              >
                返回调整
              </button>
              <button
                onClick={confirmNightOrderPreview}
                className="flex-1 py-3 rounded-xl bg-yellow-500 text-black font-bold hover:bg-yellow-400 transition"
              >
                确认，进入首夜
              </button>
            </div>
          </div>
        </div>
      )}
      {showMayorThreeAliveModal && (
        <div className="fixed inset-0 z-[3100] bg-black/90 flex items-center justify-center px-4">
          <div className="bg-gray-900 border-2 border-yellow-500 rounded-2xl p-6 max-w-xl w-full space-y-5 shadow-2xl">
            <h3 className="text-2xl font-bold text-yellow-300 text-center">⚠️ 市长 3 人存活提醒</h3>
            <div className="space-y-3 text-gray-100 text-base leading-relaxed">
              <p>现在只剩 3 名玩家存活，且场上有【市长 (Mayor)】。</p>
              <p>若今天最终没有任何玩家被处决，好人 (Good) 将直接获胜。</p>
              <div className="text-sm text-gray-200 space-y-1">
                <p className="text-gray-300">你可以选择：</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>继续本日处决流程；</li>
                  <li>或立即宣告好人获胜（若你已经决定今天不再处决任何人）。</li>
                </ul>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => {
                  setShowMayorThreeAliveModal(false);
                  enterDuskPhase();
                }}
                className="flex-1 py-3 bg-orange-600 rounded-xl font-bold hover:bg-orange-500 transition"
              >
                继续处决流程
              </button>
              <button
                onClick={declareMayorImmediateWin}
                className="flex-1 py-3 bg-green-600 rounded-xl font-bold hover:bg-green-500 transition"
              >
                宣告好人获胜
              </button>
            </div>
            <button
              onClick={() => setShowMayorThreeAliveModal(false)}
              className="w-full py-2 bg-gray-700 rounded-xl font-bold hover:bg-gray-600 transition text-sm"
            >
              先留在白天
            </button>
          </div>
        </div>
      )}
      {showDrunkModal!==null && (
        <div className="fixed inset-0 z-[3000] bg-black/95 flex items-center justify-center">
          <div className="bg-gray-800 p-8 rounded-2xl w-[800px] max-w-[95vw] border-2 border-yellow-500">
            <h2 className="mb-3 text-center text-3xl text-yellow-400">🍺 酒鬼伪装向导</h2>
            <div className="space-y-2 text-sm text-gray-200 mb-4">
              <p>请选择一张【镇民】卡作为酒鬼的伪装。选定后系统会自动记录为 charadeRole。</p>
              <p className="text-yellow-300">给玩家看的台词：请把「所选镇民卡」给该玩家看，并说“你是 {`<所选镇民>`}”。</p>
              <p className="text-gray-300">实际身份仍为【酒鬼】，后续信息系统会按中毒/酒鬼规则处理。</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[60vh] overflow-y-auto">
              {(filteredGroupedRoles['townsfolk'] || []).map(r=>{
                const isTaken = seats.some(s => s.role?.id === r.id);
                return (
                  <button 
                    key={r.id} 
                    onClick={()=>confirmDrunkCharade(r)} 
                    className={`p-3 border-2 rounded-xl text-base font-bold text-left ${
                      isTaken?'border-gray-600 bg-gray-900':'border-blue-500 hover:bg-blue-900'
                    }`}
                  >
                    <div className="flex flex-col">
                      <span>{r.name}</span>
                      {isTaken && <span className="text-xs text-gray-400 mt-1">（该角色已入座，也可重复用于伪装）</span>}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="mt-6 flex justify-end">
              <button 
                onClick={()=>setShowDrunkModal(null)}
                className="px-4 py-2 bg-gray-700 rounded-lg font-bold"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
      
      {showVoteInputModal!==null && (
        <div className="fixed inset-0 z-[3000] bg-black/90 flex items-center justify-center">
          <div className="bg-gray-800 p-8 rounded-2xl text-center border-2 border-blue-500 relative">
            <h3 className="text-3xl font-bold mb-4">🗳️ 输入票数</h3>
            <div className="mb-6 p-3 bg-yellow-900/30 border border-yellow-700/50 rounded-lg text-sm text-yellow-200">
              <p className="font-semibold">注意：请自行确保每名死亡玩家在本局只使用一次"死人票"。本工具不会替你追踪死人票次数。</p>
            </div>
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
            <div className="mb-4">
              <label className="flex items-center gap-2 text-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={voteRecords.some(r => r.voterId === showVoteInputModal && r.isDemon)}
                  onChange={(e) => {
                    const isDemon = e.target.checked;
                    setVoteRecords(prev => {
                      const filtered = prev.filter(r => r.voterId !== showVoteInputModal);
                      const newRecords = [...filtered, { voterId: showVoteInputModal, isDemon }];
                      // 更新 todayDemonVoted 状态
                      if (isDemon) {
                        setTodayDemonVoted(true);
                      } else {
                        // 检查是否还有其他恶魔投票
                        const hasOtherDemonVote = filtered.some(r => r.isDemon);
                        setTodayDemonVoted(hasOtherDemonVote);
                      }
                      return newRecords;
                    });
                  }}
                  className="w-5 h-5"
                />
                <span>投票者是恶魔（用于卖花女孩）</span>
              </label>
            </div>
            <button 
              onClick={()=>submitVotes(parseInt(voteInputValue)||0)} 
              className="w-full py-4 bg-indigo-600 rounded-xl text-2xl font-bold"
            >
              确认
            </button>
          </div>
        </div>
      )}
      
      {showRoleSelectModal && (
        <div className="fixed inset-0 z-[3000] bg-black/90 flex items-center justify-center">
          <div className="bg-gray-800 p-8 rounded-2xl text-center border-2 border-blue-500 max-w-4xl max-h-[80vh] overflow-y-auto">
            <h3 className="text-3xl font-bold mb-4">
              {showRoleSelectModal.type === 'philosopher' && '🎭 哲学家 - 选择善良角色'}
              {showRoleSelectModal.type === 'cerenovus' && '🧠 洗脑师 - 选择善良角色'}
              {showRoleSelectModal.type === 'pit_hag' && '🧙 麻脸巫婆 - 选择角色'}
            </h3>
            {showRoleSelectModal.type === 'pit_hag' && (
              <p className="text-sm text-gray-300 mb-3">
                当前剧本所有角色与座位号如下（仅供参考）：请先在主界面点选一名玩家作为目标，
                再在此选择一个<strong>当前场上尚未登场</strong>的角色身份，若合法则该玩家立刻变为该角色，并按夜晚顺位在本夜被叫醒。
              </p>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
              {roles
                .filter((r: Role) => {
                  if (showRoleSelectModal.type === 'philosopher' || showRoleSelectModal.type === 'cerenovus') {
                    return r.type === 'townsfolk' || r.type === 'outsider';
                  }
                  // 麻脸巫婆：仅显示当前剧本的角色，方便查阅
                  if (selectedScript) {
                    return r.script === selectedScript;
                  }
                  return true;
                })
                .map((role: Role) => {
                  const typeColor = typeColors[role.type] || 'border-gray-500 text-gray-400';
                  const typeBgColor = typeBgColors[role.type] || 'bg-gray-900/50 hover:bg-gray-800';
                  return (
                    <button
                      key={role.id}
                      onClick={() => {
                        showRoleSelectModal.onConfirm(role.id);
                      }}
                      className={`p-4 rounded-xl border-2 ${typeColor} ${typeBgColor} transition-all text-left`}
                    >
                      <div className="font-bold text-lg">{role.name}</div>
                      <div className="text-sm opacity-80 mt-1">{typeLabels[role.type]}</div>
                      <div className="text-xs opacity-60 mt-1 line-clamp-2">{role.ability}</div>
                    </button>
                  );
                })}
            </div>
            {showRoleSelectModal.type === 'pit_hag' && (
              <div className="mt-2 mb-4 text-left text-xs text-gray-300 max-h-40 overflow-y-auto border border-gray-700 rounded-xl p-3 bg-gray-900/60">
                <div className="font-bold mb-1">当前座位与角色一览：</div>
                {seats.map(s => (
                  <div key={s.id} className="flex justify-between">
                    <span>[{s.id + 1}号]</span>
                    <span className="ml-2 flex-1 text-right">
                      {getSeatRoleId(s) ? roles.find(r => r.id === getSeatRoleId(s))?.name || '未知角色' : '空位 / 未分配'}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => setShowRoleSelectModal(null)}
              className="w-full py-3 bg-gray-600 rounded-xl text-xl font-bold hover:bg-gray-500"
            >
              取消
            </button>
          </div>
        </div>
      )}
      
      {showMadnessCheckModal && (
        <div className="fixed inset-0 z-[3000] bg-black/90 flex items-center justify-center">
          <div className="bg-gray-800 p-8 rounded-2xl text-center border-2 border-purple-500 max-w-md">
            <h3 className="text-3xl font-bold mb-6">🧠 疯狂判定</h3>
            <div className="mb-6 text-left">
              <p className="mb-2">目标：{showMadnessCheckModal.targetId + 1}号</p>
              <p className="mb-2">要求扮演角色：{showMadnessCheckModal.roleName}</p>
              <p className="text-sm text-gray-400 mb-4">
                该玩家需要在白天和夜晚"疯狂"地证明自己是这个角色，否则可能被处决。
              </p>
            </div>
            <div className="flex gap-3 mb-4">
              <button
                onClick={() => {
                  addLog(`${showMadnessCheckModal.targetId + 1}号 疯狂判定：通过（正确扮演 ${showMadnessCheckModal.roleName}）`);
                  setShowMadnessCheckModal(null);
                }}
                className="flex-1 py-3 bg-green-600 rounded-xl font-bold text-lg"
              >
                通过
              </button>
              <button
                onClick={() => {
                  addLog(`${showMadnessCheckModal.targetId + 1}号 疯狂判定：失败（未正确扮演 ${showMadnessCheckModal.roleName}）`);
                  const target = seats.find(s => s.id === showMadnessCheckModal.targetId);
                  if (target && !target.isDead) {
                    // 如果判定失败，说书人可以决定是否处决
                    const shouldExecute = window.confirm(`是否处决 ${showMadnessCheckModal.targetId + 1}号？`);
                    if (shouldExecute) {
                      saveHistory();
                      executePlayer(showMadnessCheckModal.targetId);
                    }
                  }
                  setShowMadnessCheckModal(null);
                }}
                className="flex-1 py-3 bg-red-600 rounded-xl font-bold text-lg"
              >
                失败
              </button>
            </div>
            <button
              onClick={() => setShowMadnessCheckModal(null)}
              className="w-full py-2 bg-gray-600 rounded-xl font-bold hover:bg-gray-500"
            >
              取消
            </button>
          </div>
        </div>
      )}
      
      {showDayActionModal && (
        <div className="fixed inset-0 z-[3000] bg-black/80 flex items-center justify-center">
          <div className="bg-gray-800 p-8 rounded-2xl w-[500px] text-center">
            <h2 className="mb-6 text-3xl font-bold text-red-400">
              {showDayActionModal.type==='slayer'
                ? '💥 开枪'
                : showDayActionModal.type==='lunaticKill'
                  ? '🔪 精神病患者日杀'
                  : '🗣️ 提名'}
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
                const isDisabled = showDayActionModal?.type === 'nominate'
                  ? (nominationRecords.nominees.has(s.id) || nominationRecords.nominators.has(showDayActionModal.sourceId))
                  : showDayActionModal?.type === 'lunaticKill'
                    ? s.id === showDayActionModal.sourceId
                    : false;
                return (
                  <button 
                    key={s.id} 
                    onClick={()=>{
                      if (!isDisabled) {
                        if (showDayActionModal?.type === 'nominate' && s.role?.id === 'virgin') {
                          const nominatorSeat = seats.find(seat => seat.id === showDayActionModal.sourceId);
                          const isRealTownsfolk = !!(nominatorSeat &&
                            nominatorSeat.role?.type === 'townsfolk' &&
                            nominatorSeat.role?.id !== 'drunk' &&
                            !nominatorSeat.isDrunk);
                          setVirginGuideInfo({
                            targetId: s.id,
                            nominatorId: showDayActionModal.sourceId,
                            isFirstTime: !s.hasBeenNominated,
                            nominatorIsTownsfolk: isRealTownsfolk
                          });
                          setShowDayActionModal(null);
                          setShowNominateModal(null);
                          return;
                        }
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

      {virginGuideInfo && (() => {
        const target = seats.find(s => s.id === virginGuideInfo.targetId);
        const nominator = seats.find(s => s.id === virginGuideInfo.nominatorId);
        if (!target) return null;
        const isFirst = virginGuideInfo.isFirstTime;
        const nomIsTown = virginGuideInfo.nominatorIsTownsfolk;
        return (
          <div className="fixed inset-0 z-[3200] bg-black/80 flex items-center justify-center">
            <div className="bg-gray-900 p-8 rounded-2xl w-[620px] text-left space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-pink-200">贞洁者判定向导</h2>
                <span className="text-sm text-gray-400">
                  提名者：{nominator ? `${nominator.id + 1}号 ${nominator.role?.name || ''}` : '未知'}
                  {' · '}
                  目标：{target.id + 1}号 {target.role?.name || ''}
                </span>
              </div>

              <div className="space-y-2">
                <div className="text-lg font-semibold text-white">这是本局贞洁者第几次被提名？</div>
                <div className="flex gap-3">
                  <button
                    className={`flex-1 py-3 rounded-xl font-bold transition ${isFirst ? 'bg-pink-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}
                    onClick={() => setVirginGuideInfo(p => p ? { ...p, isFirstTime: true } : p)}
                  >
                    第一次
                  </button>
                  <button
                    className={`flex-1 py-3 rounded-xl font-bold transition ${!isFirst ? 'bg-pink-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}
                    onClick={() => setVirginGuideInfo(p => p ? { ...p, isFirstTime: false } : p)}
                  >
                    不是第一次
                  </button>
                </div>
              </div>

              {isFirst && (
                <div className="space-y-2">
                  <div className="text-lg font-semibold text-white">提名者是镇民 (Townsfolk) 吗？</div>
                  <div className="flex gap-3">
                    <button
                      className={`flex-1 py-3 rounded-xl font-bold transition ${nomIsTown ? 'bg-emerald-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}
                      onClick={() => setVirginGuideInfo(p => p ? { ...p, nominatorIsTownsfolk: true } : p)}
                    >
                      是镇民
                    </button>
                    <button
                      className={`flex-1 py-3 rounded-xl font-bold transition ${!nomIsTown ? 'bg-amber-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}
                      onClick={() => setVirginGuideInfo(p => p ? { ...p, nominatorIsTownsfolk: false } : p)}
                    >
                      不是镇民
                    </button>
                  </div>
                </div>
              )}

              <div className="bg-gray-800/80 rounded-xl p-4 text-sm leading-6 text-gray-200 space-y-2">
                {isFirst ? (
                  nomIsTown ? (
                    <>
                      <div>• 这是贞洁者第一次被提名，且提名者是镇民。</div>
                      <div>• 立刻处决提名者，而不是贞洁者。</div>
                      <div>• 公告台词示例： “因为你提名了贞洁者，你被立即处决。”</div>
                      <div>• 将贞洁者技能标记为已用，今后再被提名不再触发。</div>
                    </>
                  ) : (
                    <>
                      <div>• 这是贞洁者第一次被提名，但提名者不是镇民。</div>
                      <div>• 这次提名不产生额外处决。</div>
                      <div>• 贞洁者技能视为已用完（即使这次没有处决任何人）。</div>
                    </>
                  )
                ) : (
                  <>
                    <div>• 贞洁者已经被提名过，能力已失效。</div>
                    <div>• 这次提名按普通提名处理，不会再触发额外处决。</div>
                  </>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  className="flex-1 py-3 bg-pink-600 hover:bg-pink-500 rounded-xl font-bold text-white"
                  onClick={handleVirginGuideConfirm}
                >
                  按此指引继续提名
                </button>
                <button
                  className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-xl font-bold text-white"
                  onClick={() => setVirginGuideInfo(null)}
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {showDayAbilityModal && (() => {
        const { roleId, seatId } = showDayAbilityModal;
        const seat = seats.find(s => s.id === seatId);
        if (!seat) return null;
        const roleName = seat.role?.name || '';
        const closeModal = () => {
          setShowDayAbilityModal(null);
          setDayAbilityForm({});
        };
        const submit = () => {
          if (roleId === 'savant_mr') {
            if (!dayAbilityForm.info1 || !dayAbilityForm.info2) {
              alert('请填写两条信息（可真可假）。');
              return;
            }
            addLog(`${seat.id+1}号(博学者) 今日信息：${dayAbilityForm.info1} / ${dayAbilityForm.info2}`);
            setDayAbilityLogs(prev => [...prev, { id: seat.id, roleId, day: nightCount, text: `${dayAbilityForm.info1} / ${dayAbilityForm.info2}` }]);
            markDailyAbilityUsed('savant_mr', seat.id);
            closeModal();
            return;
          }
          if (roleId === 'amnesiac') {
            if (!dayAbilityForm.guess || !dayAbilityForm.feedback) {
              alert('请填写猜测和反馈。');
              return;
            }
            addLog(`${seat.id+1}号(失意者) 今日猜测：${dayAbilityForm.guess}；反馈：${dayAbilityForm.feedback}`);
            setDayAbilityLogs(prev => [...prev, { id: seat.id, roleId, day: nightCount, text: `猜测：${dayAbilityForm.guess}；反馈：${dayAbilityForm.feedback}` }]);
            markDailyAbilityUsed('amnesiac', seat.id);
            closeModal();
            return;
          }
          if (roleId === 'fisherman') {
            if (!dayAbilityForm.advice) {
              alert('请填写说书人提供的建议。');
              return;
            }
            addLog(`${seat.id+1}号(渔夫) 获得建议：${dayAbilityForm.advice}`);
            setDayAbilityLogs(prev => [...prev, { id: seat.id, roleId, day: nightCount, text: `建议：${dayAbilityForm.advice}` }]);
            markAbilityUsed('fisherman', seat.id);
            closeModal();
            return;
          }
          if (roleId === 'engineer') {
            const mode = dayAbilityForm.engineerMode;
            const newRoleId = dayAbilityForm.engineerRoleId;
            if (!mode) {
              alert('请选择改造目标（恶魔或爪牙）。');
              return;
            }
            if (!newRoleId) {
              alert('请选择要改造成为的角色。');
              return;
            }
            const newRole = roles.find(r => r.id === newRoleId);
            if (!newRole) return;
            if (mode === 'demon' && newRole.type !== 'demon') {
              alert('请选择一个恶魔角色。');
              return;
            }
            if (mode === 'minion' && newRole.type !== 'minion') {
              alert('请选择一个爪牙角色。');
              return;
            }
            if (mode === 'demon') {
              const demonSeat = seats.find(s => s.role?.type === 'demon' || s.isDemonSuccessor);
              if (!demonSeat) {
                alert('场上没有可改造的恶魔。');
                return;
              }
              setSeats(prev => prev.map(s => {
                if (s.id !== demonSeat.id) return s;
                return cleanseSeatStatuses({
                  ...s,
                  role: newRole,
                  charadeRole: null,
                }, { keepDeathState: true });
              }));
              addLog(`${seat.id+1}号(工程师) 将恶魔改造成 ${newRole.name}`);
              // 调整唤醒队列：如果当前在夜晚，将改造后的恶魔插入唤醒队列
              if (['night', 'firstNight'].includes(gamePhase)) {
                insertIntoWakeQueueAfterCurrent(demonSeat.id, { roleOverride: newRole, logLabel: `${demonSeat.id+1}号(${newRole.name})` });
              }
            } else {
              const minions = seats.filter(s => s.role?.type === 'minion');
              if (minions.length === 0) {
                alert('场上没有可改造的爪牙。');
                return;
              }
              setSeats(prev => prev.map(s => {
                if (s.role?.type !== 'minion') return s;
                return cleanseSeatStatuses({
                  ...s,
                  role: newRole,
                  charadeRole: null,
                }, { keepDeathState: true });
              }));
              addLog(`${seat.id+1}号(工程师) 将所有爪牙改造成 ${newRole.name}`);
              // 调整唤醒队列：如果当前在夜晚，将所有改造后的爪牙插入唤醒队列
              if (['night', 'firstNight'].includes(gamePhase)) {
                minions.forEach(m => {
                  insertIntoWakeQueueAfterCurrent(m.id, { roleOverride: newRole, logLabel: `${m.id+1}号(${newRole.name})` });
                });
              }
            }
            markAbilityUsed('engineer', seat.id);
            closeModal();
            return;
          }
        };
        return (
          <div className="fixed inset-0 z-[3200] bg-black/80 flex items-center justify-center px-4">
            <div className="bg-gray-900 border-4 border-blue-500 rounded-2xl p-6 max-w-2xl w-full space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-blue-200">🌞 {roleName} 日间能力</h2>
                <button className="text-gray-400 hover:text-white" onClick={closeModal}>✕</button>
              </div>
              {roleId === 'savant_mr' && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-300">填写两条信息（其中一真一假）。</p>
                  <textarea
                    className="w-full bg-gray-800 border border-gray-700 rounded p-2"
                    placeholder="信息1"
                    value={dayAbilityForm.info1 || ''}
                    onChange={e=>setDayAbilityForm(f=>({...f, info1: e.target.value}))}
                  />
                  <textarea
                    className="w-full bg-gray-800 border border-gray-700 rounded p-2"
                    placeholder="信息2"
                    value={dayAbilityForm.info2 || ''}
                    onChange={e=>setDayAbilityForm(f=>({...f, info2: e.target.value}))}
                  />
                </div>
              )}
              {roleId === 'amnesiac' && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-300">填写今天的猜测与说书人反馈。</p>
                  <textarea
                    className="w-full bg-gray-800 border border-gray-700 rounded p-2"
                    placeholder="你的猜测"
                    value={dayAbilityForm.guess || ''}
                    onChange={e=>setDayAbilityForm(f=>({...f, guess: e.target.value}))}
                  />
                  <textarea
                    className="w-full bg-gray-800 border border-gray-700 rounded p-2"
                    placeholder="说书人反馈"
                    value={dayAbilityForm.feedback || ''}
                    onChange={e=>setDayAbilityForm(f=>({...f, feedback: e.target.value}))}
                  />
                </div>
              )}
              {roleId === 'fisherman' && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-300">记录说书人给出的建议（一次性）。</p>
                  <textarea
                    className="w-full bg-gray-800 border border-gray-700 rounded p-2"
                    placeholder="建议内容"
                    value={dayAbilityForm.advice || ''}
                    onChange={e=>setDayAbilityForm(f=>({...f, advice: e.target.value}))}
                  />
                </div>
              )}
              {roleId === 'engineer' && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-300">选择改造恶魔或爪牙，并指定新的角色。</p>
                  <div className="flex gap-3">
                    <label className="flex items-center gap-2 text-gray-200 text-sm">
                      <input
                        type="radio"
                        checked={dayAbilityForm.engineerMode === 'demon'}
                        onChange={()=>setDayAbilityForm(f=>({...f, engineerMode: 'demon'}))}
                      />
                      改造恶魔
                    </label>
                    <label className="flex items-center gap-2 text-gray-200 text-sm">
                      <input
                        type="radio"
                        checked={dayAbilityForm.engineerMode === 'minion'}
                        onChange={()=>setDayAbilityForm(f=>({...f, engineerMode: 'minion'}))}
                      />
                      改造所有爪牙
                    </label>
                  </div>
                  <select
                    className="w-full bg-gray-800 border border-gray-700 rounded p-2"
                    value={dayAbilityForm.engineerRoleId || ''}
                    onChange={e=>setDayAbilityForm(f=>({...f, engineerRoleId: e.target.value || undefined}))}
                  >
                    <option value="">选择目标角色</option>
                    {(() => {
                      const usedRoleIds = new Set(
                        seats.map(s => getSeatRoleId(s)).filter(Boolean) as string[]
                      );
                      return roles
                        .filter(r => r.type === (dayAbilityForm.engineerMode === 'demon' ? 'demon' : dayAbilityForm.engineerMode === 'minion' ? 'minion' : undefined))
                        .filter(r => !usedRoleIds.has(r.id))
                        .map(r => (
                          <option key={r.id} value={r.id}>{r.name} ({r.type})</option>
                        ));
                    })()}
                  </select>
                </div>
              )}
              <div className="flex justify-end gap-3">
                <button className="px-4 py-2 bg-gray-700 rounded" onClick={closeModal}>取消</button>
                <button className="px-4 py-2 bg-blue-600 rounded font-bold" onClick={submit}>确认</button>
              </div>
            </div>
          </div>
        );
      })()}

      {showSaintExecutionConfirmModal && (
        <div className="fixed inset-0 z-[6500] bg-black/85 flex items-center justify-center px-4">
          <div className="bg-red-950 border-4 border-red-600 rounded-2xl shadow-2xl p-8 max-w-xl w-full space-y-4 text-center">
            <h2 className="text-3xl font-extrabold text-red-300">⚠️ 圣徒处决警告</h2>
            <p className="text-lg text-gray-100 font-semibold">你即将处决的是【圣徒 (Saint)】。</p>
            <p className="text-base text-red-100">一旦执行，其阵营立即失败，邪恶阵营立刻获胜。</p>
            <p className="text-sm text-red-200">若你确认要执行，请点击【确认处决圣徒并立即结束游戏】。</p>
            <div className="flex gap-4 justify-center pt-2">
              <button
                onClick={cancelSaintExecution}
                className="px-5 py-3 rounded-xl bg-gray-700 hover:bg-gray-600 text-gray-100 font-semibold"
              >
                取消
              </button>
              <button
                onClick={confirmSaintExecution}
                className="px-6 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-extrabold"
              >
                确认处决圣徒并立即结束游戏
              </button>
            </div>
          </div>
        </div>
      )}

      {showLunaticRpsModal && (
        <div className="fixed inset-0 z-[6000] bg-black/80 flex items-center justify-center">
          <div className="bg-gray-800 border-4 border-yellow-500 rounded-2xl p-8 max-w-md text-center space-y-4">
            <h2 className="text-3xl font-bold text-yellow-300">✊✋✌️ 精神病患者被处决：石头剪刀布裁决</h2>
            <p className="text-lg text-gray-200">
              【精神病患者被处决】——现在你需要与提名者进行一次“石头剪刀布”的裁决。
            </p>
            <p className="text-sm text-gray-400">
              提名者：{showLunaticRpsModal.nominatorId !== null ? `${showLunaticRpsModal.nominatorId+1}号` : '未知'} VS {showLunaticRpsModal.targetId+1}号(精神病患者)
            </p>
            <p className="text-sm text-gray-400">
              若精神病患者赢：他不死，提名他的人死亡；若精神病患者输：他才会被正常处决。
            </p>
            <div className="space-y-3">
              <button
                onClick={() => resolveLunaticRps(true)}
                className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold"
              >
                精神病患者输（被处决）
              </button>
              <button
                onClick={() => resolveLunaticRps(false)}
                className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold"
              >
                精神病患者赢/平（处决取消）
              </button>
            </div>
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

      {showStorytellerDeathModal && (
        <div className="fixed inset-0 z-[3200] bg-black/90 flex items-center justify-center">
          <div className="bg-gray-800 p-8 rounded-2xl w-[720px] border-2 border-red-500 text-center">
            <h2 className="text-3xl font-bold mb-4 text-red-300">📖 说书人决定今晚死亡</h2>
            <p className="text-lg text-gray-200 mb-2">
              麻脸巫婆造出新恶魔后，请指定今晚死亡的玩家（可选择“无人死亡”）。
            </p>
            <p className="text-sm text-red-300 mb-6">
              你通过麻脸巫婆创造了一个新恶魔。按规则，本晚通常必须有人死亡（除非你有意让这是一个特殊裁决）。
            </p>
            <div className="grid grid-cols-3 gap-3 max-h-[360px] overflow-y-auto mb-6">
              {seats
                .filter(s => !s.isDead)
                .map(s => (
                  <button
                    key={s.id}
                    onClick={() => confirmStorytellerDeath(s.id)}
                    className="p-3 border-2 border-red-400 rounded-xl text-lg font-bold hover:bg-red-900 transition-colors"
                  >
                    {s.id + 1}号 {s.role?.name ?? ''}
                  </button>
                ))}
            </div>
            <button
              onClick={() => confirmStorytellerDeath(null)}
              className="mt-2 px-6 py-3 rounded-xl bg-gray-700 hover:bg-gray-600 text-gray-100 font-bold"
            >
              本晚无人死亡（高级裁决）
            </button>
          </div>
        </div>
      )}

      {showSweetheartDrunkModal && (
        <div className="fixed inset-0 z-[3200] bg-black/90 flex items-center justify-center">
          <div className="bg-gray-800 p-8 rounded-2xl w-[720px] border-2 border-pink-500 text-center">
            <h2 className="text-3xl font-bold mb-4 text-pink-300">💕 心上人致醉</h2>
            <p className="text-lg text-gray-200 mb-6">请选择一名玩家，在今晚至次日黄昏期间醉酒。</p>
            <div className="grid grid-cols-3 gap-3 max-h-[360px] overflow-y-auto mb-6">
              {seats
                .filter(s => !s.isDead)
                .map(s => (
                  <button
                    key={s.id}
                    onClick={() => confirmSweetheartDrunk(s.id)}
                    className="p-3 border-2 border-pink-400 rounded-xl text-lg font-bold hover:bg-pink-900 transition-colors"
                  >
                    {s.id + 1}号 {s.role?.name ?? ''}
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {showKlutzChoiceModal && (
        <div className="fixed inset-0 z-[3200] bg-black/90 flex items-center justify-center">
          <div className="bg-gray-800 p-8 rounded-2xl w-[720px] border-2 border-yellow-500 text-center space-y-4">
            <h2 className="text-3xl font-bold text-yellow-200">🤪 呆瓜死亡判定</h2>
            <p className="text-lg text-gray-200">请选择一名存活玩家：若其为邪恶，善良阵营立即失败。</p>
            <div className="grid grid-cols-3 gap-3 max-h-[360px] overflow-y-auto">
              {seats.filter(s => !s.isDead && s.id !== showKlutzChoiceModal.sourceId).map(s => (
                <label key={s.id} className="flex items-center gap-2 bg-gray-900 border border-gray-700 rounded px-2 py-1">
                  <input
                    type="radio"
                    name="klutz-choice"
                    checked={klutzChoiceTarget === s.id}
                    onChange={()=>setKlutzChoiceTarget(s.id)}
                  />
                  <span>[{s.id+1}] {s.role?.name || '未知'}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-3 justify-end">
              <button className="px-4 py-2 bg-gray-700 rounded" onClick={() => {
                setShowKlutzChoiceModal(null);
                setKlutzChoiceTarget(null);
              }}>取消</button>
              <button className="px-4 py-2 bg-yellow-600 rounded font-bold" onClick={confirmKlutzChoice}>确认</button>
            </div>
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
            {winReason && winReason.includes('猎手') && (
              <p className="text-sm text-gray-500 mb-8">
                按照规则，游戏立即结束，不再进行今天的处决和后续夜晚。
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
        <div className={`fixed inset-0 z-[5000] bg-black/95 flex flex-col ${isPortrait ? 'p-4' : 'p-10'} overflow-auto`}>
          <div className={`flex justify-between items-center ${isPortrait ? 'mb-4' : 'mb-6'}`}>
              <h2 className={`${isPortrait ? 'text-2xl' : 'text-4xl'}`}>📜 对局复盘</h2>
            <button 
              onClick={()=>setShowReviewModal(false)} 
              className={`${isPortrait ? 'px-4 py-1.5 text-sm' : 'px-6 py-2 text-lg'} bg-gray-700 hover:bg-gray-600 rounded`}
            >
              关闭
            </button>
          </div>
          <div className={`bg-black/50 ${isPortrait ? 'p-3' : 'p-6'} rounded-xl ${isPortrait ? 'flex-col' : 'flex'} gap-6 ${isPortrait ? 'min-h-[calc(100vh-8rem)]' : 'h-[calc(100vh-12rem)]'}`}>
            <div className={`${isPortrait ? 'w-full' : 'w-1/3'}`}>
              <h4 className={`text-purple-400 ${isPortrait ? 'mb-2 text-sm' : 'mb-4 text-xl'} font-bold border-b pb-2`}>📖 当前座位信息</h4>
              <div className={`space-y-2 ${isPortrait ? 'max-h-64' : 'max-h-[calc(100vh-16rem)]'} overflow-y-auto`}>
                {seats.filter(s=>s.role).map(s => (
                  <div key={s.id} className={`py-2 border-b border-gray-700 flex justify-between items-center ${isPortrait ? 'text-xs' : ''}`}>
                    <span className="font-bold">{s.id+1}号</span>
                    <div className="flex flex-col items-end">
                      <span className={s.role?.type==='demon'?'text-red-500 font-bold':s.role?.type==='minion'?'text-orange-500':'text-blue-400'}>
                        {s.role?.name}
                        {s.role?.id==='drunk'&&` (伪:${s.charadeRole?.name})`}
                        {s.isRedHerring && ' [红罗刹]'}
                      </span>
                      {s.isDead && <span className={`${isPortrait ? 'text-[10px]' : 'text-xs'} text-gray-500 mt-1`}>💀 已死亡</span>}
                      {s.isPoisoned && <span className={`${isPortrait ? 'text-[10px]' : 'text-xs'} text-green-500 mt-1`}>🧪 中毒</span>}
                      {s.isProtected && <span className={`${isPortrait ? 'text-[10px]' : 'text-xs'} text-blue-500 mt-1`}>🛡️ 受保护</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className={`${isPortrait ? 'w-full' : 'w-2/3'}`}>
              <h4 className={`text-yellow-400 ${isPortrait ? 'mb-2 text-sm' : 'mb-4 text-xl'} font-bold border-b pb-2`}>📋 操作记录</h4>
              <div className={`space-y-4 ${isPortrait ? 'max-h-96' : 'max-h-[calc(100vh-16rem)]'} overflow-y-auto`}>
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
                      <div key={key} className={`mb-4 bg-gray-900/50 ${isPortrait ? 'p-2' : 'p-4'} rounded-lg`}>
                        <div className={`text-yellow-300 font-bold ${isPortrait ? 'mb-2 text-sm' : 'mb-3 text-lg'} border-b border-yellow-500/30 pb-2`}>
                          {phaseName}
                        </div>
                        <div className="space-y-2">
                          {logs.map((l, i) => (
                            <div key={i} className={`py-2 border-b border-gray-700 text-gray-300 ${isPortrait ? 'text-xs' : 'text-sm'} pl-2`}>
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
        <div className={`fixed inset-0 z-[5000] bg-black/95 flex flex-col ${isPortrait ? 'p-4' : 'p-10'} overflow-auto`}>
          <div className={`flex justify-between items-center ${isPortrait ? 'mb-4' : 'mb-6'}`}>
            <h2 className={`${isPortrait ? 'text-2xl' : 'text-4xl'}`}>📚 对局记录</h2>
            <button 
              onClick={()=>setShowGameRecordsModal(false)} 
              className={`${isPortrait ? 'px-4 py-1.5 text-sm' : 'px-6 py-2 text-lg'} bg-gray-700 hover:bg-gray-600 rounded`}
            >
              关闭
            </button>
          </div>
          <div className={`space-y-4 ${isPortrait ? 'max-h-[calc(100vh-6rem)]' : 'max-h-[calc(100vh-8rem)]'} overflow-y-auto`}>
            {gameRecords.length === 0 ? (
              <div className={`text-center text-gray-500 ${isPortrait ? 'py-10' : 'py-20'}`}>
                <p className={`${isPortrait ? 'text-xl' : 'text-2xl'} mb-4`}>暂无对局记录</p>
                <p className={`${isPortrait ? 'text-xs' : 'text-sm'}`}>完成游戏后，记录会自动保存到这里</p>
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
                  <div key={record.id} className={`bg-gray-900/50 ${isPortrait ? 'p-3' : 'p-6'} rounded-xl border border-gray-700`}>
                    <div className={`flex ${isPortrait ? 'flex-col' : 'justify-between'} items-start ${isPortrait ? 'gap-3' : 'mb-4'}`}>
                      <div>
                        <h3 className={`${isPortrait ? 'text-lg' : 'text-2xl'} font-bold text-white ${isPortrait ? 'mb-1' : 'mb-2'}`}>{record.scriptName}</h3>
                        <div className={`${isPortrait ? 'text-xs' : 'text-sm'} text-gray-400 space-y-1`}>
                          <p>开始时间：{startTimeStr}</p>
                          <p>结束时间：{endTimeStr}</p>
                          <p>游戏时长：{durationStr}</p>
                        </div>
                      </div>
                      <div className={`${isPortrait ? 'text-sm' : 'text-xl'} font-bold ${isPortrait ? 'px-3 py-1.5' : 'px-4 py-2'} rounded ${
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
                      <p className={`${isPortrait ? 'text-xs' : 'text-sm'} text-gray-300 ${isPortrait ? 'mb-3' : 'mb-4'}`}>
                        {record.winResult ? '胜利依据' : '结束原因'}：{record.winReason}
                      </p>
                    )}
                    
                    <div className={`grid ${isPortrait ? 'grid-cols-1' : 'grid-cols-2'} ${isPortrait ? 'gap-4' : 'gap-6'} ${isPortrait ? 'mt-4' : 'mt-6'}`}>
                      <div>
                        <h4 className={`text-purple-400 ${isPortrait ? 'mb-2 text-sm' : 'mb-3'} font-bold border-b pb-2`}>📖 座位信息</h4>
                        <div className={`space-y-2 ${isPortrait ? 'max-h-48' : 'max-h-64'} overflow-y-auto`}>
                          {record.seats.filter(s=>s.role).map(s => (
                            <div key={s.id} className="py-1 border-b border-gray-700 flex justify-between items-center text-sm">
                              <span className="font-bold">{s.id+1}号</span>
                              <div className="flex flex-col items-end gap-1">
                                <span className={s.role?.type==='demon'?'text-red-500 font-bold':s.role?.type==='minion'?'text-orange-500':'text-blue-400'}>
                                  {s.role?.name}
                                  {s.role?.id==='drunk'&&` (伪:${s.charadeRole?.name})`}
                                  {s.isRedHerring && ' [红罗刹]'}
                                </span>
                                <div className="flex flex-wrap gap-1 justify-end text-[11px] leading-tight">
                                  {s.isDead && <span className="px-2 py-0.5 rounded bg-gray-700 text-gray-300 border border-gray-600">💀 已死亡</span>}
                                  {s.isPoisoned && <span className="px-2 py-0.5 rounded bg-green-900/60 text-green-200 border border-green-700">🧪 中毒</span>}
                                  {s.isProtected && <span className="px-2 py-0.5 rounded bg-blue-900/60 text-blue-200 border border-blue-700">🛡️ 受保护</span>}
                                  {s.statusDetails?.map(st => (
                                    <span key={st} className={`px-2 py-0.5 rounded bg-gray-800/80 text-yellow-200 border border-gray-600 ${st.includes('投毒') ? 'whitespace-nowrap' : ''}`}>{st}</span>
                                  ))}
                                  {s.hasUsedSlayerAbility && <span className="px-2 py-0.5 rounded bg-red-900/70 text-red-100 border border-red-700">猎手已用</span>}
                                  {s.hasUsedVirginAbility && <span className="px-2 py-0.5 rounded bg-purple-900/70 text-purple-100 border border-purple-700">处女失效</span>}
                                  {s.hasAbilityEvenDead && <span className="px-2 py-0.5 rounded bg-green-900/70 text-green-100 border border-green-700">死而有能</span>}
                                  {s.isDemonSuccessor && <span className="px-2 py-0.5 rounded bg-red-800/80 text-white border border-red-700">恶魔（传）</span>}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      <div>
                        <h4 className={`text-yellow-400 ${isPortrait ? 'mb-2 text-sm' : 'mb-3'} font-bold border-b pb-2`}>📋 操作记录</h4>
                        <div className={`space-y-3 ${isPortrait ? 'max-h-48' : 'max-h-64'} overflow-y-auto`}>
                          {sortedLogs.map(([key, logs]) => {
                            const [day, phase] = key.split('_');
                            const phaseName = 
                              phase === 'firstNight' ? '第1夜' : 
                              phase === 'night' ? `第${day}夜` :
                              phase === 'day' ? `第${day}天` :
                              phase === 'dusk' ? `第${day}天黄昏` : `第${day}轮`;
                            
                            return (
                              <div key={key} className={`bg-gray-800/50 ${isPortrait ? 'p-1.5' : 'p-2'} rounded ${isPortrait ? 'text-[10px]' : 'text-xs'}`}>
                                <div className={`text-yellow-300 font-bold ${isPortrait ? 'mb-0.5 text-[10px]' : 'mb-1'}`}>{phaseName}</div>
                                <div className="space-y-1">
                                  {logs.map((l, i) => (
                                    <div key={i} className={`text-gray-300 pl-2 ${isPortrait ? 'text-[10px]' : 'text-xs'}`}>
                                      {l.message}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                          {record.gameLogs.length === 0 && (
                            <div className={`text-gray-500 text-center py-4 ${isPortrait ? 'text-xs' : 'text-sm'}`}>暂无操作记录</div>
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

      {showRoleInfoModal && (() => {
        // 获取角色的行动时间说明
        const getActionTimeDescription = (role: Role): string => {
          if (role.firstNight && role.otherNight) {
            return "首夜与其他夜晚行动";
          } else if (role.firstNight && !role.otherNight) {
            return "仅首夜行动";
          } else if (!role.firstNight && role.otherNight) {
            return "其他夜晚行动";
          } else {
            return "无夜晚行动";
          }
        };

        // 如果选择了剧本，分成两部分：本剧本角色和其他角色
        const currentScriptRoles = selectedScript ? filteredGroupedRoles : {};
        const otherRoles = selectedScript ? (() => {
          const currentScriptRoleIds = new Set(
            Object.values(filteredGroupedRoles).flat().map(r => r.id)
          );
          const other = roles.filter(r => !currentScriptRoleIds.has(r.id));
          return other.reduce((acc, role) => {
            if (!acc[role.type]) acc[role.type] = [];
            acc[role.type].push(role);
            return acc;
          }, {} as Record<string, Role[]>);
        })() : groupedRoles;

        const renderRoleSection = (title: string, rolesToShow: Record<string, Role[]>, isSticky: boolean = false) => (
          <div className="space-y-8">
            {title && (
              <h2 
                className={`text-3xl font-bold text-yellow-400 mb-4 ${
                  isSticky ? 'sticky z-20 bg-black/95 py-3 -mt-6 -mx-8 px-8 border-b border-yellow-400/30 backdrop-blur-sm shadow-lg' : ''
                }`}
                style={isSticky ? { top: '0px' } : undefined}
              >
                {title}
              </h2>
            )}
            {Object.entries(rolesToShow).map(([type, roleList]) => (
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
                      <div className="text-sm text-gray-300 leading-relaxed mb-2">
                        {role.ability}
                      </div>
                      <div className="mt-3 pt-3 border-t border-gray-700 text-xs text-gray-400">
                        {getActionTimeDescription(role)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );

        return (
          <div className="fixed inset-0 z-[5000] bg-black/95 flex flex-col overflow-hidden">
            {/* 永久置顶的标题栏 */}
            <div className="sticky top-0 z-30 bg-black/95 border-b border-gray-700 px-8 py-6 flex-shrink-0" id="role-info-header">
              <div className="flex justify-between items-center">
                <h2 className="text-4xl">📖 角色信息</h2>
                <button 
                  onClick={()=>setShowRoleInfoModal(false)} 
                  className="px-6 py-2 bg-gray-700 hover:bg-gray-600 rounded text-lg"
                >
                  确认
                </button>
              </div>
            </div>
            {/* 可滚动的内容区域 */}
            <div className="flex-1 overflow-y-auto">
              <div className="px-8 py-6 space-y-12">
                {selectedScript && Object.keys(currentScriptRoles).length > 0 && (
                  renderRoleSection("🎯 正在进行中的剧本角色", currentScriptRoles, true)
                )}
                {Object.keys(otherRoles).length > 0 && (
                  renderRoleSection(selectedScript ? "📚 其他剧本角色" : "", otherRoles, selectedScript ? true : false)
                )}
              </div>
            </div>
          </div>
        );
      })()}

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
          {/* 爪牙白天猜测落难少女 */}
          {gamePhase === 'day' && targetSeat.role?.type === 'minion' && !targetSeat.isDead && seats.some(s => s.role?.id === 'damsel') && (
            <button
              onClick={()=>handleMenuAction('damselGuess')}
              disabled={damselGuessUsedBy.includes(targetSeat.id)}
              className={`block w-full text-left px-6 py-3 text-lg font-medium border-t border-gray-700 ${
                damselGuessUsedBy.includes(targetSeat.id)
                  ? 'text-gray-500 cursor-not-allowed bg-gray-800'
                  : 'hover:bg-pink-900 text-pink-300'
              }`}
            >
              🎯 猜测落难少女
            </button>
          )}
          <button 
            onClick={()=>toggleStatus('dead')} 
            className="block w-full text-left px-6 py-3 hover:bg-gray-700 text-lg font-medium"
          >
            💀 切换死亡
          </button>
          {/* 在核对身份阶段，允许选择红罗刹（仅限善良阵营），爪牙和恶魔为灰色不可选，且需要场上有占卜师 */}
          {gamePhase === 'check' && targetSeat.role && (() => {
            const hasFortuneTeller = seats.some(s => s.role?.id === "fortune_teller");
            const isDisabled = ['minion','demon'].includes(targetSeat.role.type) || !hasFortuneTeller;
            return (
              <button
                onClick={()=>!isDisabled && toggleStatus('redherring', targetSeat.id)}
                disabled={isDisabled}
                className={`block w-full text-left px-6 py-3 text-lg font-medium border-t border-gray-700 whitespace-nowrap ${
                  isDisabled
                    ? 'text-gray-500 cursor-not-allowed bg-gray-800'
                    : 'hover:bg-red-900 text-red-300'
                }`}
              >
                🎭 选为红罗刹
              </button>
            );
          })()}
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

      {/* 麻脸巫婆变更角色弹窗 */}
      {showPitHagModal && (
        <div className="fixed inset-0 z-[5000] bg-black/80 flex items-center justify-center px-4">
          <div className="bg-gray-800 border-4 border-purple-500 rounded-2xl p-6 max-w-xl w-full space-y-4">
            <h2 className="text-3xl font-bold text-purple-300">麻脸巫婆：变更角色</h2>
            <div className="text-gray-200">
              目标：{showPitHagModal.targetId !== null ? `${showPitHagModal.targetId+1}号` : '未选择'}
            </div>
            <div className="text-xs text-purple-300">
              麻脸巫婆只能将玩家变成本局尚未登场的角色。已在场的角色不会出现在列表中。
            </div>
            <select
              className="w-full bg-gray-900 border border-gray-600 rounded p-2"
              value={showPitHagModal.roleId || ''}
              onChange={(e)=>setShowPitHagModal(m=> m ? ({...m, roleId: e.target.value}) : m)}
            >
              <option value="">选择新角色</option>
              {(() => {
                const usedRoleIds = new Set(
                  seats.map(s => getSeatRoleId(s)).filter(Boolean) as string[]
                );
                return roles
                  .filter(r => !usedRoleIds.has(r.id))
                  .map(r=>(
                    <option key={r.id} value={r.id}>{r.name} ({r.type})</option>
                  ));
              })()}
            </select>
            <div className="flex gap-3 justify-end">
              <button className="px-4 py-2 bg-gray-700 rounded" onClick={()=>setShowPitHagModal(null)}>取消</button>
              <button className="px-4 py-2 bg-green-600 rounded" onClick={()=>{
                // 保持弹窗打开，由“确认/下一步”执行实际变更
                setShowPitHagModal(m=>m ? m : null);
              }}>已选择，继续</button>
            </div>
            <div className="text-xs text-gray-400">选择角色后，点击右下角“确认/下一步”完成本次行动。</div>
          </div>
        </div>
      )}

      {/* 巡山人：落难少女变身 */}
      {showRangerModal && (
        <div className="fixed inset-0 z-[5000] bg-black/80 flex items-center justify-center px-4">
          <div className="bg-gray-800 border-4 border-green-500 rounded-2xl p-6 max-w-xl w-full space-y-4">
            <h2 className="text-3xl font-bold text-green-300">巡山人：为落难少女选择新镇民</h2>
            <div className="text-gray-200 mb-2">
              目标：{showRangerModal.targetId+1}号(落难少女) — 必须为其选择当前剧本的镇民角色（已在场镇民不可选，不可取消）
            </div>
            <select
              className="w-full bg-gray-900 border border-gray-600 rounded p-2"
              value={showRangerModal.roleId ?? ''}
              onChange={e=>setShowRangerModal(m => m ? ({...m, roleId: e.target.value || null}) : m)}
            >
              <option value="">选择不在场的镇民角色</option>
              {(() => {
                const usedRoleIds = new Set(seats.map(s => getSeatRoleId(s)).filter(Boolean) as string[]);
                const townsfolk = roles
                  .filter(r => r.type === 'townsfolk')
                  .filter(r => {
                    if (!selectedScript) return true;
                    return (
                      r.script === selectedScript.name ||
                      (selectedScript.id === 'trouble_brewing' && !r.script) ||
                      (selectedScript.id === 'bad_moon_rising' && (!r.script || r.script === '暗月初升')) ||
                      (selectedScript.id === 'sects_and_violets' && (!r.script || r.script === '梦陨春宵')) ||
                      (selectedScript.id === 'midnight_revelry' && (!r.script || r.script === '夜半狂欢'))
                    );
                  });
                return townsfolk.map(r => {
                  const disabled = usedRoleIds.has(r.id);
                  return (
                    <option
                      key={r.id}
                      value={r.id}
                      disabled={disabled}
                      className={disabled ? 'text-gray-400' : ''}
                    >
                      {r.name}{disabled ? '（已在场）' : ''}
                    </option>
                  );
                });
              })()}
            </select>
            <div className="flex gap-3 justify-end">
              <button className="px-4 py-2 bg-green-600 rounded font-bold" onClick={()=>{
                if (!showRangerModal?.roleId) {
                  alert('必须选择一个未在场的镇民角色');
                  return;
                }
                const newRole = roles.find(r => r.id === showRangerModal.roleId && r.type === 'townsfolk');
                if (!newRole) {
                  alert('角色无效，请重新选择');
                  return;
                }
                const targetId = showRangerModal.targetId;
                setSeats(prev => prev.map(s => {
                  if (s.id !== targetId) return s;
                  const swapped = cleanseSeatStatuses({
                    ...s,
                    role: newRole,
                    charadeRole: null,
                    isDemonSuccessor: false,
                  }, { keepDeathState: true });
                  return swapped;
                }));
                addLog(`巡山人将 ${showRangerModal.targetId+1}号(落难少女) 变为 ${newRole.name}`);
                insertIntoWakeQueueAfterCurrent(showRangerModal.targetId, { roleOverride: newRole, logLabel: `${showRangerModal.targetId+1}号(${newRole.name})` });
                setShowRangerModal(null);
                continueToNextAction();
              }}>确定</button>
            </div>
          </div>
        </div>
      )}

      {/* 爪牙猜测落难少女 */}
      {showDamselGuessModal && (
        <div className="fixed inset-0 z-[5000] bg-black/80 flex items-center justify-center px-4">
          <div className="bg-gray-800 border-4 border-pink-500 rounded-2xl p-6 max-w-xl w-full space-y-4">
            <h2 className="text-3xl font-bold text-pink-300">爪牙猜测落难少女</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <select
                className="w-full bg-gray-900 border border-gray-700 rounded p-2"
                value={showDamselGuessModal.minionId ?? ''}
                onChange={e=>setShowDamselGuessModal(m => m ? ({...m, minionId: e.target.value===''?null:Number(e.target.value)}) : m)}
              >
                <option value="">选择爪牙</option>
                {seats.filter(s => s.role?.type === 'minion' && !s.isDead && !damselGuessUsedBy.includes(s.id)).map(s=>(
                  <option key={s.id} value={s.id}>[{s.id+1}] {s.role?.name}</option>
                ))}
              </select>
              <select
                className="w-full bg-gray-900 border border-gray-700 rounded p-2"
                value={showDamselGuessModal.targetId ?? ''}
                onChange={e=>setShowDamselGuessModal(m => m ? ({...m, targetId: e.target.value===''?null:Number(e.target.value)}) : m)}
              >
                <option value="">选择被猜测的玩家</option>
                {seats.filter(s => !s.isDead && (showDamselGuessModal.minionId === null || s.id !== showDamselGuessModal.minionId)).map(s=>(
                  <option key={s.id} value={s.id}>[{s.id+1}] {s.role?.name}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-3 justify-end">
              <button className="px-4 py-2 bg-gray-700 rounded" onClick={()=>setShowDamselGuessModal(null)}>取消</button>
              <button className="px-4 py-2 bg-pink-600 rounded" onClick={()=>{
                if (showDamselGuessModal.minionId === null || showDamselGuessModal.targetId === null) return;
                const minionId = showDamselGuessModal.minionId;
                const guessSeat = seats.find(s => s.id === showDamselGuessModal.targetId);
                const isCorrect = guessSeat?.role?.id === 'damsel' && !guessSeat.isDead;
                setShowDamselGuessModal(null);
                setDamselGuessUsedBy(prev => prev.includes(minionId) ? prev : [...prev, minionId]);
                if (isCorrect) {
                  setDamselGuessed(true);
                  setWinResult('evil');
                  setWinReason('爪牙猜中落难少女');
                  setGamePhase('gameOver');
                  addLog(`爪牙猜测成功：${showDamselGuessModal.targetId+1}号是落难少女，邪恶获胜`);
                } else {
                  const updatedSeats = seats.map(s => s.id === minionId ? { ...s, isDead: true, isSentenced: false } : s);
                  setSeats(updatedSeats);
                  addLog(`${minionId+1}号爪牙猜错落难少女，当场死亡。`);
                  addLog(`爪牙猜测失败：${showDamselGuessModal.targetId+1}号不是落难少女`);
                  checkGameOver(updatedSeats, minionId);
                }
              }}>确认猜测</button>
            </div>
          </div>
        </div>
      )}

      {/* 灵言师触发关键词转换 */}
      {showShamanConvertModal && (
        <div className="fixed inset-0 z-[5000] bg-black/80 flex items-center justify-center px-4">
          <div className="bg-gray-800 border-4 border-purple-500 rounded-2xl p-6 max-w-xl w-full space-y-4">
            <h2 className="text-3xl font-bold text-purple-300">灵言师：关键词被说出</h2>
            <div className="text-gray-200 text-sm">
              请选择第一个公开说出关键词的玩家：若他是善良阵营（镇民/外来者），当晚起被视为邪恶；若本就是邪恶，则不产生额外效果。
            </div>
            <select
              className="w-full bg-gray-900 border border-gray-700 rounded p-2"
              value={shamanConvertTarget ?? ''}
              onChange={e=>setShamanConvertTarget(e.target.value===''?null:Number(e.target.value))}
            >
              <option value="">选择玩家</option>
              {seats.filter(s => !s.isDead).map(s=>(
                <option key={s.id} value={s.id}>[{s.id+1}] {s.role?.name}</option>
              ))}
            </select>
            <div className="flex gap-3 justify-end">
              <button className="px-4 py-2 bg-gray-700 rounded" onClick={()=>{setShowShamanConvertModal(false);setShamanConvertTarget(null);}}>取消</button>
              <button className="px-4 py-2 bg-purple-600 rounded" onClick={()=>{
                if (shamanConvertTarget === null) return;
                const target = seats.find(s => s.id === shamanConvertTarget);
                if (!target || target.isDead) return;
                const isGoodNow = isGoodAlignment(target);
                if (!isGoodNow) {
                  addLog(`灵言师关键词触发检查：${shamanConvertTarget+1}号本就为邪恶阵营，未产生额外效果`);
                  setShamanTriggered(true);
                  setShowShamanConvertModal(false);
                  setShamanConvertTarget(null);
                  return;
                }
                setSeats(prev => prev.map(s => {
                  if (s.id !== shamanConvertTarget) return s;
                  const next = cleanseSeatStatuses({ ...s, isEvilConverted: true }, { keepDeathState: true });
                  const details = Array.from(new Set([...(next.statusDetails || []), '灵言转邪']));
                  return { ...next, statusDetails: details };
                }));
                addLog(`灵言师关键词触发：${shamanConvertTarget+1}号公开说出关键词，从今晚开始被视为邪恶阵营`);
                insertIntoWakeQueueAfterCurrent(shamanConvertTarget, { logLabel: `${shamanConvertTarget+1}号(转邪恶)` });
                setShamanTriggered(true);
                setShowShamanConvertModal(false);
                setShamanConvertTarget(null);
              }}>确认转换</button>
            </div>
          </div>
        </div>
      )}

      {/* 理发师交换角色弹窗 */}
      {showBarberSwapModal && (
        <div className="fixed inset-0 z-[5000] bg-black/80 flex items-center justify-center px-4">
          <div className="bg-gray-800 border-4 border-blue-500 rounded-2xl p-6 max-w-xl w-full space-y-4">
            <h2 className="text-3xl font-bold text-blue-300">理发师：交换两名玩家角色</h2>
            <div className="text-sm text-gray-300">恶魔（参考）：{showBarberSwapModal.demonId+1}号</div>
            <select
              className="w-full bg-gray-900 border border-gray-600 rounded p-2"
              value={showBarberSwapModal.firstId ?? ''}
              onChange={(e)=>setShowBarberSwapModal(m=> m ? ({...m, firstId: e.target.value===''?null:Number(e.target.value)}) : m)}
            >
              <option value="">选择玩家A</option>
              {seats.filter(s=>s.role?.type !== 'demon' && !s.isDemonSuccessor).map(s=>(
                <option key={s.id} value={s.id}>[{s.id+1}] {s.role?.name}</option>
              ))}
            </select>
            <select
              className="w-full bg-gray-900 border border-gray-600 rounded p-2"
              value={showBarberSwapModal.secondId ?? ''}
              onChange={(e)=>setShowBarberSwapModal(m=> m ? ({...m, secondId: e.target.value===''?null:Number(e.target.value)}) : m)}
            >
              <option value="">选择玩家B</option>
              {seats.filter(s=>s.role?.type !== 'demon' && !s.isDemonSuccessor).map(s=>(
                <option key={s.id} value={s.id}>[{s.id+1}] {s.role?.name}</option>
              ))}
            </select>
            <div className="flex gap-3 justify-end">
              <button className="px-4 py-2 bg-gray-700 rounded" onClick={()=>setShowBarberSwapModal(null)}>取消</button>
              <button className="px-4 py-2 bg-indigo-600 rounded" onClick={()=>{
                if (showBarberSwapModal.firstId === null || showBarberSwapModal.secondId === null || showBarberSwapModal.firstId === showBarberSwapModal.secondId) return;
                const aId = showBarberSwapModal.firstId;
                const bId = showBarberSwapModal.secondId;
                const aSeat = seats.find(s => s.id === aId);
                const bSeat = seats.find(s => s.id === bId);
                if (!aSeat || !bSeat) return;
                const aRole = aSeat.role;
                const bRole = bSeat.role;
                setSeats(prev => prev.map(s => {
                  if (s.id === aId) {
                    const swapped = cleanseSeatStatuses({ ...s, role: bRole, charadeRole: null, isDemonSuccessor: false }, { keepDeathState: true });
                    return swapped;
                  }
                  if (s.id === bId) {
                    const swapped = cleanseSeatStatuses({ ...s, role: aRole, charadeRole: null, isDemonSuccessor: false }, { keepDeathState: true });
                    return swapped;
                  }
                  return s;
                }));
                addLog(`理发师触发：交换了 ${aId+1}号 与 ${bId+1}号 的角色`);
                // 调整唤醒队列：如果当前在夜晚，将交换后的两名玩家插入唤醒队列
                if (['night', 'firstNight'].includes(gamePhase)) {
                  if (aRole && (aRole.firstNightOrder > 0 || aRole.otherNightOrder > 0)) {
                    insertIntoWakeQueueAfterCurrent(aId, { roleOverride: aRole, logLabel: `${aId+1}号(${aRole.name})` });
                  }
                  if (bRole && (bRole.firstNightOrder > 0 || bRole.otherNightOrder > 0)) {
                    insertIntoWakeQueueAfterCurrent(bId, { roleOverride: bRole, logLabel: `${bId+1}号(${bRole.name})` });
                  }
                }
                setShowBarberSwapModal(null);
              }}>确认交换</button>
            </div>
          </div>
        </div>
      )}

      {/* 哈迪寂亚选择三人并决定处决 */}
      {showHadesiaKillConfirmModal && (() => {
        const baseSeats = showHadesiaKillConfirmModal.map(id => seats.find(s => s.id === id)).filter(Boolean) as Seat[];
        return (
          <div className="fixed inset-0 z-[5000] bg-black/80 flex items-center justify-center px-4">
            <div className="bg-gray-800 border-4 border-red-500 rounded-2xl p-6 max-w-3xl w-full space-y-4">
              <h2 className="text-3xl font-bold text-red-300">哈迪寂亚：决定命运</h2>
              <div className="text-gray-200">为三名玩家分别选择“生”或“死”。若三人都选“生”，则三人全部死亡。</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {showHadesiaKillConfirmModal.map(id => {
                  const seat = seats.find(s => s.id === id);
                  const choice = hadesiaChoices[id] || 'live';
                  return (
                    <div key={id} className="bg-gray-900 border border-gray-700 rounded px-3 py-2 space-y-2">
                      <div className="flex items-center justify-between text-white font-bold">
                        <span>[{id+1}] {seat?.role?.name || '未知'}</span>
                        {seat?.isDead ? <span className="text-red-300 text-xs">已死</span> : <span className="text-green-300 text-xs">存活</span>}
                      </div>
                      <div className="flex gap-3 text-sm text-white">
                        <label className="flex items-center gap-1">
                          <input
                            type="radio"
                            checked={choice === 'live'}
                            onChange={()=>setHadesiaChoice(id, 'live')}
                          />
                          生
                        </label>
                        <label className="flex items-center gap-1">
                          <input
                            type="radio"
                            checked={choice === 'die'}
                            onChange={()=>setHadesiaChoice(id, 'die')}
                          />
                          死
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="text-sm text-yellow-200 bg-yellow-900/30 p-3 rounded border border-yellow-600">
                规则：如果三名玩家全部选择“生”，则三人全部死亡；否则仅选择“死”的玩家立即死亡。
              </div>
              <div className="flex gap-3 justify-end">
                <button className="px-4 py-2 bg-gray-700 rounded" onClick={()=>{
                  setShowHadesiaKillConfirmModal(null);
                  setHadesiaChoices({});
                  setSelectedActionTargets([]);
                }}>取消</button>
                <button className="px-4 py-2 bg-red-600 rounded font-bold" onClick={confirmHadesia}>确定</button>
              </div>
            </div>
          </div>
        );
      })()}

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

      {/* 伪装身份识别浮窗 */}
      {showSpyDisguiseModal && (() => {
        const spySeats = seats.filter(s => s.role?.id === 'spy');
        const recluseSeats = seats.filter(s => s.role?.id === 'recluse');
        const chefSeat = seats.find(s => s.role?.id === 'chef');
        const empathSeat = seats.find(s => s.role?.id === 'empath');
        const investigatorSeat = seats.find(s => s.role?.id === 'investigator');
        const fortuneTellerSeat = seats.find(s => s.role?.id === 'fortune_teller');
        const hasInterferenceRoles = (spySeats.length > 0 || recluseSeats.length > 0) && 
                                    (chefSeat || empathSeat || investigatorSeat || fortuneTellerSeat);
        
        return (
          <div 
            className="fixed inset-0 z-[5000] bg-black/50 flex items-center justify-center"
            onClick={() => setShowSpyDisguiseModal(false)}
          >
            <div 
              className="bg-gray-800 border-2 border-purple-500 rounded-xl p-4 w-80 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-lg font-bold text-purple-300">🎭 伪装身份识别</h3>
                <button
                  onClick={() => setShowSpyDisguiseModal(false)}
                  className="text-gray-400 hover:text-white text-xl"
                >
                  ×
                </button>
              </div>
              
              {hasInterferenceRoles ? (
                <div className="space-y-3 text-sm">
                  {spySeats.length > 0 && (
                    <div>
                      <div className="text-xs text-gray-400 mb-1">间谍：</div>
                      {spySeats.map(s => (
                        <div key={s.id} className="text-gray-300 ml-2">{s.id + 1}号</div>
                      ))}
                    </div>
                  )}
                  {recluseSeats.length > 0 && (
                    <div>
                      <div className="text-xs text-gray-400 mb-1">隐士：</div>
                      {recluseSeats.map(s => (
                        <div key={s.id} className="text-gray-300 ml-2">{s.id + 1}号</div>
                      ))}
                    </div>
                  )}
                  <div className="pt-2 border-t border-gray-700">
                    <div className="text-xs text-gray-400 mb-2">干扰模式：</div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setSpyDisguiseMode('off')}
                        className={`flex-1 py-1.5 px-2 text-xs rounded ${
                          spyDisguiseMode === 'off' 
                            ? 'bg-red-600 text-white' 
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        关闭
                      </button>
                      <button
                        onClick={() => setSpyDisguiseMode('default')}
                        className={`flex-1 py-1.5 px-2 text-xs rounded ${
                          spyDisguiseMode === 'default' 
                            ? 'bg-blue-600 text-white' 
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        默认
                      </button>
                      <button
                        onClick={() => setSpyDisguiseMode('on')}
                        className={`flex-1 py-1.5 px-2 text-xs rounded ${
                          spyDisguiseMode === 'on' 
                            ? 'bg-green-600 text-white' 
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        开启
                      </button>
                    </div>
                  </div>
                  {spyDisguiseMode === 'on' && (
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-300 flex-shrink-0">概率：</label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={spyDisguiseProbability * 100}
                        onChange={(e) => setSpyDisguiseProbability(parseInt(e.target.value) / 100)}
                        className="flex-1"
                      />
                      <span className="text-xs text-gray-300 w-10 text-right">
                        {Math.round(spyDisguiseProbability * 100)}%
                      </span>
                    </div>
                  )}
                  {spyDisguiseMode === 'default' && (
                    <div className="text-xs text-gray-400">
                      默认概率：80%
                    </div>
                  )}
                  {(chefSeat || empathSeat || investigatorSeat || fortuneTellerSeat) && (
                    <div className="text-xs text-gray-400 pt-2 border-t border-gray-700">
                      受影响角色：{chefSeat && '厨师'} {chefSeat && (empathSeat || investigatorSeat || fortuneTellerSeat) && '、'}
                      {empathSeat && '共情者'} {(chefSeat || empathSeat) && (investigatorSeat || fortuneTellerSeat) && '、'}
                      {investigatorSeat && '调查员'} {(chefSeat || empathSeat || investigatorSeat) && fortuneTellerSeat && '、'}
                      {fortuneTellerSeat && '占卜师'}
                    </div>
                  )}
                  {(() => {
                    const infoViewers = [
                      { id: 'washerwoman', name: '洗衣妇' },
                      { id: 'investigator', name: '调查员' },
                      { id: 'chef', name: '厨师' },
                      { id: 'empath', name: '共情者' },
                      { id: 'fortune_teller', name: '占卜师' },
                    ].map(v => {
                      const seat = seats.find(s => s.role?.id === v.id);
                      return seat?.role ? { ...v, role: seat.role } : null;
                    }).filter(Boolean) as Array<{id: string; name: string; role: Role}>;
                    const affected = seats.filter(s => s.role && (s.role.id === 'spy' || s.role.id === 'recluse'));
                    const typeLabels: Record<RoleType, string> = { townsfolk: '镇民', outsider: '外来者', minion: '爪牙', demon: '恶魔' };
                    if (affected.length === 0 || infoViewers.length === 0) return null;
                    return (
                      <div className="mt-3 border-t border-gray-700 pt-2 text-xs text-gray-300 space-y-2">
                        <div className="text-purple-300 font-semibold">🧾 注册结果（仅说书人可见）</div>
                        {affected.map(target => (
                          <div key={target.id} className="bg-gray-750 rounded p-2 border border-gray-700">
                            <div className="font-medium mb-1">{target.id + 1}号【{target.role?.name || '未知'}】</div>
                            <div className="space-y-1">
                              {infoViewers.map(viewer => {
                                const reg = getRegistrationCached(target, viewer.role);
                                const typeText = reg.roleType ? typeLabels[reg.roleType] || reg.roleType : '无类型';
                                const status = reg.registersAsDemon
                                  ? '视为恶魔'
                                  : reg.registersAsMinion
                                    ? '视为爪牙'
                                    : `阵营=${reg.alignment === 'Evil' ? '邪恶' : '善良'}, 类型=${typeText}`;
                                return (
                                  <div key={`${viewer.id}-${target.id}`} className="flex items-center justify-between gap-2">
                                    <span className="text-gray-400">在【{viewer.name}】眼中</span>
                                    <span className="text-white">{status}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="text-sm text-gray-400 text-center py-4">
                  当前无需要伪装身份识别的角色
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

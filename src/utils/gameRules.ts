import { Role, Seat, StatusEffect, RoleType } from '../../app/data';

// ======================================================================
//  座位位置计算
// ======================================================================

export const getSeatPosition = (index: number, total: number = 15, isPortrait: boolean = false) => {
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

// ======================================================================
//  随机工具函数
// ======================================================================

export const getRandom = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// ======================================================================
//  注册判定相关（用于查验类技能）
// ======================================================================

// 获取玩家的注册阵营（用于查验类技能）
// 间谍：虽然是爪牙，但可以被注册为"Good"（善良）
// 隐士：虽然是外来者，但可以被注册为"Evil"（邪恶）
// viewingRole: 执行查验的角色，用于判断是否需要应用注册判定
export type RegistrationCacheOptions = {
  cache?: Map<string, RegistrationResult>;
  cacheKey?: string;
};

// 统一的身份注册判定：返回"此刻在查看者眼中"的阵营/类型
// 包含隐士/间谍的干扰效果，并在一次调用内保持一致的随机结果
export type RegistrationResult = {
  alignment: 'Good' | 'Evil';
  roleType: RoleType | null;
  registersAsDemon: boolean;
  registersAsMinion: boolean;
};

export const buildRegistrationCacheKey = (
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

export const getRegistration = (
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

export const getRegisteredAlignment = (
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

// ======================================================================
//  中毒判定相关
// ======================================================================

// 统一计算中毒来源（永久、亡骨魔、普卡、日毒、状态标记）
export const getPoisonSources = (seat: Seat) => {
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

export const computeIsPoisoned = (seat: Seat) => {
  const src = getPoisonSources(seat);
  return src.permanent || src.vigormortis || src.pukka || src.dayPoison || 
         src.noDashii || src.cannibal || src.snakeCharmer || 
         src.statusPoison || src.direct || src.anyMark;
};

// 统一添加中毒标记（带清除时间）
export const addPoisonMark = (
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

// ======================================================================
//  阵营判定
// ======================================================================

// 判断玩家是否为邪恶阵营（真实阵营）
export const isEvil = (seat: Seat): boolean => {
  if (!seat.role) return false;
  if (seat.isGoodConverted) return false;
  return seat.isEvilConverted === true ||
         seat.role.type === 'demon' || 
         seat.role.type === 'minion' || 
         seat.isDemonSuccessor ||
         (seat.role.id === 'recluse' && Math.random() < 0.3);
};

export const isGoodAlignment = (seat: Seat): boolean => {
  if (!seat.role) return false;
  const roleType = seat.role.type;
  if (seat.isEvilConverted) return false;
  if (seat.isGoodConverted) return true;
  return roleType !== 'demon' && roleType !== 'minion' && !seat.isDemonSuccessor;
};

// ======================================================================
//  邻居相关
// ======================================================================

export const getAliveNeighbors = (allSeats: Seat[], targetId: number): Seat[] => {
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

// ======================================================================
//  假信息判定和生成
// ======================================================================

// 判断是否应该显示假信息（根据中毒/酒鬼状态和概率）
// 返回true表示应该显示假信息，false表示显示真信息
// 规则调整：
// - 酒鬼的「单次」夜晚信息（只在首夜或只在某一夜触发）必定为假
// - 酒鬼的「每晚」信息：第一次必定为假，之后每次有 50% 概率为假
export const shouldShowFakeInfo = (
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

  // 先处理中毒：与酒鬼并存时，仍优先按中毒概率处理
  if (isPoisoned && !isDrunk) {
    // 中毒状态：95%假，5%真
    return { showFake: Math.random() < 0.95, isFirstTime: false };
  } else if (isPoisoned && isDrunk) {
    // 同时中毒和酒鬼：优先按中毒处理（95%假，5%真）
    return { showFake: Math.random() < 0.95, isFirstTime: false };
  }

  // 仅酒鬼、不中毒时：根据伪装角色/自身角色的夜晚行动频率来决定
  if (isDrunk) {
    const effectiveRole = targetSeat.role?.id === "drunk"
      ? targetSeat.charadeRole
      : targetSeat.role;

    // 如果没有可用的有效角色信息，退化为：第一次必假，之后 50% 假
    if (!effectiveRole) {
      const isFirstTimeFallback = !drunkFirstInfoMap.has(targetSeat.id);
      if (isFirstTimeFallback) {
        drunkFirstInfoMap.set(targetSeat.id, true);
        return { showFake: true, isFirstTime: true };
      }
      return { showFake: Math.random() < 0.5, isFirstTime: false };
    }

    const isSingleUseInfo =
      !!effectiveRole.firstNight && !effectiveRole.otherNight;
    const isEveryNightInfo = !!effectiveRole.otherNight;

    if (isSingleUseInfo) {
      // 单次信息：酒鬼时该次信息必定为假
      return { showFake: true, isFirstTime: true };
    }

    if (isEveryNightInfo) {
      // 每晚信息：第一次必定为假，之后 50% 概率为假
      const isFirstTime = !drunkFirstInfoMap.has(targetSeat.id);
      if (isFirstTime) {
        drunkFirstInfoMap.set(targetSeat.id, true);
        return { showFake: true, isFirstTime: true };
      }
      return { showFake: Math.random() < 0.5, isFirstTime: false };
    }

    // 其他未分类情况：退化为「第一次必假，之后 50% 假」
    const isFirstTimeDefault = !drunkFirstInfoMap.has(targetSeat.id);
    if (isFirstTimeDefault) {
      drunkFirstInfoMap.set(targetSeat.id, true);
      return { showFake: true, isFirstTime: true };
    }
    return { showFake: Math.random() < 0.5, isFirstTime: false };
  }

  // 健康状态：显示真信息
  return { showFake: false, isFirstTime: false };
};

// 生成误导性错误信息（用于中毒/酒鬼状态）
// 根据真实结果生成合理的错误信息，而不是简单的随机值
export const getMisinformation = {
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


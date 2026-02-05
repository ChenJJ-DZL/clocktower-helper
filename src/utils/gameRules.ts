import { Role, Seat, StatusEffect, RoleType } from '../../app/data';
import { getJinx } from './jinxUtils';

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
//  能力与状态检查
// ======================================================================

/**
 * 检查角色能力是否处于激活状态
 * 规则来源：重要细节.json
 * 1. 死亡玩家立即失去能力（除非有"死亡时触发"或"即使死亡"标记）
 * 2. 醉酒/中毒玩家失去能力（但可能不知道）
 */
export const isAbilityActive = (seat: Seat, isFirstNight: boolean = false): boolean => {
  if (!seat.role) return false;

  // 1. 检查死亡状态
  // 如果角色已死亡，且没有特殊的死后能力标记，则能力失效
  // 注意：部分角色如守鸦人、贤者是在死亡"时"触发，这里视为在触发瞬间是有效的，或者由触发逻辑单独处理。
  // 此函数主要用于持续性效果检查（如“保护”、“中毒”持续效果）。
  if (seat.isDead && !seat.hasAbilityEvenDead) {
    return false;
  }

  // 2. 检查醉酒/中毒
  if (computeIsPoisoned(seat) || seat.isDrunk || seat.role.id === 'drunk') {
    return false;
  }

  return true;
};

/**
 * 检查是否受到因死亡/醉酒/中毒而立即终止的限制
 */
export const validateAbilityUsage = (seat: Seat): { isValid: boolean; reason?: string } => {
  if (seat.isDead && !seat.hasAbilityEvenDead) return { isValid: false, reason: '已死亡' };
  if (seat.isDrunk) return { isValid: false, reason: '醉酒' };
  if (computeIsPoisoned(seat)) return { isValid: false, reason: '中毒' };
  return { isValid: true };
}

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
  // 基准阵营注册（包含红罗刹判定）
  let registeredAlignment: 'Good' | 'Evil' =
    registeredRoleType === 'demon' || registeredRoleType === 'minion' ? 'Evil' : 'Good';

  // 灵言师等效果转换为邪恶阵营时，保持原角色类型但阵营视为邪恶
  if (targetPlayer.isEvilConverted) {
    registeredAlignment = 'Evil';
  }

  // 占卜师红罗刹判定：红罗刹始终注册为恶魔（邪恶）
  const isRedHerring = targetPlayer.isRedHerring || targetPlayer.isFortuneTellerRedHerring;
  if (isRedHerring) {
    registeredAlignment = 'Evil';
    registeredRoleType = 'demon';
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
    // 只有在被查验阵营或类型时才触发注册判定
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

/**
 * 占卜师核心判定逻辑
 * 规则：如果两名目标中至少有一名是恶魔（即便醉酒/中毒），则返回“是”，否则返回“否”。
 * 注意：红罗刹被视为恶魔。
 */
export const isFortuneTellerTarget = (
  targetPlayer: Seat,
  options?: RegistrationCacheOptions
): boolean => {
  // 占卜师查验需要特殊逻辑：只看是否注册为恶魔
  // 注意：占卜师查看爪牙应该返回“否”，除非该爪牙是红罗刹或因为其他规则注册为恶魔
  const reg = getRegistration(targetPlayer, { id: 'fortune_teller' } as Role, 'default', 0.8, options);
  return reg.registersAsDemon;
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
  poisonType: 'permanent' | 'vigormortis' | 'pukka' | 'poisoner' | 'poisoner_mr' | 'no_dashii' | 'cannibal' | 'snake_charmer' | 'widow',
  clearTime: string
): { statusDetails: string[], statuses: StatusEffect[] } => {
  const details = seat.statusDetails || [];
  const statuses = seat.statuses || [];

  let markText = '';
  switch (poisonType) {
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
    case 'widow':
      markText = `寡妇中毒（${clearTime}清除）`;
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
    } else if (poisonType === 'widow') {
      return !d.includes('寡妇中毒');
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
    seat.isDemonSuccessor;
};

export const isGoodAlignment = (seat: Seat): boolean => {
  if (!seat.role) return false;
  const roleType = seat.role.type;
  if (seat.isEvilConverted) return false;
  if (seat.isGoodConverted) return true;
  return roleType !== 'demon' && roleType !== 'minion' && !seat.isDemonSuccessor;
};

/**
 * 检查红唇女郎是否触发变身
 * 规则：如果恶魔死亡且场上存活玩家 >= 5，红唇女郎立即变成恶魔
 */
export const shouldScarletWomanTransform = (allSeats: Seat[], deadPlayerId?: number): Seat | null => {
  const alivePlayers = allSeats.filter(s => !s.isDead);
  if (alivePlayers.length < 5) return null;

  // 检查是否有活着的恶魔
  const hasAliveDemon = allSeats.some(s =>
    !s.isDead && (s.role?.type === 'demon' || s.isDemonSuccessor)
  );
  if (hasAliveDemon) return null;

  // 查找符合条件的红唇女郎
  const sw = allSeats.find(s =>
    !s.isDead && s.role?.id === 'scarlet_woman' && !s.isDemonSuccessor
  );

  return sw || null;
};

export type WinResult = { side: 'good' | 'evil'; reason: string } | null;

/**
 * 核心胜利条件判断
 * 规则来源：游戏简要规则.json
 * 1. 善良获胜：所有恶魔均死亡。
 * 2. 邪恶获胜：场上仅剩 2 名存活玩家（除旅行者）。
 * 3. 平局处理：如果两个阵营同时达成胜利条件，善良阵营获胜。
 * 4. 角色干扰：红唇女郎、镜像双子、圣徒、市长、涡流等。
 */
export const checkWinCondition = (
  allSeats: Seat[],
  options: {
    executedPlayerId?: number | null;
    evilTwinPair?: { goodId: number; evilId: number } | null;
    isVortoxWorld?: boolean;
    isEndOfDay?: boolean; // 是否处于黄昏结算（用于市长、涡流判定）
    damselGuessed?: boolean; // 新增：爪牙猜中落难少女
    klutzGuessedEvil?: boolean; // 新增：呆瓜误判
  } = {}
): WinResult => {
  const { executedPlayerId = null, evilTwinPair, isVortoxWorld, isEndOfDay, damselGuessed, klutzGuessedEvil } = options;

  // 0. 特殊即时胜利/失败触发
  if (damselGuessed) {
    return { side: 'evil', reason: '爪牙猜中落难少女' };
  }
  if (klutzGuessedEvil) {
    return { side: 'evil', reason: '呆瓜误判' };
  }

  const alivePlayers = allSeats.filter(s => !s.isDead);
  const aliveCorePlayers = alivePlayers.filter(s => s.role?.type !== 'traveler');
  const aliveCount = aliveCorePlayers.length;

  // 1. 获取存活恶魔数量
  const aliveDemons = allSeats.filter(s =>
    !s.isDead && (s.role?.type === 'demon' || s.isDemonSuccessor)
  );

  // --- 特殊能力限制 ---
  // 镜像双子：只要邪恶双子还活着且善良双子也活着，善良阵营不能通过杀死恶魔获胜
  let goodCanWinByKillingDemon = true;
  if (evilTwinPair) {
    const evilTwin = allSeats.find(s => s.id === evilTwinPair.evilId);
    const goodTwin = allSeats.find(s => s.id === evilTwinPair.goodId);
    if (evilTwin && !evilTwin.isDead && goodTwin && !goodTwin.isDead) {
      goodCanWinByKillingDemon = false;
    }
  }

  // --- A. 善良阵营胜利判定 (优先级最高，用于处理平局) ---

  // 1. 所有恶魔死亡
  if (aliveDemons.length === 0 && goodCanWinByKillingDemon) {
    return { side: 'good', reason: '恶魔全部死亡' };
  }

  // 2. 市长特殊获胜（黄昏阶段且无人被处决且仅剩3人）
  if (isEndOfDay && executedPlayerId === null && aliveCount === 3) {
    const aliveMayor = alivePlayers.find(s => s.role?.id === 'mayor' && !isActorDisabledByPoisonOrDrunk(s));
    if (aliveMayor) {
      return { side: 'good', reason: '市长特殊获胜' };
    }
  }

  // --- B. 邪恶阵营胜利判定 ---

  // 1. 圣徒被处决 (且未中毒醉酒)
  if (executedPlayerId !== null && executedPlayerId !== undefined) {
    const executedPlayer = allSeats.find(s => s.id === executedPlayerId);
    if (executedPlayer && executedPlayer.role?.id === 'saint' && !isActorDisabledByPoisonOrDrunk(executedPlayer)) {
      return { side: 'evil', reason: '圣徒被处决' };
    }
  }

  // 2. 善良双子被处决
  if (executedPlayerId !== null && executedPlayerId !== undefined && evilTwinPair) {
    if (executedPlayerId === evilTwinPair.goodId) {
      return { side: 'evil', reason: '善良双子被处决' };
    }
  }

  // 3. 仅剩 2 名存活玩家 (不计旅行者)
  if (aliveCount <= 2) {
    return { side: 'evil', reason: '仅剩 2 名玩家' };
  }

  // 4. 涡流：黄昏时无人被处决
  if (isVortoxWorld && isEndOfDay && executedPlayerId === null) {
    return { side: 'evil', reason: '涡流：今日无人被处决' };
  }

  return null;
};

// ======================================================================
//  邻居相关
// ======================================================================

/**
 * 获取玩家的存活邻居（跳过死者）
 * 在血染钟楼中，大部分角色的“邻居”定义为物理位置上最近的存活玩家
 */
export const getAliveNeighbors = (allSeats: Seat[], targetId: number): Seat[] => {
  const total = allSeats.length;
  if (total <= 1) return [];

  const originIndex = allSeats.findIndex((s) => s.id === targetId);
  if (originIndex === -1) return [];

  const neighbors: Seat[] = [];

  // 找左边的第一个活人
  for (let i = 1; i < total; i++) {
    const idx = (originIndex - i + total) % total;
    const s = allSeats[idx];
    if (!s.isDead) {
      neighbors.push(s);
      break;
    }
  }

  // 找右边的第一个活人
  for (let i = 1; i < total; i++) {
    const idx = (originIndex + i) % total;
    const s = allSeats[idx];
    if (!s.isDead) {
      // 避免在人数极少时重复添加同一个邻居
      if (!neighbors.some(n => n.id === s.id)) {
        neighbors.push(s);
      }
      break;
    }
  }

  return neighbors;
};

/**
 * 清除角色状态（用于黄昏/夜晚结算等时机）
 * 处理中毒、醉酒、受保护等状态的自然失效
 */
export const clearRoleStatus = (seat: Seat, time: string): Seat => {
  const nextSeat = { ...seat };

  // 1. 清理 statusDetails 中带当前清除标记的内容
  if (nextSeat.statusDetails) {
    const pattern = new RegExp(`（${time}清除）`);
    nextSeat.statusDetails = nextSeat.statusDetails.filter(d => !pattern.test(d));
  }

  // 2. 清理 statuses 数组中已到期的状态
  if (nextSeat.statuses) {
    nextSeat.statuses = nextSeat.statuses.filter(st => st.duration !== time && st.duration !== 'expired');
  }

  // 3. 处理手动标记位 (isPoisoned/isDrunk 如果是由带清除标记的详情触发的，需要联动)
  // 注意：这里逻辑需要谨慎，通常由 computeIsPoisoned 实时计算更好
  // 但为了兼容现有 UI 状态显示，这里做一下基础重置
  if (time === '黄昏' || time === '夜晚结算') {
    nextSeat.isProtected = false;
    nextSeat.protectedBy = null;
  }

  return nextSeat;
};

/**
 * 查找镇长死亡时的弹射目标
 * 规则：如果镇长在夜晚被杀且未中毒/醉酒，说书人可以选择一名其他玩家代替其死亡。
 */
export const getMayorRedirectTarget = (allSeats: Seat[], mayorId: number): Seat | null => {
  const mayor = allSeats.find(s => s.id === mayorId);
  if (!mayor || isActorDisabledByPoisonOrDrunk(mayor)) return null;

  const otherAlivePlayers = allSeats.filter(s => !s.isDead && s.id !== mayorId);
  if (otherAlivePlayers.length === 0) return null;

  // 随机选择一个作为建议（实际由说书人决定）
  return getRandom(otherAlivePlayers);
};

/**
 * 判断是否应触发男爵的阵容调整
 * 规则：男爵在场时，减少2个镇民，增加2个外来者
 */
export const canApplyBaronSetup = (allSeats: Seat[]): boolean => {
  return allSeats.some(s => s.role?.id === 'baron');
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

// ======================================================================
//  查茶女保护判定
// ======================================================================

/**
 * 检查玩家是否受到查茶女保护
 * 规则：如果查茶女的两名存活邻居都是善良阵营，则查茶女及其邻居都不会死亡。
 * 
 * @param targetSeat 目标玩家的座位对象
 * @param seats 所有座位的数组
 * @returns 如果目标玩家受到查茶女保护则返回 true，否则返回 false
 */
export function hasTeaLadyProtection(targetSeat: Seat, seats: Seat[]): boolean {
  if (!targetSeat || !targetSeat.role) return false;

  // 查找所有查茶女
  const teaLadies = seats.filter(s =>
    s.role?.id === 'tea_lady' &&
    !s.isDead &&
    isGoodAlignment(s)
  );

  // 对每个查茶女检查其邻居
  for (const teaLady of teaLadies) {
    const neighbors = getAliveNeighbors(seats, teaLady.id);

    // 查茶女必须有两个存活邻居
    if (neighbors.length < 2) continue;

    // 检查两个邻居是否都是善良阵营
    const bothNeighborsGood = neighbors.every(neighbor => isGoodAlignment(neighbor));

    if (bothNeighborsGood) {
      // 如果目标玩家是查茶女或其邻居，则受到保护
      if (targetSeat.id === teaLady.id || neighbors.some(n => n.id === targetSeat.id)) {
        return true;
      }
    }
  }

  return false;
}

// ======================================================================
//  行动与失效判定
// ======================================================================

/**
 * 判断行为人是否因为中毒或醉酒而致其能力失效
 * @param seat 目标玩家座位
 * @param knownByNightAction 是否已知中毒（可选）
 */
export function isActorDisabledByPoisonOrDrunk(seat: Seat | undefined, knownByNightAction?: boolean): boolean {
  if (!seat) return false;
  return !!knownByNightAction || computeIsPoisoned(seat) || seat.isDrunk || seat.role?.id === 'drunk';
}

/**
 * 判断角色是否具有夜晚主动能力（需要手动确认生效的操作）
 */
export function isActionAbility(role?: Role | null): boolean {
  if (!role) return false;
  // 按照游戏规则，大部分这些角色在夜晚被唤醒是有主动选择/确认操作的
  // 简化版：只要不是空且有夜晚描述
  return !!(role.firstNight || role.otherNight);
}


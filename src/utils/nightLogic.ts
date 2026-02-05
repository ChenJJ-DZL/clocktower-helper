import type { Seat, Role, GamePhase, LogEntry, Script, RoleType } from '../../app/data';
import type { TimelineStep } from '../types/game';
import {
  computeIsPoisoned,
  getPoisonSources,
  getRegistration,
  getRandom,
  isEvil,
  shouldShowFakeInfo,
  getMisinformation,
  type RegistrationResult,
  type RegistrationCacheOptions
} from './gameRules';
import { roles } from '../../app/data';
import troubleBrewingRolesData from '../data/rolesData.json';

export const calculateNightInfo = (
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
  registrationCache?: Map<string, RegistrationResult>,
  registrationCacheKey?: string,
  vortoxWorld?: boolean,
  demonVotedToday?: boolean,
  minionNominatedToday?: boolean,
  executedToday?: number | null,
  hasUsedAbilityFn?: (roleId: string, seatId: number) => boolean,
  votedThisRound?: number[], // NEW: List of seat IDs who voted this round (for Flowergirl/Town Crier)
  outsiderDiedToday?: boolean // NEW: for Godfather/Gossip extra death triggers
): { seat: Seat; effectiveRole: Role; isPoisoned: boolean; reason?: string; guide: string; speak: string; action: string; logMessage?: string } | null => {
  // 使用传入的判定函数，如果没有则使用默认的isEvil
  const checkEvil = isEvilWithJudgmentFn || isEvil;
  const isFirstNight = gamePhase === 'firstNight';
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
      traveler: "旅人",
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

  // === Perceived role helper (Spy/Recluse can "register as" a concrete role token) ===
  // getRegistration() already gives alignment + roleType. For roles that *see a role token*
  // (Washerwoman/Librarian/Investigator/Undertaker), TB spec requires Spy/Recluse can appear
  // as a specific Townsfolk/Outsider/Minion/Demon role. We choose one from the script pool
  // and cache it so it stays stable within the same calculation pass.
  const getRolePoolByType = (type: RoleType): Role[] => {
    const all = roles.filter((r) => r.type === type && !r.hidden);
    if (!selectedScript) return all;
    return all.filter((r) => {
      return (
        !r.script ||
        r.script === selectedScript.name ||
        (selectedScript.id === 'trouble_brewing' && !r.script) ||
        (selectedScript.id === 'bad_moon_rising' && (!r.script || r.script === '暗月初升')) ||
        (selectedScript.id === 'sects_and_violets' && (!r.script || r.script === '梦陨春宵')) ||
        (selectedScript.id === 'midnight_revelry' && (!r.script || r.script === '夜半狂欢'))
      );
    });
  };

  const getPerceivedRoleForViewer = (
    target: Seat,
    viewer: Role,
    expectedType?: RoleType
  ): { perceivedRole: Role | null; perceivedType: RoleType | null } => {
    if (!target.role) return { perceivedRole: null, perceivedType: null };

    const reg = getCachedRegistration(target, viewer);
    const regType = reg.roleType ?? target.role.type;

    if (expectedType && regType !== expectedType) {
      return { perceivedRole: null, perceivedType: regType };
    }

    // Normal roles: show real role token.
    if (target.role.id !== 'spy' && target.role.id !== 'recluse') {
      return { perceivedRole: target.role, perceivedType: target.role.type };
    }

    const perceivedType = expectedType ?? regType;
    const cache = (registrationCache as unknown as Map<string, any>) ?? new Map<string, any>();
    const keyBase =
      (registrationCacheKey ?? 'local') +
      `-perceivedRole-t${target.id}-v${viewer.id}-as${perceivedType}`;

    const cached = cache.get(keyBase) as Role | undefined;
    if (cached) return { perceivedRole: cached, perceivedType };

    const pool = getRolePoolByType(perceivedType);
    const pool2 = pool.filter((r) => r.id !== viewer.id);
    const picked: Role | null =
      pool2.length > 0 ? getRandom(pool2) : pool.length > 0 ? getRandom(pool) : null;

    if (picked) cache.set(keyBase, picked);
    return { perceivedRole: picked, perceivedType };
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

  // 创建用于厨师/共情者查验的判断函数，考虑间谍和隐士的注册判定
  const checkEvilForChefEmpath = (seat: Seat): boolean => {
    const registration = getCachedRegistration(seat, effectiveRole);
    return registration.alignment === 'Evil';
  };

  // 检测能力描述中是否包含"选择"关键词
  // 规则：如果能力描述中没有"选择"一词，这项能力就由说书人来做出选择
  const abilityText = effectiveRole.ability || '';
  const hasChoiceKeyword = abilityText.includes('选择');

  // VORTOX CHECK: 如果 Vortox 在场且角色是镇民，强制提供错误信息
  const vortoxActive = seats.some(s => s.role?.id === 'vortox' && !s.isDead);

  // 实时检查是否中毒：使用computeIsPoisoned函数统一计算所有中毒来源
  let isPoisoned = computeIsPoisoned(targetSeat);
  // VORTOX LOGIC: 如果 Vortox 在场且角色是镇民，强制视为"中毒"（提供错误信息）
  if (vortoxActive && effectiveRole.type === 'townsfolk') {
    isPoisoned = true; // Force false info for Townsfolk
  }

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
  let guide = "", speak = "", action = "", logMessage: string | undefined;

  // 创建一个虚拟的 Seat 对象用于获取角色信息
  const dummySeat: Seat = {
    id: -1,
    role: null,
    charadeRole: null,
    displayRole: null,
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
    grandchildId: null,
    isGrandchild: false,
  };

  switch (effectiveRole.id) {
    // ========== Demon (恶魔) ==========
    case 'imp':
      if (gamePhase === 'firstNight') {
        // 检查罂粟种植者状态：如果罂粟种植者在场且存活，恶魔不知道爪牙是谁
        const poppyGrower = seats.find(s => s.role?.id === 'poppy_grower');
        const shouldHideMinions = poppyGrower && !poppyGrower.isDead && poppyGrowerDead === false;

        if (shouldHideMinions) {
          guide = `🌺 罂粟种植者在场，你不知道你的爪牙是谁。`;
          speak = `"罂粟种植者在场，你不知道你的爪牙是谁。"`;
          action = "无信息";
        } else {
          const minions = seats.filter(s => s.role?.type === 'minion').map(s => `${s.id + 1}号`);
          guide = `👿 爪牙列表：${minions.length > 0 ? minions.join(', ') : '无'}。`;
          speak = `"${minions.length > 0 ? `你的爪牙是 ${minions.join('、')}。` : '场上没有爪牙。'}请确认你的爪牙。"`;
          action = "无";
        }
      } else {
        guide = "👹 每个夜晚*，你要选择一名玩家：他死亡。如果你以这种方式自杀，一名爪牙会变成小恶魔。";
        speak = '"请选择一名玩家。他死亡。你可以选择自杀来将恶魔血脉传递给一名爪牙。"';
        action = "kill";
      }
      break;

    case 'pukka':
      if (gamePhase === 'firstNight') {
        // 检查罂粟种植者状态：如果罂粟种植者在场且存活，恶魔不知道爪牙是谁
        const poppyGrower = seats.find(s => s.role?.id === 'poppy_grower');
        const shouldHideMinions = poppyGrower && !poppyGrower.isDead && poppyGrowerDead === false;

        if (shouldHideMinions) {
          guide = `🌺 罂粟种植者在场，你不知道你的爪牙是谁。`;
          speak = `"罂粟种植者在场，你不知道你的爪牙是谁。"`;
          action = "无信息";
        } else {
          const minions = seats.filter(s => s.role?.type === 'minion' && s.id !== currentSeatId).map(s => `${s.id + 1}号`);
          guide = `👿 爪牙列表：${minions.length > 0 ? minions.join(', ') : '无'}。`;
          speak = `"${minions.length > 0 ? `你的爪牙是 ${minions.join('、')}。` : '场上没有爪牙。'}请确认你的爪牙。"`;
          action = "无";
        }
      } else {
        guide = "☠️ 每个夜晚，你要选择一名玩家：他中毒。上个因你的能力中毒的玩家会死亡并恢复健康。";
        speak = '"请选择一名玩家。他现在中毒。上个因你的能力中毒的玩家会死亡并恢复健康。"';
        action = "poison";
      }
      break;

    case 'zombuul':
      if (gamePhase === 'firstNight') {
        // 检查罂粟种植者状态：如果罂粟种植者在场且存活，恶魔不知道爪牙是谁
        const poppyGrower = seats.find(s => s.role?.id === 'poppy_grower');
        const shouldHideMinions = poppyGrower && !poppyGrower.isDead && poppyGrowerDead === false;

        if (shouldHideMinions) {
          guide = `🌺 罂粟种植者在场，你不知道你的爪牙是谁。`;
          speak = `"罂粟种植者在场，你不知道你的爪牙是谁。"`;
          action = "无信息";
        } else {
          const minions = seats.filter(s => s.role?.type === 'minion' && s.id !== currentSeatId).map(s => `${s.id + 1}号`);
          guide = `👿 爪牙列表：${minions.length > 0 ? minions.join(', ') : '无'}。`;
          speak = `"${minions.length > 0 ? `你的爪牙是 ${minions.join('、')}。` : '场上没有爪牙。'}请确认你的爪牙。"`;
          action = "无";
        }
      } else {
        // 非首夜：如果上一个黄昏没有处决（lastDuskExecution === null），僵怖应该被唤醒
        if (lastDuskExecution === null) {
          guide = "⚰️ 每个夜晚*，如果今天白天没有人死亡，你会被唤醒并要选择一名玩家：他死亡。当你首次死亡后，你仍存活，但会被当作死亡。";
          speak = '"请选择一名玩家。他死亡。"';
          action = "kill";
        } else {
          // 如果上一个黄昏有处决，僵怖不应该被唤醒
          guide = "💤 今天白天有人死亡，你不会被唤醒。";
          speak = '"今天白天有人死亡，你不会被唤醒。"';
          action = "skip";
        }
      }
      break;

    case 'shabaloth':
      if (gamePhase === 'firstNight') {
        // 检查罂粟种植者状态：如果罂粟种植者在场且存活，恶魔不知道爪牙是谁
        const poppyGrower = seats.find(s => s.role?.id === 'poppy_grower');
        const shouldHideMinions = poppyGrower && !poppyGrower.isDead && poppyGrowerDead === false;
        if (shouldHideMinions) {
          guide = `🌺 罂粟种植者在场，你不知道你的爪牙是谁。`;
          speak = `"罂粟种植者在场，你不知道你的爪牙是谁。"`;
          action = "无信息";
        } else {
          const minions = seats.filter(s => s.role?.type === 'minion' && s.id !== currentSeatId).map(s => `${s.id + 1}号`);
          guide = `👿 爪牙列表：${minions.length > 0 ? minions.join(', ') : '无'}。`;
          speak = `"${minions.length > 0 ? `你的爪牙是 ${minions.join('、')}。` : '场上没有爪牙。'}请确认你的爪牙。"`;
          action = "无";
        }
      } else {
        guide = "🐍 每个夜晚*，你要选择两名玩家：他们死亡。你上个夜晚选择过且当前死亡的玩家之一可能会被你反刍。";
        speak = '"请选择两名玩家。他们死亡。上个夜晚选择过且当前死亡的玩家之一可能会被你反刍。"';
        action = "kill";
      }
      break;

    case 'po':
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
          const minions = seats.filter(s => s.role?.type === 'minion' && s.id !== currentSeatId).map(s => `${s.id + 1}号`);
          guide = `👿 爪牙列表：${minions.length > 0 ? minions.join(', ') : '无'}。`;
          speak = `"${minions.length > 0 ? `你的爪牙是 ${minions.join('、')}。` : '场上没有爪牙。'}请确认你的爪牙。"`;
          action = "无";
        }
      } else {
        guide = "🌸 每个夜晚*，你可以选择一名玩家：他死亡。如果你上次选择时没有选择任何玩家，当晚你要选择三名玩家：他们死亡。";
        speak = '"你可以选择一名玩家杀死；如果你上次选择时没有选择任何玩家，当晚你要选择三名玩家杀死。"';
        action = "kill";
      }
      break;

    case 'fang_gu':
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
          const minions = seats.filter(s => s.role?.type === 'minion' && s.id !== currentSeatId).map(s => `${s.id + 1}号`);
          guide = `👿 爪牙列表：${minions.length > 0 ? minions.join(', ') : '无'}。`;
          speak = `"${minions.length > 0 ? `你的爪牙是 ${minions.join('、')}。` : '场上没有爪牙。'}请确认你的爪牙。"`;
          action = "无";
        }
      } else {
        guide = "⚔️ 选择一名玩家：他死亡。被该能力杀死的外来者改为变成邪恶的方古且你代替他死亡，但每局游戏仅能成功转化一次。";
        speak = '"请选择一名玩家。他死亡。被该能力杀死的外来者改为变成邪恶的方古且你代替他死亡，但每局游戏仅能成功转化一次。"';
        action = "kill";
      }
      break;

    case 'vigormortis':
      // 亡骨魔：每晚选择一名玩家：他死亡。被你杀死的爪牙保留他的能力，且与他邻近的两名镇民之一中毒
      if (gamePhase === 'firstNight') {
        // 检查罂粟种植者状态
        const poppyGrower = seats.find(s => s.role?.id === 'poppy_grower');
        const shouldHideMinions = poppyGrower && !poppyGrower.isDead && poppyGrowerDead === false;

        if (shouldHideMinions) {
          guide = `🌺 罂粟种植者在场，你不知道你的爪牙是谁。`;
          speak = `"罂粟种植者在场，你不知道你的爪牙是谁。"`;
          action = "无信息";
        } else {
          const minions = seats.filter(s => s.role?.type === 'minion' && s.id !== currentSeatId).map(s => `${s.id + 1}号`);
          guide = `👿 爪牙列表：${minions.length > 0 ? minions.join(', ') : '无'}。`;
          speak = `"${minions.length > 0 ? `你的爪牙是 ${minions.join('、')}。` : '场上没有爪牙。'}请确认你的爪牙。"`;
          action = "无";
        }
      } else {
        guide = "⚔️ 选择一名玩家：他死亡。被你杀死的爪牙保留他的能力，且与他邻近的两名镇民之一中毒。";
        speak = '"请选择一名玩家。他死亡。被你杀死的爪牙保留他的能力，且与他邻近的两名镇民之一中毒。"';
        action = "kill";
      }
      break;

    case 'no_dashii':
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
          const minions = seats.filter(s => s.role?.type === 'minion' && s.id !== currentSeatId).map(s => `${s.id + 1}号`);
          guide = `👿 爪牙列表：${minions.length > 0 ? minions.join(', ') : '无'}。`;
          speak = `"${minions.length > 0 ? `你的爪牙是 ${minions.join('、')}。` : '场上没有爪牙。'}请确认你的爪牙。"`;
          action = "无";
        }
      } else {
        guide = "⚔️ 选择一名玩家：他死亡。与你邻近的两名镇民中毒。";
        speak = '"请选择一名玩家。他死亡。与你邻近的两名镇民中毒。"';
        action = "kill";
      }
      break;

    case 'vortox':
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
          const minions = seats.filter(s => s.role?.type === 'minion' && s.id !== currentSeatId).map(s => `${s.id + 1}号`);
          guide = `👿 爪牙列表：${minions.length > 0 ? minions.join(', ') : '无'}。`;
          speak = `"${minions.length > 0 ? `你的爪牙是 ${minions.join('、')}。` : '场上没有爪牙。'}请确认你的爪牙。"`;
          action = "无";
        }
      } else {
        guide = "⚔️ 选择一名玩家：他死亡。镇民玩家的能力都会产生错误信息，如果白天没人被处决，邪恶阵营获胜。";
        speak = '"请选择一名玩家。他死亡。镇民玩家的能力都会产生错误信息，如果白天没人被处决，邪恶阵营获胜。"';
        action = "kill";
      }
      break;



    case 'hadesia':
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
          const minions = seats.filter(s => s.role?.type === 'minion' && s.id !== currentSeatId).map(s => `${s.id + 1}号`);
          guide = `👿 爪牙列表：${minions.length > 0 ? minions.join(', ') : '无'}。`;
          speak = `"${minions.length > 0 ? `你的爪牙是 ${minions.join('、')}。` : '场上没有爪牙。'}请确认你的爪牙。"`;
          action = "无";
        }
      } else {
        guide = "⚔️ 选择三名玩家（所有玩家都会得知你选择了谁）：他们秘密决定自己的命运，如果他们全部存活，他们全部死亡。";
        speak = '"请选择三名玩家。所有玩家都会得知你选择了谁。他们秘密决定自己的命运，如果他们全部存活，他们全部死亡。"';
        action = "kill";
      }
      break;

    case 'legion':
      // 军团：实验性恶魔，多数玩家为军团，提名只有邪恶投票则记 0 票，夜晚可能有 1 人死亡
      guide = "💀 军团：多数玩家为军团，提名只有邪恶投票则记 0 票，夜晚可能有 1 人死亡。（占位）";
      speak = '"军团：多数玩家为军团，提名只有邪恶投票则记 0 票，夜晚可能有 1 人死亡。"';
      action = "跳过";
      break;

    case 'riot':
      // 暴乱：实验性恶魔，第三天提名链式强制处决
      guide = "💥 暴乱：第三天提名链式强制处决。（占位）";
      speak = '"暴乱：第三天提名链式强制处决。"';
      action = "跳过";
      break;

    case 'lord_of_typhon':
      // 堤丰之首：实验性恶魔，邪恶玩家连座，+1爪牙，外来者可变
      guide = "🐍 堤丰之首：邪恶玩家连座，+1爪牙，外来者可变。（占位）";
      speak = '"堤丰之首：邪恶玩家连座，+1爪牙，外来者可变。"';
      action = "跳过";
      break;

    case 'kazali':
      // 卡扎力：实验性恶魔，首夜自定义分配爪牙，可调整外来者
      guide = "✨ 卡扎力：首夜自定义分配爪牙，可调整外来者。（占位）";
      speak = '"卡扎力：首夜自定义分配爪牙，可调整外来者。"';
      action = "跳过";
      break;

    case 'lloam':
      // 罗姆：实验性恶魔，夜晚中毒玩家死亡
      guide = "☠️ 罗姆：夜晚中毒玩家死亡。（占位）";
      speak = '"罗姆：夜晚中毒玩家死亡。"';
      action = "跳过";
      break;

    case 'demon_saint':
      // 圣徒（恶魔）：实验性恶魔，白天首次被处决，所有玩家都死亡
      guide = "😇 圣徒（恶魔）：白天首次被处决，所有玩家都死亡。（占位）";
      speak = '"圣徒（恶魔）：白天首次被处决，所有玩家都死亡。"';
      action = "跳过";
      break;

    case 'titus':
      // 提图斯：实验性恶魔，恶魔处决，获得邪恶玩家阵营
      guide = "🗡️ 提图斯：恶魔处决，获得邪恶玩家阵营。（占位）";
      speak = '"提图斯：恶魔处决，获得邪恶玩家阵营。"';
      action = "跳过";
      break;

    case 'leviathan':
      // 利维坦：实验性恶魔，每晚说出非恶魔角色，该角色死亡
      guide = "🌊 利维坦：每晚说出非恶魔角色，该角色死亡。（占位）";
      speak = '"利维坦：每晚说出非恶魔角色，该角色死亡。"';
      action = "跳过";
      break;

    case 'liz':
      // 利兹：实验性恶魔，夜晚可选择是否死亡，选择死亡后，一个爪牙成为利兹，活到最后即胜利
      guide = "👑 利兹：夜晚可选择是否死亡，选择死亡后，一个爪牙成为利兹，活到最后即胜利。（占位）";
      speak = '"利兹：夜晚可选择是否死亡，选择死亡后，一个爪牙成为利兹，活到最后即胜利。"';
      action = "跳过";
      break;

    // ========== Minion (爪牙) ==========
    case 'poisoner':
      guide = "🧪 每个夜晚，你要选择一名玩家：他在当晚和明天白天中毒。";
      speak = '"请选择一名玩家。他当晚和明天白天都会中毒。"';
      action = "投毒";
      break;

    case 'spy':
      guide = "📖 每个夜晚，你能查看魔典。你可能会被当作善良阵营、镇民角色或外来者角色，即使你已死亡。";
      speak = '"请查看魔典。"';
      action = "无";
      break;



    case 'scarlet_woman':
      guide = "💋 如果大于等于五名玩家存活时（旅行者不计算在内）恶魔死亡，你变成那个恶魔。";
      speak = '"如果大于等于五名玩家存活时恶魔死亡，你变成那个恶魔。"';
      action = "无";
      break;

    case 'cerenovus':
      // 洗脑师：每晚选择一名玩家和一个善良角色，他明天白天和夜晚需要"疯狂"地证明自己是这个角色
      guide = "🧠 选择一名玩家和一个善良角色，他明天白天和夜晚需要\"疯狂\"地证明自己是这个角色，不然他可能被处决。";
      speak = '"请选择一名玩家和一个善良角色。他明天白天和夜晚需要\\"疯狂\\"地证明自己是这个角色，不然他可能被处决。"';
      action = "mark";
      break;

    case 'pit_hag':
      // 麻脸巫婆：每晚选择一名玩家和一个角色，如果该角色不在场，他变成该角色
      guide = "🧹 选择一名玩家和一个角色，如果该角色不在场，他变成该角色。如果因此创造了一个恶魔，当晚的死亡由说书人决定。";
      speak = '"请选择一名玩家和一个角色。如果该角色不在场，他变成该角色。如果因此创造了一个恶魔，当晚的死亡由说书人决定。"';
      action = "mark";
      break;



    case 'evil_twin':
      // 镜像双子：首夜需要选择一名善良玩家作为对手
      if (gamePhase === 'firstNight') {
        guide = "👥 选择一名善良玩家作为你的对手。你与这名玩家互相知道对方是什么角色。如果其中善良玩家被处决，邪恶阵营获胜。如果你们都存活，善良阵营无法获胜。";
        speak = '"请选择一名善良玩家作为你的对手。你与这名玩家互相知道对方是什么角色。如果其中善良玩家被处决，邪恶阵营获胜。如果你们都存活，善良阵营无法获胜。"';
        action = "mark";
      }
      break;

    case 'shaman':
      // 灵言师：首夜得知一个关键词
      if (gamePhase === 'firstNight') {
        const keywords = ['月亮', '星星', '太阳', '海洋', '山峰', '森林', '河流', '火焰', '风暴', '彩虹'];
        const keyword = getRandom(keywords);
        guide = `🔮 真实信息: 关键词是【${keyword}】。第一个公开说出这个关键词的善良玩家会在当晚变成邪恶。`;
        speak = `"你的关键词是【${keyword}】。第一个公开说出这个关键词的善良玩家会在当晚变成邪恶。"`;
        action = "无";
      }
      break;

    case 'widow':
      // 寡妇：首夜查看魔典并选择一名玩家中毒；随后有一名善良玩家得知“寡妇在场”
      if (gamePhase === 'firstNight') {
        guide = "🕷️ 首夜：你可查看魔典并选择一名玩家：他中毒直到寡妇死亡；随后将有一名善良玩家得知“寡妇在场”（不知谁是寡妇/谁中毒）。";
        speak = '"你可以查看魔典并选择一名玩家：他中毒直到寡妇死亡。随后会有一名善良玩家得知寡妇在场。"';
        action = "mark";
      } else {
        guide = "💤 寡妇仅在首夜行动（中毒持续直到寡妇死亡）。";
        speak = "（无）";
        action = "跳过";
      }
      break;

    case 'organ_grinder':
      // 街头风琴手：投票闭眼秘密计票；每晚可选择自己是否醉酒到下个黄昏（醉酒则投票恢复公开）
      guide = "🎹 所有玩家投票闭眼，票数秘密统计；每晚你可选择自己是否醉酒直到下个黄昏（若你醉酒，则投票恢复正常公开）。";
      speak = '"所有玩家投票时闭眼，票数秘密统计。每晚你可选择自己是否醉酒直到下个黄昏（醉酒则投票恢复公开）。"';
      action = "mark";
      break;

    case 'boffin':
      // 科学怪人：恶魔获得一个不在场善良角色的能力（恶魔醉酒/中毒仍保留），你与恶魔都知道获得了什么能力
      guide = "🧪 恶魔拥有一个不在场善良角色的能力（即使恶魔醉酒或中毒）。你与恶魔都知道获得了什么能力。";
      speak = '"恶魔拥有一个不在场善良角色的能力（即使恶魔醉酒或中毒）。你与恶魔都知道他获得了什么能力。"';
      action = "无";
      break;

    case 'fearmonger':
      // 恐惧之灵：每晚选择一名玩家；若你提名他且他被处决，则其阵营落败。首次选择/更换目标时全体得知“你选择了新的玩家”
      guide = "👁️ 每晚选择一名玩家：若你提名他且他被处决，则他的阵营落败。首次选择/更换目标时，所有玩家会得知你选择了新的玩家（不知是谁）。";
      speak = '"每晚选择一名玩家：若你提名他且他被处决，则他的阵营落败。首次选择/更换目标时，所有玩家会得知你选择了新的玩家（不知是谁）。"';
      action = "mark";
      break;

    case 'wizard':
      // 巫师：每局限一次，向说书人许愿；愿望可能实现并伴随代价与线索
      guide = "✨ 每局限一次：你可以向说书人许愿。若愿望被实现，可能会伴随代价与线索（由说书人裁定）。";
      speak = '"每局限一次：你可以向说书人许愿。若愿望被实现，可能会伴随代价与线索（由说书人裁定）。"';
      action = "无";
      break;

    case 'xaan':
      // 限：在等同于“初始外来者数量”的夜晚，所有镇民中毒直到下个黄昏；外来者数量可被调整
      guide = "⏳ 在等同于“初始外来者数量”的夜晚，所有镇民玩家中毒直到下个黄昏。（外来者数量可能因限而调整，且不随游戏中途变化影响触发夜晚）";
      speak = '"在等同于初始外来者数量的夜晚，所有镇民中毒直到下个黄昏。外来者数量可能被调整，且不随中途变化影响触发夜晚。"';
      action = "无";
      break;

    case 'psychopath':
      // 精神病患者：每个白天，在提名开始前，可以公开选择一名玩家死亡
      guide = "🔪 每个白天，在提名开始前，你可以公开选择一名玩家：他死亡。如果你被处决，提名你的玩家必须和你玩石头剪刀布；只有你输了才会死亡。";
      speak = '"每个白天，在提名开始前，你可以公开选择一名玩家。他死亡。如果你被处决，提名你的玩家必须和你玩石头剪刀布；只有你输了才会死亡。"';
      action = "无";
      break;

    case 'godfather':
      // 教父：首夜得知有哪些外来者角色在场。如果有外来者在白天死亡，你会在当晚被唤醒并且你要选择一名玩家：他死亡。
      if (gamePhase === 'firstNight') {
        // 使用注册判定：间谍可能被当作外来者；陌客也可能不被当作外来者
        const outsiderRoles = seats
          .filter((s) => s.role && !!getPerceivedRoleForViewer(s, effectiveRole, 'outsider').perceivedRole)
          .map((s) => getPerceivedRoleForViewer(s, effectiveRole, 'outsider').perceivedRole!.name)
          .filter((name, idx, arr) => arr.indexOf(name) === idx); // 去重
        guide = `👔 首夜得知有哪些外来者角色在场。`;
        speak = `"场上的外来者角色是：${outsiderRoles.length > 0 ? outsiderRoles.join('、') : '没有外来者'}。"`;
        action = "无";
      } else {
        // 非首夜：只有在白天有外来者死亡时才会被唤醒
        if (!outsiderDiedToday) {
          guide = "💤 今日白天没有外来者死亡，本夜你不会被唤醒执行额外杀人。";
          speak = "（无）";
          action = "跳过";
        } else {
          guide = "⚔️ 如果有外来者在白天死亡，你会在当晚被唤醒并且你要选择一名玩家：他死亡。";
          speak = '"今日白天有外来者死亡，请选择一名玩家。他死亡。"';
          action = "kill";
        }
      }
      break;

    case 'devils_advocate':
      // 魔鬼代言人：每个夜晚，你要选择一名存活的玩家：如果明天白天他被处决，他不会死亡。
      guide = "⚖️ 每个夜晚，你要选择一名存活的玩家：如果明天白天他被处决，他不会死亡。";
      speak = '"请选择一名存活的玩家。如果明天白天他被处决，他不会死亡。"';
      action = "mark";
      break;

    case 'assassin':
      // 刺客：每局游戏限一次，在夜晚时，你可以选择一名玩家：他死亡，即使因为任何原因让他不会死亡。
      if (hasUsedAbilityFn && hasUsedAbilityFn('assassin', currentSeatId)) {
        guide = "一次性能力已用完。";
        speak = '"你的能力已用完。"';
        action = "跳过";
      } else {
        guide = "🗡️ 每局游戏限一次，在夜晚时，你可以选择一名玩家：他死亡，即使因为任何原因让他不会死亡。";
        speak = '"每局游戏限一次，请选择一名玩家。他死亡，即使因为任何原因让他不会死亡。"';
        action = "kill";
      }
      break;

    // ========== Townsfolk (镇民) ==========
    case 'washerwoman':
      if (gamePhase === 'firstNight') {
        // 规则：洗衣妇永远不会得知“场上没有镇民”，且只能看到【镇民角色标记】，不会看到爪牙/恶魔等真实身份
        // 1. 找到在洗衣妇视角下“被当作镇民”的玩家（包含可能被当作镇民的间谍/隐士等）
        let candidateSeats = seats.filter((s) => {
          if (!s.role) return false;
          const info = getPerceivedRoleForViewer(s, effectiveRole, 'townsfolk');
          return !!info.perceivedRole;
        });

        // 优先不选洗衣妇本人作为“镇民玩家”
        let filtered = candidateSeats.filter((s) => s.id !== currentSeatId);

        // 如果这样过滤后为空（极端 5 人局+男爵 情况），则允许把洗衣妇自己也作为候选
        if (filtered.length === 0) {
          filtered = candidateSeats;
        }

        let realPlayer: Seat | undefined;
        let perceivedRoleName = '镇民';

        if (filtered.length > 0) {
          realPlayer = getRandom(filtered);
          const perceivedInfo = getPerceivedRoleForViewer(realPlayer, effectiveRole, 'townsfolk');
          if (perceivedInfo.perceivedRole) {
            // 使用“在洗衣妇眼中”的镇民角色名，而不是玩家真实角色名（避免泄露爪牙等信息）
            perceivedRoleName = perceivedInfo.perceivedRole.name;
          }
        }

        // 2. 选择另一个玩家作为干扰项（不能是真实持有者；如有可能也尽量不是洗衣妇自己）
        const availablePlayers = seats.filter(
          (s) => s.id !== realPlayer?.id && s.id !== currentSeatId
        );
        const fakePlayer = availablePlayers.length > 0
          ? getRandom(availablePlayers)
          : undefined;

        const selfSeatNo = currentSeatId + 1;

        if (realPlayer && fakePlayer) {
          const player1 = realPlayer.id + 1;
          const player2 = fakePlayer.id + 1;
          const info = `${player1}号、${player2}号中存在（镇民）${perceivedRoleName}。`;
          guide = `🧺 洗衣妇(${selfSeatNo}) 得知：${info}\n（注：其中一人是真正的${perceivedRoleName}，另一人可以是场上除开洗衣妇本人外任意阵营的玩家）`;
          speak = `"[夜晚] 洗衣妇(${selfSeatNo}) 得知：${info}"`;
        } else {
          // 理论上不应发生；兜底逻辑：随机挑两名玩家和任意一个镇民角色，仍然不给出“没有镇民”的信息
          const alivePlayers = seats.filter((s) => !s.isDead && s.id !== currentSeatId);
          if (alivePlayers.length >= 2) {
            const shuffled = [...alivePlayers].sort(() => Math.random() - 0.5);
            const p1 = shuffled[0].id + 1;
            const p2 = shuffled[1].id + 1;
            const townsfolkRoles = roles.filter((r) => r.type === 'townsfolk');
            const fallbackRole = townsfolkRoles.length > 0 ? getRandom(townsfolkRoles) : null;
            const roleName = fallbackRole?.name || '镇民';
            const info = `${p1}号、${p2}号中存在（镇民）${roleName}。`;
            guide = `🧺 洗衣妇(${selfSeatNo}) 得知：${info}`;
            speak = `"[夜晚] 洗衣妇(${selfSeatNo}) 得知：${info}"`;
            logMessage = guide;
          } else {
            guide = `🧺 洗衣妇(${selfSeatNo}) 得知：场上没有足够的玩家来提供信息。`;
            speak = `"[夜晚] 洗衣妇(${selfSeatNo}) 得知：场上没有足够的玩家来提供信息"`;
            logMessage = guide;
          }
        }

        action = "无";
      }
      break;

    case 'librarian':
      if (gamePhase === 'firstNight') {
        // 规则：图书管理员视角下，间谍/隐士等可能“注册”为外来者
        // 1. 找到在图书管理员视角下“被当作外来者”的玩家
        let candidateSeats = seats.filter((s) => {
          if (!s.role) return false;
          const info = getPerceivedRoleForViewer(s, effectiveRole, 'outsider');
          return !!info.perceivedRole;
        });

        const selfSeatNo = currentSeatId + 1;

        // 优先不选图书管理员自己作为“外来者玩家”
        let filtered = candidateSeats.filter((s) => s.id !== currentSeatId);
        if (filtered.length === 0) {
          filtered = candidateSeats;
        }

        let realPlayer: Seat | undefined;
        let perceivedRoleName = '外来者';

        if (filtered.length > 0) {
          realPlayer = getRandom(filtered);
          const perceivedInfo = getPerceivedRoleForViewer(realPlayer, effectiveRole, 'outsider');
          if (perceivedInfo.perceivedRole) {
            perceivedRoleName = perceivedInfo.perceivedRole.name;
          }
        }

        if (realPlayer) {
          // 选择另一个玩家作为干扰项（不能是图书管理员自己，也不能是真实的持有者）
          const availablePlayers = seats.filter(
            (s) => s.id !== currentSeatId && s.id !== realPlayer!.id
          );
          const fakePlayer =
            availablePlayers[Math.floor(Math.random() * availablePlayers.length)];

          if (fakePlayer) {
            const player1 = realPlayer.id + 1;
            const player2 = fakePlayer.id + 1;
            const info = `${player1}号、${player2}号中存在（外来者）${perceivedRoleName}。`;
            guide = `📚 图书管理员(${selfSeatNo}) 得知：${info}\n（注：其中一人是真正的${perceivedRoleName}，另一人可以是场上除开图书管理员本人外任意阵营的玩家）`;
            speak = `"[夜晚] 图书管理员(${selfSeatNo}) 得知：${info}"`;
            logMessage = guide;
          } else {
            guide = `📚 图书管理员(${selfSeatNo}) 得知：场上没有足够的玩家来提供信息。`;
            speak = `"[夜晚] 图书管理员(${selfSeatNo}) 得知场上没有足够的玩家来提供信息"`;
            logMessage = guide;
          }
        } else {
          guide = `📚 图书管理员(${currentSeatId + 1}) 得知没有外来者在场`;
          speak = `"[夜晚] 图书管理员(${currentSeatId + 1}) 得知没有外来者在场"`;
          logMessage = guide;
        }

        action = "无";
      }
      break;

    case 'investigator':
      if (gamePhase === 'firstNight') {
        const selfSeatNo = currentSeatId + 1;

        // 遍历所有玩家，找出在调查员视角下“被当作爪牙”的玩家
        const perceivedMinions = seats
          .filter((s) => s.role) // 仅考虑有角色的玩家
          .map((s) => ({
            seat: s,
            info: getPerceivedRoleForViewer(s, effectiveRole, 'minion'),
          }))
          .filter((x) => !!x.info.perceivedRole);

        if (perceivedMinions.length > 0) {
          // 从这些玩家中选择一个作为“真实爪牙玩家”
          const picked = getRandom(perceivedMinions);
          const realPlayer = picked.seat;
          const minionRole = picked.info.perceivedRole!;

          // 再选择一个不同的玩家作为干扰项，不能是调查员自己，也不能是真实爪牙
          const availablePlayers = seats.filter(
            (s) => s.id !== currentSeatId && s.id !== realPlayer.id
          );
          const fakePlayer =
            availablePlayers.length > 0
              ? availablePlayers[Math.floor(Math.random() * availablePlayers.length)]
              : null;

          if (fakePlayer) {
            const player1 = realPlayer.id + 1;
            const player2 = fakePlayer.id + 1;
            const info = `${player1}号、${player2}号中存在（爪牙）${minionRole.name}。`;
            guide = `🕵️ 调查员(${selfSeatNo}) 得知：${info}`;
            speak = `"[夜晚] 调查员(${selfSeatNo}) 得知：${info}"`;
            logMessage = guide;
          } else {
            guide = `🕵️ 调查员(${selfSeatNo}) 得知：场上没有足够的玩家来提供信息。`;
            speak = `"[夜晚] 调查员(${selfSeatNo}) 得知场上没有足够的玩家来提供信息"`;
            logMessage = guide;
          }
        } else {
          // 在调查员视角下，没有任何玩家注册为“爪牙” → 视为场上没有爪牙
          guide = `🕵️ 调查员(${selfSeatNo}) 得知没有爪牙在场`;
          speak = `"[夜晚] 调查员(${selfSeatNo}) 得知没有爪牙在场"`;
          logMessage = guide;
        }
        action = "无";
      }
      break;

    case 'chef':
      if (gamePhase === 'firstNight') {
        // 计算相邻的邪恶玩家对数
        let evilPairs = 0;
        for (let i = 0; i < seats.length; i++) {
          const current = seats[i];
          const next = seats[(i + 1) % seats.length];
          if (checkEvilForChefEmpath(current) && checkEvilForChefEmpath(next)) {
            evilPairs++;
          }
        }
        const selfSeatNo = currentSeatId + 1;
        const info = `相邻邪恶玩家对数：${evilPairs}`;
        guide = `👨‍🍳 厨师(${selfSeatNo}) 得知${info}`;
        speak = `"[夜晚] 厨师(${selfSeatNo}) 得知${info}"`;
        logMessage = guide;
        action = "无";
      }
      break;

    case 'empath':
      // 找到当前玩家的邻座
      const currentIndex = seats.findIndex(s => s.id === currentSeatId);
      if (currentIndex !== -1) {
        const leftNeighbor = findNearestAliveNeighbor(currentSeatId, -1);
        const rightNeighbor = findNearestAliveNeighbor(currentSeatId, 1);

        let evilCount = 0;
        if (leftNeighbor && checkEvilForChefEmpath(leftNeighbor)) evilCount++;
        if (rightNeighbor && checkEvilForChefEmpath(rightNeighbor)) evilCount++;

        const selfSeatNo = currentSeatId + 1;
        const info = `邻近的两名存活玩家中，有${evilCount}名邪恶玩家。`;
        guide = `🤝 共情者(${selfSeatNo}) 得知：${info}`;
        speak = `"[夜晚] 共情者(${selfSeatNo}) 得知：${info}"`;
        logMessage = guide;
      } else {
        const selfSeatNo = currentSeatId + 1;
        guide = `🤝 共情者(${selfSeatNo}) 得知：无法确定邻座玩家。`;
        speak = `"[夜晚] 共情者(${selfSeatNo}) 得知：无法确定邻座玩家"`;
        logMessage = guide;
      }
      action = "无";
      break;

    case 'fortune_teller':
      guide = "🔮 每个夜晚，你要选择两名玩家：你会得知他们之中是否有恶魔。会有一名善良玩家始终被你的能力当作恶魔。";
      speak = '"每个夜晚，你要选择两名玩家：你会得知他们之中是否有恶魔。会有一名善良玩家始终被你的能力当作恶魔。"';
      action = "查验";
      break;

    case 'undertaker':
      if (gamePhase !== 'firstNight') {
        if (executedToday !== null) {
          const executedPlayer = seats.find(s => s.id === executedToday);
          if (executedPlayer?.role) {
            guide = `⚰️ 得知：今天被处决的玩家是${executedPlayer.role.name}。`;
            speak = `"今天被处决的玩家是${executedPlayer.role.name}。"`;
            logMessage = guide;
          } else {
            guide = "⚰️ 得知：今天有玩家被处决，但无法确定角色。";
            speak = '"今天有玩家被处决，但无法确定角色。"';
            logMessage = guide;
          }
        } else {
          guide = "⚰️ 得知：今天白天没有玩家被处决。";
          speak = '"今天白天没有玩家被处决。"';
          logMessage = guide;
        }
        action = "无";
      }
      break;

    case 'monk':
      if (gamePhase !== 'firstNight') {
        guide = "🙏 选择除你以外的一名玩家：当晚恶魔的负面能力对他无效。";
        speak = '"请选择除你以外的一名玩家。当晚恶魔的负面能力对他无效。"';
        action = "保护";
      }
      break;

    case 'ravenkeeper':
      if (diedTonight) {
        guide = "🐦 如果你在夜晚死亡，你会被唤醒，然后你要选择一名玩家：你会得知他的角色。";
        speak = '"如果你在夜晚死亡，你会被唤醒，然后你要选择一名玩家：你会得知他的角色。"';
        action = "查验";
      } else {
        guide = "💤 你本夜未死亡，不会被唤醒。";
        speak = "（无）";
        action = "跳过";
      }
      break;

    case 'innkeeper':
      guide = "🏨 每个夜晚*，你要选择两名玩家：他们当晚不会死亡，但其中一人会醉酒到下个黄昏。";
      speak = '"每个夜晚，你要选择两名玩家：他们当晚不会死亡，但其中一人会醉酒到下个黄昏。"';
      action = "保护";
      break;

    case 'clockmaker':
      if (gamePhase === 'firstNight') {
        // 计算恶魔与爪牙之间的最小距离
        const demons = seats.filter(s => s.role?.type === 'demon');
        const minions = seats.filter(s => s.role?.type === 'minion');

        let minDistance = Infinity;
        for (const demon of demons) {
          for (const minion of minions) {
            const distance = Math.min(
              Math.abs(demon.id - minion.id),
              seats.length - Math.abs(demon.id - minion.id)
            );
            minDistance = Math.min(minDistance, distance);
          }
        }

        if (minDistance === Infinity) {
          guide = "🕰️ 首夜得知：无法计算距离（缺少恶魔或爪牙）。";
          speak = '"无法计算距离。"';
          logMessage = guide;
        } else {
          guide = `🕰️ 首夜得知：恶魔与爪牙之间的最近距离是${minDistance}。（邻座距离为1）`;
          speak = `"恶魔与爪牙之间的最近距离是${minDistance}。"`;
          logMessage = guide;
        }
        action = "无";
      }
      break;

    case 'mathematician':
      // 计算未能正常生效的能力数量（这里需要根据游戏状态计算，暂时使用模拟值）
      const failedAbilities = 0; // TODO: 实现具体的计算逻辑
      guide = `🧮 得知：今晚有${failedAbilities}个角色能力未能正常生效。`;
      speak = `"今晚有${failedAbilities}个角色能力未能正常生效。"`;
      logMessage = guide;
      action = "无";
      break;

    case 'flowergirl':
      const demonVoted = demonVotedToday || false;
      guide = `🌸 得知：今天白天${demonVoted ? '有' : '没有'}恶魔投过票。`;
      speak = `"今天白天${demonVoted ? '有' : '没有'}恶魔投过票。"`;
      action = "无";
      break;

    case 'town_crier':
      const minionNominated = minionNominatedToday || false;
      guide = `📢 得知：今天白天${minionNominated ? '有' : '没有'}爪牙发起过提名。`;
      speak = `"今天白天${minionNominated ? '有' : '没有'}爪牙发起过提名。"`;
      action = "无";
      break;

    case 'oracle':
      if (gamePhase !== 'firstNight') {
        // 计算今天死亡的邪恶玩家数量
        const deadEvilCount = deadThisNight.filter(seatId => {
          const player = seats.find(s => s.id === seatId);
          return player && checkEvil(player);
        }).length;

        guide = `👁️ 得知：今天死亡的玩家中有${deadEvilCount}名是邪恶的。`;
        speak = `"今天死亡的玩家中有${deadEvilCount}名是邪恶的。"`;
        action = "无";
      }
      break;

    case 'dreamer':
      guide = "💭 每个夜晚，你要选择一名玩家，得知一个善良角色和一个邪恶角色，该玩家是其中一个角色。";
      speak = '"每个夜晚，你要选择除你及旅行者以外的一名玩家：你会得知一个善良角色和一个邪恶角色，该玩家是其中一个角色。"';
      action = "查验";
      break;

    case 'seamstress':
      if (hasUsedAbilityFn && hasUsedAbilityFn('seamstress', currentSeatId)) {
        guide = "一次性能力已用完。";
        speak = '"你的能力已用完。"';
        action = "跳过";
      } else {
        guide = "👗 每局游戏限一次，在夜晚时，你可以选择除你以外的两名玩家：你会得知他们是否为同一阵营。";
        speak = '"每局游戏限一次，在夜晚时，你可以选择除你以外的两名玩家：你会得知他们是否为同一阵营。"';
        action = "查验";
      }
      break;

    case 'philosopher':
      guide = "🧘 每局游戏限一次，在夜晚时，你可以选择一个善良角色：你获得该角色的能力。如果这个角色在场，他醉酒。";
      speak = '"每局游戏限一次，在夜晚时，你可以选择一个善良角色：你获得该角色的能力。如果这个角色在场，他醉酒。"';
      action = "mark";
      break;

    case 'sage':
      if (!targetSeat.isDead || !diedTonight) {
        guide = "你尚未在本夜被恶魔杀死，不会被唤醒。";
        speak = "（摇头示意无效）";
        action = "跳过";
      } else {
        guide = "查验两名玩家，其中一名是杀死你的恶魔。";
        speak = '"请选择两名玩家。其中一名是杀死你的那个恶魔。"';
        action = "inspect";
      }
      break;

    case 'noble':
      if (gamePhase === 'firstNight') {
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
            const evil = getRandom(evilPlayers);
            const good1 = getRandom(goodPlayers);
            const good2 = getRandom(goodPlayers.filter(p => p.id !== good1.id));
            selectedPlayers = [evil, good1, good2].sort(() => Math.random() - 0.5);
          } else {
            selectedPlayers = [...allPlayers].sort(() => Math.random() - 0.5).slice(0, 3);
          }

          if (shouldShowFake) {
            const wrongPlayers = seats.filter(s =>
              s.id !== currentSeatId &&
              !selectedPlayers.some(p => p.id === s.id) &&
              s.role
            );
            const fakePlayers = wrongPlayers.length >= 3
              ? [...wrongPlayers].sort(() => Math.random() - 0.5).slice(0, 3)
              : selectedPlayers;
            guide = `⚠️ [异常] 真实信息：${selectedPlayers.map(p => `${p.id + 1}号`).join('、')}，其中恰好有一名是邪恶的\n请展示错误信息：${fakePlayers.map(p => `${p.id + 1}号`).join('、')}`;
            speak = `"你得知 ${fakePlayers.map(p => `${p.id + 1}号`).join('、')}。其中恰好有一名是邪恶的。"`;
            logMessage = `${currentSeatId + 1}号(贵族) 得知 ${fakePlayers.map(p => `${p.id + 1}号`).join('、')}（假信息）`;
          } else {
            guide = `👀 真实信息: ${selectedPlayers.map(p => `${p.id + 1}号`).join('、')}，其中恰好有一名是邪恶`;
            speak = `"你得知 ${selectedPlayers.map(p => `${p.id + 1}号`).join('、')}。其中恰好有一名是邪恶的。"`;
            logMessage = `${currentSeatId + 1}号(贵族) 得知 ${selectedPlayers.map(p => `${p.id + 1}号`).join('、')}，其中恰好一名是邪恶的`;
          }
          action = "无";
        } else {
          guide = "玩家不足。";
          speak = '"场上玩家不足。"';
          action = "无";
        }
      }
      break;

    case 'balloonist':
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

      const remainingTypes = allTypes.filter(type => !givenTypes.has(type));

      let targetType: RoleType | null = null;
      let targetSeatId: number | null = null;

      if (shouldShowFake) {
        const typesToChooseFrom = givenTypes.size > 0 ? Array.from(givenTypes) : allTypes;
        targetType = getRandom(typesToChooseFrom);
      } else if (remainingTypes.length > 0) {
        targetType = getRandom(remainingTypes);
      } else {
        targetType = getRandom(allTypes);
      }

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
        guide = `🎈 你得知 ${targetSeatId + 1}号，角色类型：${typeNames[targetType]}`;
        speak = `"你得知 ${targetSeatId + 1}号，角色类型：${typeNames[targetType]}。"`;
        action = "无";
        logMessage = `${currentSeatId + 1}号(气球驾驶员) 得知 ${targetSeatId + 1}号，角色类型：${typeNames[targetType]}${shouldShowFake ? '（中毒/酒鬼信息）' : ''}`;
      } else {
        guide = "🎈 无可用信息。";
        speak = '"无可用信息。"';
        action = "无";
      }
      break;

    case 'amnesiac':
      guide = "🧠 每个白天，你可以询问说书人一次猜测，你会得知你的猜测有多准确。";
      speak = '"每个白天，你可以询问说书人一次猜测，你会得知你的猜测有多准确。"';
      action = "无";
      break;

    case 'engineer':
      guide = "🔧 每局游戏一次，选择让恶魔变成你选择的一个恶魔角色，或让所有爪牙变成你选择的爪牙角色。";
      speak = '"每局游戏一次，请选择让恶魔变成你选择的一个恶魔角色，或让所有爪牙变成你选择的爪牙角色。"';
      action = "mark";
      break;

    case 'fisherman':
      guide = "🎣 每局游戏一次，在白天时，你可以询问说书人一些建议来帮助你的团队获胜。";
      speak = '"每局游戏一次，在白天时，你可以询问说书人一些建议来帮助你的团队获胜。"';
      action = "无";
      break;

    case 'ranger':
      guide = "🏔️ 每局游戏一次，选择一名存活的玩家，如果选中了落难少女，她会变成一个不在场的镇民角色。";
      speak = '"请选择一名存活的玩家。如果选中了落难少女，她会变成一个不在场的镇民角色。"';
      action = "mark";
      break;

    case 'farmer':
      guide = "🌾 如果你在夜晚死亡，一名存活的善良玩家会变成农夫。";
      speak = '"如果你在夜晚死亡，一名存活的善良玩家会变成农夫。"';
      action = "无";
      break;

    case 'poppy_grower':
      guide = "🌺 爪牙和恶魔不知道彼此。如果你死亡，他们会在当晚得知彼此。";
      speak = '"爪牙和恶魔不知道彼此。如果你死亡，他们会在当晚得知彼此。"';
      action = "无";
      break;

    case 'atheist':
      guide = "🚫 说书人可以打破游戏规则。如果说书人被处决，好人阵营获胜，即使你已死亡。";
      speak = '"说书人可以打破游戏规则。如果说书人被处决，好人阵营获胜，即使你已死亡。"';
      action = "无";
      break;

    case 'cannibal':
      guide = "🍖 你拥有最后被处决的玩家的能力。如果该玩家是邪恶的，你会中毒直到下一个善良玩家被处决。";
      speak = '"你拥有最后被处决的玩家的能力。如果该玩家是邪恶的，你会中毒直到下一个善良玩家被处决。"';
      action = "无";
      break;

    case 'professor_mr':
      if (gamePhase !== 'firstNight') {
        guide = "🔬 每局游戏一次，选择一名死亡的玩家复活。";
        speak = '"请选择一名死亡的玩家。如果他是镇民，该玩家复活。"';
        action = "revive";
      }
      break;

    case 'snake_charmer_mr':
      guide = "🐍 选择一名存活的玩家，如果选中了恶魔，你和他交换角色和阵营，然后他中毒。";
      speak = '"请选择一名存活的玩家。如果你选中了恶魔，你和他交换角色和阵营，然后他中毒。"';
      action = "mark";
      break;

    case 'savant_mr':
      guide = "📚 每个白天，你可以私下询问说书人以得知两条信息：一个是正确的，一个是错误的。";
      speak = '"每个白天，你可以私下询问说书人以得知两条信息：一个是正确的，一个是错误的。"';
      action = "无";
      break;

    // ========== Outsider (外来者) ==========
    case 'butler':
      guide = "🛎️ 每个夜晚，要选择除你以外的一名玩家作为主人：明天白天，只有他投票时你才能投票。";
      speak = '"请通过手势选择你的主人。指向你选择的玩家，我会确认。"';
      action = "主人";
      break;

    case 'drunk':
    case 'drunk':
      // 酒鬼：不知道自己是酒鬼，以为自己是镇民（逻辑在 effectiveRole 中处理）
      // 这里不需要特殊处理，因为 effectiveRole 已经是伪装角色
      break;

    case 'recluse':
      guide = "🏞️ 你可能会被当作邪恶阵营、爪牙角色或恶魔角色，即使你已死亡。";
      speak = '"你可能会被当作邪恶阵营、爪牙角色或恶魔角色，即使你已死亡。"';
      action = "无";
      break;

    case 'saint':
      guide = "😇 如果你死于处决，你的阵营落败。";
      speak = '"如果你死于处决，你的阵营落败。"';
      action = "无";
      break;

    case 'tinker':
      guide = "🔧 你随时可能死亡。";
      speak = '"你随时可能死亡。"';
      action = "无";
      break;

    case 'moonchild':
      guide = "🌙 当你得知你死亡时，你要公开选择一名存活的玩家。如果他是善良的，在当晚 he 会死亡。";
      speak = '"当你得知你死亡时，你要公开选择一名存活的玩家。如果他是善良的，在当晚他会死亡。"';
      action = "无";
      break;

    case 'goon':
      guide = "🥊 每个夜晚，首个使用其自身能力选择了你的玩家会醉酒直到下个黄昏。你会转变为他的阵营。";
      speak = '"每个夜晚，首个使用其自身能力选择了你的玩家会醉酒直到下个黄昏。你会转变为他的阵营。"';
      action = "无";
      break;

    case 'lunatic':
      guide = "🤪 你以为你是一个恶魔，但其实你不是。恶魔知道你是疯子以及你在每个夜晚选择了哪些玩家。";
      speak = '"你以为你是一个恶魔，但其实你不是。恶魔知道你是疯子以及你在每个夜晚选择了哪些玩家。"';
      action = "无";
      break;

    case 'virgin':
    case 'slayer':
    case 'soldier':
    case 'mayor':
    case 'grandmother':
    case 'sailor':
    case 'chambermaid':
    case 'exorcist':
    case 'gambler':
    case 'gossip':
    case 'courtier':
    case 'professor':
    case 'minstrel':
    case 'tea_lady':
    case 'pacifist':
    case 'fool':
    case 'mutant':
    case 'sweetheart':
    case 'barber':
    case 'barber_mr':
    case 'klutz':
    case 'damsel':
      // 落难少女：所有爪牙都知道落难少女在场
      if (effectiveRole.id === 'damsel' && gamePhase === 'firstNight') {
        guide = "👸 所有爪牙都知道落难少女在场。";
        speak = '"所有爪牙都知道落难少女在场。"';
        action = "告知";
      } else {
        guide = "💤 无行动。";
        speak = "（无）";
        action = "跳过";
      }
      break;

    case 'golem':
    case 'artist':
      guide = "🎨 每个白天，你可以选择一名玩家，然后私下向说书人提一个关于他的“是/否”问题。";
      speak = '"每个白天，你可以选择一名玩家，然后私下向说书人提一个关于他的“是/否”问题。"';
      action = "无";
      break;
    case 'juggler':
      guide = "🤹 每局游戏一次，你可以私下选择3名玩家：说书人会告知你这3名玩家中是否有任何恶魔或爪牙。";
      speak = '"每局游戏一次，你可以私下选择3名玩家：说书人会告知你这3名玩家中是否有任何恶魔或爪牙。"';
      action = "无";
      break;

    case 'doomsayer':
      guide = "🌅 如果大于等于四名玩家存活，每名当前存活的玩家可以公开要求你杀死一名与他阵营相同的玩家（每名玩家限一次）。";
      speak = '"如果大于等于四名玩家存活，每名当前存活的玩家可以公开要求你杀死一名与他阵营相同的玩家（每名玩家限一次）。"';
      action = "无";
      break;

    case 'toymaker':
      guide = "🧸 恶魔可以在夜晚选择放弃攻击（每局游戏至少一次）。邪恶玩家照常获取初始信息。";
      speak = '"恶魔可以在夜晚选择放弃攻击（每局游戏至少一次）。邪恶玩家照常获取初始信息。"';
      action = "无";
      break;

    case 'angel':
      guide = "👼 对新玩家的死亡负最大责任的人，可能会遭遇一些不好的事情。";
      speak = '"对新玩家的死亡负最大责任的人，可能会遭遇一些不好的事情。"';
      action = "无";
      break;

    case 'buddhist':
      guide = "🧘 每个白天的前两分钟老玩家不能发言。";
      speak = '"每个白天的前两分钟老玩家不能发言。"';
      action = "无";
      break;

    case 'revolutionary':
      guide = "🤝 公开声明一对邻座玩家本局游戏一直保持同一阵营。每局游戏限一次，他们中的一人可能被当作其他的角色/阵营。";
      speak = '"公开声明一对邻座玩家本局游戏一直保持同一阵营。每局游戏限一次，他们中的一人可能被当作其他的角色/阵营。"';
      action = "无";
      break;

    case 'hells_librarian':
      guide = "🤫 当说书人宣布安静时，仍在说话的玩家可能会遭遇一些不好的事情。";
      speak = '"当说书人宣布安静时，仍在说话的玩家可能会遭遇一些不好的事情。"';
      action = "无";
      break;

    case 'fiddler':
      guide = "🎻 每局游戏限一次，恶魔可以秘密选择一名对立阵营的玩家，所有玩家要表决：这两名玩家中谁的阵营获胜。（平局邪恶阵营获胜）";
      speak = '"每局游戏限一次，恶魔可以秘密选择一名对立阵营的玩家，所有玩家要表决：这两名玩家中谁的阵营获胜。（平局邪恶阵营获胜）"';
      action = "无";
      break;

    case 'fibbin':
      guide = "🤥 每局游戏限一次，一名善良玩家可能会得知“有问题”的信息。";
      speak = '"每局游戏限一次，一名善良玩家可能会得知“有问题”的信息。"';
      action = "无";
      break;

    case 'duchess':
      guide = "👑 每个白天，三名玩家可以一起拜访你。当晚*，他们会得知他们之中有几个是邪恶的，但其中一人的信息是错的。";
      speak = '"每个白天，三名玩家可以一起拜访你。当晚，他们会得知他们之中有几个是邪恶的，但其中一人的信息是错的。"';
      action = "无";
      break;

    case 'sentinel':
      guide = "💂 在初始设置时，可能会额外增加或减少一个外来者. ";
      speak = '"在初始设置时，可能会额外增加或减少一个外来者。"';
      action = "无";
      break;

    case 'spirit_of_ivory':
      guide = "✨ 游戏过程中邪恶玩家的总数最多能比初始设置多一名。";
      speak = '"游戏过程中邪恶玩家的总数最多能比初始设置多一名。"';
      action = "无";
      break;

    case 'djinn':
      guide = " Genie phase placeholders. ";
      speak = '"使用灯神的相克规则。所有玩家都会知道其内容。"';
      action = "无";
      break;

    case 'deus_ex_fiasco':
      guide = "😅 每局游戏至少一次，说书人将会出现失误，但会纠正并公开承认自己曾处理有误。";
      speak = '"每局游戏至少一次，说书人将会出现失误，但会纠正并公开承认自己曾处理有误。"';
      action = "无";
      break;

    case 'ferryman':
      guide = "🚣 在游戏的最后一天，所有已死亡玩家会重新获得投票标记. ";
      speak = '"在游戏的最后一天，所有已死亡玩家会重新获得投票标记。"';
      action = "无";
      break;

    default:
      // 处理通用的爪牙首夜逻辑（对于没有特定处理的爪牙角色）
      if (effectiveRole.type === 'minion' && gamePhase === 'firstNight') {
        // 爪牙首夜：集中唤醒所有爪牙，互认恶魔与彼此（除非罂粟种植者在场且存活）
        const poppyGrower = seats.find(s => s.role?.id === 'poppy_grower');
        const shouldHideDemon = poppyGrower && !poppyGrower.isDead && poppyGrowerDead === false;

        if (shouldHideDemon) {
          guide = `🌺 罂粟种植者在场，本局爪牙和恶魔互相不知道彼此身份。\n\n操作提示：你现在不需要叫醒爪牙。`;
          speak = `"罂粟种植者在场，你不知道恶魔是谁，也不会在本局中得知爪牙和恶魔的具体位置。"`;
          action = "无信息";
        } else {
          // 找到恶魔（包括小恶魔继任者）
          const demons = seats.filter(s =>
            (s.role?.type === 'demon' || s.isDemonSuccessor)
          ).map(s => `${s.id + 1}号`);
          const minions = seats.filter(s => s.role?.type === 'minion').map(s => `${s.id + 1}号`);
          const demonText = demons.length > 0 ? demons.join('、') : '无';
          const minionText = minions.length > 0 ? minions.join('、') : '无';
          guide = `👿 爪牙认恶魔环节（集中唤醒）：\n1. 现在请一次性叫醒所有爪牙座位：${minionText}。\n2. 用手指向恶魔座位：${demonText}，让所有爪牙知道恶魔的座位号。\n3. （可选）如果你希望他们彼此也知道谁是爪牙，可同时指示爪牙的座位号：${minionText}。\n4. 确认所有爪牙都清楚恶魔的座位号，然后同时让他们闭眼。`;
          speak = `"现在请你一次性叫醒所有爪牙，并指向恶魔。恶魔在 ${demonText} 号。确认所有爪牙都知道恶魔的座位号后，再让他们一起闭眼。"`;
          action = "展示恶魔";
        }
      } else {
        // 其他没有夜晚行动的角色
        guide = "💤 无行动。";
        speak = "（无）";
        action = "跳过";
      }
      break;
  }

  // 首夜提示：镇民酒鬼的假信息说明
  if (gamePhase === 'firstNight' && targetSeat.role?.id === 'drunk' && effectiveRole.type === 'townsfolk') {
    guide = `${guide}\n\n注意：此玩家真实身份是【酒鬼 (Drunk)】，本次为"假${effectiveRole.name}"信息，系统已按酒鬼中毒规则生成可能错误的信息。`;
  }

  // 修复：首晚小恶魔没有技能，将 nightActionType 设置为 'none'
  let finalEffectiveRole = effectiveRole;
  if (effectiveRole.id === 'imp' && gamePhase === 'firstNight') {
    finalEffectiveRole = { ...effectiveRole, nightActionType: 'none' };
  }

  // 如果已经设置了 guide, speak, action，根据中毒状态可能需要修改为虚假信息
  if (guide || speak || action) {
    // 如果中毒且应该显示虚假信息，则生成虚假版本
    if (shouldShowFake && (isPoisoned || isDrunk)) {
      const fakeInfo = generateFakeNightInfo(effectiveRole.id, guide, speak, seats, currentSeatId, roles, selectedScript);
      if (fakeInfo) {
        guide = fakeInfo.guide;
        speak = fakeInfo.speak;
      }
      // 在guide中添加中毒提示
      guide = `${guide}\n\n⚠️ 此玩家处于中毒/醉酒状态，获得的信息可能是虚假的！`;
    }

    return { seat: targetSeat, effectiveRole: finalEffectiveRole, isPoisoned, reason, guide, speak, action };
  }

  return null;
};

// 生成虚假的夜晚信息（用于中毒或醉酒状态）
function generateFakeNightInfo(roleId: string, originalGuide: string, originalSpeak: string, seats: Seat[], currentSeatId: number, roles: Role[], selectedScript: Script | null): { guide: string, speak: string } | null {
  switch (roleId) {
    case 'washerwoman':
      // 洗衣妇虚假信息：错误的座位号 + 当前场上不存在的镇民角色信息
      // 座位号可能包含邪恶阵营
      const potentialFakePlayers = seats.filter(s => s.id !== currentSeatId);
      if (potentialFakePlayers.length >= 2) {
        // 随机选择两个玩家（可能是邪恶阵营，且逻辑上这两玩家都不应该是我们要提到的那个角色）
        const shuffled = [...potentialFakePlayers].sort(() => Math.random() - 0.5);
        const player1 = shuffled[0].id + 1;
        const player2 = shuffled[1].id + 1;

        // 随机选择一个不在场上的【镇民】角色（必须属于当前剧本）
        const usedRoleIds = seats.map(s => s.role?.id).filter(Boolean);
        const scriptRoles: Role[] = selectedScript
          ? roles.filter(r => r.script === selectedScript.name || r.script === selectedScript.id)
          : roles;

        const availableTownsfolkRoles: Role[] = scriptRoles.filter(
          (r: Role) => r.type === 'townsfolk' && !usedRoleIds.includes(r.id)
        );

        const fakeRole: Role | undefined = availableTownsfolkRoles.length > 0
          ? getRandom(availableTownsfolkRoles)
          : roles.find((r: Role) => r.type === 'townsfolk' && !usedRoleIds.includes(r.id)) || roles.find((r: Role) => r.type === 'townsfolk');

        return {
          guide: `🧺 洗衣妇虚假信息：${player1}号、${player2}号中存在（镇民）${fakeRole?.name || '未知镇民'}。\n（注：错误的座位号 + 场上不存在的角色）`,
          speak: `"${player1}号、${player2}号中存在（镇民）${fakeRole?.name || '未知镇民'}。"`
        };
      }
      break;

    case 'librarian':
      // 图书管理员虚假信息：错误的座位号 + 当前场上不存在的外来者角色信息
      const potentialFakePlayersLib = seats.filter(s => s.id !== currentSeatId);
      if (potentialFakePlayersLib.length >= 2) {
        const shuffled = [...potentialFakePlayersLib].sort(() => Math.random() - 0.5);
        const player1 = shuffled[0].id + 1;
        const player2 = shuffled[1].id + 1;

        // 随机选择一个不在场上的【外来者】角色（必须属于当前剧本）
        const usedRoleIds = seats.map(s => s.role?.id).filter(Boolean);
        const scriptRoles: Role[] = selectedScript
          ? roles.filter(r => r.script === selectedScript.name || r.script === selectedScript.id)
          : roles;

        const availableOutsiderRoles: Role[] = scriptRoles.filter(
          (r: Role) => r.type === 'outsider' && !usedRoleIds.includes(r.id)
        );

        const fakeRole: Role | undefined = availableOutsiderRoles.length > 0
          ? getRandom(availableOutsiderRoles)
          : roles.find((r: Role) => r.type === 'outsider' && !usedRoleIds.includes(r.id)) || roles.find((r: Role) => r.type === 'outsider');

        return {
          guide: `📚 图书管理员虚假信息：${player1}号、${player2}号中存在（外来者）${fakeRole?.name || '未知外来者'}。\n（注：错误的座位号 + 场上不存在的角色）`,
          speak: `"${player1}号、${player2}号中存在（外来者）${fakeRole?.name || '未知外来者'}。"`
        };
      }
      break;

    case 'investigator':
      // 调查员虚假信息：错误的座位号 + 当前场上不存在的爪牙角色信息
      const potentialFakePlayersInv = seats.filter(s => s.id !== currentSeatId);
      if (potentialFakePlayersInv.length >= 2) {
        const shuffled = [...potentialFakePlayersInv].sort(() => Math.random() - 0.5);
        const player1 = shuffled[0].id + 1;
        const player2 = shuffled[1].id + 1;

        // 随机选择一个不在场上的【爪牙】角色（必须属于当前剧本）
        const usedRoleIds = seats.map(s => s.role?.id).filter(Boolean);
        const scriptRoles: Role[] = selectedScript
          ? roles.filter(r => r.script === selectedScript.name || r.script === selectedScript.id)
          : roles;

        const availableMinionRoles: Role[] = scriptRoles.filter(
          (r: Role) => r.type === 'minion' && !usedRoleIds.includes(r.id)
        );

        const fakeRole: Role | undefined = availableMinionRoles.length > 0
          ? getRandom(availableMinionRoles)
          : roles.find((r: Role) => r.type === 'minion' && !usedRoleIds.includes(r.id)) || roles.find((r: Role) => r.type === 'minion');

        return {
          guide: `🔍 调查员虚假信息：${player1}号、${player2}号中存在（爪牙）${fakeRole?.name || '未知爪牙'}。\n（注：错误的座位号 + 场上不存在的角色）`,
          speak: `"${player1}号、${player2}号中存在（爪牙）${fakeRole?.name || '未知爪牙'}。"`
        };
      }
      break;

    case 'chef':
    case 'empath':
      // 厨师长/共情者：给出错误的邻座邪恶玩家数量（0、1或2中的随机值）
      const fakeEvilCount = Math.floor(Math.random() * 3); // 0, 1, 或 2
      return {
        guide: `👨‍🍳 得知：邻近的两名存活玩家中，有${fakeEvilCount}名邪恶玩家。（虚假信息）`,
        speak: `"邻近的两名存活玩家中，有${fakeEvilCount}名邪恶玩家。"`
      };

    case 'fortune_teller':
      // 占卜师：给出相反的结果
      const isFakeDemon = Math.random() < 0.5; // 随机决定是或否
      return {
        guide: `🔮 得知：${isFakeDemon ? '✅ 是' : '❌ 否'}，两名玩家之中有恶魔。（虚假信息）`,
        speak: `"${isFakeDemon ? '是' : '否'}，两名玩家之中有恶魔。"`
      };

    case 'undertaker':
      // 掘墓人：如果有处决，给出一个假的角色
      const allRoles = roles.filter(r => r.type !== 'traveler');
      const fakeExecutedRole = allRoles[Math.floor(Math.random() * allRoles.length)];
      return {
        guide: `⚰️ 得知：今天被处决的玩家是${fakeExecutedRole.name}。（虚假信息）`,
        speak: `"今天被处决的玩家是${fakeExecutedRole.name}。"`
      };

    default:
      // 对于其他角色，返回原始信息但加上虚假标记
      return {
        guide: `${originalGuide}（可能为虚假信息）`,
        speak: originalSpeak
      };
  }
  return null;
}

// 通用的“哑巴引擎”夜间时间线生成器（基于角色元数据，无角色ID硬编码）
export const generateNightTimeline = (
  seats: Seat[],
  isFirstNight: boolean
): TimelineStep[] => {
  const steps: TimelineStep[] = [];

  // NOTE:
  // 运行时的 seat.role 来自 app/data.ts 中的 roles 数组，
  // 其中 **不包含** 首夜 / 其他夜晚的元数据与顺位。
  // 真正的夜晚元数据保存在 src/data/rolesData.json 中。
  //
  // 这里通过 role.id 将这两份数据在内存中合并，保证夜晚时间线
  // 与测试里的 getRole 合并逻辑保持一致。

  type MetaRole = {
    id: string;
    firstNightMeta?: any;
    otherNightMeta?: any;
    firstNightOrder?: number;
    otherNightOrder?: number;
  };

  const metaRoles = troubleBrewingRolesData as MetaRole[];

  const getMergedRoleMeta = (baseRole: Role | null | undefined) => {
    if (!baseRole) return { role: null as Role | null, firstMeta: null, otherMeta: null, firstOrder: 9999, otherOrder: 9999 };
    const meta = metaRoles.find((r) => r.id === baseRole.id);
    const firstMeta = meta?.firstNightMeta ?? (baseRole as any).firstNightMeta ?? null;
    const otherMeta = meta?.otherNightMeta ?? (baseRole as any).otherNightMeta ?? null;
    const firstOrder =
      meta?.firstNightOrder ??
      ((baseRole as any).firstNightOrder as number | undefined) ??
      9999;
    const otherOrder =
      meta?.otherNightOrder ??
      ((baseRole as any).otherNightOrder as number | undefined) ??
      9999;
    return { role: baseRole, firstMeta, otherMeta, firstOrder, otherOrder };
  };

  // 1. 识别需要在本夜被唤醒的角色
  //    支持死亡角色被唤醒（如果元数据允许，如 Zombuul）
  const activeSeats = seats.filter((seat) => {
    if (!seat.role) return false;

    // 对于酒鬼，使用伪装身份而不是真实身份
    const effectiveRole = seat.role.id === 'drunk' && seat.charadeRole ? seat.charadeRole : seat.role;
    const merged = getMergedRoleMeta(effectiveRole);
    const meta = isFirstNight ? merged.firstMeta : merged.otherMeta;

    // 1. 存活的玩家，如果该夜有元数据则视为可唤醒
    if (!seat.isDead && meta) return true;

    // 2. 已死亡：检查元数据是否允许死亡时也被唤醒
    if (seat.isDead && meta && meta.wakesIfDead === true) return true;

    // 3. 兼容旧逻辑：hasAbilityEvenDead 标记
    if (seat.hasAbilityEvenDead) return true;

    return false;
  });

  // 2. 按首夜 / 其他夜晚顺序排序
  activeSeats.sort((a, b) => {
    // 对于酒鬼，使用伪装身份而不是真实身份
    const aEffectiveRole = a.role && a.role.id === 'drunk' && a.charadeRole ? a.charadeRole : a.role;
    const bEffectiveRole = b.role && b.role.id === 'drunk' && b.charadeRole ? b.charadeRole : b.role;

    const aMerged = getMergedRoleMeta(aEffectiveRole);
    const bMerged = getMergedRoleMeta(bEffectiveRole);

    const orderA = isFirstNight ? aMerged.firstOrder : aMerged.otherOrder;
    const orderB = isFirstNight ? bMerged.firstOrder : bMerged.otherOrder;

    return orderA - orderB;
  });

  // 3. 生成时间线步骤
  activeSeats.forEach((seat, index) => {
    // 对于酒鬼，使用伪装身份而不是真实身份
    const effectiveRole = seat.role && seat.role.id === 'drunk' && seat.charadeRole ? seat.charadeRole : seat.role;
    const merged = getMergedRoleMeta(effectiveRole);
    const role = merged.role;
    const meta = isFirstNight ? merged.firstMeta : merged.otherMeta;

    // 没有对应夜晚的元数据，则本夜不唤醒该角色
    if (!role || !meta || !effectiveRole) return;
    console.log(`[generateNightTimeline] Role: ${role.name}, meta.targetType: ${meta.targetType}, meta.amount: ${meta.amount}`);

    steps.push({
      id: `step_${seat.id}_${effectiveRole.id}_${isFirstNight ? '1' : 'n'}`,
      type: 'character',
      seatId: seat.id,
      roleId: effectiveRole.id,
      order: index,
      content: {
        title: role.name,
        script: meta.script,
        instruction: meta.instruction,
      },
      interaction: {
        type: meta.targetType === 'player' ? 'choosePlayer' : 'none',
        amount: meta.amount,
        required: meta.required,
        canSelectSelf: meta.canSelectSelf,
        canSelectDead: meta.canSelectDead,
        effect: {
          type: meta.effectType || 'none',
          value: meta.effectValue,
        },
      },
    });
  });

  // 4. FORCE DAWN STEP - Always add at the end
  // Ensure the "Dawn" step is ALWAYS added at the end, even if no roles have night actions
  steps.push({
    id: 'dawn_step',
    type: 'dawn',
    order: 99999,
    content: {
      title: '天亮了',
      script: '所有玩家请睁眼',
      instruction: '点击下方按钮进入白天阶段',
    },
    interaction: {
      type: 'none',
      amount: 0,
      required: false,
      canSelectSelf: false,
      canSelectDead: false,
      effect: { type: 'none' }
    }
  });

  // Safety check: If somehow steps is still empty (shouldn't happen), return at least dawn
  if (steps.length === 0) {
    console.warn('[generateNightTimeline] No steps generated, returning minimal dawn step');
    return [{
      id: 'dawn_step',
      type: 'dawn',
      order: 99999,
      content: {
        title: '天亮了',
        script: '所有玩家请睁眼',
        instruction: '点击下方按钮进入白天阶段',
      },
      interaction: {
        type: 'none',
        amount: 0,
        required: false,
        canSelectSelf: false,
        canSelectDead: false,
        effect: { type: 'none' }
      }
    }];
  }

  return steps;
};

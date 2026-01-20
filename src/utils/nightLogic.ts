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
  addLogCb?: (msg: string) => void,
  registrationCache?: Map<string, RegistrationResult>,
  registrationCacheKey?: string,
  vortoxWorld?: boolean,
  demonVotedToday?: boolean,
  minionNominatedToday?: boolean,
  executedToday?: number | null,
  hasUsedAbilityFn?: (roleId: string, seatId: number) => boolean,
  votedThisRound?: number[] // NEW: List of seat IDs who voted this round (for Flowergirl/Town Crier)
): { seat: Seat; effectiveRole: Role; isPoisoned: boolean; reason?: string; guide: string; speak: string; action: string } | null => {
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

  // 检测能力描述中是否包含"选择"关键词
  // 规则：如果能力描述中没有"选择"一词，这项能力就由说书人来做出选择
  const abilityText = effectiveRole.ability || '';
  const hasChoiceKeyword = abilityText.includes('选择') || abilityText.includes('选择');

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

  let guide = "", speak = "", action = "";

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
          const minions = seats.filter(s => s.role?.type === 'minion').map(s => `${s.id+1}号`);
          guide = `👿 爪牙列表：${minions.length > 0 ? minions.join(', ') : '无'}。`;
          speak = `"${minions.length > 0 ? `你的爪牙是 ${minions.join('、')}。` : '场上没有爪牙。'}请确认你的爪牙。"`;
          action = "展示爪牙";
        }
      } else {
        guide = "👉 让小恶魔选人杀害。";
        speak = '"请选择一名玩家杀害。你可以选择任意一名活着的玩家，但不能选择自己。"';
        action = "杀害";
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
          // 如果上一个黄昏有处决，僵怖不应该被唤醒
          guide = "💤 今天白天有人死亡或处决，无需行动。";
          speak = '"今天白天有人死亡或处决，你无需行动。"';
          action = "跳过";
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
          const minions = seats.filter(s => s.role?.type === 'minion' && s.id !== currentSeatId).map(s => `${s.id+1}号`);
          guide = `👿 爪牙列表：${minions.length > 0 ? minions.join(', ') : '无'}。`;
          speak = `"${minions.length > 0 ? `你的爪牙是 ${minions.join('、')}。` : '场上没有爪牙。'}请确认你的爪牙。"`;
          action = "展示";
        }
      } else {
        guide = "⚔️ 选择两名玩家：他们死亡。你的上个夜晚选择过且当前死亡的玩家之一可能会被你反刍。\n\n提示：本工具当前仅自动处理\"每夜杀两人\"，尚未实现沙巴洛斯的复活（反刍）效果，请说书人按规则手动裁定是否复活。"; 
        speak = '"请选择两名玩家，他们会在今晚死亡。（本工具暂未实现偶尔复活的部分，请你按规则手动裁定。）"'; 
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
          const minions = seats.filter(s => s.role?.type === 'minion' && s.id !== currentSeatId).map(s => `${s.id+1}号`);
          guide = `👿 爪牙列表：${minions.length > 0 ? minions.join(', ') : '无'}。`;
          speak = `"${minions.length > 0 ? `你的爪牙是 ${minions.join('、')}。` : '场上没有爪牙。'}请确认你的爪牙。"`;
          action = "展示";
        }
      } else {
        guide = "⚔️ 珀：你可以选择一名玩家杀死；如果你选择本夜不杀任何玩家，则本夜不会有人因你而死，但下一夜你必须选择三名玩家杀死。\n\n操作提示：\n- 若你想\"本夜不杀（蓄力）\"，请不要选择任何目标，直接点击下方\"确认 / 下一步\"；\n- 若你上次已经选择不杀人，本夜应选择三名不同的玩家作为目标。"; 
        speak = '"你可以选择一名玩家杀死；如果你本夜不选择任何玩家，下一个夜晚你必须选择三名玩家杀死。"'; 
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
      break;

    case 'vigormortis_mr':
      // 亡骨魔（夜半狂欢）：每晚选择一名玩家，他死亡。被你杀死的爪牙保留他的能力，且与他邻近的两名镇民之一中毒
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
      break;

    // ========== Minion (爪牙) ==========
    case 'poisoner':
      guide = "🧪 选择一名玩家下毒（当晚+次日白天中毒，次日黄昏清除）。"; 
      speak = '"请选择一名玩家下毒。他当晚和明天白天都会中毒，在次日黄昏清除。"' ; 
      action = "投毒";
      break;

    case 'spy':
      guide = "📖 间谍查看魔典。"; 
      speak = '"请查看魔典。"'; 
      action = "展示";
      break;

    case 'poisoner_mr':
      // 投毒者（夜半狂欢）：每晚选择一名玩家，他当晚和明天白天中毒
      guide = "🧪 选择一名玩家：他当晚和明天白天中毒。"; 
      speak = '"请选择一名玩家。他当晚和明天白天中毒。"'; 
      action = "poison";
      break;

    case 'witch':
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

    case 'pit_hag_mr':
      // 麻脸巫婆（夜半狂欢）：每晚选择一名玩家和一个角色；如果该角色不在场，他变成该角色
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
        action = "告知";
      }
      break;

    case 'lunatic_mr':
      // 精神病患者：每个白天，在提名开始前，可以公开选择一名玩家死亡
      guide = "🔪 每个白天，在提名开始前，你可以公开选择一名玩家：他死亡。如果你被处决，提名你的玩家必须和你玩石头剪刀布；只有你输了才会死亡。"; 
      speak = '"每个白天，在提名开始前，你可以公开选择一名玩家。他死亡。如果你被处决，提名你的玩家必须和你玩石头剪刀布；只有你输了才会死亡。"'; 
      action = "告知";
      break;

    case 'godfather':
      // 教父：首夜得知有哪些外来者角色在场。如果有外来者在白天死亡，你会在当晚被唤醒并且你要选择一名玩家：他死亡。
      if (gamePhase === 'firstNight') {
        const outsiderRoles = seats
          .filter(s => s.role?.type === 'outsider' && s.role)
          .map(s => s.role!.name)
          .filter((name, idx, arr) => arr.indexOf(name) === idx); // 去重
        guide = `👔 首夜得知外来者角色：${outsiderRoles.length > 0 ? outsiderRoles.join('、') : '无外来者'}`;
        speak = `"场上的外来者角色是：${outsiderRoles.length > 0 ? outsiderRoles.join('、') : '没有外来者'}。"`;
        action = "告知";
      } else {
        // 非首夜：如果有外来者在白天死亡，会被唤醒
        guide = "⚔️ 如果有外来者在白天死亡，选择一名玩家：他死亡。";
        speak = '"如果有外来者在白天死亡，请选择一名玩家。他死亡。"';
        action = "kill";
      }
      break;

    case 'devils_advocate':
      // 魔鬼代言人：每晚选择一名存活的玩家(与上个夜晚不同)：如果明天白天他被处决，他不会死亡。
      guide = "⚖️ 选择一名存活的玩家(与上个夜晚不同)：如果明天白天他被处决，他不会死亡。"; 
      speak = '"请选择一名存活的玩家(与上个夜晚不同)。如果明天白天他被处决，他不会死亡。"'; 
      action = "mark";
      break;

    case 'assassin':
      // 刺客：每局游戏限一次，在夜晚时，你可以选择一名玩家：他死亡，即使因为任何原因让他不会死亡。
      if (hasUsedAbilityFn && hasUsedAbilityFn('assassin', currentSeatId)) {
        guide = "一次性能力已用完。";
        speak = '"你的能力已用完。"';
        action = "跳过";
      } else {
        guide = "🗡️ 每局游戏限一次，选择一名玩家：他死亡，即使因为任何原因让他不会死亡。"; 
        speak = '"每局游戏限一次，请选择一名玩家。他死亡，即使因为任何原因让他不会死亡。"'; 
        action = "kill";
      }
      break;

    // ========== Townsfolk (镇民) ==========
    case 'washerwoman':
      if (gamePhase === 'firstNight') {
        try {
          // 洗衣妇：首夜得知一名村民的具体身份，并被告知该村民在X号或Y号（其中一个是真实的，另一个是干扰项）
          const townsfolkSeats = seats.filter(s => s.role?.type === 'townsfolk' && s.role && s.id !== currentSeatId);
          
          if (townsfolkSeats.length === 0) {
            guide = "🚫 根据当前角色配置，本局实际上没有镇民 (Townsfolk)。\n你应当告诉【洗衣妇】：'本局游戏中没有镇民。' 请直接使用这句台词，不要编造虚假的两名玩家。";
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
                const wrongSeats = seats.filter(s => 
                  s.id !== currentSeatId && 
                  s.id !== realTownsfolk.id && 
                  s.id !== decoySeat.id &&
                  s.role?.id !== wrongRole.id
                );
                
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
                
                // 最终验证：确保两个座位号上的角色都不是错误角色
                let finalWrongSeat1 = wrongSeat1;
                let finalWrongSeat2 = wrongSeat2;
                
                if (finalWrongSeat1.role?.id === wrongRole.id) {
                  const alternative = shuffledSeats.find(s => s.id !== finalWrongSeat1.id && s.role?.id !== wrongRole.id);
                  if (alternative) finalWrongSeat1 = alternative;
                }
                
                if (finalWrongSeat2.role?.id === wrongRole.id) {
                  const alternative = shuffledSeats.find(s => s.id !== finalWrongSeat2.id && s.id !== finalWrongSeat1.id && s.role?.id !== wrongRole.id);
                  if (alternative) finalWrongSeat2 = alternative;
                }
                
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
      }
      break;

    case 'librarian':
      if (gamePhase === 'firstNight') {
        try {
          // 图书管理员：首夜得知一名外来者的具体身份，并被告知该外来者在X号或Y号（其中一个是真实的，另一个是干扰项）
          const outsiderSeats = seats.filter(s => s.role?.type === 'outsider' && s.role && s.id !== currentSeatId);
          
          if (outsiderSeats.length === 0) {
            guide = "🚫 根据当前角色配置，本局实际上没有外来者 (Outsiders)。\n你应当告诉【图书管理员】：'本局游戏中没有外来者。' 请直接使用这句台词，不要编造虚假的两名玩家。";
            speak = '"本局游戏中没有外来者。"';
            action = "告知";
          } else if(outsiderSeats.length > 0 && seats.length >= 2) {
            // 正常时：从场上实际存在的外来者中随机选择一个
            const validOutsiders = outsiderSeats.filter(s => s.role !== null);
            if (validOutsiders.length === 0) {
              guide = "🚫 根据当前角色配置，本局实际上没有外来者 (Outsiders)。\n你应当告诉【图书管理员】：'本局游戏中没有外来者。' 请直接使用这句台词，不要编造虚假的两名玩家。"; 
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
                const allOutsiderRoles = roles.filter(r => r.type === 'outsider' && r.id !== effectiveRole.id && !r.hidden);
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
      }
      break;

    case 'investigator':
      if (gamePhase === 'firstNight') {
        // 调查员：首夜得知一名爪牙的具体身份，并被告知该爪牙在X号或Y号（其中一个是真实的，另一个是干扰项）
        // 使用注册判定：只包含被注册为爪牙的玩家（考虑间谍的伪装与隐士的干扰）
        const minionSeats = seats.filter(s => 
          s.role && 
          s.id !== currentSeatId &&
          getCachedRegistration(s, effectiveRole).registersAsMinion
        );
        
        if (minionSeats.length === 0) {
          guide = "🚫 根据当前角色配置，本局实际上没有爪牙 (Minions)。\n你应当告诉【调查员】：'本局游戏中没有爪牙。' 请直接使用这句台词，不要编造虚假的两名玩家。";
          speak = '"本局游戏中没有爪牙。"';
          action = "告知";
        } else if(minionSeats.length > 0 && seats.length >= 2) {
          // 正常时：随机选择一个实际存在的爪牙，确保角色存在
          const validMinions = minionSeats.filter(s => s.role !== null);
          if (validMinions.length === 0) {
            guide = "🚫 根据当前角色配置，本局实际上没有爪牙 (Minions)。\n你应当告诉【调查员】：'本局游戏中没有爪牙。' 请直接使用这句台词，不要编造虚假的两名玩家。"; 
            speak = '"本局游戏中没有爪牙。"';
            action = "告知";
          } else {
            const realMinion = getRandom(validMinions);
            const realRole = realMinion.role!; // 此时确保不为null
            
            // 真实爪牙的座位号
            const realSeatNum = realMinion.id + 1;
            
            // 选择干扰项座位：从全场所有座位中随机选择（不能是自己，不能是真实爪牙的座位）
            const availableSeats = seats.filter(s => s.id !== currentSeatId && s.id !== realMinion.id);
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
              const allMinionRoles = roles.filter(r => r.type === 'minion' && r.id !== effectiveRole.id && !r.hidden);
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
              const goodSeats = seats.filter(s => {
                if (!s.role || s.id === currentSeatId || s.id === realMinion.id || s.id === decoySeat.id) return false;
                if (isEvil(s)) return false;
                return (s.role.type === 'townsfolk' || s.role.type === 'outsider') && s.role.id !== wrongRole.id;
              });
              
              const fallbackGoodSeats = seats.filter(s => {
                if (!s.role || s.id === currentSeatId || s.id === realMinion.id || s.id === decoySeat.id) return false;
                if (isEvil(s)) return false;
                return s.role.type === 'townsfolk' || s.role.type === 'outsider';
              });
              
              const allAvailableSeats = seats.filter(s => {
                if (!s.role || s.id === currentSeatId || s.id === realMinion.id || s.id === decoySeat.id) return false;
                return s.role.id !== wrongRole.id;
              });
              
              // 优先使用善良玩家，如果不够则使用所有可用座位
              let availableGoodSeats = goodSeats.length >= 2 ? goodSeats : fallbackGoodSeats;
              if (availableGoodSeats.length < 2) {
                availableGoodSeats = allAvailableSeats.length >= 2 ? allAvailableSeats : fallbackGoodSeats.length > 0 ? fallbackGoodSeats : allAvailableSeats;
              }
              
              if (availableGoodSeats.length === 0) {
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
                  finalWrongSeat1 = decoySeat;
                }
              }
              
              if (finalWrongSeat2.role?.id === wrongRole.id) {
                const alternative = shuffledSeats.find(s => s.id !== finalWrongSeat2.id && s.id !== finalWrongSeat1.id && s.role?.id !== wrongRole.id);
                if (alternative) {
                  finalWrongSeat2 = alternative;
                } else {
                  finalWrongSeat2 = finalWrongSeat1.id !== decoySeat.id ? decoySeat : finalWrongSeat1;
                }
              }
              
              // 如果两个座位相同，尝试找不同的座位
              if (finalWrongSeat1.id === finalWrongSeat2.id && shuffledSeats.length > 1) {
                const differentSeat = shuffledSeats.find(s => s.id !== finalWrongSeat1.id);
                if (differentSeat) {
                  finalWrongSeat2 = differentSeat;
                } else {
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
          guide = "🚫 根据当前角色配置，本局实际上没有爪牙 (Minions)。\n你应当告诉【调查员】：'本局游戏中没有爪牙。' 请直接使用这句台词，不要编造虚假的两名玩家。"; 
          speak = '"本局游戏中没有爪牙。"'; 
          action = "告知";
        }
        const regNote = buildRegistrationGuideNote(effectiveRole);
        if (regNote) guide += `\n\n${regNote}`;
      }
      break;

    case 'chef':
      if (gamePhase === 'firstNight') {
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
          speak = `"场上有 ${fakePairs} 对邪恶玩家相邻而坐。"（向他比划数字 ${fakePairs}）`;
        } else {
          guide = `👀 真实信息: ${pairs}对邪恶相邻`;
          speak = `"场上有 ${pairs} 对邪恶玩家相邻而坐。"（向他比划数字 ${pairs}）`;
        }
        const regNoteChef = buildRegistrationGuideNote(effectiveRole);
        if (regNoteChef) guide += `\n\n${regNoteChef}`;
        action = "告知";
      }
      break;

    case 'empath':
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
          speak = `"你的左右邻居中有 ${fakeC} 名邪恶玩家。"（向他比划数字 ${fakeC}）`;
        } else {
          guide = `👂 真实信息: ${c} (比划${c})`;
          speak = `"你的左右邻居中有 ${c} 名邪恶玩家。"（向他比划数字 ${c}）`;
        }
        // 仅对左右邻居中受到注册影响的角色（间谍/隐士）给出补充说明
        const affectedNeighbors = neighbors.filter(
          (s) => s.role && (s.role.id === 'spy' || s.role.id === 'recluse')
        );
        if (affectedNeighbors.length > 0) {
          const typeLabels: Record<RoleType, string> = {
            townsfolk: '镇民',
            outsider: '外来者',
            minion: '爪牙',
            demon: '恶魔',
            traveler: '旅人',
          };
          const lines = affectedNeighbors.map((s) => {
            const reg = getCachedRegistration(s, effectiveRole);
            const typeLabel = reg.roleType ? typeLabels[reg.roleType] || reg.roleType : '无类型';
            const status =
              reg.registersAsDemon
                ? '在眼中 = 恶魔'
                : reg.registersAsMinion
                  ? '在眼中 = 爪牙'
                  : `在眼中 = ${reg.alignment === 'Evil' ? '邪恶' : '善良'} / 类型 ${typeLabel}`;
            return `${s.id + 1}号【${s.role?.name ?? '未知'}】：${status}`;
          });
          guide += `\n\n📌 注册判定说明（仅供说书人参考，仅影响该共情者的左右邻居）：\n${lines.join('\n')}`;
        }
        action = '告知';
      } else {
        guide = '⚠️ 周围没有存活邻居，信息无法生成，示0或手动说明。';
        speak = '"你没有存活的邻居可供检测，请示意0或由说书人说明。"' ;
        action = '展示';
      }
      break;

    case 'fortune_teller':
      guide = "🔮 查验2人。若有恶魔/天敌红罗剎->是。";
      const regNote = buildRegistrationGuideNote(effectiveRole);
      if (regNote) guide += `\n${regNote}`;
      speak = '"请选择两名玩家查验。如果其中一人是恶魔或天敌红罗剎，我会告诉你\\"是\\"，否则告诉你\\"否\\"。'; 
      action = "查验";
      break;

    case 'undertaker':
      if (gamePhase !== 'firstNight') {
        // 送葬者：只要上一个黄昏有人被处决，本夜就会被唤醒
        // 他会得知昨天被处决的座位号的"真实身份"，但会受中毒/酒鬼/涡流等状态影响
        if (lastDuskExecution !== null) {
          const executed = seats.find(s => s.id === lastDuskExecution);
          if (executed && executed.role) {
            const seatNum = executed.id + 1;
            const realName = executed.role.name;

            if (shouldShowFake) {
              // 送葬者在中毒/醉酒/涡流世界下：给出错误的角色信息
              const otherRoles = roles.filter(r => r.name !== realName && !r.hidden);
              const fakeRole = otherRoles.length > 0 ? getRandom(otherRoles) : executed.role;
              const fakeName = fakeRole.name;

              guide = `⚠️ [异常] 真实: ${seatNum}号是【${realName}】。\n请对送葬者报: ${seatNum}号是【${fakeName}】。`;
              speak = `"上一个黄昏被处决的玩家是 ${seatNum}号【${fakeName}】。"`; 
            } else {
              guide = `👀 真实信息: 上一个黄昏被处决的是 ${seatNum}号【${realName}】`;
              speak = `"上一个黄昏被处决的玩家是 ${seatNum}号【${realName}】。"`; 
            }
          } else {
            guide = "上一个黄昏无人被处决。";
            speak = '"上一个黄昏无人被处决。"';
          }
        } else {
          guide = "上一个黄昏无人被处决，因此【送葬者】本夜不会被唤醒，这是正常规则。";
          speak = '"上一个黄昏无人被处决。"';
        }
        action = "告知";
      }
      break;

    case 'monk':
      if (isFirstNight) {
        guide = "首夜不唤醒僧侣。";
        speak = "（首夜不行动）";
        action = "跳过";
        break;
      }
      if (isPoisoned) {
        guide = "⚠️ [异常] 中毒/醉酒状态下无法保护玩家，但可以正常选择。"; 
        speak = '"请选择一名玩家。但由于你处于中毒/醉酒状态，无法提供保护效果。"'; 
      } else {
        guide = "🛡️ 选择一名玩家保护。不能保护自己，也不能保护死亡玩家。"; 
        speak = '"请选择一名存活的其他玩家进行保护。被你保护的玩家今晚不会被恶魔杀害。"'; 
      }
      action = "保护";
      break;

    case 'ravenkeeper':
      // 仅当本夜死亡时才会被唤醒，死亡原因不限（恶魔/镇长替死等），中毒/醉酒照样被唤醒但信息可能错误
      if (diedTonight) { 
        guide = "查验一名玩家的真实角色（可能受中毒/醉酒影响）。"; 
        speak = '"请选择一名玩家，我会告诉你他的角色。"' ; 
        action = "查验";
      } else { 
        guide = "你本夜未死亡，不会被唤醒。"; 
        speak = "（摇头示意无效）"; 
        action = "跳过";
      }
      break;

    case 'innkeeper':
      // 旅店老板：选择两名玩家，他们当晚不会死亡，其中一人醉酒到下个黄昏
      guide = "🏨 选择两名玩家：他们当晚不会被恶魔杀死，但其中一人会醉酒到下个黄昏。"; 
      speak = '"请选择两名玩家。他们今晚不会被恶魔杀死，但其中一人会醉酒到下个黄昏。"'; 
      action = "protect";
      break;

    case 'clockmaker':
      if (gamePhase === 'firstNight') {
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
      }
      break;

    case 'mathematician':
      // 计算异常数量：中毒/酒醉的善良玩家（镇民/外来者）
      const abnormalCount = seats.filter(s => 
        !s.isDead && 
        (s.isPoisoned || s.isDrunk || s.role?.setupMeta?.isDrunk) && 
        (s.role?.type === 'townsfolk' || s.role?.type === 'outsider')
      ).length;
      
      const trueCount = abnormalCount;
      const shown = shouldShowFake 
        ? (trueCount === 0 ? 1 : Math.max(0, trueCount + (Math.random() < 0.5 ? -1 : 1)))
        : trueCount;
      guide = `👀 异常数量：真实 ${trueCount}，展示 ${shown} (基于中毒/酒醉统计)`;
      speak = `"有 ${shown} 人的能力异常。"`;
      action = "告知";
      addLogCb?.(`${currentSeatId+1}号(数学家) 得知 ${shown} 人异常${shouldShowFake ? '（假信息）' : ''}`);
      break;

    case 'flowergirl':
      // 使用 votedThisRound 计算：是否有恶魔投票
      const demons = seats.filter(s => (s.role?.type === 'demon' || s.isDemonSuccessor) && !s.isDead);
      const demonVoted = votedThisRound && votedThisRound.length > 0 
        ? demons.some(d => votedThisRound.includes(d.id))
        : (demonVotedToday || false); // Fallback to old parameter if votedThisRound not provided
      const real = demonVoted;
      const shownFlower = shouldShowFake ? !real : real;
      guide = `👀 真实：${real ? '有' : '无'} 恶魔投票；展示：${shownFlower ? '有' : '无'}`;
      speak = `"今天${shownFlower ? '有' : '没有'}恶魔投过票。"`;
      action = "告知";
      addLogCb?.(`${currentSeatId+1}号(卖花女孩) 得知今天${shownFlower ? '有' : '无'}恶魔投票${shouldShowFake ? '（假信息）' : ''}`);
      break;

    case 'town_crier':
      // 使用 votedThisRound 计算：是否有爪牙投票
      const minions = seats.filter(s => s.role?.type === 'minion' && !s.isDead);
      const minionVoted = votedThisRound && votedThisRound.length > 0
        ? minions.some(m => votedThisRound.includes(m.id))
        : (minionNominatedToday || false); // Fallback to old parameter if votedThisRound not provided
      const real2 = minionVoted;
      const shown2 = shouldShowFake ? !real2 : real2;
      guide = `👀 真实：${real2 ? '有' : '无'} 爪牙投票；展示：${shown2 ? '有' : '无'}`;
      speak = `"今天${shown2 ? '有' : '没有'}爪牙投过票。"`;
      action = "告知";
      addLogCb?.(`${currentSeatId+1}号(城镇公告员) 得知今天${shown2 ? '有' : '无'}爪牙投票${shouldShowFake ? '（假信息）' : ''}`);
      break;

    case 'oracle':
      if (gamePhase !== 'firstNight') {
        const deadEvil = seats.filter(s => s.isDead && isEvil(s)).length;
        const shown3 = shouldShowFake
          ? Math.max(0, deadEvil + (deadEvil === 0 ? 1 : (Math.random() < 0.5 ? -1 : 1)))
          : deadEvil;
        guide = `👀 死亡邪恶人数：真实 ${deadEvil}，展示 ${shown3}`;
        speak = `"有 ${shown3} 名死亡玩家是邪恶的。"`;
        action = "告知";
        addLogCb?.(`${currentSeatId+1}号(神谕者) 得知 ${shown3} 名死亡邪恶${shouldShowFake ? '（假信息）' : ''}`);
      }
      break;

    case 'dreamer':
      guide = "🛌 选择一名玩家：告知一善一恶角色名，其中一个是其身份。";
      speak = '"请选择一名玩家。"';
      action = "查验";
      break;

    case 'seamstress':
      if (hasUsedAbilityFn && hasUsedAbilityFn('seamstress', currentSeatId)) {
        guide = "一次性能力已用完。";
        speak = '"你的能力已用完。"';
        action = "跳过";
      } else {
        guide = "🧵 一局一次：选择两名玩家，得知是否同阵营。";
        speak = '"请选择两名玩家。"';
        action = "查验";
      }
      break;

    case 'philosopher':
      // 哲学家：每局游戏限一次，夜晚选择一个善良角色，获得该角色的能力，原角色醉酒
      guide = "🧙 每局游戏限一次，选择一个善良角色：你获得该角色的能力。如果这个角色在场，他醉酒。"; 
      speak = '"每局游戏限一次，请选择一个善良角色。你获得该角色的能力。如果这个角色在场，他醉酒。"'; 
      action = "mark";
      break;

    case 'sage':
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
      break;

    case 'noble':
      if (gamePhase === 'firstNight') {
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
      }
      break;

    case 'balloonist':
      // 气球驾驶员：被动信息技能，每晚自动得知一名不同角色类型的玩家座位号
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
        // 中毒时：返回重复阵营的角色的座位号
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
      break;

    case 'amnesiac':
      // 失意者：每个白天可以询问说书人一次猜测
      guide = "🧠 每个白天，你可以询问说书人一次猜测，你会得知你的猜测有多准确。"; 
      speak = '"每个白天，你可以询问说书人一次猜测，你会得知你的猜测有多准确。"'; 
      action = "告知";
      break;

    case 'engineer':
      // 工程师：每局游戏一次，可以选择让恶魔变成你选择的一个恶魔角色，或让所有爪牙变成你选择的爪牙角色
      guide = "🔧 每局游戏一次，选择让恶魔变成你选择的一个恶魔角色，或让所有爪牙变成你选择的爪牙角色。"; 
      speak = '"每局游戏一次，请选择让恶魔变成你选择的一个恶魔角色，或让所有爪牙变成你选择的爪牙角色。"'; 
      action = "mark";
      break;

    case 'fisherman':
      // 渔夫：每局游戏一次，在白天时可以询问说书人一些建议
      guide = "🎣 每局游戏一次，在白天时，你可以询问说书人一些建议来帮助你的团队获胜。"; 
      speak = '"每局游戏一次，在白天时，你可以询问说书人一些建议来帮助你的团队获胜。"'; 
      action = "告知";
      break;

    case 'ranger':
      // 巡山人：每局游戏一次，选择一名存活的玩家，如果选中了落难少女，她会变成一个不在场的镇民角色
      guide = "🏔️ 每局游戏一次，选择一名存活的玩家，如果选中了落难少女，她会变成一个不在场的镇民角色。"; 
      speak = '"请选择一名存活的玩家。如果选中了落难少女，她会变成一个不在场的镇民角色。"'; 
      action = "mark";
      break;

    case 'farmer':
      // 农夫：如果你在夜晚死亡，一名存活的善良玩家会变成农夫
      guide = "🌾 如果你在夜晚死亡，一名存活的善良玩家会变成农夫。"; 
      speak = '"如果你在夜晚死亡，一名存活的善良玩家会变成农夫。"'; 
      action = "告知";
      break;

    case 'poppy_grower':
      // 罂粟种植者：爪牙和恶魔不知道彼此。如果你死亡，他们会在当晚得知彼此
      guide = "🌺 爪牙和恶魔不知道彼此。如果你死亡，他们会在当晚得知彼此。"; 
      speak = '"爪牙和恶魔不知道彼此。如果你死亡，他们会在当晚得知彼此。"'; 
      action = "告知";
      break;

    case 'atheist':
      // 无神论者：说书人可以打破游戏规则。如果说书人被处决，好人阵营获胜
      guide = "🚫 说书人可以打破游戏规则。如果说书人被处决，好人阵营获胜，即使你已死亡。"; 
      speak = '"说书人可以打破游戏规则。如果说书人被处决，好人阵营获胜，即使你已死亡。"'; 
      action = "告知";
      break;

    case 'cannibal':
      // 食人族：你拥有最后被处决的玩家的能力。如果该玩家是邪恶的，你会中毒直到下一个善良玩家被处决
      guide = "🍖 你拥有最后被处决的玩家的能力。如果该玩家是邪恶的，你会中毒直到下一个善良玩家被处决。"; 
      speak = '"你拥有最后被处决的玩家的能力。如果该玩家是邪恶的，你会中毒直到下一个善良玩家被处决。"'; 
      action = "告知";
      break;

    case 'professor_mr':
      if (gamePhase !== 'firstNight') {
        // 教授：每局游戏一次，选择一名死亡的玩家，该玩家复活
        guide = "🔬 每局游戏一次，选择一名死亡的玩家复活。"; 
        speak = '"请选择一名死亡的玩家。如果他是镇民，该玩家复活。"'; 
        action = "revive";
      }
      break;

    case 'snake_charmer_mr':
      // 舞蛇人：每晚选择一名存活的玩家，如果选中了恶魔，交换角色和阵营
      guide = "🐍 选择一名存活的玩家，如果选中了恶魔，你和他交换角色和阵营，然后他中毒。"; 
      speak = '"请选择一名存活的玩家。如果你选中了恶魔，你和他交换角色和阵营，然后他中毒。"'; 
      action = "mark";
      break;

    case 'savant_mr':
      // 博学者：每个白天可以私下询问说书人两条信息（一真一假）
      guide = "📚 每个白天，你可以私下询问说书人以得知两条信息：一个是正确的，一个是错误的。"; 
      speak = '"每个白天，你可以私下询问说书人以得知两条信息：一个是正确的，一个是错误的。"'; 
      action = "告知";
      break;

    // ========== Outsider (外来者) ==========
    case 'butler':
      guide = "选择主人。"; 
      speak = '"请通过手势选择你的主人。指向你选择的玩家，我会确认。"'; 
      action = "标记";
      break;

    case 'drunk':
    case 'drunk_mr':
      // 酒鬼：不知道自己是酒鬼，以为自己是镇民（逻辑在 effectiveRole 中处理）
      // 这里不需要特殊处理，因为 effectiveRole 已经是伪装角色
      break;

    case 'recluse':
    case 'saint':
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
    case 'tinker':
    case 'moonchild':
    case 'goon':
    case 'lunatic':
    case 'mutant':
    case 'sweetheart':
    case 'barber':
    case 'barber_mr':
    case 'klutz':
    case 'damsel':
      // 落难少女：所有爪牙都知道落难少女在场
      if (gamePhase === 'firstNight') {
        guide = "👸 所有爪牙都知道落难少女在场。"; 
        speak = '"所有爪牙都知道落难少女在场。"'; 
        action = "告知";
      }
      break;

    case 'golem':
    case 'artist':
    case 'juggler':
      // 这些角色没有夜晚行动或夜晚行动已在其他阶段处理
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
          ).map(s => `${s.id+1}号`);
          const minions = seats.filter(s => s.role?.type === 'minion').map(s => `${s.id+1}号`);
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

  // 如果已经设置了 guide, speak, action，返回结果
  if (guide || speak || action) {
    return { seat: targetSeat, effectiveRole: finalEffectiveRole, isPoisoned, reason, guide, speak, action };
  }

  return null;
};

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

    const merged = getMergedRoleMeta(seat.role);
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
    const aMerged = getMergedRoleMeta(a.role);
    const bMerged = getMergedRoleMeta(b.role);

    const orderA = isFirstNight ? aMerged.firstOrder : aMerged.otherOrder;
    const orderB = isFirstNight ? bMerged.firstOrder : bMerged.otherOrder;

    return orderA - orderB;
  });

  // 3. 生成时间线步骤
  activeSeats.forEach((seat, index) => {
    const merged = getMergedRoleMeta(seat.role);
    const role = merged.role;
    const meta = isFirstNight ? merged.firstMeta : merged.otherMeta;

    // 没有对应夜晚的元数据，则本夜不唤醒该角色
    if (!role || !meta) return;

    steps.push({
      id: `step_${seat.id}_${role.id}_${isFirstNight ? '1' : 'n'}`,
      type: 'character',
      seatId: seat.id,
      roleId: role.id,
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

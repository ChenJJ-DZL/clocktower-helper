import type {
  GamePhase,
  LogEntry,
  Role,
  RoleType,
  Script,
  Seat,
} from "../../app/data";
import { roles } from "../../app/data";
import troubleBrewingRolesData from "../data/rolesData.json";
import { getRoleDefinition } from "../roles";
import type { NightInfoResult, TimelineStep } from "../types/game";
import type { RegistrationResult } from "../types/registration";
import type { NightActionContext } from "../types/roleDefinition";
import {
  computeIsPoisoned,
  getMisinformation,
  getPoisonSources,
  getRandom,
  getRegistration,
  isEvil,
  type RegistrationCacheOptions,
  shouldShowFakeInfo,
} from "./gameRules";

export const calculateNightInfo = (
  selectedScript: Script | null,
  seats: Seat[],
  currentSeatId: number,
  gamePhase: GamePhase,
  lastDuskExecution: number | null,
  nightCount: number, // ADDED
  _fakeInspectionResult?: string,
  drunkFirstInfoMap?: Map<number, boolean>,
  isEvilWithJudgmentFn?: (seat: Seat) => boolean,
  poppyGrowerDead?: boolean,
  _gameLogs?: LogEntry[],
  spyDisguiseMode?: "off" | "default" | "on",
  spyDisguiseProbability?: number,
  deadThisNight: number[] = [],
  _balloonistKnownTypes?: Record<number, string[]>,
  registrationCache?: Map<string, RegistrationResult>,
  registrationCacheKey?: string,
  vortoxWorld?: boolean,
  demonVotedToday?: boolean,
  minionNominatedToday?: boolean,
  executedToday?: number | null,
  _hasUsedAbilityFn?: (roleId: string, seatId: number) => boolean,
  _votedThisRound?: number[], // NEW: List of seat IDs who voted this round (for Flowergirl/Town Crier)
  _outsiderDiedToday?: boolean // NEW: for Godfather/Gossip extra death triggers
): NightInfoResult | null => {
  // 使用传入的判定函数，如果没有则使用默认的isEvil
  const checkEvil = isEvilWithJudgmentFn || isEvil;
  const isFirstNight = gamePhase === "firstNight";
  const registrationOptions: RegistrationCacheOptions | undefined =
    registrationCache
      ? { cache: registrationCache, cacheKey: registrationCacheKey }
      : undefined;
  const getCachedRegistration = (player: Seat, viewer?: Role | null) =>
    getRegistration(
      player,
      viewer,
      spyDisguiseMode,
      spyDisguiseProbability,
      registrationOptions
    );

  const _buildRegistrationGuideNote = (viewer: Role): string | null => {
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
      const typeLabel = reg.roleType
        ? typeLabels[reg.roleType] || reg.roleType
        : "无类型";
      const status = reg.registersAsDemon
        ? "在眼中 = 恶魔"
        : reg.registersAsMinion
          ? "在眼中 = 爪牙"
          : `在眼中 = ${reg.alignment === "Evil" ? "邪恶" : "善良"} / 类型 ${typeLabel}`;
      return `${s.id + 1}号【${s.role?.name ?? "未知"}】：${status}`;
    });
    return `📌 注册判定（仅说书人可见）：\n${lines.join("\n")}`;
  };

  const getRolePoolByType = (type: RoleType): Role[] => {
    const all = roles.filter((r) => r.type === type && !r.hidden);
    if (!selectedScript) return all;
    return all.filter((r) => {
      return (
        !r.script ||
        r.script === selectedScript.name ||
        (selectedScript.id === "trouble_brewing" && !r.script) ||
        (selectedScript.id === "bad_moon_rising" &&
          (!r.script || r.script === "黯月初升")) ||
        (selectedScript.id === "sects_and_violets" &&
          (!r.script || r.script === "梦陨春宵")) ||
        (selectedScript.id === "midnight_revelry" &&
          (!r.script || r.script === "夜半狂欢"))
      );
    });
  };

  const _getPerceivedRoleForViewer = (
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

    if (target.role.id !== "spy" && target.role.id !== "recluse") {
      return { perceivedRole: target.role, perceivedType: target.role.type };
    }

    const perceivedType = expectedType ?? regType;
    const cache =
      (registrationCache as unknown as Map<string, any>) ??
      new Map<string, any>();
    const keyBase =
      (registrationCacheKey ?? "local") +
      `-perceivedRole-t${target.id}-v${viewer.id}-as${perceivedType}`;

    const cached = cache.get(keyBase) as Role | undefined;
    if (cached) return { perceivedRole: cached, perceivedType };

    const pool = getRolePoolByType(perceivedType);
    const pool2 = pool.filter((r) => r.id !== viewer.id);
    const picked: Role | null =
      pool2.length > 0
        ? getRandom(pool2)
        : pool.length > 0
          ? getRandom(pool)
          : null;

    if (picked) cache.set(keyBase, picked);
    return { perceivedRole: picked, perceivedType };
  };

  const findNearestAliveNeighbor = (
    originId: number,
    direction: 1 | -1
  ): Seat | null => {
    const originIndex = seats.findIndex((s) => s.id === originId);
    if (originIndex === -1 || seats.length <= 1) return null;
    for (let step = 1; step < seats.length; step++) {
      const seat =
        seats[(originIndex + direction * step + seats.length) % seats.length];
      if (!seat.isDead && seat.id !== originId) {
        return seat;
      }
    }
    return null;
  };

  const targetSeat = seats.find((s) => s.id === currentSeatId);
  console.log(
    `[NightLogic] calculateNightInfo - Role: ${targetSeat?.role?.id}, Phase: ${gamePhase}, lastDusk: ${lastDuskExecution}`
  );
  if (!targetSeat || !targetSeat.role) return null;

  const effectiveRole =
    targetSeat.role.id === "drunk" ? targetSeat.charadeRole : targetSeat.role;
  if (!effectiveRole) return null;
  const _diedTonight = deadThisNight.includes(targetSeat.id);

  const _checkEvilForChefEmpath = (seat: Seat): boolean => {
    const registration = getCachedRegistration(seat, effectiveRole);
    return registration.alignment === "Evil";
  };

  const abilityText = effectiveRole.ability || "";
  const _hasChoiceKeyword = abilityText.includes("选择");

  const vortoxActive = seats.some((s) => s.role?.id === "vortox" && !s.isDead);

  let isPoisoned = computeIsPoisoned(targetSeat, seats);
  if (vortoxActive && effectiveRole.type === "townsfolk") {
    isPoisoned = true; // Force false info for Townsfolk
  }

  const isDrunk = targetSeat.isDrunk || targetSeat.role?.id === "drunk";

  const poisonSources = getPoisonSources(targetSeat);
  let reason = "";
  if (poisonSources.permanent || poisonSources.snakeCharmer) {
    reason = "永久中毒";
  } else if (poisonSources.vigormortis) {
    reason = "亡骨魔中毒";
  } else if (poisonSources.pukka) {
    reason = "普卡中毒";
  } else if (poisonSources.dayPoison || poisonSources.noDashiiMark) {
    reason = "投毒";
  } else if (poisonSources.cannibal) {
    reason = "食人族中毒";
  } else if (isPoisoned) {
    reason = "中毒";
  } else if (isDrunk) {
    reason = "酒鬼";
  }

  const fakeInfoCheck = drunkFirstInfoMap
    ? shouldShowFakeInfo(targetSeat, drunkFirstInfoMap, vortoxWorld)
    : { showFake: isPoisoned || !!vortoxWorld, isFirstTime: false };
  const shouldShowFake = fakeInfoCheck.showFake;
  let guide = "",
    speak = "",
    action = "",
    _logMessage: string | undefined;

  const _dummySeat: Seat = {
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

  let targetLimit = { min: 0, max: 0 };
  const canSelectDead = false;
  let canSelectSelf = false;
  let validTargetIds: number[] = [];

  const roleDef = getRoleDefinition(effectiveRole.id);
  const nightConfig = isFirstNight
    ? roleDef?.firstNight || roleDef?.night
    : roleDef?.night;

  const context: NightActionContext = {
    seats,
    gamePhase,
    lastDuskExecution,
    nightCount,
    vortoxWorld: !!vortoxWorld,
    demonVotedToday: !!demonVotedToday,
    minionNominatedToday: !!minionNominatedToday,
    executedToday,
    isEvilWithJudgmentFn: checkEvil,
    targets: [],
    selfId: currentSeatId,
    getRegistration: getCachedRegistration,
    findNearestAliveNeighbor,
    shouldShowFake,
    getMisinformation,
    isActorDisabledByPoisonOrDrunk: (seat: Seat) =>
      computeIsPoisoned(seat, seats) ||
      seat.isDrunk ||
      seat.role?.id === "drunk",
    addLog: (_msg: string) => {}, // Dummy during calculation
  };

  if (nightConfig) {
    const dialog = nightConfig.dialog(currentSeatId, isFirstNight, context);
    guide = dialog.wake;
    speak = dialog.instruction;
    action = dialog.close;

    let defaultTargetLimit = { min: 0, max: 0 };
    if (nightConfig.target) {
      defaultTargetLimit = nightConfig.target.count;
      targetLimit = defaultTargetLimit;

      if (nightConfig.target.canSelect) {
        canSelectSelf = nightConfig.target.canSelect(
          targetSeat,
          targetSeat,
          seats,
          []
        );
      }

      if (nightConfig.target.validTargetIds) {
        validTargetIds = nightConfig.target.validTargetIds(
          currentSeatId,
          seats,
          gamePhase
        );
      }
    }

    // 🚩 被动信息型角色自动推演逻辑，无需手动选择目标
    const isPassiveRoleAutoHandled = false;
    if (isFirstNight && !shouldShowFake) {
      switch (effectiveRole.id) {
        case "washerwoman": {
          // 洗衣妇：自动随机生成镇民和另一个玩家
          const townsfolkSeats = seats.filter(
            (s) =>
              s.role &&
              s.role.type === "townsfolk" &&
              !s.isDead &&
              s.id !== currentSeatId
          );
          const targetTownsfolk = getRandom(townsfolkSeats);
          if (targetTownsfolk?.role) {
            const otherSeats = seats.filter(
              (s) =>
                s.id !== targetTownsfolk.id &&
                !s.isDead &&
                s.id !== currentSeatId
            );
            const targetOther = getRandom(otherSeats);
            if (targetOther) {
              const shuffledTargets =
                Math.random() > 0.5
                  ? [targetTownsfolk, targetOther]
                  : [targetOther, targetTownsfolk];
              guide = `🧺 洗衣妇，请睁眼。请向Ta出示【${targetTownsfolk.role.name}】的角色标记，并指向 ${shuffledTargets[0].id + 1}号 和 ${shuffledTargets[1].id + 1}号 玩家。（系统随机抽取）`;
              speak = `"${shuffledTargets[0].id + 1}号、${shuffledTargets[1].id + 1}号中存在（镇民）${targetTownsfolk.role.name}。"`;
              // 无需选择目标
              targetLimit = { min: 0, max: 0 };
            }
          }
          break;
        }
        case "librarian": {
          // 图书管理员：自动随机生成外来者和另一个玩家
          const outsiderSeats = seats.filter(
            (s) =>
              s.role &&
              s.role.type === "outsider" &&
              !s.isDead &&
              s.id !== currentSeatId
          );
          const targetOutsider = getRandom(outsiderSeats);
          if (targetOutsider?.role) {
            const otherSeats = seats.filter(
              (s) =>
                s.id !== targetOutsider.id &&
                !s.isDead &&
                s.id !== currentSeatId
            );
            const targetOther = getRandom(otherSeats);
            if (targetOther) {
              const shuffledTargets =
                Math.random() > 0.5
                  ? [targetOutsider, targetOther]
                  : [targetOther, targetOutsider];
              guide = `📚 图书管理员，请睁眼。请向Ta出示【${targetOutsider.role.name}】的角色标记，并指向 ${shuffledTargets[0].id + 1}号 和 ${shuffledTargets[1].id + 1}号 玩家。（系统随机抽取）`;
              speak = `"${shuffledTargets[0].id + 1}号、${shuffledTargets[1].id + 1}号中存在（外来者）${targetOutsider.role.name}。"`;
              // 无需选择目标
              targetLimit = { min: 0, max: 0 };
            }
          }
          break;
        }
        case "investigator": {
          // 调查员：自动随机生成爪牙和另一个玩家
          const minionSeats = seats.filter(
            (s) =>
              s.role &&
              s.role.type === "minion" &&
              !s.isDead &&
              s.id !== currentSeatId
          );
          const targetMinion = getRandom(minionSeats);
          if (targetMinion?.role) {
            const otherSeats = seats.filter(
              (s) =>
                s.id !== targetMinion.id && !s.isDead && s.id !== currentSeatId
            );
            const targetOther = getRandom(otherSeats);
            if (targetOther) {
              const shuffledTargets =
                Math.random() > 0.5
                  ? [targetMinion, targetOther]
                  : [targetOther, targetMinion];
              guide = `🔍 调查员，请睁眼。请向Ta出示【${targetMinion.role.name}】的角色标记，并指向 ${shuffledTargets[0].id + 1}号 和 ${shuffledTargets[1].id + 1}号 玩家。（系统随机抽取）`;
              speak = `"${shuffledTargets[0].id + 1}号、${shuffledTargets[1].id + 1}号中存在（爪牙）${targetMinion.role.name}。"`;
              // 无需选择目标
              targetLimit = { min: 0, max: 0 };
            }
          }
          break;
        }
        case "chef": {
          // 厨师：自动计算邪恶邻座对数
          let evilPairs = 0;
          for (let i = 0; i < seats.length; i++) {
            const s1 = seats[i];
            const s2 = seats[(i + 1) % seats.length];
            if (
              !s1.isDead &&
              !s2.isDead &&
              _checkEvilForChefEmpath(s1) &&
              _checkEvilForChefEmpath(s2)
            ) {
              evilPairs++;
            }
          }
          guide = `👨‍🍳 厨师，请睁眼。告诉Ta："场上有${evilPairs}对邪恶玩家邻座。"（系统自动计算）`;
          speak = `"场上有${evilPairs}对邪恶玩家邻座。"`;
          targetLimit = { min: 0, max: 0 };
          break;
        }
        case "empath": {
          // 共情者：自动计算相邻邪恶玩家数量
          const left = findNearestAliveNeighbor(currentSeatId, -1);
          const right = findNearestAliveNeighbor(currentSeatId, 1);
          let evilCount = 0;
          if (left && _checkEvilForChefEmpath(left)) evilCount++;
          if (right && _checkEvilForChefEmpath(right)) evilCount++;
          guide = `💞 共情者，请睁眼。告诉Ta："你邻近的两名存活玩家中，有${evilCount}名邪恶玩家。"（系统自动计算）`;
          speak = `"你邻近的两名存活玩家中，有${evilCount}名邪恶玩家。"`;
          targetLimit = { min: 0, max: 0 };
          break;
        }
      }
    }
  } else {
    if (effectiveRole.type === "minion" && gamePhase === "firstNight") {
      const poppyGrower = seats.find((s) => s.role?.id === "poppy_grower");
      const shouldHideDemon =
        poppyGrower && !poppyGrower.isDead && poppyGrowerDead === false;

      if (shouldHideDemon) {
        guide =
          "🌺 罂粟种植者在场，本局爪牙和恶魔互相不知道彼此身份。\n\n操作提示：你现在不需要叫醒爪牙。";
        speak = `"罂粟种植者在场，你不知道恶魔是谁，也不会在本局中得知爪牙和恶魔的具体位置。"`;
        action = "无信息";
      } else {
        const demons = seats
          .filter((s) => s.role?.type === "demon" || s.isDemonSuccessor)
          .map((s) => `${s.id + 1}号`);
        const fallbackMinions = seats
          .filter((s) => s.role?.type === "minion")
          .map((s) => `${s.id + 1}号`);
        const demonText = demons.length > 0 ? demons.join("、") : "无";
        const minionText =
          fallbackMinions.length > 0 ? fallbackMinions.join("、") : "无";
        guide = `👿 爪牙认恶魔环节（集中唤醒）：\n1. 现在请一次性叫醒所有爪牙座位：${minionText}。\n2. 用手指向恶魔座位：${demonText}，让所有爪牙知道恶魔的座位号。\n3. （可选）如果你希望他们彼此也知道谁是爪牙，可同时指示爪牙的座位号：${minionText}。\n4. 确认所有爪牙都清楚恶魔的座位号，然后同时让他们闭眼。`;
        speak = `"现在请你一次性叫醒所有爪牙，并指向恶魔。恶魔在 ${demonText} 号。确认所有爪牙都知道恶魔的座位号后，再让他们一起闭眼。"`;
        action = "展示恶魔";
      }
    } else {
      guide = "💤 无行动。";
      speak = "（无）";
      action = "跳过";
    }
  }

  let finalEffectiveRole = effectiveRole;
  if (effectiveRole.id === "imp" && gamePhase === "firstNight") {
    finalEffectiveRole = { ...effectiveRole, nightActionType: "none" };
  }

  if (guide || speak || action) {
    if (shouldShowFake && (isPoisoned || isDrunk)) {
      const fakeInfo = generateFakeNightInfo(
        effectiveRole.id,
        guide,
        speak,
        seats,
        currentSeatId,
        roles,
        selectedScript
      );
      if (fakeInfo) {
        guide = fakeInfo.guide;
        speak = fakeInfo.speak;
      }
      guide = `${guide}\n\n⚠️ 此玩家处于中毒/醉酒状态，获得的信息可能是虚假的！`;
    }

    const actionConfig =
      isFirstNight && roleDef?.firstNight ? roleDef.firstNight : roleDef?.night;
    const targetCount = actionConfig?.target?.count;

    // 被动信息角色已经设置了targetLimit=0，不需要再覆盖
    if (targetCount?.max && targetLimit.min !== 0) {
      targetLimit = { min: targetCount.min ?? 1, max: targetCount.max };
      if (actionConfig?.target?.canSelect) canSelectSelf = true;
    }

    if (action === "无" || action === "跳过" || action === "无信息") {
      targetLimit = { min: 0, max: 0 };
    }

    if (targetLimit.max > 0 && validTargetIds.length === 0) {
      let candidates = seats.filter((s) => !s.isDead);

      if (canSelectDead) {
        candidates = seats;
      }

      validTargetIds = candidates.map((s) => s.id);

      if (!canSelectSelf) {
        validTargetIds = validTargetIds.filter((id) => id !== currentSeatId);
      }
    }

    const interaction = {
      type: targetLimit.max > 0 ? "choose_player" : "none",
      amount: targetLimit.max,
      required: true,
      canSelectSelf,
      canSelectDead,
      effect: { type: "none" },
    };

    return {
      seat: targetSeat,
      effectiveRole: finalEffectiveRole,
      isPoisoned,
      reason,
      guide,
      speak,
      action,
      meta: {
        targetType: interaction.type === "choose_player" ? "player" : "none",
        amount: interaction.amount,
        targetCount,
      },
      interaction,

      roleId: effectiveRole.id,
      index: 0,

      targetLimit,
      canSelectDead,
      canSelectSelf,
      validTargetIds,

      guideText: guide,
      actionText: action,
    };
  }

  return null;
};

function generateFakeNightInfo(
  roleId: string,
  originalGuide: string,
  originalSpeak: string,
  seats: Seat[],
  currentSeatId: number,
  roles: Role[],
  selectedScript: Script | null
): { guide: string; speak: string } | null {
  switch (roleId) {
    case "washerwoman": {
      const potentialFakePlayers = seats.filter((s) => s.id !== currentSeatId);
      if (potentialFakePlayers.length >= 2) {
        const shuffled = [...potentialFakePlayers].sort(
          () => Math.random() - 0.5
        );
        const player1 = shuffled[0].id + 1;
        const player2 = shuffled[1].id + 1;

        const usedRoleIds = seats.map((s) => s.role?.id).filter(Boolean);
        const scriptRoles: Role[] = selectedScript
          ? roles.filter(
              (r) =>
                r.script === selectedScript.name ||
                r.script === selectedScript.id
            )
          : roles;

        const availableTownsfolkRoles: Role[] = scriptRoles.filter(
          (r: Role) =>
            r.type === "townsfolk" && !usedRoleIds.includes(r.id) && !r.hidden
        );

        const fakeRole: Role | undefined =
          availableTownsfolkRoles.length > 0
            ? getRandom(availableTownsfolkRoles)
            : roles.find(
                (r: Role) =>
                  r.type === "townsfolk" && !usedRoleIds.includes(r.id)
              ) || roles.find((r: Role) => r.type === "townsfolk");

        return {
          guide: `🧺 洗衣妇虚假信息：${player1}号、${player2}号中存在（镇民）${fakeRole?.name || "未知镇民"}。`,
          speak: `"${player1}号、${player2}号中存在（镇民）${fakeRole?.name || "未知镇民"}。"`,
        };
      }
      break;
    }

    case "librarian": {
      const potentialFakePlayersLib = seats.filter(
        (s) => s.id !== currentSeatId
      );
      if (potentialFakePlayersLib.length >= 2) {
        const shuffled = [...potentialFakePlayersLib].sort(
          () => Math.random() - 0.5
        );
        const player1 = shuffled[0].id + 1;
        const player2 = shuffled[1].id + 1;

        const usedRoleIds = seats.map((s) => s.role?.id).filter(Boolean);
        const scriptRoles: Role[] = selectedScript
          ? roles.filter(
              (r) =>
                r.script === selectedScript.name ||
                r.script === selectedScript.id
            )
          : roles;

        const availableOutsiderRoles: Role[] = scriptRoles.filter(
          (r: Role) =>
            r.type === "outsider" && !usedRoleIds.includes(r.id) && !r.hidden
        );

        const fakeRole: Role | undefined =
          availableOutsiderRoles.length > 0
            ? getRandom(availableOutsiderRoles)
            : roles.find(
                (r: Role) =>
                  r.type === "outsider" && !usedRoleIds.includes(r.id)
              ) || roles.find((r: Role) => r.type === "outsider");

        return {
          guide: `📚 图书管理员虚假信息：${player1}号、${player2}号中存在（外来者）${fakeRole?.name || "未知外来者"}。`,
          speak: `"${player1}号、${player2}号中存在（外来者）${fakeRole?.name || "未知外来者"}。"`,
        };
      }
      break;
    }

    case "investigator": {
      const potentialFakePlayersInv = seats.filter(
        (s) => s.id !== currentSeatId
      );
      if (potentialFakePlayersInv.length >= 2) {
        const shuffled = [...potentialFakePlayersInv].sort(
          () => Math.random() - 0.5
        );
        const player1 = shuffled[0].id + 1;
        const player2 = shuffled[1].id + 1;

        const usedRoleIds = seats.map((s) => s.role?.id).filter(Boolean);
        const scriptRoles: Role[] = selectedScript
          ? roles.filter(
              (r) =>
                r.script === selectedScript.name ||
                r.script === selectedScript.id
            )
          : roles;

        const availableMinionRoles: Role[] = scriptRoles.filter(
          (r: Role) =>
            r.type === "minion" && !usedRoleIds.includes(r.id) && !r.hidden
        );

        const fakeRole: Role | undefined =
          availableMinionRoles.length > 0
            ? getRandom(availableMinionRoles)
            : roles.find(
                (r: Role) => r.type === "minion" && !usedRoleIds.includes(r.id)
              ) || roles.find((r: Role) => r.type === "minion");

        return {
          guide: `🔍 调查员虚假信息：${player1}号、${player2}号中存在（爪牙）${fakeRole?.name || "未知爪牙"}。`,
          speak: `"${player1}号、${player2}号中存在（爪牙）${fakeRole?.name || "未知爪牙"}。"`,
        };
      }
      break;
    }

    case "chef":
    case "empath": {
      const fakeEvilCount = Math.floor(Math.random() * 3);
      if (roleId === "chef") {
        return {
          guide: `👨‍🍳 得知：场上有${fakeEvilCount}对邪恶玩家邻座。（虚假信息）`,
          speak: `"场上有${fakeEvilCount}对邪恶玩家邻座。"`,
        };
      }
      return {
        guide: `💞 得知：邻近的两名存活玩家中，有${fakeEvilCount}名邪恶玩家。（虚假信息）`,
        speak: `"邻近的两名存活玩家中，有${fakeEvilCount}名邪恶玩家。"`,
      };
    }

    case "fortune_teller": {
      const isFakeDemon = Math.random() < 0.5;
      return {
        guide: `🔮 得知：${isFakeDemon ? "✅ 是" : "❌ 否"}，两名玩家之中有恶魔。（虚假信息）`,
        speak: `"${isFakeDemon ? "是" : "否"}，两名玩家之中有恶魔。"`,
      };
    }

    case "undertaker": {
      const allRoles = roles.filter((r) => r.type !== "traveler");
      const fakeExecutedRole =
        allRoles[Math.floor(Math.random() * allRoles.length)];
      return {
        guide: `⚰️ 得知：今天被处决的玩家是${fakeExecutedRole.name}。（虚假信息）`,
        speak: `"今天被处决的玩家是${fakeExecutedRole.name}。"`,
      };
    }

    default:
      return {
        guide: `${originalGuide}（可能为虚假信息）`,
        speak: originalSpeak,
      };
  }
  return null;
}

export const generateNightTimeline = (
  seats: Seat[],
  isFirstNight: boolean
): TimelineStep[] => {
  const steps: TimelineStep[] = [];

  type MetaRole = {
    id: string;
    firstNightMeta?: any;
    otherNightMeta?: any;
    firstNightOrder?: number;
    otherNightOrder?: number;
  };

  const metaRoles = troubleBrewingRolesData as MetaRole[];

  const getMergedRoleMeta = (baseRole: Role | null | undefined) => {
    if (!baseRole)
      return {
        role: null as Role | null,
        firstMeta: null,
        otherMeta: null,
        firstOrder: 9999,
        otherOrder: 9999,
      };

    const meta = metaRoles.find((r) => r.id === baseRole.id);
    const jsonFirstMeta =
      meta?.firstNightMeta ?? (baseRole as any).firstNightMeta ?? null;
    const jsonOtherMeta =
      meta?.otherNightMeta ?? (baseRole as any).otherNightMeta ?? null;

    const def = getRoleDefinition(baseRole.id);
    const modFirstMeta = def?.firstNight || def?.night || null;
    const modOtherMeta = def?.night || null;

    const firstMeta = modFirstMeta || jsonFirstMeta;
    const otherMeta = modOtherMeta || jsonOtherMeta;

    const firstOrder =
      (typeof def?.firstNight?.order === "number"
        ? def.firstNight.order
        : typeof def?.night?.order === "number"
          ? def.night.order
          : typeof def?.firstNight?.order === "function"
            ? (def.firstNight.order as any)(true)
            : typeof def?.night?.order === "function"
              ? (def.night.order as any)(true)
              : (meta?.firstNightOrder ??
                ((baseRole as any).firstNightOrder as number | undefined))) ??
      9999;

    const otherOrder =
      (typeof def?.night?.order === "number"
        ? def.night.order
        : typeof def?.night?.order === "function"
          ? (def.night.order as any)(false)
          : (meta?.otherNightOrder ??
            ((baseRole as any).otherNightOrder as number | undefined))) ?? 9999;

    return { role: baseRole, firstMeta, otherMeta, firstOrder, otherOrder };
  };

  const activeSeats = seats.filter((seat) => {
    if (!seat.role) return false;

    const effectiveRole =
      seat.role.id === "drunk" && seat.charadeRole
        ? seat.charadeRole
        : seat.role;
    const merged = getMergedRoleMeta(effectiveRole);
    const meta = isFirstNight ? merged.firstMeta : merged.otherMeta;

    if (!seat.isDead && meta) {
      if (seat.statusDetails?.includes("驱魔者选中")) return false;
      return true;
    }

    if (seat.isDead && meta && meta.wakesIfDead === true) return true;

    if (seat.hasAbilityEvenDead) return true;

    return false;
  });

  activeSeats.sort((a, b) => {
    const aEffectiveRole =
      a.role && a.role.id === "drunk" && a.charadeRole ? a.charadeRole : a.role;
    const bEffectiveRole =
      b.role && b.role.id === "drunk" && b.charadeRole ? b.charadeRole : b.role;

    const aMerged = getMergedRoleMeta(aEffectiveRole);
    const bMerged = getMergedRoleMeta(bEffectiveRole);

    const orderA = isFirstNight ? aMerged.firstOrder : aMerged.otherOrder;
    const orderB = isFirstNight ? bMerged.firstOrder : bMerged.otherOrder;

    return orderA - orderB;
  });

  activeSeats.forEach((seat, index) => {
    const effectiveRole =
      seat.role && seat.role.id === "drunk" && seat.charadeRole
        ? seat.charadeRole
        : seat.role;
    const merged = getMergedRoleMeta(effectiveRole);
    const role = merged.role;
    const meta = isFirstNight ? merged.firstMeta : merged.otherMeta;

    if (!role || !meta || !effectiveRole) return;
    console.log(
      `[generateNightTimeline] Role: ${role.name}, meta.targetType: ${meta.targetType}, meta.amount: ${meta.amount}`
    );

    steps.push({
      id: `step_${seat.id}_${effectiveRole.id}_${isFirstNight ? "1" : "n"}`,
      type: "character",
      seatId: seat.id,
      roleId: effectiveRole.id,
      order: index,
      content: {
        title: role.name,
        script: meta.script,
        instruction: meta.instruction,
      },
      interaction: {
        type: meta.targetType === "player" ? "choosePlayer" : "none",
        amount: meta.amount,
        required: meta.required,
        canSelectSelf: meta.canSelectSelf,
        canSelectDead: meta.canSelectDead,
        effect: {
          type: meta.effectType || "none",
          value: meta.effectValue,
        },
      },
    });
  });

  steps.push({
    id: "dawn_step",
    type: "dawn",
    order: 99999,
    content: {
      title: "天亮了",
      script: "所有玩家请睁眼",
      instruction: "点击下方按钮进入白天阶段",
    },
    interaction: {
      type: "none",
      amount: 0,
      required: false,
      canSelectSelf: false,
      canSelectDead: false,
      effect: { type: "none" },
    },
  });

  if (steps.length === 0) {
    console.warn(
      "[generateNightTimeline] No steps generated, returning minimal dawn step"
    );
    return [
      {
        id: "dawn_step",
        type: "dawn",
        order: 99999,
        content: {
          title: "天亮了",
          script: "所有玩家请睁眼",
          instruction: "点击下方按钮进入白天阶段",
        },
        interaction: {
          type: "none",
          amount: 0,
          required: false,
          canSelectSelf: false,
          canSelectDead: false,
          effect: { type: "none" },
        },
      },
    ];
  }

  return steps;
};

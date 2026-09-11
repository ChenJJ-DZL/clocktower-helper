/**
 * 夜间信息适配器
 * 将新引擎的 MiddlewareContext 计算结果转换为 NightInfoResult
 * 已完全替代旧引擎的 calculateNightInfo 函数
 *
 * 设计原则：
 * 1. 使用 nightInfoGenerator 从 getRoleDefinition 的 dialog/target 配置生成 UI 文本
 * 2. 新引擎的 calculate 中间件负责角色逻辑计算
 * 3. 不再依赖旧引擎 nightLogic.ts
 */

import type { NightInfoResult } from "@/src/types/game";
import { type GamePhase, roles, type Script, type Seat } from "../../app/data";
import { LEGION_MUTUAL_RECOGNITION_ID } from "../roles/demon/demonFirstNightHelper";
import { EVIL_CONVERTED_NOTICE_ID } from "./nightStepIds";
import { isMarionetteSeat } from "./roleFlags";
import { unifiedRoleDefinition } from "../roles/unifiedRoleDefinition";
import { generateNightInfo } from "./nightInfoGenerator";
import { resolveEvilTwinPair } from "./evilTwinHelper";

/**
 * 已迁移到新引擎的角色列表（用于追踪迁移进度）
 * 当角色在新引擎中有完整的 calculate 中间件时，加入此列表
 */
export const MIGRATED_ROLES: string[] = [
  "chef",
  "empath",
  "fortune_teller",
  "investigator",
  "librarian",
  "washerwoman",
  "clockmaker",
  "dreamer",
  "flowergirl",
  "oracle",
  "seamstress",
  "artist",
  "savant",
  "mathematician",
  "chambermaid",
  "noble",
  "priestess",
  "knight",
  "balloonist",
  "banshee",
  "farmer",
  "choir_boy",
  "amnesiac",
  "atheist",
  "jester",
  "fisherman",
  "acrobat",
  "snitch",
  "puzzlemaster",
  "gambler",
  "gossip",
  "minstrel",
  "pacifist",
  "goon",
  "lunatic",
  "godfather",
  "devil_s_advocate",
  "mastermind",
  "fang_gu",
  "halfOgre",
  "astrologer",
  "princess",
  "sailor",
  "tea_lady",
  "tinker",
  "soldier",
  "ravenkeeper",
  "mayor",
  "monk",
  "slayer",
  "virgin",
  "undertaker",
  "spy",
  "recluse",
  "poisoner",
  "baron",
  "butler",
  "drunk",
  "saint",
  "scarlet_woman",
  "imp",
  "po",
  "shabaloth",
  "pukka",
  "zombuul",
  "vigormortis",
  "no_dashii",
  "vortox",
  "cerenovus",
  "pit_hag",
  "witch",
  "widow",
  "marionette",
  "evil_twin",
  "mezepheles",
  "harpy",
  "organ_grinder",
  "summoner",
  "psychopath",
  "boomdandy",
  "fearmonger",
  "goblin",
  "courtier",
  "mutant",
  "sweetheart",
  "barber",
  "klutz",
  "damsel",
  "heretic",
  "politician",
  "pixie",
  "snake_charmer",
  "cannibal",
  "engineer",
  "philosopher",
  "ranger",
  "sage",
  "miner",
  "bureaucrat",
  "beggar",
  "gunslinger",
  "thief",
  "scapegoat",
  "fool",
  "villager",
  "angel",
  "doomsayer",
  "toymaker",
  "buddhist",
  "revolutionary",
  "deusExFiasco",
  "ferryman",
  "stormcatcher",
  "ventriloquist",
  "tricksterJack",
  "exorcist",
  "grandmother",
  "innkeeper",
  "magician",
  "alchemist",
  "huntsman",
  "lycanthrope",
  "nightwatchman",
  "professor",
  "king",
  "popcorn",
  "general",
  "preacher",
  "oracle",
  "town_crier",
  "juggler",
  "cult_leader",
  "harlot",
  "judge",
  "necromancer",
  "bone_collector",
  "plague_doctor",
  "leech",
  "lil_monsta",
  "kazali",
  "yaggababble",
  "riot",
  "legion",
  "leviathan",
  "al_hadikhia",
  "hadesia",
  "vortox",
];

/**
 * 检查角色是否已迁移到新引擎
 */
export function isRoleMigrated(roleId: string): boolean {
  const abilities = unifiedRoleDefinition.getRoleAbilities(roleId);
  return abilities.length > 0;
}

/**
 * 获取已迁移角色数量
 */
export function getMigratedRoleCount(): number {
  return unifiedRoleDefinition.getAllAbilities().length;
}

/**
 * 通过新引擎计算夜间信息（同步版本）
 * 如果新引擎没有该角色的能力，立即回退到旧引擎
 *
 * 保持与旧引擎 calculateNightInfo 相同的签名和返回值
 */
export function calculateNightInfoViaNewEngine(
  selectedScript: Script | null,
  seats: Seat[],
  currentSeatId: number,
  gamePhase: GamePhase,
  lastDuskExecution: number | null,
  nightCount: number,
  systemStepRoleId?: string,
  _fakeInspectionResult?: string,
  _drunkFirstInfoMap?: Map<number, boolean>,
  isEvilWithJudgmentFn?: (seat: Seat) => boolean,
  poppyGrowerDead?: boolean,
  _gameLogs?: any[],
  spyDisguiseMode?: "off" | "default" | "on",
  spyDisguiseProbability?: number,
  deadThisNight: number[] = [],
  _balloonistKnownTypes?: Record<number, string[]>,
  registrationCache?: Map<string, any>,
  registrationCacheKey?: string,
  vortoxWorld?: boolean,
  demonVotedToday?: boolean,
  minionNominatedToday?: boolean,
  executedToday?: number | null,
  _hasUsedAbilityFn?: (roleId: string, seatId: number) => boolean,
  _votedThisRound?: number[],
  _outsiderDiedToday?: boolean
): NightInfoResult | null {
  // 非夜间阶段不生成夜间信息（避免 check/day/dusk 等阶段残留 nightInfo）
  if (gamePhase !== "firstNight" && gamePhase !== "night") {
    return null;
  }

  // 系统信息步骤（minion_info / demon_info / legion / good_twin）：直接生成信息，不查角色定义
  const isSystemStep = [
    "minion_info",
    "demon_info",
    LEGION_MUTUAL_RECOGNITION_ID,
    "good_twin_info",
    EVIL_CONVERTED_NOTICE_ID,
  ].includes(systemStepRoleId || "");

  if (systemStepRoleId && isSystemStep) {
    return generateSystemInfoViaAdapter(
      systemStepRoleId,
      seats,
      currentSeatId,
      selectedScript
    );
  }

  const targetSeat = seats.find((s) => s.id === currentSeatId);
  if (!targetSeat || !targetSeat.role) {
    console.warn(
      `[NightInfoAdapter] 未找到目标座位 ${currentSeatId} 或角色，返回 null`
    );
    return null;
  }

  // 若存在角色覆盖（如小精灵执行继承角色技能），使用覆盖的角色ID
  const roleId = systemStepRoleId || targetSeat.role.id;

  // 🛡️ 首夜恶魔信息保障：官方规则中恶魔（如小恶魔、军团等）首夜不执行夜杀，其首夜行动均为恶魔伪装与互认信息
  if (gamePhase === "firstNight" && targetSeat.role.type === "demon") {
    return generateSystemInfoViaAdapter(
      "demon_info",
      seats,
      currentSeatId,
      selectedScript
    );
  }

  // 检查新引擎是否有该角色的能力
  if (!isRoleMigrated(roleId)) {
    console.warn(`[NightInfoAdapter] 角色 ${roleId} 未在新引擎注册，返回 null`);
    return null;
  }

  // 使用 nightInfoGenerator 从 getRoleDefinition 的 dialog/target 配置生成 NightInfoResult
  console.log(
    `[NightInfoAdapter] 角色 ${roleId} 已在新引擎注册，使用 nightInfoGenerator 生成 UI 信息`
  );

  const rawNightInfo = generateNightInfo(
    selectedScript,
    seats,
    currentSeatId,
    gamePhase,
    lastDuskExecution,
    nightCount,
    isEvilWithJudgmentFn,
    poppyGrowerDead,
    spyDisguiseMode,
    spyDisguiseProbability,
    deadThisNight,
    registrationCache,
    registrationCacheKey,
    vortoxWorld,
    demonVotedToday,
    minionNominatedToday,
    executedToday,
    _hasUsedAbilityFn,
    _votedThisRound,
    _outsiderDiedToday,
    systemStepRoleId
  );

  if (!rawNightInfo) return null;

  // 👥 镜像双子对立善良角色在首夜的信息注入
  if (gamePhase === "firstNight" || nightCount === 1) {
    const { evilTwinSeat, isGoodTwin } = resolveEvilTwinPair(
      seats,
      (selectedScript as any)?.evilTwinPair
    );
    if (evilTwinSeat && isGoodTwin(currentSeatId)) {
      const isPassiveInfo = rawNightInfo.targetLimit?.max === 0;
      const twinPrefix = isPassiveInfo
        ? `【双子告知】请先告知该玩家：${evilTwinSeat.id + 1}号是镜像双子！\n`
        : `【双子告知】请先告知该玩家：${evilTwinSeat.id + 1}号是镜像双子！随后再进行角色技能操作。\n`;

      return {
        ...rawNightInfo,
        guide: `${twinPrefix}${rawNightInfo.guide || ""}`,
        guideText: `${twinPrefix}${rawNightInfo.guideText || ""}`,
      };
    }
  }

  return rawNightInfo;
}

/**
 * 生成系统信息步骤（爪牙互认 / 恶魔互认 / 双子告知）的 NightInfoResult
 */
function generateSystemInfoViaAdapter(
  stepId: string,
  seats: Seat[],
  currentSeatId: number,
  selectedScript?: Script | null
): NightInfoResult | null {
  const selfSeat = seats.find((s) => s.id === currentSeatId);
  if (!selfSeat) return null;

  // 🏹 赏金猎人「阵营告知」：官方《规则细节》——被转变的玩家从一开始就属于邪恶阵营，
  //    「应该在首个夜晚立即告知他是邪恶的」。行动者 = 被转变的那名镇民（本步骤排在最前）。
  if (stepId === EVIL_CONVERTED_NOTICE_ID) {
    const seatName = selfSeat.role?.name || "镇民";
    const guide = `唤醒${selfSeat.id + 1}号【${seatName}】，告知他：你已经属于邪恶阵营（赏金猎人的设置调整）。`;
    return {
      roleName: `${selfSeat.id + 1}号-${seatName}(阵营告知)`,
      actionText: "告知其已属于邪恶阵营",
      guide,
      targetLimit: { min: 0, max: 0 },
      hasAction: true,
      dialogTitle: `${selfSeat.id + 1}号-${seatName}`,
      guideText: guide,
      displayInfo: {
        type: EVIL_CONVERTED_NOTICE_ID,
        log: `告知${selfSeat.id + 1}号：你已属于邪恶阵营`,
      },
    } as any;
  }

  if (stepId === "good_twin_info") {
    const { evilTwinSeat, goodTwinSeat } = resolveEvilTwinPair(
      seats,
      (selectedScript as any)?.evilTwinPair
    );
    const evilSeatNo = evilTwinSeat ? `${evilTwinSeat.id + 1}号` : "未知";
    const goodSeat = goodTwinSeat || selfSeat;
    const guide = `唤醒${goodSeat.id + 1}号【${goodSeat.role?.name || "对立双子"}】，告知他：${evilSeatNo}是镜像双子。`;
    return {
      roleName: `${goodSeat.id + 1}号-${goodSeat.role?.name || "善良双子"}(双子告知)`,
      actionText: "告知对立双子",
      guide,
      targetLimit: { min: 0, max: 0 },
      hasAction: true,
      dialogTitle: `${goodSeat.id + 1}号-${goodSeat.role?.name || "对立双子"}`,
      guideText: guide,
      displayInfo: {
        type: "good_twin_info",
        log: `${evilSeatNo}是镜像双子`,
        evilTwinSeatId: evilTwinSeat?.id,
      },
    } as any;
  }

  const isMinionStep = stepId === "minion_info";
  const isLegionMutualStep = stepId === LEGION_MUTUAL_RECOGNITION_ID;
  const demonSeats = seats.filter((s) => s.role?.type === "demon" && !s.isDead);
  const minionSeats = seats.filter(
    (s) => s.role?.type === "minion" && !s.isDead
  );
  const marionetteSeat = seats.find(
    (s) => s.role?.id === "marionette" && !s.isDead
  );
  const isMarionetteActor = isMarionetteSeat(selfSeat);
  const magicianSeat = seats.find(
    (s) => s.role?.id === "magician" && !s.isDead
  );
  const demonsForMinions = magicianSeat
    ? [...demonSeats, magicianSeat]
    : demonSeats;
  const minionsForDemon = magicianSeat
    ? [...minionSeats, magicianSeat]
    : minionSeats;

  // 官方：「其他爪牙也不会得知谁是提线木偶」→ 真爪牙看到的队友名单里必须排除提线木偶
  const otherMinions = minionSeats.filter(
    (s) => s.id !== currentSeatId && !isMarionetteSeat(s)
  );

  // 检查是否有存活且健康的罂粟种植者
  const isPoppyGrowerAlive = seats.some(
    (s) =>
      s.role?.id === "poppy_grower" && !s.isDead && !s.isDrunk && !s.isPoisoned
  );

  const demonDesc =
    demonsForMinions.map((s) => `${s.id + 1}号`).join("、") || "无";
  const minionDesc =
    minionsForDemon.map((s) => `${s.id + 1}号`).join("、") || "无";
  const otherMinionDesc =
    otherMinions.map((s) => `${s.id + 1}号`).join("、") || "无";

  let guide = "";

  // 共享不在场镇民伪装（所有恶魔/军团共用同一套，优先筛选不在场的镇民 Townsfolk）
  const inPlayRoleIds = new Set(seats.map((s) => s.role?.id).filter(Boolean));
  const scriptRoleIds: string[] =
    selectedScript?.roleIds ||
    (selectedScript as any)?.roles?.map((r: any) => r.id) ||
    [];
  const scriptTownsfolk = scriptRoleIds
    .map((id: string) => roles.find((r) => r.id === id))
    .filter(
      (r: any) => r && r.type === "townsfolk" && !inPlayRoleIds.has(r.id)
    );
  const scriptOutsiders = scriptRoleIds
    .map((id: string) => roles.find((r) => r.id === id))
    .filter((r: any) => r && r.type === "outsider" && !inPlayRoleIds.has(r.id));
  const notInPlayGoodRoles = [...scriptTownsfolk, ...scriptOutsiders]
    .slice(0, 3)
    .map((r: any) => r.name);

  const legionBluffText =
    notInPlayGoodRoles.length > 0
      ? `\n共享不在场镇民伪装：【${notInPlayGoodRoles.join("】、【")}】`
      : "";

  const regularBluffText =
    notInPlayGoodRoles.length > 0
      ? `\n不在场伪装: 【${notInPlayGoodRoles.join("】、【")}】`
      : "";

  // 检查场上是否有告密者
  const hasSnitchInPlay = seats.some((s) => s.role?.id === "snitch");
  let snitchBluffText = "";
  if (hasSnitchInPlay) {
    const availableGoodRoles = [...scriptTownsfolk, ...scriptOutsiders];
    if (availableGoodRoles.length > 0) {
      const minionIndex = Math.max(
        0,
        minionSeats.findIndex((s) => s.id === currentSeatId)
      );
      const offset = minionIndex * 3;
      const bluffs: string[] = [];
      for (let i = 0; i < Math.min(3, availableGoodRoles.length); i++) {
        const r = availableGoodRoles[(offset + i) % availableGoodRoles.length];
        if (r && !bluffs.includes(r.name)) {
          bluffs.push(r.name);
        }
      }
      if (bluffs.length > 0) {
        snitchBluffText = `\n告密者伪装: 【${bluffs.join("】、【")}】`;
      }
    }
  }

  // 相克规则（官方）：提线木偶不会得知三个不在场的角色；
  // 若提线木偶与告密者均在场，改为由恶魔额外得知三个不在场角色。
  let snitchMarionetteExtraText = "";
  if (hasSnitchInPlay && marionetteSeat) {
    const extra = [...scriptTownsfolk, ...scriptOutsiders]
      .slice(3, 6)
      .map((r: any) => r.name);
    if (extra.length > 0) {
      snitchMarionetteExtraText = `\n提线木偶×告密者相克·恶魔额外伪装: 【${extra.join("】、【")}】`;
    }
  }

  if (isLegionMutualStep) {
    const aliveLegions = seats.filter(
      (s) =>
        (s.role?.id === "legion" || (s as any).charadeRole?.id === "legion") &&
        !s.isDead
    );
    const legionSeatList =
      aliveLegions.length > 0
        ? aliveLegions.map((s) => `${s.id + 1}号`).join("、")
        : "无";

    guide = `座位号：${legionSeatList}\n说书人同时唤醒所有的军团玩家，军团玩家互认${legionBluffText}`;
  } else if (isMinionStep) {
    if (isMarionetteActor) {
      // 防御性兜底：队列生成已排除提线木偶，正常不会走到这里。
      // 官方：提线木偶不会被唤醒进行爪牙互认，绝不能向其泄漏邪恶信息。
      guide =
        "⛔ 提线木偶不会被唤醒进行爪牙互认（官方规则）。请勿向该玩家展示任何邪恶信息。";
    } else if (isPoppyGrowerAlive) {
      guide = `🌺 罂粟种植者在场，爪牙与恶魔互不相识${snitchBluffText}`;
    } else {
      guide = `恶魔是: ${demonDesc}\n爪牙队友: ${
        otherMinions.length > 0 ? otherMinionDesc : "无"
      }${snitchBluffText}`;
    }
  } else if (selfSeat.role?.id === "legion") {
    // 军团玩家专属夜晚信息：展示所有军团同伴 + 共享 3 不在场镇民伪装
    const allLegions = seats.filter(
      (s) =>
        (s.role?.id === "legion" || (s as any).charadeRole?.id === "legion") &&
        !s.isDead
    );
    const legionSeatList =
      allLegions.length > 0
        ? allLegions.map((s) => `${s.id + 1}号`).join("、")
        : "无";

    if (isPoppyGrowerAlive) {
      guide = `🌺 罂粟种植者在场，军团同伴互不相识${legionBluffText}`;
    } else {
      guide = `座位号：${legionSeatList}\n说书人同时唤醒所有的军团玩家，军团玩家互认${legionBluffText}`;
    }
  } else {
    // 常规恶魔信息
    if (isPoppyGrowerAlive) {
      guide = `🌺 罂粟种植者在场，你不知道爪牙是谁${regularBluffText}`;
    } else {
      let marionetteNote = "";
      if (marionetteSeat) {
        marionetteNote = `\n提线木偶: ${marionetteSeat.id + 1}号`;
      }
      guide = `爪牙是: ${minionDesc}${marionetteNote}${regularBluffText}${snitchMarionetteExtraText}`;
    }
  }

  return {
    seat: selfSeat,
    effectiveRole: {
      id: stepId,
      name: isMinionStep
        ? "爪牙互认"
        : isLegionMutualStep
          ? "军团互认"
          : "恶魔互认",
      type: "townsfolk",
    },
    isPoisoned: false,
    guide,
    speak: "",
    action: "",
    roleId: stepId,
    index: 0,
    targetLimit: { min: 0, max: 0 },
    canSelectDead: false,
    canSelectSelf: false,
    validTargetIds: [],
    guideText: guide,
    actionText: "",
    interaction: {
      type: "none",
      amount: 0,
      required: false,
      canSelectSelf: false,
      canSelectDead: false,
      effect: { type: "none" },
    },
  };
}

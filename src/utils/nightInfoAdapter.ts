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
import { buildCerenovusNoticeNightInfo } from "./cerenovusNotice";
import { EVIL_CONVERTED_NOTICE_ID } from "./nightStepIds";
import {
  MARIONETTE_NO_WAKE_NOTE,
  isLunaticSeat,
  isMarionetteSeat,
} from "./roleFlags";
import { unifiedRoleDefinition } from "../roles/unifiedRoleDefinition";
import { generateNightInfo } from "./nightInfoGenerator";
import { resolveEvilTwinPair } from "./evilTwinHelper";
import {
  computeDemonBluffNames,
  formatLunaticFakeGuide,
  computeLegionTeammateCount,
  getScriptRoleIds,
  resolveLunaticFakeInfo,
} from "./lunaticFakeInfo";

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

  // 🧠 洗脑师：被洗脑玩家当夜必须拿到属于他自己的一个步骤。
  //    若该座位自身没有任何夜间信息，则退化为「得知自己被洗脑」合成节点，
  //    保证这一夜的信息不会因为"角色没有夜间技能 → 空步骤被自动跳过"而丢失。
  const cerenovusNoticeInfo = buildCerenovusNoticeNightInfo(
    targetSeat,
    nightCount
  );

  // 检查新引擎是否有该角色的能力
  if (!isRoleMigrated(roleId)) {
    console.warn(`[NightInfoAdapter] 角色 ${roleId} 未在新引擎注册，返回 null`);
    return cerenovusNoticeInfo;
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

  if (!rawNightInfo) return cerenovusNoticeInfo;

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
  /** 说书人专属补充说明（绝不进玩家页面） */
  let storytellerNote: string | undefined;

  // 共享不在场镇民伪装（所有恶魔/军团共用同一套，优先筛选不在场的镇民 Townsfolk）
  const inPlayRoleIds = new Set(seats.map((s) => s.role?.id).filter(Boolean));
  const scriptRoleIds: string[] = getScriptRoleIds(selectedScript);
  const scriptTownsfolk = scriptRoleIds
    .map((id: string) => roles.find((r) => r.id === id))
    .filter(
      (r: any) => r && r.type === "townsfolk" && !inPlayRoleIds.has(r.id)
    );
  const scriptOutsiders = scriptRoleIds
    .map((id: string) => roles.find((r) => r.id === id))
    .filter((r: any) => r && r.type === "outsider" && !inPlayRoleIds.has(r.id));
  // ⚠️ 真恶魔的 3 张伪装牌与"疯子假信息"共用同一个函数，保证
  //    utils/lunaticFakeInfo.ts 里"疯子那 3 张与恶魔这 3 张不重叠"的约束成立
  //    （否则两处各算一套，约束会悄悄失效）。
  const notInPlayGoodRoles = computeDemonBluffNames(seats, scriptRoleIds);

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
    // 🎭 提线木偶在场：必须明确告诉**说书人**"别把它算进互认、也别顺带通知它"。
    //    官方相克（罂粟种植者条目）：罂粟种植者死亡后恶魔会知道谁是提线木偶，但提线木偶什么都不会知道。
    //
    // ⚠️⚠️ P0 隐私（2026-09-13 用户实测截图指出）：
    //    本分支的 `guide` 会**原样渲染在「爪牙互认 - 结果」页上直接给玩家看**，
    //    因此里面**绝不能**出现任何「规则叙述 / 说书人操作指引」。
    //    原先这里把 MARIONETTE_NO_WAKE_NOTE（「※ 提线木偶不得被唤醒、不得得知任何
    //    邪恶信息（官方：提线木偶不会因其他角色能力确认自己是爪牙）」）拼进了 guide，
    //    等于把说书人的规则说明印在玩家页正中 —— 已改为只进 storytellerNote
    //    （仅 GameConsole 渲染），玩家页不再出现。
    //    ⚠️ 同时仍然**不能写出提线木偶座号**：否则等于把它点给同场的真爪牙。
    if (marionetteSeat) {
      storytellerNote = MARIONETTE_NO_WAKE_NOTE;
    }
    if (isMarionetteActor) {
      // 防御性兜底：队列生成已排除提线木偶，正常不会走到这里。
      // 官方：提线木偶不会被唤醒进行爪牙互认，绝不能向其泄漏邪恶信息。
      // ⚠️ 这句同样是**说书人侧**话术 → 只进 storytellerNote，玩家页留空。
      storytellerNote =
        "⛔ 提线木偶不会被唤醒进行爪牙互认（官方规则）。请勿向该玩家展示任何邪恶信息。";
      guide = "";
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
  } else if (isLunaticSeat(selfSeat)) {
    // 🌀 A1：把疯子**当作真恶魔**唤醒，给出与真恶魔同款的「恶魔互认」页面，
    //    但内容按官方与说书人裁决改为**假信息**：
    //    「疯子会在首个夜晚被唤醒来得知三个不在场的角色，以及与当前游戏数量
    //      符合的爪牙，但是这些信息可能是错误的。」（parsed_roles.json）
    //    - 3 张伪装牌：本局不在场的善良角色，且优先与真恶魔那 3 张不重叠；
    //    - 爪牙名单：数量 == 真实爪牙数，身份全部来自非邪恶座位；
    //    - 绝不包含提线木偶提示（官方只说"恶魔会知道谁是提线木偶"）。
    //    说书人可在解锁视图覆盖（覆盖值同样只喂给疯子，见 useSeatManager 写入）。
    const fake = resolveLunaticFakeInfo(
      seats as any,
      scriptRoleIds,
      selfSeat.id,
      (selectedScript as any)?.id
    );
    const overrideBluffs = (selfSeat as any).lunaticFakeBluffNames as
      | string[]
      | undefined;
    const overrideMinions = (selfSeat as any).lunaticFakeMinionIds as
      | number[]
      | undefined;
    const effectiveFake = {
      ...fake,
      bluffNames:
        Array.isArray(overrideBluffs) && overrideBluffs.length > 0
          ? overrideBluffs
          : fake.bluffNames,
      fakeMinionIds:
        Array.isArray(overrideMinions) && overrideMinions.length >= 0
          ? overrideMinions
          : fake.fakeMinionIds,
    };
    // ⚠️ 2026-09-12 用户实测裁决（推翻了此前"罂粟在场就不给疯子爪牙名单"的做法）：
    //    疯子**永远**要拿到「假爪牙名单」——数量 == 场上真实爪牙数，
    //    座位号是**错的**（只从非邪恶座位里取），这正是官方要的假象：
    //      官方「疯子·运作方式」：「向疯子展示"他们是你的爪牙"信息标记并指向若干名玩家，
    //      数量等同于在场的爪牙数量。（可以指向任何玩家，无论他们是不是爪牙。）」
    //    罂粟种植者削弱的是"真爪牙 ⇄ 真恶魔 互认"，疯子既不是爪牙也不是恶魔，
    //    因此不适用；而且若真恶魔被罂粟屏蔽、疯子却被给了名单，反而成了破绽 → 必须一视同仁。
    //    假名单由 utils/lunaticFakeInfo.ts 生成（已保证不含任何真实邪恶座位）。
    //
    // 🌀 2026-09-12 用户实测：疯子伪装成**军团**时，信息形态必须换成"军团式"。
    //    军团（Legion）**没有爪牙**，它是"一群恶魔互相认亲"——
    //    官方军团互认文案就是「座位号：…／说书人同时唤醒所有的军团玩家，军团玩家互认」
    //    ＋共享的 3 张不在场伪装。
    //    若仍按"恶魔互认"给「爪牙是: X号、Y号」，形态就与军团自相矛盾
    //    （用户原话："军团时没有爪牙，而是大量的军团队友"）。
    //    ⚠️ 队友座位一律取自**非邪恶座位**（复用 fakeMinionIds 这套已保证不泄漏的池子），
    //       数量默认 == 场上真实邪恶数量；说书人可用既有的
    //       seat.lunaticFakeMinionIds / lunaticFakeBluffNames 覆盖（信息微调面板）。
    const isLunaticLegion =
      (selfSeat as any).apparentDemonRole?.id === "legion";
    if (isLunaticLegion) {
      // 🌀 队友人数**按军团的规则**给：官方「军团」角色简介第 1 条
      //    「将在场善良和邪恶玩家的数量在通常的数量上进行**反转**」→
      //    军团总数 == 该人数局的标准善良人数（镇民+外来者）；队友数 = 总数 − 1（它自己）。
      //    例：15 人局 → 9 镇民 + 2 外来者 = 11 军团 → 展示 10 名队友。
      //    座位一律取自**非邪恶池**（teammatePool 已保证不含真实邪恶玩家）。
      const pool = effectiveFake.teammatePool ?? effectiveFake.fakeMinionIds;
      const wantCount = computeLegionTeammateCount(seats.length);
      const teammateIds = pool
        .slice(0, Math.min(wantCount, pool.length))
        .sort((a, b) => a - b);
      const teammateSeats =
        teammateIds.length > 0
          ? teammateIds.map((id) => `${id + 1}号`).join("、")
          : "无";
      const sharedBluffText =
        effectiveFake.bluffNames.length > 0
          ? `\n不在场伪装: 【${effectiveFake.bluffNames.join("】、【")}】`
          : "";
      guide = `座位号：${teammateSeats}\n说书人同时唤醒所有的军团玩家，军团玩家互认${sharedBluffText}`;
    } else {
      guide = formatLunaticFakeGuide(effectiveFake, seats as any);
    }
  } else {
    // 常规恶魔信息
    // 🌀 官方「疯子·运作方式」首夜流程：
    //    「唤醒恶魔。向恶魔展示"你是"信息标记，然后是他的恶魔角色标记。
    //      向恶魔展示"这名玩家是"信息标记，然后是**疯子角色标记**，然后指向疯子玩家。」
    //    ⚠️ 罂粟种植者**不屏蔽**这一条：罂粟削弱的是"真爪牙 ⇄ 真恶魔 互认"，
    //       而疯子既不是爪牙也不是恶魔 → 恶魔仍然必须知道谁是疯子，
    //       否则无法配合演戏，也无法理解后续每晚"疯子选择了谁"的提示。
    const lunaticSeat = seats.find(
      (s) => s.role?.id === "lunatic" && !s.isDead
    );
    const lunaticNote = lunaticSeat ? `\n疯子: ${lunaticSeat.id + 1}号` : "";
    if (isPoppyGrowerAlive) {
      guide = `🌺 罂粟种植者在场，你不知道爪牙是谁${lunaticNote}${regularBluffText}`;
    } else {
      // ⚠️ B1：该 guide 会直接显示在"技能确认页 / 结果页"上（交给玩家点击），
      //    因此只保留**恶魔本人该知道的信息**（官方：恶魔会知道谁是提线木偶），
      //    去掉原本写给说书人的那句「它不知道自己其实是爪牙，请勿让它察觉」。
      // ⚠️⚠️ P0 隐私（2026-09-13 用户实测指出）：`guide` 会**原样渲染在
      //   「技能确认页 / 技能结果页」上，是给玩家看的**，因此**绝不能**出现
      //   任何规则类说明或只有说书人才该知道的信息（如「提线木偶: X号」）。
      //   ⇒ 提线木偶座号只保留在 storytellerNote（仅 GameConsole 渲染），
      //     由说书人当面指点告知恶魔，不由页面文字外泄。
      guide = `爪牙是: ${minionDesc}${lunaticNote}${regularBluffText}${snitchMarionetteExtraText}`;
      // 说书人专属提醒（不进玩家页面，只由 GameConsole 渲染）
      storytellerNote = marionetteSeat
        ? `提线木偶: ${marionetteSeat.id + 1}号（它不知道自己其实是爪牙，请勿让它察觉）`
        : undefined;
    }
    // 🌀 说书人专属：疯子配合演戏提醒（同样只由 GameConsole 渲染，不进玩家页面）
    if (lunaticSeat) {
      const lunaticStoryNote = `疯子: ${lunaticSeat.id + 1}号（他以为自己是恶魔，请配合演戏；指向他并展示【疯子】角色标记，再告知他每夜选择了谁）`;
      storytellerNote = storytellerNote
        ? `${storytellerNote}\n${lunaticStoryNote}`
        : lunaticStoryNote;
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
    // 🌀 A2：疯子走恶魔互认步骤时，玩家面必须显示"我以为我是的那个恶魔"，
    //    而不是「疯子」。effectiveRole 仍保持系统步骤 id（供执行/日志使用）。
    playerFacingRole: isLunaticSeat(selfSeat)
      ? ((selfSeat as any).apparentDemonRole ?? undefined)
      : undefined,
    // ⚠️ 说书人专属：只由 GameConsole 渲染，玩家页（NightActionPage /
    //    NIGHT_ACTION_CONFIRM / INFO_RESULT）一律不读这个字段。
    storytellerNote,
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

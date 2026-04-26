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

import type { Script, Seat } from "@/app/data";
import type { NightInfoResult } from "@/src/types/game";
import type { GamePhase } from "../../app/data";
import { unifiedRoleDefinition } from "../roles/unifiedRoleDefinition";
import { generateNightInfo } from "./nightInfoGenerator";

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
  const targetSeat = seats.find((s) => s.id === currentSeatId);
  if (!targetSeat || !targetSeat.role) {
    console.warn(
      `[NightInfoAdapter] 未找到目标座位 ${currentSeatId} 或角色，返回 null`
    );
    return null;
  }

  const roleId = targetSeat.role.id;

  // 检查新引擎是否有该角色的能力
  if (!isRoleMigrated(roleId)) {
    console.warn(`[NightInfoAdapter] 角色 ${roleId} 未在新引擎注册，返回 null`);
    return null;
  }

  // 使用 nightInfoGenerator 从 getRoleDefinition 的 dialog/target 配置生成 NightInfoResult
  console.log(
    `[NightInfoAdapter] 角色 ${roleId} 已在新引擎注册，使用 nightInfoGenerator 生成 UI 信息`
  );

  return generateNightInfo(
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
    _outsiderDiedToday
  );
}

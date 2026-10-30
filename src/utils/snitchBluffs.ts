/**
 * 告密者（Snitch）伪装生成模块
 *
 * 【官方规则】
 * 告密者（外来者）：爪牙会在其首个夜晚得知三个伪装（3 个不在场的善良角色）。
 * - 每个爪牙玩家都从候选池中独立随机选取 3 个伪装角色；
 * - 各爪牙得知的伪装组合应当是不完全相同的；
 * - 若剧本中不在场的善良角色不足，从全局善良角色池补齐，保证候选池充沛；
 * - 随机数走确定性种子，保证同一爪牙在预览、执行、弹窗间信息完全一致。
 */

import {
  createDeterministicRandom,
  nightInfoSeed,
} from "../roles/core/deterministicRandom";
import { isRealMinion } from "./roleFlags";
import type { Role } from "@/app/data";

export interface SeatLikeForSnitch {
  id: number;
  role?: { id?: string | null; name?: string | null; type?: string | null } | null;
  charadeRole?: { id?: string | null; name?: string | null; type?: string | null } | null;
  displayRole?: { id?: string | null; name?: string | null; type?: string | null } | null;
  isDead?: boolean | null;
  snitchBluffs?: string[] | null;
}

/**
 * 获取告密者伪装的候选善良角色池（优先剧本中不在场，不足时从全局不在场补齐）。
 */
export function getSnitchCandidateGoodRoles(
  seats: readonly SeatLikeForSnitch[],
  allRoles: readonly Role[],
  scriptRoleIds?: readonly string[]
): Role[] {
  const inPlayRoleIds = new Set(
    seats.map((s) => s.role?.id).filter((id): id is string => Boolean(id))
  );

  const scriptIds = scriptRoleIds ?? [];
  const scriptGoodRoles = scriptIds
    .map((id) => allRoles.find((r) => r.id === id))
    .filter(
      (r): r is Role =>
        Boolean(r) &&
        (r!.type === "townsfolk" || r!.type === "outsider") &&
        r!.id !== "drunk" &&
        !inPlayRoleIds.has(r!.id)
    );

  // 如果剧本中不在场的善良角色少于 6 个，用全局不在场的善良角色补足候选池
  if (scriptGoodRoles.length < 6) {
    const existingIds = new Set(scriptGoodRoles.map((r) => r.id));
    const globalGoodRoles = allRoles.filter(
      (r) =>
        (r.type === "townsfolk" || r.type === "outsider") &&
        r.id !== "drunk" &&
        !inPlayRoleIds.has(r.id) &&
        !existingIds.has(r.id)
    );
    return [...scriptGoodRoles, ...globalGoodRoles];
  }

  return scriptGoodRoles;
}

/**
 * 洗牌算法（使用确定性 RNG）
 */
function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * 为场上每一名真爪牙计算其告密者伪装角色名称列表。
 * 保证每个爪牙得知的 3 个角色不完全相同。
 */
export function computeAllMinionSnitchBluffs(
  seats: readonly SeatLikeForSnitch[],
  allRoles: readonly Role[],
  scriptRoleIds?: readonly string[]
): Map<number, string[]> {
  const result = new Map<number, string[]>();
  const pool = getSnitchCandidateGoodRoles(seats, allRoles, scriptRoleIds);
  if (pool.length === 0) return result;

  const minionSeats = seats
    .filter((s) => isRealMinion(s as any) && !s.isDead)
    .sort((a, b) => a.id - b.id);

  // 记录已被使用的三选一组合签名（用于防完全重复）
  const usedCombinationSignatures = new Set<string>();

  for (let idx = 0; idx < minionSeats.length; idx++) {
    const minion = minionSeats[idx];
    if (
      minion.snitchBluffs &&
      Array.isArray(minion.snitchBluffs) &&
      minion.snitchBluffs.length > 0
    ) {
      result.set(minion.id, minion.snitchBluffs);
      usedCombinationSignatures.add([...minion.snitchBluffs].sort().join("|"));
      continue;
    }

    if (pool.length <= 3) {
      const names = pool.map((r) => r.name);
      result.set(minion.id, names);
      continue;
    }

    // 从候选池中抽取 3 个，若与前面爪牙完全相同则换 seed 重抽
    let chosen: string[] = [];
    for (let attempt = 0; attempt < 15; attempt++) {
      const seed =
        attempt === 0
          ? nightInfoSeed("snitch_minion_bluff", minion.id, 1)
          : nightInfoSeed("snitch_minion_bluff", minion.id, 1) +
            `_attempt_${attempt}_idx_${idx}`;
      const rng = createDeterministicRandom(seed);
      const shuffled = shuffle(pool, rng);
      chosen = shuffled.slice(0, 3).map((r) => r.name);
      const signature = [...chosen].sort().join("|");
      if (!usedCombinationSignatures.has(signature) || attempt === 14) {
        usedCombinationSignatures.add(signature);
        break;
      }
    }
    result.set(minion.id, chosen);
  }

  return result;
}

/**
 * 获取指定爪牙座位号的告密者伪装
 */
export function getSnitchBluffsForMinion(
  seats: readonly SeatLikeForSnitch[],
  allRoles: readonly Role[],
  scriptRoleIds: readonly string[] | undefined,
  currentSeatId: number
): string[] {
  const currentSeat = seats.find((s) => s.id === currentSeatId);
  if (
    currentSeat?.snitchBluffs &&
    Array.isArray(currentSeat.snitchBluffs) &&
    currentSeat.snitchBluffs.length > 0
  ) {
    return currentSeat.snitchBluffs;
  }
  const allMap = computeAllMinionSnitchBluffs(seats, allRoles, scriptRoleIds);
  return allMap.get(currentSeatId) ?? [];
}

/**
 * 提线木偶相克：恶魔额外得知的 3 个伪装角色
 */
export function getSnitchExtraBluffsForDemon(
  seats: readonly SeatLikeForSnitch[],
  allRoles: readonly Role[],
  scriptRoleIds: readonly string[] | undefined,
  excludeNames: readonly string[] = []
): string[] {
  const pool = getSnitchCandidateGoodRoles(seats, allRoles, scriptRoleIds);
  const filtered = pool.filter((r) => !excludeNames.includes(r.name));
  const candidatePool = filtered.length >= 3 ? filtered : pool;
  if (candidatePool.length <= 3) return candidatePool.map((r) => r.name);

  const demonSeat = seats.find((s) => s.role?.type === "demon" && !s.isDead);
  const seed = nightInfoSeed("snitch_demon_extra", demonSeat?.id ?? 999, 1);
  const rng = createDeterministicRandom(seed);
  return shuffle(candidatePool, rng)
    .slice(0, 3)
    .map((r) => r.name);
}

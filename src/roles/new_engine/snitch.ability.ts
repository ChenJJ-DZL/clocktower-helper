/**
 * 告密者（Snitch）新引擎技能实现
 *
 * 官方 Wiki（罂粟花开 1:1 规格书）：
 *   "爪牙会在其首个夜晚得知三个伪装。"
 *   （注：原意是所有爪牙在首夜被告知"三个不在场角色"，与恶魔的"伪装"相同。）
 *
 * 实现：
 *   - 阶段 1（首夜）：从剧本中"不在场"角色中选 3 个善良角色 → 推送给所有存活爪牙
 *   - 提线木偶相克：marionette 在场时，跳过 marionette；改由恶魔额外推送 3 角色
 */
import {
  createDeterministicRandom,
  type DeterministicRandom,
  nightInfoSeed,
} from "../core/deterministicRandom";
import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

/**
 * Fisher-Yates 洗牌（原实现用 `sort(() => Math.random() - 0.5)`，
 * 既不是均匀分布、也无法注入确定性随机）。
 */
export function shuffleWithRng<T>(
  arr: readonly T[],
  rng: DeterministicRandom = Math.random
): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * 从「不在场角色」中选出最多 count 个作为爪牙的伪装角色名。
 * 优先取不在场镇民，不足时用不在场外来者补齐（排除酒鬼）。
 */
export function pickAbsentRoleNames(
  allRoles: any[],
  assignedRoleIds: Set<string>,
  rng: DeterministicRandom = Math.random,
  count = 3
): string[] {
  const absentTownsfolk = allRoles.filter(
    (r) =>
      r.type === "townsfolk" && !assignedRoleIds.has(r.id) && r.id !== "drunk"
  );
  const absentOutsider = allRoles.filter(
    (r) => r.type === "outsider" && !assignedRoleIds.has(r.id)
  );

  const shuffledTf = shuffleWithRng(absentTownsfolk, rng);
  const shuffledOs = shuffleWithRng(absentOutsider, rng);

  const picked: string[] = [];
  for (const r of shuffledTf) {
    if (picked.length >= count) break;
    picked.push(r.name);
  }
  if (picked.length < count) {
    for (const r of shuffledOs) {
      if (picked.length >= count) break;
      picked.push(r.name);
    }
  }
  return picked;
}

/**
 * 提线木偶相克时，恶魔额外得知的 count 个「不在场角色」（与 picked 不重复）。
 */
export function pickExtraAbsentRoleNames(
  allRoles: any[],
  excludeNames: readonly string[],
  rng: DeterministicRandom = Math.random,
  count = 3
): string[] {
  const remaining = allRoles.filter(
    (r) =>
      !excludeNames.includes(r.name) &&
      r.id !== "drunk" &&
      (r.type === "townsfolk" || r.type === "outsider")
  );
  const picked: string[] = [];
  for (const r of shuffleWithRng(remaining, rng)) {
    if (picked.length >= count) break;
    picked.push(r.name);
  }
  return picked;
}

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  // 仅首夜触发
  const nightCount = ctx.snapshot.nightCount ?? 0;
  if (nightCount !== 1 && ctx.snapshot.gamePhase !== "firstNight") {
    return { ...ctx, aborted: true, abortReason: "非首夜，告密者不行动" };
  }
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  // 从脚本中"不在场"角色选 3 个（排除已被分配的）
  const allRoles: any[] =
    (ctx.snapshot as any).scriptRoles ?? (ctx.snapshot as any).roles ?? [];
  const assignedRoleIds = new Set(
    (ctx.snapshot.seats as any[]).filter((s) => s.role).map((s) => s.role.id)
  );

  // 🎲 确定性随机：首夜行动会被计算两次（提示预演 / 实际执行），
  // 必须保证两次推送的是同一组不在场角色。
  const rng = createDeterministicRandom(
    nightInfoSeed(
      "snitch",
      ctx.actionNode.seatId,
      ctx.snapshot.nightCount ?? 1
    )
  );

  // 随机选 3 个
  const picked = pickAbsentRoleNames(allRoles, assignedRoleIds, rng);

  // 提线木偶相克：marionette 在场时跳过 marionette（用 storytellerInput.marionetteSeatId 标记）
  const marionetteId = (ctx.storytellerInput as any)?.marionetteSeatId;
  const skipMarionette = marionetteId !== undefined && marionetteId !== null;

  // 受推送的爪牙
  const minionSeats = (ctx.snapshot.seats as any[]).filter((s) => {
    if (!s.isAlive) return false;
    if (s.role?.type !== "minion") return false;
    if (skipMarionette && s.id === marionetteId) return false;
    return true;
  });

  // 提线木偶相克补充：若 marionette 跳过，恶魔额外获得 3 个不在场角色
  // （官方 Wiki："改为由恶魔额外得知三个不在场角色"）
  const demonExtraAbsentRoles: string[] = [];
  if (skipMarionette) {
    // 重新选 3 个不同的角色（与原 picked 不同）
    demonExtraAbsentRoles.push(
      ...pickExtraAbsentRoleNames(allRoles, picked, rng)
    );
  }

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        absentRoles: picked,
        minionSeatIds: minionSeats.map((s) => s.id),
        marionetteSkipped: skipMarionette,
        demonExtraAbsentRoles,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      snitchAbsentRoles: r.absentRoles,
      snitchMinionTargets: r.minionSeatIds,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        snitch: r,
      },
    },
    meta: { ...ctx.meta, snitchResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const absent = (r?.absentRoles ?? []).join("、");
  const minionList = (r?.minionSeatIds ?? [])
    .map((id: number) => `${id + 1}号`)
    .join("、");
  const log = `[告密者] 首夜向 ${minionList} 推送不在场角色：${absent || "无"}`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `首夜告密者推送：依次唤醒 ${minionList} 爪牙，展示三个不在场角色：${absent || "无"}。`,
      abilityLog: log,
    },
  };
};

export const snitchAbility = createRoleAbility({
  roleId: "snitch",
  abilityId: "snitch_first_night_bluffs",
  abilityName: "爪牙三伪装推送",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT],
  firstNightPriority: 60, // 在恶魔信息之后、爪牙行动之前
  otherNightPriority: null,
  firstNightOnly: true,
  wakePromptId: "role.snitch.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

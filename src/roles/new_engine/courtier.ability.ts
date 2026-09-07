/**
 * 侍臣（Courtier）新引擎技能实现
 *
 * 【角色能力】"每局游戏限一次，在夜晚时，你可以选择一个角色：如果该角色在场，该角色之一从当晚开始醉酒三天三夜。"
 *
 * - 每局限一次，夜间可选择不使用或使用
 * - 选择一个角色（Role ID）
 * - 若该角色在场，其持有者醉酒三天三夜（从当晚起算3夜3天）
 * - 醉酒时使用：无事发生，但能力被消耗，且今后不再被唤醒
 */
import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// 前置校验：死亡玩家不能发动能力；已使用过能力的不能再次发动
const preCheckAliveAndUnused = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const seat = ctx.snapshot.seats.find(
    (s: any) => s.id === ctx.actionNode.seatId
  );
  if (!seat || seat.isDead) {
    return {
      ...ctx,
      aborted: true,
      abortReason: "侍臣已死亡，无法使用能力",
    };
  }
  if ((ctx.snapshot as any).courtierUsed || (seat as any).hasUsedAbility) {
    return {
      ...ctx,
      aborted: true,
      abortReason: "侍臣已使用过能力，无法再次使用",
    };
  }
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const isAbilityActive = ctx.meta.abilityEffective ?? true;
  const currentNight = (ctx.snapshot as any).nightCount ?? 1;

  // 支持通过 storytellerInput.targetRoleId 选择角色，或 ctx.targetRoleId 或 targetIds[0]
  const targetRoleId: string | null =
    (ctx.storytellerInput as any)?.targetRoleId ??
    (ctx.meta as any)?.targetRoleId ??
    (ctx as any).targetRoleId ??
    null;

  let targetSeatId: number | null = null;
  let targetRoleName = "";

  if (targetRoleId) {
    const matchedSeat = ctx.snapshot.seats.find(
      (s: any) => s.role?.id === targetRoleId && !s.isDead
    );
    if (matchedSeat) {
      targetSeatId = matchedSeat.id;
      targetRoleName = matchedSeat.role?.name || targetRoleId;
    }
  } else if (ctx.targetIds && ctx.targetIds.length > 0) {
    targetSeatId = ctx.targetIds[0];
    const s = ctx.snapshot.seats.find((st: any) => st.id === targetSeatId);
    targetRoleName = s?.role?.name || "";
  }

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        used: true,
        targetRoleId,
        targetSeatId,
        targetRoleName,
        targetInPlay: targetSeatId != null,
        effective: isAbilityActive && targetSeatId != null,
        isAbilityActive,
        currentNight,
        drunkUntilNight: currentNight + 3,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.used) return ctx;

  const seats = ctx.snapshot.seats.map((seat: any) => {
    // 侍臣自己标记能力已消耗
    let updated = seat;
    if (seat.id === ctx.actionNode.seatId) {
      updated = { ...updated, hasUsedAbility: true };
    }
    // 若能力有效且找到了目标，目标获得 3 夜 3 天的醉酒状态
    if (r.isAbilityActive && r.targetSeatId != null && seat.id === r.targetSeatId) {
      const effects = [...(seat.statusEffects ?? [])];
      effects.push({
        type: "drunk",
        source: "courtier",
        sourceSeatId: ctx.actionNode.seatId,
        duration: 3,
        durationDays: 3,
        drunkUntilNight: r.drunkUntilNight,
      });
      updated = { ...updated, isDrunk: true, statusEffects: effects };
    }
    return updated;
  });

  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      seats,
      courtierUsed: true,
      courtier: {
        targetRoleId: r.targetRoleId,
        targetSeatId: r.targetSeatId,
        drunkUntilNight: r.drunkUntilNight,
      },
    } as any,
    meta: { ...ctx.meta, courtierResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log =
    r?.targetSeatId != null && r?.isAbilityActive
      ? `[Courtier] ${ctx.actionNode.seatId + 1}号侍臣 使 ${r.targetRoleName}(${r.targetSeatId + 1}号) 醉酒3天3夜`
      : r?.used
        ? `[Courtier] ${ctx.actionNode.seatId + 1}号侍臣 使用了能力（未生效或目标不在场）`
        : "[Courtier] 未行动";
  console.log(log);

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `侍臣选择一个角色使其醉酒3天3夜。`,
      abilityLog: log,
    },
  };
};

export const courtierAbility = createRoleAbility({
  roleId: "courtier",
  effectSemantics: "drunk",
  abilityId: "courtier_drunk",
  abilityName: "朝臣醉酒",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: 32,
  otherNightPriority: 15,
  firstNightOnly: false,
  wakePromptId: "role.courtier.wake",
  targetConfig: { min: 0, max: 1, allowSelf: false, allowDead: false },
  preCheck: [preCheckAliveAndUnused],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

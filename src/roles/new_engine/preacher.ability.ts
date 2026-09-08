/**
 * 传教士（Preacher）新引擎技能实现
 *
 * 【角色能力】"每个夜晚，你要选择一名玩家：如果你选中了爪牙，他会得知被传教士选中。
 *  所有被你选中的爪牙失去能力。"
 *
 * 每个夜晚唤醒传教士，选择一名存活玩家：
 * - 若该玩家是爪牙（且传教士清醒健康），该爪牙被标记“失去能力”（preached: true），并得知被传教士选中。
 * targetConfig: { min: 1, max: 1 }
 */
import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const seat = ctx.snapshot.seats.find(
    (s: any) => s.id === ctx.actionNode.seatId
  );
  if (!seat?.isAlive) return { ...ctx, aborted: true, abortReason: "已死亡" };

  const effects =
    seat.statusEffects ?? ctx.snapshot.statusEffects?.[seat.id] ?? [];
  const isDrunk = effects.some((e: any) => e.type === "drunk");
  const isPoisoned = effects.some((e: any) => e.type === "poisoned");

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      isDrunk,
      isPoisoned,
      abilityEffective: !(isDrunk || isPoisoned),
    },
  };
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const targetId = ctx.targetIds?.[0] ?? ctx.actionNode.targetIds?.[0] ?? null;
  const effective = ctx.meta.abilityEffective ?? true;

  if (targetId == null) {
    return { ...ctx, aborted: true, abortReason: "未选择目标" };
  }

  const targetSeat = ctx.snapshot.seats.find((s: any) => s.id === targetId);
  const isMinion =
    targetSeat?.role?.type === "minion" || targetSeat?.roleType === "minion";

  const isPreached = effective && isMinion;

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetId,
        isMinion,
        isPreached,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.isPreached) return ctx;

  const targetId = r.targetId;
  const updatedSeats = ctx.snapshot.seats.map((s: any) => {
    if (s.id === targetId) {
      return {
        ...s,
        preached: true,
        isAbilityDisabled: true,
        statusDetails: [
          ...(s.statusDetails || []).filter((d: string) => d !== "被传教士净化(失去能力)"),
          "被传教士净化(失去能力)",
        ],
      };
    }
    return s;
  });

  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      seats: updatedSeats,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        preacher: r,
      },
    },
    meta: { ...ctx.meta, preacherResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log = r?.isPreached
    ? `[Preacher] 传教士选中了爪牙【${r.targetId + 1}号】，其失去能力并得知被布道`
    : `[Preacher] 传教士选中了【${(r?.targetId ?? -1) + 1}号】（非爪牙或传教士受干扰）`;
  console.log(log);

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityLog: log,
      prompt: `传教士选择了${(r?.targetId ?? -1) + 1}号。${
        r?.isPreached ? "该玩家是爪牙，请向其展示【传教士】标记并示意其失去能力。" : "无事发生。"
      }`,
    },
  };
};

export const preacherAbility = createRoleAbility({
  roleId: "preacher",
  abilityId: "preacher_nightly",
  abilityName: "传教士",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT, AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: 25,
  otherNightPriority: 10,
  firstNightOnly: false,
  wakePromptId: "role.preacher.wake",
  targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

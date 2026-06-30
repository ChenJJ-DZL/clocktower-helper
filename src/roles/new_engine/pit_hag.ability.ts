/**
 * 麻脸巫婆（Pit-Hag）新引擎技能实现
 *
 * 【角色能力】"每个夜晚*，你要选择一名玩家和一个角色，如果该角色不在场，
 *   他变成该角色。如果因此创造了一个恶魔，当晚的死亡由说书人决定。"
 *
 * 每夜选择目标+角色，进行角色变换。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const seat = ctx.snapshot.seats.find(
    (s: any) => s.id === ctx.actionNode.seatId
  );
  if (!seat?.isAlive) return { ...ctx, aborted: true, abortReason: "已死亡" };
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const targetId = ctx.targetIds?.[0] ?? ctx.actionNode.targetIds?.[0] ?? null;
  const newRoleId =
    ctx.storytellerInput?.newRoleId ?? ctx.storytellerInput?.roleId ?? null;
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetId,
        newRoleId,
        transformed: targetId !== null && newRoleId !== null,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.transformed) return ctx;
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      roleChanges: [
        ...((ctx.snapshot as any).roleChanges ?? []),
        { seatId: r.targetId, newRole: r.newRoleId },
      ],
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        pit_hag: r,
      },
    },
    meta: { ...ctx.meta, pitHagResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.targetId) {
    console.log("[PitHag] 无操作");
    return ctx;
  }
  const log = `[PitHag] ${r.targetId + 1}号 → ${r.newRoleId ?? "未指定角色"}`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【麻脸巫婆】，选择一名玩家和一个角色进行变换。`,
      abilityLog: log,
    },
  };
};

export const pit_hagAbility = createRoleAbility({
  roleId: "pit_hag",
  abilityId: "pit_hag_transform",
  abilityName: "角色变换",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: null,
  otherNightPriority: 11,
  firstNightOnly: false,
  wakePromptId: "role.pit_hag.wake",
  targetConfig: { min: 1, max: 1, allowSelf: true, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

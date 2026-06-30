/**
 * 鹰身女妖（Harpy）新引擎技能实现
 *
 * 【角色能力】"每个夜晚，选择两名玩家。明天白天，如果其中一名玩家提名了另一名，死者不会死。"
 *
 * 每夜选择两名玩家，若次日二者互相提名则处决无效
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
  const targetIds = ctx.targetIds ?? ctx.actionNode.targetIds ?? [];
  return {
    ...ctx,
    meta: { ...ctx.meta, abilityResult: { targetIds, harpyActive: true } },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.targetIds?.length) return ctx;
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      harpyTargets: r.targetIds,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        harpy: r,
      },
    },
    meta: { ...ctx.meta, harpyResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const ids = r?.targetIds ?? [];
  const log =
    ids.length >= 2
      ? `[鹰身女妖] 挑拨 ${ids.map((id: number) => `${id + 1}号`).join("、")}`
      : "[鹰身女妖] 未行动";
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【鹰身女妖】，选择两名玩家挑拨离间。`,
      abilityLog: log,
    },
  };
};

export const harpyAbility = createRoleAbility({
  roleId: "harpy",
  abilityId: "harpy_incite",
  abilityName: "挑拨离间",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: 42,
  otherNightPriority: 32,
  firstNightOnly: false,
  wakePromptId: "role.harpy.wake",
  targetConfig: { min: 2, max: 2, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

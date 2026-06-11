/**
 * 酿酒师（Brewer）新引擎技能实现
 *
 * 【角色能力】"每个夜晚，你可以选择两名玩家：如果他们今晚都被提名，则他们不会死亡。"
 *
 * 每夜选择两名玩家保护。如果这两人在白天都被提名，则他们不会因提名处决死亡。
 * targetConfig: min:2, max:2 — 必须选择两名玩家
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
  const target1 = ctx.targetIds?.[0] ?? ctx.actionNode.targetIds?.[0] ?? null;
  const target2 = ctx.targetIds?.[1] ?? ctx.actionNode.targetIds?.[1] ?? null;

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        target1,
        target2,
        protected: !!(target1 && target2),
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.protected) return ctx;

  const existing = (ctx.snapshot as any).protectedTonight ?? [];
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      protectedTonight: [...existing, r.target1, r.target2].filter(Boolean),
    } as any,
    meta: { ...ctx.meta, brewerResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log =
    r?.target1 != null
      ? `[Brewer] 保护 ${r.target1 + 1}号 和 ${r.target2 + 1}号`
      : "[Brewer] 未行动";
  console.log(log);

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【酿酒师】，选择两名玩家保护。`,
      abilityLog: log,
    },
  };
};

export const brewerAbility = createRoleAbility({
  roleId: "brewer",
  abilityId: "brewer_protect",
  abilityName: "酿酒保护",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 25,
  firstNightOnly: false,
  wakePromptId: "role.brewer.wake",
  targetConfig: { min: 2, max: 2, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

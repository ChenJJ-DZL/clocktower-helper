/**
 * 炸弹人（Boomdandy）新引擎技能实现
 *
 * 【角色能力】"如果你被处决，除三名玩家以外的其他所有玩家均会死亡。倒数十声后，被最多玩家手指指着的玩家死亡。"
 *
 * PASSIVE 触发：被处决时触发群体死亡效果。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const executedToday = (ctx.snapshot as any).executedToday;
  const isExecuted = executedToday?.seatId === ctx.actionNode.seatId;
  if (!isExecuted) return { ...ctx, aborted: true, abortReason: "未被处决" };
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const survivors = ctx.storytellerInput?.survivors ?? 3;
  const pointedTarget = ctx.storytellerInput?.pointedTarget ?? null;

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        boomdandyExecuted: true,
        survivors,
        pointedTarget,
        triggered: true,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.triggered) return ctx;

  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      boomdandyDetonated: true,
      boomdandySurvivors: r.survivors,
      boomdandyPointedTarget: r.pointedTarget,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        boomdandy: r,
      },
    },
    meta: { ...ctx.meta, boomdandyResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log = `[炸弹人] 被处决引爆！保留${r?.survivors ?? 3}名存活者`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityLog: log,
      prompt:
        "【炸弹人】被处决引爆，选择保留的3名存活玩家，然后执行10秒指向判定。",
    },
  };
};

export const boomdandyAbility = createRoleAbility({
  roleId: "boomdandy",
  abilityId: "boomdandy_explode",
  abilityName: "同归于尽",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

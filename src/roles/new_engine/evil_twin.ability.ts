/**
 * 邪恶双子（Evil Twin）新引擎技能实现
 *
 * 【角色能力】"你与一名对立阵营的玩家互相知道对方是什么角色。
 *   如果其中善良玩家被处决，邪恶阵营获胜。
 *   如果你们都存活，善良阵营无法获胜。"
 *
 * 首夜互知。全局效果：善良双子被处决时邪恶获胜。
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
  if (!seat?.isAlive) return ctx;
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const twinId =
    ctx.storytellerInput?.twinId ??
    ctx.snapshot.seats.find(
      (s: any) =>
        s.id !== ctx.actionNode.seatId &&
        !s.isDead &&
        s.role?.type !== s.role?.type // opposite alignment
    )?.id ??
    null;
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        twinRevealed: true,
        twinId,
        goodTwinExecuted: false,
        evilWinsIfGoodTwinDies: true,
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
      evilTwinPair: {
        evilSeatId: ctx.actionNode.seatId,
        goodSeatId: r?.twinId,
      },
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        evil_twin: r,
      },
    },
    meta: { ...ctx.meta, evilTwinResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const log = "[EvilTwin] 双子首夜互知完成";
  console.log(log);
  return { ...ctx, meta: { ...ctx.meta, abilityLog: log } };
};

export const evil_twinAbility = createRoleAbility({
  roleId: "evil_twin",
  abilityId: "evil_twin_reveal",
  abilityName: "双子绑定",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT],
  wakePriority: 23,
  firstNightOnly: true,
  wakePromptId: "role.evil_twin.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

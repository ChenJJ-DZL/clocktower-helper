/**
 * 军团（Legion）新引擎技能实现
 *
 * 【角色能力】"所有玩家都是恶魔，但只有活着的才算。"
 *
 * 游戏规则修改器：所有存活玩家都被视为恶魔身份，用于胜负判定。
 * 只有活着的玩家计入恶魔计数，死亡后不再被视为恶魔。
 * 不主动唤醒，被动修改游戏状态。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const alivePlayers = ctx.snapshot.seats.filter((s: any) => s.isAlive);
  const demonCount = alivePlayers.length;

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        legionActive: true,
        allAreDemons: true,
        demonCount,
        aliveCount: alivePlayers.length,
        totalPlayers: ctx.snapshot.seats.length,
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
      legionActive: true,
      legionDemonCount: r?.demonCount ?? 0,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        legion: r,
      },
    },
    meta: { ...ctx.meta, legionResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log = `[Legion] 军团在场 — 全部${r?.totalPlayers}名玩家均为恶魔（存活${r?.aliveCount}名计入计数）`;
  console.log(log);
  return {
    ...ctx,
    meta: { ...ctx.meta, abilityLog: log },
  };
};

export const legionAbility = createRoleAbility({
  roleId: "legion",
  abilityId: "legion_passive",
  abilityName: "军团",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  firstNightPriority: null,
  otherNightPriority: 44,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

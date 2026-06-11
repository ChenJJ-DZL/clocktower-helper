/**
 * 召唤师（Summoner）新引擎技能实现
 *
 * 【角色能力】"首夜，召唤一名恶魔。"
 *
 * FIRST_NIGHT 触发，说书人选择一名玩家成为恶魔。
 * 通过 storytellerInput 提供目标，将该玩家的角色覆盖为恶魔（imp）。
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
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetId,
        summoned: targetId != null,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const newSnapshot = { ...ctx.snapshot };
  if (r.targetId != null) {
    if (!newSnapshot.roleAssignments)
      newSnapshot.roleAssignments = { ...ctx.snapshot.roleAssignments };
    newSnapshot.roleAssignments = {
      ...newSnapshot.roleAssignments,
      [r.targetId]: {
        ...newSnapshot.roleAssignments[r.targetId],
        id: "imp",
        team: "demon",
      },
    };
    newSnapshot._abilityResults = {
      ...((ctx.snapshot as any)._abilityResults ?? {}),
      summoner: r,
    };
  }
  return {
    ...ctx,
    snapshot: newSnapshot,
    meta: { ...ctx.meta, summonerResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log =
    "[召唤师] " +
    (r.targetId != null
      ? "将 " + (r.targetId + 1) + " 号转化为恶魔"
      : "未选择目标");
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt:
        "唤醒" +
        (ctx.actionNode.seatId + 1) +
        "号【召唤师】，选择一名玩家转化为恶魔。",
      abilityLog: log,
    },
  };
};

export const summonerAbility = createRoleAbility({
  roleId: "summoner",
  abilityId: "summoner_night",
  abilityName: "召唤师",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT],
  wakePriority: 5,
  firstNightOnly: true,
  wakePromptId: "role.summoner.wake",
  targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

/**
 * 隐士（Hermit）新引擎技能实现
 *
 * 【角色能力】"你拥有所有外来者能力。"
 *
 * PASSIVE/SETUP 触发。
 * 标记 hermitActive，使隐士获得所有外来者角色的能力效果。
 * 该能力在游戏初始化/角色分配时生效，持续整局游戏。
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
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        hermitActive: true,
        grantsAllOutsiderAbilities: true,
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
      hermitActive: true,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        hermit: r,
      },
    },
    meta: { ...ctx.meta, hermitResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  console.log(
    `[Hermit] 隐士（${ctx.actionNode.seatId + 1}号）拥有所有外来者能力`
  );
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `隐士（${ctx.actionNode.seatId + 1}号）拥有所有外来者能力。`,
      abilityLog: "[Hermit] 隐士激活，拥有所有外来者能力",
    },
  };
};

export const hermitAbility = createRoleAbility({
  roleId: "hermit",
  abilityId: "hermit_all_outsider_abilities",
  abilityName: "隐世之智",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "role.hermit.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

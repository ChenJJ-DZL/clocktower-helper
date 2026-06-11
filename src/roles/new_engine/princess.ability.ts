/**
 * 公主（Princess）新引擎技能实现（实验角色）
 *
 * 【角色能力】"如果你是首个被提名处决的玩家，被处决后不会死亡。对你来说，
 *   恶魔在接下来的夜晚无法造成死亡。"
 *
 * PASSIVE 触发：首个白天被提名处决时触发。
 * - 公主展示身份后处决不导致死亡
 * - 当晚恶魔无法杀人
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
  // 标记公主已被触发，当晚恶魔无法杀人
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        princessSaved: true,
        demonBlockedTonight: true,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.princessSaved) return ctx;
  return {
    ...ctx,
    meta: { ...ctx.meta, princessResult: r },
    snapshot: {
      ...ctx.snapshot,
      princessTriggered: true,
      demonBlockedTonight: true,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        princess: r,
      },
    },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const log = "[Princess] 公主被提名并展示身份，处决不致死，今晚恶魔无法行动";
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityLog: log,
      prompt: "公主展示了身份。此次处决不导致死亡，今晚恶魔无法造成死亡。",
    },
  };
};

export const princessAbility = createRoleAbility({
  roleId: "princess",
  abilityId: "princess_nomination_save",
  abilityName: "公主豁免",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "role.princess.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

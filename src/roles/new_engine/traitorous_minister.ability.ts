/**
 * 叛国大臣（Traitorous Minister）新引擎技能实现
 *
 * 【角色能力】"你是邪恶阵营，但向善良阵营注册为善良。"
 *
 * 叛国大臣实际属于邪恶阵营（爪牙），但对探测类能力（如占卜师、调查员）注册为善良。
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
    meta: { ...ctx.meta, abilityResult: { registeredAsGood: true } },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  return {
    ...ctx,
    meta: { ...ctx.meta, traitorousMinisterResult: ctx.meta.abilityResult },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  console.log("[TraitorousMinister] 叛国大臣：注册为善良阵营");
  return ctx;
};

export const traitorousMinisterAbility = createRoleAbility({
  roleId: "traitorous_minister",
  abilityId: "traitorous_register_good",
  abilityName: "伪善注册",
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

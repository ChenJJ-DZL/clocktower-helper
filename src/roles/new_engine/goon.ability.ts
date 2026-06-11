/**
 * 暴徒（Goon）新引擎技能实现
 *
 * 【角色能力】"当你第一次在私下被邪恶玩家选择时，你变成邪恶。"
 *
 * PASSIVE 触发：被邪恶玩家私下选择时转换阵营。
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
  if (!seat) return ctx;
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const selectedByEvil = ctx.meta.selectedByEvil === true;
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        alignmentChanged: selectedByEvil,
        newAlignment: selectedByEvil ? "evil" : "good",
        goonConverted: selectedByEvil,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.alignmentChanged) return ctx;
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        goon: r,
      },
    },
    meta: { ...ctx.meta, goonResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (r?.alignmentChanged)
    console.log("[暴徒] 暴徒被邪恶玩家选中，转换为邪恶阵营");
  return ctx;
};

export const goonAbility = createRoleAbility({
  roleId: "goon",
  abilityId: "goon_alignment_change",
  abilityName: "阵营转换",
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

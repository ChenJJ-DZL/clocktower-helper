/**
 * 阴阳师（Yin Yang Master）新引擎技能实现
 *
 * 【角色能力】"平衡阴阳，交换两名玩家的阵营。"
 *
 * 阴阳师选择两名玩家，交换他们的阵营（善良↔邪恶）。
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
  const targets = ctx.targetIds ?? ctx.actionNode.targetIds ?? [];
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: { targets, swapped: targets.length === 2 },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  return { ...ctx, meta: { ...ctx.meta, yinYangResult: r } };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const t = r?.targets ?? [];
  const log =
    t.length === 2
      ? `[YinYangMaster] 阴阳师交换了${t[0] + 1}号和${t[1] + 1}号的阵营`
      : "[YinYangMaster] 阴阳师未交换阵营";
  console.log(log);
  return { ...ctx, meta: { ...ctx.meta, abilityLog: log } };
};

export const yinYangMasterAbility = createRoleAbility({
  roleId: "yin_yang_master",
  abilityId: "yin_yang_swap",
  abilityName: "阴阳转换",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 2, max: 2, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

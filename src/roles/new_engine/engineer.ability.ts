/**
 * 工程师（Engineer）新引擎技能实现
 *
 * 【角色能力】"首夜，你可以选择至多3个爪牙角色。
 *   说书人会用你选择的角色替换游戏中现有的爪牙。"
 *
 * 首夜选择至多3个爪牙角色，由说书人执行替换。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import { AbilityTriggerTiming, createRoleAbility } from "../core/roleAbility.types";

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const seat = ctx.snapshot.seats.find((s: any) => s.id === ctx.actionNode.seatId);
  if (!seat?.isAlive) return { ...ctx, aborted: true, abortReason: "已死亡" };
  return ctx;
};

const calculate = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const choices = ctx.storytellerInput?.minionChoices ?? [];
  return {
    ...ctx, meta: {
      ...ctx.meta, abilityResult: {
        minionChoices: choices, used: choices.length > 0,
      },
    },
  };
};

const stateUpdate = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.used) return ctx;
  return {
    ...ctx,
    snapshot: { ...ctx.snapshot, minionsReplaced: true, engineerUsed: true, _abilityResults: { ...((ctx.snapshot as any)._abilityResults ?? {}), engineer: r } },
    meta: { ...ctx.meta, engineerResult: r },
  };
};

const postProcess = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log = `[Engineer] ${r?.used ? `选择${r.minionChoices.length}个爪牙角色替换` : "未使用能力"}`;
  console.log(log);
  return { ...ctx, meta: { ...ctx.meta, abilityLog: log, prompt: `唤醒${ctx.actionNode.seatId + 1}号【工程师】，选择至多3个爪牙角色。` } };
};

export const engineerAbility = createRoleAbility({
  roleId: "engineer", abilityId: "engineer_first_night", abilityName: "爪牙改造",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT], wakePriority: 15, firstNightOnly: true,
  wakePromptId: "role.engineer.wake", targetConfig: { min: 0, max: 3, allowSelf: false, allowDead: false },
  preCheck: [preCheck], calculate: [calculate], stateUpdate: [stateUpdate], postProcess: [postProcess],
});

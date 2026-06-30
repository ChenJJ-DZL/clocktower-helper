/**
 * 哲人（Sage）新引擎技能实现
 *
 * 【角色能力】"如果你在夜晚被恶魔杀死，你会得知2名邪恶玩家。"
 *
 * PASSIVE 触发：需要检查死亡原因是否为恶魔，从 snapshot 中找2名邪恶玩家。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const evilPlayers = ctx.snapshot.seats.filter(
    (s: any) => s.role?.type === "minion" || s.role?.type === "demon"
  );
  const shuffled = [...evilPlayers].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, 2);
  const targetIds = selected.map((s: any) => s.id);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetIds,
        killedByDemon: true,
        found: targetIds.length > 0,
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
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        sage: r,
      },
    },
    meta: { ...ctx.meta, sageResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log = r?.found
    ? `[哲人] 被恶魔杀，得知: ${r.targetIds.map((id: number) => `${id + 1}号`).join("、")}`
    : "[哲人] 被恶魔杀死，无线索";
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: "哲人在夜晚被恶魔杀死，告知其2名邪恶玩家。",
      abilityLog: log,
    },
  };
};

export const sageAbility = createRoleAbility({
  roleId: "sage",
  abilityId: "sage_death",
  abilityName: "被恶魔杀得知邪恶",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  firstNightPriority: null,
  otherNightPriority: 81,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

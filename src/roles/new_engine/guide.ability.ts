/**
 * 引路人（Guide）新引擎技能实现
 *
 * 【角色能力】"每个夜晚，你要选择除你以外的至多三名玩家：你会得知今晚是否有邪恶玩家的
 *   能力选择或影响了他们之中的玩家。"
 *
 * - 每夜选择 1-3 名玩家（不能选自己，不能不选）。
 * - 判定"是/否"：所选玩家中是否有被邪恶玩家的能力选择/影响的。
 * - 邪恶玩家包括爪牙、恶魔，以及被转化为邪恶的镇民/外来者。
 * - 不告知具体是哪名玩家被影响。
 *
 * 网页版适配：全局钩子 collectNightEvilTargets 在每个邪恶角色实际执行后把其目标
 * 推入 snapshot.nightEvilTargets；引路人（优先级最高，最后结算）读取该集合判定。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const targetIds = (ctx.targetIds ?? []).filter((t) => t != null) as number[];
  if (targetIds.length === 0) {
    return { ...ctx, aborted: true, abortReason: "必须选择至少一名玩家" };
  }

  const snapshot = ctx.snapshot as any;
  const evilTargets = new Set<number>(snapshot.nightEvilTargets ?? []);

  const hit = targetIds.filter((t) => evilTargets.has(t));
  const isYes = hit.length > 0;

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        watchedIds: targetIds,
        hitIds: hit,
        isYes,
        guideActive: true,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r) return ctx;
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        guide: r,
      },
    },
    meta: { ...ctx.meta, guideResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const answer = r?.isYes ? "是" : "否";
  const watched = (r?.watchedIds ?? [])
    .map((id: number) => id + 1 + "号")
    .join("、");
  const log = `[Guide] 引路人探查 ${watched}，得知"${answer}"`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【引路人】：今晚是否有邪恶玩家的能力选择或影响了${watched}中的玩家？—— ${answer}`,
      displayInfo: {
        type: "guide_result",
        watchedIds: r?.watchedIds ?? [],
        answer,
      },
      abilityLog: log,
    },
  };
};

export const guideAbility = createRoleAbility({
  roleId: "guide",
  abilityId: "guide_evil_probe",
  abilityName: "引路人",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: 55,
  otherNightPriority: 55,
  firstNightOnly: false,
  wakePromptId: "role.guide.wake",
  targetConfig: { min: 1, max: 3, allowSelf: false, allowDead: false },
  preCheck: [commonPreCheckAlive],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
  // 全局机制声明：邪恶目标收集（管线 after_execute 阶段自动应用）
  globalRules: [
    {
      id: "guide_evil_collect",
      type: "target_collect",
      phase: "after_execute",
      order: 10,
    },
  ],
});

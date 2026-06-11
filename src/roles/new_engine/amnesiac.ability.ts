/**
 * 失忆者（Amnesiac）新引擎技能实现（实验角色）
 *
 * 【角色能力】"首夜，说书人决定一个角色能力（称为失忆者能力），失忆者要
 *   通过推理来得知这个能力是什么。当失忆者正确猜出能力时，能使用一次。"
 *
 * 首夜由说书人决定一个秘密能力。失忆者通过游戏中的线索推理。
 * 由于能力完全由说书人自定义，本实现在首夜记录能力设定供后续使用。
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
  return { ...ctx, meta: { ...ctx.meta, isPoisoned: false } };
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const secretAbility = ctx.storytellerInput?.secretAbility
    ? ctx.storytellerInput.secretAbility
    : { description: "由说书人决定的失忆者能力", type: "custom" };

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        amnesiacActive: true,
        secretAbility,
        hasGuessed: false,
        guessCorrect: false,
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
    meta: { ...ctx.meta, amnesiacResult: r },
    snapshot: {
      ...ctx.snapshot,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        amnesiac: r,
      },
    },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const log = "[Amnesiac] 首夜设置失忆者能力，等待玩家推理猜测";
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityLog: log,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【失忆者】，说书人已设定秘密能力。`,
    },
  };
};

export const amnesiacAbility = createRoleAbility({
  roleId: "amnesiac",
  abilityId: "amnesiac_secret_ability",
  abilityName: "失忆之谜",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT],
  wakePriority: 50,
  firstNightOnly: true,
  wakePromptId: "role.amnesiac.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

/**
 * 灵言师（Mezepheles）新引擎技能实现
 *
 * 【角色能力】"一名玩家可以说出关键词变成邪恶。如果玩家说了关键词，该玩家变成邪恶。"
 *
 * PASSIVE 触发，检测玩家是否说出关键词
 * 注：英文名 Mezepheles，UI 配置层文件名为 shaman.ts（id: "mezepheles"）
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
  const keywordSaid = ctx.storytellerInput?.keywordSaid === true;
  const keywordSpeakerId = ctx.storytellerInput?.keywordSpeakerId ?? null;
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        keywordSaid,
        keywordSpeakerId,
        mezephelesActive: true,
        playerTurnedEvil: keywordSaid,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.keywordSaid)
    return { ...ctx, meta: { ...ctx.meta, mezephelesResult: r } };
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      mezephelesKeywordSaid: true,
      mezephelesConvertedId: r.keywordSpeakerId,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        mezepheles: r,
      },
    },
    meta: { ...ctx.meta, mezephelesResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log =
    r?.keywordSaid && r?.keywordSpeakerId != null
      ? `[灵言师] ${r.keywordSpeakerId + 1}号说出关键词，已转为邪恶阵营`
      : "[灵言师] 关键词未触发";
  if (r?.keywordSaid) console.log(log);
  return { ...ctx, meta: { ...ctx.meta, abilityLog: log } };
};

export const mezephelesAbility = createRoleAbility({
  roleId: "mezepheles",
  abilityId: "mezepheles_passive",
  abilityName: "关键词转换",
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

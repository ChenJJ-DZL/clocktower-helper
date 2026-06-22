/**
 * 灵言师（Shaman / Mezepheles）新引擎技能实现
 *
 * 首夜得知一个关键词。第一个公开说出这个关键词的善良玩家会在当晚变成邪恶。
 */

import { AbilityTriggerTiming, createRoleAbility } from "../core/roleAbility.types";

export const shamanAbility = createRoleAbility({
  roleId: "shaman",
  abilityId: "shaman_night_ability",
  abilityName: "灵言",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT],
  wakePriority: 36,
  firstNightOnly: true,
  wakePromptId: "role.shaman.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [],
  calculate: [async (ctx) => {
    const keywords = ["月亮", "星星", "火焰", "流水", "大地", "风", "森林", "海洋"];
    const keyword = keywords[Math.floor(Math.random() * keywords.length)];
    return { ...ctx, meta: { ...ctx.meta, abilityResult: { keyword } } };
  }],
  stateUpdate: [async (ctx) => ctx],
  postProcess: [async (ctx) => {
    const kw = ctx.meta.abilityResult?.keyword;
    if (kw) console.log("[Shaman] 关键词: " + kw);
    return ctx;
  }],
});

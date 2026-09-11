/**
 * 灵言师（Shaman / Mezepheles）新引擎技能实现
 *
 * 首夜得知一个关键词。第一个公开说出这个关键词的善良玩家会在当晚变成邪恶。
 *
 * ⚠️ 关键词随机挑选：首夜行动会被计算两次（preview 生成「当前的行动」提示、
 * 执行时再算一次），必须使用确定性随机，否则说书人念出的关键词与实际生效的
 * 关键词不一致。见 core/deterministicRandom.ts。
 */

import {
  createDeterministicRandom,
  type DeterministicRandom,
  nightInfoSeed,
} from "../core/deterministicRandom";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

/** 灵言师可选关键词池 */
const SHAMAN_KEYWORDS = [
  "月亮",
  "星星",
  "火焰",
  "流水",
  "大地",
  "风",
  "森林",
  "海洋",
];

/**
 * 从关键词池中随机挑选一个关键词。
 *
 * @param rng 随机数发生器；管道内传入按 (能力ID, 座位, 夜次) 构造的确定性随机
 */
export function pickKeyword(rng: DeterministicRandom = Math.random): string {
  return SHAMAN_KEYWORDS[Math.floor(rng() * SHAMAN_KEYWORDS.length)];
}

export const shamanAbility = createRoleAbility({
  roleId: "shaman",
  abilityId: "shaman_night_ability",
  abilityName: "灵言",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: true,
  wakePromptId: "role.shaman.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [],
  calculate: [
    async (ctx) => {
      // 🎲 确定性随机：同一夜、同一角色的重复计算必须得到同一个关键词
      const rng = createDeterministicRandom(
        nightInfoSeed(
          "shaman",
          ctx.actionNode.seatId,
          ctx.snapshot.nightCount ?? 1
        )
      );
      const keyword = pickKeyword(rng);
      return { ...ctx, meta: { ...ctx.meta, abilityResult: { keyword } } };
    },
  ],
  stateUpdate: [async (ctx) => ctx],
  postProcess: [
    async (ctx) => {
      const kw = ctx.meta.abilityResult?.keyword;
      if (kw) console.log(`[Shaman] 关键词: ${kw}`);
      return ctx;
    },
  ],
});

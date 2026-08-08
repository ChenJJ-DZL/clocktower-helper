/**
 * Q宝（Qutler）新引擎技能实现
 *
 * 【角色能力】"每个夜晚，你要选择除你以外的一名玩家：明天白天，
 *   只有他投票时你才能投票。"
 *
 * Q宝（Qutler）是管家（Butler）的变体角色，能力与管家完全相同：
 *   - 每晚选择一名玩家作为"主人"（非自己）
 *   - 次日白天：主人投票时 Q宝 才能投票（否则票无效）
 *   - 醉酒/中毒时"不放置该标记"（即无主人限制，可自由投票）
 *
 * 实现复用管家（butler）的完整能力管道：
 *   - 标记存储：seat.masterId + statusEffects type === "butler_master"
 *   - 投票合法性：isButlerVoteLegal()（按 masterId 校验，流放不受限）
 */
import { butlerAbility } from "./butler.ability";

export const qutlerAbility = {
  ...butlerAbility,
  roleId: "qutler",
  abilityId: "qutler_master",
  abilityName: "主人羁绊",
  wakePromptId: "role.qutler.wake",
};

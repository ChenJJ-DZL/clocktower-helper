/**
 * 乞丐（Beggar）新引擎技能声明
 * ==================================================================
 * 官方原文（`json/wiki_crawl/parsed_roles.json`「乞丐」）：
 *   「你只能使用投票标记才能投票。
 *     死亡的玩家可以将他的投票标记给你，如果他这么做，你会得知他的阵营。
 *     你不会中毒和醉酒。」
 *
 * ⚠️⚠️ 三条规则**全部是投票期 / 状态层的被动规则**，没有「夜晚唤醒来选人」
 *   这一步 ⇒ 本文件必须是 **PASSIVE 声明**，绝不能注册成 DAY/NIGHT 主动能力
 *   （否则会被排进夜序，违反「旅行者不进 fullNightOrder」的既有契约）。
 *
 * 🔴 历史缺陷（已删除）：本文件曾在 `stateUpdate` 里把目标写进
 *   `seat.beggarTargetId` / `snapshot.beggarVoteSource`，并追加状态串
 *   「乞丐强化选票:N号(计2票)」——**三重错误**：
 *     ① 官方原文里**根本没有**「计 2 票」这条，是凭空发明的规则
 *        （`useExecutionHandlers.submitVotes` 同位置也有一段同样的假规则，已删）；
 *     ② 乞丐是 **traveler**，不占 seats ⇒ `snapshot.seats.find(s => s.id ===
 *        ctx.actionNode.seatId)` **永远找不到自己** ⇒ preCheck 直接 abort，
 *        整段代码**永不执行**（假实现骗过了静态阅读）；
 *     ③ 即便将来旅行者进了 seats，也仍是按**错的规则**结算。
 *
 * ✅ 真实落地位置（判据与状态各自单点定义，本文件只做声明）：
 *   · 编码/判据 —— `src/utils/travelerHooks.ts`
 *     （`hasTravelerRole` / `travelerSlotId` / `formatVoterLabel`）
 *   · 标记账本 —— `GameContext.beggarState`
 *     （`GIVE_BEGGAR_TOKEN` 死者赠标记 + 得知阵营；`CONSUME_BEGGAR_TOKEN` 投票消耗）
 *   · 投票门控 —— `VoteInputModal`（无标记时名单置灰）
 *     + `useExecutionHandlers.submitVotes`（投票落定时消耗，咽喉兜底）
 *   · 免疫中毒醉酒 —— 旅行者**不占 seats** ⇒ 全仓所有毒/醉播撒路径
 *     （`roleActionHandlers` / `pukka` / `snake_charmer` / `vigormortis` / `no_dashii`
 *     共 5 处，全部只写 `seats[*].isPoisoned`）**天然无法命中旅行者**。
 *     反向断言见 `src/utils/__tests__/travelerHooks.test.ts`。
 */
import { AbilityTriggerTiming, createRoleAbility } from "../core/roleAbility.types";

export const beggarAbility = createRoleAbility({
  roleId: "beggar",
  abilityId: "beggar_vote_token",
  abilityName: "乞丐·投票标记",
  /** PASSIVE：三条规则由投票流程 / 状态层消费，**没有主动唤醒** */
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  /** 清空唤醒提示词：PASSIVE 角色不得携带夜序提示 */
  wakePromptId: "",
  /** 无目标选择动作（官方三条里没有任何「选择玩家」） */
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
});

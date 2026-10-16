/**
 * 公爵夫人（Duchess）新引擎技能声明
 * ==================================================================
 * 官方原文（`json/wiki_crawl/parsed_roles.json`「公爵夫人」）：
 *   「每个白天，三名玩家可以一起拜访你。当晚*，他们会得知他们之中有几个是邪恶的，
 *     但其中一人的信息是错的。」
 *
 * ⚠️ 这是**传奇角色（legendary / fabled）**：不占座位、不入夜序。
 *   ⇒ 声明为 PASSIVE，双 priority 全 null、无唤醒提示。
 *
 * 落地口径（诚实标注）：「三名玩家一起拜访」是桌面社交行为，引擎无法感知
 *   ⇒ 操作入口在 `FabledPanel`，由说书人记录访客并执行「其中一人信息错误」的
 *   信息扰动（本仓库的信息通道已支持说书人纠偏，见 `StorytellerCorrectionModal`）。
 */
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

export const duchessAbility = createRoleAbility({
  roleId: "duchess",
  abilityId: "duchess_passive",
  abilityName: "公爵夫人",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
});

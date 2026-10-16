/**
 * 灯神（Djinn）新引擎技能声明
 * ==================================================================
 * 官方原文（`json/wiki_crawl/parsed_roles.json`「灯神」）：
 *   「使用灯神的相克规则。所有玩家都会知道其内容。」
 *
 * ⚠️ 这是**传奇角色（legendary / fabled）**：不占座位、不入夜序。
 *   ⇒ 声明为 PASSIVE，双 priority 全 null、无唤醒提示。
 *
 * 落地口径：灯神即「相克规则（antagonism）」的开关代理 ——
 *   本仓库已有 `utils/antagonism.ts` + `GameStage` 的「相克规则开关」，
 *   灯神在场时应在开局把该开关打开并公示规则内容（由说书人操作）。
 *   引擎侧不新增第二套开关（避免"双写入点"），故本文件只做声明。
 */
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

export const djinnAbility = createRoleAbility({
  roleId: "djinn",
  abilityId: "djinn_passive",
  abilityName: "灯神",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
});

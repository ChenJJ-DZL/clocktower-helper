/**
 * 入殓师（Mortician）新引擎技能实现
 *
 * 【角色能力】"如果你提名了恶魔且他死于这次处决，你会变成那个邪恶的恶魔。
 *   当剩余存活玩家小于等于四人时（旅行者除外），你失去能力。"
 *
 * - 白天机制（UI 处决流程驱动，见 utils/morticianTransform.ts）：
 *   入殓师提名恶魔 → 恶魔死于处决 → 若处决后存活玩家数（旅行者除外）≥ 4，
 *   入殓师变为邪恶的该恶魔，游戏继续（判胜自然不触发）；否则失去能力不转化。
 * - 本文件为引擎注册占位：入殓师无夜间行动（白天/被动机制），
 *   不进入夜间队列；transformMorticianToDemon 供处决流程与测试复用。
 */
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

export const morticianAbility = createRoleAbility({
  roleId: "mortician",
  abilityId: "mortician_transform",
  abilityName: "入殓师",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [],
  calculate: [],
  stateUpdate: [],
  postProcess: [],
});

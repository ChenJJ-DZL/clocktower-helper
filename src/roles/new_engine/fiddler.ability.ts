/**
 * 小提琴手（Fiddler）新引擎技能声明
 * ==================================================================
 * 官方原文（`json/wiki_crawl/parsed_roles.json`「小提琴手」）：
 *   「每局游戏限一次，恶魔可以秘密选择一名对立阵营的玩家，所有玩家要表决：
 *     这两名玩家中谁的阵营获胜。（平局邪恶阵营获胜）」
 *
 * ⚠️ 这是**传奇角色（legendary / fabled）**：不占座位、不入夜序。
 *   ⇒ 声明为 PASSIVE，双 priority 全 null、无唤醒提示。
 *
 * 落地口径（诚实标注）：终局表决由说书人主持 ⇒ 操作入口在
 *   `FabledPanel`（记录已用 + 提示「平局邪恶胜」），引擎不自动判定。
 */
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

export const fiddlerAbility = createRoleAbility({
  roleId: "fiddler",
  abilityId: "fiddler_passive",
  abilityName: "小提琴手",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
});

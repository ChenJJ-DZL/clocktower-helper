/**
 * 新引擎能力注册表
 * 将所有new_engine目录下的能力注册到统一角色定义系统中
 */

import {
  type UnifiedAbilityConfig,
  unifiedRoleDefinition,
} from "../unifiedRoleDefinition";
import { artistAbility } from "./artist.ability";
import { assassinAbility } from "./assassin.ability";
import { balloonistAbility } from "./balloonist.ability";
import { baronAbility } from "./baron.ability";
import { butlerAbility } from "./butler.ability";
import { chambermaidAbility } from "./chambermaid.ability";
import { chefAbility } from "./chef.ability";
import { clockmakerAbility } from "./clockmaker.ability";
import { courtierAbility } from "./courtier.ability";
import { dreamerAbility } from "./dreamer.ability";
import { drunkAbility } from "./drunk.ability";
import { empathAbility } from "./empath.ability";
import { exorcistAbility } from "./exorcist.ability";
import { flowergirlAbility } from "./flowergirl.ability";
import { foolAbility } from "./fool.ability";
import { fortuneTellerAbility } from "./fortune_teller.ability";
import { grandmotherAbility } from "./grandmother.ability";
import { impAbility } from "./imp.ability";
import { innkeeperAbility } from "./innkeeper.ability";
import { investigatorAbility } from "./investigator.ability";
import { librarianAbility } from "./librarian.ability";
import { mayorAbility } from "./mayor.ability";
import { monkAbility } from "./monk.ability";
import { moonchildAbility } from "./moonchild.ability";
import { oracleAbility } from "./oracle.ability";
import { poAbility } from "./po.ability";
import { poisonerAbility } from "./poisoner.ability";
import { professorAbility } from "./professor.ability";
import { pukkaAbility } from "./pukka.ability";
import { ravenkeeperAbility } from "./ravenkeeper.ability";
import { recluseAbility } from "./recluse.ability";
import { sailorAbility } from "./sailor.ability";
import { saintAbility } from "./saint.ability";
import { savantAbility } from "./savant.ability";
import { scarletWomanAbility } from "./scarlet_woman.ability";
import { seamstressAbility } from "./seamstress.ability";
import { shabalothAbility } from "./shabaloth.ability";
import { slayerAbility } from "./slayer.ability";
import { soldierAbility } from "./soldier.ability";
import { spyAbility } from "./spy.ability";
import { teaLadyAbility } from "./tea_lady.ability";
import { tinkerAbility } from "./tinker.ability";
import { undertakerAbility } from "./undertaker.ability";
import { villagerAbility } from "./villager.ability";
import { virginAbility } from "./virgin.ability";
import { washerwomanAbility } from "./washerwoman.ability";
import { zombuulAbility } from "./zombuul.ability";

/**
 * 转换 IRoleAbility 到 UnifiedAbilityConfig
 */
function convertToUnifiedAbility(ability: any): UnifiedAbilityConfig {
  return {
    roleId: ability.roleId,
    abilityId: ability.abilityId,
    abilityName: ability.abilityName,
    triggerTiming: ability.triggerTiming,
    wakePriority: ability.wakePriority,
    firstNightOnly: ability.firstNightOnly,
    wakePromptId: ability.wakePromptId,
    targetConfig: ability.targetConfig,
    preCondition: () => true, // 默认实现，需要根据具体能力重写
    execute: async (context) => {
      // 默认实现，需要根据具体能力重写
      return {
        success: true,
        data: {},
        affectedTargetIds: context.targets.map((t) => t.id),
      };
    },
    postProcess: () => {}, // 默认实现
  };
}

/**
 * 注册所有新引擎能力
 */
export function registerAllNewEngineAbilities(): void {
  console.log("[AbilityRegistry] 开始注册新引擎能力...");

  // 注册所有能力
  const abilities = [
    baronAbility,
    butlerAbility,
    chefAbility,
    drunkAbility,
    empathAbility,
    foolAbility,
    fortuneTellerAbility,
    impAbility,
    investigatorAbility,
    librarianAbility,
    mayorAbility,
    monkAbility,
    poisonerAbility,
    ravenkeeperAbility,
    recluseAbility,
    saintAbility,
    savantAbility,
    scarletWomanAbility,
    slayerAbility,
    soldierAbility,
    spyAbility,
    undertakerAbility,
    virginAbility,
    washerwomanAbility,
    balloonistAbility,
    villagerAbility,
    tinkerAbility,
    sailorAbility,
    moonchildAbility,
    teaLadyAbility,
    chambermaidAbility,
    grandmotherAbility,
    exorcistAbility,
    professorAbility,
    courtierAbility,
    innkeeperAbility,
    assassinAbility,
    clockmakerAbility,
    dreamerAbility,
    flowergirlAbility,
    oracleAbility,
    seamstressAbility,
    artistAbility,
    poAbility,
    shabalothAbility,
    pukkaAbility,
    zombuulAbility,
  ];

  abilities.forEach((ability) => {
    const unifiedAbility = convertToUnifiedAbility(ability);
    unifiedRoleDefinition.registerAbility(unifiedAbility);
  });

  console.log(`[AbilityRegistry] 已注册 ${abilities.length} 个新引擎能力`);
}

/**
 * 获取已注册的能力数量
 */
export function getRegisteredAbilityCount(): number {
  return unifiedRoleDefinition.getAllAbilities().length;
}

/**
 * 检查特定角色的能力是否已注册
 */
export function isRoleAbilitiesRegistered(roleId: string): boolean {
  const abilities = unifiedRoleDefinition.getRoleAbilities(roleId);
  return abilities.length > 0;
}

/**
 * 清除所有已注册的能力
 */
export function clearAllAbilities(): void {
  unifiedRoleDefinition.clearRegistry();
  console.log("[AbilityRegistry] 已清除所有能力");
}

/**
 * 初始化能力注册系统
 */
export function initializeAbilityRegistry(): void {
  // 清除现有注册
  clearAllAbilities();

  // 注册所有新引擎能力
  registerAllNewEngineAbilities();

  console.log(
    `[AbilityRegistry] 初始化完成，已注册 ${getRegisteredAbilityCount()} 个能力`
  );
}

export { artistAbility } from "./artist.ability";
export { assassinAbility } from "./assassin.ability";
export { balloonistAbility } from "./balloonist.ability";
// 导出所有能力
export { baronAbility } from "./baron.ability";
export { butlerAbility } from "./butler.ability";
export { chambermaidAbility } from "./chambermaid.ability";
export { chefAbility } from "./chef.ability";
export { clockmakerAbility } from "./clockmaker.ability";
export { courtierAbility } from "./courtier.ability";
export { dreamerAbility } from "./dreamer.ability";
export { drunkAbility } from "./drunk.ability";
export { empathAbility } from "./empath.ability";
export { exorcistAbility } from "./exorcist.ability";
export { flowergirlAbility } from "./flowergirl.ability";
export { foolAbility } from "./fool.ability";
export { fortuneTellerAbility } from "./fortune_teller.ability";
export { grandmotherAbility } from "./grandmother.ability";
export { impAbility } from "./imp.ability";
export { innkeeperAbility } from "./innkeeper.ability";
export { investigatorAbility } from "./investigator.ability";
export { librarianAbility } from "./librarian.ability";
export { mayorAbility } from "./mayor.ability";
export { monkAbility } from "./monk.ability";
export { moonchildAbility } from "./moonchild.ability";
export { oracleAbility } from "./oracle.ability";
export { poAbility } from "./po.ability";
export { poisonerAbility } from "./poisoner.ability";
export { professorAbility } from "./professor.ability";
export { pukkaAbility } from "./pukka.ability";
export { ravenkeeperAbility } from "./ravenkeeper.ability";
export { recluseAbility } from "./recluse.ability";
export { sailorAbility } from "./sailor.ability";
export { saintAbility } from "./saint.ability";
export { savantAbility } from "./savant.ability";
export { scarletWomanAbility } from "./scarlet_woman.ability";
export { seamstressAbility } from "./seamstress.ability";
export { shabalothAbility } from "./shabaloth.ability";
export { slayerAbility } from "./slayer.ability";
export { soldierAbility } from "./soldier.ability";
export { spyAbility } from "./spy.ability";
export { teaLadyAbility } from "./tea_lady.ability";
export { tinkerAbility } from "./tinker.ability";
export { undertakerAbility } from "./undertaker.ability";
export { villagerAbility } from "./villager.ability";
export { virginAbility } from "./virgin.ability";
export { washerwomanAbility } from "./washerwoman.ability";
export { zombuulAbility } from "./zombuul.ability";

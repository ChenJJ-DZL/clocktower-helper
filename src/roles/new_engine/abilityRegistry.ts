/**
 * 新引擎能力注册表
 * 将所有new_engine目录下的能力注册到统一角色定义系统中
 */

import {
  type UnifiedAbilityConfig,
  unifiedRoleDefinition,
} from "../unifiedRoleDefinition";
import { acrobatAbility } from "./acrobat.ability";
import { amnesiacAbility } from "./amnesiac.ability";
import { angelAbility } from "./angel.ability";
import { artistAbility } from "./artist.ability";
import { assassinAbility } from "./assassin.ability";
import { astrologerAbility } from "./astrologer.ability";
import { atheistAbility } from "./atheist.ability";
import { balloonistAbility } from "./balloonist.ability";
import { bansheeAbility } from "./banshee.ability";
import { baronAbility } from "./baron.ability";
import { beggarAbility } from "./beggar.ability";
import { buddhistAbility } from "./buddhist.ability";
import { bureaucratAbility } from "./bureaucrat.ability";
import { butlerAbility } from "./butler.ability";
import { cannibalAbility } from "./cannibal.ability";
import { chambermaidAbility } from "./chambermaid.ability";
import { chefAbility } from "./chef.ability";
import { choirBoyAbility } from "./choir_boy.ability";
import { clockmakerAbility } from "./clockmaker.ability";
import { courtierAbility } from "./courtier.ability";
import { deusExFiascoAbility } from "./deus_ex_fiasco.ability";
import { devil_s_advocateAbility } from "./devil_s_advocate.ability";
import { doomsayerAbility } from "./doomsayer.ability";
import { dreamerAbility } from "./dreamer.ability";
import { drunkAbility } from "./drunk.ability";
import { empathAbility } from "./empath.ability";
import { engineerAbility } from "./engineer.ability";
import { exorcistAbility } from "./exorcist.ability";
import { fang_guAbility } from "./fang_gu.ability";
import { farmerAbility } from "./farmer.ability";
import { ferrymanAbility } from "./ferryman.ability";
import { fishermanAbility } from "./fisherman.ability";
import { flowergirlAbility } from "./flowergirl.ability";
import { foolAbility } from "./fool.ability";
import { fortuneTellerAbility } from "./fortune_teller.ability";
import { gamblerAbility } from "./gambler.ability";
import { godfatherAbility } from "./godfather.ability";
import { goonAbility } from "./goon.ability";
import { gossipAbility } from "./gossip.ability";
import { grandmotherAbility } from "./grandmother.ability";
import { gunslingerAbility } from "./gunslinger.ability";
import { halfOgreAbility } from "./half_ogre.ability";
import { impAbility } from "./imp.ability";
import { innkeeperAbility } from "./innkeeper.ability";
import { investigatorAbility } from "./investigator.ability";
import { jesterAbility } from "./jester.ability";
import { knightAbility } from "./knight.ability";
import { librarianAbility } from "./librarian.ability";
import { lunaticAbility } from "./lunatic.ability";
import { mastermindAbility } from "./mastermind.ability";
import { mathematicianAbility } from "./mathematician.ability";
import { mayorAbility } from "./mayor.ability";
import { minerAbility } from "./miner.ability";
import { minstrelAbility } from "./minstrel.ability";
import { monkAbility } from "./monk.ability";
import { moonchildAbility } from "./moonchild.ability";
import { nobleAbility } from "./noble.ability";
import { oracleAbility } from "./oracle.ability";
import { pacifistAbility } from "./pacifist.ability";
import { philosopherAbility } from "./philosopher.ability";
import { pilgrimAbility } from "./pilgrim.ability";
import { poAbility } from "./po.ability";
import { poisonerAbility } from "./poisoner.ability";
import { priestessAbility } from "./priestess.ability";
import { princessAbility } from "./princess.ability";
import { professorAbility } from "./professor.ability";
import { pukkaAbility } from "./pukka.ability";
import { puzzlemasterAbility } from "./puzzlemaster.ability";
import { rangerAbility } from "./ranger.ability";
import { ravenkeeperAbility } from "./ravenkeeper.ability";
import { recluseAbility } from "./recluse.ability";
import { revolutionaryAbility } from "./revolutionary.ability";
import { sageAbility } from "./sage.ability";
import { sailorAbility } from "./sailor.ability";
import { saintAbility } from "./saint.ability";
import { savantAbility } from "./savant.ability";
import { scapegoatAbility } from "./scapegoat.ability";
import { scarletWomanAbility } from "./scarlet_woman.ability";
import { seamstressAbility } from "./seamstress.ability";
import { shabalothAbility } from "./shabaloth.ability";
import { slayerAbility } from "./slayer.ability";
import { snake_charmerAbility } from "./snake_charmer.ability";
import { snitchAbility } from "./snitch.ability";
import { soldierAbility } from "./soldier.ability";
import { spyAbility } from "./spy.ability";
import { stormcatcherAbility } from "./stormcatcher.ability";
import { teaLadyAbility } from "./tea_lady.ability";
import { thiefAbility } from "./thief.ability";
import { tinkerAbility } from "./tinker.ability";
import { toymakerAbility } from "./toymaker.ability";
import { tricksterJackAbility } from "./trickster_jack.ability";
import { undertakerAbility } from "./undertaker.ability";
import { ventriloquistAbility } from "./ventriloquist.ability";
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
    angelAbility,
    doomsayerAbility,
    toymakerAbility,
    buddhistAbility,
    revolutionaryAbility,
    deusExFiascoAbility,
    ferrymanAbility,
    stormcatcherAbility,
    ventriloquistAbility,
    tricksterJackAbility,
    bureaucratAbility,
    mathematicianAbility,
    minerAbility,
    sageAbility,
    snake_charmerAbility,
    cannibalAbility,
    engineerAbility,
    philosopherAbility,
    rangerAbility,
    beggarAbility,
    gunslingerAbility,
    thiefAbility,
    scapegoatAbility,
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
    gamblerAbility,
    gossipAbility,
    minstrelAbility,
    pacifistAbility,
    goonAbility,
    lunaticAbility,
    godfatherAbility,
    devil_s_advocateAbility,
    mastermindAbility,
    fang_guAbility,
    halfOgreAbility,
    bansheeAbility,
    astrologerAbility,
    knightAbility,
    nobleAbility,
    pilgrimAbility,
    priestessAbility,
    choirBoyAbility,
    princessAbility,
    farmerAbility,
    amnesiacAbility,
    atheistAbility,
    jesterAbility,
    fishermanAbility,
    acrobatAbility,
    snitchAbility,
    puzzlemasterAbility,
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

export { acrobatAbility } from "./acrobat.ability";
export { amnesiacAbility } from "./amnesiac.ability";
export { angelAbility } from "./angel.ability";
export { artistAbility } from "./artist.ability";
export { assassinAbility } from "./assassin.ability";
export { astrologerAbility } from "./astrologer.ability";
export { atheistAbility } from "./atheist.ability";
export { balloonistAbility } from "./balloonist.ability";
export { bansheeAbility } from "./banshee.ability";
export { baronAbility } from "./baron.ability";
export { beggarAbility } from "./beggar.ability";
export { buddhistAbility } from "./buddhist.ability";
export { bureaucratAbility } from "./bureaucrat.ability";
export { butlerAbility } from "./butler.ability";
export { cannibalAbility } from "./cannibal.ability";
export { chambermaidAbility } from "./chambermaid.ability";
export { chefAbility } from "./chef.ability";
export { choirBoyAbility } from "./choir_boy.ability";
export { clockmakerAbility } from "./clockmaker.ability";
export { courtierAbility } from "./courtier.ability";
export { deusExFiascoAbility } from "./deus_ex_fiasco.ability";
export { devil_s_advocateAbility } from "./devil_s_advocate.ability";
export { doomsayerAbility } from "./doomsayer.ability";
export { dreamerAbility } from "./dreamer.ability";
export { drunkAbility } from "./drunk.ability";
export { empathAbility } from "./empath.ability";
export { engineerAbility } from "./engineer.ability";
export { exorcistAbility } from "./exorcist.ability";
export { fang_guAbility } from "./fang_gu.ability";
export { farmerAbility } from "./farmer.ability";
export { ferrymanAbility } from "./ferryman.ability";
export { fishermanAbility } from "./fisherman.ability";
export { flowergirlAbility } from "./flowergirl.ability";
export { foolAbility } from "./fool.ability";
export { fortuneTellerAbility } from "./fortune_teller.ability";
export { gamblerAbility } from "./gambler.ability";
export { godfatherAbility } from "./godfather.ability";
export { goonAbility } from "./goon.ability";
export { gossipAbility } from "./gossip.ability";
export { grandmotherAbility } from "./grandmother.ability";
export { gunslingerAbility } from "./gunslinger.ability";
export { halfOgreAbility } from "./half_ogre.ability";
export { impAbility } from "./imp.ability";
export { innkeeperAbility } from "./innkeeper.ability";
export { investigatorAbility } from "./investigator.ability";
export { jesterAbility } from "./jester.ability";
export { knightAbility } from "./knight.ability";
export { librarianAbility } from "./librarian.ability";
export { lunaticAbility } from "./lunatic.ability";
export { mastermindAbility } from "./mastermind.ability";
export { mathematicianAbility } from "./mathematician.ability";
export { mayorAbility } from "./mayor.ability";
export { minerAbility } from "./miner.ability";
export { minstrelAbility } from "./minstrel.ability";
export { monkAbility } from "./monk.ability";
export { moonchildAbility } from "./moonchild.ability";
export { nobleAbility } from "./noble.ability";
export { oracleAbility } from "./oracle.ability";
export { pacifistAbility } from "./pacifist.ability";
export { philosopherAbility } from "./philosopher.ability";
export { pilgrimAbility } from "./pilgrim.ability";
export { poAbility } from "./po.ability";
export { poisonerAbility } from "./poisoner.ability";
export { priestessAbility } from "./priestess.ability";
export { princessAbility } from "./princess.ability";
export { professorAbility } from "./professor.ability";
export { pukkaAbility } from "./pukka.ability";
export { puzzlemasterAbility } from "./puzzlemaster.ability";
export { rangerAbility } from "./ranger.ability";
export { ravenkeeperAbility } from "./ravenkeeper.ability";
export { recluseAbility } from "./recluse.ability";
export { revolutionaryAbility } from "./revolutionary.ability";
export { sageAbility } from "./sage.ability";
export { sailorAbility } from "./sailor.ability";
export { saintAbility } from "./saint.ability";
export { savantAbility } from "./savant.ability";
export { scapegoatAbility } from "./scapegoat.ability";
export { scarletWomanAbility } from "./scarlet_woman.ability";
export { seamstressAbility } from "./seamstress.ability";
export { shabalothAbility } from "./shabaloth.ability";
export { slayerAbility } from "./slayer.ability";
export { snake_charmerAbility } from "./snake_charmer.ability";
export { snitchAbility } from "./snitch.ability";
export { soldierAbility } from "./soldier.ability";
export { spyAbility } from "./spy.ability";
export { stormcatcherAbility } from "./stormcatcher.ability";
export { teaLadyAbility } from "./tea_lady.ability";
export { thiefAbility } from "./thief.ability";
export { tinkerAbility } from "./tinker.ability";
export { toymakerAbility } from "./toymaker.ability";
export { tricksterJackAbility } from "./trickster_jack.ability";
export { undertakerAbility } from "./undertaker.ability";
export { ventriloquistAbility } from "./ventriloquist.ability";
export { villagerAbility } from "./villager.ability";
export { virginAbility } from "./virgin.ability";
export { washerwomanAbility } from "./washerwoman.ability";
export { zombuulAbility } from "./zombuul.ability";

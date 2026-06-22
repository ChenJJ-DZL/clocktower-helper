/**
 * 新引擎能力注册表
 * 自动生成 - 扫描 src/roles/new_engine/ 目录下所有 .ability.ts 文件
 */

import {
  type UnifiedAbilityConfig,
  unifiedRoleDefinition,
} from "../unifiedRoleDefinition";
import { acrobatAbility } from "./acrobat.ability";
import { actorAbility } from "./actor.ability";
import { alchemistAbility } from "./alchemist.ability";
import { amnesiacAbility } from "./amnesiac.ability";
import { angelAbility } from "./angel.ability";
import { artistAbility } from "./artist.ability";
import { assassinAbility } from "./assassin.ability";
import { astrologerAbility } from "./astrologer.ability";
import { astronomerAbility } from "./astronomer.ability";
import { atheistAbility } from "./atheist.ability";
import { balloonistAbility } from "./balloonist.ability";
import { bansheeAbility } from "./banshee.ability";
import { barberAbility } from "./barber.ability";
import { bardAbility } from "./bard.ability";
import { baronAbility } from "./baron.ability";
import { beggarAbility } from "./beggar.ability";
import { boffinAbility } from "./boffin.ability";
import { boomdandyAbility } from "./boomdandy.ability";
import { bounty_hunterAbility } from "./bounty_hunter.ability";
import { brewerAbility } from "./brewer.ability";
import { brokerAbility } from "./broker.ability";
import { buddhistAbility } from "./buddhist.ability";
import { bureaucratAbility } from "./bureaucrat.ability";
import { butlerAbility } from "./butler.ability";
import { cannibalAbility } from "./cannibal.ability";
import { cerenovusAbility } from "./cerenovus.ability";
import { chambermaidAbility } from "./chambermaid.ability";
import { chaosAbility } from "./chaos.ability";
import { chefAbility } from "./chef.ability";
import { choirBoyAbility } from "./choir_boy.ability";
// ⚠️ 已注释: 与 choir_boy.ability.ts 重复，保留下划线版本
// import { choirboyAbility } from "./choirboy.ability";
import { clockmakerAbility } from "./clockmaker.ability";
import { conjurerAbility } from "./conjurer.ability";
import { courtierAbility } from "./courtier.ability";
import { cuckoo_birdAbility } from "./cuckoo_bird.ability";
import { cultLeaderAbility } from "./cult_leader.ability";
import { damselAbility } from "./damsel.ability";
import { dawnAbility } from "./dawn.ability";
import { deusExFiascoAbility } from "./deus_ex_fiasco.ability";
import { devil_s_advocateAbility } from "./devil_s_advocate.ability";
// ⚠️ 已注释: 与 devil_s_advocate.ability.ts 重复，保留下划线版本
import { devils_advocateAbility } from "./devils_advocate.ability";
import { diAbility } from "./di.ability";
import { divinerAbility } from "./diviner.ability";
import { doctorAbility } from "./doctor.ability";
import { doomsayerAbility } from "./doomsayer.ability";
import { dreamerAbility } from "./dreamer.ability";
import { drunkAbility } from "./drunk.ability";
import { duskAbility } from "./dusk.ability";
import { empathAbility } from "./empath.ability";
import { engineerAbility } from "./engineer.ability";
import { enlightenedAbility } from "./enlightened.ability";
import { envoyAbility } from "./envoy.ability";
import { evil_twinAbility } from "./evil_twin.ability";
import { executionerAbility } from "./executioner.ability";
import { exorcistAbility } from "./exorcist.ability";
import { fang_guAbility } from "./fang_gu.ability";
import { farmerAbility } from "./farmer.ability";
import { fearmongerAbility } from "./fearmonger.ability";
import { ferrymanAbility } from "./ferryman.ability";
import { fishermanAbility } from "./fisherman.ability";
import { flowergirlAbility } from "./flowergirl.ability";
import { foolAbility } from "./fool.ability";
import { fortuneTellerAbility } from "./fortune_teller.ability";
import { fox_spiritAbility } from "./fox_spirit.ability";
import { frankensteinAbility } from "./frankenstein.ability";
import { gamblerAbility } from "./gambler.ability";
import { generalAbility } from "./general.ability";
import { goblinAbility } from "./goblin.ability";
import { godfatherAbility } from "./godfather.ability";
import { golemAbility } from "./golem.ability";
import { goonAbility } from "./goon.ability";
import { gossipAbility } from "./gossip.ability";
import { grandmotherAbility } from "./grandmother.ability";
import { guideAbility } from "./guide.ability";
import { gunslingerAbility } from "./gunslinger.ability";
import { hadesiaAbility } from "./hadesia.ability";
import { halfOgreAbility } from "./half_ogre.ability";
import { harpyAbility } from "./harpy.ability";
import { hatterAbility } from "./hatter.ability";
import { hereticAbility } from "./heretic.ability";
import { hermitAbility } from "./hermit.ability";
import { high_priestessAbility } from "./high_priestess.ability";
import { historianAbility } from "./historian.ability";
import { hunterAbility } from "./hunter.ability";
import { huntsmanAbility } from "./huntsman.ability";
import { impAbility } from "./imp.ability";
import { imperial_guardAbility } from "./imperial_guard.ability";
import { inn_attendantAbility } from "./inn_attendant.ability";
import { innkeeperAbility } from "./innkeeper.ability";
import { inspectorAbility } from "./inspector.ability";
import { investigatorAbility } from "./investigator.ability";
import { jesterAbility } from "./jester.ability";
import { jinx_starAbility } from "./jinx_star.ability";
import { jugglerAbility } from "./juggler.ability";
import { kazaliAbility } from "./kazali.ability";
import { kingAbility } from "./king.ability";
import { klutzAbility } from "./klutz.ability";
import { knightAbility } from "./knight.ability";
import { legionAbility } from "./legion.ability";
import { leviathanAbility } from "./leviathan.ability";
import { librarianAbility } from "./librarian.ability";
import { lil_monstaAbility } from "./lil_monsta.ability";
import { lizAbility } from "./liz.ability";
import { lleechAbility } from "./lleech.ability";
import { lloamAbility } from "./lloam.ability";
import { lord_of_typhonAbility } from "./lord_of_typhon.ability";
import { lunaticAbility } from "./lunatic.ability";
import { lycanthropeAbility } from "./lycanthrope.ability";
import { magicianAbility } from "./magician.ability";
import { marionetteAbility } from "./marionette.ability";
import { mastermindAbility } from "./mastermind.ability";
import { mathematicianAbility } from "./mathematician.ability";
import { mayorAbility } from "./mayor.ability";
import { mezephelesAbility } from "./mezepheles.ability";
import { minerAbility } from "./miner.ability";
import { minstrelAbility } from "./minstrel.ability";
import { monkAbility } from "./monk.ability";
import { moonchildAbility } from "./moonchild.ability";
import { morticianAbility } from "./mortician.ability";
import { mutantAbility } from "./mutant.ability";
import { naughty_childAbility } from "./naughty_child.ability";
import { night_watchmanAbility } from "./night_watchman.ability";
// ⚠️ 已注释: 与 night_watchman.ability.ts 重复，保留下划线版本
// import { nightwatchmanAbility } from "./nightwatchman.ability";
import { no_dashiiAbility } from "./no_dashii.ability";
import { nobleAbility } from "./noble.ability";
import { ogreAbility } from "./ogre.ability";
import { ojoAbility } from "./ojo.ability";
import { oracleAbility } from "./oracle.ability";
import { organ_grinderAbility } from "./organ_grinder.ability";
import { outsiderAbility } from "./outsider.ability";
import { pacifistAbility } from "./pacifist.ability";
import { philosopherAbility } from "./philosopher.ability";
import { pilgrimAbility } from "./pilgrim.ability";
import { pit_hagAbility } from "./pit_hag.ability";
import { pixieAbility } from "./pixie.ability";
import { plagueDoctorAbility } from "./plague_doctor.ability";
import { poAbility } from "./po.ability";
import { poisonerAbility } from "./poisoner.ability";
import { politicianAbility } from "./politician.ability";
import { poppy_growerAbility } from "./poppy_grower.ability";
import { preacherAbility } from "./preacher.ability";
import { prefectAbility } from "./prefect.ability";
import { priestessAbility } from "./priestess.ability";
import { princessAbility } from "./princess.ability";
import { professorAbility } from "./professor.ability";
import { professorFemaleAbility } from "./professor_female.ability";
import { psychopathAbility } from "./psychopath.ability";
import { pukkaAbility } from "./pukka.ability";
import { puzzlemasterAbility } from "./puzzlemaster.ability";
import { qiongqiAbility } from "./qiongqi.ability";
import { raccoon_dogAbility } from "./raccoon_dog.ability";
import { rangerAbility } from "./ranger.ability";
import { ravenkeeperAbility } from "./ravenkeeper.ability";
import { recluseAbility } from "./recluse.ability";
import { revolutionaryAbility } from "./revolutionary.ability";
import { riotAbility } from "./riot.ability";
import { sageAbility } from "./sage.ability";
import { sailorAbility } from "./sailor.ability";
import { saintAbility } from "./saint.ability";
import { savantAbility } from "./savant.ability";
import { scapegoatAbility } from "./scapegoat.ability";
import { scarletWomanAbility } from "./scarlet_woman.ability";
import { scholarAbility } from "./scholar.ability";
import { scribeAbility } from "./scribe.ability";
import { seamstressAbility } from "./seamstress.ability";
import { shabalothAbility } from "./shabaloth.ability";
import { shugenjaAbility } from "./shugenja.ability";
import { singerAbility } from "./singer.ability";
import { skin_painterAbility } from "./skin_painter.ability";
import { slayerAbility } from "./slayer.ability";
import { snakeCharmerAbility } from "./snake_charmer.ability";
import { snitchAbility } from "./snitch.ability";
import { soldierAbility } from "./soldier.ability";
import { spyAbility } from "./spy.ability";
import { stewardAbility } from "./steward.ability";
import { stormcatcherAbility } from "./stormcatcher.ability";
import { summonerAbility } from "./summoner.ability";
import { sweetheartAbility } from "./sweetheart.ability";
import { taoistAbility } from "./taoist.ability";
import { taotieAbility } from "./taotie.ability";
import { taowuAbility } from "./taowu.ability";
import { teaLadyAbility } from "./tea_lady.ability";
import { terracotta_artisanAbility } from "./terracotta_artisan.ability";
import { thiefAbility } from "./thief.ability";
import { tinkerAbility } from "./tinker.ability";
import { titusAbility } from "./titus.ability";
import { town_crierAbility } from "./town_crier.ability";
import { toymakerAbility } from "./toymaker.ability";
import { traitorousMinisterAbility } from "./traitorous_minister.ability";
import { trickster_jackAbility } from "./trickster_jack.ability";
import { undertakerAbility } from "./undertaker.ability";
import { ventriloquistAbility } from "./ventriloquist.ability";
import { vigormortisAbility } from "./vigormortis.ability";
import { villagerAbility } from "./villager.ability";
import { virginAbility } from "./virgin.ability";
import { vizierAbility } from "./vizier.ability";
import { vortoxAbility } from "./vortox.ability";
import { washerwomanAbility } from "./washerwoman.ability";
import { widowAbility } from "./widow.ability";
import { witchAbility } from "./witch.ability";
import { wizardAbility } from "./wizard.ability";
import { wormBreederAbility } from "./worm_breeder.ability";
import { wraithAbility } from "./wraith.ability";
import { xaanAbility } from "./xaan.ability";
import { yaggababbleAbility } from "./yaggababble.ability";
import { yinYangMasterAbility } from "./yin_yang_master.ability";
import { zealotAbility } from "./zealot.ability";
import { zhenAbility } from "./zhen.ability";
import { zombuulAbility } from "./zombuul.ability";
import { leechAbility } from "./leech.ability";
import { missionaryAbility } from "./missionary.ability";
import { shamanAbility } from "./shaman.ability";

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
    preCondition: () => true,
    execute: async (context) => {
      return {
        success: true,
        data: {},
        affectedTargetIds: context.targets.map((t) => t.id),
      };
    },
    postProcess: () => {},
  };
}

/**
 * 注册所有新引擎能力
 */
export function registerAllNewEngineAbilities(): void {
  console.log("[AbilityRegistry] 开始注册新引擎能力...");

  const abilities = [
    acrobatAbility,
    actorAbility,
    alchemistAbility,
    amnesiacAbility,
    angelAbility,
    artistAbility,
    assassinAbility,
    astrologerAbility,
    astronomerAbility,
    atheistAbility,
    balloonistAbility,
    bansheeAbility,
    barberAbility,
    bardAbility,
    baronAbility,
    beggarAbility,
    boffinAbility,
    boomdandyAbility,
    bounty_hunterAbility,
    brewerAbility,
    brokerAbility,
    buddhistAbility,
    bureaucratAbility,
    butlerAbility,
    cannibalAbility,
    conjurerAbility,
    cerenovusAbility,
    chambermaidAbility,
    chaosAbility,
    chefAbility,
    choirBoyAbility,
    // ⚠️ 已注释: 与 choir_boy.ability.ts 重复，保留下划线版本
    // choirboyAbility,
    clockmakerAbility,
    courtierAbility,
    cuckoo_birdAbility,
    cultLeaderAbility,
    damselAbility,
    dawnAbility,
    deusExFiascoAbility,
    devil_s_advocateAbility,
    // ⚠️ 已注释: 与 devil_s_advocate.ability.ts 重复，保留下划线版本
        devils_advocateAbility,
    diAbility,
    divinerAbility,
    doctorAbility,
    doomsayerAbility,
    dreamerAbility,
    drunkAbility,
    duskAbility,
    empathAbility,
    engineerAbility,
    enlightenedAbility,
    envoyAbility,
    evil_twinAbility,
    executionerAbility,
    exorcistAbility,
    fang_guAbility,
    farmerAbility,
    fearmongerAbility,
    ferrymanAbility,
    fishermanAbility,
    flowergirlAbility,
    foolAbility,
    fortuneTellerAbility,
    fox_spiritAbility,
    frankensteinAbility,
    gamblerAbility,
    generalAbility,
    goblinAbility,
    godfatherAbility,
    golemAbility,
    goonAbility,
    gossipAbility,
    grandmotherAbility,
    guideAbility,
    gunslingerAbility,
    hadesiaAbility,
    halfOgreAbility,
    harpyAbility,
    hatterAbility,
    hereticAbility,
    hermitAbility,
    high_priestessAbility,
    historianAbility,
    hunterAbility,
    huntsmanAbility,
    impAbility,
    imperial_guardAbility,
    inn_attendantAbility,
    innkeeperAbility,
    inspectorAbility,
    investigatorAbility,
    jesterAbility,
    jinx_starAbility,
    jugglerAbility,
    kazaliAbility,
    kingAbility,
    klutzAbility,
    knightAbility,
    legionAbility,
    leviathanAbility,
    librarianAbility,
    lil_monstaAbility,
    lleechAbility,
    lizAbility,
    lloamAbility,
    lord_of_typhonAbility,
    lunaticAbility,
    lycanthropeAbility,
    magicianAbility,
    marionetteAbility,
    mastermindAbility,
    mathematicianAbility,
    mayorAbility,
    mezephelesAbility,
    minerAbility,
    minstrelAbility,
    monkAbility,
    moonchildAbility,
    morticianAbility,
    mutantAbility,
    naughty_childAbility,
    night_watchmanAbility,
    // ⚠️ 已注释: 与 night_watchman.ability.ts 重复，保留下划线版本
    // nightwatchmanAbility,
    no_dashiiAbility,
    nobleAbility,
    ogreAbility,
    ojoAbility,
    oracleAbility,
    organ_grinderAbility,
    outsiderAbility,
    pacifistAbility,
    philosopherAbility,
    pilgrimAbility,
    pit_hagAbility,
    pixieAbility,
    plagueDoctorAbility,
    poAbility,
    poisonerAbility,
    politicianAbility,
    poppy_growerAbility,
    preacherAbility,
    prefectAbility,
    priestessAbility,
    princessAbility,
    professorAbility,
    professorFemaleAbility,
    psychopathAbility,
    pukkaAbility,
    puzzlemasterAbility,
    qiongqiAbility,
    raccoon_dogAbility,
    rangerAbility,
    ravenkeeperAbility,
    recluseAbility,
    revolutionaryAbility,
    riotAbility,
    sageAbility,
    sailorAbility,
    saintAbility,
    savantAbility,
    scapegoatAbility,
    scarletWomanAbility,
    scholarAbility,
    scribeAbility,
    seamstressAbility,
    shabalothAbility,
    shugenjaAbility,
    singerAbility,
    skin_painterAbility,
    slayerAbility,
    snakeCharmerAbility,
    snitchAbility,
    soldierAbility,
    spyAbility,
    stewardAbility,
    stormcatcherAbility,
    summonerAbility,
    sweetheartAbility,
    taoistAbility,
    taotieAbility,
    taowuAbility,
    teaLadyAbility,
    terracotta_artisanAbility,
    thiefAbility,
    tinkerAbility,
    titusAbility,
    town_crierAbility,
    toymakerAbility,
    traitorousMinisterAbility,
    trickster_jackAbility,
    undertakerAbility,
    ventriloquistAbility,
    vigormortisAbility,
    villagerAbility,
    virginAbility,
    vizierAbility,
    vortoxAbility,
    washerwomanAbility,
    widowAbility,
    witchAbility,
    wizardAbility,
    wormBreederAbility,
    wraithAbility,
    xaanAbility,
    yaggababbleAbility,
    yinYangMasterAbility,
    zealotAbility,
    zhenAbility,
    zombuulAbility,
  ];

  abilities.forEach((ability) => {
    const unifiedAbility = convertToUnifiedAbility(ability);
    unifiedRoleDefinition.registerAbility(unifiedAbility);
    rawAbilityMap.set(ability.abilityId, ability);
  });

  console.log(`[AbilityRegistry] 已注册 ${abilities.length} 个新引擎能力`);
}

const rawAbilityMap: Map<
  string,
  import("../core/roleAbility.types").IRoleAbility
> = new Map();

export function getRawAbilityMap(): Record<
  string,
  import("../core/roleAbility.types").IRoleAbility
> {
  const map: Record<string, import("../core/roleAbility.types").IRoleAbility> =
    {};
  rawAbilityMap.forEach((ability, key) => {
    map[key] = ability;
  });
  return map;
}

export function getRegisteredAbilityCount(): number {
  return unifiedRoleDefinition.getAllAbilities().length;
}

export function isRoleAbilitiesRegistered(roleId: string): boolean {
  return unifiedRoleDefinition.getRoleAbilities(roleId).length > 0;
}

export function clearAllAbilities(): void {
  unifiedRoleDefinition.clearRegistry();
  console.log("[AbilityRegistry] 已清除所有能力");
}

export function initializeAbilityRegistry(): void {
  clearAllAbilities();
  registerAllNewEngineAbilities();
  console.log(
    `[AbilityRegistry] 初始化完成，已注册 ${getRegisteredAbilityCount()} 个能力`
  );
}

export { acrobatAbility } from "./acrobat.ability";
export { actorAbility } from "./actor.ability";
export { alchemistAbility } from "./alchemist.ability";
export { amnesiacAbility } from "./amnesiac.ability";
export { angelAbility } from "./angel.ability";
export { artistAbility } from "./artist.ability";
export { assassinAbility } from "./assassin.ability";
export { astrologerAbility } from "./astrologer.ability";
export { astronomerAbility } from "./astronomer.ability";
export { atheistAbility } from "./atheist.ability";
export { balloonistAbility } from "./balloonist.ability";
export { bansheeAbility } from "./banshee.ability";
export { barberAbility } from "./barber.ability";
export { bardAbility } from "./bard.ability";
export { baronAbility } from "./baron.ability";
export { beggarAbility } from "./beggar.ability";
export { boffinAbility } from "./boffin.ability";
export { boomdandyAbility } from "./boomdandy.ability";
export { bounty_hunterAbility } from "./bounty_hunter.ability";
export { brewerAbility } from "./brewer.ability";
export { brokerAbility } from "./broker.ability";
export { buddhistAbility } from "./buddhist.ability";
export { bureaucratAbility } from "./bureaucrat.ability";
export { butlerAbility } from "./butler.ability";
export { cannibalAbility } from "./cannibal.ability";
export { cerenovusAbility } from "./cerenovus.ability";
export { chambermaidAbility } from "./chambermaid.ability";
export { chaosAbility } from "./chaos.ability";
export { chefAbility } from "./chef.ability";
// ⚠️ 已注释: 与 choir_boy.ability.ts 重复，保留下划线版本
// export { choirboyAbility } from "./choirboy.ability";
export { choirBoyAbility } from "./choir_boy.ability";
export { clockmakerAbility } from "./clockmaker.ability";
export { courtierAbility } from "./courtier.ability";
export { cuckoo_birdAbility } from "./cuckoo_bird.ability";
export { cultLeaderAbility } from "./cult_leader.ability";
export { damselAbility } from "./damsel.ability";
export { dawnAbility } from "./dawn.ability";
export { deusExFiascoAbility } from "./deus_ex_fiasco.ability";
// ⚠️ 已注释: 与 devil_s_advocate.ability.ts 重复，保留下划线版本
// export { devils_advocateAbility } from "./devils_advocate.ability";
export { devil_s_advocateAbility } from "./devil_s_advocate.ability";
export { diAbility } from "./di.ability";
export { divinerAbility } from "./diviner.ability";
export { doctorAbility } from "./doctor.ability";
export { doomsayerAbility } from "./doomsayer.ability";
export { dreamerAbility } from "./dreamer.ability";
export { drunkAbility } from "./drunk.ability";
export { duskAbility } from "./dusk.ability";
export { empathAbility } from "./empath.ability";
export { engineerAbility } from "./engineer.ability";
export { enlightenedAbility } from "./enlightened.ability";
export { envoyAbility } from "./envoy.ability";
export { evil_twinAbility } from "./evil_twin.ability";
export { executionerAbility } from "./executioner.ability";
export { exorcistAbility } from "./exorcist.ability";
export { fang_guAbility } from "./fang_gu.ability";
export { farmerAbility } from "./farmer.ability";
export { fearmongerAbility } from "./fearmonger.ability";
export { ferrymanAbility } from "./ferryman.ability";
export { fishermanAbility } from "./fisherman.ability";
export { flowergirlAbility } from "./flowergirl.ability";
export { foolAbility } from "./fool.ability";
export { fortuneTellerAbility } from "./fortune_teller.ability";
export { fox_spiritAbility } from "./fox_spirit.ability";
export { frankensteinAbility } from "./frankenstein.ability";
export { gamblerAbility } from "./gambler.ability";
export { generalAbility } from "./general.ability";
export { goblinAbility } from "./goblin.ability";
export { godfatherAbility } from "./godfather.ability";
export { golemAbility } from "./golem.ability";
export { goonAbility } from "./goon.ability";
export { gossipAbility } from "./gossip.ability";
export { grandmotherAbility } from "./grandmother.ability";
export { guideAbility } from "./guide.ability";
export { gunslingerAbility } from "./gunslinger.ability";
export { hadesiaAbility } from "./hadesia.ability";
export { halfOgreAbility } from "./half_ogre.ability";
export { harpyAbility } from "./harpy.ability";
export { hatterAbility } from "./hatter.ability";
export { hereticAbility } from "./heretic.ability";
export { hermitAbility } from "./hermit.ability";
export { high_priestessAbility } from "./high_priestess.ability";
export { historianAbility } from "./historian.ability";
export { hunterAbility } from "./hunter.ability";
export { huntsmanAbility } from "./huntsman.ability";
export { impAbility } from "./imp.ability";
export { imperial_guardAbility } from "./imperial_guard.ability";
export { inn_attendantAbility } from "./inn_attendant.ability";
export { innkeeperAbility } from "./innkeeper.ability";
export { inspectorAbility } from "./inspector.ability";
export { investigatorAbility } from "./investigator.ability";
export { jesterAbility } from "./jester.ability";
export { jinx_starAbility } from "./jinx_star.ability";
export { jugglerAbility } from "./juggler.ability";
export { kazaliAbility } from "./kazali.ability";
export { kingAbility } from "./king.ability";
export { klutzAbility } from "./klutz.ability";
export { knightAbility } from "./knight.ability";
export { legionAbility } from "./legion.ability";
export { leviathanAbility } from "./leviathan.ability";
export { librarianAbility } from "./librarian.ability";
export { lil_monstaAbility } from "./lil_monsta.ability";
export { lizAbility } from "./liz.ability";
export { lleechAbility } from "./lleech.ability";
export { lloamAbility } from "./lloam.ability";
export { lord_of_typhonAbility } from "./lord_of_typhon.ability";
export { lunaticAbility } from "./lunatic.ability";
export { lycanthropeAbility } from "./lycanthrope.ability";
export { magicianAbility } from "./magician.ability";
export { marionetteAbility } from "./marionette.ability";
export { mastermindAbility } from "./mastermind.ability";
export { mathematicianAbility } from "./mathematician.ability";
export { mayorAbility } from "./mayor.ability";
export { mezephelesAbility } from "./mezepheles.ability";
export { minerAbility } from "./miner.ability";
export { minstrelAbility } from "./minstrel.ability";
export { monkAbility } from "./monk.ability";
export { moonchildAbility } from "./moonchild.ability";
export { morticianAbility } from "./mortician.ability";
export { mutantAbility } from "./mutant.ability";
export { naughty_childAbility } from "./naughty_child.ability";
// ⚠️ 已注释: 与 night_watchman.ability.ts 重复，保留下划线版本
// export { nightwatchmanAbility } from "./nightwatchman.ability";
export { night_watchmanAbility } from "./night_watchman.ability";
export { no_dashiiAbility } from "./no_dashii.ability";
export { nobleAbility } from "./noble.ability";
export { ogreAbility } from "./ogre.ability";
export { ojoAbility } from "./ojo.ability";
export { oracleAbility } from "./oracle.ability";
export { organ_grinderAbility } from "./organ_grinder.ability";
export { outsiderAbility } from "./outsider.ability";
export { pacifistAbility } from "./pacifist.ability";
export { philosopherAbility } from "./philosopher.ability";
export { pilgrimAbility } from "./pilgrim.ability";
export { pit_hagAbility } from "./pit_hag.ability";
export { pixieAbility } from "./pixie.ability";
export { plagueDoctorAbility } from "./plague_doctor.ability";
export { poAbility } from "./po.ability";
export { poisonerAbility } from "./poisoner.ability";
export { politicianAbility } from "./politician.ability";
export { poppy_growerAbility } from "./poppy_grower.ability";
export { preacherAbility } from "./preacher.ability";
export { prefectAbility } from "./prefect.ability";
export { priestessAbility } from "./priestess.ability";
export { princessAbility } from "./princess.ability";
export { professorAbility } from "./professor.ability";
export { professorFemaleAbility } from "./professor_female.ability";
export { psychopathAbility } from "./psychopath.ability";
export { pukkaAbility } from "./pukka.ability";
export { puzzlemasterAbility } from "./puzzlemaster.ability";
export { qiongqiAbility } from "./qiongqi.ability";
export { raccoon_dogAbility } from "./raccoon_dog.ability";
export { rangerAbility } from "./ranger.ability";
export { ravenkeeperAbility } from "./ravenkeeper.ability";
export { recluseAbility } from "./recluse.ability";
export { revolutionaryAbility } from "./revolutionary.ability";
export { riotAbility } from "./riot.ability";
export { sageAbility } from "./sage.ability";
export { sailorAbility } from "./sailor.ability";
export { saintAbility } from "./saint.ability";
export { savantAbility } from "./savant.ability";
export { scapegoatAbility } from "./scapegoat.ability";
export { scarletWomanAbility } from "./scarlet_woman.ability";
export { scholarAbility } from "./scholar.ability";
export { scribeAbility } from "./scribe.ability";
export { seamstressAbility } from "./seamstress.ability";
export { shabalothAbility } from "./shabaloth.ability";
export { shugenjaAbility } from "./shugenja.ability";
export { singerAbility } from "./singer.ability";
export { skin_painterAbility } from "./skin_painter.ability";
export { slayerAbility } from "./slayer.ability";
export { snakeCharmerAbility } from "./snake_charmer.ability";
export { snitchAbility } from "./snitch.ability";
export { soldierAbility } from "./soldier.ability";
export { spyAbility } from "./spy.ability";
export { stewardAbility } from "./steward.ability";
export { stormcatcherAbility } from "./stormcatcher.ability";
export { summonerAbility } from "./summoner.ability";
export { sweetheartAbility } from "./sweetheart.ability";
export { taoistAbility } from "./taoist.ability";
export { taotieAbility } from "./taotie.ability";
export { taowuAbility } from "./taowu.ability";
export { teaLadyAbility } from "./tea_lady.ability";
export { terracotta_artisanAbility } from "./terracotta_artisan.ability";
export { thiefAbility } from "./thief.ability";
export { tinkerAbility } from "./tinker.ability";
export { titusAbility } from "./titus.ability";
export { town_crierAbility } from "./town_crier.ability";
export { toymakerAbility } from "./toymaker.ability";
export { traitorousMinisterAbility } from "./traitorous_minister.ability";
export { trickster_jackAbility } from "./trickster_jack.ability";
export { undertakerAbility } from "./undertaker.ability";
export { ventriloquistAbility } from "./ventriloquist.ability";
export { vigormortisAbility } from "./vigormortis.ability";
export { villagerAbility } from "./villager.ability";
export { virginAbility } from "./virgin.ability";
export { vizierAbility } from "./vizier.ability";
export { vortoxAbility } from "./vortox.ability";
export { washerwomanAbility } from "./washerwoman.ability";
export { widowAbility } from "./widow.ability";
export { witchAbility } from "./witch.ability";
export { wizardAbility } from "./wizard.ability";
export { wormBreederAbility } from "./worm_breeder.ability";
export { wraithAbility } from "./wraith.ability";
export { xaanAbility } from "./xaan.ability";
export { yaggababbleAbility } from "./yaggababble.ability";
export { yinYangMasterAbility } from "./yin_yang_master.ability";
export { zealotAbility } from "./zealot.ability";
export { zhenAbility } from "./zhen.ability";
export { zombuulAbility } from "./zombuul.ability";

import { RoleDefinition } from "../types/roleDefinition";
// Townsfolk
import { amnesiac } from "./townsfolk/amnesiac";
import { artist } from "./townsfolk/artist";
import { atheist } from "./townsfolk/atheist";
import { balloonist } from "./townsfolk/balloonist";
import { cannibal } from "./townsfolk/cannibal";
import { chambermaid } from "./townsfolk/chambermaid";
import { chef } from "./townsfolk/chef";
import { clockmaker } from "./townsfolk/clockmaker";
import { courtier } from "./townsfolk/courtier";
import { dreamer } from "./townsfolk/dreamer";
import { empath } from "./townsfolk/empath";
import { engineer } from "./townsfolk/engineer";
import { exorcist } from "./townsfolk/exorcist";
import { banshee } from "./townsfolk/banshee";
import { farmer } from "./townsfolk/farmer";
import { fisherman } from "./townsfolk/fisherman";
import { flowergirl } from "./townsfolk/flowergirl";
import { fool } from "./townsfolk/fool";
import { fortune_teller } from "./townsfolk/fortune_teller";
import { gambler } from "./townsfolk/gambler";
import { gossip } from "./townsfolk/gossip";
import { grandmother } from "./townsfolk/grandmother";
import { half_ogre } from "./townsfolk/half_ogre";
import { innkeeper } from "./townsfolk/innkeeper";
import { investigator } from "./townsfolk/investigator";
import { juggler } from "./townsfolk/juggler";
import { knight } from "./townsfolk/knight";
import { librarian } from "./townsfolk/librarian";
import { mathematician } from "./townsfolk/mathematician";
import { mayor } from "./townsfolk/mayor";
import { minstrel } from "./townsfolk/minstrel";
import { monk } from "./townsfolk/monk";
import { noble } from "./townsfolk/noble";
import { oracle } from "./townsfolk/oracle";
import { pacifist } from "./townsfolk/pacifist";
import { philosopher } from "./townsfolk/philosopher";
import { pilgrim } from "./townsfolk/pilgrim";
import { poppy_grower } from "./townsfolk/poppy_grower";
import { princess } from "./townsfolk/princess";
import { priestess } from "./townsfolk/priestess";
import { professor } from "./townsfolk/professor";
import { ranger } from "./townsfolk/ranger";
import { ravenkeeper } from "./townsfolk/ravenkeeper";
import { sage } from "./townsfolk/sage";
import { sailor } from "./townsfolk/sailor";
import { savant } from "./townsfolk/savant";
import { seamstress } from "./townsfolk/seamstress";
import { slayer } from "./townsfolk/slayer";
import { snake_charmer } from "./townsfolk/snake_charmer";
import { soldier } from "./townsfolk/soldier";
import { steward } from "./townsfolk/steward";
import { tea_lady } from "./townsfolk/tea_lady";
import { town_crier } from "./townsfolk/town_crier";
import { undertaker } from "./townsfolk/undertaker";
import { virgin } from "./townsfolk/virgin";
import { washerwoman } from "./townsfolk/washerwoman";
import { astrologer } from "./townsfolk/astrologer";
import { bard } from "./townsfolk/bard";
import { miner } from "./townsfolk/miner";
import { professor_female } from "./townsfolk/professorFemale";
import { monk_female } from "./townsfolk/monkFemale";
import { saint_townsfolk } from "./townsfolk/saint";
import { conjurer } from "./townsfolk/conjurer";
import { villager } from "./townsfolk/villager";
// Outsider
import { barber } from "./outsider/barber";
import { butler } from "./outsider/butler";
import { damsel } from "./outsider/damsel";
import { drunk } from "./outsider/drunk";
import { golem } from "./outsider/golem";
import { goon } from "./outsider/goon";
import { hatter } from "./outsider/hatter";
import { heretic } from "./outsider/heretic";
import { hermit } from "./outsider/hermit";
import { klutz } from "./outsider/klutz";
import { lunatic } from "./outsider/lunatic";
import { moonchild } from "./outsider/moonchild";
import { mutant } from "./outsider/mutant";
import { ogre } from "./outsider/ogre";
import { plague_doctor } from "./outsider/plague_doctor";
import { politician } from "./outsider/politician";
import { puzzlemaster } from "./outsider/puzzlemaster";
import { recluse } from "./outsider/recluse";
import { saint } from "./outsider/saint";
import { snitch } from "./outsider/snitch";
import { sweetheart } from "./outsider/sweetheart";
import { tinker } from "./outsider/tinker";
import { zealot } from "./outsider/zealot";
// Minion
import { assassin } from "./minion/assassin";
import { baron } from "./minion/baron";
import { cerenovus } from "./minion/cerenovus";
import { devils_advocate } from "./minion/devils_advocate";
import { evil_twin } from "./minion/evil_twin";
import { godfather } from "./minion/godfather";
import { psychopath } from "./minion/psychopath";
import { mastermind } from "./minion/mastermind";
import { pit_hag } from "./minion/pit_hag";
import { poisoner } from "./minion/poisoner";
import { scarlet_woman } from "./minion/scarlet_woman";
import { shaman } from "./minion/shaman";
import { spy } from "./minion/spy";
import { witch } from "./minion/witch";
import { marionette } from "./minion/marionette";
import { wraith } from "./minion/wraith";
import { vizier } from "./minion/vizier";
import { boomdandy } from "./minion/boomdandy";
import { summoner } from "./minion/summoner";
import { harpy } from "./minion/harpy";
import { widow } from "./minion/widow";
import { organ_grinder } from "./minion/organ_grinder";
import { boffin } from "./minion/boffin";
import { fearmonger } from "./minion/fearmonger";
import { wizard } from "./minion/wizard";
import { xaan } from "./minion/xaan";
// Demon
import { fang_gu } from "./demon/fang_gu";
import { hadesia } from "./demon/hadesia";
import { imp } from "./demon/imp";
import { no_dashii } from "./demon/no_dashii";
import { po } from "./demon/po";
import { pukka } from "./demon/pukka";
import { shabaloth } from "./demon/shabaloth";
import { vigormortis } from "./demon/vigormortis";
import { vortox } from "./demon/vortox";
import { zombuul } from "./demon/zombuul";
import { legion } from "./demon/legion";
import { riot } from "./demon/riot";
import { lord_of_typhon } from "./demon/lord_of_typhon";
import { kazali } from "./demon/kazali";
import { lloam } from "./demon/lloam";
import { saint as demon_saint } from "./demon/saint"; // Rename to avoid conflict with outsider saint
import { titus } from "./demon/titus";
import { leviathan } from "./demon/leviathan";
import { liz } from "./demon/liz";

/**
 * 角色注册表
 * 使用 Map 结构，以角色 ID 为键，方便快速查找
 */
export const roleRegistry: Map<string, RoleDefinition> = new Map([
  [amnesiac.id, amnesiac],
  [artist.id, artist],
  [atheist.id, atheist],
  [banshee.id, banshee],
  [balloonist.id, balloonist],
  [cannibal.id, cannibal],
  [chambermaid.id, chambermaid],
  [chef.id, chef],
  [clockmaker.id, clockmaker],
  [conjurer.id, conjurer],
  [courtier.id, courtier],
  [dreamer.id, dreamer],
  [empath.id, empath],
  [engineer.id, engineer],
  [exorcist.id, exorcist],
  [farmer.id, farmer],
  [fisherman.id, fisherman],
  [flowergirl.id, flowergirl],
  [fool.id, fool],
  [fortune_teller.id, fortune_teller],
  [gambler.id, gambler],
  [gossip.id, gossip],
  [grandmother.id, grandmother],
  [half_ogre.id, half_ogre],
  [innkeeper.id, innkeeper],
  [investigator.id, investigator],
  [juggler.id, juggler],
  [knight.id, knight],
  [librarian.id, librarian],
  [mathematician.id, mathematician],
  [mayor.id, mayor],
  [minstrel.id, minstrel],
  [monk.id, monk],
  [noble.id, noble],
  [oracle.id, oracle],
  [pacifist.id, pacifist],
  [philosopher.id, philosopher],
  [pilgrim.id, pilgrim],
  [princess.id, princess],
  [priestess.id, priestess],
  [poppy_grower.id, poppy_grower],
  [professor.id, professor],
  [ranger.id, ranger],
  [ravenkeeper.id, ravenkeeper],
  [sage.id, sage],
  [sailor.id, sailor],
  [savant.id, savant],
  [seamstress.id, seamstress],
  [slayer.id, slayer],
  [snake_charmer.id, snake_charmer],
  [soldier.id, soldier],
  [steward.id, steward],
  [tea_lady.id, tea_lady],
  [town_crier.id, town_crier],
  [undertaker.id, undertaker],
  [virgin.id, virgin],
  [villager.id, villager],
  [washerwoman.id, washerwoman],
  [astrologer.id, astrologer],
  [bard.id, bard],
  [miner.id, miner],
  [professor_female.id, professor_female],
  [monk_female.id, monk_female],
  [saint_townsfolk.id, saint_townsfolk],
  [barber.id, barber],
  [butler.id, butler],
  [damsel.id, damsel],
  [drunk.id, drunk],
  [golem.id, golem],
  [goon.id, goon],
  [hatter.id, hatter],
  [heretic.id, heretic],
  [hermit.id, hermit],
  [klutz.id, klutz],
  [lunatic.id, lunatic],
  [moonchild.id, moonchild],
  [mutant.id, mutant],
  [ogre.id, ogre],
  [plague_doctor.id, plague_doctor],
  [politician.id, politician],
  [puzzlemaster.id, puzzlemaster],
  [recluse.id, recluse],
  [saint.id, saint],
  [snitch.id, snitch],
  [sweetheart.id, sweetheart],
  [tinker.id, tinker],
  [zealot.id, zealot],
  [assassin.id, assassin],
  [baron.id, baron],
  [cerenovus.id, cerenovus],
  [devils_advocate.id, devils_advocate],
  [evil_twin.id, evil_twin],
  [godfather.id, godfather],
  [psychopath.id, psychopath],
  [mastermind.id, mastermind],
  [pit_hag.id, pit_hag],
  [poisoner.id, poisoner],
  [scarlet_woman.id, scarlet_woman],
  [shaman.id, shaman],
  [spy.id, spy],
  [witch.id, witch],
  [marionette.id, marionette],
  [wraith.id, wraith],
  [vizier.id, vizier],
  [boomdandy.id, boomdandy],
  [summoner.id, summoner],
  [harpy.id, harpy],
  [widow.id, widow],
  [organ_grinder.id, organ_grinder],
  [boffin.id, boffin],
  [fearmonger.id, fearmonger],
  [wizard.id, wizard],
  [xaan.id, xaan],
  [fang_gu.id, fang_gu],
  [hadesia.id, hadesia],
  [imp.id, imp],
  [no_dashii.id, no_dashii],
  [po.id, po],
  [pukka.id, pukka],
  [shabaloth.id, shabaloth],
  [vigormortis.id, vigormortis],
  [vortox.id, vortox],
  [zombuul.id, zombuul],
  [legion.id, legion],
  [riot.id, riot],
  [lord_of_typhon.id, lord_of_typhon],
  [kazali.id, kazali],
  [lloam.id, lloam],
  [demon_saint.id, demon_saint],
  [titus.id, titus],
  [leviathan.id, leviathan],
  [liz.id, liz],
]);

/**
 * 根据角色 ID 获取角色定义
 * @param roleId 角色 ID
 * @returns 角色定义，如果不存在则返回 undefined
 */
export function getRoleDefinition(roleId: string): RoleDefinition | undefined {
  return roleRegistry.get(roleId);
}

/**
 * 获取所有已注册的角色定义
 * @returns 所有角色定义的数组
 */
export function getAllRoleDefinitions(): RoleDefinition[] {
  return Array.from(roleRegistry.values());
}

/**
 * 检查角色是否已注册
 * @param roleId 角色 ID
 * @returns 是否已注册
 */
export function isRoleRegistered(roleId: string): boolean {
  return roleRegistry.has(roleId);
}

// 导出所有角色定义（方便按类型导入）
// Townsfolk
export { amnesiac } from "./townsfolk/amnesiac";
export { artist } from "./townsfolk/artist";
export { atheist } from "./townsfolk/atheist";
export { balloonist } from "./townsfolk/balloonist";
export { cannibal } from "./townsfolk/cannibal";
export { chambermaid } from "./townsfolk/chambermaid";
export { chef } from "./townsfolk/chef";
export { clockmaker } from "./townsfolk/clockmaker";
export { courtier } from "./townsfolk/courtier";
export { dreamer } from "./townsfolk/dreamer";
export { empath } from "./townsfolk/empath";
export { engineer } from "./townsfolk/engineer";
export { exorcist } from "./townsfolk/exorcist";
export { farmer } from "./townsfolk/farmer";
export { fisherman } from "./townsfolk/fisherman";
export { flowergirl } from "./townsfolk/flowergirl";
export { fool } from "./townsfolk/fool";
export { fortune_teller } from "./townsfolk/fortune_teller";
export { gambler } from "./townsfolk/gambler";
export { gossip } from "./townsfolk/gossip";
export { grandmother } from "./townsfolk/grandmother";
export { innkeeper } from "./townsfolk/innkeeper";
export { investigator } from "./townsfolk/investigator";
export { juggler } from "./townsfolk/juggler";
export { librarian } from "./townsfolk/librarian";
export { mathematician } from "./townsfolk/mathematician";
export { mayor } from "./townsfolk/mayor";
export { minstrel } from "./townsfolk/minstrel";
export { monk } from "./townsfolk/monk";
export { noble } from "./townsfolk/noble";
export { oracle } from "./townsfolk/oracle";
export { pacifist } from "./townsfolk/pacifist";
export { philosopher } from "./townsfolk/philosopher";
export { poppy_grower } from "./townsfolk/poppy_grower";
export { professor } from "./townsfolk/professor";
export { ranger } from "./townsfolk/ranger";
export { ravenkeeper } from "./townsfolk/ravenkeeper";
export { sage } from "./townsfolk/sage";
export { sailor } from "./townsfolk/sailor";
export { savant } from "./townsfolk/savant";
export { seamstress } from "./townsfolk/seamstress";
export { slayer } from "./townsfolk/slayer";
export { snake_charmer } from "./townsfolk/snake_charmer";
export { soldier } from "./townsfolk/soldier";
export { tea_lady } from "./townsfolk/tea_lady";
export { town_crier } from "./townsfolk/town_crier";
export { undertaker } from "./townsfolk/undertaker";
export { virgin } from "./townsfolk/virgin";
export { washerwoman } from "./townsfolk/washerwoman";
// Outsider
export { barber } from "./outsider/barber";
export { butler } from "./outsider/butler";
export { damsel } from "./outsider/damsel";
export { drunk } from "./outsider/drunk";
export { golem } from "./outsider/golem";
export { goon } from "./outsider/goon";
export { klutz } from "./outsider/klutz";
export { lunatic } from "./outsider/lunatic";
export { moonchild } from "./outsider/moonchild";
export { mutant } from "./outsider/mutant";
export { recluse } from "./outsider/recluse";
export { saint } from "./outsider/saint";
export { sweetheart } from "./outsider/sweetheart";
export { tinker } from "./outsider/tinker";
// Minion
export { assassin } from "./minion/assassin";
export { baron } from "./minion/baron";
export { cerenovus } from "./minion/cerenovus";
export { devils_advocate } from "./minion/devils_advocate";
export { evil_twin } from "./minion/evil_twin";
export { godfather } from "./minion/godfather";
export { psychopath } from "./minion/psychopath";
export { mastermind } from "./minion/mastermind";
export { pit_hag } from "./minion/pit_hag";
export { poisoner } from "./minion/poisoner";
export { scarlet_woman } from "./minion/scarlet_woman";
export { shaman } from "./minion/shaman";
export { spy } from "./minion/spy";
export { witch } from "./minion/witch";
// Demon
export { fang_gu } from "./demon/fang_gu";
export { hadesia } from "./demon/hadesia";
export { imp } from "./demon/imp";
export { no_dashii } from "./demon/no_dashii";
export { po } from "./demon/po";
export { pukka } from "./demon/pukka";
export { shabaloth } from "./demon/shabaloth";
export { vigormortis } from "./demon/vigormortis";
export { vortox } from "./demon/vortox";
export { zombuul } from "./demon/zombuul";

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
import { farmer } from "./townsfolk/farmer";
import { fisherman } from "./townsfolk/fisherman";
import { flowergirl } from "./townsfolk/flowergirl";
import { fool } from "./townsfolk/fool";
import { fortune_teller } from "./townsfolk/fortune_teller";
import { gambler } from "./townsfolk/gambler";
import { gossip } from "./townsfolk/gossip";
import { grandmother } from "./townsfolk/grandmother";
import { innkeeper } from "./townsfolk/innkeeper";
import { investigator } from "./townsfolk/investigator";
import { juggler } from "./townsfolk/juggler";
import { librarian } from "./townsfolk/librarian";
import { mathematician } from "./townsfolk/mathematician";
import { mayor } from "./townsfolk/mayor";
import { minstrel } from "./townsfolk/minstrel";
import { monk } from "./townsfolk/monk";
import { noble } from "./townsfolk/noble";
import { oracle } from "./townsfolk/oracle";
import { pacifist } from "./townsfolk/pacifist";
import { philosopher } from "./townsfolk/philosopher";
import { poppy_grower } from "./townsfolk/poppy_grower";
import { professor } from "./townsfolk/professor";
import { professor_mr } from "./townsfolk/professor_mr";
import { ranger } from "./townsfolk/ranger";
import { ravenkeeper } from "./townsfolk/ravenkeeper";
import { sage } from "./townsfolk/sage";
import { sailor } from "./townsfolk/sailor";
import { savant } from "./townsfolk/savant";
import { savant_mr } from "./townsfolk/savant_mr";
import { seamstress } from "./townsfolk/seamstress";
import { slayer } from "./townsfolk/slayer";
import { snake_charmer } from "./townsfolk/snake_charmer";
import { snake_charmer_mr } from "./townsfolk/snake_charmer_mr";
import { soldier } from "./townsfolk/soldier";
import { tea_lady } from "./townsfolk/tea_lady";
import { town_crier } from "./townsfolk/town_crier";
import { undertaker } from "./townsfolk/undertaker";
import { virgin } from "./townsfolk/virgin";
import { washerwoman } from "./townsfolk/washerwoman";
// Outsider
import { barber } from "./outsider/barber";
import { barber_mr } from "./outsider/barber_mr";
import { butler } from "./outsider/butler";
import { damsel } from "./outsider/damsel";
import { drunk } from "./outsider/drunk";
import { drunk_mr } from "./outsider/drunk_mr";
import { golem } from "./outsider/golem";
import { goon } from "./outsider/goon";
import { klutz } from "./outsider/klutz";
import { lunatic } from "./outsider/lunatic";
import { moonchild } from "./outsider/moonchild";
import { mutant } from "./outsider/mutant";
import { recluse } from "./outsider/recluse";
import { saint } from "./outsider/saint";
import { sweetheart } from "./outsider/sweetheart";
import { tinker } from "./outsider/tinker";
// Minion
import { assassin } from "./minion/assassin";
import { baron } from "./minion/baron";
import { cerenovus } from "./minion/cerenovus";
import { devils_advocate } from "./minion/devils_advocate";
import { evil_twin } from "./minion/evil_twin";
import { godfather } from "./minion/godfather";
import { lunatic_mr } from "./minion/lunatic_mr";
import { mastermind } from "./minion/mastermind";
import { pit_hag } from "./minion/pit_hag";
import { pit_hag_mr } from "./minion/pit_hag_mr";
import { poisoner } from "./minion/poisoner";
import { poisoner_mr } from "./minion/poisoner_mr";
import { scarlet_woman } from "./minion/scarlet_woman";
import { shaman } from "./minion/shaman";
import { spy } from "./minion/spy";
import { witch } from "./minion/witch";
// Demon
import { fang_gu } from "./demon/fang_gu";
import { hadesia } from "./demon/hadesia";
import { imp } from "./demon/imp";
import { no_dashii } from "./demon/no_dashii";
import { po } from "./demon/po";
import { pukka } from "./demon/pukka";
import { shabaloth } from "./demon/shabaloth";
import { vigormortis } from "./demon/vigormortis";
import { vigormortis_mr } from "./demon/vigormortis_mr";
import { vortox } from "./demon/vortox";
import { zombuul } from "./demon/zombuul";

/**
 * 角色注册表
 * 使用 Map 结构，以角色 ID 为键，方便快速查找
 */
export const roleRegistry: Map<string, RoleDefinition> = new Map([
  [amnesiac.id, amnesiac],
  [artist.id, artist],
  [atheist.id, atheist],
  [balloonist.id, balloonist],
  [cannibal.id, cannibal],
  [chambermaid.id, chambermaid],
  [chef.id, chef],
  [clockmaker.id, clockmaker],
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
  [innkeeper.id, innkeeper],
  [investigator.id, investigator],
  [juggler.id, juggler],
  [librarian.id, librarian],
  [mathematician.id, mathematician],
  [mayor.id, mayor],
  [minstrel.id, minstrel],
  [monk.id, monk],
  [noble.id, noble],
  [oracle.id, oracle],
  [pacifist.id, pacifist],
  [philosopher.id, philosopher],
  [poppy_grower.id, poppy_grower],
  [professor.id, professor],
  [professor_mr.id, professor_mr],
  [ranger.id, ranger],
  [ravenkeeper.id, ravenkeeper],
  [sage.id, sage],
  [sailor.id, sailor],
  [savant.id, savant],
  [savant_mr.id, savant_mr],
  [seamstress.id, seamstress],
  [slayer.id, slayer],
  [snake_charmer.id, snake_charmer],
  [snake_charmer_mr.id, snake_charmer_mr],
  [soldier.id, soldier],
  [tea_lady.id, tea_lady],
  [town_crier.id, town_crier],
  [undertaker.id, undertaker],
  [virgin.id, virgin],
  [washerwoman.id, washerwoman],
  [barber.id, barber],
  [barber_mr.id, barber_mr],
  [butler.id, butler],
  [damsel.id, damsel],
  [drunk.id, drunk],
  [drunk_mr.id, drunk_mr],
  [golem.id, golem],
  [goon.id, goon],
  [klutz.id, klutz],
  [lunatic.id, lunatic],
  [moonchild.id, moonchild],
  [mutant.id, mutant],
  [recluse.id, recluse],
  [saint.id, saint],
  [sweetheart.id, sweetheart],
  [tinker.id, tinker],
  [assassin.id, assassin],
  [baron.id, baron],
  [cerenovus.id, cerenovus],
  [devils_advocate.id, devils_advocate],
  [evil_twin.id, evil_twin],
  [godfather.id, godfather],
  [lunatic_mr.id, lunatic_mr],
  [mastermind.id, mastermind],
  [pit_hag.id, pit_hag],
  [pit_hag_mr.id, pit_hag_mr],
  [poisoner.id, poisoner],
  [poisoner_mr.id, poisoner_mr],
  [scarlet_woman.id, scarlet_woman],
  [shaman.id, shaman],
  [spy.id, spy],
  [witch.id, witch],
  [fang_gu.id, fang_gu],
  [hadesia.id, hadesia],
  [imp.id, imp],
  [no_dashii.id, no_dashii],
  [po.id, po],
  [pukka.id, pukka],
  [shabaloth.id, shabaloth],
  [vigormortis.id, vigormortis],
  [vigormortis_mr.id, vigormortis_mr],
  [vortox.id, vortox],
  [zombuul.id, zombuul],
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
export { professor_mr } from "./townsfolk/professor_mr";
export { ranger } from "./townsfolk/ranger";
export { ravenkeeper } from "./townsfolk/ravenkeeper";
export { sage } from "./townsfolk/sage";
export { sailor } from "./townsfolk/sailor";
export { savant } from "./townsfolk/savant";
export { savant_mr } from "./townsfolk/savant_mr";
export { seamstress } from "./townsfolk/seamstress";
export { slayer } from "./townsfolk/slayer";
export { snake_charmer } from "./townsfolk/snake_charmer";
export { snake_charmer_mr } from "./townsfolk/snake_charmer_mr";
export { soldier } from "./townsfolk/soldier";
export { tea_lady } from "./townsfolk/tea_lady";
export { town_crier } from "./townsfolk/town_crier";
export { undertaker } from "./townsfolk/undertaker";
export { virgin } from "./townsfolk/virgin";
export { washerwoman } from "./townsfolk/washerwoman";
// Outsider
export { barber } from "./outsider/barber";
export { barber_mr } from "./outsider/barber_mr";
export { butler } from "./outsider/butler";
export { damsel } from "./outsider/damsel";
export { drunk } from "./outsider/drunk";
export { drunk_mr } from "./outsider/drunk_mr";
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
export { lunatic_mr } from "./minion/lunatic_mr";
export { mastermind } from "./minion/mastermind";
export { pit_hag } from "./minion/pit_hag";
export { pit_hag_mr } from "./minion/pit_hag_mr";
export { poisoner } from "./minion/poisoner";
export { poisoner_mr } from "./minion/poisoner_mr";
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
export { vigormortis_mr } from "./demon/vigormortis_mr";
export { vortox } from "./demon/vortox";
export { zombuul } from "./demon/zombuul";

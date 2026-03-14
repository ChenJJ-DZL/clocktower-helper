"use client";

/**
 * Recommended night order override list (first night & other nights).
 * The engine will apply these orders when the roleId exists in the registry;
 * unknown/absent ids are ignored so it is safe to keep this list superset.
 *
 * NOTE: The numbers simply follow array index (1-based) to reflect the provided
 * global ordering. If a role is not present in the array, its original
 * roleDef order is used.
 */

const firstNightOrderList: string[] = [
  // Dusk & special preambles
  "lord_of_typhon",
  "wraith",
  "boffin",
  "amnesiac",
  "philosopher",
  "alchemist",
  "poppy_grower",
  "kazali",
  "magician",
  // Minion info (handled automatically, but snitch/summoner etc around here)
  "snitch",
  "damsel",
  "summoner",
  "lunatic",
  "taowu",
  // Demon info (handled automatically, but king/marionette etc around here)
  "king",
  "marionette",
  "shusheng", // 书生 instead of scholar
  "xizi", // 戏子 instead of actor
  "qianke", // 掮客 instead of broker
  "sailor",
  "engineer",
  "preacher",
  "lilmonsta",
  "lleech",
  "huapi",
  "xaan",
  "poisoner",
  "widow",
  "courtier",
  "wizard",
  "snake_charmer",
  "godfather",
  "organ_grinder",
  "devils_advocate",
  "evil_twin",
  "witch",
  "cerenovus",
  "fearmonger",
  "harpy",
  "mezepheles",
  "humeiniang",
  "pukka",
  "yaggababble",
  "niangjiushi",
  "yongjiang",
  "xionghaizi",
  "pixie",
  "huntsman",
  "washerwoman",
  "librarian",
  "investigator",
  "chef",
  "empath",
  "fortune_teller",
  "butler",
  "nichen",
  "grandmother",
  "clockmaker",
  "dreamer",
  "seamstress",
  "steward",
  "knight",
  "noble",
  "balloonist",
  "yinyangshi",
  "langzhong",
  "dianxiaoer",
  "village_idiot",
  "bounty_hunter",
  "nightwatchman",
  "cult_leader",
  "spy",
  "ogre",
  "priestess",
  "shugenja",
  "qintianjian",
  "general",
  "fangshi",
  "chambermaid",
  "guide",
  "mathematician",
  "leviathan",
  "vizier",
];

const otherNightOrderList: string[] = [
  // Dusk placeholders skipped automatically
  "wraith",
  "amnesiac",
  "philosopher",
  "hatter",
  "poppy_grower",
  "qianke", // 掮客
  "sailor",
  "engineer",
  "preacher",
  "pit_hag",
  "xaan",
  "poisoner",
  "innkeeper",
  "courtier",
  "wizard",
  "dagengren",
  "jinyiwei",
  "limao",
  "xuncha", // 巡察
  "gambler",
  "acrobat",
  "snake_charmer",
  "monk",
  "niangjiushi",
  "xionghaizi",
  "organ_grinder",
  "devils_advocate",
  "witch",
  "cerenovus",
  "fearmonger",
  "harpy",
  "mezepheles",
  "humeiniang",
  "nichen",
  "rulianshi",
  "scarlet_woman",
  "summoner",
  "lunatic",
  "exorcist",
  "daoshi",
  "lycanthrope",
  "princess",
  "legion",
  "imp",
  "zombuul",
  "pukka",
  "shabaloth",
  "po",
  "fang_gu",
  "no_dashii",
  "vortox",
  "vigormortis",
  "ojo",
  "lord_of_typhon",
  "alhadikhia",
  "lleech",
  "lilmonsta",
  "yaggababble",
  "kazali",
  "hundun",
  "qiongqi",
  "taotie",
  "taowu",
  "baojun", // 暴君
  "guhuoniao",
  "shusheng", // 书生
  "assassin",
  "godfather",
  "yangguren", // 养蛊人
  "geling", // 歌伶
  "zhen", // 鸩
  "gossip",
  "tinker",
  "moonchild",
  "shaxing", // 煞星
  "grandmother",
  "barber",
  "sweetheart",
  "ravenkeeper",
  "sage",
  "bingbi", // 秉笔
  "plague_doctor",
  "choirboy",
  "farmer",
  "banshee",
  "professor",
  "huntsman",
  "info_role_trigger", // placeholder for info-class retriggers
  "empath",
  "fortune_teller",
  "butler",
  "undertaker",
  "tixingguan",
  "dreamer",
  "flowergirl",
  "town_crier",
  "oracle",
  "seamstress",
  "juggler",
  "balloonist",
  "langzhong",
  "village_idiot",
  "king",
  "bounty_hunter",
  "nightwatchman",
  "cult_leader",
  "spy",
  "priestess",
  "general",
  "fangshi",
  "shiguan", // 史官
  "zhifu", // 知府
  "chambermaid",
  "yinluren", // 引路人
  "mathematician",
  "leviathan",
];

export function getNightOrderOverride(
  roleId: string,
  isFirstNight: boolean
): number | null {
  const list = isFirstNight ? firstNightOrderList : otherNightOrderList;
  const idx = list.indexOf(roleId);
  return idx >= 0 ? idx + 1 : null;
}

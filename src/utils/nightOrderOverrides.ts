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
  // Dusk & special preambles (non-role placeholders are skipped automatically)
  "lord_of_typhon",
  "wraith",
  "boffin",
  "amnesiac",
  "philosopher",
  "alchemist",
  "poppy_grower",
  "kazali",
  "magician",
  "snitch",
  "damsel",
  "summoner",
  "lunatic",
  "taowu",
  "king",
  "marionette",
  "scholar", // 书生 → scholar (if present)
  "actor", // 戏子 → actor (if present)
  "broker", // 掮客 → broker/qianke (if present)
  "sailor",
  "engineer",
  "preacher",
  "lilmonsta",
  "lleech",
  "huapi", // 画皮
  "xaan", // 限
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
  "humeiniang", // 狐媚娘
  "pukka",
  "yaggababble",
  "niangjiushi", // 酿酒师
  "yongjiang", // 俑匠
  "xionghaizi", // 熊孩子
  "pixie",
  "huntsman",
  "washerwoman",
  "librarian",
  "investigator",
  "chef",
  "empath",
  "fortune_teller",
  "butler",
  "nichen", // 逆臣
  "grandmother",
  "clockmaker",
  "dreamer",
  "seamstress",
  "steward",
  "knight",
  "noble",
  "balloonist",
  "yinyangshi", // 阴阳师
  "langzhong", // 郎中
  "dianxiaoer", // 店小二
  "village_idiot", // 村夫
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
  "guide", // 引路人
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
  "broker",
  "sailor",
  "engineer",
  "preacher",
  "pit_hag",
  "xaan",
  "poisoner",
  "innkeeper",
  "courtier",
  "wizard",
  "dagengren", // 打更人
  "jinyiwei", // 锦衣卫
  "limao", // 狸猫
  "patrol", // 巡察
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
  "warlord", // 暴君/baojun
  "guhuoniao",
  "assassin",
  "godfather",
  "yangguren",
  "geling",
  "zhen",
  "gossip",
  "tinker",
  "moonchild",
  "shaxing",
  "barber",
  "sweetheart",
  "ravenkeeper",
  "sage",
  "bingbi",
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
  "tixingguan", // 提刑官
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
  "historian", // 史官
  "zhifu", // 知府
  "chambermaid",
  "guide",
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



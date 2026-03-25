const fs = require("node:fs");
const path = require("node:path");

// 读取夜晚行动顺序文件
const nightOrderPath = path.join(__dirname, "..", "json", "夜晚行动顺序.json");
const nightOrderContent = fs.readFileSync(nightOrderPath, "utf-8");

// 解析夜晚行动顺序
const lines = nightOrderContent.split("\n");
const nightOrder = {
  firstNight: [],
  otherNights: [],
};

let currentNightType = null;

// 角色名称映射表（英文到英文ID）
const roleNameMap = {
  lordoftyphon: "lord_of_typhon",
  wraith: "wraith",
  boffin: "frankenstein",
  amnesiac: "amnesiac",
  philosopher: "philosopher",
  alchemist: "alchemist",
  poppygrower: "poppy_grower",
  kazali: "kazali",
  magician: "magician",
  snitch: "snitch",
  damsel: "damsel",
  summoner: "summoner",
  lunatic: "lunatic",
  taowu: "taowu",
  king: "king",
  marionette: "marionette",
  shusheng: "scholar",
  xizi: "actor",
  qianke: "broker",
  sailor: "sailor",
  engineer: "engineer",
  preacher: "preacher",
  lilmonsta: "lil_monsta",
  lleech: "lleech",
  huapi: "skin_painter",
  xaan: "xaan",
  poisoner: "poisoner",
  widow: "widow",
  courtier: "courtier",
  wizard: "wizard",
  snakecharmer: "snake_charmer",
  godfather: "godfather",
  organgrinder: "organ_grinder",
  devilsadvocate: "devils_advocate",
  eviltwin: "evil_twin",
  witch: "witch",
  cerenovus: "cerenovus",
  fearmonger: "fearmonger",
  harpy: "harpy",
  mezepheles: "mezepheles",
  humeiniang: "fox_spirit",
  pukka: "pukka",
  yaggababble: "yaggababble",
  niangjiushi: "brewer",
  yongjiang: "terracotta_artisan",
  xionghaizi: "naughty_child",
  pixie: "pixie",
  huntsman: "huntsman",
  washerwoman: "washerwoman",
  librarian: "librarian",
  investigator: "investigator",
  chef: "chef",
  empath: "empath",
  fortuneteller: "fortune_teller",
  butler: "butler",
  nichen: "traitorous_minister",
  grandmother: "grandmother",
  clockmaker: "clockmaker",
  dreamer: "dreamer",
  seamstress: "seamstress",
  steward: "steward",
  knight: "knight",
  noble: "noble",
  balloonist: "balloonist",
  yinyangshi: "yin_yang_master",
  langzhong: "doctor",
  dianxiaoer: "inn_attendant",
  villageidiot: "villager",
  bountyhunter: "bounty_hunter",
  nightwatchman: "nightwatchman",
  cultleader: "cult_leader",
  spy: "spy",
  ogre: "ogre",
  highpriestess: "high_priestess",
  shugenja: "shugenja",
  qintianjian: "astronomer",
  general: "general",
  fangshi: "diviner",
  chambermaid: "chambermaid",
  yinluren: "guide",
  mathematician: "mathematician",
  leviathan: "leviathan",
  vizier: "vizier",
  dusk: "dusk",
  dawn: "dawn",
  hatter: "hatter",
  pithag: "pit_hag",
  innkeeper: "innkeeper",
  dagengren: "night_watchman",
  jinyiwei: "imperial_guard",
  limao: "raccoon_dog",
  xuncha: "inspector",
  gambler: "gambler",
  acrobat: "acrobat",
  monk: "monk",
  rulianshi: "mortician",
  scarletwoman: "scarlet_woman",
  exorcist: "exorcist",
  daoshi: "taoist",
  lycanthrope: "lycanthrope",
  princess: "princess",
  legion: "legion",
  imp: "imp",
  zombuul: "zombuul",
  shabaloth: "shabaloth",
  po: "po",
  fanggu: "fang_gu",
  nodashii: "no_dashii",
  vortox: "vortox",
  vigormortis: "vigormortis",
  ojo: "ojo",
  alhadikhia: "hadesia",
  hundun: "chaos",
  qiongqi: "qiongqi",
  taotie: "taotie",
  baojun: "tyrant",
  guhuoniao: "cuckoo_bird",
  assassin: "assassin",
  yangguren: "worm_breeder",
  geling: "singer",
  zhen: "zhen",
  gossip: "gossip",
  tinker: "tinker",
  moonchild: "moonchild",
  shaxing: "jinx_star",
  barber: "barber",
  sweetheart: "sweetheart",
  ravenkeeper: "ravenkeeper",
  sage: "sage",
  bingbi: "scribe",
  plaguedoctor: "plague_doctor",
  choirboy: "choirboy",
  farmer: "farmer",
  banshee: "banshee",
  professor: "professor",
  undertaker: "undertaker",
  tixingguan: "executioner",
  flowergirl: "flowergirl",
  towncrier: "town_crier",
  oracle: "oracle",
  juggler: "juggler",
  shiguan: "historian",
  zhifu: "prefect",
};

// 解析夜晚行动顺序
for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();

  // 检测章节标题
  if (line === "一、首个夜晚") {
    currentNightType = "firstNight";
    continue;
  } else if (line === "二、其他夜晚：") {
    currentNightType = "otherNights";
    continue;
  }

  // 跳过空行和注释
  if (
    !line ||
    line.startsWith("注：") ||
    line.startsWith("由于") ||
    line.startsWith("夜晚行动顺序") ||
    line.startsWith("Mi") ||
    line.includes("调整理由") ||
    line.includes("添加理由") ||
    line.includes("参考") ||
    line.includes("建议") ||
    line.includes("注：根据规则") ||
    line.includes('为"由死亡触发能力"')
  ) {
    continue;
  }

  // 检测角色行动行（英文名在前，中文名在后）
  // 匹配模式：英文名（可能包含空格或连字符） 中文名：描述
  const roleMatch = line.match(/^([A-Za-z-]+)\s+([\u4e00-\u9fa5]+)[：:]/);
  if (roleMatch && currentNightType) {
    const englishName = roleMatch[1].toLowerCase();
    const chineseName = roleMatch[2];
    const roleId = roleNameMap[englishName] || englishName;

    // 提取描述（行中中文名之后的部分）
    const descriptionStart = line.indexOf(chineseName) + chineseName.length + 1; // +1 for colon
    let description = line.substring(descriptionStart).trim();

    // 如果描述为空，尝试获取下一行作为描述
    if (!description && i + 1 < lines.length) {
      const nextLine = lines[i + 1].trim();
      if (
        nextLine &&
        !nextLine.match(/^([A-Za-z-]+)\s+([\u4e00-\u9fa5]+)[：:]/)
      ) {
        description = nextLine;
        i++; // 跳过下一行
      }
    }

    // 创建行动条目
    const action = {
      id: roleId,
      chineseName,
      englishName,
      description: description || "无描述",
    };

    // 添加到对应的夜晚类型
    if (currentNightType === "firstNight") {
      nightOrder.firstNight.push(action);
    } else if (currentNightType === "otherNights") {
      nightOrder.otherNights.push(action);
    }
  }
}

// 保存到JSON文件
const outputPath = path.join(__dirname, "..", "src", "data", "nightOrder.json");
fs.writeFileSync(outputPath, JSON.stringify(nightOrder, null, 2), "utf-8");

console.log("成功解析夜晚行动顺序");
console.log(`首个夜晚行动数量：${nightOrder.firstNight.length}`);
console.log(`其他夜晚行动数量：${nightOrder.otherNights.length}`);

// 输出一些示例
console.log("\n首个夜晚示例行动：");
for (let i = 0; i < Math.min(5, nightOrder.firstNight.length); i++) {
  const action = nightOrder.firstNight[i];
  console.log(
    `${action.chineseName} (${action.id}): ${action.description.substring(0, 50)}...`
  );
}

console.log("\n其他夜晚示例行动：");
for (let i = 0; i < Math.min(5, nightOrder.otherNights.length); i++) {
  const action = nightOrder.otherNights[i];
  console.log(
    `${action.chineseName} (${action.id}): ${action.description.substring(0, 50)}...`
  );
}

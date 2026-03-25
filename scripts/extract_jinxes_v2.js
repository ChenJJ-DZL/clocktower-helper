const fs = require("fs");
const path = require("path");

// 读取相克规则文件
const jinxRulesPath = path.join(__dirname, "..", "json", "相克规则.json");
const jinxRulesContent = fs.readFileSync(jinxRulesPath, "utf-8");

// 解析相克规则
const lines = jinxRulesContent.split("\n");
const jinxes = [];

// 角色名称映射表（中文到英文ID）
const roleNameMap = {
  侍女: "chambermaid",
  数学家: "mathematician",
  酒鬼: "drunk",
  疯子: "lunatic",
  提线木偶: "marionette",
  哲学家: "philosopher",
  赏金猎人: "bounty_hunter",
  食人族: "cannibal",
  罂粟种植者: "poppy_grower",
  杂耍艺人: "juggler",
  管家: "butler",
  狂热者: "zealot",
  公主: "princess",
  炼金术士: "alchemist",
  间谍: "spy",
  寡妇: "widow",
  亡魂: "wraith",
  召唤师: "summoner",
  街头风琴手: "organ_grinder",
  主谋: "mastermind",
  哈迪寂亚: "hadesia",
  卡扎力: "kazali",
  异端分子: "heretic",
  男爵: "baron",
  痢蛭: "lleech",
  麻脸巫婆: "pit_hag",
  军团: "legion",
  工程师: "engineer",
  帽匠: "hatter",
  政客: "politician",
  利维坦: "leviathan",
  驱魔人: "exorcist",
  旅店老板: "innkeeper",
  镇长: "mayor",
  僧侣: "monk",
  士兵: "soldier",
  小怪宝: "lil_monsta",
  精神病患者: "psychopath",
  红唇女郎: "scarlet_woman",
  维齐尔: "vizier",
  魔术师: "magician",
  气球驾驶员: "balloonist",
  巡山人: "huntsman",
  亡骨魔: "vigormortis",
  科学怪人: "frankenstein",
  报丧女妖: "banshee",
  陌客: "outsider",
  贤者: "sage",
  暴乱: "riot",
  祖母: "grandmother",
  方古: "fang_gu",
  钟表匠: "clockmaker",
  侍臣: "courtier",
  传教士: "preacher",
  普卡: "pukka",
  堤丰之首: "lord_of_typhon",
  僵怖: "zombuul",
  牙噶巴卜: "yaggababble",
  涡流: "vortox",
  "诺-达": "no_dashii",
  珀: "po",
  沙巴洛斯: "shabaloth",
  小恶魔: "imp",
  教父: "godfather",
  魔鬼代言人: "devils_advocate",
  刺客: "assassin",
  女巫: "witch",
  洗脑师: "cerenovus",
  恐惧之灵: "fearmonger",
  鹰身女妖: "harpy",
  灵言师: "mezepheles",
  狐媚娘: "fox_spirit",
  投毒者: "poisoner",
  镜像双子: "evil_twin",
  哥布林: "goblin",
  戏法师: "jester",
  调查员: "investigator",
  无神论者: "atheist",
  国王: "king",
  守鸦人: "ravenkeeper",
  农夫: "farmer",
  教授: "professor",
  送葬者: "undertaker",
  占卜师: "fortune_teller",
  共情者: "empath",
  厨师: "chef",
  图书管理员: "librarian",
  洗衣妇: "washerwoman",
  筑梦师: "dreamer",
  弄蛇人: "snake_charmer",
  卖花女孩: "flowergirl",
  城镇公告员: "town_crier",
  神谕者: "oracle",
  博学者: "savant",
  女裁缝: "seamstress",
  艺人: "artist",
  哲人: "sage",
  变种人: "mutant",
  心上人: "sweetheart",
  理发师: "barber",
  笨蛋: "klutz",
  隐士: "recluse",
  圣徒: "saint",
  贞洁者: "virgin",
  猎手: "slayer",
  水手: "sailor",
  造谣者: "gossip",
  赌徒: "gambler",
  吟游诗人: "minstrel",
  茶女: "tea_lady",
  和平主义者: "pacifist",
  愚人: "fool",
  暴徒: "goon",
  修补匠: "tinker",
  月之子: "moonchild",
  异教领袖: "cult_leader",
  食人魔: "ogre",
  女祭司: "high_priestess",
  修行者: "shugenja",
  钦天监: "astronomer",
  将军: "general",
  方士: "diviner",
  引路人: "guide",
  戏子: "actor",
  悟道者: "enlightened",
  赶尸人: "corpse_driver",
  养蛊人: "worm_breeder",
  半仙: "demi_immortal",
  打更人: "night_watchman",
  和尚: "monk",
  梼杌: "taowu",
  姑获鸟: "cuckoo_bird",
  书生: "scholar",
  阴阳师: "yin_yang_master",
  郎中: "doctor",
  店小二: "inn_attendant",
  村夫: "villager",
  守夜人: "nightwatchman",
  唱诗男孩: "choirboy",
  瘟疫医生: "plague_doctor",
  炸弹人: "bomber",
  落难少女: "damsel",
  告密者: "snitch",
  气球驾驶员: "balloonist",
  巡山人: "huntsman",
  提刑官: "executioner",
  史官: "historian",
  知府: "prefect",
  掮客: "broker",
  使节: "envoy",
  半兽人: "lycanthrope",
  道士: "taoist",
  混沌: "chaos",
  穷奇: "qiongqi",
  饕餮: "taotie",
  暴君: "tyrant",
  鸩: "zhen",
  歌伶: "singer",
  煞星: "jinx_star",
  秉笔: "scribe",
  画皮: "skin_painter",
  水手: "sailor",
  限: "xaan",
};

// 辅助函数：将中文角色名转换为英文ID
function convertRoleName(chineseName) {
  // 移除可能的前后空格和特殊字符
  const cleanName = chineseName.trim();

  // 如果映射表中存在，返回映射值
  if (roleNameMap[cleanName]) {
    return roleNameMap[cleanName];
  }

  // 否则尝试生成一个合理的ID
  return cleanName
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]/g, "_")
    .replace(/\s+/g, "_");
}

// 解析相克规则
for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();

  // 跳过空行和注释
  if (
    !line ||
    line.startsWith("相克规则") ||
    line.startsWith("本页面") ||
    line.startsWith("相关说明") ||
    line.startsWith("如果说书人") ||
    line.startsWith("对于所有") ||
    line.startsWith("诸如麻脸巫婆") ||
    line.startsWith("2025年") ||
    line.startsWith("此次相克规则") ||
    line.startsWith("暂时没有相克规则") ||
    line.startsWith("与华灯初上系列角色相关的相克规则") ||
    line.startsWith("（注：") ||
    line.startsWith("锛堟敞锛") ||
    line.includes("参考") ||
    line.includes("建议") ||
    line.includes("进阶可选规则")
  ) {
    continue;
  }

  // 检测相克规则行（包含"与"字和"："）
  if (line.includes("与") && (line.includes("：") || line.includes(":"))) {
    // 分割角色和描述
    const separator = line.includes("：") ? "：" : ":";
    const [charactersPart, descriptionPart] = line.split(separator);

    // 分割两个角色
    const [chineseChar1, chineseChar2] = charactersPart.split("与");

    if (!chineseChar1 || !chineseChar2) {
      continue;
    }

    const char1 = convertRoleName(chineseChar1.trim());
    const char2 = convertRoleName(chineseChar2.trim());

    // 跳过"相克暂时移除"的规则
    const description = descriptionPart ? descriptionPart.trim() : "";
    if (description.includes("相克暂时移除") || description.includes("移除")) {
      continue;
    }

    // 生成ID
    const id = `${char1}_${char2}`;

    // 添加到相克规则列表
    jinxes.push({
      id,
      character1: char1,
      character2: char2,
      description,
    });
  }
}

// 读取现有的jinxes.json
const existingJinxesPath = path.join(
  __dirname,
  "..",
  "src",
  "data",
  "jinxes.json"
);
let existingJinxes = [];
try {
  const existingContent = fs.readFileSync(existingJinxesPath, "utf-8");
  existingJinxes = JSON.parse(existingContent);
} catch (error) {
  console.log("无法读取现有的jinxes.json文件，将创建新的");
}

// 过滤掉有问题的现有规则（ID包含大量下划线的）
const validExistingJinxes = existingJinxes.filter(
  (jinx) => !jinx.id.includes("_______") && jinx.id.length > 3
);

// 合并相克规则，避免重复
const mergedJinxes = [...validExistingJinxes];
const existingIds = new Set(validExistingJinxes.map((j) => j.id));

for (const jinx of jinxes) {
  if (
    !existingIds.has(jinx.id) &&
    jinx.description &&
    jinx.description.length > 5
  ) {
    mergedJinxes.push(jinx);
    existingIds.add(jinx.id);
  }
}

// 按ID排序
mergedJinxes.sort((a, b) => a.id.localeCompare(b.id));

// 保存到jinxes.json
fs.writeFileSync(
  existingJinxesPath,
  JSON.stringify(mergedJinxes, null, 2),
  "utf-8"
);

console.log(`成功提取了 ${jinxes.length} 条相克规则`);
console.log(`有效现有相克规则总数：${validExistingJinxes.length}`);
console.log(`合并后相克规则总数：${mergedJinxes.length}`);
console.log(
  `新增相克规则：${mergedJinxes.length - validExistingJinxes.length}`
);

// 输出一些示例
console.log("\n示例相克规则：");
for (let i = 0; i < Math.min(10, mergedJinxes.length); i++) {
  const jinx = mergedJinxes[i];
  console.log(`${jinx.id}: ${jinx.character1} 与 ${jinx.character2}`);
  console.log(
    `  描述: ${jinx.description.substring(0, 80)}${jinx.description.length > 80 ? "..." : ""}`
  );
  console.log("");
}

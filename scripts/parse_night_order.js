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

const currentSection = null;
let currentNightType = null;

// 角色名称映射表（中文到英文ID）
const roleNameMap = {
  堤丰之首: "lord_of_typhon",
  亡魂: "wraith",
  科学怪人: "frankenstein",
  失忆者: "amnesiac",
  哲学家: "philosopher",
  炼金术士: "alchemist",
  罂粟种植者: "poppy_grower",
  卡扎力: "kazali",
  魔术师: "magician",
  告密者: "snitch",
  落难少女: "damsel",
  召唤师: "summoner",
  疯子: "lunatic",
  梼杌: "taowu",
  国王: "king",
  提线木偶: "marionette",
  书生: "scholar",
  戏子: "actor",
  掮客: "broker",
  水手: "sailor",
  工程师: "engineer",
  传教士: "preacher",
  小怪宝: "lil_monsta",
  痢蛭: "lleech",
  画皮: "skin_painter",
  限: "xaan",
  投毒者: "poisoner",
  寡妇: "widow",
  侍臣: "courtier",
  巫师: "wizard",
  舞蛇人: "snake_charmer",
  教父: "godfather",
  街头风琴手: "organ_grinder",
  魔鬼代言人: "devils_advocate",
  镜像双子: "evil_twin",
  女巫: "witch",
  洗脑师: "cerenovus",
  恐惧之灵: "fearmonger",
  鹰身女妖: "harpy",
  灵言师: "mezepheles",
  狐媚娘: "fox_spirit",
  普卡: "pukka",
  牙噶巴卜: "yaggababble",
  酿酒师: "brewer",
  俑匠: "terracotta_artisan",
  熊孩子: "naughty_child",
  小精灵: "pixie",
  巡山人: "huntsman",
  洗衣妇: "washerwoman",
  图书管理员: "librarian",
  调查员: "investigator",
  厨师: "chef",
  共情者: "empath",
  占卜师: "fortune_teller",
  管家: "butler",
  逆臣: "traitorous_minister",
  祖母: "grandmother",
  钟表匠: "clockmaker",
  筑梦师: "dreamer",
  女裁缝: "seamstress",
  事务官: "steward",
  骑士: "knight",
  贵族: "noble",
  气球驾驶员: "balloonist",
  阴阳师: "yin_yang_master",
  郎中: "doctor",
  店小二: "inn_attendant",
  村夫: "villager",
  赏金猎人: "bounty_hunter",
  守夜人: "nightwatchman",
  异教领袖: "cult_leader",
  间谍: "spy",
  食人魔: "ogre",
  女祭司: "high_priestess",
  修行者: "shugenja",
  钦天监: "astronomer",
  将军: "general",
  方士: "diviner",
  侍女: "chambermaid",
  引路人: "guide",
  数学家: "mathematician",
  利维坦: "leviathan",
  维齐尔: "vizier",
  黄昏: "dusk",
  黎明: "dawn",
  帽匠: "hatter",
  麻脸巫婆: "pit_hag",
  旅店老板: "innkeeper",
  打更人: "night_watchman",
  锦衣卫: "imperial_guard",
  狸猫: "raccoon_dog",
  巡察: "inspector",
  赌徒: "gambler",
  杂技演员: "acrobat",
  僧侣: "monk",
  入殓师: "mortician",
  红唇女郎: "scarlet_woman",
  驱魔人: "exorcist",
  道士: "taoist",
  半兽人: "lycanthrope",
  公主: "princess",
  军团: "legion",
  小恶魔: "imp",
  僵怖: "zombuul",
  沙巴洛斯: "shabaloth",
  珀: "po",
  方古: "fang_gu",
  "诺-达鲺": "no_dashii",
  涡流: "vortox",
  亡骨魔: "vigormortis",
  奥赫: "ojo",
  哈迪寂亚: "hadesia",
  混沌: "chaos",
  穷奇: "qiongqi",
  饕餮: "taotie",
  暴君: "tyrant",
  姑获鸟: "cuckoo_bird",
  刺客: "assassin",
  养蛊人: "worm_breeder",
  歌伶: "singer",
  鸩: "zhen",
  造谣者: "gossip",
  修补匠: "tinker",
  月之子: "moonchild",
  煞星: "jinx_star",
  理发师: "barber",
  心上人: "sweetheart",
  守鸦人: "ravenkeeper",
  贤者: "sage",
  秉笔: "scribe",
  瘟疫医生: "plague_doctor",
  唱诗男孩: "choirboy",
  农夫: "farmer",
  报丧女妖: "banshee",
  教授: "professor",
  送葬者: "undertaker",
  提刑官: "executioner",
  卖花女孩: "flowergirl",
  城镇公告员: "town_crier",
  神谕者: "oracle",
  杂耍艺人: "juggler",
  史官: "historian",
  知府: "prefect",
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
    line.startsWith("Dusk") ||
    line.startsWith("黎明") ||
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

  // 检测角色行动行（包含角色名和英文名）
  const roleMatch = line.match(/^([\u4e00-\u9fa5]+)\s+([A-Za-z]+)/);
  if (roleMatch && currentNightType) {
    const chineseName = roleMatch[1];
    const englishName = roleMatch[2].toLowerCase();
    const roleId = convertRoleName(chineseName);

    // 提取描述（行中英文名之后的部分）
    const descriptionStart = line.indexOf(englishName) + englishName.length;
    let description = line.substring(descriptionStart).trim();

    // 如果描述为空，尝试获取下一行作为描述
    if (!description && i + 1 < lines.length) {
      const nextLine = lines[i + 1].trim();
      if (nextLine && !nextLine.match(/^([\u4e00-\u9fa5]+)\s+([A-Za-z]+)/)) {
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

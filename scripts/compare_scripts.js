const fs = require("node:fs");
const path = require("node:path");

// 角色名称到ID的映射
const nameToId = {
  // 暗流涌动
  洗衣妇: "washerwoman",
  图书管理员: "librarian",
  调查员: "investigator",
  厨师: "chef",
  共情者: "empath",
  占卜师: "fortune_teller",
  送葬者: "undertaker",
  僧侣: "monk",
  守鸦人: "ravenkeeper",
  贞洁者: "virgin",
  猎手: "slayer",
  士兵: "soldier",
  镇长: "mayor",
  管家: "butler",
  酒鬼: "drunk",
  陌客: "recluse",
  圣徒: "saint",
  投毒者: "poisoner",
  间谍: "spy",
  红唇女郎: "scarlet_woman",
  男爵: "baron",
  小恶魔: "imp",

  // 黯月初升
  祖母: "grandmother",
  水手: "sailor",
  侍女: "chambermaid",
  驱魔人: "exorcist",
  旅店老板: "innkeeper",
  赌徒: "gambler",
  造谣者: "gossip",
  侍臣: "courtier",
  教授: "professor",
  吟游诗人: "minstrel",
  茶艺师: "tea_lady",
  和平主义者: "pacifist",
  弄臣: "fool",
  修补匠: "tinker",
  月之子: "moonchild",
  莽夫: "goon",
  疯子: "lunatic",
  教父: "godfather",
  魔鬼代言人: "devils_advocate",
  刺客: "assassin",
  主谋: "mastermind",
  僵怖: "zombuul",
  普卡: "pukka",
  沙巴洛斯: "shabaloth",
  珀: "po",

  // 梦殒春宵
  钟表匠: "clockmaker",
  筑梦师: "dreamer",
  舞蛇人: "snake_charmer",
  数学家: "mathematician",
  卖花女孩: "flowergirl",
  城镇公告员: "town_crier",
  神谕者: "oracle",
  博学者: "savant",
  女裁缝: "seamstress",
  哲学家: "philosopher",
  艺术家: "artist",
  杂耍艺人: "juggler",
  贤者: "sage",
  畸形秀演员: "mutant",
  心上人: "sweetheart",
  理发师: "barber",
  呆瓜: "klutz",
  镜像双子: "evil_twin",
  女巫: "witch",
  洗脑师: "cerenovus",
  麻脸巫婆: "pit_hag",
  方古: "fang_gu",
  亡骨魔: "vigormortis",
  "诺-达鲺": "no_dashii",
  涡流: "vortox",

  // 其他角色
  气球驾驶员: "balloonist",
  巡山人: "ranger",
  农夫: "farmer",
  罂粟种植者: "poppy_grower",
  无神论者: "atheist",
  食人族: "cannibal",
  落难少女: "damsel",
  魔像: "golem",
  精神病患者: "psychopath",
  灵言师: "shaman",
  哈迪寂亚: "hadesia",
  贵族: "noble",
  失意者: "amnesiac",
  工程师: "engineer",
  渔夫: "fisherman",
  告密者: "snitch",
  哥布林: "goblin",
  提线木偶: "puppet",
  炸弹人: "boomdandy",
  利维坦: "leviathan",
  黑手党: "mafia",
  歌手: "singer",
  国王: "king",
  将军: "general",
  赏金猎人: "bounty_hunter",
  守夜人: "nightwatchman",
  小精灵: "pixie",
  异教领袖: "heretic",
  流亡者: "exile",
  乞丐: "beggar",
  法官: "judge",
  巫医: "witch_doctor",
  枪手: "gunslinger",
  官员: "official",
  小偷: "thief",
  提琴手: "violinist",
  骨相师: "bone_reader",
  朝圣者: "pilgrim",
  魔术师: "magician",
  走私犯: "smuggler",
  先知: "prophet",
  唱诗男孩: "choir_boy",
  侍僧: "acolyte",
  学者: "savant",
  下毒者: "poisoner",
  媚魔: "succubus",
  尸偶: "cadaver",
  腐化邪神: "corruptor",
  沙布拉尔: "shabaloth",
  渡鸦守护者: "ravenkeeper",
  猩红女士: "scarlet_woman",
  僵尸: "zombuul",
  噬魂怪: "soul_eater",
  政客: "politician",
  疫医: "plague_doctor",
  "诺-达希": "no_dashii",
  博格特: "boggart",
  公告员: "town_crier",
  神官: "priest",
};

// 读取所有剧本
const playDir = path.join(__dirname, "../json/play");
const files = fs.readdirSync(playDir).filter((f) => f.endsWith(".json"));

console.log("=== 剧本对比分析 ===\n");

const scripts = [];

files.forEach((file) => {
  const filePath = path.join(playDir, file);
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

  console.log(`📜 ${data.剧本名称}`);

  // 转换角色列表
  const roleIds = [];
  const missingRoles = [];

  const categories = data.角色列表;
  Object.values(categories).forEach((roles) => {
    roles.forEach((roleName) => {
      const id = nameToId[roleName];
      if (id) {
        if (!roleIds.includes(id)) {
          roleIds.push(id);
        }
      } else {
        if (!missingRoles.includes(roleName)) {
          missingRoles.push(roleName);
        }
      }
    });
  });

  if (missingRoles.length > 0) {
    console.log(`  ⚠️  缺失映射的角色: ${missingRoles.join(", ")}`);
  }

  scripts.push({
    id: data.id,
    name: data.剧本名称,
    difficulty: data.难度,
    description: data.简要介绍?.substring(0, 100) || "",
    roleIds,
  });

  console.log(`  ✅ 转换完成，共 ${roleIds.length} 个角色\n`);
});

console.log("\n=== 生成的剧本配置 ===\n");
console.log(JSON.stringify(scripts, null, 2));

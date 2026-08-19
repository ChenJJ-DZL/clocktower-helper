/**
 * 从 Wiki JSON 生成正确的夜晚顺序数据
 * 输出: 首夜/其他夜晚的角色 ID → 顺序号映射
 */
const fs = require("fs");
const path = require("path");
const BASE = path.join(__dirname, "..");

// Wiki 中文名 → 本地 ID 映射
const NAME_TO_ID = {
  "洗衣妇": "washerwoman", "图书管理员": "librarian", "调查员": "investigator",
  "厨师": "chef", "共情者": "empath", "占卜师": "fortune_teller",
  "送葬者": "undertaker", "僧侣": "monk", "守鸦人": "ravenkeeper",
  "贞洁者": "virgin", "猎手": "slayer", "士兵": "soldier", "镇长": "mayor",
  "管家": "butler", "酒鬼": "drunk", "陌客": "recluse", "圣徒": "saint",
  "投毒者": "poisoner", "间谍": "spy", "红唇女郎": "scarlet_woman",
  "男爵": "baron", "小恶魔": "imp", "祖母": "grandmother", "水手": "sailor",
  "侍女": "chambermaid", "驱魔人": "exorcist", "旅店老板": "innkeeper",
  "赌徒": "gambler", "造谣者": "gossip", "朝臣": "courtier",
  "教授": "professor", "吟游诗人": "minstrel", "茶女": "tea_lady",
  "茶艺师": "tea_lady", "和平主义者": "pacifist", "弄臣": "fool",
  "修补匠": "tinker", "月之子": "moonchild", "暴徒": "goon",
  "疯子": "lunatic", "教父": "godfather", "魔鬼代言人": "devils_advocate",
  "刺客": "assassin", "智者": "mastermind", "僵怖": "zombuul",
  "普卡": "pukka", "沙巴洛斯": "shabaloth", "珀": "po",
  "钟表匠": "clockmaker", "筑梦师": "dreamer", "弄蛇人": "snake_charmer",
  "舞蛇人": "snake_charmer", "数学家": "mathematician", "花艺师": "flowergirl",
  "卖花女孩": "flowergirl", "城镇公告员": "town_crier", "神谕者": "oracle",
  "博学者": "savant", "女裁缝": "seamstress", "裁缝": "seamstress",
  "哲学家": "philosopher", "艺术家": "artist", "杂耍师": "juggler",
  "贤者": "sage", "变种人": "mutant", "心上人": "sweetheart",
  "甜心": "sweetheart", "理发师": "barber", "笨蛋": "klutz",
  "呆瓜": "klutz", "邪恶双子": "evil_twin", "镜像双子": "evil_twin",
  "女巫": "witch", "洗脑师": "cerenovus", "麻脸巫婆": "pit_hag",
  "方古": "fang_gu", "亡骨魔": "vigormortis", "诺-达": "no_dashii",
  "涡流": "vortox", "贵族": "noble", "赏金猎人": "bounty_hunter",
  "守夜人": "night_watchman", "异教领袖": "cult_leader",
  "气球驾驶员": "balloonist", "骑士": "knight", "猎人": "huntsman",
  "巡山人": "huntsman", "失忆者": "amnesiac", "小精灵": "pixie",
  "寡妇": "widow", "恐惧之灵": "fearmonger", "恐惧散布者": "fearmonger",
  "精神病患者": "psychopath", "哥布林": "goblin", "爆炸矮人": "boomdandy",
  "炸弹人": "boomdandy", "维齐尔": "vizier", "暴动": "riot",
  "利维坦": "leviathan", "小怪兽": "lil_monsta", "小怪宝": "lil_monsta",
  "告密者": "snitch", "落难少女": "damsel", "畸形秀演员": "mutant",
  "科学怪人": "boffin", "酒鬼": "drunk", "莽夫": "goon",
  "解谜大师": "puzzlemaster", "罂粟种植者": "poppy_grower",
  "杂技演员": "acrobat", "半兽人": "lycanthrope", "渔夫": "fisherman",
  "修验者": "shugenja", "圣洁之魂": "spirit_of_ivory",
  "哨兵": "sentinel", "灯神": "djinn", "摆渡人": "ferryman",
  "末日预言者": "doomsayer", "玩具匠": "toymaker", "天使": "angel",
  "佛教徒": "buddhist", "革命者": "revolutionary", "地狱藏书员": "hells_librarian",
  "小提琴手": "fiddler", "骗人精": "fibbin", "公爵夫人": "duchess",
  "失败的上帝": "godfather", // fallback
  "魔像": "golem", "瘟疫医生": "plague_doctor", "隐士": "hermit",
  "堤丰之首": "lord_of_typhon", "哈迪寂亚": "lleech", "痢蛭": "lleech",
  "牙噶巴卜": "yaggababble", "召唤师": "summoner", "国王": "king",
  "提线木偶": "marionette", "麻脸巫婆": "pit_hag", "女祭司": "high_priestess",
  "戏法师": "alsaahir", "村夫": "village_idiot",
};

function loadJson(file) {
  try { return JSON.parse(fs.readFileSync(path.join(BASE, file), "utf-8")); } catch { return []; }
}

// 从 Wiki JSON 提取夜晚顺序
function extractNightOrders(categoryFile) {
  const roles = loadJson(`json/full/${categoryFile}.json`);
  const orders = [];
  for (const r of roles) {
    const name = r["名称"] || r.名称 || "";
    const engName = r["英文名"] || r.英文名 || "";
    const wikiId = name;
    
    // 尝试匹配本地 ID
    let localId = NAME_TO_ID[name];
    if (!localId) {
      // 尝试用英文名匹配
      localId = engName.toLowerCase().replace(/[\s_-]+/g, "_");
    }
    
    const fnRaw = r["首夜行动顺序"];
    const onRaw = r["其他夜晚行动顺序"];
    const fn = fnRaw && fnRaw !== "无法行动" ? parseInt(fnRaw, 10) : null;
    const on = onRaw && onRaw !== "无法行动" ? parseInt(onRaw, 10) : null;
    
    orders.push({ name, localId, firstNight: fn, otherNight: on, engName });
  }
  return orders;
}

const categories = ["镇民", "外来者", "爪牙", "恶魔"];
const allOrders = [];
for (const cat of categories) {
  allOrders.push(...extractNightOrders(cat));
}

// 输出为 JSON 格式
const output = allOrders
  .filter(r => r.localId && (r.firstNight !== null || r.otherNight !== null))
  .map(r => ({
    id: r.localId,
    name: r.name,
    firstNightOrder: r.firstNight,
    otherNightOrder: r.otherNight,
  }));

const outFile = path.join(BASE, "screenshots", "wiki_night_orders.json");
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(output, null, 2), "utf-8");
console.log(`Generated ${output.length} night order entries → ${outFile}`);

// 输出前10个作为预览
for (const r of output.slice(0, 20)) {
  console.log(`  ${r.id}: FN=${r.firstNightOrder ?? "-"} ON=${r.otherNightOrder ?? "-"}`);
}

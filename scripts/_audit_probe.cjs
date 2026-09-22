/* 只读审计探针：核验若干「待修点」当前是否成立。不修改任何生产文件。 */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const out = [];
const P = (s) => out.push(s);

// ── 1. scapegoat 是否在 officialRoleDocs.json 里**有独立条目**（而非只在别人范例里被提及）
const docs = JSON.parse(read("src/data/officialRoleDocs.json"));
const hasOwnScapegoat = Object.prototype.hasOwnProperty.call(docs, "替罪羊");
P(`[1] officialRoleDocs 有独立「替罪羊」顶层键 = ${hasOwnScapegoat}`);
P(`    officialRoleDocs 顶层键总数 = ${Object.keys(docs).length}`);

// ── 2. 32 角色官方中文名是否都有独立条目
const NAMES = {
  chambermaid: "侍女", gossip: "造谣者", oracle: "神谕者", mathematician: "数学家",
  artist: "艺术家", flowergirl: "卖花女孩", innkeeper: "旅店老板", fool: "傻瓜",
  saint: "圣徒", recluse: "陌客", politician: "政客", spy: "间谍",
  witch: "女巫", assassin: "刺客", devils_advocate: "魔鬼代言人", vortox: "涡流",
  po: "珀", zombuul: "僵怖", plague_doctor: "瘟疫医生", undertaker: "送葬者",
  gambler: "赌徒", savant: "博学者", juggler: "杂耍艺人", clockmaker: "钟表匠",
  sailor: "水手", farmer: "农夫", scapegoat: "替罪羊", drunk: "酒鬼",
  mutant: "畸形秀演员", baron: "男爵", poisoner: "投毒者", shabaloth: "沙巴洛斯",
};
const missing = Object.entries(NAMES).filter(([, n]) => !docs[n]).map(([id, n]) => `${id}(${n})`);
P(`[2] 32 角色中「官方名无独立条目」的 = ${missing.length ? missing.join(", ") : "无"}`);

// ── 3. app/data.ts 里 32 角色的 id/type 真值（仅用于交叉核对，不作为测试真值）
const data = read("app/data.ts");
const idType = {};
const re = /id:\s*"([a-z_]+)"[^}]*?type:\s*"([a-z_]+)"/gs;
let m;
while ((m = re.exec(data))) idType[m[1]] = m[2];
P(`[3] app/data.ts 解析到的 id→type 对数 = ${Object.keys(idType).length}`);
const missData = Object.keys(NAMES).filter((k) => !idType[k]);
P(`    app/data.ts 里找不到 id 的 = ${missData.length ? missData.join(", ") : "无"}`);

// ── 4. saint 的注册 roleId vs app/data 的 id
const saintAb = read("src/roles/new_engine/saint.ability.ts");
const saintReg = (saintAb.match(/roleId:\s*"([^"]+)"/) || [])[1];
P(`[4] saint.ability.ts 注册 roleId = ${saintReg} ; app/data.ts id = ${idType.saint}`);
const reg = read("src/roles/new_engine/abilityRegistry.ts");
const aliasHits = [...reg.matchAll(/saint[^,\n]*/g)].map((x) => x[0].trim()).slice(0, 12);
P(`    abilityRegistry 里含 saint 的行片段 = ${JSON.stringify(aliasHits)}`);

// ── 5. 7 个「不消费 abilityEffective」的角色确认
for (const r of ["zombuul", "shabaloth", "witch", "gambler", "sailor", "gossip"]) {
  const f = `src/roles/new_engine/${r}.ability.ts`;
  if (!fs.existsSync(path.join(ROOT, f))) { P(`[5] ${r}: 文件不存在`); continue; }
  const s = read(f);
  P(`[5] ${r}: abilityEffective 出现 ${(s.match(/abilityEffective/g) || []).length} 次, abilityResult ${(s.match(/abilityResult/g) || []).length} 次`);
}

// ── 6. targetConfig / queue 声明（gossip / assassin / gambler）
for (const r of ["gossip", "assassin", "gambler", "po"]) {
  const f = `src/roles/new_engine/${r}.ability.ts`;
  if (!fs.existsSync(path.join(ROOT, f))) { P(`[6] ${r}: 文件不存在`); continue; }
  const s = read(f);
  const tc = s.match(/targetConfig\s*:\s*\{[\s\S]{0,220}?\}/);
  P(`[6] ${r} targetConfig ≈ ${tc ? tc[0].replace(/\s+/g, " ").slice(0, 200) : "(未找到)"}`);
}

// ── 7. gambler legacy day 块
const gLegacy = read("src/roles/townsfolk/gambler.ts");
P(`[7] townsfolk/gambler.ts 有 day 块 = ${/^\s*day:\s*\{/m.test(gLegacy)}`);

fs.writeFileSync(path.join(ROOT, "temp/_audit_probe.txt"), out.join("\n"), "utf8");
console.log(out.join("\n"));

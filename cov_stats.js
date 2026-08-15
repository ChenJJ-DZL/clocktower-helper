// 统计 8 剧本跨局角色累计覆盖（按剧本单独映射，避免跨剧本别名污染）
const fs = require("fs");
const path = require("path");

const scriptIdMap = {
  trouble_brewing: "暗流涌动",
  bad_moon_rising: "黯月初升",
  sects_and_violets: "梦殒春宵",
  whispering_secrets: "窃窃私语",
  tomb_of_the_unknown: "无名之墓",
  high_pleasure: "无上愉悦",
  haunted_manor: "凶宅魅影",
  garden_of_dreams: "游园惊梦",
};

const sd = JSON.parse(
  fs.readFileSync(path.join(__dirname, "test_automation", "scripts_data.json"), "utf8")
);

// 每剧本：name → id 映射 + 池子
const perScriptCfg = {};
for (const [sid, s] of Object.entries(sd.scripts || sd)) {
  if (!s || !s.roles) continue;
  const name2id = {};
  for (const r of s.roles) name2id[r.name] = r.id;
  perScriptCfg[sid] = {
    pool: s.roles.map((r) => r.id),
    name2id,
  };
}

// 收集所有日志
const logs = [];
for (const d of [
  path.join(__dirname, "screenshots"),
  path.join(__dirname, "..", "screenshots"),
]) {
  if (!fs.existsSync(d)) continue;
  for (const sub of fs.readdirSync(d)) {
    const f = path.join(d, sub, "test_log.txt");
    if (fs.existsSync(f)) logs.push(f);
  }
}

const appear = {};
for (const sid of Object.keys(perScriptCfg))
  appear[sid] = { games: 0, roles: new Set() };

for (const f of logs) {
  const c = fs.readFileSync(f, "utf8");
  const sidM = c.match(/剧本: \S+ \(([a-z_]+)\)/);
  if (!sidM || !appear[sidM[1]]) continue;
  const sid = sidM[1];
  const cfg = perScriptCfg[sid];
  const rosters = c.match(/🎲 阵容\(\d+人\): ([^\n]+)/g) || [];
  for (const r of rosters) {
    appear[sid].games++;
    const line = r.replace(/🎲 阵容\(\d+人\): /, "");
    for (const part of line.split("、")) {
      const name = part.trim().replace(/\([a-z_]+\)$/, "");
      const rid = cfg.name2id[name];
      if (rid) appear[sid].roles.add(rid);
    }
  }
}

console.log("剧本\t累计局数\t覆盖\t缺失角色");
for (const [sid, info] of Object.entries(appear)) {
  if (!scriptIdMap[sid]) continue;
  const cfg = perScriptCfg[sid];
  const missing = cfg.pool.filter((r) => !info.roles.has(r));
  const missingNames = missing
    .map((r) => Object.entries(cfg.name2id).find(([, id]) => id === r)?.[0] || r)
    .join("、");
  console.log(
    `${scriptIdMap[sid]}\t${info.games}\t${info.roles.size}/${cfg.pool.length}\t${missingNames || "（全部出场）"}`
  );
}

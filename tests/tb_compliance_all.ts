/**
 * 全剧本深度合规检测
 * 覆盖所有剧本，完整对局（首夜→胜利），基于 json/ 规则
 */
import * as fs from "fs";
import { HeadlessGameEngine } from "./headlessGameEngine";

const origLog = console.log;
console.log = () => {};

// Load all JSON rules
interface Rule {
  name: string; type: string; firstNightOrder: number | null; otherNightOrder: number | null;
  ability: string; operation: string;
}
const rules = new Map<string, Rule>();
for (const [file, type] of Object.entries({ "镇民.json":"townsfolk","外来者.json":"outsider","爪牙.json":"minion","恶魔.json":"demon" })) {
  for (const c of JSON.parse(fs.readFileSync("json/full/" + file, "utf8"))) {
    const eng = (c["英文名"]||"").toLowerCase().replace(/[^a-z]/g,"");
    if (eng) rules.set(eng, {
      name: c["名称"], type,
      firstNightOrder: c["首夜行动顺序"]==="无法行动"?null:parseInt(c["首夜行动顺序"]),
      otherNightOrder: c["其他夜晚行动顺序"]==="无法行动"?null:parseInt(c["其他夜晚行动顺序"]),
      ability: (c.content?.["角色能力"]||"").trim(),
      operation: (c.content?.["运作方式"]||"").trim(),
    });
  }
}
function findRule(id: string) { return rules.get(id.toLowerCase().replace(/[^a-z]/g,"")) || rules.get(id); }

// Script configs
const SCRIPTS = [
  { id: "暗流涌动", name: "Trouble Brewing" },
  { id: "黯月初升", name: "Bad Moon Rising" },
  { id: "梦陨春宵", name: "Sects & Violets" },
];

interface Violation { script: string; game: number; cat: string; detail: string; }
const violations: Violation[] = [];
const GAMES_PER_SCRIPT = 10;

function addV(script: string, game: number, cat: string, detail: string) {
  violations.push({ script, game, cat, detail });
}

async function checkGame(script: typeof SCRIPTS[0], gameIdx: number) {
  const eng = new HeadlessGameEngine({ id: script.id, name: script.name }, 10 + Math.floor(Math.random() * 4));
  const report = await eng.runGame();

  if (report.crashed) {
    addV(script.name, gameIdx, "崩溃", report.crashMessage || "未知");
    return;
  }
  for (const e of report.errors) addV(script.name, gameIdx, "错误", e);

  // A. Night order check per round
  for (let round = 1; round <= report.totalRounds; round++) {
    const nt = report.triggers.filter(t => t.timing === "night" && t.round === round);
    const isFirst = round === 1;
    for (let i = 1; i < nt.length; i++) {
      const pr = findRule(nt[i-1].roleId), cr = findRule(nt[i].roleId);
      if (pr && cr) {
        const pOrd = isFirst ? pr.firstNightOrder : pr.otherNightOrder;
        const cOrd = isFirst ? cr.firstNightOrder : cr.otherNightOrder;
        if (pOrd !== null && cOrd !== null && pOrd > cOrd) {
          addV(script.name, gameIdx, "顺序",
            `R${round}${isFirst?"首":"其他"}夜: ${pr.name}#${pOrd}→${cr.name}#${cOrd} (顺序颠倒)`);
        }
      }
    }
  }

  // B. Wake eligibility
  for (const t of report.triggers) {
    if (t.timing !== "night") continue;
    const r = findRule(t.roleId); if (!r) continue;
    if (r.firstNightOrder !== null && r.otherNightOrder === null && t.round > 1)
      addV(script.name, gameIdx, "首夜专属", `${r.name} R${t.round}应仅首夜`);
    if (r.firstNightOrder === null && r.otherNightOrder !== null && t.round === 1)
      addV(script.name, gameIdx, "非首夜", `${r.name} 首夜不应唤醒`);
    if (r.firstNightOrder === null && r.otherNightOrder === null)
      addV(script.name, gameIdx, "无夜晚", `${r.name} 不应有夜晚行动`);
  }

  // C. Special role checks
  if (report.triggers.filter(t => t.roleId==="imp" && t.timing==="night" && t.round===1).length > 0)
    addV(script.name, gameIdx, "角色行为", "小恶魔首夜不应行动");
  if (report.triggers.filter(t => t.roleId==="monk" && t.timing==="night" && t.round===1).length > 0)
    addV(script.name, gameIdx, "角色行为", "僧侣首夜不应行动");
  if (report.triggers.filter(t => t.roleId==="undertaker" && t.timing==="night" && t.round===1).length > 0)
    addV(script.name, gameIdx, "角色行为", "送葬者首夜不应行动");

  // D. 占卜师首夜检查
  if (report.seedsRoleIds.includes("fortune_teller")) {
    const ftFn = report.triggers.filter(t => t.roleId==="fortune_teller" && t.timing==="night" && t.round===1);
    if (ftFn.length === 0) addV(script.name, gameIdx, "角色行为", "占卜师首夜未唤醒");
  }

  // E. First-night-only roles should wake exactly on round 1 and never after
  const washerewoman = report.triggers.filter(t => t.roleId==="washerwoman" && t.timing==="night");
  if (washerewoman.length > 1)
    addV(script.name, gameIdx, "角色行为", `洗衣妇唤醒${washerewoman.length}次(应仅1次)`);
  for (const t of washerewoman) {
    if (t.round > 1) addV(script.name, gameIdx, "角色行为", `洗衣妇R${t.round}不应唤醒`);
  }
}

async function runAll() {
  for (const script of SCRIPTS) {
    for (let g = 0; g < GAMES_PER_SCRIPT; g++) {
      await checkGame(script, g);
    }
  }

  console.log = origLog;

  const total = SCRIPTS.length * GAMES_PER_SCRIPT;
  console.log(`\n=== 全剧本合规检测 (${SCRIPTS.length}剧本 × ${GAMES_PER_SCRIPT}局 = ${total}局) ===`);
  console.log(`总违规: ${violations.length}条\n`);

  if (violations.length === 0) {
    console.log("✅ 全部检查通过！无违规。");
  } else {
    const byCat: Record<string, Violation[]> = {};
    for (const v of violations) {
      if (!byCat[v.cat]) byCat[v.cat] = [];
      byCat[v.cat].push(v);
    }
    for (const [cat, items] of Object.entries(byCat)) {
      const byScript: Record<string, number> = {};
      for (const v of items) byScript[v.script] = (byScript[v.script] || 0) + 1;
      const detail = Object.entries(byScript).map(([s,c]) => `${s}(${c})`).join(", ");
      console.log(`## ${cat} (${items.length}项) [${detail}]`);
      const unique = [...new Set(items.map(v => v.detail))];
      unique.slice(0, 15).forEach(d => console.log(`  ❌ ${d}`));
      if (unique.length > 15) console.log(`  ... 共${unique.length}种`);
      console.log();
    }
  }
  process.exit(0);
}

runAll();

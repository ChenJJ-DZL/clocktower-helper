/**
 * 暗流涌动 规则合规性快速检测
 * 输出到文件避免日志干扰
 */

import * as fs from "fs";
import { HeadlessGameEngine, type GameReport, type TriggerRecord } from "./headlessGameEngine";

const origLog = console.log;
console.log = () => {};

// ---------- 加载JSON规则 ----------
interface JsonRoleRule {
  name: string; firstNightOrder: number | null; otherNightOrder: number | null;
}
const rules = new Map<string, JsonRoleRule>();
for (const file of ["镇民.json","外来者.json","爪牙.json","恶魔.json"]) {
  for (const c of JSON.parse(fs.readFileSync("json/full/" + file, "utf8"))) {
    const eng = (c["英文名"]||"").toLowerCase().replace(/[^a-z]/g,"");
    if (eng) rules.set(eng, {
      name: c["名称"],
      firstNightOrder: c["首夜行动顺序"]==="无法行动"?null:parseInt(c["首夜行动顺序"],10),
      otherNightOrder: c["其他夜晚行动顺序"]==="无法行动"?null:parseInt(c["其他夜晚行动顺序"],10),
    });
  }
}

function findRule(roleId: string) { return rules.get(roleId.toLowerCase().replace(/[^a-z]/g,"")) || rules.get(roleId); }

// ---------- 运行测试 ----------
const violations: string[] = [];
const GAMES = 10;

async function runAll() {
for (let g = 0; g < GAMES; g++) {
  const eng = new HeadlessGameEngine({ id: "暗流涌动", name: "Trouble Brewing" }, 10);
  const report = await eng.runGame();

  // 1. 检查夜晚唤醒顺序
  for (let round = 1; round <= report.totalRounds; round++) {
    const nightTriggers = report.triggers.filter(t => t.timing === "night" && t.round === round);
    const isFirst = round === 1;
    
    for (let i = 1; i < nightTriggers.length; i++) {
      const pr = findRule(nightTriggers[i-1].roleId);
      const cr = findRule(nightTriggers[i].roleId);
      if (pr && cr) {
        const pOrd = isFirst ? pr.firstNightOrder : pr.otherNightOrder;
        const cOrd = isFirst ? cr.firstNightOrder : cr.otherNightOrder;
        if (pOrd !== null && cOrd !== null && pOrd > cOrd) {
          violations.push(`[顺序错误] 第${round}轮(${isFirst?"首夜":"其他夜"}): ${pr.name}#${pOrd} 晚于 ${cr.name}#${cOrd}`);
        }
      }
    }
  }

  // 2. 检查仅首夜角色
  for (const t of report.triggers) {
    if (t.timing !== "night") continue;
    const r = findRule(t.roleId);
    if (!r) continue;
    if (r.firstNightOrder !== null && r.otherNightOrder === null && t.round > 1) {
      violations.push(`[首夜专属] ${r.name} 在第${t.round}轮(非首夜)被唤醒`);
    }
    if (r.firstNightOrder === null && r.otherNightOrder !== null && t.round === 1) {
      violations.push(`[非首夜] ${r.name} 在首夜被唤醒(应仅其他夜)`);
    }
    if (r.firstNightOrder === null && r.otherNightOrder === null) {
      violations.push(`[无夜晚] ${r.name} 在夜晚被唤醒(应无夜晚行动)`);
    }
  }

  // 3. 特殊检查
  const impFirstNight = report.triggers.filter(t => t.roleId === "imp" && t.timing === "night" && t.round === 1);
  if (impFirstNight.length > 0) violations.push(`[小恶魔] 首夜被唤醒(应首夜不行动)`);

  const monkFirstNight = report.triggers.filter(t => t.roleId === "monk" && t.timing === "night" && t.round === 1);
  if (monkFirstNight.length > 0) violations.push(`[僧侣] 首夜被唤醒(应仅其他夜)`);

  // 4. 崩溃检查
  if (report.crashed) violations.push(`[崩溃] 游戏${g}: ${report.crashMessage}`);
  for (const e of report.errors) violations.push(`[错误] 游戏${g}: ${e}`);
}

console.log = origLog;

// ---------- 输出报告 ----------
const unique = [...new Set(violations)];
console.log(`\n=== 暗流涌动合规检测 (${GAMES}局, 10人) ===`);
console.log(`总违规: ${violations.length}条, 去重: ${unique.length}条\n`);

if (unique.length === 0) {
  console.log("✅ 所有检查通过！");
} else {
  const byCategory: Record<string, string[]> = {};
  for (const v of unique) {
    const cat = v.match(/^\[([^\]]+)\]/)?.[1] || "其他";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(v);
  }
  for (const [cat, items] of Object.entries(byCategory)) {
    console.log(`## ${cat} (${items.length}项)`);
    for (const item of items) console.log(`  ❌ ${item.replace(/^\[[^\]]+\]\s*/, "")}`);
    console.log();
  }
}

process.exit(0);
}

runAll();

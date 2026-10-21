/**
 * 角色 × E2E 覆盖率审计（可重复执行）
 * ------------------------------------------------------------------
 * 用法：`npx tsx scripts/coverage-audit.ts`
 * 输出：`outputs/coverage_ledger.json` + 控制台摘要
 *
 * 数据来源（都是**已落盘的事实**，不猜）：
 *   · 剧本角色清单 ← `app/data.ts::scripts[].roleIds`
 *   · 角色中文名   ← `src/data/officialRoleDocs.json`
 *   · E2E 实际阵容 ← `temp/terminal_<seed>.json` / `temp/full_sim_<seed>.json` 的 `lineup`
 *
 * 判据（每个 (剧本, 角色) 二元组）：
 *   seen  = 该角色在**该剧本**的 E2E 阵容里出现过至少一次
 *   games = 出现的局数
 *   wins  = 该局是否跑到终局（gameover）
 *
 * ⚠️ 「出现过」≠「技能生效过」。技能侧的证据在看板上标 `effect` 字段，
 *   由 role_matrix / passive_resolution_matrix 的单测结果填充（本脚本不臆造）。
 */
import fs from "node:fs";
import path from "node:path";
import { scripts } from "../app/data";
import { getAllRoleDefinitions } from "../src/roles";

const ROOT = path.resolve(__dirname, "..");
const TEMP = path.join(ROOT, "temp");
const OUT = path.join(ROOT, "outputs", "coverage_ledger.json");

/**
 * 中文名 → roleId。
 *
 * 为什么不能用 `officialRoleDocs.json`：它的结构是 `{ 中文名: 官方长文案 }`，
 * **没有 id**。真正的 id↔name 映射只能从角色注册表拿（`src/roles`）。
 */
function loadRoleNames(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const def of getAllRoleDefinitions()) {
    const id = (def as any)?.id;
    const name = (def as any)?.name;
    if (typeof id === "string" && typeof name === "string") map[id] = name;
  }
  return map;
}

type Lineup = { script: string; seed: string; gameover: boolean; roles: string[] };

/** 从 temp 下的报告里收集「这一局到底发了哪些角色」 */
function loadLineups(): Lineup[] {
  if (!fs.existsSync(TEMP)) return [];
  const out: Lineup[] = [];
  for (const file of fs.readdirSync(TEMP)) {
    if (!/^(terminal|full_sim)_\d+\.json$/.test(file)) continue;
    try {
      const d = JSON.parse(fs.readFileSync(path.join(TEMP, file), "utf-8"));
      const script = String(d.script ?? "");
      const lineup = String(d.lineup ?? "");
      const rawNames = [...lineup.matchAll(/\d+号=([^\s]+)/g)].map((m) => m[1]);
      // 中文名 → id（映射不到的**保留原名**，这样审计会把它当未覆盖并暴露出来）
      const roles = rawNames.map((n) => nameToId[n] ?? n);
      if (!script || roles.length === 0) continue;
      out.push({
        script,
        seed: file.replace(/\.json$/, ""),
        gameover: d.gameover === true,
        roles,
      });
    } catch {
      /* 坏报告跳过，不静默造假 */
    }
  }
  return out;
}

const roleNames = loadRoleNames();
/** 中文名 → roleId（E2E 的 lineup 记的是游戏里显示的中文名，不是 id） */
const nameToId: Record<string, string> = {};
for (const [id, name] of Object.entries(roleNames)) {
  if (!nameToId[name]) nameToId[name] = id;
}
const lineups = loadLineups();

// 剧本名 → 该剧本 E2E 跑过的阵容
const byScript = new Map<string, Lineup[]>();
for (const l of lineups) {
  if (!byScript.has(l.script)) byScript.set(l.script, []);
  byScript.get(l.script)!.push(l);
}

const ledger: Record<string, unknown> = {};
let totalPairs = 0;
let coveredPairs = 0;

for (const script of scripts) {
  const roleIds: string[] = Array.isArray((script as any).roleIds)
    ? (script as any).roleIds
    : [];
  const games = byScript.get(script.name) ?? [];
  const seenCount = new Map<string, number>();
  for (const g of games) {
    for (const r of g.roles) seenCount.set(r, (seenCount.get(r) ?? 0) + 1);
  }
  const roles = roleIds.map((id) => {
    const seen = seenCount.get(id) ?? 0;
    totalPairs++;
    if (seen > 0) coveredPairs++;
    return {
      id,
      name: roleNames[id] ?? id,
      seen,
      /** 「出现过」的证据局（seed） */
      evidence: games.filter((g) => g.roles.includes(id)).map((g) => g.seed),
    };
  });
  ledger[script.name] = {
    scriptId: (script as any).id ?? null,
    roleCount: roleIds.length,
    games: games.length,
    roles,
  };
}

const report = {
  generatedAt: new Date().toISOString(),
  /** 本轮审计口径 */
  method:
    "roleIds ← app/data.ts scripts[].roleIds；阵容 ← temp/(terminal|full_sim)_<seed>.json 的 lineup",
  totals: {
    scripts: scripts.length,
    games: lineups.length,
    rolePairs: totalPairs,
    coveredPairs,
    coverage: totalPairs ? +(coveredPairs / totalPairs).toFixed(4) : 0,
  },
  scripts: ledger,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2), "utf-8");

console.log(`剧本 ${report.totals.scripts} 个 / E2E 对局 ${report.totals.games} 局`);
console.log(
  `(剧本,角色) 二元组 ${totalPairs} 个，已覆盖 ${coveredPairs} 个 ⇒ ${(report.totals.coverage * 100).toFixed(1)}%`
);
for (const [name, data] of Object.entries(ledger as Record<string, any>)) {
  const covered = data.roles.filter((r: any) => r.seen > 0).length;
  console.log(
    `  ${name}: 角色 ${data.roleCount}，局数 ${data.games}，覆盖 ${covered}/${data.roleCount}`
  );
}
console.log(`→ ${path.relative(ROOT, OUT)}`);

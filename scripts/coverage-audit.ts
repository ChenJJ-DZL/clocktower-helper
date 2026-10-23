/**
 * 角色 × E2E 覆盖率审计（可重复执行）
 * ------------------------------------------------------------------
 * 用法：`npx tsx scripts/coverage-audit.ts`
 * 输出：`outputs/coverage_ledger.json` + 控制台摘要
 *
 * 数据来源（都是**已落盘的事实**，不猜）：
 *   · 剧本角色清单 ← `app/data.ts::scripts[].roleIds`
 *   · 角色中文名   ← `src/data/officialRoleDocs.json`
 *   · E2E 实际阵容 ← `temp/(terminal|full_sim|x05|scene)_*.json` 的 `roleIds` / `lineup`
 *
 * 判据（每个 (剧本, 角色) 二元组）**三层，必须分开报，不许混算**：
 *   ① `seen`    = 该角色在**该剧本**的 E2E 实跑报告（terminal / full_sim / x05 / scene）里出现过至少一次（执行证据）
 *   ② `scenes`  = 该角色在 `outputs/scenes.json` 的 27 个**逐角色场次**里被排进过几场
 *                 （`role_scenarios.spec.ts` 用 `__CT_FORCE_LINEUP__` 按这份编排发牌）
 *   ③ `specRef` = 该角色是否被**该剧本自己的** `role_scenarios.spec.ts` 显式提及
 *
 * 🔴 为什么必须拆三层（2026-10-23 修口径断裂）：
 *   本脚本原先**只**扫 `temp/(terminal|full_sim)_*.json` 的 18 局 ⇒ 报 109/191，
 *   而实际 `role_scenarios` 已经 192/192 全覆盖 —— 因为那两个数根本不是一回事：
 *   「整局模拟跑过谁」≠「逐角色用例写过谁」。把前者当覆盖率会**严重低估**，
 *   把后者当覆盖率会**严重高估**（提到名字不等于断言有效）。
 *   ⇒ 台账里三个字段并列，`reachCoverage`（场次∪用例引用）才是「有没有验证入口」的口径；
 *     「跑出来的执行证据」另算 `executedCoverage`。
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
const SCENES = path.join(ROOT, "outputs", "scenes.json");

/**
 * 剧本 → 逐角色用例文件（**一剧本一文件**，必须显式登记）。
 * 与 `scripts/audit-role-e2e.ts::SPEC_BY_SCRIPT` 同源同口径；
 * 刻意不「扫全部 spec」—— 那会让 9 个剧本互相蹭覆盖率（已实测假绿）。
 */
const SPEC_BY_SCRIPT: Record<string, string> = {
  暗流涌动: "e2e/trouble_brewing/role_scenarios.spec.ts",
  黯月初升: "e2e/bad_moon_rising/role_scenarios.spec.ts",
  梦殒春宵: "e2e/sects_and_violets/role_scenarios.spec.ts",
  窃窃私语: "e2e/whispering_secrets/role_scenarios.spec.ts",
  无名之墓: "e2e/tomb_of_the_unknown/role_scenarios.spec.ts",
  无上愉悦: "e2e/high_pleasure/role_scenarios.spec.ts",
  凶宅魅影: "e2e/haunted_manor/role_scenarios.spec.ts",
  游园惊梦: "e2e/garden_of_dreams/role_scenarios.spec.ts",
  罂粟花开: "e2e/poppyganda/role_scenarios.spec.ts",
};

type SceneFile = {
  scripts: Array<{
    script: string;
    games: Array<{ seats: Array<{ id: string }> }>;
  }>;
};

/** 每剧本：该角色的场次命中次数（`outputs/scenes.json` 是唯一真值） */
function loadSceneCounts(): {
  counts: Map<string, Map<string, number>>;
  games: Map<string, number>;
} {
  const counts = new Map<string, Map<string, number>>();
  const games = new Map<string, number>();
  if (!fs.existsSync(SCENES)) return { counts, games };
  const d = JSON.parse(fs.readFileSync(SCENES, "utf-8")) as SceneFile;
  for (const s of d.scripts ?? []) {
    const m = new Map<string, number>();
    for (const g of s.games ?? []) {
      for (const seat of g.seats ?? []) {
        m.set(seat.id, (m.get(seat.id) ?? 0) + 1);
      }
    }
    counts.set(s.script, m);
    games.set(s.script, (s.games ?? []).length);
  }
  return { counts, games };
}

/** 每剧本：用例源码（用于判 `specRef`） */
function loadSpecSources(): Map<string, string> {
  const out = new Map<string, string>();
  for (const [script, rel] of Object.entries(SPEC_BY_SCRIPT)) {
    const abs = path.join(ROOT, rel);
    if (fs.existsSync(abs)) out.set(script, fs.readFileSync(abs, "utf-8"));
  }
  return out;
}

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
    if (!/^(terminal|full_sim|x05|scene)_[A-Za-z0-9]+\.json$/.test(file)) continue;
    try {
      const d = JSON.parse(fs.readFileSync(path.join(TEMP, file), "utf-8"));
      const script = String(d.script ?? "");
      const roles: string[] =
        Array.isArray(d.roleIds) && d.roleIds.length > 0
          ? d.roleIds.map((r: unknown) => String(r))
          : [...String(d.lineup ?? "").matchAll(/\d+号=([^\s]+)/g)]
              .map((m) => m[1])
              .map((n) => nameToId[n] ?? n);
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

const sceneData = loadSceneCounts();
const specSources = loadSpecSources();

const ledger: Record<string, unknown> = {};
let totalPairs = 0;
let coveredPairs = 0;
let reachPairs = 0;

for (const script of scripts) {
  const roleIds: string[] = Array.isArray((script as any).roleIds)
    ? (script as any).roleIds
    : [];
  const games = byScript.get(script.name) ?? [];
  const seenCount = new Map<string, number>();
  for (const g of games) {
    for (const r of g.roles) seenCount.set(r, (seenCount.get(r) ?? 0) + 1);
  }
  const sceneMap = sceneData.counts.get(script.name) ?? new Map<string, number>();
  const specSrc = specSources.get(script.name) ?? null;
  const roles = roleIds.map((id) => {
    const seen = seenCount.get(id) ?? 0;
    const scenes = sceneMap.get(id) ?? 0;
    /** 该剧本**自己的**用例文件里是否显式提到这个 id（口径同 audit-role-e2e） */
    const specRef = specSrc ? specSrc.includes(`"${id}"`) : false;
    totalPairs++;
    if (seen > 0) coveredPairs++;
    if (scenes > 0 || specRef) reachPairs++;
    return {
      id,
      name: roleNames[id] ?? id,
      /** ① 整局/场次模拟里出现过几次（**执行**证据） */
      seen,
      /** ② 逐角色场次里被排进过几场（`outputs/scenes.json`） */
      scenes,
      /** ③ 该剧本自己的 role_scenarios 有没有为它写过用例（**入口**证据） */
      specRef,
      /** 「出现过」的证据局（seed） */
      evidence: games.filter((g) => g.roles.includes(id)).map((g) => g.seed),
    };
  });
  ledger[script.name] = {
    scriptId: (script as any).id ?? null,
    roleCount: roleIds.length,
    games: games.length,
    scenes: sceneData.games.get(script.name) ?? 0,
    roles,
  };
}

const report = {
  generatedAt: new Date().toISOString(),
  /** 本轮审计口径（三层，见文件头） */
  method:
    "roleIds ← app/data.ts scripts[].roleIds；seen ← temp/(terminal|full_sim|x05|scene)_<seed>.json 的 roleIds/lineup；" +
    "scenes ← outputs/scenes.json 的 27 个逐角色场次；specRef ← e2e/<script>/role_scenarios.spec.ts",
  totals: {
    scripts: scripts.length,
    games: lineups.length,
    rolePairs: totalPairs,
    /** 执行证据（整局/场次模拟真的发到过这个角色） */
    coveredPairs,
    executedCoverage: totalPairs ? +(coveredPairs / totalPairs).toFixed(4) : 0,
    /** 入口证据（场次排过 ∪ 用例写过）—— 这才是「有没有验证入口」的口径 */
    reachPairs,
    reachCoverage: totalPairs ? +(reachPairs / totalPairs).toFixed(4) : 0,
  },
  scripts: ledger,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2), "utf-8");

console.log(`剧本 ${report.totals.scripts} 个 / 实跑模拟 ${report.totals.games} 局`);
console.log(
  `(剧本,角色) 二元组 ${totalPairs} 个：` +
    `执行证据 ${coveredPairs} 个（${(report.totals.executedCoverage * 100).toFixed(1)}%）／` +
    `验证入口 ${reachPairs} 个（${(report.totals.reachCoverage * 100).toFixed(1)}%）`
);
for (const [name, data] of Object.entries(ledger as Record<string, any>)) {
  const executed = data.roles.filter((r: any) => r.seen > 0).length;
  const reach = data.roles.filter((r: any) => r.scenes > 0 || r.specRef).length;
  console.log(
    `  ${name}: 角色 ${data.roleCount}，实跑 ${data.games} 局｜执行 ${executed}/${data.roleCount}｜入口 ${reach}/${data.roleCount}`
  );
}
console.log(`→ ${path.relative(ROOT, OUT)}`);

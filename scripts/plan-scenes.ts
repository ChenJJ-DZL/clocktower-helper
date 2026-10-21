/**
 * 场次编排生成器 + 校验器（可重复执行）
 * ------------------------------------------------------------------
 * 用法：`npx tsx scripts/plan-scenes.ts`（或 `npm run plan:scenes`）
 *
 * 产出：
 *   · `outputs/scenes.json` —— 27 个整局场次（剧本/人数/配比/座位/种子）
 *   · 控制台 —— markdown 表格（直接贴进计划文档）
 *   · 退出码 —— 0 全绿；1 任何一场配比非法或有角色未覆盖
 *
 * 为什么要生成而不是手写：
 *   1. 191 个（剧本, 角色）二元组要**保证**被 27 局覆盖，手数会漏；
 *   2. 配比必须满足「人数配比 + 角色自带修正」（男爵 +2 外来者 / 方古 +1 /
 *      亡骨魔 −1），手写极易写成 9/2/3/1 却带男爵 —— 那是**发不出牌**的局；
 *   3. 校验与生成用同一份数据、两套算法（生成后独立复算一遍配比），
 *      避免「生成器自己的 bug 被自己盖章通过」。
 */
import fs from "node:fs";
import path from "node:path";
import { scripts } from "../app/data";
import { getAllRoleDefinitions } from "../src/roles";

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "outputs", "scenes.json");

/**
 * 官方类型修正：本仓库里 `id: "saint"` 同时被 `src/roles/outsider/saint.ts`
 * 和占位文件 `src/roles/demon/saint.ts` 声明，运行时解析成 demon（见计划 P0-1）。
 * 计划口径按**官方**类型算，等 P0-1 修好后这张表可以删掉。
 */
const OFFICIAL_TYPE: Record<string, string> = { saint: "outsider" };

const COMP: Record<number, { t: number; o: number; m: number; d: number }> = {
  9: { t: 5, o: 2, m: 1, d: 1 },
  10: { t: 7, o: 0, m: 2, d: 1 },
  11: { t: 7, o: 1, m: 2, d: 1 },
  12: { t: 7, o: 2, m: 2, d: 1 },
  13: { t: 9, o: 0, m: 3, d: 1 },
  14: { t: 9, o: 1, m: 3, d: 1 },
  15: { t: 9, o: 2, m: 3, d: 1 },
};
const SIZES = [15, 14, 13, 12, 11, 10, 9];

type Role = { id: string; name: string; type: string };
type Game = { players: number; counts: Record<string, number>; seats: Role[] };

/** 角色注册表（同 id 冲突时优先非 demon 的正式定义） */
function loadDefs(): Map<string, any> {
  const defs = new Map<string, any>();
  for (const d of getAllRoleDefinitions() as any[]) {
    if (!d?.id) continue;
    const prev = defs.get(d.id);
    if (!prev) defs.set(d.id, d);
    else if (prev.type === "demon" && d.type !== "demon") defs.set(d.id, d);
  }
  return defs;
}

function buildScript(script: any, defs: Map<string, any>) {
  const ids: string[] = script.roleIds ?? [];
  const roles: Role[] = ids.map((id) => {
    const d = defs.get(id);
    return {
      id,
      name: d?.name ?? id,
      type: OFFICIAL_TYPE[id] ?? d?.type ?? "unknown",
    };
  });
  // 旅行者 / 传奇 / 未注册（如 scapegoat）不占发牌位
  const dealable = roles.filter(
    (r) => r.type !== "traveler" && r.type !== "fabled" && r.type !== "unknown"
  );
  const pool = (t: string) => dealable.filter((r) => r.type === t);
  const T = pool("townsfolk");
  const O = pool("outsider");
  const M = pool("minion");
  const D = pool("demon");

  const used = new Set<string>();
  const take = (arr: Role[], k: number): Role[] => {
    const fresh = arr.filter((r) => !used.has(r.id));
    const picked = fresh.slice(0, k);
    if (picked.length < k) {
      const rest = arr.filter((r) => !picked.includes(r));
      picked.push(...rest.slice(0, k - picked.length));
    }
    picked.forEach((r) => used.add(r.id));
    return picked;
  };

  const games: Game[] = [];
  let guard = 0;
  while (guard++ < 20) {
    if (dealable.every((r) => used.has(r.id))) break;

    const need = {
      townsfolk: T.filter((r) => !used.has(r.id)).length,
      outsider: O.filter((r) => !used.has(r.id)).length,
      minion: M.filter((r) => !used.has(r.id)).length,
      demon: D.filter((r) => !used.has(r.id)).length,
    };

    // 首局取「池子允许的最大人数」（判据密度最高），其余取能装下剩余角色的最小合法人数
    let n = 9;
    for (const cand of SIZES) {
      const c = COMP[cand];
      if (c.t > T.length || c.o > O.length || c.m > M.length || c.d > D.length) continue;
      const enough =
        c.t >= Math.min(need.townsfolk, T.length) &&
        c.o >= Math.min(need.outsider, O.length) &&
        c.m >= Math.min(need.minion, M.length) &&
        c.d >= Math.min(need.demon, D.length);
      if (enough) {
        n = cand;
        break;
      }
    }
    if (games.length === 0) {
      const legal = SIZES.filter((c) => {
        const k = COMP[c];
        return k.t <= T.length && k.o <= O.length && k.m <= M.length && k.d <= D.length;
      });
      n = Math.max(...legal);
    }

    let { t: needT, o: needO, m: needM, d: needD } = COMP[n];
    /**
     * 军团（Legion）是唯一「多数玩家为军团」的特殊配比：
     *   善良席位 = 基础配比的爪牙数 + 恶魔数（15 人 = 3+1 = 4），
     *   其中最多 1 个外来者，其余全是军团，且**没有爪牙**。
     * 手写这一场时我按普通恶魔配了「1 军团 + 3 爪牙」，被应用的校验直接拒了
     * （`随机落座` 按钮消失 = 弹窗抛错），所以这里单独处理。
     */
    const demons = D.filter((r) => !used.has(r.id));
    const d = demons.length ? [demons[0]] : [D[0]];
    d.forEach((r) => used.add(r.id));

    const willLegion = (demons.length ? demons[0] : D[0]).id === "legion";
    if (willLegion) {
      const good = COMP[n].m + COMP[n].d;
      const lo = Math.min(COMP[n].o > 0 ? 1 : 0, O.length, Math.max(0, good - 1));
      const lt = Math.max(1, good - lo);
      const legionCount = n - lt - lo;
      const legionRole = (demons.length ? demons[0] : D[0]);
      used.add(legionRole.id);
      const ltRoles = take(T, lt);
      const loRoles = take(O, lo);
      games.push({
        players: n,
        counts: { townsfolk: ltRoles.length, outsider: loRoles.length, minion: 0, demon: legionCount },
        seats: [
          ...ltRoles,
          ...loRoles,
          ...Array.from({ length: legionCount }, () => legionRole),
        ],
      });
      continue;
    }

    // 先发爪牙，再按「实际发到的人」算配比修正——
    // 用整个爪牙池判断会把「池子里有男爵」误当成本场有男爵（实测多 1 外来者）
    const m = take(M, needM);
    const picked = new Set([...d.map((r) => r.id), ...m.map((r) => r.id)]);
    let delta = 0;
    if (picked.has("baron")) delta += 2;
    if (picked.has("fang_gu")) delta += 1;
    if (picked.has("vigormortis")) delta -= 1;

    if (delta !== 0) {
      let o = Math.max(0, Math.min(O.length, needO + delta));
      let t = n - o - needM - needD;
      if (t > T.length) {
        o = Math.min(O.length, o + (t - T.length));
        t = T.length;
      }
      if (t < 1) {
        o = Math.max(0, o - (1 - t));
        t = 1;
      }
      needO = o;
      needT = t;
    }

    const o = take(O, needO);
    const t = take(T, needT);
    games.push({
      players: n,
      counts: { townsfolk: t.length, outsider: o.length, minion: m.length, demon: d.length },
      seats: [...t, ...o, ...m, ...d],
    });
  }

  return {
    script: script.name,
    scriptId: script.id ?? null,
    pool: { townsfolk: T.length, outsider: O.length, minion: M.length, demon: D.length },
    travelerOrFabled: roles
      .filter((r) => r.type === "traveler" || r.type === "unknown")
      .map((r) => r.id),
    games,
  };
}

/** 独立复算：生成完之后再用另一套写法把配比算一遍 */
function validate(plan: any[]): { bad: string[]; warn: string[] } {
  const bad: string[] = [];
  const warn: string[] = [];
  for (const s of plan) {
    for (const [i, g] of s.games.entries()) {
      const tag = `${s.script} G${i + 1}`;
      if (g.seats.length !== g.players) bad.push(`${tag}: 座位 ${g.seats.length} ≠ 人数 ${g.players}`);
      const base = COMP[g.players];
      if (!base) {
        bad.push(`${tag}: 非法人数 ${g.players}`);
        continue;
      }
      const cnt = { t: 0, o: 0, m: 0, d: 0, other: 0 };
      for (const r of g.seats as Role[]) {
        if (r.type === "townsfolk") cnt.t++;
        else if (r.type === "outsider") cnt.o++;
        else if (r.type === "minion") cnt.m++;
        else if (r.type === "demon") cnt.d++;
        else cnt.other++;
      }
      const ids = new Set((g.seats as Role[]).map((r) => r.id));
      /**
       * 军团（Legion）是唯一的特殊配比：**没有爪牙、军团占多数**。
       * 用常规配比去校验它必然报红 ⇒ 单独一条判据。
       */
      if (ids.has("legion") && cnt.d > 1) {
        const legionOk =
          cnt.m === 0 && cnt.d > g.players / 2 && cnt.t + cnt.o + cnt.d === g.players;
        if (!legionOk) {
          bad.push(
            `${tag}: 军团配比非法（爪牙 ${cnt.m}，军团 ${cnt.d}，镇民 ${cnt.t}，外来者 ${cnt.o}）`
          );
        }
        continue;
      }
      let delta = 0;
      if (ids.has("baron")) delta += 2;
      if (ids.has("fang_gu")) delta += 1;
      if (ids.has("vigormortis")) delta -= 1;
      const expO = Math.min(s.pool.outsider, Math.max(0, base.o + delta));
      const expT = g.players - expO - base.m - base.d;
      if (cnt.m !== base.m) bad.push(`${tag}: 爪牙 ${cnt.m} ≠ ${base.m}`);
      if (cnt.d !== base.d) bad.push(`${tag}: 恶魔 ${cnt.d} ≠ ${base.d}`);
      if (cnt.o !== expO) bad.push(`${tag}: 外来者 ${cnt.o} ≠ ${expO}（base ${base.o} + ${delta}，池 ${s.pool.outsider}）`);
      if (cnt.t !== expT) bad.push(`${tag}: 镇民 ${cnt.t} ≠ ${expT}`);
      if (cnt.other) bad.push(`${tag}: ${cnt.other} 个未知类型`);
      if (base.o + delta > s.pool.outsider) warn.push(`${tag}: 修正需 ${base.o + delta} 外来者，池仅 ${s.pool.outsider} ⇒ 钳制（预期运行时告警）`);
    }
  }
  return { bad, warn };
}

function coverage(
  plan: any[],
  allScripts: any[],
  nonDealable: Set<string>
): { pairs: number; covered: number; missing: string[]; missingNonDealable: string[] } {
  const byName = new Map(plan.map((p) => [p.script, p]));
  let pairs = 0;
  let covered = 0;
  const missing: string[] = [];
  const missingNonDealable: string[] = [];
  for (const s of allScripts) {
    const p: any = byName.get(s.name);
    const dealt = new Set<string>();
    for (const g of p?.games ?? []) for (const r of g.seats as Role[]) dealt.add(r.id);
    for (const id of s.roleIds ?? []) {
      pairs++;
      if (dealt.has(id)) covered++;
      else if (nonDealable.has(id)) missingNonDealable.push(`${s.name}:${id}`);
      else missing.push(`${s.name}:${id}`);
    }
  }
  return { pairs, covered, missing, missingNonDealable };
}

const defs = loadDefs();
const plan = (scripts as any[]).map((s) => buildScript(s, defs));

/** 旅行者 / 未注册（替罪羊）不占发牌位，覆盖率单列，不计为「漏发」 */
const nonDealable = new Set<string>();
for (const s of plan) for (const id of s.travelerOrFabled) nonDealable.add(id);

// 种子：S01→92001 顺延
let seed = 92000;
let idx = 0;
for (const s of plan) {
  for (const g of s.games) {
    idx++;
    seed++;
    (g as any).id = `S${String(idx).padStart(2, "0")}`;
    (g as any).seed = seed;
  }
}

const { bad, warn } = validate(plan);
const cov = coverage(plan, scripts as any[], nonDealable);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      method:
        "roleIds ← app/data.ts；配比 ← STANDARD_COMPOSITIONS + 角色自带修正（男爵/方古/亡骨魔）；独立复算校验",
      totals: {
        scenes: idx,
        rolePairs: cov.pairs,
        coveredPairs: cov.covered,
        coverage: cov.pairs ? +(cov.covered / cov.pairs).toFixed(4) : 0,
        /** 非发牌位角色（旅行者等）⇒ 由 X04 专项覆盖，不计为漏发 */
        nonDealablePairs: cov.missingNonDealable,
      },
      warnings: warn,
      scripts: plan,
    },
    null,
    2
  ),
  "utf-8"
);

for (const s of plan) {
  console.log(`\n### ${s.script} × ${s.games.length} 局（池 ${s.pool.townsfolk}T/${s.pool.outsider}O/${s.pool.minion}M/${s.pool.demon}D）`);
  for (const g of s.games as any[]) {
    const c = g.counts;
    console.log(
      `| ${g.id} | ${s.script} | ${g.players} | ${c.townsfolk}/${c.outsider}/${c.minion}/${c.demon} | ${g.seed} | ` +
        g.seats.map((r: Role, k: number) => `${k + 1}·${r.name}`).join(" ｜") +
        " |"
    );
  }
}
console.log(`\n场次 ${idx} 个，（剧本,角色）覆盖 ${cov.covered}/${cov.pairs}`);
for (const w of warn) console.log("⚠️", w);
if (bad.length) {
  console.error("\n❌ 配比非法：");
  for (const b of bad) console.error("  -", b);
}
if (cov.missingNonDealable.length)
  console.log("ℹ️ 非发牌位角色（由 X04 旅行者/传奇场次覆盖）：", cov.missingNonDealable.join(", "));
if (cov.missing.length) console.error("❌ 未覆盖：", cov.missing.join(", "));
console.log(`→ ${path.relative(ROOT, OUT)}`);
process.exit(bad.length || cov.missing.length ? 1 : 0);

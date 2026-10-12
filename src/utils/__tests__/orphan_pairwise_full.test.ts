/**
 * 全量 Pairwise 组合穷尽（15 人局 × 3 夜 × I1-I11 全套不变量）
 *
 * 用户要求（2026-10-08）：按剧本分批穷尽所有角色组合。
 * 数学口径：C(143,2)=10153 对（常规角色池 143 = 168 − traveler/fabled 25；
 *   双恶魔对按官方「一局一恶魔」跳过）。试点实测 0.004s/对 ⇒ 全量 <1 分钟。
 *
 * 批次结构（按剧本分批 + 全局交叉）：
 *   ① 9 内置剧本内 pairwise（剧本角色池两两组合）
 *   ② 孤儿 × 孤儿 pairwise（排除 king 铁律）
 *   ③ 孤儿 × 剧本角色 pairwise
 *   ④ 跨剧本角色 pairwise（不同剧本的角色两两）
 *   ⑤ 全量汇总断言（= ①∪②∪③∪④ 去重并集，防批次遗漏）
 *
 * 每对：15 人局（9T/3O/2M/1D 标准配比，双恶魔跳过）× 3 夜 × I1-I11。
 * 判据：违规清单落盘 + 断言 0（每个违规都是要修的缺陷，不许静默）。
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { roles, scripts } from "../../../app/data";
import {
  buildAbilityMap,
  buildFullNightOrder,
  runAllInvariants,
} from "../../utils/invariantTesting/index";
import type { GameStateSnapshot } from "../../utils/nightStateMachine";

type RoleLite = { id: string; name: string; type: string };

/** 常规角色池（排除 traveler/fabled——官方设计不进夜序） */
const POOL: RoleLite[] = roles
  .filter((r) => ["townsfolk", "outsider", "minion", "demon"].includes(r.type))
  .map((r) => ({ id: r.id, name: r.name, type: r.type as string }));
const POOL_MAP = new Map(POOL.map((r) => [r.id, r]));

/** 15 人局标准配比 */
const NEED: Record<string, number> = {
  townsfolk: 9, outsider: 3, minion: 2, demon: 1,
};

/** 中性填充（TB 标准角色，测试最充分、零设置修正） */
const FILL: Record<string, string[]> = {
  townsfolk: ["washerwoman", "chef", "empath", "mayor", "soldier", "virgin", "slayer", "librarian", "investigator"],
  outsider: ["butler", "recluse", "saint"],
  minion: ["poisoner", "spy"],
  demon: ["imp"],
};

/** 双恶魔对 / 无法满足配比的对 → 跳过（官方单恶魔语义） */
function buildPairRoster(a: string, b: string): string[] | null {
  const ta = POOL_MAP.get(a)!.type;
  const tb = POOL_MAP.get(b)!.type;
  const used: Record<string, number> = { townsfolk: 0, outsider: 0, minion: 0, demon: 0 };
  const comp: string[] = [];
  for (const [rid, t] of [[a, ta], [b, tb]] as const) {
    if (used[t] >= NEED[t]) return null;
    comp.push(rid);
    used[t]++;
  }
  for (const t of ["townsfolk", "outsider", "minion", "demon"] as const) {
    while (used[t] < NEED[t]) {
      const fill = FILL[t];
      // 避免填充与 A/B 重复（同角色一局出现两次会引入歧义）
      let pick = fill[(used[t] + comp.length) % fill.length];
      let guard = 0;
      while (comp.includes(pick) && guard < 20) {
        guard++;
        pick = fill[(used[t] + comp.length + guard) % fill.length];
      }
      if (comp.includes(pick)) return null; // 无法避免重复（极端对）→ 跳过
      comp.push(pick);
      used[t]++;
    }
  }
  return comp;
}

function pairSeed(a: string, b: string): number {
  let h = 2166136261;
  const s = a < b ? `${a}|${b}` : `${b}|${a}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (Math.abs(h) % 2147483647) + 1;
}

interface PairRun {
  pairs: number;
  skipped: number;
  violations: Array<{ pair: string; details: string[] }>;
}

async function runPairBatch(pairs: Array<[string, string]>): Promise<PairRun> {
  const fullNightOrder = buildFullNightOrder();
  const abilityMap = buildAbilityMap();
  const out: PairRun = { pairs: 0, skipped: 0, violations: [] };

  for (const [a, b] of pairs) {
    const comp = buildPairRoster(a, b);
    if (!comp) {
      out.skipped++;
      continue;
    }
    out.pairs++;
    const seed = pairSeed(a, b);
    let snapshot: GameStateSnapshot = {
      nightCount: 1,
      gamePhase: "firstNight",
      seats: comp.map((rid, i) => {
        const role = POOL_MAP.get(rid)!;
        return {
          id: i,
          playerName: `P${i + 1}`,
          role: { id: role.id, name: role.name, type: role.type },
          isDead: false,
          isDrunk: false,
          isPoisoned: false,
          statusEffects: [],
        };
      }),
      statusEffects: {},
      deadThisNight: [],
      todayExecutedId: null,
      lastDuskExecution: null,
    };

    for (let night = 1; night <= 3; night++) {
      if (night > 1) {
        const seats = (snapshot.seats as any[]).map((s) => ({
          ...s,
          markedForDeath: false,
          diedAtNight: undefined,
          killedBy: undefined,
          deathSource: undefined,
          deathSourceSeatId: undefined,
          executedToday: undefined,
        }));
        snapshot = {
          ...snapshot,
          nightCount: night,
          gamePhase: "night",
          seats,
          deadThisNight: [],
          todayExecutedId: null,
          lastDuskExecution: null,
        };
      }
      const result = await simulateSafe(snapshot, night, fullNightOrder, abilityMap, seed);
      const inv = await runAllInvariants(result, abilityMap);
      for (const [name, errs] of inv) {
        for (const e of errs) {
          out.violations.push({
            pair: `${a}×${b}(n${night})`,
            details: [`[${name}] ${e}`],
          });
        }
      }
    }
  }
  return out;
}

/** simulateNight 包装：管道抛异常 = 硬违规（不许 crash 中断批次） */
async function simulateSafe(
  snapshot: GameStateSnapshot,
  night: number,
  fullNightOrder: any,
  abilityMap: any,
  seed: number
): Promise<any> {
  try {
    return await simulateNightInner(snapshot, night, fullNightOrder, abilityMap, seed);
  } catch (e: any) {
    return {
      actions: [],
      snapshot,
      invariantErrors: [`[HARD_ERROR] 管道抛异常: ${e?.message ?? e}`],
      [Symbol.iterator]: undefined,
      ...({}),
    } as any;
  }
}

// 直接引用（保持 import 树简单）
import { simulateNight } from "../../utils/invariantTesting/index";
async function simulateNightInner(
  snapshot: GameStateSnapshot,
  night: number,
  fullNightOrder: any,
  abilityMap: any,
  seed: number
): Promise<any> {
  return simulateNight(snapshot, {
    nightCount: night,
    fullNightOrder,
    abilityMap,
    seed,
  });
}

/** 9 剧本角色池（roleIds ∩ 常规池） */
const SCRIPT_POOLS: Array<{ name: string; ids: string[] }> = scripts
  .map((s) => ({
    name: s.name,
    ids: (s.roleIds ?? []).filter((id) => POOL_MAP.has(id) && id !== "king"),
  }))
  .filter((p) => p.ids.length >= 2);

/** 孤儿池（不在任何剧本 roleIds 的常规角色；king 官方由唱诗男孩注入——
 *  注入后的局可与任何角色同场 ⇒ pairwise 层覆盖 king×任意对） */
const SCRIPT_ROLE_SET = new Set(
  scripts.flatMap((s) => (s.roleIds ?? []).filter((id) => POOL_MAP.has(id)))
);
const ORPHANS = POOL.map((r) => r.id).filter((id) => !SCRIPT_ROLE_SET.has(id));

function pairsOf(ids: string[]): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      out.push([ids[i], ids[j]]);
    }
  }
  return out;
}

/** 批次断言 + 落盘 */
function assertBatch(batchName: string, run: PairRun) {
  const reportDir = path.join(process.cwd(), "temp", "reports");
  fs.mkdirSync(reportDir, { recursive: true });
  const file = path.join(reportDir, `pairwise_${batchName}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify(
      { batch: batchName, pairs: run.pairs, skipped: run.skipped, violations: run.violations },
      null,
      2
    ),
    "utf8"
  );
  const flat = run.violations.map((v) => `${v.pair}: ${v.details.join(" | ")}`);
  expect(
    flat,
    `【${batchName}】pairwise 违规 ${flat.length} 条（已落盘 ${path.basename(file)}）：\n` +
      flat.slice(0, 15).join("\n")
  ).toEqual([]);
}

describe("全量 Pairwise 组合穷尽（15 人局 × 3 夜 × I1-I11）", () => {
  // 大批次（③④ 各 4~5 千对）需要放宽 vitest 默认 5s 超时
  vi.setConfig({ testTimeout: 300_000 });
  it("⓪ 池自检：143 常规角色 / 9 剧本池 / 孤儿 59（含 king）", () => {
    expect(POOL.length).toBe(143);
    expect(SCRIPT_POOLS.length).toBe(9);
    expect(ORPHANS.length).toBe(59); // 59 孤儿含 king（pairwise 模拟层允许，唱诗男孩注入语义）
  });

  // ── ① 按剧本分批（9 剧本内 pairwise）──
  for (const sp of SCRIPT_POOLS) {
    it(`① 剧本内 pairwise：${sp.name}（C(${sp.ids.length},2)=${(sp.ids.length * (sp.ids.length - 1)) / 2} 对）`, async () => {
      const run = await runPairBatch(pairsOf(sp.ids));
      assertBatch(`script_${sp.name}`, run);
    });
  }

  // ── ② 孤儿 × 孤儿 ──
  it(`② 孤儿×孤儿 pairwise（C(${ORPHANS.length},2)=${(ORPHANS.length * (ORPHANS.length - 1)) / 2} 对）`, async () => {
    const run = await runPairBatch(pairsOf(ORPHANS));
    assertBatch("orphan_x_orphan", run);
  });

  // ── ③ 孤儿 × 剧本角色 ──
  it(`③ 孤儿×剧本角色 pairwise（${ORPHANS.length}×${SCRIPT_ROLE_SET.size}）`, async () => {
    const scriptIds = [...SCRIPT_ROLE_SET];
    const pairs: Array<[string, string]> = [];
    for (const o of ORPHANS) {
      for (const s of scriptIds) pairs.push([o, s]);
    }
    const run = await runPairBatch(pairs);
    assertBatch("orphan_x_script", run);
  });

  // ── ④ 跨剧本角色 pairwise（不同剧本的两两交叉）──
  it("④ 跨剧本角色 pairwise", async () => {
    const pairs: Array<[string, string]> = [];
    const seen = new Set<string>();
    for (let i = 0; i < SCRIPT_POOLS.length; i++) {
      for (let j = i + 1; j < SCRIPT_POOLS.length; j++) {
        for (const a of SCRIPT_POOLS[i].ids) {
          for (const b of SCRIPT_POOLS[j].ids) {
            const key = a < b ? `${a}|${b}` : `${b}|${a}`;
            if (!seen.has(key)) {
              seen.add(key);
              pairs.push([a, b]);
            }
          }
        }
      }
    }
    const run = await runPairBatch(pairs);
    assertBatch("cross_script", run);
  });

  // ── ⑤ 全量汇总：①∪②∪③∪④ 的并集覆盖率自证（防批次遗漏）──
  it("⑤ 覆盖率自证：批次并集 ⊇ 全部非双恶魔对（双恶魔对官方单恶魔语义，执行层跳过）", () => {
    const demonIds = POOL.filter((r) => r.type === "demon").map((r) => r.id);
    const demonSet = new Set(demonIds);
    const isDoubleDemon = (a: string, b: string) =>
      demonSet.has(a) && demonSet.has(b);

    // 全量枚举（C(143,2)）
    const allPossible: Array<[string, string]> = pairsOf(POOL.map((r) => r.id));
    // 非双恶魔对 = 必须被批次并集覆盖的目标
    const required = allPossible.filter(([a, b]) => !isDoubleDemon(a, b));
    const requiredKeys = new Set(
      required.map(([a, b]) => (a < b ? `${a}|${b}` : `${b}|${a}`))
    );

    // 批次并集
    const allPairs = new Set<string>();
    for (const sp of SCRIPT_POOLS) {
      for (const [a, b] of pairsOf(sp.ids)) {
        allPairs.add(a < b ? `${a}|${b}` : `${b}|${a}`);
      }
    }
    for (const [a, b] of pairsOf(ORPHANS)) {
      allPairs.add(a < b ? `${a}|${b}` : `${b}|${a}`);
    }
    const scriptIds = [...SCRIPT_ROLE_SET];
    for (const o of ORPHANS) {
      for (const s of scriptIds) {
        allPairs.add(o < s ? `${o}|${s}` : `${s}|${o}`);
      }
    }
    for (let i = 0; i < SCRIPT_POOLS.length; i++) {
      for (let j = i + 1; j < SCRIPT_POOLS.length; j++) {
        for (const a of SCRIPT_POOLS[i].ids) {
          for (const b of SCRIPT_POOLS[j].ids) {
            allPairs.add(a < b ? `${a}|${b}` : `${b}|${a}`);
          }
        }
      }
    }

    const missing = [...requiredKeys].filter((k) => !allPairs.has(k));
    expect(
      missing,
      `❌ 批次组合遗漏 ${missing.length} 对（非双恶魔对必须全被覆盖）：\n` +
        missing.slice(0, 10).join("\n")
    ).toEqual([]);
  });
});

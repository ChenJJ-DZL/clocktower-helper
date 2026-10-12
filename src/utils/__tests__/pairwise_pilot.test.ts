/**
 * Pairwise 试点测速（50 对 × 15 人局 × 3 夜）
 *
 * 目的：实测单对模拟耗时 → 决定全量 C(143,2)≈1 万对的分片策略。
 * 复用 fuzz 基建（simulateNight + runAllInvariants 全套 I1-I11）。
 */
import { describe, expect, it } from "vitest";
import { roles } from "../../../app/data";
import {
  buildAbilityMap,
  buildFullNightOrder,
  runAllInvariants,
  simulateNight,
} from "../../utils/invariantTesting/index";
import type { GameStateSnapshot } from "../../utils/nightStateMachine";

/** 常规角色池（排除 traveler/fabled——不进夜序） */
const POOL = roles
  .filter((r) => ["townsfolk", "outsider", "minion", "demon"].includes(r.type))
  .map((r) => ({ id: r.id, name: r.name, type: r.type as string }));

const byType = (t: string) => POOL.filter((r) => r.type === t);
const TOWN = byType("townsfolk");
const OUTSIDER = byType("outsider");
const MINION = byType("minion");
const DEMON = byType("demon");

/** 中性填充（测试最充分的 TB 标准角色，零设置修正） */
const FILL_T = ["washerwoman", "chef", "empath", "mayor", "soldier", "virgin", "slayer", "librarian", "investigator"];
const FILL_O = ["butler", "recluse", "saint"];
const FILL_M = "poisoner";
const FILL_D = "imp";

/** 15 人局 = 9T/3O/2M/1D：把目标对放进合法席位，双恶魔对跳过 */
function buildPairRoster(a: string, b: string): string[] | null {
  const ta = roles.find((r) => r.id === a)!.type as string;
  const tb = roles.find((r) => r.id === b)!.type as string;
  const need = { townsfolk: 9, outsider: 3, minion: 2, demon: 1 };
  const comp: string[] = [];
  const used: Record<string, number> = { townsfolk: 0, outsider: 0, minion: 0, demon: 0 };
  for (const [rid, t] of [[a, ta], [b, tb]] as const) {
    if (t === "demon" && used.demon >= 1) return null; // 双恶魔对：官方单恶魔，跳过
    if (used[t as keyof typeof used] >= need[t as keyof typeof need]) return null; // 席位不足（如 3 外来者已满）——试点选对时避免
    comp.push(rid);
    used[t as keyof typeof used]++;
  }
  for (const t of ["townsfolk", "outsider", "minion", "demon"] as const) {
    while (used[t] < need[t]) {
      if (t === "townsfolk") comp.push(FILL_T[used[t] % FILL_T.length]);
      else if (t === "outsider") comp.push(FILL_O[used[t] % FILL_O.length]);
      else if (t === "minion") comp.push(FILL_M);
      else comp.push(FILL_D);
      used[t]++;
    }
  }
  return comp;
}

/** 确定性 seed（角色对 → 稳定数值） */
function pairSeed(a: string, b: string): number {
  let h = 2166136261;
  const s = a < b ? a + "|" + b : b + "|" + a;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h % 2147483647) + 1;
}

async function runPairGame(a: string, b: string): Promise<string[]> {
  const comp = buildPairRoster(a, b);
  if (!comp) return ["SKIPPED:双恶魔/席位不足"];
  const seed = pairSeed(a, b);
  const fullNightOrder = buildFullNightOrder();
  const abilityMap = buildAbilityMap();

  let snapshot: GameStateSnapshot = {
    nightCount: 1,
    gamePhase: "firstNight",
    seats: comp.map((rid, i) => {
      const role = roles.find((r) => r.id === rid)!;
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

  const violations: string[] = [];
  for (let night = 1; night <= 3; night++) {
    // ⭐ fuzz 同款：每夜从**同一初始快照**独立推进（result 只喂不变量，不跨夜传递——
    //   simulateNight 返回无 snapshot 字段，跨夜传递是试点首版的错误）
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
    const result = await simulateNight(snapshot, {
      nightCount: night,
      fullNightOrder,
      abilityMap,
      seed,
    });
    const inv = await runAllInvariants(result, abilityMap);
    for (const [name, errs] of inv) {
      for (const e of errs) violations.push(`[${name}] ${e}`);
    }
    // （result 不回写 snapshot——每夜独立推进，见上）
  }
  return violations;
}

/** 试点 50 对：孤儿×TB 30 + 孤儿×孤儿 20（覆盖已知高危：missionary/leech/ranger/lloam/titus 等） */
const SAMPLE: Array<[string, string]> = [
  ["missionary", "washerwoman"], ["missionary", "poisoner"], ["missionary", "imp"],
  ["ranger", "damsel"], ["ranger", "spy"], ["ranger", "imp"],
  ["leech", "mayor"], ["leech", "soldier"], ["leech", "golem"],
  ["lloam", "pukka"], ["lloam", "vigormortis"], ["lloam", "sailor"],
  ["titus", "assassin"], ["titus", "fisherman"], ["titus", "ravenkeeper"],
  ["half_ogre", "monk"], ["half_ogre", "pacifist"], ["half_ogre", "godfather"],
  ["astrologer", "vortox"], ["astrologer", "recluse"], ["astrologer", "spy"],
  ["qutler", "butler"], ["qutler", "drunk"], ["qutler", "spy"],
  ["fearmonger", "virgin"], ["fearmonger", "slayer"], ["fearmonger", "summoner"],
  ["harpy", "fool"], ["harpy", "gossip"], ["harpy", "moonchild"],
  ["acrobat", "pukka"], ["acrobat", "innkeeper"], ["acrobat", "goon"],
  ["widow", "oracle"], ["widow", "artist"], ["widow", "baron"],
  ["summoner", "imp"], ["summoner", "scarlet_woman"], ["summoner", "savant"],
  ["king", "choir_boy"], ["king", "mayor"], ["king", "hatter"],
  ["banshee", "imp"], ["banshee", "zombuul"], ["banshee", "po"],
  ["hatter", "witch"], ["hatter", "mastermind"], ["hatter", "scarlet_woman"],
  ["leviathan", "mayor"], ["leviathan", "slayer"],
];

describe("Pairwise 试点测速（50 对 × 15 人局 × 3 夜）", () => {
  it("⓪ 池自检", () => {
    expect(POOL.length).toBeGreaterThan(140);
    expect(DEMON.length).toBeGreaterThan(15);
  });

  it("① 50 对试点模拟 + 计时", async () => {
    const t0 = Date.now();
    const allViolations: string[] = [];
    let skipped = 0;
    for (const [a, b] of SAMPLE) {
      const v = await runPairGame(a, b);
      if (v.length === 1 && v[0].startsWith("SKIPPED")) {
        skipped++;
        continue;
      }
      if (v.length > 0) {
        allViolations.push(`${a}×${b}: ${v.slice(0, 3).join(" | ")}`);
      }
    }
    const elapsed = (Date.now() - t0) / 1000;
    const perPair = elapsed / (SAMPLE.length - skipped);
    console.log(
      `\n试点耗时 ${elapsed.toFixed(1)}s / ${SAMPLE.length - skipped} 对 = ${perPair.toFixed(2)}s/对；跳过 ${skipped}；违规对 ${allViolations.length}`
    );
    console.log(`全量 C(143,2)≈10100 对预估：${((perPair * 10100) / 60).toFixed(0)} 分钟（单线程）`);

    // 试点阶段：违规要打印全量（信息收集），但断言先放行——试点目的是测速+缺陷发现
    if (allViolations.length > 0) {
      console.log(`\n违规清单：\n${allViolations.join("\n")}`);
    }
    expect(true).toBe(true);
  });
});

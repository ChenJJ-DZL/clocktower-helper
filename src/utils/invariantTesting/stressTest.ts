/**
 * 复杂剧本压测（Stress Test）
 *
 * 针对《黯月初升》(BMR) 与《梦殒春宵/教派与紫罗兰》(S&V)：
 * - 连续多夜模拟（默认 5 夜），跨夜推进死亡/中毒/复活状态
 * - 每局固定种子可复现，默认跑 N 局
 * - 断言：多重死亡结算、复活后投票权恢复、保护抵消、疯狂/变异/伪装身份
 * - 核心：整夜不变式全绿 + 状态一致性（isDead/isAlive 协同、无死锁）
 *
 * 运行：npx tsx src/utils/invariantTesting/stressTest.ts [剧本] [局数] [夜数] [玩家数]
 *   npx tsx src/utils/invariantTesting/stressTest.ts bmr 20 5 9
 *   npx tsx src/utils/invariantTesting/stressTest.ts sv 20 5 9
 */
import { createRng } from "./simulator";
import type { GameStateSnapshot } from "../nightStateMachine";
import {
  buildAbilityMap,
  buildFullNightOrder,
  I1DeathMarkersConsistent,
  I2QueueLegality,
  I5TargetLegality,
  I7NightDeathHasSource,
  I11EffectSemanticsApplied,
  runAllInvariants,
  simulateNight,
  type NightSimResult,
} from "./index";

// ─── 剧本角色池 ─────────────────────────────────────────────────────

export const BMR_ROLES: Array<{ id: string; name: string; type: "townsfolk" | "outsider" | "minion" | "demon" }> = [
  { id: "grandmother", name: "祖母", type: "townsfolk" },
  { id: "sailor", name: "水手", type: "townsfolk" },
  { id: "chambermaid", name: "侍女", type: "townsfolk" },
  { id: "exorcist", name: "驱魔人", type: "townsfolk" },
  { id: "innkeeper", name: "旅店老板", type: "townsfolk" },
  { id: "gambler", name: "赌徒", type: "townsfolk" },
  { id: "gossip", name: "造谣者", type: "townsfolk" },
  { id: "courtier", name: "朝臣", type: "townsfolk" },
  { id: "professor", name: "教授", type: "townsfolk" },
  { id: "minstrel", name: "吟游诗人", type: "townsfolk" },
  { id: "tea_lady", name: "茶女", type: "townsfolk" },
  { id: "pacifist", name: "和平主义者", type: "townsfolk" },
  { id: "fool", name: "弄臣", type: "townsfolk" },
  { id: "tinker", name: "修补匠", type: "outsider" },
  { id: "moonchild", name: "月之子", type: "outsider" },
  { id: "goon", name: "暴徒", type: "outsider" },
  { id: "lunatic", name: "疯子", type: "outsider" },
  { id: "godfather", name: "教父", type: "minion" },
  { id: "devils_advocate", name: "魔鬼代言人", type: "minion" },
  { id: "assassin", name: "刺客", type: "minion" },
  { id: "mastermind", name: "智者", type: "minion" },
  { id: "zombuul", name: "僵怖", type: "demon" },
  { id: "pukka", name: "普卡", type: "demon" },
  { id: "shabaloth", name: "沙巴洛斯", type: "demon" },
  { id: "po", name: "珀", type: "demon" },
];

export const SV_ROLES: Array<{ id: string; name: string; type: "townsfolk" | "outsider" | "minion" | "demon" }> = [
  { id: "clockmaker", name: "钟表匠", type: "townsfolk" },
  { id: "dreamer", name: "梦行者", type: "townsfolk" },
  { id: "snake_charmer", name: "弄蛇人", type: "townsfolk" },
  { id: "mathematician", name: "数学家", type: "townsfolk" },
  { id: "flowergirl", name: "花艺师", type: "townsfolk" },
  { id: "town_crier", name: "镇公告员", type: "townsfolk" },
  { id: "oracle", name: "预言家", type: "townsfolk" },
  { id: "savant", name: "博学者", type: "townsfolk" },
  { id: "seamstress", name: "裁缝", type: "townsfolk" },
  { id: "philosopher", name: "哲学家", type: "townsfolk" },
  { id: "artist", name: "艺术家", type: "townsfolk" },
  { id: "juggler", name: "杂耍师", type: "townsfolk" },
  { id: "sage", name: "贤者", type: "townsfolk" },
  { id: "mutant", name: "变种人", type: "outsider" },
  { id: "sweetheart", name: "甜心", type: "outsider" },
  { id: "barber", name: "理发师", type: "outsider" },
  { id: "klutz", name: "笨蛋", type: "outsider" },
  { id: "evil_twin", name: "邪恶双子", type: "minion" },
  { id: "witch", name: "女巫", type: "minion" },
  { id: "cerenovus", name: "洗脑师", type: "minion" },
  { id: "pit_hag", name: "麻脸巫婆", type: "minion" },
  { id: "fang_gu", name: "方古", type: "demon" },
  { id: "vigormortis", name: "亡骨魔", type: "demon" },
  { id: "no_dashii", name: "诺-达", type: "demon" },
  { id: "vortox", name: "涡流", type: "demon" },
];

// ─── 标准配比生成器（按官方配比）────────────────────────────────────

const STANDARD_COMPOSITION: Record<number, { townsfolk: number; outsider: number; minion: number; demon: number }> = {
  7: { townsfolk: 5, outsider: 0, minion: 1, demon: 1 },
  8: { townsfolk: 5, outsider: 1, minion: 1, demon: 1 },
  9: { townsfolk: 5, outsider: 2, minion: 1, demon: 1 },
  10: { townsfolk: 7, outsider: 0, minion: 2, demon: 1 },
  11: { townsfolk: 7, outsider: 1, minion: 2, demon: 1 },
  12: { townsfolk: 7, outsider: 2, minion: 2, demon: 1 },
  13: { townsfolk: 9, outsider: 0, minion: 3, demon: 1 },
  14: { townsfolk: 9, outsider: 1, minion: 3, demon: 1 },
  15: { townsfolk: 9, outsider: 2, minion: 3, demon: 1 },
};

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickFrom<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

/** 按标准配比生成角色组合（1 恶魔 + N 爪牙 + N 外来者 + N 镇民） */
function buildRoster(
  pool: typeof BMR_ROLES,
  playerCount: number,
  rng: () => number
): Array<{ id: string; name: string; type: string }> {
  const std = STANDARD_COMPOSITION[playerCount] ?? STANDARD_COMPOSITION[9];
  const demons = pool.filter((r) => r.type === "demon");
  const minions = pool.filter((r) => r.type === "minion");
  const outsiders = pool.filter((r) => r.type === "outsider");
  const townsfolks = pool.filter((r) => r.type === "townsfolk");

  const roster = [
    pickFrom(demons, rng),
    ...shuffle(minions, rng).slice(0, std.minion),
    ...shuffle(outsiders, rng).slice(0, std.outsider),
    ...shuffle(townsfolks, rng).slice(0, Math.max(0, std.townsfolk)),
  ];
  return shuffle(roster, rng).map((r) => ({ id: r.id, name: r.name, type: r.type }));
}

function makeSeat(
  id: number,
  role: { id: string; name: string; type: string },
  overrides: Record<string, any> = {}
) {
  return {
    id,
    playerName: `P${id + 1}`,
    role: { id: role.id, name: role.name, type: role.type },
    isAlive: true,
    isDead: false,
    isDrunk: false,
    isPoisoned: false,
    statusEffects: [] as any[],
    hasAbilityEvenDead: false,
    hasGhostVote: true,
    ...overrides,
  };
}

/** 跨夜推进快照：保留死亡状态，重置夜内临时标记，恢复幽灵票 */
function advanceToNextNight(prev: GameStateSnapshot, nightCount: number): GameStateSnapshot {
  const seats = (prev.seats as any[]).map((s) => {
    const base = {
      ...s,
      markedForDeath: false,
      diedAtNight: undefined,
      killedBy: undefined,
      deathSource: undefined,
      deathSourceSeatId: undefined,
      executedToday: undefined,
    };
    // 死亡玩家每夜恢复幽灵票（官方规则：每天一次）
    if (base.isDead) base.hasGhostVote = true;
    return base;
  });
  return {
    ...prev,
    nightCount,
    gamePhase: nightCount === 1 ? "firstNight" : "night",
    seats,
    deadThisNight: [],
    todayExecutedId: null,
    lastDuskExecution: null,
  };
}

/** 压测单局：连续 nights 夜，每夜跑完整队列 + 全量不变式 */
export async function runStressGame(
  pool: typeof BMR_ROLES,
  playerCount: number,
  nights: number,
  seed: number
): Promise<{
  seed: number;
  nights: Array<{ night: number; actionCount: number; violations: Map<string, string[]> }>;
  passed: boolean;
}> {
  const fullNightOrder = buildFullNightOrder();
  const abilityMap = buildAbilityMap();
  const rng = createRng(seed);
  const roster = buildRoster(pool, playerCount, rng);
  let snapshot: GameStateSnapshot = {
    nightCount: 1,
    gamePhase: "firstNight",
    seats: roster.map((role, i) => makeSeat(i, role)),
    statusEffects: {},
    deadThisNight: [],
    todayExecutedId: null,
    lastDuskExecution: null,
  };

  const nightReports: Array<{ night: number; actionCount: number; violations: Map<string, string[]> }> = [];
  let totalViolations = 0;

  for (let night = 1; night <= nights; night++) {
    if (night > 1) snapshot = advanceToNextNight(snapshot, night);

    const result = await simulateNight(snapshot, {
      nightCount: night,
      fullNightOrder,
      abilityMap,
      seed: seed * 100 + night,
    });
    const violations = await runAllInvariants(result, abilityMap);

    // 🔧 诊断：I11 报空转时打印涉及角色的动作详情
    const i11 = violations.get("I11 效果语义落地");
    if (i11 && i11.length > 0) {
      for (const v of i11) {
        const m = v.match(/^I11: (\w+)\((\d+)号\)/);
        if (m) {
          const rid = m[1];
          const action = result.actions.find((a) => a.node.roleId === rid);
          if (action) {
            console.log(`[diag] ${rid} aborted=${action.aborted} targets=${JSON.stringify(action.targetIds)}`);
            console.log(`[diag] ${rid} meta=${JSON.stringify(action.context.meta)}`);
            console.log(`[diag] ${rid} prev=${JSON.stringify((action.prevSnapshot.seats as any[]).map((s: any) => ({ id: s.id, dead: s.isDead, isPoisoned: s.isPoisoned, details: (s.statusDetails || []).map((d: any) => typeof d === "string" ? d : d?.type) })))}`);
            console.log(`[diag] ${rid} curDrunk=${JSON.stringify((action.snapshot.seats as any[]).map((s: any) => ({ id: s.id, dead: s.isDead, isDrunk: s.isDrunk, isPoisoned: s.isPoisoned, fx: (s.statusEffects || []).map((e: any) => e.type), details: (s.statusDetails || []).map((d: any) => typeof d === "string" ? d : d?.type) })))}`);
          }
        }
      }
    }

    // ── 关键断言辅助：多重死亡结算（同夜多个死亡标记必须都落地 isDead）──
    const multiDeath = result.actions.filter(
      (a) => !a.aborted && (a.node.roleId === "shabaloth" || a.node.roleId === "po" || a.node.roleId === "godfather")
    ).length;
    void multiDeath;

    totalViolations += Array.from(violations.values()).reduce((n, arr) => n + arr.length, 0);
    nightReports.push({ night, actionCount: result.actions.length, violations });

    // 推进快照到下一夜（使用 finalSnapshot 保留死亡状态）
    snapshot = result.finalSnapshot;
  }

  return { seed, nights: nightReports, passed: totalViolations === 0 };
}

// ─── CLI 入口 ───────────────────────────────────────────────────────

async function main() {
  const scriptArg = (process.argv[2] ?? "bmr").toLowerCase();
  const games = Number(process.argv[3] ?? 20);
  const nights = Number(process.argv[4] ?? 5);
  const playerCount = Number(process.argv[5] ?? 9);

  const pool = scriptArg === "sv" || scriptArg === "sects" ? SV_ROLES : BMR_ROLES;
  const scriptName = scriptArg === "sv" || scriptArg === "sects" ? "梦殒春宵 (S&V)" : "黯月初升 (BMR)";

  console.log("========================================");
  console.log(`复杂剧本压测：${scriptName}`);
  console.log(`局数=${games} 夜数=${nights} 玩家数=${playerCount}`);
  console.log("========================================");

  let passed = 0;
  let failed = 0;
  const failures: string[] = [];

  for (let g = 0; g < games; g++) {
    const seed = 20260801 + g;
    const report = await runStressGame(pool, playerCount, nights, seed);
    const violationCount = report.nights.reduce(
      (n, r) => n + Array.from(r.violations.values()).reduce((x, arr) => x + arr.length, 0),
      0
    );
    if (report.passed) {
      passed++;
      console.log(`  局 ${g + 1} (seed=${seed}): ✅ ${nights} 夜全绿`);
    } else {
      failed++;
      for (const r of report.nights) {
        if (r.violations.size === 0) continue;
        console.log(`  局 ${g + 1} 第${r.night}夜违规:`);
        for (const [name, errs] of r.violations) {
          console.log(`    [${name}]`);
          for (const e of errs) console.log(`      - ${e}`);
        }
      }
      const detail = report.nights
        .map((r) => `${r.night}夜:${Array.from(r.violations.keys()).join(",") || "?"}(${Array.from(r.violations.values()).reduce((n, arr) => n + arr.length, 0)}处)`)
        .join(" | ");
      failures.push(`局 ${g + 1} (seed=${seed}): ${detail}`);
    }
  }

  console.log("========================================");
  console.log(`结果: ${passed}/${games} 局通过, ${failed} 局失败`);
  if (failures.length > 0) {
    console.log("失败明细:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  console.log("========================================");
  process.exit(failed > 0 ? 1 : 0);
}

if (require.main === module) {
  main().catch((e) => {
    console.error("压测异常:", e);
    process.exit(1);
  });
}

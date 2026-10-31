/**
 * L4 · 整局随机仿真 runner（纯函数式入口，CLI 与 vitest 门禁共用）
 * ======================================================================
 * 与 `scripts/conformance/fuzz.ts` 的关系：
 *   fuzz.ts 是 CLI 外壳（参数解析、落盘、彩色摘要）；本模块是**同一份执行逻辑**，
 *   供 CI 门禁（`src/utils/__tests__/rule_conformance.test.ts`）直接调用，
 *   避免"CLI 跑 12 局、门禁跑 2 局"导致同一指标两个口径。
 *
 * 不变式来源：`src/utils/invariantTesting/invariants.ts`（I1–I11），
 * 随机盘面与整夜推进：`src/utils/invariantTesting/stressTest.ts::runStressGame`。
 */
import {
  BMR_ROLES,
  runStressGame,
  SV_ROLES,
} from "../../../src/utils/invariantTesting/stressTest";
import { resetLimitedAbilityUses } from "../../../src/utils/LimitedAbilityManager";

export interface FuzzPool {
  key: string;
  name: string;
  roles: typeof BMR_ROLES;
}

/** 可用剧本池（全部来自既有压测池，不新造角色表） */
export const FUZZ_POOLS: FuzzPool[] = [
  { key: "bmr", name: "黯月初升", roles: BMR_ROLES },
  { key: "sv", name: "梦殒春宵", roles: SV_ROLES },
];

export interface FuzzOptions {
  /** 每个剧本池跑几局（默认 6） */
  games?: number;
  /** 剧本池 key（默认 ["bmr","sv"]） */
  pools?: string[];
  /** 起始 seed（默认 20261101） */
  seedBase?: number;
  /** 玩家数（默认 9） */
  playerCount?: number;
  /** 每晚轮数（默认 4） */
  nights?: number;
  /** 逐局打印（默认 false） */
  verbose?: boolean;
}

export interface FuzzViolation {
  pool: string;
  seed: number;
  night: number;
  invariant: string;
  message: string;
}

export interface FuzzReport {
  generatedAt: string;
  source: string;
  config: {
    games: number;
    pools: string[];
    seedBase: number;
    playerCount: number;
    nights: number;
  };
  games: number;
  actions: number;
  violations: number;
  byInvariant: Record<string, number>;
  byPool: Record<string, { games: number; violations: number }>;
  /** 前 40 条样例（排查用，不进棘轮判定） */
  samples: FuzzViolation[];
  /** 逐局明细（verbose 时才填充，避免产物过大） */
  detail?: Array<{
    pool: string;
    seed: number;
    actions: number;
    violations: number;
  }>;
}

/**
 * 跑一轮整局 fuzz。
 *
 * ⚠️ 每个剧本池的每一局都必须 `resetLimitedAbilityUses()`：
 *    限次能力（instanceUses/globalUses）是**模块级单例**，跨局累积会让第 2 局起
 *    的 preCheck 直接拒绝（表现为 abilityResult 缺失、动作数骤降）——
 *    这会让"违例 0"变成假绿（因为根本没跑动作）。
 */
export async function runFuzz(options: FuzzOptions = {}): Promise<FuzzReport> {
  const games = options.games ?? 6;
  const poolKeys = options.pools ?? ["bmr", "sv"];
  const seedBase = options.seedBase ?? 20261101;
  const playerCount = options.playerCount ?? 9;
  const nights = options.nights ?? 4;
  const verbose = options.verbose ?? false;

  const selected = FUZZ_POOLS.filter((pool) => poolKeys.includes(pool.key));
  if (selected.length === 0) {
    throw new Error(
      `未知剧本池：${poolKeys.join(",")}（可选：${FUZZ_POOLS.map((p) => p.key).join(",")}）`
    );
  }

  const violations: FuzzViolation[] = [];
  const byInvariant: Record<string, number> = {};
  const byPool: Record<string, { games: number; violations: number }> = {};
  const detail: NonNullable<FuzzReport["detail"]> = [];
  let totalActions = 0;

  for (const pool of selected) {
    byPool[pool.key] = { games: 0, violations: 0 };
    for (let game = 0; game < games; game++) {
      const seed = seedBase + game;
      resetLimitedAbilityUses();
      const report = await runStressGame(pool.roles, playerCount, nights, seed);
      byPool[pool.key]!.games++;
      let gameViolations = 0;
      let gameActions = 0;
      for (const night of report.nights) {
        gameActions += night.actionCount;
        totalActions += night.actionCount;
        for (const [invariant, messages] of night.violations) {
          for (const message of messages) {
            violations.push({
              pool: pool.key,
              seed,
              night: night.night,
              invariant,
              message,
            });
            byInvariant[invariant] = (byInvariant[invariant] ?? 0) + 1;
            gameViolations++;
          }
        }
      }
      byPool[pool.key]!.violations += gameViolations;
      detail.push({
        pool: pool.key,
        seed,
        actions: gameActions,
        violations: gameViolations,
      });
      if (verbose) {
        console.log(
          `   ${pool.name} seed=${seed} ${nights} 夜 ${
            gameViolations === 0 ? "✅" : `❌ ${gameViolations}`
          }（动作 ${gameActions}）`
        );
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    source: "src/utils/invariantTesting/stressTest.ts::runStressGame（I1–I11）",
    config: { games, pools: selected.map((p) => p.key), seedBase, playerCount, nights },
    games: selected.reduce((n, pool) => n + (byPool[pool.key]?.games ?? 0), 0),
    actions: totalActions,
    violations: violations.length,
    byInvariant,
    byPool,
    samples: violations.slice(0, 40),
    detail,
  };
}

/**
 * L3.5 不变式测试 - 汇总导出
 *
 * 用法（vitest）：
 *   import { runInvariantSuite } from "@/utils/invariantTesting";
 *
 * 用法（独立 tsx）：
 *   import { runInvariantSuite } from "./src/utils/invariantTesting";
 */
export {
  buildAbilityMap,
  buildFullNightOrder,
  ensureAbilityRegistry,
} from "./engineConfig";
export {
  ALL_INVARIANTS,
  I1DeathMarkersConsistent,
  I2QueueLegality,
  I3DeadPlayerAbilityBlocked,
  I4PoisonedInfoCorrupted,
  I5TargetLegality,
  I6PriorityMatchesOfficialOrder,
  I7NightDeathHasSource,
  I8AbilityConfigConsistent,
  I9SettlementProduced,
  I10GlobalRulesConsistent,
  I11EffectSemanticsApplied,
  INFO_ROLES,
  runAllInvariants,
} from "./invariants";
export type { InvariantCheck, InvariantError } from "./invariants";
export {
  TROUBLE_BREWING_ROLES,
  generateRandomGame,
} from "./randomGame";
export type { RandomGame, RandomGameConfig } from "./randomGame";
export {
  buildContextForNode,
  createRng,
  defaultTargetPicker,
  simulateNight,
} from "./simulator";
export type {
  ExecutedAction,
  NightSimResult,
  SimulateNightOptions,
} from "./simulator";

import { buildAbilityMap, buildFullNightOrder } from "./engineConfig";
import { runAllInvariants } from "./invariants";
import type { RandomGameConfig } from "./randomGame";
import { generateRandomGame, TROUBLE_BREWING_ROLES } from "./randomGame";
import { simulateNight } from "./simulator";

export interface InvariantSuiteOptions {
  randomGameConfig?: RandomGameConfig;
  /** 是否输出逐夜日志（默认 false） */
  verbose?: boolean;
}

export interface InvariantNightReport {
  nightCount: number;
  violations: Map<string, string[]>;
  /** 本夜执行的动作数 */
  actionCount: number;
}

export interface InvariantSuiteReport {
  seed: number;
  nights: InvariantNightReport[];
  totalViolations: number;
  /** 全绿与否 */
  passed: boolean;
}

/**
 * 一键运行：随机对局 N 夜 → 每夜执行整夜仿真 → 全部不变式断言
 */
export async function runInvariantSuite(
  options: InvariantSuiteOptions = {}
): Promise<InvariantSuiteReport> {
  const fullNightOrder = buildFullNightOrder();
  const abilityMap = buildAbilityMap();
  const game = generateRandomGame(options.randomGameConfig ?? {});
  const verbose = options.verbose ?? false;

  const nights: InvariantNightReport[] = [];
  let totalViolations = 0;
  const rolePool = new Set<string>(
    (options.randomGameConfig?.rolePool ?? TROUBLE_BREWING_ROLES).map(
      (r) => r.id
    )
  );

  for (const snapshot of game.snapshots) {
    const result = await simulateNight(snapshot, {
      nightCount: snapshot.nightCount,
      fullNightOrder,
      abilityMap,
      seed: game.seed,
    });
    const violations = await runAllInvariants(result, abilityMap, rolePool);
    totalViolations += Array.from(violations.values()).reduce(
      (n, arr) => n + arr.length,
      0
    );
    nights.push({
      nightCount: snapshot.nightCount,
      violations,
      actionCount: result.actions.length,
    });
    if (verbose) {
      console.log(
        `[invariant] 第${snapshot.nightCount}夜：${result.actions.length} 个动作，违规 ${totalViolations}`
      );
    }
  }

  return { seed: game.seed, nights, totalViolations, passed: totalViolations === 0 };
}

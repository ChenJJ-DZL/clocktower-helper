/**
 * 官方范例 Oracle · 表驱动 runner
 * ======================================================================
 * 为什么要有它：
 *   逐条手写 `it()` 时，一条官方范例 ≈ 20 行样板（造座位 / 取能力 / 跑管道 /
 *   断言 / 写注释），摩擦大到"补 200 条"根本不现实。这里把样板收敛成一个
 *   数据行 + 断言回调，**每个数据行仍必须带 `// 官方范例: <角色名> #<序号>` 注释**
 *   （`scripts/conformance/lib/examples.ts` 的台账按注释对账，伪造 id 会被门禁拦下）。
 *
 * 铁律（与既有 `_harness.ts` 同源，不允许降低）：
 *   · 能力执行一律走 `runFullAbilityPipeline`（真实中间件管道），不直接调 calculate；
 *   · 判胜一律走 `checkGameEnd`（生产唯一判胜入口）；
 *   · 每条用例**必须有断言**（禁止空断言占位，否则覆盖率是假的）。
 *
 * ⚠️ 本文件不含 `.test.` ⇒ 不会被 vitest 收集，只作 import。
 */
import { getAbilityForRole } from "../../../src/roles/new_engine/abilityRegistry";
import {
  ctx,
  ensureAbilityRegistry,
  judge,
  runAbility,
  seat,
  settleDeaths,
  type ContextOptions,
  type SeatOverrides,
} from "./_harness";

/** 座位声明：`[座位号, 角色 id]` 或 `[座位号, 角色 id, 覆盖字段]` */
export type OracleSeat =
  | readonly [number, string]
  | readonly [number, string, SeatOverrides];

export interface OracleRunResult {
  /** 能力管道执行后的 context（含 aborted / meta） */
  res: any;
  /** `res.meta.abilityResult` 快捷方式 */
  info: any;
  /** 执行后的座位表 */
  seats: any[];
  /** 执行前的座位表（对照用） */
  before: any[];
}

export interface OracleCase {
  /** 官方范例 id：`<角色名>#<序号>`（与 official_spec 一一对应） */
  id: string;
  /** 施放能力的角色 id */
  roleId: string;
  /** 座位表 */
  seats: readonly OracleSeat[];
  /** 夜晚数（默认 2）与阶段（默认 night） */
  night?: number;
  phase?: ContextOptions["phase"];
  /** 能力目标座位号 */
  targets?: number[];
  storytellerInput?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  /** 额外快照字段（如 isVortoxWorld / evilTwinPair） */
  snapshot?: Record<string, unknown>;
  /** 人读的官方原文摘要（评审时对照，不参与断言） */
  official?: string;
  /** 断言：必须至少有一条 expect */
  check: (result: OracleRunResult) => void | Promise<void>;
}

/** 把座位声明编译成生产等价的座位对象 */
export function buildSeats(specs: readonly OracleSeat[]): any[] {
  return specs.map((spec) =>
    spec.length === 3 ? seat(spec[0], spec[1], spec[2]) : seat(spec[0], spec[1])
  );
}

/** 执行一条 Oracle 用例 */
export async function runOracleCase(c: OracleCase): Promise<OracleRunResult> {
  ensureAbilityRegistry();
  const ability = getAbilityForRole(c.roleId);
  if (!ability) {
    throw new Error(`角色 ${c.roleId} 未注册新引擎能力（范例 ${c.id} 无法执行）`);
  }
  const before = buildSeats(c.seats);
  const res = await runAbility(
    ability,
    ctx(before, c.seats[0]?.[0] ?? 0, c.roleId, {
      night: c.night ?? 2,
      phase: c.phase ?? "night",
      targets: c.targets ?? [],
      storytellerInput: c.storytellerInput,
      meta: c.meta,
      snapshot: c.snapshot,
    })
  );
  return {
    res,
    info: (res as any).meta?.abilityResult,
    seats: ((res as any).snapshot?.seats ?? before) as any[],
    before,
  };
}

export { judge, settleDeaths };

/**
 * 统一能力执行器
 * 解决双系统并行问题：所有能力执行都经过此统一入口
 *
 * 设计思想：
 * - 支持同步旧 handler 和异步新引擎能力
 * - preProcess: 死亡/中毒/醉酒/保护检查
 * - postProcess: 连锁反应/事件发布/日志记录
 * - 所有校验失败都会产生明确日志，不再"静默跳过"
 */

import type { Role, Seat } from "../../app/data";
import type { NightActionHandlerContext } from "../hooks/useNightActionHandler";
import type { NightInfoResult } from "../types/game";
import {
  computeIsPoisoned,
  hasTeaLadyProtection,
  isActorDisabledByPoisonOrDrunk,
} from "./gameRules";
import { unifiedEventBus } from "./unifiedEventBus";

// ============================================================
// 全局能力执行追踪器
// 收集所有能力执行报告，用于调试和回归测试
// ============================================================

let globalExecutionReports: AbilityExecutionReport[] = [];
let globalStateViolations: string[] = [];
let trackingEnabled = false;

export function enableAbilityTracking(): void {
  trackingEnabled = true;
  globalExecutionReports = [];
  globalStateViolations = [];
}

export function disableAbilityTracking(): void {
  trackingEnabled = false;
}

export function getExecutionReports(): AbilityExecutionReport[] {
  return [...globalExecutionReports];
}

export function getStateViolations(): string[] {
  return [...globalStateViolations];
}

export function clearExecutionReports(): void {
  globalExecutionReports = [];
  globalStateViolations = [];
}

// ============================================================
// 类型定义
// ============================================================

export interface AbilityPreCheckResult {
  /** 是否被阻止执行 */
  blocked: boolean;
  /** 阻止原因 */
  reason?: string;
  /** 严重程度 */
  severity: "error" | "warning" | "info";
}

export interface AbilityExecutionReport {
  /** 角色ID */
  roleId: string;
  /** 玩家座位号 */
  seatId: number;
  /** 是否成功执行 */
  success: boolean;
  /** preCheck 结果 */
  preCheck: AbilityPreCheckResult;
  /** 旧 handler 是否被调用 */
  handlerInvoked: boolean;
  /** 旧 handler 执行结果 */
  handlerResult: boolean;
  /** 执行日志 */
  logs: string[];
  /** 执行时间戳 */
  timestamp: number;
  /** 目标玩家ID列表 */
  targetIds: number[];
}

// ============================================================
// 前置校验
// ============================================================

/**
 * 系统性前置校验：在所有能力执行前运行
 * 检查顺序：死亡 → 中毒/醉酒 → 保护 → 其他
 */
export function preProcessAbility(
  actor: Seat,
  _allSeats: Seat[],
  _nightInfo: NightInfoResult
): AbilityPreCheckResult {
  // 1. 死亡检查
  if (actor.isDead && !actor.hasAbilityEvenDead) {
    return {
      blocked: true,
      reason: `${actor.playerName || `玩家${actor.id + 1}`} 已死亡，能力被跳过`,
      severity: "warning",
    };
  }

  // 2. 中毒/醉酒检查
  if (isActorDisabledByPoisonOrDrunk(actor)) {
    return {
      blocked: false, // 中毒不阻止执行，但标记为需提供假信息
      reason: `${actor.playerName || `玩家${actor.id + 1}`} 处于中毒/醉酒状态`,
      severity: "info",
    };
  }

  return { blocked: false, severity: "info" };
}

/**
 * 验证前置条件是否满足（硬性阻断）
 * 如果返回 blocked=true，能力应该被跳过
 */
export function validateAbilityPreConditions(
  actor: Seat,
  _targetIds: number[],
  allSeats: Seat[]
): AbilityPreCheckResult {
  // 死亡玩家不能行动
  if (actor.isDead && !actor.hasAbilityEvenDead) {
    return {
      blocked: true,
      reason: `玩家 ${actor.id + 1} 已死亡，跳过行动`,
      severity: "error",
    };
  }

  // 检查茶艺师保护（对杀人/恶性的能力）
  if (hasTeaLadyProtection(actor, allSeats)) {
    // 茶艺师保护只针对死亡，不阻止能力执行本身
    // 这里只是记录，下层逻辑会处理
  }

  return { blocked: false, severity: "info" };
}

// ============================================================
// 后置处理
// ============================================================

/**
 * 系统性后置处理：在所有能力执行后运行
 * 发布事件、触发连锁反应、记录日志
 */
export function postProcessAbility(
  roleId: string,
  actorId: number,
  targetIds: number[],
  success: boolean,
  addLog: (message: string) => void
): void {
  // 1. 发布能力执行完成事件
  unifiedEventBus.emit("ability:resolved", {
    seatId: actorId,
    roleId,
    abilityId: `${roleId}:ability`,
    success,
    result: { targetIds },
  });

  // 2. 记录执行日志（仅控制台，不写入游戏日志以免干扰UI）
  if (success) {
    console.log(
      `[能力执行] ${roleId} 的夜间行动完成，目标: ${targetIds.length > 0 ? targetIds.map((t) => `玩家${t + 1}`).join(", ") : "无目标"}`
    );
  }
}

// ============================================================
// 统一执行器
// ============================================================

/**
 * 统一能力执行函数
 * 替代直接调用 nightActionHandler.handleNightAction()
 *
 * 旧的执行路径：
 *   useGameController → handleNightAction() → 旧 handler
 *
 * 新的执行路径：
 *   useGameController → executeNightAbility() → preProcess → handleNightAction() → postProcess
 *   handleNightAction 现已支持回退到新引擎中间件管道（异步）
 *
 * @param handlerFn 旧系统的 handleNightAction 函数（可同步或异步）
 * @param context handler 需要的上下文
 * @returns 执行报告（Promise 包裹）
 */
export async function executeNightAbility(
  handlerFn: (context: NightActionHandlerContext) => boolean | Promise<boolean>,
  context: NightActionHandlerContext
): Promise<AbilityExecutionReport> {
  const { nightInfo, seats, selectedTargets } = context;
  const roleId = nightInfo?.effectiveRole?.id || "unknown";
  const actorSeat = nightInfo?.seat;

  const report: AbilityExecutionReport = {
    roleId,
    seatId: actorSeat?.id ?? -1,
    success: false,
    preCheck: { blocked: false, severity: "info" },
    handlerInvoked: false,
    handlerResult: false,
    logs: [],
    timestamp: Date.now(),
    targetIds: selectedTargets || [],
  };

  // Step 1: 前置校验
  if (actorSeat) {
    report.preCheck = preProcessAbility(actorSeat, seats, nightInfo);

    if (report.preCheck.blocked) {
      console.log(`[系统] ⚠️ ${report.preCheck.reason || "能力被跳过"}`);
      report.logs.push(report.preCheck.reason || "能力被前置校验阻止");
      if (trackingEnabled) globalExecutionReports.push(report);
      return report;
    }
  }

  // Step 2: 验证硬性前置条件
  if (actorSeat) {
    const hardCheck = validateAbilityPreConditions(
      actorSeat,
      selectedTargets,
      seats
    );
    if (hardCheck.blocked) {
      context.addLog(
        `[系统] 🚫 ${hardCheck.reason || "前置条件不满足，跳过能力执行"}`
      );
      report.logs.push(hardCheck.reason || "前置条件不满足");
      if (trackingEnabled) globalExecutionReports.push(report);
      return report;
    }
  }

  // Step 3: 执行 handler（支持同步旧 handler 和异步新引擎能力）
  report.handlerInvoked = true;

  try {
    const handlerResult = handlerFn(context);
    // 处理异步 handler（新引擎桥接）和同步 handler（旧系统）
    if (handlerResult instanceof Promise) {
      report.handlerResult = await handlerResult;
    } else {
      report.handlerResult = handlerResult;
    }
    report.success = report.handlerResult;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "未知执行错误";
    console.error(`[系统] ❌ 能力执行异常: ${errorMsg}`);
    report.success = false;
    report.logs.push(`执行异常: ${errorMsg}`);
    if (trackingEnabled) globalExecutionReports.push(report);
    return report;
  }

  // Step 4: 后置处理
  if (report.handlerInvoked) {
    postProcessAbility(
      roleId,
      actorSeat?.id ?? -1,
      selectedTargets,
      report.success,
      context.addLog
    );
  }

  if (trackingEnabled) globalExecutionReports.push(report);
  return report;
}

// ============================================================
// 游戏状态不变性验证
// ============================================================

/**
 * 完整验证游戏状态一致性
 * 在每次能力执行前后调用，捕获状态不一致问题
 * 这是血染钟楼的通用游戏规则断言，不依赖特定角色逻辑
 */
export function validateGameStateConsistency(seats: Seat[]): string[] {
  const violations: string[] = [];

  // 不变性 1: 总玩家人数守恒
  const aliveCount = seats.filter((s) => !s.isDead).length;
  const deadCount = seats.filter((s) => s.isDead).length;
  if (aliveCount + deadCount !== seats.length) {
    violations.push(
      `人数不一致: 存活(${aliveCount}) + 死亡(${deadCount}) ≠ 总人数(${seats.length})`
    );
  }

  // 不变性 2: 存活恶魔只能有一个
  const aliveDemons = seats.filter(
    (s) => !s.isDead && (s.role?.type === "demon" || s.isDemonSuccessor)
  );
  if (aliveDemons.length > 1) {
    violations.push(`恶魔数量异常: 存在 ${aliveDemons.length} 个存活恶魔`);
  }

  // 不变性 3: 死亡玩家不应该有保护标记
  const deadWithProtection = seats.filter(
    (s) => s.isDead && (s.isProtected || s.protectedBy)
  );
  for (const seat of deadWithProtection) {
    violations.push(`保护标记异常: 已死亡玩家 ${seat.id + 1} 仍有保护标记`);
  }

  // 不变性 4: 存活玩家必须有角色
  const aliveWithoutRole = seats.filter((s) => !s.isDead && !s.role);
  for (const seat of aliveWithoutRole) {
    violations.push(`角色缺失: 存活玩家 ${seat.id + 1} 没有角色`);
  }

  // 不变性 5: 标记死亡(isDead)和标记死亡状态(isDead true)的玩家应该一致
  // 检查 isDead、status 中是否包含死亡
  for (const seat of seats) {
    const hasDeathStatus = (seat.statuses || []).some(
      (s) => s.effect === "Dead"
    );
    if (seat.isDead && !hasDeathStatus) {
      // 有些角色死亡可能没有状态标记，这可能是合理的
      // 但反过来（有死亡状态但不标记 isDead）就是问题
    }
    if (!seat.isDead && hasDeathStatus) {
      violations.push(
        `状态不一致: 玩家 ${seat.id + 1} 状态标记为死亡但 isDead=false`
      );
    }
  }

  // 不变性 6: 死亡玩家不应在唤醒队列中（如果队列数据可用）
  // 此检查在调用方处理

  // 记录违反
  for (const violation of violations) {
    if (trackingEnabled) globalStateViolations.push(violation);
  }

  return violations;
}

/**
 * 生成执行摘要报告（用于调试和日志）
 */
export function generateExecutionSummary(): string {
  const reports = getExecutionReports();
  const violations = getStateViolations();

  const lines: string[] = [];
  lines.push("=".repeat(60));
  lines.push("能力执行摘要报告");
  lines.push("=".repeat(60));
  lines.push(`总执行次数: ${reports.length}`);
  lines.push(`状态违反次数: ${violations.length}`);
  lines.push("");

  const blocked = reports.filter((r) => r.preCheck.blocked);
  const failed = reports.filter((r) => r.handlerInvoked && !r.handlerResult);
  const errored = reports.filter((r) => r.handlerInvoked && !r.success);

  if (blocked.length > 0) {
    lines.push(`--- 被前置校验阻止 (${blocked.length}) ---`);
    for (const r of blocked) {
      lines.push(`  [${r.roleId}] 玩家${r.seatId + 1}: ${r.preCheck.reason}`);
    }
  }

  if (failed.length > 0) {
    lines.push(`--- handler 执行失败 (${failed.length}) ---`);
    for (const r of failed) {
      lines.push(`  [${r.roleId}] 玩家${r.seatId + 1}: handler 返回 false`);
    }
  }

  if (errored.length > 0) {
    lines.push(`--- 执行异常 (${errored.length}) ---`);
    for (const r of errored) {
      lines.push(`  [${r.roleId}] 玩家${r.seatId + 1}: 异常`);
    }
  }

  if (violations.length > 0) {
    lines.push(`--- 状态违反 (${violations.length}) ---`);
    for (const v of violations) {
      lines.push(`  ${v}`);
    }
  }

  lines.push("=".repeat(60));
  return lines.join("\n");
}

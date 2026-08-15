/**
 * 全局机制规则引擎（声明式，规则即数据）
 *
 * B 方案：跨角色"全局介入"机制统一为数据声明 + 通用解释器。
 * - 能力文件声明 globalRules（见 IRoleAbility.globalRules）：
 *   { id, type, phase, order }
 * - 管线在固定阶段调用 applyRulesByPhase，按 type 分派解释器执行。
 * - 新增全局角色 = 只在能力文件加一条数据声明，管线零改动。
 *
 * 已支持的规则类型：
 * 1. target_redirect — 目标重定向（掮客）：snapshot.brokerSwap 存在时，
 *    任何能力选择 a/b 之一 → 改为选中另一名（掮客自身豁免）。
 * 2. info_override — 信息替换（酿酒师）：snapshot.brewerEffect 存在且
 *    当前信息角色 roleId 匹配 → 结果替换为 message 并消耗 effect。
 * 3. target_collect — 目标收集（引路人）：每个邪恶阵营角色（恶魔/爪牙/被转化）
 *    实际执行后，把目标推入 snapshot.nightEvilTargets。
 *
 * 网页版适配：桌游"提示标记"统一为快照数据（brokerSwap/brewerEffect/
 * nightEvilTargets），UI 层读取渲染控制台日志与行动弹窗。
 */
import type {
  GlobalRule,
  GlobalRulePhase,
} from "../roles/core/roleAbility.types";
import {
  getRawAbilityMap,
  initializeAbilityRegistry,
} from "../roles/new_engine/abilityRegistry";
import type { MiddlewareContext } from "./middlewareTypes";

// ─── 规则收集（注册表扫描 + 模块级缓存）────────────────────────────────

let _rulesCache: GlobalRule[] | null = null;

/** 扫描能力注册表，收集全部 globalRules 声明（含 owner 与 order 排序） */
export function collectGlobalRules(): GlobalRule[] {
  if (_rulesCache) return _rulesCache;
  initializeAbilityRegistry();
  const map = getRawAbilityMap() as Record<string, any>;
  const rules: GlobalRule[] = [];
  for (const ability of Object.values(map)) {
    for (const r of ability.globalRules ?? []) {
      rules.push({ ...r, owner: ability.roleId });
    }
  }
  rules.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
  _rulesCache = rules;
  return rules;
}

/** 测试环境重置缓存（能力注册表变更后调用） */
export function resetGlobalRulesCache(): void {
  _rulesCache = null;
}

// ─── 规则类型解释器 ────────────────────────────────────────────────────

/** target_redirect：掮客目标重定向 */
function redirectTargets(ctx: MiddlewareContext): MiddlewareContext {
  const swap = ctx.snapshot?.brokerSwap as
    | { a: number | null; b: number | null }
    | undefined;
  if (!swap || swap.a == null || swap.b == null) return ctx;
  // 掮客自身的能力不参与重定向（避免自指循环）
  if (ctx.actionNode?.roleId === "broker") return ctx;
  const targets = ctx.targetIds ?? [];
  if (targets.length === 0) return ctx;

  let changed = false;
  const redirected: number[] = targets.map((t) => {
    if (t === swap.a) {
      changed = true;
      return swap.b as number;
    }
    if (t === swap.b) {
      changed = true;
      return swap.a as number;
    }
    return t;
  });
  if (!changed) return ctx;
  return { ...ctx, targetIds: redirected };
}

/** info_override：酿酒师信息替换 */
function overrideInfo(ctx: MiddlewareContext): MiddlewareContext {
  const effect = ctx.snapshot?.brewerEffect as
    | { roleId: string; message: string }
    | undefined;
  if (!effect?.roleId || !effect.message) return ctx;
  if (ctx.actionNode?.roleId !== effect.roleId) return ctx;

  const meta = ctx.meta ?? {};
  const hasInfoText =
    meta.displayInfo !== undefined ||
    typeof meta.prompt === "string" ||
    meta.abilityResult !== undefined ||
    meta.abilityLog !== undefined;
  if (!hasInfoText) return ctx;

  // 替换信息产物 + 清除 brewerEffect（本次已消耗；预览模式不清除）
  const nextSnapshot = ctx.preview
    ? ctx.snapshot
    : { ...ctx.snapshot, brewerEffect: undefined };
  return {
    ...ctx,
    snapshot: nextSnapshot,
    meta: {
      ...meta,
      displayInfo:
        meta.displayInfo !== undefined
          ? { type: "brewer_override", message: effect.message }
          : meta.displayInfo,
      brewerOverride: effect.message,
      abilityResult:
        meta.abilityResult !== undefined
          ? { ...(meta.abilityResult as any), brewerOverride: effect.message }
          : meta.abilityResult,
    },
  };
}

/** 判定座位是否属于邪恶阵营（与 gameRules.isEvil 语义一致，避免循环依赖） */
function isEvilSeat(seat: any): boolean {
  if (!seat?.role) return false;
  if (seat.isGoodConverted) return false;
  return (
    seat.isEvilConverted === true ||
    seat.role.type === "demon" ||
    seat.role.type === "minion" ||
    seat.isDemonSuccessor === true
  );
}

/** target_collect：引路人邪恶目标收集 */
function collectEvilTargets(ctx: MiddlewareContext): MiddlewareContext {
  // 预览模式不收集（预览不产生实际效果）
  if (ctx.preview) return ctx;
  const node = ctx.actionNode;
  if (!node) return ctx;
  const seat = ctx.snapshot.seats?.find((s: any) => s.id === node.seatId);
  if (!seat || !isEvilSeat(seat)) return ctx;

  const raw = [...(ctx.targetIds ?? []), ...(node.targetIds ?? [])].filter(
    (t) => t != null && Number.isFinite(t)
  ) as number[];
  if (raw.length === 0) return ctx;
  const existing = new Set<number>(ctx.snapshot.nightEvilTargets ?? []);
  let changed = false;
  for (const t of raw) {
    if (!existing.has(t)) {
      existing.add(t);
      changed = true;
    }
  }
  if (!changed) return ctx;
  return {
    ...ctx,
    snapshot: { ...ctx.snapshot, nightEvilTargets: [...existing] },
  };
}

const INTERPRETERS: Record<string, (ctx: MiddlewareContext) => MiddlewareContext> = {
  target_redirect: redirectTargets,
  info_override: overrideInfo,
  target_collect: collectEvilTargets,
};

// ─── 统一入口 ──────────────────────────────────────────────────────────

/**
 * 应用指定阶段的所有全局规则（管线在固定阶段调用）。
 * 未知规则类型直接跳过（由 I10 不变式保证声明合法性）。
 */
export function applyRulesByPhase(
  rules: GlobalRule[],
  phase: GlobalRulePhase,
  ctx: MiddlewareContext
): MiddlewareContext {
  let c = ctx;
  for (const rule of rules) {
    if (rule.phase !== phase) continue;
    const fn = INTERPRETERS[rule.type];
    if (!fn) continue;
    c = fn(c);
  }
  return c;
}

/** 便捷入口：收集 + 应用指定阶段规则 */
export function applyGlobalRulesByPhase(
  phase: GlobalRulePhase,
  ctx: MiddlewareContext
): MiddlewareContext {
  return applyRulesByPhase(collectGlobalRules(), phase, ctx);
}

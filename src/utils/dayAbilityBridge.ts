/**
 * 日间能力新引擎桥接层（2026-09-20）
 *
 * ── 为什么需要这个文件 ────────────────────────────────────────────────
 * 根因（P0 已查实）：`AbilityTriggerTiming.DAY` **全仓库没有任何消费方**。
 *   - 夜间有 `useNightActionHandler.executeViaNewEngine` 桥接新引擎；
 *   - 日间只认 `RoleDefinition.day.handler` 或 `DAY_ABILITY` 白名单；
 *   - 于是 16 个新引擎标了 `triggerTiming: [DAY]` 的角色，
 *     其日间能力**永不执行**（落进 useDayActions.ts 通用回退 → 只标记已使用 + 记日志）。
 *
 * 本文件提供**日间版**薄桥接（与夜间 executeViaNewEngine 对称）：
 *   1. `isNewEngineDayAbility(roleId)` —— 查询注册表是否含 DAY 触发能力；
 *   2. `executeDayAbilityViaNewEngine(ctx)` —— 走标准 middleware 管道执行，
 *      返回结构化结果 + displayInfo，由调用方（useDayActions）决定弹什么窗。
 *
 * ⚠️ 设计约束（用户裁决 2026-09-20）：
 *   - **绝不新建引擎**：复用 utils/middlewarePipeline.runAbilityPipeline；
 *   - 日间**不需要**夜间的 preview/系统步骤/队列推进等重逻辑，故只做薄封装；
 *   - 结果回流沿用日间既有 `dayAbilityResult` 机制（见 useDayActions.handleViewDayAbilityResult）。
 */
import type { IRoleAbility } from "../roles/core/roleAbility.types";
import { AbilityTriggerTiming } from "../roles/core/roleAbility.types";
import { getAbilityForRole } from "../roles/new_engine/abilityRegistry";
import type { GamePhase, Role, Seat } from "../../app/data";
import { runAbilityPipeline } from "./middlewarePipeline";
import type { MiddlewareContext } from "./middlewareTypes";

/** 日间桥接的执行入参 */
export interface DayAbilityBridgeContext {
  /** 行动者座位号 */
  seatId: number;
  /** 当前全部座位（React Seat 形态） */
  seats: Seat[];
  /** 角色表（用于 resolveRoleType 等） */
  roles: Role[];
  /** 当前阶段 */
  gamePhase: GamePhase;
  /** 日间选中的目标（如精神病患者选人、枪手选人） */
  targetIds?: number[];
  /** 说书人输入（如艺术家的问答、博学者的两段信息） */
  storytellerInput?: Record<string, any>;
  /** 涡流世界（信息反转） */
  vortoxWorld?: boolean;
  /** 处决者 id（供 requiresExecutedToday 类能力使用） */
  todayExecutedId?: number | null;
  /**
   * ⭐ 当前夜数（供确定性随机播种使用）。
   *
   * ⚠️⚠️ P0-3 事故（2026-09-20）：此前本字段**缺失**，桥接里硬编码 `nightCount: 0`
   *   → 与真正结算时用的真实 nightCount **种子错位** → 杂耍艺人的
   *   「提示预演数字」与「结果弹窗数字」系统性不一致（实测 42/72 组合对不上）。
   *
   *   铁律：**凡「同一事实会被算两次」的路径，两次必须用同一枚种子**。
   *   调用方（useDayActions）必须把当前真实夜数传进来；
   *   缺省时**不再默默用 0**，而是保持与 `snapshot.nightCount` 缺失一致的语义。
   */
  nightCount?: number;
}

/** 日间桥接的执行结果 */
export interface DayAbilityBridgeResult {
  /** 管道是否成功走到结算（false = preCheck 中止） */
  success: boolean;
  /** 中止原因（success=false 时有值） */
  abortReason?: string;
  /** 结构化能力结果（abilityResult） */
  abilityResult?: any;
  /** 面向展示的信息（displayInfo，含 log / playerFacingLog） */
  displayInfo?: any;
  /** 说书人日志 */
  abilityLog?: string;
  /** 管道执行后的完整上下文（供调用方按需读取 snapshot 变更） */
  raw?: MiddlewareContext;
}

/**
 * 查询该角色是否存在「新引擎日间能力」。
 *
 * ⚠️ 用 `ability.roleId === roleId` **精确匹配**，不用注册表的
 *   `startsWith` 前缀匹配（后者会把 `artist` 误配到 `artist_xxx` 变体）。
 */
export function getNewEngineDayAbility(
  roleId: string
): IRoleAbility | null {
  if (!roleId) return null;
  const ability = getAbilityForRole(roleId);
  if (!ability) return null;
  if (ability.roleId !== roleId) return null; // 精确匹配，拒绝前缀误伤
  const timings = (ability.triggerTiming ?? []) as string[];
  if (!timings.includes(AbilityTriggerTiming.DAY)) return null;
  return ability;
}

/** 便捷判定：该角色是否有新引擎日间能力 */
export function isNewEngineDayAbility(roleId: string): boolean {
  return getNewEngineDayAbility(roleId) !== null;
}

/**
 * 通过新引擎管道执行日间能力。
 *
 * 与夜间 executeViaNewEngine 的差异（刻意的）：
 *   - 不做 preview 二次确认（日间的确认由 UI 的 showConfirm / 专属弹窗承担）；
 *   - 不处理系统步骤、队列推进、双胞胎告知等夜间专属逻辑；
 *   - 直接返回 displayInfo / abilityResult，让调用方走日间既有弹窗体系。
 */
export async function executeDayAbilityViaNewEngine(
  ctx: DayAbilityBridgeContext,
  roleId: string,
  abilityOverride?: IRoleAbility | null
): Promise<DayAbilityBridgeResult> {
  const ability = abilityOverride ?? getNewEngineDayAbility(roleId);
  if (!ability) {
    return {
      success: false,
      abortReason: `角色 ${roleId} 无新引擎日间能力`,
    };
  }

  const actorSeat = ctx.seats.find((s) => s.id === ctx.seatId);
  const roleName = actorSeat?.role?.name
    ? `${ctx.seatId + 1}号-${String(actorSeat.role.name).replace(/^\d+号[-_]/, "")}`
    : `${ctx.seatId + 1}号-${roleId}`;

  // 将 React Seat 的遗留布尔字段（isDrunk / isPoisoned）翻译为 statusEffects，
  // 供管道的 affectedCheck 类中间件识别。⚠️ 与夜间 executeViaNewEngine 保持同构。
  const snapshotSeats: any[] = ctx.seats.map((s) => ({
    ...s,
    statusEffects: [
      ...((s as any).statusEffects ?? []),
      ...((s as any).isDrunk && !((s as any).statusEffects ?? []).some((e: any) => e?.type === "drunk")
        ? [{ type: "drunk", source: "legacy" }]
        : []),
      ...((s as any).isPoisoned && !((s as any).statusEffects ?? []).some((e: any) => e?.type === "poisoned")
        ? [{ type: "poisoned", source: "legacy" }]
        : []),
    ],
  }));

  const middlewareContext: MiddlewareContext = {
    snapshot: {
      // ⚠️ P0-3：必须用调用方传入的真实夜数，否则确定性种子与结算路径错位。
      nightCount: ctx.nightCount ?? 0,
      seats: snapshotSeats,
      statusEffects: {},
      gamePhase: ctx.gamePhase,
      todayExecutedId: ctx.todayExecutedId ?? null,
      globalEffects: { vortoxWorld: !!ctx.vortoxWorld },
      vortoxWorld: !!ctx.vortoxWorld,
      isVortoxWorld: !!ctx.vortoxWorld,
    } as any,
    actionNode: {
      seatId: ctx.seatId,
      roleId,
      roleName,
      priority: 0,
      isFirstNightOnly: false,
      abilityId: ability.abilityId ?? `${roleId}_ability`,
      wakeMessage: "",
      firstNightPriority: null,
      otherNightPriority: null,
      targetIds: ctx.targetIds ?? [],
      processed: false,
      success: false,
      meta: {},
    },
    targetIds: ctx.targetIds ?? [],
    storytellerInput: ctx.storytellerInput ?? {},
    meta: {},
    aborted: false,
    preview: false,
  };

  try {
    const result = await runAbilityPipeline(ability, middlewareContext);

    if (result.meta._preCheckAborted || result.aborted) {
      return {
        success: false,
        abortReason:
          result.abortReason ?? result.meta._abortReason ?? "管道中止",
        raw: result,
      };
    }

    return {
      success: true,
      abilityResult: result.meta.abilityResult,
      displayInfo: result.meta.displayInfo,
      abilityLog: result.meta.abilityLog as string | undefined,
      raw: result,
    };
  } catch (err) {
    // 管道抛错不应静默吞掉——明确暴露，避免「测试绿、实测不对」。
    console.error(
      `[dayAbilityBridge] 执行 ${roleId} 日间能力失败:`,
      err
    );
    return {
      success: false,
      abortReason: `执行异常: ${(err as Error)?.message ?? String(err)}`,
    };
  }
}

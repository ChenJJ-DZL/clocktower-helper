/**
 * 帝国守卫（Imperial Guard）新引擎技能实现
 *
 * 【角色能力】"每夜，选择一名玩家。如果该玩家是恶魔，其能力不会在今晚生效。"
 *
 * 每夜选择一名玩家进行监视。如果目标玩家是恶魔，恶魔的能力在今晚被压制。
 * targetConfig: min:1, max:1 — 必须选择恰好一名玩家。
 * 结果标记：imperialGuardTarget — 上层引擎在结算时检查此标记。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const seat = ctx.snapshot.seats.find(
    (s: any) => s.id === ctx.actionNode.seatId
  );
  if (!seat?.isAlive) return { ...ctx, aborted: true, abortReason: "已死亡" };
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const targetId = ctx.targetIds?.[0] ?? null;
  const target =
    targetId != null
      ? ctx.snapshot.seats.find((s: any) => s.id === targetId)
      : undefined;
  const isDemon =
    target?.role?.type === "demon" || target?.roleType === "demon";

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetId,
        isDemon,
        guardActive: targetId !== null,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.guardActive) return ctx;

  // 标记 imperialGuardTarget，上层恶魔能力结算时检查此标记
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      imperialGuardTarget: r.targetId,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        imperialGuard: r,
      },
    },
    meta: { ...ctx.meta, imperialGuardResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const targetLabel = r?.targetId != null ? `${r.targetId + 1}号` : "无目标";
  const demonTag = r?.isDemon ? "（恶魔！能力将在今晚被压制）" : "（非恶魔）";
  const log = `[帝国守卫] 监视 ${targetLabel}${demonTag}`;
  console.log(log);

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【帝国守卫】，选择一名玩家进行监视。`,
      abilityLog: log,
    },
  };
};

export const imperial_guardAbility = createRoleAbility({
  /** 帝国守卫（Imperial Guard）标识符 */
  roleId: "imperial_guard",
  /** 能力标识符 */
  abilityId: "imperial_guard_monitor",
  /** 能力中文名 */
  abilityName: "恶魔监视",

  /** 触发时机：每夜 */
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  /** 唤醒优先级（较早行动） */
  firstNightPriority: null,
  otherNightPriority: null,
  /** 首夜不行动 */
  firstNightOnly: false,
  /** 唤醒提示词 ID */
  wakePromptId: "role.imperial_guard.wake",

  /**
   * 目标选择配置
   * min: 1, max: 1 — 必须选择恰好一名玩家
   * allowSelf: false — 不可选自己
   * allowDead: false — 不可选已死亡玩家
   */
  targetConfig: {
    min: 1,
    max: 1,
    allowSelf: false,
    allowDead: false,
  },

  /** preCheck：存活检测 */
  preCheck: [preCheck],
  /** calculate：确定监视目标，检测是否为恶魔 */
  calculate: [calculate],
  /** stateUpdate：标记 imperialGuardTarget */
  stateUpdate: [stateUpdate],
  /** postProcess：日志与提示词 */
  postProcess: [postProcess],
});

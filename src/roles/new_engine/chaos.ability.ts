/**
 * 混沌（Chaos）新引擎技能实现
 *
 * 【角色能力】"每夜，你可以让2名玩家死亡。如果死亡人数不是2，邪恶获胜。"
 *
 * 每夜选择两名玩家作为死亡目标。如果在黎明结算时死亡人数不是恰好2人，
 * 则邪恶方获胜（游戏状态检查由上层引擎处理）。
 * targetConfig: min:2, max:2 — 必须选择恰好两名玩家。
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
  const target1 = ctx.targetIds?.[0] ?? null;
  const target2 = ctx.targetIds?.[1] ?? null;

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        target1,
        target2,
        markedForDeath: target1 !== null && target2 !== null,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.markedForDeath) return ctx;

  const updatedSeats = [...ctx.snapshot.seats];
  const markTarget = (id: number | null) => {
    if (id === null) return;
    const idx = updatedSeats.findIndex((s: any) => s.id === id);
    if (idx !== -1) {
      updatedSeats[idx] = {
        ...updatedSeats[idx],
        markedForDeath: true,
        deathSource: "chaos_kill",
        deathSourceSeatId: ctx.actionNode.seatId,
      };
    }
  };

  markTarget(r.target1);
  markTarget(r.target2);

  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      seats: updatedSeats,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        chaos: r,
      },
    },
    meta: { ...ctx.meta, chaosResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const target1Label = r?.target1 != null ? `${r.target1 + 1}号` : "无";
  const target2Label = r?.target2 != null ? `${r.target2 + 1}号` : "无";
  const log = `[混沌] 击杀目标：${target1Label}、${target2Label}`;
  console.log(log);

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【混沌】，选择两名玩家杀害。`,
      abilityLog: log,
    },
  };
};

export const chaosAbility = createRoleAbility({
  /** 混沌（Chaos）标识符 */
  roleId: "chaos",
  /** 能力标识符 */
  abilityId: "chaos_kill",
  /** 能力中文名 */
  abilityName: "混沌双杀",

  /** 触发时机：每夜 */
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  /** 唤醒优先级（恶魔通常在夜末尾行动） */
  wakePriority: 48,
  /** 首夜不唤醒 */
  firstNightOnly: false,
  /** 唤醒提示词 ID */
  wakePromptId: "role.chaos.wake",

  /**
   * 目标选择配置
   * min: 2, max: 2 — 必须选择恰好两名玩家
   * allowSelf: false — 不可选自己
   * allowDead: false — 不可选已死亡玩家
   */
  targetConfig: {
    min: 2,
    max: 2,
    allowSelf: false,
    allowDead: false,
  },

  /** preCheck：存活检测 */
  preCheck: [preCheck],
  /** calculate：确定两名死亡目标 */
  calculate: [calculate],
  /** stateUpdate：标记目标为 markedForDeath */
  stateUpdate: [stateUpdate],
  /** postProcess：日志与提示词 */
  postProcess: [postProcess],
});

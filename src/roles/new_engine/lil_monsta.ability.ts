/**
 * 小怪物（Lil' Monsta）新引擎技能实现
 *
 * 【角色能力】"每个夜晚，除小怪物外的所有邪恶玩家可以选择谁获得小怪物标记。"
 *
 * 每个夜晚，所有邪恶玩家（除当前持有者外）共同决定谁持有小怪物标记。
 * 持有者在夜晚代表小怪物行动（杀人）。
 * 标记 lilMonstaHolder 到 snapshot，供恶魔行动系统查询。
 * targetConfig: min:0, max:0 — 选标记由邪恶阵营内部投票决定，不通过标准选目标。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  // 小怪物持有者可能已经死亡，但能力传递仍可能发生
  // 不做存活检查，由上层引擎管理
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  // 持有者信息通过 storytellerInput 传入（邪恶阵营投票结果）
  const holderId = ctx.storytellerInput?.lilMonstaHolder as number | undefined;

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        holderId: holderId ?? null,
        hasHolder: holderId !== undefined,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.hasHolder) return ctx;

  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      lilMonstaHolder: r.holderId,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        lilMonsta: r,
      },
    },
    meta: { ...ctx.meta, lilMonstaResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const holderLabel = r?.holderId != null ? `${r.holderId + 1}号` : "无";
  const log = `[小怪物] 标记传递至 ${holderLabel}`;
  console.log(log);

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `邪恶阵营选择谁获得【小怪物】标记。（当前持有者：${holderLabel}）`,
      abilityLog: log,
    },
  };
};

export const lil_monstaAbility = createRoleAbility({
  /** 小怪物（Lil' Monsta）标识符 */
  roleId: "lil_monsta",
  /** 能力标识符 */
  abilityId: "lil_monsta_pass",
  /** 能力中文名 */
  abilityName: "恶魔标记传递",

  /** 触发时机：每夜 */
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  /** 唤醒优先级（早些唤醒让邪恶阵营投票） */
  firstNightPriority: null,
  otherNightPriority: null,
  /** 首夜也唤醒 */
  firstNightOnly: false,
  /** 唤醒提示词 ID */
  wakePromptId: "role.lil_monsta.wake",

  /**
   * 目标选择配置
   * min: 0, max: 0 — 标记传递由邪恶阵营投票决定
   * 结果通过 storytellerInput.lilMonstaHolder 传入
   */
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },

  /** preCheck：无前置校验 */
  preCheck: [preCheck],
  /** calculate：读取持有者投票结果 */
  calculate: [calculate],
  /** stateUpdate：持久化 lilMonstaHolder */
  stateUpdate: [stateUpdate],
  /** postProcess：日志与提示词 */
  postProcess: [postProcess],
});

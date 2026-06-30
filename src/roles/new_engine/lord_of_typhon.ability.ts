/**
 * 泰冯领主（Lord of Typhon）新引擎技能实现
 *
 * 【角色能力】"邪恶玩家互相认识，且所有爪牙与泰冯领主相邻而坐。"
 *
 * 被动能力，在游戏初始化时生效：
 * - 邪恶玩家互相认识（通过额外 minion 分配实现相邻）
 * - 所有爪牙必须与泰冯领主相邻而坐
 * 标记 typhonActive 到 snapshot，供座位分配系统和邪恶阵营识别使用。
 * targetConfig: min:0, max:0 — 被动能力，无目标选择。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  // 被动能力，无需前置校验
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  // 额外 minion 数量由游戏设置决定（通常为 2）
  const extraMinions = ctx.storytellerInput?.typhonExtraMinions ?? 2;

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        typhonActive: true,
        extraMinions,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;

  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      typhonActive: r?.typhonActive ?? true,
      typhonExtraMinions: r?.extraMinions ?? 2,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        typhon: r,
      },
    },
    meta: { ...ctx.meta, typhonResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const extraMinions = (ctx.meta.abilityResult as any)?.extraMinions ?? 2;
  const log = `[泰冯领主] 已激活：额外${extraMinions}名爪牙，爪牙与泰冯领主相邻而坐`;
  console.log(log);

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: "",
      abilityLog: log,
    },
  };
};

export const lord_of_typhonAbility = createRoleAbility({
  /** 泰冯领主（Lord of Typhon）标识符 */
  roleId: "lord_of_typhon",
  /** 能力标识符 */
  abilityId: "lord_of_typhon_passive",
  /** 能力中文名 */
  abilityName: "邪恶相邻",

  /** 触发时机：被动 */
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  /** 唤醒优先级（被动能力为 0） */
  firstNightPriority: 2,
  otherNightPriority: 55,
  /** 非首夜专属 */
  firstNightOnly: false,
  /** 被动能力，无唤醒提示词 */
  wakePromptId: "",

  /**
   * 目标选择配置
   * min: 0, max: 0 — 被动能力，无目标选择
   */
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },

  /** preCheck：无前置校验 */
  preCheck: [preCheck],
  /** calculate：确定额外 minion 数量 */
  calculate: [calculate],
  /** stateUpdate：持久化 typhonActive 标记 */
  stateUpdate: [stateUpdate],
  /** postProcess：日志 */
  postProcess: [postProcess],
});

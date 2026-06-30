/**
 * 水蛭（Lleech）新引擎技能实现
 *
 * 【角色能力】"每夜，选择一名玩家。水蛭与该玩家绑定，若该玩家死亡则水蛭也死亡。"
 *
 * 每夜选择一名玩家作为宿主。水蛭与宿主绑定共生：
 * - 宿主存活则水蛭存活
 * - 宿主死亡则水蛭也死亡
 * 标记 lleechHost 到 snapshot，供死亡结算系统检查绑定关系。
 * targetConfig: min:1, max:1 — 必须选择恰好一名玩家。
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
  const hostId = ctx.targetIds?.[0] ?? null;

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        hostId,
        hosted: hostId !== null,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.hosted) return ctx;

  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      lleechHost: r.hostId,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        lleech: r,
      },
    },
    meta: { ...ctx.meta, lleechResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const hostLabel = r?.hosted ? `${r.hostId + 1}号` : "无";
  const log = `[水蛭] 寄生于 ${hostLabel}，宿主死亡则水蛭随之死亡`;
  console.log(log);

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【水蛭】，选择一名玩家作为宿主。若宿主死亡，水蛭也随之死亡。`,
      abilityLog: log,
    },
  };
};

export const lleechAbility = createRoleAbility({
  /** 水蛭（Lleech）标识符 */
  roleId: "lleech",
  /** 能力标识符 */
  abilityId: "lleech_host",
  /** 能力中文名 */
  abilityName: "宿主绑定",

  /** 触发时机：每夜（首夜选择，之后每晚可更换） */
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  /** 唤醒优先级 */
  firstNightPriority: 27,
  otherNightPriority: 57,
  /** 首夜也唤醒 */
  firstNightOnly: false,
  /** 唤醒提示词 ID */
  wakePromptId: "role.lleech.wake",

  /**
   * 目标选择配置
   * min: 1, max: 1 — 必须选择恰好一名玩家作为宿主
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
  /** calculate：确定宿主目标 */
  calculate: [calculate],
  /** stateUpdate：持久化 lleechHost */
  stateUpdate: [stateUpdate],
  /** postProcess：日志与提示词 */
  postProcess: [postProcess],
});

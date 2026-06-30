/**
 * 异教徒（Heretic）新引擎技能实现
 *
 * 【角色能力】"当异教徒被处决时，邪恶阵营获胜。"
 *
 * 被动检测异教徒是否被处决。若检测到处决发生，标记 hereticExecuted，
 * 由上层逻辑根据此标志判定邪恶阵营获胜。
 * ABORT_NOT_ON_DEATH — 处决时玩家已死，但能力仍需触发
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  // 异教徒的能力在处决后触发，此时玩家已死亡，因此不拦截
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const seat = ctx.snapshot.seats.find(
    (s: any) => s.id === ctx.actionNode.seatId
  );
  const isExecuted =
    !seat?.isAlive &&
    ctx.snapshot.lastExecution?.seatId === ctx.actionNode.seatId;
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        hereticExecuted: !!isExecuted,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.hereticExecuted) return ctx;
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      hereticExecuted: true,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        heretic: r,
      },
    },
    meta: { ...ctx.meta, hereticResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const status = r?.hereticExecuted ? "被处决 → 邪恶阵营获胜" : "安全";
  const log = `[异教徒] ${status}`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: "检测异教徒处决状态。",
      abilityLog: log,
    },
  };
};

export const hereticAbility = createRoleAbility({
  roleId: "heretic",
  abilityId: "heretic_execution",
  abilityName: "异端审判",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: true },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

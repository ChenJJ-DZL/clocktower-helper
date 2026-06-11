/**
 * 殡葬师（Mortician）新引擎技能实现
 *
 * 【角色能力】"一名玩家死亡时，得知其角色。"
 *
 * 当有玩家死亡时，殡葬师获知该死亡玩家的真实角色。
 * 触发时机：每夜开始时检查当日死亡/处决的玩家。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const executedId =
    ctx.snapshot.executedToday ?? ctx.snapshot.executedSeatId ?? null;
  const deadSeat =
    executedId != null
      ? ctx.snapshot.seats.find((s: any) => s.id === executedId)
      : null;

  const roleName = deadSeat?.role?.name ?? "无";
  const roleId = deadSeat?.role?.id ?? "无";

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        deadPlayerId: executedId,
        roleName,
        roleId,
        morticianActive: true,
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
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        mortician: r,
      },
    },
    meta: { ...ctx.meta, morticianResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log = `[Mortician] ${r?.deadPlayerId != null ? `${r.deadPlayerId + 1}号死者角色为${r.roleName}` : "今日无死亡"}`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【殡葬师】，告知今日死者角色。`,
      abilityLog: log,
    },
  };
};

export const morticianAbility = createRoleAbility({
  roleId: "mortician",
  abilityId: "mortician_death",
  abilityName: "殡葬师",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 10,
  firstNightOnly: false,
  wakePromptId: "role.mortician.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [commonPreCheckAlive],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

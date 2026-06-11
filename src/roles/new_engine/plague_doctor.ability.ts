/**
 * 瘟疫医生（Plague Doctor）新引擎技能实现
 *
 * 【角色能力】"死亡时，感染一名玩家使其醉酒。"
 *
 * 瘟疫医生在死亡时触发能力，选择一名活着的玩家使其进入醉酒状态。
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
  if (seat?.isAlive)
    return { ...ctx, aborted: true, abortReason: "瘟疫医生尚未死亡" };
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const targetId = ctx.targetIds?.[0] ?? ctx.actionNode.targetIds?.[0] ?? null;
  return {
    ...ctx,
    meta: { ...ctx.meta, abilityResult: { targetId, infected: true } },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const newSeats = ctx.snapshot.seats.map((s: any) =>
    s.id === r?.targetId
      ? {
          ...s,
          statusEffects: [
            ...(s.statusEffects ?? []),
            { type: "drunk", source: "瘟疫医生" },
          ],
        }
      : s
  );
  return {
    ...ctx,
    snapshot: { ...ctx.snapshot, seats: newSeats },
    meta: { ...ctx.meta, plagueDoctorResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log = `[PlagueDoctor] 瘟疫医生感染了${(r?.targetId ?? -1) + 1}号玩家`;
  console.log(log);
  return { ...ctx, meta: { ...ctx.meta, abilityLog: log } };
};

export const plagueDoctorAbility = createRoleAbility({
  roleId: "plague_doctor",
  abilityId: "plague_doctor_infect",
  abilityName: "疫病传播",
  triggerTiming: [AbilityTriggerTiming.ON_DEATH],
  wakePriority: 41,
  firstNightOnly: false,
  wakePromptId: "role.plague_doctor.wake",
  targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

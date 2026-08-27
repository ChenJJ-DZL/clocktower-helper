/**
 * 哈迪哈（Al-Hadikhia）新引擎技能实现
 *
 * 【角色能力】"每个夜晚*，选择3名玩家。拂晓时，依次询问这3名玩家是否愿意存活。
 *   如果所有人都选择存活，则所有人死亡。如果有任何人选择死亡，则选择死亡的人死亡。"
 *
 * 夜间选3人 → 拂晓阶段依次进行"选生/选死"交互。
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
  const targetIds =
    ctx.targetIds?.length >= 3
      ? ctx.targetIds.slice(0, 3)
      : (ctx.actionNode.targetIds?.slice(0, 3) ?? []);

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetIds,
        validTargetCount: targetIds.length,
        alHadikhiaActive: true,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.targetIds?.length) return ctx;
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      alHadikhiaTargets: r.targetIds,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        al_hadikhia: r,
      },
    },
    meta: { ...ctx.meta, alHadikhiaResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const targets = (r?.targetIds ?? [])
    .map((id: number) => `${id + 1}号`)
    .join("、");
  const log = `[AlHadikhia] 哈迪哈选择: ${targets || "无"}`;
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityLog: log,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【哈迪哈】，选择3名玩家。`,
    },
  };
};

export const alHadikhiaAbility = createRoleAbility({
  roleId: "al_hadikhia",
  abilityId: "al_hadikhia_night",
  abilityName: "哈迪哈",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: null,
  otherNightPriority: 51,
  firstNightOnly: false,
  wakePromptId: "role.al_hadikhia.wake",
  targetConfig: { min: 3, max: 3, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

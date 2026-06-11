/**
 * 城镇公告员（Town Crier）新引擎技能实现
 *
 * 【角色能力】"每个夜晚*，你会得知在今天白天时是否有爪牙发起过提名。"
 *
 * 每夜得知白天是否有爪牙提名过。纯信息类能力。
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
  const effects =
    seat.statusEffects ?? ctx.snapshot.statusEffects?.[seat.id] ?? [];
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      isPoisoned: effects.some(
        (e: any) => e.type === "poisoned" || e.type === "drunk"
      ),
    },
  };
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const minionNominated = ctx.snapshot.minionNominatedToday ?? false;
  const isCorrupted = ctx.meta.isPoisoned === true;
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        minionNominated: isCorrupted ? !minionNominated : minionNominated,
      },
      isCorrupted,
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
        town_crier: r,
      },
    },
    meta: { ...ctx.meta, townCrierResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const tag = ctx.meta.isCorrupted ? "【受干扰】" : "";
  const status = r?.minionNominated ? "有爪牙提名" : "无爪牙提名";
  const log = `[TownCrier]${tag} ${status}`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【城镇公告员】，告知${status}。`,
      abilityLog: log,
      displayInfo: {
        type: "town_crier_info",
        minionNominated: r?.minionNominated,
        isCorrupted: ctx.meta.isCorrupted,
        log,
      },
    },
  };
};

export const town_crierAbility = createRoleAbility({
  roleId: "town_crier",
  abilityId: "town_crier_nightly",
  abilityName: "提名侦测",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 41,
  firstNightOnly: false,
  wakePromptId: "role.town_crier.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

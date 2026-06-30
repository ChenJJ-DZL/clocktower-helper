/**
 * 将军（General）新引擎技能实现
 *
 * 【角色能力】"你可以得知己方阵营当前的局势优劣。"
 *
 * 将军可以感知己方阵营的局势，了解善良与邪恶阵营谁占优势。
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
  const seats = ctx.snapshot.seats;
  const evil = seats.filter(
    (s: any) =>
      s.isAlive &&
      s.role &&
      (s.role.type === "minion" || s.role.type === "demon")
  ).length;
  const good = seats.filter(
    (s: any) =>
      s.isAlive &&
      s.role &&
      (s.role.type === "townsfolk" || s.role.type === "outsider")
  ).length;
  const status =
    evil > good ? "邪恶占优" : good > evil ? "善良占优" : "势均力敌";
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: { goodCount: good, evilCount: evil, status },
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
        general: r,
      },
    },
    meta: { ...ctx.meta, generalResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log = `[General] 将军感知局势：${r?.status ?? "未知"}（善${r?.goodCount ?? 0}:恶${r?.evilCount ?? 0}）`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityLog: log,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【将军】，告知当前局势：${r?.status ?? "未知"}。`,
    },
  };
};

export const generalAbility = createRoleAbility({
  roleId: "general",
  abilityId: "general_status",
  abilityName: "局势感知",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: 80,
  otherNightPriority: 110,
  firstNightOnly: false,
  wakePromptId: "role.general.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

/**
 * 天文学家（Astronomer）新引擎技能实现
 *
 * 【角色能力】"每个夜晚，你可以观测夜空，得知月相或星象信息。"
 *
 * 每夜天文学家观测夜空，获得关于月相或星象的预示信息，辅助判断局势。
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
  const nightCount = ctx.snapshot.nightCount ?? 1;
  const phases = [
    "新月",
    "蛾眉月",
    "上弦月",
    "盈凸月",
    "满月",
    "亏凸月",
    "下弦月",
    "残月",
  ];
  const phase = phases[nightCount % phases.length];
  const starSigns = ["星宿齐聚", "流星雨", "北斗指引", "星云密布"];
  const sign = starSigns[(nightCount * 3) % starSigns.length];
  return {
    ...ctx,
    meta: { ...ctx.meta, abilityResult: { moonPhase: phase, starSign: sign } },
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
        astronomer: r,
      },
    },
    meta: { ...ctx.meta, astronomerResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log = `[Astronomer] 天文学家观测到：${r?.moonPhase ?? "未知"}，${r?.starSign ?? "未知"}`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityLog: log,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【天文学家】，告知今晚的星象信息。`,
    },
  };
};

export const astronomerAbility = createRoleAbility({
  roleId: "astronomer",
  abilityId: "astronomer_observe",
  abilityName: "星象观测",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 35,
  firstNightOnly: false,
  wakePromptId: "role.astronomer.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

/**
 * 贵族（Noble）新引擎技能实现
 *
 * 【角色能力】"在你的首个夜晚，你会得知三名玩家，其中一名是邪恶的。"
 *
 * 首夜获得信息，被告知三名玩家中有一名是邪恶阵营。
 * 醉酒/中毒时可能得知三名全善良或虚假信息。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import { AbilityTriggerTiming, createRoleAbility } from "../core/roleAbility.types";

interface NobleInfo { seat1: number; seat2: number; seat3: number; }

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const seat = ctx.snapshot.seats.find((s: any) => s.id === ctx.actionNode.seatId);
  if (!seat?.isAlive) return { ...ctx, aborted: true, abortReason: "已死亡" };
  const effects = seat.statusEffects ?? ctx.snapshot.statusEffects?.[seat.id] ?? [];
  return { ...ctx, meta: { ...ctx.meta, isPoisoned: effects.some((e: any) => e.type === "poisoned" || e.type === "drunk") } };
};

const firstNightCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const nc = ctx.snapshot.nightCount ?? 0;
  if (nc !== 1 && ctx.snapshot.gamePhase !== "firstNight") return { ...ctx, aborted: true, abortReason: "非首夜" };
  return ctx;
};

const calculate = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const seats = ctx.snapshot.seats.filter((s: any) => s.id !== ctx.actionNode.seatId && !s.isDead);
  const shuffled = [...seats].sort(() => Math.random() - 0.5);
  const chosen = shuffled.slice(0, 3);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: { seat1: chosen[0]?.id ?? 0, seat2: chosen[1]?.id ?? 0, seat3: chosen[2]?.id ?? 0 },
      isCorrupted: ctx.meta.isPoisoned,
    },
  };
};

const stateUpdate = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as NobleInfo | undefined;
  if (!r) return ctx;
  return {
    ...ctx, actionNode: { ...ctx.actionNode, meta: { ...ctx.actionNode.meta, nobleResult: r } },
    snapshot: { ...ctx.snapshot, _abilityResults: { ...((ctx.snapshot as any)._abilityResults ?? {}), noble: r } },
    meta: { ...ctx.meta, nobleResult: r },
  };
};

const postProcess = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as NobleInfo | undefined;
  if (!r?.seat1) return ctx;
  const tag = ctx.meta.isCorrupted ? "【受干扰】" : "";
  const log = `[Noble]${tag} 得知三名玩家中含一名邪恶: ${r.seat1 + 1}号, ${r.seat2 + 1}号, ${r.seat3 + 1}号`;
  console.log(log);
  return {
    ...ctx, meta: {
      ...ctx.meta, prompt: `唤醒${ctx.actionNode.seatId + 1}号【贵族】，告知${r.seat1 + 1}、${r.seat2 + 1}、${r.seat3 + 1}号中含一名邪恶。`,
      abilityLog: `贵族${tag}得知三名玩家中有一名邪恶`, displayInfo: { type: "noble_info", players: [r.seat1, r.seat2, r.seat3], log, isCorrupted: ctx.meta.isCorrupted },
    },
  };
};

export const nobleAbility = createRoleAbility({
  roleId: "noble", abilityId: "noble_first_night_ability", abilityName: "贵族探测",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT], wakePriority: 22, firstNightOnly: true, wakePromptId: "role.noble.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck, firstNightCheck], calculate: [calculate], stateUpdate: [stateUpdate], postProcess: [postProcess],
});

/**
 * 赏金猎人（Bounty Hunter）新引擎技能实现
 *
 * 【角色能力】"首夜，你会得知一名邪恶玩家。"
 *
 * 首夜得知一名邪恶阵营玩家（恶魔或爪牙）。
 * 如果醉酒/中毒，可能得知错误目标。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import { AbilityTriggerTiming, createRoleAbility } from "../core/roleAbility.types";

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const seat = ctx.snapshot.seats.find((s: any) => s.id === ctx.actionNode.seatId);
  if (!seat?.isAlive) return { ...ctx, aborted: true, abortReason: "已死亡" };
  const effects = seat.statusEffects ?? ctx.snapshot.statusEffects?.[seat.id] ?? [];
  return { ...ctx, meta: { ...ctx.meta, isPoisoned: effects.some((e: any) => e.type === "poisoned" || e.type === "drunk") } };
};

const calculate = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const isCorrupted = ctx.meta.isPoisoned === true;
  const aliveEvils = ctx.snapshot.seats.filter((s: any) =>
    s.isAlive && s.id !== ctx.actionNode.seatId && s.role &&
    (s.role.type === "minion" || s.role.type === "demon")
  );

  let targetId = null;
  if (isCorrupted && aliveEvils.length > 0) {
    // 醉酒/中毒时可能给错误目标（给善良玩家）
    const goodOnes = ctx.snapshot.seats.filter((s: any) => s.isAlive && s.id !== ctx.actionNode.seatId && s.role?.type === "townsfolk");
    if (goodOnes.length > 0) targetId = goodOnes[Math.floor(Math.random() * goodOnes.length)].id;
  }
  if (!targetId && aliveEvils.length > 0) {
    targetId = aliveEvils[Math.floor(Math.random() * aliveEvils.length)].id;
  }

  return { ...ctx, meta: { ...ctx.meta, abilityResult: { targetId, evilFound: targetId !== null }, isCorrupted } };
};

const stateUpdate = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  return {
    ...ctx,
    snapshot: { ...ctx.snapshot, _abilityResults: { ...((ctx.snapshot as any)._abilityResults ?? {}), bounty_hunter: r } },
    meta: { ...ctx.meta, bountyHunterResult: r },
  };
};

const postProcess = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const tag = ctx.meta.isCorrupted ? "【受干扰】" : "";
  const log = r?.targetId != null ? `[BountyHunter]${tag} 得知 ${r.targetId + 1}号是邪恶` : "[BountyHunter] 无邪恶玩家";
  console.log(log);
  return { ...ctx, meta: { ...ctx.meta, prompt: `唤醒${ctx.actionNode.seatId + 1}号【赏金猎人】，告知一名邪恶玩家。`, abilityLog: log } };
};

export const bounty_hunterAbility = createRoleAbility({
  roleId: "bounty_hunter", abilityId: "bounty_hunter_reveal", abilityName: "悬赏猎杀",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT], wakePriority: 50, firstNightOnly: true,
  wakePromptId: "role.bounty_hunter.wake", targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck], calculate: [calculate], stateUpdate: [stateUpdate], postProcess: [postProcess],
});

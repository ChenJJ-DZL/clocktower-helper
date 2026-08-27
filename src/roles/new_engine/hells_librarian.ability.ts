/**
 * 地狱图书管理员（Hell's Librarian）寓言角色实现
 *
 * 【角色能力】白天提供说书人控制台即时裁决按钮。
 * 说书人可点击按钮对任意玩家施加惩罚（中毒/醉酒/死亡）。
 * DAY 触发，由说书人手动操作。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const targetId = ctx.storytellerInput?.targetId ?? null;
  const penalty = ctx.storytellerInput?.penalty ?? "poison";
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        hellsLibrarianActive: true,
        targetId,
        penalty,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (r?.targetId == null) return ctx;
  const seats = (ctx.snapshot.seats ?? []) as any[];
  const updatedSeats = seats.map((s: any) => {
    if (s.id !== r.targetId) return s;
    const effects = [...(s.statusEffects ?? [])];
    if (r.penalty === "poison") {
      effects.push({ type: "poisoned", source: "hells_librarian" });
    } else if (r.penalty === "drunk") {
      effects.push({ type: "drunk", source: "hells_librarian" });
    }
    return {
      ...s,
      statusEffects: effects,
      ...(r.penalty === "death" ? { isDead: true, isAlive: false } : {}),
    };
  });
  return {
    ...ctx,
    snapshot: { ...ctx.snapshot, seats: updatedSeats },
    meta: { ...ctx.meta, hellsLibrarianResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log = `[HellsLibrarian] 地狱图书管理员裁决 — ${r?.targetId != null ? `${r.targetId + 1}号被${r.penalty}` : "无操作"}`;
  return { ...ctx, meta: { ...ctx.meta, abilityLog: log } };
};

export const hellsLibrarianAbility = createRoleAbility({
  roleId: "hells_librarian",
  abilityId: "hells_librarian_day",
  abilityName: "地狱图书管理员",
  triggerTiming: [AbilityTriggerTiming.DAY],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  otherNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 0, max: 1, allowSelf: false, allowDead: true },
  preCheck: [],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

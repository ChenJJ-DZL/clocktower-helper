/**
 * 心上人（Sweetheart）新引擎技能实现
 * 【角色能力】"当你死亡时，一名玩家醉酒。"
 */
import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const target = ctx.storytellerInput?.drunkTarget ?? null;
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        drunkTarget: target,
        causesDrunk: true,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.causesDrunk) return ctx;

  const seats = ctx.snapshot.seats ?? [];
  let nextSeats = seats;
  if (r.drunkTarget != null) {
    nextSeats = seats.map((s: any) => {
      if (s.id === r.drunkTarget) {
        const effects = [...(s.statusEffects ?? [])];
        if (!effects.some((e: any) => e.type === "drunk" && e.source === "sweetheart")) {
          effects.push({
            type: "drunk",
            source: "sweetheart",
            sourceSeatId: ctx.actionNode.seatId,
          });
        }
        return {
          ...s,
          isDrunk: true,
          statusEffects: effects,
        };
      }
      return s;
    });
  }

  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      seats: nextSeats,
      sweetheartDrunkTargetId: r.drunkTarget,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        sweetheart: r,
      },
    },
    meta: { ...ctx.meta, sweetheartResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  console.log("[心上人] 死亡，使1名玩家醉酒");
  return ctx;
};

export const sweetheartAbility = createRoleAbility({
  roleId: "sweetheart",
  abilityId: "sweetheart_death",
  abilityName: "香消玉殒",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  firstNightPriority: null,
  otherNightPriority: 79,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

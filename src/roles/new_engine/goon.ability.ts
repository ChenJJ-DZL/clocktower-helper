/**
 * 暴徒（Goon）新引擎技能实现
 *
 * 【角色能力】"当你第一次在私下被邪恶玩家选择时，你变成邪恶。"
 *
 * PASSIVE 触发：被邪恶玩家私下选择时转换阵营。
 */
import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

import { isGoodSeat } from "../../utils/bmrMechanics";

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const seat = ctx.snapshot.seats.find(
    (s: any) => s.id === ctx.actionNode.seatId
  );
  if (!seat) return ctx;
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const chooserSeatId = ctx.meta.chooserSeatId ?? (ctx.actionNode as any)?.chooserSeatId;
  const chooserSeat = ctx.snapshot.seats.find((s: any) => s.id === chooserSeatId);

  // 若无选择者，直接返回
  if (!chooserSeat) {
    return {
      ...ctx,
      meta: {
        ...ctx.meta,
        abilityResult: {
          chooserDrunk: false,
          newAlignment: "good",
          alignmentChanged: false,
        },
      },
    };
  }

  const isChooserEvil = !isGoodSeat(chooserSeat);
  const newAlignment: "good" | "evil" = isChooserEvil ? "evil" : "good";

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        chooserSeatId,
        chooserDrunk: true,
        newAlignment,
        alignmentChanged: true,
        isChooserEvil,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.alignmentChanged) return ctx;

  const seats = ctx.snapshot.seats.map((seat: any) => {
    // 施选者醉酒至下个黄昏
    if (seat.id === r.chooserSeatId) {
      const effects = [...(seat.statusEffects ?? [])];
      if (!effects.some((e: any) => e.type === "drunk" && e.source === "goon")) {
        effects.push({
          type: "drunk",
          source: "goon",
          sourceSeatId: ctx.actionNode.seatId,
          duration: "黄昏",
        });
      }
      return {
        ...seat,
        isDrunk: true,
        statusEffects: effects,
      };
    }

    // 莽夫改变阵营
    if (seat.id === ctx.actionNode.seatId) {
      return {
        ...seat,
        alignment: r.newAlignment,
        isEvilConverted: r.isChooserEvil,
      };
    }

    return seat;
  });

  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      seats,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        goon: r,
      },
    },
    meta: { ...ctx.meta, goonResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (r?.alignmentChanged) {
    console.log(`[莽夫] 选择莽夫的玩家(${Number(r.chooserSeatId) + 1}号)醉酒至下个黄昏，莽夫转变为${r.newAlignment === "evil" ? "邪恶" : "善良"}阵营`);
  }
  return ctx;
};

export const goonAbility = createRoleAbility({
  roleId: "goon",
  abilityId: "goon_alignment_change",
  abilityName: "阵营转换",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

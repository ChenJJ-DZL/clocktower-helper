/**
 * 茶艺师（Tea Lady）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

import { getAliveNeighbors, isDrunkOrPoisoned, isGoodSeat } from "../../utils/bmrMechanics";

// 预检查：检查茶艺师存活与清醒状态
const preCheckPassive = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode } = context;
  const seat = snapshot.seats.find((s) => s.id === actionNode.seatId);
  if (!seat || !seat.isAlive || seat.isDead) {
    return { ...context, aborted: true, abortReason: "茶艺师已死亡" };
  }
  if (isDrunkOrPoisoned(seat)) {
    return { ...context, aborted: true, abortReason: "茶艺师醉酒或中毒" };
  }
  return context;
};

// 计算结果：寻找存活邻居，若均为善良则保护
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode } = context;
  const { left, right } = getAliveNeighbors(actionNode.seatId, snapshot.seats);

  const isLeftGood = isGoodSeat(left);
  const isRightGood = isGoodSeat(right);
  const bothGood = isLeftGood && isRightGood;

  const protectedIds: number[] = [];
  if (bothGood && left && right) {
    protectedIds.push(left.id, right.id);
  }

  return {
    ...context,
    meta: {
      ...context.meta,
      abilityResult: {
        teaLadySeatId: actionNode.seatId,
        leftNeighborId: left?.id ?? null,
        rightNeighborId: right?.id ?? null,
        bothGood,
        protectedIds,
      },
    },
  };
};

const stateUpdate = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta, actionNode } = context;
  const r = meta.abilityResult as any;
  if (!r) return context;

  const protectedIds: number[] = r.protectedIds ?? [];
  const seats = snapshot.seats.map((seat) => {
    if (protectedIds.includes(seat.id)) {
      const effects = [...(seat.statusEffects ?? [])];
      if (!effects.some((e: any) => e.source === "tea_lady" && e.type === "protected")) {
        effects.push({
          type: "protected",
          source: "tea_lady",
          sourceSeatId: actionNode.seatId,
        });
      }
      return {
        ...seat,
        statusEffects: effects,
        protectedByTeaLady: true,
      };
    }
    return seat;
  });

  return {
    ...context,
    snapshot: {
      ...snapshot,
      seats,
      teaLadyProtectedIds: protectedIds,
      _abilityResults: {
        ...((snapshot as any)._abilityResults ?? {}),
        tea_lady: r,
      },
    },
  };
};

export const teaLadyAbility = createRoleAbility({
  roleId: "tea_lady",
  abilityId: "tea_lady_passive_protection",
  abilityName: "邻近善良保护",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  preCheck: [preCheckPassive],
  calculate: [calculateResult],
  stateUpdate: [stateUpdate],
  postProcess: [],
});

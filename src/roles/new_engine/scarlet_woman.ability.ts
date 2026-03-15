/**
 * 红唇女郎（Scarlet Woman）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// 前置校验：检查恶魔是否死亡、自身是否存活
const preCheckDemonDeath = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode } = context;
  const seat = snapshot.seats.find((s) => s.id === actionNode.seatId);

  if (!seat?.isAlive) {
    return {
      ...context,
      aborted: true,
      abortReason: "红唇女郎已死亡，技能失效",
    };
  }

  const isDrunk = seat.statusEffects.some((e: any) => e.type === "drunk");
  const isPoisoned = seat.statusEffects.some((e: any) => e.type === "poisoned");
  const demonDead = snapshot.seats.some(
    (s) => s.role.type === "demon" && !s.isAlive
  );
  const alivePlayersCount = snapshot.seats.filter((s) => s.isAlive).length;

  return {
    ...context,
    meta: {
      ...context.meta,
      isDrunk,
      isPoisoned,
      isAbilityActive: !(isDrunk || isPoisoned),
      demonDead,
      alivePlayersCount,
    },
  };
};

// 状态更新：变为新的恶魔
const transformToDemon = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta, actionNode } = context;
  const isAbilityActive = meta.isAbilityActive ?? true;
  const demonDead = meta.demonDead ?? false;
  const alivePlayersCount = meta.alivePlayersCount ?? 0;

  if (!isAbilityActive || !demonDead || alivePlayersCount < 5) {
    return context;
  }

  // 创建新快照：将红唇女郎变为小恶魔
  const newSnapshot = {
    ...snapshot,
    seats: snapshot.seats.map((seat) => {
      if (seat.id === actionNode.seatId) {
        return {
          ...seat,
          role: {
            id: "imp",
            name: "小恶魔",
            type: "demon",
            alignment: "evil",
          },
          abilityUsed: false,
          statusEffects: seat.statusEffects.filter(
            (e: any) => e.type !== "poisoned" && e.type !== "drunk"
          ),
        };
      }
      return seat;
    }),
  };

  return { ...context, snapshot: newSnapshot };
};

export const scarletWomanAbility = createRoleAbility({
  roleId: "scarlet_woman",
  abilityId: "scarlet_woman_demon_successor",
  abilityName: "恶魔继承者",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [preCheckDemonDeath],
  calculate: [],
  stateUpdate: [transformToDemon],
  postProcess: [
    async (context) => {
      const { meta } = context;
      if (
        meta.isAbilityActive &&
        meta.demonDead &&
        meta.alivePlayersCount >= 5
      ) {
        console.log("恶魔已死亡，红唇女郎变为新的小恶魔");
      }
      return context;
    },
  ],
});

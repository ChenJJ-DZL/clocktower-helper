/**
 * 酒鬼（Drunk）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// 前置校验：仅首夜触发，检查是否存活
const preCheckFirstNightAlive = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode } = context;
  const seat = snapshot.seats.find((s) => s.id === actionNode.seatId);

  // 仅首夜触发
  if (snapshot.nightCount !== 1) {
    return { ...context, aborted: true, abortReason: "酒鬼技能仅在首夜触发" };
  }

  if (!seat?.isAlive) {
    return { ...context, aborted: true, abortReason: "玩家已死亡，技能失效" };
  }

  return context;
};

// 状态更新：设置酒鬼的虚假身份和永久醉酒状态
const updateDrunkStatus = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode, storytellerInput } = context;
  const drunkSeatId = actionNode.seatId;

  // 创建新的快照，添加永久醉酒效果和虚假角色
  const newSnapshot = {
    ...snapshot,
    seats: snapshot.seats.map((seat) => {
      if (seat.id === drunkSeatId) {
        // 随机选择一个镇民作为虚假角色，或使用说书人输入的角色
        const fakeRole =
          storytellerInput?.fakeRole ??
          snapshot.seats.filter(
            (s) => s.role.type === "townsfolk" && s.id !== drunkSeatId
          )[
            Math.floor(
              Math.random() *
                snapshot.seats.filter((s) => s.role.type === "townsfolk").length
            )
          ].role;

        return {
          ...seat,
          fakeRole,
          statusEffects: [
            ...seat.statusEffects,
            {
              type: "drunk",
              source: "drunk",
              permanent: true,
            },
          ],
        };
      }
      return seat;
    }),
  };

  return { ...context, snapshot: newSnapshot };
};

export const drunkAbility = createRoleAbility({
  roleId: "drunk",
  abilityId: "drunk_first_night_ability",
  abilityName: "烂醉如泥",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT],
  wakePriority: 80,
  firstNightOnly: true,
  wakePromptId: "role.drunk.wake",
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [preCheckFirstNightAlive],
  calculate: [],
  stateUpdate: [updateDrunkStatus],
  postProcess: [
    async (context) => {
      const { actionNode, snapshot } = context;
      const drunkSeat = snapshot.seats.find((s) => s.id === actionNode.seatId);
      if (drunkSeat?.fakeRole) {
        console.log(
          `酒鬼${actionNode.seatId}号玩家的虚假身份为${drunkSeat.fakeRole.name}，其将永久处于醉酒状态`
        );
      }
      return context;
    },
  ],
});

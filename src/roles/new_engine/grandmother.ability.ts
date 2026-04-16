/**
 * 祖母 (Grandmother) - 黯月初升剧本
 *
 * 角色能力：
 * - 在你的首个夜晚，你会得知一名善良玩家和他的角色。
 * - 如果恶魔杀死了他，你也会死亡。
 *
 * 触发时机：FIRST_NIGHT（首夜）
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// 前置校验：检查是否存活、是否醉酒/中毒
const preCheckAliveAndStatus = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode } = context;
  const seat = snapshot.seats.find((s) => s.id === actionNode.seatId);

  if (!seat?.isAlive) {
    return { ...context, aborted: true, abortReason: "玩家已死亡，技能失效" };
  }

  const isDrunk = seat.statusEffects.some((e: any) => e.type === "drunk");
  const isPoisoned = seat.statusEffects.some((e: any) => e.type === "poisoned");

  return {
    ...context,
    meta: {
      ...context.meta,
      isDrunk,
      isPoisoned,
      isAbilityActive: !(isDrunk || isPoisoned),
    },
  };
};

// 计算结果：告知孙子信息
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta, actionNode } = context;
  const isAbilityActive = meta.isAbilityActive ?? true;
  const selfSeat = snapshot.seats.find((s) => s.id === actionNode.seatId);

  let result: {
    grandchildId: number;
    grandchildRoleId: string;
    grandchildRoleName: string;
  };

  if (!isAbilityActive || !selfSeat) {
    // 醉酒/中毒或找不到自己时返回虚假信息
    result = {
      grandchildId:
        snapshot.seats[Math.floor(Math.random() * snapshot.seats.length)].id,
      grandchildRoleId: "villager",
      grandchildRoleName: "镇民",
    };
  } else {
    // 从selfSeat中获取预先设置的孙子ID
    const grandchildId = (selfSeat as any).grandchildId;

    if (grandchildId === undefined || grandchildId === null) {
      result = {
        grandchildId: -1,
        grandchildRoleId: "",
        grandchildRoleName: "",
      };
    } else {
      const grandchild = snapshot.seats.find((s) => s.id === grandchildId);

      if (!grandchild || !grandchild.role) {
        result = {
          grandchildId: grandchildId,
          grandchildRoleId: "",
          grandchildRoleName: "",
        };
      } else {
        result = {
          grandchildId: grandchild.id,
          grandchildRoleId: grandchild.role.id,
          grandchildRoleName: grandchild.role.name,
        };
      }
    }
  }

  return { ...context, meta: { ...context.meta, abilityResult: result } };
};

export const grandmotherAbility = createRoleAbility({
  roleId: "grandmother",
  abilityId: "grandmother_first_night_ability",
  abilityName: "孙子识别",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT],
  wakePriority: 24,
  firstNightOnly: true,
  wakePromptId: "role.grandmother.wake",
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [preCheckAliveAndStatus],
  calculate: [calculateResult],
  stateUpdate: [],
  postProcess: [
    async (context) => {
      const { meta, actionNode } = context;
      const result = meta.abilityResult;
      if (result && result.grandchildId !== -1) {
        console.log(
          `祖母(${actionNode.seatId + 1}号)被告知：${result.grandchildId + 1}号是孙子，角色是${result.grandchildRoleName}`
        );
      }
      return context;
    },
  ],
});

/**
 * 神谕者（Oracle）新引擎技能实现
 *
 * 每个夜晚*，得知有多少名死亡的玩家是邪恶的。
 */

import type { Seat } from "../../../app/data";
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

  if (seat?.isDead) {
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

// 计算结果：统计死亡的邪恶玩家数量
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta } = context;
  const isAbilityActive = meta.isAbilityActive ?? true;
  const isVortoxWorld = snapshot.isVortoxWorld ?? false;

  // 获取当晚死亡的玩家ID列表
  const deadThisNight = snapshot.deadThisNight ?? [];

  // 计算所有已死亡玩家（包括当晚刚刚死去的）中属于邪恶阵营的人数
  const deadEvilCount = snapshot.seats
    .filter((s: Seat) => s.isDead || deadThisNight?.includes(s.id))
    .filter((s: Seat) => {
      // 角色类型为爪牙或恶魔，或者被转化标记为邪恶
      const isEvilType =
        s.role && (s.role.type === "minion" || s.role.type === "demon");
      return isEvilType || s.isEvilConverted;
    }).length;

  // 检查场上是否有涡流
  const hasVortox = snapshot.seats.some((s: Seat) => s.role?.id === "vortox");

  // 确定最终显示的信息
  let finalCount = deadEvilCount;

  if (!isAbilityActive || hasVortox || isVortoxWorld) {
    // 醉酒/中毒/涡流时，返回随机或错误信息
    // 简单处理：在正确值附近随机波动
    const randomOffset = Math.random() < 0.5 ? 1 : -1;
    finalCount = Math.max(
      0,
      Math.min(snapshot.seats.length, deadEvilCount + randomOffset)
    );
  }

  const result = {
    deadEvilCount,
    finalCount,
  };

  return { ...context, meta: { ...context.meta, abilityResult: result } };
};

export const oracleAbility = createRoleAbility({
  roleId: "oracle",
  abilityId: "oracle_nightly_ability",
  abilityName: "邪恶亡灵侦测",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 13,
  firstNightOnly: false,
  wakePromptId: "role.oracle.wake",
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
      const { meta } = context;
      const result = meta.abilityResult;
      if (result) {
        console.log(
          `神谕者得知：当前共有 ${result.finalCount} 名死亡玩家为邪恶阵营（实际：${result.deadEvilCount}）`
        );
      }
      return context;
    },
  ],
});

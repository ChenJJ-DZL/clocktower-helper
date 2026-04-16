/**
 * 筑梦师（Dreamer）新引擎技能实现
 *
 * 每个夜晚，你要选择除你及旅行者以外的一名玩家：
 * - 你会得知一个善良角色和一个邪恶角色，其中一个是该玩家的真实角色
 */

import type { Role } from "../../types/game";
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

// 辅助函数：随机选择数组元素
const getRandom = <T>(arr: T[]): T => {
  return arr[Math.floor(Math.random() * arr.length)];
};

// 计算结果：生成善良和邪恶角色对
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, targetIds, meta } = context;
  const isAbilityActive = meta.isAbilityActive ?? true;
  const targets = targetIds || [];

  if (targets.length !== 1) {
    return { ...context, aborted: true, abortReason: "筑梦师必须选择一名玩家" };
  }

  const targetId = targets[0];
  const targetSeat = snapshot.seats.find((s) => s.id === targetId);

  if (!targetSeat || !targetSeat.role) {
    return { ...context, aborted: true, abortReason: "无效目标" };
  }

  const actualRole = targetSeat.role;
  const isVortoxWorld = snapshot.isVortoxWorld ?? false;

  // 检查场上是否有涡流
  const hasVortox = snapshot.seats.some((s) => s.role?.id === "vortox");

  // 确定是否应该显示正确信息
  let shouldShowCorrect = isAbilityActive;
  if (hasVortox || isVortoxWorld) {
    // 涡流在场时，镇民信息必定错误
    shouldShowCorrect = !shouldShowCorrect;
  }

  // 获取所有角色分类
  const allRoles = snapshot.availableRoles || [];
  const townsfolk = allRoles.filter((r: Role) => r.type === "townsfolk");
  const outsiders = allRoles.filter(
    (r: Role) => r.type === "outsider" || r.id === "drunk"
  );
  const minions = allRoles.filter((r: Role) => r.type === "minion");
  const demons = allRoles.filter((r: Role) => r.type === "demon");

  const goodRoles = [...townsfolk, ...outsiders];
  const evilRoles = [...minions, ...demons];

  let roleA: Role;
  let roleB: Role;

  if (shouldShowCorrect) {
    // 正常情况：显示真实角色和一个对立阵营的随机角色
    const isTargetGood =
      actualRole.type === "townsfolk" ||
      actualRole.type === "outsider" ||
      actualRole.id === "drunk";

    if (isTargetGood) {
      roleA = actualRole;
      roleB = getRandom(evilRoles);
    } else {
      roleA = getRandom(goodRoles);
      roleB = actualRole;
    }
  } else {
    // 醉酒/中毒/涡流：显示虚假信息
    const isTargetGood =
      actualRole.type === "townsfolk" ||
      actualRole.type === "outsider" ||
      actualRole.id === "drunk";

    if (isTargetGood) {
      // 目标是善良，但显示两个虚假角色
      roleA = getRandom(goodRoles.filter((r: Role) => r.id !== actualRole.id));
      roleB = getRandom(evilRoles);
    } else {
      // 目标是邪恶，但显示两个虚假角色
      roleA = getRandom(goodRoles);
      roleB = getRandom(evilRoles.filter((r: Role) => r.id !== actualRole.id));
    }
  }

  // 随机交换位置
  if (Math.random() < 0.5) {
    [roleA, roleB] = [roleB, roleA];
  }

  const result = {
    targetId,
    roleA,
    roleB,
    actualRole,
  };

  return { ...context, meta: { ...context.meta, abilityResult: result } };
};

export const dreamerAbility = createRoleAbility({
  roleId: "dreamer",
  abilityId: "dreamer_nightly_ability",
  abilityName: "梦境窥探",
  triggerTiming: [
    AbilityTriggerTiming.FIRST_NIGHT,
    AbilityTriggerTiming.EVERY_NIGHT,
  ],
  wakePriority: 8,
  firstNightOnly: false,
  wakePromptId: "role.dreamer.wake",
  targetConfig: {
    min: 1,
    max: 1,
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
          `筑梦师选择了${result.targetId + 1}号位，得知：${result.roleA.name}, ${result.roleB.name}`
        );
      }
      return context;
    },
  ],
});

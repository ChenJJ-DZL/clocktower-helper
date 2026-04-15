import { createRoleAbility } from "../core/roleAbility.types";
import type { AbilityTriggerTiming, MiddlewareContext } from "../../utils/middlewarePipeline";

/**
 * 侍女 (Chambermaid) - 新引擎能力实现
 * 
 * 每个夜晚，你要选择除你以外的两名存活的玩家：你会得知他们中有几人在当晚因其自身能力而被唤醒。
 */
const preCheckAliveAndStatus = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { gameState, selfSeat } = context;

  if (!selfSeat) {
    throw new Error("侍女座位不存在");
  }

  if (selfSeat.isDead) {
    throw new Error("侍女已死亡");
  }

  if (selfSeat.isDrunk || selfSeat.isPoisoned) {
    return {
      ...context,
      result: {
        success: false,
        message: "侍女醉酒或中毒",
      },
    };
  }

  return context;
};

const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { gameState, selfSeat, selectedTargets } = context;

  if (!selfSeat || !selectedTargets || selectedTargets.length !== 2) {
    return {
      ...context,
      result: {
        success: false,
        message: "无效的目标选择",
      },
    };
  }

  // 计算被选中玩家中当晚被唤醒的数量
  let wokenCount = 0;

  for (const targetId of selectedTargets) {
    const targetSeat = gameState.seats.find((s) => s.id === targetId);
    if (targetSeat && !targetSeat.isDead) {
      // 检查该角色是否会在今晚被唤醒使用能力
      const roleId = targetSeat.role?.id;
      if (roleId) {
        // 这里需要通过 nightOrderParser 来判断该角色是否会在今晚被唤醒
        // 暂时简化处理：假设有一个方式可以判断
        // 实际实现需要整合 nightOrderParser
        wokenCount += 0; // 占位，实际需要实现
      }
    }
  }

  return {
    ...context,
    result: {
      success: true,
      data: {
        wokenCount,
        targets: selectedTargets,
      },
      message: `侍女得知被唤醒的玩家数量：${wokenCount}`,
    },
  };
};

const stateUpdate = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  // 侍女能力不需要修改游戏状态
  return context;
};

export const chambermaidAbility = createRoleAbility({
  roleId: "chambermaid",
  roleName: "侍女",
  description: "每个夜晚，选择两名玩家，得知他们中有几人在当晚因其自身能力而被唤醒。",
  triggerTiming: "EVERY_NIGHT" as AbilityTriggerTiming,
  targetConfig: {
    min: 2,
    max: 2,
    canTargetSelf: false,
    canTargetDead: false,
  },
  preCheck: [preCheckAliveAndStatus],
  calculate: [calculateResult],
  stateUpdate: [stateUpdate],
  postProcess: [
    async (context) => {
      console.log("侍女能力执行完成", context.result);
      return context;
    },
  ],
});

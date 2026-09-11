/**
 * 旅店老板（Innkeeper）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";
import {
  createDeterministicRandom,
  type DeterministicRandom,
  nightInfoSeed,
} from "../core/deterministicRandom";

/**
 * 在两名受保护目标中挑一名"醉酒"（模拟说书人的选择）。
 *
 * rng 必须由调用方注入：calculate 会被执行两次（生成"当前的行动"预演 +
 * 真正结算），若两处各自调用 Math.random()，预演说"3号醉酒"、结算却让 5号醉酒。
 */
export function pickDrunkTargetId(
  target1Id: number,
  target2Id: number,
  rng: DeterministicRandom = Math.random
): number {
  return rng() < 0.5 ? target1Id : target2Id;
}

// 计算结果：选择两个目标并决定谁醉酒
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode, meta, targetIds } = context;
  const isAbilityActive = meta.abilityEffective ?? true;

  // 🎲 确定性随机：同一夜、同一旅店老板的重复计算必须让同一名目标醉酒
  const rng = createDeterministicRandom(
    nightInfoSeed("innkeeper", actionNode.seatId, snapshot.nightCount ?? 1)
  );

  // 检查是否有两个目标
  if (!targetIds || targetIds.length !== 2) {
    return { ...context, aborted: true, abortReason: "需要选择恰好两个目标" };
  }

  const [target1Id, target2Id] = targetIds;

  let drunkId: number;
  let drunkReason: string;

  if (!isAbilityActive) {
    // 醉酒/中毒时，能力失效，但仍可能随机选择谁醉酒
    drunkId = pickDrunkTargetId(target1Id, target2Id, rng);
    drunkReason = "（旅店老板醉酒/中毒中）";
  } else {
    // 正常逻辑：说书人随机选择其中一人醉酒（实际游戏中由说书人决定）
    // 这里用随机模拟说书人的选择
    drunkId = pickDrunkTargetId(target1Id, target2Id, rng);
    drunkReason = "（说书人选择）";
  }

  const result = {
    target1Id,
    target2Id,
    drunkId,
    drunkReason,
    isDrunk: !isAbilityActive,
  };

  return { ...context, meta: { ...context.meta, abilityResult: result } };
};

// 状态更新：为两个目标添加保护效果，为其中一人添加醉酒效果
const updateState = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode, meta } = context;
  const result = meta.abilityResult;
  const isAbilityActive = meta.abilityEffective ?? true;

  if (!result) {
    return context;
  }

  // 创建新的快照
  const newSnapshot = {
    ...snapshot,
    seats: snapshot.seats.map((seat) => {
      // 检查是否是保护目标
      const isProtectedTarget =
        isAbilityActive &&
        (seat.id === result.target1Id || seat.id === result.target2Id);

      // 检查是否是醉酒目标
      const isDrunkTarget = seat.id === result.drunkId;

      if (isProtectedTarget || isDrunkTarget) {
        const newSeat = { ...seat };

        // 添加保护效果
        if (isProtectedTarget) {
          newSeat.statusEffects = [
            ...newSeat.statusEffects,
            {
              type: "protected",
              source: "innkeeper",
              sourceSeatId: actionNode.seatId,
              expiresAtNight: snapshot.nightCount + 1,
            },
          ];
        }

        // 添加醉酒效果（只有当能力有效时才添加）
        if (isDrunkTarget && isAbilityActive) {
          newSeat.statusEffects = [
            ...newSeat.statusEffects,
            {
              type: "drunk",
              source: "innkeeper",
              sourceSeatId: actionNode.seatId,
              expiresAtDusk: true,
            },
          ];
        }

        return newSeat;
      }
      return seat;
    }),
  };

  return { ...context, snapshot: newSnapshot };
};

export const innkeeperAbility = createRoleAbility({
  roleId: "innkeeper",
  abilityId: "innkeeper_night_ability",
  abilityName: "旅店保护",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: null,
  otherNightPriority: 14,
  firstNightOnly: false,
  wakePromptId: "role.innkeeper.wake",
  targetConfig: {
    min: 2,
    max: 2,
    allowSelf: true,
    allowDead: false,
  },
  preCheck: [commonPreCheckAlive],
  calculate: [calculateResult],
  stateUpdate: [updateState],
  postProcess: [
    async (context) => {
      const { meta } = context;
      const result = meta.abilityResult;
      if (result) {
        const log = `旅店老板${result.isDrunk ? "（醉酒）" : ""}选择了${result.target1Id + 1}号和${result.target2Id + 1}号玩家，${result.drunkId + 1}号醉酒至下个黄昏${result.drunkReason}`;
        console.log(log);
        return {
          ...context,
          meta: {
            ...context.meta,
            abilityLog: log,
            displayInfo: {
              type: "innkeeper_info",
              target1Id: result.target1Id,
              target2Id: result.target2Id,
              drunkId: result.drunkId,
              log,
            },
          },
        };
      }
      return context;
    },
  ],
});

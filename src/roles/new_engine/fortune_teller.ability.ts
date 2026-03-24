/**
 * 占卜师（Fortune Teller）新引擎技能实现
 * 集成持续检测型干扰项自动转移逻辑
 */

import { fortuneTellerBoonManager } from "../../utils/FortuneTellerBoonManager";
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// 前置校验：检查是否醉酒/中毒，是否存活
const preCheckAliveAndStatus = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode } = context;
  const seat = snapshot.seats.find((s) => s.id === actionNode.seatId);

  if (!seat?.isAlive) {
    return { ...context, aborted: true, abortReason: "玩家已死亡，技能失效" };
  }

  // 检查是否醉酒或中毒
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

// 计算结果：真实判断目标是否为恶魔，醉酒/中毒时返回伪造结果
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, targetIds, meta } = context;
  const targetSeat = snapshot.seats.find((s) => s.id === targetIds[0]);
  const isAbilityActive = meta.isAbilityActive ?? true;

  let result: boolean;

  if (!isAbilityActive) {
    // 醉酒/中毒时随机返回结果或根据说书人输入
    result = context.storytellerInput?.fakeResult ?? Math.random() > 0.5;
  } else {
    // 正常情况：判断目标是否是恶魔，或者是干扰项
    const isDemon = targetSeat?.role.type === "demon";

    // 使用干扰项管理器检查是否为干扰项
    const isBoon = fortuneTellerBoonManager.isPlayerBoon(
      snapshot.gameId,
      targetSeat?.id ?? -1
    );

    result = isDemon || isBoon;
  }

  return { ...context, meta: { ...context.meta, abilityResult: result } };
};

// 后置处理：记录结果到日志，并初始化干扰项（如果是第一夜）
const postProcess = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode, meta } = context;
  const seat = snapshot.seats.find((s) => s.id === actionNode.seatId);

  console.log(`占卜师结果：${meta.abilityResult ? "是恶魔" : "不是恶魔"}`);

  // 如果是第一夜，初始化干扰项
  if (snapshot.nightCount === 1 && seat?.isAlive) {
    // 选择一个善良玩家作为初始干扰项（不能是占卜师自己）
    const goodPlayers = snapshot.seats.filter(
      (s) => s.role.alignment === "good" && s.id !== seat.id
    );

    if (goodPlayers.length > 0) {
      // 随机选择一个善良玩家作为干扰项
      const randomIndex = Math.floor(Math.random() * goodPlayers.length);
      const initialBoonSeatId = goodPlayers[randomIndex].id;

      // 初始化干扰项

      fortuneTellerBoonManager.initializeBoon(
        snapshot.gameId,
        seat.id,
        initialBoonSeatId
      );

      console.log(`占卜师干扰项初始化: 玩家 ${initialBoonSeatId} 被选为干扰项`);
    }
  }

  return context;
};

export const fortuneTellerAbility = createRoleAbility({
  roleId: "fortune_teller",
  abilityId: "fortune_teller_night_ability",
  abilityName: "占卜",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 30,
  firstNightOnly: false,
  wakePromptId: "fortune_teller_wake",
  targetConfig: {
    min: 1,
    max: 1,
    allowSelf: true,
    allowDead: false,
  },
  preCheck: [preCheckAliveAndStatus],
  calculate: [calculateResult],
  // 占卜师不需要修改状态，stateUpdate留空

  stateUpdate: [],
  // 后置处理：记录结果到日志

  postProcess: [postProcess],
});

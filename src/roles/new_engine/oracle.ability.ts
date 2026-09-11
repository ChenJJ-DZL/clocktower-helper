/**
 * 神谕者（Oracle）新引擎技能实现
 *
 * 每个夜晚*，得知有多少名死亡的玩家是邪恶的。
 */

import type { Seat } from "../../../app/data";
import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  createDeterministicRandom,
  type DeterministicRandom,
  nightInfoSeed,
} from "../core/deterministicRandom";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

/**
 * 醉酒/中毒/涡流时，随机给出一个 ≠ 真实值的错误数字。
 *
 * 抽取 rng 参数：同一夜同一角色的「提示预演」与「实际执行」必须得到同一个
 * 数字，否则说书人照提示念的数字与结果弹窗对不上。
 */
export function pickFakeDeadEvilCount(
  deadEvilCount: number,
  seatCount: number,
  rng: DeterministicRandom = Math.random
): number {
  const fakeCandidates = [0, 1, 2, 3, 4].filter(
    (n) => n <= seatCount && n !== deadEvilCount
  );
  return (
    fakeCandidates[Math.floor(rng() * fakeCandidates.length)] ??
    (deadEvilCount === 0 ? 1 : 0)
  );
}

// 前置校验：检查是否存活、是否醉酒/中毒
const preCheckAliveAndStatus = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode } = context;
  const seat = snapshot.seats.find((s) => s.id === actionNode.seatId);

  if (seat?.isDead) {
    return { ...context, aborted: true, abortReason: "玩家已死亡，技能失效" };
  }

  const effects = seat.statusEffects ?? snapshot.statusEffects?.[seat.id] ?? [];
  const isDrunk =
    effects.some((e: any) => e.type === "drunk") || seat.isDrunk === true;
  const isPoisoned =
    effects.some((e: any) => e.type === "poisoned") || seat.isPoisoned === true;

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
  const { snapshot, meta, storytellerInput } = context;
  const isAbilityActive = meta.isAbilityActive ?? true;
  const isVortoxWorld = snapshot.isVortoxWorld ?? false;
  const abilityEffective = meta.abilityEffective ?? true;

  // 获取当晚死亡的玩家ID列表
  const deadThisNight = snapshot.deadThisNight ?? [];

  // 计算所有已死亡玩家（包括当晚刚刚死去的）中属于邪恶阵营的人数
  const deadEvilCount = snapshot.seats
    .filter((s: Seat) => s.isDead || deadThisNight?.includes(s.id))
    .filter((s: Seat) => {
      if (s.role?.id === "recluse") {
        return (s as any).registerAsEvil !== false;
      }
      if (s.role?.id === "spy") {
        return (s as any).registerAsEvil === true;
      }
      const isEvilType =
        s.role && (s.role.type === "minion" || s.role.type === "demon");
      return isEvilType || !!s.isEvilConverted;
    }).length;

  // 检查场上是否有存活涡流
  const hasVortox = snapshot.seats.some((s: Seat) => s.role?.id === "vortox" && !s.isDead);

  const isCorrupted = !abilityEffective || !isAbilityActive;

  // 🎲 确定性随机：同一夜、同一角色的重复计算（提示预演 / 实际执行）必须一致
  const rng = createDeterministicRandom(
    nightInfoSeed("oracle", context.actionNode.seatId, snapshot.nightCount ?? 1)
  );

  // 确定最终显示的信息
  let finalCount = deadEvilCount;

  if (storytellerInput?.overrideResult !== undefined) {
    finalCount = Number(storytellerInput.overrideResult);
  } else if (storytellerInput?.fakeResult !== undefined) {
    finalCount = Number(storytellerInput.fakeResult);
  } else if (isCorrupted || hasVortox || isVortoxWorld) {
    // 醉酒/中毒/涡流时：必须返回与 deadEvilCount 不同的错误数字
    finalCount = pickFakeDeadEvilCount(
      deadEvilCount,
      snapshot.seats.length,
      rng
    );
  }

  const result = {
    deadEvilCount,
    finalCount,
  };

  return {
    ...context,
    meta: {
      ...context.meta,
      abilityResult: result,
      ...(isCorrupted ? { isCorrupted: true } : {}),
    },
  };
};

export const oracleAbility = createRoleAbility({
  roleId: "oracle",
  abilityId: "oracle_nightly_ability",
  abilityName: "邪恶亡灵侦测",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: null,
  otherNightPriority: 98,
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
        const log = `神谕者得知：当前共有 ${result.finalCount} 名死亡玩家为邪恶阵营`;
        console.log(log);
        return {
          ...context,
          meta: {
            ...context.meta,
            abilityLog: log,
            displayInfo: {
              type: "oracle_info",
              count: result.finalCount,
              log,
            },
          },
        };
      }
      return context;
    },
  ],
});

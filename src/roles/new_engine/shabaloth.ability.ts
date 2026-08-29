/**
 * 沙巴洛斯（Shabaloth）新引擎技能实现
 */

import { createSettlementPostProcess } from "../../utils/abilitySettlement";
import type { MiddlewareContext } from "../../utils/middlewareTypes";
import type { GameStateSnapshot } from "../../utils/nightStateMachine";
import {
  isImmuneToDemonKill,
  resolveMayorDemonKill,
} from "../../utils/soldierImmunity";
import {
  isTaowuSeat,
  taowuSubstituteLog,
  tryTaowuSubstitute,
} from "../../utils/taowuImmunity";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// 前置校验：检查是否存活，是否为恶魔
const preCheckAlive = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode } = context;
  const seat = snapshot.seats.find((s) => s.id === actionNode.seatId);

  if (!seat?.isAlive || seat.role.type !== "demon") {
    return {
      ...context,
      aborted: true,
      abortReason: "沙巴洛斯已死亡或不是恶魔，技能失效",
    };
  }

  return context;
};

// 计算阶段：验证目标合法性
const calculateKillTargets = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, targetIds } = context;

  if (targetIds.length !== 2) {
    return {
      ...context,
      aborted: true,
      abortReason: "沙巴洛斯需要选择2名玩家",
    };
  }

  // 验证所有目标是否存在且存活
  const validTargets = targetIds.filter((targetId) => {
    const targetSeat = snapshot.seats.find((s) => s.id === targetId);
    return targetSeat?.isAlive;
  });

  return {
    ...context,
    meta: { ...context.meta, validTargets },
  };
};

// 状态更新：击杀目标，返回新的状态快照
const updateKillState = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta } = context;
  const validTargets = meta.validTargets as number[];

  if (!validTargets || validTargets.length === 0) {
    return context;
  }

  // 生成新的状态快照（不可变）
  const aliveCount = snapshot.seats.filter((s: any) => !s.isDead).length;
  let seats = snapshot.seats.map((seat) => seat); // 拷贝数组（元素引用不变，仅替换目标）

  // 🔧 镇长替死机制判定（5%自己死亡，95%存活镇民替代死亡）
  const substituteIdsToKill = new Set<number>();
  const mayorSavedIds = new Set<number>();
  for (const tid of validTargets) {
    const targetSeat = seats.find((s: any) => s.id === tid);
    if (!targetSeat) continue;
    const mayorRes = resolveMayorDemonKill(seats, targetSeat, aliveCount);
    if (mayorRes.isMayor) {
      console.log(`[Shabaloth] ${mayorRes.logMessage}`);
      if (mayorRes.substituted && mayorRes.substituteSeat) {
        mayorSavedIds.add(tid);
        substituteIdsToKill.add(mayorRes.substituteSeat.id);
      }
    }
  }

  // 🔧 梼杌替死（wiki 官方规则）：梼杌将死时若有存活且有能力的爪牙 → 不死亡，爪牙失去能力
  const taowuSavedIds = new Set<number>();
  for (const tid of validTargets) {
    const targetSeat = seats.find((s: any) => s.id === tid);
    if (targetSeat && isTaowuSeat(targetSeat)) {
      const r = tryTaowuSubstitute(seats, targetSeat);
      if (r.saved) {
        seats = r.seats;
        taowuSavedIds.add(tid);
        console.log(
          `[Shabaloth] ${taowuSubstituteLog(
            targetSeat,
            seats.find((s: any) => s.id === r.lostMinionId)
          )}`
        );
      }
    }
  }
  const newSnapshot: GameStateSnapshot = {
    ...snapshot,
    seats: seats.map((seat) => {
      if (validTargets.includes(seat.id)) {
        // 🔧 梼杌替死成功 → 不死亡
        if (taowuSavedIds.has(seat.id)) return seat;
        // 🔧 镇长替死成功 → 镇长不死亡
        if (mayorSavedIds.has(seat.id)) return seat;

        const isProtected =
          seat.statusEffects?.some((e: any) => e.type === "protected") ||
          (seat as any).isProtected;
        // 🔧 士兵免疫：恶魔攻击士兵时士兵不死亡（官方规则）
        const soldierImmune = isImmuneToDemonKill(seat, true, aliveCount);

        if (isProtected || soldierImmune) {
          return seat; // 目标被保护 / 士兵免疫，不死亡
        }

        return {
          ...seat,
          isAlive: false,
          isDead: true,
          markedForDeath: true,
          diedAtNight: snapshot.nightCount,
          killedBy: "shabaloth",
          deathSource: "shabaloth_kill",
          deathSourceSeatId: (context.actionNode as any)?.seatId ?? null,
        };
      }
      // 🔧 镇长替代死亡：被选中的镇民替代镇长死亡
      if (substituteIdsToKill.has(seat.id)) {
        return {
          ...seat,
          isAlive: false,
          isDead: true,
          markedForDeath: true,
          diedAtNight: snapshot.nightCount,
          killedBy: "mayor_substitute",
          deathSource: "mayor_substitute",
          deathSourceSeatId: (context.actionNode as any)?.seatId ?? null,
        };
      }
      return seat;
    }),
  };

  return { ...context, snapshot: newSnapshot };
};

// 🔧 结算产物：沙巴洛斯击杀的提示/日志/UI 数据
const settlementPostProcess = createSettlementPostProcess("沙巴洛斯", {
  resultType: "shabaloth_kill",
});

export const shabalothAbility = createRoleAbility({
  roleId: "shabaloth",
  effectSemantics: "kill",
  abilityId: "shabaloth_night_kill",
  abilityName: "恶魔击杀",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: null,
  otherNightPriority: 48, // 恶魔最后行动，沙巴洛斯在珀之后
  firstNightOnly: false,
  wakePromptId: "shabaloth_wake",
  targetConfig: {
    min: 2,
    max: 2,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [preCheckAlive],
  calculate: [calculateKillTargets],
  stateUpdate: [updateKillState],
  postProcess: [settlementPostProcess],
});

/**
 * 沙巴洛斯（Shabaloth）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import type { GameStateSnapshot } from "../../utils/nightStateMachine";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";
import { isImmuneToDemonKill } from "../../utils/soldierImmunity";
import { pickMayorSubstitute, mayorSubstituteLog } from "../../utils/soldierImmunity";

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
  const seats = snapshot.seats.map((seat) => seat); // 拷贝数组（元素引用不变，仅替换目标）
  // 🔧 镇长免疫的代价：被恶魔攻击时镇长不死，但有一名镇民（Townsfolk）替代死亡。
  //   先扫描本次目标中是否有镇长免疫，若有则选替代镇民（随后统一处理死亡）。
  const substituteByMayor: Map<number, any> = new Map();
  for (const tid of validTargets) {
    const targetSeat = seats.find((s: any) => s.id === tid);
    if (!targetSeat) continue;
    const immune = isImmuneToDemonKill(targetSeat, true, aliveCount);
    const isMayor =
      !targetSeat.isDead && targetSeat.role?.id === "mayor" && aliveCount >= 3;
    if (immune && isMayor) {
      const substitute = pickMayorSubstitute(seats, targetSeat);
      if (substitute) {
        substituteByMayor.set(targetSeat.id, substitute);
        console.log(
          `[Shabaloth] ${mayorSubstituteLog(substitute, targetSeat)}`
        );
      }
    }
  }
  const newSnapshot: GameStateSnapshot = {
    ...snapshot,
    seats: seats.map((seat) => {
      if (validTargets.includes(seat.id)) {
        const isProtected =
          seat.statusEffects?.some((e: any) => e.type === "protected") ||
          (seat as any).isProtected;
        // 🔧 士兵免疫：恶魔攻击士兵时士兵不死亡（官方规则）
        // 🔧 镇长免疫：至少3名玩家存活时恶魔攻击镇长无效（官方规则）
        const soldierImmune = isImmuneToDemonKill(seat, true, aliveCount);

        if (isProtected || soldierImmune) {
          return seat; // 目标被保护 / 士兵免疫 / 镇长免疫，不死亡
        }

        return { ...seat, isAlive: false, killedBy: "shabaloth" };
      }
      // 🔧 镇长替代死亡：被选中的镇民替代镇长死亡
      if (substituteByMayor.has(seat.id)) {
        return { ...seat, isAlive: false, killedBy: "mayor_substitute" };
      }
      return seat;
    }),
  };

  return { ...context, snapshot: newSnapshot };
};

export const shabalothAbility = createRoleAbility({
  roleId: "shabaloth",
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
  postProcess: [],
});

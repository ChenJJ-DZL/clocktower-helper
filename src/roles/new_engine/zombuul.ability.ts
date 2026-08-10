import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import type { GameStateSnapshot } from "../../utils/nightStateMachine";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";
import { isImmuneToDemonKill } from "../../utils/soldierImmunity";
import { pickMayorSubstitute, mayorSubstituteLog } from "../../utils/soldierImmunity";

const preCheckAlive = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode } = context;
  const selfSeat = snapshot.seats.find((seat) => seat.id === actionNode.seatId);

  if (!selfSeat?.isAlive) {
    return {
      ...context,
      aborted: true,
      abortReason: "僵怖已死亡，无法使用能力",
    };
  }

  return context;
};

const calculateKillTargets = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, targetIds } = context;

  // 检查白天是否有人死亡
  const { lastDuskExecution } = snapshot;
  if (lastDuskExecution !== null) {
    // 白天有人死亡，僵怖不应该被唤醒
    return {
      ...context,
      aborted: true,
      abortReason: "今天白天有人死亡，僵怖不会被唤醒",
    };
  }

  // 验证目标合法性
  const validTargets = targetIds.filter((targetId) => {
    const targetSeat = snapshot.seats.find((seat) => seat.id === targetId);
    return targetSeat?.isAlive;
  });

  return {
    ...context,
    meta: { ...context.meta, validTargets },
  };
};

const updateKillState = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta } = context;
  const validTargets = meta?.validTargets as number[];

  if (!validTargets || validTargets.length === 0) {
    return context;
  }

  const targetId = validTargets[0];

  // 生成新的状态快照（不可变）
  const aliveCount = snapshot.seats.filter((s: any) => !s.isDead).length;
  const seats = snapshot.seats.map((seat) => seat); // 拷贝数组
  // 🔧 镇长免疫的代价：被恶魔攻击时镇长不死，但有一名镇民（Townsfolk）替代死亡。
  const targetSeat0 = seats.find((s: any) => s.id === targetId);
  let mayorSubstitute: any = null;
  if (
    targetSeat0 &&
    !targetSeat0.isDead &&
    targetSeat0.role?.id === "mayor" &&
    aliveCount >= 3
  ) {
    const immune = isImmuneToDemonKill(targetSeat0, true, aliveCount);
    if (immune) {
      mayorSubstitute = pickMayorSubstitute(seats, targetSeat0);
      if (mayorSubstitute) {
        console.log(`[Zombuul] ${mayorSubstituteLog(mayorSubstitute, targetSeat0)}`);
      }
    }
  }
  const newSnapshot: GameStateSnapshot = {
    ...snapshot,
    seats: seats.map((seat) => {
      if (seat.id === targetId) {
        const isProtected =
          seat.statusEffects?.some((e: any) => e.type === "protected") ||
          (seat as any).isProtected;
        // 🔧 士兵免疫：恶魔攻击士兵时士兵不死亡（官方规则）
        // 🔧 镇长免疫：至少3名玩家存活时恶魔攻击镇长无效（官方规则）
        const soldierImmune = isImmuneToDemonKill(seat, true, aliveCount);

        if (isProtected || soldierImmune) {
          return seat; // 目标被保护 / 士兵免疫 / 镇长免疫，不死亡
        }

        return { ...seat, isAlive: false, killedBy: "zombuul" };
      }
      // 🔧 镇长替代死亡：被选中的镇民替代镇长死亡
      if (mayorSubstitute && seat.id === mayorSubstitute.id) {
        return { ...seat, isAlive: false, killedBy: "mayor_substitute" };
      }
      return seat;
    }),
  };

  return { ...context, snapshot: newSnapshot };
};

export const zombuulAbility = createRoleAbility({
  roleId: "zombuul",
  abilityId: "zombuul_kill",
  abilityName: "僵怖击杀",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: null,
  otherNightPriority: 46,
  targetConfig: { min: 0, max: 1, allowSelf: false, allowDead: false },
  preCheck: [preCheckAlive],
  calculate: [calculateKillTargets],
  stateUpdate: [updateKillState],
  postProcess: [],
});

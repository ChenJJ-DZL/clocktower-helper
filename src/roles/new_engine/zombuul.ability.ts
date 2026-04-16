import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import type { GameStateSnapshot } from "../../utils/nightStateMachine";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

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
  const newSnapshot: GameStateSnapshot = {
    ...snapshot,
    seats: snapshot.seats.map((seat) => {
      if (seat.id === targetId) {
        const isProtected =
          seat.statusEffects?.some((e: any) => e.type === "protected") ||
          (seat as any).isProtected;

        if (isProtected) {
          return seat; // 目标被保护，不死亡
        }

        return { ...seat, isAlive: false, killedBy: "zombuul" };
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
  wakePriority: 108,
  targetConfig: { min: 0, max: 1, allowSelf: false, allowDead: false },
  preCheck: [preCheckAlive],
  calculate: [calculateKillTargets],
  stateUpdate: [updateKillState],
  postProcess: [],
});

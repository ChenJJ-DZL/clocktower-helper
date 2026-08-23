import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import type { GameStateSnapshot } from "../../utils/nightStateMachine";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";
import {
  isImmuneToDemonKill,
  resolveMayorDemonKill,
} from "../../utils/soldierImmunity";
import { isTaowuSeat, tryTaowuSubstitute, taowuSubstituteLog } from "../../utils/taowuImmunity";
import { createSettlementPostProcess } from "../../utils/abilitySettlement";

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
  let seats = snapshot.seats.map((seat) => seat); // 拷贝数组

  // 🔧 镇长替死机制判定（5%自己死亡，95%存活镇民替代死亡）
  const targetSeat0 = seats.find((s: any) => s.id === targetId);
  let mayorSubstitute: any = null;
  let mayorSaved = false;
  if (targetSeat0) {
    const mayorRes = resolveMayorDemonKill(seats, targetSeat0, aliveCount);
    if (mayorRes.isMayor) {
      console.log(`[Zombuul] ${mayorRes.logMessage}`);
      if (mayorRes.substituted && mayorRes.substituteSeat) {
        mayorSaved = true;
        mayorSubstitute = mayorRes.substituteSeat;
      }
    }
  }

  // 🔧 梼杌替死（wiki 官方规则）：梼杌将死时若有存活且有能力的爪牙 → 不死亡，爪牙失去能力
  let taowuSaved = false;
  if (targetSeat0 && isTaowuSeat(targetSeat0)) {
    const r = tryTaowuSubstitute(seats, targetSeat0);
    if (r.saved) {
      seats = r.seats;
      taowuSaved = true;
      console.log(
        `[Zombuul] ${taowuSubstituteLog(targetSeat0, seats.find((s: any) => s.id === r.lostMinionId))}`
      );
    }
  }
  const newSnapshot: GameStateSnapshot = {
    ...snapshot,
    seats: seats.map((seat) => {
      if (seat.id === targetId) {
        // 🔧 梼杌替死成功 → 不死亡
        if (taowuSaved) return seat;
        // 🔧 镇长替死成功 → 镇长不死亡
        if (mayorSaved) return seat;

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
          killedBy: "zombuul",
          deathSource: "zombuul_kill",
          deathSourceSeatId: (context.actionNode as any)?.seatId ?? null,
        };
      }
      // 🔧 镇长替代死亡：被选中的镇民替代镇长死亡
      if (mayorSubstitute && seat.id === mayorSubstitute.id) {
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

// 🔧 结算产物：僵怖击杀的提示/日志/UI 数据（此前 postProcess 为空 → I9 违规）
const settlementPostProcess = createSettlementPostProcess("僵怖", {
  resultType: "zombuul_kill",
});

export const zombuulAbility = createRoleAbility({
  roleId: "zombuul",
  effectSemantics: "kill",
  abilityId: "zombuul_kill",
  abilityName: "僵怖击杀",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: null,
  otherNightPriority: 46,
  targetConfig: { min: 0, max: 1, allowSelf: false, allowDead: false },
  preCheck: [preCheckAlive],
  calculate: [calculateKillTargets],
  stateUpdate: [updateKillState],
  postProcess: [settlementPostProcess],
});

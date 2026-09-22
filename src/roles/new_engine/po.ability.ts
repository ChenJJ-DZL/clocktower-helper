/**
 * 珀（Po）新引擎技能实现
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

  if (!seat || seat.isDead || seat.role.type !== "demon") {
    return {
      ...context,
      aborted: true,
      abortReason: "珀已死亡或不是恶魔，技能失效",
    };
  }

  return context;
};

// 计算阶段：验证目标合法性
const calculateKillTargets = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, targetIds } = context;

  if (targetIds.length > 3) {
    return {
      ...context,
      aborted: true,
      abortReason: "珀最多只能选择3个目标",
    };
  }

  // 验证所有目标是否存在且存活
  const validTargets = targetIds.filter((targetId) => {
    const targetSeat = snapshot.seats.find((s) => s.id === targetId);
    return !targetSeat?.isDead;
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

  const isAbilityEffective = meta?.abilityEffective ?? true;

  if (!validTargets || validTargets.length === 0) {
    /**
     * ⚠️⚠️ 2026-09-21 修复（与 shabaloth / zombuul 同型的「kill 语义空转」缺陷）：
     *
     * 官方【角色能力】：「每个夜晚*，**你可以**选择一名玩家：他死亡。
     *   如果你上次选择时**没有选择任何玩家**，当晚你要选择三名玩家：他们死亡。」
     * ⇒ 「**一个都不选**」是**合法状态**（本文件 `targetConfig.min = 0` 也据此设定），
     *   官方范例明确：「在第三个夜晚，珀**选择不攻击任何人**」。
     *
     * 🔴 缺陷：本分支原先**只写 `poCharged`**，既不写 `lastKill`，
     *   也不写 `meta.abilityResult`。而 `invariantTesting/invariants.ts:605`
     *   的 kill 语义不变量要求：
     *     ok = newDeath || deepDeath || snap.lastKill !== undefined
     *        || snap.fangGuJump !== undefined || snap.taowuSubstitute !== undefined
     *        || exempt;   // exempt 含 meta.abilityResult?.killed === false
     *   ⇒ 「蓄力」之夜**六个条件全不成立** ⇒ 判
     *     「po 声明语义 kill 但执行后无对应状态落地（**空转能力**）」
     *   ⇒ `stress.test.ts` 之类的不变量压测会随机复现失败
     *     （并非每次：只有当某局恰好出现「珀选择不杀人」时才会触发）。
     *
     * 🔒 修法（双保险，与 shabaloth 一致）：
     *   ① `meta.abilityResult.killed = false` ⇒ 命中 I11 的 `exempt` 分支
     *   ② `lastKill: { killed: false }` ⇒ 留下「本夜被选择过」的记录
     *      （珀是**状态型**恶魔：`poCharged` 会决定下一夜能否三杀，
     *        这条记录对回溯排查同样有价值）
     */
    return {
      ...context,
      snapshot: {
        ...snapshot,
        /**
         * ⚠️⚠️ 2026-09-21 修复（第二处，官方冲突）：
         *
         * 官方原文：「如果珀在上一个夜晚**不选择任何人时处于醉酒或中毒**，
         *   当晚珀**仍然能够选择三名玩家**。」
         * ⇒ 「不选择」这个事实**本身就完成充能**，与珀当夜是否受干扰**无关**。
         *
         * 🔴 原实现：`poCharged: isAbilityEffective`（受干扰 ⇒ false）
         *   ⇒ 醉酒/中毒的珀「不选择」时**不充能** ⇒ 下一夜无法三杀
         *   ⇒ **直接违反官方明文**（且这条正是珀的核心机制之一）。
         *
         * ✅ 改为无条件 `true`：走到本分支 = 珀本夜一个目标都没选 ⇒ 必然蓄力。
         */
        poCharged: true,
        lastKill: {
          demonId: (context.actionNode as any)?.seatId ?? null,
          targetId: null,
          demonRole: "po",
          killed: false,
        },
      },
      meta: {
        ...context.meta,
        abilityResult: {
          killed: false,
          killedTargetIds: [],
          chargedNextNight: true,
        },
      },
    };
  }

  if (!isAbilityEffective) {
    return {
      ...context,
      snapshot: {
        ...snapshot,
        poCharged: false,
      },
    };
  }

  // 生成新的状态快照（不可变）
  const aliveCount = snapshot.seats.filter((s: any) => !s.isDead).length;
  let seats = snapshot.seats.map((seat) => seat); // 拷贝数组（元素引用不变，仅替换目标）

  // 按顺序结算目标（如遇莽夫，珀立即醉酒，后续目标存活）
  const successfullyKilledIds = new Set<number>();
  let poIsDrunkNow = false;

  for (const tid of validTargets) {
    if (poIsDrunkNow) break;
    const targetSeat = seats.find((s: any) => s.id === tid);
    if (!targetSeat || targetSeat.isDead) continue;

    // 遇到莽夫：莽夫让珀立即醉酒，莽夫存活并转为邪恶
    if (targetSeat.role?.id === "goon") {
      poIsDrunkNow = true;
      continue;
    }

    // 保护或免疫
    const isProtected =
      targetSeat.statusEffects?.some((e: any) => e.type === "protected") ||
      (targetSeat as any).isProtected;
    const soldierImmune = isImmuneToDemonKill(targetSeat, true, aliveCount);
    if (isProtected || soldierImmune) continue;

    successfullyKilledIds.add(tid);
  }

  // 🔧 镇长替死机制判定（5%自己死亡，95%存活镇民替代死亡）
  const substituteIdsToKill = new Set<number>();
  const mayorSavedIds = new Set<number>();
  for (const tid of successfullyKilledIds) {
    const targetSeat = seats.find((s: any) => s.id === tid);
    if (!targetSeat) continue;
    const mayorRes = resolveMayorDemonKill(
      seats,
      targetSeat,
      aliveCount,
      undefined,
      context.storytellerInput?.mayorSubstituteId,
        `mayorKill|${(context.snapshot as any)?.nightCount ?? 0}|po`
    );
    if (mayorRes.isMayor) {
      console.log(`[Po] ${mayorRes.logMessage}`);
      if (mayorRes.substituted && mayorRes.substituteSeat) {
        mayorSavedIds.add(tid);
        substituteIdsToKill.add(mayorRes.substituteSeat.id);
      }
    }
  }

  // 🔧 梼杌替死（wiki 官方规则）：梼杌将死时若有存活且有能力的爪牙 → 不死亡，爪牙失去能力
  const taowuSavedIds = new Set<number>();
  for (const tid of successfullyKilledIds) {
    const targetSeat = seats.find((s: any) => s.id === tid);
    if (targetSeat && isTaowuSeat(targetSeat)) {
      const r = tryTaowuSubstitute(seats, targetSeat);
      if (r.saved) {
        seats = r.seats;
        taowuSavedIds.add(tid);
        console.log(
          `[Po] ${taowuSubstituteLog(
            targetSeat,
            seats.find((s: any) => s.id === r.lostMinionId)
          )}`
        );
      }
    }
  }
  const newSnapshot: GameStateSnapshot = {
    ...snapshot,
    poCharged: false,
    seats: seats.map((seat) => {
      if (successfullyKilledIds.has(seat.id)) {
        // 🔧 梼杌替死成功 → 不死亡
        if (taowuSavedIds.has(seat.id)) return seat;
        // 🔧 镇长替死成功 → 镇长不死亡
        if (mayorSavedIds.has(seat.id)) return seat;

        return {
          ...seat,
          isDead: true,
          markedForDeath: true,
          diedAtNight: snapshot.nightCount,
          killedBy: "po",
          deathSource: "po_kill",
          deathSourceSeatId: (context.actionNode as any)?.seatId ?? null,
        };
      }
      // 🔧 镇长替代死亡：被选中的镇民替代镇长死亡
      if (substituteIdsToKill.has(seat.id)) {
        return {
          ...seat,
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

  return {
    ...context,
    snapshot: newSnapshot,
    meta: {
      ...context.meta,
      abilityResult: {
        killed: successfullyKilledIds.size > 0 || substituteIdsToKill.size > 0,
        killedTargetIds: Array.from(successfullyKilledIds),
      },
    },
  };
};

// 🔧 结算产物：珀击杀的提示/日志/UI 数据（此前 postProcess 为空 → I9 违规）
const settlementPostProcess = createSettlementPostProcess("珀", {
  resultType: "po_kill",
});

export const poAbility = createRoleAbility({
  roleId: "po",
  effectSemantics: "kill",
  abilityId: "po_night_kill",
  abilityName: "恶魔击杀",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: null,
  otherNightPriority: 49, // 🔧 恶魔最后行动（imp=45, zombuul=46, pukka=47, shabaloth=48, po=49）
  // 🔧 修复：原为 null 导致珀从未被排入夜间队列 → 恶魔无法杀人 → 全场平安夜 → 游戏永不结束
  firstNightOnly: false,
  wakePromptId: "po_wake",
  targetConfig: {
    min: 0,
    max: 3,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [preCheckAlive],
  calculate: [calculateKillTargets],
  stateUpdate: [updateKillState],
  postProcess: [settlementPostProcess],
});

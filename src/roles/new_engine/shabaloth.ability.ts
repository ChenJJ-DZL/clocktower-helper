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

import { isProtectedByTeaLady } from "../../utils/bmrMechanics";

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

  // ⚠️⚠️ 2026-09-21 修复（stress 压测暴露的真实缺陷）：
  //   原实现用 `return !targetSeat?.isDead` **把已死目标过滤掉** —— 与
  //   本文件 `targetConfig.allowDead: true` 以及**官方原文**都矛盾：
  //     · 官方【角色能力】「每个夜晚*，你要选择两名玩家：他们死亡。」
  //     · 官方【范例】「沙巴洛斯攻击了**存活的侍臣和已死亡的驱魔人**。侍臣死亡。
  //       在下一个夜晚，说书人决定让**驱魔人复活**。」
  //       ⇒ 已死玩家**是合法目标**，且是**反刍机制的必要输入**。
  //     · 官方【提示标记】「放置条件：选择的玩家当前存活……**如果上述情况不满足，
  //       仍然需要放置该标记，但倒转放置**，代表该标记没有任何效果，仅用于标记
  //       该玩家**被沙巴洛斯选择过**（因为沙巴洛斯的能力是**回溯型**）」
  //   ⇒ 过滤的后果：当**两个目标都已死**时 `validTargets` 变空，
  //     `updateKillState` 开头的 `length === 0` 早返回 ⇒ 连「被选择过」的标记都不落
  //     ⇒ I11 判「shabaloth 声明语义 kill 但执行后无对应状态落地（空转能力）」。
  //   ⇒ 现在只校验「目标座位存在」，**不过滤存活状态**；由 `updateKillState`
  //     内部自行判断谁该真死（已死者不重复写死亡字段）。
  const validTargets = targetIds.filter((targetId) =>
    snapshot.seats.some((s) => s.id === targetId)
  );

  return {
    ...context,
    meta: { ...context.meta, validTargets },
  };
};

// 状态更新：击杀目标，返回新的状态快照
const updateKillState = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  /**
   * ⚠️⚠️ 2026-09-21 修复 P0-B（醉酒/中毒门控缺失）：
   *   本 `updateKillState` 此前**完全不消费 `context.meta.abilityEffective`**
   *   ⇒ 中毒/醉酒的恶魔照样杀人（与已修的 cerenovus / vortox 同类）。
   *
   * 🔒 blocked 分支**只记「选择」**，刻意**不写** `snapshot.seats`
   *   （死亡本身就是"效果"，写了就等于能力生效）。
   *   ⚠️ 但**必须写 `lastKill`（`killed:false`）** ——
   *   `invariantTesting/invariants.ts:605` 把 `snap.lastKill !== undefined`
   *   列为 kill 语义的通过条件之一，缺了会触发不变量违规。
   */

  const abilityEffective = context.meta.abilityEffective ?? true;
  if (!abilityEffective) {
    return {
      ...context,
      snapshot: {
        ...context.snapshot,
        lastKill: {
          demonId: context.actionNode.seatId,
          targetId: null,
          demonRole: "shabaloth",
          killed: false,
        },
      },
      meta: { ...context.meta, isCorrupted: true },
    };
  }

  const { snapshot, meta, storytellerInput } = context;
  const validTargets = meta.validTargets as number[];

  // 反刍（复活）机制支持
  const regurgitateTargetId =
    storytellerInput?.regurgitatedSeatId ?? (snapshot as any).regurgitatedSeatId;

  // 生成新的状态快照（不可变）
  const aliveCount = snapshot.seats.filter((s: any) => !s.isDead).length;
  let seats = snapshot.seats.map((seat) => seat); // 拷贝数组（元素引用不变，仅替换目标）

  // 🔧 镇长替死机制判定（5%自己死亡，95%存活镇民替代死亡）
  const substituteIdsToKill = new Set<number>();
  const mayorSavedIds = new Set<number>();
  if (validTargets && validTargets.length > 0) {
    for (const tid of validTargets) {
      const targetSeat = seats.find((s: any) => s.id === tid);
      if (!targetSeat) continue;
      const mayorRes = resolveMayorDemonKill(
        seats,
        targetSeat,
        aliveCount,
        undefined,
        storytellerInput?.mayorSubstituteId,
        `mayorKill|${(snapshot as any)?.nightCount ?? 0}|shabaloth`
      );
      if (mayorRes.isMayor) {
        console.log(`[Shabaloth] ${mayorRes.logMessage}`);
        if (mayorRes.substituted && mayorRes.substituteSeat) {
          mayorSavedIds.add(tid);
          substituteIdsToKill.add(mayorRes.substituteSeat.id);
        }
      }
    }
  }

  // 🔧 梼杌替死（wiki 官方规则）：梼杌将死时若有存活且有能力的爪牙 → 不死亡，爪牙失去能力
  const taowuSavedIds = new Set<number>();
  if (validTargets && validTargets.length > 0) {
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
  }
  const newSnapshot: GameStateSnapshot = {
    ...snapshot,
    seats: seats.map((seat) => {
      // 检查反刍复活
      if (regurgitateTargetId != null && seat.id === regurgitateTargetId && seat.isDead) {
        return {
          ...seat,
          isDead: false,
          markedForDeath: false,
          diedAtNight: undefined,
          killedBy: undefined,
          deathSource: undefined,
          deathSourceSeatId: undefined,
          statusEffects: [
            ...(seat.statusEffects ?? []),
            {
              type: "resurrected",
              source: "shabaloth",
            },
          ],
        };
      }

      if (validTargets && validTargets.includes(seat.id)) {
        // ⚠️ 2026-09-21 修复：**已死目标不重复写死亡字段**。
        //   官方：「选中的玩家依次死亡」；对**已经死亡**的玩家，能力**不再产生
        //   死亡效果**（该玩家只是「被选择过」，用于下一夜的反刍判断）。
        //   原实现无条件写 `isDead: true` + `diedAtNight/killedBy/deathSource`，
        //   会把**上一次**的死亡时间与来源**篡改成今夜**，污染死亡历史。
        if (seat.isDead) return seat;

        // 🔧 梼杌替死成功 → 不死亡
        if (taowuSavedIds.has(seat.id)) return seat;
        // 🔧 镇长替死成功 → 镇长不死亡
        if (mayorSavedIds.has(seat.id)) return seat;

        const isProtected =
          seat.statusEffects?.some((e: any) => e.type === "protected") ||
          (seat as any).isProtected;
        // 🔧 士兵免疫：恶魔攻击士兵时士兵不死亡（官方规则）
        const soldierImmune = isImmuneToDemonKill(seat, true, aliveCount);
        // 🔧 茶艺师保护
        const teaLadyImmune = isProtectedByTeaLady(seat.id, seats);

        if (isProtected || soldierImmune || teaLadyImmune) {
          return seat; // 目标被保护 / 士兵免疫 / 茶艺师保护，不死亡
        }

        return {
          ...seat,
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

  /**
   * ⚠️⚠️ 2026-09-21 修复：**补上 `lastKill`**（此前 `shabaloth` 完全没写）。
   *
   *   `fang_gu` / `vigormortis` / `no_dashii` / `zombuul` 这些会杀人的恶魔**都写**
   *   `lastKill`，只有沙巴洛斯漏了。而 `invariantTesting/invariants.ts:605` 的
   *   kill 语义不变量把 `snap.lastKill !== undefined` 列为**通过条件之一**：
   *     ok = newDeath || deepDeath || snap.lastKill !== undefined || … || exempt
   *   ⇒ 一旦本夜「**无新死亡**」（两个目标都已死 / 被保护 / 士兵免疫 / 茶艺师保护），
   *     四个条件全不成立 ⇒ 判「shabaloth 声明语义 kill 但执行后无对应状态落地
   *     （空转能力）」⇒ `stress.test.ts` 的 20 局压测**随机复现失败**。
   *
   *   `lastKill` 同时也是**反刍机制**的判据来源 ——
   *   官方：「你**上个夜晚**选择过且当前死亡的玩家之一可能会被你反刍」
   *   ⇒ 必须记录「本夜选择过谁」，即使这一夜谁都杀不死。
   *
   *   🔒 字段结构与其它恶魔保持一致：`{ demonId, targetId, demonRole, killed }`。
   *      `targetId` 优先记**本夜真正造成死亡**的目标；若一个都没杀死
   *      （全被保护 / 目标本来就已死），则退而记**第一个被选中的目标**，
   *      以满足「被选择过」的回溯语义（官方提示标记的「倒转放置」即此意）。
   */
  const actuallyKilled = (validTargets ?? []).filter((tid: number) => {
    const before = snapshot.seats.find((s: any) => s.id === tid);
    const after = newSnapshot.seats.find((s: any) => s.id === tid);
    return !!before && !!after && !before.isDead && after.isDead === true;
  });
  newSnapshot.lastKill = {
    demonId: (context.actionNode as any)?.seatId ?? null,
    targetId: actuallyKilled[0] ?? (validTargets ?? [])[0] ?? null,
    demonRole: "shabaloth",
    killed: actuallyKilled.length > 0,
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
    allowDead: true,
  },
  preCheck: [preCheckAlive],
  calculate: [calculateKillTargets],
  stateUpdate: [updateKillState],
  postProcess: [settlementPostProcess],
});

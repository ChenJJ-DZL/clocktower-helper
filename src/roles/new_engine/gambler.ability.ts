/**
 * 赌徒（Gambler）新引擎技能实现
 */

import { roles } from "../../../app/data";
import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// 前置校验：赌徒在夜晚行动
const preCheckNightly = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  return { ...context, meta: { ...context.meta, isNightly: true } };
};

// 计算结果：猜测角色并判断是否错误
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta, targetIds, storytellerInput } = context;

  // 获取赌徒座位
  const gamblerSeatId = context.actionNode.seatId;

  // 获取目标座位和猜测的角色
  const targetId = targetIds[0];
  const guessedRole = storytellerInput?.guessedRole;
  const targetSeat = snapshot.seats.find((s) => s.id === targetId);

  if (!targetSeat) {
    return { ...context, aborted: true, abortReason: "未找到目标座位" };
  }

  const targetRole = targetSeat.role?.id ?? targetSeat.roleId;

  /**
   * ⚠️⚠️ 2026-10-20 修复（L1 角色矩阵抓出）：
   *   旧实现直接 `isGuessCorrect = targetRole === guessedRole`，且展示时把
   *   `actualRole: targetRole`（**英文 roleId**）拼进玩家可见文案，实测输出：
   *     「赌徒（1号）猜测2号是【undefined】，但实际是【soldier】，猜错死亡！」
   *   —— 两个问题：① 猜测角色缺失时拼出字面量 `undefined`；
   *              ② 真实角色显示为英文 id（`soldier` 而不是「士兵」）。
   *
   *   修法：判定与展示**分离**——
   *     · 判定：把 guessedRole 归一成 roleId（同时接受 id 与中文名，防 UI 传名字时恒判错）；
   *     · 展示：一律用中文名，缺失时兜底「未知」。
   */
  const rawGuess = guessedRole as string | undefined;
  const guessedRoleId =
    rawGuess === undefined
      ? undefined
      : (roles.find((x) => x.id === rawGuess)?.id ??
        roles.find((x) => x.name === rawGuess)?.id ??
        rawGuess);
  const isGuessCorrect =
    guessedRoleId !== undefined && targetRole === guessedRoleId;

  // 检查赌徒是否受到茶艺师或旅店老板等免死保护
  const gamblerSeat = snapshot.seats.find((s) => s.id === gamblerSeatId);
  const isProtected =
    (gamblerSeat?.statusEffects ?? []).some((e: any) => e.type === "protected") ||
    (gamblerSeat as any)?.isProtected === true ||
    (gamblerSeatId != null &&
      snapshot.seats.some((s) => s.role?.id === "tea_lady") &&
      // 动态判断茶艺师邻近存活双善良保护
      ((snapshot as any).teaLadyProtectedIds?.includes(gamblerSeatId) ||
        (gamblerSeat && (gamblerSeat as any).protectedByTeaLady)));

  const shouldDie = !isGuessCorrect && !isProtected;

  const result = {
    gamblerSeatId,
    targetId,
    /** 归一后的猜测角色 id（判定用） */
    guessedRole: guessedRoleId,
    /** 展示用中文名（缺失兜底「未知」，绝不把 undefined 拼给玩家） */
    guessedRoleName:
      roles.find((x) => x.id === guessedRoleId)?.name ?? rawGuess ?? "未知",
    /** 展示用中文名（不要再输出英文 roleId） */
    actualRole:
      targetSeat.role?.name ?? roles.find((x) => x.id === targetRole)?.name ?? "未知",
    /** 真实角色 id（判定/日志用） */
    actualRoleId: targetRole,
    isGuessCorrect,
    isProtected,
    shouldDie,
  };

  return { ...context, meta: { ...context.meta, abilityResult: result } };
};

// 状态更新：如果猜错了且未受保护，则标记为死亡
const stateUpdate = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta, snapshot } = context;
  const result = meta.abilityResult as any;

  /**
   * ⚠️⚠️ 2026-09-21 修复 P0-B（醉酒/中毒门控缺失）：
   *   本 `stateUpdate` 此前**完全不消费 `ctx.meta.abilityEffective`**
   *   ⇒ 中毒/醉酒的该角色照样施加效果（与已修的 cerenovus / vortox 同类）。
   *
   * 🔒 blocked 分支**只记「选择」与「已受干扰」**，刻意**不写**：
   *   · `snapshot.seats`（死亡 / 状态效果本身就是"效果"，写了就等于能力生效）
   *   · 各角色的特征副作用字段（如相邻中毒名单 / 变身标记 / 交换标记）
   *   ⇒ 说书人能看到技能被发动过，但世界没有变化。
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
          demonRole: "gambler",
          killed: false,
        },
        _abilityResults: {
          ...((context.snapshot as any)._abilityResults ?? {}),
          gambler: { ...result, blockedByDrunkOrPoison: true },
        },
      },
      meta: { ...context.meta, isCorrupted: true },
    };
  }

  if (!result?.shouldDie) {
    return context;
  }

  const seats = snapshot.seats.map((seat) => {
    if (seat.id === result.gamblerSeatId && !seat.isDead) {
      return {
        ...seat,
        isDead: true,
        diedAtNight: snapshot.nightCount,
        deathSource: "gambler_guess_fail",
        killedBy: "gambler",
      };
    }
    return seat;
  });

  return {
    ...context,
    snapshot: {
      ...snapshot,
      seats,
      _abilityResults: {
        ...((snapshot as any)._abilityResults ?? {}),
        gambler: result,
      },
    },
    meta: {
      ...context.meta,
      stateUpdates: {
        type: "MARK_FOR_DEATH",
        targetId: result.gamblerSeatId,
        reason: "赌徒猜错角色",
      },
    },
  };
};

export const gamblerAbility = createRoleAbility({
  roleId: "gambler",
  abilityId: "gambler_guess_ability",
  abilityName: "豪赌",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: null,
  otherNightPriority: 21,
  firstNightOnly: false,
  wakePromptId: "role.gambler.wake",
  targetConfig: {
    min: 1,
    max: 1,
    allowSelf: true,
    allowDead: true,
  },
  preCheck: [preCheckNightly],
  calculate: [calculateResult],
  stateUpdate: [stateUpdate],
  postProcess: [
    async (context) => {
      const { meta } = context;
      const result = meta.abilityResult;
      const log = result.shouldDie
        ? `赌徒（${result.gamblerSeatId + 1}号）猜测${result.targetId + 1}号是【${result.guessedRoleName}】，但实际是【${result.actualRole}】，猜错死亡！`
        : `赌徒（${result.gamblerSeatId + 1}号）猜测${result.targetId + 1}号是【${result.guessedRoleName}】，猜对了！`;
      console.log(log);
      return {
        ...context,
        meta: {
          ...context.meta,
          abilityLog: log,
          displayInfo: {
            type: "gambler_info",
            targetId: result.targetId,
            guessedRole: result.guessedRole,
            isGuessCorrect: !result.shouldDie,
            log,
          },
        },
      };
    },
  ],
});

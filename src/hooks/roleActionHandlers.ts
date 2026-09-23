/**
 * 角色特定行动处理函数（**已裁剪**，2026-09-22）
 * ==================================================================
 * 原 1493 行，含 17 个 `handle<角色>Confirm` 家族 + `roleConfirmHandlers` 表
 * + `getRoleConfirmHandler` 取用器。经**实测审计**（2026-09-22）确认全是**闭合死代码**：
 *   · 除本文件外**零引用**（生产代码 / 测试 / e2e 全扫）；
 *   · 表的**唯一读取者** `getRoleConfirmHandler` 同样零调用
 *     ⇒ 既无静态引用、也无动态（表/字符串）可达路径。
 *   这些行为早已由**新引擎能力管道**（`roles/new_engine/*.ability.ts` +
 *   `useNightActionHandler.executeViaNewEngine`）承接 ⇒ 删除**不丢功能**。
 *   （验证：三闸门 + 全量 E2E 全绿；详见 skill `known-issues.md` §21。）
 *
 * ⚠️ 唯一保留的**活**导出：`executePoisonAction`
 *   （被 `useExecutionHandlers` / `useGameController` / `useGameFlow` 共 3 处引用）。
 */

import type React from "react";
import type { Seat } from "../../app/data";
import type { NightInfoResult } from "../types/game";

export function executePoisonAction(
  targetId: number,
  _isEvil: boolean,
  context: {
    nightInfo: NightInfoResult;
    seats: Seat[];
    setSeats: React.Dispatch<React.SetStateAction<Seat[]>>;
    setCurrentModal: (modal: any) => void;
    setSelectedActionTargets: (targets: number[]) => void;
    continueToNextAction: (latestSeats?: Seat[]) => void;
    isActorDisabledByPoisonOrDrunk: (
      seat: Seat | undefined,
      isPoisoned: boolean
    ) => boolean;
    addLogWithDeduplication: (
      msg: string,
      playerId?: number,
      roleName?: string
    ) => void;
    addPoisonMark: (seat: Seat, type: any, time: string) => any;
    computeIsPoisoned: (seat: Seat, seats: Seat[]) => boolean;
    markAbilityUsed: (roleId: string, seatId: number) => void;
  }
) {
  const {
    nightInfo,
    seats,
    setSeats,
    continueToNextAction,
    isActorDisabledByPoisonOrDrunk,
    addLogWithDeduplication,
    addPoisonMark,
    markAbilityUsed,
  } = context;

  const actorId = nightInfo?.seat?.id;
  const actorSeat =
    actorId !== undefined ? seats.find((s) => s.id === actorId) : undefined;
  const isDisabled = isActorDisabledByPoisonOrDrunk(
    actorSeat,
    nightInfo?.isPoisoned ?? false
  );

  // 无论是否中毒/醉酒，限次能力都正常消耗
  if (nightInfo.effectiveRole.id === "poisoner" && actorId !== undefined) {
    markAbilityUsed("poisoner", actorId);
  }

  if (isDisabled) {
    addLogWithDeduplication(
      `${(actorId ?? 0) + 1}号(${nightInfo?.effectiveRole?.name ?? "未知"}) 处于中毒/醉酒状态，下毒无效，能力已消耗`,
      actorId,
      nightInfo?.effectiveRole?.name
    );
    continueToNextAction();
    return;
  }

  // 🔧 跨角色状态时序修复：同步构建"下毒后"的新座位数组，
  //   setSeats 为异步更新，若 continueToNextAction 无参调用，下一步角色
  //   （如洗衣妇）的 guide 生成会用 latestSeatsRef（下毒前的旧座位）→
  //   被毒角色信息仍显示真实信息（实测 P0）。显式传递新座位让
  //   updateSnapshot 基于"含毒的最新座位"生成后续 guide。
  const poisonedSeats = seats.map((s: any) => {
    if (s.id === targetId) {
      const { statusDetails, statuses } = addPoisonMark(
        s,
        "poisoner",
        "次日黄昏"
      );
      return { ...s, isPoisoned: true, statusDetails, statuses };
    }
    return s;
  });
  setSeats(poisonedSeats);

  addLogWithDeduplication(
    `${(actorId ?? 0) + 1}号(${nightInfo?.effectiveRole?.name ?? "未知"}) 使 ${targetId + 1}号 中毒（持续至次日黄昏）`,
    actorId,
    nightInfo?.effectiveRole?.name
  );
  continueToNextAction(poisonedSeats);
}

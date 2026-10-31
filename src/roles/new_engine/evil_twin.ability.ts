/**
 * 邪恶双子（Evil Twin）新引擎技能实现
 *
 * 【角色能力】"你与一名对立阵营的玩家互相知道对方是什么角色。
 *   如果其中善良玩家被处决，邪恶阵营获胜。
 *   如果你们都存活，善良阵营无法获胜。"
 *
 * 首夜互知。全局效果：善良双子被处决时邪恶获胜。
 */

import { resolveEvilTwinPair } from "../../utils/evilTwinHelper";
import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const seat = ctx.snapshot.seats.find(
    (s: any) => s.id === ctx.actionNode.seatId
  );
  // 🔧 修复：死亡玩家不得发动能力（I3 不变式）。原实现死亡时直接返回 ctx → 不中止。
  if (!seat || seat.isDead) {
    return { ...ctx, aborted: true, abortReason: "邪恶双子已死亡" };
  }
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  /**
   * 🔴 判胜级严格解析（2026-11-01 P0「处决 15号小精灵被误判为处决善良双子」）：
   *   `resolveEvilTwinPair` 只认**显式证据** —— 说书人/引擎写入的 `evilTwinPair`
   *   或座位上的 `isGoodTwin` 标记；无证据时 `goodTwinSeat === null`，绝不猜测。
   *   （展示/调度路径才允许 `resolveEvilTwinPairForDisplay` 的启发式占位。）
   *
   * 对立双子来源优先级：说书人本次指定 > 已落库的权威证据 > 无（needsDesignation）。
   */
  const resolved = resolveEvilTwinPair(
    ctx.snapshot.seats,
    ctx.snapshot.evilTwinPair
  );
  const twinId =
    ctx.storytellerInput?.twinId ?? resolved.goodTwinSeat?.id ?? null;
  const needsDesignation = twinId == null;
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        // 未指定对立双子 ⇒ 首夜互知并未真正发生，不得谎报 twinRevealed。
        twinRevealed: !needsDesignation,
        twinId,
        goodTwinExecuted: false,
        evilWinsIfGoodTwinDies: true,
        needsDesignation,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const goodId = r?.twinId;
  const evilId = ctx.actionNode.seatId;
  /**
   * 🔴 无证据则不落库（2026-11-01 P0 修复）：
   *   原实现无条件写 `evilTwinPair: { goodSeatId: goodId }` 并执行
   *   `seats.map(s => ({...s, isGoodTwin: s.id === goodId}))` —— 当 goodId 为
   *   null 时等价于「写入 goodSeatId:null」+「清空所有座位的 isGoodTwin」，
   *   即凭空抹掉说书人已指定的权威配对，并让判胜路径拿到伪造的空配对。
   *   正确语义：说书人尚未指定时就**什么都不写**（不伪造、不清空），
   *   只在 postProcess 提示 needsDesignation。
   */
  if (goodId == null) {
    return {
      ...ctx,
      meta: { ...ctx.meta, evilTwinResult: r },
    };
  }
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      evilTwinPair: {
        evilSeatId: evilId,
        goodSeatId: goodId,
      },
      seats: ctx.snapshot.seats.map((s: any) => ({
        ...s,
        isGoodTwin: s.id === goodId,
      })),
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        evil_twin: r,
      },
    },
    meta: { ...ctx.meta, evilTwinResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  // 🔴 未指定对立双子：给出人读提示，而不是伪造配对（不得让判胜路径拿到本局"证据"）。
  if (r?.twinId == null) {
    const log =
      "尚未指定对立双子：请说书人在人物面板指定「对立双子」，或下次执行时选择一名对立阵营玩家";
    console.warn(`[EvilTwin] ${log}`);
    return {
      ...ctx,
      meta: {
        ...ctx.meta,
        abilityLog: log,
        displayInfo: {
          type: "evil_twin_info",
          log,
          twinId: null,
          twinRoleName: null,
          needsDesignation: true,
        },
      },
    };
  }
  const goodTwinSeat = ctx.snapshot.seats.find((s: any) => s.id === r?.twinId);
  const goodRoleName = goodTwinSeat?.role?.name || "未知角色";
  const log = goodTwinSeat
    ? `对立双子是${goodTwinSeat.id + 1}号【${goodRoleName}】角色`
    : "双子首夜互知完成";
  console.log(`[EvilTwin] ${log}`);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityLog: log,
      displayInfo: {
        type: "evil_twin_info",
        log,
        twinId: r?.twinId,
        twinRoleName: goodRoleName,
        needsDesignation: false,
      },
    },
  };
};

export const evil_twinAbility = createRoleAbility({
  roleId: "evil_twin",
  abilityId: "evil_twin_reveal",
  abilityName: "双子绑定",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT],
  firstNightPriority: 38,
  otherNightPriority: null,
  firstNightOnly: true,
  wakePromptId: "role.evil_twin.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

export const good_twin_infoAbility = createRoleAbility({
  roleId: "good_twin_info",
  abilityId: "good_twin_info",
  abilityName: "双子告知",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT],
  firstNightPriority: 38.5,
  otherNightPriority: null,
  firstNightOnly: true,
  wakePromptId: "role.good_twin_info.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  calculate: [
    async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
      const { evilTwinSeat } = resolveEvilTwinPair(
        ctx.snapshot.seats,
        ctx.snapshot.evilTwinPair
      );
      const evilSeatId = evilTwinSeat ? evilTwinSeat.id : null;
      const log = evilTwinSeat
        ? `${evilTwinSeat.id + 1}号是镜像双子`
        : "得知对立双子信息";
      return {
        ...ctx,
        meta: {
          ...ctx.meta,
          abilityLog: log,
          abilityResult: { evilTwinSeatId: evilSeatId },
          displayInfo: {
            type: "good_twin_info",
            log,
            evilTwinSeatId: evilSeatId,
          },
        },
      };
    },
  ],
});

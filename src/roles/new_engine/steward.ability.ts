/**
 * 事务官（Steward）新引擎技能实现
 * ======================================================================
 * 官方原文（`officialRoleDocs.json` · 事务官）：
 *   「在你的首个夜晚，你会得知一名善良玩家。」
 *
 * 运作方式：
 *   在首个夜晚，唤醒事务官，并指向一名善良玩家。让事务官重新入睡。
 *   若事务官醉酒或中毒，可告知任意玩家（包括邪恶玩家）。
 */
import type { MiddlewareContext } from "../../utils/middlewareTypes";
import { isSeatGood } from "../../utils/seatAlignment";
import { isSeatAlive } from "../../utils/seatAlive";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const base = await commonPreCheckAlive(ctx);
  if (base.aborted) return base;
  const isFirstNight =
    ctx.snapshot.gamePhase === "firstNight" || ctx.snapshot.nightCount === 1;
  if (!isFirstNight) {
    return {
      ...ctx,
      aborted: true,
      abortReason: "事务官仅在首夜获取信息",
    };
  }
  return base;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode, meta, storytellerInput } = ctx;
  const abilityEffective = meta.abilityEffective ?? true;
  const selfSeatId = actionNode.seatId;

  // 优先级 1：说书人显式指定或手动覆盖
  const specifiedTarget =
    storytellerInput?.targetId ??
    storytellerInput?.overrideResult?.targetId ??
    null;

  let targetId: number | null = specifiedTarget;

  if (targetId === null) {
    const seats = (snapshot.seats ?? []) as any[];
    // 善良玩家候选（排除自己、排除死者）
    const goodCandidates = seats.filter(
      (s: any) =>
        s.id !== selfSeatId &&
        isSeatAlive(s) &&
        (abilityEffective ? isSeatGood(s) : true)
    );
    if (goodCandidates.length > 0) {
      targetId = goodCandidates[0].id;
    } else {
      // 极端兜底：任意其他存活玩家
      const otherAlive = seats.filter(
        (s: any) => s.id !== selfSeatId && isSeatAlive(s)
      );
      targetId = otherAlive[0]?.id ?? null;
    }
  }

  const targetSeat = snapshot.seats?.find((s: any) => s.id === targetId);
  const targetName =
    targetSeat?.playerName ?? (targetId !== null ? `P${targetId + 1}` : "");

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetId,
        targetName,
        isGood: abilityEffective,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        steward: r,
      },
    },
    meta: { ...ctx.meta, stewardResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log =
    r?.targetId !== null
      ? `[Steward] 事务官得知 ${r.targetId + 1}号(${r.targetName}) 是善良玩家`
      : "[Steward] 事务官未获得信息";
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt:
        r?.targetId !== null
          ? `唤醒${ctx.actionNode.seatId + 1}号【事务官】，指向${r.targetId + 1}号玩家，告知其是善良阵营。`
          : `唤醒${ctx.actionNode.seatId + 1}号【事务官】。`,
      abilityLog: log,
    },
  };
};

export const stewardAbility = createRoleAbility({
  roleId: "steward",
  abilityId: "steward_info",
  abilityName: "得知善良玩家",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT],
  firstNightPriority: 64,
  otherNightPriority: null,
  firstNightOnly: true,
  wakePromptId: "role.steward.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

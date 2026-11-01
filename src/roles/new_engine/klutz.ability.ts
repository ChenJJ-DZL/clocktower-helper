/**
 * 呆瓜（Klutz）新引擎技能实现
 *
 * 【角色能力】官方原文（`src/data/officialRoleDocs.json` · 呆瓜）：
 *   「当你得知你死亡时，你要**公开选择一名存活的玩家**：
 *     如果他是邪恶的，**你的阵营落败**。」
 *
 * ⚠️⚠️ 2026-10-21 修正注释（原注释写的是**另一个角色的能力**）：
 *   旧注释写「当你第一次死亡时，**随机一名善良玩家死亡**」——
 *   那是「死时随机带人走」类能力，与呆瓜的「公开选人 + 选错阵营落败」完全不同。
 *   代码实现一直是对的（`evilWins = isEvil(chosenSeat)`、`klutzTriggered`），
 *   只有注释与 `postProcess` 文案把它描述错了 —— 这种「注释比代码更骗人」
 *   最容易把后来的维护者带偏（本项目已有先例）。
 *
 * 触发前提：座位**已死亡**且未触发过（`preCheck`）。
 * 选人来源：`targetIds[0]` / `actionNode.targetIds[0]` / 说书人 `chosenSeatId`。
 * 未选人 ⇒ `targetId: null`，不产生任何胜负变化。
 */
import type { MiddlewareContext } from "../../utils/middlewareTypes";
import { isSeatEvil } from "../../utils/seatAlignment";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const seat = ctx.snapshot.seats.find(
    (s: any) => s.id === ctx.actionNode.seatId
  );
  if (seat && !seat.isDead) return { ...ctx, aborted: true, abortReason: "尚未死亡" };
  // 已触发过则不再触发
  if ((ctx.snapshot as any).klutzTriggered)
    return { ...ctx, aborted: true, abortReason: "已触发过" };
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  // 支持通过 targetIds[0] 或 storytellerInput.chosenSeatId 选择存活玩家
  const targetId =
    ctx.targetIds?.[0] ??
    ctx.actionNode.targetIds?.[0] ??
    ctx.storytellerInput?.chosenSeatId ??
    null;

  if (targetId == null) {
    return {
      ...ctx,
      meta: {
        ...ctx.meta,
        abilityResult: { targetId: null, isEvil: false, evilWins: false },
      },
    };
  }

  const chosenSeat = ctx.snapshot.seats.find((s: any) => s.id === targetId);
  // 阵营判定统一走 utils/seatAlignment（转换标记 > 角色类型 > 兼容 alignment）
  const isEvil = isSeatEvil(chosenSeat);

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetId,
        isEvil,
        evilWins: isEvil,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r || r.targetId == null) return ctx;

  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      klutzTriggered: true,
      klutzChosenSeatId: r.targetId,
      gameOver: r.evilWins,
      winner: r.evilWins ? "evil" : (ctx.snapshot as any).winner,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        klutz: r,
      },
    },
    meta: { ...ctx.meta, klutzResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  /**
   * ⚠️ 旧文案写「随机杀死 N 号玩家」——与官方不符（呆瓜不杀人，是判阵营）。
   *   改为按真实语义输出，避免日志把说书人带偏。
   */
  const status =
    r?.targetId == null
      ? "未选择玩家（不产生胜负变化）"
      : `公开选择 ${(r.targetId ?? 0) + 1} 号玩家 ⇒ ${
          r?.evilWins ? "该玩家邪恶，呆瓜所在阵营落败" : "该玩家善良，无事发生"
        }`;
  const log = `[呆瓜] ${status}`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: "呆瓜死亡：公开选择一名存活玩家（选中邪恶则其阵营落败）。",
      abilityLog: log,
    },
  };
};

export const klutzAbility = createRoleAbility({
  roleId: "klutz",
  abilityId: "klutz_death",
  abilityName: "公开指控",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

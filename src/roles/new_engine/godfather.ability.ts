/**
 * 教父（Godfather）新引擎技能实现
 *
 * 【角色能力】"每个夜晚*，如果有外来者在今天死亡，你可以选择一名玩家：他死亡。
 *   如果有外来者死亡，你会在首夜得知。"
 *
 * 每夜可杀人，但仅在有外来者死亡时可以行动。
 */
import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const seat = ctx.snapshot.seats.find(
    (s: any) => s.id === ctx.actionNode.seatId
  );
  if (!seat || seat.isDead) return { ...ctx, aborted: true, abortReason: "已死亡" };
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const outsiderDiedToday = ctx.snapshot.outsiderDiedToday ?? false;
  const targetId = ctx.targetIds?.[0] ?? ctx.actionNode.targetIds?.[0] ?? null;

  if (!outsiderDiedToday) {
    return {
      ...ctx,
      aborted: true,
      abortReason: "今日无外来者死亡，教父无法行动",
    };
  }

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetId,
        killed: true,
        outsiderDiedToday,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.killed) return ctx;

  /**
   * ⚠️⚠️ 2026-09-21 修复 P0-B（醉酒/中毒门控缺失）：
   *   `stateUpdate` 此前不消费 `ctx.meta.abilityEffective`
   *   ⇒ 中毒/醉酒的教父照样击杀外来者。
   *
   * 🔒 blocked 分支刻意**不写** `snapshot.seats`（死亡就是"效果"），
   *   但**必须写 `lastKill`（`killed:false`）** ——
   *   `invariantTesting/invariants.ts:605` 把 `snap.lastKill !== undefined`
   *   列为 kill 语义的通过条件之一。
   *   ⚠️ 字段名与本角色一致（`minionId` / `minionRole`，不是 `demonId`）。
   */
  const abilityEffective = ctx.meta.abilityEffective ?? true;
  if (!abilityEffective) {
    return {
      ...ctx,
      snapshot: {
        ...ctx.snapshot,
        lastKill: {
          minionId: ctx.actionNode.seatId,
          targetId: null,
          minionRole: "godfather",
          killed: false,
        },
      },
      meta: { ...ctx.meta, isCorrupted: true },
    };
  }

  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      lastKill: {
        minionId: ctx.actionNode.seatId,
        targetId: r.targetId,
        minionRole: "godfather",
      },
      // 🔧 修复：教父击杀目标必须落地死亡标记（与三恶魔一致）。
      seats: ctx.snapshot.seats.map((seat: any) =>
        seat.id === r.targetId && !seat.isDead
          ? {
              ...seat,
              isDead: true,
              markedForDeath: true,
              diedAtNight: ctx.snapshot.nightCount,
              killedBy: "godfather",
              deathSource: "godfather_kill",
              deathSourceSeatId: (ctx.actionNode as any)?.seatId ?? null,
            }
          : seat
      ),
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        godfather: r,
      },
    },
    meta: { ...ctx.meta, godfatherResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log = r?.killed
    ? `[Godfather] 有外来者死亡，击杀 ${r.targetId + 1}号`
    : "[Godfather] 今日无外来者死亡";
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityLog: log,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【教父】，选择一名玩家杀害。`,
    },
  };
};

export const godfatherAbility = createRoleAbility({
  roleId: "godfather",
  effectSemantics: "kill",
  abilityId: "godfather_kill",
  abilityName: "替身击杀",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: 35,
  otherNightPriority: 69,
  firstNightOnly: false,
  wakePromptId: "role.godfather.wake",
  targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

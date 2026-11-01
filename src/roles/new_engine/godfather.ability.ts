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
import { isSeatOutsider } from "../../utils/seatAlignment";

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
  /**
   * 🔴 2026-10-23 修复（真缺陷，黯月初升 S03/S05/S06 三场一致）：
   *
   * 官方【教父】有**两条**能力：
   *   ① 「在你的**首个夜晚**，你会得知有哪些外来者角色在场。」
   *   ② 「如果有外来者在**白天**死亡，你会在当晚被唤醒并且你要选择一名玩家：他死亡。」
   *
   * 而本实现把它做成了**单一击杀能力** ⇒
   *   · 首夜**完全没有「得知外来者」这条信息**（注册表里没有对应的 info 分支）；
   *   · 首夜还照样走「替身击杀」的选目标流程（虽然 `outsiderDiedToday` 会中止，
   *     但说书人仍被问「杀谁」，且步骤名写成「替身击杀」）。
   *
   * 修法：首夜只产出「在场外来者」信息（`killed: false`），不进入击杀。
   *   判据用 `nightCount === 1`（首夜）—— 后续夜才按 `outsiderDiedToday` 判定。
   */
  const isFirstNight = (ctx.snapshot as any)?.nightCount === 1;
  if (isFirstNight) {
    const outsiders = ctx.snapshot.seats
      .filter((s: any) => !s.isDead && isSeatOutsider(s))
      .map((s: any) => ({ id: s.id, name: s.role?.name ?? s.role?.id ?? "?" }));
    return {
      ...ctx,
      meta: {
        ...ctx.meta,
        abilityResult: {
          isFirstNight: true,
          killed: false,
          outsiderInfo: outsiders,
        },
      },
    };
  }

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
  // 首夜（isFirstNight）只有信息、没有击杀 ⇒ 直接返回
  if (r?.isFirstNight === true || !r?.killed) return ctx;

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

  if (r?.isFirstNight === true) {
    /**
     * 首夜：把「在场外来者」做成说书人可见的信息页。
     * 官方只要求「你会得知有哪些外来者角色在场」——不含座位号也可以，
     * 这里一并给出座位，便于说书人核对（信息更完整不会破坏规则）。
     */
    const list: Array<{ id: number; name: string }> = r.outsiderInfo ?? [];
    const text =
      list.length === 0
        ? "本局没有存活的外来者"
        : list.map((x) => `${x.id + 1}号【${x.name}】`).join("、");
    const log = `[Godfather] 首夜得知在场外来者：${text}`;
    return {
      ...ctx,
      meta: {
        ...ctx.meta,
        abilityLog: log,
        displayInfo: {
          type: "godfather_outsider_info",
          outsiders: list,
          log,
        },
      },
    };
  }

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

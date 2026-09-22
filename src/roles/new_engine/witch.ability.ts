/**
 * 女巫（Witch）新引擎技能实现
 *
 * 【角色能力】"每个夜晚，你要选择一名玩家：如果他明天白天发起提名，他死亡。
 *   如果只有三名存活的玩家，你失去此能力。"
 *
 * 每夜诅咒一名玩家，被诅咒者若发起提名则死亡。
 * targetConfig: min=1, max=1 需要玩家选择目标
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
  // 三人局失去能力
  const aliveCount = ctx.snapshot.seats.filter((s: any) => !s.isDead).length;
  if (aliveCount <= 3)
    return {
      ...ctx,
      aborted: true,
      abortReason: "仅剩3名存活玩家，女巫失去能力",
    };
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const targetId = ctx.targetIds?.[0] ?? ctx.actionNode.targetIds?.[0] ?? null;
  return {
    ...ctx,
    meta: { ...ctx.meta, abilityResult: { targetId, cursed: true } },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (r?.targetId == null) return ctx;

  /**
   * ⚠️⚠️ 2026-09-21 修复 P0-B（醉酒/中毒门控缺失）：**中毒的巫婆不得咒杀任何人**。
   *
   * 背景：`witch` 的 `stateUpdate` 此前**完全不消费 `ctx.meta.abilityEffective`**
   * （全文件 `grep -c abilityEffective` = 0），⇒ 巫婆即使中毒/醉酒，
   * 依然会把目标标成 `isCursed` 并写 `witchCurse`。
   *
   * 🔴 这条为什么特别要紧：
   *   `useNightActionHandler.ts:1542-1546` 会把 `snapshot.witchCurse`
   *   **桥接成 legacy `witchCursedId`**，再由 `useDayActions.ts:226-228`
   *   在**白天提名时真的杀人** ⇒ 中毒的巫婆仍能隔夜咒杀。
   *
   * 🔒 blocked 分支**绝不能写**的字段（否则效果照旧落地）：
   *   · `snapshot.seats`（`isCursed` + `statusEffects: cursed` 都是效果本身）
   *   · `snapshot.witchCurse`（**最关键** —— 它就是白天杀人的触发源）
   *   ⇒ 只记「选择」与「已受干扰」，让说书人知道技能被发动但未生效。
   */
  const abilityEffective = ctx.meta.abilityEffective ?? true;
  if (!abilityEffective) {
    return {
      ...ctx,
      meta: {
        ...ctx.meta,
        witchResult: { ...r, blockedByDrunkOrPoison: true },
        isCorrupted: true,
      },
      snapshot: {
        ...ctx.snapshot,
        _abilityResults: {
          ...((ctx.snapshot as any)._abilityResults ?? {}),
          witch: { ...r, blockedByDrunkOrPoison: true },
        },
      },
    };
  }

  const nextSeats = (ctx.snapshot.seats ?? []).map((s: any) => {
    if (s.id === r.targetId) {
      const effects = [...(s.statusEffects ?? [])];
      if (!effects.some((e: any) => e.type === "cursed" && e.source === "witch")) {
        effects.push({
          type: "cursed",
          source: "witch",
          sourceSeatId: ctx.actionNode.seatId,
        });
      }
      return { ...s, isCursed: true, statusEffects: effects };
    }
    return s;
  });

  return {
    ...ctx,
    meta: { ...ctx.meta, witchResult: r },
    snapshot: {
      ...ctx.snapshot,
      seats: nextSeats,
      witchCurse: {
        ...((ctx.snapshot as any).witchCurse ?? {}),
        [r.targetId]: true,
      },
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        witch: r,
      },
    },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (r?.targetId == null) return ctx;
  const log = `[Witch] 诅咒 ${r.targetId + 1}号`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【女巫】，选择一名玩家进行诅咒。`,
      abilityLog: log,
    },
  };
};

export const witchAbility = createRoleAbility({
  roleId: "witch",
  abilityId: "witch_curse",
  abilityName: "恶咒",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: 39,
  otherNightPriority: 29,
  firstNightOnly: false,
  wakePromptId: "role.witch.wake",
  targetConfig: { min: 1, max: 1, allowSelf: true, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

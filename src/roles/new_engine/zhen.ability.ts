/**
 * 鸩（Zhen）新引擎技能实现
 *
 * 【角色能力】（官方 Wiki，2026-08-15 对齐）
 *   "每局游戏限一次，在夜晚时*，你可以选择一个镇民角色：如果他在场，他中毒并死亡。"
 *
 * 【角色简介】
 *   - 每局游戏限一次，除首个夜晚以外的其他夜晚，鸩可以选择一个镇民角色，
 *     如果那个角色在场，该角色对应的玩家会中毒并死亡。
 *   - 如果鸩选择了一个不在场的角色，不会有任何玩家受影响（即使之后该角色在场）。
 *   - 如果某个角色有多名玩家在场，且鸩选择了这个角色，只会有一名玩家中毒并死亡。
 *
 * 【网页版适配】"选择镇民角色"由角色选择弹窗表达（storytellerInput.roleId），
 * 非目标玩家选择。
 */

import {
  canUseLimitedAbility,
  consumeLimitedAbility,
  registerLimitedAbilityDefinition,
} from "../../utils/LimitedAbilityManager";
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// 注册限次定义：每局限一次
registerLimitedAbilityDefinition({
  abilityId: "zhen_poison",
  maxUses: 1,
  global: false,
  consumeWhenDrunkOrPoisoned: false,
  resetOnRoleChange: true,
});

// ─── 前置校验中间件 ────────────────────────────────────────────────────

const preCheckAlive = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const seat = ctx.snapshot.seats.find(
    (s: any) => s.id === ctx.actionNode.seatId
  );
  if (!seat?.isAlive) {
    return { ...ctx, aborted: true, abortReason: "鸩已死亡，技能失效" };
  }
  if ((ctx.snapshot.nightCount ?? 1) === 1) {
    return { ...ctx, aborted: true, abortReason: "首夜，鸩不行动" };
  }
  if (!canUseLimitedAbility(ctx.actionNode.seatId, "zhen_poison")) {
    return {
      ...ctx,
      aborted: true,
      abortReason: "鸩的能力已使用完毕（每局限一次）",
    };
  }
  return ctx;
};

// ─── 计算中间件 ─────────────────────────────────────────────────────────

/**
 * calculate：确定选择的镇民角色（storytellerInput.roleId）
 */
const calculateResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const roleId = (ctx.storytellerInput as any)?.roleId as string | undefined;
  if (!roleId) {
    return { ...ctx, aborted: true, abortReason: "鸩未选择镇民角色" };
  }
  return {
    ...ctx,
    meta: { ...ctx.meta, abilityResult: { roleId } },
  };
};

// ─── 状态更新中间件 ────────────────────────────────────────────────────

/**
 * stateUpdate：若选择的镇民角色在场 → 该角色一名玩家中毒并死亡。
 */
const stateUpdateResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const abilityResult = ctx.meta.abilityResult as
    | { roleId: string }
    | undefined;
  if (!abilityResult) return ctx;

  const { roleId } = abilityResult;
  const nightCount = ctx.snapshot.nightCount ?? 0;
  const seats = [...(ctx.snapshot.seats as any[])];

  // 找该镇民角色的存活玩家（若多名在场，仅一名受鸩影响）
  const targetSeat = seats.find(
    (s: any) =>
      !s.isDead && s.role?.id === roleId && s.role?.type === "townsfolk"
  );

  const record: Record<string, any> = {
    roleId,
    found: !!targetSeat,
    nightCount,
    timestamp: Date.now(),
  };

  if (targetSeat) {
    const idx = seats.findIndex((s: any) => s.id === targetSeat.id);
    if (idx !== -1) {
      const target = seats[idx];
      const effects = [...(target.statusEffects ?? [])];
      if (!effects.some((e: any) => e.type === "poisoned")) {
        effects.push({
          type: "poisoned",
          source: "zhen",
          sourceSeatId: ctx.actionNode.seatId,
        });
      }
      seats[idx] = {
        ...target,
        statusEffects: effects,
        isAlive: false,
        isDead: true,
        markedForDeath: true,
        diedAtNight: nightCount,
        killedBy: "zhen",
        deathSource: "zhen_poison_kill",
        deathSourceSeatId: ctx.actionNode.seatId,
      };
      record.targetId = target.id;
    }
    consumeLimitedAbility(ctx.actionNode.seatId, "zhen_poison");
  }

  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      seats,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        zhen: record,
      },
    },
    meta: { ...ctx.meta, zhenResult: record },
  };
};

// ─── 后置处理中间件 ────────────────────────────────────────────────────

const postProcessResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const record = ctx.meta.zhenResult as Record<string, any> | undefined;
  if (!record) return ctx;

  let abilityLog: string;
  if (!record.found) {
    abilityLog = `鸩选择镇民角色【${record.roleId}】，该角色不在场，无人受影响`;
  } else {
    abilityLog = `鸩选择镇民角色【${record.roleId}】，${record.targetId + 1}号玩家中毒并死亡`;
  }
  console.log(`[Zhen] ${abilityLog}`);

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【鸩】，选择一个镇民角色。（${abilityLog}）`,
      abilityLog,
      displayInfo: {
        type: "zhen_action",
        roleId: record.roleId,
        found: record.found,
        targetId: record.targetId ?? null,
        log: abilityLog,
      },
    },
  };
};

// ─── 导出能力注册 ─────────────────────────────────────────────────────

export const zhenAbility = createRoleAbility({
  roleId: "zhen",
  effectSemantics: "kill",
  abilityId: "zhen_night_ability",
  abilityName: "鸩毒",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: null,
  otherNightPriority: 44,
  firstNightOnly: false,
  wakePromptId: "role.zhen.wake",
  // 目标为"镇民角色"（storytellerInput.roleId），非玩家选择
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [preCheckAlive],
  calculate: [calculateResult],
  stateUpdate: [stateUpdateResult],
  postProcess: [postProcessResult],
});

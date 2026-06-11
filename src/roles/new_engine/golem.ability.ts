/**
 * 魔像（Golem）新引擎技能实现
 *
 * 【角色能力】"每局游戏你只能发起提名一次。当你发起提名时，如果被你提名的玩家不是恶魔，他死亡。"
 *
 * DAY 触发，限次能力（每局一次）。
 * 玩家发起提名时检测提名目标是否为恶魔。若不是恶魔，目标死亡。
 */
import {
  canUseLimitedAbility,
  consumeLimitedAbility,
  registerLimitedAbilityDefinition,
} from "../../utils/LimitedAbilityManager";
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

// 注册限次能力定义
registerLimitedAbilityDefinition({
  abilityId: "golem_nominate",
  maxUses: 1,
  global: false,
  consumeWhenDrunkOrPoisoned: true,
  resetOnRoleChange: true,
});

// 前置校验：检查是否已使用过提名能力
const preCheckLimitedAbility = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const seatId = context.actionNode.seatId;

  if (!canUseLimitedAbility(seatId, "golem_nominate")) {
    return {
      ...context,
      aborted: true,
      abortReason: "魔像已经使用过提名能力了",
    };
  }

  return context;
};

// 计算：检查提名目标是否为恶魔
const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const targetId = ctx.targetIds?.[0] ?? ctx.actionNode.targetIds?.[0] ?? null;
  const target =
    targetId != null
      ? ctx.snapshot.seats.find((s: any) => s.id === targetId)
      : null;

  const isDemon =
    target?.roleType === "demon" || target?.role?.type === "demon";
  const targetDies = !isDemon && targetId != null;

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetId,
        isDemon,
        targetDies,
      },
    },
  };
};

// 状态更新：执行击杀
const stateUpdate = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta, actionNode } = context;
  const r = meta.abilityResult as any;

  if (!r?.targetDies) {
    // 即使不击杀，也要消耗提名机会
    consumeLimitedAbility(actionNode.seatId, "golem_nominate");
    return context;
  }

  // 击杀目标
  const newSnapshot = {
    ...snapshot,
    seats: snapshot.seats.map((seat: any) => {
      if (seat.id === r.targetId) {
        return {
          ...seat,
          isAlive: false,
          isDead: true,
          deathSource: "golem_nominate",
          deathSourceSeatId: actionNode.seatId,
        };
      }
      return seat;
    }),
  };

  consumeLimitedAbility(actionNode.seatId, "golem_nominate");

  return {
    ...context,
    snapshot: newSnapshot,
    meta: {
      ...context.meta,
      targetKilled: true,
    },
  };
};

const postProcess = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta, actionNode } = context;
  const r = meta.abilityResult as any;

  if (!r?.targetId) {
    const log = `[Golem] 魔像（${actionNode.seatId + 1}号）发起提名，但未选择目标`;
    console.log(log);
    return context;
  }

  if (r.isDemon) {
    const log = `[Golem] 魔像（${actionNode.seatId + 1}号）提名了恶魔（${r.targetId + 1}号），恶魔未死亡（能力已消耗）`;
    console.log(log);
  } else {
    const log = `[Golem] 魔像（${actionNode.seatId + 1}号）提名了${r.targetId + 1}号非恶魔玩家，目标死亡`;
    console.log(log);
  }

  return {
    ...context,
    meta: {
      ...context.meta,
      prompt: `魔像（${actionNode.seatId + 1}号）发起提名，目标${r.targetId + 1}号${r.isDemon ? "是恶魔，未死亡" : "死亡"}。`,
      abilityLog: `[Golem] 提名${r.targetId + 1}号${r.isDemon ? "（恶魔，未死亡）" : "（已死亡）"}`,
    },
  };
};

export const golemAbility = createRoleAbility({
  roleId: "golem",
  abilityId: "golem_nominate_kill",
  abilityName: "钢铁一击",
  triggerTiming: [AbilityTriggerTiming.DAY],
  wakePriority: 0,
  firstNightOnly: false,
  wakePromptId: "role.golem.wake",
  targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [commonPreCheckAlive, preCheckLimitedAbility],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

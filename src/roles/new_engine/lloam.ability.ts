/**
 * 罗姆（Lloam）新引擎技能实现
 *
 * 【角色能力】"实验性恶魔，夜晚中毒玩家死亡。"
 *
 * 每夜自动检测所有中毒玩家，将其标记为死亡。
 * 说书人操作（targetIds 为空），无需选择目标。
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// ─── 辅助类型 ────────────────────────────────────────────────────────

interface PlayerLookup {
  id: number;
  isDead?: boolean;
  isAlive?: boolean;
  playerName?: string;
  statusEffects?: Array<{ type: string; [key: string]: any }>;
  markedForDeath?: boolean;
  deathSource?: string;
  deathSourceSeatId?: number;
  [key: string]: any;
}

// ─── 前置校验中间件 ──────────────────────────────────────────────────

/**
 * preCheck：存活检测
 */
const preCheckAlive = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode } = context;
  const seat = snapshot.seats.find((s: any) => s.id === actionNode.seatId);

  if (!seat?.isAlive) {
    return { ...context, aborted: true, abortReason: "罗姆已死亡，技能失效" };
  }

  return context;
};

// ─── 计算中间件 ───────────────────────────────────────────────────────

/**
 * calculate：查找所有中毒的存活玩家
 */
const findPoisonedTargets = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot } = context;

  const poisonedTargets = snapshot.seats
    .filter((s: any) => {
      if (!s.isAlive) return false;
      const effects = s.statusEffects ?? snapshot.statusEffects?.[s.id] ?? [];
      return effects.some((e: any) => e.type === "poisoned");
    })
    .map((s: any) => s.id);

  return {
    ...context,
    meta: {
      ...context.meta,
      abilityResult: {
        poisonedTargets,
        killCount: poisonedTargets.length,
      },
    },
  };
};

// ─── 状态更新中间件 ──────────────────────────────────────────────────

/**
 * stateUpdate：标记中毒玩家为死亡
 */
const updateState = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = context.meta.abilityResult as any;
  if (!r?.poisonedTargets?.length) return context;

  const { snapshot } = context;
  const targetSet = new Set<number>(r.poisonedTargets);

  const updatedSeats = snapshot.seats.map((seat: any) => {
    if (targetSet.has(seat.id)) {
      return {
        ...seat,
        markedForDeath: true,
        deathSource: "lloam_poison",
        deathSourceSeatId: context.actionNode.seatId,
      };
    }
    return seat;
  });

  const record = {
    poisonedTargets: r.poisonedTargets,
    nightCount: snapshot.nightCount ?? 0,
    timestamp: Date.now(),
  };

  return {
    ...context,
    snapshot: {
      ...snapshot,
      seats: updatedSeats,
      _abilityResults: {
        ...((snapshot as any)._abilityResults ?? {}),
        lloam: record,
      },
    },
    meta: {
      ...context.meta,
      lloamResult: record,
    },
  };
};

// ─── 后置处理中间件 ───────────────────────────────────────────────────

/**
 * postProcess：日志与提示词
 */
const postProcess = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = context.meta.abilityResult as any;
  const selfId = context.actionNode.seatId;

  const targetsLabel =
    r?.poisonedTargets?.length > 0
      ? r.poisonedTargets.map((id: number) => `${id + 1}号`).join("、")
      : "无";

  const abilityLog = `罗姆（${selfId + 1}号）处决中毒玩家：${targetsLabel}`;
  const prompt =
    r?.poisonedTargets?.length > 0
      ? `唤醒${selfId + 1}号【罗姆】，中毒玩家${targetsLabel}将在今晚死亡`
      : `唤醒${selfId + 1}号【罗姆】，今晚无中毒玩家`;

  console.log(`[Lloam] ${abilityLog}`);

  return {
    ...context,
    meta: {
      ...context.meta,
      prompt,
      abilityLog,
    },
  };
};

// ─── 导出能力注册 ─────────────────────────────────────────────────────

export const lloamAbility = createRoleAbility({
  roleId: "lloam",
  abilityId: "lloam_night_ability",
  abilityName: "毒杀处决",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  wakePromptId: "role.lloam.wake",
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [preCheckAlive],
  calculate: [findPoisonedTargets],
  stateUpdate: [updateState],
  postProcess: [postProcess],
});

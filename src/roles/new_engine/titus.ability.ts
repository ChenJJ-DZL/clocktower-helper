/**
 * 提图斯（Titus）新引擎技能实现
 *
 * 【角色能力】"实验性恶魔，恶魔处决，获得邪恶玩家阵营。"
 *
 * 每夜选择一名玩家将其处决（死亡），并获知其是否为邪恶阵营。
 * 说书人选择目标后，目标被标记为死亡，提图斯得知该玩家的阵营信息。
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
  role?: { id: string; name: string; type: string };
  roleId?: string;
  roleType?: string;
  alignment?: string;
  isGood?: boolean;
  isEvil?: boolean;
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
    return { ...context, aborted: true, abortReason: "提图斯已死亡，技能失效" };
  }

  return context;
};

// ─── 计算中间件 ───────────────────────────────────────────────────────

/**
 * calculate：确定处决目标，分析阵营
 */
const calculateExecution = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const targetId =
    context.targetIds?.[0] ?? context.actionNode.targetIds?.[0] ?? null;

  if (targetId == null) {
    return {
      ...context,
      aborted: true,
      abortReason: "提图斯必须选择一名玩家",
    };
  }

  const target = context.snapshot.seats.find((s: any) => s.id === targetId);
  if (!target) {
    return {
      ...context,
      aborted: true,
      abortReason: "目标玩家不存在",
    };
  }

  // 判断目标是否为邪恶阵营
  const isEvil =
    target.isEvil === true ||
    target.alignment === "evil" ||
    target.role?.type === "demon" ||
    target.role?.type === "minion";

  return {
    ...context,
    meta: {
      ...context.meta,
      abilityResult: {
        targetId,
        isEvil,
        isAlive: target.isAlive,
      },
    },
  };
};

// ─── 状态更新中间件 ──────────────────────────────────────────────────

/**
 * stateUpdate：标记目标为死亡
 */
const updateState = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = context.meta.abilityResult as any;
  if (!r?.targetId) return context;

  const { snapshot } = context;
  const record = {
    targetId: r.targetId,
    isEvil: r.isEvil,
    nightCount: snapshot.nightCount ?? 0,
    timestamp: Date.now(),
  };

  // 如果目标存活，标记死亡
  const updatedSeats = snapshot.seats.map((seat: any) => {
    if (seat.id === r.targetId && seat.isAlive) {
      return {
        ...seat,
        markedForDeath: true,
        deathSource: "titus_execution",
        deathSourceSeatId: context.actionNode.seatId,
      };
    }
    return seat;
  });

  return {
    ...context,
    snapshot: {
      ...snapshot,
      seats: updatedSeats,
      _abilityResults: {
        ...((snapshot as any)._abilityResults ?? {}),
        titus: record,
      },
    },
    meta: {
      ...context.meta,
      titusResult: record,
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

  if (!r?.targetId) {
    return {
      ...context,
      meta: {
        ...context.meta,
        prompt: `唤醒${selfId + 1}号【提图斯】，选择一名玩家处决。`,
        abilityLog: `提图斯（${selfId + 1}号）未选择目标`,
      },
    };
  }

  const alignmentLabel = r.isEvil ? "邪恶阵营" : "善良阵营";
  const targetLabel = `${r.targetId + 1}号`;

  // 如果目标已死亡（空刀），则无人死亡
  const executionNote = r.isAlive
    ? `，${targetLabel}将在今晚被处决`
    : `，但${targetLabel}已死亡（无人被处决）`;

  const abilityLog = `提图斯（${selfId + 1}号）处决${targetLabel}：${alignmentLabel}`;
  const storytellerPrompt = `唤醒${selfId + 1}号【提图斯】，选择一名玩家处决。（选择了${targetLabel}${executionNote}，提图斯得知其为${alignmentLabel}）`;

  console.log(`[Titus] ${abilityLog}`);

  return {
    ...context,
    meta: {
      ...context.meta,
      prompt: storytellerPrompt,
      abilityLog,
    },
  };
};

// ─── 导出能力注册 ─────────────────────────────────────────────────────

export const titusAbility = createRoleAbility({
  roleId: "titus",
  abilityId: "titus_night_ability",
  abilityName: "恶魔处决",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  wakePromptId: "role.titus.wake",
  targetConfig: {
    min: 1,
    max: 1,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [preCheckAlive],
  calculate: [calculateExecution],
  stateUpdate: [updateState],
  postProcess: [postProcess],
});

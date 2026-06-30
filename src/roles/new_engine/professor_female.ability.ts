/**
 * 教授（女）（Professor Female）新引擎技能实现
 *
 * 【角色能力】"每局游戏限一次，你可以在夜晚选择一名已死亡的善良玩家：他立刻复活。"
 *
 * 每局游戏限一次，夜晚选择一名已死亡的善良玩家，将其复活。
 * 与教授（男）的区别：不限制目标必须为镇民，只要目标是善良阵营即可。
 * 使用 LimitedAbilityManager 管理限次逻辑。
 */

import {
  canUseLimitedAbility,
  consumeLimitedAbility,
} from "../../utils/LimitedAbilityManager";
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
  isGood?: boolean;
  isEvil?: boolean;
  alignment?: string;
  statusEffects?: Array<{ type: string; [key: string]: any }>;
  [key: string]: any;
}

// ─── 前置校验中间件 ──────────────────────────────────────────────────

/**
 * preCheck 第 1 步：存活检测
 */
const preCheckAlive = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode } = context;
  const seat = snapshot.seats.find((s: any) => s.id === actionNode.seatId);

  if (!seat?.isAlive) {
    return { ...context, aborted: true, abortReason: "教授已死亡，技能失效" };
  }

  return context;
};

/**
 * preCheck 第 2 步：限次检测（每局游戏一次）
 */
const preCheckLimited = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { actionNode } = context;

  if (!canUseLimitedAbility(actionNode.seatId, "professor_female_resurrect")) {
    return {
      ...context,
      aborted: true,
      abortReason: "教授（女）已经使用过复活能力了",
    };
  }

  return context;
};

/**
 * preCheck 第 3 步：目标合法性检测（必须为已死亡的善良玩家）
 */
const preCheckTarget = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, targetIds } = context;
  const targetId = targetIds?.[0];

  if (targetId == null) {
    return {
      ...context,
      aborted: true,
      abortReason: "请选择一名已死亡的玩家",
    };
  }

  const targetSeat = snapshot.seats.find((s: any) => s.id === targetId);
  if (!targetSeat) {
    return {
      ...context,
      aborted: true,
      abortReason: "目标玩家不存在",
    };
  }

  if (targetSeat.isAlive) {
    return {
      ...context,
      aborted: true,
      abortReason: "只能选择已死亡的玩家",
    };
  }

  // 判断是否为善良阵营
  const isGood =
    targetSeat.isGood === true ||
    targetSeat.alignment === "good" ||
    targetSeat.role?.type === "townsfolk" ||
    targetSeat.role?.type === "outsider";

  if (!isGood) {
    return {
      ...context,
      aborted: true,
      abortReason: "只能选择善良阵营的玩家",
    };
  }

  return {
    ...context,
    meta: {
      ...context.meta,
      targetId,
      targetIsGood: isGood,
    },
  };
};

// ─── 状态更新中间件 ──────────────────────────────────────────────────

/**
 * stateUpdate：复活目标玩家并消耗限次能力
 */
const updateResurrection = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta, actionNode } = context;
  const targetId = meta.targetId as number | undefined;

  if (targetId == null) return context;

  const isAbilityEffective = meta.abilityEffective ?? true;

  let newSnapshot = { ...snapshot };

  if (isAbilityEffective) {
    newSnapshot = {
      ...snapshot,
      seats: snapshot.seats.map((seat: any) => {
        if (seat.id === targetId) {
          return {
            ...seat,
            isAlive: true,
            isDead: false,
            statusEffects: [
              ...seat.statusEffects,
              {
                type: "resurrected",
                source: "professor_female",
                sourceSeatId: actionNode.seatId,
              },
            ],
          };
        }
        return seat;
      }),
    };
  }

  // 无论是否有效，都消耗限次能力
  consumeLimitedAbility(actionNode.seatId, "professor_female_resurrect");

  return {
    ...context,
    snapshot: newSnapshot,
    meta: {
      ...context.meta,
      resurrectionSuccess: isAbilityEffective,
    },
  };
};

// ─── 导出能力注册 ─────────────────────────────────────────────────────

export const professorFemaleAbility = createRoleAbility({
  roleId: "professor_female",
  abilityId: "professor_female_night_ability",
  abilityName: "起死回生（女）",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  wakePromptId: "role.professor_female.wake",
  targetConfig: {
    min: 1,
    max: 1,
    allowSelf: false,
    allowDead: true,
  },
  preCheck: [preCheckAlive, preCheckLimited, preCheckTarget],
  calculate: [],
  stateUpdate: [updateResurrection],
  postProcess: [
    async (context: MiddlewareContext): Promise<MiddlewareContext> => {
      const { meta, targetIds, actionNode } = context;
      const targetId = targetIds?.[0];
      const success = meta.resurrectionSuccess as boolean | undefined;

      if (success && targetId != null) {
        console.log(
          `[ProfessorFemale] ${actionNode.seatId + 1}号(教授·女) 成功复活了 ${targetId + 1}号玩家`
        );
      } else if (targetId != null) {
        console.log(
          `[ProfessorFemale] ${actionNode.seatId + 1}号(教授·女) 尝试复活 ${targetId + 1}号玩家，但技能已使用或醉酒/中毒失效`
        );
      }

      return context;
    },
  ],
});

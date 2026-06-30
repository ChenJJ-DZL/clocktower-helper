/**
 * 驱魔人（Exorcist）新引擎技能实现
 *
 * 【角色能力】"每个夜晚*，你要选择一名玩家（不能与上个夜晚相同）：
 *   如果该玩家是恶魔，恶魔今晚不会杀人。"
 *
 * 每夜选择一名玩家。若目标为恶魔，则今晚恶魔无法杀人。
 * 不能连续两晚选择同一玩家。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

const calculate = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta, actionNode, targetIds } = context;
  const isAbilityActive = meta.abilityEffective ?? true;

  const targetId = targetIds?.[0] ?? null;
  if (targetId == null) {
    return {
      ...context,
      meta: {
        ...context.meta,
        abilityResult: {
          targetId: null,
          isTargetDemon: false,
          blocked: false,
        },
      },
    };
  }

  // 检查是否连续两晚选择同一玩家
  const lastTarget = (snapshot as any).lastExorcistTarget;
  if (lastTarget != null && targetId === lastTarget) {
    return {
      ...context,
      aborted: true,
      abortReason: "不能连续两晚选择同一玩家",
    };
  }

  const targetSeat = snapshot.seats.find((s: any) => s.id === targetId);
  const isTargetDemon =
    (targetSeat?.role?.type === "demon" ||
      (targetSeat as any)?.isDemonSuccessor) &&
    isAbilityActive;

  return {
    ...context,
    meta: {
      ...context.meta,
      abilityResult: {
        targetId,
        isTargetDemon,
        blocked: isTargetDemon,
        targetName: targetSeat?.role?.name || "未知",
      },
    },
  };
};

const stateUpdate = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = context.meta.abilityResult as any;
  if (!r?.targetId) return context;
  return {
    ...context,
    snapshot: {
      ...context.snapshot,
      demonBlocked: r.blocked
        ? true
        : ((context.snapshot as any).demonBlocked ?? false),
      lastExorcistTarget: r.targetId,
      _abilityResults: {
        ...((context.snapshot as any)._abilityResults ?? {}),
        exorcist: r,
      },
    },
    meta: { ...context.meta, exorcistResult: r },
  };
};

const postProcess = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta, actionNode } = context;
  const r = meta.abilityResult as any;

  if (r?.isTargetDemon) {
    console.log(
      `✨ ${actionNode.seatId + 1}号(驱魔人) 选中了恶魔(${r.targetId + 1}号)，恶魔今晚无法行动`
    );
  } else if (r?.targetId != null) {
    console.log(
      `${actionNode.seatId + 1}号(驱魔人) 选择了 ${r.targetId + 1}号(${r.targetName})`
    );
  } else {
    console.log(`${actionNode.seatId + 1}号(驱魔人) 未行动`);
  }

  return {
    ...context,
    meta: {
      ...context.meta,
      prompt: `唤醒${actionNode.seatId + 1}号【驱魔人】，选择一名玩家（不能与昨晚相同）。`,
      abilityLog: `[Exorcist] 选择${r?.targetId != null ? r.targetId + 1 + "号" : "无目标"}${r?.isTargetDemon ? "（命中恶魔）" : ""}`,
    },
  };
};

export const exorcistAbility = createRoleAbility({
  roleId: "exorcist",
  abilityId: "exorcist_night_ability",
  abilityName: "恶魔驱逐",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: null,
  otherNightPriority: 40,
  firstNightOnly: false,
  wakePromptId: "role.exorcist.wake",
  targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [commonPreCheckAlive],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

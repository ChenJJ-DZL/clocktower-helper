/**
 * 气球驾驶员（Balloonist）新引擎技能实现
 *
 * 【官方百科能力】"每个夜晚，你会得知一名与上个夜晚得知的玩家角色类型不同的玩家。[+0~1外来者]"
 *
 * 运作方式：
 * 每个夜晚得知一名与上夜得知的角色类型（镇民/外来者/爪牙/恶魔）不同的存活玩家。
 * 如果醉酒/中毒/受涡流影响，可能得知任意玩家（包含与上夜相同角色类型，或者错误的角色信息）。
 */
import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";
import { getPlayerRoleType } from "../../utils/expansionMechanics";

// ─── 计算结果中间件 ──────────────────────────────────────────────────────

const calculateResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode, meta, storytellerInput } = ctx;
  const isAbilityActive = meta.abilityEffective ?? true;
  const selfSeat = snapshot.seats.find((s: any) => s.id === actionNode.seatId);
  if (!selfSeat) {
    return { ...ctx, aborted: true, abortReason: "未找到气球驾驶员座位" };
  }

  // 获取上个夜晚得知的记录（角色类型与玩家）
  const prevResults: Record<string, any> =
    (snapshot as any)._abilityResults ?? {};
  
  // 查找最近一晚记录的 balloonist 信息
  let lastLearnedRoleType: string | null = null;
  const prevNight = snapshot.nightCount - 1;
  if (prevNight >= 1 && prevResults[`balloonist_${prevNight}`]) {
    lastLearnedRoleType = prevResults[`balloonist_${prevNight}`].roleType;
  } else if (prevResults.balloonist?.roleType) {
    lastLearnedRoleType = prevResults.balloonist.roleType;
  }

  // 存活玩家候选池
  const aliveSeats = snapshot.seats.filter((s: any) => s.isAlive);

  let candidateSeats: any[] = [];
  if (isAbilityActive) {
    // 正常状态：选择角色类型与上夜不同的玩家
    if (lastLearnedRoleType) {
      candidateSeats = aliveSeats.filter((s: any) => {
        const rType = getPlayerRoleType(s);
        return rType !== lastLearnedRoleType;
      });
    }
    if (candidateSeats.length === 0) {
      candidateSeats = aliveSeats;
    }
  } else {
    // 醉酒/中毒：说书人可以给相同角色类型的玩家（如连续两晚给镇民）或者任意玩家
    candidateSeats = aliveSeats;
  }

  // 确定目标：优先支持 storytellerInput 指定，否则从 candidateSeats 中选
  let targetSeatId: number | null = null;
  if (storytellerInput?.selectedSeatId != null) {
    targetSeatId = storytellerInput.selectedSeatId;
  } else if (candidateSeats.length > 0) {
    targetSeatId = candidateSeats[0].id;
  }

  const targetSeat = snapshot.seats.find((s: any) => s.id === targetSeatId);
  const targetRoleType = targetSeat ? getPlayerRoleType(targetSeat) : "unknown";

  // 判断是否产生信息破坏 (例如正常情况下要求不同类型，若相同或醉酒则记录 isCorrupted)
  const isCorrupted = !isAbilityActive || (lastLearnedRoleType != null && targetRoleType === lastLearnedRoleType);

  const abilityResult = {
    targetId: targetSeatId,
    targetRoleType,
    lastLearnedRoleType,
    isAbilityActive,
    isCorrupted,
  };

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult,
      isCorrupted,
      displayInfo: {
        targetId: targetSeatId,
        targetRoleType,
        isCorrupted,
      },
    },
  };
};

// ─── 状态更新中间件 ──────────────────────────────────────────────────────

const saveResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const historyEntry = {
    targetId: r?.targetId ?? null,
    roleType: r?.targetRoleType ?? null,
    night: ctx.snapshot.nightCount,
  };
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        balloonist: historyEntry,
        [`balloonist_${ctx.snapshot.nightCount}`]: historyEntry,
      },
    },
  };
};

// ─── 后处理中间件 ────────────────────────────────────────────────────────

const logResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (r?.targetId != null) {
    const tag = r.isCorrupted ? "【可能被干扰】" : "";
    const log = `[Balloonist]${tag} 得知 ${r.targetId + 1}号玩家（类型: ${r.targetRoleType}）`;
    console.log(log);
    return {
      ...ctx,
      meta: {
        ...ctx.meta,
        abilityLog: log,
        prompt: `唤醒${ctx.actionNode.seatId + 1}号【气球驾驶员】，指向${r.targetId + 1}号玩家。`,
      },
    };
  }
  const log = "[Balloonist] 无可选目标";
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityLog: log,
      prompt: `${ctx.actionNode.seatId + 1}号【气球驾驶员】当前无可选目标。`,
    },
  };
};

// ─── 导出能力定义 ────────────────────────────────────────────────────────

export const balloonistAbility = createRoleAbility({
  roleId: "balloonist",
  abilityId: "balloonist_night_ability",
  abilityName: "气球探查",
  triggerTiming: [
    AbilityTriggerTiming.FIRST_NIGHT,
    AbilityTriggerTiming.EVERY_NIGHT,
  ],
  firstNightPriority: 67,
  otherNightPriority: 101,
  firstNightOnly: false,
  wakePromptId: "role.balloonist.wake",
  targetConfig: { min: 0, max: 1, allowSelf: true, allowDead: false },
  preCheck: [commonPreCheckAlive],
  calculate: [calculateResult],
  stateUpdate: [saveResult],
  postProcess: [logResult],
});

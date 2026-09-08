/**
 * 侍女（Chambermaid）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

// 计算结果：选择两名玩家并计算被唤醒数量
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode, meta, targetIds } = context;
  const isAbilityActive = meta.abilityEffective ?? true;

  // 获取侍女座位
  const chambermaidSeat = snapshot.seats.find(
    (s) => s.id === actionNode.seatId
  );
  if (!chambermaidSeat) {
    return { ...context, aborted: true, abortReason: "未找到侍女座位" };
  }

  // 验证目标数量
  if (!targetIds || targetIds.length !== 2) {
    return { ...context, aborted: true, abortReason: "需要选择2名玩家" };
  }

  // 计算被唤醒数量
  let wokenCount = 0;

  if (isAbilityActive) {
    // 从 snapshot 查询两名目标玩家是否有本晚因自身能力唤醒的记录
    const wokenPlayers = new Set<number>();
    
    // 1. 支持显式记录的本夜唤醒玩家列表
    const explicitWoken = (snapshot as any).wokenPlayerIds ?? (snapshot as any).wokenPlayers;
    if (Array.isArray(explicitWoken)) {
      for (const id of explicitWoken) {
        if (typeof id === "number") wokenPlayers.add(id);
      }
    }

    // 2. 从 _abilityResults 中收集主动行动的玩家（仅限执行者自身，不含被选择的目标）
    const abilityResults = (snapshot as any)._abilityResults ?? {};
    for (const [key, r] of Object.entries(abilityResults) as [string, any][]) {
      // 恶魔若被驱魔人驱逐阻止唤醒，则不算唤醒
      if (key === "exorcist" && r?.isTargetDemon) continue;
      if (r && typeof r.seatId === "number") {
        wokenPlayers.add(r.seatId);
      }
      if (r && typeof r.actorSeatId === "number") {
        wokenPlayers.add(r.actorSeatId);
      }
    }

    const realWokenCount = targetIds.filter((tid: number) =>
      wokenPlayers.has(tid)
    ).length;

    const hasVortox =
      Boolean(
        context.snapshot.globalEffects?.vortoxWorld ??
          (context.snapshot as any).vortoxWorld ??
          (context.snapshot as any).isVortoxWorld
      ) ||
      context.snapshot.seats.some(
        (s: any) => s.role?.id === "vortox" && !s.isDead
      );

    if (!isAbilityActive || hasVortox) {
      // 醉酒/中毒/涡流时：100% 返回错误结果（从 0-2 中排除 realWokenCount）
      const fakeCandidates = [0, 1, 2].filter((v) => v !== realWokenCount);
      wokenCount =
        fakeCandidates[Math.floor(Math.random() * fakeCandidates.length)] ??
        (realWokenCount === 0 ? 1 : 0);
    } else {
      wokenCount = realWokenCount;
    }
  } else {
    // 默认兜底假信息（排除 0）
    wokenCount = 1;
  }

  const result = {
    targetIds,
    wokenCount,
    isDrunk: !isAbilityActive,
  };

  return { ...context, meta: { ...context.meta, abilityResult: result } };
};

// 状态更新：将结果存入snapshot
const stateUpdate = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta } = context;
  const result = meta.abilityResult;

  return {
    ...context,
    snapshot: {
      ...context.snapshot,
      _abilityResults: {
        ...((context.snapshot as any)._abilityResults ?? {}),
        chambermaid: result,
      },
    },
    meta: {
      ...context.meta,
      chambermaidResult: result,
    },
  };
};

export const chambermaidAbility = createRoleAbility({
  roleId: "chambermaid",
  abilityId: "chambermaid_night_ability",
  abilityName: "夜间查验",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: 82,
  otherNightPriority: 114,
  firstNightOnly: false,
  wakePromptId: "role.chambermaid.wake",
  targetConfig: {
    min: 2,
    max: 2,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [commonPreCheckAlive],
  calculate: [calculateResult],
  stateUpdate: [stateUpdate],
  postProcess: [
    async (context) => {
      const { meta, actionNode } = context;
      const result = meta.abilityResult as any;
      const targetText = result?.targetIds
        ? result.targetIds.map((t: number) => `${t + 1}号`).join("、")
        : "无目标";
      const wokenText = result?.wokenCount ?? 0;
      const corruptedText = result?.isDrunk
        ? "（醉酒/中毒中，结果可能不准确）"
        : "";
      const log = `[Chambermaid] 查验 ${targetText}: ${wokenText} 人被唤醒${corruptedText}`;
      console.log(log);
      return {
        ...context,
        meta: {
          ...context.meta,
          prompt: `唤醒${actionNode.seatId + 1}号【侍女】，选择2名玩家（不含自己）。告知结果：${targetText} 中有 ${wokenText} 人曾因能力被唤醒。`,
          abilityLog: log,
          displayInfo: {
            type: "chambermaid_info",
            targetIds: result?.targetIds ?? [],
            wokenCount: wokenText,
            log,
          },
        },
      };
    },
  ],
});

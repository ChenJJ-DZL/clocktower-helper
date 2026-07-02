/**
 * 侍女（Chambermaid）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
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
    // 从 _abilityResults 查询两名目标玩家是否有本晚的行动记录
    const abilityResults = (snapshot as any)._abilityResults ?? {};
    const results = Object.values(abilityResults) as any[];
    const wokenPlayers = new Set<number>();
    for (const r of results) {
      if (r && typeof r.seatId === "number") wokenPlayers.add(r.seatId);
      if (r && typeof r.targetId === "number") wokenPlayers.add(r.targetId);
    }
    wokenCount = targetIds.filter((tid: number) =>
      wokenPlayers.has(tid)
    ).length;
  } else {
    // 醉酒/中毒时，可能返回错误结果（随机值 0-2）
    wokenCount = Math.floor(Math.random() * 3);
  }

  // 涡流在场时信息也会反转（但这里简化处理，如果涡流存在，由 storyteller 自行判断）

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
        },
      };
    },
  ],
});

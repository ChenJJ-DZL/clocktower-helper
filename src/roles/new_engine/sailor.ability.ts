/**
 * 水手（Sailor）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

/**
 * 🔴 2026-09-22 修复：**删除了 `pickDrunkIdWhenInactive`（失效时在「自己/目标」间随机挑一个）**。
 *
 * 旧实现（已删）在能力失效时仍随机挑一个人施加 `drunk`，注释自述
 * 「说书人在自己与目标之间随机选一个」。**这与官方原文直接矛盾**：
 *
 *   【水手】→【提示标记】→「醉酒」→ **放置条件**（逐字引自 officialRoleDocs.json）：
 *     「…由说书人来选择水手醉酒还是水手选择的玩家醉酒，并在对应角色标记旁放置醉酒
 *       提示标记。水手无法选择已死亡的玩家。**若此时水手醉酒中毒，不放置该标记。**」
 *
 * ⇒ 中毒/醉酒的水手**不得让任何人（含自己）醉酒**，也就不存在"随机挑一个"这回事。
 *   该函数在生产里已无调用点，仅被一个测试引用 ⇒ 一并删除，避免
 *   「死代码 + 测试断言死行为」制造假绿。
 */

// 计算结果：选择目标并决定谁醉酒
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode, meta, targetIds } = context;
  const isAbilityActive = meta.abilityEffective ?? true;

  // 获取水手座位
  const sailorSeat = snapshot.seats.find((s) => s.id === actionNode.seatId);
  if (!sailorSeat) {
    return { ...context, aborted: true, abortReason: "未找到水手座位" };
  }

  // 获取目标座位
  const targetId = targetIds[0];
  const targetSeat = snapshot.seats.find((s) => s.id === targetId);

  if (!targetSeat) {
    return { ...context, aborted: true, abortReason: "未找到目标座位" };
  }

  let drunkId: number | null;
  let drunkReason: string;

  if (!isAbilityActive) {
    /**
     * 官方【提示标记】「醉酒」放置条件末句：
     *   「**若此时水手醉酒中毒，不放置该标记。**」
     * ⇒ `drunkId = null`，`stateUpdate` 随即早返回 ⇒ **不施加任何醉酒**。
     *   `isDrunk: true` 保留，用于向说书人标注「本次因醉酒/中毒而失效」。
     */
    drunkId = null;
    drunkReason = "（醉酒/中毒中 —— 官方：不放置醉酒标记）";
  } else {
    // 正常逻辑：如果目标是镇民，则目标醉酒；否则自身醉酒
    // 官方【角色简介】：「如果水手选择了一个镇民，说书人通常会让该镇民醉酒，
    //   但如果选择了外来者、爪牙或是恶魔，那么说书人通常会让水手自己醉酒。」
    const targetIsTownsfolk = targetSeat.role?.type === "townsfolk";
    drunkId = targetIsTownsfolk ? targetId : actionNode.seatId;
    drunkReason = targetIsTownsfolk
      ? "（目标为镇民，目标醉酒）"
      : "（目标非镇民，水手醉酒）";
  }

  const result = {
    targetId,
    drunkId,
    drunkReason,
    isDrunk: !isAbilityActive,
  };

  return { ...context, meta: { ...context.meta, abilityResult: result } };
};

// 状态更新：应用醉酒效果
const stateUpdate = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta } = context;
  const result = meta.abilityResult;

  if (result?.drunkId == null) {
    return context;
  }

  // 状态落地：给醉酒者加 drunk 标记（此前只透传 stateUpdates → I11 空转）
  const seats = (context.snapshot.seats ?? []) as any[];
  const targetIdx = seats.findIndex((s) => s.id === result.drunkId);
  if (targetIdx < 0) return context;
  const target = seats[targetIdx];
  const effects = [...(target.statusEffects ?? [])];
  if (!effects.some((e: any) => e.type === "drunk")) {
    effects.push({
      type: "drunk",
      source: "sailor",
      sourceSeatId: context.actionNode.seatId,
    });
  }
  const nextSeats = [...seats];
  nextSeats[targetIdx] = { ...target, isDrunk: true, statusEffects: effects };

  return {
    ...context,
    snapshot: {
      ...context.snapshot,
      seats: nextSeats,
    },
    meta: {
      ...context.meta,
      stateUpdates: {
        type: "ADD_DRUNK",
        targetId: result.drunkId,
        reason: "水手致醉",
        duration: "黄昏",
      },
    },
  };
};

export const sailorAbility = createRoleAbility({
  roleId: "sailor",
  effectSemantics: "drunk",
  abilityId: "sailor_night_ability",
  abilityName: "醉酒保护",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: 23,
  otherNightPriority: 8,
  firstNightOnly: false,
  wakePromptId: "role.sailor.wake",
  targetConfig: {
    min: 1,
    max: 1,
    allowSelf: true,
    allowDead: false,
  },
  preCheck: [commonPreCheckAlive],
  calculate: [calculateResult],
  stateUpdate: [stateUpdate],
  postProcess: [
    async (context) => {
      const { meta } = context;
      const result = meta.abilityResult;
      // ⚠️ `drunkId` 可能是 null（能力失效 ⇒ 官方不放置醉酒标记）⇒ 必须先判空再 +1，
      //    否则 `null + 1 === 1` 会打印成「1号醉酒」，与真实结算不符（说书人被误导）。
      console.log(
        result.drunkId == null
          ? `水手选择了${result.targetId + 1}号，本次不施加醉酒${result.drunkReason}`
          : `水手${result.isDrunk ? "（醉酒）" : ""}选择了${result.targetId + 1}号，${
              result.drunkId + 1
            }号醉酒至下个黄昏${result.drunkReason}`
      );
      return context;
    },
  ],
});

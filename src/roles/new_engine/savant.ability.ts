/**
 * 贤者（Savant）新引擎技能实现
 */

import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// 前置校验：检查是否存活、是否醉酒/中毒
const preCheckAliveAndStatus = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode } = context;
  const seat = snapshot.seats.find((s) => s.id === actionNode.seatId);

  if (!seat || seat.isDead) {
    return { ...context, aborted: true, abortReason: "玩家已死亡，技能失效" };
  }

  // 兼容引擎快照的 statusEffects 与 React Seat 的 isDrunk/isPoisoned 布尔字段
  const effectsList = seat.statusEffects ?? [];
  const isDrunk =
    effectsList.some((e: any) => e.type === "drunk") || seat.isDrunk === true;
  const isPoisoned =
    effectsList.some((e: any) => e.type === "poisoned") ||
    seat.isPoisoned === true;

  return {
    ...context,
    meta: {
      ...context.meta,
      isDrunk,
      isPoisoned,
      isAbilityActive: !(isDrunk || isPoisoned),
    },
  };
};

// 计算结果：每天获得一个正确信息和一个错误信息
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta, storytellerInput } = context;
  const isAbilityActive = meta.isAbilityActive ?? true;
  const abilityEffective = meta.abilityEffective ?? true;

  // ⚠️⚠️ 2026-09-20 修复 P0-5：**涡流局必须给假信息**。
  //   旧实现只读 `isAbilityActive`（醉酒/中毒），**从不读涡流**
  //   → 涡流在场时学者仍拿到「一对一错」的真实配对，静默破坏涡流核心机制。
  //   官方（涡流）：「任何时候角色是镇民的玩家通过能力获取信息时，
  //                   他们会得知错误信息。**哪怕他们醉酒或中毒，信息也一定是错误的**。」
  //   官方（贤者/学者）：正/误配对本就是「有真有假」，涡流下必须**两条都假**。
  const hasVortox =
    Boolean(
      snapshot.globalEffects?.vortoxWorld ??
        (snapshot as any).vortoxWorld ??
        snapshot.isVortoxWorld
    ) ||
    snapshot.seats.some(
      (s: any) => s.role?.id === "vortox" && !s.isDead
    );

  const isCorrupted = !isAbilityActive || !abilityEffective || hasVortox;

  // ⚠️⚠️ 2026-09-20 修复 P0-6：**禁止用占位字符串冒充信息**。
  //   旧实现缺省回退 `"正确信息" / "错误信息"` —— 这两个词会**原样出现在
  //   学者结算页与日志里**（实测回退值即为此字符串），既污染 UI，
  //   若透传到玩家端还会**直接泄漏"哪条是真的"**（涡流/中毒局尤甚）。
  //   ⇒ 正解：**说书人未填内容时，明确产出「占位待填」的结构化标记**，
  //      由 UI 呈现为「请输入信息」提示，绝不伪装成真实内容。
  let result: {
    correct: string;
    incorrect: string;
    needsStorytellerInput?: boolean;
  };

  if (isCorrupted) {
    // 醉酒/中毒/涡流时**两条都必须错误**（官方：涡流下一定是错误信息）
    const fake = storytellerInput?.fakeResult ?? storytellerInput?.result;
    result = fake
      ? { correct: fake.correct, incorrect: fake.incorrect }
      : {
          correct: "",
          incorrect: "",
          needsStorytellerInput: true,
        };
  } else {
    // 正常情况：一个正确信息，一个错误信息
    const real = storytellerInput?.result;
    result = real
      ? { correct: real.correct, incorrect: real.incorrect }
      : {
          correct: "",
          incorrect: "",
          needsStorytellerInput: true,
        };
  }

  return {
    ...context,
    meta: {
      ...context.meta,
      isCorrupted,
      hasVortox,
      abilityResult: result,
    },
  };
};

export const savantAbility = createRoleAbility({
  roleId: "savant",
  abilityId: "savant_day_ability",
  abilityName: "每日信息",
  triggerTiming: [AbilityTriggerTiming.DAY],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  wakePromptId: "role.savant.wake",
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [preCheckAliveAndStatus],
  calculate: [calculateResult],
  stateUpdate: [],
  postProcess: [
    async (context) => {
      const { meta } = context;
      const r = meta.abilityResult as any;
      const needsInput = !!r?.needsStorytellerInput;
      const hasVortox = !!(meta as any).hasVortox;
      const isCorrupted = !!meta.isCorrupted;

      // ⚠️ P0-6：有内容才组装文案；无内容时给「待说书人填写」的明确提示，
      //   **绝不**再输出 "正确信息 / 错误信息" 之类的占位词。
      const log = needsInput
        ? `贤者今日信息待说书人填写（${isCorrupted ? "能力受干扰：两条均须为错误信息" : "需一条正确 + 一条错误"}）`
        : `贤者获得信息：\n${
            isCorrupted
              ? `错误信息1：${r.correct}\n错误信息2：${r.incorrect}`
              : `正确信息：${r.correct}\n错误信息：${r.incorrect}`
          }`;

      return {
        ...context,
        meta: {
          ...context.meta,
          abilityLog: log,
          displayInfo: {
            type: "savant_info",
            correct: r?.correct ?? "",
            incorrect: r?.incorrect ?? "",
            isCorrupted,
            hasVortox,
            needsStorytellerInput: needsInput,
            log,
          },
        },
      };
    },
  ],
});

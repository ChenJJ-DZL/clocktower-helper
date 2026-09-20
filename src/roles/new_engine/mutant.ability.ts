/**
 * 变种人（Mutant）新引擎技能实现
 *
 * 【角色能力】"如果你公开声明自己是变种人，你可能会被处决。"
 *
 * ============================================================
 * ⚠️⚠️ 重要：本文件当前**不会被执行**（2026-09-21 实测确认）
 * ============================================================
 * 本能力 `triggerTiming: [PASSIVE]` 且 `firstNightPriority/otherNightPriority = null`
 * ⇒ 永不入夜序队列；且 `triggerTiming` 的唯一生产消费方是 `useNightEngine.ts:195`
 * 的 `ON_DEATH` 判定 ⇒ 管道永不运行。
 *
 * 变种人的**真实生效路径（SST）**是日间门禁三件套：
 *   ① `src/utils/mutantGate.ts::hasPendingMutantMadnessCheck`  — 门禁判据（SST）
 *   ② `components/ControlPanel.tsx:7`                          — 门禁消费点 1
 *   ③ `components/game/GameStage.tsx:11`                       — 门禁消费点 2
 *   ④ `hooks/useGameFlow.ts:14`（`handleDayEndTransition`）     — 门禁消费点 3
 *   ⑤ `hooks/useDayActions.ts:1086`                            — 日间能力通路（公开声明）
 *
 * 登记在 `roles/__tests__/poppyganda_ability_path_truth.test.ts` 真值表 `LEGACY` 项中。
 * ============================================================
 */
import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const seat = ctx.snapshot.seats.find(
    (s: any) => s.id === ctx.actionNode.seatId
  );
  if (!seat || seat.isDead) return { ...ctx, aborted: true, abortReason: "已死亡" };
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  // 通过 storytellerInput 或 meta 标记决定变种人是否已暴露身份
  const mutantRevealed =
    ctx.meta.mutantRevealed === true ||
    ctx.storytellerInput?.mutantRevealed === true;
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        mutantRevealed,
        canBeExecuted: mutantRevealed,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.mutantRevealed) return ctx;
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      mutantRevealed: true,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        mutant: r,
      },
    },
    meta: { ...ctx.meta, mutantResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const status = r?.mutantRevealed ? "已暴露身份 → 可被处决" : "身份隐藏";
  const log = `[变种人] ${status}`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: "检测变种人暴露状态。",
      abilityLog: log,
    },
  };
};

export const mutantAbility = createRoleAbility({
  roleId: "mutant",
  abilityId: "mutant_reveal",
  abilityName: "身份暴露",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

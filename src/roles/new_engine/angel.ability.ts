/**
 * 天使（Angel）新引擎技能实现（旅行者角色）
 *
 * 【角色能力】"首个夜晚，选择一名玩家：他今晚不会死亡。
 *   如果他是善良玩家，他会得知你。"
 *
 * 首夜保护一名玩家。若目标为善良，双方互知。
 */
import type { MiddlewareContext } from "../../utils/middlewareTypes";
import { isSeatTownsfolkOrOutsider } from "../../utils/seatAlignment";
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
  const targetId = ctx.targetIds?.[0] ?? ctx.actionNode.targetIds?.[0] ?? null;
  const target =
    targetId != null
      ? ctx.snapshot.seats.find((s: any) => s.id === targetId)
      : null;
  const isGood = isSeatTownsfolkOrOutsider(target);

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetId,
        protected: true,
        angelRevealed: isGood,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (r?.targetId == null) return ctx;
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      protectedTonight: [
        ...((ctx.snapshot as any).protectedTonight ?? []),
        r.targetId,
      ],
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        angel: r,
      },
    },
    meta: { ...ctx.meta, angelResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const reveal = r?.angelRevealed ? "（善良目标得知天使身份）" : "";
  const log = `[Angel] 保护 ${r?.targetId != null ? `${r.targetId + 1}号` : "无"}${reveal}`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityLog: log,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【天使】，选择一名玩家保护。`,
    },
  };
};

export const angelAbility = createRoleAbility({
  roleId: "angel",
  abilityId: "angel_protect",
  abilityName: "天使庇护",
  /**
   * 🔴 孤儿审计修复（2026-10-08）：天使在 `app/data.ts` 的官方类型是 **fabled（传奇）**
   * ——传奇是说书人工具，**没有玩家夜间行动节点**（保护由说书人私下标记，
   * 官方原文：「所有的玩家都会知道哪名玩家被天使保护了」=公开标记，非夜间选人）。
   * 此前 firstNightPriority: 35 让传奇角色泄漏进夜序（矩阵断言「traveler/fabled 不入夜序」抓到）。
   * ability 本体保留（保留能力台账只许变大，reserved_abilities_ledger），
   * triggerTiming 降为 PASSIVE + 双 priority 归 null —— 满足 I8 配置自洽
   * （fuzz 压测曾报「声明 FIRST_NIGHT 触发但 priority 为空」）。
   */
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  wakePromptId: "role.angel.wake",
  targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

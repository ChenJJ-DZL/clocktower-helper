/**
 * 哲人（Sage）新引擎技能实现
 *
 * 【角色能力】"如果你在夜晚被恶魔杀死，你会得知2名邪恶玩家。"
 *
 * PASSIVE 触发：需要检查死亡原因是否为恶魔，从 snapshot 中找2名邪恶玩家。
 */
import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const isDrunkOrPoisoned = ctx.meta.abilityEffective === false;
  const storytellerTargets = ctx.storytellerInput?.targetIds;
  const killedByDemon = ctx.storytellerInput?.killedByDemon ?? true;

  let targetIds: number[] = [];

  if (storytellerTargets && Array.isArray(storytellerTargets)) {
    targetIds = storytellerTargets;
  } else if (!killedByDemon) {
    targetIds = [];
  } else if (isDrunkOrPoisoned) {
    // 醉酒/中毒时，提供虚假信息（可能指出非恶魔玩家）
    const nonDemons = ctx.snapshot.seats.filter((s: any) => s.role?.type !== "demon");
    targetIds = nonDemons.slice(0, 2).map((s: any) => s.id);
  } else {
    // 官方规则：指出两名玩家，其中一名是恶魔
    const demons = ctx.snapshot.seats.filter((s: any) => s.role?.type === "demon");
    const others = ctx.snapshot.seats.filter((s: any) => s.role?.type !== "demon");
    const chosenDemon = demons[0]?.id;
    const chosenOther = others[0]?.id;
    if (chosenDemon !== undefined && chosenOther !== undefined) {
      targetIds = [chosenDemon, chosenOther];
    }
  }

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetIds,
        killedByDemon,
        found: targetIds.length > 0,
        isCorrupted: isDrunkOrPoisoned,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        sage: r,
      },
    },
    meta: { ...ctx.meta, sageResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log = r?.found
    ? `[哲人] 被恶魔杀，得知: ${r.targetIds.map((id: number) => `${id + 1}号`).join("、")}`
    : "[哲人] 被恶魔杀死，无线索";
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: "哲人在夜晚被恶魔杀死，告知其2名邪恶玩家。",
      abilityLog: log,
    },
  };
};

export const sageAbility = createRoleAbility({
  roleId: "sage",
  abilityId: "sage_death",
  abilityName: "被恶魔杀得知邪恶",
  /**
   * ⚠️⚠️ 2026-09-21 修复 P1-7【死亡触发角色误标 PASSIVE】：
   * 官方【角色能力】：「如果恶魔杀死了你，在当晚你会被唤醒并得知两名玩家，其中一名是杀死你的那个恶魔。」
   *   ⇒ 这是**死亡触发**能力，不是常驻被动。
   *
   * 🔴 原为 `[PASSIVE]` 的后果（与 `farmer.ability.ts:210-218` 的 P1-6 **完全同型**）：
   *   `useNightEngine.ts:194` 用 `triggerTiming.includes(ON_DEATH)` 打 `deathTriggered` 标，
   *   `dynamicQueueGenerator.ts:414` 据此做「仅在当晚死亡时才入队」门控。
   *   声明 PASSIVE ⇒ `deathTriggered=false` ⇒ **门控不生效** ⇒ 该角色**存活时也被排入夜间队列**
   *   （实测：二夜存活仍入队，见 `zz` 探针 / 真值表护栏）。
   *
   * ✅ 修法：`[PASSIVE]` → `[ON_DEATH]`，与 `farmer`(P1-6) / `ravenkeeper` / `banshee` /
   *   `moonchild` / `plague_doctor` 的既定范式一致（一律 `firstNightPriority: null` +
   *   `otherNightPriority: 81`）。本文件的夜序优先级此前已正确，**无需改动**。
   *
   * 🔎 漏网原因：罂粟花开批次的能力通路真值表护栏只覆盖 24 个罂粟花开角色，
   *   而本角色属**梦陨春宵**（内置剧本）⇒ 不在护栏覆盖范围内。护栏本轮已扩展。
   */
  triggerTiming: [AbilityTriggerTiming.ON_DEATH],
  firstNightPriority: null,
  otherNightPriority: 81,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

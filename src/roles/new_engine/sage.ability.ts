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
  /**
   * ⚠️ 击杀来源必须**显式**：`storytellerInput.killedByDemon`（说书人裁定）优先，
   *   其次 `meta.killedByDemon`，最后才落到「按恶魔死亡处理」的旧默认。
   *   官方【贤者#2】：「贤者死于麻脸巫婆，而非恶魔，所以贤者不会醒来也不会得知任何信息」
   *   ⇒ 默认值取 true 会让「任何死法都报警」，见 known_deviations.test.ts 的登记项。
   *   （此处暂不改默认值：生产链路尚未透传 killerRoleId，贸然 fail-closed 会让
   *     真正的恶魔击杀也静默失声 —— 两害相权，先登记偏差、等链路补齐再改。）
   */
  const killedByDemon =
    ctx.storytellerInput?.killedByDemon ??
    ctx.meta.killedByDemon ??
    true;

  let targetIds: number[] = [];

  if (storytellerTargets && Array.isArray(storytellerTargets)) {
    targetIds = storytellerTargets;
  } else if (!killedByDemon) {
    targetIds = [];
  } else if (isDrunkOrPoisoned) {
    /**
     * 🔴 2026-11-01：醉酒/中毒时必须给**可信的假信息**，且**不得指向自己**。
     *   官方【贤者#1】：醉酒的贤者被告知「一名死亡玩家 + 剩下的一名存活善良玩家」。
     *   旧实现 `nonDemons.slice(0, 2)` 会把贤者本人（座位 0）算进去
     *   ⇒ 玩家被提示「你和另一个人杀了你」这种不成立的组合。
     *   ⚠️ 只排除自己与非邪恶，不保证「一死一活」一定凑得齐（残局可能只有 1 人），
     *     凑不齐时给出去重后的实际候选，不编造座位。
     */
    const selfId = ctx.actionNode.seatId;
    const nonDemons = ctx.snapshot.seats.filter(
      (s: any) => s.role?.type !== "demon" && s.id !== selfId
    );
    const deadGood = nonDemons.filter((s: any) => s.isDead);
    const aliveGood = nonDemons.filter((s: any) => !s.isDead);
    /**
     * 官方要求的组合是「一名死亡玩家 + 一名存活善良玩家」，按此顺序取；
     * 残局凑不齐时依次回落到存活善良、其余非恶魔，**不去重后只剩 1 个**（旧写法会）。
     */
    const ordered = [deadGood[0], aliveGood[0], ...deadGood.slice(1), ...aliveGood.slice(1)]
      .map((s: any) => s?.id)
      .filter((id: number | undefined): id is number => id !== undefined);
    targetIds = [...new Set(ordered)].slice(0, 2);
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
      // X03 矩阵（2026-10-22）：顶层契约字段；本角色原先完全没有 displayInfo，
      // 只把 isCorrupted 塞在 abilityResult 里 ⇒ 消费方读顶层时漏判。
      isCorrupted: r?.isCorrupted ?? false,
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

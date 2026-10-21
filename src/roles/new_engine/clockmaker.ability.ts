/**
 * 钟表匠（Clockmaker）新引擎技能实现
 */

import { isVortoxWorldActive } from "../../utils/vortoxWorld";
import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  createDeterministicRandom,
  type DeterministicRandom,
  nightInfoSeed,
} from "../core/deterministicRandom";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// ─── 辅助函数 ─────────────────────────────────────────────────────────

/**
 * 醉酒/中毒时生成虚假的「恶魔与爪牙最近距离」。
 * 规则：从 [0..4] 中排除真实值后随机，保证结果与真实值不同。
 *
 * @param rng 确定性随机源（默认 Math.random，管线内传入按夜次播种的序列）
 */
export function pickFakeClockmakerDistance(
  realDistance: number,
  rng: DeterministicRandom = Math.random
): number {
  const possibleFakeValues = [0, 1, 2, 3, 4].filter(
    (v) => v !== realDistance
  );
  return (
    possibleFakeValues[Math.floor(rng() * possibleFakeValues.length)] ??
    Math.floor(rng() * 4) + 1
  );
}

// 前置校验：检查是否存活、是否醉酒/中毒
const preCheckAliveAndStatus = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode } = context;
  const seat = snapshot.seats.find((s) => s.id === actionNode.seatId);

  if (!seat || seat.isDead) {
    return { ...context, aborted: true, abortReason: "玩家已死亡，技能失效" };
  }

  const isDrunk = (seat.statusEffects ?? []).some(
    (e: any) => e.type === "drunk"
  );
  const isPoisoned = (seat.statusEffects ?? []).some(
    (e: any) => e.type === "poisoned"
  );

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

// 计算结果：计算恶魔与爪牙的最近距离
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta } = context;
  const isAbilityActive = meta.isAbilityActive ?? true;

  // 🎲 确定性随机：同一夜、同一角色的重复计算（提示预演 / 实际执行）必须得到
  // 完全相同的距离，否则说书人照提示念的结果会与结果弹窗对不上。
  const rng = createDeterministicRandom(
    nightInfoSeed(
      "clockmaker",
      context.actionNode.seatId,
      snapshot.nightCount ?? 1
    )
  );

  let minDistance: number;

  /**
   * 🌪️ 涡流世界：官方「所有镇民玩家的能力都会产生错误信息」——
   *   **哪怕没有被醉/毒，也必须取假**。
   *
   * 🔴 2026-10-22 实测（梦殒春宵 S10，涡流局）：钟表匠（9号）报「最近距离 2」，
   *   而独立复算的真值也是 2 ⇒ **信息没有取假**，违反涡流契约。
   *   根因：本文件只有「醉/毒 ⇒ 假值」分支，**完全没有涡流分支**
   *   （对照 `chambermaid.ability.ts` 是有 `hasVortox` 判定的）。
   *   修法：把涡流也算进「必须给假值」，与醉/毒共用 `pickFakeClockmakerDistance`
   *   （该函数保证从 0..seatCount 中**排除真值**）。
   */
  /**
   * ⚠️ 判据必须走 SST `isVortoxWorldActive`（`vortox_info_contract` 的静态护栏会抓内联写法：
   *   漏掉「涡流是否存活」就会出现「涡流死后仍取假」）。
   */
  const hasVortox =
    isVortoxWorldActive(snapshot.seats) ||
    Boolean(
      (snapshot as any).globalEffects?.vortoxWorld ??
        (snapshot as any).vortoxWorld ??
        (snapshot as any).isVortoxWorld
    );

  if (!isAbilityActive || hasVortox) {
    // 醉酒/中毒/**涡流世界**时返回虚假信息（涡流不受醉毒影响，一样必假）
    const realDistance = meta.initialNightInfo?.clockmakerInfo ?? 1;
    minDistance =
      context.storytellerInput?.fakeResult ??
      pickFakeClockmakerDistance(realDistance, rng);
  } else {
    // 正常情况：计算所有恶魔与爪牙组合的最小距离
    const seats = [...snapshot.seats];
    const seatCount = seats.length;

    // 相克规则：如果召唤师在场，被视为恶魔
    const summonerInPlay = seats.some((s) => s.roleId === "summoner");

    const demons = seats.filter(
      (s) =>
        s.role?.type === "demon" ||
        s.roleId === "summoner" ||
        s.role?.id === "summoner" ||
        (summonerInPlay && s.roleId === "summoner")
    );
    const minions = seats.filter((s) => s.role?.type === "minion");

    if (demons.length === 0 || minions.length === 0) {
      minDistance = 0;
    } else {
      minDistance = seatCount;

      for (const demon of demons) {
        for (const minion of minions) {
          if (demon.id === minion.id) continue;

          // 计算环形距离
          const diff = Math.abs(demon.id - minion.id);
          const distance = Math.min(diff, seatCount - diff);

          if (distance < minDistance) {
            minDistance = distance;
          }
        }
      }
    }
  }

  return {
    ...context,
    meta: { ...context.meta, abilityResult: minDistance },
  };
};

export const clockmakerAbility = createRoleAbility({
  roleId: "clockmaker",
  abilityId: "clockmaker_first_night_ability",
  abilityName: "恶魔爪牙距离感知",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT],
  firstNightPriority: 61,
  otherNightPriority: null,
  firstNightOnly: true,
  wakePromptId: "role.clockmaker.wake",
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
      const dist = meta.abilityResult;
      const log = `钟表匠获得信息：恶魔与爪牙的最近距离为 ${dist}`;
      console.log(log);
      return {
        ...context,
        meta: {
          ...context.meta,
          abilityLog: log,
          displayInfo: { type: "clockmaker_info", distance: dist, log },
        },
      };
    },
  ],
});

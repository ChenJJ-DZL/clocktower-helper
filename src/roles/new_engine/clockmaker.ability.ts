/**
 * 钟表匠（Clockmaker）新引擎技能实现
 */

import { isVortoxWorldActive } from "../../utils/vortoxWorld";
import { isSeatDisabled } from "../../utils/seatDisabled";
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

  /**
   * 🔴 2026-10-22（X03 矩阵查出）：此处原先**只读 `seat.statusEffects`**，
   *   漏掉布尔位 `seat.isPoisoned` / `seat.isDrunk` 与中文 `statusDetails` 标记
   *   ⇒ 实战里被投毒者/醉酒者照样算出真值（中毒时报数 == 真值 = 信息泄漏）。
   *   统一走全项目唯一权威 `isSeatDisabled`（它认全部 8 种表示），
   *   并把结果写成 `meta.abilityEffective`，让下游与其余 12 个信息角色同契约。
   */
  const disabled = isSeatDisabled(seat as any, snapshot.seats as any);

  return {
    ...context,
    meta: {
      ...context.meta,
      isDrunk: (seat as any).isDrunk === true,
      isPoisoned: (seat as any).isPoisoned === true,
      isAbilityActive: !disabled,
      abilityEffective: !disabled,
    },
  };
};

// 计算结果：计算恶魔与爪牙的最近距离
/**
 * 环形棋盘上「恶魔 ↔ 爪牙」的最短距离（真值）。
 *
 * 相克规则：召唤师在场时被视为恶魔（官方相克表）。
 * 与 `corruptedInfo` 的假值生成解耦 —— 假值必须**排除**本函数的结果，
 * 所以真值一定要独立算出，不能依赖 `initialNightInfo` 之类的旁路字段。
 */
function computeRealDistance(seats: any[]): number {
  const seatCount = seats.length;
  if (seatCount === 0) return 0;

  const summonerInPlay = seats.some((s) => s.roleId === "summoner");

  const demons = seats.filter(
    (s) =>
      s.role?.type === "demon" ||
      s.roleId === "summoner" ||
      s.role?.id === "summoner" ||
      (summonerInPlay && s.roleId === "summoner")
  );
  const minions = seats.filter((s) => s.role?.type === "minion");

  if (demons.length === 0 || minions.length === 0) return 0;

  let best = seatCount;
  for (const demon of demons) {
    for (const minion of minions) {
      if (demon.id === minion.id) continue;
      const diff = Math.abs(demon.id - minion.id);
      const distance = Math.min(diff, seatCount - diff);
      if (distance < best) best = distance;
    }
  }
  return best;
}

const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta } = context;
  /**
   * `abilityEffective` 由全局中间件（中毒/醉酒/咖啡师/涡流…）统一写入，优先级最高；
   * `isAbilityActive` 是本角色 preCheck 自己的旧字段，作为兜底保留。
   */
  const isAbilityActive =
    meta.abilityEffective !== undefined
      ? meta.abilityEffective !== false
      : (meta.isAbilityActive ?? true);

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

  /**
   * 真实距离 —— **先算真值，再决定是否取假**。
   * 旧实现在假值分支里用 `meta.initialNightInfo?.clockmakerInfo ?? 1` 当真值基准，
   * 该字段在多数链路里是 undefined ⇒ 基准恒为 1 ⇒ 真值恰好是 1 时
   * `pickFakeClockmakerDistance(1, rng)` 会返回 0/2/3/4（不会撞真值），
   * 但真值不是 1 时它仍可能返回 1，从而**与真值相同**（泄漏）。
   * 改为用真实计算值作排除基准，保证假值 ≠ 真值恒成立。
   */
  const realDistance = computeRealDistance(snapshot.seats as any[]);

  if (!isAbilityActive || hasVortox) {
    // 醉酒/中毒/**涡流世界**时返回虚假信息（涡流不受醉毒影响，一样必假）
    minDistance =
      context.storytellerInput?.fakeResult ??
      pickFakeClockmakerDistance(realDistance, rng);
  } else {
    minDistance = realDistance;
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
      /**
       * 🔴 2026-10-22（X03 矩阵）：本角色原先**完全没有 `isCorrupted` 标记**，
       *   与其余 12 个信息角色「顶层 meta.isCorrupted + displayInfo.isCorrupted」
       *   的契约不一致 —— 消费方按顶层判断会漏掉，中毒玩家看到真值却无任何提示。
       */
      const corrupted = meta.abilityEffective === false;
      const log = `钟表匠获得信息：恶魔与爪牙的最近距离为 ${dist}`;
      console.log(log);
      return {
        ...context,
        meta: {
          ...context.meta,
          isCorrupted: corrupted,
          abilityLog: log,
          displayInfo: {
            type: "clockmaker_info",
            distance: dist,
            isCorrupted: corrupted,
            log,
          },
        },
      };
    },
  ],
});

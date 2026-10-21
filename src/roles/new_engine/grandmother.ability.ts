/**
 * 祖母 (Grandmother) - 黯月初升剧本
 *
 * 角色能力：
 * - 在你的首个夜晚，你会得知一名善良玩家和他的角色。
 * - 如果恶魔杀死了他，你也会死亡。
 *
 * 触发时机：FIRST_NIGHT（首夜）
 */

import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";
import {
  createDeterministicRandom,
  type DeterministicRandom,
  nightInfoSeed,
} from "../core/deterministicRandom";
import { isSeatGood } from "../../utils/seatAlignment";

// 前置校验：检查是否存活、是否醉酒/中毒
const preCheckAliveAndStatus = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode } = context;
  const seat = snapshot.seats.find((s) => s.id === actionNode.seatId);

  const actorAlive = seat ? !(seat as any).isDead : false;
  if (!actorAlive) {
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

/**
 * 醉酒/中毒时随机挑一名"假孙子"。
 *
 * rng 必须由调用方注入：calculate 会被执行两次（生成"当前的行动"预演 +
 * 真正结算），若两处各自调用 Math.random()，预演告知的孙子与实际告知的不是同一人。
 */
export function pickFakeGrandchildId(
  seats: any[],
  rng: DeterministicRandom = Math.random
): number {
  if (seats.length === 0) return -1;
  return seats[Math.floor(rng() * seats.length)].id;
}

// 计算结果：告知孙子信息
const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, meta, actionNode } = context;
  const isAbilityActive = meta.isAbilityActive ?? true;
  const selfSeat = snapshot.seats.find((s) => s.id === actionNode.seatId);

  // 🎲 确定性随机：同一夜、同一祖母的重复计算必须得到同一名孙子
  const rng = createDeterministicRandom(
    nightInfoSeed(
      "grandmother",
      actionNode.seatId,
      snapshot.nightCount ?? 1
    )
  );

  let result: {
    grandchildId: number;
    grandchildRoleId: string;
    grandchildRoleName: string;
  };

  if (!isAbilityActive || !selfSeat) {
    // 醉酒/中毒或找不到自己时返回虚假信息
    result = {
      grandchildId: pickFakeGrandchildId(snapshot.seats, rng),
      grandchildRoleId: "villager",
      grandchildRoleName: "镇民",
    };
  } else {
    /**
     * 🔴 2026-10-23 修复（真缺陷，黯月初升 S03/S05/S06 三场一致）：
     *   `selfSeat.grandchildId` **全仓库没有任何写入点** ⇒ 恒为 undefined
     *   ⇒ `result.grandchildId = -1` ⇒ `postProcess` 不产生 `displayInfo`
     *   ⇒ 祖母**首夜只有「行动确认」，永远拿不到「孙子 + 他的角色」**。
     *
     * 官方【祖母】：「在你的首个夜晚，你会得知一名善良玩家和他的角色。」
     *   由说书人指定（本引擎里说书人没有该入口时）⇒ 引擎应**确定性地**
     *   挑一名「存活且善良、非自己」的玩家作为孙子，并在 `stateUpdate` 落库，
     *   供「若恶魔杀死他，你也会死」的后续判定使用。
     */
    let grandchildId = (selfSeat as any).grandchildId;

    if (grandchildId === undefined || grandchildId === null) {
      const candidates = snapshot.seats.filter(
        (s: any) => s.id !== actionNode.seatId && !s.isDead && isSeatGood(s)
      );
      grandchildId =
        candidates.length > 0
          ? candidates[Math.floor(rng() * candidates.length)].id
          : -1;
    }

    if (grandchildId === undefined || grandchildId === null) {
      result = {
        grandchildId: -1,
        grandchildRoleId: "",
        grandchildRoleName: "",
      };
    } else {
      const grandchild = snapshot.seats.find((s) => s.id === grandchildId);

      if (!grandchild || !grandchild.role) {
        result = {
          grandchildId: grandchildId,
          grandchildRoleId: "",
          grandchildRoleName: "",
        };
      } else {
        result = {
          grandchildId: grandchild.id,
          grandchildRoleId: grandchild.role.id,
          grandchildRoleName: grandchild.role.name,
        };
      }
    }
  }

  return { ...context, meta: { ...context.meta, abilityResult: result } };
};

export const grandmotherAbility = createRoleAbility({
  roleId: "grandmother",
  abilityId: "grandmother_first_night_ability",
  abilityName: "孙子识别",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT],
  firstNightPriority: 60,
  otherNightPriority: null,
  firstNightOnly: true,
  wakePromptId: "role.grandmother.wake",
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [preCheckAliveAndStatus],
  calculate: [calculateResult],
  /**
   * 🔴 2026-10-23：`stateUpdate` 原本是**空数组** ⇒ 算出来的孙子既没写回祖母座位
   *   （`grandchildId`），也没在孙子座位上留痕（`isGrandchild`）
   *   ⇒ 「如果恶魔杀死了他，你也会死」这条规则也拿不到判据。
   *   现在把两处都写回（座位会同步并进持久化）。
   *   ⚠️ 醉/毒时不写（那是假信息，不能污染真值）。
   */
  stateUpdate: [
    async (context) => {
      const r = context.meta.abilityResult as any;
      const active = context.meta.isAbilityActive ?? true;
      if (!active || !r || r.grandchildId == null || r.grandchildId < 0) {
        return context;
      }
      const selfId = context.actionNode.seatId;
      return {
        ...context,
        snapshot: {
          ...context.snapshot,
          seats: context.snapshot.seats.map((s: any) => {
            if (s.id === selfId) return { ...s, grandchildId: r.grandchildId };
            if (s.id === r.grandchildId) return { ...s, isGrandchild: true };
            return s;
          }),
        },
      };
    },
  ],
  postProcess: [
    async (context) => {
      const { meta, actionNode } = context;
      const result = meta.abilityResult;
      if (result && result.grandchildId !== -1) {
        const log = `祖母(${actionNode.seatId + 1}号)被告知：${result.grandchildId + 1}号是孙子，角色是${result.grandchildRoleName}`;
        console.log(log);
        return {
          ...context,
          meta: {
            ...context.meta,
            abilityLog: log,
            displayInfo: {
              type: "grandmother_info",
              grandchildId: result.grandchildId,
              grandchildRoleName: result.grandchildRoleName,
              log,
            },
          },
        };
      }
      return context;
    },
  ],
});

/**
 * 理发师（Barber）新引擎技能实现
 *
 * 【角色能力】"如果你在夜晚死亡，你可以交换两名玩家的角色。"
 *
 * PASSIVE 触发：夜晚死亡时触发，可交换两名玩家角色。
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
  if (!seat) return ctx;
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const swapA = ctx.storytellerInput?.swapA ?? null;
  const swapB = ctx.storytellerInput?.swapB ?? null;
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        barberDied: true,
        swapA,
        swapB,
        swapped: swapA !== null && swapB !== null,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  /**
   * ⚠️⚠️ 2026-09-21 修复 P0-B（醉酒/中毒门控缺失）：
   *   本 `stateUpdate` 此前**完全不消费 `ctx.meta.abilityEffective`**
   *   ⇒ 中毒/醉酒的该角色照样施加效果（与已修的 cerenovus / vortox 同类）。
   *
   * 🔒 blocked 分支**只记「选择」与「已受干扰」**，刻意**不写**：
   *   · `snapshot.seats`（死亡 / 状态效果本身就是"效果"，写了就等于能力生效）
   *   · 各角色的特征副作用字段（如相邻中毒名单 / 变身标记 / 交换标记）
   *   ⇒ 说书人能看到技能被发动过，但世界没有变化。
   */

  const abilityEffective = ctx.meta.abilityEffective ?? true;
  if (!abilityEffective) {
    return {
      ...ctx,
      meta: {
        ...ctx.meta,
        barberResult: { ...r, blockedByDrunkOrPoison: true },
        isCorrupted: true,
      },
      snapshot: {
        ...ctx.snapshot,
        _abilityResults: {
          ...((ctx.snapshot as any)._abilityResults ?? {}),
          barber: { ...r, blockedByDrunkOrPoison: true },
        },
      },
    };
  }

  if (!r?.swapped) return ctx;

  const seats = ctx.snapshot.seats ?? [];
  const seatA = seats.find((s: any) => s.id === r.swapA);
  const seatB = seats.find((s: any) => s.id === r.swapB);

  const updatedSeats = seats.map((s: any) => {
    if (s.id === r.swapA && seatB?.role) {
      return { ...s, role: { ...seatB.role } };
    }
    if (s.id === r.swapB && seatA?.role) {
      return { ...s, role: { ...seatA.role } };
    }
    return s;
  });

  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      seats: updatedSeats,
      barberSwap: { a: r.swapA, b: r.swapB },
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        barber: r,
      },
    },
    meta: { ...ctx.meta, barberResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (r?.swapped)
    console.log(`[理发师] 交换 ${r.swapA + 1}号 和 ${r.swapB + 1}号角色`);
  else console.log("[理发师] 理发师死亡但未交换角色");
  return ctx;
};

export const barberAbility = createRoleAbility({
  roleId: "barber",
  abilityId: "barber_swap",
  abilityName: "角色交换",
  /**
   * ⚠️⚠️ 2026-09-21 修复 P1-7【死亡触发角色误标 PASSIVE】：
   * 官方【角色能力】：「如果你死亡，在当晚恶魔可以选择两名玩家（不能选择其他恶魔）交换角色。」
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
   *   `otherNightPriority: 78`）。本文件的夜序优先级此前已正确，**无需改动**。
   *
   * 🔎 漏网原因：罂粟花开批次的能力通路真值表护栏只覆盖 24 个罂粟花开角色，
   *   而本角色属**梦陨春宵**（内置剧本）⇒ 不在护栏覆盖范围内。护栏本轮已扩展。
   */
  triggerTiming: [AbilityTriggerTiming.ON_DEATH],
  firstNightPriority: null,
  otherNightPriority: 78,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

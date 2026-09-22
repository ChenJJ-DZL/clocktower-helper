/**
 * 心上人（Sweetheart）新引擎技能实现
 * 【角色能力】"当你死亡时，一名玩家醉酒。"
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
  const target = ctx.storytellerInput?.drunkTarget ?? null;
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        drunkTarget: target,
        causesDrunk: true,
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
        sweetheartResult: { ...r, blockedByDrunkOrPoison: true },
        isCorrupted: true,
      },
      snapshot: {
        ...ctx.snapshot,
        _abilityResults: {
          ...((ctx.snapshot as any)._abilityResults ?? {}),
          sweetheart: { ...r, blockedByDrunkOrPoison: true },
        },
      },
    };
  }

  if (!r?.causesDrunk) return ctx;

  const seats = ctx.snapshot.seats ?? [];
  let nextSeats = seats;
  if (r.drunkTarget != null) {
    nextSeats = seats.map((s: any) => {
      if (s.id === r.drunkTarget) {
        const effects = [...(s.statusEffects ?? [])];
        if (!effects.some((e: any) => e.type === "drunk" && e.source === "sweetheart")) {
          effects.push({
            type: "drunk",
            source: "sweetheart",
            sourceSeatId: ctx.actionNode.seatId,
          });
        }
        return {
          ...s,
          isDrunk: true,
          statusEffects: effects,
        };
      }
      return s;
    });
  }

  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      seats: nextSeats,
      sweetheartDrunkTargetId: r.drunkTarget,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        sweetheart: r,
      },
    },
    meta: { ...ctx.meta, sweetheartResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  console.log("[心上人] 死亡，使1名玩家醉酒");
  return ctx;
};

export const sweetheartAbility = createRoleAbility({
  roleId: "sweetheart",
  abilityId: "sweetheart_death",
  abilityName: "香消玉殒",
  /**
   * ⚠️⚠️ 2026-09-21 修复 P1-7【死亡触发角色误标 PASSIVE】：
   * 官方【角色能力】：「当你死亡时，会有一名玩家开始醉酒。」
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
   *   `otherNightPriority: 79`）。本文件的夜序优先级此前已正确，**无需改动**。
   *
   * 🔎 漏网原因：罂粟花开批次的能力通路真值表护栏只覆盖 24 个罂粟花开角色，
   *   而本角色属**梦陨春宵**（内置剧本）⇒ 不在护栏覆盖范围内。护栏本轮已扩展。
   */
  triggerTiming: [AbilityTriggerTiming.ON_DEATH],
  firstNightPriority: null,
  otherNightPriority: 79,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

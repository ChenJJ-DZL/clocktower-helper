/**
 * 洗脑师（Cerenovus）新引擎技能实现
 *
 * 【角色能力】"每个夜晚，你要选择一名玩家和一个善良角色。
 *   他明天白天和夜晚需要'疯狂'地证明自己是这个角色，不然他可能被处决。"
 *
 * 每夜选择目标+角色，目标需疯狂扮演该角色。
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
  // 项目 Seat 约定使用 isDead 表示存活状态
  if (!seat || seat.isDead)
    return { ...ctx, aborted: true, abortReason: "已死亡" };
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const targetId = ctx.targetIds?.[0] ?? ctx.actionNode.targetIds?.[0] ?? null;
  const selfId = ctx.actionNode.seatId;

  // 洗脑师不能选自己：拒绝并 abort
  if (targetId !== null && targetId === selfId) {
    return {
      ...ctx,
      aborted: true,
      abortReason: "洗脑师不能选自己作为目标",
    };
  }
  // 官方范例：死亡的玩家也需继续疯狂（如死亡艺术家被洗脑），因此不排除已死亡目标

  const roleName = ctx.storytellerInput?.roleName ?? "镇民";
  return {
    ...ctx,
    meta: { ...ctx.meta, abilityResult: { targetId, roleName, mad: true } },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (r?.targetId == null) return ctx;

  // ⚠️⚠️ 2026-09-21 修复 P0：洗脑师自身醉酒/中毒时 **不得施加疯狂**。
  //
  // 官方原文（投毒者 / 规则书「醉酒与中毒」）：
  //   "中毒的玩家会失去能力……他的能力**不会真实地影响游戏**。"
  // ⇒ 被下毒的洗脑师仍会被唤醒、仍会被要求选目标+角色（说书人走场），
  //   **但目标不会真的需要「疯狂」**（处决时不会被判定为违反疯狂）。
  //
  // 实测证据（2026-09-21 探针 zz_probe_drunk_effect_gate）：
  //   修复前 drunk=true（醉酒洗脑师照样施加 isMad）—— 与 imp/monk 的正确行为相反。
  //
  // 实现：abilityEffective=false 时只记录选择，绝不写 isMad / madRoles / statusDetails。
  const abilityEffective = ctx.meta.abilityEffective ?? true;
  if (!abilityEffective) {
    const cerenovusData = {
      targetId: r.targetId,
      roleName: r.roleName,
      checkedToday: false,
      blockedByDrunkOrPoison: true,
    };
    return {
      ...ctx,
      snapshot: {
        ...ctx.snapshot,
        _abilityResults: {
          ...((ctx.snapshot as any)._abilityResults ?? {}),
          cerenovus: { ...r, mad: false, blockedByDrunkOrPoison: true },
        },
      },
      meta: { ...ctx.meta, cerenovusResult: cerenovusData, isCorrupted: true },
    };
  }

  const updatedSeats = ctx.snapshot.seats.map((s: any) => {
    if (s.id === r.targetId) {
      const details = (s.statusDetails || []).filter(
        (d: any) => typeof d === "string" ? !d.startsWith("洗脑疯狂:") : true
      );
      return {
        ...s,
        isMad: true,
        cerenovusMadnessRole: r.roleName,
        statusDetails: [...details, `洗脑疯狂:${r.roleName}`],
      };
    }
    return s;
  });

  const cerenovusData = {
    targetId: r.targetId,
    roleName: r.roleName,
    checkedToday: false,
  };

  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      seats: updatedSeats,
      madRoles: {
        ...((ctx.snapshot as any).madRoles ?? {}),
        [r.targetId]: r.roleName,
      },
      cerenovusTarget: cerenovusData,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        cerenovus: r,
      },
    },
    meta: { ...ctx.meta, cerenovusResult: cerenovusData },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (r?.targetId == null) return ctx;
  const log = `[Cerenovus] ${r.targetId + 1}号需疯狂扮演【${r.roleName}】`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【洗脑师】，选择一名玩家和一个角色。`,
      abilityLog: log,
      displayInfo: {
        type: "cerenovus_info",
        log: `已告知${r.targetId + 1}号玩家：必须疯狂证明自己是【${r.roleName}】`,
      },
    },
  };
};

export const cerenovusAbility = createRoleAbility({
  roleId: "cerenovus",
  abilityId: "cerenovus_madness",
  abilityName: "疯狂洗脑",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: 40,
  otherNightPriority: 30,
  firstNightOnly: false,
  wakePromptId: "role.cerenovus.wake",
  targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

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

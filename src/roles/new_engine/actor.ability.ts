/**
 * 演员（Actor）新引擎技能实现
 *
 * 【角色能力】"每个夜晚*，你要选择一名玩家（不能是你自己）：你得知该玩家的角色，
 * 且你也会在当晚获得该角色的能力（若该角色有能力的话）。"
 *
 * 每夜选择一名非自己存活玩家，得知其角色并复制其能力。
 * 自动信息类（得知角色为纯信息反馈，不弹窗询问结果）。
 * 不能连续两晚选择同一玩家。
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

// ─── 计算结果中间件 ──────────────────────────────────────────────────────

const calculateResult = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode, meta, targetIds } = context;
  const isAbilityActive = meta.abilityEffective ?? true;

  // 获取演员座位
  const actorSeat = snapshot.seats.find((s) => s.id === actionNode.seatId);
  if (!actorSeat) {
    return { ...context, aborted: true, abortReason: "未找到演员座位" };
  }

  // 获取目标座位
  const targetId = targetIds[0];
  const targetSeat = snapshot.seats.find((s: any) => s.id === targetId);
  if (!targetSeat) {
    return { ...context, aborted: true, abortReason: "未找到目标座位" };
  }

  // 检查是否连续两晚选择同一玩家（上一轮 _abilityResults 中记录的目标）
  const prevAbilityResults = (snapshot as any)._abilityResults?.actor;
  const prevTargetId = prevAbilityResults?.targetId;
  if (prevTargetId === targetId) {
    return {
      ...context,
      aborted: true,
      abortReason: "不能连续两晚选择同一玩家",
    };
  }

  // 获取目标角色信息
  const targetRoleId = targetSeat.roleId ?? null;
  const targetRoleName: string | null = (targetSeat as any).role?.name ?? null;

  // 决定告知的角色信息
  let revealedRoleId: string | null;
  let revealedRoleName: string | null;

  if (!isAbilityActive) {
    // 醉酒/中毒时返回虚假角色信息
    const otherRoles = snapshot.seats
      .filter((s: any) => s.roleId && s.id !== targetId)
      .map((s: any) => ({ id: s.roleId, name: s.role?.name }));
    const fake =
      otherRoles.length > 0
        ? otherRoles[Math.floor(Math.random() * otherRoles.length)]
        : { id: null, name: null };
    revealedRoleId = fake.id;
    revealedRoleName = fake.name;
  } else {
    // 正常：得知目标的真实角色
    revealedRoleId = targetRoleId;
    revealedRoleName = targetRoleName;
  }

  const result = {
    targetId,
    revealedRoleId,
    revealedRoleName,
    copiedRoleId: targetRoleId, // 复制的角色能力ID（即使醉酒也记录真实值）
    isAbilityActive,
  };

  return { ...context, meta: { ...context.meta, abilityResult: result } };
};

// ─── 状态更新中间件 ──────────────────────────────────────────────────────

const stateUpdate = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta } = context;
  const result = meta.abilityResult;
  if (!result) return context;

  return {
    ...context,
    snapshot: {
      ...context.snapshot,
      _abilityResults: {
        ...((context.snapshot as any)._abilityResults ?? {}),
        actor: result,
      },
    },
  };
};

// ─── 后处理中间件 ────────────────────────────────────────────────────────

const postProcess = async (
  context: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { meta, actionNode } = context;
  const result = meta.abilityResult;
  if (!result) return context;

  const statusSuffix = result.isAbilityActive ? "" : "（醉酒/中毒，信息有误）";
  const log = `[Actor] ${actionNode.seatId + 1}号选择了${result.targetId + 1}号，得知角色为${result.revealedRoleName ?? "未知"}，复制了${result.copiedRoleId}能力${statusSuffix}`;

  console.log(log);

  return {
    ...context,
    meta: {
      ...context.meta,
      prompt: `唤醒${actionNode.seatId + 1}号【演员】选择目标。告知其得知的角色信息：${result.revealedRoleName ?? "未知"}${result.isAbilityActive ? "" : "（假信息）"}。演员当晚将拥有${result.copiedRoleId}的能力。`,
      abilityLog: log,
    },
  };
};

// ─── 导出能力定义 ────────────────────────────────────────────────────────

export const actorAbility = createRoleAbility({
  roleId: "actor",
  abilityId: "actor_night_ability",
  abilityName: "角色复制",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  wakePromptId: "role.actor.wake",
  targetConfig: {
    min: 1,
    max: 1,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [commonPreCheckAlive],
  calculate: [calculateResult],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

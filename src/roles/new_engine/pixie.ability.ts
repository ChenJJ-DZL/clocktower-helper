/**
 * 小精灵（Pixie）新引擎技能实现
 *
 * 【角色能力】"首夜，得知一名玩家的角色并获得其能力。"
 *
 * 首夜唤醒，选择一名玩家，得知其真实角色，
 * 并获得该玩家的角色能力（效果等同于该角色）。
 * 目标选择：1名玩家，不可选自己，不可选已死亡玩家。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const seat = ctx.snapshot.seats.find(
    (s: any) => s.id === ctx.actionNode.seatId
  );
  if (!seat?.isAlive) return { ...ctx, aborted: true, abortReason: "已死亡" };

  const nightCount = ctx.snapshot.nightCount ?? 0;
  if (nightCount !== 1 && ctx.snapshot.gamePhase !== "firstNight") {
    return { ...ctx, aborted: true, abortReason: "非首夜，小精灵不唤醒" };
  }

  const effects =
    seat.statusEffects ?? ctx.snapshot.statusEffects?.[seat.id] ?? [];
  const isDrunk = effects.some((e: any) => e.type === "drunk");
  const isPoisoned = effects.some((e: any) => e.type === "poisoned");

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      isDrunk,
      isPoisoned,
      abilityEffective: !(isDrunk || isPoisoned),
    },
  };
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const targetId = ctx.targetIds?.[0] ?? ctx.actionNode.targetIds?.[0] ?? null;
  const effective = ctx.meta.abilityEffective ?? true;

  let roleName = "未知";
  let roleId = "未知";
  let roleType = "未知";

  if (targetId != null) {
    const target = ctx.snapshot.seats.find((s: any) => s.id === targetId);
    if (effective) {
      roleName = target?.role?.name ?? "未知";
      roleId = target?.role?.id ?? "未知";
      roleType = target?.role?.type ?? "未知";
    } else {
      const otherRoles = ctx.snapshot.seats
        .filter((s: any) => s.id !== targetId && s.role?.name)
        .map((s: any) => ({
          name: s.role.name,
          id: s.role.id,
          type: s.role.type,
        }));
      const picked =
        otherRoles.length > 0
          ? otherRoles[Math.floor(Math.random() * otherRoles.length)]
          : {
              name: target?.role?.name ?? "未知",
              id: target?.role?.id ?? "未知",
              type: target?.role?.type ?? "未知",
            };
      roleName = picked.name;
      roleId = picked.id;
      roleType = picked.type;
    }
  }

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetId,
        roleName,
        roleId,
        roleType,
        copiedAbility: roleId,
        isCorrupted: !effective,
        pixieActive: true,
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
      pixieCopiedRole: r?.roleId ?? null,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        pixie: r,
      },
    },
    meta: { ...ctx.meta, pixieResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const targetLabel = r?.targetId != null ? `${r.targetId + 1}号` : "无";
  const tag = r?.isCorrupted ? "【受干扰】" : "";
  const log = `[Pixie]${tag} 得知${targetLabel}的角色为${r?.roleName ?? "未知"}，获得其能力`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【小精灵】，选择一名玩家查看其角色并获得其能力。`,
      abilityLog: log,
    },
  };
};

export const pixieAbility = createRoleAbility({
  roleId: "pixie",
  abilityId: "pixie_first_night",
  abilityName: "小精灵",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT],
  wakePriority: 24,
  firstNightOnly: true,
  wakePromptId: "role.pixie.wake",
  targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

/**
 * 狼人（Lycanthrope）新引擎技能实现
 *
 * 【角色能力】"每夜可以选择一名玩家，若该玩家是善良则狼人死亡。"
 *
 * 每夜选择一名玩家为目标。如果该玩家是善良阵营，则狼人在次日死亡。
 * 如果目标是邪恶阵营，狼人安全存活。
 * 目标选择：1名玩家，不可选自己，不可选已死亡玩家。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const targetId = ctx.targetIds?.[0] ?? ctx.actionNode.targetIds?.[0] ?? null;
  const effective = ctx.meta.abilityEffective ?? true;

  let targetGood = false;
  let lycanthropeDies = false;

  if (targetId != null) {
    const target = ctx.snapshot.seats.find((s: any) => s.id === targetId);
    const roleType = target?.role?.type ?? "";
    const alignment =
      target?.alignment ??
      (roleType === "townsfolk" || roleType === "outsider" ? "good" : "evil");
    targetGood = alignment === "good";

    if (effective && targetGood) {
      lycanthropeDies = true;
    }
  }

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetId,
        targetGood,
        lycanthropeDies,
        lycanthropeActive: true,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const updatedSeats = ctx.snapshot.seats.map((s: any) => {
    if (r?.lycanthropeDies && s.id === ctx.actionNode.seatId) {
      return { ...s, markedForDeath: true, deathSource: "lycanthrope" };
    }
    return s;
  });

  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      seats: updatedSeats,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        lycanthrope: r,
      },
    },
    meta: { ...ctx.meta, lycanthropeResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const targetLabel = r?.targetId != null ? `${r.targetId + 1}号` : "无";
  const resultText = r?.lycanthropeDies
    ? "善良目标 → 狼人死亡"
    : r?.targetGood
      ? "（受干扰）未触发"
      : "邪恶目标 → 安全";
  const log = `[Lycanthrope] 选择${targetLabel}，${resultText}`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【狼人】，选择一名玩家。`,
      abilityLog: log,
    },
  };
};

export const lycanthropeAbility = createRoleAbility({
  roleId: "lycanthrope",
  abilityId: "lycanthrope_night",
  abilityName: "狼人猎杀",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  wakePriority: 50,
  firstNightOnly: false,
  wakePromptId: "role.lycanthrope.wake",
  targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [commonPreCheckAlive],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

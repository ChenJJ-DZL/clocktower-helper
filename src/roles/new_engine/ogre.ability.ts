/**
 * 食人魔（Ogre）新引擎技能实现
 *
 * 【角色能力】"首夜，你会得知一名邪恶玩家，但你自己也是邪恶的。"
 *
 * 首夜唤醒食人魔，从邪恶阵营（恶魔/爪牙）中选择一名玩家展示给食人魔。
 * 同时将食人魔自身阵营标记为邪恶。
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
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  // 从邪恶阵营（恶魔优先，其次爪牙）中选择一名玩家
  const demon = ctx.snapshot.seats.find((s: any) => s.role?.team === "demon");
  const minions = ctx.snapshot.seats.filter(
    (s: any) => s.role?.team === "minion"
  );
  const evilTarget = demon ?? (minions.length > 0 ? minions[0] : null);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        learnedEvilId: evilTarget?.id ?? null,
        becomesEvil: true,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  // 将食人魔自身阵营改为邪恶
  const updatedSeats = ctx.snapshot.seats.map((s: any) =>
    s.id === ctx.actionNode.seatId
      ? { ...s, role: { ...s.role, team: "evil" } }
      : s
  );
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      seats: updatedSeats,
      ogreLearnedEvil: r?.learnedEvilId,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        ogre: r,
      },
    },
    meta: { ...ctx.meta, ogreResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const evilId = r?.learnedEvilId;
  const targetLabel =
    evilId != null ? `${evilId + 1} 号玩家` : "无（无邪恶玩家存活）";
  const log = `[食人魔] 获知邪恶玩家: ${targetLabel}`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【食人魔】，展示一名邪恶玩家。`,
      abilityLog: log,
    },
  };
};

export const ogreAbility = createRoleAbility({
  roleId: "ogre",
  abilityId: "ogre_first_night",
  abilityName: "食人魔觉醒",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT],
  wakePriority: 50,
  firstNightOnly: true,
  wakePromptId: "role.ogre.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

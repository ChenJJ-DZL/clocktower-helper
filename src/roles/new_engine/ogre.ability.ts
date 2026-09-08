/**
 * 食人魔（Ogre）新引擎技能实现
 *
 * 【官方角色能力】"在你的首个夜晚，你要选择除你以外的一名玩家：你转变为他的阵营，
 *  即使你已醉酒或中毒，但你不知道你转变后的阵营。"
 *
 * 首夜唤醒食人魔，由食人魔自主指向除自己以外的一名存活玩家（挚友）。
 * 若该目标为邪恶阵营（恶魔或爪牙），食人魔静默转变为邪恶阵营（食人魔不知晓）。
 * targetConfig: { min: 1, max: 1, allowSelf: false }
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
  if (!seat?.isAlive) return { ...ctx, aborted: true, abortReason: "已死亡" };
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const targetId = ctx.targetIds?.[0] ?? ctx.actionNode.targetIds?.[0] ?? null;
  if (targetId == null) {
    return { ...ctx, aborted: true, abortReason: "未选择目标" };
  }

  const targetSeat = ctx.snapshot.seats.find((s: any) => s.id === targetId);
  const team = targetSeat?.role?.team || targetSeat?.team;
  const isTargetEvil =
    team === "evil" ||
    team === "demon" ||
    team === "minion" ||
    targetSeat?.role?.type === "demon" ||
    targetSeat?.role?.type === "minion" ||
    targetSeat?.isEvilConverted === true;

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetId,
        isTargetEvil,
        becomesEvil: isTargetEvil,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const targetId = r?.targetId;
  const becomesEvil = r?.becomesEvil;

  const updatedSeats = ctx.snapshot.seats.map((s: any) => {
    if (s.id === ctx.actionNode.seatId) {
      return {
        ...s,
        ogreFriendId: targetId,
        isEvilConverted: becomesEvil ? true : s.isEvilConverted,
        role: becomesEvil ? { ...s.role, team: "evil" } : s.role,
        statusDetails: [
          ...(s.statusDetails || []).filter((d: any) => typeof d === "string" ? !d.startsWith("食人魔挚友:") : true),
          `食人魔挚友:${(targetId ?? -1) + 1}号`,
        ],
      };
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
  const log = `[Ogre] 食人魔选择了【${(r?.targetId ?? -1) + 1}号】作为挚友${
    r?.becomesEvil ? "，转变为邪恶阵营（自身不知晓）" : "，保持善良阵营"
  }`;
  console.log(log);

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `食人魔选择了${(r?.targetId ?? -1) + 1}号。让食人魔重新入睡。（无论阵营是否变化，不向食人魔透露）。`,
      abilityLog: log,
    },
  };
};

export const ogreAbility = createRoleAbility({
  roleId: "ogre",
  abilityId: "ogre_first_night",
  abilityName: "食人魔",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT],
  firstNightPriority: 76,
  otherNightPriority: null,
  firstNightOnly: true,
  wakePromptId: "role.ogre.wake",
  targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

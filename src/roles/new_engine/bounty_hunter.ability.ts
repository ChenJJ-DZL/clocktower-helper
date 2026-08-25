/**
 * 赏金猎人（Bounty Hunter）新引擎技能实现
 *
 * 【角色能力】"首夜，你会得知一名邪恶玩家。"
 *
 * 首夜得知一名邪恶阵营玩家（恶魔或爪牙）。
 * 如果醉酒/中毒，可能得知错误目标（善良玩家）。
 * 自动信息类不弹窗选目标，不主动唤醒。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

// 计算阶段：选择一名邪恶玩家（支持转邪恶镇民、说书人指定输入、首夜及后续击杀死亡轮转）
const calculateResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const isActive = ctx.meta.abilityEffective !== false;
  const storytellerTarget =
    ctx.storytellerInput?.targetSeatId ??
    ctx.storytellerInput?.targetId ??
    ctx.storytellerInput?.overrideResult;

  let targetId: number | null = null;

  if (storytellerTarget !== undefined && storytellerTarget !== null) {
    targetId = Number(storytellerTarget);
  } else {
    const aliveEvils = ctx.snapshot.seats.filter(
      (s: any) =>
        s.isAlive &&
        s.id !== ctx.actionNode.seatId &&
        s.role &&
        (s.role.type === "minion" ||
          s.role.type === "demon" ||
          s.isEvilConverted ||
          s.alignment === "evil")
    );

    if (!isActive) {
      // 醉酒/中毒：从善良存活玩家中选目标（虚假信息）
      const goodOnes = ctx.snapshot.seats.filter(
        (s: any) =>
          s.isAlive &&
          s.id !== ctx.actionNode.seatId &&
          s.role &&
          !s.isEvilConverted &&
          s.alignment !== "evil" &&
          (s.role.type === "townsfolk" || s.role.type === "outsider")
      );
      if (goodOnes.length > 0) {
        targetId = goodOnes[Math.floor(Math.random() * goodOnes.length)].id;
      }
    }

    // 如果未选中（正常情况或虚假失败），从邪恶玩家中随机选
    if (targetId === null && aliveEvils.length > 0) {
      targetId = aliveEvils[Math.floor(Math.random() * aliveEvils.length)].id;
    }
  }

  const targetSeat =
    targetId !== null
      ? ctx.snapshot.seats.find((s: any) => s.id === targetId)
      : null;

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetId,
        targetSeatId: targetId,
        targetPlayerName: targetSeat?.playerName ?? (targetId !== null ? `${targetId + 1}号` : null),
        evilFound: targetId !== null,
      },
      isCorrupted: !isActive,
    },
  };
};

// 保存结果到快照
const saveResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        bounty_hunter: r,
      },
    },
    meta: { ...ctx.meta, bountyHunterResult: r },
  };
};

// 日志输出
const logResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const tag = ctx.meta.isCorrupted ? "【受干扰】" : "";
  const log =
    r?.targetId != null
      ? `[BountyHunter]${tag} 得知 ${r.targetId + 1}号是邪恶玩家`
      : "[BountyHunter] 未发现邪恶玩家";
  console.log(log);
  return { ...ctx, meta: { ...ctx.meta, abilityLog: log } };
};

export const bounty_hunterAbility = createRoleAbility({
  roleId: "bounty_hunter",
  abilityId: "bounty_hunter_reveal",
  abilityName: "悬赏猎杀",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT, AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: 72,
  otherNightPriority: 105,
  firstNightOnly: false,
  wakePromptId: "role.bounty_hunter.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [commonPreCheckAlive],
  calculate: [calculateResult],
  stateUpdate: [saveResult],
  postProcess: [logResult],
});

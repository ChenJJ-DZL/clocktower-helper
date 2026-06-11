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

// 计算阶段：随机选择一名邪恶玩家（醉酒/中毒时选择善良玩家作为假信息）
const calculateResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const isActive = ctx.meta.abilityEffective !== false;
  const aliveEvils = ctx.snapshot.seats.filter(
    (s: any) =>
      s.isAlive &&
      s.id !== ctx.actionNode.seatId &&
      s.role &&
      (s.role.type === "minion" || s.role.type === "demon")
  );

  let targetId: number | null = null;

  if (!isActive) {
    // 醉酒/中毒：从善良存活玩家中选目标（虚假信息）
    const goodOnes = ctx.snapshot.seats.filter(
      (s: any) =>
        s.isAlive &&
        s.id !== ctx.actionNode.seatId &&
        s.role &&
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

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: { targetId, evilFound: targetId !== null },
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
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT],
  wakePriority: 50,
  firstNightOnly: true,
  wakePromptId: "role.bounty_hunter.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [commonPreCheckAlive],
  calculate: [calculateResult],
  stateUpdate: [saveResult],
  postProcess: [logResult],
});

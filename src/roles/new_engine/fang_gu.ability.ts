/**
 * 方古（Fang Gu）新引擎技能实现
 *
 * 【角色能力】"每个夜晚*，你要选择一名玩家：他死亡。
 *   如果该玩家是外来者，他变成方古且不死亡。在你死后你变成死亡的方古。
 *   [+1外来者]"
 *
 * 每夜杀一人。如目标是外来者，目标变成方古且不死亡。
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
  const targetId = ctx.targetIds?.[0] ?? ctx.actionNode.targetIds?.[0] ?? null;
  const target =
    targetId != null
      ? ctx.snapshot.seats.find((s: any) => s.id === targetId)
      : null;
  const isOutsider = target?.role?.type === "outsider";

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetId,
        killed: !isOutsider,
        becomesFangGu: isOutsider,
        isOutsider,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.targetId) return ctx;
  const fangGuSeatId = ctx.actionNode.seatId;
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      lastKill: {
        demonId: fangGuSeatId,
        targetId: r.targetId,
        demonRole: "fang_gu",
      },
      fangGuJump: r.becomesFangGu ? r.targetId : null,
      // 🔧 修复：方古击杀目标必须落地死亡标记（与三恶魔一致）。
      //   外来者变方古（不死亡）→ 只更新角色不改死亡状态。
      //   🔧 跳变规则补全（W8.14.14）：官方规则"在你死后你变成死亡的方古"——
      //   方古杀外来者时：外来者变成方古（不死亡），**原方古必须死亡**。
      //   此前实现只改外来者 role，原方古存活 → 场上两个方古 → 第 4 夜起
      //   队列/判胜状态错乱 → 平安夜死局（SV 9 人局实测 P0）。
      seats: ctx.snapshot.seats.map((seat: any) => {
        // 原方古（行动者）：跳变时死亡
        if (r.becomesFangGu && seat.id === fangGuSeatId && !seat.isDead) {
          return {
            ...seat,
            isAlive: false,
            isDead: true,
            markedForDeath: true,
            diedAtNight: ctx.snapshot.nightCount,
            killedBy: "fang_gu_jump",
            deathSource: "fang_gu_jump",
            deathSourceSeatId: r.targetId,
          };
        }
        // 普通击杀（非外来者）：目标死亡
        if (seat.id === r.targetId && r.killed && !seat.isDead) {
          return {
            ...seat,
            isAlive: false,
            isDead: true,
            markedForDeath: true,
            diedAtNight: ctx.snapshot.nightCount,
            killedBy: "fang_gu",
            deathSource: "fang_gu_kill",
            deathSourceSeatId: fangGuSeatId,
          };
        }
        // 外来者变方古（不死亡）：只改角色，阵营转邪恶
        if (seat.id === r.targetId && r.becomesFangGu) {
          return {
            ...seat,
            role: {
              ...seat.role,
              id: "fang_gu",
              name: "方古",
              type: "demon",
            },
            isEvilConverted: true,
            isGoodConverted: false,
          };
        }
        return seat;
      }),
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        fang_gu: { ...r, fangGuSeatId, oldFangGuDied: r.becomesFangGu },
      },
    },
    meta: { ...ctx.meta, fangGuResult: { ...r, fangGuSeatId } },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const action = r?.becomesFangGu
    ? "→ 外来者变方古（不死亡）"
    : `击杀${r?.targetId != null ? r.targetId + 1 + "号" : ""}`;
  const log = `[FangGu] ${action}`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【方古】，选择一名玩家杀害。`,
      abilityLog: log,
    },
  };
};

export const fang_guAbility = createRoleAbility({
  roleId: "fang_gu",
  effectSemantics: "kill",
  abilityId: "fang_gu_kill",
  abilityName: "外来者猎杀",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: null,
  otherNightPriority: 50,
  firstNightOnly: false,
  wakePromptId: "role.fang_gu.wake",
  targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

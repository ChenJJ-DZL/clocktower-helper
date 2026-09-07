/**
 * 唱诗男孩（Choir Boy）新引擎技能实现（实验角色）
 *
 * 【官方百科能力】"如果恶魔杀死了国王，你会得知哪名玩家是恶魔。[+国王]"
 *
 * 运作方式：
 * - 仅当恶魔杀死了国王（非其他死亡原因）时，唱诗男孩被唤醒并得知恶魔玩家。
 * - 若国王被僧侣等保护未死亡，则不触发。
 * - 若唱诗男孩醉酒/中毒，说书人可以给他指出非恶魔玩家（例如食人族等其他角色）。
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

  // 必须是国王死于恶魔
  const isKingKilledByDemon =
    ctx.snapshot.isKingKilledByDemon === true ||
    (ctx.actionNode as any).isKingKilledByDemon === true ||
    (ctx.storytellerInput as any)?.isKingKilledByDemon === true;

  if (!isKingKilledByDemon) {
    return { ...ctx, aborted: true, abortReason: "国王未被恶魔杀死" };
  }

  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const isAbilityActive = ctx.meta.abilityEffective ?? true;

  // 寻找真实恶魔
  const realDemon = ctx.snapshot.seats.find(
    (s: any) => s.role && s.role.type === "demon"
  );

  let targetDemonSeatId: number | null = null;
  let isCorrupted = false;

  if (isAbilityActive) {
    // 正常状态：得知真实恶魔（支持说书人显式指定或默认）
    targetDemonSeatId =
      ctx.storytellerInput?.selectedSeatId ??
      realDemon?.id ??
      null;
    isCorrupted = false;
  } else {
    // 醉酒/中毒：指出错误玩家（例如非恶魔玩家）
    isCorrupted = true;
    if (ctx.storytellerInput?.selectedSeatId != null) {
      targetDemonSeatId = ctx.storytellerInput.selectedSeatId;
    } else {
      // 默认挑选一名非恶魔玩家作为干扰
      const nonDemon = ctx.snapshot.seats.find(
        (s: any) => s.id !== ctx.actionNode.seatId && (!s.role || s.role.type !== "demon")
      );
      targetDemonSeatId = nonDemon ? nonDemon.id : (realDemon?.id ?? 0);
    }
  }

  const targetSeat = ctx.snapshot.seats.find((s: any) => s.id === targetDemonSeatId);

  const abilityResult = {
    demonFound: targetDemonSeatId != null,
    demonSeatId: targetDemonSeatId,
    demonRoleName: targetSeat?.role?.name ?? null,
    isAbilityActive,
    isCorrupted,
  };

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult,
      isCorrupted,
      displayInfo: {
        demonSeatId: targetDemonSeatId,
        demonRoleName: targetSeat?.role?.name ?? null,
        isCorrupted,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.demonFound) {
    return ctx;
  }
  return {
    ...ctx,
    meta: { ...ctx.meta, choirBoyResult: r },
    snapshot: {
      ...ctx.snapshot,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        choirBoy: r,
      },
    },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.demonFound) return ctx;
  const tag = r.isCorrupted ? "【受干扰】" : "";
  const log = `[ChoirBoy]${tag} 国王被恶魔杀害，唱诗男孩得知恶魔是 ${r.demonSeatId + 1}号（${r.demonRoleName ?? "未知"}）`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `国王被恶魔杀害。唤醒${ctx.actionNode.seatId + 1}号【唱诗男孩】，指向${r.demonSeatId + 1}号为恶魔。`,
      abilityLog: log,
    },
  };
};

export const choirBoyAbility = createRoleAbility({
  roleId: "choir_boy",
  abilityId: "choir_boy_king_death",
  abilityName: "国王之殁",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  firstNightPriority: null,
  otherNightPriority: 84,
  firstNightOnly: false,
  wakePromptId: "role.choir_boy.wake",
  targetConfig: { min: 0, max: 1, allowSelf: false, allowDead: true },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

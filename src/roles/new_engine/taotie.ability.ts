/**
 * 饕餮（Taotie）新引擎技能实现
 *
 * 【角色能力】（官方 Wiki，2026-08-15 对齐）
 *   "每个夜晚*，你要选择任意数量的非旅行者玩家或一名旅行者玩家：如果他们的
 *   角色类型均不相同，他们死亡。[+1外来者]"
 *
 * 【角色简介】
 *   - 饕餮每个夜晚可以选择任意数量的非旅行者玩家。如果这些玩家之中没有任何两名
 *     玩家有相同的角色类型（镇民/外来者/爪牙/恶魔），那么这些玩家都会死亡。
 *   - 饕餮可以不进行选择（视作选择了任意数量的玩家 → 无人死亡）。
 *   - 如果选择攻击一名旅行者，当晚不能再攻击其他玩家。
 *
 * 【范例】
 *   - 选择占卜师、酒鬼、刺客 → 类型互不相同 → 全部死亡。
 *   - 选择赌徒、筑梦师、博学者 → 全是镇民 → 无人死亡。
 *
 * 【网页版适配】说书人选择的"任意数量"由目标选择面板表达（min 0 / max 不限）。
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// ─── 前置校验中间件 ────────────────────────────────────────────────────

const preCheckAlive = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const seat = ctx.snapshot.seats.find(
    (s: any) => s.id === ctx.actionNode.seatId
  );
  if (!seat?.isAlive) {
    return { ...ctx, aborted: true, abortReason: "饕餮已死亡，技能失效" };
  }
  if ((ctx.snapshot.nightCount ?? 1) === 1) {
    return { ...ctx, aborted: true, abortReason: "首夜，饕餮不行动" };
  }
  return ctx;
};

// ─── 计算中间件 ─────────────────────────────────────────────────────────

/**
 * calculate：校验目标合法性（旅行者限制）
 */
const calculateResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const targetIds: number[] = ctx.targetIds ?? [];

  // 含旅行者：只允许选择 1 名（旅行者 或 1 名其他玩家）
  const seats = ctx.snapshot.seats as any[];
  const hasTraveler = targetIds.some((tid) => {
    const s = seats.find((x) => x.id === tid);
    return s?.role?.type === "traveler";
  });
  if (hasTraveler && targetIds.length > 1) {
    return { ...ctx, aborted: true, abortReason: "选择旅行者时不能再选择其他玩家" };
  }

  // 无目标 = 选择任意数量（0）→ 无人死亡，正常结算
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: { targetIds, hasTraveler },
    },
  };
};

// ─── 状态更新中间件 ────────────────────────────────────────────────────

/**
 * stateUpdate：若所有目标角色类型互不相同 → 全部标记死亡；否则无人死亡。
 */
const stateUpdateResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const abilityResult = ctx.meta.abilityResult as
    | { targetIds: number[]; hasTraveler: boolean }
    | undefined;
  if (!abilityResult) return ctx;

  const { targetIds } = abilityResult;
  const nightCount = ctx.snapshot.nightCount ?? 0;
  const seats = [...(ctx.snapshot.seats as any[])];

  // 角色类型集合：互不相同才触发
  const types = targetIds.map((tid) => {
    const s = seats.find((x) => x.id === tid);
    return s?.role?.type ?? "unknown";
  });
  const allDistinct = new Set(types).size === types.length;

  const killedIds: number[] = [];
  if (allDistinct && types.length > 0) {
    for (const tid of targetIds) {
      const idx = seats.findIndex((s: any) => s.id === tid);
      if (idx === -1) continue;
      const target = seats[idx];
      const protected_ =
        target.statusEffects?.some((e: any) => e.type === "protected") ||
        (target as any).isProtected;
      if (!protected_) {
        seats[idx] = {
          ...target,
          markedForDeath: true,
          diedAtNight: nightCount,
          killedBy: "taotie",
          deathSource: "taotie_kill",
          deathSourceSeatId: ctx.actionNode.seatId,
        };
        killedIds.push(tid);
      }
    }
  }

  const record = {
    targetIds,
    allDistinct,
    killedIds,
    nightCount,
    timestamp: Date.now(),
  };

  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      seats,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        taotie: record,
      },
    },
    meta: { ...ctx.meta, taotieResult: record },
  };
};

// ─── 后置处理中间件 ────────────────────────────────────────────────────

const postProcessResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const record = ctx.meta.taotieResult as Record<string, any> | undefined;
  if (!record) return ctx;

  const label = (id: number) => `${id + 1}号`;
  const targetsLabel =
    record.targetIds.length > 0
      ? record.targetIds.map(label).join("、")
      : "（未选择）";

  let abilityLog: string;
  if (record.targetIds.length === 0) {
    abilityLog = `饕餮未选择目标，今晚无人死亡`;
  } else if (record.allDistinct) {
    abilityLog = `饕餮选择【${targetsLabel}】，角色类型互不相同，全部死亡`;
  } else {
    abilityLog = `饕餮选择【${targetsLabel}】，存在相同角色类型，无人死亡`;
  }

  console.log(`[Taotie] ${abilityLog}`);

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【饕餮】，选择任意数量的玩家。（${abilityLog}）`,
      abilityLog,
      displayInfo: {
        type: "taotie_action",
        targetIds: record.targetIds,
        allDistinct: record.allDistinct,
        killedIds: record.killedIds,
        log: abilityLog,
      },
    },
  };
};

// ─── 导出能力注册 ─────────────────────────────────────────────────────

export const taotieAbility = createRoleAbility({
  roleId: "taotie",
  effectSemantics: "kill",
  abilityId: "taotie_night_ability",
  abilityName: "饕餮吞噬",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: null,
  otherNightPriority: 47,
  firstNightOnly: false,
  wakePromptId: "role.taotie.wake",
  targetConfig: {
    min: 0,
    max: 99,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [preCheckAlive],
  calculate: [calculateResult],
  stateUpdate: [stateUpdateResult],
  postProcess: [postProcessResult],
});

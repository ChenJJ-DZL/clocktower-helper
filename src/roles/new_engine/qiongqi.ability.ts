/**
 * 穷奇（Qiongqi）新引擎技能实现
 *
 * 【角色能力】（官方 Wiki，2026-08-15 对齐）
 *   "每个夜晚*，你要选择一名玩家：他死亡。如果今天白天有外来者死亡，当晚改为
 *   你要选择一名玩家：他死亡，但被当作仍然存活，随后会有一名其他玩家死亡。[+1外来者]"
 *
 * 【角色简介】
 *   - 穷奇能够在有外来者死亡时兴风作浪，杀害更多的玩家，而善良玩家却全然不知。
 *   - 如果在白天有外来者死亡，穷奇的攻击会让玩家进入"活尸"状态：城镇广场上表现
 *     为"存活"，然而实际上已经死亡。活尸再次死亡时，城镇广场状态变死亡。
 *   - 只有能够被穷奇杀死的玩家才能进入"活尸"状态；若死亡被阻止则不进入。
 *   - 活尸失去自身能力（类似醉酒中毒）；其"死亡时触发"能力不会触发。
 *
 * 【网页版适配】"运作方式/提示标记"为桌游描述，本项目统一到控制台与行动弹窗：
 *   - 活尸状态用 statusEffects 的 alive_dead 标记表达（isDead=true 但 UI 按存活显示）。
 *   - 额外死亡由引擎自动随机选择（说书人在网页版无实物标记，改由弹窗展示）。
 */

import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

// ─── 前置校验中间件 ────────────────────────────────────────────────────

/**
 * preCheck：存活检测 + 非首夜限制（恶魔通常次夜起行动）
 */
const preCheckAlive = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const seat = ctx.snapshot.seats.find(
    (s: any) => s.id === ctx.actionNode.seatId
  );
  if (!seat?.isAlive) {
    return { ...ctx, aborted: true, abortReason: "穷奇已死亡，技能失效" };
  }
  if ((ctx.snapshot.nightCount ?? 1) === 1) {
    return { ...ctx, aborted: true, abortReason: "首夜，穷奇不行动" };
  }
  return ctx;
};

// ─── 辅助函数 ─────────────────────────────────────────────────────────

/**
 * 判断"今天白天是否有外来者死亡"。
 * 优先读 UI 层设置的 snapshot.outsiderDiedToday；兼容从 deadThisNight 推断。
 */
function hasOutsiderDiedToday(snapshot: any): boolean {
  if (typeof snapshot.outsiderDiedToday === "boolean") {
    return snapshot.outsiderDiedToday;
  }
  const deadThisNight: number[] = snapshot.deadThisNight ?? [];
  // 白天死亡的判定：diedAtNight 不等于当前夜，或 deadThisNight 携带白天标记
  const nightCount = snapshot.nightCount ?? 0;
  const seats = snapshot.seats as any[];
  return seats.some(
    (s: any) =>
      s.role?.type === "outsider" &&
      s.isDead &&
      (s.diedAtNight !== nightCount || s.executedToday === true)
  );
}

/** 从存活玩家中随机选一名（排除指定 id 集合） */
function pickRandomAlive(
  seats: any[],
  exclude: Set<number>
): any | null {
  const candidates = seats.filter(
    (s) => !s.isDead && !exclude.has(s.id)
  );
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// ─── 计算中间件 ─────────────────────────────────────────────────────────

/**
 * calculate：确定杀戮目标 + 判断活尸分支
 */
const calculateResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const targetId = ctx.targetIds?.[0];
  if (targetId === undefined || targetId === null) {
    return { ...ctx, aborted: true, abortReason: "穷奇未选择目标" };
  }
  const outsiderDied = hasOutsiderDiedToday(ctx.snapshot as any);

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetId,
        outsiderDiedToday: outsiderDied,
        isCorrupted: ctx.meta.isCorrupted ?? false,
      },
    },
  };
};

// ─── 状态更新中间件 ────────────────────────────────────────────────────

/**
 * stateUpdate：
 * - 无条件分支：目标正常死亡（标记 markedForDeath，由黎明结算）。
 * - 活尸分支（白天有外来者死亡）：目标进入"活尸"状态（isDead=true + alive_dead 标记，
 *   城镇广场按存活显示）；随后随机一名其他玩家死亡。
 */
const stateUpdateResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const abilityResult = ctx.meta.abilityResult as
    | { targetId: number; outsiderDiedToday: boolean }
    | undefined;
  if (!abilityResult) return ctx;

  const { targetId, outsiderDiedToday } = abilityResult;
  const nightCount = ctx.snapshot.nightCount ?? 0;
  const updatedSeats = [...(ctx.snapshot.seats as any[])];

  const targetIdx = updatedSeats.findIndex((s: any) => s.id === targetId);

  const record: Record<string, any> = {
    targetId,
    outsiderDiedToday,
    nightCount,
    timestamp: Date.now(),
  };

  if (targetIdx !== -1) {
    if (outsiderDiedToday) {
      // ── 活尸分支 ──
      // 目标进入活尸：已死亡但被当作存活（alive_dead 标记供 UI 显示）
      const target = updatedSeats[targetIdx];
      const canBeKilled =
        !target.statusEffects?.some((e: any) => e.type === "protected") &&
        !(target as any).isProtected;
      if (canBeKilled) {
        const effects = [...(target.statusEffects ?? [])].filter(
          (e: any) => e.type !== "alive_dead"
        );
        effects.push({ type: "alive_dead", source: "qiongqi", sourceSeatId: ctx.actionNode.seatId });
        updatedSeats[targetIdx] = {
          ...target,
          isAlive: false,
          isDead: true,
          markedForDeath: true,
          diedAtNight: nightCount,
          killedBy: "qiongqi",
          deathSource: "qiongqi_alive_dead",
          deathSourceSeatId: ctx.actionNode.seatId,
          statusEffects: effects,
        };
        record.aliveDead = true;

        // 额外一名玩家死亡（说书人选择 → 引擎随机）
        const extra = pickRandomAlive(
          updatedSeats,
          new Set([targetId, ctx.actionNode.seatId])
        );
        if (extra) {
          const extraIdx = updatedSeats.findIndex((s: any) => s.id === extra.id);
          if (extraIdx !== -1) {
            updatedSeats[extraIdx] = {
              ...updatedSeats[extraIdx],
              isAlive: false,
              isDead: true,
              markedForDeath: true,
              diedAtNight: nightCount,
              killedBy: "qiongqi",
              deathSource: "qiongqi_extra_kill",
              deathSourceSeatId: ctx.actionNode.seatId,
            };
            record.extraTargetId = extra.id;
          }
        }
      } else {
        // 目标无法被杀死（受保护）：不进入活尸，正常存活
        record.blocked = true;
      }
    } else {
      // ── 正常击杀分支 ──
      const target = updatedSeats[targetIdx];
      const protected_ =
        target.statusEffects?.some((e: any) => e.type === "protected") ||
        (target as any).isProtected;
      if (!protected_) {
        updatedSeats[targetIdx] = {
          ...target,
          markedForDeath: true,
          diedAtNight: nightCount,
          killedBy: "qiongqi",
          deathSource: "qiongqi_kill",
          deathSourceSeatId: ctx.actionNode.seatId,
        };
      } else {
        record.blocked = true;
      }
    }
  }

  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      seats: updatedSeats,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        qiongqi: record,
      },
    },
    meta: { ...ctx.meta, qiongqiResult: record },
  };
};

// ─── 后置处理中间件 ────────────────────────────────────────────────────

const postProcessResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const record = ctx.meta.qiongqiResult as Record<string, any> | undefined;
  if (!record) return ctx;

  const label = (id: number) => `${id + 1}号`;
  const targetLabel = label(record.targetId);
  let abilityLog: string;
  let storytellerPrompt: string;

  if (record.blocked) {
    abilityLog = `穷奇选择【${targetLabel}】，但目标受保护未死亡`;
    storytellerPrompt = `唤醒${ctx.actionNode.seatId + 1}号【穷奇】，选择一名玩家。（选择了${targetLabel}，受保护未死亡）`;
  } else if (record.aliveDead) {
    const extraLabel = record.extraTargetId != null ? label(record.extraTargetId) : "无";
    abilityLog = `穷奇选择【${targetLabel}】——由于白天有外来者死亡，${targetLabel}进入活尸状态（表面存活实已死亡），另【${extraLabel}】死亡`;
    storytellerPrompt = `唤醒${ctx.actionNode.seatId + 1}号【穷奇】，选择一名玩家。（白天有外来者死亡：${targetLabel}成为活尸，说书人另选${extraLabel}死亡）`;
  } else {
    abilityLog = `穷奇杀死【${targetLabel}】`;
    storytellerPrompt = `唤醒${ctx.actionNode.seatId + 1}号【穷奇】，选择一名玩家。（选择了${targetLabel}，他将在今晚死亡）`;
  }

  console.log(`[Qiongqi] ${abilityLog}`);

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: storytellerPrompt,
      abilityLog,
      displayInfo: {
        type: "qiongqi_action",
        targetId: record.targetId,
        targetLabel: record.targetId + 1,
        outsiderDiedToday: record.outsiderDiedToday,
        aliveDead: record.aliveDead ?? false,
        extraTargetId: record.extraTargetId ?? null,
        killed: !record.blocked,
        log: abilityLog,
      },
    },
  };
};

// ─── 导出能力注册 ─────────────────────────────────────────────────────

export const qiongqiAbility = createRoleAbility({
  roleId: "qiongqi",
  effectSemantics: "kill",
  abilityId: "qiongqi_night_kill",
  abilityName: "凶兽噬杀",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: null,
  otherNightPriority: 46,
  firstNightOnly: false,
  wakePromptId: "role.qiongqi.wake",
  targetConfig: {
    min: 1,
    max: 1,
    allowSelf: false,
    allowDead: false,
  },
  preCheck: [preCheckAlive],
  calculate: [calculateResult],
  stateUpdate: [stateUpdateResult],
  postProcess: [postProcessResult],
});

/**
 * 气球驾驶员（Balloonist）新引擎技能实现
 *
 * 【角色能力】"每个夜晚，你会得知一名与你在不同阵营的玩家。"
 *
 * 每个夜晚得知一名与己方阵营不同的玩家（善良+得知邪恶，邪恶+得知善良）。
 * 每夜优先得知不同的玩家（从历史记录去重），除非无其他候选可连续两晚同人。
 * 如果醉酒/中毒，可能得知任意存活玩家（不保证阵营不同）。
 * 自动信息类不弹窗选目标，不主动唤醒。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

// ─── 辅助函数 ────────────────────────────────────────────────────────────

/** 判断某座位是否为邪恶阵营（含转换效果） */
const isEvilAlignment = (seat: any): boolean => {
  if (!seat.role) return false;
  return (
    seat.role.type === "minion" ||
    seat.role.type === "demon" ||
    seat.isEvilConverted === true
  );
};

// ─── 计算结果中间件 ──────────────────────────────────────────────────────

const calculateResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const { snapshot, actionNode, meta, storytellerInput } = ctx;
  const isAbilityActive = meta.abilityEffective ?? true;
  const selfSeat = snapshot.seats.find((s: any) => s.id === actionNode.seatId);
  if (!selfSeat) {
    return { ...ctx, aborted: true, abortReason: "未找到气球驾驶员座位" };
  }

  // 确定自身阵营
  const selfIsEvil = isEvilAlignment(selfSeat);

  // 收集所有历史记录中已得知过的玩家 ID（尽量不重复）
  const prevResults: Record<string, any> =
    (snapshot as any)._abilityResults ?? {};
  const learnedIds: Set<number> = new Set<number>();
  const flatResult = prevResults.balloonist;
  if (flatResult?.targetId != null) learnedIds.add(flatResult.targetId);
  // 也检查旧格式的按夜存储记录
  for (const key of Object.keys(prevResults)) {
    if (key.startsWith("balloonist_")) {
      const entry = prevResults[key];
      if (entry?.targetId != null) learnedIds.add(entry.targetId);
    }
  }

  // 找出所有阵营不同的存活玩家
  let candidates = snapshot.seats.filter((s: any) => {
    if (s.id === actionNode.seatId) return false;
    if (!s.role) return false;
    if (!s.isAlive) return false;
    const sIsEvil = isEvilAlignment(s);
    return selfIsEvil ? !sIsEvil : sIsEvil; // 阵营必须不同
  });

  if (!isAbilityActive) {
    // 醉酒/中毒：从所有存活玩家中选（可能同阵营，干扰信息）
    candidates = snapshot.seats.filter(
      (s: any) => s.isAlive && s.id !== actionNode.seatId && s.role
    );
  }

  if (candidates.length === 0) {
    return {
      ...ctx,
      meta: { ...ctx.meta, abilityResult: { targetId: null, isAbilityActive } },
    };
  }

  // 优先选未得知过的玩家，无则复用已得知的
  const unseen = candidates.filter((s: any) => !learnedIds.has(s.id));
  const pool = unseen.length > 0 ? unseen : candidates;

  // 说书人可手动指定，否则取候选列表第一个
  const selectedId = storytellerInput?.selectedSeatId ?? pool[0].id;
  const selectedSeat = snapshot.seats.find((s: any) => s.id === selectedId);

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetId: selectedId,
        selfAlignment: selfIsEvil ? "Evil" : "Good",
        targetAlignment: selectedSeat
          ? isEvilAlignment(selectedSeat)
            ? "Evil"
            : "Good"
          : "Good",
        isAbilityActive,
      },
    },
  };
};

// ─── 状态更新中间件 ──────────────────────────────────────────────────────

const saveResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const historyEntry = {
    targetId: r?.targetId ?? null,
    night: ctx.snapshot.nightCount,
  };
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        balloonist: r, // 扁平键，供其他角色/系统直接引用
        [`balloonist_${ctx.snapshot.nightCount}`]: historyEntry, // 按夜记录，供自身去重
      },
    },
  };
};

// ─── 后处理中间件 ────────────────────────────────────────────────────────

const logResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (r?.targetId != null) {
    const tag = r.isAbilityActive ? "" : "【受干扰】";
    const alignLabel = r.targetAlignment === "Evil" ? "邪恶" : "善良";
    const log = `[Balloonist]${tag} 得知 ${r.targetId + 1}号是${alignLabel}阵营`;
    console.log(log);
    return {
      ...ctx,
      meta: {
        ...ctx.meta,
        prompt:
          `唤醒${ctx.actionNode.seatId + 1}号【气球驾驶员】，指向${r.targetId + 1}号（${alignLabel}阵营）。` +
          `${r.isAbilityActive ? "" : "注意：气球驾驶员当前醉酒/中毒，该信息可能不准确。"}`,
        abilityLog: log,
      },
    };
  }
  const log = "[Balloonist] 无可选目标";
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityLog: log,
      prompt: `${ctx.actionNode.seatId + 1}号【气球驾驶员】当前无可选目标。`,
    },
  };
};

// ─── 导出能力定义 ────────────────────────────────────────────────────────

export const balloonistAbility = createRoleAbility({
  roleId: "balloonist",
  abilityId: "balloonist_night_ability",
  abilityName: "阵营追踪",
  triggerTiming: [
    AbilityTriggerTiming.FIRST_NIGHT,
    AbilityTriggerTiming.EVERY_NIGHT,
  ],
  firstNightPriority: 67,
  otherNightPriority: 101,
  firstNightOnly: false,
  wakePromptId: "role.balloonist.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [commonPreCheckAlive],
  calculate: [calculateResult],
  stateUpdate: [saveResult],
  postProcess: [logResult],
});

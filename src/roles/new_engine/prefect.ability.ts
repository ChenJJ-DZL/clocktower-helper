/**
 * 知府（Prefect）新引擎技能实现
 *
 * 【角色能力】"每个夜晚*，你会得知今天是否有非镇民且非旅行者的玩家死亡。"
 *
 * - 关注当天所有死亡玩家（白天处决 + 夜晚死亡，不论死亡方式）。
 * - "非镇民且非旅行者" = 外来者 / 爪牙 / 恶魔（及任何非 townsfolk/traveler 类型）。
 * - 即使当天没有任何玩家死亡，知府也会被唤醒（结果为"否"）。
 * - 首夜也唤醒（白天无死亡时结果为"否"）。
 *
 * 网页版适配：桌游的"标记"统一为控制台日志与结算弹窗（displayInfo 告知"是/否"）。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  commonPreCheckAlive,
  createRoleAbility,
} from "../core/roleAbility.types";

/** 判定是否"非镇民且非旅行者"（外来者/爪牙/恶魔及未知类型） */
function isNonTownsfolkNonTraveler(seat: any): boolean {
  const t = seat?.role?.type;
  if (!t) return false;
  return t !== "townsfolk" && t !== "traveler";
}

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const snapshot = ctx.snapshot as any;
  const nightCount = snapshot.nightCount ?? 1;

  // 收集"当天死亡"的座位 id：
  // 1) 夜晚死亡：diedAtNight === 当前夜
  // 2) 白天处决：executedToday / executedSeatId / todayExecutedId
  // 3) 白天其他死亡：dayDeaths / dayDeadIds（如存在）
  const deadIds = new Set<number>();

  for (const s of (snapshot.seats ?? []) as any[]) {
    if (s.diedAtNight === nightCount) deadIds.add(s.id);
  }
  const execIds = [
    snapshot.executedToday,
    snapshot.executedSeatId,
    snapshot.todayExecutedId,
    snapshot.lastDuskExecution,
  ].filter((v) => v != null && Number.isFinite(v));
  for (const id of execIds) deadIds.add(id);
  for (const id of snapshot.dayDeaths ?? []) deadIds.add(id);
  for (const id of snapshot.dayDeadIds ?? []) deadIds.add(id);

  // 判定是否有非镇民且非旅行者死亡
  let hasNonTownsfolkDeath = false;
  let matched: any = null;
  for (const s of (snapshot.seats ?? []) as any[]) {
    if (deadIds.has(s.id) && isNonTownsfolkNonTraveler(s)) {
      hasNonTownsfolkDeath = true;
      matched = { id: s.id, roleId: s.role?.id ?? "?", roleType: s.role?.type ?? "?" };
      break;
    }
  }

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        hasNonTownsfolkDeath,
        deadToday: [...deadIds],
        matched,
        prefectActive: true,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        prefect: r,
      },
    },
    meta: { ...ctx.meta, prefectResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const answer = r?.hasNonTownsfolkDeath ? "是" : "否";
  const detail = r?.matched
    ? `（${r.matched.id + 1}号 ${r.matched.roleId} 属于非镇民且非旅行者）`
    : "";
  const log = `[Prefect] 今天是否有非镇民且非旅行者死亡：${answer}${detail}`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【知府】，告知：今天有非镇民且非旅行者死亡吗？—— ${answer}`,
      displayInfo: {
        type: "prefect_result",
        message: answer,
        detail: detail || undefined,
      },
      abilityLog: log,
    },
  };
};

export const prefectAbility = createRoleAbility({
  roleId: "prefect",
  abilityId: "prefect_nightly_info",
  abilityName: "知府",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: 54,
  otherNightPriority: 54,
  firstNightOnly: false,
  wakePromptId: "role.prefect.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [commonPreCheckAlive],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

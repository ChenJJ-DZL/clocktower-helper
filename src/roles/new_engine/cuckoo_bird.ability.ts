/**
 * 杜鹃鸟（Cuckoo Bird）新引擎技能实现
 *
 * 【角色能力】"被动：你得知自己是否为复制品。"
 *
 * 检查自己是否在游戏配置中属于重复角色（例如因方古等机制导致的复制）。
 * allowSelf: false — 无需选择目标
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
  const seat = ctx.snapshot.seats.find(
    (s: any) => s.id === ctx.actionNode.seatId
  );
  const roleId = seat?.roleId ?? seat?.role?.id ?? "";
  // 检查是否有其他玩家持有相同角色（复制品检测）
  const duplicates = ctx.snapshot.seats.filter(
    (s: any) =>
      s.id !== ctx.actionNode.seatId &&
      (s.roleId === roleId || s.role?.id === roleId)
  );
  const isDuplicate = duplicates.length > 0;
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        isDuplicate,
        duplicateCount: duplicates.length,
        duplicateIds: duplicates.map((s: any) => s.id),
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
        cuckoo_bird: r,
      },
    },
    meta: { ...ctx.meta, cuckooBirdResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const msg = r?.isDuplicate
    ? `你是复制品（另有${r.duplicateCount}人同角色）`
    : "你不是复制品";
  const log = `[杜鹃鸟] ${ctx.actionNode.seatId + 1}号: ${msg}`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `告知${ctx.actionNode.seatId + 1}号【杜鹃鸟】：${msg}`,
      abilityLog: log,
    },
  };
};

export const cuckoo_birdAbility = createRoleAbility({
  roleId: "cuckoo_bird",
  abilityId: "cuckoo_passive",
  abilityName: "杜鹃寄生",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

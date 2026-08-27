/**
 * 戏子（Actor）新引擎技能实现
 *
 * 【角色能力】"所有戏子互相认识。不论在场的戏子数量多少或存活与否，胜负结果会被对调。
 *   [所有善良玩家都是戏子]"
 *
 * - 初始设置：若戏子作为出场角色，所有其他善良角色替换为戏子（同数量）。
 * - 首个夜晚：所有戏子被一同唤醒，互认盟友，得知邪恶玩家（但不知道恶魔具体是谁）。
 * - 游戏结束：只要戏子在场（不论死活、不论数量），胜负结果对调。
 *
 * 网页版适配：
 * - 首夜互认信息由本能力结算（displayInfo 列出戏子与邪恶玩家名单）。
 * - 胜负对调由 UI 判胜流程（checkGameOver）读取 hasActorInGame 执行。
 * - 初始设置替换由 actorSetupRoles 工具提供（UI setup 层调用）。
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

/** 判定座位是否邪恶（恶魔/爪牙/被转化） */
function seatIsEvil(seat: any): boolean {
  if (!seat?.role) return false;
  if (seat.isGoodConverted) return false;
  return (
    seat.isEvilConverted === true ||
    seat.role.type === "demon" ||
    seat.role.type === "minion" ||
    seat.isDemonSuccessor === true
  );
}

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const seats = (ctx.snapshot.seats ?? []) as any[];

  // 所有戏子（存活）
  const actors = seats
    .filter((s) => s.role?.id === "actor" && !s.isDead)
    .map((s) => s.id);

  // 所有邪恶玩家（恶魔/爪牙/被转化），不标注恶魔是谁（身份未知）
  const evilPlayers = seats.filter((s) => seatIsEvil(s)).map((s) => s.id);

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        actors,
        evilPlayers,
        actorActive: true,
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
        actor: r,
      },
    },
    meta: { ...ctx.meta, actorResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const actorList = (r?.actors ?? [])
    .map((id: number) => id + 1 + "号")
    .join("、");
  const evilList = (r?.evilPlayers ?? [])
    .map((id: number) => id + 1 + "号")
    .join("、");
  const log = `[Actor] 所有戏子互认：${actorList}；邪恶玩家：${evilList}（恶魔身份未知）`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${actorList}【戏子】们：你们互相认识。邪恶玩家是：${evilList}（恶魔身份未知）。`,
      displayInfo: {
        type: "actor_recognition",
        actors: r?.actors ?? [],
        evilPlayers: r?.evilPlayers ?? [],
        note: "恶魔身份未知",
      },
      abilityLog: log,
    },
  };
};

export const actorAbility = createRoleAbility({
  roleId: "actor",
  abilityId: "actor_recognition",
  abilityName: "戏子",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT],
  firstNightPriority: 55,
  otherNightPriority: null,
  firstNightOnly: true,
  wakePromptId: "role.actor.wake",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

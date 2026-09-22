/**
 * 国王（King）新引擎技能实现
 *
 * 官方【角色能力】：「**每个夜晚，如果死亡的玩家数量大于或等于存活的玩家数量，
 *   你会得知一个存活的角色。**」「恶魔知道你是国王。」
 * 官方【角色能力类型】：获取信息、暴露角色
 * 官方【角色简介】：「国王能得知仍然存活的角色。」
 *
 * ⚠️⚠️ 2026-09-21 重写（P1-15）：**原实现与官方 King 完全不同** ——
 *   原为 `[PASSIVE]` +「如果你被处决，你会得知所有爪牙玩家」（疑似误抄其他角色），
 *   既不符官方语义，`PASSIVE` 又使其永不被自动唤醒。
 *
 * ✅ 现按官方实现：
 *   · 触发：`EVERY_NIGHT`（「每个夜晚」）+ 夜序优先级沿用 18 / 104
 *   · 条件：**死亡玩家数 ≥ 存活玩家数** 时才产出信息（条件不足 ⇒ 唤醒但无信息，
 *     说书人按官方「如果…你会得知」自行处理，与项目既有信息类角色一致）
 *   · 产出：一名**存活**角色的角色名（说书人可指定 `storytellerInput.selectedSeatId`）
 *
 * 📌 **未实现（已登记待办）**：「**恶魔知道你是国王**」（暴露角色）——
 *   属独立的「恶魔信息」告知链（`demon_info` 系统步骤），与主能力正交，
 *   需在恶魔互认步骤中附带告知；本轮未做（见当日日志批次 41）。
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
  if (!seat) return { ...ctx, aborted: true, abortReason: "找不到座位" };
  if (seat.isDead) return { ...ctx, aborted: true, abortReason: "已死亡" };
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  /**
   * 官方条件：「**如果死亡的玩家数量大于或等于存活的玩家数量**，你会得知一个存活的角色。」
   * ⚠️ 用 `deadCount >= aliveCount`（≥，不是 >）。
   * 🔒 判据走 seatAlive 的 SST（`isSeatAlive`）语义：`isDead !== true` 即存活。
   */
  const seats: any[] = ctx.snapshot.seats ?? [];
  const deadCount = seats.filter((s) => s.isDead === true).length;
  const aliveSeats = seats.filter((s) => s.isDead !== true);
  const aliveCount = aliveSeats.length;
  const conditionMet = deadCount >= aliveCount;

  if (!conditionMet) {
    // 条件不足：唤醒但无信息（官方「如果…你会得知」，说书人自行说明无事发生）
    return {
      ...ctx,
      meta: {
        ...ctx.meta,
        abilityResult: {
          triggered: false,
          deadCount,
          aliveCount,
          reason: "死亡数未达存活数",
        },
      },
    };
  }

  // 产出：一名**存活**角色（说书人可显式指定，否则取第一具存活的存活座位）
  const designated =
    ctx.storytellerInput?.selectedSeatId ?? aliveSeats[0]?.id ?? null;
  const targetSeat = seats.find((s) => s.id === designated) ?? null;

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        triggered: true,
        deadCount,
        aliveCount,
        targetSeatId: targetSeat?.id ?? null,
        targetRoleName: targetSeat?.role?.name ?? null,
      },
      displayInfo: {
        seatId: targetSeat?.id ?? null,
        roleName: targetSeat?.role?.name ?? null,
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
        king: r,
      },
    },
    meta: { ...ctx.meta, kingResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log = r?.triggered
    ? `[国王] 得知存活角色: ${(r.targetSeatId ?? -1) + 1}号（${r.targetRoleName ?? "?"}）` +
      `｜死亡${r.deadCount} 存活${r.aliveCount}`
    : `[国王] 条件未满足（死亡${r?.deadCount ?? "?"} < 存活${r?.aliveCount ?? "?"}），无可告知信息`;
  console.log(log);
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: "国王被处决，告知其所有爪牙身份。",
      abilityLog: log,
    },
  };
};

export const kingAbility = createRoleAbility({
  roleId: "king",
  abilityId: "king_alive_role_info",
  abilityName: "国王：存活角色信息",
  // 官方「**每个夜晚**」⇒ EVERY_NIGHT（原为 PASSIVE ⇒ 永不自动唤醒）
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: 18,
  otherNightPriority: 104,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

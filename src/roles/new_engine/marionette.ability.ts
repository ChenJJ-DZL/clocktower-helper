/**
 * 提线木偶（Marionette）新引擎技能实现
 *
 * 【角色能力】"你以为自己是镇民，但实际上你是爪牙。你不知道自己是提线木偶。"
 *
 * PASSIVE 触发，标记为提线木偶
 */
import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

/**
 * 提线木偶的「永久醉酒」（与酒鬼完全同链路）。
 *
 * 官方依据（钟楼百科·提线木偶·角色简介）：
 *   "认为自己是提线木偶的玩家所抽取到的善良角色对应的能力不会产生任何效果，
 *    但说书人会假装这些效果生效了。这与酒鬼的运作方式相似。"
 * 官方依据（钟楼百科·酒鬼·角色简介）：
 *   "酒鬼没有任何能力。…如果那个镇民能够获取信息，说书人可以对酒鬼给出错误的信息作为替代"
 *
 * 实现方式与酒鬼一致：写入 statusEffects 中的 type:"drunk"（permanent:true），
 * 由 abilityPriorityMiddleware 判定 abilityEffective=false（主动技能不生效、
 * 信息类能力走假信息路径），再由 syncStatusEffectsToSeat 翻译为 seat.isDrunk 供 UI
 * 显示「🍺 醉酒（永久）」徽标。
 */
const PERMANENT_DRUNK_SOURCE = "marionette";

/** 幂等地给座位补上提线木偶的永久醉酒效果（不会与其他来源的醉酒重复叠加） */
function withPermanentDrunk(seat: any): any[] {
  const rest = (seat?.statusEffects ?? []).filter(
    (e: any) => !(e.type === "drunk" && e.source === PERMANENT_DRUNK_SOURCE)
  );
  return [
    ...rest,
    {
      type: "drunk",
      source: PERMANENT_DRUNK_SOURCE,
      permanent: true,
      appliedAt: Date.now(),
    },
  ];
}

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  // 优先用 onSetup 阶段写入的 marionetteMasterSeatId（精确）
  const selfSeat = ctx.snapshot.seats.find(
    (s: any) => s.id === ctx.actionNode.seatId
  );
  const masterSeatId =
    (selfSeat as any)?.marionetteMasterSeatId ??
    ctx.snapshot.seats.find((s: any) => !s.isDead && s.role?.type === "demon")
      ?.id ??
    null;
  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        isMarionette: true,
        demonSeatId: masterSeatId,
        thinksTheyAreGood: true,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const selfId = ctx.actionNode.seatId;
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      // 🍺 与酒鬼同链路：写入永久醉酒，使 abilityEffective=false
      seats: (ctx.snapshot.seats as any[]).map((s: any) =>
        s.id === selfId ? { ...s, statusEffects: withPermanentDrunk(s) } : s
      ),
      isMarionette: true,
      marionetteMaster: r?.demonSeatId,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        marionette: r,
      },
    },
    meta: { ...ctx.meta, marionetteResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const log = "[提线木偶] 提线木偶已激活";
  console.log(log);
  return { ...ctx, meta: { ...ctx.meta, abilityLog: log } };
};

export const marionetteAbility = createRoleAbility({
  roleId: "marionette",
  abilityId: "marionette_passive",
  abilityName: "提线木偶",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  firstNightPriority: 19,
  otherNightPriority: null,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: { min: 0, max: 0, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
  // 提线木偶 setup：① 与恶魔邻座分配；② 准备"是提线木偶"提示标记；③ 记录 marionetteMasterSeatId
  onSetup: (context: { seats: any[]; selfId: number }) => {
    const { seats, selfId } = context;
    const updates: Array<{ id: number; [key: string]: any }> = [];
    // 找恶魔座位
    const demonSeat = seats.find(
      (s: any) => s.role?.type === "demon" && s.id !== selfId && !s.isDead
    );
    const marionetteSeat = seats.find((s: any) => s.id === selfId);
    if (marionetteSeat) {
      updates.push({
        id: selfId,
        // 🍺 开局即写入永久醉酒（技能不生效 / 信息类能力出假信息）；与酒鬼同链路
        statusEffects: withPermanentDrunk(marionetteSeat),
        // 兜底补 legacy 布尔字段，保证首次同步前 UI 也能显示醉酒徽标
        isDrunk: true,
        // 设置 marionetteMasterSeatId 标识（引擎/UI 可用）
        ...(demonSeat ? { marionetteMasterSeatId: demonSeat.id } : {}),
      });
    }
    return {
      handled: true,
      updates,
      logs: {
        privateLog: `提线木偶 setup 完成：master = ${demonSeat ? `${demonSeat.id + 1}号` : "未找到恶魔"}`,
        publicLog: "",
      },
    };
  },
});

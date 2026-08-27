/**
 * 提线木偶（Marionette）新引擎技能实现
 *
 * 【角色能力】"你以为自己是镇民，但实际上你是爪牙。你不知道自己是提线木偶。"
 *
 * PASSIVE 触发，标记为提线木偶
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

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
    ctx.snapshot.seats.find(
      (s: any) => !s.isDead && s.role?.type === "demon"
    )?.id ??
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
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
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
    if (demonSeat) {
      // 设置 marionetteMasterSeatId 标识（引擎/UI 可用）
      const marionetteSeat = seats.find((s: any) => s.id === selfId);
      if (marionetteSeat) {
        updates.push({
          id: selfId,
          marionetteMasterSeatId: demonSeat.id,
        });
      }
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

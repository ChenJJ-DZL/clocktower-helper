/**
 * 疯子（Lunatic）新引擎技能实现
 *
 * 【角色能力】双层假象恶魔机制：
 * - 真实身份：疯子（外来者）
 * - 假象身份：某种恶魔（由 apparentDemonRole 决定）
 * - 疯子不知道自己是疯子，以为自己是假恶魔
 * - 每夜按假恶魔时序唤醒，选择击杀目标（不造成真实死亡）
 * - 真实恶魔会被告知疯子的选择
 */
import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

/** 获取疯子的假恶魔 ID */
function getApparentDemonId(ctx: MiddlewareContext): string | null {
  const seat = ctx.snapshot.seats.find(
    (s: any) => s.id === ctx.actionNode.seatId
  );
  return (seat as any)?.apparentDemonRole?.id ?? null;
}

/** 根据假恶魔类型决定目标数量 */
function getTargetCount(ctx: MiddlewareContext): { min: number; max: number } {
  const apparentDemonId = getApparentDemonId(ctx);
  switch (apparentDemonId) {
    case "shabaloth":
      return { min: 2, max: 2 }; // 沙巴洛斯每夜杀2人
    case "po":
      return { min: 1, max: 3 }; // 珀可选1-3人
    case "pukka":
    case "zombuul":
    case "imp":
    case "fang_gu":
    case "vigormortis":
    case "no_dashii":
    case "vortox":
    case "riot":
    case "leviathan":
    case "lil_monsta":
      return { min: 1, max: 1 };
    default:
      return { min: 1, max: 1 };
  }
}

const preCheck = async (ctx: MiddlewareContext): Promise<MiddlewareContext> => {
  const seat = ctx.snapshot.seats.find(
    (s: any) => s.id === ctx.actionNode.seatId
  );
  if (!seat?.isAlive) return { ...ctx, aborted: true, abortReason: "已死亡" };

  // 戏子（改）相克：在场时疯子不会因戏子（改）醉酒/不参与互认
  // → 疯子仍然按原样行动，不因 actor_modified 而失能
  // （此相克由 abilityPriorityMiddleware 处理醉酒判断时跳过疯子，本 ability 无需额外逻辑）

  return ctx;
};

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const targetIds = ctx.targetIds?.length
    ? ctx.targetIds
    : ctx.actionNode.targetIds?.length
      ? ctx.actionNode.targetIds
      : [];
  const apparentDemonId = getApparentDemonId(ctx);

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetIds,
        targetId: targetIds[0] ?? null,
        fakeKill: true,
        realKill: false, // 疯子从不真正杀人
        apparentDemonId,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const targetIds: number[] = Array.isArray(r?.targetIds) ? r.targetIds : [];
  const actorSeatId = ctx.actionNode.seatId;
  // A4 关键：把"疯子本夜选了谁"写进**行动者座位**（而不只是快照顶层）。
  // executeViaNewEngine 的状态合并是 { ...prev, ...updatedSeat }，
  // 只有写进 snapshot.seats 的字段才能同步回 React 座位，
  // 真恶魔的技能确认页 / 说书人控制台才能读到（官方：
  // 「真正的恶魔会知道疯子每个夜晚攻击了哪些玩家。」）。
  const stampedSeats = (ctx.snapshot.seats as any[]).map((s) =>
    s.id === actorSeatId
      ? {
          ...s,
          lunaticTarget: targetIds[0] ?? null,
          lunaticTargetIds: targetIds,
        }
      : s
  );
  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      seats: stampedSeats,
      lunaticTarget: r?.targetId,
      lunaticTargetIds: targetIds,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        lunatic: r,
      },
    },
    meta: { ...ctx.meta, lunaticResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const apparentDemonId = r?.apparentDemonId ?? "未知";
  const targetDesc =
    r?.targetIds?.length > 0
      ? r.targetIds.map((id: number) => `${id + 1}号`).join("、")
      : r?.targetId != null
        ? `${r.targetId + 1}号`
        : "无";

  const log = `[疯子] 疯子以为自己是【${apparentDemonId}】，模拟击杀: ${targetDesc}`;
  console.log(log);

  const seat = ctx.snapshot.seats.find(
    (s: any) => s.id === ctx.actionNode.seatId
  );
  const apparentName =
    (seat as any)?.apparentDemonRole?.name ?? apparentDemonId;

  // 玩家面文案（A2/B1）：结果页会内联给疯子本人点击，
  // 只能出现"你以【假恶魔】的身份做出了选择"，绝不能出现「疯子 / 模拟击杀 / 0 效果」。
  const playerFacingLog =
    targetDesc === "无"
      ? `${apparentName}：本夜未选择目标。`
      : `${apparentName}：已选择 ${targetDesc}。`;

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityLog: log,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【疯子】（假${apparentName}行动），选择击杀目标。此玩家为疯子，请按照【${apparentName}】流程向其演戏，不要透露其真实身份。`,
      displayInfo: {
        type: "lunatic_info",
        targetIds: r?.targetIds ?? [],
        targetId: r?.targetId ?? null,
        apparentDemonId,
        apparentDemonName: apparentName,
        log,
        // 玩家视角专用：INFO_RESULT 优先渲染它（见 useNightActionHandler）
        playerFacingLog,
        isLunatic: true,
      },
    },
  };
};

export const lunaticAbility = createRoleAbility({
  roleId: "lunatic",
  abilityId: "lunatic_fake_kill",
  abilityName: "恶魔幻想",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: 15,
  otherNightPriority: 39,
  firstNightOnly: false,
  wakePromptId: "role.lunatic.wake",
  targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [preCheck],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

/**
 * 侍臣（Courtier）新引擎技能实现
 *
 * 【角色能力】"首夜，你要选择一名玩家：该玩家会醉酒3个夜晚。"
 *
 * 首夜选择一名目标玩家，使其醉酒状态持续3晚。
 * 通过 snapshot.courtier.drunkUntilNight 记录醉酒截止的夜晚编号。
 */
import type { MiddlewareContext } from "../../utils/middlewarePipeline";
import type { GameStateSnapshot } from "../../utils/nightStateMachine";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";

const calculate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const targetId = ctx.targetIds?.[0] ?? ctx.actionNode.targetIds?.[0] ?? null;

  // 读取当前夜晚编号（首次为 1）
  const currentNight = (ctx.snapshot as any).nightCount ?? 1;
  const drunkUntilNight = currentNight + 3;

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        targetId,
        drunkUntilNight,
        currentNight,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.targetId) return ctx;

  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      seats: ctx.snapshot.seats.map((seat: any) =>
        seat.id === r.targetId
          ? {
              ...seat,
              statusEffects: [
                ...(seat.statusEffects ?? []),
                {
                  type: "drunk",
                  source: "courtier",
                  sourceSeatId: ctx.actionNode.seatId,
                  duration: 3,
                  drunkUntilNight: r.drunkUntilNight,
                },
              ],
            }
          : seat
      ),
      courtier: {
        targetId: r.targetId,
        drunkUntilNight: r.drunkUntilNight,
      },
    } as any,
    meta: { ...ctx.meta, courtierResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const log =
    r?.targetId != null
      ? `[Courtier] ${ctx.actionNode.seatId + 1}号 使 ${r.targetId + 1}号 醉酒 ${r.drunkUntilNight - r.currentNight} 晚`
      : "[Courtier] 未行动";
  console.log(log);

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【侍臣】，选择一名玩家使其醉酒3晚。`,
      abilityLog: log,
    },
  };
};

export const courtierAbility = createRoleAbility({
  roleId: "courtier",
  abilityId: "courtier_drunk",
  abilityName: "朝臣醉酒",
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT],
  firstNightPriority: 32,
  otherNightPriority: 15,
  firstNightOnly: true,
  wakePromptId: "role.courtier.wake",
  targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
  preCheck: [],
  calculate: [calculate],
  stateUpdate: [stateUpdate],
  postProcess: [postProcess],
});

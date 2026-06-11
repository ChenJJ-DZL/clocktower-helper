/**
 * 卡扎利（Kazali）新引擎技能实现
 *
 * 【角色能力】"首夜，你可以将爪牙变为不在场的恶魔。"
 *
 * 首夜触发，卡扎利可以选择将一名存活的爪牙替换为一个不在场中的恶魔角色。
 * 这是一个全局操作，不通过 targetIds 选择目标，而是由说书人/界面通过
 * storytellerInput 提供替换映射。
 * targetConfig: min:0, max:0 — 不通过标准选目标流程。
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
  // 替换信息通过 storytellerInput 传入
  const replacements = ctx.storytellerInput?.kazaliReplacements as
    | Array<{ minionSeatId: number; targetDemonId: string }>
    | undefined;

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        replacements: replacements ?? [],
        hasReplacement: (replacements?.length ?? 0) > 0,
      },
    },
  };
};

const stateUpdate = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  if (!r?.hasReplacement) return ctx;

  const updatedSeats = [...ctx.snapshot.seats];

  for (const rep of r.replacements) {
    const idx = updatedSeats.findIndex((s: any) => s.id === rep.minionSeatId);
    if (idx !== -1) {
      updatedSeats[idx] = {
        ...updatedSeats[idx],
        role: {
          ...(updatedSeats[idx].role ?? {}),
          id: rep.targetDemonId,
          type: "demon",
          name: rep.targetDemonId, // 由上层根据 demonId 查表填充
        },
        roleId: rep.targetDemonId,
        roleType: "demon",
        statusDetails: [
          ...(updatedSeats[idx].statusDetails ?? []),
          `被卡扎利替换为恶魔(${rep.targetDemonId})`,
        ],
      };
    }
  }

  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      seats: updatedSeats,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        kazali: r,
      },
    },
    meta: { ...ctx.meta, kazaliResult: r },
  };
};

const postProcess = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const r = ctx.meta.abilityResult as any;
  const count = r?.replacements?.length ?? 0;
  const labels = (r?.replacements ?? [])
    .map((rep: any) => `${rep.minionSeatId + 1}号→${rep.targetDemonId}`)
    .join("、");
  const log = `[卡扎利] 替换了${count}名爪牙为恶魔：${labels || "无"}`;
  console.log(log);

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      prompt: `唤醒${ctx.actionNode.seatId + 1}号【卡扎利】，选择替换哪些爪牙为不在场的恶魔。`,
      abilityLog: log,
    },
  };
};

export const kazaliAbility = createRoleAbility({
  /** 卡扎利（Kazali）标识符 */
  roleId: "kazali",
  /** 能力标识符 */
  abilityId: "kazali_replace",
  /** 能力中文名 */
  abilityName: "爪牙转恶魔",

  /** 触发时机：首夜 */
  triggerTiming: [AbilityTriggerTiming.FIRST_NIGHT],
  /** 唤醒优先级（恶魔变化类优先） */
  wakePriority: 5,
  /** 仅首夜触发 */
  firstNightOnly: true,
  /** 唤醒提示词 ID */
  wakePromptId: "role.kazali.wake",

  /**
   * 目标选择配置
   * min: 0, max: 0 — 全局操作，不由标准选目标流程处理
   * 替换信息通过 storytellerInput.kazaliReplacements 传入
   */
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: false,
  },

  /** preCheck：存活检测 */
  preCheck: [preCheck],
  /** calculate：读取替换配置 */
  calculate: [calculate],
  /** stateUpdate：执行爪牙→恶魔替换 */
  stateUpdate: [stateUpdate],
  /** postProcess：日志与提示词 */
  postProcess: [postProcess],
});

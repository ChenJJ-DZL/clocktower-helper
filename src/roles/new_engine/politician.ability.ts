/**
 * 政客（Politician）新引擎技能实现
 *
 * 【官方百科能力】"如果你是对你的阵营落败负最大责任的人，你转变阵营并获胜，即使你已死亡。"
 *
 * 运作方式：
 * - 当游戏结束时，考量政客是否是对阵营落败做出了最重要的贡献。
 * - 如果政客在其原阵营落败中负最大责任（如误导处决善良、关键保住恶魔等），且在终局时未醉酒/未中毒，他转变阵营并与获胜方一同获胜。
 * - 如果游戏结束时政客处于醉酒或中毒状态，他无法触发能力转变阵营。
 * - 如果政客本阵营已经获胜，政客正常获胜。
 */

import type { MiddlewareContext } from "../../utils/middlewareTypes";
import {
  AbilityTriggerTiming,
  createRoleAbility,
} from "../core/roleAbility.types";
import { evaluatePoliticianEndgame } from "../../utils/expansionMechanics";

// ─── 计算中间件 ─────────────────────────────────────────────────────────

const calculateResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const seatId = ctx.actionNode.seatId;
  const politicianSeat = ctx.snapshot.seats.find((s: any) => s.id === seatId);
  if (!politicianSeat) {
    return { ...ctx, aborted: true, abortReason: "未找到政客座位" };
  }

  // 获取胜负信息与说书人判定（说书人判定政客是否负最大责任）
  const gameWinner: "good" | "evil" =
    ctx.snapshot.gameWinner ?? (ctx.storytellerInput as any)?.gameWinner ?? "evil";
  const isMostResponsible =
    ctx.storytellerInput?.isMostResponsible ??
    (ctx.snapshot as any)?.politicianMostResponsible ??
    false;

  const evaluation = evaluatePoliticianEndgame(
    politicianSeat,
    gameWinner,
    isMostResponsible
  );

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityResult: {
        seatId,
        gameWinner,
        isMostResponsible,
        politicianWon: evaluation.politicianWon,
        convertedAlignment: evaluation.convertedAlignment,
      },
    },
  };
};

// ─── 状态更新中间件 ────────────────────────────────────────────────────

const stateUpdateResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const abilityResult = ctx.meta.abilityResult as any;
  if (!abilityResult) return ctx;

  const updatedSeats = [...ctx.snapshot.seats];
  const idx = updatedSeats.findIndex((s: any) => s.id === abilityResult.seatId);

  if (idx !== -1 && abilityResult.convertedAlignment) {
    updatedSeats[idx] = {
      ...updatedSeats[idx],
      isEvilConverted: abilityResult.convertedAlignment === "evil",
      isGoodConverted: abilityResult.convertedAlignment === "good",
      politicianWon: true,
      statusDetails: [
        ...(updatedSeats[idx].statusDetails ?? []),
        `政客对本阵营落败负最大责任，转变阵营并获胜`,
      ],
    };
  }

  return {
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      seats: updatedSeats,
      _abilityResults: {
        ...((ctx.snapshot as any)._abilityResults ?? {}),
        politician: abilityResult,
      },
    },
    meta: {
      ...ctx.meta,
      politicianResult: abilityResult,
    },
  };
};

// ─── 后置处理中间件 ────────────────────────────────────────────────────

const postProcessResult = async (
  ctx: MiddlewareContext
): Promise<MiddlewareContext> => {
  const record = ctx.meta.politicianResult as any;
  if (!record) return ctx;

  const seatNum = record.seatId + 1;
  let log = "";
  if (record.convertedAlignment) {
    log = `[政客] ${seatNum}号政客对本阵营落败负最大责任，成功转变为${record.convertedAlignment === "evil" ? "邪恶" : "善良"}阵营并获胜！`;
  } else if (record.politicianWon) {
    log = `[政客] ${seatNum}号政客原阵营获胜，政客一同获胜。`;
  } else {
    log = `[政客] ${seatNum}号政客未满足反戈获胜条件，随原阵营落败。`;
  }
  console.log(log);

  return {
    ...ctx,
    meta: {
      ...ctx.meta,
      abilityLog: log,
      displayInfo: {
        type: "politician_endgame",
        politicianWon: record.politicianWon,
        convertedAlignment: record.convertedAlignment,
        log,
      },
    },
  };
};

// ─── 导出能力注册 ─────────────────────────────────────────────────────

export const politicianAbility = createRoleAbility({
  roleId: "politician",
  abilityId: "politician_endgame_check",
  abilityName: "负荆请罪",
  triggerTiming: [AbilityTriggerTiming.PASSIVE],
  firstNightPriority: null,
  otherNightPriority: null,
  firstNightOnly: false,
  wakePromptId: "",
  targetConfig: {
    min: 0,
    max: 0,
    allowSelf: false,
    allowDead: true, // 即使死亡也可结算
  },
  preCheck: [],
  calculate: [calculateResult],
  stateUpdate: [stateUpdateResult],
  postProcess: [postProcessResult],
});

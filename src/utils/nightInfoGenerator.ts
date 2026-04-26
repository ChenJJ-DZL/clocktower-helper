/**
 * 夜间信息生成器
 * 从 getRoleDefinition 的 dialog/target 配置生成 NightInfoResult
 * 替代旧引擎 calculateNightInfo 的 UI 展示部分
 *
 * 职责：
 * 1. 调用 getRoleDefinition 的 dialog 函数生成 guide/speak/action 文本
 * 2. 从 target 配置生成 targetLimit/validTargetIds/canSelectSelf/canSelectDead
 * 3. 构建完整的 NightInfoResult 对象
 */

import type { Script, Seat } from "@/app/data";
import type { NightInfoResult } from "@/src/types/game";
import type { GamePhase, Role } from "../../app/data";
import { getRoleDefinition } from "../roles";
import type { RegistrationResult } from "../types/registration";
import type { NightActionContext } from "../types/roleDefinition";
import { computeIsPoisoned, getPoisonSources } from "./gameRules";

/**
 * 生成夜间信息结果
 * 完全替代旧引擎 calculateNightInfo 的 UI 展示部分
 */
export function generateNightInfo(
  selectedScript: Script | null,
  seats: Seat[],
  currentSeatId: number,
  gamePhase: GamePhase,
  lastDuskExecution: number | null,
  nightCount: number,
  isEvilWithJudgmentFn?: (seat: Seat) => boolean,
  poppyGrowerDead?: boolean,
  spyDisguiseMode?: "off" | "default" | "on",
  spyDisguiseProbability?: number,
  deadThisNight: number[] = [],
  registrationCache?: Map<string, any>,
  registrationCacheKey?: string,
  vortoxWorld?: boolean,
  demonVotedToday?: boolean,
  minionNominatedToday?: boolean,
  executedToday?: number | null,
  hasUsedAbilityFn?: (roleId: string, seatId: number) => boolean,
  votedThisRound?: number[],
  outsiderDiedToday?: boolean
): NightInfoResult | null {
  const targetSeat = seats.find((s) => s.id === currentSeatId);
  if (!targetSeat || !targetSeat.role) return null;

  const isFirstNight = gamePhase === "firstNight";
  const effectiveRole =
    targetSeat.role.id === "drunk" && targetSeat.charadeRole
      ? targetSeat.charadeRole
      : targetSeat.role;

  if (!effectiveRole) return null;

  const isPoisoned = computeIsPoisoned(targetSeat, seats);
  const isDrunk = targetSeat.isDrunk || targetSeat.role?.id === "drunk";
  const vortoxActive = seats.some((s) => s.role?.id === "vortox" && !s.isDead);
  const effectivePoisoned =
    (vortoxActive && effectiveRole.type === "townsfolk") || isPoisoned;

  const poisonSources = getPoisonSources(targetSeat);
  let reason = "";
  if (poisonSources.permanent || poisonSources.snakeCharmer) {
    reason = "永久中毒";
  } else if (poisonSources.vigormortis) {
    reason = "亡骨魔中毒";
  } else if (poisonSources.pukka) {
    reason = "普卡中毒";
  } else if (poisonSources.dayPoison || poisonSources.noDashiiMark) {
    reason = "投毒";
  } else if (poisonSources.cannibal) {
    reason = "食人族中毒";
  } else if (effectivePoisoned) {
    reason = "中毒";
  } else if (isDrunk) {
    reason = "酒鬼";
  }

  const roleDef = getRoleDefinition(effectiveRole.id);
  const nightConfig = isFirstNight
    ? roleDef?.firstNight || roleDef?.night
    : roleDef?.night;

  if (!nightConfig) {
    // 该角色没有夜晚行动配置
    return null;
  }

  // 构建 NightActionContext（供 dialog 函数使用）
  const context: NightActionContext = {
    seats,
    targets: [],
    selfId: currentSeatId,
    gamePhase,
    nightCount,
    vortoxWorld: !!vortoxWorld,
    isVortoxWorld: !!vortoxWorld,
    demonVotedToday: !!demonVotedToday,
    minionNominatedToday: !!minionNominatedToday,
    executedToday,
    isPoisoned: effectivePoisoned,
    shouldShowFake: effectivePoisoned || !!vortoxWorld,
    isEvilWithJudgmentFn,
    poppyGrowerDead,
    lastDuskExecution,
    outsiderDiedToday,
    deadThisNight,
    getRegistration: (
      _seat: Seat,
      _viewer?: Role | null
    ): RegistrationResult => ({
      alignment: "Good" as const,
      roleType: _seat.role?.type || "townsfolk",
      registersAsDemon: _seat.role?.id === "recluse" && Math.random() < 0.5,
      registersAsMinion: false,
      registersAsOutsider: false,
      registersAsTownsfolk: false,
      overrides: [],
    }),
    getMisinformation: {},
    findNearestAliveNeighbor: (
      originId: number,
      direction: 1 | -1
    ): Seat | null => {
      const originIndex = seats.findIndex((s) => s.id === originId);
      if (originIndex === -1 || seats.length <= 1) return null;
      for (let step = 1; step < seats.length; step++) {
        const seat =
          seats[(originIndex + direction * step + seats.length) % seats.length];
        if (!seat.isDead && seat.id !== originId) return seat;
      }
      return null;
    },
    isActorDisabledByPoisonOrDrunk: (seat: Seat) =>
      computeIsPoisoned(seat, seats) ||
      seat.isDrunk ||
      seat.role?.id === "drunk",
    addLog: () => {},
  };

  // 调用 dialog 函数生成 guide/speak/action
  const dialog = nightConfig.dialog(currentSeatId, isFirstNight, context);
  const guide = dialog.wake || "";
  const speak = dialog.instruction || "";
  const action = dialog.close || "";

  // 从 target 配置生成 targetLimit/validTargetIds
  let targetLimit = { min: 0, max: 0 };
  let canSelectSelf = false;
  const canSelectDead = false;
  let validTargetIds: number[] = [];

  if (nightConfig.target) {
    targetLimit = nightConfig.target.count;
    if (nightConfig.target.canSelect) {
      canSelectSelf = nightConfig.target.canSelect(
        targetSeat,
        targetSeat,
        seats,
        []
      );
    }
    if (nightConfig.target.validTargetIds) {
      validTargetIds = nightConfig.target.validTargetIds(
        currentSeatId,
        seats,
        gamePhase
      );
    }
  }

  // 如果没有合法目标且需要选择目标，生成默认目标列表
  if (targetLimit.max > 0 && validTargetIds.length === 0) {
    let candidates = seats.filter((s) => !s.isDead);
    if (canSelectDead) {
      candidates = seats;
    }
    validTargetIds = candidates.map((s) => s.id);
    if (!canSelectSelf) {
      validTargetIds = validTargetIds.filter((id) => id !== currentSeatId);
    }
  }

  const interaction = {
    type: targetLimit.max > 0 ? "choose_player" : "none",
    amount: targetLimit.max,
    required: true,
    canSelectSelf,
    canSelectDead,
    effect: { type: "none" },
  };

  return {
    seat: targetSeat,
    effectiveRole,
    isPoisoned: effectivePoisoned,
    reason,
    guide,
    speak,
    action,
    meta: {
      targetType: interaction.type === "choose_player" ? "player" : "none",
      amount: interaction.amount,
      targetCount: nightConfig.target?.count,
    },
    interaction,
    roleId: effectiveRole.id,
    index: 0,
    targetLimit,
    canSelectDead,
    canSelectSelf,
    validTargetIds,
    guideText: guide,
    actionText: action,
  };
}

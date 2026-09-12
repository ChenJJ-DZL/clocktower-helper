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

import {
  roles as allRoles,
  type GamePhase,
  type Role,
  type Script,
  type Seat,
} from "../../app/data";
import { getRoleDefinition } from "../roles";
import type { NightInfoResult } from "../types/game";
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
  _spyDisguiseMode?: "off" | "default" | "on",
  _spyDisguiseProbability?: number,
  deadThisNight: number[] = [],
  _registrationCache?: Map<string, any>,
  _registrationCacheKey?: string,
  vortoxWorld?: boolean,
  demonVotedToday?: boolean,
  minionNominatedToday?: boolean,
  executedToday?: number | null,
  _hasUsedAbilityFn?: (roleId: string, seatId: number) => boolean,
  _votedThisRound?: number[],
  outsiderDiedToday?: boolean,
  overrideRoleId?: string
): NightInfoResult | null {
  const targetSeat = seats.find((s) => s.id === currentSeatId);
  if (!targetSeat || !targetSeat.role) return null;

  const isFirstNight = gamePhase === "firstNight";
  const isCharade =
    (targetSeat.role.id === "drunk" || targetSeat.role.id === "marionette") &&
    targetSeat.charadeRole;
  /**
   * 🌀 A2：疯子（Lunatic）的"我是谁"来自说书人设置的 seat.apparentDemonRole。
   * 注意分工（不要混淆）：
   *   - `effectiveRole` 仍是 **lunatic** → 执行链路用的就是它，保证疯子绝不真杀；
   *   - `playerFacingRole` = apparentDemonRole → 只用于**玩家面显示**
   *     （角色名/阵营色/指引文案/目标数量）。
   * 这样"界面完全按假恶魔演"与"规则按疯子结算"两件事互不干扰。
   */
  const isLunatic = targetSeat.role.id === "lunatic";
  const apparentDemonRole = isLunatic
    ? (((targetSeat as any).apparentDemonRole as Role | null) ?? null)
    : null;

  const isPixieInherited =
    overrideRoleId &&
    overrideRoleId !== targetSeat.role.id &&
    targetSeat.role.id === "pixie";

  const overrideRoleDef = overrideRoleId
    ? getRoleDefinition(overrideRoleId)
    : undefined;

  const overrideRole = overrideRoleDef
    ? ({
        id: overrideRoleDef.id,
        name: overrideRoleDef.name,
        type: overrideRoleDef.type,
      } as Role)
    : undefined;

  const effectiveRole = isCharade
    ? targetSeat.charadeRole
    : isPixieInherited && overrideRole
      ? overrideRole
      : targetSeat.role;

  if (!effectiveRole) return null;

  /** 玩家视角下的角色：疯子 → 假恶魔；酒鬼/提线木偶 → 伪装镇民；其余同 effectiveRole。 */
  const playerFacingRole: Role = apparentDemonRole ?? effectiveRole;

  const isPoisoned = computeIsPoisoned(targetSeat, seats);
  const isDrunk =
    targetSeat.isDrunk ||
    targetSeat.role?.id === "drunk" ||
    targetSeat.role?.id === "marionette";
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
    : roleDef?.night || (isPixieInherited ? roleDef?.firstNight : undefined);

  /**
   * 🌀 A2：疯子的"玩家面配置"取自 apparentDemonRole 的角色定义 —— 于是
   * 界面文案（dialog）、目标数量与目标规则（target）**完全按假恶魔演**
   * （例：apparentDemonRole = vortox 时页面就是涡流的技能页）。
   * 执行仍走 effectiveRole = lunatic，两件事互不影响。
   * 非疯子角色：displayRoleDef === roleDef，行为与改动前完全一致。
   */
  const displayRoleDef = apparentDemonRole
    ? (getRoleDefinition(apparentDemonRole.id) ?? roleDef)
    : roleDef;
  const displayNightConfig =
    displayRoleDef === roleDef
      ? nightConfig
      : isFirstNight
        ? displayRoleDef?.firstNight || displayRoleDef?.night
        : displayRoleDef?.night;
  const effectiveDisplayConfig = displayNightConfig ?? nightConfig;

  if (!nightConfig) {
    // 该角色没有 legacy 夜晚行动配置时，尝试从 effectiveRole 生成基础信息
    // 确保 UI 不会因 nightInfo 为空而卡死
    const defaultGuide = `唤醒${currentSeatId + 1}号【${(playerFacingRole ?? effectiveRole).name}】，准备执行技能。`;
    return {
      seat: targetSeat,
      effectiveRole,
      playerFacingRole,
      playerFacingGuide: defaultGuide,
      isPoisoned: effectivePoisoned,
      reason,
      guide: defaultGuide,
      speak: "",
      action: "",
      roleId: effectiveRole.id,
      index: 0,
      targetLimit: effectiveDisplayConfig?.target?.count ?? { min: 0, max: 0 },
      canSelectDead: false,
      canSelectSelf: false,
      validTargetIds: [],
      guideText: defaultGuide,
      actionText: "",
      interaction: {
        type: "none",
        amount: 0,
        required: false,
        canSelectSelf: false,
        canSelectDead: false,
        effect: { type: "none" },
      },
    };
  }

  // 从 selectedScript 获取角色列表（通过 roleIds 过滤全局角色列表）
  const scriptRoles = selectedScript?.roleIds
    ? allRoles.filter((r) => selectedScript.roleIds!.includes(r.id))
    : [];

  // 构建 NightActionContext（供 dialog 函数使用）
  const context: NightActionContext = {
    seats,
    targets: [],
    selfId: currentSeatId,
    gamePhase,
    nightCount,
    roles: scriptRoles,
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
    isActorDisabledByPoisonOrDrunk: (seat: Seat) => {
      const hasVortox =
        Boolean(vortoxWorld) ||
        seats.some((s) => s.role?.id === "vortox" && !s.isDead);
      const isTownsfolk =
        seat.role?.type === "townsfolk" ||
        (seat.role?.id === "drunk" && seat.charadeRole?.type === "townsfolk") ||
        (seat.role?.id === "marionette" && seat.charadeRole?.type === "townsfolk");
      if (isTownsfolk && hasVortox) return true;
      return (
        computeIsPoisoned(seat, seats) ||
        seat.isDrunk ||
        seat.role?.id === "drunk" ||
        seat.role?.id === "marionette"
      );
    },
    addLog: () => {},
  };


  /** 读取某份 nightConfig 的 dialog 三件套。 */
  const readDialog = (cfg: any) => {
    if (!cfg?.dialog) return { guide: "", speak: "", action: "" };
    if (typeof cfg.dialog === "function") {
      const d = cfg.dialog(currentSeatId, isFirstNight, context) || {};
      return {
        guide: d.wake || "",
        speak: d.instruction || "",
        action: d.close || "",
      };
    }
    if (typeof cfg.dialog === "object") {
      const d = cfg.dialog as any;
      return {
        guide: d.wake || d.action || "",
        speak: d.instruction || "",
        action: d.close || "",
      };
    }
    return { guide: String(cfg.dialog), speak: "", action: "" };
  };

  // 调用 dialog 函数生成 guide/speak/action（安全防御检查）
  // 🎭 说书人链路继续用 nightConfig（疯子 → 疯子自己的 dialog，含"不要透露其真实身份"等指令）；
  // 👤 玩家链路用 effectiveDisplayConfig（疯子 → 假恶魔的 dialog）。
  const storytellerDialog = readDialog(nightConfig);
  const playerDialog =
    effectiveDisplayConfig === nightConfig
      ? storytellerDialog
      : readDialog(effectiveDisplayConfig);
  const guide = storytellerDialog.guide;
  const speak = storytellerDialog.speak;
  const action = storytellerDialog.action;
  /**
   * A2：玩家面的夜间指引。
   * - 疯子：假恶魔（apparentDemonRole）的技能描述；
   * - 其他角色：与说书人 guide 相同。
   */
  const playerFacingGuide = playerDialog.guide || guide;

  // 从 target 配置生成 targetLimit/validTargetIds
  let targetLimit = { min: 0, max: 0 };
  let canSelectSelf = false;
  let canSelectDead = false;
  let validTargetIds: number[] = [];

  // 🌀 A2：目标数量/规则取**玩家面配置**（疯子 → 假恶魔，如沙巴洛斯=选 2 人）。
  const targetConfig = effectiveDisplayConfig?.target;
  if (targetConfig) {
    targetLimit = targetConfig.count;
    if (targetConfig.canSelect) {
      canSelectSelf = targetConfig.canSelect(targetSeat, targetSeat, seats, []);
      const dummyDeadSeat =
        seats.find((s) => s.isDead) ||
        ({
          id: -999,
          isDead: true,
          role: { id: "villager", type: "townsfolk" },
        } as any);
      canSelectDead = targetConfig.canSelect(
        dummyDeadSeat,
        targetSeat,
        seats,
        []
      );
    }
    if (targetConfig.validTargetIds) {
      validTargetIds = targetConfig.validTargetIds(
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
    // 👤 A2：玩家面身份/文案（疯子 → apparentDemonRole）。
    //    消费者一律 `playerFacingRole ?? effectiveRole` /
    //    `playerFacingGuide ?? guide`，切不可直接把 effectiveRole 交给玩家页。
    playerFacingRole,
    playerFacingGuide,
    isPoisoned: effectivePoisoned,
    reason,
    guide,
    speak,
    action,
    meta: {
      targetType: interaction.type === "choose_player" ? "player" : "none",
      amount: interaction.amount,
      targetCount: targetConfig?.count,
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

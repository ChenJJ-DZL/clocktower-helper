/**
 * 角色特定行动处理函数
 * 将角色特定的确认逻辑从 useGameController 中分离出来
 */

import type React from "react";
import type { GamePhase, Role, Seat } from "../../app/data";
import type { NightInfoResult } from "../types/game";
import type { ModalType } from "../types/modal";

/**
 * 角色确认处理上下文
 */
export interface RoleConfirmContext {
  nightInfo: NightInfoResult;
  seats: Seat[];
  selectedTargets: number[];
  gamePhase: GamePhase;
  nightCount: number;
  roles: Role[];

  // 状态更新函数
  setSeats: React.Dispatch<React.SetStateAction<Seat[]>>;
  setSelectedActionTargets: React.Dispatch<React.SetStateAction<number[]>>;

  // 统一的弹窗状态管理
  currentModal: ModalType;
  setCurrentModal: React.Dispatch<React.SetStateAction<ModalType>>;

  // 辅助函数
  getSeatRoleId: (seat?: Seat | null) => string | null;
  cleanseSeatStatuses: (
    seat: Seat,
    options?: { keepDeathState?: boolean }
  ) => Seat;
  insertIntoWakeQueueAfterCurrent: (
    seatId: number,
    opts?: { roleOverride?: Role | null; logLabel?: string }
  ) => void;
  continueToNextAction: () => void;
  addLog: (message: string) => void;
  killPlayer: (targetId: number, options?: any) => void;
  hasUsedAbility: (roleId: string, seatId: number) => boolean;
  markAbilityUsed: (roleId: string, seatId: number) => void;
  reviveSeat: (seat: Seat) => Seat;
  setPukkaPoisonQueue: React.Dispatch<
    React.SetStateAction<Array<{ targetId: number; nightsUntilDeath: number }>>
  >;
  setDeadThisNight: React.Dispatch<React.SetStateAction<number[]>>;
  poChargeState: Record<number, boolean>;
  setPoChargeState: React.Dispatch<
    React.SetStateAction<Record<number, boolean>>
  >;
  addDrunkMark: (
    seat: Seat,
    drunkType:
      | "sweetheart"
      | "goon"
      | "sailor"
      | "innkeeper"
      | "courtier"
      | "philosopher"
      | "minstrel",
    clearTime: string
  ) => { statusDetails: string[]; statuses: any[] };
  addPoisonMark: (
    seat: Seat,
    poisonType:
      | "permanent"
      | "vigormortis"
      | "pukka"
      | "poisoner"
      | "poisoner_mr"
      | "no_dashii"
      | "cannibal"
      | "snake_charmer",
    clearTime: string
  ) => { statusDetails: string[]; statuses: any[] };
  isEvil: (seat: Seat) => boolean;
  getAliveNeighbors: (seats: Seat[], targetId: number) => Seat[];
  todayDemonVoted: boolean;
  todayMinionNominated: boolean;
  todayExecutedId: number | null;
  jugglerGuesses: Record<number, Record<number, string>>;
  computeIsPoisoned: (seat: Seat, allSeats?: Seat[]) => boolean;
  addLogWithDeduplication: (
    msg: string,
    playerId?: number,
    roleName?: string
  ) => void;
}

/**
 * 角色确认处理结果
 */
export interface RoleConfirmResult {
  /**
   * 是否已处理（如果返回 true，handleConfirmAction 将不再继续）
   */
  handled: boolean;

  /**
   * 是否需要等待（例如需要弹窗确认）
   */
  shouldWait?: boolean;
}

/**
 * 麻脸巫婆确认处理已合并至后文
 */

/**
 * 教授确认处理
 */
export function handleProfessorConfirm(
  context: RoleConfirmContext
): RoleConfirmResult {
  const {
    nightInfo,
    seats,
    selectedTargets,
    gamePhase,
    hasUsedAbility,
    markAbilityUsed,
    reviveSeat,
    setSeats,
    setPukkaPoisonQueue,
    setDeadThisNight,
    setSelectedActionTargets,
    insertIntoWakeQueueAfterCurrent,
    continueToNextAction,
    addLog,
  } = context;

  const isProfessor =
    nightInfo.effectiveRole.id === "professor" ||
    nightInfo.effectiveRole.id === "professor_mr";
  if (!isProfessor || gamePhase === "firstNight") {
    return { handled: false };
  }

  const seatId = nightInfo?.seat?.id ?? 0;

  if (hasUsedAbility("professor_mr", seatId)) {
    continueToNextAction();
    return { handled: true };
  }

  const availableReviveTargets = seats.filter((s) => {
    const r = s.role?.id === "drunk" ? s.charadeRole : s.role;
    return s.isDead && r && r.type === "townsfolk" && !s.isDemonSuccessor;
  });

  if (availableReviveTargets.length === 0) {
    addLog(`${seatId + 1}号(教授) 无可复活的镇民，跳过`);
    continueToNextAction();
    return { handled: true };
  }

  if (selectedTargets.length !== 1) {
    if (selectedTargets.length === 0)
      alert("请选择一名死亡的镇民复活（或点击确认跳过）");
    else alert("教授每晚只能选择一名目标，请取消多余的选择");
    return { handled: true, shouldWait: true };
  }

  const targetId = selectedTargets[0];
  const targetSeat = seats.find((s) => s.id === targetId);

  if (!targetSeat || !targetSeat.isDead) {
    return { handled: true, shouldWait: true };
  }

  const targetRole =
    targetSeat.role?.id === "drunk" ? targetSeat.charadeRole : targetSeat.role;
  if (
    !targetRole ||
    targetSeat.isDemonSuccessor ||
    targetRole.type !== "townsfolk"
  ) {
    alert("教授只能复活死亡的镇民");
    return { handled: true, shouldWait: true };
  }

  const hadEvenDead = !!targetSeat.hasAbilityEvenDead;

  setSeats((prev) =>
    prev.map((s) => {
      if (s.id !== targetId) return s;
      return reviveSeat({
        ...s,
        isEvilConverted: false,
        isZombuulTrulyDead: s.isZombuulTrulyDead,
      });
    })
  );

  setPukkaPoisonQueue((prev) =>
    prev.filter((entry) => entry.targetId !== targetId)
  );
  setDeadThisNight((prev) => prev.filter((id) => id !== targetId));
  addLog(`${seatId + 1}号(教授) 复活${targetId + 1}号`);

  if (hadEvenDead) {
    addLog(`${targetId + 1}号此前因亡骨魔获得的"死而有能"效果随着复活已失效`);
  }

  markAbilityUsed("professor_mr", seatId);
  setSelectedActionTargets([]);
  insertIntoWakeQueueAfterCurrent(targetId, {
    logLabel: `${targetId + 1}号(复活)`,
  });
  continueToNextAction();
  return { handled: true };
}

/**
 * 巡山人确认处理
 */
export function handleRangerConfirm(
  context: RoleConfirmContext
): RoleConfirmResult {
  const {
    nightInfo,
    seats,
    selectedTargets,
    gamePhase,
    hasUsedAbility,
    markAbilityUsed,
    getSeatRoleId,
    setSelectedActionTargets,
    setCurrentModal,
    continueToNextAction,
    addLog,
  } = context;

  if (nightInfo.effectiveRole.id !== "ranger" || gamePhase === "firstNight") {
    return { handled: false };
  }

  const seatId = nightInfo?.seat?.id ?? 0;

  if (hasUsedAbility("ranger", seatId)) {
    continueToNextAction();
    return { handled: true };
  }

  if (selectedTargets.length !== 1) {
    if (selectedTargets.length === 0) alert("请选择一名目标玩家");
    else alert("巡山人每晚只能选择一名目标");
    return { handled: true, shouldWait: true };
  }

  const targetId = selectedTargets[0];
  const targetSeat = seats.find((s) => s.id === targetId);

  if (!targetSeat || targetSeat.isDead) {
    return { handled: true, shouldWait: true };
  }

  const targetRoleId = getSeatRoleId(targetSeat);
  markAbilityUsed("ranger", seatId);
  setSelectedActionTargets([]);

  if (targetRoleId !== "damsel") {
    addLog(`${seatId + 1}号(巡山人) 选择${targetId + 1}号，但未命中落难少女`);
    continueToNextAction();
    return { handled: true };
  }

  setCurrentModal({ type: "RANGER", data: { targetId, roleId: null } });
  return { handled: true, shouldWait: true };
}

/**
 * 沙巴洛斯确认处理
 */
export function handleShabalothConfirm(
  context: RoleConfirmContext
): RoleConfirmResult {
  const {
    nightInfo,
    selectedTargets,
    gamePhase,
    setSelectedActionTargets,
    killPlayer,
    continueToNextAction,
    addLog,
  } = context;

  if (
    nightInfo.effectiveRole.id !== "shabaloth" ||
    gamePhase === "firstNight"
  ) {
    return { handled: false };
  }

  if (selectedTargets.length !== 2) {
    if (selectedTargets.length < 2) alert("请选择两名目标玩家");
    else alert("沙巴洛斯每晚必须选择恰好两名目标");
    return { handled: true, shouldWait: true };
  }

  const targets = [...selectedTargets];
  setSelectedActionTargets([]);

  let remaining = targets.length;
  targets.forEach((tid, idx) => {
    killPlayer(tid, {
      skipGameOverCheck: idx < targets.length - 1,
      onAfterKill: () => {
        remaining -= 1;
        if (remaining === 0) {
          const seatId = nightInfo?.seat?.id ?? 0;
          addLog(
            `${seatId + 1}号(沙巴洛斯) 杀死了 ${targets.map((x) => `${x + 1}号`).join("、")}，本工具暂未实现其复活效果，请说书人按规则手动裁定是否复活`
          );
          continueToNextAction();
        }
      },
    });
  });

  return { handled: true, shouldWait: true };
}

/**
 * 珀确认处理
 */
export function handlePoConfirm(
  context: RoleConfirmContext
): RoleConfirmResult {
  const {
    nightInfo,
    selectedTargets,
    gamePhase,
    poChargeState,
    setPoChargeState,
    setSelectedActionTargets,
    killPlayer,
    continueToNextAction,
    addLog,
  } = context;

  if (nightInfo.effectiveRole.id !== "po" || gamePhase === "firstNight") {
    return { handled: false };
  }

  const seatId = nightInfo?.seat?.id ?? 0;
  const charged = poChargeState[seatId] === true;
  const uniqueTargets = Array.from(new Set(selectedTargets));

  // 未蓄力允许0个目标（本夜不杀死蓄力）或普通杀一
  if (!charged) {
    if (uniqueTargets.length > 1) {
      alert("本夜未蓄力，只能选择 0 人（蓄力）或 1 人（普通击杀）");
      return { handled: true, shouldWait: true };
    }

    if (uniqueTargets.length === 0) {
      // 本夜不杀人蓄力
      setPoChargeState((prev) => ({ ...prev, [seatId]: true }));
      addLog(
        `${seatId + 1}号(珀) 本夜未杀人，蓄力一次，下一个夜晚将爆发杀 3 人`
      );
      continueToNextAction();
      return { handled: true };
    }

    const targetId = uniqueTargets[0];
    setPoChargeState((prev) => ({ ...prev, [seatId]: false }));
    setSelectedActionTargets([]);
    killPlayer(targetId, {
      onAfterKill: () => {
        addLog(`${seatId + 1}号(珀) 杀死了 ${targetId + 1}号`);
        continueToNextAction();
      },
    });
    return { handled: true, shouldWait: true };
  }

  // 已蓄力必须选择3名不同目标本夜爆发杀 3
  if (uniqueTargets.length !== 3) {
    alert("已蓄力！必须选择 3 名不同的目标");
    return { handled: true, shouldWait: true };
  }

  setPoChargeState((prev) => ({ ...prev, [seatId]: false }));
  setSelectedActionTargets([]);

  let remaining = uniqueTargets.length;
  uniqueTargets.forEach((tid, idx) => {
    killPlayer(tid, {
      skipGameOverCheck: idx < uniqueTargets.length - 1,
      onAfterKill: () => {
        remaining -= 1;
        if (remaining === 0) {
          addLog(
            `${seatId + 1}号(珀) 爆发杀死了 ${uniqueTargets.map((x) => `${x + 1}号`).join("、")}`
          );
          continueToNextAction();
        }
      },
    });
  });

  return { handled: true, shouldWait: true };
}

/**
 * 刺客确认处理（黯月初升）
 * 规则要点：
 * - 每局限一次，可选择 0（不使用）或 1 名玩家（使用并立即击杀）
 * - 若刺客中毒/醉酒，本次击杀无效，但仍视为“已用过能力”（失去能力）
 * - 刺客击杀可无视“不会死亡”类保护（在 killPlayer 中针对 tea_lady 做了例外放行）
 */
export function handleAssassinConfirm(
  context: RoleConfirmContext
): RoleConfirmResult {
  const {
    nightInfo,
    seats,
    selectedTargets,
    gamePhase,
    hasUsedAbility,
    markAbilityUsed,
    setSelectedActionTargets,
    killPlayer,
    continueToNextAction,
    addLog,
  } = context;

  if (nightInfo.effectiveRole.id !== "assassin" || gamePhase === "firstNight") {
    return { handled: false };
  }

  const seatId = nightInfo.seat.id;

  // 已用过能力：直接跳过
  if (hasUsedAbility("assassin", seatId)) {
    setSelectedActionTargets([]);
    continueToNextAction();
    return { handled: true };
  }

  const uniqueTargets = Array.from(new Set(selectedTargets));

  // 允许 0（不使用）或 1（使用）
  if (uniqueTargets.length > 1) {
    alert("刺客只能选择 0 人或 1 人");
    return { handled: true, shouldWait: true };
  }

  if (uniqueTargets.length === 0) {
    // 不使用能力
    continueToNextAction();
    return { handled: true };
  }

  const targetId = uniqueTargets[0];
  setSelectedActionTargets([]);

  // 使用能力一次（无论是否成功），都要消耗
  markAbilityUsed("assassin", seatId);

  const actorSeat = seats.find((s) => s.id === seatId);
  const actorDisabled =
    nightInfo.isPoisoned ||
    !!actorSeat?.isDrunk ||
    actorSeat?.role?.id === "drunk";

  if (actorDisabled) {
    addLog(
      `${seatId + 1}号(刺客) 处于中毒/醉酒状态，本夜刺杀无效，但能力已消耗`
    );
    continueToNextAction();
    return { handled: true };
  }

  killPlayer(targetId, {
    source: "ability",
    onAfterKill: () => {
      addLog(`${seatId + 1}号(刺客) 刺杀了 ${targetId + 1}号（无视保护）`);
      continueToNextAction();
    },
  });

  return { handled: true, shouldWait: true };
}

/**
 * 教父确认处理（黯月初升）
 * 规则要点：
 * - 前提：今日白天有外来者死亡（由夜序和唤醒队列控制，不在此重复判断）
 * - 夜晚被唤醒时选择 1 名玩家：他死亡（若教父中毒/醉酒，本次杀人无效）
 * - 若该玩家是善良阵营，且为“初始教父”（目前默认视为教父本体），则本夜再额外杀死 1 名玩家（说书人选择）
 */
export function handleGodfatherConfirm(
  context: RoleConfirmContext
): RoleConfirmResult {
  const {
    nightInfo,
    seats,
    selectedTargets,
    gamePhase,
    setSelectedActionTargets,
    setCurrentModal,
    continueToNextAction,
    addLog,
    killPlayer,
    isEvil,
  } = context;

  if (
    nightInfo.effectiveRole.id !== "godfather" ||
    gamePhase === "firstNight"
  ) {
    return { handled: false };
  }

  // 如果不需要执行额外杀人（跳过环节），直接继续
  if (nightInfo.action === "skip" || nightInfo.guide?.includes("不会被唤醒")) {
    setSelectedActionTargets([]);
    continueToNextAction();
    return { handled: true };
  }

  // 必须恰好选择 1 名目标
  if (selectedTargets.length !== 1) {
    if (selectedTargets.length === 0) alert("教父必须选择一名玩家死亡");
    else alert("教父只能选择一名目标");
    return { handled: true, shouldWait: true };
  }

  const seatId = nightInfo.seat.id;
  const targetId = selectedTargets[0];
  const actorSeat = seats.find((s) => s.id === seatId);
  const targetSeat = seats.find((s) => s.id === targetId);

  if (!targetSeat || targetSeat.isDead) {
    return { handled: true, shouldWait: true };
  }

  setSelectedActionTargets([]);

  // 中毒/醉酒的教父：本次杀人无效（但仍视为“执行过一次唤醒”）
  const actorDisabled =
    nightInfo.isPoisoned ||
    !!actorSeat?.isDrunk ||
    actorSeat?.role?.id === "drunk";

  if (actorDisabled) {
    addLog(`${seatId + 1}号(教父) 处于中毒/醉酒状态，本夜额外杀人无效`);
    continueToNextAction();
    return { handled: true };
  }

  // 正常结算：先杀死第一名目标
  killPlayer(targetId, {
    source: "ability",
    recordNightDeath: true,
    onAfterKill: (latestSeats?: Seat[]) => {
      const finalSeats = latestSeats?.length ? latestSeats : seats;
      const finalTarget = finalSeats.find((s) => s.id === targetId);

      // 若目标实际上未死亡（被保护等），仅记录日志并结束
      if (!finalTarget || !finalTarget.isDead) {
        addLog(
          `${seatId + 1}号(教父) 选择${targetId + 1}号，但该玩家最终未死亡（可能被保护）`
        );
        continueToNextAction();
        return;
      }

      const isGoodTarget = !isEvil(finalTarget);
      addLog(
        `${seatId + 1}号(教父) 因白天外来者死亡，额外杀死 ${targetId + 1}号`
      );

      // 若目标不是善良，能力到此结束
      if (!isGoodTarget) {
        continueToNextAction();
        return;
      }

      // 杀死善良玩家 → 触发第二次额外杀人（说书人选择目标）
      setCurrentModal({
        type: "STORYTELLER_SELECT",
        data: {
          sourceId: seatId,
          roleId: "godfather",
          roleName: "教父",
          description:
            "👔 今日白天有外来者死亡，且你额外杀死了一名善良玩家。\n本夜你还可以令 1 名玩家死亡（请说书人选择目标）。",
          targetCount: 1,
          onConfirm: (secondTargets: number[]) => {
            const secondId = secondTargets[0];
            if (secondId === undefined) return;
            setCurrentModal(null);
            killPlayer(secondId, {
              source: "ability",
              recordNightDeath: true,
              onAfterKill: () => {
                addLog(
                  `${seatId + 1}号(教父) 因杀死善良玩家，本夜再次额外杀死 ${secondId + 1}号`
                );
                continueToNextAction();
              },
            });
          },
        },
      });
    },
  });

  return { handled: true, shouldWait: true };
}

/**
 * 小恶魔自杀确认处理（特殊：在 confirmKill 中调用）
 */
export function handleImpSuicide(
  impSeatId: number,
  targetId: number,
  context: {
    seats: Seat[];
    roles: Role[];
    setSeats: React.Dispatch<React.SetStateAction<Seat[]>>;
    setWakeQueueIds: React.Dispatch<React.SetStateAction<number[]>>;
    setDeadThisNight: React.Dispatch<React.SetStateAction<number[]>>;
    checkGameOver: (seats: Seat[], executedPlayerId?: number) => boolean;
    enqueueRavenkeeperIfNeeded: (targetId: number) => void;
    killPlayer: (targetId: number, options?: any) => void;
    addLogWithDeduplication: (
      msg: string,
      playerId: number,
      roleName: string
    ) => void;
    getRandom: <T>(arr: T[]) => T;
    // seatsRef removed (REFACTOR)
  }
): { handled: boolean; shouldContinue?: boolean } {
  // 只有小恶魔选择自己时才处理
  if (targetId !== impSeatId) {
    return { handled: false };
  }

  const {
    seats,
    roles,
    setSeats,
    setWakeQueueIds,
    setDeadThisNight,
    checkGameOver,
    enqueueRavenkeeperIfNeeded,
    killPlayer,
    addLogWithDeduplication,
    getRandom,
  } = context;

  // 找到所有活着的爪牙
  const aliveMinions = seats.filter(
    (s) => s.role?.type === "minion" && !s.isDead && s.id !== impSeatId
  );

  if (aliveMinions.length > 0) {
    // 随机选择一个爪牙作为新的小恶魔
    const newImp = getRandom(aliveMinions);
    const newImpRole = roles.find((r) => r.id === "imp");

    let updatedSeats: Seat[] = [];
    setSeats((p) => {
      updatedSeats = p.map((s) => {
        if (s.id === impSeatId) {
          // 原小恶魔死亡
          return { ...s, isDead: true };
        } else if (s.id === newImp.id) {
          // 新小恶魔标记为恶魔继任者更新角色为小恶魔添小恶魔传"标记
          const statusDetails = [...(s.statusDetails || []), "小恶魔传"];
          return {
            ...s,
            role: newImpRole || s.role,
            isDemonSuccessor: true,
            statusDetails: statusDetails,
          };
        }
        return s;
      });

      // 从唤醒队列中移除已死亡的原小恶魔
      setWakeQueueIds((prev) => prev.filter((id) => id !== impSeatId));

      return updatedSeats;
    });

    // 正常传位给爪牙小恶魔自杀时优先传位给爪牙不检查红唇女郎
    // 检查游戏结束不应该结束因为新小恶魔还在
    setTimeout(() => {
      const currentSeats = updatedSeats;
      checkGameOver(currentSeats);
    }, 0);

    addLogWithDeduplication(
      `${impSeatId + 1}号(小恶魔) 选择自己，身份转移给 ${newImp.id + 1}号(${newImp.role?.name})，${impSeatId + 1}号已在夜晚死亡`,
      impSeatId,
      "小恶魔"
    );

    // 显眼的高亮提示提醒说书人唤醒新恶魔玩家
    console.warn(
      "%c 重要提醒小恶魔传位成功 ",
      "color: #FFD700; font-size: 20px; font-weight: bold; background: #1a1a1a; padding: 10px; border: 3px solid #FFD700;"
    );
    console.warn(
      `%c请立即唤醒${newImp.id + 1}号玩家，向其出示"你是小恶魔"卡牌`,
      "color: #FF6B6B; font-size: 16px; font-weight: bold; background: #1a1a1a; padding: 8px;"
    );
    console.warn(
      "%c注意新恶魔今晚不行动从下一夜开始才会进入唤醒队列",
      "color: #4ECDC4; font-size: 14px; background: #1a1a1a; padding: 5px;"
    );

    // 记录原小恶魔的死亡
    setDeadThisNight((p) => [...p, impSeatId]);
    enqueueRavenkeeperIfNeeded(impSeatId);

    return { handled: true, shouldContinue: false };
  } else {
    // 如果没有活着的爪牙小恶魔自杀但无法传位直接死亡结算游戏
    addLogWithDeduplication(
      `${impSeatId + 1}号(小恶魔) 选择自己但场上无爪牙可传位，${impSeatId + 1}号直接死亡`,
      impSeatId,
      "小恶魔"
    );
    // 使用通用杀人流程触发死亡与游戏结束判定
    killPlayer(impSeatId, {
      onAfterKill: (latestSeats?: Seat[]) => {
        const finalSeats = latestSeats?.length ? latestSeats : seats;
        checkGameOver(finalSeats, impSeatId);
      },
    });

    return { handled: true, shouldContinue: false };
  }
}

/**
 * 普卡（Pukka）确认处理
 */
export function handlePukkaConfirm(
  context: RoleConfirmContext
): RoleConfirmResult {
  const {
    nightInfo,
    selectedTargets,
    setSeats,
    addLog,
    continueToNextAction,
    setPukkaPoisonQueue,
    addPoisonMark,
    setSelectedActionTargets,
  } = context;
  if (nightInfo.effectiveRole.id !== "pukka") return { handled: false };

  if (selectedTargets.length !== 1) {
    alert("普卡必须选择且仅选择一名玩家");
    return { handled: true, shouldWait: true };
  }

  const targetId = selectedTargets[0];
  const pukkaId = nightInfo.seat.id;

  // 1. 更新座位状态（中毒）
  setSeats((prev) =>
    prev.map((s) => {
      if (s.id === targetId) {
        const { statusDetails, statuses } = addPoisonMark(s, "pukka", "永久");
        return { ...s, isPoisoned: true, statusDetails, statuses };
      }
      return s;
    })
  );

  // 2. 加入 Pukka 死亡队列 (nightsUntilDeath: 1)
  setPukkaPoisonQueue((prev) => [...prev, { targetId, nightsUntilDeath: 1 }]);

  addLog(
    `❗ ${pukkaId + 1}号(普卡) 下毒 ${targetId + 1}号，目标将在明晚死亡并恢复健康`
  );
  setSelectedActionTargets([]);
  continueToNextAction();
  return { handled: true };
}

/**
 * 僵怖（Zombuul）确认处理
 */
export function handleZombuulConfirm(
  context: RoleConfirmContext
): RoleConfirmResult {
  const {
    nightInfo,
    selectedTargets,
    addLog,
    continueToNextAction,
    killPlayer,
    setSelectedActionTargets,
    todayExecutedId,
    nightCount,
  } = context;
  if (nightInfo.effectiveRole.id !== "zombuul") return { handled: false };

  console.log(
    "[DEBUG] handleZombuulConfirm - nightCount:",
    nightCount,
    "todayExecutedId:",
    todayExecutedId,
    "selectedTargets:",
    selectedTargets
  );

  // 僵怖首夜特殊处理：首夜醒来仅确认爪牙，不进行击杀
  if (nightCount === 1) {
    continueToNextAction();
    return { handled: true };
  }

  // 僵怖特殊顺位：只有在今天没有人被处决的情况下才能杀人
  if (todayExecutedId !== null) {
    addLog(`💤 今天有人被处决，${nightInfo.seat.id + 1}号(僵怖) 无法发动技能`);
    continueToNextAction();
    return { handled: true };
  }

  if (selectedTargets.length !== 1) {
    alert("僵怖必须选择且仅选择一名玩家");
    return { handled: true, shouldWait: true };
  }

  const targetId = selectedTargets[0];
  killPlayer(targetId, {
    source: "demon",
    onAfterKill: () => {
      addLog(`${nightInfo.seat.id + 1}号(僵怖) 杀死了 ${targetId + 1}号`);
    },
  });

  setSelectedActionTargets([]);
  continueToNextAction();
  return { handled: true };
}

/**
 * 杂耍艺人（Juggler）确认处理
 */
export function handleJugglerConfirm(
  context: RoleConfirmContext
): RoleConfirmResult {
  const {
    nightInfo,
    seats,
    jugglerGuesses,
    setCurrentModal,
    setSelectedActionTargets,
    continueToNextAction,
  } = context;
  if (nightInfo.effectiveRole.id !== "juggler") return { handled: false };

  const jugglerId = nightInfo.seat.id;
  const guesses = jugglerGuesses?.[jugglerId] || {};

  let correctCount = 0;
  Object.entries(guesses).forEach(([targetIdStr, guessedRoleId]) => {
    const targetId = parseInt(targetIdStr, 10);
    const targetSeat = seats.find((s) => s.id === targetId);
    if (targetSeat && targetSeat.role?.id === guessedRoleId) {
      correctCount++;
    }
  });

  setCurrentModal({
    type: "NIGHT_DEATH_REPORT",
    data: { message: `杂耍艺人信息：你猜对了 ${correctCount} 个角色` },
  });

  setSelectedActionTargets([]);
  continueToNextAction();
  return { handled: true, shouldWait: true };
}

/**
 * 亡骨魔（Vigormortis）确认处理
 */
export function handleVigormortisConfirm(
  context: RoleConfirmContext
): RoleConfirmResult {
  const {
    nightInfo,
    selectedTargets,
    setSeats,
    addLog,
    continueToNextAction,
    killPlayer,
    setSelectedActionTargets,
    getAliveNeighbors,
    addPoisonMark,
  } = context;
  if (
    nightInfo.effectiveRole.id !== "vigormortis" &&
    nightInfo.effectiveRole.id !== "vigormortis_mr"
  )
    return { handled: false };

  if (selectedTargets.length !== 1) {
    alert("亡骨魔必须选择且仅选择一名玩家");
    return { handled: true, shouldWait: true };
  }

  const targetId = selectedTargets[0];
  const vigormortisId = nightInfo.seat.id;

  killPlayer(targetId, {
    source: "demon",
    onAfterKill: (latestSeats: any) => {
      const targetSeat = latestSeats.find((s: any) => s.id === targetId);
      const isMinion = targetSeat?.role?.type === "minion";

      if (isMinion && targetSeat) {
        // 1. 爪牙保留能力
        setSeats((prev: any) =>
          prev.map((s: any) => {
            if (s.id === targetId) {
              return {
                ...s,
                hasAbilityEvenDead: true,
                statusDetails: [
                  ...(s.statusDetails || []),
                  "亡骨魔击杀（保留能力）",
                ],
              };
            }
            return s;
          })
        );

        // 2. 邻近镇民中毒
        const neighbors = getAliveNeighbors(latestSeats, targetId);
        const townsfolkNeighbors = neighbors.filter(
          (n: any) => n.role?.type === "townsfolk"
        );

        if (townsfolkNeighbors.length > 0) {
          const poisonedSeat = townsfolkNeighbors[0];
          const { statusDetails, statuses } = addPoisonMark(
            poisonedSeat,
            "vigormortis",
            "永久"
          );
          setSeats((prev: any) =>
            prev.map((s: any) => {
              if (s.id === poisonedSeat.id) {
                return { ...s, isPoisoned: true, statusDetails, statuses };
              }
              return s;
            })
          );
          addLog(
            `💀 ${vigormortisId + 1}号(亡骨魔) 杀死了爪牙 ${targetId + 1}号，使其保留能力，并导致邻居 ${poisonedSeat.id + 1}号 中毒`
          );
        } else {
          addLog(
            `💀 ${vigormortisId + 1}号(亡骨魔) 杀死了爪牙 ${targetId + 1}号，使其保留能力（未找到可中毒的邻居镇民）`
          );
        }
      } else {
        addLog(`💀 ${vigormortisId + 1}号(亡骨魔) 杀死了 ${targetId + 1}号`);
      }
    },
  });

  setSelectedActionTargets([]);
  continueToNextAction();
  return { handled: true };
}

/**
 * 巫婆 / 麻脸巫婆（Pit-Hag）确认处理
 */
export function handlePitHagConfirm(
  context: RoleConfirmContext
): RoleConfirmResult {
  const {
    nightInfo,
    selectedTargets,
    setSeats,
    roles,
    setCurrentModal,
    addLog,
    continueToNextAction,
    setSelectedActionTargets,
  } = context;
  if (
    nightInfo.effectiveRole.id !== "pit_hag" &&
    nightInfo.effectiveRole.id !== "pit_hag_mr"
  )
    return { handled: false };

  if (selectedTargets.length !== 1) {
    alert("巫婆必须选择且仅选择一名玩家进行变身");
    return { handled: true, shouldWait: true };
  }

  const targetId = selectedTargets[0];
  const pitHagId = nightInfo.seat.id;

  setCurrentModal({
    type: "ROLE_SELECT",
    data: {
      type: "pit_hag",
      targetId,
      onConfirm: (roleId: string) => {
        const selectedRole = roles.find((r) => r.id === roleId);
        if (!selectedRole) return;

        setSeats((prev: any) =>
          prev.map((s: any) => {
            if (s.id === targetId) {
              return {
                ...s,
                role: selectedRole,
                displayRole: selectedRole,
                statusDetails: [
                  ...(s.statusDetails || []),
                  `巫婆变身为${selectedRole.name}`,
                ],
              };
            }
            return s;
          })
        );

        addLog(
          `🧙‍♀️ ${pitHagId + 1}号(巫婆) 将 ${targetId + 1}号 变身为 【${selectedRole.name}】`
        );
        if (selectedRole.type === "demon") {
          addLog("⚠️ 警告：创造了新恶魔，请注意旧恶魔是否应依据规则在今晚死亡");
        }

        setSelectedActionTargets([]);
        continueToNextAction();
      },
    },
  });

  return { handled: true, shouldWait: true };
}

/**
 * 洗脑师（Cerenovus）确认处理
 */
export function handleCerenovusConfirm(
  context: RoleConfirmContext
): RoleConfirmResult {
  const {
    nightInfo,
    selectedTargets,
    setSeats,
    roles,
    setCurrentModal,
    addLog,
    continueToNextAction,
    setSelectedActionTargets,
  } = context;
  if (nightInfo.effectiveRole.id !== "cerenovus") return { handled: false };

  if (selectedTargets.length !== 1) {
    alert("洗脑师必须选择一名玩家");
    return { handled: true, shouldWait: true };
  }

  const targetId = selectedTargets[0];
  const cerenovusId = nightInfo.seat.id;

  setCurrentModal({
    type: "ROLE_SELECT",
    data: {
      type: "cerenovus",
      targetId,
      onConfirm: (roleId: string) => {
        const selectedRole = roles.find((r) => r.id === roleId);
        if (!selectedRole) return;

        setSeats((prev: any) =>
          prev.map((s: any) => {
            if (s.id === targetId) {
              return {
                ...s,
                isMad: true,
                statusDetails: [
                  ...(s.statusDetails || []),
                  `洗脑：我是${selectedRole.name}`,
                ],
              };
            }
            return s;
          })
        );

        addLog(
          `🧠 ${cerenovusId + 1}号(洗脑师) 使 ${targetId + 1}号 对自己是【${selectedRole.name}】感到疯狂`
        );
        setSelectedActionTargets([]);
        continueToNextAction();
      },
    },
  });

  return { handled: true, shouldWait: true };
}

/**
 * 诺-达（No-Dashii）确认处理
 */
export function handleNoDashiiConfirm(
  context: RoleConfirmContext
): RoleConfirmResult {
  const {
    nightInfo,
    selectedTargets,
    addLog,
    continueToNextAction,
    killPlayer,
    setSelectedActionTargets,
  } = context;
  if (nightInfo.effectiveRole.id !== "no_dashii") return { handled: false };

  if (selectedTargets.length !== 1) {
    alert("诺-达必须选择且仅选择一名玩家");
    return { handled: true, shouldWait: true };
  }

  const targetId = selectedTargets[0];
  killPlayer(targetId, {
    source: "demon",
    onAfterKill: () => {
      addLog(`🦠 ${nightInfo.seat.id + 1}号(诺-达) 杀死了 ${targetId + 1}号`);
    },
  });

  setSelectedActionTargets([]);
  continueToNextAction();
  return { handled: true };
}

/**
 * 魔鬼代言人（Devil's Advocate）确认处理
 */
export function handleDevilsAdvocateConfirm(
  context: RoleConfirmContext
): RoleConfirmResult {
  const {
    nightInfo,
    selectedTargets,
    setSeats,
    addLogWithDeduplication,
    continueToNextAction,
    setSelectedActionTargets,
    setCurrentModal,
  } = context;
  if (nightInfo.effectiveRole.id !== "devils_advocate")
    return { handled: false };

  if (selectedTargets.length !== 1) {
    alert("魔鬼代言人必须选择一名存活玩家进行保护");
    return { handled: true, shouldWait: true };
  }

  const targetId = selectedTargets[0];
  const daId = nightInfo.seat.id;
  const daSeat = context.seats.find((s) => s.id === daId);

  // 1. 检查是否连续两晚选择同一人
  const lastTargetMark = daSeat?.statusDetails?.find((d) =>
    d.includes("魔鬼代言人上夜选择：")
  );
  if (lastTargetMark) {
    const lastId = parseInt(
      lastTargetMark.replace("魔鬼代言人上夜选择：", ""),
      10
    );
    if (lastId === targetId) {
      alert("魔鬼代言人不能连续两个夜晚选择同一名玩家");
      return { handled: true, shouldWait: true };
    }
  }

  // 2. 更新座位状态
  setSeats((prev) =>
    prev.map((s) => {
      // 清除该DA之前的"上夜选择"标记 (如果有多个DA，这里逻辑可能需要更精细，但在标准对局中足够)
      let nextSeat = s;

      // 如果是DA本人，记录本次选择供明晚校验
      if (s.id === daId) {
        const filteredDetails = (s.statusDetails || []).filter(
          (d) => !d.includes("魔鬼代言人上夜选择：")
        );
        nextSeat = {
          ...s,
          statusDetails: [
            ...filteredDetails,
            `魔鬼代言人上夜选择：${targetId}`,
          ],
        };
      }

      // 如果是目标玩家，施加保护
      if (s.id === targetId) {
        const filteredDetails = (nextSeat.statusDetails || []).filter(
          (d) => !d.includes("处决保护")
        );
        const nextStatuses = (nextSeat.statuses || []).filter(
          (st) => st.effect !== "ExecutionProof"
        );

        nextSeat = {
          ...nextSeat,
          statusDetails: [...filteredDetails, "处决保护（下个黄昏清除）"],
          statuses: [
            ...nextStatuses,
            { effect: "ExecutionProof", duration: "1 Day" },
          ],
        };
      }

      return nextSeat;
    })
  );

  addLogWithDeduplication(
    `${daId + 1}号(魔鬼代言人) 保护了 ${targetId + 1}号，其在明日处决中不会死亡`,
    daId,
    "魔鬼代言人"
  );

  setCurrentModal(null);
  setSelectedActionTargets([]);
  continueToNextAction();
  return { handled: true };
}

/**
 * 下毒行动执行函数
 */
export function executePoisonAction(
  targetId: number,
  _isEvil: boolean,
  context: {
    nightInfo: NightInfoResult;
    seats: Seat[];
    setSeats: React.Dispatch<React.SetStateAction<Seat[]>>;
    setCurrentModal: (modal: any) => void;
    setSelectedActionTargets: (targets: number[]) => void;
    continueToNextAction: () => void;
    isActorDisabledByPoisonOrDrunk: (
      seat: Seat | undefined,
      isPoisoned: boolean
    ) => boolean;
    addLogWithDeduplication: (
      msg: string,
      playerId?: number,
      roleName?: string
    ) => void;
    addPoisonMark: (seat: Seat, type: any, time: string) => any;
    computeIsPoisoned: (seat: Seat, seats: Seat[]) => boolean;
  }
) {
  const {
    nightInfo,
    seats,
    setSeats,
    continueToNextAction,
    isActorDisabledByPoisonOrDrunk,
    addLogWithDeduplication,
    addPoisonMark,
  } = context;

  const actorId = nightInfo?.seat?.id;
  const actorSeat =
    actorId !== undefined ? seats.find((s) => s.id === actorId) : undefined;
  if (
    isActorDisabledByPoisonOrDrunk(actorSeat, nightInfo?.isPoisoned ?? false)
  ) {
    addLogWithDeduplication(
      `${(actorId ?? 0) + 1}号(${nightInfo?.effectiveRole?.name ?? "未知"}) 处于中毒/醉酒状态，下毒失效`,
      actorId,
      nightInfo?.effectiveRole?.name
    );
    continueToNextAction();
    return;
  }

  setSeats((prev: any) =>
    prev.map((s: any) => {
      if (s.id === targetId) {
        const { statusDetails, statuses } = addPoisonMark(
          s,
          "poisoner",
          "永久"
        );
        return { ...s, isPoisoned: true, statusDetails, statuses };
      }
      return s;
    })
  );

  addLogWithDeduplication(
    `${(actorId ?? 0) + 1}号(${nightInfo?.effectiveRole?.name ?? "未知"}) 使 ${targetId + 1}号 中毒`,
    actorId,
    nightInfo?.effectiveRole?.name
  );
  continueToNextAction();
}

/**
 * 下毒者确认处理
 */
export function handlePoisonerConfirm(
  context: RoleConfirmContext
): RoleConfirmResult {
  const { nightInfo, selectedTargets } = context;
  if (nightInfo.effectiveRole.id !== "poisoner") return { handled: false };

  if (selectedTargets.length !== 1) {
    alert("下毒者必须选择一名玩家");
    return { handled: true, shouldWait: true };
  }

  // 真正的执行由 executePoisonAction 处理（由 useExecutionHandlers 调用）
  return { handled: false };
}

/**
 * 角色确认处理函数映射表
 */
export const roleConfirmHandlers: Record<
  string,
  (context: RoleConfirmContext) => RoleConfirmResult
> = {
  professor_mr: handleProfessorConfirm,
  ranger: handleRangerConfirm,
  shabaloth: handleShabalothConfirm,
  po: handlePoConfirm,

  assassin: handleAssassinConfirm,
  godfather: handleGodfatherConfirm,

  poisoner: handlePoisonerConfirm,
  pukka: handlePukkaConfirm,

  zombuul: handleZombuulConfirm,
  juggler: handleJugglerConfirm,
  professor: handleProfessorConfirm,
  vigormortis: handleVigormortisConfirm,
  vigormortis_mr: handleVigormortisConfirm,
  pit_hag: handlePitHagConfirm,
  pit_hag_mr: handlePitHagConfirm,
  cerenovus: handleCerenovusConfirm,
  no_dashii: handleNoDashiiConfirm,
  devils_advocate: handleDevilsAdvocateConfirm,
};

/**
 * 获取角色的确认处理函数
 */
export function getRoleConfirmHandler(
  roleId: string
): ((context: RoleConfirmContext) => RoleConfirmResult) | null {
  return roleConfirmHandlers[roleId] || null;
}

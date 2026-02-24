/**
 * 角色特定行动处理函数
 * 将角色特定的确认逻辑从 useGameController 中分离出来
 */

import React from "react";
import { Seat, GamePhase, Role } from "../../app/data";
import { NightInfoResult } from "../types/game";
import { ModalType } from "../types/modal";
import { isAntagonismEnabled, checkCannotCreate } from "../utils/antagonism";
import { getRandom, getRegistration } from "../utils/gameRules";


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
  cleanseSeatStatuses: (seat: Seat, options?: { keepDeathState?: boolean }) => Seat;
  insertIntoWakeQueueAfterCurrent: (seatId: number, opts?: { roleOverride?: Role | null; logLabel?: string }) => void;
  continueToNextAction: () => void;
  addLog: (message: string) => void;
  killPlayer: (targetId: number, options?: any) => void;
  hasUsedAbility: (roleId: string, seatId: number) => boolean;
  markAbilityUsed: (roleId: string, seatId: number) => void;
  reviveSeat: (seat: Seat) => Seat;
  setPukkaPoisonQueue: React.Dispatch<React.SetStateAction<Array<{ targetId: number; nightsUntilDeath: number }>>>;
  setDeadThisNight: React.Dispatch<React.SetStateAction<number[]>>;
  poChargeState: Record<number, boolean>;
  setPoChargeState: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
  addDrunkMark: (seat: Seat, drunkType: 'sweetheart' | 'goon' | 'sailor' | 'innkeeper' | 'courtier' | 'philosopher' | 'minstrel', clearTime: string) => { statusDetails: string[]; statuses: any[] };
  addPoisonMark: (seat: Seat, poisonType: 'permanent' | 'vigormortis' | 'pukka' | 'poisoner' | 'poisoner_mr' | 'no_dashii' | 'cannibal' | 'snake_charmer', clearTime: string) => { statusDetails: string[]; statuses: any[] };
  isEvil: (seat: Seat) => boolean;
  todayDemonVoted: boolean;
  todayMinionNominated: boolean;
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
 * 投毒者确认处理（检查是否需要弹窗）
 */
export function handlePoisonerConfirm(context: RoleConfirmContext): RoleConfirmResult {
  const { nightInfo, seats, selectedTargets, setCurrentModal, isEvil } = context;
  const roleId = nightInfo.effectiveRole.id;
  const isPoisoner = roleId === 'poisoner' || roleId === 'poisoner_mr';

  if (!isPoisoner) {
    return { handled: false };
  }

  // 校验：必须选择且仅选择一名玩家
  if (selectedTargets.length === 0) {
    alert("请选择一名玩家进行下毒");
    return { handled: true, shouldWait: true }; // 阻止后续逻辑，停留在当前步骤
  }

  if (selectedTargets.length > 1) {
    alert("投毒者每晚只能选择一名玩家，请取消多余的选择");
    return { handled: true, shouldWait: true }; // 阻止后续逻辑
  }

  const targetId = selectedTargets[0];
  const targetSeat = seats.find(s => s.id === targetId);

  if (targetSeat && !targetSeat.isDead) {
    // 投毒者选择邪恶目标需要特殊确认
    if (roleId === 'poisoner' && isEvil(targetSeat)) {
      setCurrentModal({ type: 'POISON_EVIL_CONFIRM', data: { targetId } });
      return { handled: true, shouldWait: true };
    }
    // 其他情况显示普通确认弹窗
    setCurrentModal({ type: 'POISON_CONFIRM', data: { targetId } });
    return { handled: true, shouldWait: true };
  }

  // 如果选中了已死亡玩家（理论上不应发生，因为UI层应限制，但做个保底）
  if (targetSeat?.isDead) {
    alert("无法对已死亡的玩家下毒");
    return { handled: true, shouldWait: true };
  }

  return { handled: false };
}

/**
 * 投毒者执行下毒（确认弹窗后的执行逻辑）
 */
export function executePoisonAction(
  targetId: number,
  isEvilTarget: boolean,
  context: {
    nightInfo: NightInfoResult;
    seats: Seat[];
    setSeats: React.Dispatch<React.SetStateAction<Seat[]>>;
    setCurrentModal: React.Dispatch<React.SetStateAction<ModalType>>;
    setSelectedActionTargets: React.Dispatch<React.SetStateAction<number[]>>;
    continueToNextAction: () => void;
    isActorDisabledByPoisonOrDrunk: (seat: Seat | undefined, knownIsPoisoned?: boolean) => boolean;
    addLogWithDeduplication: (msg: string, playerId: number, roleName: string) => void;
    addPoisonMark: (seat: Seat, poisonType: 'permanent' | 'vigormortis' | 'pukka' | 'poisoner' | 'poisoner_mr' | 'no_dashii' | 'cannibal' | 'snake_charmer', clearTime: string) => { statusDetails: string[]; statuses: any[] };
    computeIsPoisoned: (seat: Seat) => boolean;
  }
): void {
  const {
    nightInfo,
    seats,
    setSeats,
    setCurrentModal,
    setSelectedActionTargets,
    continueToNextAction,
    isActorDisabledByPoisonOrDrunk,
    addLogWithDeduplication,
    addPoisonMark,
    computeIsPoisoned
  } = context;

  if (!nightInfo || targetId === null) return;

  // 如果投毒者本身中毒/醉酒则本次下毒应视为无事发生
  const actorSeat = seats.find(s => s.id === nightInfo?.seat?.id);
  if (isActorDisabledByPoisonOrDrunk(actorSeat, nightInfo.isPoisoned)) {
    addLogWithDeduplication(
      `${nightInfo.seat.id + 1}号(投毒者) 处于中毒/醉酒状态，本夜对${targetId + 1}号${isEvilTarget ? '(队友)' : ''}的下毒无效，无事发生`,
      nightInfo.seat.id,
      '投毒者'
    );
    setCurrentModal(null);
    setSelectedActionTargets([]);
    continueToNextAction();
    return;
  }

  // 注意保留永久中毒标记舞蛇人制造和亡骨魔中毒标记
  setSeats(p => p.map(s => {
    if (s.id === targetId) {
      // 投毒者当晚和明天白天中毒在次日黄昏清除
      const clearTime = '次日黄昏';
      const roleId = nightInfo.effectiveRole.id;
      const { statusDetails, statuses } = addPoisonMark(s,
        roleId === 'poisoner_mr' ? 'poisoner_mr' : 'poisoner',
        clearTime
      );
      const nextSeat = { ...s, statusDetails, statuses };
      return { ...nextSeat, isPoisoned: computeIsPoisoned(nextSeat) };
    }
    return { ...s, isPoisoned: computeIsPoisoned(s) };
  }));

  addLogWithDeduplication(
    `${nightInfo.seat.id + 1}号(投毒者) 对 ${targetId + 1}号${isEvilTarget ? '(队友)' : ''}下毒`,
    nightInfo.seat.id,
    '投毒者'
  );

  setCurrentModal(null);
  setSelectedActionTargets([]);
  continueToNextAction();
}

/**
 * 麻脸巫婆确认处理
 */
export function handlePitHagConfirm(context: RoleConfirmContext): RoleConfirmResult {
  const {
    nightInfo,
    seats,
    selectedTargets,
    currentModal,
    setCurrentModal,
    setSeats,
    cleanseSeatStatuses,
    getSeatRoleId,
    roles,
    insertIntoWakeQueueAfterCurrent,
    setSelectedActionTargets,
    continueToNextAction,
    addLog
  } = context;

  if (nightInfo.effectiveRole.id !== 'pit_hag_mr') {
    return { handled: false };
  }

  if (selectedTargets.length !== 1) {
    if (selectedTargets.length === 0) alert("请选择一名目标玩家");
    else alert("麻脸巫婆每晚只能选择一名目标，请取消多余的选择");
    return { handled: true, shouldWait: true };
  }

  const targetId = selectedTargets[0];

  // 检查当前是否有 Pit-Hag modal，如果没有则创建
  const pitHagModal = currentModal?.type === 'PIT_HAG' ? currentModal.data : null;

  if (!pitHagModal) {
    setCurrentModal({ type: 'PIT_HAG', data: { targetId, roleId: null } });
    return { handled: true, shouldWait: true };
  }

  if (!pitHagModal.roleId) {
    return { handled: true, shouldWait: true };
  }

  const targetSeat = seats.find(s => s.id === targetId);
  const newRole = roles.find(r => r.id === pitHagModal.roleId);

  if (!targetSeat || !newRole) {
    return { handled: true, shouldWait: true };
  }

  // 相克规则：灯神在场时，麻脸巫婆“创造/变身”需遵守相克限制（例如无法创造某些角色、互斥同场）
  if (isAntagonismEnabled(seats)) {
    const decision = checkCannotCreate({
      seats,
      creatorRoleId: nightInfo.effectiveRole.id,
      createdRoleId: newRole.id,
      roles,
    });
    if (!decision.allowed) {
      alert(decision.reason);
      return { handled: true, shouldWait: true };
    }
  }

  // 不能变成场上已存在的角色
  const roleAlreadyInPlay = seats.some(s => getSeatRoleId(s) === newRole.id);
  if (roleAlreadyInPlay) {
    alert('该角色已在场上，无法变身为已存在角色');
    return { handled: true, shouldWait: true };
  }

  setSeats(prev => prev.map(s => {
    if (s.id !== targetId) return s;
    const cleaned = cleanseSeatStatuses({
      ...s,
      isDemonSuccessor: false,
      isZombuulTrulyDead: s.isZombuulTrulyDead,
    }, { keepDeathState: true });
    const nextSeat = { ...cleaned, role: newRole, charadeRole: null };
    if (s.hasAbilityEvenDead) {
      addLog(`${s.id + 1}号因亡骨魔获得的"死而有能"效果在变身${newRole.name} 时已失效`);
    }
    return nextSeat;
  }));

  const createdNewDemon = newRole.type === 'demon' && targetSeat?.role?.type !== 'demon';
  if (createdNewDemon) {
    const seatId = nightInfo?.seat?.id ?? 0;
    addLog(`${seatId + 1}号(麻脸巫婆) ${targetId + 1}号变为恶魔，今晚的死亡由说书人决定`);
  } else {
    const seatId = nightInfo?.seat?.id ?? 0;
    addLog(`${seatId + 1}号(麻脸巫婆) ${targetId + 1}号变为 ${newRole?.name ?? ''}`);
  }

  insertIntoWakeQueueAfterCurrent(targetId, { roleOverride: newRole, logLabel: `${targetId + 1}号(${newRole.name})` });

  setCurrentModal(null);
  setSelectedActionTargets([]);

  if (createdNewDemon) {
    setCurrentModal({ type: 'STORYTELLER_DEATH', data: { sourceId: targetId } });
    return { handled: true, shouldWait: true };
  }

  continueToNextAction();
  return { handled: true };
}

/**
 * 教授确认处理
 */
export function handleProfessorConfirm(context: RoleConfirmContext): RoleConfirmResult {
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
    addLog
  } = context;

  if (nightInfo.effectiveRole.id !== 'professor_mr' || gamePhase === 'firstNight') {
    return { handled: false };
  }

  const seatId = nightInfo?.seat?.id ?? 0;

  if (hasUsedAbility('professor_mr', seatId)) {
    continueToNextAction();
    return { handled: true };
  }

  const availableReviveTargets = seats.filter(s => {
    const r = s.role?.id === 'drunk' ? s.charadeRole : s.role;
    return s.isDead && r && r.type === 'townsfolk' && !s.isDemonSuccessor;
  });

  if (availableReviveTargets.length === 0) {
    addLog(`${seatId + 1}号(教授) 无可复活的镇民，跳过`);
    continueToNextAction();
    return { handled: true };
  }

  if (selectedTargets.length !== 1) {
    if (selectedTargets.length === 0) alert("请选择一名死亡的镇民复活（或点击确认跳过）");
    else alert("教授每晚只能选择一名目标，请取消多余的选择");
    return { handled: true, shouldWait: true };
  }

  const targetId = selectedTargets[0];
  const targetSeat = seats.find(s => s.id === targetId);

  if (!targetSeat || !targetSeat.isDead) {
    return { handled: true, shouldWait: true };
  }

  const targetRole = targetSeat.role?.id === 'drunk' ? targetSeat.charadeRole : targetSeat.role;
  if (!targetRole || targetSeat.isDemonSuccessor || targetRole.type !== 'townsfolk') {
    alert('教授只能复活死亡的镇民');
    return { handled: true, shouldWait: true };
  }

  const hadEvenDead = !!targetSeat.hasAbilityEvenDead;

  setSeats(prev => prev.map(s => {
    if (s.id !== targetId) return s;
    return reviveSeat({
      ...s,
      isEvilConverted: false,
      isZombuulTrulyDead: s.isZombuulTrulyDead,
    });
  }));

  setPukkaPoisonQueue(prev => prev.filter(entry => entry.targetId !== targetId));
  setDeadThisNight(prev => prev.filter(id => id !== targetId));
  addLog(`${seatId + 1}号(教授) 复活${targetId + 1}号`);

  if (hadEvenDead) {
    addLog(`${targetId + 1}号此前因亡骨魔获得的"死而有能"效果随着复活已失效`);
  }

  markAbilityUsed('professor_mr', seatId);
  setSelectedActionTargets([]);
  insertIntoWakeQueueAfterCurrent(targetId, { logLabel: `${targetId + 1}号(复活)` });
  continueToNextAction();
  return { handled: true };
}

/**
 * 巡山人确认处理
 */
export function handleRangerConfirm(context: RoleConfirmContext): RoleConfirmResult {
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
    addLog
  } = context;

  if (nightInfo.effectiveRole.id !== 'ranger' || gamePhase === 'firstNight') {
    return { handled: false };
  }

  const seatId = nightInfo?.seat?.id ?? 0;

  if (hasUsedAbility('ranger', seatId)) {
    continueToNextAction();
    return { handled: true };
  }

  if (selectedTargets.length !== 1) {
    if (selectedTargets.length === 0) alert("请选择一名目标玩家");
    else alert("巡山人每晚只能选择一名目标");
    return { handled: true, shouldWait: true };
  }

  const targetId = selectedTargets[0];
  const targetSeat = seats.find(s => s.id === targetId);

  if (!targetSeat || targetSeat.isDead) {
    return { handled: true, shouldWait: true };
  }

  const targetRoleId = getSeatRoleId(targetSeat);
  markAbilityUsed('ranger', seatId);
  setSelectedActionTargets([]);

  if (targetRoleId !== 'damsel') {
    addLog(`${seatId + 1}号(巡山人) 选择${targetId + 1}号，但未命中落难少女`);
    continueToNextAction();
    return { handled: true };
  }

  setCurrentModal({ type: 'RANGER', data: { targetId, roleId: null } });
  return { handled: true, shouldWait: true };
}

/**
 * 沙巴洛斯确认处理
 */
export function handleShabalothConfirm(context: RoleConfirmContext): RoleConfirmResult {
  const {
    nightInfo,
    selectedTargets,
    gamePhase,
    setSelectedActionTargets,
    killPlayer,
    continueToNextAction,
    addLog
  } = context;

  if (nightInfo.effectiveRole.id !== 'shabaloth' || gamePhase === 'firstNight') {
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
          addLog(`${seatId + 1}号(沙巴洛斯) 杀死了 ${targets.map(x => `${x + 1}号`).join('、')}，本工具暂未实现其复活效果，请说书人按规则手动裁定是否复活`);
          continueToNextAction();
        }
      }
    });
  });

  return { handled: true, shouldWait: true };
}

/**
 * 珀确认处理
 */
export function handlePoConfirm(context: RoleConfirmContext): RoleConfirmResult {
  const {
    nightInfo,
    selectedTargets,
    gamePhase,
    poChargeState,
    setPoChargeState,
    setSelectedActionTargets,
    killPlayer,
    continueToNextAction,
    addLog
  } = context;

  if (nightInfo.effectiveRole.id !== 'po' || gamePhase === 'firstNight') {
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
      setPoChargeState(prev => ({ ...prev, [seatId]: true }));
      addLog(`${seatId + 1}号(珀) 本夜未杀人，蓄力一次，下一个夜晚将爆发杀 3 人`);
      continueToNextAction();
      return { handled: true };
    }

    const targetId = uniqueTargets[0];
    setPoChargeState(prev => ({ ...prev, [seatId]: false }));
    setSelectedActionTargets([]);
    killPlayer(targetId, {
      onAfterKill: () => {
        addLog(`${seatId + 1}号(珀) 杀死了 ${targetId + 1}号`);
        continueToNextAction();
      }
    });
    return { handled: true, shouldWait: true };
  }

  // 已蓄力必须选择3名不同目标本夜爆发杀 3
  if (uniqueTargets.length !== 3) {
    alert("已蓄力！必须选择 3 名不同的目标");
    return { handled: true, shouldWait: true };
  }

  setPoChargeState(prev => ({ ...prev, [seatId]: false }));
  setSelectedActionTargets([]);

  let remaining = uniqueTargets.length;
  uniqueTargets.forEach((tid, idx) => {
    killPlayer(tid, {
      skipGameOverCheck: idx < uniqueTargets.length - 1,
      onAfterKill: () => {
        remaining -= 1;
        if (remaining === 0) {
          addLog(`${seatId + 1}号(珀) 爆发杀死了 ${uniqueTargets.map(x => `${x + 1}号`).join('、')}`);
          continueToNextAction();
        }
      }
    });
  });

  return { handled: true, shouldWait: true };
}

/**
 * 旅店老板确认处理
 */
export function handleInnkeeperConfirm(context: RoleConfirmContext): RoleConfirmResult {
  const {
    nightInfo,
    seats,
    selectedTargets,
    gamePhase,
    setSelectedActionTargets,
    setSeats,
    addDrunkMark,
    continueToNextAction,
    addLog
  } = context;

  if (nightInfo.effectiveRole.id !== 'innkeeper' || gamePhase === 'firstNight') {
    return { handled: false };
  }

  if (selectedTargets.length !== 2) {
    if (selectedTargets.length < 2) alert("请选择两名玩家进行保护");
    else alert("旅店老板每晚必须选择恰好两名目标");
    return { handled: true, shouldWait: true };
  }

  const [aId, bId] = selectedTargets;
  setSelectedActionTargets([]);
  const drunkTargetId = Math.random() < 0.5 ? aId : bId;

  setSeats(prev => prev.map(s => {
    if (s.id === aId || s.id === bId) {
      const seatId = nightInfo?.seat?.id ?? 0;
      const base = { ...s, isProtected: true, protectedBy: seatId };
      if (s.id === drunkTargetId) {
        const clearTime = '次日黄昏';
        const { statusDetails, statuses } = addDrunkMark(base, 'innkeeper', clearTime);
        const nextSeat = { ...base, statusDetails, statuses };
        return { ...nextSeat, isDrunk: true };
      }
      return base;
    }
    return s;
  }));

  const seatId = nightInfo?.seat?.id ?? 0;
  addLog(`${seatId + 1}号(旅店老板) 今晚保护${aId + 1}号、${bId + 1}号，他们不会被恶魔杀死，其中一人醉酒到下个黄昏，信息可能错误`);
  continueToNextAction();
  return { handled: true };
}

/**
 * 水手确认处理（黯月初升）
 * 规则要点：
 * - 每晚选择 1 名存活玩家：水手或目标其中一人醉酒到下个黄昏
 * - 水手健康时不会死亡（免死链路在 killPlayer 里统一处理）
 */
export function handleSailorConfirm(context: RoleConfirmContext): RoleConfirmResult {
  const {
    nightInfo,
    selectedTargets,
    gamePhase,
    setSelectedActionTargets,
    setSeats,
    addDrunkMark,
    continueToNextAction,
    addLog,
  } = context;

  if (nightInfo.effectiveRole.id !== 'sailor' || gamePhase === 'firstNight') {
    return { handled: false };
  }

  if (selectedTargets.length !== 1) {
    if (selectedTargets.length === 0) alert("请选择一名存活玩家");
    else alert("水手每晚只能选择一名目标");
    return { handled: true, shouldWait: true };
  }

  const targetId = selectedTargets[0];
  const sailorId = nightInfo.seat.id;
  setSelectedActionTargets([]);

  // 随机决定谁醉（由说书人裁定为“随机”）
  const drunkSeatId = Math.random() < 0.5 ? sailorId : targetId;
  const clearTime = '下个黄昏';

  setSeats(prev => prev.map(s => {
    if (s.id !== drunkSeatId) return s;
    const { statusDetails, statuses } = addDrunkMark(s, 'sailor', clearTime);
    return { ...s, statusDetails, statuses, isDrunk: true };
  }));

  addLog(`🍺 ${sailorId + 1}号(水手) 选择了 ${targetId + 1}号：水手或目标之一醉酒直到下个黄昏（随机裁定），信息可能错误`);
  continueToNextAction();
  return { handled: true };
}

/**
 * 侍臣确认处理（黯月初升）
 * - 每局限一次：选择一个“角色”
 * - 若该角色在场，则其中一名该角色玩家从当晚开始醉酒 3 天 3 夜
 *
 * 说明：因为目标类型是“角色”而非“座位”，这里使用弹窗让说书人选择角色。
 */
export function handleCourtierConfirm(context: RoleConfirmContext): RoleConfirmResult {
  const {
    nightInfo,
    seats,
    roles,
    selectedTargets,
    gamePhase,
    hasUsedAbility,
    markAbilityUsed,
    setCurrentModal,
    setSelectedActionTargets,
    setSeats,
    continueToNextAction,
    addLog,
  } = context;

  if (nightInfo.effectiveRole.id !== 'courtier' || gamePhase === 'firstNight') {
    return { handled: false };
  }

  const courtierSeatId = nightInfo.seat.id;
  if (hasUsedAbility('courtier', courtierSeatId)) {
    addLog(`👑 ${courtierSeatId + 1}号(侍臣) 已使用过能力，本夜跳过`);
    setSelectedActionTargets([]);
    continueToNextAction();
    return { handled: true };
  }

  // 侍臣不走“点座位选择”，直接弹窗选角色
  if (selectedTargets.length === 0) {
    setCurrentModal({
      type: 'COURTIER_SELECT_ROLE',
      data: {
        sourceId: courtierSeatId,
        roles,
        seats,
        onConfirm: (roleId: string) => {
          setCurrentModal(null);
          setSelectedActionTargets([]);

          const chosenRole = roles.find(r => r.id === roleId);
          // 先消耗能力（规则对齐：无论选中是否在场，都视为已用）
          markAbilityUsed('courtier', courtierSeatId);

          // 找到在场的该角色玩家（默认取第一位存活的）
          const targetSeat = seats.find(s =>
            !s.isDead &&
            (s.role?.id === roleId || (s.role?.id === 'drunk' && s.charadeRole?.id === roleId))
          );

          if (!targetSeat) {
            addLog(`👑 ${courtierSeatId + 1}号(侍臣) 选择了【${chosenRole?.name || roleId}】，但该角色不在场（能力已消耗）`);
            continueToNextAction();
            return;
          }

          // 从当晚开始醉酒 3 天 3 夜：在 enterDuskPhase 里每个黄昏递减 remainingDays
          setSeats(prev => prev.map(s => {
            if (s.id !== targetSeat.id) return s;
            const nextStatuses = [...(s.statuses || []), { effect: 'Drunk', duration: '侍臣3天3夜', sourceId: courtierSeatId, remainingDays: 3 }];
            const nextDetails = Array.from(new Set([...(s.statusDetails || []), `侍臣致醉：${chosenRole?.name || roleId}（3天3夜）`]));
            return { ...s, statuses: nextStatuses, statusDetails: nextDetails, isDrunk: true };
          }));

          addLog(`👑 ${courtierSeatId + 1}号(侍臣) 选择【${chosenRole?.name || roleId}】：${targetSeat.id + 1}号从当晚开始醉酒 3 天 3 夜`);
          continueToNextAction();
        },
        onCancel: () => {
          setCurrentModal(null);
          setSelectedActionTargets([]);
          addLog(`👑 ${courtierSeatId + 1}号(侍臣) 取消本夜能力（不消耗）`);
          continueToNextAction();
        },
      },
    });
    return { handled: true, shouldWait: true };
  }

  // 理论上不会走到这里（因为侍臣不需要点座位）
  setSelectedActionTargets([]);
  continueToNextAction();
  return { handled: true };
}

/**
 * 刺客确认处理（黯月初升）
 * 规则要点：
 * - 每局限一次，可选择 0（不使用）或 1 名玩家（使用并立即击杀）
 * - 若刺客中毒/醉酒，本次击杀无效，但仍视为“已用过能力”（失去能力）
 * - 刺客击杀可无视“不会死亡”类保护（在 killPlayer 中针对 tea_lady 做了例外放行）
 */
export function handleAssassinConfirm(context: RoleConfirmContext): RoleConfirmResult {
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

  if (nightInfo.effectiveRole.id !== 'assassin' || gamePhase === 'firstNight') {
    return { handled: false };
  }

  const seatId = nightInfo.seat.id;

  // 已用过能力：直接跳过
  if (hasUsedAbility('assassin', seatId)) {
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
  markAbilityUsed('assassin', seatId);

  const actorSeat = seats.find((s) => s.id === seatId);
  const actorDisabled =
    nightInfo.isPoisoned || !!actorSeat?.isDrunk || actorSeat?.role?.id === 'drunk';

  if (actorDisabled) {
    addLog(`${seatId + 1}号(刺客) 处于中毒/醉酒状态，本夜刺杀无效，但能力已消耗`);
    continueToNextAction();
    return { handled: true };
  }

  killPlayer(targetId, {
    source: 'ability',
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
export function handleGodfatherConfirm(context: RoleConfirmContext): RoleConfirmResult {
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

  if (nightInfo.effectiveRole.id !== 'godfather' || gamePhase === 'firstNight') {
    return { handled: false };
  }

  // 如果不需要执行额外杀人（跳过环节），直接继续
  if (nightInfo.action === 'skip' || nightInfo.guide?.includes('不会被唤醒')) {
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
  const actorSeat = seats.find(s => s.id === seatId);
  const targetSeat = seats.find(s => s.id === targetId);

  if (!targetSeat || targetSeat.isDead) {
    return { handled: true, shouldWait: true };
  }

  setSelectedActionTargets([]);

  // 中毒/醉酒的教父：本次杀人无效（但仍视为“执行过一次唤醒”）
  const actorDisabled =
    nightInfo.isPoisoned || !!actorSeat?.isDrunk || actorSeat?.role?.id === 'drunk';

  if (actorDisabled) {
    addLog(`${seatId + 1}号(教父) 处于中毒/醉酒状态，本夜额外杀人无效`);
    continueToNextAction();
    return { handled: true };
  }

  // 正常结算：先杀死第一名目标
  killPlayer(targetId, {
    source: 'ability',
    recordNightDeath: true,
    onAfterKill: (latestSeats?: Seat[]) => {
      const finalSeats = latestSeats && latestSeats.length ? latestSeats : seats;
      const finalTarget = finalSeats.find(s => s.id === targetId);

      // 若目标实际上未死亡（被保护等），仅记录日志并结束
      if (!finalTarget || !finalTarget.isDead) {
        addLog(`${seatId + 1}号(教父) 选择${targetId + 1}号，但该玩家最终未死亡（可能被保护）`);
        continueToNextAction();
        return;
      }

      const isGoodTarget = !isEvil(finalTarget);
      addLog(`${seatId + 1}号(教父) 因白天外来者死亡，额外杀死 ${targetId + 1}号`);

      // 若目标不是善良，能力到此结束
      if (!isGoodTarget) {
        continueToNextAction();
        return;
      }

      // 杀死善良玩家 → 触发第二次额外杀人（说书人选择目标）
      setCurrentModal({
        type: 'STORYTELLER_SELECT',
        data: {
          sourceId: seatId,
          roleId: 'godfather',
          roleName: '教父',
          description:
            '👔 今日白天有外来者死亡，且你额外杀死了一名善良玩家。\n本夜你还可以令 1 名玩家死亡（请说书人选择目标）。',
          targetCount: 1,
          onConfirm: (secondTargets: number[]) => {
            const secondId = secondTargets[0];
            if (secondId === undefined) return;
            setCurrentModal(null);
            killPlayer(secondId, {
              source: 'ability',
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
    addLogWithDeduplication: (msg: string, playerId: number, roleName: string) => void;
    getRandom: <T>(arr: T[]) => T;
    seatsRef: React.MutableRefObject<Seat[]>;
  }
): { handled: boolean; shouldContinue?: boolean } {
  // 只有小恶魔选择自己时才处理
  if (targetId !== impSeatId) {
    return { handled: false };
  }

  const { seats, roles, setSeats, setWakeQueueIds, setDeadThisNight, checkGameOver, enqueueRavenkeeperIfNeeded, killPlayer, addLogWithDeduplication, getRandom, seatsRef } = context;

  // 找到所有活着的爪牙
  const aliveMinions = seats.filter(s =>
    s.role?.type === 'minion' &&
    !s.isDead &&
    s.id !== impSeatId
  );

  if (aliveMinions.length > 0) {
    // 随机选择一个爪牙作为新的小恶魔
    const newImp = getRandom(aliveMinions);
    const newImpRole = roles.find(r => r.id === 'imp');

    let updatedSeats: Seat[] = [];
    setSeats(p => {
      updatedSeats = p.map(s => {
        if (s.id === impSeatId) {
          // 原小恶魔死亡
          return { ...s, isDead: true };
        } else if (s.id === newImp.id) {
          // 新小恶魔标记为恶魔继任者更新角色为小恶魔添小恶魔传"标记
          const statusDetails = [...(s.statusDetails || []), '小恶魔传'];
          return {
            ...s,
            role: newImpRole || s.role,
            isDemonSuccessor: true,
            statusDetails: statusDetails
          };
        }
        return s;
      });

      // 从唤醒队列中移除已死亡的原小恶魔
      setWakeQueueIds(prev => prev.filter(id => id !== impSeatId));

      return updatedSeats;
    });

    // 正常传位给爪牙小恶魔自杀时优先传位给爪牙不检查红唇女郎
    // 检查游戏结束不应该结束因为新小恶魔还在
    setTimeout(() => {
      const currentSeats = seatsRef.current || updatedSeats;
      checkGameOver(currentSeats);
    }, 0);

    addLogWithDeduplication(
      `${impSeatId + 1}号(小恶魔) 选择自己，身份转移给 ${newImp.id + 1}号(${newImp.role?.name})，${impSeatId + 1}号已在夜晚死亡`,
      impSeatId,
      '小恶魔'
    );

    // 显眼的高亮提示提醒说书人唤醒新恶魔玩家
    console.warn('%c 重要提醒小恶魔传位成功 ', 'color: #FFD700; font-size: 20px; font-weight: bold; background: #1a1a1a; padding: 10px; border: 3px solid #FFD700;');
    console.warn(`%c请立即唤醒${newImp.id + 1}号玩家，向其出示"你是小恶魔"卡牌`, 'color: #FF6B6B; font-size: 16px; font-weight: bold; background: #1a1a1a; padding: 8px;');
    console.warn(`%c注意新恶魔今晚不行动从下一夜开始才会进入唤醒队列`, 'color: #4ECDC4; font-size: 14px; background: #1a1a1a; padding: 5px;');

    // 记录原小恶魔的死亡
    setDeadThisNight(p => [...p, impSeatId]);
    enqueueRavenkeeperIfNeeded(impSeatId);

    return { handled: true, shouldContinue: false };
  } else {
    // 如果没有活着的爪牙小恶魔自杀但无法传位直接死亡结算游戏
    addLogWithDeduplication(
      `${impSeatId + 1}号(小恶魔) 选择自己但场上无爪牙可传位，${impSeatId + 1}号直接死亡`,
      impSeatId,
      '小恶魔'
    );
    // 使用通用杀人流程触发死亡与游戏结束判定
    killPlayer(impSeatId, {
      onAfterKill: (latestSeats?: Seat[]) => {
        const finalSeats = latestSeats && latestSeats.length ? latestSeats : (seatsRef.current || seats);
        checkGameOver(finalSeats, impSeatId);
      }
    });

    return { handled: true, shouldContinue: false };
  }
}
/**
 * 筑梦师确认处理
 */
export function handleDreamerConfirm(context: RoleConfirmContext): RoleConfirmResult {
  const { nightInfo, selectedTargets, seats, roles, setCurrentModal, setSelectedActionTargets } = context;
  if (nightInfo.effectiveRole.id !== 'dreamer') return { handled: false };

  if (selectedTargets.length !== 1) {
    alert("筑梦师必须选择且仅选择一名玩家");
    return { handled: true, shouldWait: true };
  }

  const targetId = selectedTargets[0];
  const targetSeat = seats.find(s => s.id === targetId);
  if (!targetSeat) return { handled: true, shouldWait: true };

  const actualRole = targetSeat.role;
  if (!actualRole) return { handled: true, shouldWait: true };

  // 1. 获取注册阵营（包含隐士/间谍的干扰效果）
  const reg = getRegistration(targetSeat, { id: 'dreamer' } as Role);
  const isGoodReg = reg.alignment === 'Good';

  // 2. 根据注册阵营随机生成显示方案
  const townsfolk = roles.filter(r => r.type === 'townsfolk');
  const outsiders = roles.filter(r => r.type === 'outsider' || r.id === 'drunk');
  const minions = roles.filter(r => r.type === 'minion');
  const demons = roles.filter(r => r.type === 'demon');

  const goodRoles = [...townsfolk, ...outsiders];
  const evilRoles = [...minions, ...demons];

  let roleA: Role;
  let roleB: Role;
  const isCorrectA = Math.random() < 0.5;

  if (isGoodReg) {
    // 玩家注册为善良，所以正确项必须是善良角色，迷惑项必须是邪恶角色
    const correctGoodRole = (actualRole.type === 'townsfolk' || actualRole.type === 'outsider' || actualRole.id === 'drunk')
      ? actualRole
      : getRandom(goodRoles);

    if (isCorrectA) {
      roleA = correctGoodRole;
      roleB = getRandom(evilRoles);
    } else {
      roleA = getRandom(evilRoles);
      roleB = correctGoodRole;
    }
  } else {
    // 玩家注册为邪恶，所以正确项必须是邪恶角色，迷惑项必须是善良角色
    const correctEvilRole = (actualRole.type === 'minion' || actualRole.type === 'demon')
      ? actualRole
      : getRandom(evilRoles);

    if (isCorrectA) {
      roleA = correctEvilRole;
      roleB = getRandom(goodRoles);
    } else {
      roleA = getRandom(goodRoles);
      roleB = correctEvilRole;
    }
  }

  setCurrentModal({ type: 'DREAMER_RESULT', data: { roleA, roleB } });
  setSelectedActionTargets([]);
  return { handled: true, shouldWait: true };
}

/**
 * 舞蛇人确认处理
 */
export function handleSnakeCharmerConfirm(context: RoleConfirmContext): RoleConfirmResult {
  const { nightInfo, selectedTargets, seats, setSeats, addLog, continueToNextAction, addPoisonMark, setSelectedActionTargets } = context;
  if (nightInfo.effectiveRole.id !== 'snake_charmer') return { handled: false };

  if (selectedTargets.length !== 1) {
    alert("舞蛇人必须选择且仅选择一名玩家");
    return { handled: true, shouldWait: true };
  }

  const targetId = selectedTargets[0];
  const targetSeat = seats.find(s => s.id === targetId);
  const scId = nightInfo.seat.id;

  if (!targetSeat || targetSeat.isDead) {
    alert("请选择一名存活玩家");
    return { handled: true, shouldWait: true };
  }

  // 检查目标是否是恶魔
  const isTargetDemon = targetSeat.role?.type === 'demon' || targetSeat.isDemonSuccessor;

  if (isTargetDemon) {
    const scRole = nightInfo.effectiveRole;
    const demonRole = targetSeat.role!;

    setSeats(prev => prev.map(s => {
      if (s.id === scId) return { ...s, role: demonRole, isDemonSuccessor: true };
      if (s.id === targetId) {
        const { statusDetails, statuses } = addPoisonMark(s, 'snake_charmer', '永久');
        return { ...s, role: scRole, isPoisoned: true, statusDetails, statuses };
      }
      return s;
    }));

    addLog(`❗ 舞蛇人命中恶魔！${scId + 1}号变为新恶魔(${demonRole.name})，${targetId + 1}号变为舞蛇人且中毒`);
    alert(`🎉 你命中了恶魔！你现在是新恶魔(${demonRole.name})，原恶魔变为了中毒的舞蛇人。`);
  } else {
    addLog(`${scId + 1}号(舞蛇人) 选择 ${targetId + 1}号，未命中恶魔`);
  }

  setSelectedActionTargets([]);
  continueToNextAction();
  return { handled: true };
}

/**
 * 花女确认处理
 */
export function handleFlowergirlConfirm(context: RoleConfirmContext): RoleConfirmResult {
  const { nightInfo, todayDemonVoted, setCurrentModal, setSelectedActionTargets } = context;
  if (nightInfo.effectiveRole.id !== 'flowergirl') return { handled: false };

  setCurrentModal({
    type: 'NIGHT_DEATH_REPORT',
    data: { message: `花女信息：恶魔今天${todayDemonVoted ? '投票了' : '没有投票'}` }
  });

  setSelectedActionTargets([]);
  return { handled: true, shouldWait: true };
}

/**
 * 镇民传令官确认处理
 */
export function handleTownCrierConfirm(context: RoleConfirmContext): RoleConfirmResult {
  const { nightInfo, todayMinionNominated, setCurrentModal, setSelectedActionTargets } = context;
  if (nightInfo.effectiveRole.id !== 'town_crier') return { handled: false };

  setCurrentModal({
    type: 'NIGHT_DEATH_REPORT',
    data: { message: `镇民传令官信息：爪牙今天${todayMinionNominated ? '提名了' : '没有提名'}` }
  });

  setSelectedActionTargets([]);
  return { handled: true, shouldWait: true };
}

/**
 * 神谕者确认处理
 */
export function handleOracleConfirm(context: RoleConfirmContext): RoleConfirmResult {
  const { nightInfo, seats, isEvil, setCurrentModal, setSelectedActionTargets } = context;
  if (nightInfo.effectiveRole.id !== 'oracle') return { handled: false };

  const evilDeadCount = seats.filter(s => isEvil(s) && s.isDead).length;
  setCurrentModal({
    type: 'NIGHT_DEATH_REPORT',
    data: { message: `神谕者信息：当前场上已有 ${evilDeadCount} 名邪恶玩家死亡` }
  });

  setSelectedActionTargets([]);
  return { handled: true, shouldWait: true };
}


/**
 * 角色确认处理函数映射表
 */
export const roleConfirmHandlers: Record<string, (context: RoleConfirmContext) => RoleConfirmResult> = {
  'poisoner': handlePoisonerConfirm,
  'poisoner_mr': handlePoisonerConfirm,
  'pit_hag_mr': handlePitHagConfirm,
  'professor_mr': handleProfessorConfirm,
  'ranger': handleRangerConfirm,
  'shabaloth': handleShabalothConfirm,
  'po': handlePoConfirm,
  'innkeeper': handleInnkeeperConfirm,
  'sailor': handleSailorConfirm,
  'courtier': handleCourtierConfirm,
  'assassin': handleAssassinConfirm,
  'godfather': handleGodfatherConfirm,
  'dreamer': handleDreamerConfirm,
  'snake_charmer': handleSnakeCharmerConfirm,
  'flowergirl': handleFlowergirlConfirm,
  'town_crier': handleTownCrierConfirm,
  'oracle': handleOracleConfirm,
};


/**
 * 获取角色的确认处理函数
 */
export function getRoleConfirmHandler(roleId: string): ((context: RoleConfirmContext) => RoleConfirmResult) | null {
  return roleConfirmHandlers[roleId] || null;
}


/**
 * 角色特定行动处理函数
 * 将角色特定的确认逻辑从 useGameController 中分离出来
 */

import React from "react";
import { Seat, GamePhase, Role } from "../../app/data";
import { NightInfoResult } from "../types/game";
import { ModalType } from "../types/modal";

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
  isEvil: (seat: Seat) => boolean;
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
  
  if (!isPoisoner || selectedTargets.length !== 1) {
    return { handled: false };
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
      `${nightInfo.seat.id+1}号(投毒者) 处于中毒/醉酒状态，本夜对${targetId+1}号${isEvilTarget ? '(队友)' : ''}的下毒无效，无事发生`,
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
    `${nightInfo.seat.id+1}号(投毒者) 对 ${targetId+1}号${isEvilTarget ? '(队友)' : ''}下毒`,
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
      addLog(`${s.id+1}号因亡骨魔获得的"死而有能"效果在变身${newRole.name} 时已失效`);
    }
    return nextSeat;
  }));
  
  const createdNewDemon = newRole.type === 'demon' && targetSeat?.role?.type !== 'demon';
  if (createdNewDemon) {
    const seatId = nightInfo?.seat?.id ?? 0;
    addLog(`${seatId+1}号(麻脸巫婆) ${targetId+1}号变为恶魔，今晚的死亡由说书人决定`);
  } else {
    const seatId = nightInfo?.seat?.id ?? 0;
    addLog(`${seatId+1}号(麻脸巫婆) ${targetId+1}号变为 ${newRole?.name ?? ''}`);
  }
  
  insertIntoWakeQueueAfterCurrent(targetId, { roleOverride: newRole, logLabel: `${targetId+1}号(${newRole.name})` });
  
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
    addLog(`${seatId+1}号(教授) 无可复活的镇民，跳过`);
    continueToNextAction();
    return { handled: true };
  }
  
  if (selectedTargets.length !== 1) {
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
  addLog(`${seatId+1}号(教授) 复活${targetId+1}号`);
  
  if (hadEvenDead) {
    addLog(`${targetId+1}号此前因亡骨魔获得的"死而有能"效果随着复活已失效`);
  }
  
  markAbilityUsed('professor_mr', seatId);
  setSelectedActionTargets([]);
  insertIntoWakeQueueAfterCurrent(targetId, { logLabel: `${targetId+1}号(复活)` });
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
    addLog(`${seatId+1}号(巡山人) 选择${targetId+1}号，但未命中落难少女`);
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
          addLog(`${seatId+1}号(沙巴洛斯) 杀死了 ${targets.map(x=>`${x+1}号`).join('、')}，本工具暂未实现其复活效果，请说书人按规则手动裁定是否复活`);
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
      return { handled: true, shouldWait: true };
    }
    
    if (uniqueTargets.length === 0) {
      // 本夜不杀人蓄力
      setPoChargeState(prev => ({ ...prev, [seatId]: true }));
      addLog(`${seatId+1}号(珀) 本夜未杀人，蓄力一次，下一个夜晚将爆发杀 3 人`);
      continueToNextAction();
      return { handled: true };
    }
    
    const targetId = uniqueTargets[0];
    setPoChargeState(prev => ({ ...prev, [seatId]: false }));
    setSelectedActionTargets([]);
    killPlayer(targetId, {
      onAfterKill: () => {
        addLog(`${seatId+1}号(珀) 杀死了 ${targetId+1}号`);
        continueToNextAction();
      }
    });
    return { handled: true, shouldWait: true };
  }
  
  // 已蓄力必须选择3名不同目标本夜爆发杀 3
  if (uniqueTargets.length !== 3) {
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
          addLog(`${seatId+1}号(珀) 爆发杀死了 ${uniqueTargets.map(x=>`${x+1}号`).join('、')}`);
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
  addLog(`${seatId+1}号(旅店老板) 今晚保护${aId+1}号、${bId+1}号，他们不会被恶魔杀死，其中一人醉酒到下个黄昏，信息可能错误`);
  continueToNextAction();
  return { handled: true };
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
      `${impSeatId+1}号(小恶魔) 选择自己，身份转移给 ${newImp.id+1}号(${newImp.role?.name})，${impSeatId+1}号已在夜晚死亡`,
      impSeatId,
      '小恶魔'
    );
    
    // 显眼的高亮提示提醒说书人唤醒新恶魔玩家
    console.warn('%c 重要提醒小恶魔传位成功 ', 'color: #FFD700; font-size: 20px; font-weight: bold; background: #1a1a1a; padding: 10px; border: 3px solid #FFD700;');
    console.warn(`%c请立即唤醒${newImp.id+1}号玩家，向其出示"你是小恶魔"卡牌`, 'color: #FF6B6B; font-size: 16px; font-weight: bold; background: #1a1a1a; padding: 8px;');
    console.warn(`%c注意新恶魔今晚不行动从下一夜开始才会进入唤醒队列`, 'color: #4ECDC4; font-size: 14px; background: #1a1a1a; padding: 5px;');
    
    // 记录原小恶魔的死亡
    setDeadThisNight(p => [...p, impSeatId]);
    enqueueRavenkeeperIfNeeded(impSeatId);
    
    return { handled: true, shouldContinue: false };
  } else {
    // 如果没有活着的爪牙小恶魔自杀但无法传位直接死亡结算游戏
    addLogWithDeduplication(
      `${impSeatId+1}号(小恶魔) 选择自己但场上无爪牙可传位，${impSeatId+1}号直接死亡`,
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
};

/**
 * 获取角色的确认处理函数
 */
export function getRoleConfirmHandler(roleId: string): ((context: RoleConfirmContext) => RoleConfirmResult) | null {
  return roleConfirmHandlers[roleId] || null;
}


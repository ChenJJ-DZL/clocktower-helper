"use client";

import { useMemo, type Dispatch, type SetStateAction } from "react";
import type { Role, Seat } from "../../app/data";
import type { NightInfoResult } from "../types/game";

export interface InteractionState {
  wakeQueueIds: number[];
  setWakeQueueIds: Dispatch<SetStateAction<number[]>>;
  currentWakeIndex: number;
  setCurrentWakeIndex: Dispatch<SetStateAction<number>>;
  selectedActionTargets: number[];
  setSelectedActionTargets: Dispatch<SetStateAction<number[]>>;
}

export interface InteractionDeps {
  // 基础
  gamePhase: string;
  seats: Seat[];
  setSeats: Dispatch<SetStateAction<Seat[]>>;
  checkGameOver: (updatedSeats: Seat[], executedPlayerIdArg?: number | null, preserveWinReason?: boolean) => boolean;
  saveHistory: () => void;
  selectedRole: Role | null;
  setSelectedRole: Dispatch<SetStateAction<Role | null>>;
  roles: Role[];
  nightCount: number;
  contextMenu: any;
  setContextMenu: Dispatch<SetStateAction<any>>;
  currentModal: any;
  setCurrentModal: Dispatch<SetStateAction<any>>;
  setDayAbilityForm: Dispatch<SetStateAction<any>>;
  gossipStatementToday: string | null;
  killPlayer: (seatId: number, options?: any) => void;
  addLog: (message: string) => void;
  continueToNextAction: () => void;
  insertIntoWakeQueueAfterCurrent: (seatId: number, opts?: { roleOverride?: Role | null; logLabel?: string }) => void;
  getSeatRoleId: (seatId: number) => string | null;
  cleanseSeatStatuses: (seat: Seat, opts?: any) => Seat;
  hasUsedAbility: (roleId: string, seatId?: number) => boolean;
  markAbilityUsed: (seatId: number, roleId: string) => void;
  reviveSeat: (seat: Seat) => Seat;
  setPukkaPoisonQueue: Dispatch<SetStateAction<{ targetId: number; nightsUntilDeath: number; }[]>>;
  setDeadThisNight: Dispatch<SetStateAction<number[]>>;
  poChargeState: number;
  setPoChargeState: Dispatch<SetStateAction<number>>;
  addDrunkMark: (seatId: number) => void;
  isEvil: (seat: Seat) => boolean;
  getRoleConfirmHandler: (roleId: string) => ((context: any) => { handled: boolean; shouldWait?: boolean; shouldContinueToNight?: boolean; seatUpdates?: any[] }) | undefined;

  // 夜晚行动上下文
  nightInfo: NightInfoResult | null;
  selectedActionTargets: number[];
  setSelectedActionTargets: Dispatch<SetStateAction<number[]>>;
  setInspectionResult: Dispatch<SetStateAction<string | null>>;
  setInspectionResultKey: Dispatch<SetStateAction<number>>;
  isVortoxWorld: boolean;
  isActorDisabledByPoisonOrDrunk: (seat: Seat | undefined, known?: boolean) => boolean;
  isActionAbility: (role?: Role | null) => boolean;
  addLogWithDeduplication: (text: string, seatId: number, roleName: string) => void;
  getRoleTargetCount: (roleId: string, isFirstNight: boolean) => { max?: number } | null;
  getRegistrationCached: (target: Seat, viewingRole?: Role | null) => any;
  fakeInspectionResultRef: React.MutableRefObject<string | null>;
}

export interface UseInteractionHandlerResult {
  wakeQueueIds: number[];
  setWakeQueueIds: Dispatch<SetStateAction<number[]>>;
  currentWakeIndex: number;
  setCurrentWakeIndex: Dispatch<SetStateAction<number>>;
  selectedActionTargets: number[];
  setSelectedActionTargets: Dispatch<SetStateAction<number[]>>;
  handleSeatClick: (seatId: number) => void;
  toggleTarget: (seatId: number) => void;
  confirmAction: () => void;
  cancelAction: () => void;
  isTargetDisabled: (seat: Seat) => boolean;
  handleConfirmAction: () => void;
  handleMenuAction: (action: string) => void;
  toggleStatus: (type: string, seatId?: number) => void;
}

/**
 * useInteractionHandler - 交互与行动
 * 本阶段接管 wakeQueue/选中目标 的状态与 setter，并下沉基础交互逻辑
 */
export function useInteractionHandler(base: InteractionState, deps: InteractionDeps): UseInteractionHandlerResult {
  return useMemo(() => {
    const handleSeatClick = (id: number) => {
      const { gamePhase, selectedRole, seats, saveHistory, setSeats, setSelectedRole } = deps;
      if (gamePhase === 'setup' || gamePhase === 'scriptSelection') {
        saveHistory();
        if (selectedRole) {
          if (seats.some(s => s.role?.id === selectedRole.id)) {
            alert("该角色已入座");
            return;
          }
          setSeats((p) => p.map((s) => (s.id === id ? { ...s, role: selectedRole } : s)));
          setSelectedRole(null);
        } else {
          setSeats((p) => p.map((s) => (s.id === id ? { ...s, role: null } : s)));
        }
      }
    };

    const toggleTarget = (targetId: number) => {
      const {
        nightInfo,
        gamePhase,
        selectedActionTargets,
        seats,
        saveHistory,
        setSelectedActionTargets,
        setInspectionResult,
        setInspectionResultKey,
        getRegistrationCached,
        isVortoxWorld,
        isActorDisabledByPoisonOrDrunk,
        isActionAbility,
        addLogWithDeduplication,
        getRoleTargetCount,
        fakeInspectionResultRef,
      } = deps;

      if (!nightInfo) return;
      saveHistory();

      const isFirstNight = gamePhase === 'firstNight';
      const targetCount = getRoleTargetCount(nightInfo.effectiveRole.id, isFirstNight);
      const maxTargets = targetCount?.max ?? 1;

      let newTargets = [...selectedActionTargets];
      if (newTargets.includes(targetId)) {
        newTargets = newTargets.filter(t => t !== targetId);
      } else {
        if (maxTargets === 1) {
          newTargets = [targetId];
        } else {
          if (newTargets.length >= maxTargets) {
            newTargets.shift();
          }
          newTargets.push(targetId);
        }
      }

      setSelectedActionTargets(newTargets);

      try {
        const roleId = nightInfo.effectiveRole.id;
        if (roleId === 'fortune_teller') {
          if (newTargets.length !== 2) {
            setInspectionResult(null);
            fakeInspectionResultRef.current = null;
          } else {
            const [aId, bId] = newTargets;
            const a = seats.find(s => s.id === aId);
            const b = seats.find(s => s.id === bId);
            if (a && b) {
              const regA = getRegistrationCached(a, nightInfo.effectiveRole);
              const regB = getRegistrationCached(b, nightInfo.effectiveRole);
              const hasDemonSelected =
                !!regA.registersAsDemon ||
                !!regB.registersAsDemon ||
                a.role?.type === 'demon' ||
                b.role?.type === 'demon' ||
                !!a.isDemonSuccessor ||
                !!b.isDemonSuccessor;

              const hasRedHerringSelected = !!a.isRedHerring || !!b.isRedHerring;
              const isYesReal = hasDemonSelected || (!isVortoxWorld && hasRedHerringSelected);

              const realText = isYesReal ? '是' : '否';
              const shouldFake = nightInfo.isPoisoned || isVortoxWorld;
              let shownText = realText;

              if (shouldFake) {
                if (!fakeInspectionResultRef.current) {
                  fakeInspectionResultRef.current = isYesReal ? '否' : '是';
                }
                shownText = fakeInspectionResultRef.current;
              } else {
                fakeInspectionResultRef.current = null;
              }

              const note = shouldFake ? '（中毒/醉酒/涡流：此为假信息）' : '';
              const resultText = `🔮 占卜师结果：${shownText}${note}`;
              setInspectionResult(resultText);
              setInspectionResultKey(k => k + 1);
            }
          }
        }
      } catch (e) {
        console.warn('[toggleTarget] Failed to compute inspection result:', e);
      }

      const actorSeat = seats.find(s => s.id === nightInfo.seat.id);
      const actorDisabled = isActorDisabledByPoisonOrDrunk(actorSeat, nightInfo.isPoisoned);
      const isActionalAbility = isActionAbility(nightInfo.effectiveRole);

      if (actorDisabled && isActionalAbility) {
        if (newTargets.length > 0) {
          const lastTargetId = newTargets[newTargets.length - 1];
          addLogWithDeduplication(
            `${nightInfo.seat.id ? nightInfo.seat.id + 1 : 0}号(${nightInfo.effectiveRole?.name ?? ''}) 处于中毒/醉酒状态，本夜${lastTargetId+1}号的行动无效，无事发生`,
            nightInfo.seat.id ?? 0,
            nightInfo.effectiveRole?.name ?? ''
          );
        }
        return;
      }
    };

    // 【小白模式】目标禁用逻辑（目前统一放宽为“永远不禁用”）
    // 这样可以让说书人自由点选任何玩家，包括已死亡或自身，以便人工修正或演示
    const isTargetDisabled = (_targetSeat: Seat): boolean => {
      return false;
    };

    const handleConfirmAction = () => {
      const {
        nightInfo,
        seats,
        selectedActionTargets,
        gamePhase,
        nightCount,
        roles,
        currentModal,
        setSeats,
        setSelectedActionTargets,
        getRoleTargetCount,
        getSeatRoleId,
        cleanseSeatStatuses,
        insertIntoWakeQueueAfterCurrent,
        continueToNextAction,
        setCurrentModal,
        killPlayer,
        hasUsedAbility,
        markAbilityUsed,
        reviveSeat,
        setPukkaPoisonQueue,
        setDeadThisNight,
        addLog,
        poChargeState,
        setPoChargeState,
        addDrunkMark,
        isEvil,
        getRoleConfirmHandler,
      } = deps;

      if (!nightInfo) return;
      console.log('[handleConfirmAction] called. Current Role:', nightInfo.effectiveRole.id, 'Actual Target Count:', getRoleTargetCount(nightInfo.effectiveRole.id, gamePhase === 'firstNight')?.max ?? 0);

      // 如果有弹窗，交给弹窗处理
      if (currentModal !== null) {
        return;
      }

      const abilityText = nightInfo.effectiveRole.ability || '';
      const hasChoiceKeyword = abilityText.includes('选择');
      const actualTargetCount = getRoleTargetCount(nightInfo.effectiveRole.id, gamePhase === 'firstNight')?.max ?? 0;

      if (!hasChoiceKeyword && selectedActionTargets.length === 0 && actualTargetCount > 0) {
        const roleId = nightInfo.effectiveRole.id;
        const roleName = nightInfo.effectiveRole.name;
        const description = abilityText || `使用${roleName}的能力`;
        setCurrentModal({
          type: 'STORYTELLER_SELECT',
          data: {
            sourceId: nightInfo.seat.id,
            roleId,
            roleName,
            description,
            targetCount: actualTargetCount,
            onConfirm: (targetIds: number[]) => {
              setSelectedActionTargets(targetIds);
              setCurrentModal(null);
            }
          }
        });
        return;
      } else if (actualTargetCount === 0) {
        setSelectedActionTargets([]);
        setCurrentModal(null);
        continueToNextAction();
        return;
      }

      const roleId = nightInfo.effectiveRole.id;
      const handler = getRoleConfirmHandler(roleId);

      if (handler) {
        const context = {
          nightInfo,
          seats,
          selectedTargets: selectedActionTargets,
          gamePhase,
          nightCount,
          roles,
          setSeats,
          setSelectedActionTargets,
          currentModal,
          setCurrentModal,
          getSeatRoleId,
          cleanseSeatStatuses,
          insertIntoWakeQueueAfterCurrent,
          continueToNextAction,
          addLog,
          killPlayer,
          hasUsedAbility,
          markAbilityUsed,
          reviveSeat,
          setPukkaPoisonQueue,
          setDeadThisNight,
          poChargeState,
          setPoChargeState,
          addDrunkMark,
          isEvil,
        };

        const result = handler(context);
        if (result.handled) {
          if (result.shouldWait) {
            return;
          }
          return;
        }
      }

      continueToNextAction();
    };

    const handleMenuAction = (action: string) => {
      const {
        contextMenu,
        seats,
        setContextMenu,
        setCurrentModal,
        setDayAbilityForm,
        gossipStatementToday,
        saveHistory,
        killPlayer,
        addLog,
      } = deps;

      const seatId = contextMenu?.seatId;
      if (seatId === undefined || seatId === null) return;
      const seat = seats.find(s => s.id === seatId);
      if (!seat) return;

      setContextMenu(null);

      if (action === 'nominate') {
        setCurrentModal({ type: 'DAY_ACTION', data: { type: 'nominate', sourceId: seatId } });
        return;
      }

      if (action === 'slayer') {
        setCurrentModal({ type: 'DAY_ACTION', data: { type: 'slayer', sourceId: seatId } });
        return;
      }

      if (action === 'damselGuess') {
        setCurrentModal({ type: 'DAMSEL_GUESS', data: { minionId: seatId, targetId: null } });
        return;
      }

      if (action === 'tinker_die') {
        if (seat.role?.id !== 'tinker' || seat.isDead) return;
        saveHistory();
        killPlayer(seatId, {
          source: 'ability',
          onAfterKill: () => {
            addLog(`🛠️ ${seatId + 1}号(修补匠) 在说书人裁定下死亡`);
          },
        });
        return;
      }

      if (action === 'gossip_record') {
        if (seat.role?.id !== 'gossip' || seat.isDead) return;
        saveHistory();
        setCurrentModal({ type: 'DAY_ABILITY', data: { roleId: 'gossip', seatId } });
        setDayAbilityForm({ info1: gossipStatementToday || '' });
        return;
      }
    };

    const toggleStatus = (type: string, seatId?: number) => {
      const {
        contextMenu,
        seats,
        gamePhase,
        setSeats,
        setContextMenu,
        reviveSeat,
        checkGameOver,
        insertIntoWakeQueueAfterCurrent,
        addLog,
      } = deps;

      const targetSeatId = seatId ?? contextMenu?.seatId;
      if (targetSeatId === undefined || targetSeatId === null) return;

      setSeats(p => {
        let updated: Seat[];
        if (type === 'redherring') {
          const hasFortuneTeller = p.some(s => s.role?.id === "fortune_teller");
          const targetSeat = p.find(s => s.id === targetSeatId);
          const isRemoving = targetSeat?.isRedHerring === true;

          if (!isRemoving && !hasFortuneTeller) {
            return p;
          }

          updated = p.map(s => {
            if (s.id === targetSeatId) {
              const details = s.statusDetails || [];
              return {
                ...s,
                isRedHerring: true,
                statusDetails: details.includes("天敌红罗剎")
                  ? details
                  : [...details, "天敌红罗剎"],
              };
            } else {
              const details = s.statusDetails || [];
              return {
                ...s,
                isRedHerring: false,
                statusDetails: details.filter(d => d !== "天敌红罗剎"),
              };
            }
          });

          if (!isRemoving) {
            setTimeout(() => {
              addLog(`你将 ${targetSeatId + 1} 号玩家设为本局唯一的天敌红罗剎，占卜师永远视 ta 为邪恶`);
            }, 0);
          }
        } else {
          updated = p.map(s => {
            if (s.id !== targetSeatId) return s;
            if (type === 'dead') {
              if (s.isDead) {
                return reviveSeat(s);
              }
              return { ...s, isDead: true };
            }
            if (type === 'poison') return { ...s, isPoisoned: !s.isPoisoned };
            if (type === 'drunk') return { ...s, isDrunk: !s.isDrunk };
            return s;
          });
        }

        if (type === 'dead') {
          if (checkGameOver(updated)) {
            return updated;
          }
        }
        return updated;
      });

      if (type === 'dead') {
        const target = seats.find(s => s.id === targetSeatId);
        if (target && target.isDead && ['night','firstNight'].includes(gamePhase)) {
          insertIntoWakeQueueAfterCurrent(target.id);
        }
      }
      setContextMenu(null);
    };

    return {
      wakeQueueIds: base.wakeQueueIds,
      setWakeQueueIds: base.setWakeQueueIds,
      currentWakeIndex: base.currentWakeIndex,
      setCurrentWakeIndex: base.setCurrentWakeIndex,
      selectedActionTargets: base.selectedActionTargets,
      setSelectedActionTargets: base.setSelectedActionTargets,
      handleSeatClick,
      toggleTarget,
      confirmAction: handleConfirmAction,
      cancelAction: () => {},
      isTargetDisabled,
      handleConfirmAction,
      handleMenuAction,
      toggleStatus,
    };
  }, [
    base.wakeQueueIds,
    base.currentWakeIndex,
    base.selectedActionTargets,
    base.setWakeQueueIds,
    base.setCurrentWakeIndex,
    base.setSelectedActionTargets,
    deps,
  ]);
}

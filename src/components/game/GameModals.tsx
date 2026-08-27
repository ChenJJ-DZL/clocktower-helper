import { useEffect, useRef } from "react";
import type { ReminderToken } from "@/app/data";
import type { GameRecord } from "@/src/types/game";
import { roles } from "../../../app/data";
import { useGameActions } from "../../contexts/GameActionsContext";
import { gameActions, useGameContext } from "../../contexts/GameContext";
import { useGameState } from "../../hooks/useGameState";
import { useHistoryController } from "../../hooks/useHistoryController";
import { ArtistResultModal } from "../modals/ArtistResultModal";
import { AttackBlockedModal } from "../modals/AttackBlockedModal";
import { BarberSwapModal } from "../modals/BarberSwapModal";
import { CourtierSelectRoleModal } from "../modals/CourtierSelectRoleModal";
import { DamselGuessModal } from "../modals/DamselGuessModal";
import { DayAbilityModal } from "../modals/DayAbilityModal";
import { DayActionModal } from "../modals/DayActionModal";
import { DreamerResultModal } from "../modals/DreamerResultModal";
import { DrunkCharadeSelectModal } from "../modals/DrunkCharadeSelectModal";
import { ExecutionResultModal } from "../modals/ExecutionResultModal";
import { GameRecordsModal } from "../modals/GameRecordsModal";
import { GenericAlertModal } from "../modals/GenericAlertModal";
import { GenericConfirmModal } from "../modals/GenericConfirmModal";
import { IdentityShowcaseModal } from "../modals/IdentityShowcaseModal";
import { InfoResultModal } from "../modals/InfoResultModal";
import { KillConfirmModal } from "../modals/KillConfirmModal";
import { KlutzChoiceModal } from "../modals/KlutzChoiceModal";
import { LunaticRpsModal } from "../modals/LunaticRpsModal";
import { MadnessCheckModal } from "../modals/MadnessCheckModal";
import { MayorThreeAliveModal } from "../modals/MayorThreeAliveModal";
import { ModalWrapper } from "../modals/ModalWrapper";
import { MoonchildKillModal } from "../modals/MoonchildKillModal";
import { NightActionConfirmModal } from "../modals/NightActionConfirmModal";
import { NightDeathReportModal } from "../modals/NightDeathReportModal";
import { NightOrderPreviewModal } from "../modals/NightOrderPreviewModal";
import { PacifistConfirmModal } from "../modals/PacifistConfirmModal";
import { PitHagModal } from "../modals/PitHagModal";
import { PoisonConfirmModal } from "../modals/PoisonConfirmModal";
import { PoisonEvilConfirmModal } from "../modals/PoisonEvilConfirmModal";
import { RangerModal } from "../modals/RangerModal";
import { RavenkeeperFakeModal } from "../modals/RavenkeeperFakeModal";
import { ReminderTokenPanel } from "../modals/ReminderTokenPanel";
import { RestartConfirmModal } from "../modals/RestartConfirmModal";
import { ReviewModal } from "../modals/ReviewModal";
import { RoleCodexModal } from "../modals/RoleCodexModal";
import { RoleInfoModal } from "../modals/RoleInfoModal";
import { RoleSelectModal } from "../modals/RoleSelectModal";
import { SaintExecutionConfirmModal } from "../modals/SaintExecutionConfirmModal";
import { SavantResultModal } from "../modals/SavantResultModal";
import { ShamanConvertModal } from "../modals/ShamanConvertModal";
import { ShootResultModal } from "../modals/ShootResultModal";
import { SlayerSelectTargetModal } from "../modals/SlayerSelectTargetModal";
import { SpyDisguiseModal } from "../modals/SpyDisguiseModal";
import { SpyGrimoireModal } from "../modals/SpyGrimoireModal";
import { StorytellerDeathModal } from "../modals/StorytellerDeathModal";
import { StorytellerSelectModal } from "../modals/StorytellerSelectModal";
import { SweetheartDrunkModal } from "../modals/SweetheartDrunkModal";
import { VirginGuideModal } from "../modals/VirginGuideModal";
import { VirginTriggerModal } from "../modals/VirginTriggerModal";
import { VizierExecutionModal } from "../modals/VizierExecutionModal";
import { VoteInputModalContent } from "../modals/VoteInputModal";
import { DawnReportOverlay } from "./DawnReportOverlay";
import { GameOverOverlay } from "./GameOverOverlay";
import { PlayerContextMenu } from "./PlayerContextMenu";

export function GameModals() {
  const actions = useGameActions();
  const gameState = useGameState();
  const { dispatch } = useGameContext();
  const { saveHistory } = useHistoryController();

  const {
    currentModal,
    seats,
    victorySnapshot,
    virginGuideInfo,
    klutzChoiceTarget,
    gameLogs,
    gamePhase,
    winResult,
    winReason,
    isPortrait,
    gameRecords,
    selectedScript,
    damselGuessUsedBy,
    reminderTokens,
    nightCount,
  } = gameState;

  const { nightInfo } = actions;

  // 在打开对局记录弹窗前自动保存当前游戏状态，确保记录实时更新
  const prevModalTypeRef = useRef<string | null>(null);
  useEffect(() => {
    const currType = currentModal?.type ?? null;
    if (
      (currType === "GAME_RECORDS" || currType === "SPY_RECORDS") &&
      prevModalTypeRef.current !== currType
    ) {
      try {
        const now = new Date();
        const record: GameRecord = {
          id: `auto-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          scriptName: selectedScript?.name ?? "未知剧本",
          startTime:
            (actions as any).startTime?.toISOString?.() ?? now.toISOString(),
          endTime: now.toISOString(),
          duration: (actions as any).timer ?? 0,
          winResult: null,
          winReason: null,
          seats: JSON.parse(JSON.stringify(seats)),
          gameLogs: gameLogs as any[],
          snapshot: {
            gamePhase,
            nightCount: (actions as any).nightCount ?? 1,
            seats: JSON.parse(JSON.stringify(seats)),
            initialSeats: (actions as any).initialSeats ?? [],
            victorySnapshot: victorySnapshot ?? [],
            gameLogs: gameLogs ?? [],
            winResult: null,
            winReason: null,
            deadThisNight: (actions as any).deadThisNight ?? [],
            wakeQueueIds: (actions as any).wakeQueueIds ?? [],
            currentWakeIndex: (actions as any).currentWakeIndex ?? 0,
          },
        };
        (actions as any).saveGameRecord?.(record);
      } catch (e) {
        console.error("[GameModals] 自动保存对局记录失败:", e);
      }
    }
    prevModalTypeRef.current = currType;
  }, [
    currentModal,
    selectedScript,
    seats,
    gameLogs,
    gamePhase,
    victorySnapshot,
    actions,
  ]);

  // Modal data extraction
  const nightOrderModal =
    currentModal?.type === "NIGHT_ORDER_PREVIEW" ? currentModal.data : null;
  const drunkCharadeSelectModal =
    currentModal?.type === "DRUNK_CHARADE_SELECT" ? currentModal.data : null;
  const voteInputModal =
    currentModal?.type === "VOTE_INPUT" ? currentModal.data : null;
  const roleSelectModal =
    currentModal?.type === "ROLE_SELECT" ? currentModal.data : null;
  const madnessCheckModal =
    currentModal?.type === "MADNESS_CHECK" ? currentModal.data : null;
  const dayActionModal =
    currentModal?.type === "DAY_ACTION" ? currentModal.data : null;
  const dayAbilityModal =
    currentModal?.type === "DAY_ABILITY" ? currentModal.data : null;
  const storytellerSelectModal =
    currentModal?.type === "STORYTELLER_SELECT" ? currentModal.data : null;
  const pacifistConfirmModal =
    currentModal?.type === "PACIFIST_CONFIRM" ? currentModal.data : null;
  const vizierExecutionModal =
    currentModal?.type === "VIZIER_EXECUTION" ? currentModal.data : null;
  const courtierSelectRoleModal =
    currentModal?.type === "COURTIER_SELECT_ROLE" ? currentModal.data : null;
  const poisonConfirmModal =
    currentModal?.type === "POISON_CONFIRM" ? currentModal.data : null;
  const poisonEvilConfirmModal =
    currentModal?.type === "POISON_EVIL_CONFIRM" ? currentModal.data : null;
  const dreamerResultModal =
    currentModal?.type === "DREAMER_RESULT" ? currentModal.data : null;
  const fortuneTellerResultModal =
    currentModal?.type === "FORTUNE_TELLER_RESULT" ? currentModal.data : null;
  const infoResultModal =
    currentModal?.type === "INFO_RESULT" ? currentModal.data : null;
  const artistResultModal =
    currentModal?.type === "ARTIST_RESULT" ? currentModal.data : null;
  const savantResultModal =
    currentModal?.type === "SAVANT_RESULT" ? currentModal.data : null;
  const gamblerJudgeModal =
    currentModal?.type === "GAMBLER_JUDGE" ? currentModal.data : null;
  const nightDeathReportModal =
    currentModal?.type === "NIGHT_DEATH_REPORT" ? currentModal.data : null;
  const nightActionConfirmModal =
    currentModal?.type === "NIGHT_ACTION_CONFIRM" ? currentModal.data : null;

  return (
    <>
      {/* Action Data Modals */}
      {courtierSelectRoleModal && (
        <CourtierSelectRoleModal
          isOpen={true}
          sourceId={courtierSelectRoleModal.sourceId}
          roles={courtierSelectRoleModal.roles}
          seats={courtierSelectRoleModal.seats}
          onConfirm={courtierSelectRoleModal.onConfirm}
          onCancel={courtierSelectRoleModal.onCancel}
        />
      )}

      {nightOrderModal && (
        <NightOrderPreviewModal nightOrderModal={nightOrderModal} />
      )}

      <MayorThreeAliveModal
        isOpen={currentModal?.type === "MAYOR_THREE_ALIVE"}
        onContinue={() => {
          actions.setCurrentModal(null);
          actions.enterDuskPhase();
        }}
        onDeclareWin={actions.declareMayorImmediateWin}
        onCancel={() => actions.setCurrentModal(null)}
      />

      {voteInputModal && (
        <VoteInputModalContent
          voterId={voteInputModal.voterId}
          seats={seats}
          registerVotes={actions.registerVotes}
          submitVotes={actions.submitVotes}
          onCancelVote={(nomineeId) =>
            actions.cancelNomination?.(undefined, nomineeId)
          }
          setCurrentModal={actions.setCurrentModal}
        />
      )}

      {roleSelectModal && <RoleSelectModal modal={roleSelectModal} />}
      {madnessCheckModal && <MadnessCheckModal modal={madnessCheckModal} />}
      {dayActionModal && <DayActionModal modal={dayActionModal} />}
      {virginGuideInfo && <VirginGuideModal />}
      {dayAbilityModal && <DayAbilityModal modal={dayAbilityModal} />}

      {poisonConfirmModal && (
        <PoisonConfirmModal
          targetId={poisonConfirmModal.targetId}
          onConfirm={actions.confirmPoison}
          onCancel={() => {
            actions.setCurrentModal(null);
            actions.setSelectedActionTargets([]);
          }}
        />
      )}

      {poisonEvilConfirmModal && (
        <PoisonEvilConfirmModal
          targetId={poisonEvilConfirmModal.targetId}
          onConfirm={() => {
            if (poisonEvilConfirmModal.targetId !== undefined) {
              actions.confirmPoisonEvil();
              actions.setCurrentModal(null);
            }
          }}
          onCancel={() => {
            actions.setCurrentModal(null);
            actions.setSelectedActionTargets([]);
          }}
        />
      )}

      {nightActionConfirmModal && (
        <NightActionConfirmModal
          data={{
            roleName: nightActionConfirmModal.roleName,
            actionDescription: nightActionConfirmModal.actionDescription,
            targetDescriptions: nightActionConfirmModal.targetDescriptions,
            extraNote: nightActionConfirmModal.extraNote,
          }}
          onConfirm={() => {
            actions.setCurrentModal(null);
            nightActionConfirmModal.onConfirm();
          }}
          onCancel={() => {
            actions.setCurrentModal(null);
            nightActionConfirmModal.onCancel();
          }}
        />
      )}

      <SaintExecutionConfirmModal
        isOpen={currentModal?.type === "SAINT_EXECUTION_CONFIRM"}
        onConfirm={actions.confirmSaintExecution}
        onCancel={actions.cancelSaintExecution}
      />

      <LunaticRpsModal
        isOpen={currentModal?.type === "LUNATIC_RPS"}
        nominatorId={
          currentModal?.type === "LUNATIC_RPS"
            ? currentModal.data.nominatorId
            : null
        }
        targetId={
          currentModal?.type === "LUNATIC_RPS" ? currentModal.data.targetId : 0
        }
        onResolve={(isLoss) => {
          actions.resolveLunaticRps(isLoss ? "lose" : "win");
        }}
      />

      <VirginTriggerModal
        isOpen={currentModal?.type === "VIRGIN_TRIGGER"}
        onConfirm={actions.confirmVirginTrigger}
        onCancel={() => actions.setCurrentModal(null)}
      />

      {currentModal?.type === "RAVENKEEPER_FAKE" && (
        <RavenkeeperFakeModal
          targetId={currentModal.data.targetId}
          roles={roles}
          onSelect={actions.confirmRavenkeeperFake}
        />
      )}

      <StorytellerDeathModal
        isOpen={currentModal?.type === "STORYTELLER_DEATH"}
        sourceId={
          currentModal?.type === "STORYTELLER_DEATH"
            ? currentModal.data.sourceId
            : 0
        }
        seats={seats}
        onConfirm={(targetId) => actions.confirmStorytellerDeath(targetId ?? 0)}
      />

      <SweetheartDrunkModal
        isOpen={currentModal?.type === "SWEETHEART_DRUNK"}
        sourceId={
          currentModal?.type === "SWEETHEART_DRUNK"
            ? currentModal.data.sourceId
            : 0
        }
        seats={seats}
        onConfirm={actions.confirmSweetheartDrunk}
      />

      <KlutzChoiceModal
        isOpen={currentModal?.type === "KLUTZ_CHOICE"}
        sourceId={
          currentModal?.type === "KLUTZ_CHOICE" ? currentModal.data.sourceId : 0
        }
        seats={seats}
        selectedTarget={klutzChoiceTarget}
        onSelectTarget={actions.setKlutzChoiceTarget}
        onConfirm={() => actions.confirmKlutzChoice()}
        onCancel={() => {
          actions.setCurrentModal(null);
          actions.setKlutzChoiceTarget(null);
        }}
      />

      <MoonchildKillModal
        isOpen={currentModal?.type === "MOONCHILD_KILL"}
        sourceId={
          currentModal?.type === "MOONCHILD_KILL"
            ? currentModal.data.sourceId
            : 0
        }
        seats={seats}
        onConfirm={actions.confirmMoonchildKill}
      />

      {currentModal?.type === "REVIEW" && (
        <ReviewModal
          isOpen={true}
          onClose={() => actions.setCurrentModal(null)}
          seats={seats}
          victorySnapshot={
            victorySnapshot && victorySnapshot.length > 0
              ? victorySnapshot
              : seats
          }
          gameLogs={gameLogs}
          gamePhase={gamePhase}
          winResult={winResult}
          winReason={winReason}
          isPortrait={isPortrait}
        />
      )}

      {/* 提醒标记面板 */}
      {currentModal?.type === "REMINDER_TOKENS" && (
        <ModalWrapper
          title={`🏷️ 提醒标记 — ${seats.find((s) => s.id === currentModal.data.seatId)?.playerName || `${currentModal.data.seatId + 1}号`}`}
          onClose={() => actions.setCurrentModal(null)}
        >
          <ReminderTokenPanel
            seatId={currentModal.data.seatId}
            tokens={reminderTokens?.[currentModal.data.seatId] ?? []}
            playerName={
              seats.find((s) => s.id === currentModal.data.seatId)?.playerName
            }
            onAdd={(seatId: number, token: ReminderToken) => {
              saveHistory();
              const current = reminderTokens ?? {};
              const seatTokens = current[seatId] ?? [];
              dispatch(
                gameActions.updateState({
                  reminderTokens: {
                    ...current,
                    [seatId]: [...seatTokens, token],
                  },
                })
              );
            }}
            onRemove={(seatId: number, tokenId: string) => {
              saveHistory();
              const current = reminderTokens ?? {};
              const seatTokens = (current[seatId] ?? []).filter(
                (t: ReminderToken) => t.id !== tokenId
              );
              dispatch(
                gameActions.updateState({
                  reminderTokens: { ...current, [seatId]: seatTokens },
                })
              );
            }}
            onClose={() => actions.setCurrentModal(null)}
            noOverlay
          />
        </ModalWrapper>
      )}

      <GameRecordsModal
        isOpen={currentModal?.type === "GAME_RECORDS"}
        onClose={() => actions.setCurrentModal(null)}
        gameRecords={gameRecords}
        isPortrait={isPortrait}
        onContinue={(actions as any).handleContinueGame}
      />

      <RoleInfoModal
        isOpen={currentModal?.type === "ROLE_INFO"}
        onClose={() => actions.setCurrentModal(null)}
        selectedScript={selectedScript}
        filteredGroupedRoles={actions.filteredGroupedRoles}
        roles={roles}
        groupedRoles={actions.groupedRoles}
      />

      <ExecutionResultModal
        isOpen={currentModal?.type === "EXECUTION_RESULT"}
        message={
          currentModal?.type === "EXECUTION_RESULT"
            ? currentModal.data.message
            : ""
        }
        onConfirm={actions.confirmExecutionResult}
      />

      <PacifistConfirmModal
        isOpen={!!pacifistConfirmModal}
        targetId={pacifistConfirmModal?.targetId ?? 0}
        onResolve={(saved: boolean) => {
          if (!pacifistConfirmModal) return;
          const cb = pacifistConfirmModal.onResolve;
          actions.setCurrentModal(null);
          cb(saved);
        }}
      />

      <VizierExecutionModal
        isOpen={!!vizierExecutionModal}
        targetId={vizierExecutionModal?.targetId ?? 0}
        vizierId={vizierExecutionModal?.vizierId ?? 0}
        onResolve={(execute: boolean) => {
          if (!vizierExecutionModal) return;
          const cb = vizierExecutionModal.onResolve;
          actions.setCurrentModal(null);
          cb(execute);
        }}
      />

      <ShootResultModal
        isOpen={currentModal?.type === "SHOOT_RESULT"}
        message={
          currentModal?.type === "SHOOT_RESULT" ? currentModal.data.message : ""
        }
        isDemonDead={
          currentModal?.type === "SHOOT_RESULT"
            ? currentModal.data.isDemonDead
            : false
        }
        targetId={
          currentModal?.type === "SHOOT_RESULT"
            ? currentModal.data.targetId
            : undefined
        }
        shooterId={
          currentModal?.type === "SHOOT_RESULT"
            ? currentModal.data.shooterId
            : undefined
        }
        phaseText={
          currentModal?.type === "SHOOT_RESULT"
            ? currentModal.data.phaseText
            : undefined
        }
        detail={
          currentModal?.type === "SHOOT_RESULT"
            ? currentModal.data.detail
            : undefined
        }
        onConfirm={actions.confirmShootResult}
      />

      {currentModal?.type === "SLAYER_SELECT_TARGET" && (
        <SlayerSelectTargetModal
          isOpen={true}
          shooterId={currentModal.data.shooterId}
          seats={seats}
          onConfirm={(targetId) => {
            actions.handleSlayerTargetSelect(targetId);
          }}
          onCancel={() => {
            actions.setCurrentModal(null);
          }}
        />
      )}

      {currentModal?.type === "KILL_CONFIRM" && (
        <KillConfirmModal
          targetId={currentModal.data.targetId}
          isImpSelfKill={
            !!(
              nightInfo &&
              nightInfo.effectiveRole.id === "imp" &&
              currentModal.data.targetId === nightInfo.seat.id
            )
          }
          onConfirm={actions.confirmKill}
          onCancel={() => {
            actions.setCurrentModal(null);
            actions.setSelectedActionTargets([]);
          }}
        />
      )}

      <AttackBlockedModal
        isOpen={currentModal?.type === "ATTACK_BLOCKED"}
        targetId={
          currentModal?.type === "ATTACK_BLOCKED"
            ? currentModal.data.targetId
            : 0
        }
        reason={
          currentModal?.type === "ATTACK_BLOCKED"
            ? currentModal.data.reason
            : ""
        }
        demonName={
          currentModal?.type === "ATTACK_BLOCKED"
            ? currentModal.data.demonName
            : undefined
        }
        onClose={() => actions.setCurrentModal(null)}
      />

      <PitHagModal
        isOpen={currentModal?.type === "PIT_HAG"}
        targetId={
          currentModal?.type === "PIT_HAG" ? currentModal.data.targetId : null
        }
        roleId={
          currentModal?.type === "PIT_HAG" ? currentModal.data.roleId : null
        }
        seats={seats}
        roles={roles}
        onRoleChange={(roleId) => {
          const current = currentModal;
          if (current?.type === "PIT_HAG") {
            actions.setCurrentModal({
              ...current,
              data: { ...current.data, roleId },
            });
          }
        }}
        onCancel={() => actions.setCurrentModal(null)}
        onContinue={() => {}}
      />

      <RangerModal
        isOpen={currentModal?.type === "RANGER"}
        targetId={
          currentModal?.type === "RANGER" ? currentModal.data.targetId : 0
        }
        roleId={
          currentModal?.type === "RANGER" ? currentModal.data.roleId : null
        }
        seats={seats}
        roles={roles}
        selectedScript={selectedScript}
        onRoleChange={(roleId) => {
          const current = currentModal;
          if (current?.type === "RANGER") {
            actions.setCurrentModal({
              ...current,
              data: { ...current.data, roleId },
            });
          }
        }}
        onConfirm={() => {
          const rangerModalData =
            currentModal?.type === "RANGER" ? currentModal.data : null;
          if (!rangerModalData?.roleId) {
            alert("必须选择一个未在场的镇民角色");
            return;
          }
          const newRole = roles.find(
            (r) => r.id === rangerModalData?.roleId && r.type === "townsfolk"
          );
          if (!newRole) {
            alert("角色无效，请重新选择");
            return;
          }
          const targetId = rangerModalData.targetId;
          actions.setSeats((prev: any[]) =>
            prev.map((s: any) => {
              if (s.id !== targetId) return s;
              return actions.cleanseSeatStatuses(
                {
                  ...s,
                  role: newRole,
                  charadeRole: null,
                  isDemonSuccessor: false,
                },
                { keepDeathState: true }
              );
            })
          );
          actions.addLog(
            `巡山人将 ${rangerModalData.targetId + 1}号(落难少女) 变为 ${newRole.name}`
          );
          actions.insertIntoWakeQueueAfterCurrent(rangerModalData.targetId, {
            roleOverride: newRole,
            logLabel: `${rangerModalData.targetId + 1}号(${newRole.name})`,
          });
          actions.setCurrentModal(null);
          actions.continueToNextAction();
        }}
      />

      <DamselGuessModal
        isOpen={currentModal?.type === "DAMSEL_GUESS"}
        minionId={
          currentModal?.type === "DAMSEL_GUESS"
            ? currentModal.data.minionId
            : null
        }
        targetId={
          currentModal?.type === "DAMSEL_GUESS"
            ? currentModal.data.targetId
            : null
        }
        seats={seats}
        damselGuessUsedBy={damselGuessUsedBy}
        onMinionChange={(minionId) => {
          const current = currentModal;
          if (current?.type === "DAMSEL_GUESS") {
            actions.setCurrentModal({
              ...current,
              data: { ...current.data, minionId },
            });
          }
        }}
        onTargetChange={(targetId) => {
          const current = currentModal;
          if (current?.type === "DAMSEL_GUESS") {
            actions.setCurrentModal({
              ...current,
              data: { ...current.data, targetId },
            });
          }
        }}
        onCancel={() => actions.setCurrentModal(null)}
        onConfirm={() => {
          const damselModalData =
            currentModal?.type === "DAMSEL_GUESS" ? currentModal.data : null;
          if (
            !damselModalData ||
            damselModalData.minionId === null ||
            damselModalData.targetId === null
          )
            return;
          const minionId = damselModalData.minionId;
          const guessSeat = seats.find(
            (s: any) => s.id === damselModalData.targetId
          );
          const isCorrect =
            guessSeat?.role?.id === "damsel" && !guessSeat.isDead;
          actions.setCurrentModal(null);
          actions.setDamselGuessUsedBy((prev: any[]) =>
            prev.includes(minionId) ? prev : [...prev, minionId]
          );
          if (isCorrect) {
            actions.addLog(
              `爪牙猜测成功：${damselModalData.targetId + 1}号是落难少女，邪恶获胜`
            );
            actions.checkGameOver(seats, undefined, undefined, true);
          } else {
            const updatedSeats = seats.map((s: any) =>
              s.id === minionId ? { ...s, isDead: true, isSentenced: false } : s
            );
            actions.setSeats(updatedSeats);
            actions.addLog(`${minionId + 1}号爪牙猜错落难少女，当场死亡。`);
            actions.addLog(
              `爪牙猜测失败：${damselModalData.targetId + 1}号不是落难少女`
            );
            actions.checkGameOver(updatedSeats, minionId);
          }
        }}
      />

      <ShamanConvertModal />
      <BarberSwapModal />
      <SpyDisguiseModal />
      {currentModal?.type === "SPY_RECORDS" && (
        <SpyGrimoireModal
          isOpen={true}
          onClose={() => {
            actions.setCurrentModal(null);
            actions.continueToNextAction();
          }}
          seats={seats}
          gameLogs={gameLogs}
          nightCount={nightCount}
          reminderTokens={reminderTokens}
          isPortrait={isPortrait}
        />
      )}

      {currentModal?.type === "IDENTITY_SHOWCASE" && (
        <IdentityShowcaseModal
          isOpen={true}
          onClose={() => actions.setCurrentModal(null)}
          seats={seats}
          initialSeatId={currentModal.data?.initialSeatId}
        />
      )}

      {(currentModal?.type === "ROLE_CODEX" ||
        currentModal?.type === "ROLE_INFO") && (
        <RoleCodexModal
          isOpen={true}
          onClose={() => actions.setCurrentModal(null)}
          initialRoleId={(currentModal as any).data?.roleId}
        />
      )}

      {storytellerSelectModal && (
        <StorytellerSelectModal
          sourceId={storytellerSelectModal.sourceId}
          roleId={storytellerSelectModal.roleId}
          roleName={storytellerSelectModal.roleName}
          description={storytellerSelectModal.description}
          targetCount={storytellerSelectModal.targetCount ?? 1}
          title={storytellerSelectModal.title}
          confirmLabel={storytellerSelectModal.confirmLabel}
          filterCandidates={storytellerSelectModal.filterCandidates}
          seats={seats}
          onConfirm={storytellerSelectModal.onConfirm}
          onCancel={() => actions.setCurrentModal(null)}
        />
      )}

      {drunkCharadeSelectModal && (
        <DrunkCharadeSelectModal
          isOpen={true}
          onClose={() => actions.setCurrentModal(null)}
          onConfirm={actions.handleDrunkCharadeSelect}
          drunkSeat={
            seats.find((s: any) => s.id === drunkCharadeSelectModal.seatId) ||
            null
          }
          availableTownsfolkRoles={drunkCharadeSelectModal.availableRoles}
          selectedScriptId={drunkCharadeSelectModal.scriptId}
        />
      )}

      {dreamerResultModal && (
        <DreamerResultModal
          roleA={dreamerResultModal.roleA}
          roleB={dreamerResultModal.roleB}
          onClose={() => {
            actions.setCurrentModal(null);
            actions.continueToNextAction();
          }}
        />
      )}

      {fortuneTellerResultModal && (
        <InfoResultModal
          roleName="占卜师"
          resultText={fortuneTellerResultModal.result ? "有" : "没有"}
          onConfirm={() => {
            actions.setCurrentModal(null);
            actions.continueToNextAction();
          }}
          onModify={() => {
            actions.setCurrentModal(null);
            actions.setSelectedActionTargets([]);
          }}
        />
      )}

      {infoResultModal && (
        <InfoResultModal
          roleName={infoResultModal.roleName}
          resultText={infoResultModal.resultText}
          onConfirm={() => {
            actions.setCurrentModal(null);
            // 如果有关联的下一步动作（如占卜师需要先执行能力），调用它
            if (infoResultModal.onNext) {
              infoResultModal.onNext();
            } else {
              actions.continueToNextAction();
            }
          }}
          onModify={() => {
            actions.setCurrentModal(null);
            actions.setSelectedActionTargets([]);
          }}
        />
      )}

      {artistResultModal && (
        <ArtistResultModal
          onClose={(result) => {
            if (result) {
              actions.addLog(result);
              actions.setSeats((prev: any[]) =>
                prev.map((s: any) => {
                  const isArtist =
                    s.role?.id === "artist" ||
                    (s.role?.id === "drunk" && s.charadeRole?.id === "artist");
                  return isArtist
                    ? {
                        ...s,
                        hasUsedDayAbility: true,
                        dayAbilityResult: {
                          type: "ARTIST_RESULT",
                          result,
                        },
                      }
                    : s;
                })
              );
            }
            actions.setCurrentModal(null);
          }}
        />
      )}

      {savantResultModal && (
        <SavantResultModal
          onClose={(infoA, infoB) => {
            if (infoA && infoB) {
              actions.addLog(`博学者获得信息：\n1. ${infoA}\n2. ${infoB}`);
              actions.setSeats((prev: any[]) =>
                prev.map((s: any) => {
                  const isSavant =
                    s.role?.id === "savant" ||
                    (s.role?.id === "drunk" && s.charadeRole?.id === "savant");
                  return isSavant
                    ? {
                        ...s,
                        hasUsedDayAbility: true,
                        dayAbilityResult: {
                          type: "SAVANT_RESULT",
                          infoA,
                          infoB,
                        },
                      }
                    : s;
                })
              );
            }
            actions.setCurrentModal(null);
          }}
        />
      )}

      {gamblerJudgeModal && (
        <ModalWrapper
          title="🎲 赌徒判定"
          onClose={() => actions.setCurrentModal(null)}
          className="max-w-md"
          footer={
            <div className="flex gap-3 w-full justify-end">
              <button
                onClick={() => {
                  const msg = `${gamblerJudgeModal.seatId + 1}号【赌徒】的猜测被判定为真（猜对），存活`;
                  actions.addLog(msg);
                  actions.setSeats((prev: any[]) =>
                    prev.map((s: any) =>
                      s.id === gamblerJudgeModal.seatId
                        ? {
                            ...s,
                            hasUsedDayAbility: true,
                            dayAbilityResult: {
                              type: "GAMBLER_JUDGE",
                              message: msg,
                              summary: msg,
                            },
                          }
                        : s
                    )
                  );
                  actions.setCurrentModal(null);
                }}
                className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold transition-colors"
              >
                判断为真（猜对）
              </button>
              <button
                onClick={() => {
                  actions.killPlayer(gamblerJudgeModal.seatId, {
                    source: "gambler_day",
                    recordNightDeath: true,
                  });
                  const msg = `${gamblerJudgeModal.seatId + 1}号【赌徒】的猜测被判定为假（猜错），死亡！`;
                  actions.addLog(msg);
                  actions.setSeats((prev: any[]) =>
                    prev.map((s: any) =>
                      s.id === gamblerJudgeModal.seatId
                        ? {
                            ...s,
                            hasUsedDayAbility: true,
                            dayAbilityResult: {
                              type: "GAMBLER_JUDGE",
                              message: msg,
                              summary: msg,
                            },
                          }
                        : s
                    )
                  );
                  actions.setCurrentModal(null);
                }}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl font-semibold transition-colors"
              >
                判定为假（猜错）
              </button>
            </div>
          }
        >
          <div className="text-base text-slate-200 py-2 leading-relaxed text-center">
            {gamblerJudgeModal.seatId + 1}号【赌徒】使用了「赌徒猜测」。
            <br />
            说书人判定该玩家对目标角色的猜测是否正确？
          </div>
        </ModalWrapper>
      )}

      <RestartConfirmModal
        isOpen={currentModal?.type === "RESTART_CONFIRM"}
        onConfirm={actions.confirmRestart}
        onCancel={() => actions.setCurrentModal(null)}
      />

      {nightDeathReportModal && (
        <NightDeathReportModal
          message={nightDeathReportModal.message}
          onConfirm={() => {
            if (gamePhase === "dawnReport") {
              actions.confirmNightDeathReport();
            } else {
              actions.setCurrentModal(null);
              actions.continueToNextAction();
            }
          }}
        />
      )}

      {currentModal?.type === "GENERIC_ALERT" && (
        <GenericAlertModal
          title={currentModal.data.title}
          message={currentModal.data.message}
          onClose={() => actions.setCurrentModal(null)}
        />
      )}
      {currentModal?.type === "GENERIC_CONFIRM" && (
        <GenericConfirmModal
          title={currentModal.data.title}
          message={currentModal.data.message}
          confirmLabel={currentModal.data.confirmLabel}
          cancelLabel={currentModal.data.cancelLabel}
          onConfirm={() => {
            currentModal.data.onConfirm();
            actions.setCurrentModal(null);
          }}
          onCancel={() => {
            currentModal.data.onCancel?.();
            actions.setCurrentModal(null);
          }}
        />
      )}

      {/* Overlays: 当有NIGHT_DEATH_REPORT弹窗时不重复显示DawnReportOverlay */}
      {!nightDeathReportModal && <DawnReportOverlay />}
      <GameOverOverlay />
      <PlayerContextMenu />
    </>
  );
}

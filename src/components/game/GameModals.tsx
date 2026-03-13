import React from "react";
import { roles } from "../../../app/data";
import { ModalType } from "../../types/modal";
import { ExecutionResultModal } from "../modals/ExecutionResultModal";
import { ShootResultModal } from "../modals/ShootResultModal";
import { KillConfirmModal } from "../modals/KillConfirmModal";
import { AttackBlockedModal } from "../modals/AttackBlockedModal";
import { MayorThreeAliveModal } from "../modals/MayorThreeAliveModal";
import { PoisonConfirmModal } from "../modals/PoisonConfirmModal";
import { PoisonEvilConfirmModal } from "../modals/PoisonEvilConfirmModal";
import { SaintExecutionConfirmModal } from "../modals/SaintExecutionConfirmModal";
import { LunaticRpsModal } from "../modals/LunaticRpsModal";
import { VirginTriggerModal } from "../modals/VirginTriggerModal";
import { RavenkeeperFakeModal } from "../modals/RavenkeeperFakeModal";
import { MayorRedirectModal } from "../modals/MayorRedirectModal";
import { StorytellerDeathModal } from "../modals/StorytellerDeathModal";
import { SweetheartDrunkModal } from "../modals/SweetheartDrunkModal";
import { KlutzChoiceModal } from "../modals/KlutzChoiceModal";
import { MoonchildKillModal } from "../modals/MoonchildKillModal";
import { HadesiaKillConfirmModal } from "../modals/HadesiaKillConfirmModal";
import { PitHagModal } from "../modals/PitHagModal";
import { RangerModal } from "../modals/RangerModal";
import { DamselGuessModal } from "../modals/DamselGuessModal";
import { NightDeathReportModal } from "../modals/NightDeathReportModal";
import { RestartConfirmModal } from "../modals/RestartConfirmModal";
import { ReviewModal } from "../modals/ReviewModal";
import { GameRecordsModal } from "../modals/GameRecordsModal";
import { RoleInfoModal } from "../modals/RoleInfoModal";
import { StorytellerSelectModal } from "../modals/StorytellerSelectModal";
import { PacifistConfirmModal } from "../modals/PacifistConfirmModal";
import { CourtierSelectRoleModal } from "../modals/CourtierSelectRoleModal";
import { SlayerSelectTargetModal } from "../modals/SlayerSelectTargetModal";
import { DrunkCharadeSelectModal } from "../modals/DrunkCharadeSelectModal";
import { DreamerResultModal } from "../modals/DreamerResultModal";
import { ArtistResultModal } from "../modals/ArtistResultModal";
import { SavantResultModal } from "../modals/SavantResultModal";
import { RoleSelectModal } from "../modals/RoleSelectModal";
import { MadnessCheckModal } from "../modals/MadnessCheckModal";
import { DayActionModal } from "../modals/DayActionModal";
import { VirginGuideModal } from "../modals/VirginGuideModal";
import { DayAbilityModal } from "../modals/DayAbilityModal";
import { VoteInputModalContent } from "../modals/VoteInputModal";
import { NightOrderPreviewModal } from "../modals/NightOrderPreviewModal";
import { ShamanConvertModal } from "../modals/ShamanConvertModal";
import { BarberSwapModal } from "../modals/BarberSwapModal";
import { SpyDisguiseModal } from "../modals/SpyDisguiseModal";
import { DawnReportOverlay } from "./DawnReportOverlay";
import { GameOverOverlay } from "./GameOverOverlay";
import { PlayerContextMenu } from "./PlayerContextMenu";
import { useGameActions } from "../../contexts/GameActionsContext";
import { useGameState } from "../../hooks/useGameState";

export function GameModals() {
  const actions = useGameActions();
  const gameState = useGameState();

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
  } = gameState;

  const {
    nightInfo,
  } = actions;

  // Modal data extraction
  const nightOrderModal = currentModal?.type === 'NIGHT_ORDER_PREVIEW' ? currentModal.data : null;
  const drunkCharadeSelectModal = currentModal?.type === 'DRUNK_CHARADE_SELECT' ? currentModal.data : null;
  const voteInputModal = currentModal?.type === 'VOTE_INPUT' ? currentModal.data : null;
  const roleSelectModal = currentModal?.type === 'ROLE_SELECT' ? currentModal.data : null;
  const madnessCheckModal = currentModal?.type === 'MADNESS_CHECK' ? currentModal.data : null;
  const dayActionModal = currentModal?.type === 'DAY_ACTION' ? currentModal.data : null;
  const dayAbilityModal = currentModal?.type === 'DAY_ABILITY' ? currentModal.data : null;
  const storytellerSelectModal = currentModal?.type === 'STORYTELLER_SELECT' ? currentModal.data : null;
  const pacifistConfirmModal = currentModal?.type === 'PACIFIST_CONFIRM' ? currentModal.data : null;
  const courtierSelectRoleModal = currentModal?.type === 'COURTIER_SELECT_ROLE' ? currentModal.data : null;
  const poisonConfirmModal = currentModal?.type === 'POISON_CONFIRM' ? currentModal.data : null;
  const poisonEvilConfirmModal = currentModal?.type === 'POISON_EVIL_CONFIRM' ? currentModal.data : null;
  const dreamerResultModal = currentModal?.type === 'DREAMER_RESULT' ? currentModal.data : null;
  const artistResultModal = currentModal?.type === 'ARTIST_RESULT' ? currentModal.data : null;
  const savantResultModal = currentModal?.type === 'SAVANT_RESULT' ? currentModal.data : null;
  const nightDeathReportModal = currentModal?.type === 'NIGHT_DEATH_REPORT' ? currentModal.data : null;

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

      {nightOrderModal && <NightOrderPreviewModal nightOrderModal={nightOrderModal} />}

      <MayorThreeAliveModal
        isOpen={currentModal?.type === 'MAYOR_THREE_ALIVE'}
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

      <SaintExecutionConfirmModal
        isOpen={currentModal?.type === 'SAINT_EXECUTION_CONFIRM'}
        onConfirm={actions.confirmSaintExecution}
        onCancel={actions.cancelSaintExecution}
      />

      <LunaticRpsModal
        isOpen={currentModal?.type === 'LUNATIC_RPS'}
        nominatorId={currentModal?.type === 'LUNATIC_RPS' ? currentModal.data.nominatorId : null}
        targetId={currentModal?.type === 'LUNATIC_RPS' ? currentModal.data.targetId : 0}
        onResolve={(isLoss) => {
          actions.resolveLunaticRps(isLoss ? 'lose' : 'win');
        }}
      />

      <VirginTriggerModal
        isOpen={currentModal?.type === 'VIRGIN_TRIGGER'}
        onConfirm={actions.confirmVirginTrigger}
        onCancel={() => actions.setCurrentModal(null)}
      />

      {currentModal?.type === 'RAVENKEEPER_FAKE' && (
        <RavenkeeperFakeModal
          targetId={currentModal.data.targetId}
          roles={roles}
          onSelect={actions.confirmRavenkeeperFake}
        />
      )}

      <StorytellerDeathModal
        isOpen={currentModal?.type === 'STORYTELLER_DEATH'}
        sourceId={currentModal?.type === 'STORYTELLER_DEATH' ? currentModal.data.sourceId : 0}
        seats={seats}
        onConfirm={(targetId) => actions.confirmStorytellerDeath(targetId ?? 0)}
      />

      <SweetheartDrunkModal
        isOpen={currentModal?.type === 'SWEETHEART_DRUNK'}
        sourceId={currentModal?.type === 'SWEETHEART_DRUNK' ? currentModal.data.sourceId : 0}
        seats={seats}
        onConfirm={actions.confirmSweetheartDrunk}
      />

      <KlutzChoiceModal
        isOpen={currentModal?.type === 'KLUTZ_CHOICE'}
        sourceId={currentModal?.type === 'KLUTZ_CHOICE' ? currentModal.data.sourceId : 0}
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
        isOpen={currentModal?.type === 'MOONCHILD_KILL'}
        sourceId={currentModal?.type === 'MOONCHILD_KILL' ? currentModal.data.sourceId : 0}
        seats={seats}
        onConfirm={actions.confirmMoonchildKill}
      />

      {currentModal?.type === 'REVIEW' && victorySnapshot && victorySnapshot.length > 0 && (
        <ReviewModal
          isOpen={true}
          onClose={() => actions.setCurrentModal(null)}
          seats={seats}
          victorySnapshot={victorySnapshot}
          gameLogs={gameLogs}
          gamePhase={gamePhase}
          winResult={winResult}
          winReason={winReason}
          isPortrait={isPortrait}
        />
      )}

      <GameRecordsModal
        isOpen={currentModal?.type === 'GAME_RECORDS'}
        onClose={() => actions.setCurrentModal(null)}
        gameRecords={gameRecords}
        isPortrait={isPortrait}
      />

      <RoleInfoModal
        isOpen={currentModal?.type === 'ROLE_INFO'}
        onClose={() => actions.setCurrentModal(null)}
        selectedScript={selectedScript}
        filteredGroupedRoles={actions.filteredGroupedRoles}
        roles={roles}
        groupedRoles={actions.groupedRoles}
      />

      <ExecutionResultModal
        isOpen={currentModal?.type === 'EXECUTION_RESULT'}
        message={currentModal?.type === 'EXECUTION_RESULT' ? currentModal.data.message : ''}
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

      <ShootResultModal
        isOpen={currentModal?.type === 'SHOOT_RESULT'}
        message={currentModal?.type === 'SHOOT_RESULT' ? currentModal.data.message : ''}
        isDemonDead={currentModal?.type === 'SHOOT_RESULT' ? currentModal.data.isDemonDead : false}
        onConfirm={actions.confirmShootResult}
      />

      {currentModal?.type === 'SLAYER_SELECT_TARGET' && (
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

      {currentModal?.type === 'KILL_CONFIRM' && (
        <KillConfirmModal
          targetId={currentModal.data.targetId}
          isImpSelfKill={!!(nightInfo && nightInfo.effectiveRole.id === 'imp' && currentModal.data.targetId === nightInfo.seat.id)}
          onConfirm={actions.confirmKill}
          onCancel={() => {
            actions.setCurrentModal(null);
            actions.setSelectedActionTargets([]);
          }}
        />
      )}

      <AttackBlockedModal
        isOpen={currentModal?.type === 'ATTACK_BLOCKED'}
        targetId={currentModal?.type === 'ATTACK_BLOCKED' ? currentModal.data.targetId : 0}
        reason={currentModal?.type === 'ATTACK_BLOCKED' ? currentModal.data.reason : ''}
        demonName={currentModal?.type === 'ATTACK_BLOCKED' ? currentModal.data.demonName : undefined}
        onClose={() => actions.setCurrentModal(null)}
      />

      <PitHagModal
        isOpen={currentModal?.type === 'PIT_HAG'}
        targetId={currentModal?.type === 'PIT_HAG' ? currentModal.data.targetId : null}
        roleId={currentModal?.type === 'PIT_HAG' ? currentModal.data.roleId : null}
        seats={seats}
        roles={roles}
        onRoleChange={(roleId) => {
          const current = currentModal;
          if (current?.type === 'PIT_HAG') {
            actions.setCurrentModal({ ...current, data: { ...current.data, roleId } });
          }
        }}
        onCancel={() => actions.setCurrentModal(null)}
        onContinue={() => { }}
      />

      <RangerModal
        isOpen={currentModal?.type === 'RANGER'}
        targetId={currentModal?.type === 'RANGER' ? currentModal.data.targetId : 0}
        roleId={currentModal?.type === 'RANGER' ? currentModal.data.roleId : null}
        seats={seats}
        roles={roles}
        selectedScript={selectedScript}
        onRoleChange={(roleId) => {
          const current = currentModal;
          if (current?.type === 'RANGER') {
            actions.setCurrentModal({ ...current, data: { ...current.data, roleId } });
          }
        }}
        onConfirm={() => {
          const rangerModalData = currentModal?.type === 'RANGER' ? currentModal.data : null;
          if (!rangerModalData?.roleId) {
            alert('必须选择一个未在场的镇民角色');
            return;
          }
          const newRole = roles.find(r => r.id === rangerModalData?.roleId && r.type === 'townsfolk');
          if (!newRole) {
            alert('角色无效，请重新选择');
            return;
          }
          const targetId = rangerModalData.targetId;
          actions.setSeats((prev: any[]) => prev.map((s: any) => {
            if (s.id !== targetId) return s;
            return actions.cleanseSeatStatuses({
              ...s,
              role: newRole,
              charadeRole: null,
              isDemonSuccessor: false,
            }, { keepDeathState: true });
          }));
          actions.addLog(`巡山人将 ${rangerModalData.targetId + 1}号(落难少女) 变为 ${newRole.name}`);
          actions.insertIntoWakeQueueAfterCurrent(rangerModalData.targetId, { roleOverride: newRole, logLabel: `${rangerModalData.targetId + 1}号(${newRole.name})` });
          actions.setCurrentModal(null);
          actions.continueToNextAction();
        }}
      />

      <DamselGuessModal
        isOpen={currentModal?.type === 'DAMSEL_GUESS'}
        minionId={currentModal?.type === 'DAMSEL_GUESS' ? currentModal.data.minionId : null}
        targetId={currentModal?.type === 'DAMSEL_GUESS' ? currentModal.data.targetId : null}
        seats={seats}
        damselGuessUsedBy={damselGuessUsedBy}
        onMinionChange={(minionId) => {
          const current = currentModal;
          if (current?.type === 'DAMSEL_GUESS') {
            actions.setCurrentModal({ ...current, data: { ...current.data, minionId } });
          }
        }}
        onTargetChange={(targetId) => {
          const current = currentModal;
          if (current?.type === 'DAMSEL_GUESS') {
            actions.setCurrentModal({ ...current, data: { ...current.data, targetId } });
          }
        }}
        onCancel={() => actions.setCurrentModal(null)}
        onConfirm={() => {
          const damselModalData = currentModal?.type === 'DAMSEL_GUESS' ? currentModal.data : null;
          if (!damselModalData || damselModalData.minionId === null || damselModalData.targetId === null) return;
          const minionId = damselModalData.minionId;
          const guessSeat = seats.find((s: any) => s.id === damselModalData.targetId);
          const isCorrect = guessSeat?.role?.id === 'damsel' && !guessSeat.isDead;
          actions.setCurrentModal(null);
          actions.setDamselGuessUsedBy((prev: any[]) => prev.includes(minionId) ? prev : [...prev, minionId]);
          if (isCorrect) {
            actions.addLog(`爪牙猜测成功：${damselModalData.targetId + 1}号是落难少女，邪恶获胜`);
            actions.checkGameOver(seats, undefined, undefined, true);
          } else {
            const updatedSeats = seats.map((s: any) => s.id === minionId ? { ...s, isDead: true, isSentenced: false } : s);
            actions.setSeats(updatedSeats);
            actions.addLog(`${minionId + 1}号爪牙猜错落难少女，当场死亡。`);
            actions.addLog(`爪牙猜测失败：${damselModalData.targetId + 1}号不是落难少女`);
            actions.checkGameOver(updatedSeats, minionId);
          }
        }}
      />

      <ShamanConvertModal />
      <BarberSwapModal />
      <SpyDisguiseModal />

      {storytellerSelectModal && (
        <StorytellerSelectModal
          sourceId={storytellerSelectModal.sourceId}
          roleId={storytellerSelectModal.roleId}
          roleName={storytellerSelectModal.roleName}
          description={storytellerSelectModal.description}
          targetCount={storytellerSelectModal.targetCount}
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
          drunkSeat={seats.find((s: any) => s.id === drunkCharadeSelectModal.seatId) || null}
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

      {artistResultModal && (
        <ArtistResultModal
          onClose={(result) => {
            if (result) {
              actions.addLog(result);
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
            }
            actions.setCurrentModal(null);
          }}
        />
      )}

      <RestartConfirmModal
        isOpen={currentModal?.type === 'RESTART_CONFIRM'}
        onConfirm={actions.confirmRestart}
        onCancel={() => actions.setCurrentModal(null)}
      />

      {nightDeathReportModal && (
        <NightDeathReportModal
          message={nightDeathReportModal.message}
          onConfirm={() => {
            if (gamePhase === 'dawnReport') {
              actions.confirmNightDeathReport();
            } else {
              actions.setCurrentModal(null);
              actions.continueToNextAction();
            }
          }}
        />
      )}

      {/* Overlays */}
      <DawnReportOverlay />
      <GameOverOverlay />
      <PlayerContextMenu />
    </>
  );
}

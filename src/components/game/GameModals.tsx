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

export function GameModals() {
  const props = useGameActions();

  // Modal data extraction
  const nightOrderModal = props.currentModal?.type === 'NIGHT_ORDER_PREVIEW' ? props.currentModal.data : null;
  const drunkCharadeSelectModal = props.currentModal?.type === 'DRUNK_CHARADE_SELECT' ? props.currentModal.data : null;
  const voteInputModal = props.currentModal?.type === 'VOTE_INPUT' ? props.currentModal.data : null;
  const roleSelectModal = props.currentModal?.type === 'ROLE_SELECT' ? props.currentModal.data : null;
  const madnessCheckModal = props.currentModal?.type === 'MADNESS_CHECK' ? props.currentModal.data : null;
  const dayActionModal = props.currentModal?.type === 'DAY_ACTION' ? props.currentModal.data : null;
  const dayAbilityModal = props.currentModal?.type === 'DAY_ABILITY' ? props.currentModal.data : null;
  const storytellerSelectModal = props.currentModal?.type === 'STORYTELLER_SELECT' ? props.currentModal.data : null;
  const pacifistConfirmModal = props.currentModal?.type === 'PACIFIST_CONFIRM' ? props.currentModal.data : null;
  const courtierSelectRoleModal = props.currentModal?.type === 'COURTIER_SELECT_ROLE' ? props.currentModal.data : null;
  const poisonConfirmModal = props.currentModal?.type === 'POISON_CONFIRM' ? props.currentModal.data : null;
  const poisonEvilConfirmModal = props.currentModal?.type === 'POISON_EVIL_CONFIRM' ? props.currentModal.data : null;
  const dreamerResultModal = props.currentModal?.type === 'DREAMER_RESULT' ? props.currentModal.data : null;
  const artistResultModal = props.currentModal?.type === 'ARTIST_RESULT' ? props.currentModal.data : null;
  const savantResultModal = props.currentModal?.type === 'SAVANT_RESULT' ? props.currentModal.data : null;
  const nightDeathReportModal = props.currentModal?.type === 'NIGHT_DEATH_REPORT' ? props.currentModal.data : null;

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
        isOpen={props.currentModal?.type === 'MAYOR_THREE_ALIVE'}
        onContinue={() => {
          props.setCurrentModal(null);
          props.enterDuskPhase();
        }}
        onDeclareWin={props.declareMayorImmediateWin}
        onCancel={() => props.setCurrentModal(null)}
      />

      {voteInputModal && (
        <VoteInputModalContent
          voterId={voteInputModal.voterId}
          seats={props.seats}
          registerVotes={props.registerVotes}
          submitVotes={props.submitVotes}
          setCurrentModal={props.setCurrentModal}
        />
      )}

      {roleSelectModal && <RoleSelectModal modal={roleSelectModal} />}
      {madnessCheckModal && <MadnessCheckModal modal={madnessCheckModal} />}
      {dayActionModal && <DayActionModal modal={dayActionModal} />}
      {props.virginGuideInfo && <VirginGuideModal />}
      {dayAbilityModal && <DayAbilityModal modal={dayAbilityModal} />}

      {poisonConfirmModal && (
        <PoisonConfirmModal
          targetId={poisonConfirmModal.targetId}
          onConfirm={props.confirmPoison}
          onCancel={() => {
            props.setCurrentModal(null);
            props.setSelectedActionTargets([]);
          }}
        />
      )}

      {poisonEvilConfirmModal && (
        <PoisonEvilConfirmModal
          targetId={poisonEvilConfirmModal.targetId}
          onConfirm={() => {
            if (poisonEvilConfirmModal.targetId !== undefined) {
              props.confirmPoisonEvil();
              props.setCurrentModal(null);
            }
          }}
          onCancel={() => {
            props.setCurrentModal(null);
            props.setSelectedActionTargets([]);
          }}
        />
      )}

      <SaintExecutionConfirmModal
        isOpen={props.currentModal?.type === 'SAINT_EXECUTION_CONFIRM'}
        onConfirm={props.confirmSaintExecution}
        onCancel={props.cancelSaintExecution}
      />

      <LunaticRpsModal
        isOpen={props.currentModal?.type === 'LUNATIC_RPS'}
        nominatorId={props.currentModal?.type === 'LUNATIC_RPS' ? props.currentModal.data.nominatorId : null}
        targetId={props.currentModal?.type === 'LUNATIC_RPS' ? props.currentModal.data.targetId : 0}
        onResolve={(isLoss) => {
          props.resolveLunaticRps(isLoss ? 'lose' : 'win');
        }}
      />

      <VirginTriggerModal
        isOpen={props.currentModal?.type === 'VIRGIN_TRIGGER'}
        onConfirm={props.confirmVirginTrigger}
        onCancel={() => props.setCurrentModal(null)}
      />

      {props.currentModal?.type === 'RAVENKEEPER_FAKE' && (
        <RavenkeeperFakeModal
          targetId={props.currentModal.data.targetId}
          roles={roles}
          onSelect={props.confirmRavenkeeperFake}
        />
      )}

      <StorytellerDeathModal
        isOpen={props.currentModal?.type === 'STORYTELLER_DEATH'}
        sourceId={props.currentModal?.type === 'STORYTELLER_DEATH' ? props.currentModal.data.sourceId : 0}
        seats={props.seats}
        onConfirm={(targetId) => props.confirmStorytellerDeath(targetId ?? 0)}
      />

      <SweetheartDrunkModal
        isOpen={props.currentModal?.type === 'SWEETHEART_DRUNK'}
        sourceId={props.currentModal?.type === 'SWEETHEART_DRUNK' ? props.currentModal.data.sourceId : 0}
        seats={props.seats}
        onConfirm={props.confirmSweetheartDrunk}
      />

      <KlutzChoiceModal
        isOpen={props.currentModal?.type === 'KLUTZ_CHOICE'}
        sourceId={props.currentModal?.type === 'KLUTZ_CHOICE' ? props.currentModal.data.sourceId : 0}
        seats={props.seats}
        selectedTarget={props.klutzChoiceTarget}
        onSelectTarget={props.setKlutzChoiceTarget}
        onConfirm={() => props.confirmKlutzChoice()}
        onCancel={() => {
          props.setCurrentModal(null);
          props.setKlutzChoiceTarget(null);
        }}
      />

      <MoonchildKillModal
        isOpen={props.currentModal?.type === 'MOONCHILD_KILL'}
        sourceId={props.currentModal?.type === 'MOONCHILD_KILL' ? props.currentModal.data.sourceId : 0}
        seats={props.seats}
        onConfirm={props.confirmMoonchildKill}
      />

      <ReviewModal
        isOpen={props.currentModal?.type === 'REVIEW'}
        onClose={() => props.setCurrentModal(null)}
        seats={props.seats}
        gameLogs={props.gameLogs}
        gamePhase={props.gamePhase}
        winResult={props.winResult}
        winReason={props.winReason}
        isPortrait={props.isPortrait}
      />

      <GameRecordsModal
        isOpen={props.currentModal?.type === 'GAME_RECORDS'}
        onClose={() => props.setCurrentModal(null)}
        gameRecords={props.gameRecords}
        isPortrait={props.isPortrait}
      />

      <RoleInfoModal
        isOpen={props.currentModal?.type === 'ROLE_INFO'}
        onClose={() => props.setCurrentModal(null)}
        selectedScript={props.selectedScript}
        filteredGroupedRoles={props.filteredGroupedRoles}
        roles={roles}
        groupedRoles={props.groupedRoles}
      />

      <ExecutionResultModal
        isOpen={props.currentModal?.type === 'EXECUTION_RESULT'}
        message={props.currentModal?.type === 'EXECUTION_RESULT' ? props.currentModal.data.message : ''}
        onConfirm={props.confirmExecutionResult}
      />

      <PacifistConfirmModal
        isOpen={!!pacifistConfirmModal}
        targetId={pacifistConfirmModal?.targetId ?? 0}
        onResolve={(saved: boolean) => {
          if (!pacifistConfirmModal) return;
          const cb = pacifistConfirmModal.onResolve;
          props.setCurrentModal(null);
          cb(saved);
        }}
      />

      <ShootResultModal
        isOpen={props.currentModal?.type === 'SHOOT_RESULT'}
        message={props.currentModal?.type === 'SHOOT_RESULT' ? props.currentModal.data.message : ''}
        isDemonDead={props.currentModal?.type === 'SHOOT_RESULT' ? props.currentModal.data.isDemonDead : false}
        onConfirm={props.confirmShootResult}
      />

      {props.currentModal?.type === 'SLAYER_SELECT_TARGET' && (
        <SlayerSelectTargetModal
          isOpen={true}
          shooterId={props.currentModal.data.shooterId}
          seats={props.seats}
          onConfirm={(targetId) => {
            props.handleSlayerTargetSelect(targetId);
          }}
          onCancel={() => {
            props.setCurrentModal(null);
          }}
        />
      )}

      {props.currentModal?.type === 'KILL_CONFIRM' && (
        <KillConfirmModal
          targetId={props.currentModal.data.targetId}
          isImpSelfKill={!!(props.nightInfo && props.nightInfo.effectiveRole.id === 'imp' && props.currentModal.data.targetId === props.nightInfo.seat.id)}
          onConfirm={props.confirmKill}
          onCancel={() => {
            props.setCurrentModal(null);
            props.setSelectedActionTargets([]);
          }}
        />
      )}

      <AttackBlockedModal
        isOpen={props.currentModal?.type === 'ATTACK_BLOCKED'}
        targetId={props.currentModal?.type === 'ATTACK_BLOCKED' ? props.currentModal.data.targetId : 0}
        reason={props.currentModal?.type === 'ATTACK_BLOCKED' ? props.currentModal.data.reason : ''}
        demonName={props.currentModal?.type === 'ATTACK_BLOCKED' ? props.currentModal.data.demonName : undefined}
        onClose={() => props.setCurrentModal(null)}
      />

      <PitHagModal
        isOpen={props.currentModal?.type === 'PIT_HAG'}
        targetId={props.currentModal?.type === 'PIT_HAG' ? props.currentModal.data.targetId : null}
        roleId={props.currentModal?.type === 'PIT_HAG' ? props.currentModal.data.roleId : null}
        seats={props.seats}
        roles={roles}
        onRoleChange={(roleId) => {
          const current = props.currentModal;
          if (current?.type === 'PIT_HAG') {
            props.setCurrentModal({ ...current, data: { ...current.data, roleId } });
          }
        }}
        onCancel={() => props.setCurrentModal(null)}
        onContinue={() => { }}
      />

      <RangerModal
        isOpen={props.currentModal?.type === 'RANGER'}
        targetId={props.currentModal?.type === 'RANGER' ? props.currentModal.data.targetId : 0}
        roleId={props.currentModal?.type === 'RANGER' ? props.currentModal.data.roleId : null}
        seats={props.seats}
        roles={roles}
        selectedScript={props.selectedScript}
        onRoleChange={(roleId) => {
          const current = props.currentModal;
          if (current?.type === 'RANGER') {
            props.setCurrentModal({ ...current, data: { ...current.data, roleId } });
          }
        }}
        onConfirm={() => {
          const rangerModalData = props.currentModal?.type === 'RANGER' ? props.currentModal.data : null;
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
          props.setSeats((prev: any[]) => prev.map((s: any) => {
            if (s.id !== targetId) return s;
            return props.cleanseSeatStatuses({
              ...s,
              role: newRole,
              charadeRole: null,
              isDemonSuccessor: false,
            }, { keepDeathState: true });
          }));
          props.addLog(`巡山人将 ${rangerModalData.targetId + 1}号(落难少女) 变为 ${newRole.name}`);
          props.insertIntoWakeQueueAfterCurrent(rangerModalData.targetId, { roleOverride: newRole, logLabel: `${rangerModalData.targetId + 1}号(${newRole.name})` });
          props.setCurrentModal(null);
          props.continueToNextAction();
        }}
      />

      <DamselGuessModal
        isOpen={props.currentModal?.type === 'DAMSEL_GUESS'}
        minionId={props.currentModal?.type === 'DAMSEL_GUESS' ? props.currentModal.data.minionId : null}
        targetId={props.currentModal?.type === 'DAMSEL_GUESS' ? props.currentModal.data.targetId : null}
        seats={props.seats}
        damselGuessUsedBy={props.damselGuessUsedBy}
        onMinionChange={(minionId) => {
          const current = props.currentModal;
          if (current?.type === 'DAMSEL_GUESS') {
            props.setCurrentModal({ ...current, data: { ...current.data, minionId } });
          }
        }}
        onTargetChange={(targetId) => {
          const current = props.currentModal;
          if (current?.type === 'DAMSEL_GUESS') {
            props.setCurrentModal({ ...current, data: { ...current.data, targetId } });
          }
        }}
        onCancel={() => props.setCurrentModal(null)}
        onConfirm={() => {
          const damselModalData = props.currentModal?.type === 'DAMSEL_GUESS' ? props.currentModal.data : null;
          if (!damselModalData || damselModalData.minionId === null || damselModalData.targetId === null) return;
          const minionId = damselModalData.minionId;
          const guessSeat = props.seats.find((s: any) => s.id === damselModalData.targetId);
          const isCorrect = guessSeat?.role?.id === 'damsel' && !guessSeat.isDead;
          props.setCurrentModal(null);
          props.setDamselGuessUsedBy((prev: any[]) => prev.includes(minionId) ? prev : [...prev, minionId]);
          if (isCorrect) {
            props.addLog(`爪牙猜测成功：${damselModalData.targetId + 1}号是落难少女，邪恶获胜`);
            props.checkGameOver(props.seats, undefined, undefined, true);
          } else {
            const updatedSeats = props.seats.map((s: any) => s.id === minionId ? { ...s, isDead: true, isSentenced: false } : s);
            props.setSeats(updatedSeats);
            props.addLog(`${minionId + 1}号爪牙猜错落难少女，当场死亡。`);
            props.addLog(`爪牙猜测失败：${damselModalData.targetId + 1}号不是落难少女`);
            props.checkGameOver(updatedSeats, minionId);
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
          seats={props.seats}
          onConfirm={storytellerSelectModal.onConfirm}
          onCancel={() => props.setCurrentModal(null)}
        />
      )}

      {drunkCharadeSelectModal && (
        <DrunkCharadeSelectModal
          isOpen={true}
          onClose={() => props.setCurrentModal(null)}
          onConfirm={props.handleDrunkCharadeSelect}
          drunkSeat={props.seats.find((s: any) => s.id === drunkCharadeSelectModal.seatId) || null}
          availableTownsfolkRoles={drunkCharadeSelectModal.availableRoles}
          selectedScriptId={drunkCharadeSelectModal.scriptId}
        />
      )}

      {dreamerResultModal && (
        <DreamerResultModal
          roleA={dreamerResultModal.roleA}
          roleB={dreamerResultModal.roleB}
          onClose={() => {
            props.setCurrentModal(null);
            props.continueToNextAction();
          }}
        />
      )}

      {artistResultModal && (
        <ArtistResultModal
          onClose={(result) => {
            if (result) {
              props.addLog(result);
            }
            props.setCurrentModal(null);
          }}
        />
      )}

      {savantResultModal && (
        <SavantResultModal
          onClose={(infoA, infoB) => {
            if (infoA && infoB) {
              props.addLog(`博学者获得信息：\n1. ${infoA}\n2. ${infoB}`);
            }
            props.setCurrentModal(null);
          }}
        />
      )}

      <RestartConfirmModal
        isOpen={props.currentModal?.type === 'RESTART_CONFIRM'}
        onConfirm={props.confirmRestart}
        onCancel={() => props.setCurrentModal(null)}
      />

      {nightDeathReportModal && (
        <NightDeathReportModal
          message={nightDeathReportModal.message}
          onConfirm={() => {
            if (props.gamePhase === 'dawnReport') {
              props.confirmNightDeathReport();
            } else {
              props.setCurrentModal(null);
              props.continueToNextAction();
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

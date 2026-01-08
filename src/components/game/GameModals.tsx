import { Role, Seat, GamePhase, WinResult, Script, RoleType } from "../../../app/data";
import { NightInfoResult, GameRecord } from "../../types/game";
import { ModalWrapper } from "../modals/ModalWrapper";
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
import { RegistrationResult } from "../../utils/gameRules";

// 定义所有 Modal 组件需要的 Props 接口
export interface GameModalsProps {
  // ========== 状态变量 ==========
  // Modal 显示状态
  showNightOrderModal: boolean;
  showExecutionResultModal: { message: string; isVirginTrigger?: boolean } | null;
  showShootResultModal: { message: string; isDemonDead: boolean } | null;
  showKillConfirmModal: number | null;
  showAttackBlockedModal: { targetId: number; reason: string; demonName?: string } | null;
  showPitHagModal: { targetId: number | null; roleId: string | null } | null;
  showRangerModal: { targetId: number; roleId: string | null } | null;
  showDamselGuessModal: { minionId: number | null; targetId: number | null } | null;
  showShamanConvertModal: boolean;
  showBarberSwapModal: { demonId: number; firstId: number | null; secondId: number | null } | null;
  showHadesiaKillConfirmModal: number[] | null;
  showMayorRedirectModal: { targetId: number; demonName: string } | null;
  showPoisonConfirmModal: number | null;
  showPoisonEvilConfirmModal: number | null;
  showNightDeathReportModal: string | null;
  showRestartConfirmModal: boolean;
  showSpyDisguiseModal: boolean;
  showMayorThreeAliveModal: boolean;
  showDrunkModal: number | null;
  showVoteInputModal: number | null;
  showRoleSelectModal: {
    type: 'philosopher' | 'cerenovus' | 'pit_hag';
    targetId: number;
    onConfirm: (roleId: string) => void;
  } | null;
  showMadnessCheckModal: { targetId: number; roleName: string; day: number } | null;
  showDayActionModal: { type: 'slayer' | 'nominate' | 'lunaticKill'; sourceId: number } | null;
  virginGuideInfo: {
    targetId: number;
    nominatorId: number;
    isFirstTime: boolean;
    nominatorIsTownsfolk: boolean;
  } | null;
  showDayAbilityModal: {
    roleId: string;
    seatId: number;
  } | null;
  showSaintExecutionConfirmModal: { targetId: number } | null;
  showLunaticRpsModal: { targetId: number; nominatorId: number | null } | null;
  showVirginTriggerModal: { source: Seat; target: Seat } | null;
  showRavenkeeperFakeModal: number | null;
  showStorytellerDeathModal: { sourceId: number } | null;
  showSweetheartDrunkModal: { sourceId: number; onResolve: (latestSeats?: Seat[]) => void } | null;
  showKlutzChoiceModal: { sourceId: number; onResolve?: (latestSeats?: Seat[]) => void } | null;
  showMoonchildKillModal: { sourceId: number; onResolve: (latestSeats?: Seat[]) => void } | null;
  showReviewModal: boolean;
  showGameRecordsModal: boolean;
  showRoleInfoModal: boolean;
  contextMenu: { seatId: number; x: number; y: number } | null;
  
  // 游戏状态
  gamePhase: GamePhase;
  winResult: WinResult;
  winReason: string | null;
  deadThisNight: number[];
  nightOrderPreview: Array<{ roleName: string; seatNo: number; order: number | null }>;
  nightQueuePreviewTitle: string | null;
  shamanConvertTarget: number | null;
  mayorRedirectTarget: number | null;
  spyDisguiseMode: 'off' | 'default' | 'on';
  spyDisguiseProbability: number;
  klutzChoiceTarget: number | null;
  voteInputValue: string;
  showVoteErrorToast: boolean;
  voteRecords: Array<{ voterId: number; isDemon: boolean }>;
  dayAbilityForm: {
    info1?: string;
    info2?: string;
    guess?: string;
    feedback?: string;
    advice?: string;
    engineerMode?: 'demon' | 'minion';
    engineerRoleId?: string;
  };
  damselGuessUsedBy: number[];
  hadesiaChoices: Record<number, 'live' | 'die'>;
  selectedScript: Script | null;
  setDayAbilityLogs: (value: Array<{ id: number; roleId: string; text: string; day: number }> | ((prev: Array<{ id: number; roleId: string; text: string; day: number }>) => Array<{ id: number; roleId: string; text: string; day: number }>)) => void;
  setDamselGuessed: (value: boolean) => void;
  setShamanTriggered: (value: boolean) => void;
  setHadesiaChoice: (id: number, choice: 'live' | 'die') => void;
  
  // 数据
  seats: Seat[];
  roles: Role[];
  filteredGroupedRoles: Record<string, Role[]>;
  groupedRoles: Record<string, Role[]>;
  gameLogs: Array<{ day: number; phase: string; message: string }>;
  gameRecords: GameRecord[];
  isPortrait: boolean;
  nightInfo: NightInfoResult | null;
  selectedActionTargets: number[];
  initialSeats: Seat[];
  nominationRecords: {
    nominees: Set<number>;
    nominators: Set<number>;
  };
  evilTwinPair: [number, number] | null;
  remainingDays: number | null;
  cerenovusTarget: number | null;
  nightCount: number;
  currentStepIndex: number;
  timeline: import("../../types/game").TimelineStep[];
  history: Array<{ seats: Seat[]; gamePhase: GamePhase }>;
  isConfirmDisabled: boolean;
  
  // ========== 函数 ==========
  // Modal 控制函数
  closeNightOrderPreview: () => void;
  confirmNightOrderPreview: () => void;
  confirmExecutionResult: () => void;
  confirmShootResult: () => void;
  confirmKill: () => void;
  confirmPoison: () => void;
  confirmPoisonEvil: () => void;
  confirmNightDeathReport: () => void;
  confirmRestart: () => void;
  confirmHadesia: () => void;
  confirmMayorRedirect: (targetId: number | null) => void;
  confirmStorytellerDeath: (targetId: number) => void;
  confirmSweetheartDrunk: (targetId: number) => void;
  confirmKlutzChoice: () => void;
  confirmMoonchildKill: (targetId: number) => void;
  confirmRavenkeeperFake: (role: Role) => void;
  confirmVirginTrigger: () => void;
  resolveLunaticRps: (result: 'win' | 'lose' | 'tie') => void;
  confirmSaintExecution: () => void;
  cancelSaintExecution: () => void;
  handleVirginGuideConfirm: () => void;
  handleDayAction: (targetId: number) => void;
  submitVotes: (voteCount: number) => void;
  confirmDrunkCharade: (role: Role) => void;
  handleNewGame: () => void;
  enterDuskPhase: () => void;
  declareMayorImmediateWin: () => void;
  executePlayer: (playerId: number) => void;
  saveHistory: () => void;
  markDailyAbilityUsed: (roleId: string, seatId: number) => void;
  markAbilityUsed: (roleId: string, seatId: number) => void;
  insertIntoWakeQueueAfterCurrent: (seatId: number, options?: { roleOverride?: Role; logLabel?: string }) => void;
  continueToNextAction: () => void;
  addLog: (message: string) => void;
  checkGameOver: (updatedSeats: Seat[], deadPlayerId?: number) => void;
  
  // Setter 函数
  setShowKillConfirmModal: (value: number | null) => void;
  setShowPoisonConfirmModal: (value: number | null) => void;
  setShowPoisonEvilConfirmModal: (value: number | null) => void;
  setShowHadesiaKillConfirmModal: (value: number[] | null) => void;
  setShowRavenkeeperFakeModal: (value: number | null) => void;
  setShowMoonchildKillModal: (value: { sourceId: number; onResolve: (latestSeats?: Seat[]) => void } | null) => void;
  setShowBarberSwapModal: (value: { demonId: number; firstId: number | null; secondId: number | null } | null | ((prev: { demonId: number; firstId: number | null; secondId: number | null } | null) => { demonId: number; firstId: number | null; secondId: number | null } | null)) => void;
  setShowStorytellerDeathModal: (value: { sourceId: number } | null) => void;
  setShowSweetheartDrunkModal: (value: { sourceId: number; onResolve: (latestSeats?: Seat[]) => void } | null) => void;
  setShowKlutzChoiceModal: (value: { sourceId: number; onResolve?: (latestSeats?: Seat[]) => void } | null) => void;
  setShowPitHagModal: (value: { targetId: number | null; roleId: string | null } | null | ((prev: { targetId: number | null; roleId: string | null } | null) => { targetId: number | null; roleId: string | null } | null)) => void;
  setShowRangerModal: (value: { targetId: number; roleId: string | null } | null | ((prev: { targetId: number; roleId: string | null } | null) => { targetId: number; roleId: string | null } | null)) => void;
  setShowDamselGuessModal: (value: { minionId: number | null; targetId: number | null } | null | ((prev: { minionId: number | null; targetId: number | null } | null) => { minionId: number | null; targetId: number | null } | null)) => void;
  setShowShamanConvertModal: (value: boolean) => void;
  setShowMayorRedirectModal: (value: { targetId: number; demonName: string } | null) => void;
  setShowNightDeathReportModal: (value: string | null) => void;
  setShowRestartConfirmModal: (value: boolean) => void;
  setShowSpyDisguiseModal: (value: boolean) => void;
  setShowMayorThreeAliveModal: (value: boolean) => void;
  setShowDrunkModal: (value: number | null) => void;
  setShowVoteInputModal: (value: number | null) => void;
  setShowRoleSelectModal: (value: { type: 'philosopher' | 'cerenovus' | 'pit_hag'; targetId: number; onConfirm: (roleId: string) => void } | null) => void;
  setShowMadnessCheckModal: (value: { targetId: number; roleName: string; day: number } | null) => void;
  setShowAttackBlockedModal: (value: { targetId: number; reason: string; demonName?: string } | null) => void;
  setShowDayActionModal: (value: { type: 'slayer' | 'nominate' | 'lunaticKill'; sourceId: number } | null) => void;
  setVirginGuideInfo: (value: { targetId: number; nominatorId: number; isFirstTime: boolean; nominatorIsTownsfolk: boolean } | null | ((prev: { targetId: number; nominatorId: number; isFirstTime: boolean; nominatorIsTownsfolk: boolean } | null) => { targetId: number; nominatorId: number; isFirstTime: boolean; nominatorIsTownsfolk: boolean } | null)) => void;
  setShowDayAbilityModal: (value: { roleId: string; seatId: number } | null) => void;
  setShowSaintExecutionConfirmModal: (value: { targetId: number } | null) => void;
  setShowLunaticRpsModal: (value: { targetId: number; nominatorId: number | null } | null) => void;
  setShowVirginTriggerModal: (value: { source: Seat; target: Seat } | null) => void;
  setShowReviewModal: (value: boolean) => void;
  setShowGameRecordsModal: (value: boolean) => void;
  setShowRoleInfoModal: (value: boolean) => void;
  setContextMenu: (value: { seatId: number; x: number; y: number } | null) => void;
  setShamanConvertTarget: (value: number | null) => void;
  setMayorRedirectTarget: (value: number | null) => void;
  setSpyDisguiseMode: (value: 'off' | 'default' | 'on') => void;
  setSpyDisguiseProbability: (value: number) => void;
  setKlutzChoiceTarget: (value: number | null) => void;
  setVoteInputValue: (value: string) => void;
  setShowVoteErrorToast: (value: boolean) => void;
  setVoteRecords: (value: Array<{ voterId: number; isDemon: boolean }> | ((prev: Array<{ voterId: number; isDemon: boolean }>) => Array<{ voterId: number; isDemon: boolean }>)) => void;
  setDayAbilityForm: (value: { info1?: string; info2?: string; guess?: string; feedback?: string; advice?: string; engineerMode?: 'demon' | 'minion'; engineerRoleId?: string } | ((prev: { info1?: string; info2?: string; guess?: string; feedback?: string; advice?: string; engineerMode?: 'demon' | 'minion'; engineerRoleId?: string }) => { info1?: string; info2?: string; guess?: string; feedback?: string; advice?: string; engineerMode?: 'demon' | 'minion'; engineerRoleId?: string })) => void;
  setDamselGuessUsedBy: (value: number[] | ((prev: number[]) => number[])) => void;
  setHadesiaChoices: (value: Record<number, 'live' | 'die'> | ((prev: Record<number, 'live' | 'die'>) => Record<number, 'live' | 'die'>)) => void;
  setWinResult: (value: WinResult) => void;
  setWinReason: (value: string | null) => void;
  setSelectedActionTargets: (value: number[] | ((prev: number[]) => number[])) => void;
  setTodayDemonVoted: (value: boolean) => void;
  setSeats: (value: Seat[] | ((prev: Seat[]) => Seat[])) => void;
  setGamePhase: (value: GamePhase) => void;
  setShowShootModal: (value: number | null) => void;
  setShowNominateModal: (value: number | null) => void;
  
  // 工具函数
  handleSeatClick: (seatId: number) => void;
  toggleStatus: (status: string, seatId?: number) => void;
  handleMenuAction: (action: string) => void;
  getRegistrationCached: (target: Seat, viewingRole: Role) => RegistrationResult;
  isGoodAlignment: (seat: Seat) => boolean;
  getSeatRoleId: (seat?: Seat | null) => string | null;
  cleanseSeatStatuses: (seat: Seat, opts?: { keepDeathState?: boolean }) => Seat;
  typeLabels: Record<string, string>;
  typeColors: Record<string, string>;
  typeBgColors: Record<string, string>;
}

// 空的骨架组件
export function GameModals(props: GameModalsProps) {
  return (
    <>
      {/* Modals */}
      {props.showNightOrderModal && (
        <ModalWrapper
          title={props.nightQueuePreviewTitle || '🌙 今晚要唤醒的顺序列表'}
          onClose={props.closeNightOrderPreview}
          className="max-w-4xl border-4 border-yellow-500"
          closeOnOverlayClick={true}
          footer={
            <>
              <button
                onClick={props.closeNightOrderPreview}
                className="px-6 py-3 rounded-xl bg-gray-700 text-gray-100 font-bold hover:bg-gray-600 transition"
              >
                返回调整
              </button>
              <button
                onClick={props.confirmNightOrderPreview}
                className="px-6 py-3 rounded-xl bg-green-600 text-white font-bold hover:bg-green-500 transition"
              >
                确认无误，入夜
              </button>
            </>
          }
        >
          <p className="text-sm text-gray-200 text-center mb-4">
            请核对今晚要叫醒的所有角色顺序。你可以点击"返回调整"继续修改座位/身份，或点击"确认"正式进入夜晚流程。
          </p>
          <div className="grid grid-cols-1 gap-3">
            {props.nightOrderPreview.map((item, idx) => (
              <div key={`${item.roleName}-${item.seatNo}-${idx}`} className="p-3 rounded-xl border border-gray-700 bg-gray-800/80 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-sm text-gray-400">顺位 {item.order || '—'}</span>
                  <span className="text-base font-bold text-white">[{item.seatNo}号] {item.roleName}</span>
                </div>
                <span className="text-xs text-gray-500">第{idx + 1} 唤醒</span>
              </div>
            ))}
          </div>
        </ModalWrapper>
      )}
      <MayorThreeAliveModal
        isOpen={props.showMayorThreeAliveModal}
        onContinue={() => {
          props.setShowMayorThreeAliveModal(false);
          props.enterDuskPhase();
        }}
        onDeclareWin={props.declareMayorImmediateWin}
        onCancel={() => props.setShowMayorThreeAliveModal(false)}
      />
      {props.showDrunkModal!==null && (
        <div className="fixed inset-0 z-[3000] bg-black/95 flex items-center justify-center">
          <div className="bg-gray-800 p-8 rounded-2xl w-[800px] max-w-[95vw] border-2 border-yellow-500">
            <h2 className="mb-3 text-center text-3xl text-yellow-400">🍺 酒鬼伪装向导</h2>
            <div className="space-y-2 text-sm text-gray-200 mb-4">
              <p>请选择一张【镇民】卡作为酒鬼的伪装。选定后系统会自动记录为 charadeRole。</p>
              <p className="text-yellow-300">给玩家看的台词：请把「所选镇民卡」给该玩家看，并说"你是 {`<所选镇民>`}”。</p>
              <p className="text-gray-300">实际身份仍为【酒鬼】，后续信息系统会按中毒/酒鬼规则处理。</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[60vh] overflow-y-auto">
              {(props.filteredGroupedRoles['townsfolk'] || []).map(r=>{
                const isTaken = props.seats.some(s => s.role?.id === r.id);
                return (
                  <button 
                    key={r.id}
                    type="button"
                    disabled={isTaken}
                    onClick={()=>!isTaken && props.confirmDrunkCharade(r)} 
                    className={`p-3 border-2 rounded-xl text-base font-bold text-left ${
                      isTaken
                        ? 'border-gray-700 bg-gray-900/70 text-gray-500 cursor-not-allowed opacity-60'
                        : 'border-blue-500 bg-gray-900 hover:bg-blue-900 cursor-pointer'
                    }`}
                    title={isTaken ? '该角色已在本局中出现，不能作为酒鬼伪装' : ''}
                  >
                    <div className="flex flex-col">
                      <span>{r.name}</span>
                      {isTaken && (
                        <span className="text-xs text-gray-500 mt-1">
                          （该角色已在场上，规则：酒鬼不得伪装为已存在角色）
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="mt-6 flex justify-end">
              <button 
                onClick={()=>props.setShowDrunkModal(null)}
                className="px-4 py-2 bg-gray-700 rounded-lg font-bold"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
      
      {props.showVoteInputModal!==null && (
        <div className="fixed inset-0 z-[3000] bg-black/90 flex items-center justify-center">
          <div className="bg-gray-800 p-8 rounded-2xl text-center border-2 border-blue-500 relative">
            <h3 className="text-3xl font-bold mb-4">🗳️ 输入票数</h3>
            <div className="mb-6 p-3 bg-yellow-900/30 border border-yellow-700/50 rounded-lg text-sm text-yellow-200">
              <p className="font-semibold">注意：请自行确保每名死亡玩家在本局只使用一次"死人票"。本工具不会替你追踪死人票次数。</p>
              {(() => {
                const ghostHolders = props.seats
                  .filter(s => s.isDead && s.hasGhostVote !== false)
                  .map(s => `${s.id + 1}号`);
                return (
                  <div className="mt-2 text-xs text-yellow-100">
                    场上仍有死者票的玩家：{ghostHolders.length ? ghostHolders.join('、') : '无'}
                  </div>
                );
              })()}
            </div>
            <div className="mb-6">
              <input 
                autoFocus 
                type="number" 
                min="1"
                max={props.initialSeats.length > 0 
                  ? props.initialSeats.filter(s => s.role !== null).length 
                  : props.seats.filter(s => s.role !== null).length}
                step="1"
                value={props.voteInputValue}
                className="w-full p-4 bg-gray-700 rounded-xl text-center text-4xl font-mono" 
                onChange={(e) => {
                const value = e.target.value;
                const initialPlayerCount = props.initialSeats.length > 0 
                  ? props.initialSeats.filter(s => s.role !== null).length 
                  : props.seats.filter(s => s.role !== null).length;
                
                // 如果输入为空，允许继续输入
                if (value === '') {
                  props.setVoteInputValue('');
                  return;
                }
                
                  const numValue = parseInt(value);
                  // 检查是否符合要求：必须是有效数字，且不超过开局时的玩家数
                  if (isNaN(numValue) || numValue < 1 || !Number.isInteger(numValue) || numValue > initialPlayerCount) {
                    // 不符合要求，清空输入并显示浮窗
                    props.setVoteInputValue('');
                    props.setShowVoteErrorToast(true);
                    // 3秒后自动消失
                    setTimeout(() => {
                      props.setShowVoteErrorToast(false);
                    }, 3000);
                  } else {
                    // 符合要求，更新输入值
                    props.setVoteInputValue(value);
                  }
                }}
                onKeyDown={(e)=>{if(e.key==='Enter')props.submitVotes(parseInt(props.voteInputValue)||0)}} 
              />
              {props.showVoteErrorToast && (
                <div 
                  className="mt-2 bg-red-600/30 text-white text-sm px-4 py-2 rounded-lg shadow-lg"
                >
                  票数不得超过开局时的玩家数
                </div>
              )}
            </div>
            <div className="mb-4">
              <label className="flex items-center gap-2 text-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={props.voteRecords.some(r => r.voterId === props.showVoteInputModal && r.isDemon)}
                  onChange={(e) => {
                    const isDemon = e.target.checked;
                    props.setVoteRecords((prev: Array<{ voterId: number; isDemon: boolean }>) => {
                      const voterId = props.showVoteInputModal;
                      if (voterId === null) return prev;
                      const filtered = prev.filter(r => r.voterId !== voterId);
                      const newRecords = [...filtered, { voterId, isDemon }];
                      // 更新 todayDemonVoted 状态
                      if (isDemon) {
                        props.setTodayDemonVoted(true);
                      } else {
                        // 检查是否还有其他恶魔投票
                        const hasOtherDemonVote = filtered.some(r => r.isDemon);
                        props.setTodayDemonVoted(hasOtherDemonVote);
                      }
                      return newRecords;
                    });
                  }}
                  className="w-5 h-5"
                />
                <span>投票者是恶魔（用于卖花女孩）</span>
              </label>
            </div>
            <button 
              onClick={()=>props.submitVotes(parseInt(props.voteInputValue)||0)} 
              className="w-full py-4 bg-indigo-600 rounded-xl text-2xl font-bold"
            >
              确认
            </button>
          </div>
        </div>
      )}
      
      {props.showRoleSelectModal && (() => {
        const modal = props.showRoleSelectModal;
        return (
        <div className="fixed inset-0 z-[3000] bg-black/90 flex items-center justify-center">
          <div className="bg-gray-800 p-8 rounded-2xl text-center border-2 border-blue-500 max-w-4xl max-h-[80vh] overflow-y-auto">
            <h3 className="text-3xl font-bold mb-4">
              {modal.type === 'philosopher' && '🎭 哲学家 - 选择善良角色'}
              {modal.type === 'cerenovus' && '🧠 洗脑师 - 选择善良角色'}
              {modal.type === 'pit_hag' && '🧙 麻脸巫婆 - 选择角色'}
            </h3>
            {modal.type === 'pit_hag' && (
              <p className="text-sm text-gray-300 mb-3">
                当前剧本所有角色与座位号如下（仅供参考）：请先在主界面点选一名玩家作为目标，
                再在此选择一个<strong>当前场上尚未登场</strong>的角色身份，若合法则该玩家立刻变为该角色，并按夜晚顺位在本夜被叫醒。
              </p>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
              {props.roles
                .filter((r: Role) => {
                  if (modal.type === 'philosopher' || modal.type === 'cerenovus') {
                    return r.type === 'townsfolk' || r.type === 'outsider';
                  }
                  // 麻脸巫婆：仅显示当前剧本的角色，方便查阅
                  if (props.selectedScript) {
                    return r.script === props.selectedScript.name;
                  }
                  return true;
                })
                .map((role: Role) => {
                  const typeColor = props.typeColors[role.type] || 'border-gray-500 text-gray-400';
                  const typeBgColor = props.typeBgColors[role.type] || 'bg-gray-900/50 hover:bg-gray-800';
                  return (
                    <button
                      key={role.id}
                      onClick={() => {
                        modal.onConfirm(role.id);
                      }}
                      className={`p-4 rounded-xl border-2 ${typeColor} ${typeBgColor} transition-all text-left`}
                    >
                      <div className="font-bold text-lg">{role.name}</div>
                      <div className="text-sm opacity-80 mt-1">{props.typeLabels[role.type]}</div>
                      <div className="text-xs opacity-60 mt-1 line-clamp-2">{role.ability}</div>
                    </button>
                  );
                })}
            </div>
            {modal.type === 'pit_hag' && (
              <div className="mt-2 mb-4 text-left text-xs text-gray-300 max-h-40 overflow-y-auto border border-gray-700 rounded-xl p-3 bg-gray-900/60">
                <div className="font-bold mb-1">当前座位与角色一览：</div>
                {props.seats.map(s => (
                  <div key={s.id} className="flex justify-between">
                    <span>[{s.id + 1}号]</span>
                    <span className="ml-2 flex-1 text-right">
                      {props.getSeatRoleId(s) ? props.roles.find(r => r.id === props.getSeatRoleId(s))?.name || '未知角色' : '空位 / 未分配'}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => props.setShowRoleSelectModal(null)}
              className="w-full py-3 bg-gray-600 rounded-xl text-xl font-bold hover:bg-gray-500"
            >
              取消
            </button>
          </div>
        </div>
        );
      })()}
      
      {props.showMadnessCheckModal && (() => {
        const modal = props.showMadnessCheckModal;
        return (
        <div className="fixed inset-0 z-[3000] bg-black/90 flex items-center justify-center">
          <div className="bg-gray-800 p-8 rounded-2xl text-center border-2 border-purple-500 max-w-md">
            <h3 className="text-3xl font-bold mb-6">🧠 疯狂判定</h3>
            <div className="mb-6 text-left">
              <p className="mb-2">目标：{modal.targetId + 1}号</p>
              <p className="mb-2">要求扮演角色：{modal.roleName}</p>
              <p className="text-sm text-gray-400 mb-4">
                该玩家需要在白天和夜晚"疯狂"地证明自己是这个角色，否则可能被处决。
              </p>
            </div>
            <div className="flex gap-3 mb-4">
              <button
                onClick={() => {
                  props.addLog(`${modal.targetId + 1}号 疯狂判定：通过（正确扮演 ${modal.roleName}）`);
                  props.setShowMadnessCheckModal(null);
                }}
                className="flex-1 py-3 bg-green-600 rounded-xl font-bold text-lg"
              >
                通过
              </button>
              <button
                onClick={() => {
                  props.addLog(`${modal.targetId + 1}号 疯狂判定：失败（未正确扮演 ${modal.roleName}）`);
                  const target = props.seats.find(s => s.id === modal.targetId);
                  if (target && !target.isDead) {
                    // 如果判定失败，说书人可以决定是否处决
                    const shouldExecute = window.confirm(`是否处决 ${modal.targetId + 1}号？`);
                    if (shouldExecute) {
                      props.saveHistory();
                      props.executePlayer(modal.targetId);
                    }
                  }
                  props.setShowMadnessCheckModal(null);
                }}
                className="flex-1 py-3 bg-red-600 rounded-xl font-bold text-lg"
              >
                失败
              </button>
            </div>
            <button
              onClick={() => props.setShowMadnessCheckModal(null)}
              className="w-full py-2 bg-gray-600 rounded-xl font-bold hover:bg-gray-500"
            >
              取消
            </button>
          </div>
        </div>
        );
      })()}
      
      {props.showDayActionModal && (
        <div className="fixed inset-0 z-[3000] bg-black/80 flex items-center justify-center">
          <div className="bg-gray-800 p-8 rounded-2xl w-[500px] text-center">
            <h2 className="mb-6 text-3xl font-bold text-red-400">
              {props.showDayActionModal.type==='slayer'
                ? '💥 开枪'
                : props.showDayActionModal.type==='lunaticKill'
                  ? '🔪 精神病患者日杀'
                  : '🗣️ 提名'}
            </h2>
            <div className="flex flex-wrap gap-3 justify-center">
              {props.seats.filter(s=>{
                // 暗月初升剧本：存活玩家可以提名死人
                // 其他剧本：只能提名存活玩家
                if (props.showDayActionModal?.type === 'nominate' && props.selectedScript?.id === 'bad_moon_rising') {
                  // 暗月初升：可以提名死人（包括僵怖假死状态）
                  return s.role !== null;
                }
                // 其他情况：只能提名存活玩家
                return !s.isDead;
              }).map(s=>{
                // 8. 提名限制：检查是否已被提名或被提名过
                const isDisabled = props.showDayActionModal?.type === 'nominate'
                  ? (props.nominationRecords.nominees.has(s.id) || props.nominationRecords.nominators.has(props.showDayActionModal!.sourceId))
                  : props.showDayActionModal?.type === 'lunaticKill'
                    ? s.id === props.showDayActionModal!.sourceId
                    : false;
                return (
                  <button 
                    key={s.id} 
                    onClick={()=>{
                      if (!isDisabled) {
                        if (props.showDayActionModal?.type === 'nominate' && s.role?.id === 'virgin') {
                          const nominatorSeat = props.seats.find(seat => seat.id === props.showDayActionModal?.sourceId);
                          const isRealTownsfolk = !!(nominatorSeat &&
                            nominatorSeat.role?.type === 'townsfolk' &&
                            nominatorSeat.role?.id !== 'drunk' &&
                            !nominatorSeat.isDrunk);
                          props.setVirginGuideInfo({
                            targetId: s.id,
                            nominatorId: props.showDayActionModal?.sourceId ?? 0,
                            isFirstTime: !s.hasBeenNominated,
                            nominatorIsTownsfolk: isRealTownsfolk
                          });
                          props.setShowDayActionModal(null);
                          props.setShowNominateModal(null);
                          return;
                        }
                        props.handleDayAction(s.id);
                        props.setShowDayActionModal(null);
                        props.setShowShootModal(null);
                        props.setShowNominateModal(null);
                      }
                    }} 
                    disabled={isDisabled}
                    className={`p-4 border-2 rounded-xl text-xl font-bold transition-all ${
                      isDisabled ? 'opacity-30 cursor-not-allowed bg-gray-700' : 
                      'hover:bg-gray-700'
                    }`}
                  >
                    {s.id+1}号 {s.role?.name}
                  </button>
                );
              })}
            </div>
            <button 
              onClick={()=>{
                props.setShowDayActionModal(null);
                props.setShowShootModal(null);
                props.setShowNominateModal(null);
              }} 
              className="mt-8 w-full py-3 bg-gray-600 rounded-xl text-xl"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {props.virginGuideInfo && (() => {
        const target = props.seats.find(s => s.id === props.virginGuideInfo?.targetId);
        const nominator = props.seats.find(s => s.id === props.virginGuideInfo?.nominatorId);
        if (!target) return null;
        const isFirst = props.virginGuideInfo.isFirstTime;
        const nomIsTown = props.virginGuideInfo.nominatorIsTownsfolk;
        return (
          <div className="fixed inset-0 z-[3200] bg-black/80 flex items-center justify-center">
            <div className="bg-gray-900 p-8 rounded-2xl w-[620px] text-left space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-pink-200">贞洁者判定向导</h2>
                <span className="text-sm text-gray-400">
                  提名者：{nominator ? `${nominator.id + 1}号 ${nominator.role?.name || ''}` : '未知'}
                  {' · '}
                  目标：{target.id + 1}号 {target.role?.name || ''}
                </span>
              </div>

              <div className="space-y-2">
                <div className="text-lg font-semibold text-white">这是本局贞洁者第几次被提名？</div>
                <div className="flex gap-3">
                  <button
                    className={`flex-1 py-3 rounded-xl font-bold transition ${isFirst ? 'bg-pink-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}
                    onClick={() => props.setVirginGuideInfo((prev: any) => prev ? { ...prev, isFirstTime: true } : null)}
                  >
                    第一次
                  </button>
                  <button
                    className={`flex-1 py-3 rounded-xl font-bold transition ${!isFirst ? 'bg-pink-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}
                    onClick={() => props.setVirginGuideInfo((prev: any) => prev ? { ...prev, isFirstTime: false } : null)}
                  >
                    不是第一次
                  </button>
                </div>
              </div>

              {isFirst && (
                <div className="space-y-2">
                  <div className="text-lg font-semibold text-white">提名者是镇民 (Townsfolk) 吗？</div>
                  <div className="flex gap-3">
                    <button
                      className={`flex-1 py-3 rounded-xl font-bold transition ${nomIsTown ? 'bg-emerald-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}
                      onClick={() => props.setVirginGuideInfo((prev: any) => prev ? { ...prev, nominatorIsTownsfolk: true } : null)}
                    >
                      是镇民
                    </button>
                    <button
                      className={`flex-1 py-3 rounded-xl font-bold transition ${!nomIsTown ? 'bg-amber-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}
                      onClick={() => props.setVirginGuideInfo((prev: any) => prev ? { ...prev, nominatorIsTownsfolk: false } : null)}
                    >
                      不是镇民
                    </button>
                  </div>
                </div>
              )}

              <div className="bg-gray-800/80 rounded-xl p-4 text-sm leading-6 text-gray-200 space-y-2">
                {isFirst ? (
                  nomIsTown ? (
                    <>
                      <div>• 这是贞洁者第一次被提名，且提名者是镇民。</div>
                      <div>• 立刻处决提名者，而不是贞洁者。</div>
                      <div>• 公告台词示例： "因为你提名了贞洁者，你被立即处决。"</div>
                      <div>• 将贞洁者技能标记为已用，今后再被提名不再触发。</div>
                    </>
                  ) : (
                    <>
                      <div>• 这是贞洁者第一次被提名，但提名者不是镇民。</div>
                      <div>• 这次提名不产生额外处决。</div>
                      <div>• 贞洁者技能视为已用完（即使这次没有处决任何人）。</div>
                    </>
                  )
                ) : (
                  <>
                    <div>• 贞洁者已经被提名过，能力已失效。</div>
                    <div>• 这次提名按普通提名处理，不会再触发额外处决。</div>
                  </>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  className="flex-1 py-3 bg-pink-600 hover:bg-pink-500 rounded-xl font-bold text-white"
                  onClick={props.handleVirginGuideConfirm}
                >
                  按此指引继续提名
                </button>
                <button
                  className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-xl font-bold text-white"
                  onClick={() => props.setVirginGuideInfo(null)}
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {props.showDayAbilityModal && (() => {
        const { roleId, seatId } = props.showDayAbilityModal;
        const seat = props.seats.find(s => s.id === seatId);
        if (!seat) return null;
        const roleName = seat.role?.name || '';
        const closeModal = () => {
          props.setShowDayAbilityModal(null);
          props.setDayAbilityForm({});
        };
        const submit = () => {
          if (roleId === 'savant_mr') {
            if (!props.dayAbilityForm.info1 || !props.dayAbilityForm.info2) {
              alert('请填写两条信息（可真可假）。');
              return;
            }
            props.addLog(`${seat.id+1}号(博学者) 今日信息：${props.dayAbilityForm.info1} / ${props.dayAbilityForm.info2}`);
            props.setDayAbilityLogs(prev => [...prev, { id: seat.id, roleId, day: props.nightCount, text: `${props.dayAbilityForm.info1} / ${props.dayAbilityForm.info2}` }]);
            props.markDailyAbilityUsed('savant_mr', seat.id);
            closeModal();
            return;
          }
          if (roleId === 'amnesiac') {
            if (!props.dayAbilityForm.guess || !props.dayAbilityForm.feedback) {
              alert('请填写猜测和反馈。');
              return;
            }
            props.addLog(`${seat.id+1}号(失意者) 今日猜测：${props.dayAbilityForm.guess}；反馈：${props.dayAbilityForm.feedback}`);
            props.setDayAbilityLogs(prev => [...prev, { id: seat.id, roleId, day: props.nightCount, text: `猜测：${props.dayAbilityForm.guess}；反馈：${props.dayAbilityForm.feedback}` }]);
            props.markDailyAbilityUsed('amnesiac', seat.id);
            closeModal();
            return;
          }
          if (roleId === 'fisherman') {
            if (!props.dayAbilityForm.advice) {
              alert('请填写说书人提供的建议。');
              return;
            }
            props.addLog(`${seat.id+1}号(渔夫) 获得建议：${props.dayAbilityForm.advice}`);
            props.setDayAbilityLogs(prev => [...prev, { id: seat.id, roleId, day: props.nightCount, text: `建议：${props.dayAbilityForm.advice}` }]);
            props.markAbilityUsed('fisherman', seat.id);
            closeModal();
            return;
          }
          if (roleId === 'engineer') {
            const mode = props.dayAbilityForm.engineerMode;
            const newRoleId = props.dayAbilityForm.engineerRoleId;
            if (!mode) {
              alert('请选择改造目标（恶魔或爪牙）。');
              return;
            }
            if (!newRoleId) {
              alert('请选择要改造成为的角色。');
              return;
            }
            const newRole = props.roles.find(r => r.id === newRoleId);
            if (!newRole) return;
            if (mode === 'demon' && newRole.type !== 'demon') {
              alert('请选择一个恶魔角色。');
              return;
            }
            if (mode === 'minion' && newRole.type !== 'minion') {
              alert('请选择一个爪牙角色。');
              return;
            }
            if (mode === 'demon') {
              const demonSeat = props.seats.find(s => s.role?.type === 'demon' || s.isDemonSuccessor);
              if (!demonSeat) {
                alert('场上没有可改造的恶魔。');
                return;
              }
              props.setSeats(prev => prev.map(s => {
                if (s.id !== demonSeat.id) return s;
                return props.cleanseSeatStatuses({
                  ...s,
                  role: newRole,
                  charadeRole: null,
                }, { keepDeathState: true });
              }));
              props.addLog(`${seat.id+1}号(工程师) 将恶魔改造成 ${newRole.name}`);
              // 调整唤醒队列：如果当前在夜晚，将改造后的恶魔插入唤醒队列
              if (['night', 'firstNight'].includes(props.gamePhase)) {
                props.insertIntoWakeQueueAfterCurrent(demonSeat.id, { roleOverride: newRole, logLabel: `${demonSeat.id+1}号(${newRole.name})` });
              }
            } else {
              const minions = props.seats.filter(s => s.role?.type === 'minion');
              if (minions.length === 0) {
                alert('场上没有可改造的爪牙。');
                return;
              }
              props.setSeats(prev => prev.map(s => {
                if (s.role?.type !== 'minion') return s;
                return props.cleanseSeatStatuses({
                  ...s,
                  role: newRole,
                  charadeRole: null,
                }, { keepDeathState: true });
              }));
              props.addLog(`${seat.id+1}号(工程师) 将所有爪牙改造成 ${newRole.name}`);
              // 调整唤醒队列：如果当前在夜晚，将所有改造后的爪牙插入唤醒队列
              if (['night', 'firstNight'].includes(props.gamePhase)) {
                minions.forEach(m => {
                  props.insertIntoWakeQueueAfterCurrent(m.id, { roleOverride: newRole, logLabel: `${m.id+1}号(${newRole.name})` });
                });
              }
            }
            props.markAbilityUsed('engineer', seat.id);
            closeModal();
            return;
          }
        };
        return (
          <div className="fixed inset-0 z-[3200] bg-black/80 flex items-center justify-center px-4">
            <div className="bg-gray-900 border-4 border-blue-500 rounded-2xl p-6 max-w-2xl w-full space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-blue-200">🌞 {roleName} 日间能力</h2>
                <button className="text-gray-400 hover:text-white" onClick={closeModal}>✕</button>
              </div>
              {roleId === 'savant_mr' && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-300">填写两条信息（其中一真一假）。</p>
                  <textarea
                    className="w-full bg-gray-800 border border-gray-700 rounded p-2"
                    placeholder="信息1"
                    value={props.dayAbilityForm.info1 || ''}
                    onChange={e=>props.setDayAbilityForm((f: typeof props.dayAbilityForm)=>({...f, info1: e.target.value}))}
                  />
                  <textarea
                    className="w-full bg-gray-800 border border-gray-700 rounded p-2"
                    placeholder="信息2"
                    value={props.dayAbilityForm.info2 || ''}
                    onChange={e=>props.setDayAbilityForm((f: typeof props.dayAbilityForm)=>({...f, info2: e.target.value}))}
                  />
                </div>
              )}
              {roleId === 'amnesiac' && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-300">填写今天的猜测与说书人反馈。</p>
                  <textarea
                    className="w-full bg-gray-800 border border-gray-700 rounded p-2"
                    placeholder="你的猜测"
                    value={props.dayAbilityForm.guess || ''}
                    onChange={e=>props.setDayAbilityForm((f: typeof props.dayAbilityForm)=>({...f, guess: e.target.value}))}
                  />
                  <textarea
                    className="w-full bg-gray-800 border border-gray-700 rounded p-2"
                    placeholder="说书人反馈"
                    value={props.dayAbilityForm.feedback || ''}
                    onChange={e=>props.setDayAbilityForm((f: typeof props.dayAbilityForm)=>({...f, feedback: e.target.value}))}
                  />
                </div>
              )}
              {roleId === 'fisherman' && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-300">记录说书人给出的建议（一次性）。</p>
                  <textarea
                    className="w-full bg-gray-800 border border-gray-700 rounded p-2"
                    placeholder="建议内容"
                    value={props.dayAbilityForm.advice || ''}
                    onChange={e=>props.setDayAbilityForm((f: typeof props.dayAbilityForm)=>({...f, advice: e.target.value}))}
                  />
                </div>
              )}
              {roleId === 'engineer' && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-300">选择改造恶魔或爪牙，并指定新的角色。</p>
                  <div className="flex gap-3">
                    <label className="flex items-center gap-2 text-gray-200 text-sm">
                      <input
                        type="radio"
                        checked={props.dayAbilityForm.engineerMode === 'demon'}
                        onChange={()=>props.setDayAbilityForm((f: typeof props.dayAbilityForm)=>({...f, engineerMode: 'demon'}))}
                      />
                      改造恶魔
                    </label>
                    <label className="flex items-center gap-2 text-gray-200 text-sm">
                      <input
                        type="radio"
                        checked={props.dayAbilityForm.engineerMode === 'minion'}
                        onChange={()=>props.setDayAbilityForm((f: typeof props.dayAbilityForm)=>({...f, engineerMode: 'minion'}))}
                      />
                      改造所有爪牙
                    </label>
                  </div>
                  <select
                    className="w-full bg-gray-800 border border-gray-700 rounded p-2"
                    value={props.dayAbilityForm.engineerRoleId || ''}
                    onChange={e=>props.setDayAbilityForm((f: typeof props.dayAbilityForm)=>({...f, engineerRoleId: e.target.value || undefined}))}
                  >
                    <option value="">选择目标角色</option>
                    {(() => {
                      const usedRoleIds = new Set(
                        props.seats.map(s => props.getSeatRoleId(s)).filter(Boolean) as string[]
                      );
                      return props.roles
                        .filter(r => r.type === (props.dayAbilityForm.engineerMode === 'demon' ? 'demon' : props.dayAbilityForm.engineerMode === 'minion' ? 'minion' : undefined))
                        .filter(r => !usedRoleIds.has(r.id))
                        .map(r => (
                          <option key={r.id} value={r.id}>{r.name} ({r.type})</option>
                        ));
                    })()}
                  </select>
                </div>
              )}
              <div className="flex justify-end gap-3">
                <button className="px-4 py-2 bg-gray-700 rounded" onClick={closeModal}>取消</button>
                <button className="px-4 py-2 bg-blue-600 rounded font-bold" onClick={submit}>确认</button>
              </div>
            </div>
          </div>
        );
      })()}

      <SaintExecutionConfirmModal
        isOpen={!!props.showSaintExecutionConfirmModal}
        onConfirm={props.confirmSaintExecution}
        onCancel={props.cancelSaintExecution}
      />

      <LunaticRpsModal
        isOpen={!!props.showLunaticRpsModal}
        nominatorId={props.showLunaticRpsModal?.nominatorId || null}
        targetId={props.showLunaticRpsModal?.targetId || 0}
        onResolve={(isLoss) => {
          // 转换 boolean 到 'win' | 'lose' | 'tie'
          // isLoss=true 表示精神病患者输，对应 'lose'
          // isLoss=false 表示精神病患者赢/平，对应 'win' 或 'tie'
          // 这里简化为：输=lose，赢/平=win（如果需要区分平局，需要修改 LunaticRpsModal）
          props.resolveLunaticRps(isLoss ? 'lose' : 'win');
        }}
      />
      
      <VirginTriggerModal
        isOpen={!!props.showVirginTriggerModal}
        onConfirm={props.confirmVirginTrigger}
        onCancel={() => props.setShowVirginTriggerModal(null)}
      />
      
      <RavenkeeperFakeModal
        targetId={props.showRavenkeeperFakeModal}
        roles={props.roles}
        onSelect={props.confirmRavenkeeperFake}
      />
      

      <StorytellerDeathModal
        isOpen={!!props.showStorytellerDeathModal}
        sourceId={props.showStorytellerDeathModal?.sourceId || 0}
        seats={props.seats}
        onConfirm={(targetId) => props.confirmStorytellerDeath(targetId ?? 0)}
      />

      <SweetheartDrunkModal
        isOpen={!!props.showSweetheartDrunkModal}
        sourceId={props.showSweetheartDrunkModal?.sourceId || 0}
        seats={props.seats}
        onConfirm={props.confirmSweetheartDrunk}
      />

      <KlutzChoiceModal
        isOpen={!!props.showKlutzChoiceModal}
        sourceId={props.showKlutzChoiceModal?.sourceId || 0}
        seats={props.seats}
        selectedTarget={props.klutzChoiceTarget}
        onSelectTarget={props.setKlutzChoiceTarget}
        onConfirm={() => props.confirmKlutzChoice()}
        onCancel={() => {
          props.setShowKlutzChoiceModal(null);
          props.setKlutzChoiceTarget(null);
        }}
      />

      <MoonchildKillModal
        isOpen={!!props.showMoonchildKillModal}
        sourceId={props.showMoonchildKillModal?.sourceId || 0}
        seats={props.seats}
        onConfirm={props.confirmMoonchildKill}
      />
      
      {props.gamePhase==="dawnReport" && (
        <div className="fixed inset-0 z-[3000] bg-black/95 flex items-center justify-center">
          <div className="bg-gray-800 p-12 rounded-3xl text-center border-4 border-yellow-500 min-w-[500px]">
            <h2 className="text-6xl mb-8">🌅 天亮了！</h2>
            <p className="text-3xl text-gray-300 mb-10">
              昨晚死亡：<span className="text-red-500 font-bold">
                {props.deadThisNight.length>0 ? props.deadThisNight.map(id => `${id+1}号`).join('、') : "平安夜"}
              </span>
            </p>
            <button 
              onClick={()=>props.setGamePhase('day')} 
              className="px-12 py-5 bg-yellow-500 text-black font-bold rounded-full text-3xl"
            >
              开始白天
            </button>
          </div>
        </div>
      )}
      
      {props.gamePhase==="gameOver" && (
        <div className="fixed inset-0 z-[4000] bg-black/95 flex items-center justify-center">
          <div className="text-center">
            <h1 className={`text-8xl font-bold mb-10 ${
              props.winResult==='good'?'text-blue-500':'text-red-500'
            }`}>
              {props.winResult==='good'?'🏆 善良阵营胜利':'👿 邪恶阵营获胜'}
            </h1>
            {props.winReason && (
              <p className="text-xl text-gray-400 mb-8">
                胜利依据：{props.winReason}
              </p>
            )}
            {props.winReason && props.winReason.includes('猎手') && (
              <p className="text-sm text-gray-500 mb-8">
                按照规则，游戏立即结束，不再进行今天的处决和后续夜晚。
              </p>
            )}
            <div className="flex gap-6 justify-center">
              <button 
                onClick={props.handleNewGame} 
                className="px-10 py-5 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-3xl font-bold transition-colors"
              >
                再来一局
              </button>
              <button 
                onClick={()=>props.setShowReviewModal(true)} 
                className="px-10 py-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full text-3xl font-bold transition-colors"
              >
                本局复盘
              </button>
            </div>
          </div>
        </div>
      )}
      
      <ReviewModal
        isOpen={props.showReviewModal}
        onClose={() => props.setShowReviewModal(false)}
        seats={props.seats}
        gameLogs={props.gameLogs}
        gamePhase={props.gamePhase}
        winResult={props.winResult}
        winReason={props.winReason}
        isPortrait={props.isPortrait}
      />

      <GameRecordsModal
        isOpen={props.showGameRecordsModal}
        onClose={() => props.setShowGameRecordsModal(false)}
        gameRecords={props.gameRecords}
        isPortrait={props.isPortrait}
      />

      <RoleInfoModal
        isOpen={props.showRoleInfoModal}
        onClose={() => props.setShowRoleInfoModal(false)}
        selectedScript={props.selectedScript}
        filteredGroupedRoles={props.filteredGroupedRoles}
        roles={props.roles}
        groupedRoles={props.groupedRoles}
      />

      {props.contextMenu && (() => {
        const targetSeat = props.seats.find(s => s.id === props.contextMenu?.seatId);
        if (!targetSeat) return null;
        return (
        <div 
          className="absolute bg-gray-800 border-2 border-gray-500 rounded-xl shadow-2xl z-[3000] w-48 overflow-hidden" 
          style={{top:props.contextMenu.y,left:props.contextMenu.x}}
        >
          {props.gamePhase==='dusk' && !targetSeat.isDead && (
            <button 
              onClick={()=>props.handleMenuAction('nominate')} 
              disabled={props.contextMenu ? props.nominationRecords.nominators.has(props.contextMenu.seatId) : false}
              className={`block w-full text-left px-6 py-4 hover:bg-purple-900 text-purple-300 font-bold text-lg border-b border-gray-600 ${
                (props.contextMenu && props.nominationRecords.nominators.has(props.contextMenu.seatId)) ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              🗣️ 提名
            </button>
          )}
          {/* 开枪可以在任意环节（除了setup阶段） */}
          {!targetSeat.isDead && props.gamePhase !== 'setup' && (
            <button 
              onClick={()=>props.handleMenuAction('slayer')} 
              disabled={targetSeat.hasUsedSlayerAbility}
              className={`block w-full text-left px-6 py-4 hover:bg-red-900 text-red-300 font-bold text-lg border-b border-gray-600 ${
                targetSeat.hasUsedSlayerAbility ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              💥 开枪
            </button>
          )}
          {/* 爪牙白天猜测落难少女 */}
          {props.gamePhase === 'day' && targetSeat.role?.type === 'minion' && !targetSeat.isDead && props.seats.some(s => s.role?.id === 'damsel') && (
            <button
              onClick={()=>props.handleMenuAction('damselGuess')}
              disabled={props.damselGuessUsedBy.includes(targetSeat.id)}
              className={`block w-full text-left px-6 py-3 text-lg font-medium border-t border-gray-700 ${
                props.damselGuessUsedBy.includes(targetSeat.id)
                  ? 'text-gray-500 cursor-not-allowed bg-gray-800'
                  : 'hover:bg-pink-900 text-pink-300'
              }`}
            >
              🎯 猜测落难少女
            </button>
          )}
          <button 
            onClick={()=>props.toggleStatus('dead')} 
            className="block w-full text-left px-6 py-3 hover:bg-gray-700 text-lg font-medium"
          >
            💀 切换死亡
          </button>
          {/* 在核对身份阶段，允许选择红罗刹（仅限善良阵营），爪牙和恶魔为灰色不可选，且需要场上有占卜师 */}
          {props.gamePhase === 'check' && targetSeat.role && (() => {
            const hasFortuneTeller = props.seats.some(s => s.role?.id === "fortune_teller");
            const isDisabled = ['minion','demon'].includes(targetSeat.role.type) || !hasFortuneTeller;
            return (
              <button
                onClick={()=>!isDisabled && props.toggleStatus('redherring', targetSeat.id)}
                disabled={isDisabled}
                className={`block w-full text-left px-6 py-3 text-lg font-medium border-t border-gray-700 whitespace-nowrap ${
                  isDisabled
                    ? 'text-gray-500 cursor-not-allowed bg-gray-800'
                    : 'hover:bg-red-900 text-red-300'
                }`}
              >
                🎭 选为红罗刹
              </button>
            );
          })()}
        </div>
        );
      })()}
      
      
      {/* 6. 处决结果弹窗 */}
      <ExecutionResultModal
        isOpen={!!props.showExecutionResultModal}
        message={props.showExecutionResultModal?.message || ''}
        onConfirm={props.confirmExecutionResult}
      />

      <ShootResultModal
        isOpen={!!props.showShootResultModal}
        message={props.showShootResultModal?.message || ''}
        isDemonDead={props.showShootResultModal?.isDemonDead || false}
        onConfirm={props.confirmShootResult}
      />

      <KillConfirmModal
        targetId={props.showKillConfirmModal}
        isImpSelfKill={!!(props.nightInfo && props.nightInfo.effectiveRole.id === 'imp' && props.showKillConfirmModal === props.nightInfo.seat.id)}
        onConfirm={props.confirmKill}
        onCancel={() => {
          props.setShowKillConfirmModal(null);
          props.setSelectedActionTargets([]);
        }}
      />

      <AttackBlockedModal
        isOpen={!!props.showAttackBlockedModal}
        targetId={props.showAttackBlockedModal?.targetId || 0}
        reason={props.showAttackBlockedModal?.reason || ''}
        demonName={props.showAttackBlockedModal?.demonName}
        onClose={() => props.setShowAttackBlockedModal(null)}
      />

      <PitHagModal
        isOpen={!!props.showPitHagModal}
        targetId={props.showPitHagModal?.targetId || null}
        roleId={props.showPitHagModal?.roleId || null}
        seats={props.seats}
        roles={props.roles}
        onRoleChange={(roleId) => props.setShowPitHagModal((m: any) => m ? ({...m, roleId}) : null)}
        onCancel={() => props.setShowPitHagModal(null)}
        onContinue={() => {
          // 保持弹窗打开，由"确认/下一步"执行实际变更
          props.setShowPitHagModal((m: any) => m ? m : null);
        }}
      />

      <RangerModal
        isOpen={!!props.showRangerModal}
        targetId={props.showRangerModal?.targetId || 0}
        roleId={props.showRangerModal?.roleId || null}
        seats={props.seats}
        roles={props.roles}
        selectedScript={props.selectedScript}
        onRoleChange={(roleId) => props.setShowRangerModal((m: any) => m ? ({...m, roleId}) : null)}
        onConfirm={() => {
          if (!props.showRangerModal?.roleId) {
            alert('必须选择一个未在场的镇民角色');
            return;
          }
          const newRole = props.roles.find(r => r.id === props.showRangerModal?.roleId && r.type === 'townsfolk');
          if (!newRole) {
            alert('角色无效，请重新选择');
            return;
          }
          const targetId = props.showRangerModal.targetId;
          props.setSeats(prev => prev.map(s => {
            if (s.id !== targetId) return s;
            const swapped = props.cleanseSeatStatuses({
              ...s,
              role: newRole,
              charadeRole: null,
              isDemonSuccessor: false,
            }, { keepDeathState: true });
            return swapped;
          }));
          props.addLog(`巡山人将 ${props.showRangerModal.targetId+1}号(落难少女) 变为 ${newRole.name}`);
          props.insertIntoWakeQueueAfterCurrent(props.showRangerModal.targetId, { roleOverride: newRole, logLabel: `${props.showRangerModal.targetId+1}号(${newRole.name})` });
          props.setShowRangerModal(null);
          props.continueToNextAction();
        }}
      />

      {/* 爪牙猜测落难少女 */}
      <DamselGuessModal
        isOpen={!!props.showDamselGuessModal}
        minionId={props.showDamselGuessModal?.minionId || null}
        targetId={props.showDamselGuessModal?.targetId || null}
        seats={props.seats}
        damselGuessUsedBy={props.damselGuessUsedBy}
        onMinionChange={(minionId) => props.setShowDamselGuessModal((m: any) => m ? ({...m, minionId}) : null)}
        onTargetChange={(targetId) => props.setShowDamselGuessModal((m: any) => m ? ({...m, targetId}) : null)}
        onCancel={() => props.setShowDamselGuessModal(null)}
        onConfirm={() => {
          if (props.showDamselGuessModal!.minionId === null || props.showDamselGuessModal!.targetId === null) return;
          const minionId = props.showDamselGuessModal!.minionId;
          const guessSeat = props.seats.find(s => s.id === props.showDamselGuessModal!.targetId);
          const isCorrect = guessSeat?.role?.id === 'damsel' && !guessSeat.isDead;
          props.setShowDamselGuessModal(null);
          props.setDamselGuessUsedBy(prev => prev.includes(minionId) ? prev : [...prev, minionId]);
          if (isCorrect) {
            props.setDamselGuessed(true);
            props.setWinResult('evil');
            props.setWinReason('爪牙猜中落难少女');
            props.setGamePhase('gameOver');
            props.addLog(`爪牙猜测成功：${props.showDamselGuessModal!.targetId+1}号是落难少女，邪恶获胜`);
          } else {
            const updatedSeats = props.seats.map(s => s.id === minionId ? { ...s, isDead: true, isSentenced: false } : s);
            props.setSeats(updatedSeats);
            props.addLog(`${minionId+1}号爪牙猜错落难少女，当场死亡。`);
            props.addLog(`爪牙猜测失败：${props.showDamselGuessModal!.targetId+1}号不是落难少女`);
            props.checkGameOver(updatedSeats, minionId);
          }
        }}
      />

      {/* 灵言师触发关键词转换 */}
      {props.showShamanConvertModal && (
        <div className="fixed inset-0 z-[5000] bg-black/80 flex items-center justify-center px-4">
          <div className="bg-gray-800 border-4 border-purple-500 rounded-2xl p-6 max-w-xl w-full space-y-4">
            <h2 className="text-3xl font-bold text-purple-300">灵言师：关键词被说出</h2>
            <div className="text-gray-200 text-sm">
              请选择第一个公开说出关键词的玩家：若他是善良阵营（镇民/外来者），当晚起被视为邪恶；若本就是邪恶，则不产生额外效果。
            </div>
            <select
              className="w-full bg-gray-900 border border-gray-700 rounded p-2"
              value={props.shamanConvertTarget ?? ''}
              onChange={e=>props.setShamanConvertTarget(e.target.value===''?null:Number(e.target.value))}
            >
              <option value="">选择玩家</option>
              {props.seats.filter(s => !s.isDead).map(s=>(
                <option key={s.id} value={s.id}>[{s.id+1}] {s.role?.name}</option>
              ))}
            </select>
            <div className="flex gap-3 justify-end">
              <button className="px-4 py-2 bg-gray-700 rounded" onClick={()=>{props.setShowShamanConvertModal(false);props.setShamanConvertTarget(null);}}>取消</button>
              <button className="px-4 py-2 bg-purple-600 rounded" onClick={()=>{
                if (props.shamanConvertTarget === null) return;
                const target = props.seats.find(s => s.id === props.shamanConvertTarget);
                if (!target || target.isDead) return;
                const isGoodNow = props.isGoodAlignment(target);
                if (!isGoodNow) {
                  props.addLog(`灵言师关键词触发检查：${props.shamanConvertTarget+1}号本就为邪恶阵营，未产生额外效果`);
                  props.setShamanTriggered(true);
                  props.setShowShamanConvertModal(false);
                  props.setShamanConvertTarget(null);
                  return;
                }
                props.setSeats(prev => prev.map(s => {
                  if (s.id !== props.shamanConvertTarget) return s;
                  const next = props.cleanseSeatStatuses({ ...s, isEvilConverted: true }, { keepDeathState: true });
                  const details = Array.from(new Set([...(next.statusDetails || []), '灵言转邪']));
                  return { ...next, statusDetails: details };
                }));
                props.addLog(`灵言师关键词触发：${props.shamanConvertTarget+1}号公开说出关键词，从今晚开始被视为邪恶阵营`);
                props.insertIntoWakeQueueAfterCurrent(props.shamanConvertTarget, { logLabel: `${props.shamanConvertTarget+1}号(转邪恶)` });
                props.setShamanTriggered(true);
                props.setShowShamanConvertModal(false);
                props.setShamanConvertTarget(null);
              }}>确认转换</button>
            </div>
          </div>
        </div>
      )}

      {/* 理发师交换角色弹窗 */}
      {props.showBarberSwapModal && (
        <div className="fixed inset-0 z-[5000] bg-black/80 flex items-center justify-center px-4">
          <div className="bg-gray-800 border-4 border-blue-500 rounded-2xl p-6 max-w-xl w-full space-y-4">
            <h2 className="text-3xl font-bold text-blue-300">理发师：交换两名玩家角色</h2>
            <div className="text-sm text-gray-300">恶魔（参考）：{props.showBarberSwapModal.demonId+1}号</div>
            <select
              className="w-full bg-gray-900 border border-gray-600 rounded p-2"
              value={props.showBarberSwapModal?.firstId ?? ''}
              onChange={(e)=>props.setShowBarberSwapModal((m: any)=> m ? ({...m, firstId: e.target.value===''?null:Number(e.target.value)}) : null)}
            >
              <option value="">选择玩家A</option>
              {props.seats.filter(s=>s.role?.type !== 'demon' && !s.isDemonSuccessor).map(s=>(
                <option key={s.id} value={s.id}>[{s.id+1}] {s.role?.name}</option>
              ))}
            </select>
            <select
              className="w-full bg-gray-900 border border-gray-600 rounded p-2"
              value={props.showBarberSwapModal?.secondId ?? ''}
              onChange={(e)=>props.setShowBarberSwapModal((m: any)=> m ? ({...m, secondId: e.target.value===''?null:Number(e.target.value)}) : null)}
            >
              <option value="">选择玩家B</option>
              {props.seats.filter(s=>s.role?.type !== 'demon' && !s.isDemonSuccessor).map(s=>(
                <option key={s.id} value={s.id}>[{s.id+1}] {s.role?.name}</option>
              ))}
            </select>
            <div className="flex gap-3 justify-end">
              <button className="px-4 py-2 bg-gray-700 rounded" onClick={()=>props.setShowBarberSwapModal(null)}>取消</button>
              <button className="px-4 py-2 bg-indigo-600 rounded" onClick={()=>{
                if (!props.showBarberSwapModal || props.showBarberSwapModal.firstId === null || props.showBarberSwapModal.secondId === null || props.showBarberSwapModal.firstId === props.showBarberSwapModal.secondId) return;
                const aId = props.showBarberSwapModal.firstId;
                const bId = props.showBarberSwapModal.secondId;
                const aSeat = props.seats.find(s => s.id === aId);
                const bSeat = props.seats.find(s => s.id === bId);
                if (!aSeat || !bSeat) return;
                const aRole = aSeat.role;
                const bRole = bSeat.role;
                props.setSeats(prev => prev.map(s => {
                  if (s.id === aId) {
                    const swapped = props.cleanseSeatStatuses({ ...s, role: bRole, charadeRole: null, isDemonSuccessor: false }, { keepDeathState: true });
                    return swapped;
                  }
                  if (s.id === bId) {
                    const swapped = props.cleanseSeatStatuses({ ...s, role: aRole, charadeRole: null, isDemonSuccessor: false }, { keepDeathState: true });
                    return swapped;
                  }
                  return s;
                }));
                props.addLog(`理发师触发：交换了 ${aId+1}号 与 ${bId+1}号 的角色`);
                // 调整唤醒队列：如果当前在夜晚，将交换后的两名玩家插入唤醒队列
                if (['night', 'firstNight'].includes(props.gamePhase)) {
                  if (aRole && (aRole.firstNightOrder > 0 || aRole.otherNightOrder > 0)) {
                    props.insertIntoWakeQueueAfterCurrent(aId, { roleOverride: aRole, logLabel: `${aId+1}号(${aRole.name})` });
                  }
                  if (bRole && (bRole.firstNightOrder > 0 || bRole.otherNightOrder > 0)) {
                    props.insertIntoWakeQueueAfterCurrent(bId, { roleOverride: bRole, logLabel: `${bId+1}号(${bRole.name})` });
                  }
                }
                props.setShowBarberSwapModal(null);
              }}>确认交换</button>
            </div>
          </div>
        </div>
      )}

      <HadesiaKillConfirmModal
        isOpen={!!props.showHadesiaKillConfirmModal}
        targetIds={props.showHadesiaKillConfirmModal || []}
        seats={props.seats}
        choices={props.hadesiaChoices}
        onSetChoice={props.setHadesiaChoice}
        onConfirm={props.confirmHadesia}
        onCancel={() => {
          props.setShowHadesiaKillConfirmModal(null);
          props.setHadesiaChoices({});
          props.setSelectedActionTargets([]);
        }}
      />

      {/* 市长被攻击时的死亡转移弹窗 */}
      <MayorRedirectModal
        isOpen={!!props.showMayorRedirectModal}
        targetId={props.showMayorRedirectModal?.targetId || 0}
        demonName={props.showMayorRedirectModal?.demonName || ''}
        seats={props.seats}
        selectedTarget={props.mayorRedirectTarget}
        onSelectTarget={props.setMayorRedirectTarget}
        onConfirmNoRedirect={() => {
          props.setMayorRedirectTarget(null);
          props.confirmMayorRedirect(null);
        }}
        onConfirmRedirect={(targetId) => props.confirmMayorRedirect(targetId)}
      />
      
      {/* 投毒者确认下毒弹窗（善良玩家） */}
      <PoisonConfirmModal
        targetId={props.showPoisonConfirmModal}
        onConfirm={props.confirmPoison}
        onCancel={() => {
          props.setShowPoisonConfirmModal(null);
          props.setSelectedActionTargets([]);
        }}
      />

      <PoisonEvilConfirmModal
        targetId={props.showPoisonEvilConfirmModal}
        onConfirm={props.confirmPoisonEvil}
        onCancel={() => {
          props.setShowPoisonEvilConfirmModal(null);
          props.setSelectedActionTargets([]);
        }}
      />
      
      <NightDeathReportModal
        message={props.showNightDeathReportModal}
        onConfirm={props.confirmNightDeathReport}
      />

      <RestartConfirmModal
        isOpen={props.showRestartConfirmModal}
        onConfirm={props.confirmRestart}
        onCancel={() => props.setShowRestartConfirmModal(false)}
      />

      {/* 伪装身份识别浮窗 */}
      {props.showSpyDisguiseModal && (() => {
        const spySeats = props.seats.filter(s => s.role?.id === 'spy');
        const recluseSeats = props.seats.filter(s => s.role?.id === 'recluse');
        const chefSeat = props.seats.find(s => s.role?.id === 'chef');
        const empathSeat = props.seats.find(s => s.role?.id === 'empath');
        const investigatorSeat = props.seats.find(s => s.role?.id === 'investigator');
        const fortuneTellerSeat = props.seats.find(s => s.role?.id === 'fortune_teller');
        const hasInterferenceRoles = (spySeats.length > 0 || recluseSeats.length > 0) && 
                                    (chefSeat || empathSeat || investigatorSeat || fortuneTellerSeat);
        
        return (
          <div 
            className="fixed inset-0 z-[5000] bg-black/50 flex items-center justify-center"
            onClick={() => props.setShowSpyDisguiseModal(false)}
          >
            <div 
              className="bg-gray-800 border-2 border-purple-500 rounded-xl p-4 w-80 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-lg font-bold text-purple-300">🎭 伪装身份识别</h3>
                <button
                  onClick={() => props.setShowSpyDisguiseModal(false)}
                  className="text-gray-400 hover:text-white text-xl"
                >
                  ×
                </button>
              </div>
              
              {hasInterferenceRoles ? (
                <div className="space-y-3 text-sm">
                  {spySeats.length > 0 && (
                    <div>
                      <div className="text-xs text-gray-400 mb-1">间谍：</div>
                      {spySeats.map(s => (
                        <div key={s.id} className="text-gray-300 ml-2">{s.id + 1}号</div>
                      ))}
                    </div>
                  )}
                  {recluseSeats.length > 0 && (
                    <div>
                      <div className="text-xs text-gray-400 mb-1">隐士：</div>
                      {recluseSeats.map(s => (
                        <div key={s.id} className="text-gray-300 ml-2">{s.id + 1}号</div>
                      ))}
                    </div>
                  )}
                  <div className="pt-2 border-t border-gray-700">
                    <div className="text-xs text-gray-400 mb-2">干扰模式：</div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => props.setSpyDisguiseMode('off')}
                        className={`flex-1 py-1.5 px-2 text-xs rounded ${
                          props.spyDisguiseMode === 'off' 
                            ? 'bg-red-600 text-white' 
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        关闭
                      </button>
                      <button
                        onClick={() => props.setSpyDisguiseMode('default')}
                        className={`flex-1 py-1.5 px-2 text-xs rounded ${
                          props.spyDisguiseMode === 'default' 
                            ? 'bg-blue-600 text-white' 
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        默认
                      </button>
                      <button
                        onClick={() => props.setSpyDisguiseMode('on')}
                        className={`flex-1 py-1.5 px-2 text-xs rounded ${
                          props.spyDisguiseMode === 'on' 
                            ? 'bg-green-600 text-white' 
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        开启
                      </button>
                    </div>
                  </div>
                  {props.spyDisguiseMode === 'on' && (
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-300 flex-shrink-0">概率：</label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={props.spyDisguiseProbability * 100}
                        onChange={(e) => props.setSpyDisguiseProbability(parseInt(e.target.value) / 100)}
                        className="flex-1"
                      />
                      <span className="text-xs text-gray-300 w-10 text-right">
                        {Math.round(props.spyDisguiseProbability * 100)}%
                      </span>
                    </div>
                  )}
                  {props.spyDisguiseMode === 'default' && (
                    <div className="text-xs text-gray-400">
                      默认概率：80%
                    </div>
                  )}
                  {(chefSeat || empathSeat || investigatorSeat || fortuneTellerSeat) && (
                    <div className="text-xs text-gray-400 pt-2 border-t border-gray-700">
                      受影响角色：{chefSeat && '厨师'} {chefSeat && (empathSeat || investigatorSeat || fortuneTellerSeat) && '、'}
                      {empathSeat && '共情者'} {(chefSeat || empathSeat) && (investigatorSeat || fortuneTellerSeat) && '、'}
                      {investigatorSeat && '调查员'} {(chefSeat || empathSeat || investigatorSeat) && fortuneTellerSeat && '、'}
                      {fortuneTellerSeat && '占卜师'}
                    </div>
                  )}
                  {(() => {
                    const infoViewers = [
                      { id: 'washerwoman', name: '洗衣妇' },
                      { id: 'investigator', name: '调查员' },
                      { id: 'chef', name: '厨师' },
                      { id: 'empath', name: '共情者' },
                      { id: 'fortune_teller', name: '占卜师' },
                    ].map(v => {
                      const seat = props.seats.find(s => s.role?.id === v.id);
                      return seat?.role ? { ...v, role: seat.role } : null;
                    }).filter(Boolean) as Array<{id: string; name: string; role: Role}>;
                    const affected = props.seats.filter(s => s.role && (s.role.id === 'spy' || s.role.id === 'recluse'));
                    const typeLabels: Record<RoleType, string> = { townsfolk: '镇民', outsider: '外来者', minion: '爪牙', demon: '恶魔' };
                    if (affected.length === 0 || infoViewers.length === 0) return null;
                    return (
                      <div className="mt-3 border-t border-gray-700 pt-2 text-xs text-gray-300 space-y-2">
                        <div className="text-purple-300 font-semibold">🧾 注册结果（仅说书人可见）</div>
                        {affected.map(target => (
                          <div key={target.id} className="bg-gray-750 rounded p-2 border border-gray-700">
                            <div className="font-medium mb-1">{target.id + 1}号【{target.role?.name || '未知'}】</div>
                            <div className="space-y-1">
                              {infoViewers.map(viewer => {
                                const reg = props.getRegistrationCached(target, viewer.role);
                                const typeText = reg.roleType ? typeLabels[reg.roleType] || reg.roleType : '无类型';
                                const status = reg.registersAsDemon
                                  ? '视为恶魔'
                                  : reg.registersAsMinion
                                    ? '视为爪牙'
                                    : `阵营=${reg.alignment === 'Evil' ? '邪恶' : '善良'}, 类型=${typeText}`;
                                return (
                                  <div key={`${viewer.id}-${target.id}`} className="flex items-center justify-between gap-2">
                                    <span className="text-gray-400">在【{viewer.name}】眼中</span>
                                    <span className="text-white">{status}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="text-sm text-gray-400 text-center py-4">
                  当前无需要伪装身份识别的角色
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </>
  );
}


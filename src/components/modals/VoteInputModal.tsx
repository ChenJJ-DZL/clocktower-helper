import { useState } from "react";
import type { Seat } from "../../../app/data";
import { isPlayerEvil } from "../../../app/gameLogic";
import { ModalWrapper } from "./ModalWrapper";

interface ButlerVoteInfo {
  butlerId: number;
  masterId: number;
  masterVoting: boolean;
}

/**
 * 计算选中投票者中的管家票状态
 * 规则：管家投票但主人未投票 → 管家票不计算（计 0）
 * 与 useExecutionHandlers.submitVotes 的管家校验逻辑保持一致
 */
function computeButlerInfos(
  selectedVoters: number[],
  seats: Seat[]
): ButlerVoteInfo[] {
  const infos: ButlerVoteInfo[] = [];
  for (const id of selectedVoters) {
    const seat = seats.find((s) => s.id === id);
    if (!seat) continue;
    const rawMaster = (seat as any).masterId;
    const isButler =
      seat.role?.id === "butler" ||
      seat.role?.id === "qutler" ||
      rawMaster !== undefined;
    const hasValidMaster =
      rawMaster !== undefined && rawMaster !== null && rawMaster !== id;
    if (!isButler || !hasValidMaster) continue;
    infos.push({
      butlerId: id,
      masterId: rawMaster,
      masterVoting: selectedVoters.includes(rawMaster),
    });
  }
  return infos;
}

export function VoteInputModalContent(props: {
  voterId: number | null;
  seats: Seat[];
  registerVotes?: (seatIds: number[]) => void;
  submitVotes: (count: number, voters?: number[]) => void;
  setCurrentModal: (modal: any) => void;
  setShowVoteInputModal?: (value: number | null) => void;
  onCancelVote?: (nomineeId?: number) => void;
}) {
  const [selectedVoters, setSelectedVoters] = useState<number[]>([]);
  const seats = props.seats;
  const candidate = seats.find((s) => s.id === props.voterId);

  if (props.voterId === null) return null;

  const aliveCore = seats.filter((s) => {
    if (!s.role) return false;
    const roleType = (s.role as any)?.type;
    return !s.isDead && roleType !== "traveler";
  });
  const threshold = Math.max(1, Math.ceil(aliveCore.length / 2));

  const toggleVoter = (id: number) => {
    setSelectedVoters((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const invalidDeadSelected = selectedVoters.some((id) => {
    const seat = seats.find((s) => s.id === id);
    return seat?.isDead && seat?.hasGhostVote === false;
  });

  const selectedAlive = selectedVoters.filter((id) => {
    const seat = seats.find((s) => s.id === id);
    return seat && !seat.isDead;
  }).length;
  const selectedDead = selectedVoters.length - selectedAlive;

  const ghostHolders = seats
    .filter((s) => s.isDead && s.hasGhostVote !== false)
    .map((s) => `${s.id + 1}号`);

  // 🔧 管家票实时计算：主人未投票的管家票不计算
  const butlerInfos = computeButlerInfos(selectedVoters, seats);
  const effectiveVoters = selectedVoters.filter((id) => {
    const info = butlerInfos.find((b) => b.butlerId === id);
    if (info && !info.masterVoting) return false;
    return true;
  });
  const effectiveCount = effectiveVoters.length;
  const excludedButlers = butlerInfos.filter((b) => !b.masterVoting);

  // 军团规则：若场上有军团在场，且所有投票者均为邪恶玩家（无善良玩家举手），则该项提名的投票计为 0 票，处决无效
  const hasLegionInPlay = seats.some((s) => s.role?.id === "legion");
  const votingSeats = seats.filter((s) => effectiveVoters.includes(s.id));
  const isAllEvilLegionVoters =
    hasLegionInPlay &&
    votingSeats.length > 0 &&
    votingSeats.every((s) => isPlayerEvil(s));

  const displayVoteCount = isAllEvilLegionVoters ? 0 : effectiveCount;
  const isReachThreshold = displayVoteCount >= threshold;

  const handleConfirm = () => {
    if (invalidDeadSelected) {
      alert("选择中包含已用完幽灵票的死亡玩家");
      return;
    }
    props.registerVotes?.(effectiveVoters);
    props.submitVotes(displayVoteCount, effectiveVoters);
    setSelectedVoters([]);
    props.setCurrentModal(null);
    if (props.setShowVoteInputModal) {
      props.setShowVoteInputModal(null);
    }
  };

  const handleClose = () => {
    setSelectedVoters([]);
    props.onCancelVote?.(candidate?.id);
    props.setCurrentModal(null);
    if (props.setShowVoteInputModal) {
      props.setShowVoteInputModal(null);
    }
  };

  return (
    <ModalWrapper
      title="🗳️ 举手表决计票"
      onClose={handleClose}
      closeOnOverlayClick={false}
      className="max-w-2xl"
    >
      <div className="p-4 sm:p-5 text-white text-center">
        {/* 顶部被提名者信息与简要说明 */}
        <div className="mb-2 text-center">
          <div className="text-lg font-bold text-amber-300">
            当前被提名者：
            {candidate
              ? `${candidate.id + 1}号 ${candidate.playerName || ""}`
              : "未知"}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            请勾选本轮举手表决的玩家（存活玩家可自由举手，死亡玩家消耗 1
            张幽灵票
            {ghostHolders.length > 0
              ? `，场上存票：${ghostHolders.join("、")}`
              : ""}
            ）
          </div>
        </div>

        {/* 玩家网格：紧凑 5 列布局，一屏完整呈现 */}
        <div className="grid grid-cols-5 gap-2 my-2.5 p-0.5">
          {seats
            .filter((s) => s.role)
            .map((s) => {
              const ghostUsed = s.isDead && s.hasGhostVote === false;
              const disabled = ghostUsed;
              const isSelected = selectedVoters.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleVoter(s.id)}
                  className={`py-1.5 px-1 rounded-xl border-2 text-center transition flex flex-col items-center justify-center gap-0.5 ${
                    disabled
                      ? "border-gray-800 bg-gray-900/60 text-gray-600 cursor-not-allowed opacity-40"
                      : isSelected
                        ? "border-amber-400 bg-amber-600 text-white shadow-md shadow-amber-500/30 font-bold scale-[1.02]"
                        : "border-slate-700 bg-slate-800/90 text-slate-200 hover:border-slate-500 hover:bg-slate-700"
                  }`}
                  title={
                    ghostUsed
                      ? "幽灵票已用尽"
                      : s.isDead
                        ? "死亡玩家可用幽灵票"
                        : "存活玩家"
                  }
                >
                  <div className="font-bold text-sm leading-tight">
                    {s.id + 1}号
                  </div>
                  <div className="text-[11px] truncate max-w-full text-slate-200 leading-tight">
                    {s.playerName || (s.role ? s.role.name : "")}
                  </div>
                  <div className="text-[10px] leading-tight opacity-80">
                    {s.isDead ? (ghostUsed ? "💀无票" : "💀幽灵票") : "🟢存活"}
                  </div>
                </button>
              );
            })}
        </div>

        {/* 核心生效票数展示卡片（单版面直观核心） */}
        <div className="my-2.5 py-2.5 px-4 text-sm text-gray-200 bg-slate-900/70 rounded-xl border border-slate-700/60 shadow-inner">
          <div className="flex items-center justify-center flex-wrap gap-2">
            <span className="text-base text-gray-100">
              当前生效的票数：
              <span className="font-black text-amber-400 text-2xl mx-1">
                {displayVoteCount}
              </span>
              票
              {isAllEvilLegionVoters && (
                <span className="text-xs text-red-400 font-bold ml-1">
                  (军团全邪恶投票计0票)
                </span>
              )}
            </span>
            <span className="text-sm text-gray-400">
              （上台门槛：{threshold} 票）
            </span>
            <span
              className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                isReachThreshold
                  ? "bg-red-900/70 text-red-200 border-red-500/80 shadow-sm"
                  : "bg-slate-800 text-gray-400 border-slate-600"
              }`}
            >
              {isReachThreshold
                ? "⚠️ 达到门槛 (上处决台)"
                : "✓ 未达门槛 (不上台)"}
            </span>
          </div>

          <div className="text-xs text-gray-400 mt-1.5 flex flex-wrap items-center justify-center gap-x-4 gap-y-0.5">
            <span>
              存活举手:{" "}
              <strong className="text-gray-200">{selectedAlive}</strong> 人
            </span>
            <span>
              死亡举手:{" "}
              <strong className="text-gray-200">{selectedDead}</strong> 人
            </span>
            {excludedButlers.length > 0 && (
              <span className="text-yellow-300 font-medium">
                ⚠️ 已剔除 {excludedButlers.length} 张管家无效票（主人未举手）
              </span>
            )}
          </div>

          {invalidDeadSelected && (
            <div className="mt-1 text-red-400 text-xs font-bold">
              ⚠️ 选择中包含已用完幽灵票的死亡玩家，请取消勾选
            </div>
          )}

          {/* 军团规则：所有投票者均为邪恶玩家时记0票 */}
          {isAllEvilLegionVoters && (
            <div className="mt-2 py-1.5 px-3 bg-red-950/90 border border-red-500 rounded-lg text-red-200 text-xs font-bold text-center animate-pulse">
              ⚠️
              军团能力触发：所有投票者均为邪恶阵营（无善良玩家投票），本次表决记为
              0 票，处决无效！
            </div>
          )}
        </div>

        {/* 管家详细状态（紧凑 1 行提示） */}
        {butlerInfos.length > 0 && (
          <div className="mb-2 text-xs space-y-1">
            {butlerInfos.map((b) => (
              <div
                key={b.butlerId}
                className={`py-1 px-3 rounded-lg border text-center ${
                  b.masterVoting
                    ? "bg-emerald-900/30 border-emerald-600/40 text-emerald-200"
                    : "bg-yellow-900/30 border-yellow-600/40 text-yellow-200"
                }`}
              >
                🤵 {b.butlerId + 1}号管家：因 {b.masterId + 1}号主人{" "}
                {b.masterVoting ? "已举手，此票生效" : "未举手，此票不生效"}
              </div>
            ))}
          </div>
        )}

        {/* 底部操作按钮 */}
        <div className="flex gap-4 justify-center mt-3">
          <button
            type="button"
            onClick={handleClose}
            className="px-6 py-2.5 bg-gray-600 hover:bg-gray-500 text-white rounded-xl font-bold transition shadow-md"
          >
            取消
          </button>
          <button
            type="button"
            disabled={invalidDeadSelected}
            onClick={handleConfirm}
            className="px-8 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-bold transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed text-base"
          >
            确认（{effectiveCount} 票）
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
}

import { useState } from "react";
import type { Seat } from "../../../app/data";
import type { ModalType } from "../../types/modal";
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
  setCurrentModal: (modal: ModalType | null) => void;
  setShowVoteInputModal?: (value: number | null) => void;
}) {
  const { voterId, seats } = props;
  const [selectedVoters, setSelectedVoters] = useState<number[]>([]);
  // 🔧 二次确认阶段：点"确认"后先展示"共收到X票，上/不上处决台"，确认后才提交计票
  const [confirmStage, setConfirmStage] = useState(false);

  if (voterId === null) return null;

  const candidate = seats.find((s) => s.id === voterId);
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

  const handleFirstConfirm = () => {
    if (invalidDeadSelected) {
      alert("选择中包含已用完幽灵票的死亡玩家");
      return;
    }
    setConfirmStage(true);
  };

  const handleFinalConfirm = () => {
    props.registerVotes?.(effectiveVoters);
    props.submitVotes(effectiveCount, effectiveVoters);
    setSelectedVoters([]);
    setConfirmStage(false);
    props.setCurrentModal(null);
    if (props.setShowVoteInputModal) {
      props.setShowVoteInputModal(null);
    }
  };

  const handleClose = () => {
    setSelectedVoters([]);
    setConfirmStage(false);
    props.setCurrentModal(null);
    if (props.setShowVoteInputModal) {
      props.setShowVoteInputModal(null);
    }
  };

  return (
    <ModalWrapper
      title={confirmStage ? "🗳️ 确认计票" : "🗳️ 举手表决计票"}
      onClose={handleClose}
      closeOnOverlayClick={false}
      className="max-w-2xl"
    >
      <div className="p-6 text-white text-center">
        {confirmStage ? (
          /* ============ 二次确认：共收到X票，上/不上处决台 ============ */
          <div className="py-2">
            <div className="text-base text-amber-200/90 mb-3">
              被提名者：
              <span className="font-bold text-amber-400">
                {candidate
                  ? `${candidate.id + 1}号 ${candidate.playerName || ""}`
                  : "未知"}
              </span>
            </div>
            <div className="text-4xl font-black mb-3 text-white">
              共收到
              <span className="text-amber-400 mx-2 text-5xl">
                {effectiveCount}
              </span>
              票
            </div>
            <div
              className={`inline-block text-lg font-bold px-6 py-2 rounded-xl mb-4 shadow-md ${
                effectiveCount >= threshold
                  ? "bg-red-900/60 text-red-200 border border-red-500/80"
                  : "bg-emerald-900/60 text-emerald-200 border border-emerald-500/80"
              }`}
            >
              {effectiveCount >= threshold
                ? "⚠️ 达到门槛（上处决台）"
                : "✓ 未达门槛（不上处决台）"}
            </div>
            <div className="text-sm text-gray-300 mb-3">
              上台门槛：{threshold} 票（存活玩家 {aliveCore.length} 人，半数向上取整）
            </div>

            {/* 管家票不计算提示 */}
            {excludedButlers.length > 0 && (
              <div className="text-left text-xs bg-yellow-900/40 border border-yellow-600/50 rounded-xl p-3 mb-4 space-y-1">
                <div className="text-yellow-300 font-bold mb-1">
                  ⚠️ 以下管家票不计算（主人未投票）：
                </div>
                {excludedButlers.map((b) => (
                  <div key={b.butlerId} className="text-yellow-200">
                    {b.butlerId + 1}号管家角色的票，因 {b.masterId + 1}号主人
                    未投票，本次票数不计算
                  </div>
                ))}
              </div>
            )}

            {excludedButlers.length === 0 && butlerInfos.length > 0 && (
              <div className="text-left text-xs bg-emerald-900/40 border border-emerald-600/50 rounded-xl p-3 mb-4 space-y-1">
                <div className="text-emerald-300 font-bold mb-1">
                  管家票（主人已投票）：
                </div>
                {butlerInfos
                  .filter((b) => b.masterVoting)
                  .map((b) => (
                    <div key={b.butlerId} className="text-emerald-200">
                      {b.butlerId + 1}号管家角色的票，因 {b.masterId + 1}号主人
                      已投票，本次票数计算
                    </div>
                  ))}
              </div>
            )}

            <div className="text-sm text-gray-300 mb-6">
              投票者：
              {effectiveVoters.length > 0
                ? effectiveVoters.map((id) => `${id + 1}号`).join("、")
                : "无"}
            </div>

            <div className="flex gap-4 justify-center">
              <button
                type="button"
                onClick={() => setConfirmStage(false)}
                className="px-6 py-3 bg-gray-600 hover:bg-gray-500 text-white rounded-xl font-bold transition shadow-md"
              >
                返回修改
              </button>
              <button
                type="button"
                onClick={handleFinalConfirm}
                className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition shadow-md"
              >
                确认提交计票
              </button>
            </div>
          </div>
        ) : (
          /* ============ 第一阶段：选择举手玩家 ============ */
          <>
            <div className="mb-4 text-center">
              <div className="text-lg font-bold text-amber-300">
                当前被提名者：
                {candidate
                  ? `${candidate.id + 1}号 ${candidate.playerName || ""}`
                  : "未知"}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                请在下方勾选本轮举手的玩家；存活玩家可自由举手，死亡玩家消耗 1 张幽灵票。
              </div>
              {ghostHolders.length > 0 && (
                <div className="text-xs text-amber-200/80 mt-1">
                  场上仍有幽灵票的死亡玩家：{ghostHolders.join("、")}
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5 mb-4 max-h-[48vh] overflow-y-auto p-1">
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
                      className={`p-3 rounded-xl border-2 text-center transition flex flex-col items-center justify-center gap-1 ${
                        disabled
                          ? "border-gray-800 bg-gray-900/60 text-gray-600 cursor-not-allowed opacity-50"
                          : isSelected
                            ? "border-amber-400 bg-amber-600 text-white shadow-lg shadow-amber-500/30 scale-105 font-bold"
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
                      <div className="font-bold text-base">
                        {s.id + 1}号
                      </div>
                      <div className="text-xs truncate max-w-full">
                        {s.playerName || (s.role ? s.role.name : "")}
                      </div>
                      <div className="text-[11px] opacity-80">
                        {s.isDead
                          ? ghostUsed
                            ? "💀已无票"
                            : "💀幽灵票"
                          : "🟢存活"}
                      </div>
                    </button>
                  );
                })}
            </div>

            <div className="mb-4 text-sm text-gray-200 bg-slate-900/50 p-3 rounded-xl border border-slate-700/50">
              <div>
                当前选中的票数：
                <span className="font-bold text-amber-400 text-xl mx-1">
                  {selectedVoters.length}
                </span>
                票（上台门槛：{threshold} 票）
              </div>
              <div className="text-xs text-gray-400 mt-1">
                存活举手：{selectedAlive} 人 ｜ 死亡举手（消耗幽灵票）：{selectedDead} 人
              </div>
              {invalidDeadSelected && (
                <div className="mt-2 text-red-400 text-xs font-bold">
                  ⚠️ 选择中包含已用完幽灵票的死亡玩家，请取消勾选
                </div>
              )}
            </div>

            {/* 管家票实时内联展示 */}
            {butlerInfos.length > 0 && (
              <div className="mb-4 text-left text-xs space-y-1">
                <div className="text-yellow-300 font-bold">
                  🤵 管家票状态：
                </div>
                {butlerInfos.map((b) => (
                  <div
                    key={b.butlerId}
                    className={`px-3 py-1.5 rounded-lg border ${
                      b.masterVoting
                        ? "bg-emerald-900/30 border-emerald-600/40 text-emerald-200"
                        : "bg-yellow-900/30 border-yellow-600/40 text-yellow-200"
                    }`}
                  >
                    {b.butlerId + 1}号管家角色的票，因为 {b.masterId + 1}号主人{" "}
                    {b.masterVoting ? "已投票" : "未投票"}，本次票数{" "}
                    {b.masterVoting ? "计算" : "不计算"}
                  </div>
                ))}
                {excludedButlers.length > 0 && (
                  <div className="text-gray-300 mt-1">
                    实际有效计票：
                    <span className="font-bold text-amber-400">
                      {effectiveCount}
                    </span>{" "}
                    票（已剔除 {excludedButlers.length} 张管家无效票）
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-4 justify-center">
              <button
                type="button"
                onClick={handleClose}
                className="px-6 py-3 bg-gray-600 hover:bg-gray-500 text-white rounded-xl font-bold transition shadow-md"
              >
                取消
              </button>
              <button
                type="button"
                disabled={invalidDeadSelected}
                onClick={handleFirstConfirm}
                className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                确认（{selectedVoters.length} 票）
              </button>
            </div>
          </>
        )}
      </div>
    </ModalWrapper>
  );
}

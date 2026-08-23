import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Seat } from "../../../app/data";
import type { ModalType } from "../../types/modal";

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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setSelectedVoters([]);
    setConfirmStage(false);
  }, []);

  if (voterId === null || typeof document === "undefined" || !mounted) return null;
  const candidate = seats.find((s) => s.id === voterId);
  const aliveCore = seats.filter((s) => {
    if (!s.role) return false;
    const roleType = (s.role as any).type;
    return !s.isDead && roleType !== "traveler";
  });
  const threshold = Math.ceil(aliveCore.length / 2);

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
    // 进入二次确认阶段
    setConfirmStage(true);
  };

  const handleFinalConfirm = () => {
    props.registerVotes?.(effectiveVoters);
    props.submitVotes(effectiveCount, effectiveVoters);
    setSelectedVoters([]);
    setConfirmStage(false);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[2147483647] bg-black/75 backdrop-blur-sm flex items-center justify-center"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-gray-800 p-8 rounded-2xl text-center border-2 border-blue-500 relative w-[720px] max-h-[90vh] overflow-y-auto">
        {confirmStage ? (
          /* ============ 二次确认：共收到X票，上/不上处决台 ============ */
          <div className="py-4">
            <h3 className="text-3xl font-bold mb-2">🗳️ 确认计票</h3>
            <div className="text-sm text-gray-300 mb-4">
              被提名者：{candidate ? `${candidate.id + 1}号` : "未知"}（提名者投票后计票）
            </div>
            <div className="text-4xl font-black mb-2">
              共收到
              <span className="text-blue-300 mx-1">{effectiveCount}</span>
              票
            </div>
            <div
              className={`inline-block text-lg font-bold px-4 py-1.5 rounded-xl mb-4 ${
                effectiveCount >= threshold
                  ? "bg-red-900/50 text-red-200 border border-red-500/60"
                  : "bg-emerald-900/50 text-emerald-200 border border-emerald-500/60"
              }`}
            >
              {effectiveCount >= threshold ? "上处决台" : "不上处决台"}
            </div>
            <div className="text-xs text-gray-400 mb-2">
              上台门槛：{threshold} 票（存活玩家半数向上取整）
            </div>

            {/* 管家票不计算提示 */}
            {excludedButlers.length > 0 && (
              <div className="text-left text-xs bg-yellow-900/30 border border-yellow-600/40 rounded-lg p-3 mb-4 space-y-1">
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
              <div className="text-left text-xs bg-emerald-900/30 border border-emerald-600/40 rounded-lg p-3 mb-4 space-y-1">
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

            <div className="text-xs text-gray-400 mb-2">
              投票者：
              {effectiveVoters.length > 0
                ? effectiveVoters.map((id) => `${id + 1}号`).join("、")
                : "无"}
            </div>

            <div className="flex gap-3 justify-center mt-4">
              <button
                onClick={handleFinalConfirm}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold shadow"
              >
                确认提交
              </button>
              <button
                onClick={() => setConfirmStage(false)}
                className="px-6 py-3 bg-gray-600 hover:bg-gray-500 text-white rounded-xl font-bold shadow"
              >
                返回修改
              </button>
            </div>
          </div>
        ) : (
          /* ============ 第一阶段：选择举手玩家 ============ */
          <>
            <h3 className="text-3xl font-bold mb-4">🗳️ 选择举手玩家</h3>
            <div className="mb-4 text-sm text-gray-200 leading-relaxed">
              <div>
                当前被提名者：{candidate ? `${candidate.id + 1}号` : "未知"}
              </div>
              <div className="text-xs text-yellow-300 mt-1">
                规则：选中的死亡玩家会自动消耗幽灵票；没有幽灵票的死亡玩家无法再举手。
              </div>
              <div className="text-xs text-yellow-200 mt-1">
                场上仍有死者票的玩家：
                {ghostHolders.length ? ghostHolders.join("、") : "无"}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
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
                      className={`p-3 rounded-xl border-2 text-left transition ${
                        disabled
                          ? "border-gray-700 bg-gray-900/50 text-gray-500 cursor-not-allowed"
                          : isSelected
                            ? "border-blue-400 bg-blue-900/60 text-white shadow-lg shadow-blue-500/30"
                            : "border-slate-600 bg-slate-800/80 text-slate-100 hover:bg-slate-700"
                      }`}
                      title={
                        ghostUsed
                          ? "幽灵票已用尽"
                          : s.isDead
                            ? "死亡玩家可用幽灵票"
                            : "存活玩家"
                      }
                    >
                      <div className="flex justify-between items-center">
                        <div className="font-bold">
                          {s.id + 1}号 {s.playerName || ""}
                        </div>
                        <div className="text-xs text-gray-300">
                          {s.isDead
                            ? ghostUsed
                              ? "💀(无票)"
                              : "💀 幽灵票"
                            : "存活"}
                        </div>
                      </div>
                    </button>
                  );
                })}
            </div>

            <div className="mb-4 text-sm text-gray-100">
              <div>
                当前选中的票数：
                <span className="font-bold text-blue-200 text-lg">
                  {selectedVoters.length}
                </span>
              </div>
              <div className="text-xs text-gray-300 mt-1">
                存活：{selectedAlive} 张 / 死亡（消耗幽灵票）：{selectedDead} 张
              </div>
              <div className="text-xs text-gray-300 mt-1">
                上台门槛：{threshold} 票
              </div>
              {invalidDeadSelected && (
                <div className="mt-2 text-red-400 text-xs">
                  选择中包含已用完幽灵票的死亡玩家，请取消勾选
                </div>
              )}
            </div>

            {/* 🔧 管家票实时内联展示（替代原原生 alert）：选中管家时显示主人投票状态 */}
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
                    {b.masterVoting ? "投票" : "未投票"}，本次票数{" "}
                    {b.masterVoting ? "计算" : "不计算"}
                  </div>
                ))}
                {excludedButlers.length > 0 && (
                  <div className="text-gray-300 mt-1">
                    实际计票：
                    <span className="font-bold text-blue-200">
                      {effectiveCount}
                    </span>{" "}
                    票（已剔除 {excludedButlers.length} 张管家无效票）
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3 justify-center">
              <button
                onClick={handleFirstConfirm}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold shadow disabled:opacity-50 disabled:cursor-not-allowed"
              >
                确认（{selectedVoters.length} 票）
              </button>
              <button
                onClick={() => {
                  setSelectedVoters([]);
                  setConfirmStage(false);
                  props.setCurrentModal(null);
                  if (props.setShowVoteInputModal)
                    props.setShowVoteInputModal(null);
                }}
                className="px-6 py-3 bg-gray-600 hover:bg-gray-500 text-white rounded-xl font-bold shadow"
              >
                取消
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

import { useEffect, useState } from "react";
import type { Role, Seat } from "../../../app/data";
import { isPlayerEvil } from "../../../app/gameLogic";
import { displayPlayerName, formatSeatLabel } from "../../utils/seatLabel";
import { isVoteInvalidSeat, pruneInvalidVoters } from "../../utils/voteEligibility";
import { computeVoteGrid } from "../../utils/voteGrid";
import {
  isTravelerSlotId,
  listAliveTravelerSlots,
  voudonAllowsVoter,
  voudonThreshold,
} from "../../utils/travelerHooks";
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
  /**
   * 🧳 旅行者槽位（定长 4，null = 空/已离场）。
   * ⚠️ 旅行者**不占 seats**，但**可以投票**（官方：旅行者与玩家一样举手）
   *   ⇒ 必须单独传进来才能出现在投票名单里。id 用负数插槽编码
   *   （`travelerSlotId(index) = -(index+1)`），与座位 id 永不冲突。
   */
  travelers?: (Role | null)[];
  /**
   * 🥣 乞丐（traveler）：官方「你只能使用投票标记才能投票。死亡的玩家可以将他的
   *   投票标记给你，如果他这么做，你会得知他的阵营。」⇒
   *   · `beggarSlotId` 非 null 时启用门控：乞丐无标记则在名单上置灰；
   *   · `beggarEligibleDonors` = 可捐标记的死亡座位（已死 + 仍有幽灵票 + 未捐过）；
   *   · `beggarDonations` 仅用于展示「乞丐已得知谁是什么阵营」。
   */
  beggarSlotId?: number | null;
  beggarTokens?: number;
  beggarEligibleDonors?: number[];
  beggarDonations?: {
    donorSeatId: number;
    knownAlignment: "good" | "evil";
  }[];
  onGiveBeggarToken?: (donorSeatId: number) => void;
  /**
   * 🧙 巫毒师（voudon）：官方「只有你和死亡的玩家可以投票，且投票不需要使用
   *   投票标记。忽略票数需要过半的要求。」
   *   · `voudonActive` ⇒ 存活玩家不可举手、死亡玩家不消耗幽灵票、门槛降为 1；
   *   · `voudonSlotId` = 巫毒师自己的插槽 id（他自己**可以**投票）。
   */
  voudonActive?: boolean;
  voudonSlotId?: number | null;
  registerVotes?: (seatIds: number[]) => void;
  submitVotes: (count: number, voters?: number[]) => void;
  setCurrentModal: (modal: any) => void;
  setShowVoteInputModal?: (value: number | null) => void;
  onCancelVote?: (nomineeId?: number) => void;
}) {
  const [selectedVoters, setSelectedVoters] = useState<number[]>([]);
  // 被自动剔除的失效选票（幽灵票用尽 / 已死亡），用于内联提示
  const [prunedVoters, setPrunedVoters] = useState<number[]>([]);
  const seats = props.seats;
  const travelers = props.travelers;
  const travelerSlots = listAliveTravelerSlots(travelers);
  // 🥣 乞丐门控：无投票标记 ⇒ 在名单上置灰（官方：只能用投票标记投票）
  const beggarSlotId = props.beggarSlotId ?? null;
  const beggarTokens = props.beggarTokens ?? 0;
  const beggarEligibleDonors = props.beggarEligibleDonors ?? [];
  const beggarDonations = props.beggarDonations ?? [];
  // 🧙 巫毒师：改写「谁可投票 / 是否耗幽灵票 / 门槛」
  const voudonActive = props.voudonActive ?? false;
  const voudonSlotId = props.voudonSlotId ?? null;
  const candidate = seats.find((s) => s.id === props.voterId);

  if (props.voterId === null) return null;

  const aliveCore = seats.filter((s) => {
    if (!s.role) return false;
    const roleType = (s.role as any)?.type;
    return !s.isDead && roleType !== "traveler";
  });
  // 门槛：常规 = 存活核心半数向上取整；巫毒师在场 ⇒ 官方「忽略过半要求」= 1
  const threshold = voudonThreshold(
    voudonActive,
    Math.max(1, Math.ceil(aliveCore.length / 2))
  );

  const toggleVoter = (id: number) => {
    setSelectedVoters((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const { valid: validVoters, pruned: invalidIds } = pruneInvalidVoters(
    selectedVoters,
    seats,
    // 🧳 旅行者不占 seats ⇒ 不能被「查不到座位」误判为失效票
    // 🧙 巫毒师在场 ⇒ 死亡玩家不需要投票标记，幽灵票用尽也仍然有效
    (id) =>
      isTravelerSlotId(id) ||
      (voudonActive && Boolean(seats.find((s) => s.id === id)?.isDead))
  );
  const invalidDeadSelected = invalidIds.length > 0;

  // 🔧 自愈：已勾选的座位若中途失效（幽灵票用尽 / 已死亡），立即剔除并内联告知。
  // 此前只把「确认」按钮置灰且不说明原因（原来那句 alert 是死代码：按钮在同样条件下
  // 已 disabled，永远进不去），用户与自动化驱动只能「投票 → 取消 → 重投」死循环。
  useEffect(() => {
    if (invalidIds.length === 0) return;
    setPrunedVoters(invalidIds);
    setSelectedVoters(validVoters);
  }, [invalidIds.length, seats]);

  // 🧳 旅行者举手单列（负数插槽 id；他们不占座位、也没有幽灵票概念）
  const selectedTravelerCount = selectedVoters.filter(isTravelerSlotId).length;
  const selectedAlive = selectedVoters.filter((id) => {
    if (isTravelerSlotId(id)) return false;
    const seat = seats.find((s) => s.id === id);
    return seat && !seat.isDead;
  }).length;
  const selectedDead =
    selectedVoters.length - selectedAlive - selectedTravelerCount;

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
    // 自愈逻辑已保证不会出现无效选择；这里仅作静默兜底，不再使用原生 alert
    // （原生 alert 会阻塞渲染并冻结自动化会话，项目已统一避免）。
    if (invalidDeadSelected) return;
    // ⚠️ 「已结算」闩锁由 submitVotes 内部置位（见 utils/nominationEligibility），
    //    因为 submitVotes 会提前 return（票数非法/被过滤），那些情况都不算结算。
    props.registerVotes?.(effectiveVoters);
    props.submitVotes(displayVoteCount, effectiveVoters);
    setSelectedVoters([]);
    props.setCurrentModal(null);
    if (props.setShowVoteInputModal) {
      props.setShowVoteInputModal(null);
    }
  };

  const handleClose = () => {
    // 🗣️ 取消 = 说书人反悔，**只有这里**才应该恢复提名资格。
    setSelectedVoters([]);
    props.onCancelVote?.(candidate?.id);
    props.setCurrentModal(null);
    if (props.setShowVoteInputModal) {
      props.setShowVoteInputModal(null);
    }
  };

  // 列数按实际人数自适应(见 src/utils/voteGrid.ts，最多 15 人)：
  // 整除则整行铺满，否则末行尽量填满并在行内居中。
  const voters = seats.filter((s) => s.role);
  const { columns, rows: voterRowSpecs } = computeVoteGrid(voters.length);
  const voterRows = voterRowSpecs.map((r) =>
    voters.slice(r.start, r.start + r.count)
  );
  // 卡片高度按行数收敛：3 行时必须让「确认」按钮留在弹窗内(不滚动即可计票)，
  // 人数少时也不把单张卡片拉得过大。字号用 min(cqi,cqh) 跟着卡片宽高一起缩放。
  const cardHeight =
    voterRows.length >= 3
      ? "7.75rem"
      : voterRows.length === 2
        ? "10.5rem"
        : "11rem";

  return (
    <ModalWrapper
      title="🗳️ 举手表决计票"
      onClose={handleClose}
      closeOnOverlayClick={false}
      widthRatio={0.98}
      maxWidthPx={1560}
      autoHeight
    >
      <div className="flex flex-col p-4 sm:p-5 text-white text-center">
        {/* 顶部被提名者信息与简要说明 */}
        <div className="shrink-0 mb-1 text-center">
          <div className="text-4xl font-black text-amber-300">
            当前被提名者：
            {candidate
              ? formatSeatLabel(candidate.id, candidate.playerName)
              : "未知"}
          </div>
          <div className="text-lg text-gray-400 mt-1.5">
            请勾选本轮举手表决的玩家（存活玩家可自由举手，死亡玩家消耗 1
            张幽灵票
            {ghostHolders.length > 0
              ? `，场上存票：${ghostHolders.join("、")}`
              : ""}
            ）
          </div>
          {voudonActive && (
            <div className="text-base text-fuchsia-300 font-bold mt-1">
              🧙 巫毒师在场：只有巫毒师本人与死亡玩家可以投票，且投票不需要使用投票标记；
              忽略票数需要过半的要求（1 票即上台）
            </div>
          )}
        </div>

        {/* 玩家网格：列数随人数自适应，卡片尺寸上下封顶，避免人数少时被拉大 */}
        <div className="flex flex-col justify-center gap-3 my-1.5">
          {voterRows.map((row, rowIndex) => (
            <div key={rowIndex} className="flex justify-center gap-3">
              {row.map((s) => {
                // 🧙 巫毒师：死亡玩家投票不需投票标记 ⇒ 幽灵票用尽也能投
                const ghostUsed =
                  s.isDead && s.hasGhostVote === false && !voudonActive;
                // 🧙 巫毒师：只有他本人与死亡玩家可投票 ⇒ 存活玩家一律置灰
                const voudonBlocked = !voudonAllowsVoter(
                  voudonActive,
                  Boolean(s.isDead),
                  false
                );
                const disabled = ghostUsed || voudonBlocked;
                const isSelected = selectedVoters.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleVoter(s.id)}
                    style={{
                      maxWidth: `min(calc((100% - ${(columns - 1) * 0.75}rem) / ${columns}), 19rem)`,
                      height: cardHeight,
                      containerType: "size",
                    }}
                    className={`flex-1 min-w-0 py-2 px-2 rounded-2xl border-2 text-center transition flex flex-col items-center justify-center gap-1 overflow-hidden ${
                      disabled
                        ? "border-gray-800 bg-gray-900/60 text-gray-600 cursor-not-allowed opacity-40"
                        : isSelected
                          ? "border-amber-400 bg-amber-600 text-white shadow-md shadow-amber-500/30 font-bold scale-[1.02]"
                          : "border-slate-700 bg-slate-800/90 text-slate-200 hover:border-slate-500 hover:bg-slate-700"
                    }`}
                    title={
                      voudonBlocked
                        ? "巫毒师在场：只有巫毒师本人与死亡玩家可以投票"
                        : ghostUsed
                          ? "幽灵票已用尽"
                          : s.isDead
                            ? "死亡玩家可用幽灵票"
                            : "存活玩家"
                    }
                  >
                    {/* 字号随卡片宽高自适应(min(cqi,cqh))：人数变化时按钮与文字同步缩放 */}
                    <div
                      className="font-black leading-none"
                      style={{ fontSize: "min(19cqi, 36cqh)" }}
                    >
                      {s.id + 1}号
                    </div>
                    <div
                      className="truncate max-w-full text-slate-200 leading-tight"
                      style={{ fontSize: "min(9.5cqi, 19cqh)" }}
                    >
                      {displayPlayerName(s.playerName, s.id) ||
                        s.role?.name ||
                        ""}
                    </div>
                    <div
                      className="leading-none opacity-85"
                      style={{ fontSize: "min(7cqi, 14cqh)" }}
                    >
                      {voudonBlocked
                        ? "🚫不可投票"
                        : s.isDead
                          ? voudonActive
                            ? "💀可投票(免标记)"
                            : ghostUsed
                              ? "💀无票"
                              : "💀幽灵票"
                          : "🟢存活"}
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* 🧳 旅行者举手区：旅行者不占座位，用负数插槽 id 独立成排 */}
        {travelerSlots.length > 0 && (
          <div className="shrink-0 mt-1.5">
            <div className="text-sm text-yellow-300/90 mb-1.5">
              🧳 旅行者举手（不占座位；旅行者与玩家一样可以投票）
            </div>
            <div className="flex justify-center gap-3 flex-wrap">
              {travelerSlots.map((t) => {
                const isSelected = selectedVoters.includes(t.slotId);
                // 🥣 乞丐：没有投票标记时不可举手（官方：只能用投票标记才能投票）
                const isBeggarWithoutToken =
                  beggarSlotId !== null &&
                  t.slotId === beggarSlotId &&
                  beggarTokens <= 0;
                // 🧙 巫毒师在场：旅行者中**只有巫毒师自己**可以投票
                const voudonBlockedTraveler = !voudonAllowsVoter(
                  voudonActive,
                  false,
                  t.slotId === voudonSlotId
                );
                const travelerDisabled =
                  isBeggarWithoutToken || voudonBlockedTraveler;
                return (
                  <button
                    key={t.slotId}
                    type="button"
                    disabled={travelerDisabled}
                    onClick={() => toggleVoter(t.slotId)}
                    className={`min-w-[9rem] px-5 py-2.5 rounded-2xl border-2 text-center transition flex flex-col items-center justify-center gap-0.5 ${
                      travelerDisabled
                        ? "border-gray-800 bg-gray-900/60 text-gray-600 cursor-not-allowed opacity-50"
                        : isSelected
                          ? "border-amber-400 bg-amber-600 text-white font-bold scale-[1.02] shadow-md shadow-amber-500/30"
                          : "border-yellow-700/70 bg-yellow-900/40 text-yellow-100 hover:border-yellow-500 hover:bg-yellow-800/50"
                    }`}
                    title={
                      isBeggarWithoutToken
                        ? "乞丐没有投票标记 —— 需先由一名死亡玩家把投票标记交给他"
                        : voudonBlockedTraveler
                          ? "巫毒师在场：只有巫毒师本人与死亡玩家可以投票"
                          : "旅行者（不占座位，不可被提名，只能被流放）"
                    }
                  >
                    <div className="text-xl font-black leading-none">
                      🧳 {t.role.name}
                    </div>
                    <div className="text-xs opacity-85 leading-none">
                      {isBeggarWithoutToken
                        ? "无投票标记·不可举手"
                        : voudonBlockedTraveler
                          ? "巫毒师规则·不可举手"
                          : `旅行者·第${t.index + 1}位`}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 🥣 乞丐：死亡玩家交出投票标记（交出 ⇒ 乞丐 +1 枚且得知其阵营） */}
        {beggarSlotId !== null && (
          <div className="shrink-0 mt-1.5 rounded-xl border-2 border-amber-500/40 bg-amber-950/30 px-4 py-2">
            <div className="text-base text-amber-100 font-bold">
              🥣 乞丐投票标记：
              <span className="text-amber-300 text-2xl mx-1">
                {beggarTokens}
              </span>
              枚（每次以乞丐身份投票消耗 1 枚）
            </div>
            {beggarEligibleDonors.length > 0 ? (
              <div className="mt-1.5">
                <div className="text-xs text-amber-200/80 mb-1">
                  死亡玩家可把自己的投票标记交给乞丐（交出后消耗其幽灵票，
                  乞丐随之得知其阵营）：
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {beggarEligibleDonors.map((id) => {
                    const s = seats.find((seat) => seat.id === id);
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => props.onGiveBeggarToken?.(id)}
                        className="px-3 py-1.5 rounded-lg border border-amber-500/60 bg-amber-900/40 text-amber-100 text-sm font-bold hover:bg-amber-800/60 transition"
                      >
                        💀 {id + 1}号
                        {displayPlayerName(s?.playerName, id)
                          ? `(${displayPlayerName(s?.playerName, id)})`
                          : ""}{" "}
                        交出投票标记
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="mt-1 text-xs text-amber-200/60">
                当前没有可交出投票标记的死亡玩家（需已死亡且仍持有幽灵票、且未交出过）
              </div>
            )}
            {beggarDonations.length > 0 && (
              <div className="mt-1.5 text-xs text-emerald-300/90">
                乞丐已得知：
                {beggarDonations
                  .map(
                    (d) =>
                      `${d.donorSeatId + 1}号是${
                        d.knownAlignment === "evil" ? "邪恶" : "善良"
                      }`
                  )
                  .join("、")}
              </div>
            )}
          </div>
        )}

        {/* 核心生效票数展示卡片（单版面直观核心） */}
        <div className="shrink-0 mt-1 py-1.5 px-4 text-base text-gray-200 bg-slate-900/70 rounded-xl border border-slate-700/60 shadow-inner">
          <div className="flex items-center justify-center flex-wrap gap-2">
            <span className="text-2xl text-gray-100">
              当前生效的票数：
              <span className="font-black text-amber-400 text-5xl mx-2">
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
            {selectedTravelerCount > 0 && (
              <span className="text-yellow-300/90">
                🧳 旅行者举手:{" "}
                <strong className="text-gray-200">
                  {selectedTravelerCount}
                </strong>{" "}
                位
              </span>
            )}
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
        <div className="shrink-0 flex gap-4 justify-center mt-2">
          <button
            type="button"
            onClick={handleClose}
            className="px-12 py-3 text-2xl bg-gray-600 hover:bg-gray-500 text-white rounded-xl font-bold transition shadow-md"
          >
            取消
          </button>
          <button
            type="button"
            disabled={invalidDeadSelected}
            onClick={handleConfirm}
            className="px-14 py-3 text-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-black transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {/* 票数取 displayVoteCount（= 生效票数），不能取 effectiveCount：
                军团触发时生效票数为 0，按钮若显示原票数会与上方「当前生效的票数」自相矛盾。
                官方（officialRoleDocs.json · 军团 · 角色简介）：「如果一项提名中只有邪恶玩家参与了投票，
                那么在统计票数的时候会记为零票。」 */}
            确认（{displayVoteCount} 票）
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
}

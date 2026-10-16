"use client";

import { gameActions, useGameContext } from "../../contexts/GameContext";
import { useGameActions } from "../../contexts/GameActionsContext";
import { buildTwilightSteps } from "../../utils/travelerDusk";
import { roles as ALL_ROLES } from "../../../app/data";
import { isTravelerEvil } from "../../utils/travelerHooks";
import { unifiedEventBus } from "../../utils/unifiedEventBus";
import {
  AdaptiveSeatGrid,
  SEAT_CARD_FONT,
} from "../common/AdaptiveSeatGrid";
import { ModalWrapper } from "../modals/ModalWrapper";

/**
 * 暮色（Twilight = 官方 Dusk）面板
 * ==================================================================
 * 🔴 为什么必须有这个面板（2026-10-13 实测）：
 *   夜序队列（`dynamicQueueGenerator`）与夜间引擎（`useNightEngine`）
 *   **全仓零 traveler 引用**，而旅行者只存在于 `state.travelers`（不占 seats）
 *   ⇒ 15 个旅行者里 14 个的规则在真实对局里**从不触发**。
 *
 * ✅ 修法（用户选定方案 B）：在「提名/处决」与「入夜」之间插入**独立暮色阶段**，
 *   按官方黄昏顺序逐个唤醒有行动的旅行者。
 *
 * 🎨 2026-10-13 视觉重做（用户要求）：从自绘 `fixed inset-0` 小面板改为
 *   **与其他角色「技能确认」环节同一套范式** ——
 *   ModalWrapper `fullscreen90`（widthRatio 0.98 / maxWidthPx 1560）+
 *   大号设计字号（唤醒 text-3xl~4xl / 能力 text-xl~2xl）+
 *   `AdaptiveSeatGrid` 选人网格（列数/卡高/cqi 字号按人数自适应，触控友好）。
 *   小屏设备上整页随舞台等比缩放，格子大、易点按。
 *
 * ⚠️ 命名：本仓库 `dusk` = 白天提名阶段；官方 Dusk = 入夜前的行动时刻。
 *    两者**不是一回事**，故用独立阶段名 `twilight`，勿合并。
 *
 * ⚠️ 已落地的效果（2026-10-16）：
 *    · 官员 / 窃贼 —— 选投票目标（`twilightVoteTargets`，次日白天票仓消费）
 *    · 集骨者 —— 选一名**已死亡**玩家，他重新获得能力直到下个黄昏
 *      （`BONE_COLLECTOR_BLESS`，写入 `seats[x].hasAbilityEvenDead`，每局限一次）
 *    尚未接效果的（学徒/咖啡师/流莺）目前仍只做「唤醒 + 提示」，
 *    清单见 `traveler_wiring_contract.test.ts` 的 TWILIGHT_REACHABLE 档。
 *
 * ⚠️ E2E 文案锚点（twilight_traveler.spec.ts 依赖，勿改）：
 *    「🌆 暮色」「唤醒：X」「步骤 N / M」「选择目标玩家」「已选 N 号」
 *    「暮色结束，入夜」、目标按钮可访问名以「N号」开头。
 */
export function TwilightPanel() {
  const { state, dispatch } = useGameContext();
  // 🌙 流莺"两人同时死亡"必须走统一的死亡咽喉 killPlayer（含终局判定），
  //    不能直接改 seats.isDead。旅行者自己的"死亡"仍是槽位置 null。
  const actions = useGameActions();

  if (state.gamePhase !== "twilight") return null;

  const isFirstNight = !state.hasCompletedFirstNight;
  const steps = buildTwilightSteps(state.travelers ?? [], isFirstNight);
  const idx = Math.min(state.twilightStepIndex ?? 0, Math.max(0, steps.length - 1));
  const current = steps[idx];
  const isLast = idx >= steps.length - 1;

  // 官员 / 窃贼需要"选择除自己以外的一名玩家"——旅行者不占 seats，
  // 所以可选集合就是**全部玩家座位**；已选目标供回显与取消。
  const needsVoteTarget =
    current?.roleId === "bureaucrat" || current?.roleId === "thief";
  const pickedTarget =
    current?.roleId === "bureaucrat"
      ? state.twilightVoteTargets?.bureaucratTargetId
      : state.twilightVoteTargets?.thiefTargetId;

  const goNext = () => {
    dispatch({ type: "SET_TWILIGHT_STEP", index: idx + 1 });
  };
  const goPrev = () => {
    dispatch({ type: "SET_TWILIGHT_STEP", index: Math.max(0, idx - 1) });
  };
  // 🦴 集骨者：官方「选择一名**死亡的玩家**：他重新获得能力直到下个黄昏。」
  //    每局游戏限一次 ⇒ 已用过则只读提示。
  const needsDeadTarget = current?.roleId === "bone_collector";
  const boneCollectorUsed = state.travelerHookChoices?.boneCollectorUsed === true;
  const boneBlessedId = state.travelerHookChoices?.boneCollectorTargetId ?? null;
  const blessDeadSeat = (seatId: number) => {
    if (boneCollectorUsed) return;
    dispatch({ type: "BONE_COLLECTOR_BLESS", seatId });
  };

  // ☕ 咖啡师：选一名玩家 + 说书人二选一（解除并免疫毒醉 / 能力两次）
  const needsBaristaTarget = current?.roleId === "barista";
  const baristaTargetId = state.travelerHookChoices?.baristaTargetId ?? null;
  const baristaEffect = state.travelerHookChoices?.baristaEffect ?? null;

  // 🌙 流莺：选一名**存活**玩家 → 说书人裁定对方是否同意 → 是否双死
  const needsHarlotTarget = current?.roleId === "harlot";
  const harlotTargetId = state.travelerHookChoices?.harlotTargetId ?? null;
  const harlotAgreed = state.travelerHookChoices?.harlotAgreed === true;
  const harlotDoomed = state.travelerHookChoices?.harlotDoomed === true;
  const harlotTargetSeat =
    harlotTargetId === null
      ? null
      : (state.seats.find((x) => x.id === harlotTargetId) ?? null);
  const resolveHarlotBothDie = () => {
    if (harlotTargetId === null || !harlotAgreed || !current) return;
    dispatch({
      type: "SET_HARLOT_OUTCOME",
      targetId: harlotTargetId,
      doomed: true,
    });
    // 两人同时死亡：目标玩家走 killPlayer（统一咽喉）；流莺自己=槽位置 null
    actions.killPlayer?.(harlotTargetId, { source: "ability" });
    dispatch({ type: "EXECUTE_TRAVELER_SLOT", index: current.seatIndex });
  };

  // 🎓 学徒：首个夜晚获得一个能力（善良→镇民 / 邪恶→爪牙，按 travelerAlignments 判阵营）
  const needsApprenticeGrant = current?.roleId === "apprentice";
  const apprenticeEvil = isTravelerEvil(
    state.travelerAlignments,
    current?.seatIndex ?? -1
  );
  const apprenticeGrantedRoleId =
    state.travelerHookChoices?.apprenticeGrantedRoleId ?? null;
  const apprenticeCandidates = needsApprenticeGrant
    ? ALL_ROLES.filter((r) =>
        apprenticeEvil ? r.type === "minion" : r.type === "townsfolk"
      )
    : [];

  const pickVoteTarget = (seatId: number) => {
    if (!current) return;
    dispatch({
      type: "SET_TWILIGHT_VOTE_TARGET",
      role: current.roleId === "bureaucrat" ? "bureaucrat" : "thief",
      // 再点一次已选目标 = 取消选择（该角色当晚不发动）
      targetId: pickedTarget === seatId ? null : seatId,
    });
  };
  const finish = () => {
    // 暮色结束 → 入夜。首夜与否由引擎侧 hasCompletedFirstNight 推导。
    dispatch({ type: "SET_TWILIGHT_STEP", index: 0 });
    dispatch({
      type: "SET_GAME_PHASE",
      phase: isFirstNight ? "firstNight" : "night",
    });
    // ⚠️ 必须 emit（不能只切 phase）：首夜走 startFirstNight 才会生成夜间队列，
    //    否则小恶魔等恶魔不被唤醒。与 useGameFlow::startNightCore 同口径。
    unifiedEventBus.emit(
      isFirstNight ? "startFirstNight" : "startSubsequentNight",
      {}
    );
  };

  return (
    <ModalWrapper
      title={`🌆 暮色（${
        isFirstNight ? "首夜" : `第 ${state.nightCount} 夜`
      }）· 步骤 ${steps.length === 0 ? 0 : idx + 1} / ${steps.length}`}
      onClose={() => {
        /* 🔒 暮色是流程强制阶段：不允许点遮罩/✕ 溜掉（否则对局卡死在暮色）。
              唯一出口是「暮色结束，入夜」。hideClose 同时隐藏死 ✕ 按钮。 */
      }}
      closeOnOverlayClick={false}
      hideClose
      widthRatio={0.98}
      maxWidthPx={1560}
      autoHeight
      size="fullscreen90"
      footer={
        <div className="flex items-center gap-3 w-full">
          <button
            type="button"
            onClick={goPrev}
            disabled={idx === 0}
            className="px-6 py-3.5 rounded-xl border-2 border-white/15 bg-slate-800/60 text-slate-200 text-lg font-bold hover:bg-slate-700/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer shrink-0"
          >
            上一步
          </button>
          {!isLast && (
            <button
              type="button"
              onClick={goNext}
              className="flex-1 px-4 py-3.5 rounded-xl border-2 border-indigo-400/80 bg-indigo-500/20 text-indigo-100 text-xl font-black hover:bg-indigo-500/30 transition-colors cursor-pointer active:scale-[0.98]"
            >
              完成，下一位 →
            </button>
          )}
          {isLast && (
            <button
              type="button"
              onClick={finish}
              className="flex-1 px-4 py-3.5 rounded-xl border-2 border-emerald-400/80 bg-emerald-500/25 text-emerald-100 text-xl font-black hover:bg-emerald-500/35 transition-colors cursor-pointer active:scale-[0.98] shadow-lg shadow-emerald-900/30"
            >
              暮色结束，入夜 🌙
            </button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-4 w-full">
        {/* 官方口径说明 */}
        <div className="text-base text-slate-400 leading-relaxed">
          官方 Dusk：入夜之前，旅行者（及传奇角色）在此行动。
          <span className="text-slate-500">
            （本仓库的「黄昏」是白天提名阶段，与本阶段不同）
          </span>
        </div>

        {steps.length === 0 ? (
          <div className="rounded-2xl border border-slate-700 bg-slate-800/60 px-6 py-10 text-center text-2xl font-bold text-slate-300">
            本夜没有需要行动的旅行者。
          </div>
        ) : (
          <>
            {/* 唤醒卡：谁 + 哪个席位 + 能力原文 + 说书人操作 */}
            <div className="rounded-2xl border-2 border-indigo-400/40 bg-indigo-500/10 px-6 py-5 space-y-3">
              <div className="text-3xl sm:text-4xl font-black text-indigo-100 leading-tight">
                唤醒：{current.roleName}
                <span className="ml-3 text-lg sm:text-xl font-bold text-indigo-300/80">
                  （旅行者席位 {current.seatIndex + 1}）
                </span>
              </div>
              <div className="text-xl sm:text-2xl text-slate-100 leading-relaxed font-medium">
                {current.ability || "（该角色能力原文缺失，请核对数据）"}
              </div>
              <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-lg sm:text-xl text-amber-100 leading-relaxed">
                <span className="font-black">说书人操作：</span>
                {current.hint}
              </div>
            </div>

            {/* 官员 / 窃贼：选择投票目标（官方「选择除你以外的一名玩家」） */}
            {needsVoteTarget && (
              <div className="rounded-2xl border-2 border-sky-400/40 bg-sky-500/10 px-5 py-4">
                <div className="text-xl sm:text-2xl font-black text-sky-100 mb-1">
                  选择目标玩家（明天白天其投票按该旅行者规则计数）
                  {pickedTarget != null && (
                    <span className="ml-3 text-emerald-300">
                      已选 {pickedTarget + 1} 号
                    </span>
                  )}
                </div>
                {/* 按在场人数自适应列数/卡高/字号（与夜间技能确认页同一套网格） */}
                <AdaptiveSeatGrid
                  count={state.seats.length}
                  gap={0.5}
                  className="pt-1.5"
                  renderItem={(index) => {
                    const seat = state.seats[index];
                    const picked = pickedTarget === seat.id;
                    return (
                      <button
                        type="button"
                        onClick={() => pickVoteTarget(seat.id)}
                        className={`w-full h-full px-1 rounded-2xl text-center border-2 font-bold transition-all flex flex-col items-center justify-center gap-0.5 select-none cursor-pointer active:scale-95 shadow-sm ${
                          picked
                            ? "bg-emerald-600 border-emerald-400 text-white shadow-lg shadow-emerald-500/40 ring-2 ring-emerald-400 scale-[1.02]"
                            : seat.isDead
                              ? "bg-slate-900/40 border-slate-800 text-slate-500 hover:bg-slate-800/70"
                              : "bg-slate-800 border-slate-700 text-slate-100 hover:bg-slate-700 hover:border-slate-500"
                        }`}
                        title={picked ? "再点一次取消选择" : undefined}
                      >
                        <span
                          className="font-black whitespace-nowrap leading-none"
                          style={{ fontSize: SEAT_CARD_FONT.primary }}
                        >
                          {seat.id + 1}号
                        </span>
                        <span
                          className="whitespace-nowrap leading-none"
                          style={{ fontSize: SEAT_CARD_FONT.tertiary }}
                        >
                          {seat.isDead ? "💀 已死亡" : "存活"}
                          {picked ? " · ✓ 已选" : ""}
                        </span>
                      </button>
                    );
                  }}
                />
                <div className="text-sm sm:text-base text-sky-200/70 mt-2 leading-relaxed">
                  旅行者不占座位，故全部玩家均为候选；可再点一次已选项取消（该角色当晚不发动）。
                </div>
              </div>
            )}

            {/* 🦴 集骨者：选择一名已死亡玩家（重新获得能力直到下个黄昏） */}
            {needsDeadTarget && (
              <div className="rounded-2xl border-2 border-amber-400/40 bg-amber-500/10 px-5 py-4">
                <div className="text-xl sm:text-2xl font-black text-amber-100 mb-1">
                  选择一名已死亡的玩家（他重新获得能力，直到下个黄昏）
                  {boneBlessedId != null && (
                    <span className="ml-3 text-emerald-300">
                      已祝福 {boneBlessedId + 1} 号
                    </span>
                  )}
                </div>
                {boneCollectorUsed && boneBlessedId === null && (
                  <div className="text-base text-slate-300 mb-1">
                    本局已使用过集骨者能力（每局游戏限一次）。
                  </div>
                )}
                <AdaptiveSeatGrid
                  count={state.seats.length}
                  gap={0.5}
                  className="pt-1.5"
                  renderItem={(index) => {
                    const seat = state.seats[index];
                    const picked = boneBlessedId === seat.id;
                    const dead = seat.isDead;
                    return (
                      <button
                        type="button"
                        disabled={!dead || boneCollectorUsed}
                        onClick={() => blessDeadSeat(seat.id)}
                        className={`w-full h-full px-1 rounded-2xl text-center border-2 font-bold transition-all flex flex-col items-center justify-center gap-0.5 select-none ${
                          !dead || boneCollectorUsed
                            ? "bg-slate-900/40 border-slate-800 text-slate-600 cursor-not-allowed"
                            : picked
                              ? "bg-emerald-600 border-emerald-400 text-white shadow-lg shadow-emerald-500/40 ring-2 ring-emerald-400 scale-[1.02] cursor-pointer active:scale-95"
                              : "bg-slate-800 border-slate-700 text-slate-100 hover:bg-slate-700 hover:border-amber-400 cursor-pointer active:scale-95"
                        }`}
                        title={
                          dead
                            ? "点击祝福该死者（重新获得能力）"
                            : "仅可选择已死亡的玩家"
                        }
                      >
                        <span
                          className="font-black whitespace-nowrap leading-none"
                          style={{ fontSize: SEAT_CARD_FONT.primary }}
                        >
                          {seat.id + 1}号
                        </span>
                        <span
                          className="whitespace-nowrap leading-none"
                          style={{ fontSize: SEAT_CARD_FONT.tertiary }}
                        >
                          {dead ? "💀 已死亡" : "🟢 存活（不可选）"}
                          {picked ? " · ✓ 已祝福" : ""}
                        </span>
                      </button>
                    );
                  }}
                />
                <div className="text-sm sm:text-base text-amber-200/70 mt-2 leading-relaxed">
                  旅行者不占座位；祝福效果在**下个黄昏**开始时自动撤销（每局一次）。
                </div>
              </div>
            )}

            {/* ☕ 咖啡师：二选一效果 */}
            {needsBaristaTarget && (
              <div className="rounded-2xl border-2 border-emerald-400/40 bg-emerald-500/10 px-5 py-4">
                <div className="text-xl sm:text-2xl font-black text-emerald-100 mb-1">
                  选择一名玩家，并由说书人二选一
                  {baristaTargetId != null && (
                    <span className="ml-3 text-emerald-300">
                      已选 {baristaTargetId + 1} 号
                      {baristaEffect === "clear"
                        ? " · 解除并免疫中毒/醉酒"
                        : baristaEffect === "double"
                          ? " · 能力可生效两次"
                          : ""}
                    </span>
                  )}
                </div>
                <AdaptiveSeatGrid
                  count={state.seats.length}
                  gap={0.5}
                  className="pt-1.5"
                  renderItem={(index) => {
                    const seat = state.seats[index];
                    const picked = baristaTargetId === seat.id;
                    return (
                      <button
                        type="button"
                        onClick={() => {
                          // 先只选人；效果由下方两个按钮决定（默认沿用 clear）
                          dispatch({
                            type: "SET_BARISTA_EFFECT",
                            targetId: seat.id,
                            effect: baristaEffect ?? "clear",
                          });
                        }}
                        className={`w-full h-full px-1 rounded-2xl text-center border-2 font-bold transition-all flex flex-col items-center justify-center gap-0.5 select-none cursor-pointer active:scale-95 ${
                          picked
                            ? "bg-emerald-600 border-emerald-400 text-white shadow-lg shadow-emerald-500/40 ring-2 ring-emerald-400 scale-[1.02]"
                            : "bg-slate-800 border-slate-700 text-slate-100 hover:bg-slate-700 hover:border-emerald-400"
                        }`}
                      >
                        <span
                          className="font-black whitespace-nowrap leading-none"
                          style={{ fontSize: SEAT_CARD_FONT.primary }}
                        >
                          {seat.id + 1}号
                        </span>
                        <span
                          className="whitespace-nowrap leading-none"
                          style={{ fontSize: SEAT_CARD_FONT.tertiary }}
                        >
                          {seat.isDead ? "💀 已死亡" : "🟢 存活"}
                          {picked ? " · ✓ 已选" : ""}
                        </span>
                      </button>
                    );
                  }}
                />
                {baristaTargetId != null && (
                  <div className="flex flex-wrap gap-3 mt-3">
                    <button
                      type="button"
                      onClick={() =>
                        dispatch({
                          type: "SET_BARISTA_EFFECT",
                          targetId: baristaTargetId,
                          effect: "clear",
                        })
                      }
                      className={`px-5 py-2.5 rounded-xl border-2 text-lg font-bold transition-colors cursor-pointer active:scale-[0.98] ${
                        baristaEffect === "clear"
                          ? "border-emerald-300 bg-emerald-600 text-white"
                          : "border-white/15 bg-slate-800/70 text-slate-200 hover:bg-slate-700"
                      }`}
                    >
                      ① 解除并免疫中毒/醉酒（信息正确）
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        dispatch({
                          type: "SET_BARISTA_EFFECT",
                          targetId: baristaTargetId,
                          effect: "double",
                        })
                      }
                      className={`px-5 py-2.5 rounded-xl border-2 text-lg font-bold transition-colors cursor-pointer active:scale-[0.98] ${
                        baristaEffect === "double"
                          ? "border-emerald-300 bg-emerald-600 text-white"
                          : "border-white/15 bg-slate-800/70 text-slate-200 hover:bg-slate-700"
                      }`}
                    >
                      ② 能力可生效两次
                    </button>
                  </div>
                )}
                <div className="text-sm sm:text-base text-emerald-200/70 mt-2 leading-relaxed">
                  ① 的免疫是真实生效的（computeIsPoisoned / isActorDisabledByPoisonOrDrunk
                  均读取该标记）；② 引擎无通用"双次执行"机制，由说书人据此提示手动执行第二次。
                </div>
              </div>
            )}

            {/* 🌙 流莺：同意后得知角色，两人可能同时死亡 */}
            {needsHarlotTarget && (
              <div className="rounded-2xl border-2 border-fuchsia-400/40 bg-fuchsia-500/10 px-5 py-4">
                <div className="text-xl sm:text-2xl font-black text-fuchsia-100 mb-1">
                  选择一名**存活**玩家
                  {harlotTargetId != null && (
                    <span className="ml-3 text-fuchsia-200">
                      已选 {harlotTargetId + 1} 号
                    </span>
                  )}
                </div>
                <AdaptiveSeatGrid
                  count={state.seats.length}
                  gap={0.5}
                  className="pt-1.5"
                  renderItem={(index) => {
                    const seat = state.seats[index];
                    const picked = harlotTargetId === seat.id;
                    return (
                      <button
                        type="button"
                        disabled={seat.isDead}
                        onClick={() =>
                          dispatch({
                            type: "SET_HARLOT_OUTCOME",
                            targetId: seat.id,
                            agreed: false,
                            doomed: false,
                          })
                        }
                        className={`w-full h-full px-1 rounded-2xl text-center border-2 font-bold transition-all flex flex-col items-center justify-center gap-0.5 select-none ${
                          seat.isDead
                            ? "bg-slate-900/40 border-slate-800 text-slate-600 cursor-not-allowed"
                            : picked
                              ? "bg-fuchsia-600 border-fuchsia-400 text-white shadow-lg shadow-fuchsia-500/40 ring-2 ring-fuchsia-400 scale-[1.02] cursor-pointer active:scale-95"
                              : "bg-slate-800 border-slate-700 text-slate-100 hover:bg-slate-700 hover:border-fuchsia-400 cursor-pointer active:scale-95"
                        }`}
                        title={
                          seat.isDead ? "仅可选择存活玩家" : "点击选择该玩家"
                        }
                      >
                        <span
                          className="font-black whitespace-nowrap leading-none"
                          style={{ fontSize: SEAT_CARD_FONT.primary }}
                        >
                          {seat.id + 1}号
                        </span>
                        <span
                          className="whitespace-nowrap leading-none"
                          style={{ fontSize: SEAT_CARD_FONT.tertiary }}
                        >
                          {seat.isDead ? "💀 已死亡（不可选）" : "🟢 存活"}
                          {picked ? " · ✓ 已选" : ""}
                        </span>
                      </button>
                    );
                  }}
                />
                {harlotTargetId != null && (
                  <div className="mt-3 space-y-2">
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          dispatch({
                            type: "SET_HARLOT_OUTCOME",
                            targetId: harlotTargetId,
                            agreed: true,
                          })
                        }
                        className={`px-5 py-2.5 rounded-xl border-2 text-lg font-bold transition-colors cursor-pointer active:scale-[0.98] ${
                          harlotAgreed
                            ? "border-emerald-300 bg-emerald-600 text-white"
                            : "border-white/15 bg-slate-800/70 text-slate-200 hover:bg-slate-700"
                        }`}
                      >
                        对方同意（告知其角色）
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          dispatch({
                            type: "SET_HARLOT_OUTCOME",
                            targetId: harlotTargetId,
                            agreed: false,
                            doomed: false,
                          })
                        }
                        className={`px-5 py-2.5 rounded-xl border-2 text-lg font-bold transition-colors cursor-pointer active:scale-[0.98] ${
                          !harlotAgreed
                            ? "border-slate-300 bg-slate-600 text-white"
                            : "border-white/15 bg-slate-800/70 text-slate-200 hover:bg-slate-700"
                        }`}
                      >
                        对方不同意（无事发生）
                      </button>
                    </div>
                    {harlotAgreed && harlotTargetSeat && (
                      <div className="rounded-xl border border-fuchsia-400/40 bg-fuchsia-950/30 px-4 py-3 text-lg text-fuchsia-100">
                        得知其角色：
                        <span className="font-black text-white ml-2">
                          {harlotTargetSeat.role?.name ?? "（未分配）"}
                        </span>
                      </div>
                    )}
                    {harlotAgreed && !harlotDoomed && (
                      <button
                        type="button"
                        onClick={resolveHarlotBothDie}
                        className="px-6 py-3 rounded-xl border-2 border-red-400/80 bg-red-900/50 text-red-100 text-lg font-black hover:bg-red-800/60 transition-colors cursor-pointer active:scale-[0.98]"
                      >
                        ⚠️ 说书人裁定：两人**同时死亡**（流莺离场 + 目标死亡）
                      </button>
                    )}
                    {harlotDoomed && (
                      <div className="text-base text-red-300 font-bold">
                        ✓ 已裁定两人同时死亡（流莺已离场，目标已死亡）
                      </div>
                    )}
                  </div>
                )}
                <div className="text-sm sm:text-base text-fuchsia-200/70 mt-2 leading-relaxed">
                  「可能同时死亡」是说书人主观裁定 ⇒ 面板不自动决定，由说书人点击。
                </div>
              </div>
            )}

            {/* 🎓 学徒：首个夜晚获得一个能力 */}
            {needsApprenticeGrant && (
              <div className="rounded-2xl border-2 border-violet-400/40 bg-violet-500/10 px-5 py-4">
                <div className="text-xl sm:text-2xl font-black text-violet-100 mb-1">
                  学徒
                  <span className="ml-2 text-lg text-violet-300">
                    （{apprenticeEvil ? "邪恶 ⇒ 获得爪牙能力" : "善良 ⇒ 获得镇民能力"}）
                  </span>
                  ：选择一个要获得的能力
                  {apprenticeGrantedRoleId && (
                    <span className="ml-3 text-emerald-300">
                      已获得：
                      {ALL_ROLES.find((r) => r.id === apprenticeGrantedRoleId)
                        ?.name ?? apprenticeGrantedRoleId}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 max-h-72 overflow-auto pt-1.5">
                  {apprenticeCandidates.map((r) => {
                    const picked = apprenticeGrantedRoleId === r.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() =>
                          dispatch(gameActions.setApprenticeGrantedRole(r.id))
                        }
                        className={`px-4 py-2 rounded-xl border-2 text-base font-bold transition-colors cursor-pointer active:scale-95 ${
                          picked
                            ? "border-violet-300 bg-violet-600 text-white"
                            : "border-white/15 bg-slate-800/70 text-slate-200 hover:bg-slate-700 hover:border-violet-400"
                        }`}
                        title={r.ability ?? ""}
                      >
                        {r.name}
                      </button>
                    );
                  })}
                </div>
                <div className="text-sm sm:text-base text-violet-200/70 mt-2 leading-relaxed">
                  再点一次已选角色可取消。⚠️ 引擎按座位**静态**角色派发夜间能力，
                  没有通用的"动态挂载能力"机制 ⇒
                  本选择为说书人助手口径（面板记录 + 提示，具体夜间行动由说书人按该能力处理）。
                </div>
              </div>
            )}

            {/* 步骤进度点 */}
            <div className="flex flex-wrap gap-2">
              {steps.map((s, i) => (
                <span
                  key={s.key}
                  className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-colors ${
                    i === idx
                      ? "border-indigo-300 bg-indigo-500/30 text-indigo-100"
                      : i < idx
                        ? "border-emerald-400/50 bg-emerald-500/20 text-emerald-200"
                        : "border-white/10 bg-slate-800/60 text-slate-400"
                  }`}
                >
                  {i < idx ? "✓ " : ""}
                  {s.roleName}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </ModalWrapper>
  );
}

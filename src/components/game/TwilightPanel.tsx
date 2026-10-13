"use client";

import { useGameContext } from "../../contexts/GameContext";
import { buildTwilightSteps } from "../../utils/travelerDusk";
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
 * ⚠️ 本面板只负责「唤醒 + 提示 + 逐步确认」，**不做效果结算**。
 *    各旅行者效果落地情况见 `traveler_wiring_contract.test.ts`。
 *
 * ⚠️ E2E 文案锚点（twilight_traveler.spec.ts 依赖，勿改）：
 *    「🌆 暮色」「唤醒：X」「步骤 N / M」「选择目标玩家」「已选 N 号」
 *    「暮色结束，入夜」、目标按钮可访问名以「N号」开头。
 */
export function TwilightPanel() {
  const { state, dispatch } = useGameContext();

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

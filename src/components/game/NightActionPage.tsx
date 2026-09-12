"use client";

/**
 * 夜间行动页（技能确认页 / 结果页）
 * ============================================================================
 * ⚠️ 这一页会**整机交给玩家亲手点击**，因此默认必须是「纯玩家视角」。
 *
 * 【玩家视角机制】详见 utils/playerView.ts 与 components/game/PlayerViewContext.tsx
 *   - 默认 playerView = true（安全默认）：所有说书人专属内容用
 *     <StorytellerOnly> **条件渲染**（数据不进 DOM，不是 CSS 隐藏）；
 *   - 说书人解锁：在顶部角色卡上**长按 1.5 秒**（不给玩家任何可见提示：
 *     没有锁图标、没有"说书人"字样、没有 tooltip）。解锁后：
 *       · 顶部出现醒目横幅「🔓 说书人视图（玩家不可见）」；
 *       · 显示全部微调面板（StorytellerTuningPanel）与真实角色信息；
 *       · 自动重新上锁：切换步骤（nightInfo/resultText 变化）、组件卸载、
 *         或 60 秒无操作。
 *   - 解锁状态只存在组件内 useState：不持久化、不写日志、不入快照。
 *
 * 【玩家视角下已修正的泄漏点】
 *   1. 目标选择网格只显示「座位号 + 玩家名」，不再渲染 seat.role.name；
 *   2. 顶部角色名走 playerFacingRole（疯子 → 其 apparentDemonRole，如涡流）；
 *   3. 指引/结果文案过 sanitizePlayerFacingText（剥掉【受干扰】/（虚假信息）等）；
 *   4. 共情者/占卜师/镜像双子/赏金猎人/守护提示/镇长弹刀/小恶魔传刀/涡流横幅
 *      全部只出现在说书人视图；
 *   5. A4：真恶魔能看到「疯子本夜选择了 X号」（官方：恶魔知道疯子的选择），
 *      这一条对恶魔本人不是泄漏，因此两个视角都显示。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { Seat } from "../../../app/data";
import type { NightInfoResult } from "../../types/game";
import {
  CERENOVUS_NOTICE_PLAYER_SUBTITLE,
  CERENOVUS_NOTICE_STORYTELLER_NOTE,
  getCerenovusNoticeFromStep,
  getCerenovusNoticePlayerText,
  getPendingCerenovusNotice,
} from "../../utils/cerenovusNotice";
import { formatSeatLabel, displayPlayerName } from "../../utils/seatLabel";
import {
  getLunaticNightHint,
  getPlayerFacingRole,
  getPlayerFacingSeatLabel,
  sanitizePlayerFacingText,
} from "../../utils/playerView";
import {
  buildCorruptedInfoPlayerText,
  classifyCorruptedInfoRole,
} from "../../utils/corruptedInfo";
import { isInformationRole } from "../../utils/informationRoles";
import { PlayerViewProvider, StorytellerOnly } from "./PlayerViewContext";
import { StorytellerTuningPanel } from "./StorytellerTuningPanel";
import { useStorytellerTuning } from "./StorytellerTuningContext";

/** 长按解锁阈值（毫秒）。不给玩家任何可见提示，只能靠说书人记住手势。 */
export const STORYTELLER_LONG_PRESS_MS = 1500;
/** 说书人视图无操作自动回锁时间（毫秒）。 */
export const STORYTELLER_IDLE_RELOCK_MS = 60000;

interface NightActionPageProps {
  /** 当前夜间行动的角色信息 */
  nightInfo: NightInfoResult;
  /** 所有座位 */
  seats: Seat[];
  /** 已选中的目标 */
  selectedTargets: number[];
  /** 切换目标选中状态 */
  onToggleTarget: (seatId: number) => void;
  /** 确认执行 */
  onConfirm: (storytellerInput?: any) => void;
  /** 取消/跳过 */
  onCancel: () => void;
  /** 确认按钮是否禁用 */
  isConfirmDisabled: boolean;
  /** 角色能力描述（guide 文案） */
  guideText?: string;
  /** 是否受干扰（中毒/醉酒）—— 仅说书人视图可见 */
  isDisturbed?: boolean;
  /** 结果文本（执行后展示）—— 受干扰/伪装身份时这里已经是假值 */
  resultText?: string;
  /**
   * 说书人侧真值对照（受干扰/酒鬼/提线木偶时的真实计算结果）。
   * ⚠️ 只允许在说书人解锁视图渲染；玩家视角下绝不进 DOM。
   */
  realResultText?: string;
  /** 本次结果是否被"受干扰假值校验层"替换过 */
  isCorruptedResult?: boolean;
  /** 结果确认回调 */
  onResultConfirm?: () => void;
  /** 是否为涡流世界（存活涡流在场） */
  isVortoxWorld?: boolean;
  /** 外部强制视角（不传 = 跟随长按解锁手势）；true = 玩家视角，false = 说书人视图 */
  playerView?: boolean;
  /** 座位补丁写入（说书人微调落库用） */
  onUpdateSeat?: (seatId: number, patch: Record<string, any>) => void;
  /**
   * 当前夜晚编号。用于「洗脑告知」节点的夜限校验 —— 换夜后旧标记自动失效，
   * 不会把昨晚的洗脑在今晚重放一遍。
   */
  nightCount?: number;
  /**
   * 🧠 洗脑师专属结果页数据（被洗脑目标 + 疯狂角色）。
   * 存在时本页不渲染行动者（洗脑师）的角色卡 / 指引：玩家侧只有
   * 「你需要疯狂证明自己是【X】」+ 副标题；行动者真值只在说书人解锁视图渲染。
   */
  cerenovusResult?: { targetId: number; roleName: string } | null;
  /** 🧠 说书人解锁视图的「洗脑判定」入口（复用白天技能判定链路）。 */
  onMadnessCheck?: () => void;
  /** 🧠 洗脑告知合成节点的确认回调（只推进队列，绝不重复执行任何技能）。 */
  onNoticeConfirm?: () => void;
}

export function NightActionPage({
  nightInfo,
  seats,
  selectedTargets,
  onToggleTarget,
  onConfirm,
  onCancel,
  isConfirmDisabled,
  guideText,
  isDisturbed,
  resultText,
  realResultText,
  isCorruptedResult,
  onResultConfirm,
  isVortoxWorld,
  playerView,
  onUpdateSeat,
  nightCount,
  cerenovusResult,
  onMadnessCheck,
  onNoticeConfirm,
}: NightActionPageProps) {
  const tuning = useStorytellerTuning();

  // ─── 说书人解锁状态（仅组件内 state）─────────────────────────────────────
  const [unlocked, setUnlocked] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 步骤标识：切换步骤/出现结果时立刻回锁
  const stepKey = `${nightInfo?.seat?.id ?? -1}|${
    nightInfo?.effectiveRole?.id ?? ""
  }|${resultText ? "result" : "action"}`;

  useEffect(() => {
    setUnlocked(false);
  }, [stepKey]);

  // 60 秒无操作自动回锁（解锁期间任何指针/键盘/触摸活动都会续期）
  useEffect(() => {
    if (!unlocked) return;
    const arm = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(
        () => setUnlocked(false),
        STORYTELLER_IDLE_RELOCK_MS
      );
    };
    arm();
    const events: Array<keyof WindowEventMap> = [
      "pointerdown",
      "pointermove",
      "keydown",
      "touchstart",
    ];
    events.forEach((ev) => window.addEventListener(ev, arm));
    return () => {
      events.forEach((ev) => window.removeEventListener(ev, arm));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    };
  }, [unlocked]);

  // 组件卸载即回锁（不持久化）
  useEffect(() => () => setUnlocked(false), []);

  const beginLongPress = () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      setUnlocked(true);
      longPressTimerRef.current = null;
    }, STORYTELLER_LONG_PRESS_MS);
  };
  const cancelLongPress = () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  };

  const isStorytellerView =
    playerView === false ? true : playerView === true ? false : unlocked;
  const playerViewEffective = !isStorytellerView;

  // ─── 玩家视角的身份与文案 ────────────────────────────────────────────────
  const facingRole = useMemo(
    () => nightInfo.playerFacingRole ?? getPlayerFacingRole(nightInfo.seat),
    [nightInfo.playerFacingRole, nightInfo.seat]
  );
  const truthRoleName =
    nightInfo.seat?.role?.name || nightInfo.effectiveRole?.name || "未知角色";
  const playerRoleName = facingRole?.name || "未知角色";
  const roleName = isStorytellerView ? truthRoleName : playerRoleName;
  const roleType = (isStorytellerView
    ? nightInfo.seat?.role?.type
    : facingRole?.type) || "unknown";
  const roleId = nightInfo.seat?.role?.id || "";
  const seatId = nightInfo.seat?.id ?? 0;
  const targetLimit = nightInfo.targetLimit;
  const needsTargets = targetLimit && targetLimit.max > 0;

  // 阵营颜色映射
  const factionColors: Record<
    string,
    { bg: string; text: string; border: string }
  > = {
    townsfolk: {
      bg: "bg-blue-500/20",
      text: "text-blue-300",
      border: "border-blue-500/40",
    },
    outsider: {
      bg: "bg-purple-500/20",
      text: "text-purple-300",
      border: "border-purple-500/40",
    },
    minion: {
      bg: "bg-red-500/20",
      text: "text-red-300",
      border: "border-red-500/40",
    },
    demon: {
      bg: "bg-red-600/30",
      text: "text-red-200",
      border: "border-red-600/50",
    },
    traveler: {
      bg: "bg-yellow-500/20",
      text: "text-yellow-300",
      border: "border-yellow-500/40",
    },
  };
  const faction = factionColors[roleType] || factionColors.townsfolk;

  /**
   * 玩家视角指引。
   *
   * ⚠️ 受干扰（中毒/醉酒/涡流/酒鬼/提线木偶）时，guide 里往往**直接写着真值**
   * （例：「唤醒6号【图书管理员】，告诉他12号和3号其中一位是【隐士】」）——
   * 这条文案同样会显示在交给玩家的页面卡片上，因此**必须与结果页共用同一个
   * 「受干扰 → 同形假文本」生成器**（utils/corruptedInfo.ts 的唯一出口），
   * 不允许存在第二条绕过它的取数路径。未受干扰时原样透传。
   */
  const rawPlayerGuide =
    nightInfo.playerFacingGuide ?? nightInfo.guide ?? guideText ?? "";
  const guideIsInfoRole =
    classifyCorruptedInfoRole(roleId) !== null ||
    isInformationRole(roleId, nightInfo.seat?.role?.type ?? "unknown");
  const maskedPlayerGuide =
    isDisturbed && guideIsInfoRole && rawPlayerGuide
      ? buildCorruptedInfoPlayerText({
          roleId,
          roleName: playerRoleName,
          truthText: rawPlayerGuide,
          actorSeatId: seatId,
          nightCount: (nightInfo as any)?.nightCount ?? 1,
          candidateSeatIds: seats
            .filter((s) => s.id !== seatId)
            .map((s) => s.id),
          corrupted: true,
        })
      : rawPlayerGuide;
  const playerGuide = sanitizePlayerFacingText(maskedPlayerGuide);
  const storytellerGuide = isDisturbed
    ? `${nightInfo.guide ?? guideText ?? ""}\n\n（说书人备注：该角色当前受干扰，能力可能不生效——玩家不可见）`
    : (nightInfo.guide ?? guideText ?? "");
  const displayedGuide = isStorytellerView ? storytellerGuide : playerGuide;

  const hasResult = !!resultText;
  const playerResultText = sanitizePlayerFacingText(resultText);

  // ─── 🧠 洗脑师专属：结果页 + 被洗脑玩家的独立行动节点 ───────────────────
  /** 洗脑师刚结算完，正把「疯狂证明」告知交给被洗脑玩家（专属结果页）。 */
  const isCerenovusResultPage = Boolean(cerenovusResult && hasResult);
  /** 目标自身没有任何夜间技能时，由 nightInfoAdapter 产出的合成告知节点。 */
  const cerenovusNoticeStep = getCerenovusNoticeFromStep(nightInfo as any);
  /**
   * 目标自身有夜间技能时，告知**合并**渲染在他自己的行动节点页上（信息不丢）；
   * 用当夜编号做夜限，换夜后自动失效。
   */
  const cerenovusSeatNotice =
    !isCerenovusResultPage && !cerenovusNoticeStep
      ? getPendingCerenovusNotice(nightInfo?.seat as any, nightCount)
      : null;
  const noticeData = isCerenovusResultPage
    ? null
    : (cerenovusNoticeStep ?? cerenovusSeatNotice);
  /** 纯告知节点：不渲染角色卡 / 指引，确认只推进队列。 */
  const isNoticeOnlyStep = Boolean(cerenovusNoticeStep);

  // ─── A4：真恶魔本夜看到「疯子选择了谁」─────────────────────────────────
  const isDemonActor =
    nightInfo.seat?.role?.type === "demon" ||
    nightInfo.effectiveRole?.type === "demon" ||
    Boolean((nightInfo.seat as any)?.isDemonSuccessor);
  const lunaticHint = isDemonActor ? getLunaticNightHint(seats) : null;

  const handleConfirm = () => {
    onConfirm(tuning ? tuning.buildStorytellerInput() : {});
  };

  return (
    <PlayerViewProvider playerView={playerViewEffective}>
      <div className="fixed inset-0 z-[9998] flex flex-col bg-black/80 backdrop-blur-md">
        {/* 顶部留空给导航栏 */}
        <div className="h-12 shrink-0" />

        {/* 主内容区 */}
        <div className="flex-1 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-2xl space-y-6">
            {/* 说书人解锁视图横幅（醒目，避免误留） */}
            {isStorytellerView && (
              <div className="bg-gradient-to-r from-amber-600 to-orange-600 text-white text-center py-2 rounded-xl border-2 border-amber-300 shadow-lg font-black">
                🔓 说书人视图（玩家不可见）
              </div>
            )}

            {/* ─── 🧠 洗脑师专属结果页（玩家视角 = 纯"疯狂证明"告知）─────────
                行动者（洗脑师）的座位号 / 角色名一律不渲染：这一页要直接交给
                被洗脑的玩家看。说书人真值走 <StorytellerOnly>（条件渲染）。 */}
            {isCerenovusResultPage && cerenovusResult && (
              <>
                <div
                  data-testid="cerenovus-player-result"
                  className="rounded-2xl border border-amber-500/40 bg-amber-950/30 p-6 backdrop-blur-xl text-center space-y-4"
                >
                  <p className="text-xs font-bold tracking-widest text-slate-400">
                    技能告知
                  </p>
                  <div className="text-5xl select-none">🧠</div>
                  <h2
                    data-testid="cerenovus-player-result-text"
                    className="text-3xl font-black text-amber-100 leading-snug"
                  >
                    {getCerenovusNoticePlayerText(cerenovusResult.roleName)}
                  </h2>
                  <p className="text-lg font-medium text-slate-300">
                    {CERENOVUS_NOTICE_PLAYER_SUBTITLE}
                  </p>
                  <button
                    onClick={onResultConfirm}
                    className="w-full py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-lg transition-colors"
                  >
                    确认并继续
                  </button>
                </div>

                <StorytellerOnly>
                  <div
                    data-testid="cerenovus-storyteller-result"
                    className="rounded-2xl border border-amber-500/40 bg-black/40 p-4 space-y-2"
                  >
                    <p className="text-sm font-black text-amber-300">
                      🧠 洗脑师技能真值（玩家不可见）
                    </p>
                    <p className="text-sm text-slate-100 font-bold">
                      {seatId + 1}号-{truthRoleName} ➔ 洗脑{" "}
                      {cerenovusResult.targetId + 1}号 为【
                      {cerenovusResult.roleName}】
                    </p>
                    <p className="text-xs text-slate-400">
                      目标：{cerenovusResult.targetId + 1}号 · 疯狂角色：【
                      {cerenovusResult.roleName}】 · 判定时机：明日白天
                    </p>
                    {onMadnessCheck && (
                      <button
                        onClick={onMadnessCheck}
                        className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold transition-colors"
                      >
                        🧠 洗脑判定
                      </button>
                    )}
                  </div>
                </StorytellerOnly>
              </>
            )}

            {/* ─── 🧠 被洗脑玩家的独立行动节点（与洗脑师那一步分开）─────────
                · 纯告知节点（目标自身无夜间技能）：只渲染告知卡；
                · 目标自身有夜间技能：告知合并渲染在他自己的行动页上方。 */}
            {!isCerenovusResultPage && noticeData && (
              <>
                <div
                  data-testid="cerenovus-notice-player"
                  className="rounded-2xl border border-amber-500/40 bg-amber-950/30 p-6 backdrop-blur-xl text-center space-y-4"
                >
                  <p className="text-xs font-bold tracking-widest text-slate-400">
                    技能告知
                  </p>
                  <div className="text-5xl select-none">🧠</div>
                  <h2
                    data-testid="cerenovus-notice-player-text"
                    className="text-3xl font-black text-amber-100 leading-snug"
                  >
                    {getCerenovusNoticePlayerText(noticeData.roleName)}
                  </h2>
                  <p className="text-lg font-medium text-slate-300">
                    {CERENOVUS_NOTICE_PLAYER_SUBTITLE}
                  </p>
                  {isNoticeOnlyStep && (
                    <button
                      onClick={onNoticeConfirm ?? onResultConfirm}
                      data-testid="cerenovus-notice-confirm"
                      className="w-full py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-lg transition-colors"
                    >
                      确认并继续
                    </button>
                  )}
                </div>

                <StorytellerOnly>
                  <div
                    data-testid="cerenovus-notice-storyteller"
                    className="rounded-2xl border border-amber-500/40 bg-black/40 p-4 space-y-2"
                  >
                    <p className="text-sm font-black text-amber-300">
                      ⚠️ {CERENOVUS_NOTICE_STORYTELLER_NOTE}
                    </p>
                    <p className="text-xs text-slate-400">
                      目标：{noticeData.targetId + 1}号 · 疯狂角色：【
                      {noticeData.roleName}】 · 判定时机：明日白天
                    </p>
                    {onMadnessCheck && (
                      <button
                        onClick={onMadnessCheck}
                        className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold transition-colors"
                      >
                        🧠 洗脑判定
                      </button>
                    )}
                  </div>
                </StorytellerOnly>
              </>
            )}

            {/* 常规角色页（洗脑师专属结果页 / 纯告知节点下不渲染行动者信息） */}
            {!(isCerenovusResultPage || isNoticeOnlyStep) && (
              <>
            {/* 角色信息卡（顶部区域长按 1.5 秒可解锁说书人视图，无任何可见提示） */}
            <div
              onPointerDown={beginLongPress}
              onPointerUp={cancelLongPress}
              onPointerLeave={cancelLongPress}
              onPointerCancel={cancelLongPress}
              className={`rounded-2xl border ${faction.border} ${faction.bg} p-6 backdrop-blur-xl`}
            >
              <div className="flex items-center gap-4 mb-4">
                <div
                  className={`w-16 h-16 rounded-full ${faction.bg} border-2 ${faction.border} flex items-center justify-center text-2xl font-black ${faction.text}`}
                >
                  {seatId + 1}
                </div>
                <div>
                  <h2 className={`text-2xl font-black ${faction.text}`}>
                    {roleName}
                  </h2>
                  <p className="text-sm text-slate-400">
                    {seatId + 1}号玩家 ·{" "}
                    {roleType === "townsfolk"
                      ? "镇民"
                      : roleType === "outsider"
                        ? "外来者"
                        : roleType === "minion"
                          ? "爪牙"
                          : roleType === "demon"
                            ? "恶魔"
                            : roleType}
                  </p>
                </div>
                {/* 说书人视图：显示真实身份对照 */}
                {isStorytellerView && truthRoleName !== playerRoleName && (
                  <span className="ml-auto px-2.5 py-1 rounded-full bg-black/50 text-amber-300 text-xs font-bold border border-amber-500/40">
                    实:{truthRoleName}（玩家看到：{playerRoleName}）
                  </span>
                )}
              </div>

              {/* 能力描述（玩家视角 = 假恶魔的能力描述） */}
              {displayedGuide && (
                <div className="bg-black/30 rounded-xl p-4 border border-white/5">
                  <p className="text-base text-slate-200 leading-relaxed whitespace-pre-line">
                    {displayedGuide}
                  </p>
                </div>
              )}
            </div>

            {/* A4：真恶魔专属提示（官方：恶魔知道疯子每个夜晚选择了哪些玩家） */}
            {lunaticHint && (
              <div className="rounded-2xl border-2 border-fuchsia-400/70 bg-fuchsia-950/50 backdrop-blur-xl p-4 text-fuchsia-100 font-black whitespace-pre-line shadow-lg shadow-fuchsia-900/40">
                {lunaticHint}
              </div>
            )}

            {/* 结果展示区（执行后内联展示）*/}
            {hasResult && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-950/30 p-6 backdrop-blur-xl">
                <h3 className="text-lg font-bold text-amber-300 mb-3">
                  📋 执行结果
                </h3>
                <p className="text-base text-amber-100 leading-relaxed whitespace-pre-line">
                  {isStorytellerView ? resultText : playerResultText}
                </p>
                {/* 🎩 说书人视图：受干扰/伪装身份下的"真值 vs 假值"对照 */}
                {isStorytellerView && (
                  <div className="mt-3 rounded-xl border border-amber-500/40 bg-black/40 p-3 space-y-1">
                    {isCorruptedResult ? (
                      <>
                        <p className="text-xs font-bold text-amber-300">
                          ⚠️ 受干扰下的假信息（玩家看到的已是假值，可改）
                        </p>
                        <p className="text-xs text-slate-300 whitespace-pre-line">
                          真值：{realResultText}
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-slate-400">
                        本次结果未触发"受干扰假值校验层"（真值＝玩家所见）。
                      </p>
                    )}
                  </div>
                )}
                <button
                  onClick={onResultConfirm}
                  className="mt-4 w-full py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-lg transition-colors"
                >
                  确认并继续
                </button>
              </div>
            )}

            {/* ─── 目标选择区（玩家视角只显示座位号 + 玩家名）────────────── */}
            {needsTargets && !hasResult && (
              <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-slate-300 uppercase tracking-widest">
                    选择目标（{selectedTargets.length}/{targetLimit.max}）
                  </h3>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                  {seats.map((seat) => {
                    if (!seat.role) return null;
                    const isSelected = selectedTargets.includes(seat.id);
                    const isSelf =
                      !nightInfo.canSelectSelf &&
                      roleId !== "legion" &&
                      seat.id === seatId;
                    const isValid = nightInfo.validTargetIds
                      ? nightInfo.validTargetIds.includes(seat.id)
                      : true;

                    return (
                      <button
                        key={seat.id}
                        onClick={() => onToggleTarget(seat.id)}
                        disabled={isSelf || !isValid}
                        className={`relative px-2 py-3 rounded-xl text-center border transition-all duration-200 ${
                          isSelected
                            ? "bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-500/30 ring-2 ring-blue-400/50"
                            : seat.isDead
                              ? "bg-slate-900/40 border-slate-800 text-slate-600 line-through opacity-60"
                              : isSelf
                                ? "bg-slate-900/40 border-slate-700 text-slate-500 opacity-40"
                                : "bg-white/5 border-white/10 text-slate-200 hover:bg-white/10 hover:border-white/20"
                        }`}
                      >
                        <span className="text-lg font-bold block">
                          {seat.id + 1}号
                        </span>
                        {/* 👤 玩家视角：只允许"玩家名"，严禁任何角色名 */}
                        {!isStorytellerView &&
                          displayPlayerName(seat.playerName, seat.id) && (
                            <span className="block text-xs font-medium truncate mt-0.5 text-slate-300">
                              {displayPlayerName(seat.playerName, seat.id)}
                            </span>
                          )}
                        {/* 🎩 说书人视图：显示真实角色名 */}
                        {isStorytellerView && seat.role?.name && (
                          <span
                            className={`block text-xs font-bold truncate mt-0.5 ${
                              seat.role.type === "demon"
                                ? "text-red-400"
                                : seat.role.type === "minion"
                                  ? "text-orange-400"
                                  : seat.role.type === "outsider"
                                    ? "text-purple-400"
                                    : "text-blue-400"
                            }`}
                          >
                            {seat.role.name}
                          </span>
                        )}
                        {seat.isDead && (
                          <span className="block text-[10px] text-red-400 opacity-80 mt-0.5 truncate">
                            (已死亡)
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ─── 当前已选目标（玩家视角只显示座位号 + 玩家名）────────── */}
            {needsTargets && !hasResult && selectedTargets.length > 0 && (
              <div className="rounded-2xl border border-blue-500/30 bg-blue-950/30 backdrop-blur-xl p-4">
                <span className="text-xs text-blue-300 font-bold block mb-2">
                  已选目标：
                </span>
                <div className="flex flex-wrap gap-2">
                  {selectedTargets.map((id) => {
                    const s = seats.find((x) => x.id === id);
                    return (
                      <span
                        key={id}
                        className="px-2.5 py-1 rounded-lg bg-blue-600/40 text-blue-100 text-xs font-bold border border-blue-400/40"
                      >
                        {getPlayerFacingSeatLabel(s ?? { id })}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

              </>
            )}

            {/* ─── 说书人专属微调面板（条件渲染，玩家视角不进 DOM）──────── */}
            <StorytellerOnly>
              <StorytellerTuningPanel seats={seats} onUpdateSeat={onUpdateSeat} />
              {!tuning && (
                <p className="text-xs text-amber-300">
                  （未挂载说书人微调状态中心，微调面板不可用）
                </p>
              )}
            </StorytellerOnly>

            {/* 操作按钮区（纯告知节点自带"确认并继续"，不显示角色行动按钮） */}
            {!hasResult && !isNoticeOnlyStep && (
              <div className="flex gap-4">
                <button
                  onClick={onCancel}
                  className="flex-1 py-4 rounded-xl bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 font-bold text-lg transition-colors border border-white/5"
                >
                  跳过
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={isConfirmDisabled}
                  className={`flex-[2] py-4 rounded-xl font-bold text-lg transition-all ${
                    isConfirmDisabled
                      ? "bg-slate-700/30 text-slate-500 cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/25 active:scale-[0.98]"
                  }`}
                >
                  确认执行
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </PlayerViewProvider>
  );
}

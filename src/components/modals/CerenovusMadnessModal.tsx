"use client";

/**
 * 🧠 洗脑师（Cerenovus）专属「技能结果页 / 被洗脑告知页」
 * ============================================================================
 * 【这一页要给谁看】
 *   这一段是**直接交给被洗脑玩家**看的页面，因此默认必须是玩家视角：
 *     · 玩家侧只允许出现「你需要疯狂证明自己是【X】」+「若未照做，明天白天你可能被处决」；
 *     · **绝不出现行动者信息**（洗脑师的座位号 / 「洗脑师」字样 / cerenovus），
 *       否则等于把爪牙座位直接送给玩家；
 *     · 标题也必须是中性的「技能告知」——旧实现用 `${roleName} - 结果`
 *       渲染成「11号-洗脑师 - 结果」，正是这次要修掉的泄漏点。
 *
 * 【说书人解锁视图】沿用 B 组机制（components/game/NightActionPage.tsx 同款）：
 *   在告知卡上**长按 1.5 秒**解锁 → 顶部出现横幅「🔓 说书人视图（玩家不可见）」，
 *   并补出目标 / 疯狂角色 / 判定时机，以及「🧠 洗脑判定」入口；
 *   切换步骤 / 卸载 / 60 秒无操作自动回锁；解锁状态只在组件内 useState，不持久化。
 *
 * 【条件渲染】说书人专属块一律用 <StorytellerOnly>，玩家视角下 children 不进 DOM
 *   （不是 CSS 隐藏），因此可以对静态 HTML 直接断言"无泄漏"。
 */

import { useEffect, useRef, useState } from "react";
import {
  CERENOVUS_NOTICE_PLAYER_SUBTITLE,
  CERENOVUS_NOTICE_STORYTELLER_NOTE,
  getCerenovusNoticePlayerText,
} from "../../utils/cerenovusNotice";
import { PlayerViewProvider, StorytellerOnly } from "../game/PlayerViewContext";
import { ModalWrapper } from "./ModalWrapper";

/** 长按解锁阈值（毫秒）——与 NightActionPage 保持同一手势。 */
export const MADNESS_LONG_PRESS_MS = 1500;
/** 说书人视图无操作自动回锁时间（毫秒）。 */
export const MADNESS_IDLE_RELOCK_MS = 60000;

export interface MadnessNoticeData {
  /** 被洗脑（需要疯狂证明）的玩家座位 */
  targetId: number;
  /** 他必须疯狂扮演的角色名 */
  roleName: string;
  /** 说书人侧真值：行动者座位号 —— 只在解锁视图渲染 */
  actorSeatId?: number;
  /** 说书人侧真值：行动者角色名 —— 只在解锁视图渲染 */
  actorRoleName?: string;
}

/**
 * 弹窗标题。
 * 玩家视角 = 中性「🧠 技能告知」（不含任何座位号/角色名）；
 * 说书人解锁视图 = 完整「6号-洗脑师 ➔ 洗脑 3号 为【艺术家】」。
 */
export function getMadnessNoticeTitle(
  isStorytellerView: boolean,
  data: MadnessNoticeData | null
): string {
  if (!data) return "🧠 技能告知";
  if (!isStorytellerView) return "🧠 技能告知";
  const actor =
    data.actorSeatId != null
      ? `${data.actorSeatId + 1}号-${data.actorRoleName ?? "洗脑师"}`
      : (data.actorRoleName ?? "洗脑师");
  return `🧠 ${actor} ➔ 洗脑 ${data.targetId + 1}号 为【${data.roleName}】`;
}

export interface MadnessNoticeBodyProps {
  data: MadnessNoticeData;
  /** true = 说书人解锁视图 */
  isStorytellerView: boolean;
  onLongPressStart?: () => void;
  onLongPressEnd?: () => void;
  onMadnessCheck?: () => void;
}

/**
 * 页面主体（纯组件，不依赖 portal / 动画层）—— 便于 node 环境下做静态 HTML 断言。
 */
export function MadnessNoticeBody({
  data,
  isStorytellerView,
  onLongPressStart,
  onLongPressEnd,
  onMadnessCheck,
}: MadnessNoticeBodyProps) {
  return (
    <div className="w-full flex flex-col gap-4 text-white">
      {isStorytellerView && (
        <div
          data-testid="madness-storyteller-banner"
          className="bg-gradient-to-r from-amber-600 to-orange-600 text-white text-center py-2 rounded-xl border-2 border-amber-300 shadow-lg font-black"
        >
          🔓 说书人视图（玩家不可见）
        </div>
      )}

      {/* 玩家可见告知卡（长按 1.5 秒解锁说书人视图，无任何可见提示） */}
      <div
        data-testid="madness-notice-player"
        onPointerDown={onLongPressStart}
        onPointerUp={onLongPressEnd}
        onPointerLeave={onLongPressEnd}
        onPointerCancel={onLongPressEnd}
        className="rounded-2xl border border-amber-500/40 bg-amber-950/30 p-6 text-center space-y-4 select-none"
      >
        <p className="text-xs font-bold tracking-widest text-slate-400">
          技能告知
        </p>
        <div className="text-5xl select-none">🧠</div>
        <h2
          data-testid="madness-notice-player-text"
          className="text-3xl font-black text-amber-100 leading-snug"
        >
          {getCerenovusNoticePlayerText(data.roleName)}
        </h2>
        <p className="text-lg font-medium text-slate-300">
          {CERENOVUS_NOTICE_PLAYER_SUBTITLE}
        </p>
      </div>

      {/* 说书人专属：条件渲染，玩家视角下不进 DOM */}
      <StorytellerOnly>
        <div
          data-testid="madness-notice-storyteller"
          className="rounded-2xl border border-amber-500/40 bg-black/40 p-4 space-y-2"
        >
          <p className="text-sm font-black text-amber-300">
            ⚠️ {CERENOVUS_NOTICE_STORYTELLER_NOTE}
          </p>
          <p className="text-xs text-slate-300">
            目标：{data.targetId + 1}号 · 疯狂角色：【{data.roleName}】 · 判定时机：明日白天
          </p>
          <p className="text-xs text-slate-400">
            行动者：
            {data.actorSeatId != null ? data.actorSeatId + 1 : "?"}号-
            {data.actorRoleName ?? "洗脑师"}
          </p>
          {onMadnessCheck && (
            <button
              type="button"
              data-testid="madness-check-button"
              onClick={onMadnessCheck}
              className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold transition-colors cursor-pointer"
            >
              🧠 洗脑判定
            </button>
          )}
        </div>
      </StorytellerOnly>
    </div>
  );
}

export interface CerenovusMadnessModalProps {
  data: MadnessNoticeData | null;
  onConfirm: () => void;
  onMadnessCheck?: () => void;
}

/** 洗脑师专属结果页 / 被洗脑告知页（默认玩家视角 + 长按解锁说书人视图）。 */
export function CerenovusMadnessModal({
  data,
  onConfirm,
  onMadnessCheck,
}: CerenovusMadnessModalProps) {
  const [unlocked, setUnlocked] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stepKey = data ? `${data.targetId}|${data.roleName}` : "";
  useEffect(() => {
    setUnlocked(false);
  }, [stepKey]);

  useEffect(() => {
    if (!unlocked) return;
    const arm = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(
        () => setUnlocked(false),
        MADNESS_IDLE_RELOCK_MS
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

  useEffect(() => () => setUnlocked(false), []);

  const startLongPress = () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      setUnlocked(true);
      longPressTimerRef.current = null;
    }, MADNESS_LONG_PRESS_MS);
  };
  const endLongPress = () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  };

  if (!data) return null;
  const isStorytellerView = unlocked;

  return (
    <PlayerViewProvider playerView={!isStorytellerView}>
      <ModalWrapper
        title={getMadnessNoticeTitle(isStorytellerView, data)}
        widthRatio={0.98}
        maxWidthPx={1560}
        autoHeight
        closeOnOverlayClick={false}
        onClose={onConfirm}
        footer={
          <div className="flex w-full justify-center">
            <button
              type="button"
              data-testid="madness-notice-confirm"
              onClick={onConfirm}
              className="flex-1 max-w-md py-3.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-black text-base shadow-lg transition cursor-pointer active:scale-[0.98]"
            >
              确认并继续
            </button>
          </div>
        }
      >
        <MadnessNoticeBody
          data={data}
          isStorytellerView={isStorytellerView}
          onLongPressStart={startLongPress}
          onLongPressEnd={endLongPress}
          onMadnessCheck={onMadnessCheck}
        />
      </ModalWrapper>
    </PlayerViewProvider>
  );
}

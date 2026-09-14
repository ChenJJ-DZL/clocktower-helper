import type React from "react";
import { useState } from "react";
import type { Seat } from "@/src/types/game";
import { formatSeatLabel } from "../../utils/seatLabel";
import { ModalWrapper } from "./ModalWrapper";

interface JugglerJudgeModalProps {
  seatId: number;
  seats: Seat[];
  isVortoxWorld?: boolean;
  onConfirm: (correctCount: number) => void;
  onClose: () => void;
}

/**
 * 杂耍艺人猜测判定弹窗
 *
 * ⚠️ 本组件渲染在 **1600×900 的缩放舞台**里（`ScaleLayout` 用
 * `transform: scale(min(w/1600, h/900))` 等比缩放），所以：
 *   · 下面所有 `text-[Npx]` / `h-[Npx]` 都是**设计像素**，真机字号 = 设计字号 × scale；
 *   · 手机横屏（如 844×390）时 scale ≈ 0.43 → **设计字号 40 ≈ 真机 17px**；
 *   · 弹窗可用空间是 **1360 × 792 设计像素**（`ModalWrapper` 的 width/height 上限），
 *     ⚠️ 不要把 `w-[…] / max-w-[…] / h-[…]` 放进 className ——
 *        `ModalWrapper` 会把这些"破坏性视口类名"**静默剥掉**。
 *
 * 设计要求（用户 2026-09-14）：
 *   **一屏内完整显示全部 15 个座位的座位号 + 角色名，字号尽可能大，方便手机横屏阅读。**
 *   ⇒ 用满宽度（去掉原来的 `max-w-2xl`）、用满高度（座位网格 `flex-1`，不再 `max-h-56` 裁剪）、
 *     15 人排成 **5 列 × 3 行**，字号由「卡片宽度 ÷ 最长角色名」反算，保证不溢出。
 */

/** 弹窗内容区设计尺寸（与 ModalWrapper 的上限一致，用于反算字号） */
const MODAL_W = 1360;
const MODAL_H = 792;
/** 内容左右 padding（设计像素，对应 px-6 两侧） */
const CONTENT_PAD = 48;
/** 网格间距（设计像素，对应 gap-1.5 ≈ 6px） */
const GAP = 6;
/** 目标行数：15 人 → 5 列；12 人 → 4 列；人数再多也保持 3 行，靠增列吸收 */
const TARGET_ROWS = 3;

export const JugglerJudgeModal: React.FC<JugglerJudgeModalProps> = ({
  seatId,
  seats,
  isVortoxWorld,
  onConfirm,
  onClose,
}) => {
  const [selectedCount, setSelectedCount] = useState<number>(0);

  const hasVortox =
    !!isVortoxWorld || seats.some((s) => s.role?.id === "vortox" && !s.isDead);

  const jugglerSeat = seats.find((s) => s.id === seatId);
  const jugglerName = formatSeatLabel(seatId, jugglerSeat?.playerName);

  // ── 自适应网格与字号（数据驱动，保证最长角色名不溢出、不截断）────────────
  const cols = Math.max(1, Math.ceil(seats.length / TARGET_ROWS));
  const cardW = (MODAL_W - CONTENT_PAD - GAP * (cols - 1)) / cols;
  /** 最长的一行角色名：`【名称】` = 名称字数 + 2 个方括号 */
  const longestRoleGlyphs = seats.reduce(
    (m, s) => Math.max(m, (s.role?.name?.length ?? 4) + 2),
    2
  );
  /** 角色名字号：卡片可用宽度 ÷ 最长字形数（留 12px 内边距） */
  const roleFont = Math.max(
    18,
    Math.min(40, Math.floor((cardW - 12) / longestRoleGlyphs))
  );
  /** 座位号字号（比角色名大一档，视觉层级） */
  const seatFont = Math.round(roleFont * 1.28);
  /** 第三行（伪装 / 玩家名）字号 */
  const noteFont = Math.max(14, Math.round(roleFont * 0.7));

  return (
    <ModalWrapper
      title="🤹 杂耍艺人猜测判定"
      onClose={onClose}
      // ⚠️ 不要加 max-w-*/w-[*]：会被 ModalWrapper 剥掉；用 w-full 吃满 1360 设计宽
      className="w-full"
      heightPercent={92}
      maxHeightPx={820}
      footer={
        <div className="flex items-center justify-between w-full gap-4 pt-1">
          <div className="text-[22px] text-slate-400">
            当晚将告知杂耍艺人：
            <span className="ml-2 text-amber-400 font-black text-[30px]">
              得知的数字为 {selectedCount}
            </span>
          </div>
          <div className="flex gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl font-bold text-[24px] transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => onConfirm(selectedCount)}
              className="px-7 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-black text-[26px] transition-colors shadow-lg shadow-amber-900/30"
            >
              确认记录 ({selectedCount}次)
            </button>
          </div>
        </div>
      }
    >
      {/* 用满弹窗高度：网格 flex-1，其余区域 shrink-0 */}
      <div className="flex flex-col h-full min-h-0 gap-2 py-1">
        {/* 涡流在场醒目提示（压缩为单行，避免挤占座位区高度） */}
        {hasVortox && (
          <div className="shrink-0 bg-rose-950/60 border-2 border-rose-500/80 rounded-xl px-3 py-2 text-rose-200">
            <p className="text-[20px] leading-snug">
              <span className="font-black text-rose-300">
                🌀 涡流在场：
              </span>{" "}
              镇民能力必须给<strong>虚假信息</strong> —— 杂耍艺人今晚得知的数字
              <strong>不能等于真实猜对次数</strong>（系统已自动转换；也可在此另选一个假数字）。
            </p>
          </div>
        )}

        {/* 官方规则（压成一行，字号让步给座位区） */}
        <div className="shrink-0 text-[19px] leading-snug text-amber-200/85 truncate">
          📜 {jugglerName}【杂耍艺人】首个白天公开猜测最多 5 名玩家的角色；请对照下表
          <strong className="text-amber-300">真实身份</strong>核对，点选他猜对了几次（0~5）。
        </div>

        {/* ── 全场座位与真实角色：flex-1 吃满剩余高度，不裁剪、不滚动 ── */}
        <div className="flex-1 min-h-0 flex flex-col gap-1">
          <div className="shrink-0 flex items-center justify-between text-[20px] font-bold text-slate-400 px-1">
            <span>全场座位与实际角色（用于对照核实）：</span>
            <span className="text-slate-300">
              共 {seats.length} 人 · {cols} 列
            </span>
          </div>

          <div
            className="flex-1 min-h-0 grid"
            style={{
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${Math.min(TARGET_ROWS, Math.max(1, Math.ceil(seats.length / cols)))}, minmax(0, 1fr))`,
              gap: `${GAP}px`,
            }}
          >
            {seats.map((s) => {
              const isJuggler = s.id === seatId;
              const isDead = !!s.isDead;
              const isCharade =
                s.role?.id === "drunk" || s.role?.id === "marionette";
              const showCharade = isCharade && !!s.charadeRole;
              /** 自定义玩家名（自动生成的「玩家 N」不显示，省下空间给字号） */
              const customName =
                s.playerName && !/^玩家\s*\d+$/.test(s.playerName)
                  ? s.playerName
                  : "";

              return (
                <div
                  key={s.id}
                  className={`relative rounded-lg border flex flex-col items-center justify-center overflow-hidden leading-none px-1 ${
                    isJuggler
                      ? "bg-amber-950/50 border-amber-500/60"
                      : isDead
                        ? "bg-slate-900/40 border-white/5 opacity-55"
                        : "bg-slate-800/80 border-white/10"
                  }`}
                >
                  {/* 角标：不占布局，避免挤压字号 */}
                  {isJuggler && (
                    <span
                      className="absolute top-0 left-0 bg-amber-500 text-slate-950 font-black rounded-br-md"
                      style={{ fontSize: `${noteFont}px`, padding: "0 6px" }}
                    >
                      本人
                    </span>
                  )}
                  {isDead && (
                    <span
                      className="absolute top-0 right-0 bg-red-600/80 text-white font-black rounded-bl-md"
                      style={{ fontSize: `${noteFont}px`, padding: "0 6px" }}
                    >
                      亡
                    </span>
                  )}

                  {/* ① 座位号（对外一律 id+1） */}
                  <div
                    className={`font-black ${
                      isJuggler
                        ? "text-amber-300"
                        : isDead
                          ? "text-slate-400"
                          : "text-slate-100"
                    }`}
                    style={{ fontSize: `${seatFont}px` }}
                  >
                    {s.id + 1}号
                  </div>

                  {/* ② 角色名（本体） */}
                  <div
                    className={`font-bold mt-0.5 w-full text-center truncate ${
                      isDead ? "text-slate-400" : "text-amber-300/95"
                    }`}
                    style={{ fontSize: `${roleFont}px` }}
                    title={`${s.id + 1}号 ${s.role?.name ?? "未知角色"}`}
                  >
                    【{s.role?.name || "未知角色"}】
                  </div>

                  {/* ③ 第三行：伪装身份优先，其次是自定义玩家名；都没有就不占位 */}
                  {showCharade ? (
                    <div
                      className="w-full text-center truncate text-purple-300"
                      style={{ fontSize: `${noteFont}px` }}
                    >
                      显为{s.charadeRole!.name}
                    </div>
                  ) : customName ? (
                    <div
                      className="w-full text-center truncate text-slate-400"
                      style={{ fontSize: `${noteFont}px` }}
                    >
                      {customName}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── 0-5 数字确认选择区 ── */}
        <div className="shrink-0 flex flex-col gap-1 pt-2 border-t border-white/10">
          <div className="flex items-center justify-between text-[20px] font-bold">
            <span className="text-slate-300">
              请点击选择杂耍艺人猜对的次数（0 - 5 次）：
            </span>
            <span className="text-amber-400 font-black text-[24px]">
              当前选择: {selectedCount} 次
            </span>
          </div>

          <div className="grid grid-cols-6 gap-2">
            {[0, 1, 2, 3, 4, 5].map((num) => {
              const isSelected = selectedCount === num;
              return (
                <button
                  key={num}
                  type="button"
                  onClick={() => setSelectedCount(num)}
                  className={`h-[78px] rounded-xl flex flex-col items-center justify-center transition-all border ${
                    isSelected
                      ? "bg-gradient-to-b from-amber-500 to-amber-600 text-slate-950 border-amber-300 shadow-lg shadow-amber-500/30 scale-[1.03]"
                      : "bg-slate-800/90 hover:bg-slate-700 text-slate-200 border-white/10 hover:border-amber-500/40"
                  }`}
                >
                  <span className="font-black leading-none text-[36px]">
                    {num}
                  </span>
                  <span
                    className="leading-none opacity-80 mt-1"
                    style={{ fontSize: `${noteFont}px` }}
                  >
                    {num === 0 ? "全错" : num === 5 ? "全对" : `${num}对`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </ModalWrapper>
  );
};

export default JugglerJudgeModal;

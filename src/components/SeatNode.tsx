"use client";

import type React from "react";
import { useGameActions } from "../contexts/GameActionsContext";
import { useSeatView } from "../hooks/useSeatView";
import type { SeatNodeProps } from "./SeatNode.types"; // We should extract props too

// 状态标签组件 - 统一的状态标记样式
interface StatusPillProps {
  icon?: React.ReactNode;
  text: string;
  color?: "red" | "green" | "yellow";
  isPortrait?: boolean;
  duration?: string;
}

// 格式化时效文本
function formatDuration(duration: string): string {
  if (duration.includes("永久") || duration === "permanent") return "永久";
  if (
    duration.includes("至下个黄昏") ||
    duration.includes("下个黄昏清除") ||
    duration.includes("次日黄昏清除")
  )
    return "至黄昏";
  if (
    duration.includes("至天亮") ||
    duration.includes("至下个白天") ||
    duration === "until_dawn"
  )
    return "至天亮";
  if (duration.includes("1 Day") || duration === "Night+Day") return "至黄昏";

  const clearMatch = duration.match(/（(.+?)清除）/);
  if (clearMatch) {
    const clearTime = clearMatch[1];
    if (clearTime.includes("黄昏")) return "至黄昏";
    if (clearTime.includes("天亮")) return "至天亮";
    return clearTime.length > 6 ? `${clearTime.substring(0, 6)}...` : clearTime;
  }
  return duration;
}

function StatusPill({
  icon,
  text,
  color = "red",
  isPortrait = false,
  duration,
}: StatusPillProps) {
  const colorClasses = {
    red: "bg-red-900/80 text-red-200 border-red-700",
    green: "bg-green-900/80 text-green-200 border-green-700",
    yellow: "bg-yellow-900/80 text-yellow-200 border-yellow-700",
  };

  const sizeClass = isPortrait
    ? "text-[8px] px-1.5 py-0.5"
    : "text-xs px-2 py-0.5";
  const iconSize = isPortrait ? "w-2.5 h-2.5" : "w-3 h-3";
  const durationSize = isPortrait ? "text-[7px]" : "text-[10px]";

  return (
    <div
      className={`flex items-center gap-1.5 ${sizeClass} rounded-md border shadow-lg font-bold whitespace-nowrap backdrop-blur-md ${colorClasses[color]}`}
    >
      {icon && (
        <span className={`${iconSize} flex items-center justify-center`}>
          {icon}
        </span>
      )}
      <span>{text}</span>
      {duration && (
        <span className={`${durationSize} opacity-75 scale-90 font-normal`}>
          ({formatDuration(duration)})
        </span>
      )}
    </div>
  );
}

export const SeatNode: React.FC<SeatNodeProps> = (props) => {
  const {
    seat: s,
    index: i,
    seats,
    isPortrait,
    seatScale,
    nightInfo,
    selectedActionTargets,
    longPressingSeats,
    onSeatClick,
    onContextMenu,
    onTouchStart,
    onTouchEnd,
    onTouchMove,
    setSeatRef,
    getSeatPosition,
    getDisplayRoleType,
    typeColors,
    nominator = null,
    nominee = null,
    seatNote,
  } = props;

  const ctx = useGameActions();

  const {
    colorClass,
    roleName,
    isMasked,
    statusList,
    isValidTarget,
    containerStyle,
    realRole,
  } = useSeatView(
    s,
    i,
    seats,
    isPortrait,
    seatScale,
    nightInfo,
    selectedActionTargets,
    getSeatPosition,
    getDisplayRoleType,
    typeColors
  );

  return (
    <div
      key={s.id}
      onClick={(e) => {
        e.stopPropagation();
        if (isValidTarget) onSeatClick(s.id);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e, s.id);
      }}
      onTouchStart={(e) => {
        if (isValidTarget) onTouchStart(e, s.id);
      }}
      onTouchEnd={(e) => {
        if (isValidTarget) onTouchEnd(e, s.id);
      }}
      onTouchMove={(e) => {
        if (isValidTarget) onTouchMove(e, s.id);
      }}
      ref={(el) => {
        setSeatRef(s.id, el);
      }}
      style={containerStyle}
      className="absolute flex items-center justify-center seat-node"
      data-seat-id={s.id}
    >
      <div
        className={`relative w-full h-full rounded-full ${isPortrait ? "border-2" : "border-4"} flex items-center justify-center cursor-pointer z-30 bg-gray-900 transition-all duration-300
        ${colorClass}
        ${nightInfo?.seat.id === s.id ? "!ring-[6px] !ring-yellow-300 !scale-125 !shadow-[0_0_50px_rgba(253,224,71,0.9)] !brightness-100 !grayscale-0 !bg-gray-900 !border-yellow-300" : ""}
        ${s.isDead && nightInfo?.seat.id !== s.id ? "grayscale brightness-75 bg-gray-300 border-gray-400" : ""}
        ${selectedActionTargets.includes(s.id) ? "ring-4 ring-green-500 scale-105" : ""}
        ${longPressingSeats.has(s.id) ? "ring-4 ring-blue-400 animate-pulse" : ""}
        ${nominator === s.id ? "ring-8 ring-white scale-110 shadow-[0_0_40px_rgba(255,255,255,0.8)] animate-pulse" : ""}
        ${nominee === s.id ? "ring-8 ring-yellow-400 scale-110 shadow-[0_0_40px_rgba(250,204,21,0.8)] animate-pulse" : ""}
        ${s.isCandidate ? "ring-4 ring-red-500 scale-105 shadow-[0_0_20px_red]" : ""}
      `}
      >
        {/* === VFX Layers === */}
        {ctx.vfxTrigger?.seatId === s.id &&
          ctx.vfxTrigger?.type === "slayer" && (
            <div className="absolute inset-0 rounded-full bg-red-500 z-50 animate-vfx-particle shadow-[0_0_80px_red]"></div>
          )}
        {ctx.vfxTrigger?.seatId === s.id &&
          ctx.vfxTrigger?.type === "virgin" && (
            <div className="absolute inset-0 rounded-full bg-yellow-300 z-50 animate-vfx-particle shadow-[0_0_60px_yellow]"></div>
          )}

        {/* 真实身份指示徽章 */}
        {isMasked && (
          <div
            className={`absolute ${isPortrait ? "-top-1.5 -right-1.5" : "-top-4 -right-4"} bg-purple-600 text-white ${
              isPortrait
                ? "text-[8px] px-1 py-0.5"
                : "text-[10px] px-1.5 py-0.5"
            } rounded-full z-40 border border-white shadow-sm`}
          >
            实:{realRole?.name}
          </div>
        )}

        {/* 当前行动玩家高亮标签 - 金色脉冲光环（仅光环呼吸，内部保持清晰） */}
        {nightInfo?.seat.id === s.id && (
          <>
            <div className="absolute -inset-3 rounded-full border-[3px] border-yellow-300/60 animate-ping opacity-60"></div>
            <div className="absolute -inset-5 rounded-full border-2 border-yellow-300/30 animate-pulse"></div>
          </>
        )}

        {/* 长按进度指示器 */}
        {longPressingSeats.has(s.id) && (
          <div className="absolute inset-0 rounded-full border-4 border-blue-400 animate-ping opacity-75"></div>
        )}

        {/* 提名者外圈光环特效 */}
        {nominator === s.id && (
          <>
            <div
              className="absolute inset-0 rounded-full border-8 border-white/60 animate-ping opacity-50"
              style={{ animationDuration: "1.5s" }}
            ></div>
            <div className="absolute -inset-4 rounded-full border-4 border-white/30 animate-pulse"></div>
          </>
        )}

        {/* 被提名者外圈光环特效 */}
        {nominee === s.id && (
          <>
            <div
              className="absolute inset-0 rounded-full border-8 border-yellow-400/60 animate-ping opacity-50"
              style={{ animationDuration: "1.5s" }}
            ></div>
            <div className="absolute -inset-4 rounded-full border-4 border-yellow-400/30 animate-pulse"></div>
          </>
        )}

        {/* 座位序号 */}
        <div
          className={`absolute left-0 top-0 -translate-x-[40%] -translate-y-[40%] ${isPortrait ? "w-6 h-6" : "w-10 h-10"} rounded-full ${s.isDead ? "bg-gray-400 border-gray-500 text-gray-700" : "bg-slate-800 border-slate-600"} border-2 flex items-center justify-center ${isPortrait ? "text-xs" : "text-xl"} font-bold z-20 shadow-md`}
        >
          {s.id + 1}
        </div>

        {/* 角色名称 */}
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <span
            className={`${isPortrait ? "text-lg" : "text-2xl"} font-black drop-shadow-md leading-none text-center ${roleName.length > 4 ? "" : "whitespace-nowrap"} ${s.isDead ? "text-gray-400 line-through" : "text-white"}`}
            style={{ textShadow: "0 2px 4px rgba(0,0,0,0.9), 0 0 4px black" }}
          >
            {roleName}
          </span>
        </div>

        {/* 状态标签容器 */}
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2 flex flex-col-reverse gap-0.5 items-center z-30 w-full px-1 pointer-events-none"
          style={{ maxHeight: "60%" }}
        >
          {statusList.map((status) => (
            <StatusPill
              key={status.key}
              icon={status.icon}
              text={status.text}
              color={status.color}
              isPortrait={isPortrait}
              duration={status.duration}
            />
          ))}
        </div>

        {/* 右上角提示区域 */}
        <div
          className={`absolute ${isPortrait ? "-top-1.5 -right-1.5" : "-top-5 -right-5"} flex flex-col gap-0.5 items-end z-40`}
        >
          {seats.some((seat) => seat.masterId === s.id) && (
            <span
              className={`${isPortrait ? "text-[7px] px-0.5 py-0.5" : "text-xs px-2 py-0.5"} bg-purple-600 rounded-full shadow font-bold`}
            >
              主人
            </span>
          )}
          {s.isCandidate && (
            <span
              className={`${isPortrait ? "text-[7px] px-0.5 py-0.5" : "text-xs px-2 py-0.5"} bg-red-600 rounded-full shadow font-bold animate-pulse`}
            >
              ⚖️{s.voteCount}
            </span>
          )}
        </div>

        {/* 当前行动玩家 - 顶部"行动中"标签 */}
        {nightInfo?.seat.id === s.id && (
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap z-50">
            <span
              className={`${isPortrait ? "text-[9px] px-1.5 py-0.5" : "text-sm px-3 py-1"} bg-yellow-400/90 text-black rounded-full shadow-lg shadow-yellow-400/70 font-black animate-pulse border border-yellow-300`}
            >
              👤 行动中
            </span>
          </div>
        )}

        {/* 幽灵票标记 */}
        {s.isDead && s.hasGhostVote && (
          <div
            className={`absolute ${isPortrait ? "-bottom-1 -right-1" : "-bottom-1 -right-1"} ${isPortrait ? "w-4 h-4" : "w-5 h-5"} bg-white rounded-full border-2 border-slate-900 flex items-center justify-center shadow-md z-30`}
          >
            <div
              className={`${isPortrait ? "w-1.5 h-1.5" : "w-2 h-2"} bg-black rounded-full`}
            ></div>
          </div>
        )}

        {/* 备忘录提示标记 */}
        {seatNote && (
          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap bg-yellow-900/90 text-yellow-200 border border-yellow-700/50 rounded pointer-events-none px-2 py-0.5 text-xs font-medium shadow-lg z-50">
            {seatNote.length > 8 ? `${seatNote.slice(0, 8)}...` : seatNote}
          </div>
        )}
      </div>
    </div>
  );
};

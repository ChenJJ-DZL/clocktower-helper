"use client";

import React, { RefObject } from "react";
import { Seat, Role, GamePhase } from "../../../app/data";
import { NightInfoResult, phaseNames } from "../../types/game";
import { SeatGrid } from "./board/SeatGrid";
import { getSeatPosition } from "../../utils/gameRules";

// 定义圆桌组件需要的 Props 接口
export interface GameBoardProps {
  // ========== 核心数据 ==========
  seats: Seat[];
  gamePhase: GamePhase;
  nightCount: number;
  timer: number;
  nightInfo: NightInfoResult | null;
  selectedActionTargets: number[];
  isPortrait: boolean;
  
  // ========== UI状态 ==========
  seatScale: number; // 座位缩放比例，通常为 seats.length <= 9 ? 1.3 : 1
  longPressingSeats: Set<number>; // 正在长按的座位ID集合
  
  // ========== Refs ==========
  seatContainerRef: RefObject<HTMLDivElement | null>; // 圆桌容器引用
  seatRefs: RefObject<Record<number, HTMLDivElement | null>>; // 每个座位元素引用
  
  // ========== 交互函数 ==========
  handleSeatClick: (id: number) => void;
  handleContextMenu: (e: React.MouseEvent, seatId: number) => void;
  handleTouchStart: (e: React.TouchEvent, seatId: number) => void;
  handleTouchEnd: (e: React.TouchEvent, seatId: number) => void;
  handleTouchMove: (e: React.TouchEvent, seatId: number) => void;
  handleGlobalUndo: () => void;
  
  // ========== 工具函数 ==========
  getSeatPosition: typeof getSeatPosition; // 获取座位位置函数
  getDisplayRoleType: (seat: Seat) => string | null; // 获取显示角色类型
  formatTimer: (s: number) => string; // 格式化计时器显示
  setSeatRef: (id: number, el: HTMLDivElement | null) => void; // 设置座位元素引用
  
  // ========== 其他 ==========
  typeColors: Record<string, string>; // 类型颜色映射
  setCurrentModal: (value: { type: 'SPY_DISGUISE'; data: null } | null) => void; // 设置显示伪装身份识别弹窗
}

// 圆桌组件
export function GameBoard(props: GameBoardProps) {
  const {
    seats,
    gamePhase,
    nightCount,
    timer,
    nightInfo,
    selectedActionTargets,
    isPortrait,
    seatScale,
    longPressingSeats,
    seatContainerRef,
    seatRefs,
    handleSeatClick,
    handleContextMenu,
    handleTouchStart,
    handleTouchEnd,
    handleTouchMove,
    handleGlobalUndo,
    getSeatPosition,
    getDisplayRoleType,
    formatTimer,
    setSeatRef,
    typeColors,
    setCurrentModal,
  } = props;

  const phaseLabel =
    gamePhase === "scriptSelection"
      ? "选择剧本"
      : gamePhase === "setup"
        ? "准备阶段"
        : phaseNames[gamePhase] ?? "游戏中";

  const detailLabel =
    gamePhase === "day" || gamePhase === "dusk"
      ? `第 ${nightCount} 天`
      : gamePhase === "firstNight" || gamePhase === "night"
        ? `第 ${nightCount} 夜`
        : "";

  return (
    <main className="flex-1 h-full relative flex items-center justify-center overflow-hidden p-4">
      {/* 全屏氛围层(保持不变) */}
      <div className="absolute inset-0 shadow-[inset_0_0_200px_100px_rgba(0,0,0,0.8)] z-0 pointer-events-none" />
      
      {/* === 核心修改：圆桌容器 === */}
      <div 
        ref={seatContainerRef}
        className="relative h-full max-h-[90%] aspect-square flex items-center justify-center z-10"
      >
        {/* 中心区域：小镇广场信息 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center z-0 pointer-events-none select-none">
          <div className="px-6 py-4 rounded-3xl bg-slate-900/80 border border-white/10 shadow-2xl backdrop-blur-md flex flex-col items-center gap-2">
            <div className="text-3xl md:text-4xl font-black tracking-wide bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(59,130,246,0.6)]">
              {phaseLabel}
            </div>
            {detailLabel && (
              <div className="text-sm md:text-base text-slate-200 font-semibold">
                {detailLabel}
              </div>
            )}
            {gamePhase !== "scriptSelection" && (
              <div className="mt-1 text-2xl md:text-3xl font-mono font-bold text-cyan-300 drop-shadow-[0_0_15px_rgba(34,211,238,0.6)]">
                {formatTimer(timer)}
              </div>
            )}
            <div className="mt-1 text-[11px] md:text-xs text-slate-400">
              当前玩家人数：{seats.filter((s) => s.role).length} / {seats.length}
            </div>
          </div>
        </div>

        {/* 座位网格 */}
        <SeatGrid
          seats={seats}
          nightInfo={nightInfo}
          selectedActionTargets={selectedActionTargets}
          isPortrait={isPortrait}
          seatScale={seatScale}
          longPressingSeats={longPressingSeats}
          onSeatClick={(seat) => handleSeatClick(seat.id)}
          onContextMenu={handleContextMenu}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchMove={handleTouchMove}
          setSeatRef={setSeatRef}
          getSeatPosition={getSeatPosition}
          getDisplayRoleType={getDisplayRoleType}
          typeColors={typeColors}
        />
      </div>
    </main>
  );
}


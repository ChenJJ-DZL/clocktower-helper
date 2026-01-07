"use client";

import React, { useState, useCallback } from "react";
import { GamePhase } from "../../../../app/data";

interface TableCenterHUDProps {
  gamePhase: GamePhase;
  nightCount: number;
  timer: number;
  formatTimer: (seconds: number) => string;
  onTimerStart?: () => void;
  onTimerPause?: () => void;
  onTimerReset?: () => void;
}

/**
 * TableCenterHUD - Dashboard component for the center of the round table
 * Displays phase indicator, interactive timer, and credits
 */
export function TableCenterHUD({
  gamePhase,
  nightCount,
  timer,
  formatTimer,
  onTimerStart,
  onTimerPause,
  onTimerReset,
}: TableCenterHUDProps) {
  const [isTimerRunning, setIsTimerRunning] = useState(true);

  const handleTimerClick = useCallback(() => {
    if (isTimerRunning) {
      setIsTimerRunning(false);
      onTimerPause?.();
    } else {
      setIsTimerRunning(true);
      onTimerStart?.();
    }
  }, [isTimerRunning, onTimerPause, onTimerStart]);

  const handleTimerReset = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsTimerRunning(false);
    onTimerReset?.();
  }, [onTimerReset]);

  const getPhaseLabel = () => {
    switch (gamePhase) {
      case 'setup': return '准备阶段';
      case 'check': return '核对身份';
      case 'firstNight': return '首夜';
      case 'night': return `第 ${nightCount} 夜`;
      case 'day': return `第 ${nightCount} 天`;
      case 'dusk': return '黄昏';
      case 'dawnReport': return '天亮结算';
      case 'gameOver': return '游戏结束';
      case 'scriptSelection': return '选择剧本';
      default: return gamePhase;
    }
  };

  const getPhaseColor = () => {
    switch (gamePhase) {
      case 'setup': return 'text-slate-400';
      case 'check': return 'text-blue-400';
      case 'firstNight':
      case 'night': return 'text-purple-400';
      case 'day': return 'text-cyan-400';
      case 'dusk': return 'text-orange-400';
      case 'dawnReport': return 'text-yellow-400';
      case 'gameOver': return 'text-red-400';
      case 'scriptSelection': return 'text-slate-300';
      default: return 'text-gray-400';
    }
  };

  // Don't show during script selection
  if (gamePhase === 'scriptSelection') {
    return null;
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center z-0 pointer-events-none">
      <div className="px-8 py-6 rounded-3xl bg-slate-900/90 shadow-2xl backdrop-blur-md flex flex-col items-center gap-3 pointer-events-auto">
        {/* Phase Indicator */}
        <div className={`text-4xl font-black tracking-wide ${getPhaseColor()} drop-shadow-[0_0_10px_rgba(59,130,246,0.6)]`}>
          {getPhaseLabel()}
        </div>

        {/* Timer - Interactive */}
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={handleTimerClick}
            className="text-3xl font-mono font-bold text-cyan-300 drop-shadow-[0_0_15px_rgba(34,211,238,0.6)] hover:text-cyan-200 transition-colors cursor-pointer"
            title={isTimerRunning ? "点击暂停" : "点击继续"}
          >
            {formatTimer(timer)}
          </button>
          <div className="flex gap-2">
            <button
              onClick={handleTimerReset}
              className="px-3 py-1 text-xs font-semibold text-slate-400 hover:text-slate-300 bg-slate-800/50 rounded-lg transition-colors"
              title="重置计时器"
            >
              重置
            </button>
            <div className="px-3 py-1 text-xs font-semibold text-slate-500">
              {isTimerRunning ? "运行中" : "已暂停"}
            </div>
          </div>
        </div>

        {/* Credits */}
        <div className="mt-2 text-xs text-slate-500 font-medium">
          拜甘教设计
        </div>
      </div>
    </div>
  );
}


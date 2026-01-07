"use client";

import React from "react";
import { GamePhase, Seat } from "../../../../app/data";
import { NightInfoResult } from "../../../types/game";

interface GameConsoleProps {
  // Zone A: Header
  gamePhase: GamePhase;
  nightCount: number;
  currentStep?: number;
  totalSteps?: number;
  onToggleGrimoire?: () => void;
  
  // Zone B: Active Stage
  scriptText?: string;
  guidancePoints?: string[];
  selectedPlayers?: number[];
  seats?: Seat[];
  nightInfo?: NightInfoResult | null;
  
  // Zone C: Actions
  primaryAction?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    variant?: 'primary' | 'success' | 'warning' | 'danger';
  };
  secondaryActions?: Array<{
    label: string;
    onClick: () => void;
    disabled?: boolean;
  }>;
}

/**
 * GameConsole - 3-Zone workflow wizard for storyteller
 * Zone A: Status Header
 * Zone B: Active Stage (scrollable instructions)
 * Zone C: Action Footer
 */
export function GameConsole({
  gamePhase,
  nightCount,
  currentStep,
  totalSteps,
  onToggleGrimoire,
  scriptText,
  guidancePoints = [],
  selectedPlayers = [],
  seats = [],
  nightInfo,
  primaryAction,
  secondaryActions = [],
}: GameConsoleProps) {
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
      default: return gamePhase;
    }
  };

  const getPhaseColor = () => {
    switch (gamePhase) {
      case 'setup': return 'bg-slate-600';
      case 'check': return 'bg-blue-600';
      case 'firstNight':
      case 'night': return 'bg-purple-600';
      case 'day': return 'bg-cyan-600';
      case 'dusk': return 'bg-orange-600';
      case 'dawnReport': return 'bg-yellow-600';
      case 'gameOver': return 'bg-red-600';
      default: return 'bg-gray-600';
    }
  };

  const getActionVariantClass = (variant: string = 'primary') => {
    switch (variant) {
      case 'success': return 'bg-emerald-500 hover:bg-emerald-400 text-white';
      case 'warning': return 'bg-amber-500 hover:bg-amber-400 text-white';
      case 'danger': return 'bg-red-500 hover:bg-red-400 text-white';
      default: return 'bg-blue-500 hover:bg-blue-400 text-white';
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-900">
      {/* Zone A: Header (Status) */}
      <div className="shrink-0 h-20 border-b border-white/10 bg-slate-800/50 flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-4">
          <div className={`px-[2px] py-[2px] rounded-lg text-base font-bold text-white whitespace-nowrap ${getPhaseColor()}`}>
            {getPhaseLabel()}
          </div>
          {/* Step Debugger - Always visible for debugging */}
          {currentStep !== undefined && totalSteps !== undefined && (
            <div className="flex items-center gap-2">
              <div className={`text-sm font-mono px-[2px] py-[2px] rounded bg-slate-700/50 whitespace-nowrap ${
                totalSteps > 0 ? 'text-slate-300' : 'text-red-400'
              }`}>
                步骤: {currentStep} / {totalSteps}
              </div>
              {totalSteps === 0 && (gamePhase === 'firstNight' || gamePhase === 'night') && (
                <div className="text-xs text-red-400 font-semibold px-[2px] py-[2px] rounded bg-red-900/30 whitespace-nowrap">
                  错误：未生成脚本
                </div>
              )}
            </div>
          )}
        </div>
        {onToggleGrimoire && (
          <button
            onClick={onToggleGrimoire}
            className="px-[2px] py-[2px] rounded-lg text-sm font-semibold text-slate-300 bg-slate-700/50 hover:bg-slate-700 transition h-12 whitespace-nowrap"
          >
            查看手册
          </button>
        )}
      </div>

      {/* Zone B: Active Stage (Scrollable) */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5 min-h-0">
        {/* Section 1: Script Text */}
        {scriptText && (
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-slate-300">脚本</h3>
            <div className="text-lg leading-relaxed text-slate-100 font-medium">
              {scriptText}
            </div>
          </div>
        )}

        {/* Section 2: Guidance Points */}
        {guidancePoints.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-slate-300">提示</h3>
            <div className="space-y-2">
              {guidancePoints.map((point, index) => (
                <div key={index} className="flex items-start gap-3 text-base text-slate-200">
                  <span className="text-slate-500 mt-1">•</span>
                  <span>{point}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Section 3: Selection Status */}
        {selectedPlayers.length > 0 && seats.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-slate-300">已选择</h3>
            <div className="flex flex-wrap gap-3">
              {selectedPlayers.map((playerId) => {
                const seat = seats.find(s => s.id === playerId);
                return (
                  <div
                    key={playerId}
                    className="px-[2px] py-[2px] rounded bg-blue-900/50 text-sm font-semibold text-blue-200 whitespace-nowrap"
                  >
                    {playerId + 1}号 {seat?.role?.name || '未知'}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Error state when script is empty - only show if actually in night phase */}
        {totalSteps === 0 && (gamePhase === 'firstNight' || gamePhase === 'night') && (
          <div className="space-y-3">
            <div className="text-sm font-semibold text-red-400 uppercase tracking-wide">错误</div>
            <div className="bg-red-900/30 rounded-xl p-5 border border-red-700/50 text-base text-red-200">
              错误：未为此配置生成脚本。请检查角色分配是否正确。
              <div className="mt-3 text-sm text-red-300/80">
                提示：某些角色配置可能没有首夜唤醒的角色。如果这是预期的，游戏将直接进入天亮阶段。
              </div>
            </div>
            {/* Manual Override Button for safety */}
            {primaryAction && (
              <button
                onClick={() => {
                  console.warn('[Manual Override] Attempting to force next phase');
                  primaryAction.onClick();
                }}
                className="w-full py-3 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-base"
              >
                手动继续（强制下一步）
              </button>
            )}
          </div>
        )}

        {/* Placeholder when no content but script exists */}
        {!scriptText && guidancePoints.length === 0 && selectedPlayers.length === 0 && totalSteps !== 0 && (
          <div className="flex items-center justify-center h-full text-slate-500 text-base">
            等待指令...
          </div>
        )}

        {/* Debug info for troubleshooting */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-4 p-3 bg-slate-800/50 rounded-lg text-xs text-slate-500 font-mono space-y-1">
            <div>调试：阶段={gamePhase}，步骤={currentStep}/{totalSteps}</div>
            <div>有主要操作：{primaryAction ? '是' : '否'}</div>
            <div>主要操作已禁用：{primaryAction?.disabled ? '是' : '否'}</div>
            <div>有脚本文本：{scriptText ? '是' : '否'}</div>
            <div>已选择玩家：{selectedPlayers.length}</div>
          </div>
        )}
      </div>

      {/* Zone C: Action Footer */}
      {(primaryAction || secondaryActions.length > 0) && (
        <div className="shrink-0 border-t border-white/10 bg-slate-800/50 px-6 py-5 space-y-3">
          {primaryAction && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('[GameConsole] Primary action clicked', {
                  label: primaryAction.label,
                  disabled: primaryAction.disabled,
                  variant: primaryAction.variant,
                });
                if (!primaryAction.disabled) {
                  try {
                    primaryAction.onClick();
                  } catch (error) {
                    console.error('[GameConsole] Error in primary action:', error);
                    alert(`操作失败: ${error instanceof Error ? error.message : '未知错误'}`);
                  }
                } else {
                  console.warn('[GameConsole] Primary action is disabled');
                }
              }}
              disabled={primaryAction.disabled}
              className={`w-full h-16 rounded-xl text-xl font-bold shadow-lg transition ${
                getActionVariantClass(primaryAction.variant)
              } ${primaryAction.disabled ? 'opacity-50 cursor-not-allowed' : 'active:scale-95'}`}
            >
              {primaryAction.label}
            </button>
          )}
          {secondaryActions.length > 0 && (
            <div className="flex gap-3">
              {secondaryActions.map((action, index) => (
                <button
                  key={index}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('[GameConsole] Secondary action clicked', {
                      index,
                      label: action.label,
                      disabled: action.disabled,
                    });
                    if (!action.disabled) {
                      try {
                        action.onClick();
                      } catch (error) {
                        console.error('[GameConsole] Error in secondary action:', error);
                        alert(`操作失败: ${error instanceof Error ? error.message : '未知错误'}`);
                      }
                    }
                  }}
                  disabled={action.disabled}
                  className={`flex-1 h-14 rounded-lg text-base font-semibold bg-slate-700 hover:bg-slate-600 text-slate-200 transition ${
                    action.disabled ? 'opacity-50 cursor-not-allowed' : 'active:scale-95'
                  }`}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


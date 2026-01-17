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
  wakeQueueIds?: number[];
  onToggleGrimoire?: () => void;
  
  // Zone B: Active Stage
  scriptText?: string;
  guidancePoints?: string[];
  selectedPlayers?: number[];
  seats?: Seat[];
  nightInfo?: NightInfoResult | null;
  onTogglePlayer?: (seatId: number) => void;
  
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
  
  // Day Abilities Panel (for Day phase)
  handleDayAbility?: (sourceSeatId: number, targetSeatId?: number) => void;
  
  // Force continue callback (for empty queue scenarios)
  onForceContinue?: () => void;
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
  onTogglePlayer,
  primaryAction,
  secondaryActions = [],
  handleDayAbility,
  onForceContinue,
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

        {/* Section 3: Day Abilities Panel (Day Phase Only) */}
        {gamePhase === 'day' && handleDayAbility && (
          <div className="bg-slate-800/50 p-6 rounded-2xl border border-white/5">
            <h3 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
              <span>⚡️</span> 可用主动技能
            </h3>
            
            {(() => {
              // Filter players who are ALIVE and HAVE DAY ABILITIES and HAVEN'T USED THEM
              const activeAbilitySeats = seats.filter(s => 
                !s.isDead && 
                s.role?.dayMeta && 
                !s.hasUsedDayAbility
              );

              if (activeAbilitySeats.length === 0) {
                return <p className="text-gray-500 text-sm">暂无可用技能</p>;
              }

              return (
                <div className="space-y-3">
                  {activeAbilitySeats.map(seat => (
                    <div key={seat.id} className="flex items-center justify-between bg-slate-900 p-3 rounded-lg border border-white/10">
                      <div className="flex items-center gap-3">
                        <span className="text-amber-500 font-bold">{seat.id + 1}号</span>
                        <span className="text-white">{seat.role?.name}</span>
                      </div>
                      <button
                        onClick={() => {
                          if (!handleDayAbility) return;
                          // Simple prompt for now. Ideally use a Modal.
                          if (seat.role?.dayMeta?.targetType === 'player') {
                            const targetStr = prompt(`请输入目标座位号 (1-${seats.length}):`);
                            if (targetStr) {
                              const targetId = parseInt(targetStr) - 1;
                              if (!isNaN(targetId) && targetId >= 0 && targetId < seats.length) {
                                handleDayAbility(seat.id, targetId);
                              } else {
                                alert(`无效的座位号，请输入 1-${seats.length} 之间的数字`);
                              }
                            }
                          } else {
                            if (confirm(`确定使用 ${seat.role?.dayMeta?.abilityName || '技能'} 吗？`)) {
                              handleDayAbility(seat.id);
                            }
                          }
                        }}
                        className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white text-sm rounded shadow-sm transition-colors"
                      >
                        使用 {seat.role?.dayMeta?.abilityName}
                      </button>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {/* Section 3: 玩家列表（夜晚交互用） */}
        {(gamePhase === 'firstNight' || gamePhase === 'night') && seats.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-slate-300">玩家列表</h3>
            <div className="grid grid-cols-4 gap-2">
              {seats.map((seat) => {
                // 【小白模式】显示所有有角色的玩家，包括已死玩家（用于手动修正错误）
                if (!seat.role) return null;
                const isSelected = selectedPlayers.includes(seat.id);
                return (
                  <button
                    key={seat.id}
                    type="button"
                    onClick={() => onTogglePlayer && onTogglePlayer(seat.id)}
                    className={`px-2 py-1.5 rounded-lg text-xs font-semibold text-left border transition ${
                      isSelected
                        ? 'bg-blue-600/90 border-blue-300 text-white shadow shadow-blue-500/40'
                        : seat.isDead
                        ? 'bg-gray-700/60 border-gray-500 text-gray-400 hover:bg-gray-600/60 line-through'
                        : 'bg-slate-800/80 border-slate-600 text-slate-100 hover:bg-slate-700/80'
                    }`}
                    title={seat.isDead ? '已死亡（小白模式：仍可选择）' : undefined}
                  >
                    {seat.id + 1}号 {seat.role.name} {seat.isDead ? '💀' : ''}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Error state when script is empty - only show if actually in night phase */}
        {totalSteps === 0 && (gamePhase === 'firstNight' || gamePhase === 'night') && (
          <div className="space-y-3">
            <div className="text-sm font-semibold text-amber-400 uppercase tracking-wide">⚠️ 提示</div>
            <div className="bg-amber-900/30 rounded-xl p-5 border border-amber-700/50 text-base text-amber-200">
              <div className="mb-2">
                当前没有需要唤醒的角色。可能原因：
              </div>
              <ul className="list-disc list-inside space-y-1 text-sm text-amber-300/80 mb-3">
                <li>没有分配角色，或分配的角色都没有夜晚行动</li>
                <li>所有有夜晚行动的角色都已死亡</li>
                <li>这是正常的（某些配置确实没有首夜行动）</li>
              </ul>
              <div className="text-sm text-amber-300/80">
                如果这是预期的，可以点击下方按钮直接进入天亮阶段。
              </div>
            </div>
            {/* Manual Override Button - 改进：即使没有 primaryAction 也显示按钮 */}
            <button
              onClick={() => {
                console.log('[Manual Override] 手动继续到天亮阶段');
                if (primaryAction) {
                  primaryAction.onClick();
                } else if (onForceContinue) {
                  // 使用备用回调
                  onForceContinue();
                } else {
                  console.warn('[Manual Override] primaryAction 和 onForceContinue 都不存在');
                  alert('无法继续：请刷新页面重试');
                }
              }}
              className="w-full py-3 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-base transition-colors"
            >
              🌞 直接进入天亮阶段
            </button>
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


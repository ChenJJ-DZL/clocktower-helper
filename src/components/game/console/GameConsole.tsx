"use client";

import React from "react";
import { GamePhase, Seat } from "../../../../app/data";
import { NightInfoResult } from "../../../types/game";
import { getRoleDocSummary } from "../../../utils/roleDocLookup";

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
  inspectionResult?: string | null;
  inspectionResultKey?: number;

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

// Use React.memo to prevent re-renders when props haven't changed
export const GameConsole = React.memo(function GameConsole({
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
  inspectionResult,
  inspectionResultKey,
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

  const isNightPhase = gamePhase === "firstNight" || gamePhase === "night";
  const currentActorRoleName =
    nightInfo?.seat?.role?.id === "drunk"
      ? nightInfo?.seat?.charadeRole?.name
      : nightInfo?.seat?.role?.name;
  const currentActorSeat = nightInfo?.seat;

  const currentActorAbilityText =
    (nightInfo?.seat?.role?.id === "drunk"
      ? nightInfo?.seat?.charadeRole?.ability
      : nightInfo?.seat?.role?.ability) || undefined;

  // Optimize: Memoize roleDoc lookup
  const roleDoc = React.useMemo(() => {
    return currentActorRoleName ? getRoleDocSummary(currentActorRoleName) : null;
  }, [currentActorRoleName]);

  // Debug logging for role documentation
  React.useEffect(() => {
    if (currentActorRoleName && roleDoc) {
      console.log(`[RoleDoc] ${currentActorRoleName}:`, {
        hasOperation: !!roleDoc.operation,
        operationLength: roleDoc.operation?.length || 0,
        hasRulesDetails: !!roleDoc.rulesDetails,
        examplesCount: roleDoc.examples?.length || 0
      });
    }
  }, [currentActorRoleName, roleDoc]);

  const normalizeQuoted = (s: string) => {
    const t = (s || "").trim();
    if (!t) return "";
    // nightInfo.speak in many places is wrapped in quotes like '"...内容..."'
    // Also remove trailing periods/commas because we add them in the actionText template
    return t.replace(/^['"]+/, "").replace(/['"]+$/, "").replace(/[。\.，,]+$/, "");
  };

  // Optimize: Memoize instructions
  const storytellerInstruction = React.useMemo(() => {
    if (!isNightPhase || !currentActorSeat || !currentActorRoleName || !nightInfo) return null;

    const seatNo = currentActorSeat.id + 1;
    const roleName = currentActorRoleName;
    const action = (nightInfo.action || "").trim();
    const speak = normalizeQuoted(nightInfo.speak || "");

    const hasAction = action && !["无", "无信息", "（无）", "跳过"].includes(action);
    const actionPart = hasAction ? `让他选择${action}` : null;
    const speakPart = speak ? `告诉他：${speak}` : null;

    // Combine into specific format requested:
    // 行动：唤醒x号玩家，告诉他xxx/让他选择xxx。
    let actionText = `唤醒 ${seatNo} 号【${roleName}】玩家`;
    if (speakPart && actionPart) {
      actionText += `，${speakPart}并${actionPart}。`;
    } else if (speakPart) {
      actionText += `，${speakPart}。`;
    } else if (actionPart) {
      actionText += `，${actionPart}。`;
    } else {
      actionText += `。`;
    }

    return {
      headline: `唤醒 ${seatNo} 号【${roleName}】。`,
      actionText,
    };
  }, [isNightPhase, currentActorSeat, currentActorRoleName, nightInfo]);


  // Remove "skill/instruction" style guidance that duplicates role ability text.
  // In this project, the first guidance point is often `nightInfo.guide` (what to do),
  // which the user wants removed from the "提示与脚本" section.
  const skillLikeGuidance = new Set<string>(
    [nightInfo?.guide, currentActorAbilityText, roleDoc?.abilityText]
      .map((s) => (s || "").trim())
      .filter(Boolean)
  );
  const filteredGuidancePoints = guidancePoints.filter((p) => !skillLikeGuidance.has((p || "").trim()));

  return (
    <div className="h-full flex flex-col bg-slate-900 border-l border-white/10">
      {/* Zone A: Header (Status) */}
      <div className="shrink-0 h-20 border-b border-white/10 bg-slate-800/50 flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-4">
          <div className={`px-3 py-1.5 rounded-lg text-base font-bold text-white whitespace-nowrap shadow-lg ${getPhaseColor()}`}>
            {getPhaseLabel()}
          </div>
        </div>
        {onToggleGrimoire && (
          <button
            onClick={onToggleGrimoire}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-300 bg-slate-700/50 hover:bg-slate-700 hover:text-white transition-all duration-200 border border-white/5 whitespace-nowrap"
          >
            查看手册
          </button>
        )}
      </div>

      {/* Zone B: Active Stage (Scrollable) */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6 min-h-0 bg-slate-900/50">
        {isNightPhase && currentActorSeat && currentActorRoleName && (
          <div className="rounded-2xl border border-emerald-400/40 bg-emerald-950/30 px-5 py-4 shadow-xl shadow-emerald-900/10 backdrop-blur-sm">
            <div className="text-[13px] font-bold uppercase tracking-wider text-emerald-400/80 mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              当前的行动
            </div>

            <div className="text-[17px] text-emerald-50 leading-relaxed font-medium">
              {/* Formatted Action instruction */}
              <div className="flex flex-col gap-2">
                <div>
                  <span className="font-bold text-emerald-300 tracking-wide">行动：</span>
                  {storytellerInstruction?.actionText ?? `唤醒 ${currentActorSeat.id + 1} 号【${currentActorRoleName}】。`}
                </div>
                {inspectionResult && (
                  <div className="text-sm font-normal text-emerald-400/80 italic">
                    （技能结果是：{inspectionResult}）
                  </div>
                )}
              </div>
            </div>

            {/* Injected Player List */}
            {seats.length > 0 && (
              <div className="mt-5 pt-4 border-t border-emerald-500/20">
                <div className="text-xs font-bold uppercase tracking-widest text-emerald-400/60 mb-3 ml-1">
                  选择目标
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {seats.map((seat) => {
                    if (!seat.role) return null;
                    const isSelected = selectedPlayers.includes(seat.id);
                    return (
                      <button
                        key={seat.id}
                        type="button"
                        onClick={() => onTogglePlayer && onTogglePlayer(seat.id)}
                        className={`px-2 py-2 rounded-xl text-xs font-bold text-center border transition-all duration-200 ${isSelected
                          ? 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-500/30 ring-2 ring-blue-400/50'
                          : seat.isDead
                            ? 'bg-slate-900/40 border-slate-800 text-slate-600 line-through opacity-60'
                            : 'bg-emerald-900/40 border-emerald-800/50 text-emerald-100 hover:bg-emerald-800/60 hover:border-emerald-700 shadow-sm'
                          }`}
                        title={seat.isDead ? '已死亡（仍可选择）' : undefined}
                      >
                        {seat.id + 1}<span className="text-[10px] opacity-60 font-normal">#</span> {seat.role.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Reorganized Section: Role Description (角色说明) */}
        {(scriptText || guidancePoints.length > 0 || currentActorRoleName) && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2 mb-2 ml-1">
              <span className="w-1.5 h-6 bg-blue-500 rounded-full" />
              角色说明
            </h3>

            {/* 运作方式 - Standardized Card Style */}
            {roleDoc?.operation && (
              <div className="bg-slate-800/40 rounded-2xl border border-white/5 p-5 hover:bg-slate-800/60 transition shadow-lg group">
                <div className="text-[13px] font-bold uppercase tracking-widest text-blue-400 mb-3 group-hover:text-blue-300 transition">运作方式</div>
                <div className="text-[15px] text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {roleDoc.operation}
                </div>
              </div>
            )}

            {/* 范例 */}
            {roleDoc?.examples && roleDoc.examples.length > 0 && (
              <div className="bg-slate-800/40 rounded-2xl border border-white/5 p-5 hover:bg-slate-800/60 transition shadow-lg group">
                <div className="text-[13px] font-bold uppercase tracking-widest text-emerald-400 mb-3 group-hover:text-emerald-300 transition">范例</div>
                <div className="space-y-3">
                  {roleDoc.examples.map((example, index) => (
                    <div key={index} className="text-[14px] text-slate-300 whitespace-pre-wrap leading-relaxed p-3 bg-white/5 rounded-xl border border-white/5 font-light">
                      {example}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 规则细节 */}
            {roleDoc?.rulesDetails && (
              <div className="bg-slate-800/40 rounded-2xl border border-white/5 p-5 hover:bg-slate-800/60 transition shadow-lg group">
                <div className="text-[13px] font-bold uppercase tracking-widest text-amber-400 mb-3 group-hover:text-amber-300 transition">规则细节</div>
                <div className="text-[14px] text-slate-200 whitespace-pre-wrap leading-relaxed font-light">
                  {roleDoc.rulesDetails}
                </div>
              </div>
            )}

            {/* 提示标记 */}
            {roleDoc?.prompts && (
              <div className="bg-slate-800/40 rounded-2xl border border-white/5 p-5 hover:bg-slate-800/60 transition shadow-lg group">
                <div className="text-[13px] font-bold uppercase tracking-widest text-purple-400 mb-3 group-hover:text-purple-300 transition">提示标记</div>
                <div className="text-[14px] text-slate-200 whitespace-pre-wrap leading-relaxed font-light">
                  {roleDoc.prompts}
                </div>
              </div>
            )}

            {/* 角色特性 */}
            {currentActorRoleName && roleDoc?.traits && roleDoc.traits.length > 0 && (
              <div className="bg-slate-800/40 rounded-2xl border border-white/5 p-5 hover:bg-slate-800/60 transition shadow-lg group">
                <div className="text-[13px] font-bold uppercase tracking-widest text-cyan-400 mb-3 group-hover:text-cyan-300 transition">特性</div>
                <div className="text-[14px] text-slate-300 font-medium">
                  {roleDoc.traits.join(" / ")}
                </div>
              </div>
            )}

            {/* 其他提示 (filteredGuidancePoints) */}
            {filteredGuidancePoints.length > 0 && (
              <div className="bg-slate-800/40 rounded-2xl border border-white/5 p-5 hover:bg-slate-800/60 transition shadow-lg group">
                <div className="text-[13px] font-bold uppercase tracking-widest text-slate-400 mb-3 group-hover:text-slate-300 transition">其他提示</div>
                <div className="space-y-2">
                  {filteredGuidancePoints.map((point, index) => (
                    <div key={index} className="flex items-start gap-3 text-[14px] text-slate-300">
                      <span className="text-slate-500 mt-1.5 w-1.5 h-1.5 rounded-full bg-slate-500 shrink-0" />
                      <span className="leading-relaxed">{point}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
                          // TODO: 未来可做成专门的日间交互弹窗。当前统一走规则引导 + 简单确认。
                          if (confirm(`确定使用 ${seat.role?.dayMeta?.abilityName || '技能'} 吗？`)) {
                            handleDayAbility(seat.id);
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

        {/* intentionally removed: right-side navigation/progress indicators */}
      </div>

      {/* Zone C: Action Footer */}
      {(primaryAction || secondaryActions.length > 0) && (
        <div className="shrink-0 border-t border-white/10 bg-slate-800/50 px-6 py-5 space-y-3">
          {primaryAction && (
            <button
              onClick={() => {
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
              className={`w-full h-16 rounded-xl text-xl font-bold shadow-lg transition ${getActionVariantClass(primaryAction.variant)
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
                  onClick={() => {
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
                  className={`flex-1 h-14 rounded-lg text-base font-semibold bg-slate-700 hover:bg-slate-600 text-slate-200 transition ${action.disabled ? 'opacity-50 cursor-not-allowed' : 'active:scale-95'
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
});


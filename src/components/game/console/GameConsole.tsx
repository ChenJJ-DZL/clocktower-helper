"use client";

import React from "react";
import type { GamePhase, Seat } from "../../../../app/data";
import { useTheme } from "../../../contexts/ThemeContext";
import { getRoleDefinition } from "../../../roles";
import type { NightInfoResult } from "../../../types/game";
import { showAlert, showConfirm } from "../../../utils/nativeDialogShim";
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
  extraAction?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    variant?: "primary" | "success" | "warning" | "danger" | "info";
  };
  primaryAction?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    variant?: "primary" | "success" | "warning" | "danger" | "info";
  };
  secondaryActions?: Array<{
    label: string;
    onClick: () => void;
    disabled?: boolean;
  }>;

  // Day Abilities Panel (for Day phase)
  handleDayAbility?: (sourceSeatId: number, targetSeatId?: number) => void;
  handleViewDayAbilityResult?: (sourceSeatId: number) => void;

  // Force continue callback (for empty queue scenarios)
  onForceContinue?: () => void;

  // Refresh current night step info (re-randomize prepared content)
  onRefreshNightStep?: () => void;

  // Seat patch updater
  onUpdateSeat?: (
    seatId: number,
    patch: Partial<Seat> & Record<string, any>
  ) => void;
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
  totalSteps,
  onToggleGrimoire,
  scriptText,
  guidancePoints = [],
  selectedPlayers = [],
  seats = [],
  nightInfo,
  onTogglePlayer,
  inspectionResult,
  extraAction,
  primaryAction,
  secondaryActions = [],
  handleDayAbility,
  handleViewDayAbilityResult,
  onForceContinue,
  onRefreshNightStep,
  onUpdateSeat,
}: GameConsoleProps) {
  const getPhaseLabel = () => {
    switch (gamePhase) {
      case "setup":
        return "准备阶段";
      case "check":
        return "核对身份";
      case "firstNight":
        return "首夜";
      case "night":
        return `第 ${nightCount} 夜`;
      case "day":
        return `第 ${nightCount} 天`;
      case "dusk":
        return "黄昏";
      case "dawnReport":
        return "天亮结算";
      case "gameOver":
        return "游戏结束";
      default:
        return gamePhase;
    }
  };

  const getPhaseColor = () => {
    switch (gamePhase) {
      case "setup":
        return "bg-slate-600";
      case "check":
        return "bg-blue-600";
      case "firstNight":
      case "night":
        return "bg-purple-600";
      case "day":
        return "bg-cyan-600";
      case "dusk":
        return "bg-orange-600";
      case "dawnReport":
        return "bg-yellow-600";
      case "gameOver":
        return "bg-red-600";
      default:
        return "bg-gray-600";
    }
  };

  const getActionVariantClass = (variant: string = "primary") => {
    switch (variant) {
      case "info":
        return "btn-arcane-info bg-blue-600 hover:bg-blue-500 text-white border-2 border-sky-300";
      case "success":
        return "btn-arcane-primary bg-amber-600 hover:bg-amber-500 text-white border-2 border-amber-300";
      case "warning":
        return "bg-amber-500 hover:bg-amber-400 text-white";
      case "danger":
        return "bg-red-500 hover:bg-red-400 text-white";
      default:
        return "btn-arcane-primary bg-amber-600 hover:bg-amber-500 text-white border-2 border-amber-300";
    }
  };

  const isNightPhase = gamePhase === "firstNight" || gamePhase === "night";
  // 手风琴折叠状态：Modern 默认折叠，Classic 默认展开（零迁移成本）
  const { theme } = useTheme();
  const [roleDocExpanded, setRoleDocExpanded] = React.useState(
    theme === "classic"
  );
  React.useEffect(() => {
    setRoleDocExpanded(theme === "classic");
  }, [theme]);
  const isActorCharade =
    nightInfo?.seat?.role?.id === "drunk" ||
    nightInfo?.seat?.role?.id === "marionette";
  const currentActorRoleName = isActorCharade
    ? nightInfo?.seat?.charadeRole?.name || nightInfo?.seat?.role?.name
    : nightInfo?.seat?.role?.name;
  const currentActorSeat = nightInfo?.seat;

  const currentActorAbilityText =
    (isActorCharade
      ? nightInfo?.seat?.charadeRole?.ability || nightInfo?.seat?.role?.ability
      : nightInfo?.seat?.role?.ability) || undefined;

  const isDisturbed =
    currentActorSeat?.isDrunk ||
    currentActorSeat?.isPoisoned ||
    nightInfo?.isPoisoned ||
    currentActorSeat?.role?.id === "drunk" ||
    currentActorSeat?.role?.id === "lunatic" ||
    currentActorSeat?.role?.id === "marionette";

  // Optimize: Memoize roleDoc lookup
  const roleDoc = React.useMemo(() => {
    return currentActorRoleName
      ? getRoleDocSummary(currentActorRoleName)
      : null;
  }, [currentActorRoleName]);

  // Debug logging for role documentation
  React.useEffect(() => {
    if (currentActorRoleName && roleDoc) {
      console.log(`[RoleDoc] ${currentActorRoleName}:`, {
        hasOperation: !!roleDoc.operation,
        operationLength: roleDoc.operation?.length || 0,
        hasRulesDetails: !!roleDoc.rulesDetails,
        examplesCount: roleDoc.examples?.length || 0,
      });
    }
  }, [currentActorRoleName, roleDoc]);

  const normalizeQuoted = React.useCallback((s: string) => {
    const t = (s || "").trim();
    if (!t) return "";
    // nightInfo.speak in many places is wrapped in quotes like '"...内容..."'
    // Also remove trailing periods/commas because we add them in the actionText template
    return t
      .replace(/^['"]+/, "")
      .replace(/['"]+$/, "")
      .replace(/[。.，,]+$/, "");
  }, []);

  // 直接使用 nightInfo.guide 作为行动文案（来自 dialog.wake，格式如"唤醒X号【角色名】，告诉他..."）
  // 每个夜间角色必定有完整的 guide 文案，不应出现空值
  const storytellerInstruction = React.useMemo(() => {
    if (
      !isNightPhase ||
      !currentActorSeat ||
      !currentActorRoleName ||
      !nightInfo
    )
      return null;

    const guideText = (nightInfo.guide || "").trim();
    return {
      headline:
        guideText ||
        `唤醒 ${currentActorSeat.id + 1} 号【${currentActorRoleName}】。`,
      actionText: guideText,
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
  const filteredGuidancePoints = guidancePoints.filter(
    (p) => !skillLikeGuidance.has((p || "").trim())
  );
  const isPoppyGrowerEvilInfo =
    seats.some((s) => s.role?.id === "poppy_grower") &&
    (nightInfo?.seat?.role?.id === "minion_info" ||
      nightInfo?.seat?.role?.id === "demon_info" ||
      nightInfo?.effectiveRole?.id === "minion_info" ||
      nightInfo?.effectiveRole?.id === "demon_info" ||
      nightInfo?.guide?.includes("邪恶互认") ||
      nightInfo?.guide?.includes("恶魔互认") ||
      nightInfo?.guide?.includes("爪牙互认")) &&
    nightCount > 1;

  return (
    <div className="h-full flex flex-col bg-slate-900 border-l border-white/10">
      {/* Zone A: Header (Status) */}
      <div className="shrink-0 h-14 border-b border-white/10 bg-slate-800/50 flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-3">
          <div
            data-testid="phase-label"
            className={`px-3 py-1 rounded-lg text-sm font-bold text-white whitespace-nowrap shadow-lg ${getPhaseColor()}`}
          >
            {getPhaseLabel()}
          </div>
        </div>
        {onToggleGrimoire && (
          <button
            onClick={onToggleGrimoire}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 bg-slate-700/50 hover:bg-slate-700 hover:text-white transition-all duration-200 border border-white/5 whitespace-nowrap"
          >
            查看手册
          </button>
        )}
      </div>

      {/* Zone B: Active Stage (Scrollable) */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6 min-h-0 bg-slate-900/50">
        {/* 🌀 涡流全局假信息提醒 */}
        {seats.some(
          (s) =>
            !s.isDead &&
            (s.role?.id === "vortox" ||
              (s.isDemonSuccessor && s.role?.id === "vortox"))
        ) && (
          <div className="rounded-xl border border-rose-500/60 bg-rose-950/40 p-3 shadow-lg flex items-center gap-2 text-rose-200 text-xs font-bold">
            <span className="text-base">🌀</span>
            <span>【涡流全局扭曲中】：所有存活镇民获取的信息必须为假！</span>
          </div>
        )}

        {/* ⚔️ 军团全局与夜间行动提示 */}
        {seats.some((s) => s.role?.id === "legion") && (
          <div className="rounded-xl border border-red-500/60 bg-red-950/40 p-3 shadow-lg text-red-200 text-xs font-medium space-y-1">
            <div className="flex items-center gap-2 font-bold text-red-300">
              <span className="text-base">⚔️</span>
              <span>【军团全局规则已激活】</span>
            </div>
            <div>
              •
              多数玩家为军团，豁免邪恶过半判定。仅有当所有军团均死亡时善良获胜。
            </div>
            <div>
              • 白天提名仅有邪恶玩家投票时，系统自动判定为 0 票，处决无效。
            </div>
            <div>
              •
              夜间由说书人决定哪位玩家死亡（建议每晚击杀军团以维持游戏平衡至最后一天）。
            </div>
          </div>
        )}

        {/* 🎪 提线木偶座次告警 */}
        {(() => {
          const marionetteSeat = seats.find((s) => s.role?.id === "marionette");
          const demonSeat = seats.find((s) => s.role?.type === "demon");
          if (marionetteSeat && demonSeat && seats.length > 2) {
            const diff = Math.abs(marionetteSeat.id - demonSeat.id);
            const isAdjacent = diff === 1 || diff === seats.length - 1;
            if (!isAdjacent) {
              return (
                <div className="rounded-xl border border-amber-500/60 bg-amber-950/40 p-3 text-amber-200 text-xs font-bold flex items-center gap-2">
                  <span className="text-base">⚠️</span>
                  <span>
                    提线木偶座次告警：{marionetteSeat.id + 1}
                    号提线木偶必须与恶魔（{demonSeat.id + 1}号）物理相邻！
                  </span>
                </div>
              );
            }
          }
          return null;
        })()}

        {/* 🌺 罂粟种植者死亡触发的邪恶互认步骤高亮卡片 */}
        {isPoppyGrowerEvilInfo && (
          <div className="rounded-2xl border-2 border-amber-500/80 bg-gradient-to-br from-purple-950/90 via-slate-900/90 to-amber-950/90 p-5 shadow-2xl shadow-amber-900/30">
            <div className="flex items-center gap-2.5 text-amber-300 font-extrabold text-base mb-2">
              <span className="text-xl">🌺</span>
              <span className="tracking-wide">
                【邪恶互认（罂粟种植者死亡触发）】
              </span>
            </div>
            <div className="text-sm text-amber-100/95 leading-relaxed font-medium bg-black/30 p-3 rounded-xl border border-amber-500/20">
              因罂粟种植者已死亡，今晚邪恶阵营（恶魔与爪牙）正式互相认识！请说书人根据下方提示依次唤醒恶魔与爪牙，告知同伴身份。
            </div>
          </div>
        )}

        {/* 🌀 疯子击杀指示（恶魔唤醒时显示） */}
        {(() => {
          const isDemon =
            currentActorSeat?.role?.type === "demon" ||
            nightInfo?.effectiveRole?.type === "demon" ||
            !!currentActorSeat?.isDemonSuccessor;
          const lunaticSeat = seats.find(
            (s) => s.role?.id === "lunatic" && !s.isDead
          );
          if (isDemon && lunaticSeat) {
            const lunaticTarget =
              (lunaticSeat as any).lunaticTarget ??
              (lunaticSeat as any).selectedTarget;
            if (lunaticTarget !== undefined && lunaticTarget !== null) {
              return (
                <div className="rounded-xl border border-purple-500/60 bg-purple-950/50 p-3 flex items-center justify-between shadow-lg">
                  <div className="text-xs text-purple-200">
                    <span className="font-extrabold text-purple-300">
                      🌀 疯子今晚选择了：
                    </span>
                    【{lunaticTarget + 1}号玩家】
                  </div>
                  {onTogglePlayer &&
                    !selectedPlayers.includes(lunaticTarget) && (
                      <button
                        type="button"
                        onClick={() => onTogglePlayer(lunaticTarget)}
                        className="px-3 py-1 bg-purple-700 hover:bg-purple-600 text-white rounded-lg text-xs font-bold shadow transition"
                      >
                        快捷同步
                      </button>
                    )}
                </div>
              );
            }
          }
          return null;
        })()}

        {/* 😈 军团统一唤醒与公式信息下发卡片 */}
        {isNightPhase &&
          (currentActorSeat?.role?.id === "legion" ||
            nightInfo?.effectiveRole?.id === "legion" ||
            currentActorRoleName?.includes("军团")) && (
            <div className="rounded-2xl border-2 border-red-500/80 bg-gradient-to-br from-red-950/90 via-slate-900/90 to-red-950/90 p-5 shadow-2xl shadow-red-950/40 space-y-3">
              <div className="flex items-center gap-2 text-red-300 font-extrabold text-base">
                <span className="text-xl">😈</span>
                <span className="tracking-wide">
                  【军团统一唤醒与公式信息下发】
                </span>
              </div>
              <div className="text-sm font-bold text-red-100 bg-black/40 p-3 rounded-xl border border-red-500/30">
                座位号：
                {seats
                  .filter((s) => s.role?.id === "legion" && !s.isDead)
                  .map((s) => `${s.id + 1}号`)
                  .join("、") || "无"}
              </div>
              <div className="text-xs text-red-200/90 leading-relaxed">
                说书人同时唤醒所有的军团玩家，军团玩家互认 / 由说书人决定 1
                名受害者或统一进行手势/眼神示意。
              </div>
            </div>
          )}

        {isNightPhase && currentActorSeat && currentActorRoleName && (
          <div className="rounded-2xl border border-emerald-400/40 bg-emerald-950/30 px-5 py-4 shadow-xl shadow-emerald-900/10 backdrop-blur-sm">
            <div className="text-[13px] font-bold uppercase tracking-wider text-emerald-400/80 mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                当前的行动
              </div>
              {onRefreshNightStep && (
                <button
                  type="button"
                  onClick={onRefreshNightStep}
                  title="刷新说书人提前准备好的内容"
                  className="p-1.5 rounded-md bg-emerald-900/40 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-800/60 hover:text-emerald-100 transition"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                </button>
              )}
            </div>

            <div className="text-[17px] text-emerald-50 leading-relaxed font-medium">
              {/* Formatted Action instruction */}
              <div className="flex flex-col gap-2">
                <div>
                  <div className="active-character-instruction">
                    <span
                      className={`inline-block font-bold tracking-wide px-2 py-0.5 rounded-md mr-1 ${
                        isDisturbed
                          ? "text-red-100 bg-red-900/50"
                          : "text-emerald-100 bg-emerald-800/40"
                      }`}
                    >
                      {isDisturbed ? "行动（受干扰）" : "行动"}
                    </span>
                    {storytellerInstruction?.actionText ? (
                      <span>{storytellerInstruction.actionText}</span>
                    ) : (
                      <span>
                        唤醒 {currentActorSeat.id + 1} 号【
                        <span className="active-character-name">
                          {currentActorRoleName}
                        </span>
                        】。
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 🔧 守鸦人查验结果展示（legacy 路径使用 inspectionResult） */}
            {inspectionResult && (
              <div className="mt-5 pt-4 border-t border-amber-500/30">
                <div className="rounded-xl bg-amber-950/40 border border-amber-600/40 px-4 py-3">
                  <div className="text-xs font-bold uppercase tracking-widest text-amber-400/80 mb-1">
                    🔍 查验结果
                  </div>
                  <div className="text-base text-amber-100 font-medium">
                    {inspectionResult}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Section 1 (白天讨论阶段): 阵营快捷调整 (聚合所有在场且有阵营判定的角色) */}
        {gamePhase === "day" &&
          (() => {
            const alignmentSeats = seats.filter(
              (s) =>
                !s.isDead &&
                (s.role?.id === "recluse" ||
                  s.role?.id === "spy" ||
                  s.role?.id === "politician" ||
                  s.role?.id === "goon" ||
                  s.role?.id === "ogre" ||
                  s.isEvilConverted ||
                  s.isGoodConverted)
            );

            if (alignmentSeats.length === 0) return null;

            return (
              <div className="bg-purple-950/40 p-5 rounded-2xl border border-purple-500/30 space-y-3">
                <h3 className="text-purple-200 font-bold text-base flex items-center gap-2">
                  <span>🎭</span> 阵营快捷调整 (白天实时生效)
                </h3>
                <p className="text-xs text-purple-300/80">
                  官方规则：部分角色拥有阵营注册或阵营转变特性。可在此快速调整说书人裁定状态。
                </p>
                <div className="space-y-2.5">
                  {alignmentSeats.map((seat) => {
                    const roleId = seat.role?.id;
                    const isRecluse = roleId === "recluse";
                    const isSpy = roleId === "spy";

                    let isEvil = false;
                    let label = "";

                    if (isRecluse) {
                      isEvil =
                        (seat as any).registerAsEvil !== false &&
                        (seat as any).registerAsDemon !== false;
                      label = isEvil
                        ? "😈 邪恶 (爪牙/恶魔)"
                        : "😇 善良 (外来者)";
                    } else if (isSpy) {
                      const isGood =
                        (seat as any).registerAsGood !== false &&
                        (seat as any).registerAsEvil !== true;
                      isEvil = !isGood;
                      label = isGood
                        ? "😇 善良 (镇民/外来者)"
                        : "😈 邪恶 (爪牙)";
                    } else {
                      isEvil =
                        !!seat.isEvilConverted ||
                        (!seat.isGoodConverted &&
                          (seat.role?.type === "minion" ||
                            seat.role?.type === "demon"));
                      label = isEvil ? "😈 邪恶" : "😇 善良";
                    }

                    return (
                      <div
                        key={seat.id}
                        className="flex items-center justify-between bg-black/40 p-3 rounded-xl border border-purple-500/20"
                      >
                        <div>
                          <span className="text-sm font-bold text-white">
                            {seat.id + 1}号 - {seat.role?.name || "未知角色"}
                          </span>
                          <span className="ml-2 text-xs text-slate-400">
                            当前注册为:{" "}
                            <strong
                              className={
                                isEvil ? "text-red-400" : "text-emerald-400"
                              }
                            >
                              {label}
                            </strong>
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              let patch: any = {};
                              if (isRecluse) {
                                patch = {
                                  registerAsEvil: false,
                                  registerAsDemon: false,
                                  registerAsMinion: false,
                                };
                              } else if (isSpy) {
                                patch = {
                                  registerAsGood: true,
                                  registerAsEvil: false,
                                  registerAsTownsfolk: true,
                                };
                              } else {
                                patch = {
                                  isEvilConverted: false,
                                  isGoodConverted: true,
                                  registerAsEvil: false,
                                  registerAsGood: true,
                                };
                              }
                              Object.assign(seat, patch);
                              onUpdateSeat?.(seat.id, patch);
                            }}
                            className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors border ${
                              !isEvil
                                ? "bg-emerald-600 border-emerald-400 text-white"
                                : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white"
                            }`}
                          >
                            {isSpy ? "善良(镇民/外来者)" : "善良"}
                          </button>
                          <button
                            onClick={() => {
                              let patch: any = {};
                              if (isRecluse) {
                                patch = {
                                  registerAsEvil: true,
                                  registerAsDemon: true,
                                  registerAsMinion: true,
                                };
                              } else if (isSpy) {
                                patch = {
                                  registerAsGood: false,
                                  registerAsEvil: true,
                                  registerAsTownsfolk: false,
                                };
                              } else {
                                patch = {
                                  isEvilConverted: true,
                                  isGoodConverted: false,
                                  registerAsEvil: true,
                                  registerAsGood: false,
                                };
                              }
                              Object.assign(seat, patch);
                              onUpdateSeat?.(seat.id, patch);
                            }}
                            className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors border ${
                              isEvil
                                ? "bg-red-600 border-red-400 text-white"
                                : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white"
                            }`}
                          >
                            {isRecluse ? "邪恶(爪牙/恶魔)" : "邪恶"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

        {/* Section 2 (白天讨论阶段): 可用主动技能 (聚合所有在场的主动技能角色) */}
        {gamePhase === "day" &&
          handleDayAbility &&
          (() => {
            // 包含所有具备白天主动技能的座位（无论是否已使用）
            const dayAbilitySeats = seats.filter((s) => {
              if (!s.role) return false;

              const isCharade =
                s.role?.id === "drunk" || s.role?.id === "marionette";
              const effectiveRole = isCharade
                ? s.charadeRole || s.role
                : s.role;
              if (!effectiveRole) return false;

              // Check legacy dayMeta
              if (effectiveRole.dayMeta) return true;

              // Check modular day ability
              const def = effectiveRole?.id
                ? getRoleDefinition(effectiveRole.id)
                : undefined;
              if (def?.day) return true;

              return false;
            });

            if (dayAbilitySeats.length === 0) return null;

            return (
              <div className="bg-slate-800/50 p-6 rounded-2xl border border-white/5">
                <h3 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
                  <span>⚡️</span> 可用主动技能
                </h3>

                <div className="space-y-3">
                  {dayAbilitySeats.map((seat) => {
                    const isCharade =
                      seat.role?.id === "drunk" ||
                      seat.role?.id === "marionette";
                    const effectiveRole = isCharade
                      ? seat.charadeRole || seat.role
                      : seat.role;
                    const def = effectiveRole?.id
                      ? getRoleDefinition(effectiveRole.id)
                      : undefined;
                    const abilityName =
                      def?.day?.name ||
                      effectiveRole?.dayMeta?.abilityName ||
                      "技能";
                    const displayRoleName =
                      isCharade && seat.charadeRole
                        ? seat.charadeRole.name
                        : seat.role?.name || "";

                    const isInfinite = def?.day?.maxUses === "infinity";
                    const isUsed =
                      !isInfinite &&
                      (seat.hasUsedDayAbility ||
                        (effectiveRole?.id === "slayer" &&
                          seat.hasUsedSlayerAbility));

                    return (
                      <div
                        key={seat.id}
                        className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                          isUsed
                            ? "bg-slate-900/60 border-white/5 opacity-85"
                            : "bg-slate-900 border-white/10"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`font-bold ${
                              isUsed ? "text-amber-500/70" : "text-amber-500"
                            }`}
                          >
                            {seat.id + 1}号
                          </span>
                          <span
                            className={isUsed ? "text-slate-300" : "text-white"}
                          >
                            {displayRoleName}
                            {seat.role?.id === "drunk" && (
                              <span className="ml-1.5 text-xs text-purple-400 font-normal">
                                (酒鬼)
                              </span>
                            )}
                            {seat.isDead && (
                              <span className="ml-1.5 text-xs text-red-400 font-normal">
                                (已死亡)
                              </span>
                            )}
                          </span>
                        </div>

                        {isUsed ? (
                          <button
                            onClick={() => {
                              if (handleViewDayAbilityResult) {
                                handleViewDayAbilityResult(seat.id);
                              } else if (handleDayAbility) {
                                handleDayAbility(seat.id);
                              }
                            }}
                            title="点击再次查看使用结果"
                            data-testid="view-day-ability-result-button"
                            className="px-3 py-1 bg-slate-700/80 hover:bg-slate-600 active:bg-slate-700 text-slate-300 hover:text-white text-sm rounded shadow-sm border border-slate-600 transition-colors flex items-center gap-1.5 cursor-pointer"
                          >
                            <span>已使用</span>
                            <span className="text-xs text-slate-400">🔍</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              if (!handleDayAbility) return;
                              showConfirm({
                                title: "使用技能",
                                message: `确定使用 ${abilityName} 吗？`,
                                onConfirm: () => handleDayAbility(seat.id),
                              });
                            }}
                            data-testid="start-day-ability-button"
                            className="px-3 py-1 bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white text-sm rounded shadow-sm transition-colors cursor-pointer"
                          >
                            使用 {displayRoleName}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

        {/* Section 3: Storyteller Tips (说书人Tips) - 极简手风琴，Modern 主题默认折叠 */}
        {(scriptText || guidancePoints.length > 0 || currentActorRoleName) && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setRoleDocExpanded((v) => !v)}
              className="w-full flex items-center justify-between group"
            >
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2 mb-2 ml-1">
                <span className="w-1.5 h-6 bg-blue-500 rounded-full" />
                说书人Tips
              </h3>
              <span
                className={`text-xs px-2.5 py-1 rounded-full border transition-all duration-200 whitespace-nowrap ${
                  roleDocExpanded
                    ? "bg-blue-900/40 border-blue-600/40 text-blue-200"
                    : "bg-slate-800/60 border-white/10 text-slate-400 group-hover:text-slate-200 group-hover:border-white/20"
                }`}
              >
                {roleDocExpanded ? "📕 收起说明" : "📖 查看完整规则 Wiki"}
              </span>
            </button>

            {/* 手风琴折叠体 */}
            <div
              className={`grid transition-all duration-300 ease-out ${roleDocExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"} ${roleDocExpanded ? "" : "pointer-events-none select-none overflow-hidden"}`}
            >
              {/* 运作方式 - Standardized Card Style */}
              {roleDoc?.operation && (
                <div className="bg-slate-800/40 rounded-2xl border border-white/5 p-5 hover:bg-slate-800/60 transition shadow-lg group">
                  <div className="text-[13px] font-bold uppercase tracking-widest text-blue-400 mb-3 group-hover:text-blue-300 transition">
                    运作方式
                  </div>
                  <div className="text-[15px] text-slate-200 whitespace-pre-wrap leading-relaxed">
                    {roleDoc.operation}
                  </div>
                </div>
              )}

              {/* 范例 */}
              {roleDoc?.examples && roleDoc.examples.length > 0 && (
                <div className="bg-slate-800/40 rounded-2xl border border-white/5 p-5 hover:bg-slate-800/60 transition shadow-lg group">
                  <div className="text-[13px] font-bold uppercase tracking-widest text-emerald-400 mb-3 group-hover:text-emerald-300 transition">
                    范例
                  </div>
                  <div className="space-y-3">
                    {roleDoc.examples.map((example, index) => {
                      const exampleKey = `example-${index}-${example.substring(0, 20).replace(/\s+/g, "-")}`;
                      return (
                        <div
                          key={exampleKey}
                          className="text-[14px] text-slate-300 whitespace-pre-wrap leading-relaxed p-3 bg-white/5 rounded-xl border border-white/5 font-light"
                        >
                          {example}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 规则细节 */}
              {roleDoc?.rulesDetails && (
                <div className="bg-slate-800/40 rounded-2xl border border-white/5 p-5 hover:bg-slate-800/60 transition shadow-lg group">
                  <div className="text-[13px] font-bold uppercase tracking-widest text-amber-400 mb-3 group-hover:text-amber-300 transition">
                    规则细节
                  </div>
                  <div className="text-[14px] text-slate-200 whitespace-pre-wrap leading-relaxed font-light">
                    {roleDoc.rulesDetails}
                  </div>
                </div>
              )}

              {/* 提示标记 */}
              {roleDoc?.prompts && (
                <div className="bg-slate-800/40 rounded-2xl border border-white/5 p-5 hover:bg-slate-800/60 transition shadow-lg group">
                  <div className="text-[13px] font-bold uppercase tracking-widest text-purple-400 mb-3 group-hover:text-purple-300 transition">
                    提示标记
                  </div>
                  <div className="text-[14px] text-slate-200 whitespace-pre-wrap leading-relaxed font-light">
                    {roleDoc.prompts}
                  </div>
                </div>
              )}

              {/* 角色特性 */}
              {currentActorRoleName &&
                roleDoc?.traits &&
                roleDoc.traits.length > 0 && (
                  <div className="bg-slate-800/40 rounded-2xl border border-white/5 p-5 hover:bg-slate-800/60 transition shadow-lg group">
                    <div className="text-[13px] font-bold uppercase tracking-widest text-cyan-400 mb-3 group-hover:text-cyan-300 transition">
                      特性
                    </div>
                    <div className="text-[14px] text-slate-300 font-medium">
                      {roleDoc.traits.join(" / ")}
                    </div>
                  </div>
                )}

              {/* 其他提示 (filteredGuidancePoints) */}
              {filteredGuidancePoints.length > 0 && (
                <div className="bg-slate-800/40 rounded-2xl border border-white/5 p-5 hover:bg-slate-800/60 transition shadow-lg group">
                  <div className="text-[13px] font-bold uppercase tracking-widest text-slate-400 mb-3 group-hover:text-slate-300 transition">
                    其他提示
                  </div>
                  <div className="space-y-2">
                    {filteredGuidancePoints.map((point, index) => {
                      const pointKey = `guidance-${index}-${point.substring(0, 20).replace(/\s+/g, "-")}`;
                      return (
                        <div
                          key={pointKey}
                          className="flex items-start gap-3 text-[14px] text-slate-300"
                        >
                          <span className="text-slate-500 mt-1.5 w-1.5 h-1.5 rounded-full bg-slate-500 shrink-0" />
                          <span className="leading-relaxed">{point}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error state when script is empty - only show if actually in night phase */}
        {totalSteps === 0 &&
          (gamePhase === "firstNight" || gamePhase === "night") && (
            <div className="space-y-3">
              <div className="text-sm font-semibold text-amber-400 uppercase tracking-wide">
                ⚠️ 提示
              </div>
              <div className="bg-amber-900/30 rounded-xl p-5 border border-amber-700/50 text-base text-amber-200">
                <div className="mb-2">当前没有需要唤醒的角色。可能原因：</div>
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
                  console.log("[Manual Override] 手动继续到天亮阶段");
                  if (primaryAction) {
                    primaryAction.onClick();
                  } else if (onForceContinue) {
                    // 使用备用回调
                    onForceContinue();
                  } else {
                    console.warn(
                      "[Manual Override] primaryAction 和 onForceContinue 都不存在"
                    );
                    showAlert("无法继续：请刷新页面重试");
                  }
                }}
                className="w-full py-3 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-base transition-colors"
              >
                🌞 直接进入天亮阶段
              </button>
            </div>
          )}

        {/* Placeholder when no content but script exists */}
        {!scriptText &&
          guidancePoints.length === 0 &&
          selectedPlayers.length === 0 &&
          totalSteps !== 0 && (
            <div className="flex items-center justify-center h-full text-slate-500 text-base">
              等待指令...
            </div>
          )}

        {/* intentionally removed: right-side navigation/progress indicators */}
      </div>

      {/* Zone C: Action Footer */}
      {(extraAction || primaryAction || secondaryActions.length > 0) && (
        <div className="shrink-0 sticky bottom-0 z-30 border-t border-white/10 bg-slate-900/95 backdrop-blur-md px-6 py-4 space-y-3 shadow-2xl">
          {extraAction && (
            <button
              onClick={() => {
                console.log("[GameConsole] Extra action clicked", {
                  label: extraAction.label,
                  disabled: extraAction.disabled,
                  variant: extraAction.variant,
                });
                if (!extraAction.disabled) {
                  try {
                    extraAction.onClick();
                  } catch (error) {
                    console.error(
                      "[GameConsole] Error in extra action:",
                      error
                    );
                    showAlert(
                      `操作失败: ${error instanceof Error ? error.message : "未知错误"}`
                    );
                  }
                } else {
                  console.warn("[GameConsole] Extra action is disabled");
                }
              }}
              disabled={extraAction.disabled}
              className={`btn-arcane-info w-full h-16 rounded-xl text-xl font-bold shadow-lg transition flex items-center justify-center gap-2 ${getActionVariantClass(
                extraAction.variant || "info"
              )} ${extraAction.disabled ? "opacity-50 cursor-not-allowed" : "active:scale-95 cursor-pointer"}`}
            >
              {extraAction.label}
            </button>
          )}
          {primaryAction && (
            <button
              onClick={() => {
                console.log("[GameConsole] Primary action clicked", {
                  label: primaryAction.label,
                  disabled: primaryAction.disabled,
                  variant: primaryAction.variant,
                });
                if (!primaryAction.disabled) {
                  try {
                    primaryAction.onClick();
                  } catch (error) {
                    console.error(
                      "[GameConsole] Error in primary action:",
                      error
                    );
                    showAlert(
                      `操作失败: ${error instanceof Error ? error.message : "未知错误"}`
                    );
                  }
                } else {
                  console.warn("[GameConsole] Primary action is disabled");
                }
              }}
              disabled={primaryAction.disabled}
              className={`btn-arcane-primary w-full h-16 rounded-xl text-xl font-bold shadow-lg transition ${getActionVariantClass(
                primaryAction.variant
              )} ${primaryAction.disabled ? "opacity-50 cursor-not-allowed" : "active:scale-95"}`}
            >
              {primaryAction.label}
            </button>
          )}
          {secondaryActions.length > 0 && (
            <div className="flex gap-3">
              {secondaryActions.map((action, index) => {
                const actionKey = `secondary-action-${index}-${action.label.substring(0, 20).replace(/\s+/g, "-")}`;
                return (
                  <button
                    key={actionKey}
                    onClick={() => {
                      console.log("[GameConsole] Secondary action clicked", {
                        index,
                        label: action.label,
                        disabled: action.disabled,
                      });
                      if (!action.disabled) {
                        try {
                          action.onClick();
                        } catch (error) {
                          console.error(
                            "[GameConsole] Error in secondary action:",
                            error
                          );
                          showAlert(
                            `操作失败: ${error instanceof Error ? error.message : "未知错误"}`
                          );
                        }
                      }
                    }}
                    disabled={action.disabled}
                    className={`flex-1 h-14 rounded-lg text-base font-semibold bg-slate-700 hover:bg-slate-600 text-slate-200 transition ${
                      action.disabled
                        ? "opacity-50 cursor-not-allowed"
                        : "active:scale-95"
                    }`}
                  >
                    {action.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

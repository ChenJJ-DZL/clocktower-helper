"use client";

import { motion } from "framer-motion";
import type React from "react";
import { useMemo } from "react";
import { useGameActions } from "../contexts/GameActionsContext";
import { useSeatView } from "../hooks/useSeatView";
import type { SeatNodeProps } from "./SeatNode.types"; // We should extract props too
import { useGrimoireTooltip } from "./tooltip/GrimoireTooltip";

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
    red: "bg-red-900/90 text-red-100 border-red-600 shadow-red-900/40",
    green:
      "bg-emerald-900/90 text-emerald-100 border-emerald-600 shadow-emerald-900/40",
    yellow:
      "bg-amber-900/90 text-amber-100 border-amber-600 shadow-amber-900/40",
  };

  const sizeClass = isPortrait
    ? "text-[9px] px-1.5 py-0.5"
    : "text-[11px] px-2 py-0.5";
  const iconSize = isPortrait ? "w-2.5 h-2.5" : "w-3 h-3";
  const durationSize = isPortrait ? "text-[7px]" : "text-[9px]";

  return (
    <div
      className={`flex items-center gap-1.5 ${sizeClass} rounded-md border shadow-md font-bold whitespace-nowrap backdrop-blur-md ${colorClasses[color]}`}
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
    gamePhase,
    nominationRecords,
    nominator = null,
    nominee = null,
    seatNote,
    reminderTokens = [],
    isDraggable = false,
    isBeingDragged = false,
    isSwapTarget = false,
    onSeatDragStart,
    onSeatDrag,
    onSeatDragEnd,
  } = props;

  const ctx = useGameActions();

  const hasNominated =
    gamePhase === "dusk" &&
    nominationRecords?.nominators &&
    (nominationRecords.nominators instanceof Set
      ? nominationRecords.nominators.has(s.id)
      : Array.isArray(nominationRecords.nominators)
        ? (nominationRecords.nominators as number[]).includes(s.id)
        : false);

  const hasBeenNominated =
    gamePhase === "dusk" &&
    nominationRecords?.nominees &&
    (nominationRecords.nominees instanceof Set
      ? nominationRecords.nominees.has(s.id)
      : Array.isArray(nominationRecords.nominees)
        ? (nominationRecords.nominees as number[]).includes(s.id)
        : false);

  const {
    colorClass,
    roleName,
    isMasked,
    statusList,
    isValidTarget,
    containerStyle,
    realRole,
    displayRole,
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

  // 悬浮注解：角色全称 + 阵营 + 一句话能力 + 当前状态标记
  const tooltipData = useMemo(() => {
    const role = displayRole || realRole;
    if (!role) return null;
    return {
      title: roleName === "空" ? role.name : roleName,
      factionType: role.type ?? getDisplayRoleType(s) ?? undefined,
      ability: (role as { ability?: string }).ability || undefined,
      statuses: statusList.length
        ? statusList.map((st) => `${st.icon ?? ""}${st.text}`.trim())
        : undefined,
    };
  }, [displayRole, realRole, roleName, statusList, s, getDisplayRoleType]);
  const tooltipBind = useGrimoireTooltip(tooltipData);

  return (
    <div
      key={s.id}
      onPointerDown={(e) => {
        if (isDraggable) {
          e.stopPropagation();
        }
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (isValidTarget) onSeatClick(s.id);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e, s.id);
      }}
      onTouchStart={(e) => {
        if (isDraggable) {
          e.stopPropagation();
          onSeatDragStart?.(s.id, e as any);
        } else if (isValidTarget) {
          onTouchStart(e, s.id);
        }
      }}
      onTouchEnd={(e) => {
        if (isValidTarget) onTouchEnd(e, s.id);
      }}
      onTouchMove={(e) => {
        if (isValidTarget) onTouchMove(e, s.id);
      }}
      style={containerStyle}
      className="absolute flex items-center justify-center seat-node pointer-events-auto"
      data-seat-id={s.id}
    >
      <motion.div
        {...tooltipBind}
        ref={(el) => {
          setSeatRef(s.id, el as HTMLDivElement | null);
        }}
        onPointerDown={(e) => {
          if (isDraggable && (e.button === 0 || e.button === -1)) {
            e.stopPropagation();
            onSeatDragStart?.(s.id, e as any);
          }
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (isValidTarget) onSeatClick(s.id);
        }}
        className={`seat-token relative w-full h-full rounded-full touch-none select-none ${isPortrait ? "border-2" : "border-4"} flex items-center justify-center cursor-pointer z-30 bg-gray-900 transition-colors duration-200
        ${colorClass}
        ${isBeingDragged ? "!opacity-35 !scale-95 !border-dashed !border-amber-400" : ""}
        ${isSwapTarget ? "!ring-[6px] !ring-emerald-400 !border-emerald-400 !scale-110 !shadow-[0_0_35px_rgba(52,211,153,0.9)] animate-pulse" : ""}
        ${getDisplayRoleType(s) === "townsfolk" ? "glow-townsfolk" : ""}
        ${getDisplayRoleType(s) === "outsider" ? "glow-outsider" : ""}
        ${getDisplayRoleType(s) === "minion" ? "glow-minion" : ""}
        ${getDisplayRoleType(s) === "demon" ? "glow-demon" : ""}
        ${nightInfo?.seat.id === s.id ? "!ring-[6px] !ring-yellow-300 !scale-125 !shadow-[0_0_50px_rgba(253,224,71,0.9)] !brightness-100 !grayscale-0 !bg-gray-900 !border-yellow-300" : ""}
        ${s.isDead && nightInfo?.seat.id !== s.id ? "dead-cracked grayscale brightness-75 bg-gray-300 border-gray-400" : ""}
        ${selectedActionTargets.includes(s.id) ? "ring-4 ring-green-500 scale-105" : ""}
        ${longPressingSeats.has(s.id) ? "ring-4 ring-blue-400 animate-pulse" : ""}
        ${nominator === s.id ? "ring-8 ring-white scale-110 shadow-[0_0_40px_rgba(255,255,255,0.8)] animate-pulse" : ""}
        ${nominee === s.id ? "ring-8 ring-yellow-400 scale-110 shadow-[0_0_40px_rgba(250,204,21,0.8)] animate-pulse" : ""}
        ${s.isCandidate ? "ring-4 ring-red-500 scale-105 shadow-[0_0_20px_red]" : ""}
      `}
      >
        {/* === VFX Layers === */}
        {s.isDead && nightInfo?.seat.id !== s.id && (
          <div className="dead-blood-mark absolute inset-0 rounded-full z-20 pointer-events-none"></div>
        )}
        {ctx.vfxTrigger?.seatId === s.id &&
          ctx.vfxTrigger?.type === "slayer" && (
            <div className="absolute inset-0 rounded-full bg-red-500 z-50 animate-vfx-particle shadow-[0_0_80px_red]"></div>
          )}
        {ctx.vfxTrigger?.seatId === s.id &&
          ctx.vfxTrigger?.type === "virgin" && (
            <div className="absolute inset-0 rounded-full bg-yellow-300 z-50 animate-vfx-particle shadow-[0_0_60px_yellow]"></div>
          )}

        {/* 当前行动玩家金色呼吸光环 */}
        {nightInfo?.seat.id === s.id && (
          <>
            <div
              className="absolute inset-0 rounded-full border-4 border-yellow-400/60 animate-ping opacity-40 pointer-events-none"
              style={{ animationDuration: "2s" }}
            ></div>
            <div className="absolute -inset-2 rounded-full border-2 border-yellow-300/50 animate-pulse pointer-events-none"></div>
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

        {/* 左上角：座位序号 + 提名状态标签 (被提在上，已提在下，整体高度与序号圆圈相同，红色与天敌标记格式一致) */}
        <div className="absolute left-[14.6%] top-[14.6%] -translate-x-1/2 -translate-y-1/2 flex items-center gap-1 z-30 pointer-events-none">
          {/* 序号圆圈 */}
          <div
            className={`${isPortrait ? "w-6 h-6 text-xs" : "w-9 h-9 text-lg"} rounded-full ${
              s.isDead
                ? "bg-gray-400 border-gray-500 text-gray-700"
                : "bg-slate-800 border-slate-600 text-white"
            } border-2 flex items-center justify-center font-bold shadow-md shrink-0`}
          >
            {s.id + 1}
          </div>

          {/* 提名标签容器：被提在上，已提在下，整体高度与序号圆圈相同 */}
          {(hasBeenNominated || hasNominated) && (
            <div
              className={`flex flex-col justify-between ${
                isPortrait ? "h-6 py-0.5" : "h-9 py-0.5"
              } shrink-0`}
            >
              {hasBeenNominated ? (
                <span
                  className={`flex items-center justify-center font-bold rounded ${
                    isPortrait
                      ? "text-[8px] px-1 h-[10px]"
                      : "text-[10px] px-1.5 h-[14px]"
                  } bg-red-900/90 text-red-100 border border-red-600 shadow-sm leading-none whitespace-nowrap`}
                  title="本黄昏已被提名过"
                >
                  被提
                </span>
              ) : (
                hasNominated && (
                  <div className={isPortrait ? "h-[10px]" : "h-[14px]"} />
                )
              )}
              {hasNominated ? (
                <span
                  className={`flex items-center justify-center font-bold rounded ${
                    isPortrait
                      ? "text-[8px] px-1 h-[10px]"
                      : "text-[10px] px-1.5 h-[14px]"
                  } bg-red-900/90 text-red-100 border border-red-600 shadow-sm leading-none whitespace-nowrap`}
                  title="本黄昏已发起过提名"
                >
                  已提
                </span>
              ) : (
                hasBeenNominated && (
                  <div className={isPortrait ? "h-[10px]" : "h-[14px]"} />
                )
              )}
            </div>
          )}
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

        {/* 右上角其他标签集合 (主人、实:角色、处决候选者等，以第一个标签为准相切圆环，左对齐从上到下并排显示) */}
        {(() => {
          const otherBadges: React.ReactNode[] = [];

          // 真实身份伪装
          if (isMasked) {
            otherBadges.push(
              <div
                key="badge-masked"
                className={`bg-purple-700 text-white ${
                  isPortrait
                    ? "text-[8px] px-1.5 py-0.5"
                    : "text-[10px] px-2 py-0.5"
                } rounded-full border border-white/80 shadow-md font-bold whitespace-nowrap leading-none backdrop-blur-md`}
              >
                实:{realRole?.name}
              </div>
            );
          }

          // 主人标记
          if (seats.some((seat) => seat.masterId === s.id)) {
            otherBadges.push(
              <div
                key="badge-master"
                className={`bg-purple-600 text-white ${
                  isPortrait
                    ? "text-[8px] px-1.5 py-0.5"
                    : "text-[10px] px-2 py-0.5"
                } rounded-full border border-purple-300 shadow-md font-bold whitespace-nowrap leading-none`}
              >
                主人
              </div>
            );
          }

          // 双子标记（镜像双子与对立双子）
          if (s.role?.id === "evil_twin") {
            otherBadges.push(
              <div
                key="badge-evil-twin"
                className={`bg-red-800 text-white ${
                  isPortrait
                    ? "text-[8px] px-1.5 py-0.5"
                    : "text-[10px] px-2 py-0.5"
                } rounded-full border border-red-400 shadow-md font-bold whitespace-nowrap leading-none`}
                title="镜像双子 (邪恶爪牙)"
              >
                😈 镜像双子
              </div>
            );
          } else {
            const hasEvilTwin = seats.some(
              (seat) => seat.role?.id === "evil_twin"
            );
            const isGoodTwin =
              hasEvilTwin &&
              (s.isGoodTwin ||
                (!seats.some((seat) => seat.isGoodTwin) &&
                  (() => {
                    const evilSeat = seats.find(
                      (seat) => seat.role?.id === "evil_twin"
                    );
                    if (!evilSeat) return false;
                    const defaultGoodSeat =
                      seats.find(
                        (other) =>
                          other.id !== evilSeat.id &&
                          (other.role?.type === "townsfolk" ||
                            other.role?.type === "outsider") &&
                          !other.isEvilConverted &&
                          !other.isDead
                      ) ||
                      seats.find(
                        (other) => other.id !== evilSeat.id && !other.isDead
                      );
                    return defaultGoodSeat?.id === s.id;
                  })()));

            if (isGoodTwin) {
              otherBadges.push(
                <div
                  key="badge-good-twin"
                  className={`bg-purple-700 text-white ${
                    isPortrait
                      ? "text-[8px] px-1.5 py-0.5"
                      : "text-[10px] px-2 py-0.5"
                  } rounded-full border border-purple-300 shadow-md font-bold whitespace-nowrap leading-none`}
                  title="对立双子 (若被处决邪恶直接获胜)"
                >
                  👥 对立双子
                </div>
              );
            }
          }

          // 邪恶阵营转换标记（如赏金猎人指定的邪恶镇民）
          if (s.isEvilConverted) {
            otherBadges.push(
              <div
                key="badge-evil-converted"
                className={`bg-red-700 text-white ${
                  isPortrait
                    ? "text-[8px] px-1.5 py-0.5"
                    : "text-[10px] px-2 py-0.5"
                } rounded-full border border-red-300 shadow-md font-bold whitespace-nowrap leading-none animate-pulse`}
                title="邪恶阵营（镇民伪装）"
              >
                邪恶
              </div>
            );
          }

          // 赏金已知标记
          if (
            s.statusDetails?.includes("赏金已知") ||
            (s as any).bountyHunterTarget
          ) {
            otherBadges.push(
              <div
                key="badge-bounty"
                className={`bg-amber-600 text-white ${
                  isPortrait
                    ? "text-[8px] px-1.5 py-0.5"
                    : "text-[10px] px-2 py-0.5"
                } rounded-full border border-amber-300 shadow-md font-bold whitespace-nowrap leading-none`}
                title="赏金猎人已知邪恶目标"
              >
                赏金已知
              </div>
            );
          }
          s.role?.id === "poppy_grower" && !s.isDead && (
            <div
              key="badge-poppy"
              className={`bg-rose-600 text-white ${
                isPortrait
                  ? "text-[8px] px-1.5 py-0.5"
                  : "text-[10px] px-2 py-0.5"
              } rounded-full border border-rose-300 shadow-md font-bold whitespace-nowrap leading-none`}
              title="罂粟迷雾：邪恶玩家互不相识"
            >
              🌺 罂粟迷雾
            </div>
          );

          // 图书目标标记
          if (
            s.statusDetails?.includes("图书目标") ||
            (s as any).librarianTarget
          ) {
            otherBadges.push(
              <div
                key="badge-librarian"
                className={`bg-blue-600 text-white ${
                  isPortrait
                    ? "text-[8px] px-1.5 py-0.5"
                    : "text-[10px] px-2 py-0.5"
                } rounded-full border border-blue-300 shadow-md font-bold whitespace-nowrap leading-none`}
                title="图书管理员得知目标"
              >
                图书目标
              </div>
            );
          }

          // 小精灵伪装与激活标记
          const pixieTarget = s.statusDetails?.find((st) =>
            st.startsWith("伪装身份:")
          );
          if (pixieTarget) {
            otherBadges.push(
              <div
                key="badge-pixie-target"
                className={`bg-pink-600 text-white ${
                  isPortrait
                    ? "text-[8px] px-1.5 py-0.5"
                    : "text-[10px] px-2 py-0.5"
                } rounded-full border border-pink-300 shadow-md font-bold whitespace-nowrap leading-none`}
              >
                {pixieTarget}
              </div>
            );
          }
          if (
            s.role?.id === "pixie" &&
            (s.hasAbilityEvenDead ||
              s.statusDetails?.includes("能力已激活") ||
              (s as any).pixieHasAbility)
          ) {
            otherBadges.push(
              <div
                key="badge-pixie-active"
                className={`bg-emerald-600 text-white ${
                  isPortrait
                    ? "text-[8px] px-1.5 py-0.5"
                    : "text-[10px] px-2 py-0.5"
                } rounded-full border border-emerald-300 shadow-md font-bold whitespace-nowrap leading-none animate-pulse`}
              >
                ⚡能力激活
              </div>
            );
          }

          // 洗脑师疯狂标记
          const madnessDetail = s.statusDetails?.find((st) =>
            st.startsWith("洗脑疯狂:")
          );
          if (madnessDetail || (s as any).cerenovusMadnessRole) {
            const roleText = madnessDetail
              ? madnessDetail.replace("洗脑疯狂:", "")
              : (s as any).cerenovusMadnessRole;
            otherBadges.push(
              <div
                key="badge-madness"
                className={`bg-purple-800 text-purple-100 ${
                  isPortrait
                    ? "text-[8px] px-1.5 py-0.5"
                    : "text-[10px] px-2 py-0.5"
                } rounded-full border border-purple-400 shadow-md font-bold whitespace-nowrap leading-none`}
                title={`洗脑疯狂：必须扮演【${roleText}】`}
              >
                🎭疯狂:{roleText}
              </div>
            );
          }

          // 提线木偶与酒鬼未设置伪装身份时显示告警
          if (s.role?.id === "marionette" && !isMasked) {
            otherBadges.push(
              <div
                key="badge-marionette"
                className={`bg-amber-800 text-amber-100 ${
                  isPortrait
                    ? "text-[8px] px-1.5 py-0.5"
                    : "text-[10px] px-2 py-0.5"
                } rounded-full border border-amber-400 shadow-md font-bold whitespace-nowrap leading-none animate-pulse`}
                title="提线木偶（未设置伪装身份，请右键或点击下方按钮设置）"
              >
                🎪木偶(未设伪装)
              </div>
            );
          }
          if (s.role?.id === "drunk" && !isMasked) {
            otherBadges.push(
              <div
                key="badge-drunk-unmasked"
                className={`bg-purple-800 text-purple-100 ${
                  isPortrait
                    ? "text-[8px] px-1.5 py-0.5"
                    : "text-[10px] px-2 py-0.5"
                } rounded-full border border-purple-400 shadow-md font-bold whitespace-nowrap leading-none animate-pulse`}
                title="酒鬼（未设置伪装身份，请右键或点击下方按钮设置）"
              >
                🎭酒鬼(未设伪装)
              </div>
            );
          }

          // 处决候选者标记
          if (s.isCandidate) {
            otherBadges.push(
              <div
                key="badge-candidate"
                className={`bg-red-600 text-white ${
                  isPortrait
                    ? "text-[8px] px-1.5 py-0.5"
                    : "text-[10px] px-2 py-0.5"
                } rounded-full border border-red-300 shadow-md font-bold whitespace-nowrap leading-none animate-pulse`}
              >
                ⚖️{s.voteCount}票
              </div>
            );
          }

          if (otherBadges.length === 0) return null;

          return (
            <div className="absolute left-[85.4%] top-[14.6%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-start gap-1 z-40 pointer-events-none">
              {otherBadges}
            </div>
          );
        })()}

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

        {/* 提醒标记（Reminder Tokens）- 显示在座位下方 */}
        {reminderTokens && reminderTokens.length > 0 && (
          <div
            className={`absolute ${isPortrait ? "-bottom-12" : "-bottom-10"} left-1/2 -translate-x-1/2 flex gap-0.5 z-40 pointer-events-none`}
          >
            {reminderTokens.slice(0, 4).map((t) => {
              const tokenColors: Record<string, string> = {
                red: "bg-red-800/90 border-red-500 text-red-100",
                green: "bg-green-800/90 border-green-500 text-green-100",
                yellow: "bg-yellow-800/90 border-yellow-500 text-yellow-100",
                blue: "bg-blue-800/90 border-blue-500 text-blue-100",
                gray: "bg-gray-700/90 border-gray-500 text-gray-100",
              };
              return (
                <div
                  key={t.id}
                  className={`flex items-center gap-0.5 px-1 py-0.5 rounded-full border text-[9px] font-medium shadow-md ${tokenColors[t.color] || tokenColors.gray}`}
                  title={t.label}
                >
                  <span className="text-[10px]">{t.icon}</span>
                </div>
              );
            })}
            {reminderTokens.length > 4 && (
              <div className="flex items-center px-1 py-0.5 rounded-full bg-gray-700/80 border border-gray-500 text-gray-200 text-[9px] font-medium shadow-md">
                +{reminderTokens.length - 4}
              </div>
            )}
          </div>
        )}

        {/* 互换目标就绪提示徽章 */}
        {isSwapTarget && (
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full shadow-xl border border-emerald-300 flex items-center gap-1 z-50 animate-bounce pointer-events-none whitespace-nowrap">
            <span>🔄 释放换位</span>
          </div>
        )}
      </motion.div>
    </div>
  );
};

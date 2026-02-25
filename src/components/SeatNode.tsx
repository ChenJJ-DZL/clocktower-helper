"use client";

import React, { useRef } from "react";
import type { Seat } from "@/app/data";
import type { NightInfoResult } from "@/src/types/game";
import { useGameActions } from '../contexts/GameActionsContext';

// 状态标签组件 - 统一的状态标记样式
interface StatusPillProps {
  icon?: React.ReactNode;
  text: string;
  // 统一为三色体系
  color?: 'red' | 'green' | 'yellow';
  isPortrait?: boolean;
  duration?: string; // 时效提示，如 "永久"、"至下个黄昏"、"至天亮" 等
}

// 格式化时效文本
function formatDuration(duration: string): string {
  if (duration.includes('永久') || duration === 'permanent') {
    return '永久';
  }
  if (duration.includes('至下个黄昏') || duration.includes('下个黄昏清除') || duration.includes('次日黄昏清除')) {
    return '至黄昏';
  }
  if (duration.includes('至天亮') || duration.includes('至下个白天') || duration === 'until_dawn') {
    return '至天亮';
  }
  if (duration.includes('1 Day') || duration === 'Night+Day') {
    return '至黄昏';
  }
  // 如果包含清除时间信息，提取并简化
  const clearMatch = duration.match(/（(.+?)清除）/);
  if (clearMatch) {
    const clearTime = clearMatch[1];
    if (clearTime.includes('黄昏')) return '至黄昏';
    if (clearTime.includes('天亮')) return '至天亮';
    return clearTime.length > 6 ? clearTime.substring(0, 6) + '...' : clearTime;
  }
  return duration;
}

function StatusPill({ icon, text, color = 'red', isPortrait = false, duration }: StatusPillProps) {
  const colorClasses = {
    red: 'bg-red-900/80 text-red-200 border-red-700',
    green: 'bg-green-900/80 text-green-200 border-green-700',
    yellow: 'bg-yellow-900/80 text-yellow-200 border-yellow-700',
  };

  const sizeClass = isPortrait ? 'text-[8px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5';
  const iconSize = isPortrait ? 'w-2.5 h-2.5' : 'w-3 h-3';
  const durationSize = isPortrait ? 'text-[7px]' : 'text-[10px]';

  return (
    <div className={`flex items-center gap-1.5 ${sizeClass} rounded-md border shadow-lg font-bold whitespace-nowrap backdrop-blur-md ${colorClasses[color]}`}>
      {icon && <span className={`${iconSize} flex items-center justify-center`}>{icon}</span>}
      <span>{text}</span>
      {duration && (
        <span className={`${durationSize} opacity-75 scale-90 font-normal`}>
          ({formatDuration(duration)})
        </span>
      )}
    </div>
  );
}

export interface SeatNodeProps {
  seat: Seat;
  index: number;
  seats: Seat[];
  isPortrait: boolean;
  seatScale: number;
  nightInfo: NightInfoResult | null;
  selectedActionTargets: number[];
  longPressingSeats: Set<number>;
  onSeatClick: (id: number) => void;
  onContextMenu: (e: React.MouseEvent, seatId: number) => void;
  onTouchStart: (e: React.TouchEvent, seatId: number) => void;
  onTouchEnd: (e: React.TouchEvent, seatId: number) => void;
  onTouchMove: (e: React.TouchEvent, seatId: number) => void;
  setSeatRef: (id: number, el: HTMLDivElement | null) => void;
  getSeatPosition: (index: number, total?: number, isPortrait?: boolean) => { x: string; y: string };
  getDisplayRoleType: (seat: Seat) => string | null;
  typeColors: Record<string, string>;
  // Dusk phase selection indicators
  nominator?: number | null;
  nominee?: number | null;
  voteThreshold?: number;
  aliveCoreCount?: number;
  topVotes?: number[];
  isTie?: boolean;
  seatNote?: string;
}

export const SeatNode: React.FC<SeatNodeProps> = ({
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
  voteThreshold,
  aliveCoreCount,
  topVotes,
  isTie,
  seatNote,
}) => {
  // Global Context based  
  const ctx = useGameActions();

  const p = getSeatPosition(i, seats.length, isPortrait);
  const displayType = getDisplayRoleType(s);
  const colorClass = displayType ? typeColors[displayType] : 'border-gray-600 text-gray-400';
  const realRole = s.role;
  const displayRole = s.displayRole || (s.role?.id === 'drunk' ? s.charadeRole || s.role : s.role);
  const isMasked = !!(realRole && displayRole && realRole.id !== displayRole.id);
  // 规则：死亡玩家的角色显示角色名称，但保留灰色和删除线效果
  const roleName = s.isDemonSuccessor && realRole?.id === 'imp'
    ? `${displayRole?.name || realRole?.name} (传)`
    : displayRole?.name || realRole?.name || "空";

  // Define status list - implicitly handled
  const statusList: Array<{ key: string; text: string; color: 'red' | 'green' | 'yellow'; icon?: React.ReactNode; duration?: string }> = [];

  // 标记已处理的状态，避免重复
  const processedStatuses = new Set<string>();

  // 1. 死亡状态
  if (s.isDead) {
    statusList.push({
      key: `dead-${s.id}`,
      text: "已死亡",
      color: "yellow",
      icon: "💀",
      duration: "永久"
    });
    processedStatuses.add('dead');
  }

  if (s.isProtected) {
    const protectionStatus = (s.statuses || []).find(st => st.effect === 'ExecutionProof' || st.effect === 'Protected');
    const protectionDuration = protectionStatus?.duration || '至天亮';

    statusList.push({
      key: `protected-${s.id}`,
      text: "受保护",
      color: "green",
      icon: "🛡️",
      duration: protectionDuration
    });
    processedStatuses.add('protected');
  }

  // 6. 天敌红罗剎状态
  if (s.isRedHerring) {
    statusList.push({
      key: `red_herring-${s.id}`,
      text: "天敌红罗剎",
      color: "yellow",
      icon: "🎯",
      duration: "永久"
    });
    processedStatuses.add('red_herring');
  }

  // 2. 先处理statusDetails中的状态（优先显示详细信息）
  (s.statusDetails || []).forEach(st => {
    // 处理中毒状态（从statusDetails中提取详细信息）
    if (st.includes('中毒') && !processedStatuses.has('poison')) {
      // 对于已经死亡的玩家，只保留真正永久性的中毒标记（例如“永久中毒”、“舞蛇人中毒”），
      // 临时中毒不再显示，避免“死者长期带中毒标签”的视觉干扰
      if (s.isDead && !st.includes('永久中毒') && !st.includes('舞蛇人中毒')) {
        return;
      }

      const poisonStatus = (s.statuses || []).find(status => status.effect === 'Poison');
      const poisonDuration = poisonStatus?.duration || st.match(/（(.+?)清除）/)?.[1] || '至下个黄昏';

      statusList.push({
        key: `poison-${s.id}`,
        text: "中毒",
        color: "red",
        icon: "☠️",
        duration: poisonDuration
      });
      processedStatuses.add('poison');
      return; // 已处理，跳过后续逻辑
    }

    // 处理醉酒状态（从statusDetails中提取详细信息）
    if (st.includes('致醉') && !processedStatuses.has('drunk')) {
      // 死亡后醉酒状态对游戏没有实际影响，这里直接不再显示
      if (s.isDead) {
        return;
      }

      const drunkStatus = (s.statuses || []).find(status => status.effect === 'Drunk');
      const drunkDuration = drunkStatus?.duration || st.match(/（(.+?)清除）/)?.[1] || '至下个黄昏';

      statusList.push({
        key: `drunk-${s.id}`,
        text: "醉酒",
        color: "yellow",
        icon: "🍺",
        duration: drunkDuration
      });
      processedStatuses.add('drunk');
      return; // 已处理，跳过后续逻辑
    }
  });

  // 3. 处理通用的中毒状态（如果statusDetails中没有）
  if (!s.isDead && s.isPoisoned && !processedStatuses.has('poison')) {
    const poisonStatus = (s.statuses || []).find(st => st.effect === 'Poison');
    const poisonDuration = poisonStatus?.duration || '至下个黄昏';

    statusList.push({
      key: 'poison',
      text: "中毒",
      color: "red",
      icon: "☠️",
      duration: poisonDuration
    });
    processedStatuses.add('poison');
  }

  // 4. 处理通用的醉酒状态（如果statusDetails中没有）
  if (!s.isDead && (s.role?.id === 'drunk' || s.isDrunk) && !processedStatuses.has('drunk')) {
    const drunkStatus = (s.statuses || []).find(st => st.effect === 'Drunk');
    const drunkDuration = drunkStatus?.duration || (s.role?.id === 'drunk' ? '永久' : '至下个黄昏');

    statusList.push({
      key: 'drunk',
      text: "醉酒",
      color: "yellow",
      icon: "🍺",
      duration: drunkDuration
    });
    processedStatuses.add('drunk');
  }

  // 5. 受保护状态

  // 7. 技能使用状态
  if (s.hasUsedSlayerAbility) {
    statusList.push({
      key: `slayer_used-${s.id}`,
      text: "猎手已用",
      color: "red",
      icon: "🎯",
      duration: "永久"
    });
  }
  if (s.hasUsedVirginAbility) {
    statusList.push({
      key: `virgin_used-${s.id}`,
      text: "处女失效",
      color: "yellow",
      icon: "⛔",
      duration: "永久"
    });
  }
  if (s.hasAbilityEvenDead) {
    statusList.push({
      key: `ability_even_dead-${s.id}`,
      text: "死而有能",
      color: "yellow",
      icon: "👻",
      duration: "永久"
    });
  }

  // --- SSOT Visualization: Snapshot Enforcement ---
  const isValidTarget = React.useMemo(() => {
    if (!nightInfo) return true;
    // Only enforce if we are in night/action phase and validTargetIds is populated
    // Note: Setup phase might have nightInfo=null.
    if (nightInfo.validTargetIds && nightInfo.validTargetIds.length > 0) {
      return nightInfo.validTargetIds.includes(s.id);
    }
    return true;
  }, [nightInfo, s.id]);


  return (
    <div
      key={s.id}
      onClick={(e) => {
        e.stopPropagation();
        if (isValidTarget) onSeatClick(s.id);
      }}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, s.id); }}
      onTouchStart={(e) => { if (isValidTarget) onTouchStart(e, s.id); }}
      onTouchEnd={(e) => { if (isValidTarget) onTouchEnd(e, s.id); }}
      onTouchMove={(e) => { if (isValidTarget) onTouchMove(e, s.id); }}
      ref={(el) => { setSeatRef(s.id, el); }}
      style={{
        left: `${p.x}%`,
        // ... kept original styles ...
        top: `${p.y}%`,
        transform: 'translate(-50%,-50%)',
        width: `calc(${isPortrait ? '3rem' : '7rem'} * ${seatScale})`,
        height: `calc(${isPortrait ? '3rem' : '7rem'} * ${seatScale})`,
        WebkitUserSelect: 'none',
        userSelect: 'none',
        WebkitTouchCallout: 'none',
        touchAction: 'manipulation',
        WebkitTapHighlightColor: 'transparent',
        // Apply visual dimming
        opacity: isValidTarget ? 1 : 0.3,
        filter: isValidTarget ? 'none' : 'grayscale(100%)',
        pointerEvents: isValidTarget ? 'auto' : 'none',
      }}
      className="absolute flex items-center justify-center seat-node"
      data-seat-id={s.id}
    >
      <div
        className={`relative w-full h-full rounded-full ${isPortrait ? 'border-2' : 'border-4'} flex items-center justify-center cursor-pointer z-30 bg-gray-900 transition-all duration-300
        ${colorClass} 
        ${nightInfo?.seat.id === s.id ? 'ring-4 ring-yellow-400 scale-110 shadow-[0_0_30px_yellow]' : ''} 
        ${s.isDead ? 'grayscale brightness-75 bg-gray-300 border-gray-400' : ''} 
        ${selectedActionTargets.includes(s.id) ? 'ring-4 ring-green-500 scale-105' : ''}
        ${longPressingSeats.has(s.id) ? 'ring-4 ring-blue-400 animate-pulse' : ''}
        ${nominator === s.id ? 'ring-8 ring-white scale-110 shadow-[0_0_40px_rgba(255,255,255,0.8)] animate-pulse' : ''}
        ${nominee === s.id ? 'ring-8 ring-yellow-400 scale-110 shadow-[0_0_40px_rgba(250,204,21,0.8)] animate-pulse' : ''}
        ${s.isCandidate ? 'ring-4 ring-red-500 scale-105 shadow-[0_0_20px_red]' : ''}
      `}
      >
        {/* === VFX Layers === */}
        {ctx.vfxTrigger?.seatId === s.id && ctx.vfxTrigger.type === 'slayer' && (
          <div className="absolute inset-0 rounded-full bg-red-500 z-50 animate-vfx-particle shadow-[0_0_80px_red]"></div>
        )}
        {ctx.vfxTrigger?.seatId === s.id && ctx.vfxTrigger.type === 'virgin' && (
          <div className="absolute inset-0 rounded-full bg-yellow-300 z-50 animate-vfx-particle shadow-[0_0_60px_yellow]"></div>
        )}

        {/* 真实身份指示徽章（仅说书人可见：role 与 displayRole 不一致时显示） */}
        {isMasked && (
          <div
            className={`absolute ${isPortrait ? '-top-1.5 -right-1.5' : '-top-4 -right-4'} bg-purple-600 text-white ${isPortrait ? 'text-[8px] px-1 py-0.5' : 'text-[10px] px-1.5 py-0.5'
              } rounded-full z-40 border border-white shadow-sm`}
          >
            实:{realRole?.name}
          </div>
        )}
        {/* 长按进度指示器 */}
        {longPressingSeats.has(s.id) && (
          <div className="absolute inset-0 rounded-full border-4 border-blue-400 animate-ping opacity-75"></div>
        )}

        {/* 提名者外圈光环特效 */}
        {nominator === s.id && (
          <>
            <div className="absolute inset-0 rounded-full border-8 border-white/60 animate-ping opacity-50" style={{ animationDuration: '1.5s' }}></div>
            <div className="absolute inset-0 rounded-full border-8 border-white/40 animate-ping opacity-30" style={{ animationDuration: '2s', animationDelay: '0.5s' }}></div>
            <div className="absolute -inset-4 rounded-full border-4 border-white/30 animate-pulse"></div>
          </>
        )}

        {/* 被提名者外圈光环特效 */}
        {nominee === s.id && (
          <>
            <div className="absolute inset-0 rounded-full border-8 border-yellow-400/60 animate-ping opacity-50" style={{ animationDuration: '1.5s' }}></div>
            <div className="absolute inset-0 rounded-full border-8 border-yellow-400/40 animate-ping opacity-30" style={{ animationDuration: '2s', animationDelay: '0.5s' }}></div>
            <div className="absolute -inset-4 rounded-full border-4 border-yellow-400/30 animate-pulse"></div>
          </>
        )}

        {/* 座位序号 - 固定在左上角45度方向，圆心在圆圈上 */}
        <div
          className={`absolute left-0 top-0 -translate-x-[40%] -translate-y-[40%] ${isPortrait ? 'w-6 h-6' : 'w-10 h-10'} rounded-full ${s.isDead ? 'bg-gray-400 border-gray-500 text-gray-700' : 'bg-slate-800 border-slate-600'} border-2 flex items-center justify-center ${isPortrait ? 'text-xs' : 'text-xl'} font-bold z-20 shadow-md`}
        >
          {s.id + 1}
        </div>

        {/* 角色名称 - 在座位圆圈内部绝对居中 */}
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <span
            className={`${isPortrait ? 'text-lg' : 'text-2xl'} font-black drop-shadow-md leading-none text-center ${roleName.length > 4 ? '' : 'whitespace-nowrap'} ${s.isDead ? 'text-gray-400 line-through' : 'text-white'}`}
            style={{
              textShadow: '0 2px 4px rgba(0,0,0,0.9), 0 0 4px black',
            }}
          >
            {roleName}
          </span>
        </div>

        {/* 状态标签容器 - 位于座位内部，从下边缘向上排列 */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 flex flex-col-reverse gap-0.5 items-center z-30 w-full px-1 pointer-events-none" style={{ maxHeight: '60%' }}>
          {/* 遍历渲染状态列表（反向，从下往上） */}
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
        <div className={`absolute ${isPortrait ? '-top-1.5 -right-1.5' : '-top-5 -right-5'} flex flex-col gap-0.5 items-end z-40`}>
          {/* 主人标签 */}
          {seats.some(seat => seat.masterId === s.id) && (
            <span className={`${isPortrait ? 'text-[7px] px-0.5 py-0.5' : 'text-xs px-2 py-0.5'} bg-purple-600 rounded-full shadow font-bold`}>
              主人
            </span>
          )}
          {/* 处决台标签 */}
          {s.isCandidate && (
            <span className={`${isPortrait ? 'text-[7px] px-0.5 py-0.5' : 'text-xs px-2 py-0.5'} bg-red-600 rounded-full shadow font-bold animate-pulse`}>
              ⚖️{s.voteCount}
            </span>
          )}
        </div>

        {/* 幽灵票标记 - 显示在右下角 */}
        {s.isDead && s.hasGhostVote && (
          <div
            className={`absolute ${isPortrait ? '-bottom-1 -right-1' : '-bottom-1 -right-1'} ${isPortrait ? 'w-4 h-4' : 'w-5 h-5'} bg-white rounded-full border-2 border-slate-900 flex items-center justify-center shadow-md z-30`}
            title="该玩家还有一票"
          >
            <div className={`${isPortrait ? 'w-1.5 h-1.5' : 'w-2 h-2'} bg-black rounded-full`}></div>
          </div>
        )}

        {/* 备忘录提示标记 - 显示在下方外部 */}
        {seatNote && (
          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap bg-yellow-900/90 text-yellow-200 border border-yellow-700/50 rounded pointer-events-none px-2 py-0.5 text-xs font-medium shadow-lg z-50">
            {seatNote.length > 8 ? seatNote.slice(0, 8) + '...' : seatNote}
          </div>
        )}
      </div>
    </div>
  );
};


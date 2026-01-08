"use client";

import React from "react";
import type { Seat } from "@/app/data";
import type { NightInfoResult } from "@/src/types/game";

// 状态标签组件 - 统一的状态标记样式
interface StatusPillProps {
  icon?: React.ReactNode;
  text: string;
  color?: 'red' | 'purple' | 'green' | 'blue' | 'gray' | 'yellow';
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
    purple: 'bg-purple-900/80 text-purple-200 border-purple-700',
    green: 'bg-green-900/80 text-green-200 border-green-700',
    blue: 'bg-blue-900/80 text-blue-200 border-blue-700',
    gray: 'bg-gray-800/80 text-gray-300 border-gray-600',
    yellow: 'bg-yellow-900/80 text-yellow-200 border-yellow-700',
  };

  const sizeClass = isPortrait ? 'text-[8px] px-1.5 py-0.5' : 'text-sm px-2 py-0.5';
  const iconSize = isPortrait ? 'w-2.5 h-2.5' : 'w-4 h-4';
  const durationSize = isPortrait ? 'text-[7px]' : 'text-xs';

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
}) => {
  const p = getSeatPosition(i, seats.length, isPortrait);
  const displayType = getDisplayRoleType(s);
  const colorClass = displayType ? typeColors[displayType] : 'border-gray-600 text-gray-400';
  const roleName =
    s.role?.id === 'drunk'
      ? `${s.charadeRole?.name || s.role?.name} (酒)`
      : s.isDemonSuccessor && s.role?.id === 'imp'
        ? `${s.role?.name} (传)`
        : s.role?.name || "空";
  
  // 定义状态列表 - 自动推导所有异常状态
  const statusList: Array<{ text: string; color: 'red' | 'purple' | 'green' | 'blue' | 'gray' | 'yellow'; icon?: React.ReactNode; duration?: string }> = [];
  
  // 标记已处理的状态，避免重复
  const processedStatuses = new Set<string>();

  // 1. 死亡状态
  if (s.isDead) {
    statusList.push({
      text: "已死亡",
      color: "gray",
      icon: "💀",
      duration: "永久"
    });
    processedStatuses.add('dead');
  }

  // 受保护状态将在 statuses 数组中处理，这里移除重复逻辑

  // 2. 处理 statuses 数组中的状态（统一使用徽章格式）
  (s.statuses || []).forEach(status => {
    const effect = status.effect;
    const duration = status.duration || '永久';
    
    // 跳过已经处理的状态
    if (effect === 'Poison' && processedStatuses.has('poison')) return;
    if (effect === 'Drunk' && processedStatuses.has('drunk')) return;
    if (effect === 'Protected' && processedStatuses.has('protected')) return;
    if (effect === 'ExecutionProof' && processedStatuses.has('protected')) return;
    
    switch (effect) {
      case 'Poison':
        statusList.push({
          text: "中毒",
          color: "green",
          icon: "🧪",
          duration: duration
        });
        processedStatuses.add('poison');
        break;
      case 'Drunk':
        statusList.push({
          text: "醉酒",
          color: "purple",
          icon: "🍷",
          duration: duration
        });
        processedStatuses.add('drunk');
        break;
      case 'Protected':
      case 'ExecutionProof':
        if (!processedStatuses.has('protected')) {
          statusList.push({
            text: "受保护",
            color: "blue",
            icon: "🛡️",
            duration: duration
          });
          processedStatuses.add('protected');
        }
        break;
      case 'RedHerring':
        statusList.push({
          text: "红罗刹",
          color: "red",
          icon: "😈",
          duration: duration
        });
        processedStatuses.add('redHerring');
        break;
    }
  });

  // 3. 处理红罗刹状态（如果不在 statuses 中）
  if (s.isRedHerring && !processedStatuses.has('redHerring')) {
    statusList.push({
      text: "红罗刹",
      color: "red",
      icon: "😈",
      duration: "永久"
    });
    processedStatuses.add('redHerring');
  }

  // 3. 处理通用的中毒状态（如果statusDetails中没有）
  if (s.isPoisoned && !processedStatuses.has('poison')) {
    const poisonStatus = (s.statuses || []).find(st => st.effect === 'Poison');
    const poisonDuration = poisonStatus?.duration || '至下个黄昏';
    
    statusList.push({
      text: "中毒",
      color: "green",
      icon: "🧪",
      duration: poisonDuration
    });
    processedStatuses.add('poison');
  }

  // 4. 处理通用的醉酒状态（如果statusDetails中没有）
  if ((s.role?.id === 'drunk' || s.isDrunk) && !processedStatuses.has('drunk')) {
    const drunkStatus = (s.statuses || []).find(st => st.effect === 'Drunk');
    const drunkDuration = drunkStatus?.duration || (s.role?.id === 'drunk' ? '永久' : '至下个黄昏');
    
    statusList.push({
      text: "醉酒",
      color: "purple",
      icon: "🍷",
      duration: drunkDuration
    });
    processedStatuses.add('drunk');
  }

  // 4. 技能使用状态
  if (s.hasUsedSlayerAbility) {
    statusList.push({
      text: "猎手已用",
      color: "red",
      duration: "永久"
    });
  }
  if (s.hasUsedVirginAbility) {
    statusList.push({
      text: "处女失效",
      color: "purple",
      duration: "永久"
    });
  }
  if (s.hasAbilityEvenDead) {
    statusList.push({
      text: "死而有能",
      color: "green",
      duration: "永久"
    });
  }

  return (
    <div
      key={s.id}
      onClick={(e) => { e.stopPropagation(); onSeatClick(s.id); }}
      onContextMenu={(e) => onContextMenu(e, s.id)}
      onTouchStart={(e) => onTouchStart(e, s.id)}
      onTouchEnd={(e) => onTouchEnd(e, s.id)}
      onTouchMove={(e) => onTouchMove(e, s.id)}
      ref={(el) => { setSeatRef(s.id, el); }}
      style={{
        left: `${p.x}%`,
        top: `${p.y}%`,
        transform: 'translate(-50%,-50%)',
        width: `calc(${isPortrait ? '3rem' : '7rem'} * ${seatScale})`,
        height: `calc(${isPortrait ? '3rem' : '7rem'} * ${seatScale})`,
        minWidth: isPortrait ? '3rem' : '7rem',
        minHeight: isPortrait ? '3rem' : '7rem',
        WebkitUserSelect: 'none',
        userSelect: 'none',
        WebkitTouchCallout: 'none',
        touchAction: 'manipulation',
        WebkitTapHighlightColor: 'transparent',
      }}
      className="absolute flex items-center justify-center"
    >
      <div
        className={`relative w-full h-full rounded-full ${isPortrait ? 'border-2' : 'border-4'} flex items-center justify-center cursor-pointer z-30 bg-gray-900 transition-all duration-300
        ${colorClass} 
        ${nightInfo?.seat.id === s.id ? 'ring-4 ring-yellow-400 scale-110 shadow-[0_0_30px_yellow]' : ''} 
        ${s.isDead ? 'grayscale brightness-75 bg-gray-300 border-gray-400' : ''} 
        ${selectedActionTargets.includes(s.id) ? 'ring-4 ring-green-500 scale-105' : ''}
        ${longPressingSeats.has(s.id) ? 'ring-4 ring-blue-400 animate-pulse' : ''}
      `}
      >
        {/* 长按进度指示器 */}
        {longPressingSeats.has(s.id) && (
          <div className="absolute inset-0 rounded-full border-4 border-blue-400 animate-ping opacity-75"></div>
        )}
        
        {/* 座位序号 - 固定在左上角45度方向，圆心在圆圈上 */}
        <div 
          className={`absolute left-0 top-0 -translate-x-[40%] -translate-y-[40%] ${isPortrait ? 'w-6 h-6' : 'w-12 h-12'} rounded-full ${s.isDead ? 'bg-gray-400 border-gray-500 text-gray-700' : 'bg-slate-800 border-slate-600'} border-2 flex items-center justify-center ${isPortrait ? 'text-xs' : 'text-2xl'} font-bold z-20 shadow-md`}
        >
          {s.id + 1}
        </div>

        {/* 角色名称 - 在座位圆圈内部绝对居中 */}
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <span 
            className={`${isPortrait ? 'text-lg' : 'text-3xl'} font-black drop-shadow-md leading-none text-center ${roleName.length > 4 ? '' : 'whitespace-nowrap'} ${s.isDead ? 'text-gray-400 line-through' : 'text-white'}`}
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
          {statusList.map((status, idx) => (
            <StatusPill
              key={`${status.text}-${idx}`}
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
      </div>
    </div>
  );
};


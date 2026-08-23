"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

export interface TooltipData {
  /** 角色全称 */
  title: string;
  /** 所属阵营 */
  faction?: string;
  /** 阵营着色 key（townsfolk/outsider/minion/demon/traveler/fabled） */
  factionType?: string;
  /** 一句话能力描述 */
  ability?: string;
  /** 当前状态标记（如 中毒/醉酒/受保护/已死亡） */
  statuses?: string[];
}

interface TooltipState {
  data: TooltipData;
  anchorRect: { top: number; left: number; width: number; height: number };
}

interface TooltipContextValue {
  show: (data: TooltipData, el: HTMLElement) => void;
  scheduleHide: () => void;
}

const TooltipContext = createContext<TooltipContextValue | null>(null);

const FACTION_STYLES: Record<string, { label: string; color: string }> = {
  townsfolk: { label: "镇民", color: "text-amber-300" },
  outsider: { label: "外来者", color: "text-emerald-300" },
  minion: { label: "爪牙", color: "text-orange-300" },
  demon: { label: "恶魔", color: "text-red-400" },
  traveler: { label: "旅行者", color: "text-yellow-300" },
  fabled: { label: "寓言传奇", color: "text-amber-200" },
};

/**
 * GrimoireTooltipProvider - 悬浮注解系统宿主（深色羊皮纸卡片）
 *
 * 桌面端 hover 触发，移动端点击触发。
 * 卡片渲染于 Portal，自动防溢出翻转。
 */
export function GrimoireTooltipProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TooltipState | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const show = useCallback((data: TooltipData, el: HTMLElement) => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    const rect = el.getBoundingClientRect();
    setState({
      data,
      anchorRect: {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      },
    });
  }, []);

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setState(null), 120);
  }, []);

  return (
    <TooltipContext.Provider value={{ show, scheduleHide }}>
      {children}
      {mounted &&
        state &&
        createPortal(
          <TooltipCard
            data={state.data}
            anchorRect={state.anchorRect}
            onMouseEnter={() => {
              if (hideTimer.current) {
                clearTimeout(hideTimer.current);
                hideTimer.current = null;
              }
            }}
            onMouseLeave={scheduleHide}
            onDismiss={() => setState(null)}
          />,
          document.body
        )}
    </TooltipContext.Provider>
  );
}

function TooltipCard({
  data,
  anchorRect,
  onMouseEnter,
  onMouseLeave,
  onDismiss,
}: {
  data: TooltipData;
  anchorRect: { top: number; left: number; width: number; height: number };
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onDismiss: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const cardRect = card.getBoundingClientRect();
    const margin = 12;
    const viewportH = window.innerHeight;
    const viewportW = window.innerWidth;

    // 默认显示在锚点上方，空间不足则翻转到下方
    let top = anchorRect.top - cardRect.height - margin;
    if (top < margin) {
      top = anchorRect.top + anchorRect.height + margin;
    }
    top = Math.min(Math.max(top, margin), viewportH - cardRect.height - margin);

    let left = anchorRect.left + anchorRect.width / 2 - cardRect.width / 2;
    left = Math.min(
      Math.max(left, margin),
      viewportW - cardRect.width - margin
    );

    setPos({ top, left });
  }, [anchorRect]);

  const faction = data.factionType
    ? FACTION_STYLES[data.factionType]
    : undefined;

  return (
    <div
      ref={cardRef}
      role="tooltip"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={(e) => {
        e.stopPropagation();
        onDismiss();
      }}
      className="fixed z-[10050] w-72 pointer-events-auto animate-in fade-in zoom-in-95"
      style={{
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        visibility: pos ? "visible" : "hidden",
      }}
    >
      {/* 深色羊皮纸卡片 */}
      <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-b from-slate-900/95 to-slate-950/95 backdrop-blur-xl shadow-2xl shadow-amber-950/40 px-4 py-3.5">
        {/* 角色全称 */}
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="text-base font-black text-amber-100 leading-tight">
            {data.title}
          </span>
          {faction && (
            <span
              className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full border border-white/10 bg-white/5 ${faction.color}`}
            >
              {faction.label}
            </span>
          )}
        </div>

        {/* 一句话能力 */}
        {data.ability && (
          <div className="text-[13px] text-slate-300 leading-relaxed mb-2 font-light">
            {data.ability}
          </div>
        )}

        {/* 当前状态标记 */}
        {data.statuses && data.statuses.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-amber-500/15">
            {data.statuses.map((s) => (
              <span
                key={s}
                className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-red-950/60 text-red-200 border border-red-800/50"
              >
                {s}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * useGrimoireTooltip - 供代币/标贴绑定的便捷 Hook
 *
 * 返回事件处理器集合（桌面 hover + 移动端点击），
 * 直接展开到目标元素上即可。data 为 null 时返回空对象。
 */
export function useGrimoireTooltip(data: TooltipData | null) {
  const ctx = useContext(TooltipContext);

  return useMemo(() => {
    if (!ctx || !data) return {};
    return {
      onMouseEnter: (e: React.MouseEvent) => {
        ctx.show(data, e.currentTarget as HTMLElement);
      },
      onMouseLeave: ctx.scheduleHide,
    };
  }, [ctx, data]);
}

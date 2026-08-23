"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import type { LogEntry, ReminderToken, Seat } from "../../../app/data";
import { roles } from "../../../app/data";
import { ModalWrapper } from "./ModalWrapper";

// 角色ID到中文名的映射
const roleNameMap = new Map(roles.map((r) => [r.id, r.name]));

interface SpyGrimoireModalProps {
  isOpen: boolean;
  onClose: () => void;
  seats: Seat[];
  gameLogs?: LogEntry[];
  nightCount?: number;
  reminderTokens?: Record<number, ReminderToken[]>;
  isPortrait?: boolean;
}

/**
 * 椭圆等弧长（严格像素等间距）分布计算 Hook
 * 避免普通极坐标在椭圆左右两侧严重挤压重叠的问题
 */
function useUniformEllipseLayout(
  total: number,
  containerRef: React.RefObject<HTMLDivElement | null>
) {
  const [dimensions, setDimensions] = useState({ width: 680, height: 420 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setDimensions({ width: rect.width, height: rect.height });
      }
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  return useMemo(() => {
    if (total <= 0) return { coords: [], A: 240, B: 150, width: 680, height: 420 };
    const { width, height } = dimensions;

    // 动态留出边距（根据人数微调）
    const seatMargin = total > 15 ? 40 : 46;
    const A = Math.max(80, width / 2 - seatMargin);
    const B = Math.max(60, height / 2 - seatMargin);

    // 1. 构建数值积分采样表（1200 个采样点）
    const SAMPLES = 1200;
    const cumulativeArc: number[] = new Array(SAMPLES + 1);
    cumulativeArc[0] = 0;

    const dt = (2 * Math.PI) / SAMPLES;
    for (let i = 1; i <= SAMPLES; i++) {
      const t = (i - 0.5) * dt;
      // dL/dt = sqrt(A^2 * cos^2(t) + B^2 * sin^2(t))
      const speed = Math.sqrt(
        A * A * Math.cos(t) * Math.cos(t) + B * B * Math.sin(t) * Math.sin(t)
      );
      cumulativeArc[i] = cumulativeArc[i - 1] + speed * dt;
    }

    const totalPerimeter = cumulativeArc[SAMPLES];
    const arcPerSeat = totalPerimeter / total;

    // 2. 为每个座位寻找对应的参数 t（等弧长采样）
    const resultCoords: Array<{ x: string; y: string; angle: number }> = [];

    for (let k = 0; k < total; k++) {
      const targetArc = k * arcPerSeat;

      // 二分查找找到 targetArc 所在的区间
      let low = 0;
      let high = SAMPLES;
      while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if (cumulativeArc[mid] < targetArc) {
          low = mid + 1;
        } else {
          high = mid;
        }
      }

      const idx = Math.max(1, low);
      const prevArc = cumulativeArc[idx - 1];
      const nextArc = cumulativeArc[idx];
      const fraction = nextArc > prevArc ? (targetArc - prevArc) / (nextArc - prevArc) : 0;
      const t = (idx - 1 + fraction) * dt;

      // 顺时针从正上方开始：t=0 -> top (0, -B)
      const xPx = A * Math.sin(t);
      const yPx = -B * Math.cos(t);

      const xPercent = 50 + (xPx / width) * 100;
      const yPercent = 50 + (yPx / height) * 100;

      resultCoords.push({
        x: xPercent.toFixed(2),
        y: yPercent.toFixed(2),
        angle: t,
      });
    }

    return { coords: resultCoords, A, B, width, height };
  }, [total, dimensions]);
}

export function SpyGrimoireModal({
  isOpen,
  onClose,
  seats,
  gameLogs = [],
  nightCount = 1,
  reminderTokens = {},
  isPortrait = false,
}: SpyGrimoireModalProps) {
  // ─── 倒计时器状态（60秒） ────────────────────────────────────────────────
  const INITIAL_TIMER_SECONDS = 60;
  const [timeLeft, setTimeLeft] = useState(INITIAL_TIMER_SECONDS);
  const [isTimerRunning, setIsTimerRunning] = useState(true);

  // ─── 当前选中聚焦的座位（用于圆桌点击联动右侧情报） ───────────────────────
  const [selectedSeatId, setSelectedSeatId] = useState<number | null>(null);

  // ─── 右侧日志的筛选 Tab（"all" | "night-0" (首夜) | "night-1" | "night-2" ... | "day"） ──
  const [activeTab, setActiveTab] = useState<string>("all");

  // 椭圆容器 Ref 用于等弧长尺寸测量
  const ellipseContainerRef = useRef<HTMLDivElement>(null);
  const { coords: seatCoords, A, B, width: containerWidth, height: containerHeight } =
    useUniformEllipseLayout(seats.length, ellipseContainerRef);

  // 倒计时逻辑
  useEffect(() => {
    if (!isOpen || !isTimerRunning || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, isTimerRunning, timeLeft]);

  // 增加 15 秒
  const handleAddExtraTime = useCallback(() => {
    setTimeLeft((prev) => prev + 15);
    setIsTimerRunning(true);
  }, []);

  // 重设倒计时
  const handleResetTimer = useCallback(() => {
    setTimeLeft(INITIAL_TIMER_SECONDS);
    setIsTimerRunning(true);
  }, [INITIAL_TIMER_SECONDS]);

  // 构建座位号到角色名称的映射
  const seatRoleMap = useMemo(() => {
    const map = new Map<number, string>();
    seats.forEach((s) => {
      const seatNum = s.id + 1;
      const charadeName = s.charadeRole?.name || "";
      if (s.role?.id === "drunk" && charadeName) {
        map.set(seatNum, `${charadeName}(实:酒鬼)`);
      } else if (s.role?.name) {
        map.set(seatNum, s.role.name);
      }
    });
    return map;
  }, [seats]);

  // 统计概览指标
  const metrics = useMemo(() => {
    const total = seats.length;
    let evilCount = 0;
    let goodCount = 0;
    let deadCount = 0;
    let abnormalCount = 0; // 中毒或醉酒

    seats.forEach((s) => {
      if (s.isDead) deadCount++;
      if (s.isPoisoned || s.isDrunk) abnormalCount++;

      const isDemon = s.role?.type === "demon" || s.isDemonSuccessor;
      const isMinion = s.role?.type === "minion";
      const isEvil = s.isEvilConverted || (!s.isGoodConverted && (isDemon || isMinion));
      if (isEvil) evilCount++;
      else goodCount++;
    });

    return { total, goodCount, evilCount, deadCount, abnormalCount };
  }, [seats]);

  // 格式化与分类日志
  const parsedLogs = useMemo(() => {
    const rawList = gameLogs || [];

    return rawList
      .filter((log) => {
        if (!log || typeof log.message !== "string") return false;
        const msg = log.message;
        // 过滤系统调试信息，保留对局相关的所有行动与情报
        if (
          msg.startsWith("[系统]") ||
          msg.startsWith("[能力执行]") ||
          msg.startsWith("[handleDrunkCharadeSelect]") ||
          msg.startsWith("[Fast Refresh]")
        ) {
          return false;
        }
        return true;
      })
      .map((log, index) => {
        let text = log.message.trim().replace(/^\[能力\]\s*/, "");

        // 提取本条日志涉及的座位号（0-indexed）
        const involvedSeats = new Set<number>();
        const seatMatches = text.matchAll(/(\d+)\s*号/g);
        for (const m of seatMatches) {
          const seatNum = parseInt(m[1], 10);
          if (!isNaN(seatNum) && seatNum >= 1 && seatNum <= seats.length) {
            involvedSeats.add(seatNum - 1);
          }
        }

        // 优化将形如 "1号(slayer)" / "1号(猎手)" / "玩家1(1号)" 转为规范高亮标签
        text = text.replace(
          /【?玩家(\d+)】?\s*[(（](\d+)\s*号(?:[ -]([^\s()（）]+))?[)）]/gi,
          (_, num1, num2, roleText) => {
            const num = parseInt(num2 || num1, 10);
            const roleName = roleText || seatRoleMap.get(num) || roleNameMap.get(roleText) || "";
            return roleName ? `【${num}号-${roleName}】` : `【${num}号】`;
          }
        );
        text = text.replace(
          /(\d+)\s*号(?:玩家|[位者])?\s*[(（]([a-zA-Z_\u4e00-\u9fa5]+)[)）]/gi,
          (_, numStr, roleIdOrName) => {
            const num = parseInt(numStr, 10);
            const cn = roleNameMap.get(roleIdOrName) || roleIdOrName || seatRoleMap.get(num);
            return cn ? `【${num}号-${cn}】` : `【${num}号】`;
          }
        );

        // 判断条目类型（得知信息 / 行动目标 / 死亡结算 / 白天提名等）
        const isInfo =
          text.includes("得知") ||
          text.includes("查验") ||
          text.includes("获得信息") ||
          text.includes("结果为") ||
          text.includes("信息：") ||
          text.includes("神谕") ||
          text.includes("看到");

        const isKillOrDeath =
          text.includes("杀") ||
          text.includes("死") ||
          text.includes("处决") ||
          text.includes("刺杀") ||
          text.includes("猝死") ||
          text.includes("击杀");

        const isStatus =
          text.includes("中毒") ||
          text.includes("醉酒") ||
          text.includes("保护") ||
          text.includes("诅咒") ||
          text.includes("疯癫");

        return {
          id: `${log.day}-${log.phase}-${index}`,
          day: log.day,
          phase: log.phase,
          originalMessage: log.message,
          formattedText: text,
          involvedSeats: Array.from(involvedSeats),
          isInfo,
          isKillOrDeath,
          isStatus,
        };
      });
  }, [gameLogs, seatRoleMap, seats.length]);

  // 根据当前 Tab 与选中玩家过滤日志
  const filteredLogs = useMemo(() => {
    let list = parsedLogs;

    // 1. 如果选中了特定玩家，优先过滤涉及该玩家的条目
    if (selectedSeatId !== null) {
      list = list.filter((item) => item.involvedSeats.includes(selectedSeatId));
    }

    // 2. Tab 筛选
    if (activeTab === "all") {
      return list;
    } else if (activeTab === "night-0") {
      return list.filter((item) => item.phase === "firstNight" || (item.day === 0 && item.phase !== "day" && item.phase !== "dusk"));
    } else if (activeTab.startsWith("night-")) {
      const targetNight = parseInt(activeTab.replace("night-", ""), 10);
      return list.filter((item) => item.day === targetNight && (item.phase === "night" || item.phase === "dawnReport"));
    } else if (activeTab === "day") {
      return list.filter((item) => item.phase === "day" || item.phase === "dusk");
    }

    return list;
  }, [parsedLogs, selectedSeatId, activeTab]);

  // 获取现存最大天数用于生成 Tab
  const availableNights = useMemo(() => {
    const days = new Set<number>();
    parsedLogs.forEach((p) => {
      if (p.day !== undefined && p.day > 0) days.add(p.day);
    });
    return Array.from(days).sort((a, b) => a - b);
  }, [parsedLogs]);

  // 座位节点尺寸类
  const seatSizeClass = useMemo(() => {
    if (seats.length > 15) {
      return "w-12 h-12 lg:w-[3.3rem] lg:h-[3.3rem]";
    } else if (seats.length > 12) {
      return "w-14 h-14 lg:w-[3.7rem] lg:h-[3.7rem]";
    } else {
      return "w-15 h-15 lg:w-[4.2rem] lg:h-[4.2rem]";
    }
  }, [seats.length]);

  if (!isOpen) return null;

  // 倒计时百分比
  const timerPercent = Math.max(0, Math.min(100, (timeLeft / INITIAL_TIMER_SECONDS) * 100));
  const timerColor =
    timeLeft <= 5
      ? "bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.8)]"
      : timeLeft <= 10
        ? "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.6)]"
        : "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]";

  const selectedSeat = selectedSeatId !== null ? seats.find((s) => s.id === selectedSeatId) : null;

  // 椭圆底盘宽度/高度百分比
  const ellipseWidthPct = containerWidth > 0 ? ((2 * A) / containerWidth) * 100 : 85;
  const ellipseHeightPct = containerHeight > 0 ? ((2 * B) / containerHeight) * 100 : 85;

  return (
    <ModalWrapper
      title="📖 间谍椭圆魔典 (全知全景)"
      onClose={onClose}
      className="max-w-7xl w-[96vw] h-[88vh] flex flex-col p-0 overflow-hidden"
      footer={
        <div className="w-full flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-amber-200/90 font-medium">
            <span className="text-base">💡</span>
            <span>椭圆魔典采用严格等弧长物理等距排布，互不挤压遮挡；点击椭圆上任意座位可即时联动右侧情报</span>
          </div>
          <button
            onClick={onClose}
            className="px-8 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl font-black text-sm tracking-wider transition-all shadow-lg shadow-blue-900/50 hover:shadow-blue-600/60 active:scale-95"
          >
            ✓ 我已查看完毕 (下一步)
          </button>
        </div>
      }
    >
      <div className="flex flex-col h-full gap-2.5 overflow-hidden">
        {/* ─── 顶部条：限时倒计时 (60s) + 统计指标 ─────────────────────── */}
        <div className="bg-slate-950/80 p-2.5 rounded-xl border border-white/10 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* 左侧：倒计时控制 */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-black tracking-wide ${timeLeft <= 5 ? "text-red-400 animate-pulse" : timeLeft <= 10 ? "text-amber-300" : "text-emerald-300"}`}>
                ⏳ 查阅倒计时: <span className="font-mono text-sm font-bold">{timeLeft}s</span>
              </span>
              <div className="w-28 h-2 bg-slate-800 rounded-full overflow-hidden border border-white/10">
                <div
                  className={`h-full transition-all duration-300 ${timerColor}`}
                  style={{ width: `${timerPercent}%` }}
                />
              </div>
            </div>

            <div className="flex items-center gap-1 text-xs">
              <button
                onClick={() => setIsTimerRunning((prev) => !prev)}
                className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-white/10 transition text-[11px]"
              >
                {isTimerRunning ? "⏸ 暂停" : "▶ 继续"}
              </button>
              <button
                onClick={handleAddExtraTime}
                className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded border border-white/10 transition text-[11px] font-bold"
              >
                +15s
              </button>
              <button
                onClick={handleResetTimer}
                className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded border border-white/10 transition text-[11px]"
                title="重置60秒"
              >
                ↺
              </button>
            </div>
          </div>

          {/* 右侧：关键指标徽章 */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
            <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700 text-[11px]">
              👥 总人数 <strong className="text-white ml-1">{metrics.total}</strong>
            </span>
            <span className="px-2 py-0.5 rounded-md bg-blue-950/80 text-blue-300 border border-blue-800 text-[11px]">
              🔵 善良 <strong className="text-blue-100 ml-1">{metrics.goodCount}</strong>
            </span>
            <span className="px-2 py-0.5 rounded-md bg-red-950/80 text-red-300 border border-red-800 text-[11px]">
              🔴 邪恶 <strong className="text-red-100 ml-1">{metrics.evilCount}</strong>
            </span>
            <span className="px-2 py-0.5 rounded-md bg-gray-800/90 text-gray-300 border border-gray-700 text-[11px]">
              💀 死亡 <strong className="text-white ml-1">{metrics.deadCount}</strong>
            </span>
            {metrics.abnormalCount > 0 && (
              <span className="px-2 py-0.5 rounded-md bg-emerald-950/80 text-emerald-300 border border-emerald-700 text-[11px] animate-pulse">
                🧪 异常 <strong className="text-emerald-100 ml-1">{metrics.abnormalCount}</strong>
              </span>
            )}
          </div>
        </div>

        {/* ─── 主体双栏区域：左椭圆盘面 (等弧长优化) + 右情报历史 ──────────────────────── */}
        <div className="flex-1 flex flex-col md:flex-row gap-3 min-h-0 overflow-hidden">
          {/* ─── 左栏：椭圆魔典盘面 ────────────────────────────── */}
          <div className="flex-1 flex flex-col bg-slate-950/80 rounded-xl border border-white/10 p-2 min-h-0 overflow-hidden relative shadow-inner">
            <div className="flex items-center justify-between px-2 py-1 border-b border-white/10 shrink-0 z-20 bg-slate-950/90">
              <h3 className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                <span>🪐 椭圆魔典真身分布</span>
                <span className="text-[10px] font-normal text-slate-400">（全周等物理弧长排布 · 互不遮挡）</span>
              </h3>
              {selectedSeatId !== null && (
                <button
                  onClick={() => setSelectedSeatId(null)}
                  className="text-[10px] px-2 py-0.5 rounded bg-amber-900/60 text-amber-200 hover:bg-amber-800 border border-amber-600 transition"
                >
                  ✕ 清除聚焦 (#{selectedSeatId + 1}号)
                </button>
              )}
            </div>

            {/* 椭圆居中展示区：通过等弧长数值积分，在任何椭圆比例下均保持间距绝对恒定 */}
            <div
              ref={ellipseContainerRef}
              className="relative flex-1 w-full h-full flex items-center justify-center p-2 overflow-hidden select-none"
            >
              {/* 椭圆外圈桌台与光环背景 */}
              <div
                style={{
                  width: `${ellipseWidthPct}%`,
                  height: `${ellipseHeightPct}%`,
                }}
                className="absolute rounded-[50%] border border-amber-500/20 bg-gradient-to-b from-slate-900/70 to-slate-950/90 shadow-[inset_0_0_60px_rgba(0,0,0,0.85)] pointer-events-none"
              />
              <div
                style={{
                  width: `${ellipseWidthPct * 0.85}%`,
                  height: `${ellipseHeightPct * 0.85}%`,
                }}
                className="absolute rounded-[50%] border border-dashed border-white/10 pointer-events-none opacity-30"
              />

              {/* 椭圆中心 HUD 信息台 */}
              <div className="absolute z-10 w-[240px] h-[130px] rounded-3xl bg-slate-900/95 border border-amber-400/40 shadow-2xl backdrop-blur-md flex flex-col items-center justify-center p-3 text-center pointer-events-auto">
                <div className="text-amber-400 text-[11px] font-bold tracking-widest uppercase mb-0.5">
                  📖 魔典中心
                </div>
                {selectedSeat ? (
                  <div className="flex flex-col items-center gap-0.5 animate-fadeIn">
                    <span className="text-xs lg:text-sm font-black text-white leading-tight">
                      #{selectedSeat.id + 1}号 · {selectedSeat.role?.name}
                    </span>
                    <span className="text-[10px] text-slate-300">
                      {selectedSeat.role?.type === "townsfolk"
                        ? "镇民"
                        : selectedSeat.role?.type === "outsider"
                          ? "外来者"
                          : selectedSeat.role?.type === "minion"
                            ? "爪牙"
                            : selectedSeat.role?.type === "demon"
                              ? "恶魔"
                              : "旅行者"}
                      {selectedSeat.isDead ? " (已死亡)" : " (存活)"}
                    </span>
                    {selectedSeat.role?.id === "drunk" && selectedSeat.charadeRole && (
                      <span className="text-[9px] text-purple-300 font-medium">
                        伪装: {selectedSeat.charadeRole.name}
                      </span>
                    )}
                    <span className="text-[9px] text-amber-300/90 mt-0.5">
                      👉 右侧已联动展示情报
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-xs text-slate-300 font-medium">
                      点击椭圆周边座位
                    </span>
                    <span className="text-[10px] text-slate-400">
                      聚焦玩家专属夜间情报
                    </span>
                  </div>
                )}
              </div>

              {/* 围绕椭圆等弧长均匀分布的各个座位节点 */}
              {seats.map((seat, index) => {
                if (!seat.role) return null;

                const coord = seatCoords[index] || { x: "50", y: "50" };
                const isSelected = selectedSeatId === seat.id;

                const isDemon = seat.role.type === "demon" || seat.isDemonSuccessor;
                const isMinion = seat.role.type === "minion";
                const isEvil =
                  seat.isEvilConverted ||
                  (!seat.isGoodConverted && (isDemon || isMinion));

                // 阵营着色
                const seatBgClass = seat.isDead
                  ? "bg-slate-900/90 opacity-80"
                  : isDemon
                    ? "bg-gradient-to-br from-red-950 via-slate-900 to-red-950"
                    : isMinion
                      ? "bg-gradient-to-br from-amber-950 via-slate-900 to-orange-950"
                      : isEvil
                        ? "bg-gradient-to-br from-purple-950 via-slate-900 to-red-950"
                        : "bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950";

                const seatBorderClass = isSelected
                  ? "ring-4 ring-amber-400 border-amber-300 shadow-[0_0_20px_rgba(251,191,36,0.8)] scale-110 z-30"
                  : isDemon
                    ? "border-red-500 shadow-[0_0_12px_rgba(239,68,68,0.4)]"
                    : isMinion
                      ? "border-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.3)]"
                      : seat.role.type === "outsider"
                        ? "border-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.3)]"
                        : "border-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.3)]";

                const roleNameColor = isDemon
                  ? "text-red-400"
                  : isMinion
                    ? "text-orange-400"
                    : seat.role.type === "outsider"
                      ? "text-cyan-300"
                      : "text-blue-300";

                const tokens = reminderTokens[seat.id] || [];

                return (
                  <div
                    key={seat.id}
                    onClick={() =>
                      setSelectedSeatId((prev) => (prev === seat.id ? null : seat.id))
                    }
                    style={{
                      left: `${coord.x}%`,
                      top: `${coord.y}%`,
                      transform: "translate(-50%, -50%)",
                    }}
                    className={`absolute ${seatSizeClass} rounded-full border-2 flex flex-col items-center justify-center cursor-pointer transition-all duration-200 select-none z-20 ${seatBgClass} ${seatBorderClass} hover:scale-105`}
                  >
                    {/* 座位序号徽章 - 始终清晰可见 */}
                    <div
                      className={`absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full border flex items-center justify-center text-[10px] font-black z-30 shadow-md ${
                        seat.isDead
                          ? "bg-slate-800 border-slate-600 text-slate-400"
                          : "bg-slate-900 border-amber-400 text-amber-300"
                      }`}
                    >
                      {seat.id + 1}
                    </div>

                    {/* 死亡/幽灵票标记 */}
                    {seat.isDead && (
                      <div className="absolute -top-1.5 -right-1.5 flex items-center gap-0.5 bg-slate-950/90 text-gray-300 border border-slate-700 px-1 py-0.2 rounded-full text-[9px] z-30">
                        💀{seat.hasGhostVote && "👻"}
                      </div>
                    )}

                    {/* 角色名称 */}
                    <span
                      className={`text-[11px] lg:text-xs font-black tracking-tight leading-none text-center ${roleNameColor} ${
                        seat.isDead ? "line-through opacity-80" : ""
                      }`}
                    >
                      {seat.role.name}
                    </span>

                    {/* 酒鬼伪装小字 / 阵营变动 */}
                    {seat.role.id === "drunk" && seat.charadeRole ? (
                      <span className="text-[8px] text-purple-300 scale-90 font-medium whitespace-nowrap leading-none mt-0.5">
                        (伪:{seat.charadeRole.name})
                      </span>
                    ) : (
                      <span className="text-[8px] text-slate-400 scale-90 font-normal leading-none mt-0.5">
                        {seat.role.type === "townsfolk"
                          ? "镇民"
                          : seat.role.type === "outsider"
                            ? "外来者"
                            : seat.role.type === "minion"
                              ? "爪牙"
                              : "恶魔"}
                      </span>
                    )}

                    {/* 状态指示小图标 */}
                    <div className="flex items-center gap-0.5 mt-0.5">
                      {seat.isPoisoned && <span title="中毒" className="text-[8px]">🧪</span>}
                      {seat.isDrunk && seat.role.id !== "drunk" && <span title="醉酒" className="text-[8px]">🍺</span>}
                      {seat.isProtected && <span title="受保护" className="text-[8px]">🛡️</span>}
                      {seat.isRedHerring && <span title="红罗刹" className="text-[8px]">🎯</span>}
                      {tokens.length > 0 && <span title="有提醒标记" className="text-[8px]">🏷️</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ─── 右栏：每个玩家每个晚上做了什么、得知了什么 ──────── */}
          <div className="w-full md:w-[380px] lg:w-[420px] shrink-0 flex flex-col bg-slate-950/80 rounded-xl border border-white/10 p-3 min-h-0 overflow-hidden shadow-inner">
            {/* 顶部 Tab 过滤栏 */}
            <div className="flex flex-wrap items-center gap-1.5 mb-2 pb-2 border-b border-white/10 shrink-0">
              <button
                onClick={() => setActiveTab("all")}
                className={`text-xs px-2.5 py-1 rounded-lg font-bold transition ${
                  activeTab === "all"
                    ? "bg-indigo-600 text-white shadow"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                全部行动与情报
              </button>
              <button
                onClick={() => setActiveTab("night-0")}
                className={`text-xs px-2.5 py-1 rounded-lg font-bold transition ${
                  activeTab === "night-0"
                    ? "bg-indigo-600 text-white shadow"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                首夜
              </button>
              {availableNights.map((n) => (
                <button
                  key={n}
                  onClick={() => setActiveTab(`night-${n}`)}
                  className={`text-xs px-2.5 py-1 rounded-lg font-bold transition ${
                    activeTab === `night-${n}`
                      ? "bg-indigo-600 text-white shadow"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  第 {n + 1} 夜
                </button>
              ))}
              <button
                onClick={() => setActiveTab("day")}
                className={`text-xs px-2.5 py-1 rounded-lg font-bold transition ${
                  activeTab === "day"
                    ? "bg-indigo-600 text-white shadow"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                ☀️ 白天
              </button>
            </div>

            {/* 情报与行动列表 */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-2">
              {filteredLogs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 p-6 text-center">
                  <span className="text-3xl mb-2">📜</span>
                  <p className="text-sm font-bold">暂无对应行动或情报记录</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {selectedSeatId !== null
                      ? `该玩家（#${selectedSeatId + 1}号）尚未有记录在册的夜间行动或已知信息`
                      : "当前阶段尚未产生夜间操作日志"}
                  </p>
                </div>
              ) : (
                filteredLogs.map((log) => {
                  // 卡片样式根据日志类型标色
                  const isInfo = log.isInfo;
                  const isKill = log.isKillOrDeath;
                  const isStatus = log.isStatus;

                  const borderClass = isKill
                    ? "border-red-900/60 bg-red-950/20"
                    : isInfo
                      ? "border-cyan-900/60 bg-cyan-950/20"
                      : isStatus
                        ? "border-emerald-900/60 bg-emerald-950/20"
                        : "border-slate-800 bg-slate-900/40";

                  const badgeClass = isKill
                    ? "bg-red-900 text-red-200 border-red-700"
                    : isInfo
                      ? "bg-cyan-900 text-cyan-200 border-cyan-700"
                      : isStatus
                        ? "bg-emerald-900 text-emerald-200 border-emerald-700"
                        : "bg-slate-800 text-slate-300 border-slate-700";

                  const phaseLabel =
                    log.phase === "firstNight"
                      ? "首夜"
                      : log.phase === "night"
                        ? `第 ${log.day + 1} 夜`
                        : log.phase === "day"
                          ? `第 ${log.day + 1} 天`
                          : log.phase === "dusk"
                            ? `第 ${log.day + 1} 天黄昏`
                            : "黎明";

                  return (
                    <div
                      key={log.id}
                      className={`p-2.5 rounded-xl border text-xs leading-relaxed transition ${borderClass}`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold border ${badgeClass}`}>
                            {phaseLabel}
                          </span>
                          {isInfo && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/80 text-blue-200 border border-blue-700 font-bold">
                              🔮 查验/得知情报
                            </span>
                          )}
                          {isKill && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/80 text-red-200 border border-red-700 font-bold">
                              ⚔️ 击杀/处决
                            </span>
                          )}
                          {isStatus && !isInfo && !isKill && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/80 text-emerald-200 border border-emerald-700 font-bold">
                              🧪 状态更迭
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 日志内容文本 */}
                      <div className="text-slate-100 font-medium select-text whitespace-pre-wrap">
                        {log.formattedText}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </ModalWrapper>
  );
}

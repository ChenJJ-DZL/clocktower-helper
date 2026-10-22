"use client";

import type React from "react";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
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
 * 避免普通极坐标在椭圆左右两侧挤压重叠的问题
 */
function useUniformEllipseLayout(
  total: number,
  containerRef: React.RefObject<HTMLDivElement | null>
) {
  const [dimensions, setDimensions] = useState({ width: 580, height: 400 });

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
    if (total <= 0)
      return { coords: [], A: 220, B: 140, width: 580, height: 400 };
    const { width, height } = dimensions;

    // 动态留出边距（根据人数微调）
    const seatMargin = total > 15 ? 36 : 42;
    const A = Math.max(70, width / 2 - seatMargin);
    const B = Math.max(55, height / 2 - seatMargin);

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
      const fraction =
        nextArc > prevArc ? (targetArc - prevArc) / (nextArc - prevArc) : 0;
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
  nightCount: _nightCount = 1,
  reminderTokens = {},
  isPortrait: _isPortrait = false,
}: SpyGrimoireModalProps) {
  // TEMP-PROBE: 每秒一次空转重渲染，用于验证「驱动器依赖周期重渲染」假设
  const [, forceTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => forceTick((x: number) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // ─── 当前选中聚焦的座位（用于圆桌点击联动右侧情报） ───────────────────────
  const [selectedSeatId, setSelectedSeatId] = useState<number | null>(null);

  // ─── 全屏圆桌视图 ─────────────────────────────────────────────────────
  const [isFullscreenTable, setIsFullscreenTable] = useState(false);
  const [fullscreenActiveTab, setFullscreenActiveTab] = useState<string>("all");

  // ─── 右侧日志的筛选 Tab（"all" | "night-0" (首夜) | "night-1" | "night-2" ... | "day"） ──
  const [activeTab, setActiveTab] = useState<string>("all");

  // 椭圆容器 Ref 用于等弧长尺寸测量
  const ellipseContainerRef = useRef<HTMLDivElement>(null);
  const {
    coords: seatCoords,
    A,
    B,
    width: containerWidth,
    height: containerHeight,
  } = useUniformEllipseLayout(seats.length, ellipseContainerRef);

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
      const isEvil =
        s.isEvilConverted || (!s.isGoodConverted && (isDemon || isMinion));
      if (isEvil) evilCount++;
      else goodCount++;
    });

    return { total, goodCount, evilCount, deadCount, abnormalCount };
  }, [seats]);

  // 格式化与分类日志（只记录游戏进入首夜后的情况，过滤开始前准备与换座位）
  const parsedLogs = useMemo(() => {
    const rawList = gameLogs || [];

    const validInGamePhases = new Set([
      "firstNight",
      "day",
      "dusk",
      "night",
      "dawnReport",
      "gameOver",
    ]);

    return rawList
      .filter((log) => {
        if (!log || typeof log.message !== "string") return false;
        const msg = log.message;

        // 1. 过滤系统调试与热重载信息
        if (
          msg.startsWith("[系统]") ||
          msg.startsWith("[能力执行]") ||
          msg.startsWith("[handleDrunkCharadeSelect]") ||
          msg.startsWith("[Fast Refresh]")
        ) {
          return false;
        }

        // 2. 过滤非游戏内阶段（setup, check, scriptSelection 等入夜前阶段）
        if (!log.phase || !validInGamePhases.has(log.phase)) {
          return false;
        }

        // 3. 过滤游戏开始前的准备信息与换座位记录（只记录游戏进入首夜后的情况）
        if (
          msg.includes("互换了座位") ||
          msg.includes("交换了座位") ||
          msg.includes("换了座位") ||
          msg.includes("配置角色") ||
          msg.includes("发牌") ||
          msg.includes("准备阶段")
        ) {
          return false;
        }

        return true;
      })
      .map((log, index) => {
      let text = (log.summary ?? log.message).trim().replace(/^\[能力\]\s*/, "");

        // 提取本条日志涉及的座位号（0-indexed）
        const involvedSeats = new Set<number>();

        // 1. 从文字显式 "X号" 提取座位号
        const seatMatches = text.matchAll(/(\d+)\s*号/g);
        for (const m of seatMatches) {
          const seatNum = parseInt(m[1], 10);
          if (
            !Number.isNaN(seatNum) &&
            seatNum >= 1 &&
            seatNum <= seats.length
          ) {
            involvedSeats.add(seatNum - 1);
          }
        }

        // 2. 智能关联在场角色/伪装角色/玩家姓名对应座位（共性兜底：无论日志是否包含座位号均可精准关联）
        seats.forEach((s) => {
          const rName = s.role?.name;
          const cName = s.charadeRole?.name;
          const pName = s.playerName;
          if (rName && text.includes(rName)) {
            involvedSeats.add(s.id);
          }
          if (cName && text.includes(cName)) {
            involvedSeats.add(s.id);
          }
          if (pName && text.includes(pName)) {
            involvedSeats.add(s.id);
          }
        });

        // 3. 补全未带座位号的角色开头（如 "厨师获得信息..." -> "【6号-厨师】获得信息..."）
        seats.forEach((s) => {
          const rName = s.role?.name;
          if (
            rName &&
            text.startsWith(rName) &&
            !text.startsWith(`【${s.id + 1}号`) &&
            !text.startsWith(`${s.id + 1}号`)
          ) {
            text = text.replace(rName, `【${s.id + 1}号-${rName}】`);
          }
        });

        // 优化将形如 "1号(slayer)" / "1号(猎手)" / "玩家1(1号)" 转为规范高亮标签
        text = text.replace(
          /【?玩家(\d+)】?\s*[(（](\d+)\s*号(?:[ -]([^\s()（）]+))?[)）]/gi,
          (_, num1, num2, roleText) => {
            const num = parseInt(num2 || num1, 10);
            const roleName =
              roleText ||
              seatRoleMap.get(num) ||
              roleNameMap.get(roleText) ||
              "";
            return roleName ? `【${num}号-${roleName}】` : `【${num}号】`;
          }
        );
        text = text.replace(
          /(\d+)\s*号(?:玩家|[位者])?\s*[(（]([a-zA-Z_\u4e00-\u9fa5]+)[)）]/gi,
          (_, numStr, roleIdOrName) => {
            const num = parseInt(numStr, 10);
            const cn =
              roleNameMap.get(roleIdOrName) ||
              roleIdOrName ||
              seatRoleMap.get(num);
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
  }, [gameLogs, seatRoleMap, seats]);

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
      return list.filter(
        (item) =>
          item.phase === "firstNight" ||
          (item.day === 0 && item.phase !== "day" && item.phase !== "dusk")
      );
    } else if (activeTab.startsWith("night-")) {
      const targetNight = parseInt(activeTab.replace("night-", ""), 10);
      return list.filter(
        (item) =>
          item.day === targetNight &&
          (item.phase === "night" || item.phase === "dawnReport")
      );
    } else if (activeTab === "day") {
      return list.filter(
        (item) => item.phase === "day" || item.phase === "dusk"
      );
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
      return "w-11 h-11 lg:w-12 lg:h-12";
    } else if (seats.length > 12) {
      return "w-13 h-13 lg:w-14 lg:h-14";
    } else {
      return "w-14 h-14 lg:w-15 lg:h-15";
    }
  }, [seats.length]);

  if (!isOpen) return null;

  const selectedSeat =
    selectedSeatId !== null ? seats.find((s) => s.id === selectedSeatId) : null;

  // 椭圆底盘宽度/高度百分比
  const ellipseWidthPct =
    containerWidth > 0 ? ((2 * A) / containerWidth) * 100 : 88;
  const ellipseHeightPct =
    containerHeight > 0 ? ((2 * B) / containerHeight) * 100 : 88;

  return (
    <>
    <ModalWrapper
      title="📖 间谍椭圆魔典 (全知全景)"
      onClose={onClose}
      className="max-w-7xl w-[96vw] h-[88vh] flex flex-col p-0 overflow-hidden"
      footer={
        <div className="w-full flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-amber-200/90 font-medium">
            <span className="text-base">💡</span>
            <span>
              椭圆魔典采用严格等弧长物理等距排布，互不挤压遮挡；点击椭圆上任意座位可即时联动右侧情报
            </span>
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
        {/* ─── 顶部条：不限时说明 + 统计指标 ─────────────────────── */}
        <div className="bg-slate-950/80 p-2.5 rounded-xl border border-white/10 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* 官方【运作方式】：让间谍按自己意愿的时长查看魔典 ⇒ 不设倒计时 */}
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
            <span>⏳ 不限时 —— 按自己意愿的时长查看魔典</span>
          </div>

          {/* 右侧：关键指标徽章 */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
            <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700 text-[11px]">
              👥 总人数{" "}
              <strong className="text-white ml-1">{metrics.total}</strong>
            </span>
            <span className="px-2 py-0.5 rounded-md bg-blue-950/80 text-blue-300 border border-blue-800 text-[11px]">
              🔵 善良{" "}
              <strong className="text-blue-100 ml-1">
                {metrics.goodCount}
              </strong>
            </span>
            <span className="px-2 py-0.5 rounded-md bg-red-950/80 text-red-300 border border-red-800 text-[11px]">
              🔴 邪恶{" "}
              <strong className="text-red-100 ml-1">{metrics.evilCount}</strong>
            </span>
            <span className="px-2 py-0.5 rounded-md bg-gray-800/90 text-gray-300 border border-gray-700 text-[11px]">
              💀 死亡{" "}
              <strong className="text-white ml-1">{metrics.deadCount}</strong>
            </span>
            {metrics.abnormalCount > 0 && (
              <span className="px-2 py-0.5 rounded-md bg-emerald-950/80 text-emerald-300 border border-emerald-700 text-[11px] animate-pulse">
                🧪 异常{" "}
                <strong className="text-emerald-100 ml-1">
                  {metrics.abnormalCount}
                </strong>
              </span>
            )}
          </div>
        </div>

        {/* ─── 主体双栏区域：左椭圆盘面 (50%) + 右情报历史 (50%) ──────────────────────── */}
        <div className="flex-1 flex flex-col md:flex-row gap-3 min-h-0 overflow-hidden">
          {/* ─── 左栏：椭圆魔典盘面 (50% 宽) ────────────────────────────── */}
          <div className="w-full md:w-1/2 md:flex-1 flex flex-col bg-slate-950/80 rounded-xl border border-white/10 p-2 min-h-0 overflow-hidden relative shadow-inner">
            <div className="flex items-center justify-between px-2 py-1 border-b border-white/10 shrink-0 z-20 bg-slate-950/90">
              <h3 className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                <span>🪐 椭圆魔典真身分布</span>
                <span className="text-[10px] font-normal text-slate-400">
                  （全周等物理弧长排布）
                </span>
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
              className="relative flex-1 w-full h-full flex items-center justify-center p-1.5 overflow-hidden select-none"
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
                  width: `${ellipseWidthPct * 0.84}%`,
                  height: `${ellipseHeightPct * 0.84}%`,
                }}
                className="absolute rounded-[50%] border border-dashed border-white/10 pointer-events-none opacity-30"
              />

              {/* 椭圆中心 HUD 信息台 */}
              <div className="absolute z-10 w-[190px] h-[110px] lg:w-[210px] lg:h-[120px] rounded-2xl bg-slate-900/95 border border-amber-400/40 shadow-2xl backdrop-blur-md flex flex-col items-center justify-center p-2 text-center pointer-events-auto">
                <div className="text-amber-400 text-[10px] font-bold tracking-widest uppercase mb-0.5">
                  📖 魔典中心
                </div>
                {selectedSeat ? (
                  <div className="flex flex-col items-center gap-0.5 animate-fadeIn">
                    <span className="text-xs font-black text-white leading-tight">
                      #{selectedSeat.id + 1}号 · {selectedSeat.role?.name}
                    </span>
                    <span className="text-[9px] text-slate-300">
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
                    {selectedSeat.role?.id === "drunk" &&
                      selectedSeat.charadeRole && (
                        <span className="text-[8px] text-purple-300 font-medium">
                          伪装: {selectedSeat.charadeRole.name}
                        </span>
                      )}
                    <span className="text-[8px] text-amber-300/90 mt-0.5">
                      👉 右侧已联动展示情报
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-[11px] text-slate-300 font-medium">
                      点击椭圆周边座位
                    </span>
                    <span className="text-[9px] text-slate-400">
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

                const isDemon =
                  seat.role.type === "demon" || seat.isDemonSuccessor;
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
                      setSelectedSeatId((prev) =>
                        prev === seat.id ? null : seat.id
                      )
                    }
                    style={{
                      left: `${coord.x}%`,
                      top: `${coord.y}%`,
                      transform: "translate(-50%, -50%)",
                    }}
                    className={`absolute ${seatSizeClass} rounded-full border-2 flex flex-col items-center justify-center cursor-pointer transition-all duration-200 select-none z-20 ${seatBgClass} ${seatBorderClass} hover:scale-105`}
                  >
                    {/* 座位序号徽章 - 圆心位于角色外圈上 */}
                    <div
                      className={`absolute left-[14.6%] top-[14.6%] -translate-x-1/2 -translate-y-1/2 w-4 h-4 lg:w-4.5 lg:h-4.5 rounded-full border flex items-center justify-center text-[9px] font-black z-30 shadow-md ${
                        seat.isDead
                          ? "bg-slate-800 border-slate-600 text-slate-400"
                          : "bg-slate-900 border-amber-400 text-amber-300"
                      }`}
                    >
                      {seat.id + 1}
                    </div>

                    {/* 死亡/幽灵票标记 */}
                    {seat.isDead && (
                      <div className="absolute -top-1.5 -right-1.5 flex items-center gap-0.5 bg-slate-950/90 text-gray-300 border border-slate-700 px-1 py-0.2 rounded-full text-[8px] z-30">
                        💀{seat.hasGhostVote && "👻"}
                      </div>
                    )}

                    {/* 角色名称 */}
                    <span
                      className={`text-[10px] lg:text-[11px] font-black tracking-tight leading-none text-center ${roleNameColor} ${
                        seat.isDead ? "line-through opacity-80" : ""
                      }`}
                    >
                      {seat.role.name}
                    </span>

                    {/* 酒鬼伪装小字 / 阵营变动 */}
                    {seat.role.id === "drunk" && seat.charadeRole ? (
                      <span className="text-[7.5px] text-purple-300 scale-90 font-medium whitespace-nowrap leading-none mt-0.5">
                        (伪:{seat.charadeRole.name})
                      </span>
                    ) : (
                      <span className="text-[7.5px] text-slate-400 scale-90 font-normal leading-none mt-0.5">
                        {seat.role.type === "townsfolk"
                          ? "镇民"
                          : seat.role.type === "outsider"
                            ? "外来者"
                            : seat.role.type === "minion"
                              ? "爪牙"
                              : "恶魔"}
                      </span>
                    )}

                    {/* 状态指示徽章群（与说书人魔典视角完全一致） */}
                    <div className="flex flex-wrap items-center justify-center gap-0.5 mt-0.5 max-w-[90%]">
                      {seat.isPoisoned && (
                        <span className="text-[7.5px] px-1 py-0.2 rounded bg-green-950/90 text-green-300 border border-green-700 font-bold whitespace-nowrap">
                          🧪中毒
                        </span>
                      )}
                      {seat.isDrunk && seat.role.id !== "drunk" && (
                        <span className="text-[7.5px] px-1 py-0.2 rounded bg-amber-950/90 text-amber-300 border border-amber-700 font-bold whitespace-nowrap">
                          🍺醉酒
                        </span>
                      )}
                      {seat.isProtected && (
                        <span className="text-[7.5px] px-1 py-0.2 rounded bg-blue-950/90 text-blue-300 border border-blue-700 font-bold whitespace-nowrap">
                          🛡️守护
                        </span>
                      )}
                      {seat.isRedHerring && (
                        <span className="text-[7.5px] px-1 py-0.2 rounded bg-red-950/90 text-red-300 border border-red-700 font-bold whitespace-nowrap">
                          🎯红罗刹
                        </span>
                      )}
                      {seat.isDemonSuccessor && (
                        <span className="text-[7.5px] px-1 py-0.2 rounded bg-purple-950/90 text-purple-300 border border-purple-700 font-bold whitespace-nowrap">
                          💋继任
                        </span>
                      )}
                      {tokens.map((token, tIdx) => (
                        <span
                          key={tIdx}
                          className="text-[7px] px-1 py-0.2 rounded bg-slate-800 text-amber-200 border border-slate-600 font-medium truncate max-w-[40px]"
                          title={token.label}
                        >
                          🏷️{token.label}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 全屏按钮 - 左下角 */}
            <button
              onClick={() => {
                const latestNight = parsedLogs.reduce((max, item) => {
                  if (item.phase === "firstNight" || item.phase === "night") {
                    return Math.max(max, item.day ?? 0);
                  }
                  return max;
                }, -1);
                setFullscreenActiveTab(
                  latestNight >= 0 ? `night-${latestNight}` : activeTab
                );
                setIsFullscreenTable(true);
              }}
              className="absolute bottom-2 left-2 z-30 px-2.5 py-1.5 rounded-lg bg-slate-800/90 text-amber-200 text-[11px] font-bold border border-amber-500/40 hover:bg-slate-700 hover:border-amber-400 transition-all shadow-lg backdrop-blur-sm active:scale-95"
            >
              ⛶ 全屏
            </button>
          </div>

          {/* ─── 右栏：每个玩家每个晚上做了什么、得知了什么 (50% 宽) ──────── */}
          <div className="w-full md:w-1/2 md:flex-1 min-w-0 flex flex-col bg-slate-950/80 rounded-xl border border-white/10 p-3 min-h-0 overflow-hidden shadow-inner">
            {/* 顶部 Tab 过滤栏 */}
            <div className="flex flex-wrap items-center justify-between gap-1.5 mb-2 pb-2 border-b border-white/10 shrink-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => setActiveTab("all")}
                  className={`text-xs px-3 py-1.5 rounded-lg font-bold transition ${
                    activeTab === "all"
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/40"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  全部行动与情报
                </button>
                <button
                  onClick={() => setActiveTab("night-0")}
                  className={`text-xs px-3 py-1.5 rounded-lg font-bold transition ${
                    activeTab === "night-0"
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/40"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  首夜
                </button>
                {availableNights.map((n) => (
                  <button
                    key={n}
                    onClick={() => setActiveTab(`night-${n}`)}
                    className={`text-xs px-3 py-1.5 rounded-lg font-bold transition ${
                      activeTab === `night-${n}`
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/40"
                        : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                    }`}
                  >
                    第 {n + 1} 夜
                  </button>
                ))}
                <button
                  onClick={() => setActiveTab("day")}
                  className={`text-xs px-3 py-1.5 rounded-lg font-bold transition ${
                    activeTab === "day"
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/40"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  ☀️ 白天事件
                </button>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {filteredLogs.length > 0 && (
                  <span className="text-[10px] text-slate-500 font-bold whitespace-nowrap">
                    ⇅ 上下滑动查看全部
                  </span>
                )}

                {selectedSeat && (
                  <div className="flex items-center gap-1.5 text-xs bg-amber-950/60 border border-amber-500/40 px-2.5 py-1 rounded-lg">
                    <span className="text-amber-300 font-bold">
                      🎯 聚焦 #{selectedSeat.id + 1}号 · {selectedSeat.role?.name}
                    </span>
                    <button
                      onClick={() => setSelectedSeatId(null)}
                      className="text-slate-400 hover:text-white font-bold ml-1 text-xs"
                      title="取消玩家聚焦"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* 情报与行动列表（宽幅舒适展示）：超出部分靠上下滑动查看 */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1.5 space-y-2.5">
              {filteredLogs.length === 0 ? (
                /* 「暂无记录」空态 */
                <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center">
                  <span className="text-4xl mb-3 opacity-60">📜</span>
                  <p className="text-sm font-bold text-slate-300">
                    暂无对应行动或情报记录
                  </p>
                  <p className="text-xs text-slate-500 mt-1.5">
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
                    ? "border-red-900/70 bg-gradient-to-r from-red-950/40 to-slate-900/50"
                    : isInfo
                      ? "border-cyan-900/70 bg-gradient-to-r from-cyan-950/40 to-slate-900/50"
                      : isStatus
                        ? "border-emerald-900/70 bg-gradient-to-r from-emerald-950/40 to-slate-900/50"
                        : "border-slate-800 bg-slate-900/50";

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
                      className={`p-3 rounded-xl border text-sm leading-relaxed transition shadow-sm ${borderClass}`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[11px] px-2 py-0.5 rounded font-mono font-bold border ${badgeClass}`}
                          >
                            {phaseLabel}
                          </span>
                          {isInfo && (
                            <span className="text-[11px] px-2 py-0.5 rounded bg-blue-900/80 text-blue-200 border border-blue-700 font-bold flex items-center gap-1">
                              <span>🔮</span> 查验/得知情报
                            </span>
                          )}
                          {isKill && (
                            <span className="text-[11px] px-2 py-0.5 rounded bg-red-900/80 text-red-200 border border-red-700 font-bold flex items-center gap-1">
                              <span>⚔️</span> 击杀/处决
                            </span>
                          )}
                          {isStatus && !isInfo && !isKill && (
                            <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-900/80 text-emerald-200 border border-emerald-700 font-bold flex items-center gap-1">
                              <span>🧪</span> 状态更迭
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 日志内容文本 */}
                      <div className="text-slate-100 font-medium select-text whitespace-pre-wrap pl-0.5">
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

    {/* 全屏当晚行动记录视图 — Portal 直接挂 document.body，绕过 ScaleLayout 的 transform 缩放 */}
    {isFullscreenTable &&
      (() => {
        const seatFilterOptions = [
          { value: "all" as const, label: "全部座位" },
          ...seats.map((seat) => ({
            value: seat.id,
            label: `#${seat.id + 1}号${seat.role?.name ? ` · ${seat.role.name}` : ""}`,
          })),
        ];

        const normalizeTab = (tab: string) => {
          if (tab === "all" || tab === "day") return tab;
          if (tab.startsWith("night-")) return tab;
          return "all";
        };

        const effectiveFullscreenTab = normalizeTab(fullscreenActiveTab);

        let fullscreenLogs = parsedLogs;
        if (effectiveFullscreenTab === "night-0") {
          fullscreenLogs = parsedLogs.filter(
            (item) =>
              item.phase === "firstNight" ||
              (item.day === 0 && item.phase !== "day" && item.phase !== "dusk")
          );
        } else if (effectiveFullscreenTab.startsWith("night-")) {
          const target = parseInt(effectiveFullscreenTab.replace("night-", ""), 10);
          fullscreenLogs = parsedLogs.filter(
            (item) =>
              item.day === target &&
              (item.phase === "night" || item.phase === "dawnReport")
          );
        } else if (effectiveFullscreenTab === "day") {
          fullscreenLogs = parsedLogs.filter(
            (item) => item.phase === "day" || item.phase === "dusk"
          );
        }

        if (selectedSeatId !== null) {
          fullscreenLogs = fullscreenLogs.filter((item) =>
            item.involvedSeats.includes(selectedSeatId)
          );
        }

        const fullscreenNightOptions = Array.from(
          parsedLogs.reduce((set, item) => {
            if (item.phase === "firstNight" || item.phase === "night") {
              set.add(item.day ?? 0);
            }
            return set;
          }, new Set<number>())
        ).sort((a, b) => a - b);

        const seatChip = (seat: Seat) => {
          const isDemon = seat.role?.type === "demon" || seat.isDemonSuccessor;
          const isMinion = seat.role?.type === "minion";
          const isOutsider = seat.role?.type === "outsider";
          const isEvil = seat.isEvilConverted || (!seat.isGoodConverted && (isDemon || isMinion));

          const bg = seat.isDead
            ? "bg-slate-900/90"
            : isDemon
              ? "bg-red-950/80"
              : isMinion
                ? "bg-amber-950/80"
                : isEvil
                  ? "bg-purple-950/80"
                  : "bg-slate-900/80";
          const border = seat.isDead
            ? "border-slate-700"
            : isDemon
              ? "border-red-600"
              : isMinion
                ? "border-orange-500"
                : isOutsider
                  ? "border-cyan-500"
                  : "border-amber-500/70";
          const text = seat.isDead
            ? "text-slate-300"
            : isDemon
              ? "text-red-300"
              : isMinion
                ? "text-orange-300"
                : isOutsider
                  ? "text-cyan-200"
                  : "text-blue-200";

          return (
            <div
              key={seat.id}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${bg} ${border} ${text}`}
            >
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-900 border border-amber-500/70 text-amber-200 text-[11px] font-black">
                {seat.id + 1}
              </span>
              <span className="truncate max-w-[88px]">{seat.role?.name || "未知角色"}</span>
              <span className="text-[10px] text-slate-300 font-medium">
                {seat.isDead ? "已死亡" : "存活"}
              </span>
            </div>
          );
        };

        return createPortal(
          <div
            style={{ position: "fixed", inset: 0, zIndex: 2147483647 }}
            className="bg-slate-950 select-none flex flex-col"
            onClick={() => setIsFullscreenTable(false)}
          >
            <div className="absolute top-2 right-2 z-[10] flex items-center gap-3">
              <button
                onClick={(e) => { e.stopPropagation(); setIsFullscreenTable(false); }}
                className="px-6 py-3 rounded-2xl bg-slate-800/95 text-amber-200 text-lg font-black border-2 border-amber-500/60 hover:bg-slate-700 transition active:scale-95 cursor-pointer shadow-lg"
              >
                ⊟ 缩小
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setIsFullscreenTable(false); }}
                className="px-8 py-4 rounded-2xl bg-slate-800/95 text-amber-200 text-xl font-black border-2 border-amber-500/60 hover:bg-slate-700 transition active:scale-95 cursor-pointer shadow-lg"
              >
                ✕ 退出全屏
              </button>
            </div>

            <div
              className="relative flex flex-col flex-1 min-h-0 p-2 sm:p-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col flex-1 min-h-0 rounded-3xl border border-amber-500/40 bg-slate-950/95 shadow-2xl backdrop-blur-xl overflow-hidden">
                <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4 border-b border-white/10 bg-slate-950/90 shrink-0">
                  <div className="flex flex-col gap-1">
                    <div className="text-amber-400 font-black tracking-widest text-xs sm:text-sm">
                      📖 间谍全屏 · 当晚行动记录
                    </div>
                    <div className="text-white font-black text-lg sm:text-xl leading-tight">
                      {seats.filter((s) => s.isDead).length > 0
                        ? `${seats.filter((s) => !s.isDead).length}人存活`
                        : `${seats.length}人局`}
                    </div>
                    <div className="text-cyan-300 font-bold text-xs sm:text-sm">
                      {seats.filter((s) => s.isDead).length > 0
                        ? `${seats.filter((s) => s.isDead).length}人死亡`
                        : "全员存活"}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-300">
                    <select
                      value={selectedSeatId ?? "all"}
                      onChange={(e) => {
                        const value = e.target.value;
                        setSelectedSeatId(value === "all" ? null : Number(value));
                      }}
                      className="rounded-xl border border-amber-500/40 bg-slate-900/90 px-3 py-2 text-xs text-amber-100 font-bold shadow-inner"
                    >
                      {seatFilterOptions.map((option) => (
                        <option key={String(option.value)} value={String(option.value)}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-white/10 bg-slate-950/80 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); setFullscreenActiveTab("all"); }}
                    className={`text-sm px-4 py-2 rounded-xl font-bold transition ${
                      effectiveFullscreenTab === "all"
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/40"
                        : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                    }`}
                  >
                    全部行动与情报
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setFullscreenActiveTab("night-0"); }}
                    className={`text-sm px-4 py-2 rounded-xl font-bold transition ${
                      effectiveFullscreenTab === "night-0"
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/40"
                        : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                    }`}
                  >
                    首夜
                  </button>
                  {fullscreenNightOptions.map((night) => (
                    <button
                      key={night}
                      onClick={(e) => { e.stopPropagation(); setFullscreenActiveTab(`night-${night}`); }}
                      className={`text-sm px-4 py-2 rounded-xl font-bold transition ${
                        effectiveFullscreenTab === `night-${night}`
                          ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/40"
                          : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                      }`}
                    >
                      第 {night + 1} 夜
                    </button>
                  ))}
                  <button
                    onClick={(e) => { e.stopPropagation(); setFullscreenActiveTab("day"); }}
                    className={`text-sm px-4 py-2 rounded-xl font-bold transition ${
                      effectiveFullscreenTab === "day"
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/40"
                        : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                    }`}
                  >
                    ☀️ 白天事件
                  </button>
                </div>

                <div className="flex items-center gap-2 px-3 py-2 overflow-x-auto border-b border-white/5 bg-slate-950/70 shrink-0">
                  {seats.map((seat) => seatChip(seat))}
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-2 space-y-3">
                  {fullscreenLogs.length === 0 ? (
                    /* 「暂无当晚行动记录」空态 */
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center">
                      <span className="text-5xl mb-4 opacity-60">📜</span>
                      <p className="text-base font-bold text-slate-200">
                        暂无当晚行动记录
                      </p>
                      <p className="text-sm text-slate-400 mt-2 max-w-xl">
                        选择的阶段或聚焦的座位暂无对应的夜间行动日志，可切换阶段或清除座位聚焦后再试。
                      </p>
                    </div>
                  ) : (
                    fullscreenLogs.map((log) => {
                      const borderClass = log.isKillOrDeath
                        ? "border-red-900/70 bg-gradient-to-r from-red-950/50 to-slate-900/60"
                        : log.isInfo
                          ? "border-cyan-900/70 bg-gradient-to-r from-cyan-950/50 to-slate-900/60"
                          : log.isStatus
                            ? "border-emerald-900/70 bg-gradient-to-r from-emerald-950/50 to-slate-900/60"
                            : "border-slate-800 bg-slate-900/60";
                      const badgeClass = log.isKillOrDeath
                        ? "bg-red-900 text-red-200 border-red-700"
                        : log.isInfo
                          ? "bg-cyan-900 text-cyan-200 border-cyan-700"
                          : log.isStatus
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
                          key={`fullscreen-${log.id}`}
                          className={`p-4 rounded-2xl border text-base leading-relaxed transition shadow-sm ${borderClass}`}
                        >
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span
                              className={`text-xs px-2.5 py-1 rounded font-mono font-bold border ${badgeClass}`}
                            >
                              {phaseLabel}
                            </span>
                            {log.isInfo && (
                              <span className="text-xs px-2.5 py-1 rounded bg-blue-900/80 text-blue-200 border border-blue-700 font-bold flex items-center gap-1">
                                <span>🔮</span> 查验/得知情报
                              </span>
                            )}
                            {log.isKillOrDeath && (
                              <span className="text-xs px-2.5 py-1 rounded bg-red-900/80 text-red-200 border border-red-700 font-bold flex items-center gap-1">
                                <span>⚔️</span> 击杀/处决
                              </span>
                            )}
                            {log.isStatus && !log.isInfo && !log.isKillOrDeath && (
                              <span className="text-xs px-2.5 py-1 rounded bg-emerald-900/80 text-emerald-200 border border-emerald-700 font-bold flex items-center gap-1">
                                <span>🧪</span> 状态更迭
                              </span>
                            )}
                          </div>
                          <div className="text-slate-100 font-semibold select-text whitespace-pre-wrap">
                            {log.formattedText}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body
        );
      })()
    }
    </>
  );
}

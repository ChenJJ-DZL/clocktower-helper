"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
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

export function SpyGrimoireModal({
  isOpen,
  onClose,
  seats,
  gameLogs = [],
  nightCount = 1,
  reminderTokens = {},
  isPortrait = false,
}: SpyGrimoireModalProps) {
  // ─── 倒计时器状态 ────────────────────────────────────────────────────────
  const INITIAL_TIMER_SECONDS = 30;
  const [timeLeft, setTimeLeft] = useState(INITIAL_TIMER_SECONDS);
  const [isTimerRunning, setIsTimerRunning] = useState(true);

  // ─── 当前选中聚焦的座位（用于左侧点击联动右侧情报） ───────────────────────
  const [selectedSeatId, setSelectedSeatId] = useState<number | null>(null);

  // ─── 右侧日志的筛选 Tab（"all" | "night-0" (首夜) | "night-1" | "night-2" ... | "day"） ──
  const [activeTab, setActiveTab] = useState<string>("all");

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

  if (!isOpen) return null;

  // 倒计时百分比
  const timerPercent = Math.max(0, Math.min(100, (timeLeft / INITIAL_TIMER_SECONDS) * 100));
  const timerColor =
    timeLeft <= 5
      ? "bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.8)]"
      : timeLeft <= 10
        ? "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.6)]"
        : "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]";

  return (
    <ModalWrapper
      title="📖 间谍专属魔典 (全知全览)"
      onClose={onClose}
      className="max-w-7xl w-[95vw] h-[88vh] flex flex-col p-0 overflow-hidden"
      footer={
        <div className="w-full flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-amber-200/90 font-medium">
            <span className="text-base">💡</span>
            <span>间谍查看魔典不受中毒/醉酒虚假信息干扰（全知真实盘面与历史），点击左侧卡片可高亮联动该玩家情报</span>
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
      <div className="flex flex-col h-full gap-3 overflow-hidden">
        {/* ─── 顶部条：限时倒计时 + 统计指标 ─────────────────────────────── */}
        <div className="bg-slate-950/80 p-3 rounded-xl border border-white/10 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* 左侧：倒计时控制 */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className={`text-sm font-black tracking-wide ${timeLeft <= 5 ? "text-red-400 animate-pulse" : timeLeft <= 10 ? "text-amber-300" : "text-emerald-300"}`}>
                ⏳ 查阅倒计时: <span className="font-mono text-base font-bold">{timeLeft}s</span>
              </span>
              <div className="w-32 h-2.5 bg-slate-800 rounded-full overflow-hidden border border-white/10">
                <div
                  className={`h-full transition-all duration-300 ${timerColor}`}
                  style={{ width: `${timerPercent}%` }}
                />
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-xs">
              <button
                onClick={() => setIsTimerRunning((prev) => !prev)}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-white/10 transition"
              >
                {isTimerRunning ? "⏸ 暂停" : "▶ 继续"}
              </button>
              <button
                onClick={handleAddExtraTime}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded border border-white/10 transition font-bold"
              >
                +15s
              </button>
              <button
                onClick={handleResetTimer}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded border border-white/10 transition"
              >
                ↺
              </button>
            </div>
          </div>

          {/* 右侧：关键指标徽章 */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
            <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700">
              👥 总人数 <strong className="text-white ml-1">{metrics.total}</strong>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-blue-950/80 text-blue-300 border border-blue-800">
              🔵 善良 <strong className="text-blue-100 ml-1">{metrics.goodCount}</strong>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-red-950/80 text-red-300 border border-red-800">
              🔴 邪恶 <strong className="text-red-100 ml-1">{metrics.evilCount}</strong>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-gray-800/90 text-gray-300 border border-gray-700">
              💀 死亡 <strong className="text-white ml-1">{metrics.deadCount}</strong>
            </span>
            {metrics.abnormalCount > 0 && (
              <span className="px-2.5 py-1 rounded-lg bg-emerald-950/80 text-emerald-300 border border-emerald-700 animate-pulse">
                🧪 异常状态 <strong className="text-emerald-100 ml-1">{metrics.abnormalCount}</strong>
              </span>
            )}
          </div>
        </div>

        {/* ─── 主体双栏区域：左魔典盘面 + 右情报历史 ──────────────────────── */}
        <div className="flex-1 flex flex-col md:flex-row gap-3 min-h-0 overflow-hidden">
          {/* ─── 左栏：真实魔典盘面 (55% 宽) ────────────────────────────── */}
          <div className="w-full md:w-[54%] flex flex-col bg-slate-950/60 rounded-xl border border-white/10 p-3 min-h-0 overflow-hidden shadow-inner">
            <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-white/10 shrink-0">
              <h3 className="text-sm font-bold text-amber-300 flex items-center gap-1.5">
                <span>🪐 场上所有玩家真实状态</span>
                <span className="text-[11px] font-normal text-slate-400">（真实身份/阵营/异常/提示标记）</span>
              </h3>
              {selectedSeatId !== null && (
                <button
                  onClick={() => setSelectedSeatId(null)}
                  className="text-[11px] px-2 py-0.5 rounded bg-amber-900/60 text-amber-200 hover:bg-amber-800 border border-amber-600 transition"
                >
                  ✕ 清除聚焦 (#{selectedSeatId + 1}号)
                </button>
              )}
            </div>

            {/* 座位卡片矩阵 */}
            <div className="flex-1 overflow-y-auto pr-1 grid grid-cols-2 lg:grid-cols-3 gap-2 content-start">
              {seats.map((seat) => {
                if (!seat.role) return null;

                const isDemon = seat.role.type === "demon" || seat.isDemonSuccessor;
                const isMinion = seat.role.type === "minion";
                const isEvil =
                  seat.isEvilConverted ||
                  (!seat.isGoodConverted && (isDemon || isMinion));

                // 阵营着色
                const cardBorder =
                  selectedSeatId === seat.id
                    ? "ring-2 ring-amber-400 border-amber-300 shadow-[0_0_15px_rgba(251,191,36,0.4)]"
                    : isDemon
                      ? "border-red-600/70 hover:border-red-400"
                      : isMinion
                        ? "border-orange-600/70 hover:border-orange-400"
                        : seat.role.type === "outsider"
                          ? "border-cyan-600/70 hover:border-cyan-400"
                          : "border-blue-600/70 hover:border-blue-400";

                const cardBg = seat.isDead
                  ? "bg-slate-900/70 opacity-75"
                  : isDemon
                    ? "bg-gradient-to-br from-red-950/80 via-slate-900/90 to-red-950/40"
                    : isMinion
                      ? "bg-gradient-to-br from-amber-950/70 via-slate-900/90 to-orange-950/40"
                      : isEvil
                        ? "bg-gradient-to-br from-purple-950/70 via-slate-900/90 to-red-950/30"
                        : "bg-gradient-to-br from-slate-900/90 via-slate-900/80 to-blue-950/40";

                const roleColorClass = isDemon
                  ? "text-red-400"
                  : isMinion
                    ? "text-orange-400"
                    : seat.role.type === "outsider"
                      ? "text-cyan-300"
                      : "text-blue-300";

                // 该座位的提醒标记
                const tokens = reminderTokens[seat.id] || [];

                return (
                  <div
                    key={seat.id}
                    onClick={() =>
                      setSelectedSeatId((prev) => (prev === seat.id ? null : seat.id))
                    }
                    className={`p-2.5 rounded-xl border flex flex-col justify-between transition-all cursor-pointer select-none ${cardBg} ${cardBorder}`}
                  >
                    {/* 卡片顶部：座位号与生死标记 */}
                    <div className="flex justify-between items-center mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-black text-sm px-1.5 py-0.5 rounded bg-slate-800/90 text-white border border-white/10">
                          {seat.id + 1}号
                        </span>
                        {selectedSeatId === seat.id && (
                          <span className="text-[10px] bg-amber-400 text-black px-1.5 py-0.2 rounded font-black">
                            聚焦
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        {seat.isDead ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 border border-gray-600 flex items-center gap-0.5">
                            💀 亡
                            {seat.hasGhostVote && <span title="保留幽灵票">👻</span>}
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                            🟢 存活
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 卡片中部：真实角色名与角色类型 */}
                    <div className="my-0.5">
                      <div className="flex items-baseline justify-between">
                        <span className={`text-base font-black tracking-wide ${roleColorClass}`}>
                          {seat.role.name}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">
                          {seat.role.type === "townsfolk"
                            ? "镇民"
                            : seat.role.type === "outsider"
                              ? "外来者"
                              : seat.role.type === "minion"
                                ? "爪牙"
                                : seat.role.type === "demon"
                                  ? "恶魔"
                                  : "旅行者"}
                        </span>
                      </div>

                      {/* 酒鬼伪装 */}
                      {seat.role.id === "drunk" && seat.charadeRole && (
                        <div className="text-[11px] text-purple-300 font-medium">
                          🎭 伪装: <strong>{seat.charadeRole.name}</strong>
                        </div>
                      )}

                      {/* 阵营转换 */}
                      {seat.isEvilConverted && (
                        <div className="text-[10px] text-red-400 font-bold">
                          ⚡️ 阵营已转换为邪恶
                        </div>
                      )}
                      {seat.isGoodConverted && (
                        <div className="text-[10px] text-blue-300 font-bold">
                          ✨ 阵营已转换为善良
                        </div>
                      )}
                    </div>

                    {/* 卡片底部：状态标签与 Reminder Tokens */}
                    <div className="flex flex-wrap gap-1 mt-1 pt-1 border-t border-white/5">
                      {seat.isPoisoned && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-900/90 text-emerald-200 border border-emerald-600 font-bold">
                          🧪 中毒
                        </span>
                      )}
                      {seat.isDrunk && seat.role.id !== "drunk" && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-900/90 text-amber-200 border border-amber-600 font-bold">
                          🍺 醉酒
                        </span>
                      )}
                      {seat.isProtected && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-900/90 text-blue-200 border border-blue-600 font-bold">
                          🛡️ 受保护
                        </span>
                      )}
                      {seat.isRedHerring && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-900/90 text-red-200 border border-red-600 font-bold">
                          🎯 红罗刹
                        </span>
                      )}

                      {/* 提醒标记 (Tokens) */}
                      {tokens.map((t) => (
                        <span
                          key={t.id}
                          className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-600 font-medium"
                          title={t.label}
                        >
                          {t.icon} {t.label}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ─── 右栏：每个玩家每个晚上做了什么、得知了什么 (46% 宽) ──────── */}
          <div className="w-full md:w-[46%] flex flex-col bg-slate-950/60 rounded-xl border border-white/10 p-3 min-h-0 overflow-hidden shadow-inner">
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
                首夜 (第1夜)
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
                ☀️ 白天事件
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

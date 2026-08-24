"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import type { Role, Seat } from "../../../app/data";
import { getCharacterWikiDetails, type CharacterWikiDetails } from "../../utils/characterWikiLookup";
import { ModalWrapper } from "./ModalWrapper";

interface IdentityShowcaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  seats: Seat[];
  initialSeatId?: number;
}

export function IdentityShowcaseModal({
  isOpen,
  onClose,
  seats,
  initialSeatId,
}: IdentityShowcaseModalProps) {
  // 筛选已落座且分配了角色的座位，按座位号升序排序
  const seatedPlayers = useMemo(() => {
    return seats
      .filter((s) => s.role !== null && s.role !== undefined)
      .sort((a, b) => a.id - b.id);
  }, [seats]);

  // 当前轮播索引
  const [currentIndex, setCurrentIndex] = useState(0);

  // 防窥遮罩状态（传递设备给下一位玩家时可一键遮盖）
  const [isMasked, setIsMasked] = useState(false);

  // 当 initialSeatId 变化时定位到指定座位
  useEffect(() => {
    if (initialSeatId !== undefined && seatedPlayers.length > 0) {
      const idx = seatedPlayers.findIndex((s) => s.id === initialSeatId);
      if (idx !== -1) {
        setCurrentIndex(idx);
      }
    }
  }, [initialSeatId, seatedPlayers]);

  const total = seatedPlayers.length;
  const currentSeat = seatedPlayers[currentIndex] || null;

  // 获取当前展示角色（酒鬼特殊处理：默认展示其伪装身份 charadeRole）
  const isDrunk = currentSeat?.role?.id === "drunk";
  const displayRole: Role | null = useMemo(() => {
    if (!currentSeat) return null;
    if (isDrunk && currentSeat.charadeRole) {
      return currentSeat.charadeRole;
    }
    return currentSeat.role;
  }, [currentSeat, isDrunk]);

  // 获取详细的官方百科与玩法推荐数据
  const wikiDetails: CharacterWikiDetails | null = useMemo(() => {
    if (!displayRole) return null;
    return getCharacterWikiDetails(displayRole);
  }, [displayRole]);

  // 键盘前后切换快捷键
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setCurrentIndex((prev) => (prev > 0 ? prev - 1 : prev));
        setIsMasked(false);
      } else if (e.key === "ArrowRight" || e.key === "Space") {
        e.preventDefault();
        if (currentIndex < total - 1) {
          setCurrentIndex((prev) => prev + 1);
          setIsMasked(false);
        } else {
          onClose();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, currentIndex, total, onClose]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setIsMasked(false);
    }
  }, [currentIndex]);

  const handleNext = useCallback(() => {
    if (currentIndex < total - 1) {
      setCurrentIndex((prev) => prev + 1);
      setIsMasked(false);
    } else {
      onClose();
    }
  }, [currentIndex, total, onClose]);

  if (!isOpen) return null;

  if (total === 0 || !currentSeat || !displayRole) {
    return (
      <ModalWrapper
        title="身份展示 & 告知"
        onClose={onClose}
        className="max-w-md"
        footer={
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold"
          >
            返回
          </button>
        }
      >
        <div className="py-8 text-center text-slate-300">
          <p className="text-4xl mb-3">🪑</p>
          <p className="text-lg font-bold">暂无落座玩家</p>
          <p className="text-sm text-slate-400 mt-1">请先在准备阶段为座位分配角色后再进行身份告知。</p>
        </div>
      </ModalWrapper>
    );
  }

  // 阵营颜色主题映射
  const team = String(displayRole.type || (wikiDetails?.type === "镇民" ? "townsfolk" : wikiDetails?.type === "外来者" ? "outsider" : wikiDetails?.type === "爪牙" ? "minion" : wikiDetails?.type === "恶魔" ? "demon" : "townsfolk"));
  const teamThemeMap: Record<
    string,
    {
      badgeBg: string;
      accentBorder: string;
      tokenBg: string;
      teamLabel: string;
      highlightText: string;
    }
  > = {
    townsfolk: {
      badgeBg: "bg-blue-500/20 text-blue-300 border-blue-400/40",
      accentBorder: "border-blue-500/60 shadow-[0_0_30px_rgba(59,130,246,0.25)]",
      tokenBg: "bg-gradient-to-br from-blue-900 via-blue-950 to-slate-950 border-blue-400 text-blue-200",
      teamLabel: "镇民 · 善良阵营",
      highlightText: "text-blue-400",
    },
    outsider: {
      badgeBg: "bg-teal-500/20 text-teal-300 border-teal-400/40",
      accentBorder: "border-teal-500/60 shadow-[0_0_30px_rgba(20,184,166,0.25)]",
      tokenBg: "bg-gradient-to-br from-teal-900 via-teal-950 to-slate-950 border-teal-400 text-teal-200",
      teamLabel: "外来者 · 善良阵营",
      highlightText: "text-teal-400",
    },
    minion: {
      badgeBg: "bg-orange-500/20 text-orange-300 border-orange-400/40",
      accentBorder: "border-orange-500/60 shadow-[0_0_30px_rgba(249,115,22,0.25)]",
      tokenBg: "bg-gradient-to-br from-orange-900 via-orange-950 to-slate-950 border-orange-400 text-orange-200",
      teamLabel: "爪牙 · 邪恶阵营",
      highlightText: "text-orange-400",
    },
    demon: {
      badgeBg: "bg-red-500/20 text-red-300 border-red-400/40",
      accentBorder: "border-red-600/60 shadow-[0_0_35px_rgba(239,68,68,0.35)]",
      tokenBg: "bg-gradient-to-br from-red-900 via-red-950 to-slate-950 border-red-500 text-red-200",
      teamLabel: "恶魔 · 邪恶阵营",
      highlightText: "text-red-400",
    },
    traveler: {
      badgeBg: "bg-purple-500/20 text-purple-300 border-purple-400/40",
      accentBorder: "border-purple-500/60 shadow-[0_0_30px_rgba(168,85,247,0.25)]",
      tokenBg: "bg-gradient-to-br from-purple-900 via-purple-950 to-slate-950 border-purple-400 text-purple-200",
      teamLabel: "旅行者",
      highlightText: "text-purple-400",
    },
    fabled: {
      badgeBg: "bg-amber-500/20 text-amber-300 border-amber-400/40",
      accentBorder: "border-amber-500/50 shadow-[0_0_30px_rgba(245,158,11,0.25)]",
      tokenBg: "bg-gradient-to-br from-slate-800 to-slate-950 border-amber-400 text-amber-200",
      teamLabel: "传奇角色",
      highlightText: "text-amber-400",
    },
  };
  const teamTheme = teamThemeMap[team] || teamThemeMap.fabled;

  return (
    <ModalWrapper
      title="🎴 身份展示 & 逐一告知"
      onClose={onClose}
      className="max-w-5xl w-[96vw] max-h-[92vh] flex flex-col"
      footer={
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 w-full">
          {/* 左侧：上一位按钮 */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handlePrev}
              disabled={currentIndex === 0}
              className="px-5 py-3 rounded-xl border border-white/20 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm transition disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 flex-1 sm:flex-initial cursor-pointer"
            >
              <span>⬅</span>
              <span>上一位 {currentIndex > 0 ? `(${seatedPlayers[currentIndex - 1].id + 1}号)` : ""}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsMasked((prev) => !prev)}
              className="px-3.5 py-3 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-medium text-xs transition flex items-center justify-center gap-1 cursor-pointer"
              title="防窥遮罩：传递给下位玩家前可先遮盖身份"
            >
              <span>{isMasked ? "👁️" : "🙈"}</span>
              <span>{isMasked ? "翻开" : "防窥"}</span>
            </button>
          </div>

          {/* 中间：座位切换指示条 */}
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono overflow-x-auto max-w-full py-1">
            {seatedPlayers.map((s, idx) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setCurrentIndex(idx);
                  setIsMasked(false);
                }}
                className={`w-7 h-7 rounded-full text-xs font-bold transition-all flex items-center justify-center cursor-pointer ${
                  idx === currentIndex
                    ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/40 scale-110"
                    : "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/10"
                }`}
                title={`跳转到 ${s.id + 1} 号座位 (${s.role?.name || "未定"})`}
              >
                {s.id + 1}
              </button>
            ))}
          </div>

          {/* 右侧：下一位 / 完成按钮 */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleNext}
              className={`px-7 py-3 rounded-xl text-white font-black text-sm transition shadow-lg flex items-center justify-center gap-2 flex-1 sm:flex-initial cursor-pointer ${
                currentIndex === total - 1
                  ? "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/40"
                  : "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/40"
              }`}
            >
              <span>{currentIndex === total - 1 ? "🎉 完成展示，返回" : `下一位 (${seatedPlayers[currentIndex + 1]?.id + 1 || ""}号)`}</span>
              <span>{currentIndex === total - 1 ? "✓" : "➡"}</span>
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 py-1">
        {/* 顶部进度与提示条 */}
        <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-900/90 border border-white/10 text-xs text-slate-300">
          <div className="flex items-center gap-2 font-medium">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>轮番确认环节：第 <b className="text-amber-400 text-sm">{currentIndex + 1}</b> / {total} 位玩家</span>
          </div>
          <div className="text-slate-400 hidden sm:block">
            <span>💡 仅展示当前玩家信息，方便传递设备防窥</span>
          </div>
        </div>

        {/* 主体展示卡片（防窥遮罩 / 双栏内容） */}
        {isMasked ? (
          <div
            onClick={() => setIsMasked(false)}
            className="w-full py-24 rounded-3xl bg-slate-900/95 border-2 border-dashed border-amber-500/40 flex flex-col items-center justify-center space-y-4 cursor-pointer hover:border-amber-400 transition select-none"
          >
            <div className="w-20 h-20 rounded-full bg-amber-500/10 border-2 border-amber-500/30 flex items-center justify-center text-4xl animate-bounce">
              🙈
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-2xl font-black text-amber-300">
                请将设备传递给 【{currentSeat.id + 1}号玩家】
              </h3>
              <p className="text-sm text-slate-400">
                已开启防窥遮罩 · 拿到设备的玩家请点击屏幕任意位置翻开身份
              </p>
            </div>
            <div className="px-6 py-2 rounded-full bg-amber-500 text-slate-950 font-bold text-sm shadow-lg shadow-amber-500/20">
              👁️ 点击翻开我的身份
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            {/* ==================================================== */}
            {/* 左侧核心信息栏 (Left Column - 核心身份 & 技能) */}
            {/* ==================================================== */}
            <div className="lg:col-span-5 flex flex-col justify-between p-5 sm:p-6 rounded-2xl bg-gradient-to-b from-slate-900 via-slate-900/95 to-slate-950 border-2 border-white/10 space-y-5 shadow-xl">
              {/* 座位号大标题 */}
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="px-3.5 py-1 rounded-xl bg-amber-500 text-slate-950 font-black text-lg sm:text-xl shadow-md shadow-amber-500/30">
                    {currentSeat.id + 1} 号
                  </span>
                  <span className="text-xl sm:text-2xl font-black text-slate-100">
                    玩家身份
                  </span>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${teamTheme.badgeBg}`}>
                  {teamTheme.teamLabel}
                </span>
              </div>

              {/* 角色代币与名称大字 */}
              <div className="flex items-center gap-4 py-2">
                <div className={`w-20 h-20 sm:w-24 sm:h-24 rounded-full border-4 flex items-center justify-center text-center p-2 font-black text-base sm:text-lg shadow-xl shrink-0 ${teamTheme.tokenBg}`}>
                  <span>{displayRole.name}</span>
                </div>
                <div className="space-y-1 min-w-0">
                  <h2 className={`text-3xl sm:text-4xl font-black tracking-tight ${teamTheme.highlightText} drop-shadow-md truncate`}>
                    {displayRole.name}
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-400 font-mono truncate">
                    {wikiDetails?.englishName || displayRole.id}
                  </p>
                  {wikiDetails?.script && (
                    <p className="text-xs text-slate-400">
                      所属剧本：<span className="text-slate-200 font-semibold">{wikiDetails.script}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* 技能说明大卡片 */}
              <div className="p-4 rounded-xl bg-black/40 border border-white/15 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300 uppercase tracking-wider">
                  <span>⚡</span>
                  <span>【角色能力】</span>
                </div>
                <p className="text-base sm:text-lg font-medium text-slate-100 leading-relaxed pl-1">
                  {wikiDetails?.abilityText || displayRole.ability || "无特殊能力描述"}
                </p>
              </div>

              {/* 酒鬼伪装身份特别提示 (如果是酒鬼) */}
              {isDrunk && (
                <div className="p-3 rounded-xl bg-purple-950/40 border border-purple-500/30 text-xs text-purple-200 space-y-1">
                  <div className="flex items-center gap-1 font-bold text-purple-300">
                    <span>🎭</span>
                    <span>说书人注意</span>
                  </div>
                  <p className="text-slate-300">
                    该玩家真实身份为<b>酒鬼</b>，但他以为自己是<b>{displayRole.name}</b>并已向其展示该技能。
                  </p>
                </div>
              )}

              {/* 底部传递引导 */}
              <div className="pt-2 border-t border-white/10 text-xs text-slate-400 text-center">
                <span>📱 确认知晓身份后，请点击下方「下一位」并将设备传递给下一位玩家</span>
              </div>
            </div>

            {/* ==================================================== */}
            {/* 右侧玩法推荐与技巧栏 (Right Column - 官方百科 & 进阶玩法) */}
            {/* ==================================================== */}
            <div className="lg:col-span-7 flex flex-col p-5 sm:p-6 rounded-2xl bg-slate-900/90 border border-white/10 space-y-4 max-h-[520px] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📖</span>
                  <h3 className="text-base sm:text-lg font-bold text-slate-200">
                    官方玩法推荐 & 进阶技巧
                  </h3>
                </div>
                {wikiDetails?.url && (
                  <a
                    href={wikiDetails.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-sky-400 hover:text-sky-300 underline flex items-center gap-1"
                  >
                    <span>百科原页</span>
                    <span>↗</span>
                  </a>
                )}
              </div>

              {/* 官方名言金句 (如果有) */}
              {wikiDetails?.flavorQuote && (
                <div className="p-3 rounded-xl bg-white/5 border-l-4 border-amber-500 text-xs sm:text-sm text-slate-300 italic">
                  {wikiDetails.flavorQuote}
                </div>
              )}

              {/* 玩法推荐与技巧核心要点 (提示与技巧) */}
              <div className="space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
                  <span>💡</span>
                  <span>核心打法与发言建议</span>
                </div>
                {wikiDetails?.strategyTips && wikiDetails.strategyTips.length > 0 ? (
                  <div className="space-y-2.5 pl-1">
                    {wikiDetails.strategyTips.slice(0, 6).map((tip, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 text-xs sm:text-sm text-slate-200 leading-relaxed bg-black/20 p-2.5 rounded-lg border border-white/5"
                      >
                        <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-300 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        <p className="flex-1">{tip}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs sm:text-sm text-slate-400 pl-4">
                    {wikiDetails?.overview || "暂无该角色的特殊玩法技巧说明。"}
                  </p>
                )}
              </div>

              {/* 角色简介与运作机制 */}
              {wikiDetails?.overview && (
                <div className="space-y-1.5 pt-2 border-t border-white/10">
                  <div className="flex items-center gap-1 text-xs font-bold text-slate-400">
                    <span>📜</span>
                    <span>角色简介</span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed pl-3">
                    {wikiDetails.overview}
                  </p>
                </div>
              )}

              {/* 伪装建议 (对于邪恶或强力角色) */}
              {wikiDetails?.bluffTips && wikiDetails.bluffTips.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-white/10">
                  <div className="flex items-center gap-1 text-xs font-bold text-orange-400">
                    <span>🎭</span>
                    <span>伪装思路推荐</span>
                  </div>
                  <div className="space-y-1.5 pl-3">
                    {wikiDetails.bluffTips.slice(0, 2).map((bTip, idx) => (
                      <p key={idx} className="text-xs text-slate-300 leading-relaxed">
                        • {bTip}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </ModalWrapper>
  );
}

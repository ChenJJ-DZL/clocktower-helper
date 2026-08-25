"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import type { Role, Seat } from "../../../app/data";
import { getCharacterWikiDetails, type CharacterWikiDetails } from "../../utils/characterWikiLookup";
import { ModalWrapper } from "./ModalWrapper";
import { RoleTokenBadge } from "../common/RoleTokenBadge";

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

  // 防窥遮罩状态：默认开启防窥状态，切换座位时自动恢复防窥
  const [isMasked, setIsMasked] = useState(true);

  // 当 initialSeatId 变化时定位到指定座位
  useEffect(() => {
    if (initialSeatId !== undefined && seatedPlayers.length > 0) {
      const idx = seatedPlayers.findIndex((s) => s.id === initialSeatId);
      if (idx !== -1) {
        setCurrentIndex(idx);
        setIsMasked(true);
      }
    }
  }, [initialSeatId, seatedPlayers]);

  const total = seatedPlayers.length;
  const currentSeat = seatedPlayers[currentIndex] || null;

  // 获取当前展示角色（酒鬼、提线木偶、疯子特殊处理：默认展示其伪装身份）
  const isDrunk = currentSeat?.role?.id === "drunk";
  const isMarionette = currentSeat?.role?.id === "marionette";
  const isLunatic = currentSeat?.role?.id === "lunatic";
  const displayRole: Role | null = useMemo(() => {
    if (!currentSeat) return null;
    // 酒鬼/提线木偶：展示 charadeRole（说书人设置的伪装镇民身份）
    if ((isDrunk || isMarionette) && currentSeat.charadeRole) {
      return currentSeat.charadeRole;
    }
    // 疯子：展示 apparentDemonRole（疯子以为自己是的恶魔身份）
    if (isLunatic && (currentSeat as any).apparentDemonRole) {
      return (currentSeat as any).apparentDemonRole;
    }
    return currentSeat.role;
  }, [currentSeat, isDrunk, isMarionette, isLunatic]);

  // 获取详细的官方百科与玩法推荐数据
  const wikiDetails: CharacterWikiDetails | null = useMemo(() => {
    if (!displayRole) return null;
    return getCharacterWikiDetails(displayRole);
  }, [displayRole]);

  // 切换上一位（额外保险：切换后始终以防窥状态显示）
  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setIsMasked(true);
    }
  }, [currentIndex]);

  // 切换下一位（额外保险：切换后始终以防窥状态显示）
  const handleNext = useCallback(() => {
    if (currentIndex < total - 1) {
      setCurrentIndex((prev) => prev + 1);
      setIsMasked(true);
    } else {
      onClose();
    }
  }, [currentIndex, total, onClose]);

  // 跳转到指定座位（额外保险：跳转后始终以防窥状态显示）
  const handleJumpTo = useCallback((idx: number) => {
    setCurrentIndex(idx);
    setIsMasked(true);
  }, []);

  // 键盘快捷键前后切换
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNext();
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        // 空格/回车键快速翻开或切换防窥
        setIsMasked((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handlePrev, handleNext]);

  if (!isOpen) return null;

  if (total === 0 || !currentSeat || !displayRole) {
    return (
      <ModalWrapper
        title="🎴 身份展示 & 逐一告知"
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
      highlightText: "text-blue-300",
    },
    outsider: {
      badgeBg: "bg-teal-500/20 text-teal-300 border-teal-400/40",
      accentBorder: "border-teal-500/60 shadow-[0_0_30px_rgba(20,184,166,0.25)]",
      tokenBg: "bg-gradient-to-br from-teal-900 via-teal-950 to-slate-950 border-teal-400 text-teal-200",
      teamLabel: "外来者 · 善良阵营",
      highlightText: "text-teal-300",
    },
    minion: {
      badgeBg: "bg-orange-500/20 text-orange-300 border-orange-400/40",
      accentBorder: "border-orange-500/60 shadow-[0_0_30px_rgba(249,115,22,0.25)]",
      tokenBg: "bg-gradient-to-br from-orange-900 via-orange-950 to-slate-950 border-orange-400 text-orange-200",
      teamLabel: "爪牙 · 邪恶阵营",
      highlightText: "text-orange-300",
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
      highlightText: "text-purple-300",
    },
    fabled: {
      badgeBg: "bg-amber-500/20 text-amber-300 border-amber-400/40",
      accentBorder: "border-amber-500/50 shadow-[0_0_30px_rgba(245,158,11,0.25)]",
      tokenBg: "bg-gradient-to-br from-slate-800 to-slate-950 border-amber-400 text-amber-200",
      teamLabel: "传奇角色",
      highlightText: "text-amber-300",
    },
  };
  const teamTheme = teamThemeMap[team] || teamThemeMap.fabled;

  const prevSeat = currentIndex > 0 ? seatedPlayers[currentIndex - 1] : null;
  const nextSeat = currentIndex < total - 1 ? seatedPlayers[currentIndex + 1] : null;

  return (
    <ModalWrapper
      title="🎴 身份展示 & 逐一告知 (全屏画册)"
      onClose={onClose}
      className="max-w-7xl w-[98vw] h-[94vh] max-h-[94vh] flex flex-col p-2 overflow-hidden"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3 w-full">
          {/* 左侧：上一位按钮 */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrev}
              disabled={currentIndex === 0}
              className="px-4 py-2.5 rounded-xl border border-white/20 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm transition disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <span>⬅</span>
              <span>上一位 {prevSeat ? `(${prevSeat.id + 1}号)` : ""}</span>
            </button>
          </div>

          {/* 中间：防窥切换键 + 座位直达指示条 */}
          <div className="flex items-center gap-3 overflow-x-auto py-1">
            <button
              type="button"
              onClick={() => setIsMasked((prev) => !prev)}
              className={`px-4 py-2 rounded-xl border font-bold text-xs transition flex items-center gap-1.5 cursor-pointer shadow-md active:scale-95 ${
                isMasked
                  ? "border-amber-400 bg-amber-500 text-slate-950 font-black shadow-amber-500/30"
                  : "border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300"
              }`}
              title="点击切换防窥遮罩（切换玩家时自动恢复防窥）"
            >
              <span>{isMasked ? "👁️ 翻开身份" : "🙈 遮罩防窥"}</span>
            </button>

            <div className="flex items-center gap-1">
              {seatedPlayers.map((s, idx) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleJumpTo(idx)}
                  className={`w-7 h-7 rounded-lg text-xs font-bold transition-all flex items-center justify-center cursor-pointer ${
                    idx === currentIndex
                      ? "bg-amber-500 text-slate-950 font-black ring-2 ring-amber-300 shadow-md scale-110"
                      : "bg-slate-800/90 hover:bg-slate-700 text-slate-300 border border-white/10"
                  }`}
                  title={`直达 ${s.id + 1} 号座位（自动开启防窥）`}
                >
                  {s.id + 1}
                </button>
              ))}
            </div>
          </div>

          {/* 右侧：下一位 / 完成按钮 */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleNext}
              className={`px-6 py-2.5 rounded-xl text-white font-black text-sm transition shadow-lg flex items-center gap-2 cursor-pointer active:scale-95 ${
                currentIndex === total - 1
                  ? "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/40 ring-1 ring-emerald-400"
                  : "bg-amber-500 hover:bg-amber-400 text-slate-950 font-black shadow-amber-500/40"
              }`}
            >
              <span>
                {currentIndex === total - 1
                  ? "🎉 完成展示，返回入夜"
                  : `下一位 (${nextSeat?.id ? nextSeat.id + 1 : ""}号) ➡`}
              </span>
            </button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col h-full space-y-3 overflow-hidden">
        {/* 顶部进度与提示条 */}
        <div className="flex items-center justify-between px-4 py-2 rounded-xl bg-slate-900/90 border border-white/10 text-xs text-slate-300 shrink-0">
          <div className="flex items-center gap-2 font-medium">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>
              轮番确认环节：第 <b className="text-amber-400 text-sm">{currentIndex + 1}</b> / {total} 位玩家
              （座位 <b>{currentSeat.id + 1}号</b>）
            </span>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <span className="hidden sm:inline">💡 安全防窥：切换玩家时已自动遮罩</span>
            <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${isMasked ? "bg-amber-500/20 text-amber-300 border-amber-500/40" : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"}`}>
              {isMasked ? "🙈 已遮罩" : "👁️ 已翻开"}
            </span>
          </div>
        </div>

        {/* 主体展示区：全屏双栏完整展示 或 全屏防窥遮罩 */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {isMasked ? (
            <div
              onClick={() => setIsMasked(false)}
              className="w-full h-full rounded-2xl bg-gradient-to-b from-slate-900/95 to-slate-950 border-2 border-dashed border-amber-500/40 flex flex-col items-center justify-center p-8 space-y-5 cursor-pointer hover:border-amber-400 transition select-none shadow-2xl"
            >
              <div className="w-24 h-24 rounded-full bg-amber-500/10 border-2 border-amber-500/40 flex items-center justify-center text-5xl shadow-[0_0_30px_rgba(245,158,11,0.2)] animate-pulse">
                🙈
              </div>
              <div className="text-center space-y-2">
                <div className="inline-block px-4 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-sm">
                  请将设备传递给
                </div>
                <h3 className="text-3xl sm:text-4xl font-black text-amber-300 tracking-wide drop-shadow-md">
                  【 {currentSeat.id + 1} 号座位玩家 】
                </h3>
                <p className="text-sm text-slate-400 max-w-md pt-1">
                  当前处于防窥遮罩状态 · 拿到设备的玩家请点击屏幕翻开专属身份与技能说明
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMasked(false);
                }}
                className="px-8 py-3 rounded-full bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-base shadow-xl shadow-amber-500/30 transition-all hover:scale-105 active:scale-95 cursor-pointer"
              >
                👁️ 点击翻开我的身份
              </button>
            </div>
          ) : (
            <div className="w-full h-full flex flex-col lg:flex-row gap-4 items-stretch overflow-hidden">
              {/* ==================================================== */}
              {/* 左侧核心信息栏 (Left Column - 宽幅，无省略，完整展示) */}
              {/* ==================================================== */}
              <div className="w-full lg:w-[45%] xl:w-[40%] shrink-0 flex flex-col justify-between p-5 sm:p-6 rounded-2xl bg-gradient-to-b from-slate-900/95 via-slate-900/90 to-slate-950 border-2 border-white/10 shadow-2xl space-y-4 overflow-y-auto">
                {/* 顶部座位号与阵营徽章 */}
                <div className="flex items-center justify-between border-b border-white/10 pb-3 shrink-0">
                  <div className="flex items-center gap-2.5">
                    <span className="px-4 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-black text-xl sm:text-2xl shadow-md shadow-amber-500/30">
                      {currentSeat.id + 1} 号
                    </span>
                    <span className="text-xl sm:text-2xl font-black text-slate-100">
                      玩家身份
                    </span>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold border ${teamTheme.badgeBg}`}>
                    {teamTheme.teamLabel}
                  </span>
                </div>

                {/* 角色代币与名称完整展示（不省略、不挤压，2行自动排版） */}
                <div className="flex items-center gap-4 py-1 shrink-0">
                  <RoleTokenBadge
                    name={displayRole.name}
                    tokenBg={teamTheme.tokenBg}
                    size="lg"
                  />
                  <div className="space-y-1 min-w-0 flex-1">
                    <h2 className={`text-3xl sm:text-4xl font-black tracking-tight ${teamTheme.highlightText} drop-shadow-md leading-tight`}>
                      {displayRole.name}
                    </h2>
                    <p className="text-sm text-slate-300 font-mono font-medium">
                      {wikiDetails?.englishName || displayRole.id}
                    </p>
                    {wikiDetails?.script && (
                      <p className="text-xs text-slate-400">
                        所属剧本：<span className="text-slate-200 font-semibold">{wikiDetails.script}</span>
                      </p>
                    )}
                  </div>
                </div>

                {/* 技能说明大卡片（字号适中，无截断） */}
                <div className="p-4 rounded-xl bg-black/40 border border-white/15 space-y-2 flex-1 flex flex-col justify-center">
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
                  <div className="p-3 rounded-xl bg-purple-950/50 border border-purple-500/40 text-xs text-purple-200 space-y-1 shrink-0">
                    <div className="flex items-center gap-1 font-bold text-purple-300">
                      <span>🎭</span>
                      <span>说书人专属提示</span>
                    </div>
                    <p className="text-slate-200">
                      该玩家真实身份为 <b>酒鬼</b>，但他以为自己是 <b>【{displayRole.name}】</b> 并已向其告知该技能。
                    </p>
                  </div>
                )}

                {/* 底部传递引导 */}
                <div className="pt-2 border-t border-white/10 text-xs text-slate-400 text-center shrink-0">
                  <span>📱 确认知晓后，请点击下方「下一位」并将设备传递给下一位玩家</span>
                </div>
              </div>

              {/* ==================================================== */}
              {/* 右侧官方玩法推荐与技巧栏 (Right Column - 舒展全览) */}
              {/* ==================================================== */}
              <div className="flex-1 flex flex-col p-5 sm:p-6 rounded-2xl bg-slate-900/90 border border-white/10 shadow-2xl space-y-3.5 overflow-hidden">
                {/* 栏目标题 */}
                <div className="flex items-center justify-between border-b border-white/10 pb-2.5 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">📖</span>
                    <h3 className="text-base sm:text-lg font-bold text-slate-200">
                      官方玩法推荐 & 进阶技巧
                    </h3>
                  </div>
                  {wikiDetails?.url && (
                    <a
                      href={wikiDetails.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-sky-400 hover:text-sky-300 underline flex items-center gap-1 px-2 py-1 rounded bg-sky-950/40 border border-sky-500/30"
                    >
                      <span>百科原页</span>
                      <span>↗</span>
                    </a>
                  )}
                </div>

                {/* 玩法内容滚动区（舒展排版） */}
                <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                  {/* 官方名言金句 (如果有) */}
                  {wikiDetails?.flavorQuote && (
                    <div className="p-3 rounded-xl bg-white/5 border-l-4 border-amber-500 text-xs sm:text-sm text-slate-300 italic">
                      {wikiDetails.flavorQuote}
                    </div>
                  )}

                  {/* 核心打法与发言建议 (提示与技巧) */}
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                      <span>💡</span>
                      <span>核心打法与发言建议</span>
                    </div>
                    {wikiDetails?.strategyTips && wikiDetails.strategyTips.length > 0 ? (
                      <div className="space-y-2 pl-0.5">
                        {wikiDetails.strategyTips.slice(0, 6).map((tip, i) => (
                          <div
                            key={i}
                            className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-200 leading-relaxed bg-black/25 p-3 rounded-xl border border-white/5 shadow-sm"
                          >
                            <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-300 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5 border border-amber-500/30">
                              {i + 1}
                            </span>
                            <p className="flex-1 text-slate-200">{tip}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs sm:text-sm text-slate-400 pl-4">
                        {wikiDetails?.overview || "暂无该角色的特殊玩法技巧说明。"}
                      </p>
                    )}
                  </div>

                  {/* 角色简介 */}
                  {wikiDetails?.overview && (
                    <div className="space-y-1.5 pt-2 border-t border-white/10">
                      <div className="flex items-center gap-1 text-xs font-bold text-slate-400">
                        <span>📜</span>
                        <span>角色简介</span>
                      </div>
                      <p className="text-xs sm:text-sm text-slate-300 leading-relaxed pl-2">
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
                      <div className="space-y-1.5 pl-2">
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
            </div>
          )}
        </div>
      </div>
    </ModalWrapper>
  );
}

"use client";

import { useEffect } from "react";

interface GlobalPrivacyShieldProps {
  /** 遮罩是否处于激活状态 */
  isActive: boolean;
  /** 关闭/解除遮罩的回调 */
  onDismiss: () => void;
  /** 是否处于夜间流程（用于定制文案） */
  isNightPhase?: boolean;
}

/**
 * GlobalPrivacyShield - 全局保密防窥遮罩
 *
 * 用于在夜间角色行动交接、身份告知交接或任意需要临时防窥的时刻，
 * 遮蔽整个屏幕（包含控制台、圆桌、行动面板与全部玩家信息）。
 *
 * 特性：
 * 1. 全屏最高 z-index（z-[99999]），完全覆盖底层信息
 * 2. 大卡片式视觉，醒目的防窥提示与交接指引
 * 3. 醒目的「解除遮罩 · 继续行动」操作按钮
 * 4. 支持点击屏幕背景或按 ESC 快速解除
 */
export function GlobalPrivacyShield({
  isActive,
  onDismiss,
  isNightPhase = false,
}: GlobalPrivacyShieldProps) {
  // 监听键盘 ESC 快速解除遮罩
  useEffect(() => {
    if (!isActive) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === " ") {
        e.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isActive, onDismiss]);

  if (!isActive) return null;

  return (
    <div
      onClick={onDismiss}
      className="fixed inset-0 z-[99999] flex flex-col items-center justify-between bg-gradient-to-b from-slate-950/98 via-slate-900/95 to-slate-950/98 backdrop-blur-2xl text-white select-none transition-all duration-300 p-6 sm:p-10 cursor-pointer animate-fadeIn"
    >
      {/* 顶部提示条 */}
      <div className="w-full flex items-center justify-between max-w-2xl px-4 py-2 rounded-xl bg-slate-900/90 border border-amber-500/30 text-xs text-amber-300 shadow-lg">
        <div className="flex items-center gap-2 font-bold">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"></span>
          <span>🛡️ 全局防窥模式已开启 · 玩家隐私保护中</span>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 transition cursor-pointer font-medium"
        >
          ✕ 解除遮罩 (ESC)
        </button>
      </div>

      {/* 中央主卡片 */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-3xl bg-slate-900/90 border-2 border-amber-500/40 p-8 sm:p-10 flex flex-col items-center text-center space-y-6 shadow-[0_0_80px_rgba(245,158,11,0.2)] backdrop-blur-xl transition-transform"
      >
        {/* 动态光晕图标 */}
        <div className="w-28 h-28 rounded-full bg-amber-500/10 border-2 border-amber-500/40 flex items-center justify-center text-6xl shadow-[0_0_40px_rgba(245,158,11,0.25)] animate-pulse">
          🙈
        </div>

        {/* 提示文案 */}
        <div className="space-y-2">
          <div className="inline-block px-4 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-xs tracking-wider uppercase">
            {isNightPhase ? "夜间行动交接保护" : "保密防窥保护"}
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-amber-300 tracking-wide">
            防窥保护已开启
          </h2>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-sm pt-1">
            {isNightPhase
              ? "上一位角色行动已结束 · 请说书人关闭遮罩后再继续推进到下一个角色的行动。"
              : "所有场上身份、信息反馈与控制台信息已安全隐藏，防止旁人窥探。"}
          </p>
        </div>

        {/* 核心操作按钮 */}
        <div className="w-full pt-2">
          <button
            type="button"
            onClick={onDismiss}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-lg sm:text-xl shadow-xl shadow-amber-500/30 transition-all transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
          >
            <span>👁️</span>
            <span>解除遮罩 · 继续行动</span>
          </button>
        </div>

        <p className="text-xs text-slate-500">
          💡 提示：点击屏幕任意空白处、按空格键或左上角眼睛按钮亦可快速解除
        </p>
      </div>

      {/* 底部空位保持垂直居中 */}
      <div className="h-6" />
    </div>
  );
}

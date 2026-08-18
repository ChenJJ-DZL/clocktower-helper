"use client";

import type React from "react";
import { useCallback, useState } from "react";
import {
  type ReminderToken,
  REMINDER_PRESETS,
} from "@/app/data";

/**
 * 提醒标记面板（Reminder Token Panel）
 *
 * 说书人魔典的标准工具：在玩家座位上放置/移除提醒标记。
 * 官方 BotC 的圆形标记放置在座位旁，提醒说书人关键状态。
 *
 * 功能：
 * - 预设标记快速选择（受保护/中毒/醉酒/假身份/已用能力等）
 * - 自定义标记（输入图标+文字）
 * - 点击已有标记移除
 * - 标记过期提醒（至天亮/至黄昏/永久）
 */

interface ReminderTokenPanelProps {
  /** 当前座位 ID */
  seatId: number;
  /** 该座位当前的标记列表 */
  tokens: ReminderToken[];
  /** 添加标记回调 */
  onAdd: (seatId: number, token: ReminderToken) => void;
  /** 移除标记回调 */
  onRemove: (seatId: number, tokenId: string) => void;
  /** 关闭面板 */
  onClose: () => void;
  /** 玩家名称（显示用） */
  playerName?: string;
}

const colorMap: Record<string, string> = {
  red: "bg-red-900/80 border-red-600 text-red-200",
  green: "bg-green-900/80 border-green-600 text-green-200",
  yellow: "bg-yellow-900/80 border-yellow-600 text-yellow-200",
  blue: "bg-blue-900/80 border-blue-600 text-blue-200",
  gray: "bg-gray-800/80 border-gray-500 text-gray-200",
};

export function ReminderTokenPanel({
  seatId,
  tokens,
  onAdd,
  onRemove,
  onClose,
  playerName,
}: ReminderTokenPanelProps) {
  const [customIcon, setCustomIcon] = useState("📌");
  const [customLabel, setCustomLabel] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  const handleAddPreset = useCallback(
    (preset: (typeof REMINDER_PRESETS)[number]) => {
      const token: ReminderToken = {
        id: `rt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        icon: preset.icon,
        label: preset.label,
        color: preset.color,
        sourceRoleId: preset.sourceRoleId,
        expiresAt: preset.expiresAt,
        createdAt: Date.now(),
      };
      onAdd(seatId, token);
    },
    [seatId, onAdd]
  );

  const handleAddCustom = useCallback(() => {
    if (!customLabel.trim()) return;
    const token: ReminderToken = {
      id: `rt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      icon: customIcon || "📌",
      label: customLabel.trim(),
      color: "blue",
      createdAt: Date.now(),
    };
    onAdd(seatId, token);
    setCustomLabel("");
    setShowCustom(false);
  }, [seatId, customIcon, customLabel, onAdd]);

  return (
    <div
      className="fixed inset-0 z-[3100] flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-slate-900 border-2 border-slate-600 rounded-2xl p-4 w-[420px] max-h-[80vh] flex flex-col shadow-2xl">
        {/* 标题 */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold text-amber-300">
            🏷️ 提醒标记 — {playerName || `${seatId + 1}号`}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xl px-2"
          >
            ✕
          </button>
        </div>

        {/* 当前标记列表 */}
        {tokens.length > 0 && (
          <div className="mb-3">
            <div className="text-xs text-gray-400 mb-1">当前标记（点击移除）：</div>
            <div className="flex flex-wrap gap-1.5">
              {tokens.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onRemove(seatId, t.id)}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border text-xs font-medium transition-all hover:scale-105 active:scale-95 ${colorMap[t.color] || colorMap.gray}`}
                  title={`点击移除「${t.label}」`}
                >
                  <span>{t.icon}</span>
                  <span>{t.label}</span>
                  <span className="text-[10px] opacity-60">✕</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {tokens.length === 0 && (
          <div className="text-xs text-gray-500 mb-3 italic">暂无标记</div>
        )}

        {/* 预设标记选择 */}
        <div className="text-xs text-gray-400 mb-1">添加标记：</div>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {REMINDER_PRESETS.filter((p) => p.label !== "自定义").map((preset) => (
            <button
              key={preset.label}
              onClick={() => handleAddPreset(preset)}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full border text-xs font-medium transition-all hover:scale-105 active:scale-95 ${colorMap[preset.color] || colorMap.gray}`}
            >
              <span>{preset.icon}</span>
              <span>{preset.label}</span>
            </button>
          ))}
          <button
            onClick={() => setShowCustom(!showCustom)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full border border-blue-500/50 bg-blue-900/40 text-blue-200 text-xs font-medium transition-all hover:scale-105 active:scale-95"
          >
            <span>📝</span>
            <span>自定义</span>
          </button>
        </div>

        {/* 自定义标记输入 */}
        {showCustom && (
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={customIcon}
              onChange={(e) => setCustomIcon(e.target.value)}
              className="w-12 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-center text-lg"
              maxLength={2}
              placeholder="图标"
            />
            <input
              type="text"
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              className="flex-1 bg-slate-800 border border-slate-600 rounded px-3 py-1 text-sm text-white"
              maxLength={20}
              placeholder="标记名称"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddCustom();
              }}
            />
            <button
              onClick={handleAddCustom}
              disabled={!customLabel.trim()}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              添加
            </button>
          </div>
        )}

        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="mt-auto py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg font-medium transition"
        >
          关闭
        </button>
      </div>
    </div>
  );
}

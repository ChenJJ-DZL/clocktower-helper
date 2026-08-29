"use client";

import { useMemo } from "react";
import type { Script } from "../../../app/data";
import { ModalWrapper } from "./ModalWrapper";

interface PlayerCompositionModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPlayerCount?: number;
  script?: Script | null;
  scriptName?: string;
  minPlayers?: number;
  maxPlayers?: number;
}

// 官方标准人数配比数据 (5 ~ 15+ 人)
const ALL_COMPOSITION_DATA = [
  {
    count: 5,
    label: "5",
    townsfolk: 3,
    outsider: 0,
    minion: 1,
    demon: 1,
    isTeensy: true,
  },
  {
    count: 6,
    label: "6",
    townsfolk: 3,
    outsider: 1,
    minion: 1,
    demon: 1,
    isTeensy: true,
  },
  {
    count: 7,
    label: "7",
    townsfolk: 5,
    outsider: 0,
    minion: 1,
    demon: 1,
    isTeensy: false,
  },
  {
    count: 8,
    label: "8",
    townsfolk: 5,
    outsider: 1,
    minion: 1,
    demon: 1,
    isTeensy: false,
  },
  {
    count: 9,
    label: "9",
    townsfolk: 5,
    outsider: 2,
    minion: 1,
    demon: 1,
    isTeensy: false,
  },
  {
    count: 10,
    label: "10",
    townsfolk: 7,
    outsider: 0,
    minion: 2,
    demon: 1,
    isTeensy: false,
  },
  {
    count: 11,
    label: "11",
    townsfolk: 7,
    outsider: 1,
    minion: 2,
    demon: 1,
    isTeensy: false,
  },
  {
    count: 12,
    label: "12",
    townsfolk: 7,
    outsider: 2,
    minion: 2,
    demon: 1,
    isTeensy: false,
  },
  {
    count: 13,
    label: "13",
    townsfolk: 9,
    outsider: 0,
    minion: 3,
    demon: 1,
    isTeensy: false,
  },
  {
    count: 14,
    label: "14",
    townsfolk: 9,
    outsider: 1,
    minion: 3,
    demon: 1,
    isTeensy: false,
  },
  {
    count: 15,
    label: "15+",
    townsfolk: 9,
    outsider: 2,
    minion: 3,
    demon: 1,
    isTeensy: false,
  },
];

export function PlayerCompositionModal({
  isOpen,
  onClose,
  currentPlayerCount,
  script,
  scriptName,
  minPlayers,
  maxPlayers,
}: PlayerCompositionModalProps) {
  // 解析当前剧本的人数范围（若为 7-15 人剧本，则只显示 7-15+）
  const currentMin = useMemo(() => {
    if (minPlayers) return minPlayers;
    if (script?.minPlayers) return script.minPlayers;
    if (script?.recommendedPlayers) {
      const m = script.recommendedPlayers.match(/(\d+)\s*-\s*(\d+)/);
      if (m) return parseInt(m[1], 10);
    }
    return 7;
  }, [minPlayers, script]);

  const currentMax = useMemo(() => {
    if (maxPlayers) return maxPlayers;
    if (script?.maxPlayers) return script.maxPlayers;
    if (script?.recommendedPlayers) {
      const m = script.recommendedPlayers.match(/(\d+)\s*-\s*(\d+)/);
      if (m) return parseInt(m[2], 10);
    }
    return 15;
  }, [maxPlayers, script]);

  const displayName = scriptName || script?.name;

  // 根据当前剧本支持的人数范围动态过滤展示列
  const compositionData = useMemo(() => {
    return ALL_COMPOSITION_DATA.filter(
      (c) => c.count >= currentMin && c.count <= currentMax
    );
  }, [currentMin, currentMax]);

  if (!isOpen) return null;

  const hasDivider =
    compositionData.some((c) => c.count === 6) &&
    compositionData.some((c) => c.count === 7);

  return (
    <ModalWrapper
      title="📜 官方标准阵营人数配比表"
      onClose={onClose}
      className="max-w-4xl w-[96vw] max-h-[90vh] flex flex-col p-2 overflow-hidden"
      footer={
        <div className="flex items-center justify-between gap-4 w-full">
          <div className="text-sm sm:text-base text-slate-300">
            {displayName && (
              <span className="text-amber-300 font-bold mr-2">
                【{displayName}】
              </span>
            )}
            <span>当前已分配：</span>
            <b className="text-amber-400 text-base sm:text-lg ml-1">
              {currentPlayerCount ? `${currentPlayerCount} 人` : "未定"}
            </b>
            <span className="text-slate-400 ml-2">
              (剧本座位上限：{currentMax} 人)
            </span>
          </div>
          <button
            onClick={onClose}
            className="px-8 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-base sm:text-lg transition cursor-pointer shadow-md active:scale-95"
          >
            我已知晓
          </button>
        </div>
      }
    >
      <div className="space-y-6 p-2 overflow-y-auto my-auto w-full">
        {/* 顶部标题与范围说明 */}
        <div className="text-center space-y-2">
          <div className="inline-block px-5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 font-black text-base sm:text-xl">
            {displayName ? `《${displayName}》` : ""} 支持 {currentMin} -{" "}
            {currentMax >= 15 ? "15+" : currentMax} 人
          </div>
          <p className="text-sm sm:text-base text-slate-300 font-medium">
            官方标准阵营人数配置速查 ·{" "}
            {hasDivider
              ? "竖线左侧为小局模式（5~6人），右侧为标准局（7人及以上）"
              : "已根据当前剧本建议人数范围精准匹配"}
          </p>
        </div>

        {/* 核心经典表格 */}
        <div className="overflow-x-auto rounded-2xl border-2 border-amber-500/40 bg-gradient-to-b from-[#2a131b] via-[#1c121e] to-[#120c18] p-4 shadow-2xl">
          <table className="w-full table-fixed border-collapse">
            <colgroup>
              <col className="w-28 sm:w-36" />
              {compositionData.map((col) => (
                <col key={col.label} />
              ))}
            </colgroup>
            <thead>
              <tr className="border-b border-amber-500/30">
                <th className="py-3 px-3 text-left font-black text-base sm:text-lg text-slate-200 whitespace-nowrap">
                  玩家数量
                </th>
                {compositionData.map((col) => {
                  const isDivider = col.count === 6 && hasDivider;
                  return (
                    <th
                      key={col.label}
                      className={`py-3 px-1 font-black text-base sm:text-xl text-center text-slate-200 whitespace-nowrap ${
                        isDivider
                          ? "border-r-2 border-amber-400/60"
                          : "border-r border-white/5"
                      }`}
                    >
                      <span>{col.label}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-500/15 text-base sm:text-lg font-bold">
              {/* 镇民 */}
              <tr className="hover:bg-white/5 transition">
                <td className="py-3 px-3 text-left font-black text-sky-300 flex items-center gap-2 whitespace-nowrap">
                  <span className="w-3 h-3 rounded-full bg-sky-400 shrink-0"></span>
                  <span>镇民</span>
                </td>
                {compositionData.map((col, idx) => {
                  const isDivider = col.count === 6 && hasDivider;
                  return (
                    <td
                      key={idx}
                      className={`py-3 px-1 text-center font-black text-lg sm:text-2xl text-sky-200 ${
                        isDivider
                          ? "border-r-2 border-amber-400/60"
                          : "border-r border-white/5"
                      }`}
                    >
                      {col.townsfolk}
                    </td>
                  );
                })}
              </tr>

              {/* 外来者 */}
              <tr className="hover:bg-white/5 transition">
                <td className="py-3 px-3 text-left font-black text-teal-300 flex items-center gap-2 whitespace-nowrap">
                  <span className="w-3 h-3 rounded-full bg-teal-400 shrink-0"></span>
                  <span>外来者</span>
                </td>
                {compositionData.map((col, idx) => {
                  const isDivider = col.count === 6 && hasDivider;
                  return (
                    <td
                      key={idx}
                      className={`py-3 px-1 text-center font-black text-lg sm:text-2xl text-teal-200 ${
                        isDivider
                          ? "border-r-2 border-amber-400/60"
                          : "border-r border-white/5"
                      }`}
                    >
                      {col.outsider}
                    </td>
                  );
                })}
              </tr>

              {/* 爪牙 */}
              <tr className="hover:bg-white/5 transition">
                <td className="py-3 px-3 text-left font-black text-orange-300 flex items-center gap-2 whitespace-nowrap">
                  <span className="w-3 h-3 rounded-full bg-orange-400 shrink-0"></span>
                  <span>爪牙</span>
                </td>
                {compositionData.map((col, idx) => {
                  const isDivider = col.count === 6 && hasDivider;
                  return (
                    <td
                      key={idx}
                      className={`py-3 px-1 text-center font-black text-lg sm:text-2xl text-orange-200 ${
                        isDivider
                          ? "border-r-2 border-amber-400/60"
                          : "border-r border-white/5"
                      }`}
                    >
                      {col.minion}
                    </td>
                  );
                })}
              </tr>

              {/* 恶魔 */}
              <tr className="hover:bg-white/5 transition">
                <td className="py-3 px-3 text-left font-black text-rose-400 flex items-center gap-2 whitespace-nowrap">
                  <span className="w-3 h-3 rounded-full bg-rose-500 shrink-0"></span>
                  <span>恶魔</span>
                </td>
                {compositionData.map((col, idx) => {
                  const isDivider = col.count === 6 && hasDivider;
                  return (
                    <td
                      key={idx}
                      className={`py-3 px-1 text-center font-black text-lg sm:text-2xl text-rose-300 ${
                        isDivider
                          ? "border-r-2 border-amber-400/60"
                          : "border-r border-white/5"
                      }`}
                    >
                      {col.demon}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>

        {/* 底部说书人规则备注与动态提示 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1 text-sm sm:text-base">
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 space-y-2">
            <div className="flex items-center gap-2 text-amber-300 font-bold text-base sm:text-lg">
              <span>💡</span>
              <span>人数规则提示</span>
            </div>
            <ul className="space-y-1.5 text-slate-300 pl-4 list-disc leading-relaxed">
              {currentMin <= 6 && (
                <li>
                  <b>5~6人（小局模式）</b>：仅有 1 个爪牙与 1
                  个恶魔，无不在场的恶魔虚假伪装（或使用汀西维尔规则）。
                </li>
              )}
              <li>
                <b>7~15人（标准局）</b>：恶魔初始知晓其爪牙身份并获得 3
                个不在场的善良角色伪装；爪牙初始知晓恶魔是谁。
              </li>
              {currentMax >= 15 && (
                <li>
                  <b>16人及以上</b>：超出 15 人的玩家作为
                  <b>「旅行者（Traveler）」</b>加入，不改变基础镇民/爪牙配比。
                </li>
              )}
            </ul>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 space-y-2">
            <div className="flex items-center gap-2 text-orange-300 font-bold text-base sm:text-lg">
              <span>⚡</span>
              <span>角色技能对配比的动态改变</span>
            </div>
            <ul className="space-y-1.5 text-slate-300 pl-4 list-disc leading-relaxed">
              <li>
                <b>男爵 (Baron)</b>：在场时外来者数量 <b>+2</b>（镇民数量相应{" "}
                <b>-2</b>）。
              </li>
              <li>
                <b>教父 (Godfather)</b>：外来者数量 <b>+1 或 -1</b>。
              </li>
              <li>
                <b>气球驾驶员 (Balloonist)</b>：外来者数量 <b>+1</b>（镇民{" "}
                <b>-1</b>）。
              </li>
              <li>
                <b>卡扎利 / 哨兵 / 疯子</b>
                ：可能按技能特殊调整外来者数量与爪牙选择。
              </li>
            </ul>
          </div>
        </div>
      </div>
    </ModalWrapper>
  );
}

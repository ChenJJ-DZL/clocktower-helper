"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  roles as allSystemRoles,
  type Role,
  type Script,
} from "../../../app/data";
import { nightOrderParser } from "../../utils/nightOrderParser";
import {
  generateAndSortQuickStartLineup,
  STANDARD_COMPOSITIONS,
  shuffle,
} from "../../utils/quickStartGenerator";
import { ModalWrapper } from "./ModalWrapper";

export interface QuickStartModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedScript: Script | null;
  onConfirm: (
    playerCount: number,
    sortedRoles: Array<
      Role & {
        charadeRole?: Role | null;
        apparentDemonRole?: Role | null;
        displayRole?: Role | null;
      }
    >
  ) => void;
}

export function QuickStartModal({
  isOpen,
  onClose,
  selectedScript,
  onConfirm,
}: QuickStartModalProps) {
  // 可选人数范围 (默认 5 ~ 15 人)
  const playerCounts = useMemo(
    () => [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    []
  );

  // 当前选中的人数（默认 7 人，或剧本推荐中位数）
  const [selectedCount, setSelectedCount] = useState<number>(7);

  // 当前生成的阵容
  const [lineupData, setLineupData] = useState<{
    sortedRoles: Array<
      Role & {
        charadeRole?: Role | null;
        apparentDemonRole?: Role | null;
        displayRole?: Role | null;
      }
    >;
    hasBaron: boolean;
    composition: {
      townsfolk: number;
      outsider: number;
      minion: number;
      demon: number;
    };
  } | null>(null);

  // 重新抽取阵容
  const rollLineup = useCallback(
    (count: number) => {
      if (!selectedScript) return;
      const res = generateAndSortQuickStartLineup(
        selectedScript,
        allSystemRoles,
        count
      );
      setLineupData(res);
    },
    [selectedScript]
  );

  // 初始化或切换人数时自动抽取
  useEffect(() => {
    if (isOpen && selectedScript) {
      rollLineup(selectedCount);
    }
  }, [isOpen, selectedScript, selectedCount, rollLineup]);

  // 按四大阵营对抽取的角色进行分组
  const { townsfolkList, outsiderList, minionList, demonList } = useMemo(() => {
    if (!lineupData || !lineupData.sortedRoles) {
      return {
        townsfolkList: [],
        outsiderList: [],
        minionList: [],
        demonList: [],
      };
    }

    return {
      townsfolkList: lineupData.sortedRoles.filter(
        (r) => r.type === "townsfolk"
      ),
      outsiderList: lineupData.sortedRoles.filter((r) => r.type === "outsider"),
      minionList: lineupData.sortedRoles.filter((r) => r.type === "minion"),
      demonList: lineupData.sortedRoles.filter((r) => r.type === "demon"),
    };
  }, [lineupData]);

  if (!isOpen || !selectedScript) return null;

  const getActionOrderTag = (roleId: string) => {
    const firstP = nightOrderParser.getRolePriority(roleId, true);
    const otherP = nightOrderParser.getRolePriority(roleId, false);
    if (firstP > 0 && firstP < 900) {
      return {
        text: `首夜第${firstP}位`,
        color: "text-amber-300 bg-amber-950/40 border-amber-500/30",
      };
    }
    if (otherP > 0 && otherP < 900) {
      return {
        text: `非首夜第${otherP}位`,
        color: "text-purple-300 bg-purple-950/40 border-purple-500/30",
      };
    }
    return {
      text: "被动能力",
      color: "text-slate-400 bg-slate-800/60 border-slate-700/40",
    };
  };

  const renderRoleCard = (
    role: Role & {
      charadeRole?: Role | null;
      apparentDemonRole?: Role | null;
    },
    indexInFaction: number,
    factionTheme: "blue" | "teal" | "amber" | "red"
  ) => {
    const actionTag = getActionOrderTag(role.id);
    const badgeColorClass = {
      blue: "border-blue-500/50 bg-blue-900/40 text-blue-200",
      teal: "border-teal-500/50 bg-teal-900/40 text-teal-200",
      amber: "border-amber-500/50 bg-amber-900/40 text-amber-200",
      red: "border-red-500/50 bg-red-900/40 text-red-200",
    }[factionTheme];

    return (
      <div
        key={`${role.id}-${indexInFaction}`}
        className="flex items-center justify-between p-2 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition gap-2"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`w-6 h-6 rounded-full border text-xs font-mono font-black flex items-center justify-center shrink-0 ${badgeColorClass}`}
          >
            {indexInFaction}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-slate-100 truncate">
                {role.name}
              </span>
              {role.id === "drunk" && role.charadeRole && (
                <span className="text-[10px] px-1 py-0.2 rounded bg-blue-900/60 text-blue-300 border border-blue-400/40 shrink-0">
                  假扮: {role.charadeRole.name}
                </span>
              )}
              {role.id === "lunatic" && role.apparentDemonRole && (
                <span className="text-[10px] px-1 py-0.2 rounded bg-red-900/60 text-red-300 border border-red-400/40 shrink-0">
                  假恶魔: {role.apparentDemonRole.name}
                </span>
              )}
            </div>
          </div>
        </div>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 font-medium ${actionTag.color}`}
        >
          {actionTag.text}
        </span>
      </div>
    );
  };

  // 标题行内容：标题 + 当前剧本标识 + 刷新/换一批 按钮
  const modalTitle = (
    <div className="flex items-center justify-between gap-4 w-full pr-3">
      {/* 左侧：标题 + 当前剧本 */}
      <div className="flex items-center gap-3">
        <span className="text-xl sm:text-2xl font-black text-white flex items-center gap-1.5">
          <span>⚡</span>
          <span>快速开始</span>
        </span>
        <div className="flex items-center gap-1.5 px-3.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300 shadow-sm">
          <span className="text-xs font-bold text-amber-400/80">当前剧本</span>
          <span className="text-sm sm:text-base font-black tracking-wide text-amber-200">
            【{selectedScript.name}】
          </span>
        </div>
      </div>

      {/* 右侧：放大后的刷新/换一批按钮 */}
      <button
        type="button"
        onClick={() => rollLineup(selectedCount)}
        className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-black text-sm flex items-center gap-2 shadow-lg shadow-indigo-950/50 border border-indigo-400/40 transition active:scale-95 cursor-pointer"
        title="重新随机抽取符合该人数的阵容清单"
      >
        <span className="text-base">🔄</span>
        <span>刷新 / 换一批</span>
      </button>
    </div>
  );

  return (
    <ModalWrapper
      title={modalTitle}
      onClose={onClose}
      size="fullscreen90"
      className="w-[94vw] max-w-7xl max-h-[92vh] flex flex-col p-3 overflow-hidden"
      footer={
        <div className="flex items-center justify-between w-full">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 font-bold text-sm transition active:scale-95 cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => {
              if (lineupData && lineupData.sortedRoles.length > 0) {
                // 🎲 按照当前筛选的角色清单随机分配座位号
                const randomizedRoles = shuffle(lineupData.sortedRoles);
                onConfirm(selectedCount, randomizedRoles);
                onClose();
              }
            }}
            className="px-8 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-sm shadow-lg shadow-emerald-900/40 transition active:scale-95 cursor-pointer flex items-center gap-2"
            title="按照当前筛选出的角色随机分配各个座位号"
          >
            <span className="text-base">🎲</span>
            <span>随机落座</span>
          </button>
        </div>
      }
    >
      <div className="flex-1 flex flex-col gap-3 text-slate-200 overflow-hidden min-h-0">
        {/* 人数选择列表（官方标准人数阵营配比表） */}
        <div className="space-y-1.5 shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">
              选择游戏人数
            </span>
            <span className="text-[11px] text-slate-500">
              配比格式：镇民 / 外来者 / 爪牙 / 恶魔
            </span>
          </div>
          <div className="grid grid-cols-6 sm:grid-cols-11 gap-1.5">
            {playerCounts.map((count) => {
              const comp = STANDARD_COMPOSITIONS[count];
              const isSelected = selectedCount === count;
              return (
                <button
                  key={count}
                  type="button"
                  onClick={() => setSelectedCount(count)}
                  className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl border transition cursor-pointer ${
                    isSelected
                      ? "bg-emerald-600/30 border-emerald-400 text-white shadow-md shadow-emerald-950/50 ring-2 ring-emerald-500/40"
                      : "bg-slate-900/50 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <span
                    className={`text-sm font-black ${
                      isSelected ? "text-emerald-300" : ""
                    }`}
                  >
                    {count}人
                  </span>
                  {comp && (
                    <span className="text-[10px] scale-90 text-slate-400 font-mono">
                      {comp.townsfolk}/{comp.outsider}/{comp.minion}/
                      {comp.demon}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 特殊角色提示 (如男爵修正) */}
        {lineupData?.hasBaron && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs font-semibold shrink-0">
            <span>🏚️</span>
            <span>
              已抽中【男爵】：阵容自动调整为{" "}
              <b className="text-amber-300">
                {lineupData.composition.townsfolk} 镇民 /{" "}
                {lineupData.composition.outsider} 外来者 /{" "}
                {lineupData.composition.minion} 爪牙 /{" "}
                {lineupData.composition.demon} 恶魔
              </b>
            </span>
          </div>
        )}

        {/* 四大阵营分类预览区（镇民 / 外来者 / 爪牙 / 恶魔） */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-3 min-h-0 overflow-y-auto">
          {/* 1. 镇民区 */}
          <div className="flex flex-col rounded-2xl bg-blue-950/20 border border-blue-500/30 p-2.5 overflow-hidden">
            <div className="flex items-center justify-between pb-2 border-b border-blue-500/20 mb-2 shrink-0">
              <div className="flex items-center gap-1.5 text-blue-300 font-black text-sm">
                <span>🔵</span>
                <span>镇民</span>
              </div>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300">
                {townsfolkList.length} 人
              </span>
            </div>
            <div className="flex-1 space-y-1.5 overflow-y-auto pr-0.5">
              {townsfolkList.map((r, i) => renderRoleCard(r, i + 1, "blue"))}
            </div>
          </div>

          {/* 2. 外来者区 */}
          <div className="flex flex-col rounded-2xl bg-teal-950/20 border border-teal-500/30 p-2.5 overflow-hidden">
            <div className="flex items-center justify-between pb-2 border-b border-teal-500/20 mb-2 shrink-0">
              <div className="flex items-center gap-1.5 text-teal-300 font-black text-sm">
                <span>🟢</span>
                <span>外来者</span>
              </div>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300">
                {outsiderList.length} 人
              </span>
            </div>
            <div className="flex-1 space-y-1.5 overflow-y-auto pr-0.5">
              {outsiderList.length > 0 ? (
                outsiderList.map((r, i) => renderRoleCard(r, i + 1, "teal"))
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-500 py-6">
                  无外来者
                </div>
              )}
            </div>
          </div>

          {/* 3. 爪牙区 */}
          <div className="flex flex-col rounded-2xl bg-amber-950/20 border border-amber-500/30 p-2.5 overflow-hidden">
            <div className="flex items-center justify-between pb-2 border-b border-amber-500/20 mb-2 shrink-0">
              <div className="flex items-center gap-1.5 text-amber-300 font-black text-sm">
                <span>🟡</span>
                <span>爪牙</span>
              </div>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
                {minionList.length} 人
              </span>
            </div>
            <div className="flex-1 space-y-1.5 overflow-y-auto pr-0.5">
              {minionList.map((r, i) => renderRoleCard(r, i + 1, "amber"))}
            </div>
          </div>

          {/* 4. 恶魔区 */}
          <div className="flex flex-col rounded-2xl bg-red-950/20 border border-red-500/30 p-2.5 overflow-hidden">
            <div className="flex items-center justify-between pb-2 border-b border-red-500/20 mb-2 shrink-0">
              <div className="flex items-center gap-1.5 text-red-300 font-black text-sm">
                <span>🔴</span>
                <span>恶魔</span>
              </div>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-300">
                {demonList.length} 人
              </span>
            </div>
            <div className="flex-1 space-y-1.5 overflow-y-auto pr-0.5">
              {demonList.map((r, i) => renderRoleCard(r, i + 1, "red"))}
            </div>
          </div>
        </div>
      </div>
    </ModalWrapper>
  );
}

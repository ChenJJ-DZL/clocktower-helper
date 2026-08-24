"use client";

import React, { useState, useMemo, useEffect } from "react";
import { roles, scripts, type Role, type RoleType } from "../../../app/data";
import { getCharacterWikiDetails, type CharacterWikiDetails } from "../../utils/characterWikiLookup";
import { ModalWrapper } from "./ModalWrapper";

interface RoleCodexModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialRoleId?: string;
}

const TYPE_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; border: string; tokenBg: string }
> = {
  townsfolk: {
    label: "镇民",
    bg: "bg-blue-900/30",
    text: "text-blue-300",
    border: "border-blue-500/40",
    tokenBg: "bg-gradient-to-br from-blue-900 to-slate-950 border-blue-400 text-blue-200",
  },
  outsider: {
    label: "外来者",
    bg: "bg-teal-900/30",
    text: "text-teal-300",
    border: "border-teal-500/40",
    tokenBg: "bg-gradient-to-br from-teal-900 to-slate-950 border-teal-400 text-teal-200",
  },
  minion: {
    label: "爪牙",
    bg: "bg-orange-900/30",
    text: "text-orange-300",
    border: "border-orange-500/40",
    tokenBg: "bg-gradient-to-br from-orange-900 to-slate-950 border-orange-400 text-orange-200",
  },
  demon: {
    label: "恶魔",
    bg: "bg-red-900/30",
    text: "text-red-300",
    border: "border-red-500/40",
    tokenBg: "bg-gradient-to-br from-red-900 to-slate-950 border-red-500 text-red-200",
  },
  traveler: {
    label: "旅行者",
    bg: "bg-purple-900/30",
    text: "text-purple-300",
    border: "border-purple-500/40",
    tokenBg: "bg-gradient-to-br from-purple-900 to-slate-950 border-purple-400 text-purple-200",
  },
  fabled: {
    label: "传奇角色",
    bg: "bg-amber-900/30",
    text: "text-amber-300",
    border: "border-amber-500/40",
    tokenBg: "bg-gradient-to-br from-slate-800 to-slate-950 border-amber-400 text-amber-200",
  },
};

const ORDERED_TYPES: RoleType[] = [
  "townsfolk",
  "outsider",
  "minion",
  "demon",
  "traveler",
  "fabled",
];

export function RoleCodexModal({
  isOpen,
  onClose,
  initialRoleId,
}: RoleCodexModalProps) {
  // 浏览模式："by_script" (按剧本分组) | "flat_grid" (平铺全览)
  const [viewMode, setViewMode] = useState<"by_script" | "flat_grid">("by_script");

  // 当前选中的剧本标签
  const [selectedScriptId, setSelectedScriptId] = useState<string>("trouble_brewing");

  // 阵营筛选
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>("all");

  // 搜索关键字
  const [searchQuery, setSearchQuery] = useState("");

  // 当前正在查看详情的角色 (null 表示浏览列表)
  const [inspectingRole, setInspectingRole] = useState<Role | null>(null);

  // 初始化定位角色
  useEffect(() => {
    if (initialRoleId) {
      const target = roles.find((r) => r.id === initialRoleId);
      if (target) setInspectingRole(target);
    }
  }, [initialRoleId]);

  // 所有可用角色列表（去重 & 过滤无效）
  const allRoles = useMemo(() => {
    return roles.filter((r) => !r.hidden && r.name);
  }, []);

  // 搜索过滤后的角色列表
  const searchedRoles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allRoles.filter((r) => {
      // 阵营筛选
      if (selectedTypeFilter !== "all" && r.type !== selectedTypeFilter) {
        return false;
      }
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        (r.ability && r.ability.toLowerCase().includes(q)) ||
        (r.script && r.script.toLowerCase().includes(q))
      );
    });
  }, [allRoles, searchQuery, selectedTypeFilter]);

  // 当前剧本下的角色（在剧本模式下使用）
  const currentScriptRoles = useMemo(() => {
    if (selectedScriptId === "all") {
      return searchedRoles;
    }
    const targetScript = scripts.find((s) => s.id === selectedScriptId);
    if (!targetScript) return searchedRoles;

    if (targetScript.roleIds && targetScript.roleIds.length > 0) {
      const scriptRoleSet = new Set(targetScript.roleIds);
      return searchedRoles.filter((r) => scriptRoleSet.has(r.id));
    }

    return searchedRoles.filter(
      (r) =>
        r.script === targetScript.name ||
        (!r.script && targetScript.id === "trouble_brewing")
    );
  }, [searchedRoles, selectedScriptId]);

  // 当前剧本角色按阵营分组
  const groupedScriptRoles = useMemo(() => {
    const groups: Record<string, Role[]> = {};
    for (const type of ORDERED_TYPES) {
      groups[type] = [];
    }
    for (const r of currentScriptRoles) {
      const type = r.type || "townsfolk";
      if (!groups[type]) groups[type] = [];
      groups[type].push(r);
    }
    return groups;
  }, [currentScriptRoles]);

  // 详情页：获取当前查看角色的详细百科信息
  const inspectingWikiDetails = useMemo(() => {
    if (!inspectingRole) return null;
    return getCharacterWikiDetails(inspectingRole);
  }, [inspectingRole]);

  // 详情页：前后翻阅导航
  const currentInspectIndex = useMemo(() => {
    if (!inspectingRole) return -1;
    return searchedRoles.findIndex((r) => r.id === inspectingRole.id);
  }, [inspectingRole, searchedRoles]);

  const handlePrevInspect = () => {
    if (currentInspectIndex > 0) {
      setInspectingRole(searchedRoles[currentInspectIndex - 1]);
    }
  };

  const handleNextInspect = () => {
    if (currentInspectIndex < searchedRoles.length - 1) {
      setInspectingRole(searchedRoles[currentInspectIndex + 1]);
    }
  };

  if (!isOpen) return null;

  return (
    <ModalWrapper
      title={inspectingRole ? `📖 角色图鉴 · ${inspectingRole.name}` : "📖 血染钟楼 · 全角色图鉴与百科"}
      onClose={onClose}
      className="max-w-7xl w-[98vw] h-[94vh] max-h-[94vh] flex flex-col p-2 overflow-hidden"
      footer={
        inspectingRole ? (
          <div className="flex flex-wrap items-center justify-between gap-3 w-full">
            <button
              type="button"
              onClick={() => setInspectingRole(null)}
              className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm border border-white/20 transition flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <span>←</span>
              <span>返回图鉴列表</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrevInspect}
                disabled={currentInspectIndex <= 0}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm border border-white/10 transition disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer"
              >
                <span>⬅ 上一个</span>
                <span>{currentInspectIndex > 0 ? `(${searchedRoles[currentInspectIndex - 1].name})` : ""}</span>
              </button>

              <span className="text-xs text-slate-400 font-mono px-2">
                {currentInspectIndex + 1} / {searchedRoles.length}
              </span>

              <button
                type="button"
                onClick={handleNextInspect}
                disabled={currentInspectIndex >= searchedRoles.length - 1}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm transition disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer"
              >
                <span>下一个 ➡</span>
                <span>{currentInspectIndex < searchedRoles.length - 1 ? `(${searchedRoles[currentInspectIndex + 1].name})` : ""}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 w-full text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>共收录 <b>{allRoles.length}</b> 个角色 · 点击任意角色卡片即可查阅详细技能说明与官方进阶打法</span>
            </div>
            <button
              onClick={onClose}
              className="px-6 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm transition"
            >
              关闭
            </button>
          </div>
        )
      }
    >
      {inspectingRole ? (
        /* ========================================================== */
        /* 角色详细说明页 (Role Detailed Card - 格式参考角色展示卡) */
        /* ========================================================== */
        <div className="w-full h-full flex flex-col lg:flex-row gap-4 items-stretch overflow-hidden">
          {/* 左侧核心信息栏 */}
          <div className="w-full lg:w-[45%] xl:w-[40%] shrink-0 flex flex-col justify-between p-5 sm:p-6 rounded-2xl bg-gradient-to-b from-slate-900/95 via-slate-900/90 to-slate-950 border-2 border-white/10 shadow-2xl space-y-4 overflow-y-auto">
            {/* 顶部标题与阵营标签 */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <span className="px-3.5 py-1 rounded-xl bg-amber-500 text-slate-950 font-black text-lg shadow-md shadow-amber-500/30">
                  图鉴
                </span>
                <span className="text-xl sm:text-2xl font-black text-slate-100">
                  角色档案
                </span>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold border ${
                  TYPE_CONFIG[inspectingRole.type]?.bg || "bg-slate-800"
                } ${TYPE_CONFIG[inspectingRole.type]?.text || "text-slate-200"} ${
                  TYPE_CONFIG[inspectingRole.type]?.border || "border-white/20"
                }`}
              >
                {TYPE_CONFIG[inspectingRole.type]?.label || "特殊角色"}
              </span>
            </div>

            {/* 角色代币与名称 */}
            <div className="flex items-center gap-4 py-1 shrink-0">
              <div
                className={`w-20 h-20 sm:w-22 sm:h-22 rounded-full border-4 flex items-center justify-center text-center p-2 font-black text-base sm:text-lg shadow-2xl shrink-0 ${
                  TYPE_CONFIG[inspectingRole.type]?.tokenBg || "bg-slate-800 border-amber-400 text-amber-200"
                }`}
              >
                <span>{inspectingRole.name}</span>
              </div>
              <div className="space-y-1 min-w-0 flex-1">
                <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-100 drop-shadow-md leading-tight">
                  {inspectingRole.name}
                </h2>
                <p className="text-sm text-slate-300 font-mono font-medium">
                  {inspectingWikiDetails?.englishName || inspectingRole.id}
                </p>
                {inspectingWikiDetails?.script && (
                  <p className="text-xs text-slate-400">
                    所属剧本：<span className="text-slate-200 font-semibold">{inspectingWikiDetails.script}</span>
                  </p>
                )}
              </div>
            </div>

            {/* 技能说明卡片 */}
            <div className="p-4 rounded-xl bg-black/40 border border-white/15 space-y-2 flex-1 flex flex-col justify-center">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300 uppercase tracking-wider">
                <span>⚡</span>
                <span>【角色能力】</span>
              </div>
              <p className="text-base sm:text-lg font-medium text-slate-100 leading-relaxed pl-1">
                {inspectingWikiDetails?.abilityText || inspectingRole.ability || "无特殊能力描述"}
              </p>
            </div>

            {/* 提示标记说明 (如果有) */}
            {inspectingWikiDetails?.reminderTokens && (
              <div className="p-3 rounded-xl bg-slate-800/60 border border-white/10 text-xs text-slate-300 space-y-1 shrink-0">
                <div className="flex items-center gap-1 font-bold text-amber-300">
                  <span>🏷️</span>
                  <span>提示标记运作</span>
                </div>
                <p className="text-slate-300 leading-relaxed whitespace-pre-line text-xs">
                  {inspectingWikiDetails.reminderTokens}
                </p>
              </div>
            )}
          </div>

          {/* 右侧官方玩法推荐与进阶技巧栏 */}
          <div className="flex-1 flex flex-col p-5 sm:p-6 rounded-2xl bg-slate-900/90 border border-white/10 shadow-2xl space-y-3.5 overflow-hidden">
            {/* 栏目标题与百科链接 */}
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xl">📖</span>
                <h3 className="text-base sm:text-lg font-bold text-slate-200">
                  官方玩法推荐 & 进阶技巧
                </h3>
              </div>
              {inspectingWikiDetails?.url && (
                <a
                  href={inspectingWikiDetails.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-sky-400 hover:text-sky-300 underline flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-950/60 border border-sky-500/40 shadow-sm transition"
                >
                  <span>百科原页</span>
                  <span>↗</span>
                </a>
              )}
            </div>

            {/* 玩法内容滚动区 */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-2">
              {/* 官方名言金句 */}
              {inspectingWikiDetails?.flavorQuote && (
                <div className="p-3 rounded-xl bg-white/5 border-l-4 border-amber-500 text-xs sm:text-sm text-slate-300 italic">
                  {inspectingWikiDetails.flavorQuote}
                </div>
              )}

              {/* 核心打法与发言建议 */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                  <span>💡</span>
                  <span>核心打法与发言建议</span>
                </div>
                {inspectingWikiDetails?.strategyTips && inspectingWikiDetails.strategyTips.length > 0 ? (
                  <div className="space-y-2 pl-0.5">
                    {inspectingWikiDetails.strategyTips.map((tip, i) => (
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
                    {inspectingWikiDetails?.overview || "暂无该角色的特殊玩法技巧说明。"}
                  </p>
                )}
              </div>

              {/* 角色简介与运作机制 */}
              {inspectingWikiDetails?.overview && (
                <div className="space-y-1.5 pt-2 border-t border-white/10">
                  <div className="flex items-center gap-1 text-xs font-bold text-slate-400">
                    <span>📜</span>
                    <span>角色简介</span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed pl-2">
                    {inspectingWikiDetails.overview}
                  </p>
                </div>
              )}

              {/* 伪装思路推荐 */}
              {inspectingWikiDetails?.bluffTips && inspectingWikiDetails.bluffTips.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-white/10">
                  <div className="flex items-center gap-1 text-xs font-bold text-orange-400">
                    <span>🎭</span>
                    <span>伪装思路推荐</span>
                  </div>
                  <div className="space-y-1.5 pl-2">
                    {inspectingWikiDetails.bluffTips.map((bTip, idx) => (
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
      ) : (
        /* ========================================================== */
        /* 图鉴总览列表 (Codex Browser View)                          */
        /* ========================================================== */
        <div className="flex flex-col h-full space-y-3 overflow-hidden">
          {/* 顶部工具栏：剧本选择 / 模式切换 / 搜索框 */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3 rounded-2xl bg-slate-900/90 border border-white/10 shrink-0">
            {/* 左侧：浏览模式切换（按剧本 vs 平铺） */}
            <div className="flex items-center gap-2">
              <div className="flex items-center rounded-xl bg-black/40 p-1 border border-white/10">
                <button
                  type="button"
                  onClick={() => setViewMode("by_script")}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    viewMode === "by_script"
                      ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  📜 剧本分类
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("flat_grid")}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    viewMode === "flat_grid"
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  🎴 平铺全览
                </button>
              </div>

              {/* 如果是剧本分类模式，显示剧本标签 */}
              {viewMode === "by_script" && (
                <div className="flex items-center gap-1.5 overflow-x-auto max-w-md py-0.5">
                  {scripts.map((sc) => (
                    <button
                      key={sc.id}
                      type="button"
                      onClick={() => setSelectedScriptId(sc.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition shrink-0 cursor-pointer ${
                        selectedScriptId === sc.id
                          ? "bg-slate-800 text-amber-300 border border-amber-500/50 shadow-sm"
                          : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                      }`}
                    >
                      {sc.name}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setSelectedScriptId("all")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition shrink-0 cursor-pointer ${
                      selectedScriptId === "all"
                        ? "bg-slate-800 text-amber-300 border border-amber-500/50 shadow-sm"
                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                    }`}
                  >
                    全部剧本
                  </button>
                </div>
              )}
            </div>

            {/* 右侧：阵营过滤胶囊 + 搜索框 */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-xs">
                {["all", "townsfolk", "outsider", "minion", "demon", "traveler"].map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setSelectedTypeFilter(type)}
                    className={`px-2.5 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                      selectedTypeFilter === type
                        ? "bg-amber-500 text-slate-950"
                        : "bg-slate-800/80 text-slate-400 hover:text-slate-200 border border-white/5"
                    }`}
                  >
                    {type === "all" ? "全部" : TYPE_CONFIG[type]?.label || type}
                  </button>
                ))}
              </div>

              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索角色名/技能..."
                  className="w-40 sm:w-48 px-3 py-1.5 pl-8 bg-black/50 border border-white/15 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
                />
                <span className="absolute left-2.5 top-2 text-xs text-slate-400">🔍</span>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1.5 text-xs text-slate-400 hover:text-white"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 角色卡片列表区域 */}
          <div className="flex-1 overflow-y-auto space-y-6 pr-1">
            {viewMode === "by_script" ? (
              /* 按剧本 + 阵营分组展示 */
              ORDERED_TYPES.map((type) => {
                const rolesInGroup = groupedScriptRoles[type] || [];
                if (rolesInGroup.length === 0) return null;

                const config = TYPE_CONFIG[type] || TYPE_CONFIG.townsfolk;

                return (
                  <div key={type} className="space-y-3">
                    {/* 分组标题 */}
                    <div className="flex items-center gap-2 border-b border-white/10 pb-1.5">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${config.bg} ${config.text} ${config.border}`}>
                        {config.label} ({rolesInGroup.length})
                      </span>
                    </div>

                    {/* 卡片网格 */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {rolesInGroup.map((role) => (
                        <RoleCardItem
                          key={role.id}
                          role={role}
                          config={config}
                          onClick={() => setInspectingRole(role)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })
            ) : (
              /* 平铺网格展示 */
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {searchedRoles.map((role) => {
                  const config = TYPE_CONFIG[role.type] || TYPE_CONFIG.townsfolk;
                  return (
                    <RoleCardItem
                      key={role.id}
                      role={role}
                      config={config}
                      onClick={() => setInspectingRole(role)}
                    />
                  );
                })}
              </div>
            )}

            {searchedRoles.length === 0 && (
              <div className="py-20 text-center text-slate-400 space-y-2">
                <span className="text-4xl">🔍</span>
                <p className="text-base font-bold text-slate-300">未找到符合条件的角色</p>
                <p className="text-xs text-slate-500">请尝试更换搜索关键字或重置阵营筛选条件</p>
              </div>
            )}
          </div>
        </div>
      )}
    </ModalWrapper>
  );
}

/** 单个角色卡片（名称 + 小字技能说明 + 代币） */
function RoleCardItem({
  role,
  config,
  onClick,
}: {
  role: Role;
  config: (typeof TYPE_CONFIG)[string];
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`group relative p-3.5 rounded-xl border bg-slate-900/80 hover:bg-slate-800/90 transition-all duration-200 cursor-pointer shadow-md hover:shadow-xl hover:-translate-y-0.5 flex flex-col justify-between space-y-2.5 ${config.border} hover:border-amber-400`}
    >
      {/* 头部：角色代币 + 名称 + 阵营标签 */}
      <div className="flex items-center gap-3">
        <div
          className={`w-11 h-11 rounded-full border-2 flex items-center justify-center text-center p-1 font-black text-xs shrink-0 shadow-md group-hover:scale-105 transition ${config.tokenBg}`}
        >
          <span>{role.name}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <h4 className="text-base font-black text-slate-100 group-hover:text-amber-300 transition truncate">
              {role.name}
            </h4>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold border shrink-0 ${config.bg} ${config.text} ${config.border}`}>
              {config.label}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 font-mono truncate">
            {role.id}
          </p>
        </div>
      </div>

      {/* 小字技能说明 */}
      <div className="p-2 rounded-lg bg-black/30 border border-white/5 flex-1 flex flex-col justify-center">
        <p className="text-xs text-slate-300 leading-relaxed line-clamp-3 group-hover:text-slate-100 transition">
          {role.ability || "无特殊能力说明"}
        </p>
      </div>

      {/* 底部小提示 */}
      <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-white/5">
        <span className="text-slate-400 truncate">{role.script || "基础剧本"}</span>
        <span className="text-amber-400 font-bold group-hover:underline flex items-center gap-0.5">
          <span>查阅详情</span>
          <span>→</span>
        </span>
      </div>
    </div>
  );
}

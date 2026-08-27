import { useMemo, useState } from "react";
import {
  FABLED_ROLES,
  type Role,
  roles,
  scripts,
  typeLabels,
} from "../../../../app/data";
import { showAlert } from "../../../utils/nativeDialogShim";
import { ModalWrapper } from "../../modals/ModalWrapper";

interface CustomScriptBuilderModalProps {
  isOpen?: boolean;
  onClose: () => void;
  onSave: (scriptName: string, selectedRoleIds: string[]) => void;
  onStartDirectly?: (scriptName: string, selectedRoleIds: string[]) => void;
}

/** 阵营徽章配色 */
const TYPE_BADGE: Record<string, { bg: string; text: string; border: string }> =
  {
    townsfolk: {
      bg: "bg-blue-900/40",
      text: "text-blue-300",
      border: "border-blue-600/40",
    },
    outsider: {
      bg: "bg-purple-900/40",
      text: "text-purple-300",
      border: "border-purple-600/40",
    },
    minion: {
      bg: "bg-orange-900/40",
      text: "text-orange-300",
      border: "border-orange-600/40",
    },
    demon: {
      bg: "bg-red-900/40",
      text: "text-red-300",
      border: "border-red-600/40",
    },
  };

/** 标准配比（7~15人） */
const STD_COMP: Record<
  number,
  { townsfolk: number; outsider: number; minion: number; demon: number }
> = {
  7: { townsfolk: 3, outsider: 2, minion: 1, demon: 1 },
  8: { townsfolk: 4, outsider: 2, minion: 1, demon: 1 },
  9: { townsfolk: 5, outsider: 2, minion: 1, demon: 1 },
  10: { townsfolk: 5, outsider: 2, minion: 2, demon: 1 },
  11: { townsfolk: 6, outsider: 2, minion: 2, demon: 1 },
  12: { townsfolk: 7, outsider: 2, minion: 2, demon: 1 },
  13: { townsfolk: 7, outsider: 3, minion: 2, demon: 1 },
  14: { townsfolk: 8, outsider: 3, minion: 2, demon: 1 },
  15: { townsfolk: 9, outsider: 3, minion: 2, demon: 1 },
};

function validateComposition(
  selectedIds: Set<string>,
  allRoles: Role[]
): { level: "error" | "warning" | "ok"; messages: string[] } {
  const selected = allRoles.filter((r) => selectedIds.has(r.id));
  const byType = {
    townsfolk: selected.filter((r) => r.type === "townsfolk").length,
    outsider: selected.filter((r) => r.type === "outsider").length,
    minion: selected.filter((r) => r.type === "minion").length,
    demon: selected.filter((r) => r.type === "demon").length,
  };
  const messages: string[] = [];
  let level: "error" | "warning" | "ok" = "ok";

  if (selectedIds.size === 0) {
    messages.push("💡 请在下方挑选角色（或点击下方快捷预设载入成熟模板）");
    return { level: "warning", messages };
  }

  if (byType.demon === 0) {
    messages.push("💡 建议添加恶魔角色（标准血染剧本需至少 1 个恶魔）");
    if (level === "ok") level = "warning";
  }
  if (byType.minion === 0) {
    messages.push("💡 建议添加爪牙角色");
    if (level === "ok") level = "warning";
  }
  if (byType.townsfolk === 0) {
    messages.push("💡 建议添加村民角色");
    if (level === "ok") level = "warning";
  }
  if (selectedIds.size > 0 && selectedIds.size < 7) {
    messages.push(
      `💡 当前已选 ${selectedIds.size} 个角色，建议至少选 7 个角色`
    );
    if (level === "ok") level = "warning";
  }

  return { level, messages };
}

export function CustomScriptBuilderModal({
  isOpen = true,
  onClose,
  onSave,
  onStartDirectly,
}: CustomScriptBuilderModalProps) {
  const [scriptName, setScriptName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(
    new Set()
  );
  const [nameError, setNameError] = useState("");
  const [selectedFabledIds, setSelectedFabledIds] = useState<Set<string>>(
    new Set()
  );

  const builderRoles = useMemo(() => {
    return roles.filter((r) => !r.hidden);
  }, []);

  const filteredRolesBySearch = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return builderRoles;
    return builderRoles.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        (r.ability && r.ability.toLowerCase().includes(q)) ||
        (r.script && r.script.toLowerCase().includes(q))
    );
  }, [builderRoles, searchQuery]);

  const builderGroupedRoles = useMemo(() => {
    return filteredRolesBySearch.reduce(
      (acc, role) => {
        if (!acc[role.type]) acc[role.type] = [];
        acc[role.type].push(role);
        return acc;
      },
      {} as Record<string, Role[]>
    );
  }, [filteredRolesBySearch]);

  const composition = useMemo(
    () => validateComposition(selectedRoleIds, builderRoles),
    [selectedRoleIds, builderRoles]
  );

  const toggleRole = (roleId: string) => {
    setSelectedRoleIds((prev) => {
      const next = new Set(prev);
      if (next.has(roleId)) {
        next.delete(roleId);
      } else {
        next.add(roleId);
      }
      return next;
    });
  };

  const toggleFabled = (roleId: string) => {
    setSelectedFabledIds((prev) => {
      const next = new Set(prev);
      if (next.has(roleId)) {
        next.delete(roleId);
      } else {
        next.add(roleId);
      }
      return next;
    });
  };

  const loadPreset = (scriptId: string) => {
    if (scriptId === "clear") {
      setSelectedRoleIds(new Set());
      return;
    }
    const script = scripts.find((s) => s.id === scriptId);
    if (script?.roleIds && script.roleIds.length > 0) {
      setSelectedRoleIds(new Set(script.roleIds));
      if (!scriptName) {
        setScriptName(`自定义 (${script.name}混搭)`);
      }
    } else if (script) {
      const scriptRoleIds = roles
        .filter(
          (r) =>
            !r.hidden &&
            (r.script === script.name ||
              (!r.script && script.id === "trouble_brewing"))
        )
        .map((r) => r.id);
      setSelectedRoleIds(new Set(scriptRoleIds));
      if (!scriptName) {
        setScriptName(`自定义 (${script.name}混搭)`);
      }
    }
  };

  const getFinalName = () => {
    if (scriptName.trim()) return scriptName.trim();
    return `自定义剧本 (${selectedRoleIds.size}角色)`;
  };

  const handleSaveOnly = () => {
    if (selectedRoleIds.size === 0) {
      showAlert("请至少选择一个角色");
      return;
    }
    const name = getFinalName();
    onSave(name, Array.from(selectedRoleIds));
  };

  const handleStartNow = () => {
    if (selectedRoleIds.size === 0) {
      showAlert("请至少选择一个角色");
      return;
    }
    const name = getFinalName();
    if (onStartDirectly) {
      onStartDirectly(name, Array.from(selectedRoleIds));
    } else {
      onSave(name, Array.from(selectedRoleIds));
    }
  };

  /** 导出为官方标准 JSON 格式 */
  const handleExport = () => {
    if (selectedRoleIds.size === 0) {
      showAlert("请先选择角色再导出");
      return;
    }
    const selected = builderRoles.filter((r) => selectedRoleIds.has(r.id));
    const finalName = getFinalName();
    const jsonData = [
      { id: "_meta", name: finalName, author: "拜甘教说书助手" },
      ...selected.map((r) => ({
        id: r.id,
        name: r.name,
        team: r.type,
        firstNight: 0,
        otherNight: 0,
      })),
    ];
    const blob = new Blob([JSON.stringify(jsonData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${finalName}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  const selectedCount = selectedRoleIds.size;

  const footer = (
    <div className="w-full flex flex-col sm:flex-row justify-between items-center gap-3">
      <div className="text-xs text-slate-400 text-center sm:text-left">
        {selectedCount > 0 ? (
          <>
            已选 {selectedCount} 角色 · 标准参考：
            {STD_COMP[Math.min(15, Math.max(7, selectedCount))]?.townsfolk ??
              "?"}
            镇 +{" "}
            {STD_COMP[Math.min(15, Math.max(7, selectedCount))]?.outsider ??
              "?"}
            外 +{" "}
            {STD_COMP[Math.min(15, Math.max(7, selectedCount))]?.minion ?? "?"}
            爪 +{" "}
            {STD_COMP[Math.min(15, Math.max(7, selectedCount))]?.demon ?? "?"}恶
          </>
        ) : (
          "未选择任何角色"
        )}
      </div>
      <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2.5 rounded-xl border border-white/10 text-slate-300 font-medium hover:bg-slate-700/50 hover:text-white transition text-xs sm:text-sm cursor-pointer"
        >
          取消
        </button>
        <button
          type="button"
          onClick={handleSaveOnly}
          className="px-4 py-2.5 rounded-xl border border-slate-600 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition text-xs sm:text-sm cursor-pointer"
        >
          💾 仅保存
        </button>
        <button
          type="button"
          onClick={handleStartNow}
          className="px-6 py-2.5 rounded-xl font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-lg shadow-purple-500/30 transition text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer"
        >
          <span>🚀</span>
          <span>保存并立即开局</span>
        </button>
      </div>
    </div>
  );

  return (
    <ModalWrapper
      title="🛠️ 自建剧本（自定义角色库）"
      onClose={onClose}
      className="max-w-6xl"
      footer={footer}
    >
      <div className="space-y-5">
        {/* 顶部说明与导出 */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-3 rounded-2xl bg-purple-950/20 border border-purple-500/20">
          <p className="text-xs sm:text-sm text-purple-200">
            ✨ 从全部角色库中自由挑选角色，跨剧本自由混搭并直接开局
          </p>
          <button
            type="button"
            onClick={handleExport}
            className="px-3.5 py-1.5 text-xs rounded-xl border border-emerald-600/40 bg-emerald-900/30 text-emerald-300 hover:bg-emerald-800/40 transition font-semibold flex items-center gap-1.5 cursor-pointer shrink-0 ml-auto sm:ml-0"
            title="导出为官方标准 JSON 剧本文件"
          >
            <span>📤</span>
            <span>导出 JSON</span>
          </button>
        </div>

        {/* 剧本名称与搜索栏 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label
              htmlFor="script-name-input"
              className="text-xs font-bold text-slate-300 uppercase tracking-wider"
            >
              剧本名称
            </label>
            <input
              id="script-name-input"
              type="text"
              value={scriptName}
              onChange={(e) => {
                setScriptName(e.target.value);
                if (nameError) setNameError("");
              }}
              placeholder="例如：我的无敌混搭局（默认自建剧本）"
              className={`w-full bg-slate-800/90 border text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition ${
                nameError ? "border-red-500" : "border-white/10"
              }`}
              maxLength={30}
            />
            {nameError && <p className="text-xs text-red-400">{nameError}</p>}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="role-search-input"
              className="text-xs font-bold text-slate-300 uppercase tracking-wider"
            >
              🔍 快速搜索角色
            </label>
            <input
              id="role-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="输入角色中文名、拼音或能力关键词..."
              className="w-full bg-slate-800/90 border border-white/10 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition"
            />
          </div>
        </div>

        {/* 快捷模板载入按钮 */}
        <div className="flex items-center gap-2 flex-wrap p-3 rounded-2xl bg-slate-800/40 border border-white/5">
          <span className="text-xs font-semibold text-slate-400 mr-1">
            ⚡ 快速载入预设：
          </span>
          <button
            type="button"
            onClick={() => loadPreset("trouble_brewing")}
            className="px-3 py-1 text-xs rounded-lg bg-sky-950/60 border border-sky-600/40 text-sky-200 hover:bg-sky-900/60 transition cursor-pointer font-medium"
          >
            🍵 暗流涌动模板 (22角色)
          </button>
          <button
            type="button"
            onClick={() => loadPreset("bad_moon_rising")}
            className="px-3 py-1 text-xs rounded-lg bg-indigo-950/60 border border-indigo-600/40 text-indigo-200 hover:bg-indigo-900/60 transition cursor-pointer font-medium"
          >
            🌙 黯月初升模板 (22角色)
          </button>
          <button
            type="button"
            onClick={() => loadPreset("sects_and_violets")}
            className="px-3 py-1 text-xs rounded-lg bg-pink-950/60 border border-pink-600/40 text-pink-200 hover:bg-pink-900/60 transition cursor-pointer font-medium"
          >
            🌸 梦殒春宵模板 (22角色)
          </button>
          <button
            type="button"
            onClick={() => loadPreset("clear")}
            className="px-3 py-1 text-xs rounded-lg bg-red-950/40 border border-red-600/30 text-red-300 hover:bg-red-900/40 transition cursor-pointer font-medium ml-auto"
          >
            🗑️ 清空已选
          </button>
        </div>

        {/* 合法性与提示 */}
        {composition.messages.length > 0 && (
          <div className="rounded-xl px-4 py-2.5 border bg-amber-950/30 border-amber-600/30 text-amber-200 backdrop-blur-sm text-xs space-y-1">
            {composition.messages.map((msg, i) => (
              <div key={i}>{msg}</div>
            ))}
          </div>
        )}

        {/* 已选统计 */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs md:text-sm font-semibold text-slate-300">
            已选{" "}
            <span className="text-purple-400 font-bold text-base">
              {selectedCount}
            </span>{" "}
            个角色
          </span>
          {["townsfolk", "outsider", "minion", "demon"].map((type) => {
            const count = builderRoles.filter(
              (r) => r.type === type && selectedRoleIds.has(r.id)
            ).length;
            const badge = TYPE_BADGE[type];
            return (
              <span
                key={type}
                className={`text-xs font-bold px-2.5 py-0.5 rounded-md border ${badge.bg} ${badge.text} ${badge.border}`}
              >
                {typeLabels[type]} {count}
              </span>
            );
          })}
        </div>

        {/* 角色选择网格 */}
        <div className="space-y-5">
          {["townsfolk", "outsider", "minion", "demon"].map((type) => {
            const typeList = builderGroupedRoles[type] || [];
            if (typeList.length === 0) return null;
            const badge = TYPE_BADGE[type];
            const selectedOfType = Array.from(selectedRoleIds).filter((id) =>
              typeList.some((r) => r.id === id)
            ).length;

            return (
              <div key={type} className="space-y-2.5">
                <div className="flex items-center gap-2 border-b border-white/10 pb-1.5">
                  <span
                    className={`text-xs md:text-sm font-bold px-2.5 py-0.5 rounded-lg border ${badge.bg} ${badge.text} ${badge.border}`}
                  >
                    {typeLabels[type]}
                  </span>
                  <span className="text-xs text-slate-400 bg-slate-800/60 px-2 py-0.5 rounded-full border border-white/5">
                    {selectedOfType} / {typeList.length}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                  {typeList.map((r) => {
                    const isSelected = selectedRoleIds.has(r.id);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => toggleRole(r.id)}
                        className={`relative flex flex-col items-center justify-center p-2.5 rounded-xl border transition-all text-left h-20 backdrop-blur-sm cursor-pointer
                          ${
                            isSelected
                              ? "border-purple-500/80 bg-purple-600/20 ring-2 ring-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.25)] scale-[1.02]"
                              : "border-white/10 bg-slate-800/50 hover:bg-slate-800/80 hover:border-white/20"
                          }
                        `}
                      >
                        <span
                          className={`text-sm font-bold whitespace-nowrap ${
                            isSelected ? "text-purple-200" : "text-slate-200"
                          }`}
                        >
                          {r.name}
                        </span>
                        <span className="text-[10px] text-slate-400 mt-1 line-clamp-1 scale-90 origin-top text-center px-1">
                          {r.script || "通用"}
                        </span>
                        {isSelected && (
                          <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-purple-500 flex items-center justify-center shadow">
                            <svg
                              className="w-3 h-3 text-white"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={3}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* 寓言角色专区 */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 border-b border-amber-600/30 pb-1.5">
              <span className="text-xs md:text-sm font-bold px-2.5 py-0.5 rounded-lg border bg-amber-900/40 text-amber-300 border-amber-600/40">
                ⭐ 寓言角色
              </span>
              <span className="text-xs text-slate-400 bg-slate-800/60 px-2 py-0.5 rounded-full border border-white/5">
                {
                  Array.from(selectedFabledIds).filter((id) =>
                    FABLED_ROLES.some((f) => f.id === id)
                  ).length
                }{" "}
                / {FABLED_ROLES.length}
              </span>
              <span className="text-[10px] text-amber-400/60 ml-auto">
                不占座位，作为全局规则生效
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {FABLED_ROLES.map((r) => {
                const isSelected = selectedFabledIds.has(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => toggleFabled(r.id)}
                    className={`relative flex flex-col items-center justify-center p-2.5 rounded-xl border transition-all text-left h-20 backdrop-blur-sm cursor-pointer
                      ${
                        isSelected
                          ? "border-amber-400/80 bg-amber-500/20 ring-2 ring-amber-400/50 shadow-[0_0_15px_rgba(245,158,11,0.25)] scale-[1.02]"
                          : "border-white/10 bg-slate-800/50 hover:bg-slate-800/80 hover:border-white/20"
                      }
                    `}
                  >
                    <span
                      className={`text-sm font-bold whitespace-nowrap ${
                        isSelected ? "text-amber-100" : "text-slate-200"
                      }`}
                    >
                      {r.name}
                    </span>
                    <span className="text-[10px] text-slate-400 mt-1 line-clamp-1 scale-90 origin-top text-center px-1">
                      {r.ability?.slice(0, 16)}...
                    </span>
                    {isSelected && (
                      <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center shadow">
                        <svg
                          className="w-3 h-3 text-white"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={3}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </ModalWrapper>
  );
}

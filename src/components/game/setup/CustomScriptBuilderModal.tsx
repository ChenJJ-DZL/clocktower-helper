import { useMemo, useState } from "react";
import { FABLED_ROLES, type Role, roles, typeLabels } from "../../../../app/data";
import { showAlert } from "../../../utils/nativeDialogShim";

interface CustomScriptBuilderModalProps {
  onClose: () => void;
  onSave: (scriptName: string, selectedRoleIds: string[]) => void;
}

/** 阵营徽章配色 */
const TYPE_BADGE: Record<string, { bg: string; text: string; border: string }> = {
  townsfolk: { bg: "bg-blue-900/40", text: "text-blue-300", border: "border-blue-600/40" },
  outsider: { bg: "bg-purple-900/40", text: "text-purple-300", border: "border-purple-600/40" },
  minion: { bg: "bg-orange-900/40", text: "text-orange-300", border: "border-orange-600/40" },
  demon: { bg: "bg-red-900/40", text: "text-red-300", border: "border-red-600/40" },
};

/** 标准配比（7~15人） */
const STD_COMP: Record<number, { townsfolk: number; outsider: number; minion: number; demon: number }> = {
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

  if (byType.demon === 0) {
    messages.push("⚠️ 缺少恶魔角色 — 至少需要 1 个恶魔");
    level = "error";
  }
  if (byType.demon > 3) {
    messages.push("⚠️ 恶魔过多 — 标准配比为 1 个");
    level = "warning";
  }
  if (byType.minion === 0 && selectedIds.size > 0) {
    messages.push("💡 建议添加爪牙角色");
    if (level === "ok") level = "warning";
  }
  if (selectedIds.size > 0 && selectedIds.size < 7) {
    messages.push(`💡 当前 ${selectedIds.size} 个角色，建议至少 7 人开局`);
    if (level === "ok") level = "warning";
  }
  if (selectedIds.size > 15) {
    messages.push(`💡 当前 ${selectedIds.size} 个角色，标准最大 15 人`);
    if (level === "ok") level = "warning";
  }

  return { level, messages };
}

export function CustomScriptBuilderModal({
  onClose,
  onSave,
}: CustomScriptBuilderModalProps) {
  const [scriptName, setScriptName] = useState("");
  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(
    new Set()
  );
  const [nameError, setNameError] = useState("");
  const [selectedFabledIds, setSelectedFabledIds] = useState<Set<string>>(new Set());

  const builderRoles = useMemo(() => {
    return roles.filter((r) => !r.hidden);
  }, []);

  const builderGroupedRoles = useMemo(() => {
    return builderRoles.reduce(
      (acc, role) => {
        if (!acc[role.type]) acc[role.type] = [];
        acc[role.type].push(role);
        return acc;
      },
      {} as Record<string, Role[]>
    );
  }, [builderRoles]);

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

  const handleSave = () => {
    if (!scriptName.trim()) {
      setNameError("请输入剧本名称");
      return;
    }
    setNameError("");
    if (selectedRoleIds.size === 0) {
      showAlert("请至少选择一个角色");
      return;
    }
    if (composition.level === "error") {
      showAlert(composition.messages[0]);
      return;
    }
    onSave(scriptName.trim(), Array.from(selectedRoleIds));
  };

  /** 导出为官方标准 JSON 格式 */
  const handleExport = () => {
    if (selectedRoleIds.size === 0) {
      showAlert("请先选择角色再导出");
      return;
    }
    const selected = builderRoles.filter((r) => selectedRoleIds.has(r.id));
    const jsonData = [
      { id: "_meta", name: scriptName || "自定义剧本", author: "拜甘教" },
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
    a.download = `${scriptName || "custom_script"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectedCount = selectedRoleIds.size;

  return (
    <div className="fixed inset-0 z-[6000] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 md:p-8">
      <div className="bg-slate-900/95 backdrop-blur-xl rounded-2xl w-full max-w-5xl h-full max-h-[90vh] flex flex-col shadow-2xl border border-white/10 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10 bg-slate-800/30">
          <div>
            <h2 className="text-2xl font-bold text-slate-100">🛠️ 自由创建剧本</h2>
            <p className="text-sm text-slate-400 mt-1">
              从全部角色库中自由组合，支持跨剧本混搭
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="px-4 py-2 text-sm rounded-lg border border-emerald-600/40 bg-emerald-900/30 text-emerald-300 hover:bg-emerald-800/40 transition font-medium"
              title="导出为官方标准 JSON 剧本文件"
            >
              📤 导出 JSON
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white transition-colors p-2"
            >
              ✕ 关闭
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* 剧本名称 */}
          <div className="space-y-2">
            <label
              htmlFor="script-name-input"
              className="text-sm font-semibold text-slate-300"
            >
              剧本名称 <span className="text-red-400">*</span>
            </label>
            <input
              id="script-name-input"
              type="text"
              value={scriptName}
              onChange={(e) => {
                setScriptName(e.target.value);
                if (nameError) setNameError("");
              }}
              placeholder="例如：我的无敌村规局"
              className={`w-full bg-slate-800/80 border text-white rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition ${
                nameError ? "border-red-500" : "border-white/10"
              }`}
              maxLength={30}
            />
            {nameError && (
              <p className="text-sm text-red-400">{nameError}</p>
            )}
          </div>

          {/* 合法性校验提示 */}
          {composition.messages.length > 0 && (
            <div
              className={`rounded-xl px-4 py-3 border backdrop-blur-sm ${
                composition.level === "error"
                  ? "bg-red-950/40 border-red-600/40 text-red-200"
                  : "bg-amber-950/40 border-amber-600/40 text-amber-200"
              }`}
            >
              {composition.messages.map((msg, i) => (
                <div key={i} className="text-sm">
                  {msg}
                </div>
              ))}
            </div>
          )}

          {/* 已选统计 */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-semibold text-slate-300">
              已选 <span className="text-purple-400 font-bold text-base">{selectedCount}</span> 个角色
            </span>
            {["townsfolk", "outsider", "minion", "demon"].map((type) => {
              const count = builderRoles.filter(
                (r) => r.type === type && selectedRoleIds.has(r.id)
              ).length;
              const badge = TYPE_BADGE[type];
              return (
                <span
                  key={type}
                  className={`text-xs font-bold px-2 py-0.5 rounded-md border ${badge.bg} ${badge.text} ${badge.border}`}
                >
                  {typeLabels[type]} {count}
                </span>
              );
            })}
          </div>

          {/* 角色选择网格 */}
          <div className="space-y-6">
            {["townsfolk", "outsider", "minion", "demon"].map((type) => {
              const typeList = builderGroupedRoles[type] || [];
              if (typeList.length === 0) return null;
              const badge = TYPE_BADGE[type];
              const selectedOfType = Array.from(selectedRoleIds).filter((id) =>
                typeList.some((r) => r.id === id)
              ).length;

              return (
                <div key={type} className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-white/10 pb-2">
                    <span
                      className={`text-sm font-bold px-2.5 py-0.5 rounded-lg border ${badge.bg} ${badge.text} ${badge.border}`}
                    >
                      {typeLabels[type]}
                    </span>
                    <span className="text-xs text-slate-500 bg-slate-800/60 px-2 py-0.5 rounded-full border border-white/5">
                      {selectedOfType} / {typeList.length}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                    {typeList.map((r) => {
                      const isSelected = selectedRoleIds.has(r.id);
                      return (
                        <button
                          key={r.id}
                          onClick={() => toggleRole(r.id)}
                          className={`relative flex flex-col items-center justify-center p-3 rounded-xl border transition-all text-left h-20 backdrop-blur-sm
                            ${
                              isSelected
                                ? "border-purple-500/60 bg-purple-500/15 ring-1 ring-purple-500/40 shadow-[0_0_12px_rgba(168,85,247,0.15)]"
                                : "border-white/5 bg-slate-800/40 hover:bg-slate-800/70 hover:border-white/15"
                            }
                          `}
                        >
                          <span
                            className={`text-sm font-bold whitespace-nowrap ${isSelected ? "text-white" : "text-slate-300"}`}
                          >
                            {r.name}
                          </span>
                          <span className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider scale-90 origin-top">
                            {r.script || "通用"}
                          </span>
                          {isSelected && (
                            <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-purple-500 flex items-center justify-center">
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

            {/* 寓言角色选择专区 */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 border-b border-amber-600/30 pb-2">
                <span className="text-sm font-bold px-2.5 py-0.5 rounded-lg border bg-amber-900/40 text-amber-300 border-amber-600/40">
                  ⭐ 寓言角色
                </span>
                <span className="text-xs text-slate-500 bg-slate-800/60 px-2 py-0.5 rounded-full border border-white/5">
                  {Array.from(selectedFabledIds).filter((id) =>
                    FABLED_ROLES.some((f) => f.id === id)
                  ).length} / {FABLED_ROLES.length}
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
                      onClick={() => toggleFabled(r.id)}
                      className={`relative flex flex-col items-center justify-center p-3 rounded-xl border transition-all text-left h-20 backdrop-blur-sm
                        ${
                          isSelected
                            ? "border-amber-400/60 bg-amber-500/15 ring-1 ring-amber-400/40 shadow-[0_0_12px_rgba(245,158,11,0.15)]"
                            : "border-white/5 bg-slate-800/40 hover:bg-slate-800/70 hover:border-white/15"
                        }
                      `}
                    >
                      <span
                        className={`text-sm font-bold whitespace-nowrap ${isSelected ? "text-amber-100" : "text-slate-300"}`}
                      >
                        {r.name}
                      </span>
                      <span className="text-[10px] text-slate-500 mt-1 line-clamp-1 scale-90 origin-top">
                        {r.ability?.slice(0, 20)}...
                      </span>
                      {isSelected && (
                        <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center">
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

        {/* Footer */}
        <div className="p-6 border-t border-white/10 bg-slate-800/30 backdrop-blur-sm flex justify-between items-center shrink-0">
          <div className="text-xs text-slate-500">
            {selectedCount > 0 && (
              <>
                标准配比参考：{selectedCount}人局 = {STD_COMP[Math.min(15, Math.max(7, selectedCount))]?.townsfolk ?? "?"}镇 +{" "}
                {STD_COMP[Math.min(15, Math.max(7, selectedCount))]?.outsider ?? "?"}外 +{" "}
                {STD_COMP[Math.min(15, Math.max(7, selectedCount))]?.minion ?? "?"}爪 +{" "}
                {STD_COMP[Math.min(15, Math.max(7, selectedCount))]?.demon ?? "?"}恶
              </>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl border border-white/10 text-slate-300 font-medium hover:bg-slate-700/50 hover:text-white transition"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={composition.level === "error"}
              className={`px-8 py-2.5 rounded-xl font-bold shadow-lg transition ${
                composition.level === "error"
                  ? "bg-slate-700 text-slate-500 cursor-not-allowed"
                  : "bg-purple-600 hover:bg-purple-500 text-white shadow-purple-500/20"
              }`}
            >
              💾 保存剧本
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
import { type Role, roles, typeLabels } from "../../../../app/data";

interface CustomScriptBuilderModalProps {
  onClose: () => void;
  onSave: (scriptName: string, selectedRoleIds: string[]) => void;
}

export function CustomScriptBuilderModal({
  onClose,
  onSave,
}: CustomScriptBuilderModalProps) {
  const [scriptName, setScriptName] = useState("");
  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(
    new Set()
  );

  // Use the pre-grouped roles from data.ts, but filter out hidden ones if needed.
  // Actually, for custom scripts, maybe allow all roles, but let's stick to non-hidden to be safe,
  // or just show all of them. Let's show all non-hidden as base.
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

  const handleSave = () => {
    if (!scriptName.trim()) {
      alert("请输入剧本名称");
      return;
    }
    if (selectedRoleIds.size === 0) {
      alert("请至少选择一个角色");
      return;
    }
    onSave(scriptName.trim(), Array.from(selectedRoleIds));
  };

  return (
    <div className="fixed inset-0 z-[6000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 md:p-8">
      <div className="bg-slate-900 rounded-2xl w-full max-w-5xl h-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-700 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700 bg-slate-800/50">
          <div>
            <h2 className="text-2xl font-bold text-slate-100">自由创建剧本</h2>
            <p className="text-sm text-slate-400 mt-1">
              从全部角色库中自由组合，DIY您的专属剧本
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-2"
          >
            ✕ 关闭
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-300">
              剧本名称 <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={scriptName}
              onChange={(e) => setScriptName(e.target.value)}
              placeholder="例如：我的无敌村规局"
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
              maxLength={30}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-slate-300">
                选择角色 (已选 {selectedRoleIds.size} 个)
              </label>
            </div>

            <div className="space-y-6">
              {["townsfolk", "outsider", "minion", "demon"].map((type) => {
                const typeList = builderGroupedRoles[type] || [];
                if (typeList.length === 0) return null;

                return (
                  <div key={type} className="space-y-3">
                    <div className="flex items-center gap-2 border-b border-slate-700/50 pb-2">
                      <span className="text-lg font-bold text-slate-200">
                        {typeLabels[type]}
                      </span>
                      <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">
                        {
                          Array.from(selectedRoleIds).filter((id) =>
                            typeList.some((r) => r.id === id)
                          ).length
                        }{" "}
                        / {typeList.length}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                      {typeList.map((r) => {
                        const isSelected = selectedRoleIds.has(r.id);
                        return (
                          <button
                            key={r.id}
                            onClick={() => toggleRole(r.id)}
                            className={`relative flex flex-col items-center justify-center p-3 rounded-xl border transition-all text-left h-20
                              ${
                                isSelected
                                  ? "border-purple-500 bg-purple-500/20 ring-1 ring-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.2)]"
                                  : "border-slate-700 bg-slate-800/50 hover:bg-slate-800 hover:border-slate-500"
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
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-700 bg-slate-800/80 flex justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl border border-slate-600 text-slate-300 font-medium hover:bg-slate-700 hover:text-white transition"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="px-8 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold shadow-lg shadow-purple-500/20 transition"
          >
            💾 保存剧本
          </button>
        </div>
      </div>
    </div>
  );
}

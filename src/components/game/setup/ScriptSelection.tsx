"use client";

import { useEffect, useState, useRef } from "react";
import { Script, GamePhase, scripts, roles } from "../../../../app/data";
import { useGameContext, gameActions } from "../../../contexts/GameContext";
import { CustomScriptBuilderModal } from "./CustomScriptBuilderModal";

interface ScriptSelectionProps {
  onScriptSelect: (script: Script) => void;
  saveHistory: () => void;
  setGameLogs: (logs: any[]) => void;
  setGamePhase: (phase: GamePhase) => void;
}

export default function ScriptSelection({
  onScriptSelect,
  saveHistory,
  setGameLogs,
  setGamePhase,
}: ScriptSelectionProps) {
  const { dispatch } = useGameContext();
  const [customScripts, setCustomScripts] = useState<Script[]>([]);
  const [showBuilderModal, setShowBuilderModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 加载本地自定义剧本
  useEffect(() => {
    try {
      const stored = localStorage.getItem('customScripts');
      if (stored) {
        setCustomScripts(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Failed to load custom scripts', e);
    }
  }, []);

  // 确保进入此页面时清除加载动画 (Fix for "Play Again" hang)
  useEffect(() => {
    // 短暂延迟以确保过渡动画平滑
    const timer = setTimeout(() => {
      dispatch(gameActions.updateState({ showIntroLoading: false }));
    }, 500);
    return () => clearTimeout(timer);
  }, [dispatch]);

  const handleScriptClick = (script: Script) => {
    // 保存选择剧本前的状态到历史记录
    saveHistory();
    onScriptSelect(script);
    setGameLogs([]); // 选择新剧本时清空之前的游戏记录
    setGamePhase('setup');
  };

  const handleDeleteCustomScript = (e: React.MouseEvent, scriptId: string) => {
    e.stopPropagation();
    if (confirm("确定要删除这个自定义剧本吗？")) {
      const updated = customScripts.filter(s => s.id !== scriptId);
      setCustomScripts(updated);
      localStorage.setItem('customScripts', JSON.stringify(updated));
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const data = JSON.parse(text);

        let scriptName = file.name.replace('.json', '');
        let roleIds: string[] = [];

        // 官方 JSON 通常是一个数组
        if (Array.isArray(data)) {
          // 查找是否有 _meta 对象获取剧本名
          const metaInfo = data.find(item => item.id === '_meta');
          if (metaInfo && metaInfo.name) {
            scriptName = metaInfo.name;
          }

          roleIds = data
            .filter(item => item.id && item.id !== '_meta')
            .map(item => item.id);
        } else if (data.id && data.roles) {
          // 其他可能的格式
          scriptName = data.name || scriptName;
          roleIds = data.roles;
        }

        if (roleIds.length === 0) {
          alert('解析失败：未找到角色列表');
          return;
        }

        // 过滤出我们系统里支持的角色
        const validRoleIds = roleIds.filter(id => roles.some(r => r.id === id));

        if (validRoleIds.length === 0) {
          alert('导入失败：该剧本中的角色均不支持');
          return;
        }

        const missingCount = roleIds.length - validRoleIds.length;
        if (missingCount > 0) {
          alert(`提示：剧本中有 ${missingCount} 个角色当前系统暂不支持，部分角色会被忽略。`);
        }

        const newScript: Script = {
          id: `custom_${Date.now()}`,
          name: scriptName,
          difficulty: '自定义',
          description: `包含 ${validRoleIds.length} 个角色`,
          isCustom: true,
          roleIds: validRoleIds
        };

        const updated = [...customScripts, newScript];
        setCustomScripts(updated);
        localStorage.setItem('customScripts', JSON.stringify(updated));
      } catch (err) {
        console.error('JSON parsing error', err);
        alert('解析失败：剧本文件格式不正确');
      } finally {
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };
    reader.readAsText(file);
  };

  const handleSaveCustomScript = (scriptName: string, roleIds: string[]) => {
    const newScript: Script = {
      id: `custom_${Date.now()}`,
      name: scriptName,
      difficulty: '自定义',
      description: `自由组合剧本 (${roleIds.length} 个角色)`,
      isCustom: true,
      roleIds
    };

    const updated = [...customScripts, newScript];
    setCustomScripts(updated);
    localStorage.setItem('customScripts', JSON.stringify(updated));
    setShowBuilderModal(false);
  };

  const allScripts = [...scripts, ...customScripts];

  return (
    <div className="w-full h-full flex flex-col items-center justify-center px-4 py-6 overflow-auto min-h-0">
      <div className="w-full max-w-5xl space-y-10 flex-shrink-0 my-auto">
        <div className="text-center space-y-3">
          <h2 className="text-4xl md:text-5xl font-black tracking-wide text-slate-50 drop-shadow">
            请选择剧本
          </h2>
          <p className="text-base md:text-lg text-slate-400">
            点击下方卡片选择本局要使用的剧本
          </p>
          <p className="text-sm text-slate-500">
            更多剧本开发中
          </p>
          <div className="pt-4 flex justify-center gap-4">
            <button
              onClick={() => setShowBuilderModal(true)}
              className="px-6 py-2 rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-300 font-medium hover:bg-sky-500/20 hover:border-sky-500/50 transition flex items-center gap-2"
            >
              <span>🛠️</span> 自建剧本
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-2 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-300 font-medium hover:bg-purple-500/20 hover:border-purple-500/50 transition flex items-center gap-2"
            >
              <span>📥</span> 导入线上 JSON
            </button>
            <input
              type="file"
              accept=".json"
              ref={fileInputRef}
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
          {allScripts.map((script) => (
            <button
              key={script.id}
              data-testid={`script-card-${script.id}`}
              onClick={() => handleScriptClick(script)}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/70 backdrop-blur-md px-6 py-8 text-left shadow-xl transition-all duration-300 hover:-translate-y-1 hover:border-purple-400/80 hover:bg-slate-800/90 hover:shadow-purple-500/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 min-h-[120px]"
            >
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-gradient-to-br from-purple-500/20 via-pink-500/10 to-sky-500/10 transition-opacity duration-300" />

              <div className="relative flex flex-col gap-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xl md:text-2xl font-bold text-slate-50">
                    {script.name}
                  </div>
                  <span className="inline-flex items-center rounded-full bg-purple-500/20 px-4 py-2 text-sm font-semibold text-purple-200">
                    难度：{script.difficulty}
                  </span>
                </div>

                <div className="mt-2 flex items-center justify-between text-sm text-slate-400">
                  <span>点击选择</span>
                  <div className="flex items-center gap-2">
                    {script.isCustom && (
                      <button
                        className="text-red-400 hover:text-red-300 mr-2 z-10 relative"
                        onClick={(e) => handleDeleteCustomScript(e, script.id)}
                        title="删除自定义剧本"
                      >
                        ✕ 删除
                      </button>
                    )}
                    <span className="text-purple-300 group-hover:translate-x-0.5 transition-transform">
                      进入配置 &raquo;
                    </span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {showBuilderModal && (
        <CustomScriptBuilderModal
          onClose={() => setShowBuilderModal(false)}
          onSave={handleSaveCustomScript}
        />
      )}
    </div>
  );
}


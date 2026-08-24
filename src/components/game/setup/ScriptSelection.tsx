"use client";

import { useEffect, useRef, useState } from "react";
import {
  type GamePhase,
  roles,
  type Script,
  scripts,
  type Seat,
} from "../../../../app/data";
import { gameActions, useGameContext } from "../../../contexts/GameContext";
import { useGameState } from "../../../hooks/useGameState";
import { loadGameRecords } from "../../../utils/persistence";
import { showAlert, showConfirm } from "../../../utils/nativeDialogShim";
import { GameRecordsModal } from "../../modals/GameRecordsModal";
import { RoleCodexModal } from "../../modals/RoleCodexModal";
import { CustomScriptBuilderModal } from "./CustomScriptBuilderModal";
import { useTheme } from "../../../contexts/ThemeContext";

interface ScriptSelectionProps {
  onScriptSelect: (script: Script) => void;
  saveHistory: () => void;
  setGameLogs: (logs: any[]) => void;
  setGamePhase: (phase: GamePhase) => void;
  onContinue?: (record: any) => void;
}

export default function ScriptSelection({
  onScriptSelect,
  saveHistory,
  setGameLogs,
  setGamePhase,
  onContinue,
}: ScriptSelectionProps) {
  const { theme, requestTheme } = useTheme();
  const { dispatch } = useGameContext();
  const { gameRecords } = useGameState();
  const [customScripts, setCustomScripts] = useState<Script[]>([]);
  const [showBuilderModal, setShowBuilderModal] = useState(false);
  const [showRecords, setShowRecords] = useState(false);
  const [showCodexModal, setShowCodexModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 加载本地自定义剧本
  useEffect(() => {
    try {
      const stored = localStorage.getItem("customScripts");
      if (stored) {
        setCustomScripts(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Failed to load custom scripts", e);
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

    // 🎯 根据剧本的官方人数上限创建对应数量的空座位（如无上愉悦为 8 个，暗流涌动为 15 个）
    const targetSeatCount = script.maxPlayers || 15;
    const initialSeats: Seat[] = Array.from({ length: targetSeatCount }, (_, i) => ({
      id: i,
      playerName: `玩家 ${i + 1}`,
      role: null,
      charadeRole: null,
      isDead: false,
      isDrunk: false,
      isPoisoned: false,
      isProtected: false,
      protectedBy: null,
      isRedHerring: false,
      isFortuneTellerRedHerring: false,
      isSentenced: false,
      masterId: null,
      hasUsedSlayerAbility: false,
      hasUsedVirginAbility: false,
      isDemonSuccessor: false,
      hasAbilityEvenDead: false,
      statusDetails: [],
      statuses: [],
      voteCount: 0,
      isCandidate: false,
      grandchildId: null,
      isGrandchild: false,
      isFirstDeathForZombuul: false,
      isZombuulTrulyDead: false,
      zombuulLives: 1,
    }));

    dispatch(gameActions.setSeats(initialSeats));
    dispatch(gameActions.updateState({ initialSeats, selectedScript: script }));
    setGamePhase("setup");
  };

  const handleDeleteCustomScript = (e: React.MouseEvent, scriptId: string) => {
    e.stopPropagation();
    showConfirm({
      title: "删除剧本",
      message: "确定要删除这个自定义剧本吗？",
      confirmLabel: "删除",
      onConfirm: () => {
        const updated = customScripts.filter((s) => s.id !== scriptId);
        setCustomScripts(updated);
        localStorage.setItem("customScripts", JSON.stringify(updated));
      },
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const data = JSON.parse(text);

        let scriptName = file.name.replace(".json", "");
        let roleIds: string[] = [];

        // 官方 JSON 通常是一个数组
        if (Array.isArray(data)) {
          // 查找是否有 _meta 对象获取剧本名
          const metaInfo = data.find((item) => item.id === "_meta");
          if (metaInfo?.name) {
            scriptName = metaInfo.name;
          }

          roleIds = data
            .filter((item) => item.id && item.id !== "_meta")
            .map((item) => item.id);
        } else if (data.id && data.roles) {
          // 其他可能的格式
          scriptName = data.name || scriptName;
          roleIds = data.roles;
        }

        if (roleIds.length === 0) {
          showAlert("解析失败：未找到角色列表");
          return;
        }

        // 过滤出我们系统里支持的角色
        const validRoleIds = roleIds.filter((id) =>
          roles.some((r) => r.id === id)
        );

        if (validRoleIds.length === 0) {
          showAlert("导入失败：该剧本中的角色均不支持");
          return;
        }

        const missingCount = roleIds.length - validRoleIds.length;
        if (missingCount > 0) {
          showAlert(
            `提示：剧本中有 ${missingCount} 个角色当前系统暂不支持，部分角色会被忽略。`
          );
        }

        const newScript: Script = {
          id: `custom_${Date.now()}`,
          name: scriptName,
          difficulty: "自定义",
          description: `包含 ${validRoleIds.length} 个角色`,
          isCustom: true,
          roleIds: validRoleIds,
        };

        const updated = [...customScripts, newScript];
        setCustomScripts(updated);
        localStorage.setItem("customScripts", JSON.stringify(updated));
      } catch (err) {
        console.error("JSON parsing error", err);
        showAlert("解析失败：剧本文件格式不正确");
      } finally {
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    };
    reader.readAsText(file);
  };

  const handleSaveCustomScript = (scriptName: string, roleIds: string[]) => {
    const newScript: Script = {
      id: `custom_${Date.now()}`,
      name: scriptName,
      difficulty: "自定义",
      description: `自由组合剧本 (${roleIds.length} 个角色)`,
      isCustom: true,
      roleIds,
    };

    const updated = [...customScripts, newScript];
    setCustomScripts(updated);
    localStorage.setItem("customScripts", JSON.stringify(updated));
    setShowBuilderModal(false);
  };

  const handleStartCustomScript = (scriptName: string, roleIds: string[]) => {
    const newScript: Script = {
      id: `custom_${Date.now()}`,
      name: scriptName,
      difficulty: "自定义",
      description: `自由组合剧本 (${roleIds.length} 个角色)`,
      isCustom: true,
      roleIds,
    };

    const updated = [...customScripts, newScript];
    setCustomScripts(updated);
    localStorage.setItem("customScripts", JSON.stringify(updated));
    setShowBuilderModal(false);

    // 立即以此自定义剧本开始游戏配置
    handleScriptClick(newScript);
  };

  const allScripts = [...scripts, ...customScripts];

  return (
    <div className="w-full h-full flex flex-col items-center justify-center px-4 py-6 overflow-auto min-h-0 relative">
      {/* 顶部右侧主题切换胶囊 */}
      <div className="absolute top-4 right-4 z-50">
        <div className="flex items-center rounded-full border p-0.5 transition-all duration-300 bg-slate-900/80 border-white/10">
          <button
            onClick={() => requestTheme("classic")}
            className={`px-3 py-1 text-xs font-semibold rounded-full transition-all duration-300 active:scale-95 cursor-pointer ${
              theme === "classic"
                ? "bg-amber-600 text-white font-bold shadow-md shadow-amber-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
            title="🏛️ 官方原版经典皮肤 (默认)"
          >
            🏛️ 经典
          </button>
          <button
            onClick={() => requestTheme("modern")}
            className={`px-3 py-1 text-xs font-semibold rounded-full transition-all duration-300 active:scale-95 cursor-pointer ${
              theme === "modern"
                ? "bg-indigo-600 text-white font-bold shadow-md shadow-indigo-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
            title="✨ 现代暗黑版 (开发中，连续点击8次开启)"
          >
            ✨ 现代
          </button>
        </div>
      </div>

      <div className="w-full max-w-5xl space-y-10 flex-shrink-0 my-auto">
        <div className="text-center space-y-3">
          <h2 className="text-4xl md:text-5xl font-black tracking-wide text-slate-50 drop-shadow">
            请选择剧本
          </h2>
          <p className="text-base md:text-lg text-slate-400">
            点击下方卡片选择本局要使用的剧本
          </p>
          <p className="text-sm text-slate-500">更多剧本开发中</p>
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
            <button
              onClick={() => {
                // 从 localStorage 重新加载以确保数据最新
                const records = loadGameRecords();
                dispatch(gameActions.setGameRecords(records));
                setShowRecords(true);
              }}
              className="px-6 py-2 rounded-full border border-green-500/30 bg-green-500/10 text-green-300 font-medium hover:bg-green-500/20 hover:border-green-500/50 transition flex items-center gap-2 cursor-pointer"
            >
              <span>📚</span> 对局记录
            </button>
            <button
              onClick={() => setShowCodexModal(true)}
              className="px-6 py-2 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-300 font-bold hover:bg-amber-500/20 hover:border-amber-500/60 transition flex items-center gap-2 cursor-pointer shadow-md shadow-amber-500/10 active:scale-95"
            >
              <span>📖</span> 角色图鉴
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
          {allScripts.map((script) => {
            const isUnofficial = script.isCustom || script.id === "poppyganda";
            return (
              <button
                key={script.id}
                data-testid={`script-card-${script.id}`}
                onClick={() => handleScriptClick(script)}
                className={`group relative overflow-hidden rounded-2xl px-5 sm:px-6 py-4 text-left shadow-xl transition-all duration-300 hover:-translate-y-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 cursor-pointer ${
                  isUnofficial
                    ? "border border-amber-500/40 bg-amber-500/10 hover:border-amber-500/60 hover:bg-amber-500/20 hover:shadow-amber-500/20 shadow-amber-500/10 focus-visible:ring-amber-400"
                    : "border border-white/10 bg-slate-900/70 backdrop-blur-md hover:border-purple-400/80 hover:bg-slate-800/90 hover:shadow-purple-500/30 focus-visible:ring-purple-400"
                }`}
              >
                <div
                  className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${
                    isUnofficial
                      ? "bg-gradient-to-br from-amber-500/20 via-orange-500/10 to-yellow-500/10"
                      : "bg-gradient-to-br from-purple-500/20 via-pink-500/10 to-sky-500/10"
                  }`}
                />

                <div className="relative flex flex-col justify-between gap-3">
                  {/* 顶部：剧本名 + 难度标签 */}
                  <div className="flex items-center justify-between gap-3">
                    <div
                      className={`text-xl md:text-2xl font-bold truncate ${
                        isUnofficial ? "text-amber-100" : "text-slate-50"
                      }`}
                    >
                      {script.name}
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold shrink-0 ${
                        isUnofficial
                          ? "bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold"
                          : "bg-purple-500/20 text-purple-200"
                      }`}
                    >
                      {isUnofficial ? "非官方剧本" : `难度：${script.difficulty}`}
                    </span>
                  </div>

                  {/* 底部：左下角建议人数 + 右下角进入配置 */}
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold shadow-sm shrink-0 ${
                        isUnofficial
                          ? "bg-amber-500/15 border border-amber-500/30 text-amber-300"
                          : "bg-purple-500/15 border border-purple-500/30 text-purple-300"
                      }`}
                    >
                      <span>👥</span>
                      <span>建议人数：{script.recommendedPlayers || "7-15人"}</span>
                    </span>

                    <div className="flex items-center gap-2">
                      {script.id.startsWith("custom_") && (
                        <button
                          className="text-red-400 hover:text-red-300 mr-1 z-10 relative text-xs cursor-pointer"
                          onClick={(e) => handleDeleteCustomScript(e, script.id)}
                          title="删除自定义剧本"
                        >
                          ✕ 删除
                        </button>
                      )}
                      <span
                        className={`group-hover:translate-x-0.5 transition-transform text-sm font-semibold whitespace-nowrap ${
                          isUnofficial ? "text-amber-300" : "text-purple-300"
                        }`}
                      >
                        进入配置 &raquo;
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* 底部版本标识 */}
        <div className="text-center pt-2 pb-4">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/60 border border-white/10 text-xs font-mono text-slate-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            Version W8.23.2
          </span>
        </div>
      </div>

      {showBuilderModal && (
        <CustomScriptBuilderModal
          onClose={() => setShowBuilderModal(false)}
          onSave={handleSaveCustomScript}
          onStartDirectly={handleStartCustomScript}
        />
      )}

      {showRecords && (
        <GameRecordsModal
          isOpen={true}
          onClose={() => setShowRecords(false)}
          gameRecords={gameRecords}
          isPortrait={false}
          onContinue={onContinue}
        />
      )}

      {showCodexModal && (
        <RoleCodexModal
          isOpen={true}
          onClose={() => setShowCodexModal(false)}
        />
      )}
    </div>
  );
}

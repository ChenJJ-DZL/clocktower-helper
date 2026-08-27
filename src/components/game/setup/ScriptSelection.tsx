"use client";

import { useEffect, useRef, useState } from "react";
import {
  type GamePhase,
  roles,
  type Script,
  type Seat,
  scripts,
} from "../../../../app/data";
import { gameActions, useGameContext } from "../../../contexts/GameContext";
import { useTheme } from "../../../contexts/ThemeContext";
import { useGameState } from "../../../hooks/useGameState";
import type { GameRecord } from "../../../types/game";
import { showAlert, showConfirm } from "../../../utils/nativeDialogShim";
import {
  clearCurrentSnapshot,
  isRealUnfinishedGame,
  loadCurrentSnapshot,
  loadGameRecords,
} from "../../../utils/persistence";
import { GameRecordsModal } from "../../modals/GameRecordsModal";
import { RoleCodexModal } from "../../modals/RoleCodexModal";
import { CustomScriptBuilderModal } from "./CustomScriptBuilderModal";

function getPhaseDisplayName(phase?: string): string {
  switch (phase) {
    case "firstNight":
      return "首夜行动阶段";
    case "night":
      return "夜晚行动阶段";
    case "nightSummary":
      return "天亮黎明播报";
    case "day":
      return "白天自由讨论";
    case "dusk":
      return "黄昏提名阶段";
    case "voting":
      return "处决投票阶段";
    default:
      return phase || "进行中";
  }
}

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
  const [confirmResumeTarget, setConfirmResumeTarget] = useState<{
    script: Script;
    record: GameRecord;
  } | null>(null);
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

  const startFreshGame = (script: Script) => {
    // 保存选择剧本前的状态到历史记录
    saveHistory();
    onScriptSelect(script);
    setGameLogs([]); // 选择新剧本时清空之前的游戏记录

    // 🎯 根据剧本的官方人数上限创建对应数量的空座位（如无上愉悦为 8 个，暗流涌动为 15 个）
    const targetSeatCount = script.maxPlayers || 15;
    const initialSeats: Seat[] = Array.from(
      { length: targetSeatCount },
      (_, i) => ({
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
      })
    );

    dispatch(gameActions.setSeats(initialSeats));
    dispatch(gameActions.updateState({ initialSeats, selectedScript: script }));
    setGamePhase("setup");
  };

  const handleScriptClick = (script: Script) => {
    // 检查是否存在属于当前剧本的真实未完成对局
    const snap = loadCurrentSnapshot();
    if (isRealUnfinishedGame(snap)) {
      let matchesThisScript = false;
      if (
        snap!.selectedScript?.id === script.id ||
        snap!.scriptId === script.id ||
        snap!.scriptName === script.name
      ) {
        matchesThisScript = true;
      } else {
        const seatRoleIds = (snap!.seats || [])
          .map((s: any) => s.role?.id)
          .filter(Boolean);
        if (
          script.roleIds &&
          script.roleIds.length > 0 &&
          seatRoleIds.some((rid: string) => script.roleIds?.includes(rid))
        ) {
          matchesThisScript = true;
        }
      }

      if (matchesThisScript) {
        const record: GameRecord = {
          id: `resume_${Date.now()}`,
          scriptName: script.name,
          startTime: snap!.startTime ?? new Date().toISOString(),
          endTime: new Date().toISOString(),
          duration: 0,
          winResult: (snap!.winResult as "good" | "evil" | null) ?? null,
          winReason: snap!.winReason ?? null,
          seats: snap!.seats ?? [],
          gameLogs: (snap as any).history ?? [],
          isCompleted: false,
          snapshot: snap!,
        };
        setConfirmResumeTarget({ script, record });
        return;
      }
    }

    startFreshGame(script);
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
                    ? "border-2 border-amber-400/80 bg-gradient-to-br from-[#452003]/90 via-[#321703]/95 to-[#1f0d01] hover:border-amber-300 hover:from-[#572904] hover:to-[#2b1202] hover:shadow-amber-500/25 shadow-amber-950/60 focus-visible:ring-amber-400"
                    : "border border-white/10 bg-slate-900/70 backdrop-blur-md hover:border-purple-400/80 hover:bg-slate-800/90 hover:shadow-purple-500/30 focus-visible:ring-purple-400"
                }`}
              >
                <div
                  className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${
                    isUnofficial
                      ? "bg-gradient-to-br from-amber-400/25 via-yellow-500/15 to-orange-500/10"
                      : "bg-gradient-to-br from-purple-500/20 via-pink-500/10 to-sky-500/10"
                  }`}
                />

                <div className="relative flex flex-col justify-between gap-3">
                  {/* 顶部：剧本名 + 难度标签 */}
                  <div className="flex items-center justify-between gap-3">
                    <div
                      className={`text-xl md:text-2xl font-black truncate ${
                        isUnofficial
                          ? "text-amber-100 drop-shadow-sm"
                          : "text-slate-50"
                      }`}
                    >
                      {script.name}
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold shrink-0 ${
                        isUnofficial
                          ? "bg-amber-500/30 border border-amber-400/70 text-amber-200 shadow-sm"
                          : "bg-purple-500/20 text-purple-200"
                      }`}
                    >
                      {isUnofficial
                        ? "非官方剧本"
                        : `难度：${script.difficulty}`}
                    </span>
                  </div>

                  {/* 底部：左下角建议人数 + 右下角进入配置 */}
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold shadow-sm shrink-0 ${
                        isUnofficial
                          ? "bg-amber-500/25 border border-amber-400/60 text-amber-200"
                          : "bg-purple-500/15 border border-purple-500/30 text-purple-300"
                      }`}
                    >
                      <span>👥</span>
                      <span>
                        建议人数：{script.recommendedPlayers || "7-15人"}
                      </span>
                    </span>

                    <div className="flex items-center gap-2">
                      {script.id.startsWith("custom_") && (
                        <button
                          className="text-red-400 hover:text-red-300 mr-1 z-10 relative text-xs cursor-pointer font-bold"
                          onClick={(e) =>
                            handleDeleteCustomScript(e, script.id)
                          }
                          title="删除自定义剧本"
                        >
                          ✕ 删除
                        </button>
                      )}
                      <span
                        className={`group-hover:translate-x-0.5 transition-transform text-sm font-bold whitespace-nowrap ${
                          isUnofficial
                            ? "text-amber-300 group-hover:text-amber-100"
                            : "text-purple-300"
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
            Version W8.24.2
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

      {/* 针对特定剧本的未完成对局恢复确认弹窗 */}
      {confirmResumeTarget && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-amber-500/40 rounded-3xl p-6 shadow-2xl space-y-5 text-center relative">
            {/* 关闭按钮 */}
            <button
              onClick={() => setConfirmResumeTarget(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white text-lg p-1 cursor-pointer"
              title="取消并返回"
            >
              ✕
            </button>

            <div className="w-16 h-16 rounded-full bg-amber-500/20 border border-amber-500/50 flex items-center justify-center text-3xl mx-auto">
              ⏳
            </div>

            <div>
              <h3 className="text-xl font-black text-slate-100 mb-1">
                检测到未完成对局
              </h3>
              <p className="text-sm text-amber-300/90 font-medium">
                剧本：{confirmResumeTarget.script.name}
              </p>
            </div>

            <div className="bg-black/40 border border-white/10 rounded-2xl p-4 text-left space-y-2 text-xs text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-400">当前阶段：</span>
                <span className="font-bold text-amber-200">
                  {getPhaseDisplayName(
                    confirmResumeTarget.record.snapshot?.gamePhase
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">进行轮数：</span>
                <span className="font-bold text-slate-200">
                  第 {confirmResumeTarget.record.snapshot?.nightCount || 1}{" "}
                  {confirmResumeTarget.record.snapshot?.gamePhase?.includes(
                    "night"
                  ) ||
                  confirmResumeTarget.record.snapshot?.gamePhase ===
                    "firstNight"
                    ? "夜"
                    : "天"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">存活人数：</span>
                <span className="font-bold text-slate-200">
                  {
                    (confirmResumeTarget.record.snapshot?.seats || []).filter(
                      (s: any) => !s.isDead
                    ).length
                  }{" "}
                  / {(confirmResumeTarget.record.snapshot?.seats || []).length}{" "}
                  人
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              您想要继续该剧本上一局的对局进度，还是清除历史进度开启全新对局？
            </p>

            <div className="flex flex-col gap-2.5 pt-2">
              <button
                onClick={() => {
                  if (onContinue) {
                    onContinue(confirmResumeTarget.record);
                  }
                  setConfirmResumeTarget(null);
                }}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white font-black text-base shadow-lg shadow-amber-500/25 transition-all cursor-pointer active:scale-98"
              >
                ▶ 继续上局对局
              </button>
              <button
                onClick={() => {
                  clearCurrentSnapshot();
                  startFreshGame(confirmResumeTarget.script);
                  setConfirmResumeTarget(null);
                }}
                className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm border border-slate-700 transition-colors cursor-pointer"
              >
                🔄 重新开始新对局
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

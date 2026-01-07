"use client";

import { Script, GamePhase, scripts } from "../../../../app/data";

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
  const handleScriptClick = (script: Script) => {
    // 保存选择剧本前的状态到历史记录
    saveHistory();
    onScriptSelect(script);
    setGameLogs([]); // 选择新剧本时清空之前的游戏记录
    setGamePhase('setup');
  };

  return (
    <div className="min-h-full flex flex-col items-center justify-center px-4 py-6">
      <div className="w-full max-w-5xl space-y-8">
        <div className="text-center space-y-2">
          <h2 className="text-3xl md:text-4xl font-black tracking-wide text-slate-50 drop-shadow">
            请选择剧本
          </h2>
          <p className="text-sm md:text-base text-slate-400">
            点击下方卡片选择本局要使用的剧本
          </p>
          <p className="text-xs text-slate-500">
            更多剧本开发中
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {scripts.map((script) => (
            <button
              key={script.id}
              onClick={() => handleScriptClick(script)}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/70 backdrop-blur-md px-5 py-6 text-left shadow-xl transition-all duration-300 hover:-translate-y-1 hover:border-purple-400/80 hover:bg-slate-800/90 hover:shadow-purple-500/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            >
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-gradient-to-br from-purple-500/20 via-pink-500/10 to-sky-500/10 transition-opacity duration-300" />

              <div className="relative flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-lg md:text-xl font-bold text-slate-50">
                    {script.name}
                  </div>
                  <span className="inline-flex items-center rounded-full bg-purple-500/20 px-3 py-1 text-xs font-semibold text-purple-200">
                    难度：{script.difficulty}
                  </span>
                </div>

                <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                  <span>点击选择</span>
                  <span className="text-purple-300 group-hover:translate-x-0.5 transition-transform">
                    进入配置 &raquo;
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}


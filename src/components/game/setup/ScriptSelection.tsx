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
    <div className="flex flex-col items-center justify-center min-h-full">
      <h2 className="text-4xl font-bold mb-2 text-white">选择剧本</h2>
      <p className="text-gray-400 italic mb-8">更多剧本开发中</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
        {scripts.map(script => (
          <button
            key={script.id}
            onClick={() => handleScriptClick(script)}
            className="p-8 bg-gray-800 border-4 border-gray-600 rounded-2xl hover:border-blue-500 hover:bg-gray-700 transition-all text-center flex flex-col items-center justify-center"
          >
            <div className="text-2xl font-bold text-white mb-2">{script.name}</div>
            <div className="text-sm text-gray-400">难度{script.difficulty}</div>
          </button>
        ))}
      </div>
    </div>
  );
}


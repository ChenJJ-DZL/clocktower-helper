"use client";

import { Seat, Role, Script, typeLabels, typeBgColors } from "../../../../app/data";

interface GameSetupProps {
  seats: Seat[];
  selectedScript: Script | null;
  selectedRole: Role | null;
  setSelectedRole: (role: Role | null) => void;
  handleSeatClick: (id: number) => void;
  handlePreStartNight: () => void;
  proceedToCheckPhase: (seatsToUse: Seat[]) => void;
  filteredGroupedRoles: Record<string, Role[]>;
  validateCompositionSetup: (activeSeats: Seat[]) => boolean;
  validateBaronSetup: (activeSeats: Seat[]) => boolean;
  compositionError: { standard: { townsfolk: number; outsider: number; minion: number; demon: number; total: number; }; actual: { townsfolk: number; outsider: number; minion: number; demon: number; }; playerCount: number; hasBaron: boolean; } | null;
  baronSetupCheck: { recommended: { townsfolk: number; outsider: number; minion: number; demon: number; total: number; }; current: { townsfolk: number; outsider: number; minion: number; demon: number; }; playerCount: number; } | null;
  ignoreBaronSetup: boolean;
  setIgnoreBaronSetup: (ignore: boolean) => void;
}

export default function GameSetup({
  seats,
  selectedScript,
  selectedRole,
  setSelectedRole,
  handleSeatClick,
  handlePreStartNight,
  proceedToCheckPhase,
  filteredGroupedRoles,
  validateCompositionSetup,
  validateBaronSetup,
  compositionError,
  baronSetupCheck,
  ignoreBaronSetup,
  setIgnoreBaronSetup,
}: GameSetupProps) {
  // 计算各阵营数
  const playerCount = seats.filter(s => s.role !== null).length;
  const actualTownsfolkCount = seats.filter(s => s.role?.type === 'townsfolk').length;
  const actualOutsiderCount = seats.filter(s => s.role?.type === 'outsider').length;
  const actualMinionCount = seats.filter(s => s.role?.type === 'minion').length;
  const actualDemonCount = seats.filter(s => s.role?.type === 'demon').length;
  
  // 检查影响外来者数量的角色
  const hasBaron = seats.some(s => s.role?.id === 'baron');
  const hasGodfather = seats.some(s => s.role?.id === 'godfather');
  const hasFangGu = seats.some(s => s.role?.id === 'fang_gu');
  const hasVigormortis = seats.some(s => s.role?.id === 'vigormortis' || s.role?.id === 'vigormortis_mr');
  const hasBalloonist = seats.some(s => s.role?.id === 'balloonist');
  
  // 基于"保持当前村民数量不变"计算建议
  // 血染钟楼规则
  // - 外来者数 = floor(总玩家数 / 3) + 修正
  // - 爪牙= floor((总玩家数 - 3) / 2)
  // - 恶魔= 1
  // - 总玩家数 = 村民+ 外来者数 + 爪牙+ 恶魔
  
  const calculateRecommendations = (townsfolkCount: number) => {
    const recommendations: Array<{
      outsider: number;
      minion: number;
      demon: number;
      total: number;
      modifiers: string[];
      note?: string;
    }> = [];

    // 以村民数为基准的官方建议
    const presets = [
      { total: 5, townsfolk: 3, outsider: 0, minion: 1, demon: 1 },
      { total: 6, townsfolk: 3, outsider: 1, minion: 1, demon: 1 },
      { total: 7, townsfolk: 5, outsider: 0, minion: 1, demon: 1 },
      { total: 8, townsfolk: 5, outsider: 1, minion: 1, demon: 1 },
      { total: 9, townsfolk: 5, outsider: 2, minion: 1, demon: 1 },
      { total: 10, townsfolk: 7, outsider: 0, minion: 2, demon: 1 },
      { total: 11, townsfolk: 7, outsider: 1, minion: 2, demon: 1 },
      { total: 12, townsfolk: 7, outsider: 2, minion: 2, demon: 1 },
      { total: 13, townsfolk: 9, outsider: 0, minion: 3, demon: 1 },
      { total: 14, townsfolk: 9, outsider: 1, minion: 3, demon: 1 },
      { total: 15, townsfolk: 9, outsider: 2, minion: 3, demon: 1 },
    ];

    presets
      .filter(p => p.townsfolk === townsfolkCount)
      .forEach(p => {
        recommendations.push({
          outsider: p.outsider,
          minion: p.minion,
          demon: p.demon,
          total: p.total,
          modifiers: [],
          note: `总人${p.total}人`,
        });
      });

    recommendations.sort((a, b) => a.total - b.total);

    return recommendations.slice(0, 5); // 最多显示5个建议
  };
  
  const recommendations = calculateRecommendations(actualTownsfolkCount);
  
  // 检查当前配置是否匹配某个建议
  const currentMatch = recommendations.find(r => 
    r.outsider === actualOutsiderCount &&
    r.minion === actualMinionCount &&
    r.demon === actualDemonCount
  );
  
  const isValid = currentMatch !== undefined;
  
  const activeSeats = seats.filter(s => s.role);
  const canStart = validateCompositionSetup(activeSeats) && (validateBaronSetup(activeSeats) || ignoreBaronSetup);

  return (
    <div className="space-y-6">
      {/* 阵营角色数量校验提示 */}
      {actualTownsfolkCount > 0 && (
        <div className={`p-4 rounded-lg border-2 ${isValid ? 'bg-green-900/30 border-green-500 text-green-200' : 'bg-yellow-900/30 border-yellow-500 text-yellow-200'}`}>
          <div className="font-bold mb-2"> 阵营角色数量建议</div>
          <div className="text-sm space-y-1">
            <div>当前村民数{actualTownsfolkCount}人保持不变</div>
            <div className="mt-2 font-semibold">建议配置</div>
            {recommendations.length > 0 ? (
              <div className="space-y-1 ml-2">
                {recommendations.map((rec, idx) => {
                  const isCurrent = rec.outsider === actualOutsiderCount && 
                                  rec.minion === actualMinionCount && 
                                  rec.demon === actualDemonCount;
                  return (
                    <div key={idx} className={isCurrent ? 'text-green-300 font-bold' : ''}>
                      {rec.outsider}外来者{rec.minion}爪牙{rec.demon}恶魔
                      {rec.note && <span className="text-xs opacity-75 ml-1">{rec.note}</span>}
                      {isCurrent && <span className="ml-2">当前配置</span>}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs opacity-75 ml-2">无有效配置</div>
            )}
            <div className="mt-2 text-xs opacity-75">
              实际{actualOutsiderCount}外来者{actualMinionCount}爪牙{actualDemonCount}恶魔
            </div>
            {!isValid && (
              <div className="mt-2 text-yellow-300 font-bold"> 当前配置不在建议范围内</div>
            )}
          </div>
        </div>
      )}
      {Object.entries(filteredGroupedRoles).map(([type, list]) => (
        <div key={type}>
          <h3 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wider">{typeLabels[type] || type}</h3>
          <div className="grid grid-cols-3 gap-3">
            {list.map(r=>{
              const isTaken=seats.some(s=>s.role?.id===r.id);
              return (
                <button 
                  key={r.id} 
                  onClick={(e)=>{e.stopPropagation();if(!isTaken)setSelectedRole(r)}} 
                  className={`p-3 border rounded-lg text-sm font-medium transition-all ${
                    isTaken ? 'opacity-30 cursor-not-allowed bg-gray-800':'' 
                  } ${typeBgColors[r.type]} ${
                    selectedRole?.id===r.id ? 'ring-4 ring-white scale-105':''
                  }`}
                >
                  {r.name}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      
      {/* 开始游戏按钮 */}
      <div className="mt-6 space-y-3">
        {compositionError && (
          <div className="p-3 bg-red-900/30 border border-red-500 text-red-200 rounded-lg text-sm">
            建议配置：{compositionError.standard.townsfolk}镇民、{compositionError.standard.outsider}外来者、{compositionError.standard.minion}爪牙、{compositionError.standard.demon}恶魔
            <br />
            当前配置：{compositionError.actual.townsfolk}镇民、{compositionError.actual.outsider}外来者、{compositionError.actual.minion}爪牙、{compositionError.actual.demon}恶魔
          </div>
        )}
        {baronSetupCheck && !ignoreBaronSetup && (
          <div className="p-3 bg-yellow-900/30 border border-yellow-500 text-yellow-200 rounded-lg text-sm">
            <div className="mb-2">
              建议配置：{baronSetupCheck.recommended.townsfolk}镇民、{baronSetupCheck.recommended.outsider}外来者
              <br />
              当前配置：{baronSetupCheck.current.townsfolk}镇民、{baronSetupCheck.current.outsider}外来者
            </div>
            <button
              onClick={() => setIgnoreBaronSetup(true)}
              className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg text-sm font-bold"
            >
              忽略此检查
            </button>
          </div>
        )}
        <button
          onClick={handlePreStartNight}
          disabled={!canStart}
          className={`w-full py-3 rounded-lg text-lg font-bold transition ${
            canStart
              ? 'bg-blue-600 hover:bg-blue-500 text-white'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          }`}
        >
          开始游戏
        </button>
        <button
          onClick={() => proceedToCheckPhase(activeSeats)}
          disabled={!canStart}
          className={`w-full py-3 rounded-lg text-lg font-bold transition ${
            canStart
              ? 'bg-green-600 hover:bg-green-500 text-white'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          }`}
        >
          直接进入核对身份
        </button>
      </div>
    </div>
  );
}


"use client";

import { useMemo, useState } from "react";
import { Seat, Role, Script, typeBgColors, typeColors } from "../../../../app/data";

interface GameSetupProps {
  seats: Seat[];
  selectedScript: Script | null;
  selectedRole: Role | null;
  setSelectedRole: (role: Role | null) => void;
  handleSeatClick: (id: number) => void;
  handlePreStartNight: () => void;
  proceedToCheckPhase: (seatsToUse: Seat[]) => void;
  filteredGroupedRoles: Record<string, Role[]>;
  getCompositionStatus: (activeSeats: Seat[]) => {
    valid: boolean;
    standard: { townsfolk: number; outsider: number; minion: number; demon: number; total?: number } | null;
    actual: { townsfolk: number; outsider: number; minion: number; demon: number };
    playerCount: number;
    hasBaron: boolean;
  };
  getBaronStatus: (activeSeats: Seat[]) => {
    valid: boolean;
    recommended: { townsfolk: number; outsider: number; minion: number; demon: number; total?: number } | null;
    current: { townsfolk: number; outsider: number; minion: number; demon: number };
    playerCount: number;
  };
  validateCompositionSetup: (activeSeats: Seat[]) => boolean;
  validateBaronSetup: (activeSeats: Seat[]) => boolean;
  setCompositionError: (val: GameSetupProps["compositionError"]) => void;
  setBaronSetupCheck: (val: GameSetupProps["baronSetupCheck"]) => void;
  compositionError: {
    standard: { townsfolk: number; outsider: number; minion: number; demon: number; total: number };
    actual: { townsfolk: number; outsider: number; minion: number; demon: number };
    playerCount: number;
    hasBaron: boolean;
  } | null;
  baronSetupCheck: {
    recommended: { townsfolk: number; outsider: number; minion: number; demon: number; total: number };
    current: { townsfolk: number; outsider: number; minion: number; demon: number };
    playerCount: number;
  } | null;
  ignoreBaronSetup: boolean;
  setIgnoreBaronSetup: (ignore: boolean) => void;
  handleBaronAutoRebalance?: () => void;
  hideSeatingChart?: boolean;
}

const groupTitle: Record<string, string> = {
  townsfolk: "村民",
  outsider: "外来者",
  minion: "爪牙",
  demon: "恶魔",
};

export default function GameSetup({
  seats,
  selectedScript,
  selectedRole,
  setSelectedRole,
  handleSeatClick,
  handlePreStartNight,
  proceedToCheckPhase,
  filteredGroupedRoles,
  getCompositionStatus,
  getBaronStatus,
  validateCompositionSetup,
  validateBaronSetup,
  setCompositionError,
  setBaronSetupCheck,
  compositionError,
  baronSetupCheck,
  ignoreBaronSetup,
  setIgnoreBaronSetup,
  handleBaronAutoRebalance,
  hideSeatingChart = false,
}: GameSetupProps) {
  const [showCompositionModal, setShowCompositionModal] = useState(false);

  const {
    playerCount,
    counts,
    activeSeats,
    canStart,
    compositionStatus,
    baronStatus,
  } = useMemo(() => {
    const active = seats.filter((s) => s.role);
    const compStatus = getCompositionStatus(active);
    const baronStat = getBaronStatus(active);
    return {
      playerCount: active.length,
      counts: {
        townsfolk: seats.filter((s) => s.role?.type === "townsfolk").length,
        outsider: seats.filter((s) => s.role?.type === "outsider").length,
        minion: seats.filter((s) => s.role?.type === "minion").length,
        demon: seats.filter((s) => s.role?.type === "demon").length,
      },
      activeSeats: active,
      compositionStatus: compStatus,
      baronStatus: baronStat,
      canStart: (compStatus.valid || ignoreBaronSetup) && (baronStat.valid || ignoreBaronSetup),
    };
  }, [seats, getCompositionStatus, getBaronStatus, ignoreBaronSetup]);

  const handleAttemptStartGame = () => {
    const compStatus = getCompositionStatus(activeSeats);
    if (!compStatus.valid && compStatus.standard) {
      setCompositionError({
        standard: compStatus.standard as any,
        actual: compStatus.actual,
        playerCount: compStatus.playerCount,
        hasBaron: compStatus.hasBaron,
      });
      setShowCompositionModal(true);
      return;
    }
    const baronStat = getBaronStatus(activeSeats);
    if (!ignoreBaronSetup && !baronStat.valid && baronStat.recommended) {
      setBaronSetupCheck({
        recommended: baronStat.recommended as any,
        current: baronStat.current,
        playerCount: baronStat.playerCount,
      });
      setShowCompositionModal(true);
      return;
    }
    setCompositionError(null);
    setBaronSetupCheck(null);
    handlePreStartNight();
  };

  const handleForceStartGame = () => {
    setShowCompositionModal(false);
    handlePreStartNight();
  };

  const handleCloseCompositionModal = () => {
    setShowCompositionModal(false);
  };

  const buildBadge = (label: string, value: number, color: string) => (
    <div className={`flex-1 flex items-center justify-center gap-2 rounded-lg border px-3 py-3 text-sm ${color}`}>
      <span className="font-semibold whitespace-nowrap">{label}</span>
      <span className="text-base font-bold">{value}</span>
    </div>
  );

  // 简版座位视图已移除，使用左侧的大圆桌进行落座操作

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="text-base text-slate-400">当前剧本</div>
            <div className="text-3xl font-black text-slate-50">{selectedScript?.name ?? "未选择"}</div>
            <div className="text-sm text-slate-500">请分配角色并检查阵容后开始游戏</div>
          </div>
          <div className="flex items-center gap-3 text-base text-slate-400">
            <span className="inline-flex h-4 w-4 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.7)]" />
            准备阶段
          </div>
        </div>

        {/* Player Count - Full Width */}
        <div className="space-y-2">
          <h3 className="text-lg font-bold text-slate-300">游戏人数</h3>
          <div className="flex items-baseline gap-3">
            <div className="text-4xl font-black text-slate-50">
              {playerCount}
            </div>
            <div className="text-base text-slate-400">
              / {seats.length} 已分配角色
            </div>
          </div>
          <div className="text-sm text-slate-500">
            点击座位并为每位玩家选择角色后即可开始
          </div>
        </div>

        {/* Current Configuration - Single Row */}
        <div className="space-y-2">
          <h3 className="text-lg font-bold text-slate-300">阵营分布</h3>
          <div className="flex gap-3">
            {buildBadge("村民", counts.townsfolk, "border-emerald-500/40 bg-emerald-900/40 text-emerald-100")}
            {buildBadge("外来者", counts.outsider, "border-cyan-400/40 bg-cyan-900/40 text-cyan-100")}
            {buildBadge("爪牙", counts.minion, "border-amber-400/40 bg-amber-900/40 text-amber-100")}
            {buildBadge("恶魔", counts.demon, "border-rose-400/40 bg-rose-900/40 text-rose-100")}
          </div>
        </div>

        {/* 已移除简版座位视图，使用左侧的大圆桌进行落座操作 */}
        {/* {!hideSeatingChart && circularSeats} */}

        {(compositionError || (baronSetupCheck && !ignoreBaronSetup)) && (
          <div className="border-l-4 border-red-500/50 bg-red-900/20 p-4 text-base text-red-100">
            {compositionError && (
              <div className="space-y-2">
                <div className="font-bold text-red-200">阵容校验未通过</div>
                <div>
                  建议：{compositionError.standard.townsfolk}村民 / {compositionError.standard.outsider}外来者 / {compositionError.standard.minion}爪牙 / {compositionError.standard.demon}恶魔
                </div>
                <div>
                  当前：{compositionError.actual.townsfolk}村民 / {compositionError.actual.outsider}外来者 / {compositionError.actual.minion}爪牙 / {compositionError.actual.demon}恶魔
                </div>
              </div>
            )}
            {baronSetupCheck && !ignoreBaronSetup && (
              <div className="mt-4 space-y-3">
                <div className="font-bold text-yellow-200">检测到男爵影响</div>
                <div>
                  建议：{baronSetupCheck.recommended.townsfolk}村民 / {baronSetupCheck.recommended.outsider}外来者
                </div>
                <div>
                  当前：{baronSetupCheck.current.townsfolk}村民 / {baronSetupCheck.current.outsider}外来者
                </div>
                <div className="flex flex-wrap gap-3 pt-2">
                  {handleBaronAutoRebalance && (
                    <button
                      onClick={handleBaronAutoRebalance}
                      className="rounded-lg bg-amber-500/90 px-4 py-3 text-sm font-bold text-slate-900 hover:bg-amber-400 transition h-14"
                    >
                      自动配平
                    </button>
                  )}
                  <button
                    onClick={() => setIgnoreBaronSetup(true)}
                    className="rounded-lg border border-yellow-400/60 px-4 py-3 text-sm font-bold text-yellow-50 hover:bg-yellow-400/10 transition h-14"
                  >
                    忽略此检查
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="space-y-4">
          <h3 className="text-lg font-bold text-slate-300">角色列表</h3>
          <div className="text-sm text-slate-500 mb-3">点击卡片选择角色，已被选择的卡片将变灰</div>

          <div className="space-y-4">
            {Object.entries(filteredGroupedRoles).map(([type, list]) => (
              <div key={type} className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="text-lg font-bold text-slate-100">{groupTitle[type] || type}</div>
                  <div className="text-sm text-slate-500">共 {list.length} 位角色</div>
                </div>
                <div className="grid gap-3 grid-cols-2">
                  {list.map((r, index) => {
                    const isTaken = seats.some((s) => s.role?.id === r.id);
                    return (
                      <button
                        key={`${type}-${r.id}-${index}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isTaken) setSelectedRole(r);
                        }}
                        className={`group relative overflow-hidden rounded-lg border text-left transition-all h-16 ${isTaken
                            ? "border-white/5 bg-slate-800/50 text-slate-500 cursor-not-allowed"
                            : `${typeBgColors[r.type]} border-white/10 hover:bg-white/5`
                          } ${selectedRole?.id === r.id ? "ring-2 ring-white" : ""}`}
                        title={r.ability || r.name}
                      >
                        <div className="relative h-full flex flex-col items-center justify-center px-3 leading-tight py-2">
                          <span className="text-sm font-bold text-slate-50 whitespace-nowrap">{r.name}</span>
                          <span className="text-xs text-white/60 uppercase tracking-wide mt-1">
                            {r.id.replace(/_/g, ' ')}
                          </span>
                          {isTaken && (
                            <div className="absolute top-1 right-2 text-xs text-amber-200">✓</div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Fixed footer with Start Game button */}
      <div className="shrink-0 border-t border-white/10 bg-slate-900/95 px-6 py-5">
        <button
          onClick={handleAttemptStartGame}
          disabled={activeSeats.length === 0}
          className={`w-full rounded-2xl h-16 text-2xl font-black tracking-wide transition ${canStart
              ? "bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/30 hover:bg-emerald-400"
              : "bg-amber-500/80 text-slate-950 shadow-lg shadow-amber-500/30 hover:bg-amber-400"
            } ${activeSeats.length === 0 ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          开始游戏
        </button>
      </div>

      {showCompositionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-red-500/50 shadow-2xl p-6 space-y-4">
            <div className="text-xl font-bold text-red-200">阵容配置错误</div>
            {compositionError && (
              <div className="space-y-2 text-sm text-slate-100">
                <div className="font-semibold text-red-300">标准</div>
                <div>
                  {compositionError.standard.townsfolk} 村民 / {compositionError.standard.outsider} 外来者 / {compositionError.standard.minion} 爪牙 / {compositionError.standard.demon} 恶魔
                </div>
                <div className="font-semibold text-red-300">当前</div>
                <div>
                  {compositionError.actual.townsfolk} 村民 / {compositionError.actual.outsider} 外来者 / {compositionError.actual.minion} 爪牙 / {compositionError.actual.demon} 恶魔
                </div>
              </div>
            )}
            {baronSetupCheck && !ignoreBaronSetup && (
              <div className="space-y-2 text-sm text-yellow-100">
                <div className="font-semibold text-yellow-300">男爵配置不符</div>
                <div>建议：{baronSetupCheck.recommended.townsfolk} 村民 / {baronSetupCheck.recommended.outsider} 外来者</div>
                <div>当前：{baronSetupCheck.current.townsfolk} 村民 / {baronSetupCheck.current.outsider} 外来者</div>
              </div>
            )}
            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={handleForceStartGame}
                className="w-full rounded-xl bg-emerald-500 text-slate-950 font-bold py-3 hover:bg-emerald-400 transition"
              >
                仍然开始游戏
              </button>
              <button
                onClick={handleCloseCompositionModal}
                className="w-full rounded-xl border border-white/20 bg-slate-800 text-slate-100 font-bold py-3 hover:bg-slate-700 transition"
              >
                返回修改
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


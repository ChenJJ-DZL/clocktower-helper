"use client";

import { useMemo, useRef, useState } from "react";
import { Seat, Role, Script, typeBgColors, typeColors } from "../../../../app/data";
import { SeatGrid } from "../board/SeatGrid";
import { getSeatPosition } from "../../../utils/gameRules";

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
}: GameSetupProps) {
  const [skipNameInput, setSkipNameInput] = useState(false);
  const [showCompositionModal, setShowCompositionModal] = useState(false);
  const seatRefs = useRef<Record<number, HTMLDivElement | null>>({});

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

  const compositionSummary = `村民: ${counts.townsfolk}, 外来者: ${counts.outsider}, 爪牙: ${counts.minion}, 恶魔: ${counts.demon}`;

  const buildBadge = (label: string, value: number, color: string) => (
    <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${color}`}>
      <span className="font-semibold">{label}</span>
      <span className="text-base font-bold">{value}</span>
    </div>
  );

  const circularSeats = (
    <div className="w-full">
      <div className="mx-auto max-w-4xl">
        <div className="relative w-full max-w-3xl mx-auto rounded-2xl bg-slate-900/60 border border-white/10 shadow-xl p-3">
          <SeatGrid
            seats={seats}
            nightInfo={null}
            selectedActionTargets={[]}
            isPortrait={false}
            seatScale={0.9}
            longPressingSeats={new Set()}
            onSeatClick={(seat) => handleSeatClick(seat.id)}
            onContextMenu={(e, _id) => e.preventDefault()}
            onTouchStart={(e, _id) => e.preventDefault()}
            onTouchEnd={(e, _id) => e.preventDefault()}
            onTouchMove={(e, _id) => e.preventDefault()}
            setSeatRef={(id, el) => { seatRefs.current[id] = el; }}
            getSeatPosition={(i, total) => getSeatPosition(i, total ?? seats.length, false)}
            getDisplayRoleType={(seat) => seat.role?.type || null}
            typeColors={typeColors}
            layoutMode="matrix"
          />
        </div>
        <div className="mt-2 text-center text-xs text-slate-400">点击座位选择或调整角色 / 名称</div>
      </div>
    </div>
  );

  return (
    <div className="relative min-h-full flex flex-col">
      <div className="px-4 md:px-6 py-6 space-y-6 pb-28">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="text-sm text-slate-400">当前剧本</div>
            <div className="text-2xl font-black text-slate-50">{selectedScript?.name ?? "未选择"}</div>
            <div className="text-xs text-slate-500">请分配角色并检查阵容后开始游戏</div>
          </div>
          <div className="hidden md:flex items-center gap-2 text-sm text-slate-400">
            <span className="inline-flex h-3 w-3 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.7)]" />
            准备阶段
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-400">游戏人数</div>
                <div className="text-4xl font-black text-slate-50 mt-1">
                  {playerCount}
                  <span className="text-base text-slate-500 ml-2">/ {seats.length}</span>
                </div>
              </div>
              <div className="rounded-xl bg-slate-800/80 px-3 py-2 text-xs text-slate-300">
                已分配角色
              </div>
            </div>
            <div className="mt-3 text-xs text-slate-500">
              点击座位并为每位玩家选择角色后即可开始
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-400">当前配置</div>
                <div className="text-lg font-bold text-slate-50 mt-1">{compositionSummary}</div>
              </div>
              <div className="text-xs text-purple-200 bg-purple-500/20 border border-purple-400/40 rounded-xl px-3 py-1">
                阵营分布
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
              {buildBadge("村民", counts.townsfolk, "border-emerald-500/40 bg-emerald-900/40 text-emerald-100")}
              {buildBadge("外来者", counts.outsider, "border-cyan-400/40 bg-cyan-900/40 text-cyan-100")}
              {buildBadge("爪牙", counts.minion, "border-amber-400/40 bg-amber-900/40 text-amber-100")}
              {buildBadge("恶魔", counts.demon, "border-rose-400/40 bg-rose-900/40 text-rose-100")}
            </div>
          </div>
        </div>

        {circularSeats}

        {(compositionError || (baronSetupCheck && !ignoreBaronSetup)) && (
          <div className="rounded-2xl border border-red-500/50 bg-red-900/30 p-4 text-sm text-red-100 shadow-lg">
            {compositionError && (
              <div className="space-y-1">
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
              <div className="mt-3 space-y-2">
                <div className="font-bold text-yellow-200">检测到男爵影响</div>
                <div>
                  建议：{baronSetupCheck.recommended.townsfolk}村民 / {baronSetupCheck.recommended.outsider}外来者
                </div>
                <div>
                  当前：{baronSetupCheck.current.townsfolk}村民 / {baronSetupCheck.current.outsider}外来者
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {handleBaronAutoRebalance && (
                    <button
                      onClick={handleBaronAutoRebalance}
                      className="rounded-lg bg-amber-500/90 px-3 py-2 text-xs font-bold text-slate-900 hover:bg-amber-400 transition"
                    >
                      自动配平
                    </button>
                  )}
                  <button
                    onClick={() => setIgnoreBaronSetup(true)}
                    className="rounded-lg border border-yellow-400/60 px-3 py-2 text-xs font-bold text-yellow-50 hover:bg-yellow-400/10 transition"
                  >
                    忽略此检查
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-1">
            <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 shadow-xl backdrop-blur-md space-y-3">
              <div className="text-sm font-semibold text-slate-200">选项</div>
              <div className="space-y-3">
                <button
                  onClick={() => setSkipNameInput((v) => !v)}
                  className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                    skipNameInput
                      ? "border-emerald-500/60 bg-emerald-900/40 text-emerald-100"
                      : "border-white/10 bg-slate-800/70 text-slate-200 hover:border-emerald-400/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold">跳过名字输入</div>
                      <div className="text-xs text-slate-400 mt-1">无需逐个填写玩家名字</div>
                    </div>
                    <div
                      className={`h-6 w-11 rounded-full p-1 transition ${
                        skipNameInput ? "bg-emerald-500/80" : "bg-slate-600"
                      }`}
                    >
                      <div
                        className={`h-4 w-4 rounded-full bg-white shadow transition ${
                          skipNameInput ? "translate-x-5" : ""
                        }`}
                      />
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => {
                    if (handleBaronAutoRebalance) {
                      handleBaronAutoRebalance();
                    }
                  }}
                  className="w-full rounded-xl border border-purple-400/60 bg-purple-900/30 px-4 py-3 text-left text-purple-50 shadow-lg transition hover:-translate-y-0.5 hover:shadow-purple-500/30"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold">自动配平（含男爵/教父）</div>
                      <div className="text-xs text-purple-100/80 mt-1">快速调整至标准人数分布</div>
                    </div>
                    <span className="text-sm">⚡</span>
                  </div>
                </button>

                <button
                  onClick={() => proceedToCheckPhase(activeSeats)}
                  disabled={!canStart}
                  className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                    canStart
                      ? "border-cyan-400/60 bg-cyan-900/30 text-cyan-50 hover:-translate-y-0.5 hover:shadow-cyan-500/30"
                      : "border-white/5 bg-slate-800/60 text-slate-500 cursor-not-allowed"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold">直接进入核对身份</div>
                      <div className="text-xs text-slate-300/80 mt-1">跳过首夜流程前的等待</div>
                    </div>
                    <span className="text-sm">➡</span>
                  </div>
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-200">角色列表</div>
              <div className="text-xs text-slate-500">点击卡片选择角色，已被选择的卡片将变灰</div>
            </div>

            <div className="space-y-5">
              {Object.entries(filteredGroupedRoles).map(([type, list]) => (
                <div key={type} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="text-base font-bold text-slate-100">{groupTitle[type] || type}</div>
                    <div className="text-xs text-slate-500">共 {list.length} 位角色</div>
                  </div>
                  <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                    {list.map((r) => {
                      const isTaken = seats.some((s) => s.role?.id === r.id);
                      return (
                        <button
                          key={r.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isTaken) setSelectedRole(r);
                          }}
                          className={`group relative overflow-hidden rounded-xl border text-left transition-all ${
                            isTaken
                              ? "border-white/5 bg-slate-800/50 text-slate-500 cursor-not-allowed"
                              : `${typeBgColors[r.type]} border-white/10 hover:-translate-y-1 hover:shadow-lg hover:shadow-purple-500/20`
                          } ${selectedRole?.id === r.id ? "ring-2 ring-white" : ""}`}
                        >
                          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-white/5 transition" />
                          <div className="relative p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="font-bold text-sm text-slate-50">{r.name}</div>
                              <span className="rounded-full bg-black/20 px-2 py-1 text-[10px] text-slate-200">
                                {groupTitle[r.type] || r.type}
                              </span>
                            </div>
                            {r.ability && (
                              <div className="text-[11px] leading-5 text-slate-200/80 line-clamp-3">
                                {r.ability}
                              </div>
                            )}
                            {isTaken && (
                              <div className="text-[11px] text-amber-200">已分配</div>
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
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-slate-950 via-slate-950/95 to-transparent px-4 md:px-6 py-4">
        <div className="mx-auto w-full max-w-4xl">
          <button
            onClick={handleAttemptStartGame}
            disabled={activeSeats.length === 0}
            className={`w-full rounded-2xl py-4 text-xl font-black tracking-wide transition ${
              canStart
                ? "bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/30 hover:bg-emerald-400"
                : "bg-amber-500/80 text-slate-950 shadow-lg shadow-amber-500/30 hover:bg-amber-400"
            } ${activeSeats.length === 0 ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            开始游戏
          </button>
        </div>
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
                我知道了
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


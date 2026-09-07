"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  type Role,
  type Script,
  type Seat,
  typeBgColors,
} from "../../../../app/data";
import { gameActions, useGameContext } from "../../../contexts/GameContext";
import { CharadeConfigModal } from "../../modals/CharadeConfigModal";
import { ModalWrapper } from "../../modals/ModalWrapper";
import { PlayerCompositionModal } from "../../modals/PlayerCompositionModal";
import { QuickStartModal } from "../../modals/QuickStartModal";

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
    standard: {
      townsfolk: number;
      outsider: number;
      minion: number;
      demon: number;
      total?: number;
    } | null;
    actual: {
      townsfolk: number;
      outsider: number;
      minion: number;
      demon: number;
    };
    playerCount: number;
    hasBaron: boolean;
  };
  getBaronStatus: (activeSeats: Seat[]) => {
    valid: boolean;
    recommended: {
      townsfolk: number;
      outsider: number;
      minion: number;
      demon: number;
      total?: number;
    } | null;
    current: {
      townsfolk: number;
      outsider: number;
      minion: number;
      demon: number;
    };
    playerCount: number;
  };
  validateCompositionSetup: (activeSeats: Seat[]) => boolean;
  validateBaronSetup: (activeSeats: Seat[]) => boolean;
  setCompositionError: (val: GameSetupProps["compositionError"]) => void;
  setBaronSetupCheck: (val: GameSetupProps["baronSetupCheck"]) => void;
  compositionError: {
    standard: {
      townsfolk: number;
      outsider: number;
      minion: number;
      demon: number;
      total: number;
    };
    actual: {
      townsfolk: number;
      outsider: number;
      minion: number;
      demon: number;
    };
    playerCount: number;
    hasBaron: boolean;
  } | null;
  baronSetupCheck: {
    recommended: {
      townsfolk: number;
      outsider: number;
      minion: number;
      demon: number;
      total: number;
    };
    current: {
      townsfolk: number;
      outsider: number;
      minion: number;
      demon: number;
    };
    playerCount: number;
  } | null;
  ignoreBaronSetup: boolean;
  setIgnoreBaronSetup: (ignore: boolean) => void;
  handleBaronAutoRebalance?: () => void;
  hideSeatingChart?: boolean;
  onQuickTest?: () => void;
  onQuickStart?: (
    playerCount: number,
    sortedRoles: Array<
      Role & {
        charadeRole?: Role | null;
        apparentDemonRole?: Role | null;
        displayRole?: Role | null;
      }
    >
  ) => void;
  onOpenCharadeModal?: (targetSeatId?: number | null) => void;
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
  filteredGroupedRoles,
  getCompositionStatus,
  getBaronStatus,
  setCompositionError,
  setBaronSetupCheck,
  compositionError,
  baronSetupCheck,
  ignoreBaronSetup,
  setIgnoreBaronSetup,
  handleBaronAutoRebalance,
  onQuickTest,
  onQuickStart,
  onOpenCharadeModal,
}: GameSetupProps) {
  const { dispatch } = useGameContext();
  const [showCompositionModal, setShowCompositionModal] = useState(false);
  const [showCompositionGuideModal, setShowCompositionGuideModal] =
    useState(false);
  const [showQuickStartModal, setShowQuickStartModal] = useState(false);
  const [ignoreMarionetteSetup, setIgnoreMarionetteSetup] = useState(false);
  const [showMarionetteModal, setShowMarionetteModal] = useState(false);
  const [showCharadeModal, setShowCharadeModal] = useState(false);

  // 🎪 提线木偶座次检测（按官方规则必须与恶魔相邻；若恶魔为小怪宝则与爪牙相邻）
  const marionetteStatus = useMemo(() => {
    const active = seats.filter((s) => s.role);
    const marionetteSeat = active.find((s) => s.role?.id === "marionette");
    if (!marionetteSeat || seats.length <= 2) return null;

    const hasLilMonsta = active.some((s) => s.role?.id === "lil_monsta");
    const hasSummoner = active.some((s) => s.role?.id === "summoner");

    let targetRoleDesc = "恶魔";
    let targetSeats: Seat[] = [];

    if (hasLilMonsta) {
      targetRoleDesc = "爪牙玩家";
      targetSeats = active.filter(
        (s) => s.role?.type === "minion" && s.id !== marionetteSeat.id
      );
    } else if (hasSummoner && !active.some((s) => s.role?.type === "demon")) {
      targetRoleDesc = "召唤师";
      targetSeats = active.filter((s) => s.role?.id === "summoner");
    } else {
      targetRoleDesc = "恶魔";
      targetSeats = active.filter((s) => s.role?.type === "demon");
    }

    if (targetSeats.length === 0) return null;

    const total = seats.length;
    const isAdjacent = targetSeats.some((target) => {
      const diff = Math.abs(marionetteSeat.id - target.id);
      return diff === 1 || diff === total - 1;
    });

    return {
      valid: isAdjacent,
      marionetteSeat,
      targetSeats,
      targetRoleDesc,
    };
  }, [seats]);

  // 一键将提线木偶调整至恶魔邻座（与恶魔身旁的非恶魔座位互换角色）
  const handleAutoFixMarionetteSeating = () => {
    if (!marionetteStatus || marionetteStatus.valid) return;
    const { marionetteSeat, targetSeats } = marionetteStatus;
    const targetSeat = targetSeats[0];
    if (!targetSeat) return;

    const total = seats.length;
    const leftId = (targetSeat.id - 1 + total) % total;
    const rightId = (targetSeat.id + 1) % total;

    let swapTargetId = leftId;
    const leftSeat = seats.find((s) => s.id === leftId);
    if (leftId === targetSeat.id || leftSeat?.role?.type === "demon") {
      swapTargetId = rightId;
    }

    const s1 = seats.find((s) => s.id === marionetteSeat.id);
    const s2 = seats.find((s) => s.id === swapTargetId);
    if (!s1 || !s2) return;

    const newSeats = seats.map((s) => {
      if (s.id === marionetteSeat.id) {
        return {
          ...s,
          role: s2.role,
          charadeRole: s2.charadeRole,
          displayRole: s2.displayRole,
          apparentDemonRole: s2.apparentDemonRole,
        };
      }
      if (s.id === swapTargetId) {
        return {
          ...s,
          role: s1.role,
          charadeRole: s1.charadeRole,
          displayRole: s1.displayRole,
          apparentDemonRole: s1.apparentDemonRole,
        };
      }
      return s;
    });

    dispatch(gameActions.setSeats(newSeats));
    dispatch(gameActions.updateState({ seats: newSeats }));
  };

  // 🎭 伪装设置拦截 Toast 状态（持续 2.7 秒，无按钮，渐入渐出）
  const [charadeToast, setCharadeToast] = useState<{
    id: number;
    message: string;
  } | null>(null);
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showCharadeWarningToast = (message: string) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setCharadeToast({ id: Date.now(), message });
    toastTimerRef.current = setTimeout(() => {
      setCharadeToast(null);
    }, 2700);
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // 🎭 伪装身份检测（提线木偶、酒鬼、疯子）
  const charadeStatus = useMemo(() => {
    const active = seats.filter((s) => s.role);
    const charadeSeats = active.filter(
      (s) =>
        s.role?.id === "drunk" ||
        s.role?.id === "marionette" ||
        s.role?.id === "lunatic"
    );
    const unconfigured = charadeSeats.filter(
      (s) =>
        (s.role?.id === "drunk" && !s.charadeRole) ||
        (s.role?.id === "marionette" && !s.charadeRole) ||
        (s.role?.id === "lunatic" && !s.apparentDemonRole)
    );
    const configured = charadeSeats.filter(
      (s) =>
        (s.role?.id === "drunk" && !!s.charadeRole) ||
        (s.role?.id === "marionette" && !!s.charadeRole) ||
        (s.role?.id === "lunatic" && !!s.apparentDemonRole)
    );
    return {
      charadeSeats,
      unconfigured,
      configured,
      valid: unconfigured.length === 0,
    };
  }, [seats]);

  // 一键为角色分配或重新随机分配合法不在场的伪装身份（提线木偶、酒鬼、疯子）
  const handleAutoAssignCharades = () => {
    const inPlayRealRoleIds = new Set(
      seats.map((s) => s.role?.id).filter(Boolean)
    );
    const townsfolkList = filteredGroupedRoles?.townsfolk || [];
    const demonList = filteredGroupedRoles?.demon || [];

    const usedCharadeIdsInThisBatch = new Set<string>();

    let hasChanges = false;
    const newSeats = seats.map((seat) => {
      if (seat.role?.id === "drunk" || seat.role?.id === "marionette") {
        const currentFakeId = seat.charadeRole?.id;
        // 候选池：不在场、本批次未选用、且非酒鬼的镇民
        let pool = townsfolkList.filter(
          (t) =>
            !inPlayRealRoleIds.has(t.id) &&
            !usedCharadeIdsInThisBatch.has(t.id) &&
            t.id !== "drunk"
        );
        // 若重复点击且候选池数量大于1，优先排除当前伪装，使每次随机都有明显变化
        if (pool.length > 1 && currentFakeId) {
          const alternatePool = pool.filter((t) => t.id !== currentFakeId);
          if (alternatePool.length > 0) {
            pool = alternatePool;
          }
        }
        if (pool.length === 0) {
          pool = townsfolkList.filter((t) => t.id !== "drunk");
        }
        if (pool.length > 0) {
          const fake = pool[Math.floor(Math.random() * pool.length)];
          usedCharadeIdsInThisBatch.add(fake.id);
          hasChanges = true;
          return {
            ...seat,
            charadeRole: fake,
            displayRole: fake,
          };
        }
      } else if (seat.role?.id === "lunatic") {
        const currentFakeDemonId = seat.apparentDemonRole?.id;
        // 候选池：不在场、本批次未选用、且非疯子的恶魔
        let pool = demonList.filter(
          (d) =>
            !inPlayRealRoleIds.has(d.id) &&
            !usedCharadeIdsInThisBatch.has(d.id) &&
            d.id !== "lunatic"
        );
        // 若重复点击且候选池数量大于1，优先排除当前假恶魔，使每次随机都有明显变化
        if (pool.length > 1 && currentFakeDemonId) {
          const alternatePool = pool.filter((d) => d.id !== currentFakeDemonId);
          if (alternatePool.length > 0) {
            pool = alternatePool;
          }
        }
        if (pool.length === 0) {
          pool = demonList.filter((d) => d.id !== "lunatic");
        }
        if (pool.length > 0) {
          const fakeDemon = pool[Math.floor(Math.random() * pool.length)];
          usedCharadeIdsInThisBatch.add(fakeDemon.id);
          hasChanges = true;
          return {
            ...seat,
            apparentDemonRole: fakeDemon,
            displayRole: fakeDemon,
          };
        }
      }
      return seat;
    });

    if (hasChanges) {
      dispatch(gameActions.setSeats(newSeats));
      dispatch(gameActions.updateState({ seats: newSeats }));
      dispatch(gameActions.saveHistory({ seats: newSeats }));
      return newSeats;
    }
    return seats;
  };

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
    const marionetteOk =
      !marionetteStatus || marionetteStatus.valid || ignoreMarionetteSetup;
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
      canStart:
        (compStatus.valid || ignoreBaronSetup) &&
        (baronStat.valid || ignoreBaronSetup) &&
        marionetteOk &&
        charadeStatus.valid,
    };
  }, [
    seats,
    getCompositionStatus,
    getBaronStatus,
    ignoreBaronSetup,
    marionetteStatus,
    ignoreMarionetteSetup,
    charadeStatus.valid,
  ]);

  const handleAttemptStartGame = () => {
    if (activeSeats.length < 5) {
      setCompositionError({
        standard: { townsfolk: 3, outsider: 0, minion: 1, demon: 1 } as any,
        actual: {
          townsfolk: activeSeats.filter((s) => s.role?.type === "townsfolk")
            .length,
          outsider: activeSeats.filter((s) => s.role?.type === "outsider")
            .length,
          minion: activeSeats.filter((s) => s.role?.type === "minion").length,
          demon: activeSeats.filter(
            (s) => s.role?.type === "demon" || s.role?.id === "legion"
          ).length,
        },
        playerCount: activeSeats.length,
        hasBaron: false,
      });
      setShowCompositionModal(true);
      return;
    }

    // 🎭 伪装身份检测：未完全设置伪装前阻断开始游戏，并触发 2.7 秒渐入渐出提示
    if (!charadeStatus.valid) {
      const unconfiguredNames = charadeStatus.unconfigured
        .map((s) => `${s.id + 1}号【${s.role?.name}】`)
        .join("、");
      showCharadeWarningToast(`请设置${unconfiguredNames}角色伪装`);
      return;
    }

    const hasDemon = activeSeats.some(
      (s) => s.role?.type === "demon" || s.role?.id === "legion"
    );
    if (!hasDemon) {
      const compStatus = getCompositionStatus(activeSeats);
      setCompositionError({
        standard: (compStatus.standard || {
          townsfolk: 3,
          outsider: 0,
          minion: 1,
          demon: 1,
        }) as any,
        actual: compStatus.actual,
        playerCount: compStatus.playerCount,
        hasBaron: compStatus.hasBaron,
      });
      setShowCompositionModal(true);
      return;
    }
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
    if (!ignoreMarionetteSetup && marionetteStatus && !marionetteStatus.valid) {
      setShowMarionetteModal(true);
      return;
    }

    setCompositionError(null);
    setBaronSetupCheck(null);
    handlePreStartNight();
  };

  const handleForceStartGame = () => {
    if (!charadeStatus.valid) {
      handleAutoAssignCharades();
    }
    setShowCompositionModal(false);
    handlePreStartNight();
  };

  const handleCloseCompositionModal = () => {
    setShowCompositionModal(false);
  };

  const buildBadge = (label: string, value: number, color: string) => (
    <div
      className={`flex-1 flex items-center justify-center gap-2 rounded-lg border px-3 py-3 text-sm ${color}`}
    >
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
            <div className="flex items-center gap-4">
              <div className="text-3xl font-black text-slate-50">
                {selectedScript?.name ?? "未选择"}
              </div>
              {selectedScript && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowQuickStartModal(true);
                  }}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg transition-all active:scale-95 cursor-pointer"
                  title="选择人数并随机生成阵容，按行动顺序排定座次快速开始"
                >
                  ⚡ 快速开始
                </button>
              )}
            </div>
            <div className="text-sm text-slate-500">
              请分配角色并检查阵容后开始游戏
            </div>
          </div>
          <div className="flex items-center gap-3 text-base text-slate-400">
            <span className="inline-flex h-4 w-4 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.7)]" />
            准备阶段
          </div>
        </div>

        {/* Player Count - Full Width */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-slate-300">游戏人数</h3>
            <button
              type="button"
              onClick={() => setShowCompositionGuideModal(true)}
              className="w-5 h-5 rounded-full border border-amber-400/80 bg-amber-500/15 hover:bg-amber-500/30 text-amber-300 font-black text-xs flex items-center justify-center transition shadow-sm hover:scale-110 active:scale-95 cursor-pointer"
              title="查看官方标准人数与阵营配比表"
            >
              ?
            </button>
          </div>
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
            {buildBadge(
              "村民",
              counts.townsfolk,
              "border-emerald-500/40 bg-emerald-900/40 text-emerald-100"
            )}
            {buildBadge(
              "外来者",
              counts.outsider,
              "border-cyan-400/40 bg-cyan-900/40 text-cyan-100"
            )}
            {buildBadge(
              "爪牙",
              counts.minion,
              "border-amber-400/40 bg-amber-900/40 text-amber-100"
            )}
            {buildBadge(
              "恶魔",
              counts.demon,
              "border-rose-400/40 bg-rose-900/40 text-rose-100"
            )}
          </div>
        </div>

        {/* 已移除简版座位视图，使用左侧的大圆桌进行落座操作 */}
        {/* {!hideSeatingChart && circularSeats} */}

        {(compositionError || (baronSetupCheck && !ignoreBaronSetup)) && (
          <div className="border-l-4 border-red-500/50 bg-red-900/20 p-4 text-base text-red-100">
            {compositionError && (
              <div className="space-y-2">
                <div className="font-bold text-red-200">
                  {(compositionError as any).hasLegion
                    ? "军团阵容校验未通过"
                    : "阵容校验未通过"}
                </div>
                {(compositionError as any).hasLegion ? (
                  <div>
                    军团规则：多数玩家必须为军团（恶魔），且至少需要 1
                    名善良玩家（镇民/外来者）。
                  </div>
                ) : (
                  <div>
                    建议：{compositionError.standard.townsfolk}村民 /{" "}
                    {compositionError.standard.outsider}外来者 /{" "}
                    {compositionError.standard.minion}爪牙 /{" "}
                    {compositionError.standard.demon}恶魔
                  </div>
                )}
                <div>
                  当前：{compositionError.actual.townsfolk}村民 /{" "}
                  {compositionError.actual.outsider}外来者 /{" "}
                  {compositionError.actual.minion}爪牙 /{" "}
                  {compositionError.actual.demon}恶魔
                </div>
              </div>
            )}
            {baronSetupCheck && !ignoreBaronSetup && (
              <div className="mt-4 space-y-3">
                <div className="font-bold text-yellow-200">检测到男爵影响</div>
                <div>
                  建议：{baronSetupCheck.recommended.townsfolk}村民 /{" "}
                  {baronSetupCheck.recommended.outsider}外来者
                </div>
                <div>
                  当前：{baronSetupCheck.current.townsfolk}村民 /{" "}
                  {baronSetupCheck.current.outsider}外来者
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

        {/* 🎪 提线木偶座次告警 */}
        {marionetteStatus &&
          !marionetteStatus.valid &&
          !ignoreMarionetteSetup && (
            <div className="border-l-4 border-amber-500 bg-amber-950/40 p-4 text-base text-amber-100 rounded-r-xl space-y-3 shadow-lg shadow-amber-950/50">
              <div className="flex items-center gap-2 font-bold text-amber-300">
                <span className="text-lg">🎪</span>
                <span>提线木偶座次违规</span>
              </div>
              <div className="text-sm text-amber-200/90 leading-relaxed">
                规则要求：{marionetteStatus.marionetteSeat.id + 1}
                号【提线木偶】必须与
                {marionetteStatus.targetRoleDesc}（
                {marionetteStatus.targetSeats
                  .map((s) => `${s.id + 1}号【${s.role?.name}】`)
                  .join("或")}
                ）物理相邻！当前未相邻。
              </div>
              <div className="flex flex-wrap gap-3 pt-1">
                <button
                  onClick={handleAutoFixMarionetteSeating}
                  className="rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2.5 text-sm transition shadow-md shadow-amber-500/20"
                >
                  🔀 一键调整提线木偶至邻座
                </button>
                <button
                  onClick={() => setIgnoreMarionetteSetup(true)}
                  className="rounded-lg border border-amber-400/50 hover:bg-amber-500/10 text-amber-200 px-3 py-2.5 text-sm transition"
                >
                  忽略此检查
                </button>
              </div>
            </div>
          )}

        {/* 🎭 伪装身份配置面板（酒鬼、提线木偶、疯子）- 常驻保留 */}
        {charadeStatus.charadeSeats.length > 0 && (
          <div
            className={`border-l-4 p-4 text-base rounded-r-xl space-y-3 shadow-lg transition-colors ${
              charadeStatus.valid
                ? "border-emerald-500 bg-emerald-950/30 text-emerald-100 shadow-emerald-950/40"
                : "border-amber-500 bg-amber-950/30 text-amber-100 shadow-amber-950/40"
            }`}
          >
            <div className="flex items-center justify-between">
              <div
                className={`flex items-center gap-2 font-bold ${
                  charadeStatus.valid ? "text-emerald-300" : "text-amber-300"
                }`}
              >
                <span className="text-lg">🎭</span>
                <span>
                  {charadeStatus.valid ? "伪装身份已配置" : "待设置伪装身份"}
                </span>
              </div>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-mono border ${
                  charadeStatus.valid
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                    : "bg-amber-500/20 text-amber-300 border-amber-500/30"
                }`}
              >
                {charadeStatus.valid
                  ? `已就绪 (${charadeStatus.charadeSeats.length}/${charadeStatus.charadeSeats.length})`
                  : `待配置 (${charadeStatus.unconfigured.length}/${charadeStatus.charadeSeats.length})`}
              </span>
            </div>

            <div
              className={`text-sm leading-relaxed ${
                charadeStatus.valid
                  ? "text-emerald-200/90"
                  : "text-amber-200/90"
              }`}
            >
              {charadeStatus.valid
                ? "已为所有角色配置伪装身份。您可点击下方角色单独调整，或再次点击一键随机重新分配："
                : "场上有角色需要设置伪装身份。请点击下方角色单独设置，或点击一键随机分配："}
            </div>

            {/* 角色伪装列表：默认按卡片格式展示，点击具体角色进入单独设置/修改弹窗 */}
            <div className="space-y-2 pt-1">
              {charadeStatus.charadeSeats.map((seat) => {
                const fakeRole =
                  seat.role?.id === "lunatic"
                    ? seat.apparentDemonRole
                    : seat.charadeRole;
                const isConfigured = !!fakeRole;

                return (
                  <button
                    key={seat.id}
                    type="button"
                    onClick={() => {
                      if (onOpenCharadeModal) {
                        onOpenCharadeModal(seat.id);
                      } else {
                        setShowCharadeModal(true);
                      }
                    }}
                    className={`w-full text-left rounded-xl border px-3 py-2 sm:px-3.5 sm:py-2.5 text-xs sm:text-sm transition-all duration-200 flex items-center justify-between gap-1.5 sm:gap-2 cursor-pointer group shadow-sm charade-item-single-line overflow-x-auto scrollbar-none ${
                      isConfigured
                        ? "border-emerald-500/60 bg-emerald-950/50 hover:bg-emerald-900/60 hover:border-emerald-400 text-emerald-200"
                        : "border-amber-500/60 bg-amber-950/40 hover:bg-amber-900/50 hover:border-amber-400 text-amber-200"
                    }`}
                    style={{ whiteSpace: "nowrap", scrollbarWidth: "none" }}
                    title={
                      isConfigured
                        ? `点击修改 ${seat.id + 1}号【${seat.role?.name}】的伪装身份`
                        : `点击为 ${seat.id + 1}号【${seat.role?.name}】设置伪装身份`
                    }
                  >
                    <div
                      className="flex items-center gap-1 sm:gap-1.5 whitespace-nowrap min-w-0 shrink-0"
                      style={{ whiteSpace: "nowrap" }}
                    >
                      <span
                        className="font-bold text-slate-100 whitespace-nowrap shrink-0"
                        style={{ whiteSpace: "nowrap" }}
                      >
                        {seat.id + 1}号【{seat.role?.name}】
                      </span>
                      <span
                        className={`font-mono font-bold whitespace-nowrap shrink-0 ${
                          isConfigured ? "text-emerald-400" : "text-amber-400"
                        }`}
                        style={{ whiteSpace: "nowrap" }}
                      >
                        →
                      </span>
                      {isConfigured ? (
                        <span
                          className="text-emerald-300 font-bold whitespace-nowrap shrink-0 flex items-center"
                          style={{ whiteSpace: "nowrap" }}
                        >
                          <span style={{ whiteSpace: "nowrap" }}>伪装为</span>
                          <span
                            className="underline underline-offset-2 ml-0.5 text-emerald-100 group-hover:text-white whitespace-nowrap"
                            style={{ whiteSpace: "nowrap" }}
                          >
                            【{fakeRole.name}】
                          </span>
                        </span>
                      ) : (
                        <span
                          className="text-amber-300 font-bold whitespace-nowrap shrink-0 flex items-center"
                          style={{ whiteSpace: "nowrap" }}
                        >
                          <span style={{ whiteSpace: "nowrap" }}>伪装</span>
                          <span
                            className="underline underline-offset-2 ml-0.5 text-amber-200 group-hover:text-white whitespace-nowrap"
                            style={{ whiteSpace: "nowrap" }}
                          >
                            【未设置】
                          </span>
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded border whitespace-nowrap shrink-0 ml-1.5 sm:ml-2 ${
                        isConfigured
                          ? "text-emerald-300 border-emerald-500/30 bg-emerald-500/10 group-hover:bg-emerald-500/20"
                          : "text-amber-300 border-amber-500/30 bg-amber-500/10 group-hover:bg-amber-500/20"
                      }`}
                      style={{ whiteSpace: "nowrap" }}
                    >
                      {isConfigured ? "修改\u00A0✎" : "设置\u00A0✎"}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* 省去手动分配按钮，仅保留一键随机分配按钮 */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => handleAutoAssignCharades()}
                className="w-full rounded-xl border border-indigo-400/50 bg-indigo-950/60 hover:bg-indigo-900/80 active:scale-[0.98] text-indigo-200 hover:text-white py-2.5 text-sm font-bold transition shadow-md shadow-indigo-950/40 cursor-pointer flex items-center justify-center gap-2"
                title="一键随机分配所有角色的伪装身份"
              >
                <span>🎲</span>
                <span>
                  {charadeStatus.valid ? "再次一键随机分配" : "一键随机分配"}
                </span>
              </button>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <h3 className="text-lg font-bold text-slate-300">角色列表</h3>
          <div className="text-sm text-slate-500 mb-3">
            点击卡片选择角色，已被选择的卡片将变灰
          </div>

          <div className="space-y-4">
            {Object.entries(filteredGroupedRoles || {}).map(([type, list]) => (
              <div key={type} className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="text-lg font-bold text-slate-100">
                    {groupTitle[type] || type}
                  </div>
                  <div className="text-sm text-slate-500">
                    共 {list.length} 位角色
                  </div>
                </div>
                <div className="grid gap-3 grid-cols-2">
                  {list.map((r) => {
                    const takenSeats = seats.filter((s) => s.role?.id === r.id);
                    const isTaken = takenSeats.length > 0;
                    const allowsMultiple = r.id === "legion" || r.id === "riot";
                    return (
                      <button
                        key={`${type}-${r.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (allowsMultiple) {
                            // 多落座角色（如军团/暴乱）：点击卡片始终为选中/反选，支持连续落座到多个座位
                            setSelectedRole(
                              selectedRole?.id === r.id ? null : r
                            );
                          } else if (isTaken && takenSeats[0]) {
                            // 单落座角色：点击已入座角色卡片取消落座
                            handleSeatClick(takenSeats[0].id);
                          } else {
                            // 点击未入座角色卡片：选中或反选
                            setSelectedRole(
                              selectedRole?.id === r.id ? null : r
                            );
                          }
                        }}
                        className={`group relative overflow-hidden rounded-lg border text-left transition-all h-16 ${
                          isTaken
                            ? allowsMultiple
                              ? "border-purple-500/50 bg-purple-950/60 text-purple-200 hover:border-purple-400 cursor-pointer"
                              : "border-amber-500/30 bg-slate-800/80 text-amber-200 hover:border-red-500/50 hover:bg-red-950/30 cursor-pointer"
                            : `${typeBgColors[r.type]} border-white/10 hover:bg-white/5`
                        } ${selectedRole?.id === r.id ? "ring-2 ring-white" : ""}`}
                        data-role-id={r.id}
                        title={
                          isTaken
                            ? allowsMultiple
                              ? `已落座 ${takenSeats.length} 人 (${takenSeats.map((s) => `${s.id + 1}号`).join("、")})，可继续选中并点击空座位加派`
                              : `已在 ${takenSeats[0].id + 1}号座位落座，点击取消落座`
                            : r.ability || r.name
                        }
                      >
                        <div className="relative h-full flex flex-col items-center justify-center px-3 leading-tight py-2">
                          <span className="text-sm font-bold text-slate-50 whitespace-nowrap">
                            {r.name}
                          </span>
                          <span className="text-xs text-white/60 uppercase tracking-wide mt-1">
                            {r.id.replace(/_/g, " ")}
                          </span>
                          {isTaken && (
                            <div className="absolute top-1 right-2 text-xs text-amber-400 font-mono">
                              {allowsMultiple
                                ? `✓ ${takenSeats.length}人`
                                : `✓ ${takenSeats[0].id + 1}号`}
                            </div>
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
          disabled={activeSeats.length < 5}
          className={`w-full rounded-2xl h-16 text-2xl font-black tracking-wide transition ${
            canStart && activeSeats.length >= 5
              ? "bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/30 hover:bg-emerald-400"
              : "bg-amber-500/80 text-slate-950 shadow-lg shadow-amber-500/30 hover:bg-amber-400"
          } ${activeSeats.length < 5 ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {activeSeats.length < 5
            ? `请先为至少5名玩家落座 (${activeSeats.length}/5)`
            : "开始游戏"}
        </button>
      </div>

      {showCompositionModal && (
        <ModalWrapper
          title="⚠️ 阵容配置错误"
          onClose={handleCloseCompositionModal}
          className="max-w-lg"
          footer={
            <div className="flex flex-col sm:flex-row gap-3 w-full justify-end">
              <button
                onClick={handleCloseCompositionModal}
                className="flex-1 rounded-xl border border-white/20 bg-slate-800 text-slate-100 font-bold py-3 hover:bg-slate-700 transition"
              >
                返回修改
              </button>
              <button
                onClick={handleForceStartGame}
                className="flex-1 rounded-xl bg-emerald-500 text-slate-950 font-bold py-3 hover:bg-emerald-400 transition"
              >
                仍然开始游戏
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            {compositionError && (
              <div className="space-y-2 text-sm text-slate-100 bg-slate-800/60 p-4 rounded-xl border border-red-500/30">
                <div className="font-semibold text-red-300">标准配比</div>
                <div>
                  {compositionError.standard.townsfolk} 村民 /{" "}
                  {compositionError.standard.outsider} 外来者 /{" "}
                  {compositionError.standard.minion} 爪牙 /{" "}
                  {compositionError.standard.demon} 恶魔
                </div>
                <div className="font-semibold text-red-300 mt-2">当前配置</div>
                <div>
                  {compositionError.actual.townsfolk} 村民 /{" "}
                  {compositionError.actual.outsider} 外来者 /{" "}
                  {compositionError.actual.minion} 爪牙 /{" "}
                  {compositionError.actual.demon} 恶魔
                </div>
              </div>
            )}
            {baronSetupCheck && !ignoreBaronSetup && (
              <div className="space-y-2 text-sm text-yellow-100 bg-slate-800/60 p-4 rounded-xl border border-yellow-500/30">
                <div className="font-semibold text-yellow-300">
                  男爵配置不符
                </div>
                <div>
                  建议：{baronSetupCheck.recommended.townsfolk} 村民 /{" "}
                  {baronSetupCheck.recommended.outsider} 外来者
                </div>
                <div>
                  当前：{baronSetupCheck.current.townsfolk} 村民 /{" "}
                  {baronSetupCheck.current.outsider} 外来者
                </div>
              </div>
            )}
          </div>
        </ModalWrapper>
      )}

      {/* 🎪 提线木偶座次违规拦截弹窗 */}
      {showMarionetteModal && marionetteStatus && (
        <ModalWrapper
          title="🎪 提线木偶座次违规"
          onClose={() => setShowMarionetteModal(false)}
          className="max-w-lg"
          footer={
            <div className="flex flex-col sm:flex-row gap-3 w-full justify-end">
              <button
                onClick={() => setShowMarionetteModal(false)}
                className="flex-1 rounded-xl border border-white/20 bg-slate-800 text-slate-100 font-bold py-3 hover:bg-slate-700 transition"
              >
                返回修改
              </button>
              <button
                onClick={() => {
                  handleAutoFixMarionetteSeating();
                  if (!charadeStatus.valid) {
                    handleAutoAssignCharades();
                  }
                  setShowMarionetteModal(false);
                  handlePreStartNight();
                }}
                className="flex-1 rounded-xl bg-amber-500 text-slate-950 font-bold py-3 hover:bg-amber-400 transition"
              >
                🔀 一键调整并开始
              </button>
              <button
                onClick={() => {
                  setIgnoreMarionetteSetup(true);
                  if (!charadeStatus.valid) {
                    handleAutoAssignCharades();
                  }
                  setShowMarionetteModal(false);
                  handlePreStartNight();
                }}
                className="px-4 py-3 rounded-xl border border-amber-500/50 bg-amber-950/40 text-amber-200 font-bold hover:bg-amber-900/60 transition text-sm"
              >
                仍然开始
              </button>
            </div>
          }
        >
          <div className="space-y-3 text-slate-200">
            <p>
              《染·钟楼谜团》官方规则要求：
              <span className="font-bold text-amber-300">
                提线木偶必须与{marionetteStatus.targetRoleDesc}物理相邻
              </span>
              。
            </p>
            <div className="rounded-xl border border-amber-500/40 bg-slate-800/80 p-4 text-sm space-y-2">
              <div className="text-amber-200">
                当前：{marionetteStatus.marionetteSeat.id + 1}号【提线木偶】与
                {marionetteStatus.targetSeats
                  .map((s) => `${s.id + 1}号【${s.role?.name}】`)
                  .join("或")}
                不相邻。
              </div>
              <div className="text-xs text-slate-400">
                建议点击“一键调整并开始”，系统将自动将提线木偶与恶魔身旁的座位互换，确保规则合规。
              </div>
            </div>
          </div>
        </ModalWrapper>
      )}

      {/* 官方标准阵营人数配比表弹窗 */}
      <PlayerCompositionModal
        isOpen={showCompositionGuideModal}
        onClose={() => setShowCompositionGuideModal(false)}
        currentPlayerCount={playerCount || seats.length}
        script={selectedScript}
        scriptName={selectedScript?.name}
      />

      {/* ⚡ 快速开始弹窗 */}
      <QuickStartModal
        isOpen={showQuickStartModal}
        onClose={() => setShowQuickStartModal(false)}
        selectedScript={selectedScript}
        onConfirm={(count, sortedRoles) => {
          if (onQuickStart) {
            onQuickStart(count, sortedRoles);
          } else if (onQuickTest) {
            onQuickTest();
          }
        }}
      />

      {/* 🎭 伪装身份设置弹窗（提线木偶 / 酒鬼 / 疯子） */}
      <CharadeConfigModal
        isOpen={showCharadeModal}
        onClose={() => setShowCharadeModal(false)}
        seats={seats}
        filteredGroupedRoles={filteredGroupedRoles}
        onConfirm={(configuredSeats) => {
          dispatch(gameActions.setSeats(configuredSeats));
          dispatch(gameActions.updateState({ seats: configuredSeats }));
          dispatch(gameActions.saveHistory({ seats: configuredSeats }));
          setShowCharadeModal(false);
        }}
      />

      {/* 🎭 渐入渐出无按钮提示弹窗（持续2.7秒，逐渐浮现+逐渐消失，无按钮，适配 UI） */}
      {charadeToast && (
        <div
          key={charadeToast.id}
          className="pointer-events-none fixed top-16 left-1/2 -translate-x-1/2 z-[10000] flex items-center gap-3 px-6 py-3.5 rounded-2xl bg-slate-900/95 border-2 border-amber-500/90 text-amber-100 shadow-2xl shadow-amber-950/80 backdrop-blur-md animate-charade-toast"
        >
          <span className="text-2xl drop-shadow-[0_0_8px_rgba(245,158,11,0.6)]">
            🎭
          </span>
          <span className="font-bold text-base tracking-wide text-amber-200">
            {charadeToast.message}
          </span>
        </div>
      )}
    </div>
  );
}

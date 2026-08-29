"use client";

import { useEffect, useMemo, useState } from "react";
import type { Seat } from "../../../app/data";
import { roles } from "../../../app/data";
import type { NightInfoResult } from "../../types/game";

interface NightActionPageProps {
  /** 当前夜间行动的角色信息 */
  nightInfo: NightInfoResult;
  /** 所有座位 */
  seats: Seat[];
  /** 已选中的目标 */
  selectedTargets: number[];
  /** 切换目标选中状态 */
  onToggleTarget: (seatId: number) => void;
  /** 确认执行 */
  onConfirm: (storytellerInput?: any) => void;
  /** 取消/跳过 */
  onCancel: () => void;
  /** 确认按钮是否禁用 */
  isConfirmDisabled: boolean;
  /** 角色能力描述（guide 文案） */
  guideText?: string;
  /** 是否受干扰（中毒/醉酒） */
  isDisturbed?: boolean;
  /** 结果文本（执行后展示） */
  resultText?: string;
  /** 结果确认回调 */
  onResultConfirm?: () => void;
}

export function NightActionPage({
  nightInfo,
  seats,
  selectedTargets,
  onToggleTarget,
  onConfirm,
  onCancel,
  isConfirmDisabled,
  guideText,
  isDisturbed,
  resultText,
  onResultConfirm,
}: NightActionPageProps) {
  const roleId = nightInfo.seat?.role?.id || "";
  const roleName = nightInfo.seat?.role?.name || "未知角色";
  const roleType = nightInfo.seat?.role?.type || "unknown";
  const seatId = nightInfo.seat?.id ?? 0;
  const targetLimit = nightInfo.targetLimit;
  const needsTargets = targetLimit && targetLimit.max > 0;

  // 阵营颜色映射
  const factionColors: Record<
    string,
    { bg: string; text: string; border: string }
  > = {
    townsfolk: {
      bg: "bg-blue-500/20",
      text: "text-blue-300",
      border: "border-blue-500/40",
    },
    outsider: {
      bg: "bg-purple-500/20",
      text: "text-purple-300",
      border: "border-purple-500/40",
    },
    minion: {
      bg: "bg-red-500/20",
      text: "text-red-300",
      border: "border-red-500/40",
    },
    demon: {
      bg: "bg-red-600/30",
      text: "text-red-200",
      border: "border-red-600/50",
    },
    traveler: {
      bg: "bg-yellow-500/20",
      text: "text-yellow-300",
      border: "border-yellow-500/40",
    },
  };
  const faction = factionColors[roleType] || factionColors.townsfolk;

  // ─── 1. 洗衣妇 / 图书管理员 / 调查员 / 厨师 自动推荐与微调状态 ─────────────────
  const allTownsfolkRoles = useMemo(
    () => roles.filter((r) => r.type === "townsfolk"),
    []
  );
  const allOutsiderRoles = useMemo(
    () => roles.filter((r) => r.type === "outsider"),
    []
  );
  const allMinionRoles = useMemo(
    () => roles.filter((r) => r.type === "minion"),
    []
  );

  // 自动推荐计算（默认值）
  const defaultAutoInfo = useMemo(() => {
    if (roleId === "washerwoman") {
      const realTownsfolk = seats.filter(
        (s) =>
          s.id !== seatId &&
          s.role?.id !== "drunk" &&
          (s.role?.type === "townsfolk" ||
            (s.role?.id === "spy" &&
              (s as any).registerAsGood !== false &&
              (s as any).registerAsEvil !== true))
      );
      const targetTownsfolk =
        realTownsfolk.length > 0
          ? realTownsfolk[0]
          : seats.find((s) => s.id !== seatId) || seats[0];
      const otherSeat =
        seats.find((s) => s.id !== seatId && s.id !== targetTownsfolk?.id) ||
        targetTownsfolk;
      const displayRoleName =
        targetTownsfolk?.role?.id === "spy"
          ? "僧侣"
          : targetTownsfolk?.role?.name || "僧侣";
      return {
        c1: targetTownsfolk?.id ?? 0,
        c2: otherSeat?.id ?? 1,
        roleName: displayRoleName,
      };
    }
    if (roleId === "librarian") {
      const outsiders = seats.filter(
        (s) =>
          s.id !== seatId &&
          (s.role?.type === "outsider" ||
            s.role?.id === "drunk" ||
            (s.role?.id === "spy" &&
              (s as any).registerAsGood !== false &&
              (s as any).registerAsEvil !== true))
      );
      if (outsiders.length === 0) {
        return { mode: "zero" as const, c1: 0, c2: 1, roleName: "" };
      }
      const targetOutsider = outsiders[0];
      const otherSeat =
        seats.find((s) => s.id !== seatId && s.id !== targetOutsider.id) ||
        targetOutsider;
      const displayRoleName =
        targetOutsider.role?.id === "drunk"
          ? "酒鬼"
          : targetOutsider.role?.id === "spy"
            ? "管家"
            : targetOutsider.role?.name || "管家";
      return {
        mode: "candidates" as const,
        c1: targetOutsider.id,
        c2: otherSeat.id,
        roleName: displayRoleName,
      };
    }
    if (roleId === "investigator") {
      const minions = seats.filter(
        (s) =>
          s.id !== seatId &&
          ((s.role?.type === "minion" &&
            !(
              s.role?.id === "spy" &&
              (s as any).registerAsGood !== false &&
              (s as any).registerAsEvil !== true
            )) ||
            (s.role?.id === "recluse" &&
              (s as any).registerAsEvil !== false &&
              (s as any).registerAsDemon !== false))
      );
      const targetMinion =
        minions.length > 0
          ? minions[0]
          : seats.find((s) => s.id !== seatId) || seats[0];
      const otherSeat =
        seats.find((s) => s.id !== seatId && s.id !== targetMinion?.id) ||
        targetMinion;
      const displayMinionName =
        targetMinion?.role?.id === "recluse"
          ? "投毒者"
          : targetMinion?.role?.name || "投毒者";
      return {
        c1: targetMinion?.id ?? 0,
        c2: otherSeat?.id ?? 1,
        roleName: displayMinionName,
      };
    }
    if (roleId === "chef") {
      // 环形邻座邪恶计算
      const livingSeats = seats.filter((s) => !s.isDead);
      let count = 0;
      for (let i = 0; i < livingSeats.length; i++) {
        const curr = livingSeats[i];
        const next = livingSeats[(i + 1) % livingSeats.length];
        const isCurrEvil =
          (curr.role?.type === "minion" ||
            curr.role?.type === "demon" ||
            (curr.role?.id === "recluse" &&
              (curr as any).registerAsEvil !== false) ||
            (curr.role?.id === "spy" &&
              (curr as any).registerAsEvil === true)) &&
          !(
            curr.role?.id === "spy" &&
            (curr as any).registerAsGood !== false &&
            (curr as any).registerAsEvil !== true
          );
        const isNextEvil =
          (next.role?.type === "minion" ||
            next.role?.type === "demon" ||
            (next.role?.id === "recluse" &&
              (next as any).registerAsEvil !== false) ||
            (next.role?.id === "spy" &&
              (next as any).registerAsEvil === true)) &&
          !(
            next.role?.id === "spy" &&
            (next as any).registerAsGood !== false &&
            (next as any).registerAsEvil !== true
          );
        if (isCurrEvil && isNextEvil) count++;
      }
      return { count };
    }
    return null;
  }, [roleId, seats, seatId]);

  // 微调状态
  const [showOverride, setShowOverride] = useState(false);
  const [customC1, setCustomC1] = useState<number>(0);
  const [customC2, setCustomC2] = useState<number>(1);
  const [customRoleName, setCustomRoleName] = useState<string>("");
  const [librarianMode, setLibrarianMode] = useState<"candidates" | "zero">(
    "candidates"
  );
  const [chefCount, setChefCount] = useState<number>(0);

  // 初始化微调状态
  useEffect(() => {
    if (defaultAutoInfo) {
      const info = defaultAutoInfo as any;
      if (typeof info.c1 === "number") setCustomC1(info.c1);
      if (typeof info.c2 === "number") setCustomC2(info.c2);
      if (typeof info.roleName === "string") setCustomRoleName(info.roleName);
      if (info.mode === "zero" || info.mode === "candidates")
        setLibrarianMode(info.mode);
      if (typeof info.count === "number") setChefCount(info.count);
    }
  }, [defaultAutoInfo]);

  // ─── 共情者 (Empath) 存活邻居与邪恶数计算 ─────────────────────────────────
  const livingLeftNeighbor = useMemo(() => {
    if (roleId !== "empath") return null;
    const living = seats.filter((s) => !s.isDead);
    const myIdx = living.findIndex((s) => s.id === seatId);
    if (myIdx === -1 || living.length <= 1) return null;
    return living[(myIdx - 1 + living.length) % living.length];
  }, [roleId, seats, seatId]);

  const livingRightNeighbor = useMemo(() => {
    if (roleId !== "empath") return null;
    const living = seats.filter((s) => !s.isDead);
    const myIdx = living.findIndex((s) => s.id === seatId);
    if (myIdx === -1 || living.length <= 1) return null;
    return living[(myIdx + 1) % living.length];
  }, [roleId, seats, seatId]);

  const empathEvilCount = useMemo(() => {
    let count = 0;
    if (livingLeftNeighbor) {
      const isRecluseEvil =
        livingLeftNeighbor.role?.id === "recluse" &&
        (livingLeftNeighbor as any).registerAsEvil !== false;
      const isSpyEvil =
        livingLeftNeighbor.role?.id === "spy" &&
        (livingLeftNeighbor as any).registerAsEvil === true;
      const isNormalEvil =
        (livingLeftNeighbor.role?.type === "minion" ||
          livingLeftNeighbor.role?.type === "demon") &&
        !(
          livingLeftNeighbor.role?.id === "spy" &&
          (livingLeftNeighbor as any).registerAsGood !== false &&
          (livingLeftNeighbor as any).registerAsEvil !== true
        );
      if (isRecluseEvil || isSpyEvil || isNormalEvil) count++;
    }
    if (
      livingRightNeighbor &&
      livingRightNeighbor.id !== livingLeftNeighbor?.id
    ) {
      const isRecluseEvil =
        livingRightNeighbor.role?.id === "recluse" &&
        (livingRightNeighbor as any).registerAsEvil !== false;
      const isSpyEvil =
        livingRightNeighbor.role?.id === "spy" &&
        (livingRightNeighbor as any).registerAsEvil === true;
      const isNormalEvil =
        (livingRightNeighbor.role?.type === "minion" ||
          livingRightNeighbor.role?.type === "demon") &&
        !(
          livingRightNeighbor.role?.id === "spy" &&
          (livingRightNeighbor as any).registerAsGood !== false &&
          (livingRightNeighbor as any).registerAsEvil !== true
        );
      if (isRecluseEvil || isSpyEvil || isNormalEvil) count++;
    }
    return count;
  }, [livingLeftNeighbor, livingRightNeighbor]);

  const [empathCustomCount, setEmpathCustomCount] = useState<number>(0);
  useEffect(() => {
    if (roleId === "empath") {
      setEmpathCustomCount(empathEvilCount);
    }
  }, [roleId, empathEvilCount]);

  // ─── 镜像双子 (Evil Twin) 对立目标选择与提示同步 ────────────────────────────
  const defaultGoodTwinId = useMemo(() => {
    if (roleId !== "evil_twin") return null;
    const explicitGoodTwin = seats.find((s) => s.isGoodTwin);
    if (explicitGoodTwin) return explicitGoodTwin.id;
    const candidate =
      seats.find(
        (s) =>
          s.id !== seatId &&
          (s.role?.type === "townsfolk" || s.role?.type === "outsider") &&
          !s.isEvilConverted &&
          !s.isDead
      ) || seats.find((s) => s.id !== seatId && !s.isDead);
    return candidate ? candidate.id : null;
  }, [roleId, seats, seatId]);

  const [evilTwinGoodId, setEvilTwinGoodId] = useState<number | null>(
    defaultGoodTwinId
  );

  useEffect(() => {
    if (defaultGoodTwinId !== null) {
      setEvilTwinGoodId(defaultGoodTwinId);
    }
  }, [defaultGoodTwinId]);

  const currentGoodTwinSeat = useMemo(() => {
    if (roleId !== "evil_twin" || evilTwinGoodId === null) return null;
    return seats.find((s) => s.id === evilTwinGoodId) || null;
  }, [roleId, evilTwinGoodId, seats]);

  // 动态构建能力/指引文案
  const displayedGuide = useMemo(() => {
    if (roleId === "evil_twin") {
      const targetSeatNo = currentGoodTwinSeat
        ? `${currentGoodTwinSeat.id + 1}号`
        : "对立玩家";
      const targetRoleName = currentGoodTwinSeat?.role?.name || "善良角色";
      return `唤醒${seatId + 1}号【镜像双子】。指向对立双子（${targetSeatNo}），并向镜像双子展示其角色标记【${targetRoleName}】。随后唤醒${targetSeatNo}，指向${seatId + 1}号并展示【镜像双子】角色标记。`;
    }
    return guideText;
  }, [roleId, seatId, currentGoodTwinSeat, guideText]);

  // ─── 占卜师 (Fortune Teller) 恶魔与红罗刹判定 ─────────────────────────────
  const fortuneTellerDetection = useMemo(() => {
    if (roleId !== "fortune_teller" || selectedTargets.length < 2) return null;
    const t1 = seats.find((s) => s.id === selectedTargets[0]);
    const t2 = seats.find((s) => s.id === selectedTargets[1]);
    const isDemon1 =
      (t1?.role?.type === "demon" &&
        !(
          t1?.role?.id === "spy" &&
          (t1 as any).registerAsGood !== false &&
          (t1 as any).registerAsEvil !== true
        )) ||
      t1?.isDemonSuccessor ||
      (t1?.role?.id === "recluse" &&
        (t1 as any).registerAsDemon !== false &&
        (t1 as any).registerAsEvil !== false) ||
      (t1?.role?.id === "spy" && (t1 as any).registerAsDemon === true);
    const isDemon2 =
      (t2?.role?.type === "demon" &&
        !(
          t2?.role?.id === "spy" &&
          (t2 as any).registerAsGood !== false &&
          (t2 as any).registerAsEvil !== true
        )) ||
      t2?.isDemonSuccessor ||
      (t2?.role?.id === "recluse" &&
        (t2 as any).registerAsDemon !== false &&
        (t2 as any).registerAsEvil !== false) ||
      (t2?.role?.id === "spy" && (t2 as any).registerAsDemon === true);
    const isRH1 = !!t1?.isRedHerring;
    const isRH2 = !!t2?.isRedHerring;
    const detected = isDemon1 || isDemon2 || isRH1 || isRH2;
    return {
      detected,
      reason:
        isRH1 || isRH2
          ? "🎯 命中红罗刹"
          : isDemon1 || isDemon2
            ? "😈 命中恶魔"
            : "未发现恶魔/红罗刹",
    };
  }, [roleId, selectedTargets, seats]);

  const [fortuneTellerCustomAnswer, setFortuneTellerCustomAnswer] =
    useState<boolean>(false);
  useEffect(() => {
    if (fortuneTellerDetection) {
      setFortuneTellerCustomAnswer(fortuneTellerDetection.detected);
    }
  }, [fortuneTellerDetection]);

  // ─── 恶魔夜杀防护判定（僧侣守护与士兵免疫）────────────────────────────────
  const demonTargetProtection = useMemo(() => {
    if (
      (roleId !== "imp" && roleType !== "demon") ||
      selectedTargets.length === 0
    )
      return null;
    const target = seats.find((s) => s.id === selectedTargets[0]);
    if (!target) return null;

    const isMonkProtected =
      target.isProtected ||
      target.statusEffects?.some((e) => e.type === "protected");
    const isSoldierImmune =
      target.role?.id === "soldier" &&
      !target.isPoisoned &&
      !target.isDrunk &&
      !target.statusEffects?.some(
        (e) => e.type === "poison" || e.type === "drunk"
      );

    if (isMonkProtected) {
      return { type: "monk", text: "🛡️ 该目标受到僧侣神圣守护（将产生平安夜）" };
    }
    if (isSoldierImmune) {
      return {
        type: "soldier",
        text: "🛡️ 士兵被动免疫恶魔击杀（将产生平安夜）",
      };
    }
    return null;
  }, [roleId, roleType, selectedTargets, seats]);

  // ─── 2. 镇长夜杀判定与弹刀状态 ──────────────────────────────────────────
  const isImpAttackingMayor = useMemo(() => {
    if (roleId !== "imp" || selectedTargets.length === 0) return false;
    const target = seats.find((s) => s.id === selectedTargets[0]);
    return target?.role?.id === "mayor" && !target.isDead;
  }, [roleId, selectedTargets, seats]);

  const [mayorChoice, setMayorChoice] = useState<
    "mayor_die" | "bounce" | "immune"
  >("bounce");
  const [mayorBounceTargetId, setMayorBounceTargetId] = useState<number>(() => {
    const aliveOthers = seats.filter(
      (s) => !s.isDead && s.role?.id !== "mayor"
    );
    return aliveOthers[0]?.id ?? 0;
  });

  // ─── 3. 小恶魔自杀传刀指定爪牙状态 ─────────────────────────────────────────
  const isImpSuicide = useMemo(() => {
    return roleId === "imp" && selectedTargets.includes(seatId);
  }, [roleId, selectedTargets, seatId]);

  const aliveMinions = useMemo(() => {
    return seats.filter(
      (s) => !s.isDead && s.id !== seatId && s.role?.type === "minion"
    );
  }, [seats, seatId]);

  const [selectedSuccessorId, setSelectedSuccessorId] = useState<number | null>(
    () => {
      const sw = aliveMinions.find((m) => m.role?.id === "scarlet_woman");
      return sw?.id ?? aliveMinions[0]?.id ?? null;
    }
  );

  useEffect(() => {
    if (isImpSuicide && aliveMinions.length > 0) {
      const sw = aliveMinions.find((m) => m.role?.id === "scarlet_woman");
      setSelectedSuccessorId(sw?.id ?? aliveMinions[0]?.id ?? null);
    }
  }, [isImpSuicide, aliveMinions]);

  // ─── 4. 确认处理 ────────────────────────────────────────────────────────
  const handleConfirmWithOverrides = () => {
    const storytellerInput: any = {};

    if (roleId === "washerwoman" || roleId === "investigator") {
      storytellerInput.candidateIds = [customC1, customC2];
      storytellerInput.shownRoleName = customRoleName;
    } else if (roleId === "librarian") {
      storytellerInput.mode = librarianMode;
      storytellerInput.candidateIds = [customC1, customC2];
      storytellerInput.shownRoleName = customRoleName;
    } else if (roleId === "chef") {
      storytellerInput.evilPairCount = chefCount;
    } else if (roleId === "empath") {
      storytellerInput.evilCount = empathCustomCount;
    } else if (roleId === "fortune_teller") {
      storytellerInput.fortuneAnswer = fortuneTellerCustomAnswer;
    } else if (roleId === "evil_twin") {
      storytellerInput.twinId = evilTwinGoodId;
    } else if (isImpAttackingMayor) {
      storytellerInput.mayorChoice = mayorChoice;
      storytellerInput.mayorBounceTargetId = mayorBounceTargetId;
    } else if (isImpSuicide) {
      storytellerInput.successorSeatId = selectedSuccessorId;
    }

    onConfirm(storytellerInput);
  };

  const hasResult = !!resultText;
  const isInfoRole = [
    "washerwoman",
    "librarian",
    "investigator",
    "chef",
  ].includes(roleId);

  return (
    <div className="fixed inset-0 z-[9998] flex flex-col bg-black/80 backdrop-blur-md">
      {/* 顶部留空给导航栏 */}
      <div className="h-12 shrink-0" />

      {/* 主内容区 */}
      <div className="flex-1 flex items-center justify-center p-4 overflow-y-auto">
        <div className="w-full max-w-2xl space-y-6">
          {/* 涡流世界徽章（顶部警示） */}
          {(nightInfo as any)?.effectiveRole?.id === "vortox" && (
            <div className="bg-gradient-to-r from-fuchsia-600 to-rose-600 text-white text-center py-2 rounded-xl border-2 border-fuchsia-300 shadow-lg font-black">
              🌪️ 涡流世界 · 镇民信息将反相
            </div>
          )}

          {/* 角色信息卡 */}
          <div
            className={`rounded-2xl border ${faction.border} ${faction.bg} p-6 backdrop-blur-xl`}
          >
            <div className="flex items-center gap-4 mb-4">
              <div
                className={`w-16 h-16 rounded-full ${faction.bg} border-2 ${faction.border} flex items-center justify-center text-2xl font-black ${faction.text}`}
              >
                {seatId + 1}
              </div>
              <div>
                <h2 className={`text-2xl font-black ${faction.text}`}>
                  {roleName}
                </h2>
                <p className="text-sm text-slate-400">
                  {seatId + 1}号玩家 ·{" "}
                  {roleType === "townsfolk"
                    ? "镇民"
                    : roleType === "outsider"
                      ? "外来者"
                      : roleType === "minion"
                        ? "爪牙"
                        : roleType === "demon"
                          ? "恶魔"
                          : roleType}
                </p>
              </div>
              {isDisturbed && (
                <span className="ml-auto px-3 py-1 rounded-full bg-red-900/50 text-red-300 text-sm font-bold border border-red-700/50">
                  ⚠️ 受干扰
                </span>
              )}
            </div>

            {/* 能力描述 */}
            {displayedGuide && (
              <div className="bg-black/30 rounded-xl p-4 border border-white/5">
                <p className="text-base text-slate-200 leading-relaxed">
                  {displayedGuide}
                </p>
              </div>
            )}
          </div>

          {/* 结果展示区（执行后内联展示）*/}
          {hasResult && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-950/30 p-6 backdrop-blur-xl">
              <h3 className="text-lg font-bold text-amber-300 mb-3">
                📋 执行结果
              </h3>
              <p className="text-base text-amber-100 leading-relaxed">
                {resultText}
              </p>
              <button
                onClick={onResultConfirm}
                className="mt-4 w-full py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-lg transition-colors"
              >
                确认并继续
              </button>
            </div>
          )}

          {/* ─── 共情者 (Empath) 存活邻居与邪恶数卡片 ────────────────────────── */}
          {roleId === "empath" && !hasResult && (
            <div className="rounded-2xl border border-blue-500/40 bg-blue-950/40 backdrop-blur-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">👁️</span>
                  <h3 className="text-sm font-bold text-blue-200 uppercase tracking-wider">
                    共情者邻座检测（已自动跳过死亡玩家）
                  </h3>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 bg-black/40 p-3 rounded-xl border border-blue-500/20 text-xs">
                <div>
                  <span className="text-slate-400 block mb-0.5">
                    👈 左侧存活邻居:
                  </span>
                  <span className="font-bold text-blue-200 text-sm">
                    {livingLeftNeighbor
                      ? `${livingLeftNeighbor.id + 1}号 [${livingLeftNeighbor.role?.name || "未知"}]`
                      : "无"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">
                    👉 右侧存活邻居:
                  </span>
                  <span className="font-bold text-blue-200 text-sm">
                    {livingRightNeighbor
                      ? `${livingRightNeighbor.id + 1}号 [${livingRightNeighbor.role?.name || "未知"}]`
                      : "无"}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-slate-300">得知邪恶邻居数：</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      setEmpathCustomCount(Math.max(0, empathCustomCount - 1))
                    }
                    className="w-7 h-7 rounded-lg bg-blue-900 hover:bg-blue-800 text-white font-bold flex items-center justify-center border border-blue-700"
                  >
                    -
                  </button>
                  <span className="w-8 text-center text-lg font-black text-amber-400">
                    {empathCustomCount}
                  </span>
                  <button
                    onClick={() =>
                      setEmpathCustomCount(Math.min(2, empathCustomCount + 1))
                    }
                    className="w-7 h-7 rounded-lg bg-blue-900 hover:bg-blue-800 text-white font-bold flex items-center justify-center border border-blue-700"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ─── 占卜师 (Fortune Teller) 目标判定卡片 ───────────────────────── */}
          {roleId === "fortune_teller" &&
            selectedTargets.length === 2 &&
            !hasResult && (
              <div className="rounded-2xl border border-indigo-500/40 bg-indigo-950/40 backdrop-blur-xl p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🔮</span>
                  <h3 className="text-sm font-bold text-indigo-200">
                    占卜师查验判定（恶魔或红罗刹）
                  </h3>
                </div>
                <div className="bg-black/40 p-3 rounded-xl border border-indigo-500/20 text-xs space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">系统计算判定：</span>
                    <span className="font-bold text-indigo-300">
                      {fortuneTellerDetection?.reason}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-indigo-500/20">
                    <span className="text-slate-300 font-medium">
                      当前返回答案：
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setFortuneTellerCustomAnswer(!fortuneTellerCustomAnswer)
                      }
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all border ${
                        fortuneTellerCustomAnswer
                          ? "bg-red-600 border-red-400 text-white shadow-md"
                          : "bg-emerald-600 border-emerald-400 text-white shadow-md"
                      }`}
                    >
                      {fortuneTellerCustomAnswer
                        ? "【是】 (发现恶魔/红罗刹)"
                        : "【否】 (无恶魔/红罗刹)"}{" "}
                      ↺ 点击切换
                    </button>
                  </div>
                </div>
              </div>
            )}

          {/* ─── 镜像双子对立目标选择与提示同步 ───────────────────────────────── */}
          {roleId === "evil_twin" && !hasResult && (
            <div className="rounded-2xl border border-purple-500/40 bg-purple-950/40 backdrop-blur-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">👥</span>
                  <h3 className="text-base font-bold text-purple-200">
                    镜像双子对立绑定（说书人可换选）
                  </h3>
                </div>
                {currentGoodTwinSeat && (
                  <span className="px-2.5 py-0.5 rounded-full bg-purple-600/30 text-purple-300 text-xs font-bold border border-purple-400/40">
                    当前对立：{currentGoodTwinSeat.id + 1}号【
                    {currentGoodTwinSeat.role?.name || "未知"}】
                  </span>
                )}
              </div>
              <p className="text-xs text-purple-300/80 leading-relaxed">
                官方规则：由说书人指定一名善良玩家作为对立双子，两人互相得知对方角色。若善良双子被处决，邪恶阵营直接获胜。
              </p>

              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-300">
                  选择对立双子目标：
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {seats
                    .filter((s) => s.id !== seatId && !s.isDead)
                    .map((s) => {
                      const isSelected = evilTwinGoodId === s.id;
                      const isGood =
                        s.role?.type === "townsfolk" ||
                        s.role?.type === "outsider";
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setEvilTwinGoodId(s.id)}
                          className={`px-3 py-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                            isSelected
                              ? "bg-purple-600 border-purple-300 text-white shadow-lg shadow-purple-500/30 ring-2 ring-purple-400"
                              : "bg-slate-900/60 border-slate-700 text-slate-300 hover:border-slate-500"
                          }`}
                        >
                          <div className="truncate">
                            <span className="font-black text-sm mr-1.5">
                              {s.id + 1}号
                            </span>
                            <span className="text-xs text-slate-200 font-medium">
                              {s.role?.name || "未分配"}
                            </span>
                          </div>
                          {isGood && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 shrink-0 font-bold">
                              善良
                            </span>
                          )}
                        </button>
                      );
                    })}
                </div>
              </div>
            </div>
          )}

          {/* ─── 恶魔夜杀目标防护高亮（僧侣守护与士兵免疫）────────────────────── */}
          {demonTargetProtection && !hasResult && (
            <div className="rounded-2xl border border-amber-500/40 bg-amber-950/40 backdrop-blur-xl p-4 flex items-center gap-3">
              <span className="text-2xl">🛡️</span>
              <p className="text-xs font-bold text-amber-200 leading-relaxed">
                {demonTargetProtection.text}
              </p>
            </div>
          )}

          {/* ─── 信息类角色说书人微调控制面板（洗衣妇/图书管理员/调查员/厨师） ─── */}
          {isInfoRole && !hasResult && (
            <div className="rounded-2xl border border-indigo-500/30 bg-indigo-950/30 backdrop-blur-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🧙‍♂️</span>
                  <h3 className="text-sm font-bold text-indigo-200 uppercase tracking-wider">
                    说书人信息指定与微调
                  </h3>
                </div>
                <button
                  onClick={() => setShowOverride(!showOverride)}
                  className="text-xs px-3 py-1 rounded-lg bg-indigo-800/60 hover:bg-indigo-700/60 text-indigo-200 font-medium border border-indigo-500/30 transition-colors"
                >
                  {showOverride ? "收起微调面板" : "展开微调面板"}
                </button>
              </div>

              {/* 默认系统生成的预览信息 */}
              <div className="bg-black/40 rounded-xl p-3 border border-indigo-500/20">
                <span className="text-xs text-indigo-400 font-medium block mb-1">
                  当前将发送的信息：
                </span>
                <p className="text-base text-indigo-100 font-bold">
                  {roleId === "washerwoman" &&
                    `${customC1 + 1}号 和 ${customC2 + 1}号 之中有一位是【${customRoleName}】`}
                  {roleId === "librarian" &&
                    (librarianMode === "zero"
                      ? "场上没有外来者在场（0 外来者）"
                      : `${customC1 + 1}号 和 ${customC2 + 1}号 之中有一位是【${customRoleName}】`)}
                  {roleId === "investigator" &&
                    `${customC1 + 1}号 和 ${customC2 + 1}号 之中有一位是【${customRoleName}】`}
                  {roleId === "chef" && `场上有 ${chefCount} 对邻座的邪恶玩家`}
                </p>
              </div>

              {/* 微调表单 */}
              {showOverride && (
                <div className="space-y-4 pt-2 border-t border-indigo-500/20 text-sm">
                  {/* 图书管理员模式切换 */}
                  {roleId === "librarian" && (
                    <div className="flex items-center gap-3">
                      <span className="text-slate-300 font-medium">
                        模式选择:
                      </span>
                      <label className="flex items-center gap-1.5 text-slate-200 cursor-pointer">
                        <input
                          type="radio"
                          name="librarian_mode"
                          checked={librarianMode === "candidates"}
                          onChange={() => setLibrarianMode("candidates")}
                          className="text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>指定外来者对</span>
                      </label>
                      <label className="flex items-center gap-1.5 text-slate-200 cursor-pointer">
                        <input
                          type="radio"
                          name="librarian_mode"
                          checked={librarianMode === "zero"}
                          onChange={() => setLibrarianMode("zero")}
                          className="text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>宣告 0 外来者</span>
                      </label>
                    </div>
                  )}

                  {/* 候选人与角色选择（洗衣妇/图书管理员指定对/调查员） */}
                  {(roleId === "washerwoman" ||
                    roleId === "investigator" ||
                    (roleId === "librarian" &&
                      librarianMode === "candidates")) && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">
                          候选玩家 1
                        </label>
                        <select
                          value={customC1}
                          onChange={(e) => setCustomC1(Number(e.target.value))}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-medium focus:ring-1 focus:ring-indigo-500"
                        >
                          {seats.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.id + 1}号{" "}
                              {s.playerName ? `(${s.playerName})` : ""} -{" "}
                              {s.role?.name || "未知"}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">
                          候选玩家 2
                        </label>
                        <select
                          value={customC2}
                          onChange={(e) => setCustomC2(Number(e.target.value))}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-medium focus:ring-1 focus:ring-indigo-500"
                        >
                          {seats.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.id + 1}号{" "}
                              {s.playerName ? `(${s.playerName})` : ""} -{" "}
                              {s.role?.name || "未知"}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">
                          展示角色
                        </label>
                        <select
                          value={customRoleName}
                          onChange={(e) => setCustomRoleName(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-medium focus:ring-1 focus:ring-indigo-500"
                        >
                          {roleId === "washerwoman" &&
                            allTownsfolkRoles.map((r) => (
                              <option key={r.id} value={r.name}>
                                {r.name}
                              </option>
                            ))}
                          {roleId === "librarian" && (
                            <>
                              <option value="酒鬼">酒鬼 (真实标记)</option>
                              {allOutsiderRoles.map((r) => (
                                <option key={r.id} value={r.name}>
                                  {r.name}
                                </option>
                              ))}
                            </>
                          )}
                          {roleId === "investigator" &&
                            allMinionRoles.map((r) => (
                              <option key={r.id} value={r.name}>
                                {r.name}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {/* 厨师邪恶对数调整 */}
                  {roleId === "chef" && (
                    <div className="flex items-center gap-4">
                      <span className="text-slate-300 font-medium">
                        邪恶邻座对数:
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            setChefCount(Math.max(0, chefCount - 1))
                          }
                          className="w-8 h-8 rounded-lg bg-indigo-900 hover:bg-indigo-800 text-white font-bold flex items-center justify-center border border-indigo-700"
                        >
                          -
                        </button>
                        <span className="w-10 text-center text-xl font-bold text-amber-400">
                          {chefCount}
                        </span>
                        <button
                          onClick={() => setChefCount(chefCount + 1)}
                          className="w-8 h-8 rounded-lg bg-indigo-900 hover:bg-indigo-800 text-white font-bold flex items-center justify-center border border-indigo-700"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => {
                      if (defaultAutoInfo) {
                        const info = defaultAutoInfo as any;
                        if (typeof info.c1 === "number") setCustomC1(info.c1);
                        if (typeof info.c2 === "number") setCustomC2(info.c2);
                        if (typeof info.roleName === "string")
                          setCustomRoleName(info.roleName);
                        if (info.mode === "zero" || info.mode === "candidates")
                          setLibrarianMode(info.mode);
                        if (typeof info.count === "number")
                          setChefCount(info.count);
                      }
                    }}
                    className="text-xs text-indigo-400 hover:text-indigo-300 underline"
                  >
                    ↺ 恢复系统计算推荐
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ─── 恶魔夜杀镇长弹刀选择器 ─────────────────────────────────────── */}
          {isImpAttackingMayor && !hasResult && (
            <div className="rounded-2xl border border-red-500/40 bg-red-950/40 backdrop-blur-xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">👑</span>
                <h3 className="text-base font-bold text-red-200">
                  恶魔击中镇长：说书人弹刀选择器
                </h3>
              </div>
              <p className="text-xs text-red-300/80">
                官方规则：镇长在夜晚被恶魔杀害时，可由说书人决定由场上除镇长外的任意存活玩家代为死亡，或产生平安夜。
              </p>

              <div className="space-y-2">
                <label className="flex items-center gap-2 p-2.5 rounded-xl bg-black/40 border border-red-500/20 cursor-pointer hover:bg-black/60">
                  <input
                    type="radio"
                    name="mayor_choice"
                    checked={mayorChoice === "mayor_die"}
                    onChange={() => setMayorChoice("mayor_die")}
                    className="text-red-600 focus:ring-red-500"
                  />
                  <span className="text-sm font-bold text-slate-200">
                    ① 镇长承受攻击（镇长死亡）
                  </span>
                </label>

                <label className="flex items-center gap-2 p-2.5 rounded-xl bg-black/40 border border-red-500/20 cursor-pointer hover:bg-black/60">
                  <input
                    type="radio"
                    name="mayor_choice"
                    checked={mayorChoice === "bounce"}
                    onChange={() => setMayorChoice("bounce")}
                    className="text-red-600 focus:ring-red-500"
                  />
                  <div className="flex-1 flex items-center justify-between gap-3">
                    <span className="text-sm font-bold text-slate-200">
                      ② 弹刀给指定存活玩家
                    </span>
                    {mayorChoice === "bounce" && (
                      <select
                        value={mayorBounceTargetId}
                        onChange={(e) =>
                          setMayorBounceTargetId(Number(e.target.value))
                        }
                        className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white font-medium"
                      >
                        {seats
                          .filter((s) => !s.isDead && s.role?.id !== "mayor")
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.id + 1}号 - {s.role?.name || "未知"} (
                              {s.role?.type === "townsfolk"
                                ? "镇民"
                                : s.role?.type === "outsider"
                                  ? "外来者"
                                  : "邪恶"}
                              )
                            </option>
                          ))}
                      </select>
                    )}
                  </div>
                </label>

                <label className="flex items-center gap-2 p-2.5 rounded-xl bg-black/40 border border-red-500/20 cursor-pointer hover:bg-black/60">
                  <input
                    type="radio"
                    name="mayor_choice"
                    checked={mayorChoice === "immune"}
                    onChange={() => setMayorChoice("immune")}
                    className="text-red-600 focus:ring-red-500"
                  />
                  <span className="text-sm font-bold text-slate-200">
                    ③ 弹刀给免死/守护目标（平安夜）
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* ─── 小恶魔自杀传刀指定爪牙选择器 ───────────────────────────────── */}
          {isImpSuicide && !hasResult && (
            <div className="rounded-2xl border border-purple-500/40 bg-purple-950/40 backdrop-blur-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">😈</span>
                  <h3 className="text-base font-bold text-purple-200">
                    小恶魔自杀传刀：选择继任爪牙
                  </h3>
                </div>
                {aliveMinions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      const randomMinion =
                        aliveMinions[
                          Math.floor(Math.random() * aliveMinions.length)
                        ];
                      setSelectedSuccessorId(randomMinion.id);
                    }}
                    className="text-xs px-2.5 py-1 rounded bg-purple-900/60 hover:bg-purple-800 text-purple-200 border border-purple-500/30 transition-colors"
                  >
                    🎲 随机爪牙
                  </button>
                )}
              </div>
              <p className="text-xs text-purple-300/80">
                规则说明：小恶魔选择自杀不受人数限制，只要场上有存活爪牙即可传刀。若有红唇女郎，默认高亮推荐红唇女郎。由说书人点击指定继任爪牙。
              </p>

              {aliveMinions.length === 0 ? (
                <div className="p-3 rounded-xl bg-red-950/50 border border-red-700/50 text-red-300 text-xs font-bold">
                  ⚠️ 场上暂无存活爪牙！小恶魔自杀将直接导致恶魔死亡且无法传刀！
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {aliveMinions.map((m) => {
                    const isSelected = selectedSuccessorId === m.id;
                    const isSW = m.role?.id === "scarlet_woman";
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setSelectedSuccessorId(m.id)}
                        className={`relative p-3 rounded-xl border text-left transition-all ${
                          isSelected
                            ? "bg-purple-600 border-purple-300 text-white shadow-lg ring-2 ring-purple-400"
                            : isSW
                              ? "bg-red-950/50 border-red-500/50 text-red-100 hover:bg-red-900/50"
                              : "bg-black/40 border-purple-500/20 text-slate-300 hover:bg-black/60"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-black text-sm">
                            {m.id + 1}号
                          </span>
                          {isSW && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-800 text-red-100 font-bold border border-red-600 shadow-sm animate-pulse">
                              🌟 推荐 (红唇女郎)
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-bold opacity-90 mt-1">
                          {m.role?.name}
                        </p>
                        {isSelected && (
                          <div className="text-[10px] text-purple-200 mt-1 font-medium">
                            ✓ 已选为新恶魔
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 目标选择区（仅在无结果时展示）*/}
          {needsTargets && !hasResult && (
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-300 uppercase tracking-widest">
                  选择目标（{selectedTargets.length}/{targetLimit.max}）
                </h3>
                {roleId === "legion" && (
                  <span className="text-xs text-red-300 font-bold bg-red-950/80 px-2.5 py-1 rounded-lg border border-red-500/40">
                    🎲 由说书人独自决定
                  </span>
                )}
              </div>

              {roleId === "legion" && (
                <div className="mb-4 p-3.5 rounded-xl bg-red-950/50 border border-red-500/40 text-red-200 text-sm leading-relaxed font-medium">
                  😈 <strong>说书人指南</strong>
                  ：军团夜杀由说书人独自决定（夜晚军团不睁眼，由说书人决定选择哪一名玩家死亡，或空刀。建议优先击杀军团玩家以平衡至3人决赛圈）。
                </div>
              )}

              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                {seats.map((seat) => {
                  if (!seat.role) return null;
                  const isSelected = selectedTargets.includes(seat.id);
                  const isSelf =
                    !nightInfo.canSelectSelf &&
                    roleId !== "legion" &&
                    seat.id === seatId;
                  const isValid = nightInfo.validTargetIds
                    ? nightInfo.validTargetIds.includes(seat.id)
                    : true;

                  return (
                    <button
                      key={seat.id}
                      onClick={() => onToggleTarget(seat.id)}
                      disabled={isSelf || !isValid}
                      className={`relative px-2 py-3 rounded-xl text-center border transition-all duration-200 ${
                        isSelected
                          ? "bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-500/30 ring-2 ring-blue-400/50"
                          : seat.isDead
                            ? "bg-slate-900/40 border-slate-800 text-slate-600 line-through opacity-60"
                            : isSelf
                              ? "bg-slate-900/40 border-slate-700 text-slate-500 opacity-40"
                              : "bg-white/5 border-white/10 text-slate-200 hover:bg-white/10 hover:border-white/20"
                      }`}
                    >
                      <span className="text-lg font-bold block">
                        {seat.id + 1}号
                      </span>
                      {seat.role?.name && (
                        <span
                          className={`block text-xs font-bold truncate mt-0.5 ${
                            seat.role.type === "demon"
                              ? "text-red-400"
                              : seat.role.type === "minion"
                                ? "text-orange-400"
                                : seat.role.type === "outsider"
                                  ? "text-purple-400"
                                  : "text-blue-400"
                          }`}
                        >
                          {seat.role.name}
                        </span>
                      )}
                      {seat.isDead && (
                        <span className="block text-[10px] text-red-400 opacity-80 mt-0.5 truncate">
                          (已死亡)
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 操作按钮区 */}
          {!hasResult && (
            <div className="flex gap-4">
              <button
                onClick={onCancel}
                className="flex-1 py-4 rounded-xl bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 font-bold text-lg transition-colors border border-white/5"
              >
                跳过
              </button>
              <button
                onClick={handleConfirmWithOverrides}
                disabled={isConfirmDisabled}
                className={`flex-[2] py-4 rounded-xl font-bold text-lg transition-all ${
                  isConfirmDisabled
                    ? "bg-slate-700/30 text-slate-500 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/25 active:scale-[0.98]"
                }`}
              >
                确认执行
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

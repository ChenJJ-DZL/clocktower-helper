"use client";

/**
 * 说书人「信息微调」状态中心（单一事实来源）
 * ============================================================================
 * 为什么需要它：微调面板有**两个入口** ——
 *   1. components/game/NightActionPage.tsx 的说书人解锁视图（长按 1.5 秒解锁）；
 *   2. components/game/console/GameConsole.tsx 的常驻「信息微调」折叠区块。
 * 两处必须改**同一份状态**，否则默认值/说书人改动会不一致（旧实现只有入口 1）。
 *
 * 本 Provider 挂在 GameStageWithModals 上，同时包住 <GameStage/>（含 GameConsole）
 * 与 <NightActionPage/>，因此两个入口天然共享同一份 state。
 *
 * 注：这里存的一律是"说书人视角"的数据，只在说书人解锁视图/控制台里渲染；
 * 玩家视角下由 <StorytellerOnly> 做**条件渲染**（数据不进 DOM）。
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { roles, type Seat } from "../../../app/data";
import type { NightInfoResult } from "../../types/game";
import { isInformationRole } from "../../utils/informationRoles";
import { setStorytellerInfoOverrides } from "../../utils/corruptedInfo";

export interface StorytellerTuningState {
  showOverride: boolean;
  customC1: number;
  customC2: number;
  customRoleName: string;
  librarianMode: "candidates" | "zero";
  chefCount: number;
  empathCustomCount: number;
  fortuneTellerCustomAnswer: boolean;
  evilTwinGoodId: number | null;
  bountyHunterTargetId: number | null;
  mayorChoice: "mayor_die" | "bounce" | "immune";
  mayorBounceTargetId: number;
  selectedSuccessorId: number | null;
  /** 🌀 A1：说书人对疯子首夜假信息的覆盖（null = 用确定性生成的默认假信息） */
  lunaticFakeBluffNames: string[] | null;
  lunaticFakeMinionIds: number[] | null;
}

const INITIAL: StorytellerTuningState = {
  showOverride: false,
  customC1: 0,
  customC2: 1,
  customRoleName: "",
  librarianMode: "candidates",
  chefCount: 0,
  empathCustomCount: 0,
  fortuneTellerCustomAnswer: false,
  evilTwinGoodId: null,
  bountyHunterTargetId: null,
  mayorChoice: "bounce",
  mayorBounceTargetId: 0,
  selectedSuccessorId: null,
  lunaticFakeBluffNames: null,
  lunaticFakeMinionIds: null,
};

interface StorytellerTuningContextValue {
  state: StorytellerTuningState;
  patch: (p: Partial<StorytellerTuningState>) => void;
  reset: () => void;
  /** 当前行动者的**真实**角色 id/type（说书人视角；不是 playerFacingRole） */
  roleId: string;
  roleType: string;
  /** 玩家面/微调面板共用的派生量 */
  derived: {
    vortoxActive: boolean;
    allTownsfolkRoles: typeof roles;
    allOutsiderRoles: typeof roles;
    allMinionRoles: typeof roles;
    defaultAutoInfo: any;
    livingLeftNeighbor: Seat | null;
    livingRightNeighbor: Seat | null;
    empathEvilCount: number;
    defaultGoodTwinId: number | null;
    currentGoodTwinSeat: Seat | null;
    fortuneTellerDetection: {
      detected: boolean;
      reason: string;
    } | null;
    demonTargetProtection: { type: string; text: string } | null;
    isImpAttackingMayor: boolean;
    isImpSuicide: boolean;
    aliveMinions: Seat[];
    isInfoRole: boolean;
  };
  /** 组装确认时下发给引擎的说书人输入（与旧 NightActionPage 内联实现等价） */
  buildStorytellerInput: () => Record<string, any>;
}

const StorytellerTuningContext =
  createContext<StorytellerTuningContextValue | null>(null);

export interface StorytellerTuningProviderProps {
  nightInfo: NightInfoResult | null | undefined;
  seats: Seat[];
  selectedTargets?: number[];
  children: ReactNode;
}

export function StorytellerTuningProvider({
  nightInfo,
  seats,
  selectedTargets = [],
  children,
}: StorytellerTuningProviderProps) {
  const [state, setState] = useState<StorytellerTuningState>(INITIAL);
  const patch = (p: Partial<StorytellerTuningState>) =>
    setState((prev) => ({ ...prev, ...p }));
  const reset = () => setState(INITIAL);

  const roleId = nightInfo?.seat?.role?.id || "";
  const roleType = nightInfo?.seat?.role?.type || "unknown";
  const seatId = nightInfo?.seat?.id ?? 0;

  /**
   * 把说书人设定值同步给"受干扰假值校验层"（utils/corruptedInfo.ts）。
   * 结果文案在非 React 的能力管道出口生成，读不到 Context，因此这里单向推一份
   * 只读快照：受干扰时优先使用说书人设定值，否则用确定性假值。
   */
  useEffect(() => {
    const overrides: Record<string, unknown> = {};
    if (roleId === "chef") overrides.chef = state.chefCount;
    if (roleId === "empath") overrides.empath = state.empathCustomCount;
    if (roleId === "fortune_teller")
      overrides.fortune_teller = state.fortuneTellerCustomAnswer;
    if (
      roleId === "washerwoman" ||
      roleId === "librarian" ||
      roleId === "investigator"
    ) {
      overrides[roleId] = [state.customC1, state.customC2];
    }
    if (roleId === "bounty_hunter" && state.bountyHunterTargetId != null) {
      overrides.bounty_hunter = [state.bountyHunterTargetId];
    }
    setStorytellerInfoOverrides(overrides);
  }, [
    roleId,
    state.chefCount,
    state.empathCustomCount,
    state.fortuneTellerCustomAnswer,
    state.customC1,
    state.customC2,
    state.bountyHunterTargetId,
  ]);

  const vortoxActive = useMemo(() => {
    return seats.some(
      (s) => s.role?.id === "vortox" && !s.isDead && !s.isPoisoned && !s.isDrunk
    );
  }, [seats]);

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

  // ─── 自动推荐计算（洗衣妇 / 图书管理员 / 调查员 / 厨师 / 赏金猎人）─────────
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
      const isCorrupted =
        (vortoxActive && isInformationRole(roleId, roleType)) ||
        nightInfo?.isPoisoned;
      const outsiders = seats.filter(
        (s) =>
          s.id !== seatId &&
          (s.role?.type === "outsider" ||
            s.role?.id === "drunk" ||
            (s.role?.id === "spy" &&
              (s as any).registerAsGood !== false &&
              (s as any).registerAsEvil !== true))
      );
      if (isCorrupted && outsiders.length === 0) {
        const aliveOthers = seats.filter((s) => s.id !== seatId && !s.isDead);
        const c1 = aliveOthers[0]?.id ?? 0;
        const c2 = aliveOthers[1]?.id ?? 1;
        const fakeRole = allOutsiderRoles[0]?.name || "管家";
        return { mode: "candidates" as const, c1, c2, roleName: fakeRole };
      }
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
      if (vortoxActive) count = count === 0 ? 1 : 0;
      return { count };
    }
    if (roleId === "bounty_hunter") {
      const knownTargets: number[] =
        (nightInfo as any)?.snapshot?.bountyHunterKnownTargets ?? [];
      const aliveEvils = seats.filter(
        (s) =>
          s.id !== seatId &&
          !s.isDead &&
          s.role &&
          !knownTargets.includes(s.id) &&
          (s.role.type === "minion" ||
            s.role.type === "demon" ||
            s.isEvilConverted ||
            (s as any).alignment === "evil")
      );
      const aliveGoods = seats.filter(
        (s) =>
          s.id !== seatId &&
          !s.isDead &&
          s.role &&
          !s.isEvilConverted &&
          (s as any).alignment !== "evil" &&
          (s.role.type === "townsfolk" || s.role.type === "outsider")
      );
      const nonDemonEvils = aliveEvils.filter((s) => s.role?.type !== "demon");
      const priorityEvils =
        nonDemonEvils.length > 0 ? nonDemonEvils : aliveEvils;
      const targetPool =
        nightInfo?.isPoisoned && aliveGoods.length > 0
          ? aliveGoods
          : priorityEvils.length > 0
            ? priorityEvils
            : seats.filter((s) => s.id !== seatId && !s.isDead);
      const chosen = targetPool[0] ?? seats[0];
      return { bountyTargetId: chosen?.id ?? 0 };
    }
    return null;
  }, [roleId, roleType, seats, seatId, nightInfo, vortoxActive, allOutsiderRoles]);

  // ─── 共情者存活邻居与邪恶数 ──────────────────────────────────────────────
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
    const isEvilNeighbor = (n: Seat | null | undefined) => {
      if (!n) return false;
      const isRecluseEvil =
        n.role?.id === "recluse" && (n as any).registerAsEvil !== false;
      const isSpyEvil =
        n.role?.id === "spy" && (n as any).registerAsEvil === true;
      const isNormalEvil =
        (n.role?.type === "minion" || n.role?.type === "demon") &&
        !(
          n.role?.id === "spy" &&
          (n as any).registerAsGood !== false &&
          (n as any).registerAsEvil !== true
        );
      return isRecluseEvil || isSpyEvil || isNormalEvil;
    };
    if (isEvilNeighbor(livingLeftNeighbor)) count++;
    if (
      livingRightNeighbor &&
      livingRightNeighbor.id !== livingLeftNeighbor?.id &&
      isEvilNeighbor(livingRightNeighbor)
    ) {
      count++;
    }
    return count;
  }, [livingLeftNeighbor, livingRightNeighbor]);

  // ─── 镜像双子对立绑定 ────────────────────────────────────────────────────
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

  // ─── 占卜师判定 ──────────────────────────────────────────────────────────
  const fortuneTellerDetection = useMemo(() => {
    if (roleId !== "fortune_teller" || selectedTargets.length < 2) return null;
    const isDemonLike = (s: Seat | undefined) =>
      ((s?.role?.type === "demon" &&
        !(
          s?.role?.id === "spy" &&
          (s as any).registerAsGood !== false &&
          (s as any).registerAsEvil !== true
        )) ||
        s?.isDemonSuccessor ||
        (s?.role?.id === "recluse" &&
          (s as any).registerAsDemon !== false &&
          (s as any).registerAsEvil !== false) ||
        (s?.role?.id === "spy" && (s as any).registerAsDemon === true)) === true;
    const t1 = seats.find((s) => s.id === selectedTargets[0]);
    const t2 = seats.find((s) => s.id === selectedTargets[1]);
    const isDemon1 = isDemonLike(t1);
    const isDemon2 = isDemonLike(t2);
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

  // ─── 恶魔夜杀防护 / 镇长弹刀 / 小恶魔传刀 ────────────────────────────────
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
    if (isMonkProtected)
      return { type: "monk", text: "🛡️ 该目标受到僧侣神圣守护（将产生平安夜）" };
    if (isSoldierImmune)
      return {
        type: "soldier",
        text: "🛡️ 士兵被动免疫恶魔击杀（将产生平安夜）",
      };
    return null;
  }, [roleId, roleType, selectedTargets, seats]);

  const isImpAttackingMayor = useMemo(() => {
    if (roleId !== "imp" || selectedTargets.length === 0) return false;
    const target = seats.find((s) => s.id === selectedTargets[0]);
    return target?.role?.id === "mayor" && !target.isDead;
  }, [roleId, selectedTargets, seats]);

  const isImpSuicide = useMemo(
    () => roleId === "imp" && selectedTargets.includes(seatId),
    [roleId, selectedTargets, seatId]
  );

  const aliveMinions = useMemo(
    () =>
      seats.filter(
        (s) => !s.isDead && s.id !== seatId && s.role?.type === "minion"
      ),
    [seats, seatId]
  );

  // ─── 默认值同步（与旧 NightActionPage 的 useEffect 等价）─────────────────
  useEffect(() => {
    if (!defaultAutoInfo) return;
    const info = defaultAutoInfo as any;
    patch({
      ...(typeof info.c1 === "number" ? { customC1: info.c1 } : {}),
      ...(typeof info.c2 === "number" ? { customC2: info.c2 } : {}),
      ...(typeof info.roleName === "string"
        ? { customRoleName: info.roleName }
        : {}),
      ...(info.mode === "zero" || info.mode === "candidates"
        ? { librarianMode: info.mode }
        : {}),
      ...(typeof info.count === "number" ? { chefCount: info.count } : {}),
      ...(typeof info.bountyTargetId === "number"
        ? { bountyHunterTargetId: info.bountyTargetId }
        : {}),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultAutoInfo]);

  useEffect(() => {
    if (roleId !== "empath") return;
    let count = empathEvilCount;
    if (vortoxActive) count = count === 0 ? 1 : 0;
    patch({ empathCustomCount: count });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleId, empathEvilCount, vortoxActive]);

  useEffect(() => {
    if (fortuneTellerDetection) {
      const ans = vortoxActive
        ? !fortuneTellerDetection.detected
        : fortuneTellerDetection.detected;
      patch({ fortuneTellerCustomAnswer: ans });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fortuneTellerDetection, vortoxActive]);

  useEffect(() => {
    if (defaultGoodTwinId !== null) patch({ evilTwinGoodId: defaultGoodTwinId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultGoodTwinId]);

  useEffect(() => {
    const aliveOthers = seats.filter(
      (s) => !s.isDead && s.role?.id !== "mayor"
    );
    patch({ mayorBounceTargetId: aliveOthers[0]?.id ?? 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seats]);

  useEffect(() => {
    if (!isImpSuicide || aliveMinions.length === 0) return;
    const sw = aliveMinions.find((m) => m.role?.id === "scarlet_woman");
    patch({ selectedSuccessorId: sw?.id ?? aliveMinions[0]?.id ?? null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isImpSuicide, aliveMinions]);

  // ─── 座位上的疯子假信息覆盖（A1：只影响疯子所见）────────────────────────
  const lunaticSeat = useMemo(
    () => seats.find((s) => s.role?.id === "lunatic" && !s.isDead) ?? null,
    [seats]
  );
  useEffect(() => {
    if (!lunaticSeat) return;
    const bluffs = (lunaticSeat as any).lunaticFakeBluffNames;
    const minions = (lunaticSeat as any).lunaticFakeMinionIds;
    patch({
      lunaticFakeBluffNames: Array.isArray(bluffs) ? bluffs : null,
      lunaticFakeMinionIds: Array.isArray(minions) ? minions : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lunaticSeat?.id, (lunaticSeat as any)?.lunaticFakeBluffNames, (lunaticSeat as any)?.lunaticFakeMinionIds]);

  const currentGoodTwinSeat = useMemo(() => {
    if (roleId !== "evil_twin" || state.evilTwinGoodId === null) return null;
    return seats.find((s) => s.id === state.evilTwinGoodId) || null;
  }, [roleId, state.evilTwinGoodId, seats]);

  const isInfoRole = ["washerwoman", "librarian", "investigator", "chef"].includes(
    roleId
  );

  const buildStorytellerInput = () => {
    const storytellerInput: Record<string, any> = {};
    if (roleId === "washerwoman" || roleId === "investigator") {
      storytellerInput.candidateIds = [state.customC1, state.customC2];
      storytellerInput.shownRoleName = state.customRoleName;
    } else if (roleId === "librarian") {
      storytellerInput.mode = state.librarianMode;
      storytellerInput.candidateIds = [state.customC1, state.customC2];
      storytellerInput.shownRoleName = state.customRoleName;
    } else if (roleId === "chef") {
      storytellerInput.evilPairCount = state.chefCount;
    } else if (roleId === "empath") {
      storytellerInput.evilCount = state.empathCustomCount;
    } else if (roleId === "fortune_teller") {
      storytellerInput.fortuneAnswer = state.fortuneTellerCustomAnswer;
    } else if (roleId === "evil_twin") {
      storytellerInput.twinId = state.evilTwinGoodId;
    } else if (isImpAttackingMayor) {
      storytellerInput.mayorChoice = state.mayorChoice;
      storytellerInput.mayorBounceTargetId = state.mayorBounceTargetId;
    } else if (isImpSuicide) {
      storytellerInput.successorSeatId = state.selectedSuccessorId;
    } else if (roleId === "bounty_hunter") {
      storytellerInput.targetSeatId = state.bountyHunterTargetId;
      storytellerInput.targetId = state.bountyHunterTargetId;
    }
    return storytellerInput;
  };

  const value: StorytellerTuningContextValue = {
    state,
    patch,
    reset,
    roleId,
    roleType,
    derived: {
      vortoxActive,
      allTownsfolkRoles,
      allOutsiderRoles,
      allMinionRoles,
      defaultAutoInfo,
      livingLeftNeighbor,
      livingRightNeighbor,
      empathEvilCount,
      defaultGoodTwinId,
      currentGoodTwinSeat,
      fortuneTellerDetection,
      demonTargetProtection,
      isImpAttackingMayor,
      isImpSuicide,
      aliveMinions,
      isInfoRole,
    },
    buildStorytellerInput,
  };

  return (
    <StorytellerTuningContext.Provider value={value}>
      {children}
    </StorytellerTuningContext.Provider>
  );
}

/** 读取说书人微调状态中心；未包 Provider 时返回 null（调用方自行降级）。 */
export function useStorytellerTuning(): StorytellerTuningContextValue | null {
  return useContext(StorytellerTuningContext);
}

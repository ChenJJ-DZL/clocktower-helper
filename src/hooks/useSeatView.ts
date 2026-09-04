import type React from "react";
import { useMemo } from "react";
import type { Seat } from "@/app/data";
import type { NightInfoResult } from "@/src/types/game";

interface StatusItem {
  key: string;
  text: string;
  color: "red" | "green" | "yellow";
  icon?: React.ReactNode;
  duration?: string;
}

export function useSeatView(
  s: Seat,
  index: number,
  seats: Seat[],
  isPortrait: boolean,
  seatScale: number,
  nightInfo: NightInfoResult | null,
  _selectedActionTargets: number[],
  getSeatPosition: (
    index: number,
    total?: number,
    isPortrait?: boolean
  ) => { x: string; y: string },
  getDisplayRoleType: (seat: Seat) => string | null,
  typeColors: Record<string, string>
) {
  const p = getSeatPosition(index, seats.length, isPortrait);
  const displayType = getDisplayRoleType(s);
  const colorClass = s.isEvilConverted
    ? "border-red-600 text-red-400"
    : displayType
      ? typeColors[displayType]
      : "border-gray-600 text-gray-400";

  const realRole = s.role;
  // 提线木偶与酒鬼保底伪装：如果未显式指定 charadeRole，动态选择场上未出现的第一个镇民
  const fallbackTownsfolk = useMemo(() => {
    if (s.role?.id !== "drunk" && s.role?.id !== "marionette") return null;
    if (s.charadeRole) return s.charadeRole;
    const seatedRoleIds = new Set(
      seats.map((seat) => seat.role?.id).filter(Boolean)
    );
    const defaultTownsfolk = [
      { id: "monk", name: "僧侣", type: "townsfolk" },
      { id: "chef", name: "厨师", type: "townsfolk" },
      { id: "empath", name: "共情者", type: "townsfolk" },
      { id: "librarian", name: "图书管理员", type: "townsfolk" },
      { id: "fortune_teller", name: "占卜师", type: "townsfolk" },
      { id: "undertaker", name: "殓尸人", type: "townsfolk" },
      { id: "slayer", name: "猎手", type: "townsfolk" },
      { id: "virgin", name: "贞洁者", type: "townsfolk" },
      { id: "soldier", name: "士兵", type: "townsfolk" },
      { id: "mayor", name: "镇长", type: "townsfolk" },
      { id: "ravenkeeper", name: "守鸦人", type: "townsfolk" },
      { id: "washerwoman", name: "洗衣妇", type: "townsfolk" },
      { id: "investigator", name: "调查员", type: "townsfolk" },
      { id: "pixie", name: "小精灵", type: "townsfolk" },
      { id: "bounty_hunter", name: "赏金猎人", type: "townsfolk" },
      { id: "oracle", name: "神谕者", type: "townsfolk" },
      { id: "town_crier", name: "城镇公告员", type: "townsfolk" },
      { id: "juggler", name: "杂耍艺人", type: "townsfolk" },
      { id: "savant", name: "博学者", type: "townsfolk" },
      { id: "farmer", name: "农夫", type: "townsfolk" },
    ];
    return (
      defaultTownsfolk.find((tf) => !seatedRoleIds.has(tf.id)) ||
      defaultTownsfolk[0]
    );
  }, [s.role?.id, s.charadeRole, seats]);

  const displayRole =
    s.displayRole ||
    (s.role?.id === "drunk" || s.role?.id === "marionette"
      ? s.charadeRole || s.role
      : s.role);
  const isMasked = !!(
    realRole &&
    s.charadeRole &&
    realRole.id !== s.charadeRole.id
  );

  const roleName =
    s.isDemonSuccessor && realRole?.id === "imp"
      ? `${displayRole?.name || realRole?.name} (传)`
      : displayRole?.name || realRole?.name || "空";

  const statusList = useMemo(() => {
    const list: StatusItem[] = [];
    const processed = new Set<string>();

    // 1. 死亡状态
    if (s.isDead) {
      list.push({
        key: `dead-${s.id}`,
        text: "已死亡",
        color: "yellow",
        icon: "💀",
        duration: "永久",
      });
      processed.add("dead");
    }

    // 2. 受保护
    if (s.isProtected) {
      const protectionStatus = (s.statuses || []).find(
        (st) => st.effect === "ExecutionProof" || st.effect === "Protected"
      );
      list.push({
        key: `protected-${s.id}`,
        text: "受保护",
        color: "green",
        icon: "🛡️",
        duration: protectionStatus?.duration || "至天亮",
      });
      processed.add("protected");
    }

    // 3. 红罗剎
    if (s.isRedHerring) {
      list.push({
        key: `red_herring-${s.id}`,
        text: "天敌红罗剎",
        color: "yellow",
        icon: "🎯",
        duration: "永久",
      });
      processed.add("red_herring");
    }

    // 3.5 阵营转换（赏金猎人转邪恶等）
    if (s.isEvilConverted) {
      list.push({
        key: `evil_converted-${s.id}`,
        text: "转为邪恶",
        color: "red",
        icon: "😈",
        duration: "永久",
      });
      processed.add("evil_converted");
    }
    if (s.isGoodConverted) {
      list.push({
        key: `good_converted-${s.id}`,
        text: "转为善良",
        color: "green",
        icon: "🕊️",
        duration: "永久",
      });
      processed.add("good_converted");
    }

    // 4. Detailed statuses
    (s.statusDetails || []).forEach((st) => {
      if (st.includes("中毒") && !processed.has("poison")) {
        if (s.isDead && !st.includes("永久中毒") && !st.includes("舞蛇人中毒"))
          return;
        const poisonStatus = (s.statuses || []).find(
          (status) => status.effect === "Poison"
        );
        list.push({
          key: `poison-${s.id}`,
          text: "中毒",
          color: "red",
          icon: "☠️",
          duration:
            poisonStatus?.duration ||
            st.match(/（(.+?)清除）/)?.[1] ||
            "至下个黄昏",
        });
        processed.add("poison");
      }
      if (st.includes("致醉") && !processed.has("drunk")) {
        if (s.isDead) return;
        const drunkStatus = (s.statuses || []).find(
          (status) => status.effect === "Drunk"
        );
        list.push({
          key: `drunk-${s.id}`,
          text: "醉酒",
          color: "yellow",
          icon: "🍺",
          duration:
            drunkStatus?.duration ||
            st.match(/（(.+?)清除）/)?.[1] ||
            "至下个黄昏",
        });
        processed.add("drunk");
      }
    });

    // 5. Generic Poison/Drunk
    if (!s.isDead && s.isPoisoned && !processed.has("poison")) {
      const ps = (s.statuses || []).find((st) => st.effect === "Poison");
      list.push({
        key: "poison",
        text: "中毒",
        color: "red",
        icon: "☠️",
        duration: ps?.duration || "至下个黄昏",
      });
      processed.add("poison");
    }
    if (
      !s.isDead &&
      (s.role?.id === "drunk" || s.isDrunk) &&
      !processed.has("drunk")
    ) {
      const ds = (s.statuses || []).find((st) => st.effect === "Drunk");
      list.push({
        key: "drunk",
        text: "醉酒",
        color: "yellow",
        icon: "🍺",
        duration:
          ds?.duration || (s.role?.id === "drunk" ? "永久" : "至下个黄昏"),
      });
      processed.add("drunk");
    }

    // 5.5 疯子（Lunatic）：真实身份标记（仅说书人可见）
    if (
      !s.isDead &&
      s.role?.id === "lunatic" &&
      (s as any).apparentDemonRole &&
      !processed.has("lunatic")
    ) {
      const apparentName = (s as any).apparentDemonRole?.name ?? "恶魔";
      list.push({
        key: `lunatic-${s.id}`,
        text: `疯子(假${apparentName})`,
        color: "yellow",
        icon: "🌀",
        duration: "永久",
      });
      processed.add("lunatic");
    }

    // 6. Ability spent
    if (s.hasUsedSlayerAbility)
      list.push({
        key: `slayer_used-${s.id}`,
        text: "猎手已用",
        color: "red",
        icon: "🎯",
        duration: "永久",
      });
    if (s.hasUsedVirginAbility)
      list.push({
        key: `virgin_used-${s.id}`,
        text: "处女失效",
        color: "yellow",
        icon: "⛔",
        duration: "永久",
      });
    if (s.hasAbilityEvenDead)
      list.push({
        key: `ability_even_dead-${s.id}`,
        text: "死而有能",
        color: "yellow",
        icon: "👻",
        duration: "永久",
      });

    return list;
  }, [s]);

  const isValidTarget = useMemo(() => {
    if (!nightInfo) return true;

    // 如果有有效目标ID列表，且列表不为空，则只允许列表中的目标
    if (nightInfo.validTargetIds && nightInfo.validTargetIds.length > 0) {
      return nightInfo.validTargetIds.includes(s.id);
    }

    // 如果没有有效目标ID列表，或者列表为空，则检查是否需要选择目标
    // 如果targetLimit.max > 0，表示需要选择目标，则所有座位都是有效目标
    // 除非有特殊限制（如不能选择自己）
    if (nightInfo.targetLimit && nightInfo.targetLimit.max > 0) {
      // 检查是否可以选中自己
      if (s.id === nightInfo.seat.id && !nightInfo.canSelectSelf) {
        return false;
      }
      // 检查是否可以选中死亡玩家
      if (s.isDead && !nightInfo.canSelectDead) {
        return false;
      }
      return true;
    }

    // 默认情况下，所有座位都是有效目标
    return true;
  }, [nightInfo, s.id, s.isDead]);

  // 当前行动玩家强制高亮（覆盖 isValidTarget 的灰色效果）
  const isActivePlayer = nightInfo?.seat.id === s.id;
  const containerStyle = {
    left: `${p.x}%`,
    top: `${p.y}%`,
    transform: "translate(-50%,-50%)",
    width: `calc(${isPortrait ? "3rem" : "7rem"} * ${seatScale})`,
    height: `calc(${isPortrait ? "3rem" : "7rem"} * ${seatScale})`,
    WebkitUserSelect: "none",
    userSelect: "none",
    WebkitTouchCallout: "none",
    touchAction: "manipulation",
    WebkitTapHighlightColor: "transparent",
    opacity: isActivePlayer ? 1 : isValidTarget ? 1 : 0.3,
    filter: isActivePlayer
      ? "none"
      : isValidTarget
        ? "none"
        : "grayscale(100%)",
    pointerEvents: isValidTarget ? "auto" : "none",
  } as React.CSSProperties;

  return {
    p,
    displayType,
    colorClass,
    roleName,
    isMasked,
    statusList,
    isValidTarget,
    containerStyle,
    realRole,
    displayRole,
  };
}

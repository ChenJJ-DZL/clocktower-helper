/**
 * 《暗月初升》(Bad Moon Rising, BMR) 核心规则与特殊互动工具库
 *
 * 严格按照官方 Wiki 规则实现：
 * 1. 茶艺师 (Tea Lady)：两侧邻近存活玩家均为善良时，两人皆免死。
 * 2. 水手 (Sailor)：清醒健康时不会死亡（免疫恶魔击杀、处决、造谣者击杀等）。
 * 3. 弄臣 (Fool)：首次濒死时免死（无论夜间袭击还是白天处决；若被茶艺师/旅店老板保护则不消耗自身免死）。
 * 4. 魔鬼代言人 (Devil's Advocate)：被守护者次日免于处决死亡。
 * 5. 祖母 (Grandmother)：孙子死于恶魔袭击且祖母清醒时，祖母随之暴毙；若孙子死于处决或赌徒猜错或祖母醉酒，则祖母存活。
 * 6. 莽夫 (Goon)：每夜首个用能力选择莽夫的玩家立即醉酒，莽夫变为其阵营。
 * 7. 普卡 (Pukka)：每夜使一人中毒；上一夜中毒者当晚毒发身亡并解毒。
 */

import type { Seat } from "../../app/data";

/**
 * 判断玩家是否为善良阵营
 */
export function isGoodSeat(seat: Seat | undefined | null): boolean {
  if (!seat) return false;
  if ((seat as any).isEvilConverted === true) return false;
  if ((seat as any).alignment === "evil") return false;
  if ((seat as any).alignment === "good") return true;
  return seat.role?.type === "townsfolk" || seat.role?.type === "outsider";
}

/**
 * 判断玩家是否醉酒或中毒
 */
export function isDrunkOrPoisoned(seat: Seat | undefined | null): boolean {
  if (!seat) return false;
  if (seat.isDrunk || seat.isPoisoned) return true;
  const effects = seat.statusEffects ?? [];
  return effects.some(
    (e: any) => e.type === "drunk" || e.type === "poison" || e.type === "poisoned"
  );
}

/**
 * 判断玩家是否存活
 */
export function isAliveSeat(seat: Seat | undefined | null): boolean {
  if (!seat) return false;
  if ((seat as any).isAlive !== undefined) return (seat as any).isAlive;
  return !seat.isDead;
}

/**
 * 寻找指定座位的顺时针/逆时针最近存活邻居
 */
export function getAliveNeighbors(
  centerId: number,
  allSeats: Seat[]
): { left: Seat | null; right: Seat | null } {
  const n = allSeats.length;
  if (n < 3) return { left: null, right: null };

  const centerIndex = allSeats.findIndex((s) => s.id === centerId);
  if (centerIndex < 0) return { left: null, right: null };

  // 顺时针找第一个存活玩家
  let left: Seat | null = null;
  for (let i = 1; i < n; i++) {
    const s = allSeats[(centerIndex + i) % n];
    if (s && isAliveSeat(s)) {
      left = s;
      break;
    }
  }

  // 逆时针找第一个存活玩家
  let right: Seat | null = null;
  for (let i = 1; i < n; i++) {
    const s = allSeats[(centerIndex - i + n) % n];
    if (s && isAliveSeat(s)) {
      right = s;
      break;
    }
  }

  return { left, right };
}

/**
 * 判定目标玩家是否受到茶艺师的免死保护
 * 官方规则：若茶艺师存活且清醒，且茶艺师两侧最近存活邻居均为善良，则这两个邻居免于死亡。
 */
export function isProtectedByTeaLady(targetSeatId: number, allSeats: Seat[]): boolean {
  // 遍历所有茶艺师（通常只有一位）
  const teaLadies = allSeats.filter(
    (s) => s.role?.id === "tea_lady" && isAliveSeat(s)
  );

  for (const tl of teaLadies) {
    // 茶艺师若醉酒/中毒则失去保护能力
    if (isDrunkOrPoisoned(tl)) continue;

    const { left, right } = getAliveNeighbors(tl.id, allSeats);
    if (!left || !right) continue;

    // 两侧邻居都必须是善良玩家
    if (isGoodSeat(left) && isGoodSeat(right)) {
      if (targetSeatId === left.id || targetSeatId === right.id) {
        return true;
      }
    }
  }

  return false;
}

/**
 * 判定水手是否免死
 * 官方规则：水手清醒且健康时不会死亡。若醉酒或中毒，则可以死亡。
 */
export function isProtectedBySailor(seat: Seat | undefined | null): boolean {
  if (!seat || seat.role?.id !== "sailor") return false;
  if (!isAliveSeat(seat)) return false;
  return !isDrunkOrPoisoned(seat);
}

/**
 * 判定弄臣首次免死
 * 官方规则：弄臣清醒时，首次死亡免死。若已有其他保护（茶艺师/旅店老板），则不消耗弄臣的免死。
 */
export function canFoolSurvive(seat: Seat | undefined | null): boolean {
  if (!seat || seat.role?.id !== "fool") return false;
  if (!isAliveSeat(seat)) return false;
  if (isDrunkOrPoisoned(seat)) return false;
  const hasUsed =
    (seat as any).foolUsed === true ||
    (seat as any).hasUsedFoolAbility === true ||
    (seat as any).hasUsedAbility === true;
  return !hasUsed;
}

/**
 * 判定魔鬼代言人处决免死
 */
export function isProtectedByDevilsAdvocate(seat: Seat | undefined | null): boolean {
  if (!seat) return false;
  if ((seat as any).isExecutionProtected === true) return true;
  const effects = seat.statusEffects ?? [];
  return effects.some(
    (e: any) => e.type === "execution_protected" || e.source === "devils_advocate"
  );
}

/**
 * 祖母连锁死亡逻辑
 * 官方规则：如果恶魔杀死了孙子，且祖母未醉酒中毒，祖母一同死亡。
 * 若孙子死于处决、赌徒猜错、月之子诅咒等非恶魔击杀，祖母不死亡。
 */
export function checkGrandmotherDeath(
  killedSeatId: number,
  isDemonKill: boolean,
  seats: Seat[],
  nightCount: number
): { grandmotherDied: boolean; updatedSeats: Seat[] } {
  if (!isDemonKill) {
    return { grandmotherDied: false, updatedSeats: seats };
  }

  let grandmotherDied = false;
  const updatedSeats = seats.map((s) => {
    if (s.role?.id === "grandmother" && isAliveSeat(s)) {
      const grandsonId = (s as any).grandchildId;
      if (grandsonId === killedSeatId) {
        // 检查祖母是否清醒
        if (!isDrunkOrPoisoned(s)) {
          grandmotherDied = true;
          return {
            ...s,
            isAlive: false,
            isDead: true,
            diedAtNight: nightCount,
            killedBy: "grandmother_curse",
            deathSource: "grandmother_grandson_slain",
          };
        }
      }
    }
    return s;
  });

  return { grandmotherDied, updatedSeats };
}

/**
 * 莽夫互动逻辑
 * 官方规则：每个夜晚，首个使用其自身能力选择了莽夫的玩家会醉酒直到下个黄昏。莽夫转变阵营为与该玩家一致。
 */
export function handleGoonInteraction(
  chooserSeat: Seat,
  goonSeat: Seat,
  nightCount: number
): {
  chooserDrunk: boolean;
  newGoonAlignment: "good" | "evil";
  updatedSeats: Seat[];
} {
  const chooserIsEvil = !isGoodSeat(chooserSeat);
  const newAlignment: "good" | "evil" = chooserIsEvil ? "evil" : "good";

  // 给 chooser 添加醉酒
  const chooserEffects = [...(chooserSeat.statusEffects ?? [])];
  if (!chooserEffects.some((e: any) => e.type === "drunk" && e.source === "goon")) {
    chooserEffects.push({
      type: "drunk",
      source: "goon",
      sourceSeatId: goonSeat.id,
      duration: "黄昏",
    });
  }

  const updatedChooser: Seat = {
    ...chooserSeat,
    isDrunk: true,
    statusEffects: chooserEffects,
  };

  const updatedGoon: Seat = {
    ...goonSeat,
    isEvilConverted: chooserIsEvil,
    alignment: newAlignment,
  } as any;

  return {
    chooserDrunk: true,
    newGoonAlignment: newAlignment,
    updatedSeats: [updatedChooser, updatedGoon],
  };
}

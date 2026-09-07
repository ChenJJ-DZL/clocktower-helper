/**
 * 官方进阶/扩展角色专属规则与判定工具库
 * 涵盖：气球驾驶员 (Balloonist)、唱诗男孩 (Choirboy)、农夫 (Farmer)、政客 (Politician)、瘟疫医生 (Plague Doctor)、替罪羊 (Scapegoat)
 */
import type { Seat } from "../../app/data";

/**
 * 判断玩家是否存活
 */
export function isSeatAlive(seat: Seat | undefined | null): boolean {
  if (!seat) return false;
  return !seat.isDead;
}

/**
 * 判断玩家是否属于善良阵营（考虑伪装和阵营转变）
 */
export function isPlayerGood(seat: Seat | undefined | null): boolean {
  if (!seat) return false;
  // 间谍在作为善良阵营被检测或注册时
  if (seat.role?.id === "spy" && (seat as any).registerAsGood) return true;
  // 陌客在作为邪恶阵营被检测时
  if (seat.role?.id === "recluse" && (seat as any).registerAsEvil) return false;
  if (seat.isEvilConverted) return false;
  if (seat.isGoodConverted) return true;
  if ((seat as any).alignment === "evil") return false;
  if ((seat as any).alignment === "good") return true;
  const roleType = seat.role?.type;
  return roleType === "townsfolk" || roleType === "outsider";
}

/**
 * 获取玩家的标准角色类型（townsfolk / outsider / minion / demon / traveler）
 */
export function getPlayerRoleType(seat: Seat | undefined | null): string {
  if (!seat || !seat.role) return "unknown";
  return seat.role.type || "unknown";
}

// ─── 1. 气球驾驶员 (Balloonist) ──────────────────────────────────────────

/**
 * 气球驾驶员选人判定：
 * “每个夜晚，你会得知一名与上个夜晚得知的玩家角色类型不同的玩家。[+0~1外来者]”
 * 如果健康，且指定了上夜得知的角色类型，则必须选择一个角色类型不同于 lastRoleType 的玩家。
 */
export function getValidBalloonistTargets(
  seats: Seat[],
  lastRoleType: string | null | undefined,
  balloonistSeatId: number
): Seat[] {
  const aliveSeats = seats.filter((s) => isSeatAlive(s));
  if (!lastRoleType) {
    return aliveSeats;
  }
  const differentTypeSeats = aliveSeats.filter((s) => {
    const rType = getPlayerRoleType(s);
    return rType !== lastRoleType;
  });
  return differentTypeSeats.length > 0 ? differentTypeSeats : aliveSeats;
}

// ─── 2. 唱诗男孩 (Choirboy) ──────────────────────────────────────────────

/**
 * 唱诗男孩判定：
 * “如果恶魔杀死了国王，你会得知哪名玩家是恶魔。[+国王]”
 * 检查国王是否在当晚被恶魔杀死。
 */
export function checkChoirboyTrigger(
  seats: Seat[],
  killedTonightIds: number[],
  killerDemonSeatId?: number
): { triggered: boolean; demonSeatId: number | null } {
  const kingSeat = seats.find((s) => s.role?.id === "king");
  if (!kingSeat) {
    return { triggered: false, demonSeatId: null };
  }

  const kingKilledTonight = killedTonightIds.includes(kingSeat.id);
  if (!kingKilledTonight) {
    return { triggered: false, demonSeatId: null };
  }

  let demonSeat = killerDemonSeatId != null ? seats.find((s) => s.id === killerDemonSeatId) : null;
  if (!demonSeat) {
    demonSeat = seats.find((s) => s.role?.type === "demon" && isSeatAlive(s)) || null;
  }

  return {
    triggered: true,
    demonSeatId: demonSeat ? demonSeat.id : null,
  };
}

// ─── 3. 农夫 (Farmer) ──────────────────────────────────────────────────

/**
 * 农夫判定：
 * “当你在夜晚死亡时，一名存活的善良玩家会变成农夫。”
 * 寻找可转变为农夫的存活善良玩家（间谍若被当作善良也可选中，但保持其实际阵营）。
 */
export function getEligibleFarmerSuccessors(
  seats: Seat[],
  deadFarmerSeatId: number
): Seat[] {
  return seats.filter((s) => {
    if (!isSeatAlive(s) || s.id === deadFarmerSeatId) return false;
    if (s.role?.id === "spy" && (s as any).registerAsGood) return true;
    return isPlayerGood(s);
  });
}

// ─── 4. 政客 (Politician) ──────────────────────────────────────────────

/**
 * 政客终局判定：
 * “如果你是对你的阵营落败负最大责任的人，你转变阵营并获胜，即使你已死亡。”
 * 若说书人裁定政客负最大责任（mostResponsible === true），且游戏结束时政客未醉酒/未中毒，则政客转变阵营获胜。
 */
export function evaluatePoliticianEndgame(
  politicianSeat: Seat,
  gameWinner: "good" | "evil",
  isMostResponsibleForLoss: boolean
): { politicianWon: boolean; convertedAlignment: "good" | "evil" | null } {
  const isDrunkOrPoisoned =
    politicianSeat.isDrunk === true ||
    politicianSeat.isPoisoned === true ||
    (politicianSeat.statusEffects ?? []).some(
      (e) => e.type === "drunk" || e.type === "poisoned"
    );

  const originalIsGood = isPlayerGood(politicianSeat);
  const politicianTeam = originalIsGood ? "good" : "evil";

  if (politicianTeam === gameWinner) {
    return { politicianWon: true, convertedAlignment: null };
  }

  if (isMostResponsibleForLoss && !isDrunkOrPoisoned) {
    return {
      politicianWon: true,
      convertedAlignment: gameWinner,
    };
  }

  return { politicianWon: false, convertedAlignment: null };
}

// ─── 5. 瘟疫医生 (Plague Doctor) ────────────────────────────────────────

export interface StorytellerMinionAbility {
  roleId: string;
  source: "plague_doctor";
  acquiredAtPhase: string;
}

export function grantStorytellerMinionAbility(
  currentAbilities: StorytellerMinionAbility[] | undefined,
  minionRoleId: string,
  phase: string
): StorytellerMinionAbility[] {
  const list = currentAbilities ? [...currentAbilities] : [];
  list.push({
    roleId: minionRoleId,
    source: "plague_doctor",
    acquiredAtPhase: phase,
  });
  return list;
}

// ─── 6. 替罪羊 (Scapegoat) ──────────────────────────────────────────────

/**
 * 替罪羊判定：
 * “如果你的阵营的一名玩家被处决，你可能会代替他被处决。”
 * 如果被处决者与替罪羊同阵营（考虑间谍/陌客伪装），说书人可裁定替罪羊代替处决并死亡。
 */
export function canScapegoatSubstitute(
  scapegoatSeat: Seat,
  nominatedSeat: Seat
): boolean {
  if (!isSeatAlive(scapegoatSeat)) return false;
  const scapegoatGood = isPlayerGood(scapegoatSeat);
  const nominatedGood = isPlayerGood(nominatedSeat);
  return scapegoatGood === nominatedGood;
}

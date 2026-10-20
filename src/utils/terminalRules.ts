/**
 * 🏁 终局判据（第二版）：通用四条 + 专属胜利
 * ======================================================================
 * 第一版只认通用四条 ⇒ 真实结果里「圣徒被处决」「涡流平安日」「利维坦」
 * 这类**剧本/角色专属即时胜利**被误判成「终局没有依据」。
 * 实测：9 剧本矩阵 90001（暗流涌动，圣徒被处决）与 90008（游园惊梦，
 * 剧本固定天数自动获胜）双双报红 —— 那是判据太窄，不是游戏错了。
 *
 * 处理方式：专属胜利必须**有可读的胜因文案**（终局 UI「胜利依据」），
 * 且必须命中下列官方判因之一；拿不出胜因 ⇒ 仍然报红。
 */

export interface TerminalSeatLike {
  id: number;
  isDead?: boolean | null;
  role?: { id?: string | null; type?: string | null } | null;
  /** 扁平表示（部分快照只有 roleType） */
  roleType?: string | null;
}

export interface TerminalCheckInput {
  seats: readonly TerminalSeatLike[];
  /** UI 显示的胜方 */
  winner: "good" | "evil" | null;
  /** 终局 UI「胜利依据」文案（专属胜利必须靠它自证） */
  winReason?: string | null;
}

export interface TerminalCheckResult {
  ok: boolean;
  /** 按官方四条**独立算出**的胜方；null = 四条不适用（可能是专属胜利） */
  expected: "good" | "evil" | null;
  /** 是否由「剧本/角色专属规则」结算 */
  special: boolean;
  demonAlive: boolean;
  aliveCount: number;
  reason: string;
}

/**
 * 官方「即时胜利/失败」判因（来自 `app/gameLogic.ts` 的全部 reason 字面量）。
 * 这些可以在「恶魔仍存活且存活人数 > 2」时合法终局。
 */
const SPECIAL_WIN_PATTERNS: RegExp[] = [
  /落难少女/, // 爪牙猜中落难少女
  /呆瓜/, // 呆瓜误判
  /圣徒/, // 圣徒被处决
  /地精/, // 地精被处决
  /双子/, // 善良双子被处决
  /涡流/, // 涡流：今日无人被处决
  /利维坦/, // 利维坦：多次善良处决 / 第五个白天
  /恐惧之灵/, // 选定目标被处决
  /无神论者/, // 说书人被处决
  /军团/, // 军团存活阈值
  /所有玩家均已死亡/, // 全灭
  /自动获胜/, // 剧本级固定天数
  /和平获胜/, // 镇长 3 人平安日
  /猎手/, // 猎手击杀恶魔
];

const typeOf = (s: TerminalSeatLike): string | null =>
  s.role?.type ?? s.roleType ?? null;

/** 旅行者与传奇不计入「存活人数」阈值（官方括注） */
function countsForThreshold(s: TerminalSeatLike): boolean {
  const t = typeOf(s);
  return t !== "traveler" && t !== "fabled";
}

export function verifyTerminalOutcome(
  input: TerminalCheckInput
): TerminalCheckResult {
  const seats = input.seats ?? [];
  const alive = seats.filter((s) => s.isDead !== true);
  const aliveCountable = alive.filter(countsForThreshold);
  const demonAlive = alive.some((s) => typeOf(s) === "demon");

  const goodWouldWin = !demonAlive;
  const evilWouldWin = aliveCountable.length <= 2;

  // ③ 双方同时达成 ⇒ 善良优先
  const expected: "good" | "evil" | null = goodWouldWin
    ? "good"
    : evilWouldWin
      ? "evil"
      : null;

  if (expected === null) {
    const why = (input.winReason ?? "").trim();
    const specialHit = SPECIAL_WIN_PATTERNS.find((re) => re.test(why));
    if (specialHit && input.winner !== null) {
      return {
        ok: true,
        expected: null,
        special: true,
        demonAlive,
        aliveCount: aliveCountable.length,
        reason: `由专属规则结算（胜因：${why}）`,
      };
    }
    return {
      ok: false,
      expected: null,
      special: false,
      demonAlive,
      aliveCount: aliveCountable.length,
      reason:
        `终局时通用四条**都不成立**（恶魔${demonAlive ? "仍存活" : "已死"}、` +
        `可计存活 ${aliveCountable.length} 人），且没有可读的专属胜因` +
        `（当前胜因：${why || "空"}）⇒ 这个终局判定没有依据`,
    };
  }

  if (input.winner === null) {
    return {
      ok: false,
      expected,
      special: false,
      demonAlive,
      aliveCount: aliveCountable.length,
      reason: `按官方规则应判 ${expected}，但 UI 没有可读的胜方`,
    };
  }

  if (input.winner !== expected) {
    return {
      ok: false,
      expected,
      special: false,
      demonAlive,
      aliveCount: aliveCountable.length,
      reason:
        `胜方判反：UI 显示 ${input.winner}，按官方应为 ${expected}` +
        `（恶魔${demonAlive ? "存活" : "已死"}、可计存活 ${aliveCountable.length} 人）`,
    };
  }

  return {
    ok: true,
    expected,
    special: false,
    demonAlive,
    aliveCount: aliveCountable.length,
    reason: `与官方四条一致（${expected}）`,
  };
}

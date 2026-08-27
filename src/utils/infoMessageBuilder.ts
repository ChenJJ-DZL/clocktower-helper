/**
 * 信息角色 guide 文案生成器（解决"信息弹窗 0 次"P1）
 *
 * 根因：非 TB 剧本的信息角色（卖花女孩/女裁缝/数学家等）在 roles 注册表的
 * dialog 是占位实现（instruction="请执行行动"），guide 无"告诉他…"信息文案
 * → 结算弹窗从 guide 提取失败 → 无弹窗。
 *
 * 本工具为"无目标信息角色"提供预计算信息文案（与 TB 洗衣妇 dialog 同模式）：
 * 在 dialog 生成时按当前状态计算信息。有目标角色（女裁缝/筑梦师等）的信息
 * 在选择后由新引擎结算弹窗给出，此处仅生成引导文案。
 */
import type { Seat } from "../../app/data";
import type { NightActionContext } from "../types/roleDefinition";

/** 判定座位是否邪恶（与 gameRules.isEvil 语义一致） */
function seatIsEvil(seat: Seat | undefined): boolean {
  if (!seat?.role) return false;
  if ((seat as any).isGoodConverted) return false;
  return (
    (seat as any).isEvilConverted === true ||
    seat.role.type === "demon" ||
    seat.role.type === "minion" ||
    (seat as any).isDemonSuccessor === true
  );
}

/** 恶魔与最近爪牙的邻座距离（钟表匠；无爪牙返回 null） */
function demonMinionDistance(seats: Seat[]): number | null {
  const demons = seats.filter((s) => !s.isDead && s.role?.type === "demon");
  const minions = seats.filter((s) => !s.isDead && s.role?.type === "minion");
  if (demons.length === 0 || minions.length === 0) return null;
  let best: number | null = null;
  for (const d of demons) {
    for (const m of minions) {
      const dist = Math.abs(d.id - m.id);
      if (best === null || dist < best) best = dist;
    }
  }
  return best;
}

/**
 * 生成信息角色的"告诉他…"文案
 * @returns 信息文案；无信息/不需要时返回 null（由调用方决定回退）
 */
export function buildInfoMessage(
  roleId: string,
  ctx: Partial<NightActionContext> & {
    seats: Seat[];
    selfId: number;
    nightCount: number;
    demonVotedToday?: boolean;
    minionNominatedToday?: boolean;
    executedToday?: number | null;
    deadThisNight?: number[];
    isPoisoned?: boolean;
    shouldShowFake?: boolean;
  }
): string | null {
  const { seats, demonVotedToday, minionNominatedToday } = ctx;

  switch (roleId) {
    case "flowergirl":
      return `告诉他：恶魔今天${demonVotedToday ? "投过票" : "没有投票"}。`;
    case "town_crier":
      return `告诉他：今天${minionNominatedToday ? "有人提名过爪牙" : "没有人提名过爪牙"}。`;
    case "mathematician":
      return `告诉他：今晚有 ${(ctx as any).anomalyCount ?? 0} 名玩家的能力异常生效。`;
    case "oracle": {
      const evilDead = seats.filter((s) => s.isDead && seatIsEvil(s)).length;
      return `告诉他：死亡玩家中有 ${evilDead} 名邪恶阵营。`;
    }
    case "clockmaker": {
      const dist = demonMinionDistance(seats);
      return dist === null
        ? "告诉他：场上没有恶魔或爪牙（无距离信息）。"
        : `告诉他：恶魔与最近爪牙的距离是 ${dist}。`;
    }
    case "sage":
      return `告诉他：今晚${(ctx.deadThisNight ?? []).length > 0 ? "有恶魔死亡" : "没有恶魔死亡"}。`;
    case "banshee":
      return `告诉他：${(ctx.deadThisNight ?? []).length > 0 ? "今晚有人死亡" : "今晚无人死亡"}。`;
    default:
      return null;
  }
}

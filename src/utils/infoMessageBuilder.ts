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
import { computeIsPoisoned } from "./gameRules";
import { createDeterministicRandom, nightInfoSeed } from "../roles/core/deterministicRandom";
import { pickFakeDeadEvilCount } from "../roles/new_engine/oracle.ability";

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
    vortoxWorld?: boolean;
    isVortoxWorld?: boolean;
  }
): string | null {
  const { seats, demonVotedToday, minionNominatedToday } = ctx;

  /**
   * 🎲 确定性随机：与「结算」路径（如 oracle.ability.ts）共用同一枚种子。
   *
   * 必须与引擎侧保持**完全一致**的种子格式，否则会出现
   * 提示预演说"4"、结果弹窗说"3"的错位（说书人照提示念 → 开局即错）。
   * 见 roles/core/deterministicRandom.ts 顶部的成因说明。
   */
  const rng = createDeterministicRandom(
    nightInfoSeed(roleId, ctx.selfId, ctx.nightCount ?? 0)
  );

  const selfSeat = seats.find((s) => s.id === ctx.selfId);
  const isTownsfolk =
    selfSeat?.role?.type === "townsfolk" ||
    (selfSeat?.role?.id === "drunk" && selfSeat?.charadeRole?.type === "townsfolk") ||
    (selfSeat?.role?.id === "marionette" && selfSeat?.charadeRole?.type === "townsfolk");
  const hasAliveVortox =
    Boolean(ctx.vortoxWorld) ||
    Boolean(ctx.isVortoxWorld) ||
    seats.some((s) => s.role?.id === "vortox" && !s.isDead);

  /**
   * 🎭 提线木偶（Marionette）→ 与酒鬼同款「视同醉酒」。
   *
   * 官方原文（officialRoleDocs「提线木偶」运作方式）：
   *   「将提线木偶以为的那个角色**视同醉酒一样来运作**。他会在他以为的那个
   *     善良角色的时机被唤醒，**可能获得错误信息**。」
   * ⇒ 提线木偶伪装成信息类镇民时，必须给假信息。
   *   它与酒鬼一样**不会**被设 isDrunk / isPoisoned 布尔位
   *   （否则会连带被 validateAbilityUsage 判为"醉酒不可行动"，语义反了）。
   */
  const isMarionetteDisguisedTownsfolk =
    selfSeat?.role?.id === "marionette" &&
    selfSeat?.charadeRole?.type === "townsfolk";

  /**
   * 🍺 酒鬼（Drunk）→ 官方「视同醉酒」：拿到的信息一律为错误信息。
   *
   * ⚠️ 2026-09-13 修复（矩阵实测发现）：本处此前**只查 `selfSeat.isDrunk` 布尔位**，
   *   而酒鬼在数据里有两种表达：
   *     · `role.id === "drunk"` + `charadeRole`（以为自己是某镇民）
   *     · 座位上带 `statusEffects: [{ type: "drunk", permanent: true }]`
   *       （由 drunk.ability.ts:301 在**设置阶段**写入）
   *   两者任一出现都应判为受干扰；只信布尔位会在两种情况下都漏检。
   *   实测症状：城镇公告员处于「酒鬼伪装」时给出**真值**
   *   （与常态同为「没有人提名过爪牙」），而中毒 / 提线木偶 / 涡流三态都正确给了假值。
   *   ⇒ 与提线木偶同款判定补上，二者语义完全对称（都"视同醉酒"）。
   */
  const isDrunkStatusEffect =
    (selfSeat as any)?.statusEffects?.some(
      (e: any) => e?.type === "drunk"
    ) === true;
  const isDrunkDisguisedTownsfolk =
    (selfSeat?.role?.id === "drunk" &&
      selfSeat?.charadeRole?.type === "townsfolk") ||
    isDrunkStatusEffect;

  /**
   * ☠️ 中毒判定必须走 computeIsPoisoned（覆盖 statusEffects / 毒标记 / 光环
   * 等所有来源），而不是只看 seat.isPoisoned 布尔位。
   * 官方「中毒」：中毒玩家的获取信息类能力会产生错误信息。
   */
  const isPoisonedBySources =
    Boolean(selfSeat) &&
    (computeIsPoisoned(selfSeat as unknown as Seat) ||
      (selfSeat as any)?.statusEffects?.some(
        (e: any) => e?.type === "poisoned" || e?.type === "poison"
      ) === true);

  const isCorrupted = Boolean(
    ctx.shouldShowFake ||
    ctx.isPoisoned ||
    isPoisonedBySources ||
    selfSeat?.isPoisoned ||
    selfSeat?.isDrunk ||
    isDrunkDisguisedTownsfolk ||
    isMarionetteDisguisedTownsfolk ||
    (isTownsfolk && hasAliveVortox)
  );

  switch (roleId) {
    case "flowergirl": {
      const realVal = Boolean(demonVotedToday);
      const displayVal = isCorrupted ? !realVal : realVal;
      return `告诉他：恶魔今天${displayVal ? "投过票" : "没有投票"}。`;
    }
    case "town_crier": {
      const realVal = Boolean(minionNominatedToday);
      const displayVal = isCorrupted ? !realVal : realVal;
      return `告诉他：今天${displayVal ? "有人提名过爪牙" : "没有人提名过爪牙"}。`;
    }
    case "mathematician": {
      const realCount = Number((ctx as any).anomalyCount ?? 0);
      let displayCount = realCount;
      if (isCorrupted) {
        const fakeCandidates = [0, 1, 2, 3].filter((n) => n !== realCount);
        displayCount =
          fakeCandidates[Math.floor(rng() * fakeCandidates.length)] ??
          (realCount === 0 ? 1 : 0);
      }
      return `告诉他：今晚有 ${displayCount} 名玩家的能力异常生效。`;
    }
    case "oracle": {
      const evilDead = seats.filter((s) => s.isDead && seatIsEvil(s)).length;
      // 🎯 与引擎结算共用同一个「假数字」实现与同一枚种子，
      //    保证「提示预演」与「结果弹窗」数字完全一致。
      const displayEvilDead = isCorrupted
        ? pickFakeDeadEvilCount(evilDead, seats.length, rng)
        : evilDead;
      return `告诉他：死亡玩家中有 ${displayEvilDead} 名邪恶阵营。`;
    }
    case "clockmaker": {
      const dist = demonMinionDistance(seats);
      if (dist === null) {
        return "告诉他：场上没有恶魔或爪牙（无距离信息）。";
      }
      let displayDist = dist;
      if (isCorrupted) {
        const fakeCandidates = [1, 2, 3, 4, 5].filter((d) => d !== dist);
        displayDist =
          fakeCandidates[Math.floor(rng() * fakeCandidates.length)] ??
          ((dist % 5) + 1);
      }
      return `告诉他：恶魔与最近爪牙的距离是 ${displayDist}。`;
    }
    case "sage": {
      const realHasDead = (ctx.deadThisNight ?? []).length > 0;
      const displayHasDead = isCorrupted ? !realHasDead : realHasDead;
      return `告诉他：今晚${displayHasDead ? "有恶魔死亡" : "没有恶魔死亡"}。`;
    }
    case "banshee": {
      const realHasDead = (ctx.deadThisNight ?? []).length > 0;
      const displayHasDead = isCorrupted ? !realHasDead : realHasDead;
      return `告诉他：${displayHasDead ? "今晚有人死亡" : "今晚无人死亡"}。`;
    }
    default:
      return null;
  }
}

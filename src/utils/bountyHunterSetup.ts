/**
 * 赏金猎人的「设置调整」：把一名镇民转为邪恶阵营。
 *
 * ## 官方依据（src/data/poppyganda_official_extras.json · 赏金猎人）
 * - 角色能力：「在你的首个夜晚，你会得知一名邪恶玩家。每当你得知的玩家死亡，
 *   你会在当晚得知另一名邪恶玩家。**[会有一名镇民转变为邪恶阵营]**」
 * - 规则细节：「被赏金猎人转变的玩家**从一开始就已经属于邪恶阵营**…
 *   尽管赏金猎人还未被唤醒。」
 * - 范例1：「设置调整阶段，说书人**决定**小黑成为邪恶的茶艺师。」
 * - 范例3：「小兰是以为自己是赏金猎人的**酒鬼**。**由于赏金猎人不在场，
 *   没有镇民被转变为邪恶阵营。**」——所以判定必须看"真实角色卡"，
 *   酒鬼 / 提线木偶"以为自己是谁"一律不触发。
 *
 * ## 首夜「告知」步骤
 * 官方《规则细节》：「…并且你作为说书人应当在给出其他夜晚信息之前谨记这回事。」
 * 与「应该在首个夜晚立即告知他是邪恶的」→ 首夜队列里**必须**有一个"阵营告知"步骤
 * （见 src/utils/nightStepIds.ts 的 EVIL_CONVERTED_NOTICE_ID），排在其他夜间信息之前，
 * 行动者 = 被转变的那名镇民。
 *
 * ## 实现口径
 * - 被转换者的**角色牌一律不变**（官方：只是把角色标记"倒转放置"）：
 *   role.id / role.name / role.type 保持原样。
 * - 只改三样：isEvilConverted = true、alignment = "evil"、状态明细加「转为邪恶」。
 * - 转为邪恶者不能再是占卜师的红罗刹（官方：红罗刹必须是善良玩家）→ 顺手剥离。
 * - **幂等**：场上已存在被转换者时不再转换（重复进入开局流程不会叠加）。
 * - 挑选采用**确定性随机**：同一套阵容恒定转同一名镇民（便于复现与回归测试），
 *   阵容变化时结果随之变化。
 */
import { createDeterministicRandom } from "../roles/core/deterministicRandom";

/** 与 Seat 结构兼容的最小形状（便于纯函数测试） */
export interface BountyHunterSeatLike {
  id: number;
  role?: {
    id?: string | null;
    name?: string | null;
    type?: string | null;
  } | null;
  charadeRole?: { id?: string | null } | null;
  apparentDemonRole?: { id?: string | null } | null;
  isEvilConverted?: boolean;
  alignment?: string | null;
  isRedHerring?: boolean;
  isFortuneTellerRedHerring?: boolean;
  statusDetails?: string[] | null;
  /** 赏金猎人座位上记录的"被我转成邪恶的那名镇民" */
  bountyHunterEvilConvertedId?: number | null;
}

/** 状态明细：转换标记。各处（日志/UI）统一用它，避免字符串各写一份 */
export const EVIL_CONVERTED_DETAIL = "转为邪恶";
/** 状态明细：占卜师红罗刹（转邪恶时必须剥离） */
export const FORTUNE_TELLER_RED_HERRING_DETAIL = "天敌红罗剎";

/**
 * 该座位是否为**真实**的赏金猎人。
 *
 * 只看真实角色卡 —— 酒鬼 / 提线木偶的 charadeRole、疯子的 apparentDemonRole
 * 都是"他以为自己是谁"，不构成赏金猎人在场（官方范例 3）。
 */
export function isRealBountyHunterSeat(
  seat: BountyHunterSeatLike | null | undefined
): boolean {
  return seat?.role?.id === "bounty_hunter";
}

/**
 * 执行设置调整：把一名镇民转为邪恶阵营。
 *
 * @returns 处理后的座位数组副本，以及被转换者的 seatId（未转换则为 null）
 */
export function applyBountyHunterEvilConversion<T extends BountyHunterSeatLike>(
  seats: readonly T[]
): { seats: T[]; convertedSeatId: number | null } {
  const unchanged = { seats: [...seats], convertedSeatId: null as number | null };

  const hunter = seats.find((s) => isRealBountyHunterSeat(s));
  if (!hunter) return unchanged;

  // 幂等：已有被转换者（含上一轮开局流程已转换过的）就不再转换
  if (seats.some((s) => s.isEvilConverted)) return unchanged;

  // 候选 = 除赏金猎人自己以外的镇民（赏金猎人本人也是镇民，必须排除）
  const candidates = seats.filter(
    (s) => s.id !== hunter.id && s.role?.type === "townsfolk"
  );
  if (candidates.length === 0) return unchanged;

  const seed = `bounty_hunter_setup|${candidates
    .map((c) => `${c.id}:${c.role?.id ?? "?"}`)
    .join("-")}`;
  const rng = createDeterministicRandom(seed);
  const target = candidates[Math.floor(rng() * candidates.length)];

  const next = seats.map((s) => {
    // 赏金猎人座位上记录被转换者（原有行为，勿丢）
    if (s.id === hunter.id) {
      return { ...s, bountyHunterEvilConvertedId: target.id } as T;
    }
    if (s.id !== target.id) return s;
    const details = (s.statusDetails || []).filter(
      (d) => d !== FORTUNE_TELLER_RED_HERRING_DETAIL
    );
    return {
      ...s,
      // 角色牌（id/name/type）保持不变：官方只是把标记倒转放置
      isEvilConverted: true,
      alignment: "evil",
      isRedHerring: false,
      isFortuneTellerRedHerring: false,
      statusDetails: details.includes(EVIL_CONVERTED_DETAIL)
        ? details
        : [...details, EVIL_CONVERTED_DETAIL],
    } as T;
  });

  return { seats: next, convertedSeatId: target.id };
}

/**
 * 说书人手动改选「哪名镇民实际属于邪恶阵营」（座位右击菜单「变为邪恶」）。
 *
 * 语义：**全局最多一名** —— 选中新的那名的同时，自动把其他被转换者清回正常
 * （即"最后选择生效"），手动选择会覆盖开局自动挑的那名。
 * 仅镇民可被指定（官方：被赏金猎人转变的是镇民）；角色牌本身一律不变。
 */
export function selectEvilConvertedSeat<T extends BountyHunterSeatLike>(
  seats: readonly T[],
  targetSeatId: number
): T[] {
  return seats.map((s) => {
    // 赏金猎人座位上记录的「被我转成邪恶的那名镇民」要跟着改选同步更新，
    // 否则魔典/复盘读到的仍是开局自动挑的那个（与手动改选结果不一致）。
    if (isRealBountyHunterSeat(s) && s.id !== targetSeatId) {
      return { ...s, bountyHunterEvilConvertedId: targetSeatId } as T;
    }
    if (s.id === targetSeatId) {
      const details = (s.statusDetails || []).filter(
        (d) => d !== FORTUNE_TELLER_RED_HERRING_DETAIL
      );
      return {
        ...s,
        isEvilConverted: true,
        alignment: "evil",
        // 转为邪恶者不能再是占卜师红罗刹（红罗刹必须是善良玩家）
        isRedHerring: false,
        isFortuneTellerRedHerring: false,
        statusDetails: details.includes(EVIL_CONVERTED_DETAIL)
          ? details
          : [...details, EVIL_CONVERTED_DETAIL],
      } as T;
    }
    if (s.isEvilConverted) {
      // 最后选择生效：其余被转换者一律恢复为正常（阵营按自身角色类型回正）
      return {
        ...s,
        isEvilConverted: false,
        alignment:
          s.role?.type === "minion" || s.role?.type === "demon"
            ? "evil"
            : "good",
        statusDetails: (s.statusDetails || []).filter(
          (d) => d !== EVIL_CONVERTED_DETAIL
        ),
      } as T;
    }
    return s;
  });
}

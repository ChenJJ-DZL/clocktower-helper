/**
 * 角色身份判定 —— 与「爪牙身份是否可知」相关的官方规则集中在此，避免各处各写一套。
 *
 * 官方依据（钟楼百科·提线木偶·角色简介）：
 * - 「提线木偶不会在游戏的首个夜晚被唤醒以得知其他邪恶玩家都有谁，
 *    其他爪牙也不会得知谁是提线木偶。」
 * - 「提线木偶不会因其他角色能力导致他确认自己是爪牙而被唤醒。
 *    例如：告密者、传教士、小怪宝、罂粟种植者、帽匠、落难少女等。」
 * - 「恶魔会知道哪一名玩家是提线木偶。」
 *
 * 提线木偶对自己是爪牙一事全然不知，以为自己善良，
 * 因此凡"只有真爪牙才应获得的邪恶信息"，都必须把它排除在外。
 */

interface SeatLike {
  role?: { id?: string | null; type?: string | null } | null;
  charadeRole?: { id?: string | null; type?: string | null } | null;
}

/**
 * 说书人界面专用提示：凡"只应唤醒真爪牙"的环节，都必须把提线木偶排除在外，
 * 且绝不能让它察觉自己是爪牙（否则其整局认知崩塌）。
 * 各处的 prompt / guide 直接引用这一条，避免文案各写一套。
 */
export const MARIONETTE_NO_WAKE_NOTE =
  "※ 提线木偶不得被唤醒、不得得知任何邪恶信息（官方：提线木偶不会因其他角色能力确认自己是爪牙）。";

/** 提线木偶：以为自己是一个善良角色，实际是爪牙 */
export function isMarionetteSeat(seat: SeatLike | undefined | null): boolean {
  return seat?.role?.id === "marionette";
}

/**
 * 「真正的爪牙」= 知道自己是爪牙、参与邪恶互认信息的爪牙。
 * 提线木偶被排除；恶魔（type=demon）本就不满足 minion 条件。
 */
export function isRealMinion(seat: SeatLike | undefined | null): boolean {
  return seat?.role?.type === "minion" && !isMarionetteSeat(seat);
}

/**
 * 能否由该玩家发起「公开猜测落难少女」。
 * 官方相克（提线木偶 × 落难少女）：「提线木偶不会得知落难少女在场。」
 * 提线木偶既然连"落难少女在场"都不该知道，自然也不该被引导去猜测 —— 那等于当面告诉他"你是爪牙"。
 */
export function canGuessDamsel(seat: SeatLike | undefined | null): boolean {
  return isRealMinion(seat);
}

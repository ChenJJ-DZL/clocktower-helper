/**
 * 死亡玩家阵营统计（新引擎 · 唯一事实来源）
 *
 * ============================================================
 * 为什么需要独立文件
 * ============================================================
 * P0-2 事故（2026-09-20）：`oracle.ability.ts` 内联实现了「死亡邪恶计数」，
 * 只判 `role.type === "minion" | "demon"` —— **漏掉两类官方明确要求计入的玩家**：
 *   1. **邪恶旅行者**（`type === "traveler"` 且阵营为邪恶）
 *   2. **登记为邪恶的玩家**（间谍可登记善良、陌客可登记邪恶）
 *
 * 官方原文（`officialRoleDocs.json` · 神谕者）：
 *   "神谕者能力能检测死去的爪牙和恶魔，以及**任何属于邪恶阵营的玩家**。
 *    例如**邪恶的旅行者**，或者变得邪恶的镇民或外来者。"
 *   【范例】"……两名是邪恶的。并且在白天，一名**邪恶旅行者被流放**了。
 *            当晚，恶魔杀死了他的一名爪牙。神谕者醒来并得知了'4'。"
 *
 * ⇒ 阵营判定必须收敛为**单一函数**，任何角色不得自行内联。
 */

/** 最小可判定的座位形态（兼容 React Seat 与引擎 snapshot seat） */
export interface FactionJudgeSeat {
  id: number;
  isDead?: boolean;
  isEvilConverted?: boolean;
  isGoodConverted?: boolean;
  registerAsEvil?: boolean;
  registerAsGood?: boolean;
  role?: { id?: string; name?: string; type?: string } | null;
  [key: string]: any;
}

/**
 * 判定一名玩家**在结算时是否被当作邪恶阵营**。
 *
 * 优先级（与官方「登记」规则一致）：
 *   1. 阵营转换标记（`isEvilConverted` / `isGoodConverted`）—— 最高优先
 *   2. 角色登记覆盖（陌客 `registerAsEvil` / 间谍 `registerAsGood`）
 *   3. 角色类型（demon / minion / legion）
 *   4. **旅行者**：阵营由 `isEvilConverted` / 登记决定，type 本身不代表阵营
 *
 * ⚠️ 与 `app/gameLogic.ts::isPlayerEvil` 保持同源语义；
 *   本函数额外承担**登记**与**旅行者**两项，因为神谕者按官方要求计入这两类。
 *   若将来 `isPlayerEvil` 也支持登记，应改为从本函数导入，避免分叉。
 */
export function isSeatEvilForInfo(seat: FactionJudgeSeat): boolean {
  if (!seat) return false;

  // 1. 阵营转换标记（最终事实）
  if (seat.isEvilConverted) return true;
  if (seat.isGoodConverted) return false;

  // 2. 登记覆盖（陌客/间谍）
  if (seat.registerAsEvil === true) return true;
  if (seat.registerAsGood === true) return false;

  // 3. 物理角色类型
  const roleId = seat.role?.id;
  const roleType = seat.role?.type;
  if (roleType === "demon" || roleType === "minion") return true;
  if (roleId === "legion") return true;

  // 4. 旅行者 / 镇民 / 外来者：默认善良（除非上面已被转换/登记覆盖）
  return false;
}

/**
 * 统计**当前已被判定为死亡**的玩家中，被当作邪恶阵营的人数。
 *
 * 官方口径：包含「当晚刚死亡但尚未在 `isDead` 上落盘」的玩家，
 * 故调用方通过 `deadThisNight` 补充当晚死亡列表。
 *
 * @param seats 全部座位
 * @param deadThisNight 当晚刚死亡的座位 id 列表（可选）
 */
export function countDeadEvilPlayers(
  seats: FactionJudgeSeat[],
  deadThisNight: number[] = []
): number {
  const deadSet = new Set(deadThisNight);
  return seats.filter(
    (s) => (s.isDead || deadSet.has(s.id)) && isSeatEvilForInfo(s)
  ).length;
}

/**
 * 「首夜信息类」座位落座标记（洗衣目标 / 调查目标 / 图书目标）
 * ============================================================================
 * 三个信息角色的结果都会指向"某几个座位"，说书人需要在圆桌上把它们标出来。
 * - 图书管理员：roles/new_engine/librarian.ability.ts（既有实现，标记「图书目标」）
 * - 洗衣妇：roles/new_engine/washerwoman.ability.ts（「洗衣目标」）
 * - 调查员：roles/new_engine/investigator.ability.ts（「调查目标」）
 *
 * 统一规则（本文件是唯一实现，避免三处各写一套）：
 *   1. **幂等**：重复执行同一能力不会把标记叠加两次；
 *   2. **可迁移**：重新指派（换目标/换展示角色）时，旧座位上的同名标记会被清掉；
 *   3. **互不干扰**：三个标记名不同，各自只管自己的名字；
 *   4. 标记写在 `seat.statusDetails`（既有字段，不新增持久化状态）。
 */

export const INFO_SEAT_MARKS = [
  "图书目标",
  "洗衣目标",
  "调查目标",
] as const;

export type InfoSeatMark = (typeof INFO_SEAT_MARKS)[number];

interface SeatLike {
  id: number;
  statusDetails?: string[] | null;
}

/**
 * 把 `mark` 精确地落到 `targetSeatIds` 这些座位上，其余座位上的同名标记一律清除。
 * @returns 新的座位数组（不修改入参）
 */
export function applyInfoSeatMark<T extends SeatLike>(
  seats: T[],
  mark: InfoSeatMark,
  targetSeatIds: number[]
): T[] {
  const ids = new Set(targetSeatIds.filter((id) => typeof id === "number"));
  return (seats || []).map((s) => {
    const details = s.statusDetails ?? [];
    const hasMark = details.includes(mark);
    if (ids.has(s.id)) {
      // 已经有该标记 → 原样返回，保证幂等且不产生无谓的对象变更
      if (hasMark) return s;
      return { ...s, statusDetails: [...details, mark] };
    }
    // 不在目标座位上的同名标记一律清除（改派时可迁移）
    if (hasMark) {
      return { ...s, statusDetails: details.filter((d) => d !== mark) };
    }
    return s;
  });
}

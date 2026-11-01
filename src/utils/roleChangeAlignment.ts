/**
 * 角色变更 · 阵营保持（唯一入口）
 * ======================================================================
 * 官方规则：**玩家的阵营不因角色改变而改变**，只有能力原文明确写「变成邪恶/善良」时才转。
 *
 *   · 麻脸巫婆【范例#2】：「麻脸巫婆将神谕者变成**善良的**诺-达鲺」
 *     —— 造出一个恶魔，但那名玩家仍然是好人。
 *   · 女裁缝【范例#2】：「麻脸巫婆把数学家变成了女巫，**女巫仍然是善良的**」
 *   · 理发师【范例#3】：「亡骨魔与死去的心上人交换角色。**曾经的亡骨魔现在是邪恶的心上人**」
 *     —— 换到外来者角色上，邪恶阵营不变。
 *   · 反例（**不能**用本函数）：方古【能力】写「被该能力杀死的外来者改为**变成邪恶的**方古」
 *     —— 那是能力明写的阵营转换，由 `fang_gu.ability.ts` 自己置 `isEvilConverted`。
 *   · 反例：舞蛇人【能力】写「你和他**交换角色和阵营**」—— 阵营跟着角色走，也不走本函数。
 *
 * ⚠️ 为什么必须收口：`seatAlignment.ts::isSeatEvil` 的权威口径是「角色类型 + 转换标记」，
 *   所以**只换 role 对象必然连带改变阵营**。历史上麻脸巫婆与理发师各自实现了一遍角色替换，
 *   都漏掉了这一步 ⇒ 「善良的恶魔」「邪恶的外来者」被算反，判胜与信息类角色跟着错。
 */
import type { Seat } from "../../app/data";
import { isSeatEvil } from "./seatAlignment";

/** 邪恶角色类型（与 `seatAlignment` 同源口径，避免再抄一份常量） */
const EVIL_TYPES = new Set(["demon", "minion"]);

export interface RoleLike {
  id?: string;
  name?: string;
  type?: string;
  [key: string]: any;
}

/**
 * 把座位的角色换成 `newRole`，同时**保持原有阵营**。
 *
 * @param seat      原座位
 * @param newRole   新角色定义（来自 `app/data` 的真实条目；不要传 stub）
 */
export function applyRoleKeepingAlignment<T extends Partial<Seat>>(
  seat: T,
  newRole: RoleLike
): T {
  const wasEvil = isSeatEvil(seat as any);
  const nextRole = {
    ...((seat as any).role ?? {}),
    id: newRole.id,
    name: newRole.name,
    type: newRole.type,
  };
  const newTypeIsEvil = EVIL_TYPES.has(newRole.type ?? "");

  const next: any = { ...seat, role: nextRole };

  if (newTypeIsEvil && !wasEvil) {
    next.isGoodConverted = true;
    next.isEvilConverted = false;
  } else if (!newTypeIsEvil && wasEvil) {
    next.isEvilConverted = true;
    next.isGoodConverted = false;
  }
  return next as T;
}

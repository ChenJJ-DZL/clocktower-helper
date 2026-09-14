/**
 * 阵营判定 · 全项目唯一权威入口（2026-09-14 统一）
 *
 * ─── 本文件提供两类权威 ──────────────────────────────────────────────
 * **A. 阵营（善良/邪恶）** —— `isSeatEvil` / `isSeatGood`
 * **B. 角色类型** —— `isSeatTownsfolk` / `isSeatOutsider` / `isSeatTraveler`
 *      / `isSeatMinion` / `isSeatDemon` / `isSeatMinionOrDemon`
 *      / `isSeatTownsfolkOrOutsider`（官方「善良平民」）
 *      以及针对 `Role` 定义（非座位）的 `isTownsfolkRole` / `isOutsiderRole`
 *      / `isTownsfolkOrOutsiderRole` / `isMinionOrDemonRole`
 *
 * ⚠️ **为什么要合并角色类型判定**：收敛前全仓有 **56 处**内联
 * `role.type === "townsfolk" || role.type === "outsider"`，还有 671 处 `"demon"` / 518 处 `"minion"`
 * 字面量——它们各自只认 `role.type`，会**漏掉扁平 `roleType` 与 `effectiveRole.type`**，
 * 于是醉鬼/提线木偶的伪装角色、被 farmer/imp/kazali 改写的座位在这些判定里「不存在」。
 * 全部收口到本文件后，三表示兼容只有一份实现。
 *
 * ─── 为什么要有这个文件 ────────────────────────────────────────────────
 * 收敛前，同一事实「这个座位是善良还是邪恶」散落着 **4 个各自实现**：
 *   · `gameRules.ts::isEvil` / `isGoodAlignment`
 *   · `snvMechanics.ts::isGoodAlignment`
 *   · `bmrMechanics.ts::isGoodSeat`
 *   · 以及十多个角色能力里的内联 `seat.alignment === "evil"` / `role.type === "demon"`
 *
 * 它们**语义不一致**，实测同一座位会给出相反答案：
 *
 *   | 场景                              | gameRules | snv  | bmr  |
 *   | --------------------------------- | --------- | ---- | ---- |
 *   | `alignment="evil"` 的镇民          | 善良(true) | 邪恶 | 邪恶 |
 *   | 无 role 但 `alignment="good"`      | 邪恶(false)| 善良 | 善良 |
 *
 * ⇒ 同一个玩家"有时善良有时邪恶"，信息类角色（厨师/共情者/占卜师…）结果不确定。
 *
 * ─── 统一后的口径（唯一权威） ──────────────────────────────────────────
 * 权威来源 = **角色类型 + 转换标记**，优先级从高到低：
 *   1. `isEvilConverted`（被转为邪恶，如赏金猎人开局）      → 邪恶
 *   2. `isGoodConverted`（被转为善良）                      → 善良
 *   3. `isDemonSuccessor`（红唇女郎继任恶魔）               → 邪恶
 *   4. `role.type` ∈ {demon, minion}                       → 邪恶
 *   5. `role.type` ∈ {townsfolk, outsider}                 → 善良
 *   6. `role.type` ∈ {traveler}（默认善良，除非 alignment） → 善良
 *   7. **兼容读**：`seat.alignment` / `seat.role.alignment`（历史快照字段）
 *   8. 兜底：无 role → 按 `alignment` 字段；仍无 → 善良（官方默认玩家都是善良）
 *
 * ⚠️ 角色类型的三种表示（都由本文件统一兼容，调用方无需关心）：
 *   · `seat.role.type`         —— 标准座位结构
 *   · `seat.roleType`          —— **扁平字段**（farmer/imp/kazali 等能力会改写成扁平结构）
 *   · `seat.effectiveRole.type`—— 有效角色（醉鬼/提线木偶的伪装角色）
 *
 * ⚠️ 关于 `alignment` 字段：
 *   全仓检索确认**生产从不写入** `seat.alignment`（只有读取），属历史/预计算快照字段。
 *   因此它**只能作为兼容读**，绝不能凌驾于 `role.type` 之上 —— 这正是
 *   `snv`/`bmr` 旧实现的错误（把 alignment 放在 role.type 之前）。
 *
 * ⚠️ 与「登记」（registration）的区别：
 *   陌客/间谍可以**登记**为对方阵营（说书人可指定）。那是**对外呈现**层面的概念，
 *   不是真实阵营。真实阵营一律用本文件；登记一律走 `registration` 相关工具。
 *   两者混用曾导致「陌客提名贞洁者被错误处决」（见测试手册 §10.3）。
 */

import type { Seat } from "../../app/data";

/** 邪恶角色类型 */
const EVIL_ROLE_TYPES = new Set(["demon", "minion"]);
/** 善良角色类型 */
const GOOD_ROLE_TYPES = new Set(["townsfolk", "outsider", "traveler"]);

/** 兼容读：历史快照可能把阵营挂在 seat 或 seat.role 上 */
function legacyAlignment(seat: any): "good" | "evil" | null {
  const raw = seat?.alignment ?? seat?.role?.alignment;
  if (raw === "evil" || raw === "Evil") return "evil";
  if (raw === "good" || raw === "Good") return "good";
  return null;
}

/**
 * 兼容读：角色类型可能出现三种表示
 *   1. `seat.role.type`  —— 标准座位结构
 *   2. `seat.roleType`   —— **扁平字段**（farmer/imp/kazali 等能力会把座位改写成扁平结构）
 *   3. `seat.effectiveRole.type` —— 有效角色（醉鬼/提线木偶的伪装角色）
 */
function resolveRoleType(seat: any): string | undefined {
  return (
    seat?.role?.type ?? seat?.roleType ?? seat?.effectiveRole?.type ?? undefined
  );
}

/**
 * ⭐ 判断座位是否为**邪恶**阵营（真实阵营，非登记）。
 * 全项目唯一权威入口 —— 不要再在各处内联 `role.type === "demon"` 之类的判断。
 */
export function isSeatEvil(seat: Seat | undefined | null): boolean {
  if (!seat) return false;

  // 1-2. 转换标记优先（转换可以覆盖原本的阵营）
  if ((seat as any).isEvilConverted === true) return true;
  if ((seat as any).isGoodConverted === true) return false;

  // 3. 恶魔继任者（红唇女郎变身）
  if ((seat as any).isDemonSuccessor === true) return true;

  // 4-6. 角色类型（兼容 role.type / 扁平 roleType / effectiveRole.type）
  const roleType = resolveRoleType(seat);
  if (roleType && EVIL_ROLE_TYPES.has(roleType)) return true;
  if (roleType && GOOD_ROLE_TYPES.has(roleType)) return false;

  // 7. 兼容读（仅当 role.type 缺失/未知时才参考 alignment）
  const legacy = legacyAlignment(seat);
  if (legacy === "evil") return true;
  if (legacy === "good") return false;

  // 8. 兜底：官方默认「玩家都是善良的」，除非其角色/标记说明相反
  return false;
}

/**
 * ⭐ 判断座位是否为**善良**阵营（真实阵营，非登记）。
 * 与 `isSeatEvil` 严格互补（`isSeatGood === !isSeatEvil`），除非未来引入中立阵营。
 */
export function isSeatGood(seat: Seat | undefined | null): boolean {
  if (!seat) return false;
  return !isSeatEvil(seat);
}

/**
 * ⭐ 判断座位是否为**真正的爪牙或恶魔**（按角色类型，不参考转换标记）。
 * 用于「恶魔/爪牙的物理身份」场景（如恶魔法术、爪牙互认），
 * 与 `isSeatEvil`（阵营）区分：被转为邪恶的镇民**是**邪恶但**不是**爪牙。
 */
export function isSeatMinionOrDemon(seat: Seat | undefined | null): boolean {
  if (!seat) return false;
  const roleType = resolveRoleType(seat);
  return roleType === "demon" || roleType === "minion" || (seat as any).isDemonSuccessor === true;
}

/**
 * ⭐ 判断座位是否为恶魔（含继任者）。官方「恶魔」定义只认物理恶魔身份。
 */
export function isSeatDemon(seat: Seat | undefined | null): boolean {
  if (!seat) return false;
  return resolveRoleType(seat) === "demon" || (seat as any).isDemonSuccessor === true;
}

/**
 * ⭐ 判断座位是否为**爪牙**（不含恶魔、不含继任者）。
 * = `isSeatMinionOrDemon` 减去恶魔那一半。用于「爪牙互认」「只有爪牙才得的信息」等场景。
 */
export function isSeatMinion(seat: Seat | undefined | null): boolean {
  if (!seat) return false;
  return resolveRoleType(seat) === "minion";
}

/**
 * ⭐ 判断座位是否为**镇民**。
 * ⚠️ 一律走本函数，不要内联 `seat.role.type === "townsfolk"` ——
 * 那会漏掉 `roleType` 扁平字段与 `effectiveRole.type`（醉鬼/木偶的伪装角色）。
 */
export function isSeatTownsfolk(seat: Seat | undefined | null): boolean {
  if (!seat) return false;
  return resolveRoleType(seat) === "townsfolk";
}

/** ⭐ 判断座位是否为**外来者**。 */
export function isSeatOutsider(seat: Seat | undefined | null): boolean {
  if (!seat) return false;
  return resolveRoleType(seat) === "outsider";
}

/** ⭐ 判断座位是否为**旅行者**。 */
export function isSeatTraveler(seat: Seat | undefined | null): boolean {
  if (!seat) return false;
  return resolveRoleType(seat) === "traveler";
}

/**
 * ⭐ 判断座位是否为「**镇民或外来者**」（官方语境：**善良平民 / 村民阵营**）。
 *
 * 这是全仓最高频的内联模式之一（收敛前 56 处 `role.type === "townsfolk" || role.type === "outsider"`），
 * 典型场景：身份类信息的候选池（守鸦人/掘墓人/祖母/告密者…）、「可被提名的善良平民」等。
 *
 * ⚠️ 收口时注意区分两种输入：
 *   · 传 **Seat** → 用本函数（自动兼容三表示）
 *   · 传 **Role 定义**（`Role[]` 里的元素，只有 `.type`）→ 用 `isTownsfolkOrOutsiderRole`
 */
export function isSeatTownsfolkOrOutsider(seat: Seat | undefined | null): boolean {
  if (!seat) return false;
  const roleType = resolveRoleType(seat);
  return roleType === "townsfolk" || roleType === "outsider";
}

/**
 * ⭐ 判断**角色定义**（`Role` 对象，不是座位）是否为「镇民或外来者」。
 * 用于对 `Role[]` 做 filter（没有座位包装，故不走三表示解析）。
 */
export function isTownsfolkOrOutsiderRole(role: { type?: string | null } | undefined | null): boolean {
  if (!role) return false;
  return role.type === "townsfolk" || role.type === "outsider";
}

/** ⭐ 判断**角色定义**是否为镇民。 */
export function isTownsfolkRole(role: { type?: string | null } | undefined | null): boolean {
  return role?.type === "townsfolk";
}

/** ⭐ 判断**角色定义**是否为外来者。 */
export function isOutsiderRole(role: { type?: string | null } | undefined | null): boolean {
  return role?.type === "outsider";
}

/** ⭐ 判断**角色定义**是否为爪牙或恶魔。 */
export function isMinionOrDemonRole(role: { type?: string | null } | undefined | null): boolean {
  return role?.type === "minion" || role?.type === "demon";
}

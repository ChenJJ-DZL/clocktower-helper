/**
 * 「伪装身份」的展示口径 —— **全仓唯一事实来源（SST）**
 *
 * ============================================================
 * 为什么需要这个模块（2026-09-14 用户实测报告的缺陷，第 9 次 SST 事故）
 * ============================================================
 * 用户实测：7 号是**酒鬼**，说书人把它的伪装设为**赏金猎人**。
 *   · 座位卡显示「赏金猎人」✅
 *   · **身份告知牌**首次打开却显示「**罂粟种植者**」（本局真实存在的角色）❌
 *   · 多次打开后修正为「赏金猎人」
 *
 * 根因：`displayRole` / `charadeRole` **两个字段都能表达"我看到的是谁"**，
 * 而三个消费者各用各的优先级：
 *
 * | 消费者 | 修复前的读取优先级 |
 * | --- | --- |
 * | 座位卡 `useSeatView` | **`displayRole` 优先** → `charadeRole` → 兜底镇民 |
 * | 告知牌 `IdentityShowcaseModal` | **只看 `charadeRole`** |
 * | 控制台 `GameConsole` | `charadeRole \|\| role` |
 *
 * 只要 `displayRole` 与 `charadeRole` 分叉（刷新/读档/换座/手动改身份，
 * 任一写入方只落了一个字段），**座位卡与告知牌必然显示两个不同角色**。
 * 「多次打开后自愈」是因为 `charadeRole` 稍后才落到 seats state，
 * 告知牌重渲染后读到了新值（本质是**一帧渲染滞后**，不是真的"修正"）。
 *
 * ⇒ 修法：把优先级**收敛成这里唯一一份**，所有消费者一律调用
 *   `getCharadeDisplayRole()`，禁止各自手写 `x || y`。
 *
 * 回归测试：`src/utils/__tests__/charadeDisplay_single_source.test.ts`
 *   （该测试 **import 本模块**，因此"把优先级改错 → 测试变红"是真的。）
 */

/** 本模块只依赖"长得像座位"的最小结构，避免与 Seat 类型循环依赖。 */
export interface CharadeDisplaySeat {
  /** 真实角色（酒鬼/提线木偶/疯子 在这里是**真身**） */
  role?: { id?: string | null; name?: string | null; type?: string | null } | null;
  /** 酒鬼 / 提线木偶 的伪装身份（**权威字段**） */
  charadeRole?: { id?: string | null; name?: string | null; type?: string | null } | null;
  /** 疯子以为自己是的恶魔身份（**权威字段**） */
  apparentDemonRole?: { id?: string | null; name?: string | null; type?: string | null } | null;
  /** ⚠️ 渲染缓存 / 历史遗留字段，**不是权威**；仅为兼容旧存档保留兜底 */
  displayRole?: { id?: string | null; name?: string | null; type?: string | null } | null;
}

/** 该座位是否属于「永久醉酒」类伪装身份（酒鬼 / 提线木偶） */
export function isCharadeIdentitySeat(
  seat: CharadeDisplaySeat | null | undefined
): boolean {
  const rid = seat?.role?.id;
  return rid === "drunk" || rid === "marionette";
}

/** 该座位是否为疯子（伪装身份走 `apparentDemonRole` 而非 `charadeRole`） */
export function isLunaticSeat(
  seat: CharadeDisplaySeat | null | undefined
): boolean {
  return seat?.role?.id === "lunatic";
}

/**
 * **权威口径**：一个座位在 UI 上"应该展示成谁"。
 *
 * 优先级（逐条落地，勿在调用方重写）：
 *  1. 酒鬼 / 提线木偶 → `charadeRole`（权威）＞ `displayRole`（旧存档兜底）＞ `role`
 *  2. 疯子           → `apparentDemonRole`（权威）＞ `displayRole`（兜底）＞ `role`
 *  3. 其他           → `role`（真身即展示身份）
 *
 * ⚠️ 注意第 1 条与"旧实现"的差别：**旧实现把 `displayRole` 放在 `charadeRole` 前面**，
 *    这正是本次缺陷的根因。`displayRole` 只是缓存，永远排在权威字段之后。
 */
export function getCharadeDisplayRole<T extends CharadeDisplaySeat>(
  seat: T | null | undefined
): T["role"] | T["charadeRole"] | T["apparentDemonRole"] {
  if (!seat) return null as never;
  if (isCharadeIdentitySeat(seat)) {
    return (seat.charadeRole ?? seat.displayRole ?? seat.role) as never;
  }
  if (isLunaticSeat(seat)) {
    return (seat.apparentDemonRole ?? seat.displayRole ?? seat.role) as never;
  }
  return (seat.role ?? null) as never;
}

/**
 * 该座位的"伪装是否生效"（用于给座位卡加 👁 遮罩角标等）。
 * 判据：**真实角色**与**展示角色**不是同一个 id。
 */
export function isCharadeMasked(seat: CharadeDisplaySeat | null | undefined): boolean {
  if (!seat) return false;
  const real = seat.role;
  const shown = getCharadeDisplayRole(seat) as CharadeDisplaySeat["role"];
  if (!real?.id || !shown?.id) return false;
  return real.id !== shown.id;
}

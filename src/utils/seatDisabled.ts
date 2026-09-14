/**
 * 失能状态（中毒 / 醉酒）判定 · 全项目唯一权威入口（2026-09-14 统一）
 *
 * ─── 为什么要有这个文件 ────────────────────────────────────────────────
 * 「这个座位是否被中毒/醉酒压制」在收敛前有多套实现，**检测口径不一致**：
 *   · `gameRules::computeIsPoisoned`  —— 认 8 种表示（中文 statusDetails 正则、
 *     `statuses[] effect=Poison`、`statusEffects[]`、布尔位、诺-达动态中毒…）
 *   · `bmrMechanics::isDrunkOrPoisoned` —— 只认 `statusEffects[]` 与布尔位
 *
 * 实测分叉（双向，均为真缺陷）：
 *   | 场景                              | computeIsPoisoned | isDrunkOrPoisoned |
 *   | --------------------------------- | ----------------- | ----------------- |
 *   | 仅 `statusDetails` 中文标记        | ✅ 中毒            | ❌ **判为清醒**     |
 *   | 仅 `statuses[] effect="Poison"`   | ✅ 中毒            | ❌ **判为清醒**     |
 *
 * 生产 `gameRules::addPoisonMark` 写的正是中文 `statusDetails`
 * ⇒ **被投毒者会被 BMR 系列角色（茶艺师/莽夫/月之子）当作清醒**，能力照常生效。
 *
 * ─── 统一口径 ──────────────────────────────────────────────────────────
 * 唯一权威 = `gameRules::computeIsPoisoned`（它认全部 8 种表示，是引擎实际使用的那个）。
 * 本文件把它与「醉酒」合并为语义清晰的三个问题：
 *   · `isSeatPoisoned`     —— 仅中毒
 *   · `isSeatDrunk`        —— 仅醉酒
 *   · `isSeatDisabled`     —— 中毒 **或** 醉酒 **或** 本质角色就是酒鬼/提线木偶
 *   · `isActorDisabledByPoisonOrDrunk` —— 在此基础上叠加涡流（Vortox）等全局覆盖
 */

import type { Seat } from "../../app/data";
import { computeIsPoisoned } from "./gameRules";

/** 从 statusEffects 里取的醉酒判定（中毒交给 computeIsPoisoned 统一处理） */
export function isSeatDrunk(seat: Seat | undefined | null): boolean {
  if (!seat) return false;
  if ((seat as any).isDrunk === true) return true;
  if (seat.role?.id === "drunk" || seat.role?.id === "marionette") return true;
  const effects = (seat as any).statusEffects ?? [];
  return effects.some((e: any) => e.type === "drunk");
}

/** 中毒判定 —— 转发到引擎权威实现 `computeIsPoisoned` */
export function isSeatPoisoned(
  seat: Seat | undefined | null,
  allSeats?: Seat[]
): boolean {
  if (!seat) return false;
  return computeIsPoisoned(seat, allSeats);
}

/**
 * ⭐ 座位是否处于「失能」状态（中毒 或 醉酒）。
 *
 * 这是全项目判断"能力是否被压制"的**唯一入口**。
 * BMR / SNV / 扩展剧本的角色能力一律用它，不要再各自内联检测。
 */
export function isSeatDisabled(
  seat: Seat | undefined | null,
  allSeats?: Seat[]
): boolean {
  if (!seat) return false;
  return isSeatPoisoned(seat, allSeats) || isSeatDrunk(seat);
}

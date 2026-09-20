/**
 * 「能力继承」唯一事实来源（SST）· 2026-09-20
 *
 * ── 为什么必须收敛 ──────────────────────────────────────────────────
 * 本工程已 13 次踩中「同一事实多个实现 → 必然分叉」。
 * 「某个座位是否通过继承方式持有某角色的能力」就是这样一个事实：
 *   ① 小精灵（pixie）   —— 官方：得知的镇民死亡且自己疯狂证明后，获得其能力
 *   ② 哲学家（philosopher）—— 官方：首日选择一名不在场角色，获得其能力
 * 两者**语义相同**（都是"角色不变、能力叠加"），
 * 此前 `dynamicQueueGenerator` / `useNightActionHandler` 各自硬编码
 * `s.role?.id === "pixie"`，共 **5 处**。泛化时若逐处打补丁，必然漏一处。
 *
 * ── 官方语义（本文件即契约）────────────────────────────────────────
 * · 身份**不变**：`seat.role` 仍是自身角色（pixie / philosopher），
 *   绝不能 `changeRole()`。这是与「麻脸巫婆变身」的本质区别。
 * · 能力**按原角色的规则**生效：
 *   - 原角色是一次性（limited）→ 继承后也是一次性；
 *   - 原角色是持续（每晚）→ 继承后也是每晚。
 * · 自身技能仍受自身限制：哲学家「只能获取一次」由
 *   `LimitedAbilityManager` + `hasUsedDayAbility` 双重闸门保证。
 *
 * ── 载体字段 ──────────────────────────────────────────────────────
 * · `acquiredAbilities: string[]` —— **通用**：本座位继承到的角色 id 列表。
 *   多个继承来源（pixie + philosopher 同场）可共存，互不干扰。
 * · 角色专属标记（`pixieCopiedRole` / `philosopherGainedRole`）仅用于
 *   展示与审计，**判定一律走 `acquiredAbilities`**（避免再分叉）。
 */

import type { Seat } from "../../app/data";

/** 具备「继承他人能力」机制的角色 id。新增此类角色时**只改这里**。 */
export const ABILITY_GRANTING_ROLE_IDS = ["pixie", "philosopher"] as const;

export type AbilityGrantingRoleId = (typeof ABILITY_GRANTING_ROLE_IDS)[number];

/**
 * 该座位是否因**继承**而持有 `roleId` 的能力？
 *
 * @param seat   候选座位（继承者）
 * @param roleId 被继承的角色 id
 */
export function seatHasAcquiredAbility(
  seat: any,
  roleId: string | undefined | null
): boolean {
  if (!seat || !roleId) return false;
  // 只认「继承型角色」——防止普通角色因脏数据被误判
  if (!ABILITY_GRANTING_ROLE_IDS.includes(seat.role?.id)) return false;
  // 继承者自身死亡 → 能力失效
  if (seat.isDead) return false;

  // 通用载体（判定唯一入口）
  if (Array.isArray(seat.acquiredAbilities)) {
    if (seat.acquiredAbilities.includes(roleId)) return true;
  }

  // 角色专属标记（兼容历史数据：pixie 早于通用字段写入）
  if (seat.role?.id === "pixie" && seat.pixieCopiedRole === roleId) {
    return true;
  }
  if (seat.role?.id === "philosopher" && seat.philosopherGainedRole === roleId) {
    return true;
  }

  return false;
}

/**
 * 在座位列表中，找出「因继承而应代替 `roleId` 行动」的座位。
 *
 * 用于夜间队列与能力执行两处：原角色不在场时，由继承者顶上其行动槽位。
 * 取**座位号最小**者（稳定、可预期；同场两名继承者时不会随机抖动）。
 */
export function findAbilityGrantingSeat(
  seats: any[] | undefined,
  roleId: string | undefined | null
): any | undefined {
  if (!Array.isArray(seats) || !roleId) return undefined;
  return seats
    .filter((s) => seatHasAcquiredAbility(s, roleId))
    .sort((a, b) => a.id - b.id)[0];
}

/**
 * 把 `roleId` 记入继承者的 `acquiredAbilities`（幂等）。
 * @returns 新座位对象
 */
export function grantAbilityToSeat(
  seat: any,
  roleId: string,
  extra: Record<string, unknown> = {}
): any {
  const existing: string[] = Array.isArray(seat?.acquiredAbilities)
    ? seat.acquiredAbilities
    : [];
  return {
    ...seat,
    acquiredAbilities: existing.includes(roleId)
      ? existing
      : [...existing, roleId],
    ...extra,
  };
}

/**
 * 继承来的 `roleId` 能力**是否已被消耗**（一次性技能用过一次）。
 *
 * 官方：「每局游戏限一次」的能力（艺术家提问、猎手射击、杂耍猜测…）
 * 用过之后不应再唤醒——否则说书人会被持续空唤醒（白送信息）。
 *
 * 判据（任一命中即视为已消耗）：
 *   ① 通用日间标记 `hasUsedDayAbility`（继承者用白天发动过该能力）
 *   ② 目标角色的专属单次标记（`<roleId>AbilityUsed` / `hasUsed<Role>Ability`）
 *   ③ `inheritedAbilityConsumed` 显式数组（引擎写入的更精确记录）
 *
 * ⚠️ 只对**一次性**能力生效：持续型能力（每晚行动）不应被此函数拦下，
 *    因此调用方必须先判断该能力本身是否为一次性（如 `firstNightOnly`）。
 */
export function isInheritedAbilityConsumed(
  seat: any,
  roleId: string,
  isFirstNight: boolean
): boolean {
  if (!seat || !roleId) return false;

  // ③ 显式记录（最精确，优先）
  const explicit: string[] = Array.isArray(seat.inheritedAbilityConsumed)
    ? seat.inheritedAbilityConsumed
    : [];
  if (explicit.includes(roleId)) return true;

  // ① 通用日间标记
  if (seat.hasUsedDayAbility === true) return true;

  // ② 角色专属单次标记（驼峰化 roleId，如 fortune_teller → fortuneTeller）
  const camel = roleId.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  const tagged = camel.charAt(0).toUpperCase() + camel.slice(1);
  const candidates = [
    `${roleId}AbilityUsed`,
    `${camel}AbilityUsed`,
    `hasUsed${tagged}Ability`,
    `used${tagged}Ability`,
  ];
  for (const key of candidates) {
    if (seat[key] === true) return true;
  }

  // 首夜已过 + 该能力是首夜限定 → 天然已错过（由调用方传 isFirstNight 判定）
  // 注：此处不直接返回 true，因为官方允许哲学家"在当晚"使用首夜能力，
  //     是否可用的最终判断由队列层「firstNightOnly + hasCompletedFirstNight」处理。
  void isFirstNight;

  return false;
}

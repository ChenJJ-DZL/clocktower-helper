/**
 * 动态夜晚队列生成器
 * 根据当前游戏状态动态生成真实需要唤醒的角色队列，兼容所有隐性规则
 */

import { LEGION_MUTUAL_RECOGNITION_ID } from "../roles/demon/demonFirstNightHelper";
import { AbilityTriggerTiming } from "../roles/core/roleAbility.types";
import { unifiedRoleDefinition } from "../roles/unifiedRoleDefinition";
import { getRoleDefinition } from "../roles";
import { EVIL_CONVERTED_NOTICE_ID } from "./nightStepIds";
import { resolveEvilTwinPair } from "./evilTwinHelper";
import {
  findAbilityGrantingSeat,
  isInheritedAbilityConsumed,
  seatHasAcquiredAbility,
} from "./grantedAbilityHelper";
import type { GameStateSnapshot, NightActionNode } from "./nightStateMachine";
import { isRealMinion } from "./roleFlags";

// 全量夜晚顺序表项
export interface NightOrderEntry {
  roleId: string;
  roleName: string;
  firstNightPriority: number;
  otherNightPriority: number;
  firstNightOnly: boolean;
  wakeMessage: string;
  otherNightOnly?: boolean;
  abilityId: string;
  /** 死后仍可唤醒（如间谍查看魔典） */
  deadActorWakes?: boolean;
  /** 🔧 死亡触发型角色（守鸦人/贤者等 ON_DEATH）：仅在当晚死亡时入队 */
  deathTriggered?: boolean;
  /** 🔧 依赖"今日有玩家死于处决"才入队（送葬者）：
   *    平票平安日 / 镇长免疫处决等无人死亡场景，不应唤醒送葬者 */
  requiresExecutedToday?: boolean;
  /** 🏹 依赖"已知目标死亡"才入队（赏金猎人）：
   *    官方「每当你**得知**的玩家死亡，你会在**当晚**得知另一名邪恶玩家」
   *    → 非首夜时，仅当"当前得知的那名玩家（bountyHunterKnownTargets 末项）"
   *      已死亡才入队；否则说书人每夜被空唤醒、且白送一名邪恶玩家。 */
  requiresKnownTargetDead?: boolean;
}

// 生成队列选项
export interface QueueGenerateOptions {
  /** 是否为首夜 */
  isFirstNight: boolean;
  /** 是否包含已死亡角色（默认：false） */
  includeDead?: boolean;
  /** 自定义过滤规则 */
  customFilter?: (entry: NightOrderEntry, seat: any) => boolean;
}

/**
 * 获取座位在夜间队列中应使用的“有效角色 id”。
 * 酒鬼伪装成什么身份，就按该身份参与游戏流程（唤醒/技能/顺序）。
 */
function getEffectiveRoleId(seat: any): string | undefined {
  if (!seat?.role) return undefined;
  if (seat.role.id === "drunk" || seat.role.id === "marionette") {
    return seat.charadeRole?.id ?? seat.role.id;
  }
  return seat.role.id;
}

/**
 * 🌺 角色是否「有夜间行动」——即是否**可能**需要被唤醒。
 *
 * 这是夜间队列的**准入不变式**：没有夜间行动的角色（纯被动角色，
 * 如罂粟种植者「爪牙和恶魔互相不认识」持续被动生效）**永远不得**
 * 进入 `wakeQueueIds`。
 *
 * ⚠️ 为什么必须单独抽出来：
 *   1. `nightInfoGenerator` 对「无 night 配置」的角色有一个兜底分支，
 *      会合成文案「唤醒N号【角色名】，准备执行技能。」
 *      （全库 **50+ 个角色**命中该分支，是"UI 不为空"的必需品，不能删）。
 *      → 一旦某个纯被动角色被塞进队列，就会走到该兜底、被"唤醒"、
 *        并弹出「N号-角色名 - 结果」信息窗（罂粟种植者缺陷的成因）。
 *   2. 队列生成器（`generateDynamicNightQueue`）本身已按
 *      `fullNightOrder`（只含真正申报过夜序的能力）过滤，是安全的；
 *      但**动态插入**入口（`insertIntoWakeQueueAfterCurrent`）只按座位 id
 *      插入，完全没有反向校验 → 必须用它兜住。
 *
 * 判定标准（任一满足即视为"有夜间行动"）：
 *   · 新引擎：`firstNightPriority` / `otherNightPriority` 有正数
 *   · 旧引擎：RoleDefinition 声明了 `firstNight` 或 `night` 配置
 */
/**
 * 判定某角色是否为「死亡触发」型（官方语义：当你死亡时 / 如果你死亡）。
 *
 * ⚠️⚠️ 本函数是 `useNightEngine.ts:194` 打 `deathTriggered` 标的**同源判定**，
 *   `GameStage.tsx` 的「死后仍可唤醒」也必须走这里 —— 千万不要再硬编码角色名白名单。
 *
 * 🔴 历史缺陷（2026-09-21 修）：`GameStage.tsx:585-586` 原为
 *     `s.role?.id === "ravenkeeper" || "sage"` 的**硬编码白名单**
 *   ⇒ 其他死亡触发角色（farmer / banshee / moonchild / plague_doctor /
 *     sweetheart / barber / hatter…）在**死亡当晚拿不到唤醒节点**。
 *   实测暴露方式：把 `sweetheart`/`barber`/`sage` 的 `triggerTiming` 从 PASSIVE
 *   改为 ON_DEATH 后，只有 `sage` 因白名单仍能唤醒。
 *
 * 🔒 判定来源：`unifiedRoleDefinition.getAllAbilities()`（与 `roleHasNightAction` 同一注册表）。
 */
/**
 * 【声明式】该角色是否订阅了「他人死亡」事件。
 * 对应 `IRoleAbility.deathEventWatch`（如 choir_boy ⇒ king）。
 */
export function hasDeathEventWatch(roleId: string | undefined | null): boolean {
  return getDeathEventWatchTarget(roleId) !== null;
}

/** 该角色订阅的是哪个角色的死亡（无订阅 ⇒ null） */
export function getDeathEventWatchTarget(
  roleId: string | undefined | null
): string | null {
  if (!roleId) return null;
  try {
    const abilities = unifiedRoleDefinition.getAllAbilities() as any[];
    const ability = abilities.find((ab) => ab?.roleId === roleId);
    const watched = ability?.deathEventWatch?.roleId;
    return typeof watched === "string" && watched.length > 0 ? watched : null;
  } catch {
    return null;
  }
}

/**
 * 该角色能否因「死亡事件」被唤醒 —— 两类合一的唯一判据：
 *   ① **自己死亡触发**：`triggerTiming` 含 `ON_DEATH`（守鸦人/农夫/心上人/理发师/贤者…）
 *   ② **他人死亡订阅**：声明了 `deathEventWatch`（唱诗男孩 ⇒ 国王）
 *
 * 🔒 引擎中所有「死亡后是否还能唤醒」的判定都必须走本函数（或它的两个分量）。
 */
export function canWakeOnDeathEvent(roleId: string | undefined | null): boolean {
  return isDeathTriggeredRole(roleId) || hasDeathEventWatch(roleId);
}

/** 因某个死亡事件而需要在**当晚**唤醒的座位 */
export interface DeathEventWakeup {
  seatId: number;
  roleId: string;
  /** self = 自己死亡触发；watch = 订阅了他人的死亡 */
  reason: "self" | "watch";
}

/**
 * ⭐ 死亡事件统一分发器（SST）——**所有死因、所有相关角色**的唯一入口。
 *
 * 输入一个死亡事件（谁死了、什么角色），输出「当晚需要插入唤醒队列的座位」：
 *   1. **自己死亡触发**：死者本人的能力 `triggerTiming` 含 `ON_DEATH` ⇒ 唤醒他
 *   2. **他人死亡订阅**：**存活**座位中订阅了 `deadRoleId` 的角色 ⇒ 唤醒他们
 *      （如唱诗男孩订阅国王 ⇒ 恶魔杀国王当晚唤醒唱诗男孩）
 *
 * ⚠️ 调用方（`useNightActionHandler` 的 newlyDead 检测 / 处决链）**不要**自己判断角色，
 *   统一走本函数，否则又会退化成散落各处的硬编码白名单。
 */
export function resolveDeathEventWakeups(
  seats: any[],
  deadSeatId: number,
  deadRoleId: string | undefined | null
): DeathEventWakeup[] {
  const out: DeathEventWakeup[] = [];
  const seen = new Set<number>();

  // ① 自己死亡触发
  if (isDeathTriggeredRole(deadRoleId)) {
    out.push({ seatId: deadSeatId, roleId: deadRoleId as string, reason: "self" });
    seen.add(deadSeatId);
  }

  // ② 他人死亡订阅（仅存活座位）
  if (deadRoleId) {
    for (const s of seats ?? []) {
      if (!s || seen.has(s.id)) continue;
      if (s.isDead === true) continue;
      const rid: string | undefined = s.role?.id;
      if (!rid) continue;
      if (getDeathEventWatchTarget(rid) === deadRoleId) {
        out.push({ seatId: s.id, roleId: rid, reason: "watch" });
        seen.add(s.id);
      }
    }
  }

  return out;
}

export function isDeathTriggeredRole(roleId: string | undefined | null): boolean {
  if (!roleId) return false;
  try {
    const abilities = unifiedRoleDefinition.getAllAbilities() as any[];
    const ability = abilities.find((ab) => ab?.roleId === roleId);
    const timings = (ability?.triggerTiming ?? []) as string[];
    return timings.includes(AbilityTriggerTiming.ON_DEATH);
  } catch {
    // 注册表未初始化时静默降级：不视为死亡触发（与旧行为一致，只影响唤醒时机）
    return false;
  }
}

/**
 * 👑 2026-09-21 P1-16：把「**当日被处决**」的**死亡触发**角色补进夜间唤醒队列。
 *
 * 官方【帽匠】范例：「刺客杀死了一名玩家。**帽匠被处决了。当晚**，刺客选择变成了主谋。」
 *   ⇒「如果你死亡」类（心上人 / 理发师 / 贤者 / 呆瓜 / 帽匠…）**不分死因**、**当晚**生效。
 *
 * 🔴 为什么必须**单独补**（而不是让静态队列生成器产出）：
 *   `deathTriggered` 角色**刻意不走静态队列生成器** —— **既有设计契约**
 *   （`ravenkeeper.test.ts`：「入队由击杀后专用路径注入，非队列生成器」；
 *     `trouble_brewing_matrix_full.test.ts`：「即便本人当晚已死，队列生成器也不产出其节点」）。
 *   队列在**夜晚开始时**生成，而「恶魔杀谁」在**夜晚过程中**才发生
 *   ⇒ 由 `useNightActionHandler` 的 newlyDead 动态插入兜住。
 *   ⚠️ 但**处决**发生在**黄昏（dusk）**，走不到那条路径 ⇒ 处决死的死亡触发角色**无任何入队路径**。
 *   ⚠️ 且 `enterNightPhase` 会**清空 `deadThisNight`** ⇒ 即便处决写了它也留不住。
 *
 * ✅ 判据：`todayExecutedId`（进入夜晚时**仍有效**；`enterDayPhase` 在新白天才清空）。
 *   角色资格走**同源** `canWakeOnDeathEvent`（自己死亡触发 ∪ 他人死亡订阅）。
 *   结果**追加在队尾**（优先级位于恶魔等常规角色之后，与官方「恶魔行动后唤醒」口径一致）。
 *
 * 🔒 唯一实现：`useExecutionHandlers::startSubsequentNight` 调它；禁止再内联复制。
 *
 * ⚠️⚠️ **纯函数契约：恒返回「新数组」，绝不返回入参 `wakeIds` 的引用。**
 *   2026-09-21 P0 教训（后续夜晚队列恒为空、恶魔永不杀人）：
 *     `return wakeIds;` 返回**同一引用** ⇒ 调用方「先 `wakeIds.length = 0`、
 *     再 `wakeIds.push(...返回值)`」⇒ 清空源后再 spread 空数组 ⇒ **结果恒为空**。
 *   只要本函数可能返回入参引用，调用方的任何原地改就都是雷。
 *   ⇒ 这里统一 `return [...wakeIds]` 切断别名；测试用 `toEqual` 不校验身份，故不受影响。
 */
export function appendExecutedDeathTriggeredToQueue(
  seats: any[],
  todayExecutedId: number | null | undefined,
  wakeIds: number[]
): number[] {
  const base = Array.isArray(wakeIds) ? wakeIds : [];
  // ⚠️ 一律返回**副本**（下方所有分支同此契约）
  if (typeof todayExecutedId !== "number") return [...base];
  if (base.includes(todayExecutedId)) return [...base];
  const seat = (seats ?? []).find((s: any) => s?.id === todayExecutedId);
  if (!seat) return [...base];
  if (!canWakeOnDeathEvent(seat.role?.id)) return [...base];
  return [...base, todayExecutedId];
}

export function roleHasNightAction(roleId: string | undefined | null): boolean {
  if (!roleId) return false;
  // 系统步骤（爪牙互认 / 恶魔互认 / 军团互认 / 转邪通知等）不是角色，放行
  if (
    roleId === "minion_info" ||
    roleId === "demon_info" ||
    roleId === LEGION_MUTUAL_RECOGNITION_ID ||
    roleId === EVIL_CONVERTED_NOTICE_ID ||
    roleId === "good_twin_info"
  ) {
    return true;
  }

  // 1) 新引擎能力注册表：有夜序优先级即视为有夜间行动
  try {
    const abilities = unifiedRoleDefinition.getAllAbilities() as any[];
    const ability = abilities.find((a) => a?.roleId === roleId);
    if (ability) {
      const fn = ability.firstNightPriority;
      const on = ability.otherNightPriority;
      const hasFn = typeof fn === "number" && fn > 0;
      const hasOn = typeof on === "number" && on > 0;
      // 注册表里存在该能力：以优先级为准（纯 passive → 两者皆空 → false）
      if (hasFn || hasOn) return true;
      // 注册表明确声明了（passive）能力但无夜序 —— 继续用旧定义兜底判断
    }
  } catch {
    // 注册表未初始化时静默降级到旧定义判断
  }

  // 2) 旧引擎：RoleDefinition 的 night / firstNight 配置
  try {
    const def = getRoleDefinition(roleId) as any;
    if (def && (def.firstNight || def.night)) return true;
  } catch {
    /* 角色定义缺失时视为无夜间行动 */
  }

  return false;
}

/** 座位版本：酒鬼 / 提线木偶按伪装身份判断 */
export function seatHasNightAction(seat: any): boolean {
  return roleHasNightAction(getEffectiveRoleId(seat));
}

/**
 * 动态生成当前夜晚的唤醒队列
 * @param fullNightOrder 全量夜晚顺序表（从nightOrderParser获取）
 * @param snapshot 当前游戏状态快照
 * @param options 生成选项
 * @returns 过滤排序后的夜间行动节点队列
 */
export function generateDynamicNightQueue(
  fullNightOrder: NightOrderEntry[],
  snapshot: GameStateSnapshot,
  options: QueueGenerateOptions
): NightActionNode[] {
  const { isFirstNight, includeDead = false, customFilter } = options;

  // 1. 过滤符合条件的角色
  // 🏹 赏金猎人「阵营告知」步骤：首夜时把被赏金猎人转成邪恶的那名镇民排到最前，
  //    由说书人告知他"你已经属于邪恶阵营"（官方要求"在给出其他夜晚信息之前"）。
  //    没有 isEvilConverted 座位时完全不注入，避免空步骤。
  const convertedSeat: any = isFirstNight
    ? snapshot.seats.find((s) => (s as any).isEvilConverted && !s.isDead)
    : undefined;
  const order: NightOrderEntry[] = convertedSeat
    ? [
        {
          roleId: EVIL_CONVERTED_NOTICE_ID,
          roleName: "邪恶阵营告知",
          firstNightPriority: -1000, // 必须排在其他夜间信息步骤之前
          otherNightPriority: -1000,
          firstNightOnly: true,
          wakeMessage: EVIL_CONVERTED_NOTICE_ID,
          abilityId: EVIL_CONVERTED_NOTICE_ID,
        },
        ...fullNightOrder,
      ]
    : fullNightOrder;

  const validEntries = order.filter((entry) => {
    // 阵营告知步骤：仅在营转过的座位存在时保留（注入时已保证）
    if (entry.roleId === EVIL_CONVERTED_NOTICE_ID) {
      return Boolean(convertedSeat);
    }
    // 首夜仅角色过滤（含字段缺失时的优先级兜底：other 有值但 first 为 0）
    const firstNightOnly =
      entry.firstNightOnly ||
      (entry.firstNightPriority > 0 && entry.otherNightPriority <= 0);
    const otherNightOnly =
      entry.otherNightOnly ||
      (entry.otherNightPriority > 0 && entry.firstNightPriority <= 0);

    if (isFirstNight && otherNightOnly) {
      return false;
    }

    const isSystemEvilInfo =
      entry.roleId === "minion_info" ||
      entry.roleId === "demon_info" ||
      entry.roleId === LEGION_MUTUAL_RECOGNITION_ID;
    const poppyGrowerDiedAndTriggersEvil =
      (snapshot as any).poppyGrowerDead === true;

    // 🧚 小精灵能力继承：若为非首夜、原本仅首夜行动的角色（如图书管理员、厨师），
    //   但场上有存活小精灵刚刚继承了该能力且当晚尚未唤醒使用过，允许进队列！
    const hasPixiePendingInheritedAbility =
      !isFirstNight &&
      firstNightOnly &&
      snapshot.seats.some(
        (s) =>
          s.role?.id === "pixie" &&
          !s.isDead &&
          ((s as any).pixieCopiedRole === entry.roleId ||
            (s as any).acquiredAbilities?.includes?.(entry.roleId)) &&
          !(s as any).pixieAbilityUsed
      );

    // 🧠 哲学家能力继承（2026-09-20 泛化，SST：utils/grantedAbilityHelper）
    //   官方范例：「哲学家选择获得筑梦师能力。**从现在起，他将在筑梦师应该行动时
    //   进行行动。**」→ 与"首夜限定"无关：被继承角色是首夜角色就首夜行动，
    //   是每夜角色就每夜行动；能力性质/频次**完全照搬原角色**。
    //   ⚠️ 与 pixie 的关键差异：pixie 仅在"非首夜 + 被继承角色是首夜角色"时才需要
    //      特殊放行（因为首夜已过）；哲学家则**任何夜**都要参与，故不设 firstNightOnly 条件。
    //   ⚠️ 判据一律走 seatHasAcquiredAbility，绝不再内联 role.id 比较。
    //   ⚠️ 一次性语义：若该能力**已被消耗**（一次性技能用过一次），不得再入队，
    //      否则会持续空唤醒说书人（用户实测明确反对的行为）。
    const philosopherGrantingSeat = findAbilityGrantingSeat(
      snapshot.seats as any[],
      entry.roleId
    );
    const hasPhilosopherGrantedAbility = Boolean(philosopherGrantingSeat);
    const philosopherGrantAbilityConsumed = philosopherGrantingSeat
      ? isInheritedAbilityConsumed(
          philosopherGrantingSeat,
          entry.roleId,
          isFirstNight
        )
      : false;

    if (
      !isFirstNight &&
      firstNightOnly &&
      !(isSystemEvilInfo && poppyGrowerDiedAndTriggersEvil) &&
      !hasPixiePendingInheritedAbility &&
      !(hasPhilosopherGrantedAbility && !philosopherGrantAbilityConsumed)
    ) {
      return false;
    }
    // 首夜已结束后，即使某些规则把后续夜序重置为“首夜”，
    // 首夜信息角色也绝不重复唤醒。
    if (
      firstNightOnly &&
      (snapshot as any).hasCompletedFirstNight &&
      !(isSystemEvilInfo && poppyGrowerDiedAndTriggersEvil) &&
      !hasPixiePendingInheritedAbility &&
      !(hasPhilosopherGrantedAbility && !philosopherGrantAbilityConsumed)
    ) {
      return false;
    }

    // 罂粟种植者状态判定：
    // 在首夜，如果罂粟种植者在场且健康（存活且未中毒未醉酒），爪牙互认与军团互认步骤绝不进队列！
    const isPoppyGrowerAlive = snapshot.seats.some(
      (s) =>
        s.role?.id === "poppy_grower" &&
        !s.isDead &&
        !s.isDrunk &&
        !s.isPoisoned
    );
    // 🌾 农夫：官方「当你在**夜晚死亡时**，一名存活的善良玩家会变成农夫」
    //    → **条件触发**，不是每夜唤醒。nightOrder 条目描述亦为
    //      「**如果**农夫死于夜晚，唤醒一名存活的善良玩家告知他角色变化」。
    //    若本夜没有农夫死亡，本步骤不得进队列 —— 否则说书人每夜被空唤醒，
    //    且引导退化为占位文案「唤醒N号【农夫】，准备执行技能。」。
    //    ⚠️ 判据必须用「夜间死亡」而非 `isDead`：官方明确
    //      「在**白天**死亡的农夫（例如因处决而死亡）无法创造新的农夫」。
    //    注：roles/new_engine/farmer.ability.ts 的 preCheck 也会 abort，
    //    但那要等到"已进队列并执行"才生效，队列层不收进来才是根因修复。
    if (entry.roleId === "farmer") {
      const hasFarmerDiedAtNight = snapshot.seats.some(
        (s) =>
          (s.role?.id === "farmer" ||
            (s as any).charadeRole?.id === "farmer") &&
          (Boolean((s as any).diedAtNight) ||
            Boolean((snapshot as any).deadThisNight?.includes?.(s.id)))
      );
      if (!hasFarmerDiedAtNight) return false;
    }

    // 系统信息步骤（minion_info / demon_info / legion_mutual_recognition）：找到对应玩家，不需要精确 roleId 匹配
    if (entry.roleId === "minion_info") {
      // 首夜：若罂粟种植者存活且健康，爪牙互认直接取消！
      if (isFirstNight && isPoppyGrowerAlive) {
        return false;
      }
      // 非首夜：仅在罂粟种植者刚死亡且需要进行邪恶互认时才触发
      if (!isFirstNight && !poppyGrowerDiedAndTriggersEvil) {
        return false;
      }
      // 官方：「提线木偶不会在游戏的首个夜晚被唤醒以得知其他邪恶玩家都有谁。」
      // 它以为自己善良，因此不参与爪牙互认；若场上唯一的爪牙就是提线木偶，本步骤直接取消。
      const seat = snapshot.seats.find(
        (s) => isRealMinion(s) && (includeDead || !s.isDead)
      );
      if (!seat) return false;
      return true;
    }
    if (entry.roleId === "demon_info") {
      // 恶魔信息：
      // 首夜：恶魔总会唤醒（以获取 3 个伪装），但在罂粟种植者存活时，恶魔不能得知爪牙/同伴是谁
      // 非首夜：仅在罂粟种植者死亡触发邪恶互认时才再次唤醒
      if (!isFirstNight && !poppyGrowerDiedAndTriggersEvil) {
        return false;
      }
      // 军团合并专项：如果场上恶魔全为军团且包含军团互认步骤，则所有军团统一在军团互认步骤一同唤醒并获取 3 个不在场伪装，不再生成单独的 demon_info 步骤
      const hasLegionInPlay = snapshot.seats.some(
        (s) => s.role?.id === "legion" && (includeDead || !s.isDead)
      );
      const hasLegionMutualInOrder = order.some(
        (e) => e.roleId === LEGION_MUTUAL_RECOGNITION_ID
      );
      const hasNonLegionDemon = snapshot.seats.some(
        (s) =>
          s.role?.type === "demon" &&
          s.role?.id !== "legion" &&
          (includeDead || !s.isDead)
      );

      if (hasLegionInPlay && hasLegionMutualInOrder && !hasNonLegionDemon) {
        return false;
      }

      const seat = snapshot.seats.find(
        (s) =>
          s.role?.type === "demon" &&
          (!hasLegionInPlay || hasNonLegionDemon
            ? s.role?.id !== "legion"
            : true) &&
          (includeDead || !s.isDead)
      );
      // 🌀 A1：疯子（lunatic）在首夜必须"如同真正的恶魔"被唤醒以获取
      //    「三个不在场的角色 + 与人数相符的爪牙」（官方原文见
      //    json/wiki_crawl/parsed_roles.json「疯子」）。
      //    因此即使没有额外的恶魔座位需要 demon_info，只要场上有存活疯子，
      //    demon_info 步骤仍必须保留（其行动者由下方 1.5 展开为疯子座位）。
      const lunaticActor = snapshot.seats.find(
        (s) => s.role?.id === "lunatic" && (includeDead || !s.isDead)
      );
      if (!seat && !lunaticActor) return false;
      return true;
    }
    if (entry.roleId === LEGION_MUTUAL_RECOGNITION_ID) {
      // 军团互认：
      // 首夜：若罂粟种植者存活且健康，军团互认绝不进队列（军团不互认）！
      if (isFirstNight && isPoppyGrowerAlive) {
        return false;
      }
      // 非首夜：仅在罂粟种植者刚死亡且需要进行邪恶互认时才触发
      if (!isFirstNight && !poppyGrowerDiedAndTriggersEvil) {
        return false;
      }
      return snapshot.seats.some(
        (s) => s.role?.id === "legion" && (includeDead || !s.isDead)
      );
    }

    // 🌀 A5：疯子（Lunatic）按 seat.apparentDemonRole 的夜间优先级被唤醒。
    //    - 首夜：官方流程是"展示三个不在场角色 + 与人数相符的爪牙"，不杀人
    //      （见 json/wiki_crawl/parsed_roles.json「疯子」角色简介 2）。
    //      因此仅当假恶魔本身在首夜也有行动（如卡扎力）时才保留疯子的首夜行动节点。
    //    - 其它夜晚：照假恶魔的 otherNightPriority；假恶魔不行动时回退疯子自身优先级，
    //      保证"每个夜晚都被唤醒发动攻击"（官方角色简介 1）。
    if (entry.roleId === "lunatic") {
      const lunaticSeat = snapshot.seats.find(
        (s) => s.role?.id === "lunatic" && (includeDead || !s.isDead)
      );
      const apparentId = (lunaticSeat as any)?.apparentDemonRole?.id as
        | string
        | undefined;
      const apparentEntry = apparentId
        ? order.find((e) => e.roleId === apparentId)
        : undefined;
      if (isFirstNight) {
        const apparentFirst = apparentEntry?.firstNightPriority ?? 0;
        if (!(apparentFirst > 0)) return false;
      }
    }

    // 🔧 红唇女郎（Scarlet Woman）为纯被动角色，不在首夜或非首夜作为红唇女郎唤醒。
    //   若恶魔死亡且满足≥5人存活，她将自动变身并继承恶魔身份（在恶魔行动环节作为恶魔行动）。
    if (entry.roleId === "scarlet_woman") {
      return false;
    }

    // 告密者（Snitch）为纯被动角色，夜间不单独唤醒。
    // 其被动伪装直接在首夜爪牙互认（minion_info）环节向爪牙独立展示。
    if (entry.roleId === "snitch") {
      return false;
    }

    // 找到对应的座位（默认只找存活玩家）
    // includeDead 全局覆盖 + deadActorWakes 角色级覆盖（如间谍死后仍唤醒）
    // + **deathTriggered 角色级覆盖**（见下方 P1-16 说明）
    const effectiveIncludeDead = (entry as any).deadActorWakes || includeDead;
    const directSeat = snapshot.seats.find(
      (s) =>
        getEffectiveRoleId(s) === entry.roleId &&
        (effectiveIncludeDead || !s.isDead)
    );

    // 🎭 能力继承（SST：utils/grantedAbilityHelper）
    //   小精灵 / 哲学家「角色不变、能力叠加」——原角色不在场时由继承者顶上其行动槽。
    const grantingSeat = !directSeat
      ? findAbilityGrantingSeat(snapshot.seats as any[], entry.roleId)
      : undefined;

    const seat = directSeat || grantingSeat;

    if (!seat) {
      return false;
    }

    // 🔧 死亡触发型角色（守鸦人等 ON_DEATH）：仅当该玩家今晚死亡时唤醒。
    //   此前守鸦人存活时也会被加入夜间队列（guide 显示"守鸦人，请睁眼"），
    //   与"如果你在夜晚死亡，你会被唤醒"规则不符。
    if (entry.deathTriggered) {
      const deadThisNight = (snapshot as any).deadThisNight ?? [];
      const diedThisNight = seat.isDead && deadThisNight.includes(seat.id);
      if (!diedThisNight) {
        return false;
      }
    }

    // 🔔 【他人死亡订阅】声明了 `deathEventWatch` 的角色（如唱诗男孩订阅国王）：
    //   队列生成时死亡事件**尚未发生**（恶魔还没行动）⇒ **一律静态排除**，
    //   只在运行时由死亡事件分发器（`resolveDeathEventWakeups`）动态插入。
    //   ⚠️ 此前它靠 `otherNightPriority: 84` 每夜入队（说书人看到多余步骤），
    //      且「国王是否被杀」无从判断 ⇒ 现已统一到死亡事件分发。
    if (hasDeathEventWatch(entry.roleId)) {
      return false;
    }

    // 🏹 赏金猎人：官方「每当你**得知**的玩家死亡，你会在**当晚**得知另一名邪恶玩家」
    //    → 这是**条件唤醒**，不是每夜唤醒。首夜必唤醒（得知第一名邪恶玩家）；
    //      其后仅在"当前得知的那名玩家已死亡"的当晚唤醒。
    //    ⚠️ 判据取 `bountyHunterKnownTargets` 的末项（= 魔典上"得知"标记所在的那名），
    //       官方口径是"放置「得知」标记的玩家死亡时"才移动标记。
    //    ⚠️ 与 roles/new_engine/bounty_hunter.ability.ts 的 `rotationOnlyAfterKnownDeathCheck`
    //       **同源**：那边是执行期兜底，这里才是根因（不让它进队列）。
    if (entry.requiresKnownTargetDead) {
      if (isFirstNight) {
        // 首夜必唤醒（官方：在你的首个夜晚，你会得知一名邪恶玩家）
      } else {
        // ⚠️⚠️ 2026-09-20 修复 P1-1：**判据改用座位级「赏金已知」标记**。
        //   旧实现读 `snapshot.bountyHunterKnownTargets` —— 该字段是**幽灵**：
        //     · 生产快照（useGameController 的队列预览）**从不写入它**；
        //     · 管道内 `saveResult` 写进 `ctx.snapshot`，而管道快照**不回流 React**。
        //   ⇒ 门恒走「没有已知记录 → 不拦截」兜底 → **赏金猎人每夜都被排进队列**、
        //      白送一名邪恶玩家（官方只在"得知目标死亡"当晚唤醒）。
        //
        //   正解：与 legacy `roles/townsfolk/bounty_hunter.ts::shouldWake` **同源**，
        //   读 `seat.statusDetails` 里的 `"赏金已知"` —— 这个标记是**真正落地**的
        //   （由 saveResult 写座位 → 经 setSeats 回流 state）。
        const knownSeats = snapshot.seats.filter((s: any) =>
          (s.statusDetails ?? []).includes("赏金已知")
        );
        // 兼容保留：若上层确实提供了 snapshot 级记录，两者取并集
        const knownIds: number[] = (
          (snapshot as any).bountyHunterKnownTargets ?? []
        )
          .concat(knownSeats.map((s: any) => s.id));

        if (knownIds.length === 0) {
          // 异常兜底：没有"已知"记录时不做拦截，交回执行期判定
        } else {
          const current = knownIds[knownIds.length - 1];
          const knownSeat = snapshot.seats.find((s: any) => s.id === current);
          const deadThisNight: number[] = (snapshot as any).deadThisNight ?? [];
          const knownIsDead =
            !knownSeat ||
            knownSeat.isDead === true ||
            deadThisNight.includes(current);
          if (!knownIsDead) return false;
        }
      }
    }

    // 🔧 送葬者：仅当日有玩家死于处决时才唤醒（规则"如果当天有任何玩家死于处决，唤醒送葬者"）。
    //   平票平安日 / 镇长免疫处决（未死亡）等场景无玩家死于处决，不应唤醒。
    if (entry.requiresExecutedToday) {
      const todayExecutedId = (snapshot as any).todayExecutedId as
        | number
        | null
        | undefined;
      // 判定：快照级 todayExecutedId 对应座位必须处于死亡状态（且死于处决），
      // 或座位级 executedToday 标记 + isDead（killPlayer 处决死亡时写入 executedToday）
      const hasDeathByExecution = snapshot.seats.some(
        (s: any) =>
          s.isDead &&
          (s.executedToday === true ||
            (typeof todayExecutedId === "number" && s.id === todayExecutedId))
      );
      if (!hasDeathByExecution) {
        return false;
      }
    }

    // 🤹 杂耍艺人（Juggler）：仅在白天声明并使用技能后，当晚才唤醒
    if (entry.roleId === "juggler") {
      if (isFirstNight) return false;
      const hasUsed =
        seat.hasUsedDayAbility ||
        (seat as any).dayAbilityResult?.correctCount !== undefined ||
        (snapshot as any).jugglerCorrectCount !== undefined;
      if (!hasUsed) {
        return false;
      }
    }

    // 自定义过滤
    if (customFilter && !customFilter(entry, seat)) {
      return false;
    }

    return true;
  });

  // 1.5 系统步骤展开：爪牙互认按「每名真爪牙一个步骤」展开
  // 官方：所有爪牙都应在首夜得知恶魔是谁、其他爪牙是谁。
  // 电子化下不需要「同时唤醒」，但必须逐一唤醒**每一名真爪牙**——
  // 旧实现只有一个 minion_info 条目、只绑定一名行动者，场上有 2~3 名真爪牙时
  // 只有第一人能拿到信息，其余爪牙完全收不到（用户实测指出）。
  // 判定一律走唯一事实来源 isRealMinion（排除提线木偶）。
  const expandedEntries: Array<NightOrderEntry & { actorSeatId?: number }> = [];
  for (const entry of validEntries) {
    if (entry.roleId === EVIL_CONVERTED_NOTICE_ID) {
      expandedEntries.push({ ...entry, actorSeatId: convertedSeat!.id });
      continue;
    }
    if (entry.roleId === "minion_info") {
      const realMinions = snapshot.seats
        .filter((s) => isRealMinion(s) && (includeDead || !s.isDead))
        .sort((a, b) => a.id - b.id);
      // 真爪牙数为 0 时上方过滤已剔除该条目；此处兜底不再展开，避免产生无行动者的空步骤
      for (const minionSeat of realMinions) {
        expandedEntries.push({ ...entry, actorSeatId: minionSeat.id });
      }
      continue;
    }
    if (entry.roleId === "demon_info") {
      // 🌀 A1：恶魔互认步骤按「每名"以为自己是恶魔"的行动者」展开。
      //    真恶魔保持原有的单一节点（不改变既有行为与测试预期），
      //    另外为**每一名存活疯子**追加一个专属节点：
      //    同一个 generateSystemInfoViaAdapter("demon_info") 逻辑作用在疯子座位上，
      //    于是疯子拿到与真恶魔同款的「爪牙 + 3 张不在场伪装」——
      //    不新增一套并行实现，也就不会两边不一致。
      //    注意：真爪牙的 minion_info 完全不因疯子的存在而变化（A1 硬要求）。
      //    ⚠️ 真恶魔节点只有在"确实有恶魔座位"时才展开：否则 validEntries 虽因
      //       疯子而保留了本条目，step 3 却找不到行动者 → seat.id 抛 TypeError
      //       （浏览器实测崩过一次）。这里把行动者座位**预先钉死**，从根上杜绝。
      const realDemonSeat = snapshot.seats.find(
        (s) => s.role?.type === "demon" && (includeDead || !s.isDead)
      );
      if (realDemonSeat) {
        expandedEntries.push({ ...entry, actorSeatId: realDemonSeat.id });
      }
      const lunatics = snapshot.seats
        .filter((s) => s.role?.id === "lunatic" && (includeDead || !s.isDead))
        .sort((a, b) => a.id - b.id);
      for (const lunaticSeat of lunatics) {
        const apparentRole = (lunaticSeat as any).apparentDemonRole;
        const apparentName = apparentRole?.name ?? "恶魔";
        // 🌀 2026-09-12：疯子伪装成军团时这一步是「军团互认」而非「恶魔互认」——
        //    军团没有爪牙，它的信息形态是"军团玩家互相认亲"。
        const stepLabel =
          apparentRole?.id === "legion" ? "军团互认" : "恶魔互认";
        expandedEntries.push({
          ...entry,
          actorSeatId: lunaticSeat.id,
          roleName: `${apparentName}(${stepLabel})`,
          meta: { isLunaticDisguisedDemon: true },
        } as any);
      }
      continue;
    }
    expandedEntries.push(entry);
  }

  // 2. 按优先级排序（根据是否为第一夜选择对应的优先级）
  //    Array.prototype.sort 是稳定排序：同为 minion_info 的多名爪牙保持座位升序
  //
  // 🌀 疯子（Lunatic）排序规则（2026-09-12 按用户实测修正，推翻旧 A5 设计）：
  //  ①【行动节点】用**疯子自己的官方槽位**（首夜 33 / 其它夜 62），
  //    **不受假恶魔身份影响**。
  //    官方夜序表本身就把疯子排在所有恶魔之前（62 < 恶魔 67~84），
  //    这正是「在恶魔被唤醒发动攻击前，唤醒疯子」的实现方式。
  //    ⚠️ 事故：曾改成"照假恶魔的优先级"（旧 A5），当假恶魔晚于真恶魔时
  //       （疯子以为涡流 78 / 真恶魔小恶魔 67）疯子被排到恶魔**之后** →
  //       恶魔行动时 seat.lunaticTargetIds 还没写入 → 恶魔永远看不到本夜选择。
  //    ⚠️ 与酒鬼/提线木偶的区别：那些角色是"扮演某**镇民**"，必须用假身份时序
  //       才能在正确的时点醒来；疯子是"扮演**恶魔**"，而官方已给它固定槽位，
  //       替换成假恶魔槽位既没必要、又会破坏"恶魔行动前唤醒疯子"。
  //  ②【疯子专属的 demon_info 节点】必须排在真恶魔的 demon_info **之前**：
  //    官方「唤醒疯子并向他提供恶魔信息。**随后**在恶魔信息环节对恶魔提供
  //    疯子的相关信息。」→ 疯子先、真恶魔后。
  //    ⚠️ 这两个节点 roleId 都是 "demon_info"，且展开时真恶魔先入队、疯子后入队，
  //       优先级相同 → 稳定排序会保持"真恶魔在前"，正是用户实测到的错误顺序。
  //       因此必须显式给疯子节点一个更小的优先级（-0.5 步长，夜序里 1.5/2.5 已在用）。
  const priorityOf = (entry: NightOrderEntry): number => {
    const base = isFirstNight
      ? entry.firstNightPriority
      : entry.otherNightPriority;
    if ((entry as any).meta?.isLunaticDisguisedDemon) {
      return base - 0.5;
    }
    return base;
  };
  expandedEntries.sort((a, b) => priorityOf(a) - priorityOf(b));

  // 3. 转换为NightActionNode格式
  //    ⚠️ 防御：任何解析不到行动者座位的条目直接丢弃（而不是在 seat.id 上崩）。
  const queue: NightActionNode[] = expandedEntries
    .map((entry): NightActionNode | null => {
    // 系统信息步骤：按角色类型查找座位
    let seat: any;
    if (entry.roleId === "minion_info") {
      // 展开后的每个节点都绑定自己的行动者座位（多名真爪牙各占一步），
      // 因此信息按行动者座位生成，每名爪牙都能得知恶魔与其他真爪牙。
      const pinnedSeatId = entry.actorSeatId;
      seat =
        pinnedSeatId != null
          ? snapshot.seats.find((s) => s.id === pinnedSeatId)!
          : snapshot.seats.find((s) => isRealMinion(s) && !s.isDead)!;
    } else if (entry.roleId === "demon_info") {
      // 🌀 A1：疯子专属的 demon_info 节点由 1.5 展开时钉死行动者座位
      //    （真恶魔节点仍按"第一个存活恶魔"解析，行为不变）。
      seat =
        entry.actorSeatId != null
          ? snapshot.seats.find((s) => s.id === entry.actorSeatId)!
          : snapshot.seats.find((s) => s.role?.type === "demon" && !s.isDead)!;
    } else if (entry.roleId === EVIL_CONVERTED_NOTICE_ID) {
      // 行动者 = 被赏金猎人转变为邪恶的那名镇民（信息按行动者座位生成）
      seat = snapshot.seats.find((s) => s.id === entry.actorSeatId)!;
    } else if (entry.roleId === LEGION_MUTUAL_RECOGNITION_ID) {
      seat = snapshot.seats.find((s) => s.role?.id === "legion" && !s.isDead)!;
    } else {
      seat = snapshot.seats.find(
        (s) =>
          getEffectiveRoleId(s) === entry.roleId &&
          (includeDead || (entry as any).deadActorWakes || !s.isDead)
      );
      // 🎭 能力继承兜底（SST：utils/grantedAbilityHelper）
      if (!seat) {
        seat = findAbilityGrantingSeat(snapshot.seats as any[], entry.roleId);
      }
    }

    // ⚠️ 防御：解析不到行动者座位的条目直接丢弃，绝不在 seat.id 上崩。
    if (!seat) return null;

    // 🎭 继承者代打：行动者角色 ≠ 本条目角色（原角色不在场，由继承者顶上）
    const isInheritedActor =
      seat?.role?.id !== entry.roleId &&
      seatHasAcquiredAbility(seat, entry.roleId);

    const roleName =
      entry.roleId === "demon_info" && seat?.role?.name
        ? // 🌀 2026-09-12：疯子伪装成**军团**时，这一步是「军团互认」而不是「恶魔互认」。
          //    军团没有爪牙，它的信息形态是"军团玩家互相认亲"
          //    （用户实测：显示「军团(恶魔互认)」与军团的身份自相矛盾）。
          //    ⚠️ 注意：这里的名字取自**座位真实角色名**（疯子/小恶魔…），
          //    所以疯子会显示成「疯子(军团互认)」——这是说书人侧的正确称呼。
          `${seat.role.name}(${
            (seat as any).apparentDemonRole?.id === "legion"
              ? "军团互认"
              : "恶魔互认"
          })`
        : isInheritedActor
          ? // 🧚 小精灵 →「(小精灵)」；🧠 哲学家 →「(哲学家)」
            `${entry.roleName}(${
              seat.role?.id === "philosopher" ? "哲学家" : "小精灵"
            })`
          : entry.roleName;

    const wakeMessage = isInheritedActor
      ? `唤醒${seat.id + 1}号【${
          seat.role?.id === "philosopher" ? "哲学家" : "小精灵"
        }】（使用【${entry.roleName}】能力）`
      : entry.wakeMessage;

    return {
      seatId: seat.id,
      roleId: entry.roleId,
      roleName,
      priority: priorityOf(entry),
      isFirstNightOnly: entry.firstNightOnly,
      abilityId: entry.abilityId,
      wakeMessage,
      firstNightPriority: entry.firstNightPriority,
      otherNightPriority: entry.otherNightPriority,
      targetIds: [],
      processed: false,
      success: false,
      meta: {
        // 保留 1.5 展开时写入的标记（如 isLunaticDisguisedDemon）
        ...((entry as any).meta ?? {}),
        // 🎭 能力继承标记（SST 助手判定；哲学家与小精灵同构）
        ...(isInheritedActor
          ? {
              isInheritedAbilityActor: true,
              originalRoleId: seat.role?.id,
              inheritedAbilityRoleId: entry.roleId,
              // 兼容旧消费点（历史上仅小精灵使用）
              ...(seat.role?.id === "pixie"
                ? { isPixieInherited: true, originalRoleId: "pixie" }
                : {}),
            }
          : {}),
      },
    };
  })
    .filter((node): node is NightActionNode => node !== null) as NightActionNode[];

  // 4. 军团互认与军团夜间统一唤醒节点打标及文案生成
  const flagLegion = queue.map((node) => {
    if (node.roleId === LEGION_MUTUAL_RECOGNITION_ID) {
      const aliveLegions = snapshot.seats.filter(
        (s) =>
          (getEffectiveRoleId(s) === "legion" || s.role?.id === "legion") &&
          (includeDead || !s.isDead)
      );
      const seatListStr =
        aliveLegions.length > 0
          ? aliveLegions.map((s) => `${s.id + 1}号`).join("、")
          : "无";
      return {
        ...node,
        roleName: "军团互认",
        wakeMessage: `座位号：${seatListStr}。说书人同时唤醒所有的军团玩家，军团玩家互认`,
        meta: {
          ...node.meta,
          isLegionMutualRecognition: true,
          isLegionUnified: true,
          legionSeatIds: aliveLegions.map((s) => s.id),
        },
      };
    }
    if (node.roleId === "legion") {
      const aliveLegions = snapshot.seats.filter(
        (s) => getEffectiveRoleId(s) === "legion" && (includeDead || !s.isDead)
      );
      const seatListStr =
        aliveLegions.length > 0
          ? aliveLegions.map((s) => `${s.id + 1}号`).join("、")
          : "无";
      return {
        ...node,
        roleName: "军团",
        wakeMessage: `座位号：${seatListStr}。说书人同时唤醒所有的军团玩家`,
        meta: {
          ...node.meta,
          isLegionUnified: true,
          legionSeatIds: aliveLegions.map((s) => s.id),
        },
      };
    }
    return node;
  });

  // 5. 军团统一行动节点合并：确保无论场上有多少军团玩家或夜序条目，仅产出 1 个军团夜间唤醒节点
  const seenRoleIds = new Set<string>();
  const consolidatedQueue = flagLegion.filter((node) => {
    if (node.roleId === "legion") {
      if (seenRoleIds.has("legion")) {
        return false;
      }
      seenRoleIds.add("legion");
    }
    return true;
  });

  // 6. 镜像双子（Evil Twin）：首夜向对立善良双子告知"X号是镜像双子"
  // 情况 1：若善良双子在首夜本身不会被唤醒（如士兵、圣徒、管家、镇长等无夜间行动角色），单独注入唤醒节点告知
  if (isFirstNight) {
    const { evilTwinSeat, goodTwinSeat } = resolveEvilTwinPair(
      snapshot.seats as any,
      snapshot.evilTwinPair
    );
    if (evilTwinSeat && goodTwinSeat) {
      const hasGoodTwinInQueue = consolidatedQueue.some(
        (n) => n.seatId === goodTwinSeat.id
      );
      if (!hasGoodTwinInQueue) {
        const evilTwinIdx = consolidatedQueue.findIndex(
          (n) => n.roleId === "evil_twin"
        );
        const insertIdx =
          evilTwinIdx !== -1 ? evilTwinIdx + 1 : consolidatedQueue.length;
        const goodTwinNode: NightActionNode = {
          seatId: goodTwinSeat.id,
          roleId: "good_twin_info",
          roleName: `${goodTwinSeat.role?.name || "善良双子"}(双子告知)`,
          priority: 38.5,
          isFirstNightOnly: true,
          abilityId: "good_twin_info",
          wakeMessage: `唤醒${goodTwinSeat.id + 1}号【${goodTwinSeat.role?.name || "对立双子"}】，告知他：${evilTwinSeat.id + 1}号是镜像双子。`,
          firstNightPriority: 38.5,
          otherNightPriority: null,
          targetIds: [],
          processed: false,
          success: false,
          meta: {
            isGoodTwinInfo: true,
            evilTwinSeatId: evilTwinSeat.id,
          },
        };
        consolidatedQueue.splice(insertIdx, 0, goodTwinNode);
      }
    }
  }

  return consolidatedQueue;
}

/**
 * 队列迭代器，支持记录当前位置、前进、回退等操作
 */
export class NightQueueIterator {
  private _queue: NightActionNode[];
  private _currentIndex: number = -1;
  private _processedNodes: Set<string> = new Set();

  constructor(queue: NightActionNode[]) {
    this._queue = [...queue];
  }

  /** 完整队列 */
  get queue(): NightActionNode[] {
    return [...this._queue];
  }

  /** 当前索引 */
  get currentIndex(): number {
    return this._currentIndex;
  }

  /** 当前节点 */
  get currentNode(): NightActionNode | null {
    return this._queue[this._currentIndex] ?? null;
  }

  /** 队列长度 */
  get length(): number {
    return this._queue.length;
  }

  /** 是否还有下一个节点 */
  get hasNext(): boolean {
    return this._currentIndex < this._queue.length - 1;
  }

  /** 是否已结束 */
  get isEnd(): boolean {
    return this._currentIndex >= this._queue.length - 1;
  }

  /**
   * 移动到下一个节点
   * @returns 下一个节点，没有则返回null
   */
  next(): NightActionNode | null {
    if (this.hasNext) {
      this._currentIndex++;
      const node = this._queue[this._currentIndex];
      this._processedNodes.add(`${node.seatId}-${node.abilityId}`);
      return node;
    }
    return null;
  }

  /**
   * 回退到上一个节点
   * @returns 上一个节点，没有则返回null
   */
  prev(): NightActionNode | null {
    if (this._currentIndex > 0) {
      this._currentIndex--;
      return this._queue[this._currentIndex];
    }
    return null;
  }

  /**
   * 🔧 夜间中途动态插入节点（插入到当前节点之后）。
   * 用于死亡触发型角色（守鸦人 ON_DEATH）：恶魔在夜间杀死的守鸦人
   * 需要在当前行动节点之后立即插入觉醒节点。
   * @param node 要插入的夜间行动节点
   */
  insertAfterCurrent(node: NightActionNode): void {
    if (this._currentIndex >= this._queue.length - 1) {
      // 当前是最后一个节点 → 追加到队尾
      this._queue.push(node);
      return;
    }
    this._queue.splice(this._currentIndex + 1, 0, node);
  }

  /**
   * 跳转到指定索引
   * @param index 目标索引
   * @returns 是否跳转成功
   */
  jumpTo(index: number): boolean {
    if (index >= 0 && index < this._queue.length) {
      this._currentIndex = index;
      return true;
    }
    return false;
  }

  /**
   * 检查节点是否已处理
   * @param node 要检查的节点
   * @returns 是否已处理
   */
  isProcessed(node: NightActionNode): boolean {
    return this._processedNodes.has(`${node.seatId}-${node.abilityId}`);
  }

  /**
   * 重置迭代器
   */
  reset(): void {
    this._currentIndex = -1;
    this._processedNodes.clear();
  }
}

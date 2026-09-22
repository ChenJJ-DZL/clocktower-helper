// ======================================================================
//  限次能力统一管理器（简化版）
// ======================================================================
//
// 变更说明：
//   v2 — 移除6个冗余别名函数，抽取公共定义查找逻辑，简化角色变化重置逻辑
//

/**
 * 限次能力定义接口
 */
export interface LimitedAbilityDefinition {
  abilityId: string;
  maxUses: number;
  global: boolean;
  consumeWhenDrunkOrPoisoned?: boolean;
  resetOnRoleChange?: boolean;
}

// 限次能力管理器状态
const globalUses = new Map<string, number>();
const instanceUses = new Map<string, Map<number, number>>();
const definitions = new Map<string, LimitedAbilityDefinition>();

/**
 * 预定义常见限次能力
 */
const predefinedDefinitions: LimitedAbilityDefinition[] = [
  {
    /**
     * ⚠️ 2026-09-21 修复 D3：原为 `"philosopher_use"`，但**实际调用方**
     *   `philosopher.ability.ts:25,83` 用的是 `"philosopher_gain"`
     *   ⇒ 查不到定义 ⇒ 「每局限一次」**静默失效**。已对齐到实际调用名。
     *   （旧 id `philosopher_use` 经 grep 确认零引用，安全替换。）
     */
    abilityId: "philosopher_gain",
    maxUses: 1,
    global: false,
    resetOnRoleChange: true,
  },
  {
    /**
     * ⚠️ 2026-09-21 新增（D3）：`juggler.ability.ts:30,182` 调用此 id，
     *   但本表**从未注册过它**，且全仓无自注册 ⇒ 「每局限一次」静默失效。
     */
    abilityId: "juggler_guess",
    maxUses: 1,
    global: false,
    resetOnRoleChange: true,
  },
  {
    /**
     * ⚠️ 2026-09-21 新增（D3）：`fisherman.ability.ts:27,59` 调用此 id，
     *   但本表**从未注册过它** ⇒ 「每局限一次」静默失效。
     *   （渔夫：每局一次「向说书人求建议」。）
     */
    abilityId: "fisherman_advice",
    maxUses: 1,
    global: false,
    resetOnRoleChange: true,
  },
  {
    /**
     * ⚠️ 2026-09-21 新增（D3）：`professor_female.ability.ts:64,171` 调用此 id，
     *   但本表**从未注册过它** ⇒ 「每局限一次」静默失效。
     *   （女教授：每局一次复活一名镇民 —— 与 `professor_resurrect` 同语义、不同 id。）
     */
    abilityId: "professor_female_resurrect",
    maxUses: 1,
    global: false,
    resetOnRoleChange: true,
  },
  {
    /**
     * ⚠️⚠️ 2026-09-21 修复 P0（子 agent 审计 + 我逐条核验确认）：
     *   这里原先注册的是 `"artist_paint"` / `"seamstress_ability"`，
     *   但**实际调用方**用的是 `"artist_question"` / `"seamstress_check"`：
     *     · `src/roles/new_engine/artist.ability.ts:25,63`
     *     · `src/roles/new_engine/seamstress.ability.ts:27,149`
     *   而 `resolveDef()`（本文件 :76-78）查不到定义时，
     *   `canUseLimitedAbility`(:107) 与 `consumeLimitedAbility`(:122) **都直接 return true**
     *   ⇒ **限制完全失效**：「艺术家/女裁缝每局限一次」形同虚设，可无限次发动
     *     （且 `instanceUses` / `globalUses` 根本不记账）。
     *
     *   两个旧 id 经 grep 全仓确认**零引用**（只在定义处出现）⇒ 直接对齐到实际使用名。
     *   🔒 若将来新增限次能力，**务必让调用方 id 与本表严格一致**，
     *     因为「查不到定义」是**静默放行**而不是报错。
     */
    abilityId: "artist_question",
    maxUses: 1,
    global: false,
    resetOnRoleChange: true,
  },
  {
    abilityId: "seamstress_check",
    maxUses: 1,
    global: true,
    resetOnRoleChange: false,
  },
  {
    abilityId: "professor_resurrect",
    maxUses: 1,
    global: false,
    resetOnRoleChange: true,
  },
  {
    abilityId: "courtier_drunk",
    maxUses: 1,
    global: false,
    consumeWhenDrunkOrPoisoned: true,
    resetOnRoleChange: true,
  },
  {
    abilityId: "assassin_kill",
    maxUses: 1,
    global: false,
    consumeWhenDrunkOrPoisoned: true,
    resetOnRoleChange: true,
  },
  {
    abilityId: "shabaloth_double_kill",
    maxUses: 1,
    global: true,
    resetOnRoleChange: false,
  },
];

/** 抽取公共定义查找逻辑 */
function resolveDef(abilityId: string, custom?: LimitedAbilityDefinition) {
  const def = custom ?? definitions.get(abilityId);
  /**
   * ⚠️ 2026-09-21（D3-①）：把「**静默**放行」变成「**可见**放行」。
   *
   * 原实现查不到定义时直接 `return true`，**不记账、不报错**
   * ⇒ 一旦调用方写错 abilityId（已发现 4 个：
   *   `philosopher_gain` / `juggler_guess` / `fisherman_advice` / `professor_female_resurrect`），
   *   「每局限一次」就会**静默失效**，没有任何信号。
   *
   * ⚠️ 这里**只告警、不改变返回值**（仍 `return true`）——
   *   因为若直接改成 `return false`，在定义表未装载的路径上
   *   会让所有限次能力**第一次就被拒**（比现状更糟）。
   *   等 4 个 id 全部对齐/自注册后，再把返回值收紧为 `false` 并配测试。
   */
  if (!def) {
    console.warn(
      `[LimitedAbilityManager] ⚠️ 未注册的限次能力 id: "${abilityId}" —— ` +
        `本次按「无限制」放行（不记账）。` +
        `这通常意味着调用方 id 与定义表不一致，请核对 predefinedDefinitions / 自注册。`
    );
  }
  return def;
}

/**
 * 初始化管理器，加载预定义能力
 */
export function initializeLimitedAbilityManager() {
  predefinedDefinitions.forEach((def) => {
    definitions.set(def.abilityId, def);
  });
}

/**
 * 注册自定义限次能力定义
 */
export function registerLimitedAbilityDefinition(
  definition: LimitedAbilityDefinition
) {
  definitions.set(definition.abilityId, definition);
}

/**
 * 检查能力是否可用
 */
export function canUseLimitedAbility(
  seatId: number,
  abilityId: string,
  customDefinition?: LimitedAbilityDefinition
): boolean {
  const def = resolveDef(abilityId, customDefinition);
  if (!def) return true; // 无定义则默认允许（向后兼容）

  if (def.global) return (globalUses.get(abilityId) ?? 0) < def.maxUses;
  return (instanceUses.get(abilityId)?.get(seatId) ?? 0) < def.maxUses;
}

/**
 * 使用限次能力
 */
export function consumeLimitedAbility(
  seatId: number,
  abilityId: string,
  customDefinition?: LimitedAbilityDefinition
): boolean {
  const def = resolveDef(abilityId, customDefinition);
  if (!def) return true;
  if (!canUseLimitedAbility(seatId, abilityId, customDefinition)) return false;

  if (def.global) {
    globalUses.set(abilityId, (globalUses.get(abilityId) ?? 0) + 1);
  } else {
    let seatUses = instanceUses.get(abilityId);
    if (!seatUses) {
      seatUses = new Map();
      instanceUses.set(abilityId, seatUses);
    }
    seatUses.set(seatId, (seatUses.get(seatId) ?? 0) + 1);
  }
  return true;
}

/**
 * 获取已使用次数
 */
export function getLimitedAbilityUsedCount(
  seatId: number,
  abilityId: string
): number {
  const def = resolveDef(abilityId);
  if (!def) return 0;
  if (def.global) return globalUses.get(abilityId) ?? 0;
  return instanceUses.get(abilityId)?.get(seatId) ?? 0;
}

/**
 * 重置能力使用次数
 */
export function resetLimitedAbilityUses(seatId?: number, abilityId?: string) {
  if (abilityId) {
    if (seatId !== undefined) {
      instanceUses.get(abilityId)?.delete(seatId);
    } else {
      globalUses.delete(abilityId);
      instanceUses.delete(abilityId);
    }
  } else {
    globalUses.clear();
    instanceUses.clear();
  }
}

/**
 * 角色变化时重置相关能力使用次数
 */
export function onLimitedAbilityRoleChanged(seatId: number) {
  for (const [abilityId, def] of definitions) {
    if (def.resetOnRoleChange !== false) {
      instanceUses.get(abilityId)?.delete(seatId);
    }
  }
}

/* ============================================================================
 * ⚠️⚠️ 2026-09-21 修复 P0（由 full-snv / full-ws / full-bmr 三方独立审计发现，
 *        我逐条核验确认）：**「每局限一次」在整个生产环境里从未生效**
 * ----------------------------------------------------------------------------
 * 根因链：
 *   ① `definitions`（本文件 :23）是**模块级 Map，初始为空**；
 *   ② `initializeLimitedAbilityManager()`（:98）是**唯一**往 Map 里灌入
 *      `predefinedDefinitions` 的地方；
 *   ③ 而它在**生产代码里零调用** —— 全仓唯一的调用点都在测试文件里
 *      （`bmr_l5_causal.test.ts:123` / `ws_l5_causal.test.ts:122`）。
 *      ⇒ **生产运行时 `definitions` 永远是空 Map**；
 *   ④ `resolveDef()`（:92）查不到即返回 `undefined`
 *      ⇒ `canUseLimitedAbility()`（:117）走 `if (!def) return true` **静默放行**
 *      ⇒ `consumeLimitedAbility()` 同样直接 `return true` **且不记账**。
 *   ⇒ 后果：**艺术家 / 女裁缝 / 哲学家 / 杂耍艺人 / 教授 / 女教授 / 渔夫 /
 *      刺客 / 魔像 / 甄** 等全部限次能力的「每局限一次」**形同虚设，可无限次发动**。
 *
 * 🔒 修法：**模块级自初始化（幂等）**。
 *   任何 `import` 本模块的地方（10 个角色 ability 文件已 import）都会自动装载定义表，
 *   **不依赖任何渲染时序 / 生命周期 / 启动路径**，天然免疫这类「忘了初始化」的缺陷。
 *   ⚠️ 这也修掉了「**测试自己调了一次 initialize，于是测试环境与生产环境是两套行为**」
 *      这个更隐蔽的差异（测试里绿、生产里坏）。
 *
 * ⚠️ 同时保留显式导出的 `initializeLimitedAbilityManager()`（幂等，可重复调用），
 *   以便任何显式初始化点继续工作。
 * ========================================================================== */
initializeLimitedAbilityManager();

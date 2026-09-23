/**
 * 中间件管道
 * 技能执行的标准流程抽象，实现职责链模式
 */

import type { IRoleAbility } from "../roles/core/roleAbility.types";
import { abilityPriorityCalculation } from "./abilityPriorityMiddleware";
import { applyRulesByPhase, collectGlobalRules } from "./globalRuleEngine";
import { getScriptSpecialRules } from "./scriptSpecialRules";
import type {
  AbilityMiddlewareSet,
  MiddlewareContext,
} from "./middlewareTypes";

// 导出公共类型和工具
export { abilityPriorityCalculation } from "./abilityPriorityMiddleware";
export type {
  AbilityMiddlewareSet,
  CalculateMiddleware,
  MiddlewareContext,
  MiddlewareFunction,
  PostProcessMiddleware,
  PreCheckMiddleware,
  StateUpdateMiddleware,
} from "./middlewareTypes";

/**
 * 中间件管道执行器
 * 按顺序执行一组中间件，传递上下文
 */
export async function runMiddlewarePipeline(
  middlewares: Array<
    (context: MiddlewareContext) => Promise<MiddlewareContext>
  >,
  initialContext: MiddlewareContext
): Promise<MiddlewareContext> {
  let context = { ...initialContext };
  for (const middleware of middlewares) {
    if (context.aborted) break;
    context = await middleware(context);
  }
  return context;
}

/**
 * 执行完整的技能处理流程：preCheck → calculate（含优先级）→ stateUpdate → postProcess
 *
 * 预览模式（preview=true）：
 *   只执行 preCheck + calculate，生成预览结果；
 *   跳过 stateUpdate（不修改游戏状态）和 postProcess（不产生副作用）。
 *   调用方应通过返回的 meta 字段获取预览信息，展示确认弹窗。
 */
export async function runFullAbilityPipeline(
  middlewareSet: Partial<AbilityMiddlewareSet>,
  initialContext: MiddlewareContext
): Promise<MiddlewareContext> {
  const empty = async (ctx: MiddlewareContext) => ctx;
  const isPreview = !!initialContext.preview;

  /**
   * ⭐ 2026-09-22：为「剧本级规则：恶魔夜晚不攻击」预先快照**步骤前已死**的座位 id。
   *   消费者的判据是"本步骤**新产生**的死亡" ⇒ 必须先知道步骤前的基线。
   *
   * ⚠️ **必须在规则启用时才写**：早期版本无条件写 `meta` ⇒ 破坏了
   *   「四段全空 = 静默空转」的判据（`ws_l2_matrix` ④ 的护栏自证立刻变红）。
   *   而且对 8 个未声明该规则的剧本，往 `meta` 里塞东西本身就是污染。
   */
  if (
    getScriptSpecialRules({ specialRules: initialContext.scriptSpecialRules })
      .demonCannotKill === true
  ) {
    if (initialContext.meta == null) initialContext.meta = {};
    if (initialContext.meta._scriptRulePreDeadIds === undefined) {
      initialContext.meta._scriptRulePreDeadIds = ((
        initialContext.snapshot?.seats ?? []
      ) as any[])
        .filter((s) => s?.isDead === true)
        .map((s) => s.id);
    }
  }

  const preCheck = middlewareSet.preCheck ?? [empty];
  const calculate = middlewareSet.calculate ?? [empty];
  const stateUpdate = middlewareSet.stateUpdate ?? [empty];
  const postProcess = middlewareSet.postProcess ?? [empty];

  // 注入全局优先级中间件到 calculate 阶段最前面
  const enhancedCalculate = [abilityPriorityCalculation, ...calculate];

  // 收集全局规则（能力注册表声明，模块级缓存；首次调用触发注册表初始化）
  const globalRules = collectGlobalRules();

  let ctx = await runMiddlewarePipeline(preCheck, initialContext);
  if (ctx.aborted) {
    ctx.meta = { ...ctx.meta, _preCheckAborted: true };
    return ctx;
  }

  // 全局规则：before_calculate（如掮客目标重定向）
  ctx = applyRulesByPhase(globalRules, "before_calculate", ctx);

  ctx = await runMiddlewarePipeline(enhancedCalculate, ctx);
  if (ctx.aborted) return ctx;

  // 全局规则：after_calculate（如酿酒师信息替换）
  ctx = applyRulesByPhase(globalRules, "after_calculate", ctx);

  // 预览模式：跳过 stateUpdate 和 postProcess
  if (isPreview) {
    ctx.meta._pipelinePreview = true;
    return ctx;
  }

  ctx = await runMiddlewarePipeline(stateUpdate, ctx);
  if (ctx.aborted) return ctx;

  ctx = await runMiddlewarePipeline(postProcess, ctx);

  // 全局规则：after_execute（如引路人邪恶目标收集）
  return applyRulesByPhase(globalRules, "after_execute", ctx);
}

/**
 * 🃏 **弄臣首次免死的「消费」中间件**（2026-09-22 新增）
 * ==================================================================
 * 官方【弄臣】：「**当你首次将要死亡时，你不会死亡。**」⇒ 免死**只生效一次**，
 *   且**不分死因**（恶魔击杀 / 处决 / 其他能力击杀都适用）。
 *
 * 🔴 修复的缺陷（探针实测）：`foolUsed` / `hasUsedFoolAbility` 的**生产写入点只有**
 *   `fool.ability.ts` —— 而弄臣是 PASSIVE（`fn/on` 皆 null）⇒ **该管道永不运行**
 *   ⇒ 恶魔夜杀路径**从不消费免死** ⇒ **弄臣对恶魔击杀永久免疫**
 *   （实测：涡流连打同一弄臣两次，`isDead` 两次都为 false、`foolUsed` 始终为 null）。
 *
 * ── 为什么这是**单点**、且不会踩「提示预演」的坑 ──────────────────
 *   · 消费必须发生在**结算态**：本中间件被追加到 `postProcess` 末尾，而
 *     `runFullAbilityPipeline` 在 `preview === true` 时**跳过 `stateUpdate` 与 `postProcess`**
 *     ⇒ **提示预演绝不会消耗免死**（这是本项目复发多次的「提示 ≠ 结算」根因，必须避开）。
 *   · 由 `buildAbilityPipe(ability)` 统一注入 ⇒ 覆盖**全部** 10 个恶魔，无需逐文件改。
 *
 * ── 判据（为什么要「推导」而不是读某个标记）────────────────────────
 *   各恶魔记录「被免死拦下」的形态**不一致**：`vortox`/`imp`/`nodashii`… 会写
 *   `blockedBySoldier`，而 `po` 是**逐目标 `continue`**、什么都不写
 *   ⇒ 依赖任何单一字段都会漏。故改为**从结算结果反推**：
 *     ① 只有 `effectSemantics === "kill"` 的能力才可能消耗免死（非击杀能力选到弄臣**不得**误耗）；
 *     ② 能力必须**真的生效**（`abilityEffective !== false`；醉/毒的恶魔压根没杀人 ⇒ 不得消耗）；
 *     ③ 目标里存在**弄臣**，且他：仍存活、未被 `markedForDeath`、**没有其他保护**
 *        （官方：若已被旅店老板/茶艺师等保护，**不消耗**弄臣的免死）、且免死尚未用过；
 *     ⇒ 此时唯一能让他活下来的解释就是**弄臣自己的免死被用掉了** ⇒ 消费。
 */
/**
 * ⭐ 2026-09-22 新增：**剧本级规则 —— 「恶魔不会在夜晚攻击」**（游园惊梦）
 * ------------------------------------------------------------------
 * 官方（游园惊梦）简介逐字：「……**恶魔不会在夜晚攻击**，但是会在固定的天数后自动获胜。……」
 *
 * 语义：**恶魔的夜间能力不造成死亡**。
 *   ⚠️ 只拦「死亡」—— 非死亡效果（如诺-达鲺的"相邻镇民中毒"）**照常生效**
 *   ⇒ 因此**不能**用"从夜序里删掉恶魔节点"来实现（那会把中毒一起砍掉）。
 *   ⚠️ 只拦**恶魔**：爪牙（如刺客）的击杀不受影响 —— 用快照里行动者的 `role.type` 判定。
 *
 * 判据源：`utils/scriptSpecialRules.ts`（本 consumer 只读，不硬编码）。
 * 实现：回滚**本步骤新产生**的死亡（步骤前的死亡集合由 `runFullAbilityPipeline` 预先快照）。
 */
export function createScriptRuleNightKillSuppressor(): (
  context: MiddlewareContext
) => Promise<MiddlewareContext> {
  return async (context: MiddlewareContext): Promise<MiddlewareContext> => {
    const rules = getScriptSpecialRules({
      specialRules: (context as any).scriptSpecialRules,
    });
    if (rules.demonCannotKill !== true) return context;
    if (context.aborted) return context;

    const snapshot: any = context.snapshot;
    if (!snapshot?.seats) return context;

    // 行动者必须是**恶魔**（刺客等爪牙的击杀不受本规则约束）
    const seatId = (context.actionNode as any)?.seatId;
    const actor = snapshot.seats.find((s: any) => s.id === seatId);
    if (actor?.role?.type !== "demon") return context;

    const preDead: number[] =
      (context.meta as any)?._scriptRulePreDeadIds ?? [];
    const pre = new Set(preDead);

    let changed = false;
    const seats = snapshot.seats.map((s: any) => {
      if (s.isDead === true && !pre.has(s.id)) {
        changed = true;
        // 回滚本步骤新产生的死亡（只清死亡相关字段，其它状态不动）
        const next: any = {
          ...s,
          isDead: false,
          markedForDeath: false,
          diedAtNight: undefined,
          diedOnDay: undefined,
          deathSource: undefined,
          deathSourceSeatId: undefined,
          killedBy: undefined,
        };
        return next;
      }
      return s;
    });
    if (!changed) return context;

    return { ...context, snapshot: { ...snapshot, seats } };
  };
}

export function createFoolImmunityConsumer(
  effectSemantics?: string
): (context: MiddlewareContext) => Promise<MiddlewareContext> {
  return async (context: MiddlewareContext): Promise<MiddlewareContext> => {
    // ① 只有击杀类能力会消耗免死
    if (effectSemantics !== "kill") return context;
    if (context.aborted) return context;
    // ② 能力失效（醉酒/中毒）⇒ 根本没发生击杀，不得消耗
    if (context.meta?.abilityEffective === false) return context;

    const r: any = context.meta?.abilityResult;
    if (!r) return context;

    // 收集本次能力涉及的目标 id（不同恶魔的 result 形状不同 ⇒ 逐个字段兜住 + 回落到 actionNode）
    const ids = new Set<number>();
    const push = (v: any) => {
      if (typeof v === "number") ids.add(v);
      else if (Array.isArray(v)) v.forEach(push);
    };
    push(r.targetId);
    push(r.targetIds);
    push(r.killedTargetIds);
    push(r.blockedTargetIds);
    push(r.attemptedTargetIds);
    push((context.actionNode as any)?.targetIds);
    if (ids.size === 0) return context;

    const seats = ((context.snapshot?.seats ?? []) as any[]).slice();
    let changed = false;
    for (const id of ids) {
      const idx = seats.findIndex((s) => s.id === id);
      if (idx < 0) continue;
      const seat = seats[idx];
      if (seat?.role?.id !== "fool") continue;
      const used =
        seat.foolUsed === true ||
        seat.hasUsedFoolAbility === true ||
        seat.hasUsedAbility === true;
      if (used) continue;
      if (seat.isDead === true || seat.markedForDeath === true) continue;
      const hasOtherProtection =
        seat.isProtected === true ||
        (seat.statusEffects ?? []).some((e: any) => e.type === "protected");
      if (hasOtherProtection) continue;

      seats[idx] = {
        ...seat,
        isDead: false,
        foolUsed: true,
        hasUsedFoolAbility: true,
      };
      changed = true;
    }
    if (!changed) return context;

    return {
      ...context,
      snapshot: { ...context.snapshot, seats },
      meta: { ...context.meta, foolImmunityConsumed: true },
    };
  };
}

/**
 * 把角色能力定义折成管道需要的阶段集合（**统一入口**）。
 *
 * ⚠️ 与 `runAbilityPipeline` 共用同一份组装逻辑：任何新增的「全局后置中间件」
 *   都必须加在这里，才能同时被**生产**（`useNightActionHandler` / `dayAbilityBridge`）
 *   与**测试夹具**（`_tbHarness.pipe`）覆盖到。
 */
export function buildAbilityPipe(
  ability: Partial<IRoleAbility> & { effectSemantics?: string }
): Partial<AbilityMiddlewareSet> {
  return {
    preCheck: ability.preCheck,
    calculate: ability.calculate,
    stateUpdate: ability.stateUpdate,
    postProcess: [
      ...(ability.postProcess ?? []),
      createFoolImmunityConsumer(ability.effectSemantics),
      // ⭐ 2026-09-22 剧本级规则：恶魔夜晚不攻击（游园惊梦）。放在最后 ⇒ 覆盖本步所有写入
      createScriptRuleNightKillSuppressor(),
    ],
  };
}

/**
 * 通过新引擎管道执行单个角色能力（统一入口）
 *
 * 供 UI 解析器（useNightActionHandler.executeViaNewEngine）与新引擎编排器
 * （NightEngine.submitAction）共用，避免两者各自重复拼装
 * { preCheck, calculate, stateUpdate, postProcess } 并直接调用 runFullAbilityPipeline。
 *
 * @param ability 角色能力定义（IRoleAbility）
 * @param context 已构造好的中间件上下文
 * @returns 管道执行后的上下文
 */
export async function runAbilityPipeline(
  ability: IRoleAbility,
  context: MiddlewareContext
): Promise<MiddlewareContext> {
  return runFullAbilityPipeline(buildAbilityPipe(ability), context);
}

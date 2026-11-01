/**
 * 官方范例可执行夹具 · 共享 harness
 * ======================================================================
 * ⚠️ 文件名不含 `.test.` → 不被 vitest 收集（只作 import 用）。
 *
 * 设计原则（与 `src/roles/__tests__/_tbHarness.ts` 同源）：
 *   · 座位用 `app/data.ts` 的真实角色对象（id/name/type 与生产一致）；
 *   · 能力执行一律走 `runFullAbilityPipeline`（真实管道），不直接调 calculate；
 *   · 判胜一律走 `app/gameLogic.ts::checkGameEnd`（生产唯一判胜入口）；
 *   · 优先级/全局规则需要能力注册表 ⇒ `runAbility` 首次调用自动初始化。
 */
import { checkGameEnd } from "../../../app/gameLogic";
import { roles } from "../../../app/data";
import { initializeAbilityRegistry } from "../../../src/roles/new_engine/abilityRegistry";
import type { MiddlewareContext } from "../../../src/utils/middlewareTypes";
import { runAbilityPipeline } from "../../../src/utils/middlewarePipeline";

let registryReady = false;

/** 初始化能力注册表（幂等；全局优先级/规则中间件依赖它） */
export function ensureAbilityRegistry(): void {
  if (registryReady) return;
  initializeAbilityRegistry();
  registryReady = true;
}

/** 取项目角色对象（角色 id 写错时直接抛错，避免静默用错类型） */
export function role(roleId: string): any {
  const found = roles.find((candidate) => candidate.id === roleId);
  if (!found) throw new Error(`app/data.ts 中不存在角色 id：${roleId}`);
  return found;
}

export interface SeatOverrides {
  isDead?: boolean;
  isDrunk?: boolean;
  isPoisoned?: boolean;
  statusEffects?: any[];
  charadeRole?: string;
  [key: string]: any;
}

/** 造一个座位：`N号` = `id + 1`（与生产座位编号一致） */
export function seat(
  id: number,
  roleId: string,
  overrides: SeatOverrides = {}
): any {
  const { charadeRole, ...rest } = overrides;
  const built: any = {
    id,
    playerName: `P${id + 1}`,
    role: role(roleId),
    isDead: false,
    isDrunk: false,
    isPoisoned: false,
    statusEffects: [],
    hasGhostVote: true,
    ...rest,
  };
  if (charadeRole) built.charadeRole = role(charadeRole);
  return built;
}

export interface ContextOptions {
  night?: number;
  phase?: "firstNight" | "night" | "day" | "dusk" | "voting";
  targets?: number[];
  snapshot?: Record<string, any>;
  meta?: Record<string, any>;
  storytellerInput?: Record<string, any>;
  preview?: boolean;
}

/** 构造完整 MiddlewareContext（与 `_tbHarness.runRole` 同形） */
export function ctx(
  seats: any[],
  seatId: number,
  roleId: string,
  options: ContextOptions = {}
): MiddlewareContext {
  const context: any = {
    snapshot: {
      nightCount: options.night ?? 2,
      gamePhase: options.phase ?? "night",
      seats,
      statusEffects: {},
      statusEffectMap: {},
      reminders: [],
      log: [],
      isVortoxWorld: false,
      ...(options.snapshot ?? {}),
    },
    actionNode: {
      seatId,
      roleId,
      roleName: role(roleId)?.name ?? roleId,
      priority: 0,
      isFirstNightOnly: false,
      abilityId: `${roleId}_ability`,
      wakeMessage: "",
      firstNightPriority: null,
      otherNightPriority: null,
      targetIds: options.targets ?? [],
      processed: false,
      success: false,
      meta: {},
    },
    targetIds: options.targets ?? [],
    meta: { ...(options.meta ?? {}) },
    aborted: false,
    ...(options.storytellerInput
      ? { storytellerInput: options.storytellerInput }
      : {}),
    ...(options.preview ? { preview: true } : {}),
  };
  return context;
}

/** 只取四段中间件（避免把能力对象上的其它字段误传给管道） */
export function pipe(ability: any): any {
  return {
    preCheck: ability?.preCheck,
    calculate: ability?.calculate,
    stateUpdate: ability?.stateUpdate,
    postProcess: ability?.postProcess,
  };
}

/**
 * 走真实能力管道执行一次角色能力
 *
 * 🔴 2026-11-01：必须用 **`runAbilityPipeline`（生产同一入口）**，不能用
 *   `runFullAbilityPipeline(pipe(ability))`。后者会绕过 `buildAbilityPipe` 追加的三层
 *   postProcess：
 *     · `createFoolImmunityConsumer` —— 弄臣免死的**唯一消费点**
 *     · `createGoonBroadcast`        —— 莽夫「首个选中者醉酒 + 转阵营」
 *     · `createScriptRuleNightKillSuppressor` —— 剧本级「恶魔夜晚不攻击」
 *   ⇒ 旧写法下「弄臣被攻击后 foolUsed 是否被消耗」「莽夫有没有转阵营」永远测不到，
 *     夹具会给出**与线上相反**的结论（当年探针误判"涡流连打两次弄臣"就是这个坑）。
 */
export async function runAbility(
  ability: any,
  context: MiddlewareContext
): Promise<MiddlewareContext> {
  ensureAbilityRegistry();
  return runAbilityPipeline(ability as any, context);
}

/** 生产判胜入口（薄封装，便于夹具统一） */
export function judge(
  seats: any[],
  lastAction: "execution" | "night_death" | "check_phase",
  executedPlayerId: number | null = null,
  options: Record<string, any> = {}
): any {
  return checkGameEnd(seats as any, lastAction, executedPlayerId, options as any);
}

/** 把 `markedForDeath` 落成 `isDead`（模拟黎明结算，仅用于判胜夹具） */
export function settleDeaths(seats: any[]): any[] {
  return seats.map((seat) => ({ ...seat, isDead: seat.isDead || !!seat.markedForDeath }));
}

/** 断言辅助：让「无断言」在 lint/评审时无处藏身（禁止空断言夹具） */
export function expectDead(seats: any[], seatId: number): boolean {
  const target = seats.find((seat) => seat.id === seatId);
  return target?.isDead === true || target?.markedForDeath === true;
}

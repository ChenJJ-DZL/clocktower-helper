/**
 * 暗流涌动（Trouble Brewing）测试共享夹具
 *
 * ⚠️ 文件名不含 `.test.` → **不被 vitest 收集**（只作 import 用）。
 *
 * ⚠️ 本目录原有的 20 个 `<角色>.test.ts` 曾是**空断言占位**
 *    （`expect(1).toBe(1)` / `expect(xAbility).toBeDefined()`），
 *    让 `npm run test` 报绿却**零真实验证**。2026-09-13 起逐个换成真断言，
 *    判据一律取 `src/data/officialRoleDocs.json` 官方原文。
 *
 * 座位对外一律「N号」= `seat.id + 1`。
 */
import { roles, scripts } from "../../../app/data";
import { ENGINE_CONFIG } from "../../hooks/useNightEngine";
import { generateDynamicNightQueue } from "../../utils/dynamicQueueGenerator";
import { calculateNightInfoViaNewEngine } from "../../utils/nightInfoAdapter";
import type { MiddlewareContext } from "../../utils/middlewareTypes";
import { runFullAbilityPipeline } from "../../utils/middlewarePipeline";

export const r = (id: string) => roles.find((x) => x.id === id)!;
export const TB = scripts.find((s) => s.id === "trouble_brewing")!;

/** 把注册表里的 ability 对象折成 pipeline 需要的形状 */
export const pipe = (a: any) => ({
  preCheck: a?.preCheck,
  calculate: a?.calculate,
  stateUpdate: a?.stateUpdate,
  postProcess: a?.postProcess,
});

export interface SeatOverrides {
  isDead?: boolean;
  isDrunk?: boolean;
  isPoisoned?: boolean;
  statusEffects?: any[];
  executedToday?: boolean;
  charadeRole?: string;
  hasAbilityEvenDead?: boolean;
  [k: string]: any;
}

/** 造一个座位（`roleId` 决定角色；`over` 覆盖任意字段） */
export function seat(id: number, roleId: string, over: SeatOverrides = {}): any {
  const { charadeRole, ...rest } = over;
  const s: any = {
    id,
    playerName: `P${id + 1}`,
    role: r(roleId),
    isDead: false,
    isDrunk: false,
    isPoisoned: false,
    statusEffects: [],
    ...rest,
  };
  if (charadeRole) s.charadeRole = r(charadeRole);
  return s;
}

/**
 * 按布局造棋盘。`null` 表示该位空缺（用于「少一人」的场景）。
 * 座位 id 取数组下标 + 1 之后的 0 基（与生产一致）。
 */
export function board(layout: Array<string | null>): any[] {
  const out: any[] = [];
  layout.forEach((rid, i) => {
    if (rid) out.push(seat(out.length, rid));
  });
  return out;
}

export interface RunOpts {
  night?: number;
  phase?: "firstNight" | "night" | "day" | "dusk" | "voting";
  targets?: number[];
  /** 覆盖 snapshot 上的字段（executedToday / deadThisNight / isVortoxWorld …） */
  snapshot?: Record<string, any>;
  /** 覆盖 ctx.meta（如 abilityEffective / 说书人预设） */
  meta?: Record<string, any>;
  /** 覆盖 actionNode.meta */
  nodeMeta?: Record<string, any>;
}

/** 跑某个角色的完整能力管道，返回**最终上下文**（含 meta.abilityResult） */
export async function runRole(
  ability: any,
  seats: any[],
  seatId: number,
  opts: RunOpts = {}
): Promise<any> {
  const roleId = seats.find((s) => s.id === seatId)?.role?.id ?? ability?.roleId;
  const ctx: MiddlewareContext = {
    snapshot: {
      nightCount: opts.night ?? 2,
      gamePhase: opts.phase ?? "night",
      seats,
      statusEffects: {},
      statusEffectMap: {},
      isVortoxWorld: false,
      reminders: [],
      log: [],
      ...(opts.snapshot ?? {}),
    } as any,
    actionNode: {
      seatId,
      roleId,
      roleName: r(roleId)?.name ?? roleId,
      priority: 1,
      isFirstNightOnly: false,
      abilityId: `${roleId}_ability`,
      targetIds: opts.targets ?? [],
      processed: false,
      success: false,
      meta: { ...(opts.nodeMeta ?? {}) },
    } as any,
    targetIds: opts.targets ?? [],
    meta: { ...(opts.meta ?? {}) },
    aborted: false,
  };
  return runFullAbilityPipeline(pipe(ability), ctx);
}

/** 从任意文本里取出「有 N 对 / 有 N 名」这类数字 */
export function numOf(text: unknown): number {
  const m = String(text ?? "").match(/(\d+)\s*(?:对|名|个)/);
  return m ? Number(m[1]) : NaN;
}

/** 从结果里取展示文本（guide / result / playerFacingGuide 兜底） */
export function textOf(res: any): string {
  const m = res?.meta ?? {};
  return String(
    m.guide ?? m.abilityResultText ?? m.result ?? m.playerFacingGuide ?? ""
  );
}

/**
 * 读「第 N 夜某座位」的夜间行动队列节点 roleId 列表。
 *
 * ⚠️ 判「今晚是否唤醒」**必须以队列为准** —— adapter 是"给定座位就生成信息"，
 *    自己不做排程校验（见 skill「剧本全量测试」§2 保真铁规 3）。
 */
export function queueFor(
  seats: any[],
  seatId: number,
  night: number,
  extras: Record<string, any> = {}
): string[] {
  const queue = generateDynamicNightQueue(
    ENGINE_CONFIG.fullNightOrder,
    {
      seats,
      gamePhase: night === 1 ? "firstNight" : "night",
      nightCount: night,
      statusEffects: {},
      poppyGrowerDead: false,
      reminders: [],
      log: [],
      ...extras,
    } as any,
    { isFirstNight: night === 1 }
  );
  return queue
    .filter((n: any) => n.seatId === seatId)
    .map((n: any) => n.roleId);
}

/**
 * 取「第 N 夜某座位」的说书人引导与玩家面文本（走 adapter）。
 *
 * ⚠️ 必须先 `initializeAbilityRegistry()`，否则 adapter 会退化（假绿）。
 * ⚠️ 只在该座位**确实被排程**时调用（adapter 不做排程校验）。
 */
export function nightInfoFor(
  seats: any[],
  seatId: number,
  night: number,
  opts: { phase?: "firstNight" | "night"; systemStepRoleId?: string } = {}
): { guide: string; playerFacingGuide: string; result: string } {
  const phase = opts.phase ?? (night === 1 ? "firstNight" : "night");
  const info: any = calculateNightInfoViaNewEngine(
    TB as any,
    seats as any,
    seatId,
    phase as any,
    null,
    night,
    opts.systemStepRoleId,
    undefined,
    undefined,
    undefined,
    false,
    undefined,
    undefined,
    undefined,
    [],
    undefined,
    undefined,
    undefined,
    false,
    false,
    false,
    null,
    undefined,
    undefined,
    undefined
  );
  const guide = String(info?.guide ?? "");
  return {
    guide,
    playerFacingGuide: String(info?.playerFacingGuide ?? ""),
    result: guide,
  };
}

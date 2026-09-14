/**
 * 剧本全量测试 · 通用矩阵 harness
 *
 * 目标：把「一个剧本 × 全部角色 × N 夜 × M 状态」的采集逻辑抽成**可复用件**，
 * 换剧本时只提供配置（花名册 / 状态定义 / 同伴池），不复制 500 行脚手架。
 *
 * ⚠️⚠️ 保真铁规（违反 → 采集到的"缺陷"八成是假的，见 skill「剧本全量测试」§2）
 *   1. **`systemStepRoleId` 必传**：生产按**队列节点**调 adapter，
 *      minion_info / demon_info 这类系统步骤必须把节点 roleId 传进去，
 *      否则 adapter 退回"按座位角色生成"的普通分支 → 爪牙退化成占位文案（假缺陷）。
 *   2. **以 `generateDynamicNightQueue` 的队列为准**判定"今晚是否唤醒"，
 *      仅在队列含本座位时才调 adapter（adapter 自己不做排程校验）。
 *   3. **酒鬼 / 提线木偶必须带 `charadeRole` + `permanent` drunk statusEffect**
 *      （生产写入点 `src/roles/outsider/drunk.ability.ts` 的设置阶段）。
 *   4. **同伴绝不与被测角色同 id** —— 否则队列会把同伴座位也算成本角色，
 *      产出「两个同角色各自收到节点」的假缺陷。
 *   5. 基线恶魔选**该剧本真实存在的恶魔**（不要引入外剧本恶魔污染全局）。
 *
 * 用法：
 *   const { cells, baselineWake, baselineAbilityWake } =
 *     collectScriptMatrix(MY_SCRIPT_CONFIG);
 *   writeMatrixReport(MY_SCRIPT_CONFIG, result);
 */

import fs from "node:fs";
import path from "node:path";
import { roles, scripts } from "../../../../app/data";
import { ENGINE_CONFIG } from "../../../hooks/useNightEngine";
import { generateDynamicNightQueue } from "../../dynamicQueueGenerator";
import { parseInfoResult } from "../../infoResultParser";
import { calculateNightInfoViaNewEngine } from "../../nightInfoAdapter";

export type RoleTypeName = "townsfolk" | "outsider" | "minion" | "demon";

/** adapter 的具名旗标（内部映射到 25 个位置参数，避免位置错位） */
export interface AdapterFlags {
  lastDuskExecution?: number | null;
  poppyGrowerDead?: boolean;
  vortoxWorld?: boolean;
  deadThisNight?: number[];
  spyDisguiseMode?: "off" | "default" | "on";
}

export interface MutateCtx {
  seats: any[];
  roleId: string;
  roleType: RoleTypeName;
  /** 按 id 取角色定义 */
  r: (id: string) => any;
}

export interface MatrixStateSpec {
  name: string;
  /** 仅对该角色类型适用（默认全部适用） */
  applicableTo?: (roleType: RoleTypeName) => boolean;
  /** 改造座位（在基础布局之后、追加额外座位之前调用） */
  mutateSeats?: (ctx: MutateCtx) => void;
  /** 追加座位（从索引 7 起）；返回 null 表示不追加 */
  extraSeat?: (ctx: MutateCtx) => string | null;
  /**
   * 合并进**队列快照**的额外字段。
   *
   * ⚠️ 必须区分两个注入点，否则会误判成缺陷：
   *   · `flags`      → 只喂给 **adapter**（`calculateNightInfoViaNewEngine`）
   *   · `snapshot`   → 只喂给 **队列生成器**（`generateDynamicNightQueue`）
   *   条件唤醒类角色（送葬者 `requiresExecutedToday`、守鸦人 `deathTriggered`、
   *   农夫、杂耍艺人）的**排程**由快照决定 —— 只给 adapter 注入等于没注入，
   *   队列仍返回 false，会被误报成"该唤醒却不唤醒"。
   */
  snapshot?: (ctx: MutateCtx) => Record<string, any>;
  /** 该状态下 adapter 的具名旗标 */
  flags?: (ctx: MutateCtx) => AdapterFlags;
}

export interface ScriptMatrixConfig {
  scriptId: string;
  scriptName: string;
  roster: Record<RoleTypeName, readonly string[]>;
  states: readonly MatrixStateSpec[];
  companions: {
    /** 镇民备选池（用于填充 seat1 / seat3 / seat6） */
    townsfolkPool: readonly string[];
    outsider: string;
    minion: string;
    demon: string;
  };
  nights?: readonly number[];
  /** 被测角色本身是"伪装者"（酒鬼/提线木偶）时默认伪装成谁 */
  coveredDisguise?: { roleIds: readonly string[]; as: string };
  /** 额外系统节点 id（默认已含通用四个） */
  extraSystemNodeIds?: readonly string[];
}

export interface MatrixCell {
  roleId: string;
  roleName: string;
  roleType: RoleTypeName;
  night: number;
  state: string;
  applicable: boolean;
  /** 今晚该座位被唤醒（含系统步骤） */
  woken: boolean;
  /** 由**角色自身能力**唤醒（排除系统步骤） */
  abilityWoken: boolean;
  queueRoleIds: string[];
  guide: string;
  speak: string;
  action: string;
  playerFacingGuide: string;
  storytellerNote: string;
  targetLimit: { min: number; max: number } | null;
  prefix: string;
  result: string;
  anomalies: string[];
  warnings: string[];
}

export interface MatrixResult {
  cells: MatrixCell[];
  baselineWake: Record<string, { n1: boolean; n2: boolean; n3: boolean }>;
  baselineAbilityWake: Record<string, { n1: boolean; n2: boolean; n3: boolean }>;
}

/** 通用系统步骤（非角色自身能力） */
const BASE_SYSTEM_NODE_IDS = [
  "minion_info",
  "demon_info",
  "legion_mutual_recognition",
  "evil_converted_notice",
];

/** 从候选池挑一个**不等于被测角色**的同伴，避免场上出现两个同角色 */
function pickExcluding(pool: readonly string[], exclude: string): string {
  return pool.find((p) => p !== exclude) ?? pool[0];
}

export function buildMatrixSeats(
  cfg: ScriptMatrixConfig,
  roleId: string,
  roleType: RoleTypeName,
  state: MatrixStateSpec
): any[] {
  const r = (id: string) => roles.find((x) => x.id === id)!;
  const c = cfg.companions;

  // 同伴按类型错开：被测角色占 seat0，其余类型各就位，且**绝不重复被测角色**
  const demonId = roleType === "demon" ? null : c.demon;
  const minionId = roleType === "minion" ? null : c.minion;
  const outsiderId =
    roleType === "outsider" ? null : pickExcluding(cfg.roster.outsider, roleId);

  const tPool = c.townsfolkPool;

  const layout: Array<[number, string | null]> = [
    [0, roleId],
    [1, pickExcluding(tPool, roleId)],
    [2, outsiderId],
    [3, pickExcluding(tPool.filter((x) => x !== tPool[0]), roleId)],
    [4, minionId],
    [5, demonId],
    [6, pickExcluding(tPool, roleId)],
  ];

  const seats: any[] = layout
    .filter(([, rid]) => rid !== null)
    .map(([id, rid]) => ({
      id,
      playerName: `P${id + 1}`,
      role: r(rid as string),
      isDead: false,
      isDrunk: false,
      isPoisoned: false,
      statusEffects: [],
    }));

  const ctx: MutateCtx = { seats, roleId, roleType, r };
  state.mutateSeats?.(ctx);

  // 追加座位（索引 7）
  const extra = state.extraSeat?.(ctx);
  if (extra && extra !== roleId) {
    seats.push({
      id: 7,
      playerName: "P8",
      role: r(extra),
      isDead: false,
      isDrunk: false,
      isPoisoned: false,
      statusEffects: [],
    });
  }

  // 🎭 真实数据形态：伪装者**必有** charadeRole（他以为自己是个镇民）。
  //    缺了它 getEffectiveRoleId 会退回 role.id、把伪装者当成本角色 → 假缺陷。
  if (cfg.coveredDisguise?.roleIds.includes(roleId)) {
    seats[0].charadeRole = r(cfg.coveredDisguise.as);
  }

  return seats;
}

function makeSnapshot(
  seats: any[],
  night: number,
  flags: AdapterFlags,
  extras: Record<string, any> = {}
): any {
  return {
    seats,
    gamePhase: night === 1 ? "firstNight" : "night",
    nightCount: night,
    statusEffects: {},
    // ⚠️ 该标志语义是「罂粟种植者**刚刚死亡**」→ 常态一律 false。
    //    「罂粟种植者在场」应由**存活座位**表达（队列的 isPoppyGrowerAlive）。
    poppyGrowerDead: Boolean(flags.poppyGrowerDead),
    reminders: [],
    log: [],
    // 状态注入的额外快照字段（条件唤醒的排程依据，如 todayExecutedId / deadThisNight）
    ...extras,
  } as any;
}

function queueRoleIdsFor(
  seats: any[],
  night: number,
  flags: AdapterFlags,
  extras: Record<string, any> = {}
): string[] {
  try {
    const queue = generateDynamicNightQueue(
      ENGINE_CONFIG.fullNightOrder,
      makeSnapshot(seats, night, flags, extras),
      { isFirstNight: night === 1 }
    );
    return queue.filter((n: any) => n.seatId === 0).map((n: any) => n.roleId);
  } catch {
    return [];
  }
}

/** 收集单元格的硬错误（anomalies）与非硬错误（warnings） */
export function collectAnomalies(
  c: Omit<MatrixCell, "anomalies" | "warnings">
): { anomalies: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const t of [
    c.guide,
    c.speak,
    c.action,
    c.playerFacingGuide,
    c.storytellerNote,
  ]) {
    if (!t) continue;
    if (/undefined/.test(t)) errors.push("文案含 undefined");
    if (/NaN/.test(t)) errors.push("文案含 NaN");
    if (/\[object/.test(t)) errors.push("文案含 [object Object]");
    if (/每个夜晚\*|每个白天\*/.test(t)) warnings.push("文案含规则记号 *");
  }
  if (c.woken && !c.guide) errors.push("队列已唤醒但 guide 为空");
  if (!c.woken && (c.guide || c.result)) errors.push("队列未排程却产出了文案");
  if (c.woken && /准备执行技能|请执行行动/.test(c.guide)) {
    warnings.push("guide 为占位文案（引导模板缺失）");
  }
  return { anomalies: errors, warnings };
}

export function collectScriptMatrix(cfg: ScriptMatrixConfig): MatrixResult {
  const script = scripts.find((s) => s.id === cfg.scriptId)!;
  if (!script) throw new Error(`剧本 ${cfg.scriptId} 不存在`);
  const r = (id: string) => roles.find((x) => x.id === id)!;
  const nights = cfg.nights ?? [1, 2, 3];
  const systemNodeIds = new Set([
    ...BASE_SYSTEM_NODE_IDS,
    ...(cfg.extraSystemNodeIds ?? []),
  ]);

  const allRoles: Array<{ id: string; type: RoleTypeName }> = (
    Object.keys(cfg.roster) as RoleTypeName[]
  ).flatMap((t) => cfg.roster[t].map((id) => ({ id, type: t })));

  const cells: MatrixCell[] = [];
  const baselineWake: MatrixResult["baselineWake"] = {};
  const baselineAbilityWake: MatrixResult["baselineAbilityWake"] = {};

  for (const { id: roleId, type: roleType } of allRoles) {
    const roleDef = r(roleId);
    for (const night of nights) {
      for (const state of cfg.states) {
        const applicable = state.applicableTo
          ? state.applicableTo(roleType)
          : true;
        const seats = buildMatrixSeats(cfg, roleId, roleType, state);
        const mutCtx: MutateCtx = { seats, roleId, roleType, r };
        const flags: AdapterFlags = state.flags ? state.flags(mutCtx) : {};
        const extras: Record<string, any> = state.snapshot
          ? state.snapshot(mutCtx)
          : {};
        const qRoleIds = queueRoleIdsFor(seats, night, flags, extras);
        const woken = qRoleIds.length > 0;
        const abilityWoken = qRoleIds.includes(roleId);

        if (state.name === (cfg.states[0]?.name ?? "常态")) {
          baselineWake[roleId] = baselineWake[roleId] ?? {
            n1: false,
            n2: false,
            n3: false,
          };
          baselineAbilityWake[roleId] = baselineAbilityWake[roleId] ?? {
            n1: false,
            n2: false,
            n3: false,
          };
          (baselineWake[roleId] as any)[`n${night}`] = woken;
          (baselineAbilityWake[roleId] as any)[`n${night}`] = abilityWoken;
        }

        let guide = "",
          speak = "",
          action = "",
          pfGuide = "",
          stNote = "";
        let tl: any = null,
          prefix = "",
          result = "";

        if (woken) {
          try {
            const sysStep = qRoleIds.find((rid) => systemNodeIds.has(rid));
            const info: any = calculateNightInfoViaNewEngine(
              script as any,
              seats as any,
              0,
              (night === 1 ? "firstNight" : "night") as any,
              flags.lastDuskExecution ?? null,
              night,
              sysStep,
              undefined,
              undefined,
              undefined,
              flags.poppyGrowerDead ?? false,
              undefined,
              flags.spyDisguiseMode,
              undefined,
              flags.deadThisNight ?? [],
              undefined,
              undefined,
              undefined,
              flags.vortoxWorld ?? false,
              false,
              false,
              null,
              undefined,
              undefined,
              undefined
            );
            guide = info?.guide ?? "";
            speak = info?.speak ?? "";
            action = info?.action ?? "";
            pfGuide = info?.playerFacingGuide ?? "";
            stNote = info?.storytellerNote ?? "";
            tl = info?.targetLimit ?? info?.meta?.targetCount ?? null;
            const parsed = parseInfoResult(guide, `1号-${roleDef.name}`);
            prefix = parsed.prefix;
            result = parsed.result;
          } catch (e: any) {
            guide = `<<抛异常：${e?.message ?? e}>>`;
          }
        }

        const base: Omit<MatrixCell, "anomalies" | "warnings"> = {
          roleId,
          roleName: roleDef.name,
          roleType,
          night,
          state: state.name,
          applicable,
          woken,
          abilityWoken,
          queueRoleIds: qRoleIds,
          guide,
          speak,
          action,
          playerFacingGuide: pfGuide,
          storytellerNote: stNote,
          targetLimit: tl,
          prefix,
          result,
        };
        const { anomalies, warnings } = collectAnomalies(base);
        cells.push({ ...base, anomalies, warnings });
      }
    }
  }

  return { cells, baselineWake, baselineAbilityWake };
}

export function writeMatrixReport(
  cfg: ScriptMatrixConfig,
  res: MatrixResult
): string {
  const outDir = path.join(process.cwd(), "temp", "reports");
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `${cfg.scriptId}_matrix.json`);
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        scriptId: cfg.scriptId,
        scriptName: cfg.scriptName,
        roster: cfg.roster,
        states: cfg.states.map((s) => s.name),
        baselineWake: res.baselineWake,
        baselineAbilityWake: res.baselineAbilityWake,
        totalCells: res.cells.length,
        cells: res.cells,
      },
      null,
      2
    ),
    "utf8"
  );
  return file;
}

/** 打印标准化的采集摘要（硬错误 / 待修汇总 / 基线唤醒表） */
export function printMatrixSummary(res: MatrixResult): void {
  const r = (id: string) => roles.find((x) => x.id === id)!;
  const withAnomaly = res.cells.filter((c) => c.anomalies.length > 0);
  const withWarning = res.cells.filter((c) => c.warnings.length > 0);

  console.log("\n=== 基线唤醒表（常态）===");
  for (const [k, v] of Object.entries(res.baselineWake)) {
    console.log(
      `  ${(r(k)?.name ?? k).padEnd(7)} 首夜:${
        v.n1 ? "唤醒" : "不唤"
      }  第2夜:${v.n2 ? "唤醒" : "不唤"}  第3夜:${v.n3 ? "唤醒" : "不唤"}`
    );
  }
  if (withAnomaly.length > 0) {
    console.log("\n=== ❌ 硬错误单元格 ===");
    for (const c of withAnomaly.slice(0, 60)) {
      console.log(
        `  ${c.roleName} 第${c.night}夜/${c.state}: ${c.anomalies.join("; ")}`
      );
    }
  }
  if (withWarning.length > 0) {
    const agg = new Map<string, number>();
    for (const c of withWarning) {
      for (const w of c.warnings) {
        const k = `${c.roleName} | ${w}`;
        agg.set(k, (agg.get(k) ?? 0) + 1);
      }
    }
    console.log("\n=== ⚠️ 待修缺陷汇总（非硬错误）===");
    for (const [k, n] of [...agg.entries()].sort()) {
      console.log(`  ${k}  ×${n} 单元格`);
    }
  }
  console.log(
    `\n单元格总数: ${res.cells.length}   硬错误: ${withAnomaly.length}   待修: ${withWarning.length}`
  );
}

/** 取某角色某夜某状态的单元格 */
export function findCell(
  res: MatrixResult,
  roleId: string,
  night: number,
  state: string
): MatrixCell | undefined {
  return res.cells.find(
    (c) => c.roleId === roleId && c.night === night && c.state === state
  );
}

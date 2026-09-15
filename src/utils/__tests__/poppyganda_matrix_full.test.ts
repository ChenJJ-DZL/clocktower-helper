/**
 * 罂粟花开 · 全角色 × 状态 批量矩阵测试（永久回归 + 报告生成）
 *
 * 目标（用户 2026-09-13 要求）：
 *   对罂粟花开全部 24 角色，采集**每种情况下**的：
 *     · 技能确认页 —— guide(说书人念) / speak(引导) / action(收尾) / targetLimit(目标数)
 *     · 技能结果页 —— parseInfoResult 产出的 prefix(小字) / result(大字)
 *     · 玩家面     —— playerFacingGuide / storytellerNote（说书人Tips）
 *   并断言不变量。
 *
 * ⚠️ 关键保真修正（2026-09-13 第2轮踩坑）：
 *   一版 harness 直接对每个角色每晚调用 nightInfoAdapter，
 *   结果 savant/baron/drunk/mutant（**两个队列都不在**）也报"已唤醒"，
 *   因为 adapter 是"给定座位就生成信息"，**不做夜晚排程校验**（排程由队列负责）。
 *   ⇒ 必须以 `generateDynamicNightQueue` 的队列为准判定"今晚是否唤醒"，
 *     仅在队列含本座位时才调 adapter 取内容。
 *
 * 维度：3 夜（首夜/第2夜/第3夜）× 6 状态
 *   常态 / 中毒 / 酒鬼伪装 / 提线木偶伪装 / 涡流世界 / 罂粟种植者在场
 *
 * 产出：temp/reports/poppyganda_matrix_full.json
 *
 * 硬规则：
 *   · 座位对外一律「N号」= seat.id + 1
 *   · 基线恶魔用 imp（**不用 vortox**，否则全体镇民被污染）
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { roles, scripts } from "../../../app/data";
import { ENGINE_CONFIG } from "../../hooks/useNightEngine";
import { calculateNightInfoViaNewEngine } from "../nightInfoAdapter";
import { parseInfoResult } from "../infoResultParser";
import { generateDynamicNightQueue } from "../dynamicQueueGenerator";
import { initializeAbilityRegistry } from "../../roles/new_engine/abilityRegistry";

const r = (id: string) => roles.find((x) => x.id === id)!;
const POPPY = scripts.find((s) => s.id === "poppyganda")!;

/** 罂粟花开官方花名册（来源 app/data.ts scripts[poppyganda].roleIds） */
const ROSTER = {
  townsfolk: [
    "librarian", "chef", "bounty_hunter", "pixie", "fortune_teller", "monk",
    "oracle", "town_crier", "juggler", "savant", "farmer", "mayor", "poppy_grower",
  ],
  outsider: ["drunk", "lunatic", "mutant", "snitch"],
  minion: ["cerenovus", "evil_twin", "baron", "marionette"],
  demon: ["imp", "vortox", "legion"],
} as const;

type TypeName = keyof typeof ROSTER;

const ALL_ROLES: Array<{ id: string; type: TypeName }> = (
  Object.keys(ROSTER) as TypeName[]
).flatMap((t) => ROSTER[t].map((id) => ({ id, type: t })));

type StateName =
  | "常态"
  | "中毒"
  | "酒鬼伪装"
  | "提线木偶伪装"
  | "涡流世界"
  | "罂粟种植者在场";

const STATES: StateName[] = [
  "常态", "中毒", "酒鬼伪装", "提线木偶伪装", "涡流世界", "罂粟种植者在场",
];

interface Cell {
  roleId: string;
  roleName: string;
  roleType: TypeName;
  roleChineseSource: string;
  night: number;
  state: StateName;
  applicable: boolean;
  woken: boolean;
  /** 是否由**角色自身能力**唤醒（排除 minion_info/demon_info 等系统步骤） */
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

/** companion 常量（全部取自罂粟花开花名册） */
const C_T1 = "mayor";
const C_OUT = "snitch";
const C_T2 = "savant";
const C_MINION = "baron";
const C_DEMON = "imp";
const C_T3 = "farmer";

/**
 * 从候选池挑一个**不等于被测角色**的同伴，避免场上出现两个同角色。
 * ⚠️ 踩坑（2026-09-13）：一版直接把被测角色写进同伴位（如测木偶时
 * seat4 也设成 marionette），导致队列把这些座位也当成本角色，
 * 产出「两个木偶各自收到 marionette 节点」的**假缺陷**。
 */
function pickExcluding(pool: string[], exclude: string): string {
  return pool.find((p) => p !== exclude) ?? pool[0];
}

function buildSeats(
  roleId: string,
  roleType: TypeName,
  state: StateName
): any[] {
  // 同伴按类型错开：被测角色占 seat0，其余类型各就位，且**绝不重复被测角色**
  const demonId = roleType === "demon" ? null : C_DEMON;
  const minionId = roleType === "minion" ? null : C_MINION;
  const outsiderId =
    roleType === "outsider" ? null : pickExcluding(ROSTER.outsider as any, roleId);

  const layout: Array<[number, string | null]> = [
    [0, roleId],
    [1, pickExcluding([C_T1, C_T2, C_T3, "soldier", "empath"], roleId)],
    [2, outsiderId],
    [3, pickExcluding([C_T2, C_T3, "soldier", "empath", C_T1], roleId)],
    [4, minionId],
    [5, demonId],
    [6, state === "罂粟种植者在场" ? "poppy_grower" : C_T3],
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

  switch (state) {
    case "中毒":
      seats[0].statusEffects = [{ type: "poisoned" }];
      break;
    case "酒鬼伪装":
      if (roleType === "townsfolk") {
        seats[0].role = r("drunk");
        seats[0].charadeRole = r(roleId);
        // 保真：生产在设置阶段由 drunk.ability.ts 写入永久 drunk 状态效果
        seats[0].statusEffects = [{ type: "drunk", permanent: true }];
      }
      break;
    case "提线木偶伪装":
      if (roleType === "townsfolk") {
        seats[0].role = r("marionette");
        seats[0].charadeRole = r(roleId);
        seats[0].statusEffects = [{ type: "drunk", permanent: true }];
      }
      break;
    case "涡流世界":
      // 🌀 涡流替换恶魔位；若被测角色就是恶魔则保持自身
      if (roleType !== "demon") {
        const d = seats.find((s) => s.role.type === "demon");
        if (d) d.role = r("vortox");
      }
      break;
    case "罂粟种植者在场":
      break;
  }

  // 🎭 真实数据形态：酒鬼/提线木偶**必有** charadeRole（他以为自己是某镇民）。
  //    缺了它 getEffectiveRoleId 会退回 role.id、把木偶当成本角色 → 队列出现
  //    「提线木偶节点派给木偶本人」的**假缺陷**。
  if (roleId === "drunk" || roleId === "marionette") {
    seats[0].charadeRole = r("soldier");
  }

  return seats;
}

function isApplicable(roleType: TypeName, state: StateName): boolean {
  if (state === "酒鬼伪装" || state === "提线木偶伪装") {
    return roleType === "townsfolk";
  }
  return true;
}

function makeSnapshot(seats: any[], night: number, state: StateName): any {
  return {
    seats,
    gamePhase: night === 1 ? "firstNight" : "night",
    nightCount: night,
    statusEffects: {},
    // 🌺 该标志语义是「罂粟种植者**刚刚死亡**」→ 会在非首夜**重新**放开
    //    爪牙互认/恶魔信息（官方：罂粟死后当晚邪恶阵营互认）。
    //    ⚠️ 踩坑（2026-09-13）：一版对所有状态都传 true，等于每晚都模拟
    //    "罂粟刚死"，导致男爵/镜像双子在第2/3夜凭空出现 minion_info 的**假唤醒**。
    //    正解：常态下**没死** → 一律 false；
    //    「罂粟种植者在场」这一维改由 **存活且健康的 poppy_grower 座位** 表达
    //    （它才是首夜取消互认的判据，见 dynamicQueueGenerator isPoppyGrowerAlive）。
    poppyGrowerDead: false,
    reminders: [],
    log: [],
  } as any;
}

/** 系统步骤（非角色自身能力）：爪牙互认 / 恶魔信息 / 军团互认 / 邪恶阵营告知 */
const SYSTEM_NODE_IDS = new Set([
  "minion_info",
  "demon_info",
  "legion_mutual_recognition",
  "evil_converted_notice",
]);

/** 队列判定：今晚 0 号（被测角色）是否有行动节点 */
function queueRoleIdsFor(seats: any[], night: number, state: StateName): string[] {
  try {
    const queue = generateDynamicNightQueue(
      ENGINE_CONFIG.fullNightOrder,
      makeSnapshot(seats, night, state),
      { isFirstNight: night === 1 }
    );
    return queue.filter((n: any) => n.seatId === 0).map((n: any) => n.roleId);
  } catch {
    return [];
  }
}

function collectAnomalies(c: Omit<Cell, "anomalies" | "warnings">): {
  anomalies: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const t of [
    c.guide, c.speak, c.action, c.playerFacingGuide, c.storytellerNote,
  ]) {
    if (!t) continue;
    if (/undefined/.test(t)) errors.push("文案含 undefined");
    if (/NaN/.test(t)) errors.push("文案含 NaN");
    if (/\[object/.test(t)) errors.push("文案含 [object Object]");
    if (/每个夜晚\*|每个白天\*/.test(t)) warnings.push("文案含规则记号 *");
  }
  // 已被唤醒却没有任何引导文案 → 硬错误
  if (c.woken && !c.guide) errors.push("队列已唤醒但 guide 为空");
  // 未唤醒却产出了文案 → 硬错误
  if (!c.woken && (c.guide || c.result)) errors.push("队列未排程却产出了文案");
  // 🚩 占位文案：该角色该步骤的引导模板缺失（说书人照念无意义）→ 记为待修警告
  if (c.woken && /准备执行技能|请执行行动/.test(c.guide)) {
    warnings.push("guide 为占位文案（引导模板缺失）");
  }
  return { anomalies: errors, warnings };
}

const cells: Cell[] = [];
/** 基线唤醒表（常态）：任一步骤唤醒 */
const baselineWake: Record<string, { n1: boolean; n2: boolean; n3: boolean }> = {};
/** 基线唤醒表（常态）：**角色自身能力**节点 */
const baselineAbilityWake: Record<string, { n1: boolean; n2: boolean; n3: boolean }> = {};

describe("罂粟花开 · 全角色 × 状态 批量矩阵", () => {
  initializeAbilityRegistry();

  it("采集全部角色 × 3 夜 × 6 状态（队列判定为准），并写入报告 JSON", () => {
    for (const { id: roleId, type: roleType } of ALL_ROLES) {
      const roleDef = r(roleId);
      for (let night = 1; night <= 3; night++) {
        for (const state of STATES) {
          const applicable = isApplicable(roleType, state);
          const seats = buildSeats(roleId, roleType, state);
          const qRoleIds = queueRoleIdsFor(seats, night, state);
          // woken = 今晚该座位被唤醒（含 minion_info/demon_info 等系统步骤，它们也是真实唤醒）
          const woken = qRoleIds.length > 0;
          // abilityWoken = 由**角色自身能力**唤醒
          const abilityWoken = qRoleIds.includes(roleId);

          // 基线唤醒表（仅常态、仅被测角色自身节点）
          if (state === "常态") {
            baselineWake[roleId] = baselineWake[roleId] ?? {
              n1: false, n2: false, n3: false,
            };
            (baselineWake[roleId] as any)[`n${night}`] = woken;
            baselineAbilityWake[roleId] = baselineAbilityWake[roleId] ?? {
              n1: false, n2: false, n3: false,
            };
            (baselineAbilityWake[roleId] as any)[`n${night}`] = abilityWoken;
          }

          let guide = "", speak = "", action = "", pfGuide = "", stNote = "";
          let tl: any = null, prefix = "", result = "";

          if (woken) {
            try {
              // ⚠️ 保真关键：生产环境是按**队列节点**调用 adapter 的，
              //    系统步骤（minion_info/demon_info/军团互认/good_twin_info）必须把
              //    节点 roleId 作为 systemStepRoleId 传入 —— 否则 adapter 会走
              //    "按座位角色生成"的普通分支，爪牙就退化到占位文案（**假缺陷**）。
              const stepNode = qRoleIds.find((rid) => SYSTEM_NODE_IDS.has(rid));
              const sysStep = stepNode ?? undefined;
              const info: any = calculateNightInfoViaNewEngine(
                POPPY as any,
                seats as any,
                0,
                (night === 1 ? "firstNight" : "night") as any,
                null,
                night,
                sysStep, // systemStepRoleId
                undefined, undefined, undefined,
                state === "罂粟种植者在场",
                undefined, undefined, undefined,
                [], undefined, undefined, undefined,
                state === "涡流世界",
                false, false, null,
                undefined, undefined, undefined
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

          const base: Omit<Cell, "anomalies" | "warnings"> = {
            roleId,
            roleName: roleDef.name,
            roleType,
            roleChineseSource: roleDef.name,
            night,
            state,
            applicable,
            woken,
            abilityWoken,
            queueRoleIds: qRoleIds,
            guide, speak, action, playerFacingGuide: pfGuide, storytellerNote: stNote,
            targetLimit: tl, prefix, result,
          };
          const { anomalies, warnings } = collectAnomalies(base);
          cells.push({ ...base, anomalies, warnings });
        }
      }
    }

    const outDir = path.join(process.cwd(), "temp", "reports");
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
      path.join(outDir, "poppyganda_matrix_full.json"),
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          script: "罂粟花开 (poppyganda)",
          roster: ROSTER,
          states: STATES,
          baselineWake,
          baselineAbilityWake,
          totalCells: cells.length,
          cells,
        },
        null,
        2
      ),
      "utf8"
    );

    const withAnomaly = cells.filter((c) => c.anomalies.length > 0);
    const withWarning = cells.filter((c) => c.warnings.length > 0);
    console.log("\n=== 基线唤醒表（常态）===");
    for (const [k, v] of Object.entries(baselineWake)) {
      console.log(
        `  ${r(k).name.padEnd(7)} 首夜:${v.n1 ? "唤醒" : "不唤"}  第2夜:${v.n2 ? "唤醒" : "不唤"}  第3夜:${v.n3 ? "唤醒" : "不唤"}`
      );
    }
    if (withAnomaly.length > 0) {
      console.log("\n=== ❌ 硬错误单元格 ===");
      for (const c of withAnomaly.slice(0, 40)) {
        console.log(`  ${c.roleName} 第${c.night}夜/${c.state}: ${c.anomalies.join("; ")}`);
      }
    }
    if (withWarning.length > 0) {
      // 待修缺陷汇总（按角色+问题去重）
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
      `\n单元格总数: ${cells.length}   硬错误: ${withAnomaly.length}   待修: ${withWarning.length}`
    );
    expect(withAnomaly.length).toBe(0);
  });

  // ─── 队列不变量（判据：src/data/nightOrder.json + officialRoleDocs.json）───

  it("白天/被动能力角色：三个夜晚均不得唤醒（savant / juggler / mayor / drunk / mutant / snitch / poppy_grower）", () => {
    // 官方：博学者「每个白天」/ 杂耍艺人「每个白天」/ 镇长 被动 /
    //       酒鬼 无自身行动 / 畸形秀演员 白天 / 告密者 被动 / 罂粟种植者 首夜被动生效
    for (const id of [
      "savant", "juggler", "mayor", "drunk", "mutant", "snitch", "poppy_grower",
    ]) {
      const b = baselineWake[id];
      expect(b, `${id} 未采集到基线`).toBeDefined();
      expect(b.n1, `${id} 不应在首夜唤醒`).toBe(false);
      expect(b.n2, `${id} 不应在第2夜唤醒`).toBe(false);
      expect(b.n3, `${id} 不应在第3夜唤醒`).toBe(false);
    }
  });

  it("首夜-only 角色：首夜唤醒、第2/3夜不唤醒（librarian / chef / pixie / evil_twin）", () => {
    for (const id of ["librarian", "chef", "pixie", "evil_twin"]) {
      const b = baselineWake[id];
      expect(b.n1, `${id} 首夜应唤醒`).toBe(true);
      expect(b.n2, `${id} 第2夜不应唤醒`).toBe(false);
      expect(b.n3, `${id} 第3夜不应唤醒`).toBe(false);
    }
  });

  it("其他夜角色：首夜无**自身能力**节点、第2夜有（oracle / monk / town_crier）", () => {
    for (const id of ["oracle", "monk", "town_crier"]) {
      const b = baselineAbilityWake[id];
      expect(b?.n1, `${id} 首夜不应有自身能力节点`).toBe(false);
      expect(b?.n2, `${id} 第2夜应有自身能力节点`).toBe(true);
    }
  });

  it("恶魔首夜虽被唤醒，但那是 demon_info 系统步骤（非自身能力节点）", () => {
    for (const id of ["imp", "vortox"]) {
      const b = baselineWake[id];
      expect(b?.n1, `${id} 首夜应被唤醒（demon_info）`).toBe(true);
      expect(baselineAbilityWake[id]?.n1, `${id} 首夜不应有自身能力节点`).toBe(false);
      expect(baselineAbilityWake[id]?.n2, `${id} 第2夜应有自身能力节点`).toBe(true);
    }
    // 军团首夜是 legion_mutual_recognition 系统步骤
    expect(baselineWake.legion?.n1).toBe(true);
    expect(baselineAbilityWake.legion?.n1).toBe(false);
    expect(baselineAbilityWake.legion?.n2).toBe(true);
  });

  it("洗脑师 cerenovus：官方「每个夜晚」（无星号）→ 首夜也唤醒", () => {
    const b = baselineWake.cerenovus;
    expect(b.n1, "cerenovus 首夜应唤醒（官方文本无星号）").toBe(true);
    expect(b.n2).toBe(true);
  });

  it("⭐ 提线木偶：官方「提线木偶本人不唤醒」→ 首夜不得唤醒木偶本人", () => {
    // nightOrder.json firstNight 的 marionette 条目描述：
    //   「向恶魔展示提线木偶标记并指向提线木偶玩家。提线木偶本人不唤醒。」
    // 该节点是**给恶魔看的**，座位应归属恶魔而非木偶。
    const cellsForMarionette = cells.filter(
      (c) => c.roleId === "marionette" && c.night === 1
    );
    for (const c of cellsForMarionette) {
      expect(
        c.queueRoleIds.includes("marionette"),
        `提线木偶 首夜/${c.state} 不应把 marionette 节点派给木偶本人（队列：${c.queueRoleIds.join(",")}）`
      ).toBe(false);
    }
  });

  // ⚠️ 已确认的**未修**缺陷（等待裁决/排期）→ 用 it.fails 编码"期望行为"：
  //    现在必然失败（说明缺陷仍在）；一旦修好，这条会翻转为失败，
  //    提示开发者把它改成普通 it(...) 断言。
  it("⭐ 农夫：官方为「当你在夜晚死亡时」条件触发 → 存活时不得被唤醒", () => {
    // ✅ 2026-09-13 已修：dynamicQueueGenerator 增加 farmer 条件判定
    //（仅当有农夫**夜间死亡**时才进队列；白天死亡不触发，符合官方）
    for (const c of cells.filter((x) => x.roleId === "farmer")) {
      expect(
        c.queueRoleIds.includes("farmer"),
        `农夫存活 第${c.night}夜/${c.state} 不应被唤醒（队列：${c.queueRoleIds.join(",")}）`
      ).toBe(false);
    }
  });

  // ─── 正例断言：把"已验证正确"的行为钉死，防止日后回归 ───

  it("✅ 爪牙互认 minion_info 应给出「恶魔是X号」与爪牙队友，而非占位文案", () => {
    // 官方：爪牙首夜与恶魔互认；说书人须告知爪牙**恶魔是谁**。
    // ⚠️ 曾经把此项误判为缺陷 —— 实为**测试脚手架**没把队列节点 roleId
    //    作为 systemStepRoleId 传给 adapter，导致退回"按座位角色生成"普通分支。
    for (const rid of ["baron", "cerenovus", "evil_twin"]) {
      const c = cells.find(
        (x) => x.roleId === rid && x.night === 1 && x.state === "常态"
      );
      expect(c, `${rid} 未采集到首夜/常态`).toBeDefined();
      expect(c!.guide, `${rid} 爪牙互认应含"恶魔"`).toMatch(/恶魔/);
      expect(c!.guide).not.toMatch(/准备执行技能/);
    }
  });

  it("✅ 疯子首夜应得知【假爪牙 + 3 个不在场伪装】（官方明确要求）", () => {
    const c = cells.find(
      (x) => x.roleId === "lunatic" && x.night === 1 && x.state === "常态"
    );
    expect(c, "疯子首夜未采集到").toBeDefined();
    expect(c!.guide).toMatch(/爪牙是/);
    expect(c!.guide).toMatch(/不在场伪装/);
  });

  it("✅ 洗脑师引导必须写明只能选【善良角色】（且不得泄漏夜序记号 *）", () => {
    // 官方三处均为「一个善良角色」；旧文案只写「一个角色」丢失了该硬约束。
    // 另：旧文案在"其他夜"分支残留 `每个夜晚*` 记号（已修）。
    // 注：首夜该座位同时有 minion_info（爪牙互认）与自身能力两个节点，
    //     采集器取系统节点，故此处用**第 2 夜**（仅有自身能力节点）验证能力文案。
    for (const night of [2, 3]) {
      const c = cells.find(
        (x) => x.roleId === "cerenovus" && x.night === night && x.state === "常态"
      );
      expect(c?.guide, `洗脑师 第${night}夜 未采集到`).toBeTruthy();
      expect(c!.guide).toMatch(/善良角色/);
      expect(c!.guide).not.toMatch(/\*/);
    }
  });

  it("✅ 酒鬼伪装的信息类角色必须给【假信息】（官方：酒鬼视同醉酒）", () => {
    // ⚠️ 2026-09-13 修复：infoMessageBuilder.isCorrupted 此前只查 `seat.isDrunk` 布尔位，
    //    漏了数据里的真实形态 `role.id === "drunk"` + `charadeRole` →
    //    酒鬼伪装的城镇公告员给出**真值**（与常态相同），而中毒/木偶/涡流三态都正常。
    //    现已补 `isDrunkDisguisedTownsfolk`（与木偶判定对称）。
    // 断言：凡「常态」有信息的角色，「酒鬼伪装」不得与之相同。
    const infoRoles = ["town_crier", "oracle", "librarian", "chef", "pixie", "bounty_hunter"];
    for (const rid of infoRoles) {
      for (const night of [1, 2]) {
        const normal = cells.find(
          (x) => x.roleId === rid && x.night === night && x.state === "常态"
        );
        const drunk = cells.find(
          (x) => x.roleId === rid && x.night === night && x.state === "酒鬼伪装"
        );
        if (!normal?.guide || !drunk?.guide) continue;
        // 条件未触发时（如赏金猎人当晚无人死亡）guide 是**条件说明**、不含真实信息，
        // 此时两态相同属正常，跳过。
        // ⚠️ 措辞白名单：赏金猎人 legacy 文案已与官方对齐为
        //    「（他之前得知的邪恶玩家已死亡）指向一名新的邪恶玩家」——
        //    仍是条件说明（不含"X号是邪恶的"这类真值），必须一并识别，
        //    否则会把"文案重写"误报成"酒鬼拿到了真信息"。
        if (/如果他之前得知|如果.*已死亡|之前得知的邪恶玩家已死亡/.test(normal.guide)) continue;
        expect(
          drunk.guide,
          `${rid} 第${night}夜：酒鬼伪装不得给出与常态相同的（真实）信息`
        ).not.toBe(normal.guide);
      }
    }
  });
});

export { cells, baselineWake, baselineAbilityWake };

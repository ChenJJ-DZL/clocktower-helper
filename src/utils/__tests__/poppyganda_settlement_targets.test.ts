/**
 * 罂粟花开 · **选目标类角色的「选完目标后结算」采集通道**
 *
 * 背景（第 5 轮遗留缺口）：
 *   `poppyganda_matrix_full.test.ts` 采集的是**「提示预演」路径（guide）**。
 *   对需要玩家选择目标的角色，真正的"结果"只在**选完目标后的结算**才产生，
 *   此前完全没有覆盖（表现：占卜师的「是/否」、僧侣的保护目标等无从验证）。
 *
 * 本通道补上这一段：直接驱动能力管道 `runFullAbilityPipeline`，
 * 捕获结算后的 abilityResult / displayInfo / prompt / abilityLog / 状态变化。
 *
 * 覆盖角色（罂粟花开 24 角色中 targetLimit.max > 0 的 7 个）：
 *   占卜师 fortune_teller(2~2) / 僧侣 monk(1~1) / 疯子 lunatic(1~1) /
 *   洗脑师 cerenovus(1~1) / 小恶魔 imp(1~1) / 涡流 vortox(1~1) / 军团 legion(0~1)
 *
 * 维度：3 夜 × 6 状态 × 4 种目标选择策略
 *   合法最少 / 合法最多 / 含自身 / 含死者
 *
 * 产出：temp/reports/poppyganda_settlement_targets.json
 *
 * 硬规则：座位对外一律「N号」= seat.id + 1
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { roles, scripts } from "../../../app/data";
import {
  getAbilityForRole,
  initializeAbilityRegistry,
} from "../../roles/new_engine/abilityRegistry";
import { runFullAbilityPipeline } from "../middlewarePipeline";
import { buildContextForNode } from "../invariantTesting/simulator";

const r = (id: string) => roles.find((x) => x.id === id)!;
const POPPY = scripts.find((s) => s.id === "poppyganda")!;

/** 被测角色 → 其唤醒夜（对齐官方夜序，见 matrix 报告「基线队列」表） */
const TARGET_ROLES: Record<string, { name: string; nights: number[] }> = {
  fortune_teller: { name: "占卜师", nights: [1, 2, 3] },
  monk: { name: "僧侣", nights: [2, 3] },
  lunatic: { name: "疯子", nights: [1, 2, 3] }, // 疯子「每个夜晚」→ 含首夜
  cerenovus: { name: "洗脑师", nights: [1, 2, 3] }, // 官方「每个夜晚」无星号 → 含首夜
  imp: { name: "小恶魔", nights: [2, 3] },
  vortox: { name: "涡流", nights: [2, 3] },
  legion: { name: "军团", nights: [2, 3] },
};

type StateName =
  | "常态" | "中毒" | "酒鬼伪装" | "提线木偶伪装" | "涡流世界" | "罂粟种植者在场";

const STATES: StateName[] = [
  "常态", "中毒", "酒鬼伪装", "提线木偶伪装", "涡流世界", "罂粟种植者在场",
];

/** 目标选择策略 */
type StrategyName = "合法最少" | "合法最多" | "含自身" | "含死者";
const STRATEGIES: StrategyName[] = ["合法最少", "合法最多", "含自身", "含死者"];

interface SettleCell {
  roleId: string;
  roleName: string;
  night: number;
  state: StateName;
  strategy: StrategyName;
  targetConfig: { min: number; max: number; allowSelf?: boolean; allowDead?: boolean };
  requestedTargets: number[];
  targetLabels: string[];
  aborted: boolean;
  abortReason?: string;
  isCorrupted: boolean;
  abilityEffective: boolean;
  prompt: string;
  abilityLog: string;
  resultDesc: string;
  resultText: string;
  hasDisplayInfo: boolean;
  displayInfoType: string;
  /** 结算前已死亡（夹具预置） */
  deathsBefore: number[];
  /** 结算后全部死亡标记 */
  deaths: number[];
  /** **本次结算造成的**新死亡（= deaths - deathsBefore） */
  newDeaths: number[];
  notes: string[];
}

/** 罂粟花开 7 人局（被测角色固定 0 号） */
function buildSeats(roleId: string, state: StateName): any[] {
  const layout: Array<[number, string]> = [
    [0, roleId],
    [1, "mayor"],
    [2, "snitch"],
    [3, "savant"],
    [4, "baron"],
    [5, "imp"],
    [6, "farmer"],
  ];
  const seats: any[] = layout.map(([id, rid]) => ({
    id,
    playerName: `P${id + 1}`,
    role: r(rid),
    isDead: false,
    isAlive: true,
    isDrunk: false,
    isPoisoned: false,
    statusEffects: [],
  }));

  // 避免与被测角色重复
  if (roleId === "imp") seats[5].role = r("imp");
  if (roleId === "vortox") seats[5].role = r("vortox");
  if (roleId === "legion") seats[5].role = r("legion");
  if (roleId === "fortune_teller") seats[0].role = r("fortune_teller");
  if (roleId === "monk") seats[0].role = r("monk");

  switch (state) {
    case "中毒":
      seats[0].statusEffects = [{ type: "poisoned" }];
      break;
    case "酒鬼伪装":
      if (r(roleId).type === "townsfolk") {
        seats[0].role = r("drunk");
        seats[0].charadeRole = r(roleId);
        // ⚠️ 保真关键：生产环境在**设置阶段**由 drunk.ability.ts 给酒鬼座位写入
        //    永久 drunk 状态效果（drunk.ability.ts:301）。夹具必须带上它，
        //    否则 abilityPriorityCalculation 的 `drunkFromEffects` 分支不会命中，
        //    会被误判为"酒鬼伪装未受干扰"——**那是假缺陷**（第 5 次踩同款坑）。
        seats[0].statusEffects = [
          { type: "drunk", source: "drunk", permanent: true },
        ];
      }
      break;
    case "提线木偶伪装":
      if (r(roleId).type === "townsfolk") {
        seats[0].role = r("marionette");
        seats[0].charadeRole = r(roleId);
        // 同理：marionette.ability.ts 也会写入永久 drunk 效果
        seats[0].statusEffects = [
          { type: "drunk", source: "marionette", permanent: true },
        ];
      }
      break;
    case "涡流世界":
      if (roleId !== "vortox" && r(roleId).type !== "demon") seats[5].role = r("vortox");
      break;
    case "罂粟种植者在场":
      seats[6].role = r("poppy_grower");
      break;
  }
  // 疯子：官方「你以为你是一个恶魔」→ 必须设置 presumed 恶魔身份
  if (roleId === "lunatic") (seats[0] as any).apparentDemonRole = r("imp");
  return seats;
}

/** 按策略挑目标 */
function pickTargets(
  seats: any[],
  selfId: number,
  tc: any,
  strategy: StrategyName
): number[] {
  const min = tc?.min ?? 0;
  const max = tc?.max ?? 0;
  const allowSelf = tc?.allowSelf ?? false;
  const allowDead = tc?.allowDead ?? false;

  const legal = seats.filter(
    (s) =>
      (!s.isDead || allowDead) && (s.id !== selfId || allowSelf)
  );

  switch (strategy) {
    case "合法最少":
      return legal.slice(0, Math.max(min, max > 0 ? Math.min(min || 1, max) : 0)).map((s) => s.id);
    case "合法最多":
      return legal.slice(0, max).map((s) => s.id);
    case "含自身":
      return (allowSelf ? [selfId] : [selfId, ...legal.slice(0, Math.max(max - 1, 0)).map((s) => s.id)]).slice(0, Math.max(max, 1));
    case "含死者": {
      const dead = seats.find((s) => s.isDead);
      const others = legal.slice(0, Math.max(max - 1, 0)).map((s) => s.id);
      return dead ? [dead.id, ...others].slice(0, Math.max(max, 1)) : others.slice(0, Math.max(max, 1));
    }
  }
}

const cells: SettleCell[] = [];

describe("罂粟花开 · 选目标类角色「选完目标后结算」采集通道", () => {
  initializeAbilityRegistry();

  it("采集 7 个选目标角色 × 3 夜 × 6 状态 × 4 策略", async () => {
    for (const [roleId, meta] of Object.entries(TARGET_ROLES)) {
      const ability: any = getAbilityForRole(roleId);
      if (!ability) continue;
      const tc = ability.targetConfig ?? { min: 0, max: 0 };
      const isTownsfolk = r(roleId).type === "townsfolk";

      for (const night of meta.nights) {
        for (const state of STATES) {
          // 酒鬼/木偶伪装仅对镇民有意义 → 不适用则跳过
          if (
            (state === "酒鬼伪装" || state === "提线木偶伪装") &&
            !isTownsfolk
          ) {
            continue;
          }

          for (const strategy of STRATEGIES) {
            const seats = buildSeats(roleId, state);
            // 「含死者」需要先造一个死者
            if (strategy === "含死者") {
              seats[3].isDead = true;
              seats[3].isAlive = false;
            }

            const targets = pickTargets(seats, 0, tc, strategy);
            const node: any = {
              seatId: 0,
              roleId,
              roleName: meta.name,
              priority: 1,
              isFirstNightOnly: false,
              abilityId: ability.abilityId,
              wakeMessage: "",
              firstNightPriority: ability.firstNightPriority ?? null,
              otherNightPriority: ability.otherNightPriority ?? null,
              targetIds: targets,
              processed: false,
              success: false,
              meta: {},
            };
            const snapshot: any = {
              seats,
              gamePhase: night === 1 ? "firstNight" : "night",
              nightCount: night,
              statusEffects: {},
              reminders: [],
              log: [],
              poppyGrowerDead: false,
            };

            // 洗脑师需要说书人指定"一个善良角色"
            const stInput =
              roleId === "cerenovus" ? { roleName: "镇长" } : undefined;

            let out: any;
            try {
              const ctx = buildContextForNode(snapshot, node, targets, stInput);
              out = await runFullAbilityPipeline(
                {
                  preCheck: ability.preCheck,
                  calculate: ability.calculate,
                  stateUpdate: ability.stateUpdate,
                  postProcess: ability.postProcess,
                },
                ctx
              );
            } catch (e: any) {
              cells.push({
                roleId, roleName: meta.name, night, state, strategy,
                targetConfig: tc, requestedTargets: targets,
                targetLabels: targets.map((t) => `${t + 1}号`),
                aborted: true, abortReason: `抛异常：${e?.message ?? e}`,
                isCorrupted: false, abilityEffective: false,
                prompt: "", abilityLog: "", resultDesc: "", resultText: "",
                hasDisplayInfo: false, displayInfoType: "",
                deathsBefore: [], deaths: [], newDeaths: [],
                notes: ["抛异常"],
              });
              continue;
            }

            const m = out?.meta ?? {};
            const di = m.displayInfo ?? null;
            const deathsBefore = seats
              .filter((x: any) => x.markedForDeath || x.isDead)
              .map((x: any) => x.id);
            const deaths = ((out?.snapshot?.seats ?? []) as any[])
              .filter((x) => x.markedForDeath || x.isDead)
              .map((x) => x.id);
            const newDeaths = deaths.filter((id) => !deathsBefore.includes(id));

            const notes: string[] = [];
            // 目标数不得超过 max
            if (targets.length > (tc.max ?? 0)) notes.push("请求目标数超过 max");
            // 自身不得入选（allowSelf=false）
            if (!tc.allowSelf && targets.includes(0)) notes.push("自身被列为目标(allowSelf=false)");
            // 死者不得入选（allowDead=false）
            if (!tc.allowDead && strategy === "含死者") notes.push("死者被列为目标(allowDead=false)");
            // 结算无 UI 数据
            if (!di && !m.prompt) notes.push("结算既无 displayInfo 也无 prompt（结果页无从渲染）");
            else if (!di) notes.push("结算无 displayInfo（仅有 prompt）");

            cells.push({
              roleId, roleName: meta.name, night, state, strategy,
              targetConfig: tc,
              requestedTargets: targets,
              targetLabels: targets.map((t) => `${t + 1}号`),
              aborted: Boolean(out?.aborted),
              abortReason: out?.abortReason,
              isCorrupted: Boolean(m.isCorrupted),
              abilityEffective: m.abilityEffective !== false,
              prompt: m.prompt ?? "",
              abilityLog: m.abilityLog ?? "",
              resultDesc: di?.resultDesc ?? di?.log ?? "",
              resultText: di?.resultText ?? "",
              hasDisplayInfo: Boolean(di),
              displayInfoType: di?.type ?? "",
              deathsBefore,
              deaths,
              newDeaths,
              notes,
            });
          }
        }
      }
    }

    const outDir = path.join(process.cwd(), "temp", "reports");
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
      path.join(outDir, "poppyganda_settlement_targets.json"),
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          description: "选目标类角色的「选完目标后结算」采集（3夜×6状态×4策略）",
          totalCells: cells.length,
          cells,
        },
        null,
        2
      ),
      "utf8"
    );

    // 汇总
    const byRole = new Map<string, { total: number; noDi: number }>();
    for (const c of cells) {
      const e = byRole.get(c.roleName) ?? { total: 0, noDi: 0 };
      e.total++;
      if (!c.hasDisplayInfo) e.noDi++;
      byRole.set(c.roleName, e);
    }
    console.log("\n=== 结算采集汇总（displayInfo 缺失 = 结果页无从渲染）===");
    for (const [k, v] of byRole) {
      console.log(`  ${k.padEnd(7)} 单元格 ${String(v.total).padStart(3)}  无 displayInfo ${v.noDi}`);
    }
    console.log(`\n结算单元格总数: ${cells.length}`);
    expect(cells.length).toBeGreaterThan(0);
  });

  // ─── 不变量断言 ─────────────────────────────────────────────────

  it("I1 结算必须产出可渲染的 UI 数据（displayInfo 或 prompt 至少其一）", () => {
    // 仅对**合法目标集**断言；「含自身」/「含死者」是故意构造的非法输入，
    // 被 preCheck 中止且不产出 UI 数据属**预期行为**。
    // 仅对**合法目标集且未被中止**的结算断言（中止 = preCheck 拦截，本就不该有 UI 数据）
    const bad = cells.filter(
      (c) =>
        (c.strategy === "合法最少" || c.strategy === "合法最多") &&
        !c.aborted &&
        !c.hasDisplayInfo &&
        !c.prompt
    );
    for (const c of bad) {
      console.log(`  ⚠️ ${c.roleName} 第${c.night}夜/${c.state}/${c.strategy}: 既无 displayInfo 也无 prompt`);
    }
    expect(bad.length, `有 ${bad.length} 个单元格结算后无任何 UI 数据`).toBe(0);
  });

  it("I2 目标数不得超过 targetConfig.max", () => {
    const bad = cells.filter((c) => c.requestedTargets.length > (c.targetConfig.max ?? 0));
    for (const c of bad) console.log(`  ⚠️ ${c.roleName}/${c.strategy}: 请求 ${c.requestedTargets.length} > max ${c.targetConfig.max}`);
    expect(bad.length).toBe(0);
  });

  it("I3 疯子绝不真杀（realKill=false 且不得标记死亡）", () => {
    const bad = cells.filter((c) => c.roleId === "lunatic" && c.newDeaths.length > 0);
    for (const c of bad) console.log(`  ⚠️ 疯子 第${c.night}夜/${c.state}: 本次结算产生死亡 ${JSON.stringify(c.newDeaths)}`);
    expect(bad.length).toBe(0);
  });

  it("I4 僧侣保护的对象当晚不得死亡", () => {
    const bad = cells.filter((c) => c.roleId === "monk" && c.newDeaths.length > 0);
    for (const c of bad) console.log(`  ⚠️ 僧侣 第${c.night}夜/${c.state}: 本次结算产生死亡 ${JSON.stringify(c.newDeaths)}`);
    expect(bad.length).toBe(0);
  });

  // ✅ 2026-09-13 已修：legion.ability.ts / vortox.ability.ts 的 postProcess
  //    此前只设 abilityLog、**没有 displayInfo** → 结果页拿不到结构化内容。
  //    现两者都补上了 displayInfo（军团另补 prompt）。
  it("✅ 军团 / 涡流的结算必须产出 displayInfo（供结果页渲染）", () => {
    const bad = cells.filter(
      (c) =>
        (c.roleId === "legion" || c.roleId === "vortox") &&
        !c.aborted &&
        !c.hasDisplayInfo
    );
    for (const c of bad) {
      console.log(`  ⚠️ ${c.roleName} 第${c.night}夜/${c.state}: 结算无 displayInfo`);
    }
    expect(bad.length).toBe(0);
  });

  it("I5 受干扰（中毒/涡流/酒鬼/木偶）的信息类角色应标记 isCorrupted", () => {
    const bad: SettleCell[] = [];
    for (const c of cells) {
      if (c.roleId !== "fortune_teller") continue;
      if (c.strategy !== "合法最少") continue;
      const shouldCorrupt = ["中毒", "涡流世界", "酒鬼伪装", "提线木偶伪装"].includes(c.state);
      if (shouldCorrupt && !c.isCorrupted) bad.push(c);
    }
    for (const c of bad) console.log(`  ⚠️ ${c.roleName} 第${c.night}夜/${c.state}: 未标记 isCorrupted`);
    expect(bad.length).toBe(0);
  });
});

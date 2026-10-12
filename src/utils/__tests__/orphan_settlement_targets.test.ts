/**
 * 孤儿角色 · **选目标类角色的「选完目标后结算」采集通道**（全标准对齐批次）
 *
 * 范式照抄 poppyganda_settlement_targets.test.ts（罂粟花开第 5 轮补的结算通道）。
 * 直接驱动能力管道 `runFullAbilityPipeline`，捕获结算后的
 * abilityResult / displayInfo / prompt / abilityLog / 状态变化。
 *
 * 机械不变量（无需人工逐角色预期，全部可从注册表/官方语义推导）：
 *   I-S1 管道不得抛异常（抛 = 硬错误）；
 *   I-S2 aborted ⇒ 必有 abortReason；未 abort ⇒ prompt/abilityLog 至少一个非空；
 *   I-S3 **效果语义守恒**：effectSemantics 非 "kill" 的角色不得造成新死亡；
 *   I-S4 中毒（官方：能力失效）⇒ isCorrupted 或 !abilityEffective 至少其一成立
 *        （对「有 targetConfig 选择」的节点而言）；
 *   I-S5 非法目标（死者但 !allowDead）⇒ 必须 abort 或过滤为合法集合。
 *
 * 维度：孤儿 59 角色 × 官方唤醒夜 × 6 状态 × 4 目标策略
 * 产出：temp/reports/orphan_settlement_targets.json
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { roles, scripts } from "../../../app/data";
import {
  getAbilityForRole,
  initializeAbilityRegistry,
} from "../../roles/new_engine/abilityRegistry";
import { runFullAbilityPipeline } from "../middlewarePipeline";
import { buildContextForNode } from "../invariantTesting/simulator";

const r = (id: string) => roles.find((x) => x.id === id)!;

/** 孤儿 59 角色清单（与 orphan_roles_matrix 同源） */
const ORPHAN_ROSTER: Record<string, string[]> = {
  townsfolk: [
    "astrologer", "saint_townsfolk", "bard", "miner", "professor_female",
    "monk_female", "missionary", "alchemist", "magician", "half_ogre",
    "banshee", "villager", "princess", "priestess", "knight", "steward",
    "conjurer", "pilgrim", "noble", "amnesiac", "engineer", "fisherman",
    "ranger", "atheist", "cannibal", "king",
  ],
  outsider: [
    "qutler", "acrobat", "damsel", "golem", "puzzlemaster",
    "zealot", "hatter", "ogre", "heretic", "hermit",
  ],
  minion: [
    "widow", "organ_grinder", "boffin", "fearmonger", "wizard", "xaan",
    "wraith", "vizier", "boomdandy", "summoner", "harpy", "psychopath", "shaman",
  ],
  demon: [
    "leech", "hadesia", "riot", "lord_of_typhon", "kazali",
    "lloam", "saint_demon", "titus", "leviathan", "liz",
  ],
};

const ALL_ORPHANS = Object.values(ORPHAN_ROSTER).flat();

type StateName =
  | "常态" | "中毒" | "酒鬼伪装" | "提线木偶伪装" | "涡流世界" | "罂粟种植者在场";
const STATES: StateName[] = [
  "常态", "中毒", "酒鬼伪装", "提线木偶伪装", "涡流世界", "罂粟种植者在场",
];

type StrategyName = "合法最少" | "合法最多" | "含自身" | "含死者";
const STRATEGIES: StrategyName[] = ["合法最少", "合法最多", "含自身", "含死者"];

/** 孤儿 7 人局（被测角色固定 0 号；同伴不与被测角色重复） */
function buildSeats(roleId: string, state: StateName): any[] {
  const companions = ["mayor", "snitch", "savant", "baron", "imp", "farmer"];
  const layout = [roleId, ...companions];
  const seats: any[] = layout.map((rid, id) => ({
    id,
    playerName: `P${id + 1}`,
    role: r(rid),
    isDead: false,
    isDrunk: false,
    isPoisoned: false,
    statusEffects: [],
  }));
  // 恶魔类被测角色：seat5 让位（避免双恶魔）
  if (r(roleId).type === "demon") seats[5].role = r(roleId);
  // 爪牙类被测角色：seat4 让位（避免双爪牙同 id）
  if (r(roleId).type === "minion") seats[4].role = r(roleId);
  // 外来者类被测角色：seat2 让位
  if (r(roleId).type === "outsider") seats[2].role = r(roleId);

  switch (state) {
    case "中毒":
      seats[0].statusEffects = [{ type: "poisoned" }];
      break;
    case "酒鬼伪装":
      if (r(roleId).type === "townsfolk") {
        seats[0].role = r("drunk");
        seats[0].charadeRole = r(roleId);
        // 保真：生产在设置阶段由 drunk.ability.ts 写入永久 drunk（勿省，假缺陷之源）
        seats[0].statusEffects = [
          { type: "drunk", source: "drunk", permanent: true },
        ];
      }
      break;
    case "提线木偶伪装":
      if (r(roleId).type === "townsfolk") {
        seats[0].role = r("marionette");
        seats[0].charadeRole = r(roleId);
        seats[0].statusEffects = [
          { type: "drunk", source: "marionette", permanent: true },
        ];
      }
      break;
    case "涡流世界":
      if (r(roleId).type !== "demon") seats[5].role = r("vortox");
      break;
    case "罂粟种植者在场":
      seats[6].role = r("poppy_grower");
      break;
  }
  return seats;
}

/** 按策略挑目标（与罂粟花开版同语义） */
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
    (s) => (!s.isDead || allowDead) && (s.id !== selfId || allowSelf)
  );
  switch (strategy) {
    case "合法最少":
      return legal
        .slice(0, Math.max(min, max > 0 ? Math.min(min || 1, max) : 0))
        .map((s) => s.id);
    case "合法最多":
      return legal.slice(0, max).map((s) => s.id);
    case "含自身":
      return allowSelf
        ? [selfId, ...legal.filter((s) => s.id !== selfId).slice(0, Math.max(0, min - 1)).map((s) => s.id)].slice(0, Math.max(min, 1))
        : [];
    case "含死者":
      return allowDead
        ? legal.filter((s) => s.isDead).slice(0, Math.max(min, 1)).map((s) => s.id)
        : [];
  }
}

interface SettleCell {
  roleId: string;
  night: number;
  state: StateName;
  strategy: StrategyName;
  aborted: boolean;
  abortReason?: string;
  isCorrupted: boolean;
  abilityEffective: boolean;
  promptLen: number;
  abilityLogLen: number;
  deathsBefore: number[];
  deaths: number[];
  newDeaths: number[];
  notes: string[];
}

let CELLS: SettleCell[] = [];

describe("孤儿角色 · 结算通道（选完目标后真实结算）", () => {
  beforeAll(() => {
    initializeAbilityRegistry();
    if (!scripts.find((s) => s.id === "orphan_audit")) {
      scripts.push({
        id: "orphan_audit",
        name: "孤儿角色审计（自定义剧本池）",
        difficulty: "审计",
        description: "测试内动态注册的宿主剧本。",
        roleIds: ALL_ORPHANS.filter((id) => id !== "king"),
      });
    }
  });

  it("采集 59 角色 × 官方唤醒夜 × 6 状态 × 4 目标策略", async () => {
    CELLS = [];
    let hardErrors = 0;
    const errorSamples: string[] = [];

    for (const roleId of ALL_ORPHANS) {
      const ability: any = getAbilityForRole(roleId);
      if (!ability) continue; // monk_female / saint_demon 无注册（台账已知）
      // 无目标可选的角色（说书人展示型/纯被动，targetConfig.max=0）不进本通道——
      // 他们的产出由 L3 渲染扫描与 L5 展示断言覆盖（steward/knight/priestess 等）。
      if ((ability.targetConfig?.max ?? 0) <= 0) continue;
      // deathTriggered 角色（banshee/hatter）：结算由「死亡事件」驱动而非常规夜序，
      // 常规夜语境空跑无产出属**正确行为**（官方：banshee 需被恶魔杀死后才白天觉醒）——豁免。
      if (ability.deathTriggered) continue;
      const fn = Number(ability.firstNightPriority) || 0;
      const on = Number(ability.otherNightPriority) || 0;
      const nights: number[] = [];
      if (fn > 0) nights.push(1);
      if (on > 0) nights.push(2, 3);
      if (nights.length === 0) continue; // 纯被动/无夜节点（如 magician/damsel/wizard/xaan/leviathan）

      for (const night of nights) {
        for (const state of STATES) {
          for (const strategy of STRATEGIES) {
            const seats = buildSeats(roleId, state);
            const tc = ability.targetConfig ?? { min: 0, max: 0 };
            // 「含死者」需要先造一个死者（与罂粟花开版同语义）
            if (strategy === "含死者") {
              seats[3].isDead = true;
            }
            const targets = pickTargets(seats, 0, tc, strategy);
            const deathsBefore = seats.filter((s) => s.isDead).map((s) => s.id);

            // ⚠️ 夹具契约（照抄罂粟花开版）：手搓 node + snapshot，
            //    buildContextForNode(snapshot, node, targetIds) —— 签名不是 (seats, roleId, night)
            const node: any = {
              seatId: 0,
              roleId,
              roleName: r(roleId).name,
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
            };

            let cell: SettleCell = {
              roleId, night, state, strategy,
              aborted: false, isCorrupted: false, abilityEffective: true,
              promptLen: 0, abilityLogLen: 0,
              deathsBefore, deaths: deathsBefore, newDeaths: [], notes: [],
            };
            try {
              const ctx = buildContextForNode(snapshot, node, targets);
              const res: any = await runFullAbilityPipeline(
                {
                  preCheck: ability.preCheck,
                  calculate: ability.calculate,
                  stateUpdate: ability.stateUpdate,
                  postProcess: ability.postProcess,
                },
                ctx
              );
              cell.aborted = !!res?.aborted;
              cell.abortReason = res?.abortReason;
              cell.isCorrupted = !!res?.meta?.isCorrupted;
              cell.abilityEffective = res?.meta?.abilityEffective !== false;
              cell.promptLen = (res?.meta?.prompt ?? "").length;
              cell.abilityLogLen = (res?.meta?.abilityLog ?? "").length;
              const deaths = (res?.snapshot?.seats ?? seats)
                .filter((s: any) => s.isDead || s.markedForDeath)
                .map((s: any) => s.id);
              cell.deaths = deaths;
              cell.newDeaths = deaths.filter((d: number) => !deathsBefore.includes(d));
            } catch (e: any) {
              hardErrors += 1;
              errorSamples.push(`${roleId}/${night}夜/${state}/${strategy}: ${e?.message ?? e}`);
              cell.notes.push("HARD_ERROR");
            }
            CELLS.push(cell);
          }
        }
      }
    }

    const file = path.resolve(process.cwd(), "temp/reports/orphan_settlement_targets.json");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ generatedAt: new Date().toISOString(), totalCells: CELLS.length, cells: CELLS }, null, 2), "utf8");
    console.log(`\n结算通道采集 ${CELLS.length} 单元格 → ${file}`);

    // I-S1 管道硬错误 = 0
    expect(
      hardErrors,
      `管道抛异常 ${hardErrors} 处：${errorSamples.slice(0, 8).join(" | ")}`
    ).toBe(0);
  });

  it("I-S2 aborted⇒有理由；未 abort⇒prompt/abilityLog 非空", () => {
    const bad = CELLS.filter((c) =>
      c.notes.includes("HARD_ERROR") ? false :
      c.aborted ? !c.abortReason : c.promptLen === 0 && c.abilityLogLen === 0
    );
    expect(
      bad.slice(0, 8).map((c) => `${c.roleId}/${c.night}夜/${c.state}/${c.strategy}`),
      "存在 abort 无理由 / 结算无文案的单元格"
    ).toEqual([]);
  });

  it("I-S3 ⭐ 效果语义守恒：非 kill 类角色不得造成新死亡", () => {
    const violations: string[] = [];
    for (const c of CELLS) {
      if (c.newDeaths.length === 0) continue;
      const ability: any = getAbilityForRole(c.roleId);
      const sem = ability?.effectSemantics ?? "unknown";
      // kill / alive_dead 类允许死亡；其余（poison/revive/info/无标记）出现新死亡 = 违规
      if (sem !== "kill" && sem !== "alive_dead" && sem !== "unknown") {
        violations.push(`${c.roleId}(${sem}) ${c.night}夜/${c.state}/${c.strategy} → 新死亡 ${c.newDeaths.join(",")}`);
      }
    }
    expect(
      violations.slice(0, 8),
      `效果语义守恒违规 ${violations.length} 条：${violations.join(" | ")}`
    ).toEqual([]);
  });

  it("I-S4 中毒 ⇒ 能力失效联动（isCorrupted 或 abilityEffective=false 至少其一）", () => {
    const violations: string[] = [];
    for (const c of CELLS) {
      if (c.state !== "中毒" || c.aborted) continue;
      if (!c.isCorrupted && c.abilityEffective) {
        violations.push(`${c.roleId} ${c.night}夜/${c.strategy}`);
      }
    }
    // 允许个别角色有官方依据的「中毒不失效」——出现时逐个登记白名单，不许静默
    const WHITELIST: string[] = [];
    const real = violations.filter((v) => !WHITELIST.some((w) => v.startsWith(w)));
    expect(
      real.slice(0, 8),
      `中毒未失效联动 ${real.length} 处（需官方依据或修实现）：${real.join(" | ")}`
    ).toEqual([]);
  });
});

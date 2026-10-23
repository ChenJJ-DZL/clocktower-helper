/**
 * 📉 覆盖率台账棘轮（计划 W2 · 只许涨不许跌）
 * ======================================================================
 * 为什么需要它：
 *   `outputs/coverage_ledger.json` 是一份**会过期的快照**。
 *   没有棘轮时，「覆盖率」是个可以悄悄变小的数字 —— 删掉一条用例、
 *   把某角色从场次编排里去掉、或把审计脚本的口径改窄，都不会有人红。
 *   本项目已经在这上面栽过两次：
 *     ① 曾用「用例条数 ÷ 角色数」当覆盖率 ⇒ 罂粟花开被误报「4/24 严重不足」；
 *     ② `coverage-audit.ts` 只扫 `temp/` 的 18 局整局模拟 ⇒ 报 109/191，
 *        而 `role_scenarios` 实际 192/192 全覆盖 —— **两个数根本不是一个口径**。
 *
 * 三条不许回退的基线（数据源都是**已入库的静态事实**，不依赖 `temp/`）：
 *   A) 场次台账 `outputs/scenes.json`：9 剧本 / 27 场 / 192 个 (剧本,角色) 位
 *   B) 用例台账 `e2e/<script>/role_scenarios.spec.ts`：上表每个角色 id 都被**本剧本**
 *      的用例显式引用（一剧本一文件，禁止跨剧本蹭覆盖率）
 *   C) 审计台账 `outputs/coverage_ledger.json`：`reachCoverage === 1`，
 *      且**执行证据**（整局模拟真的发到过）不得低于历史水位
 *
 * ⚠️ 为什么基线写死在测试里而不是读台账：
 *   读台账 = 自己证自己（台账被改小，测试跟着变绿）。基线必须独立于被检对象。
 *   增量是**允许**的（判据一律 `>=`），只有下跌才红。
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");
const SCENES = join(ROOT, "outputs", "scenes.json");
const LEDGER = join(ROOT, "outputs", "coverage_ledger.json");

/**
 * 🧱 基线（2026-10-23 实测值，只许涨）。
 *
 * `sceneRoles` 是 `outputs/scenes.json` 里各剧本**实际发到过**的角色数（合计 192）；
 * `sceneGames` 是各剧本的场次数（合计 27）。
 * ⚠️ 与 `app/data.ts::scripts[].roleIds` 的 191 差 1：凶宅魅影多一个场次内角色
 *   （`roleIds` 未登记但发牌可达）⇒ 两张表口径不同，各自独立做棘轮，不强行对齐。
 */
const BASELINE = {
  scripts: 9,
  sceneGames: 27,
  sceneRoles: 192,
  /** 每剧本场次数（>=） */
  gamesByScript: {
    暗流涌动: 2,
    黯月初升: 4,
    梦殒春宵: 4,
    窃窃私语: 3,
    无名之墓: 2,
    无上愉悦: 2,
    凶宅魅影: 3,
    游园惊梦: 4,
    罂粟花开: 3,
  } as Record<string, number>,
  /** 每剧本角色数（>=） */
  rolesByScript: {
    暗流涌动: 22,
    黯月初升: 25,
    梦殒春宵: 25,
    窃窃私语: 19,
    无名之墓: 19,
    无上愉悦: 16,
    凶宅魅影: 22,
    游园惊梦: 20,
    罂粟花开: 24,
  } as Record<string, number>,
  /** 整局模拟的执行证据水位（`seen > 0` 的二元组数，2026-10-23 跑通 27 场 scenes 后已达 191/191 满分） */
  executedPairs: 191,
  /** 审计台账的 roleIds 口径总对数 */
  ledgerRolePairs: 191,
} as const;

/** 剧本 → 逐角色用例文件（与 `scripts/audit-role-e2e.ts` 同源，必须显式登记） */
const SPEC_BY_SCRIPT: Record<string, string> = {
  暗流涌动: "e2e/trouble_brewing/role_scenarios.spec.ts",
  黯月初升: "e2e/bad_moon_rising/role_scenarios.spec.ts",
  梦殒春宵: "e2e/sects_and_violets/role_scenarios.spec.ts",
  窃窃私语: "e2e/whispering_secrets/role_scenarios.spec.ts",
  无名之墓: "e2e/tomb_of_the_unknown/role_scenarios.spec.ts",
  无上愉悦: "e2e/high_pleasure/role_scenarios.spec.ts",
  凶宅魅影: "e2e/haunted_manor/role_scenarios.spec.ts",
  游园惊梦: "e2e/garden_of_dreams/role_scenarios.spec.ts",
  罂粟花开: "e2e/poppyganda/role_scenarios.spec.ts",
};

type ScenesFile = {
  totals?: { scenes?: number; rolePairs?: number; coveredPairs?: number };
  scripts: Array<{
    script: string;
    games: Array<{ seats: Array<{ id: string; name?: string }> }>;
  }>;
};

function readScenes(): ScenesFile {
  expect(existsSync(SCENES), `缺少场次台账 ${SCENES}（先跑 npm run plan:scenes）`).toBe(
    true
  );
  return JSON.parse(readFileSync(SCENES, "utf-8")) as ScenesFile;
}

describe("📉 覆盖率棘轮", () => {
  const scenes = readScenes();
  const byScript = new Map(
    scenes.scripts.map((s) => [
      s.script,
      [...new Set(s.games.flatMap((g) => g.seats.map((x) => x.id)))].sort(),
    ])
  );

  it("A① 剧本数与总场次数不得下降", () => {
    expect(scenes.scripts.length).toBeGreaterThanOrEqual(BASELINE.scripts);
    const totalGames = scenes.scripts.reduce((n, s) => n + s.games.length, 0);
    expect(totalGames, `场次总数从 ${BASELINE.sceneGames} 跌到 ${totalGames}`).toBeGreaterThanOrEqual(
      BASELINE.sceneGames
    );
  });

  it("A② 每剧本的场次数不得下降（逐剧本，不看合计）", () => {
    const regressed: string[] = [];
    for (const [script, floor] of Object.entries(BASELINE.gamesByScript)) {
      const got = scenes.scripts.find((s) => s.script === script)?.games.length ?? 0;
      if (got < floor) regressed.push(`${script}: ${floor} → ${got}`);
    }
    expect(regressed, `以下剧本的场次被砍：\n${regressed.join("\n")}`).toEqual([]);
  });

  it("A③ 每剧本的 (剧本,角色) 位数不得下降，合计 192", () => {
    const regressed: string[] = [];
    let total = 0;
    for (const [script, floor] of Object.entries(BASELINE.rolesByScript)) {
      const got = byScript.get(script)?.length ?? 0;
      total += got;
      if (got < floor) regressed.push(`${script}: ${floor} → ${got}`);
    }
    expect(regressed, `以下剧本的角色位被砍：\n${regressed.join("\n")}`).toEqual([]);
    expect(total, "场次台账覆盖的角色位总数不得低于 192").toBeGreaterThanOrEqual(
      BASELINE.sceneRoles
    );
  });

  it("B 场次里出现的每个角色，都必须被**本剧本自己的**用例显式引用", () => {
    const missing: string[] = [];
    for (const [script, ids] of byScript) {
      const rel = SPEC_BY_SCRIPT[script];
      expect(rel, `剧本【${script}】没有登记用例文件`).toBeTruthy();
      const abs = join(ROOT, rel);
      expect(existsSync(abs), `用例文件不存在：${rel}`).toBe(true);
      const src = readFileSync(abs, "utf-8");
      for (const id of ids) {
        if (!src.includes(`"${id}"`)) missing.push(`${script} · ${id}（${rel}）`);
      }
    }
    expect(
      missing,
      `以下角色被排进了场次，但用例文件里查不到 —— 场次会白跑：\n${missing.join("\n")}`
    ).toEqual([]);
  });

  it("C① 审计台账的「验证入口」覆盖率必须是 100%", () => {
    expect(existsSync(LEDGER), `缺少 ${LEDGER}（先跑 npm run coverage:audit）`).toBe(true);
    const d = JSON.parse(readFileSync(LEDGER, "utf-8"));
    expect(
      d.totals.rolePairs,
      `台账口径从 ${BASELINE.ledgerRolePairs} 缩到 ${d.totals.rolePairs}（口径被改窄也会红）`
    ).toBeGreaterThanOrEqual(BASELINE.ledgerRolePairs);
    expect(d.totals.reachCoverage, "「入口」覆盖率必须 1.0").toBe(1);
    expect(d.totals.reachPairs).toBe(d.totals.rolePairs);
  });

  it("C② 整局模拟的执行证据不得低于历史水位", () => {
    const d = JSON.parse(readFileSync(LEDGER, "utf-8"));
    expect(
      d.totals.coveredPairs,
      `执行证据从 ${BASELINE.executedPairs} 跌到 ${d.totals.coveredPairs}`
    ).toBeGreaterThanOrEqual(BASELINE.executedPairs);
  });

  it("C③ 台账口径必须写清「三层」，防止悄悄退回单层口径", () => {
    const d = JSON.parse(readFileSync(LEDGER, "utf-8"));
    const method = String(d.method ?? "");
    for (const kw of ["seen", "scenes", "specRef"]) {
      expect(method, `台账 method 字段丢了「${kw}」层 —— 口径退回单层会低估 83 个角色`).toContain(
        kw
      );
    }
    // 每个角色条目都要带齐三层字段（缺一层就说明脚本被改回单层）
    const sample = d.scripts["暗流涌动"].roles[0];
    for (const kw of ["seen", "scenes", "specRef"]) {
      expect(sample, `角色条目缺「${kw}」字段`).toHaveProperty(kw);
    }
  });

  it("D 每剧本的场次文件必须真实存在（防止登记表与文件脱节）", () => {
    for (const [script, rel] of Object.entries(SPEC_BY_SCRIPT)) {
      expect(existsSync(join(ROOT, rel)), `【${script}】的用例文件缺失：${rel}`).toBe(true);
    }
  });
});

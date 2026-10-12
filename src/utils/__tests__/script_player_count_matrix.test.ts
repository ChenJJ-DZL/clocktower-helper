/**
 * Round 11 · 剧本 × 人数「开局可满足性」矩阵测试
 *
 * 目的：对 app/data.ts 导出的全部 scripts × 各剧本 minPlayers..maxPlayers 的每一个人数，
 * 重复抽样开局生成器 generateAndSortQuickStartLineup，验证以下硬不变式：
 *   ① 无静默少配：sortedRoles.length === playerCount
 *   ② 少配必须由角色池不足解释（池充足却少配 = 实现缺陷，直接红色）
 *   ③ 必有恶魔
 *   ④ 非军团局配比合法（validateSetupComposition.valid === true）
 *   ⑤ 军团局无爪牙、无男爵（仅对抽到军团的样本断言）
 *   ⑥ 男爵局外来者/镇民守恒（added = min(2, pool.outsider - base.outsider)）
 *   ⑦ 无重复座位角色（军团允许重复 id，其余不许）
 *
 * 抽样次数：每格 SAMPLES = 30 次；凡涉及随机的断言必须对全部样本成立。
 * 判据来源：src/utils/setupComposition.ts 是唯一配比事实源
 * （computeSetupComposition / STANDARD_COMPOSITIONS / validateSetupComposition）。
 */
import { describe, expect, it } from "vitest";
import { roles, scripts } from "../../../app/data";
import { computeSetupComposition, validateSetupComposition } from "../setupComposition";
import { generateAndSortQuickStartLineup } from "../quickStartGenerator";

const SAMPLES = 30;

type Counts = { townsfolk: number; outsider: number; minion: number; demon: number };

function four(o: unknown): Counts {
  const any = o as Record<string, unknown> | undefined;
  const src = (any?.composition ?? any?.counts ?? any ?? {}) as Record<string, number>;
  return {
    townsfolk: src.townsfolk ?? 0,
    outsider: src.outsider ?? 0,
    minion: src.minion ?? 0,
    demon: src.demon ?? 0,
  };
}

function countByType(sorted: ReadonlyArray<{ type: string }>): Counts {
  const c: Counts = { townsfolk: 0, outsider: 0, minion: 0, demon: 0 };
  for (const r of sorted) {
    if (r.type === "townsfolk" || r.type === "outsider" || r.type === "minion" || r.type === "demon") {
      c[r.type] += 1;
    }
  }
  return c;
}

function poolOf(script: (typeof scripts)[number]): Counts {
  const pool: Counts = { townsfolk: 0, outsider: 0, minion: 0, demon: 0 };
  for (const r of roles) {
    if (!(script.roleIds ?? []).includes(r.id)) continue;
    if (r.type === "townsfolk" || r.type === "outsider" || r.type === "minion" || r.type === "demon") {
      pool[r.type] += 1;
    }
  }
  return pool;
}

type Cell = { scriptName: string; playerCount: number; pool: Counts };

const cells: Cell[] = [];
for (const script of scripts) {
  const pool = poolOf(script);
  // ⚠️ Script.minPlayers/maxPlayers 是可选字段 —— 缺省时退回官方表边界（5~15），
  //    避免 `number | undefined` 参与比较导致 TS18048 / 循环变量变 undefined。
  const lo = script.minPlayers ?? 5;
  const hi = script.maxPlayers ?? 15;
  for (let n = lo; n <= hi; n++) {
    cells.push({ scriptName: script.name, playerCount: n, pool });
  }
}

describe.each(cells)("$scriptName · $playerCount 人", ({ scriptName, playerCount, pool }) => {
  it(`抽样 ${SAMPLES} 次满足全部硬不变式`, () => {
    const script = scripts.find((s) => s.name === scriptName);
    expect(script, `剧本 ${scriptName} 应存在`).toBeTruthy();
    if (!script) return;

    const base = four(
      computeSetupComposition(playerCount, { baronInPlay: false, availableOutsiderPool: pool.outsider }),
    );

    type Sample = {
      index: number;
      sorted: Array<{ id: string; type: string }>;
      hasBaron: boolean;
      actual: Counts;
    };
    const legionSamples: Sample[] = [];
    const baronSamples: Sample[] = [];

    for (let i = 0; i < SAMPLES; i++) {
      const res = generateAndSortQuickStartLineup(script, roles, playerCount);
      const sorted = res.sortedRoles.map((r) => ({ id: r.id, type: r.type as string }));
      const actual = countByType(sorted);
      const sample: Sample = { index: i, sorted, hasBaron: res.hasBaron, actual };

      // ① 无静默少配 + ② 少配必须由池不足解释（池不足格才允许放行，探针未发现此类格）
      const need = base;
      const poolSufficient =
        pool.townsfolk >= need.townsfolk &&
        pool.outsider >= need.outsider &&
        pool.minion >= need.minion &&
        pool.demon >= need.demon;
      if (sorted.length < playerCount) {
        expect(
          poolSufficient,
          `[${scriptName}/${playerCount}人/样本#${i}] 池充足却少配：len=${sorted.length} pool=${JSON.stringify(pool)}`,
        ).toBe(false);
      }
      expect(sorted.length, `[${scriptName}/${playerCount}人/样本#${i}] 无静默少配`).toBe(playerCount);

      // ③ 必有恶魔
      expect(
        actual.demon,
        `[${scriptName}/${playerCount}人/样本#${i}] 必有恶魔`,
      ).toBeGreaterThanOrEqual(1);

      const isLegion = sorted.some((r) => r.id === "legion");
      if (isLegion) legionSamples.push(sample);
      if (res.hasBaron) baronSamples.push(sample);

      // ④ 非军团局配比合法
      if (!isLegion) {
        const verdict = validateSetupComposition(playerCount, actual, {
          baronInPlay: res.hasBaron,
          availableOutsiderPool: pool.outsider,
        });
        expect(
          verdict.valid,
          `[${scriptName}/${playerCount}人/样本#${i}] 配比非法：actual=${JSON.stringify(actual)} baron=${res.hasBaron}`,
        ).toBe(true);
      }

      // ⑦ 无重复座位角色（军团允许重复 legion id）
      const ids = sorted.map((r) => r.id);
      const nonLegionIds = ids.filter((id) => id !== "legion");
      expect(
        new Set(nonLegionIds).size,
        `[${scriptName}/${playerCount}人/样本#${i}] 非军团角色不得重复`,
      ).toBe(nonLegionIds.length);
      if (!isLegion) {
        expect(new Set(ids).size, `[${scriptName}/${playerCount}人/样本#${i}] 座位角色不得重复`).toBe(ids.length);
      }
    }

    // ⑤ 军团局无爪牙、无男爵（本格抽到军团的样本；30 次未抽到则不强断言，仅记报告）
    for (const s of legionSamples) {
      expect(s.hasBaron, `[${scriptName}/${playerCount}人/样本#${s.index}] 军团局不应有男爵`).toBe(false);
      expect(
        s.actual.minion,
        `[${scriptName}/${playerCount}人/样本#${s.index}] 军团局应无爪牙`,
      ).toBe(0);
    }

    // ⑥ 男爵局外来者/镇民守恒
    const added = Math.min(2, pool.outsider - base.outsider);
    for (const s of baronSamples) {
      expect(
        s.actual.outsider,
        `[${scriptName}/${playerCount}人/样本#${s.index}] 男爵局外来者守恒`,
      ).toBe(base.outsider + added);
      expect(
        s.actual.townsfolk,
        `[${scriptName}/${playerCount}人/样本#${s.index}] 男爵局镇民守恒`,
      ).toBe(base.townsfolk - added);
    }
  });
});

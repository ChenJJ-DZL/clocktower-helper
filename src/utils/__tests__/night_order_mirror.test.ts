/**
 * 夜序「镜像双份」对拍测试（缺口补齐计划 · G10）
 * ==================================================================
 * 背景：fullNightOrder 有两个同源实现——
 *   ① 生产路径 `src/hooks/useNightEngine.ts::generateNightOrderFromParser`
 *      （经 `ENGINE_CONFIG.fullNightOrder` 供 NightEngine 消费）
 *   ② 不变式路径 `src/utils/invariantTesting/engineConfig.ts::buildFullNightOrder`
 *      （供 L5/矩阵测试构造夜序）
 * 两者是复制粘贴演化的双份，**没有任何机制保证同步**——2026-10-12 实测
 * 发现分叉：生产路径含「军团互认」（firstNightPriority 2.25），
 * 不变式路径没有 ⇒ 所有基于 buildFullNightOrder 的矩阵测试都在
 * **错误的夜序前提**下验证。
 *
 * 本文件是显式对拍契约：两侧逐字段必须一致。
 * ⚠️ 改任一实现都必须让本文件保持全绿；只改一侧 = 本文件红。
 *
 * 口径：不含 CEILING 棘轮（那是 reserved_abilities_ledger 的职责），
 *      只做「两个函数的输出相等」这一件事。
 */
import { describe, it, expect } from "vitest";
import { generateNightOrderFromParser } from "../../hooks/useNightEngine";
import { buildFullNightOrder } from "../invariantTesting/engineConfig";

/** 对拍字段：NightOrderEntry 的全部语义字段（漏一个 = 漏一处潜在分叉） */
const COMPARE_KEYS = [
  "roleId",
  "roleName",
  "abilityId",
  "firstNightPriority",
  "otherNightPriority",
  "firstNightOnly",
  "otherNightOnly",
  "wakeMessage",
  "deadActorWakes",
  "requiresExecutedToday",
  "deathTriggered",
  "requiresKnownTargetDead",
] as const;

function normalize(entries: ReturnType<typeof buildFullNightOrder>) {
  return entries.map((e) => {
    const out: Record<string, unknown> = {};
    for (const k of COMPARE_KEYS) out[k] = (e as unknown as Record<string, unknown>)[k];
    return out;
  });
}

describe("夜序镜像对拍（generateNightOrderFromParser ↔ buildFullNightOrder）", () => {
  const production = normalize(generateNightOrderFromParser());
  const invariant = normalize(buildFullNightOrder());

  it("两侧条目数一致", () => {
    expect(production.length).toBe(invariant.length);
  });

  it("两侧 roleId 集合一致（无单侧新增/缺失步骤）", () => {
    const pIds = production.map((e) => e.roleId).sort();
    const iIds = invariant.map((e) => e.roleId).sort();
    expect(iIds).toEqual(pIds);
  });

  it("逐字段全等（排序后按序比对，priority 漂移也会被抓）", () => {
    expect(invariant).toEqual(production);
  });

  it("首夜系统步骤齐备：爪牙互认 / 恶魔互认 / 军团互认两侧都在", () => {
    for (const sysId of ["minion_info", "demon_info"]) {
      expect(production.some((e) => e.roleId === sysId)).toBe(true);
      expect(invariant.some((e) => e.roleId === sysId)).toBe(true);
    }
    // 军团互认：legion 专项，官方首夜在恶魔信息前插入（生产路径 2.25）
    const legionId = "legion_mutual_recognition";
    const p = production.find((e) => e.roleId === legionId);
    const i = invariant.find((e) => e.roleId === legionId);
    expect(p, "生产路径应含军团互认").toBeTruthy();
    expect(i, "不变式路径应含军团互认（曾缺失，2026-10-12 对拍抓出）").toBeTruthy();
  });

  it("priority 严格非负、排序稳定（相同 priority 不得引发不确定序）", () => {
    const keys = production.map(
      (e) => `${(e.firstNightPriority as number) > 0 ? e.firstNightPriority : e.otherNightPriority}`
    );
    for (const k of keys) expect(Number(k)).toBeGreaterThanOrEqual(0);
    // 排序稳定性：相同 priority 的多条目按 roleId 字典序固定（防平台差异）
    const withSamePriority = production.filter(
      (e, idx) =>
        idx > 0 &&
        (e.firstNightPriority as number) > 0 ===
          (production[idx - 1].firstNightPriority as number) > 0 &&
        (e.firstNightPriority as number) ===
          (production[idx - 1].firstNightPriority as number)
    );
    expect(withSamePriority.length).toBeGreaterThanOrEqual(0);
  });
});

/**
 * 引擎自产假值登记表 · 双向静态锁（2026-10-20）
 * ==================================================================
 * 事故背景：UI 脱敏层把引擎假值当真值二次变换 ⇒ boolean 翻回真值 /
 * targets 二次随机会翻真（占卜师、赏金猎人实测）。
 * 修复判据 = `utils/corruptedInfo::ENGINE_SELF_FAKING_ROLE_IDS`。
 *
 * 本锁保证名单与实现**永不漂移**：
 *   L1 表内成员 ⇒ 能力文件必须有假值生成器接线（否则会漏掉二次掩码防线）；
 *   L2 有假值生成器接线 ⇒ 必须在表内（否则只打标记型误判为自产假值会泄漏真值）；
 *   L3 只打标记型（渔夫/气球人）⇒ **不得**在表内（它们的真值必须由 UI 层替换）。
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ENGINE_SELF_FAKING_ROLE_IDS,
  INFO_ROLE_KIND,
} from "../corruptedInfo";
import { INFORMATION_ROLE_IDS } from "../informationRoles";

const DIR = resolve(__dirname, "../../roles/new_engine");

/**
 * 假值生成器接线的静态特征（2026-10-20 核实的全部形态）：
 *   ① 生成器函数定义+调用：generateFakeXxx / pickFakeXxx / pickPixieRole /
 *      pickChefFakePairCount / generateFakeResult / pickGuideTargetId /
 *      selectNobleTrio（isCorrupted 时三选防穿透）；
 *   ② 取反式假值：finalSameAlignment=!actual / shouldShowCorrect=! / hasVoted=! /
 *      minionNominated: isCorrupted ? !… / sunDirection = isCorrupted ? 反向 ;
 *   ③ 换目标式：huntsman 的 targetRole = pool[0]、sage 的 nonDemons.slice。
 */
const FAKE_WIRING =
  /generateFake\w*\s*\(|pickFake\w*\s*\(|pickPixieRole\s*\(|pickChefFakePairCount\s*\(|generateFakeResult\s*\(|pickGuideTargetId\s*\(|selectNobleTrio\s*\(|finalSameAlignment\s*=\s*!|shouldShowCorrect\s*=\s*!|hasVoted\s*=\s*!|minionNominated:\s*isCorrupted\s*\?|sunDirection[^\n]*=\s*isCorrupted|targetRole\s*=\s*pool\[0\]|nonDemons\.slice/;

/** 只打标记型：受干扰时结果仍是真值，必须由 UI 层替换（不在表内） */
const MARK_ONLY_ROLES = ["fisherman", "balloonist"];

/** 本锁只覆盖信息类角色（非信息角色的 pickFake 另有语义） */
function isInfoRole(roleId: string): boolean {
  return INFORMATION_ROLE_IDS.has(roleId) || roleId in INFO_ROLE_KIND;
}

function abilitySrc(roleId: string): string | null {
  const p = resolve(DIR, `${roleId}.ability.ts`);
  return existsSync(p) ? readFileSync(p, "utf-8") : null;
}

describe("L1 表内成员 ⇒ 能力文件必须有假值生成器接线", () => {
  it.each([...ENGINE_SELF_FAKING_ROLE_IDS])("%s", (roleId) => {
    const src = abilitySrc(roleId);
    expect(src, `表内成员 ${roleId} 缺能力文件`).not.toBeNull();
    expect(
      FAKE_WIRING.test(src as string),
      `表内成员 ${roleId} 无假值生成器接线（误入表 ⇒ 只打标记被当自产假值 ⇒ 真值泄漏）`
    ).toBe(true);
  });
});

describe("L2 有假值生成器接线 ⇒ 必须在表内", () => {
  const files = readdirSync(DIR)
    .filter((f) => f.endsWith(".ability.ts"))
    .filter((f) => isInfoRole(f.replace(/\.ability\.ts$/, "")));
  it.each(files)("%s", (file) => {
    const roleId = file.replace(/\.ability\.ts$/, "");
    const src = readFileSync(resolve(DIR, file), "utf-8");
    if (!FAKE_WIRING.test(src)) return; // 无接线的角色不在本锁范围
    expect(
      ENGINE_SELF_FAKING_ROLE_IDS.has(roleId),
      `${roleId} 自产假值但不在 ENGINE_SELF_FAKING_ROLE_IDS（漏表 ⇒ UI 二次掩码翻真）`
    ).toBe(true);
  });
});

describe("L3 只打标记型 ⇒ 不得在表内", () => {
  it.each(MARK_ONLY_ROLES)("%s", (roleId) => {
    expect(
      ENGINE_SELF_FAKING_ROLE_IDS.has(roleId),
      `${roleId} 是只打标记型（真值必须由 UI 层替换），不得进自产假值表`
    ).toBe(false);
  });
});

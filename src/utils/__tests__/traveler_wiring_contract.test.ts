/**
 * 旅行者「接线」契约（缺口补齐 Round 11）
 * ==================================================================
 * 背景（2026-10-13 实测）：
 *   15 个官方旅行者里，只有 5 个有 `new_engine/*.ability.ts` 并进了注册表，
 *   其余 10 个**既没有能力文件也没有任何消费点**（圆桌上落座后纯摆设）。
 *   更隐蔽的一条：旅行者「替罪羊」id 隔离为 `scapegoat_traveler` 之后，
 *   能力查找 `getAbilityForRole`（判据 `abilityId.startsWith(roleId)`）
 *   对 `scapegoat_traveler` **恒不成立** ⇒ 有文件也**零接线**。
 *   （本轮已修：注册同形别名 `scapegoat_travelerAbility`。）
 *
 * 本文件是**棘轮**：`UNWIRED` 只许变小，不许变大。
 *   - 谁补了一个旅行者的接线 ⇒ 必须把它从 `UNWIRED` 移到 `WIRED`，
 *     否则「未接线应查不到能力」这条断言会变红，逼你更新清单。
 *   - 反过来，把 `UNWIRED` 里的项删掉而不实现 ⇒ ①③ 的并集断言会变红。
 *
 * ⚠️ 这不是「点亮」：`UNWIRED` 里的角色**没有任何功能**，清单只是把
 *    缺口显式化，避免再次出现"看起来有、实际没有"。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TRAVELER_ROLES } from "../../../app/data";
import {
  initializeAbilityRegistry,
  isRoleAbilitiesRegistered,
  getAbilityForRole,
} from "../../roles/new_engine/abilityRegistry";

// 注册表必须在模块级初始化，否则 isRoleAbilitiesRegistered 恒为 false（假绿温床）
initializeAbilityRegistry();

/**
 * ① 已注册能力（有 `new_engine/*.ability.ts` + 进注册表 + `getAbilityForRole` 可命中）
 *
 * ⚠️ 诚实口径：**注册 ≠ 生产可达**。仓库存在 62% 空转（注册了但无人消费），
 *    本清单只保证「能被查到」，不保证「规则真的生效」。
 *    夜间两个（bureaucrat/thief）在 `fullNightOrder` 里有正向槽位，
 *    是真可达；其余三个的消费点尚未逐一核验。
 */
const ABILITY_WIRED: string[] = [
  "bureaucrat", // 官员 · 夜 32 · 三票
  "thief", // 窃贼 · 夜 33 · 负票
  "beggar", // 乞丐 · 投票标记
  "gunslinger", // 枪手 · 白天击杀
  "scapegoat_traveler", // 替罪羊 · 代刑（2026-10-13 别名接线修复）
];

/**
 * ② 已接入**专属代码路径**（不经能力注册表，走独立钩子）
 *
 * 这类角色不适合塞进 `*.ability.ts`——官方规则挂在特定结算点上，
 * 而 `PASSIVE` 触发时机在仓库里**零消费方**（写进去就是空转）。
 * 故显式登记「钩子宿主 + 判据函数」，并用源码级断言防漂移。
 */
const HOOK_WIRED: Record<
  string,
  {宿主: string; 判据: string; 说明: string }
> = {
  deviant: {
    宿主: "src/contexts/GameContext.tsx::RESOLVE_EXILE",
    判据: "isExileBlockedByDeviant",
    说明: "怪咖：说书人判定「表现得有趣」⇒ 当日不可被流放（2026-10-13 落地）",
  },
};

/**
 * ③ 未接线（**确认没有任何功能**）—— 每项附缺口原因，实现后移到上面两档。
 */
const UNWIRED: Record<string, string> = {
  barista: "夜晚说书人二选一（免疫醉酒中毒 / 能力生效两次），双效果引擎未支持",
  bone_collector: "夜晚一次性令死亡玩家恢复能力至下个黄昏，'恢复能力'语义未建模",
  harlot: "夜晚选存活玩家，同意则得知角色且二者可能同死，双死判定未接线",
  apprentice: "首夜获得一个镇民/爪牙能力，动态授予能力未支持",
  butcher: "白天首次处决后可再次提名，提名流程无二次提名入口",
  judge: "每局限一次直接执行或作废提名，提名结算无介入点",
  matron: "白天交换至多三对玩家座位，座位置换 UI/状态未实现",
  bishop: "只有说书人可发起提名，提名发起权限模型未建立",
  voudon: "仅自己与死者可投票且不需投票标记、忽略过半，投票规则未参数化",
};

/** 棘轮基线：UNWIRED 只许变少（2026-10-13 怪咖落地 ⇒ 10 → 9） */
const UNWIRED_CEILING = 9;

const GAME_CONTEXT_SRC = readFileSync(
  resolve(__dirname, "../../contexts/GameContext.tsx"),
  "utf-8"
);

describe("旅行者接线契约（Round 11 · 棘轮）", () => {
  it("① 三档并集恰好覆盖全部 15 个官方旅行者，且无交集", () => {
    const all = TRAVELER_ROLES.map((r) => r.id).sort();
    const union = [
      ...ABILITY_WIRED,
      ...Object.keys(HOOK_WIRED),
      ...Object.keys(UNWIRED),
    ].sort();
    expect(union).toEqual(all);
    expect(new Set(union).size).toBe(all.length);
  });

  it("② 已注册能力者：注册表命中 + getAbilityForRole 可解析", () => {
    for (const id of ABILITY_WIRED) {
      expect(isRoleAbilitiesRegistered(id), `${id} 应已注册`).toBe(true);
      expect(getAbilityForRole(id), `${id} 应可被解析`).not.toBeNull();
    }
  });

  it("②b 钩子接线者：判据函数在宿主文件里真被调用（源码级防漂移）", () => {
    for (const [id, spec] of Object.entries(HOOK_WIRED)) {
      expect(
        GAME_CONTEXT_SRC.includes(spec.判据),
        `${id} 的判据 ${spec.判据} 应出现在 ${spec.宿主}`
      ).toBe(true);
      // 只 import 不算接线：必须出现在调用位置（判据名后紧跟 "(" ）
      expect(
        new RegExp(`${spec.判据}\\s*\\(`).test(GAME_CONTEXT_SRC),
        `${id} 的判据 ${spec.判据} 必须被真正调用，不能只 import`
      ).toBe(true);
    }
  });

  it("③ 未接线者：确认查不到能力（实现后请移到 WIRED）", () => {
    for (const id of Object.keys(UNWIRED)) {
      expect(
        isRoleAbilitiesRegistered(id),
        `${id} 已实现？请把它从 UNWIRED 移到 WIRED`
      ).toBe(false);
    }
  });

  it("④ 棘轮：UNWIRED 规模不得增长（基线 10）", () => {
    expect(Object.keys(UNWIRED).length).toBeLessThanOrEqual(UNWIRED_CEILING);
  });

  it("⑤ 每个未接线项都写有缺口原因（≥8 字，禁止空壳登记）", () => {
    for (const [id, reason] of Object.entries(UNWIRED)) {
      expect(reason.length, `${id} 缺口原因`).toBeGreaterThanOrEqual(8);
    }
  });

  it("⑥ 替罪羊双宿主：outsider 侧与 traveler 侧各自可解析，互不串味", () => {
    const outsiderSide = getAbilityForRole("scapegoat");
    const travelerSide = getAbilityForRole("scapegoat_traveler");
    expect(outsiderSide).not.toBeNull();
    expect(travelerSide).not.toBeNull();
    expect(outsiderSide?.roleId).toBe("scapegoat");
    expect(travelerSide?.roleId).toBe("scapegoat_traveler");
  });
});

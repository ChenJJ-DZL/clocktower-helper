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
 * ① **生产可达**：真实对局里这条规则真的会生效
 *
 * ⭐ 2026-10-13 实测修正（**此前本文件高估了**）：
 *    `src/utils/dynamicQueueGenerator.ts` 与 `src/hooks/useNightEngine.ts`
 *    **全仓零 `traveler` 引用** ⇒ 夜序/白天流程**从不遍历** `state.travelers`。
 *    而旅行者只存在于 `travelers[]`（不占 `seats`），
 *    ⇒ **任何挂在"角色能力"上的旅行者规则，在真实对局里都不会被触发**。
 *
 *    因此官员（bureaucrat, EVERY_NIGHT 32）/ 窃贼（thief, 33）虽然在
 *    `ENGINE_CONFIG.fullNightOrder` 里有正向槽位，那只是**数据层声明**；
 *    队列是从 `seats` 建的，旅行者根本进不去 ⇒ 属于**注册了但永不唤醒**。
 *
 *    唯一真可达的是走**独立钩子**的 deviant（流放结算点显式判定）。
 */
const PRODUCTION_REACHABLE: string[] = ["deviant"];

/**
 * ② **仅注册**：有能力文件 + 进注册表 + `getAbilityForRole` 可命中，
 *    但**生产路径够不到**（原因见上）。实现「旅行者进流程」后需逐项移入 ①。
 */
const REGISTERED_ONLY: string[] = [
  "bureaucrat", // 官员 · 夜 32 · 三票 —— 队列不遍历 travelers ⇒ 永不唤醒
  "thief", // 窃贼 · 夜 33 · 负票 —— 同上
  "beggar", // 乞丐 · 投票标记
  "gunslinger", // 枪手 · 白天击杀
  "scapegoat_traveler", // 替罪羊 · 代刑（2026-10-13 别名接线修复）
];

/**
 * ③ 生产可达项的**证据**（宿主文件 + 判据函数）
 *
 * 每个 `PRODUCTION_REACHABLE` 里的 id **必须**在此登记证据，
 * 并用源码级断言证明判据函数真的被调用（不能只 import）。
 */
const HOOK_EVIDENCE: Record<
  string,
  { 宿主: string; 判据: string; 说明: string }
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

/** 队列构建器（夜间）与夜间引擎（白天/夜间推进）—— 旅行者可达性的闸门文件 */
const QUEUE_SRC =
  readFileSync(
    resolve(__dirname, "../../utils/dynamicQueueGenerator.ts"),
    "utf-8"
  ) +
  readFileSync(resolve(__dirname, "../../hooks/useNightEngine.ts"), "utf-8");

describe("旅行者接线契约（Round 11 · 棘轮）", () => {
  it("① 三档并集恰好覆盖全部 15 个官方旅行者，且无交集", () => {
    const all = TRAVELER_ROLES.map((r) => r.id).sort();
    const union = [
      ...PRODUCTION_REACHABLE,
      ...REGISTERED_ONLY,
      ...Object.keys(UNWIRED),
    ].sort();
    expect(union).toEqual(all);
    expect(new Set(union).size).toBe(all.length);
  });

  it("①b 每个生产可达项都必须登记宿主证据（不许无凭宣称可达）", () => {
    for (const id of PRODUCTION_REACHABLE) {
      expect(HOOK_EVIDENCE[id], `${id} 缺少宿主证据`).toBeTruthy();
    }
  });

  it("② 仅注册者：注册表命中 + getAbilityForRole 可解析（但生产够不到）", () => {
    for (const id of REGISTERED_ONLY) {
      expect(isRoleAbilitiesRegistered(id), `${id} 应已注册`).toBe(true);
      expect(getAbilityForRole(id), `${id} 应可被解析`).not.toBeNull();
    }
  });

  it("②c 🔴 已知缺口：夜序/夜间引擎不遍历 travelers（修好后会变红，逼你移档）", () => {
    const mentionsTraveler = /travelers?/i.test(QUEUE_SRC);
    expect(
      mentionsTraveler,
      "检测到夜序构建器/夜间引擎已开始遍历 travelers ⇒ 官员、窃贼等夜间旅行者" +
        "可能已真可达。请把它们从 REGISTERED_ONLY 移入 PRODUCTION_REACHABLE，" +
        "并补一条「真实对局里会被唤醒」的生产级断言。"
    ).toBe(false);
  });

  it("②b 钩子接线者：判据函数在宿主文件里真被调用（源码级防漂移）", () => {
    for (const [id, spec] of Object.entries(HOOK_EVIDENCE)) {
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

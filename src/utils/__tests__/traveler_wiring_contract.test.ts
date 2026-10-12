/**
 * 旅行者「接线」契约（Round 11 · 棘轮）
 * ==================================================================
 * 背景（2026-10-13 实测）：
 *   15 个官方旅行者里，绝大多数**既没有能力实现也没有任何消费点**。
 *   更隐蔽的一条：旅行者「替罪羊」id 隔离为 `scapegoat_traveler` 之后，
 *   能力查找 `getAbilityForRole`（判据 `abilityId.startsWith(roleId)`）
 *   对 `scapegoat_traveler` **恒不成立** ⇒ 有文件也**零接线**（已修：注册别名）。
 *
 * ⭐⭐ 根因（Round 11 方案 B 之前）：
 *   `src/utils/dynamicQueueGenerator.ts` 与 `src/hooks/useNightEngine.ts`
 *   **全仓零 `traveler` 引用** ⇒ 夜序/白天流程**从不遍历** `state.travelers`。
 *   而旅行者只存在于 `travelers[]`（不占 `seats`）
 *   ⇒ 挂在"角色能力"上的旅行者规则**永远不会被唤醒**。
 *
 * ✅ 修法（用户 2026-10-13 选定方案 B）：新增**独立暮色阶段 `twilight`**
 *   （官方 Dusk；本仓库 `dusk` 是白天提名阶段，两者不可混），
 *   在「提名/处决」与「入夜」之间按官方黄昏顺序逐个唤醒旅行者。
 *
 * 本文件是**棘轮**：`UNWIRED` 只许变小，不许变大。
 *   - 谁补了一个旅行者的接线 ⇒ 必须把它移出 `UNWIRED`，否则
 *     「未接线应查不到能力」这条断言会变红，逼你更新清单。
 *   - 反过来，把 `UNWIRED` 里的项删掉而不实现 ⇒ ① 的并集断言会变红。
 *
 * ⚠️ 这不是「点亮」：`UNWIRED` / `TWILIGHT_REACHABLE` 里的角色
 *    **效果还没有落地**，清单只是把缺口显式化，避免再次出现
 *    "看起来有、实际没有"。四档口径如下：
 *
 *   | 档 | 含义 |
 *   |---|---|
 *   | `EFFECT_LANDED` | 规则效果**已落地**（真实对局里会改变状态） |
 *   | `TWILIGHT_REACHABLE` | 暮色阶段**会被唤醒**，但效果尚未落地 |
 *   | `REGISTERED_ONLY` | 有能力文件且可查到，但**没有任何路径触达** |
 *   | `UNWIRED` | 连文件都没有 |
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
import { TWILIGHT_TRAVELERS } from "../travelerDusk";

// 注册表必须在模块级初始化，否则 isRoleAbilitiesRegistered 恒为 false（假绿温床）
initializeAbilityRegistry();

/** ① 效果已落地：真实对局里这条规则真的会改变状态 */
const EFFECT_LANDED: string[] = ["deviant"];

/** ①b 效果落地项的**证据**（宿主文件 + 判据函数） */
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
 * ② 暮色可达：会被 `twilight` 阶段唤醒，**效果待落地**
 *   （暮色面板目前负责「唤醒 + 官方原文提示 + 逐步确认」，不做结算）
 */
const TWILIGHT_REACHABLE: string[] = Object.keys(TWILIGHT_TRAVELERS);

/** ③ 仅注册：有能力文件 + 可查到，但**没有任何路径触达** */
const REGISTERED_ONLY: string[] = [
  "beggar", // 乞丐 · 投票标记规则 —— 无投票流程挂钩
  "gunslinger", // 枪手 · 白天击杀 —— 无白天结算挂钩
  "scapegoat_traveler", // 替罪羊 · 代刑（别名已修，但处决结算未挂钩）
];

/** ④ 未接线：连能力文件都没有 —— 每项附缺口原因，实现后移出 */
const UNWIRED: Record<string, string> = {
  butcher: "白天首次处决后可再次提名，提名流程无二次提名入口",
  judge: "每局限一次直接执行或作废提名，提名结算无介入点",
  matron: "白天交换至多三对玩家座位，座位置换 UI/状态未实现",
  bishop: "只有说书人可发起提名，提名发起权限模型未建立",
  voudon: "仅自己与死者可投票且不需投票标记、忽略过半，投票规则未参数化",
};

/** 棘轮基线：UNWIRED 只许变少（2026-10-13 从 9 → 5） */
const UNWIRED_CEILING = 5;

const GAME_CONTEXT_SRC = readFileSync(
  resolve(__dirname, "../../contexts/GameContext.tsx"),
  "utf-8"
);
const DATA_TS_SRC = readFileSync(
  resolve(__dirname, "../../../app/data.ts"),
  "utf-8"
);
const GAME_STAGE_SRC = readFileSync(
  resolve(__dirname, "../../components/game/GameStage.tsx"),
  "utf-8"
);

describe("旅行者接线契约（Round 11 · 棘轮）", () => {
  it("① 四档并集恰好覆盖全部 15 个官方旅行者，且无交集", () => {
    const all = TRAVELER_ROLES.map((r) => r.id).sort();
    const union = [
      ...EFFECT_LANDED,
      ...TWILIGHT_REACHABLE,
      ...REGISTERED_ONLY,
      ...Object.keys(UNWIRED),
    ].sort();
    expect(union).toEqual(all);
    expect(new Set(union).size).toBe(all.length);
  });

  it("①b 每个效果落地项都必须登记宿主证据（不许无凭宣称）", () => {
    for (const id of EFFECT_LANDED) {
      expect(HOOK_EVIDENCE[id], `${id} 缺少宿主证据`).toBeTruthy();
    }
  });

  it("①c 效果落地项：判据函数在宿主文件里真被调用（源码级防漂移）", () => {
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

  it("② 暮色可达项与暮色阶段注册表**逐字一致**（防两处口径漂移）", () => {
    expect([...TWILIGHT_REACHABLE].sort()).toEqual(
      Object.keys(TWILIGHT_TRAVELERS).sort()
    );
  });

  it("②b 暮色阶段真的被接进流程（阶段枚举 + 面板挂载）", () => {
    expect(
      DATA_TS_SRC.includes('"twilight"'),
      "GamePhase 枚举应含 twilight（暮色 = 官方 Dusk）"
    ).toBe(true);
    expect(
      GAME_STAGE_SRC.includes("<TwilightPanel"),
      "GameStage 应挂载 TwilightPanel，否则暮色阶段没有 UI"
    ).toBe(true);
  });

  it("③ 仅注册者：注册表命中 + getAbilityForRole 可解析（但无路径触达）", () => {
    for (const id of REGISTERED_ONLY) {
      expect(isRoleAbilitiesRegistered(id), `${id} 应已注册`).toBe(true);
      expect(getAbilityForRole(id), `${id} 应可被解析`).not.toBeNull();
    }
  });

  it("④ 未接线者：确认查不到能力（实现后请移出本档）", () => {
    for (const id of Object.keys(UNWIRED)) {
      expect(
        isRoleAbilitiesRegistered(id),
        `${id} 已实现？请把它移出 UNWIRED`
      ).toBe(false);
    }
  });

  it("⑤ 棘轮：UNWIRED 规模不得增长（基线 5）", () => {
    expect(Object.keys(UNWIRED).length).toBeLessThanOrEqual(UNWIRED_CEILING);
  });

  it("⑥ 每个未接线项都写有缺口原因（≥8 字，禁止空壳登记）", () => {
    for (const [id, reason] of Object.entries(UNWIRED)) {
      expect(reason.length, `${id} 缺口原因`).toBeGreaterThanOrEqual(8);
    }
  });

  it("⑦ 替罪羊双宿主：outsider 侧与 traveler 侧各自可解析，互不串味", () => {
    const outsiderSide = getAbilityForRole("scapegoat");
    const travelerSide = getAbilityForRole("scapegoat_traveler");
    expect(outsiderSide).not.toBeNull();
    expect(travelerSide).not.toBeNull();
    expect(outsiderSide?.roleId).toBe("scapegoat");
    expect(travelerSide?.roleId).toBe("scapegoat_traveler");
  });
});

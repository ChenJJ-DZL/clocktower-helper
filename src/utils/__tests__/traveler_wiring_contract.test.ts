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
const EFFECT_LANDED: string[] = [
  "deviant", // 怪咖 · 流放豁免（exile.ts 钩子）
  "bureaucrat", // 官员 · 三票（twilightVoteTargets + submitVotes +2）
  "thief", // 窃贼 · 负票（twilightVoteTargets + submitVotes -2）
  "scapegoat_traveler", // 替罪羊 · 代刑（executePlayer 处决结算 + 说书人裁决）
  "gunslinger", // 枪手 · 首次投票后射击刚投票者（submitVotes 开窗 + reducer 判据）
  "beggar", // 乞丐 · 投票标记（VoteInputModal 门控 + submitVotes 消耗 + GameContext 账本）
  "voudon", // 巫毒师 · 只有他本人与死者可投票 / 免投票标记 / 忽略过半门槛
  "judge", // 法官 · 提名后（投票前）直接处决或作废本次投票，每局限一次
  "butcher", // 屠夫 · 首次处决后可再次提名 ⇒ 解除「当日已处决」门控
  "bishop", // 主教 · 只有说书人可发起提名（提名者改用 STORYTELLER_NOMINATOR_ID）
  "bone_collector", // 集骨者 · 暮色祝福死者重新获得能力直到下个黄昏（每局限一次）
  "barista", // 咖啡师 · 暮色二选一：解除并免疫毒醉 / 能力两次
  "harlot", // 流莺 · 暮色选存活玩家：同意则得知角色，两人可能同时死亡
  "apprentice", // 学徒 · 首夜按阵营获得镇民/爪牙能力（说书人助手口径）
  "matron", // 女舍监 · 每个白天至多三对座位交换（内容互换、id 保留）
];

/** ①b 效果落地项的**证据**（宿主文件 + 判据函数） */
const HOOK_EVIDENCE: Record<
  string,
  { 宿主: string; 文件: string; 判据: string; 说明: string }
> = {
  deviant: {
    宿主: "RESOLVE_EXILE",
    文件: "../../contexts/GameContext.tsx",
    判据: "isExileBlockedByDeviant",
    说明: "怪咖：说书人判定「表现得有趣」⇒ 当日不可被流放（2026-10-13 落地）",
  },
  bureaucrat: {
    宿主: "submitVotes",
    文件: "../../hooks/useExecutionHandlers.ts",
    判据: "twilightVoteTargets",
    说明:
      "官员：暮色选目标 ⇒ 明天白天该玩家投票算作三票（v += 2，2026-10-13 落地）",
  },
  thief: {
    宿主: "submitVotes",
    文件: "../../hooks/useExecutionHandlers.ts",
    判据: "twilightVoteTargets",
    说明:
      "窃贼：暮色选目标 ⇒ 明天白天该玩家投票算作负数（v -= 2，净 -1，2026-10-13 落地）",
  },
  scapegoat_traveler: {
    宿主: "executePlayer（处决结算，死亡落定前）",
    文件: "../../hooks/useExecutionHandlers.ts",
    判据: "travelerScapegoatCanSubstitute",
    说明:
      "替罪羊：同阵营玩家被处决时说书人可裁定代刑 —— 替罪羊死、原玩家免死（2026-10-16 落地）",
  },
  gunslinger: {
    宿主: "submitVotes（首次投票结算后开窗）→ reducer FIRE_GUNSLINGER",
    文件: "../../contexts/GameContext.tsx",
    判据: "travelerGunslingerCanShoot",
    说明:
      "枪手：每天首次投票统计后，可射击一名刚投过票的玩家使其死亡（2026-10-16 落地）",
  },
  beggar: {
    宿主:
      "submitVotes（投票落定后消耗 1 枚标记）+ VoteInputModal（无标记置灰）+ GameContext 账本",
    文件: "../../hooks/useExecutionHandlers.ts",
    判据: "travelerSlotId",
    说明:
      "乞丐：只能用投票标记投票 —— 死亡玩家赠标记（GIVE_BEGGAR_TOKEN，乞丐同时得知其阵营），投票时消耗（2026-10-16 落地）",
  },
  voudon: {
    宿主:
      "submitVotes（幽灵票豁免 + 门槛降为 1）+ VoteInputModal（只有他本人与死亡玩家可举手）",
    文件: "../../hooks/useExecutionHandlers.ts",
    判据: "voudonSkipsGhostVote",
    说明:
      "巫毒师：只有他与死亡玩家可以投票、不需要投票标记、忽略过半要求（2026-10-16 落地）",
  },
  judge: {
    宿主:
      "GameStage 提名后介入（弹窗）→ GameModals 裁决 → GameContext MARK_JUDGE_USED 整局闩锁",
    文件: "../../contexts/GameContext.tsx",
    判据: "hasTravelerRole",
    说明:
      "法官：每局限一次，提名后可直接执行处决或让投票无效（2026-10-16 落地）",
  },
  butcher: {
    宿主:
      "executeJudgment（首次处决后解除「今日已处决」门控 ⇒ 允许当日第二次处决）",
    文件: "../../hooks/useExecutionHandlers.ts",
    判据: "hasTravelerRole",
    说明:
      "屠夫：每个白天首次处决后可以再次发起提名（当日第二次处决，每白天一次）（2026-10-16 落地）",
  },
  bishop: {
    宿主:
      "useDayActions.executeNomination（玩家提名被拒 / 说书人提名放行）+ GameStage 说书人提名交互",
    文件: "../../hooks/useDayActions.ts",
    判据: "hasTravelerRole",
    说明:
      "主教：只有说书人可以发起提名（提名者改用 STORYTELLER_NOMINATOR_ID）（2026-10-16 落地）",
  },
  bone_collector: {
    宿主:
      "TwilightPanel 选死者 → GameContext BONE_COLLECTOR_BLESS 写入 hasAbilityEvenDead（useGameFlow 下个暮色撤销）",
    文件: "../../contexts/GameContext.tsx",
    判据: "hasTravelerRole",
    说明:
      "集骨者：每局限一次，暮色选一名已死亡玩家使其重新获得能力直到下个黄昏（2026-10-16 落地）",
  },
  barista: {
    宿主:
      "TwilightPanel 二选一 → GameContext SET_BARISTA_EFFECT（clear 写 baristaCleared；useGameFlow 下个暮色撤销）",
    文件: "../../utils/gameRules.ts",
    判据: "isBaristaCleared",
    说明:
      "咖啡师：解除并免疫中毒/醉酒（computeIsPoisoned 与 isActorDisabledByPoisonOrDrunk 双判据读取）/ 能力可生效两次（2026-10-16 落地）",
  },
  harlot: {
    宿主:
      "TwilightPanel 选存活玩家 → SET_HARLOT_OUTCOME（同意则显示角色）→ killPlayer + EXECUTE_TRAVELER_SLOT 双死",
    文件: "../../components/game/TwilightPanel.tsx",
    判据: "killPlayer",
    说明:
      "流莺：选一名存活玩家，若对方同意则得知其角色，但两人可能同时死亡（说书人两次裁定）（2026-10-16 落地）",
  },
  apprentice: {
    宿主:
      "TwilightPanel 首夜按阵营列候选（镇民/爪牙）→ GameContext SET_APPRENTICE_ROLE 记录",
    文件: "../../components/game/TwilightPanel.tsx",
    判据: "setApprenticeGrantedRole",
    说明:
      "学徒：首夜善良获镇民能力 / 邪恶获爪牙能力（说书人助手口径：面板记录 + 提示，引擎不自动挂载）（2026-10-16 落地）",
  },
  matron: {
    宿主:
      "TableCenterHUD 换座面板（点两名玩家）→ GameContext MATRON_SWAP（内容互换保留 id，每白天至多 3 对）",
    文件: "../../components/game/board/TableCenterHUD.tsx",
    判据: "matronSwap",
    说明:
      "女舍监：每个白天至多交换三对玩家座位（换座改变物理邻座关系；当轮已产生的投票记录不随之改写）（2026-10-16 落地）",
  },
};

/**
 * ② 暮色可达：会被 `twilight` 阶段唤醒。
 *   **效果已落地的**（EFFECT_LANDED 里的官员/窃贼）不计入本档 ——
 *   否则四档并集会重复计数（2026-10-13 实测踩到）。
 */
const TWILIGHT_REACHABLE: string[] = Object.keys(TWILIGHT_TRAVELERS).filter(
  (id) => !EFFECT_LANDED.includes(id)
);

/** ③ 仅注册：有能力文件 + 可查到，但**没有任何路径触达** */
const REGISTERED_ONLY: string[] = [
  // 🎉 2026-10-16：本档已清零 ——  beggar 已移入 EFFECT_LANDED。
  //    保持空数组（而非删常量）是为了让 ① 四档并集断言结构不变，
  //    将来出现新的"有文件但不触达"角色时直接往这里加。
];

/** ④ 未接线：连能力文件都没有 —— 每项附缺口原因，实现后移出 */
/** ④ 未接线：连能力文件都没有 —— **2026-10-16 起已清零**（15/15 全部落地） */
const UNWIRED: Record<string, string> = {};

/** 棘轮基线：UNWIRED 只许变少（2026-10-13：9 → 5；2026-10-16：**清零**） */
const UNWIRED_CEILING = 0;

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
      const src = readFileSync(resolve(__dirname, spec.文件), "utf-8");
      expect(
        src.includes(spec.判据),
        `${id} 的判据 ${spec.判据} 应出现在 ${spec.宿主}（${spec.文件}）`
      ).toBe(true);
      // 只 import 不算接线：判据必须以**函数调用** `(` 或**成员访问** `.`/`?.`
      // 的形态出现（属性型判据如 `twilightVoteTargets` 走成员访问）。
      expect(
        new RegExp(`${spec.判据}\\s*(\\(|\\??\\.)`).test(src),
        `${id} 的判据 ${spec.判据} 必须被真正使用，不能只 import`
      ).toBe(true);
    }
  });

  it("② 暮色名单 ⊆ TWILIGHT_TRAVELERS，且差额恰为效果已落地的暮色旅行者", () => {
    const allTwilight = Object.keys(TWILIGHT_TRAVELERS).sort();
    const reachable = [...TWILIGHT_REACHABLE].sort();
    // 可达档必须是暮色名单的子集
    for (const id of reachable) {
      expect(
        Object.prototype.hasOwnProperty.call(TWILIGHT_TRAVELERS, id),
        `${id} 应在暮色名单中`
      ).toBe(true);
    }
    // 差额 = 暮色名单里效果已落地的那几个（目前是官员/窃贼）
    const diff = allTwilight.filter((id) => !reachable.includes(id)).sort();
    const landedInTwilight = EFFECT_LANDED.filter((id) =>
      Object.prototype.hasOwnProperty.call(TWILIGHT_TRAVELERS, id)
    ).sort();
    expect(diff).toEqual(landedInTwilight);
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

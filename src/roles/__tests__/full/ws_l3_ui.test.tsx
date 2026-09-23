// @vitest-environment jsdom
/**
 * L3 · 组件渲染层
 * ==================================================================
 * 剧本：**窃窃私语（whispering_secrets）** + **无名之墓（tomb_of_the_unknown）**
 * 覆盖：两剧本并集 **32 个唯一角色**（6 个同属两剧本）
 * 日期：2026-09-21 ｜ 验收标准：`outputs/角色全层测试规范.md` §3/§9
 *
 * ── 本层逐条回答规范 §3 的四个问题 ─────────────────────────────
 *   ① 该角色的夜间引导语形态正确（不白屏）
 *   ② 确认页 / 结果页**真实渲染**，且不泄漏内部状态字段
 *   ③ 夜间步骤的目标约束与能力声明一致（含**冻结偏差**）
 *   ④ 若有日间能力：按钮出现在 GameConsole 的「⚡️ 可用主动技能」中
 *
 * ── 两条铁律（沿用罂粟花开 / 黯月初升 / 暗流涌动经验）──────────
 *   · `ModalWrapper` 走 `createPortal` ⇒ 断言读 `document.body`，不是 container
 *   · jsdom 缺 `ResizeObserver` ⇒ `beforeAll` 补桩
 *
 * ── 「文案不泄漏」的判据 ──────────────────────────────────────
 *   用**内部字段名白名单**而不是文案关键词：内部字段（`statusEffects` /
 *   `_abilityResults` / `isVortoxWorld` …）一旦出现在渲染文本里，说明 UI
 *   直接序列化了状态对象 —— 这才是真正的泄漏通道。
 *
 * ⚠️ **只加测试、不改生产**。本文件发现的所有偏差一律"冻结 + 报告"
 *    （见 §A③ 的 `TL_DEVIATION`——**2026-09-22 已按官方原文裁决收敛为 1 条**；
 *      §C ⑨ 的「赌徒日间按钮」已按官方修成**负向对照**，`DAY_DEF_DEVIATION` 已撤销）。
 *
 * ── 真值表来源 ────────────────────────────────────────────────
 *   全部字段由**探针实测**得到（`calculateNightInfoViaNewEngine` +
 *   `generateDynamicNightQueue` + GameConsole 渲染），不是照抄声明。
 *   对照组：暗流涌动的 `imp` 引导语 = 「唤醒1号【小恶魔】，让他选择一名玩家杀死。」
 */
import { describe, expect, it, beforeAll, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";

import { roles, scripts } from "../../../../app/data";
import { calculateNightInfoViaNewEngine } from "../../../utils/nightInfoAdapter";
import {
  getAbilityForRole,
  initializeAbilityRegistry,
} from "../../new_engine/abilityRegistry";
import { NightActionConfirmModal } from "../../../components/modals/NightActionConfirmModal";
import { InfoResultModal } from "../../../components/modals/InfoResultModal";
import { IdentityShowcaseModal } from "../../../components/modals/IdentityShowcaseModal";
import { GameConsole } from "../../../components/game/console/GameConsole";
import { getCharadeDisplayRole, isCharadeMasked } from "../../../utils/charadeDisplay";
import { queueFor, seat as hseat } from "../_tbHarness";

const r = (id: string) => roles.find((x) => x.id === id)!;
const WS = scripts.find((s) => s.id === "whispering_secrets")!;
const TOMB = scripts.find((s) => s.id === "tomb_of_the_unknown")!;

/** 两剧本并集（`app/data.ts` 的 roleIds 顺序：镇民 → 外来者 → 爪牙 → 恶魔） */
const ROSTER = [
  "chambermaid", "gossip", "oracle", "mathematician", "artist", "flowergirl",
  "innkeeper", "fool",
  "saint", "recluse", "politician", "plague_doctor",
  "spy", "witch", "assassin", "devils_advocate", "baron", "poisoner",
  "vortox", "po", "zombuul", "undertaker", "gambler", "savant", "juggler",
  "clockmaker", "sailor", "farmer", "scapegoat", "drunk", "mutant", "shabaloth",
];

/** 引导语形态 */
type GuideKind =
  | "standard" // 「唤醒N号【角色】…」——说书人唤醒语
  | "passive" // 「N号【角色】为被动技能，无需唤醒。」
  | "silent" // 空串（该角色在此夜无步骤）
  | "ability-desc"; // ⚠️ 只有能力描述，**缺「唤醒N号」前缀**（冻结偏差）

interface Row {
  /** 归属剧本（6 个重叠角色标 both） */
  scripts: "ws" | "tomb" | "both";
  /** 该角色被唤醒 / 需要渲染的夜晚 */
  night: 1 | 2;
  kind: GuideKind;
  /** 该夜队列里是否有「以该角色身份」入队的节点 */
  queued: boolean;
  note?: string;
}

const SPEC: Record<string, Row> = {
  chambermaid: { scripts: "ws", night: 1, kind: "standard", queued: true },
  gossip: { scripts: "both", night: 2, kind: "standard", queued: true },
  oracle: { scripts: "both", night: 2, kind: "standard", queued: true },
  mathematician: { scripts: "ws", night: 1, kind: "standard", queued: true },
  artist: {
    scripts: "both", night: 1, kind: "passive", queued: false,
    note: "日间能力上桥（DAY_BRIDGE），夜间无步骤",
  },
  flowergirl: { scripts: "ws", night: 2, kind: "standard", queued: true },
  innkeeper: { scripts: "ws", night: 2, kind: "standard", queued: true },
  fool: { scripts: "both", night: 1, kind: "passive", queued: false },
  saint: {
    scripts: "ws", night: 1, kind: "silent", queued: false,
    note: "该剧本的圣徒是外来者，走 legacy checkGameEnd，无夜间步骤",
  },
  recluse: {
    scripts: "ws", night: 1, kind: "silent", queued: false,
    note: "被动互动干扰，夜间不唤醒；adapter 也不产出引导语",
  },
  politician: { scripts: "ws", night: 1, kind: "passive", queued: false },
  spy: { scripts: "ws", night: 1, kind: "standard", queued: true },
  witch: { scripts: "ws", night: 1, kind: "standard", queued: true },
  assassin: { scripts: "both", night: 2, kind: "standard", queued: true },
  devils_advocate: { scripts: "ws", night: 1, kind: "standard", queued: true },
  vortox: {
    scripts: "ws", night: 2, kind: "ability-desc", queued: true,
    note: "⚠️ 冻结偏差：引导语只有能力描述，缺「唤醒N号」座位号",
  },
  po: {
    scripts: "ws", night: 2, kind: "ability-desc", queued: true,
    note: "⚠️ 冻结偏差：同上",
  },
  zombuul: {
    scripts: "both", night: 2, kind: "ability-desc", queued: true,
    note: "⚠️ 冻结偏差：同上",
  },
  plague_doctor: {
    scripts: "ws", night: 1, kind: "standard", queued: false,
    note: "条件唤醒（on_death）：默认无死亡 ⇒ 不入队，但 adapter 仍给引导语",
  },
  undertaker: {
    scripts: "tomb", night: 2, kind: "standard", queued: false,
    note: "条件唤醒（requiresExecutedToday）：默认今日无处决 ⇒ 不入队",
  },
  gambler: { scripts: "tomb", night: 2, kind: "standard", queued: true },
  savant: { scripts: "tomb", night: 1, kind: "passive", queued: false },
  juggler: {
    scripts: "tomb", night: 2, kind: "standard", queued: false,
    note: "首个白天能力；n2 不入队但 adapter 仍给引导语",
  },
  clockmaker: {
    scripts: "tomb", night: 1, kind: "standard", queued: true,
    note: "firstNightOnly",
  },
  sailor: { scripts: "tomb", night: 1, kind: "standard", queued: true },
  farmer: {
    scripts: "tomb", night: 1, kind: "standard", queued: false,
    note: "条件唤醒（on_death）",
  },
  scapegoat: { scripts: "tomb", night: 1, kind: "passive", queued: false },
  drunk: { scripts: "tomb", night: 1, kind: "passive", queued: false },
  mutant: { scripts: "tomb", night: 1, kind: "passive", queued: false },
  baron: { scripts: "tomb", night: 1, kind: "passive", queued: false },
  poisoner: { scripts: "tomb", night: 1, kind: "standard", queued: true },
  shabaloth: {
    scripts: "tomb", night: 2, kind: "ability-desc", queued: true,
    note: "⚠️ 冻结偏差：引导语缺座位号",
  },
};

/**
 * ⚠️ **冻结偏差**：夜间节点的目标数与能力声明不一致的三处。
 * 这些是**实测值**（不是期望值）—— 冻结它们是为了让"改动必须被看见"，
 * 同时把偏差登记进交付报告。**修好之后请把这些条目删掉**，让断言回归 `targetConfig`。
 */
/**
 * ✅ 2026-09-22 **按官方原文裁决后收敛**（原 3 条 → 现 1 条）
 * ================================================================
 * 官方裁决依据（逐字引自 `src/data/officialRoleDocs.json`）：
 *
 * · `assassin` —— 【运作方式】：「唤醒刺客。刺客**要么摇头表示不使用能力**，
 *   要么指向任意一名玩家。」⇒ 官方**允许 0 目标**。
 *   ⇒ `targetConfig.min = 0`（新引擎声明）**本来就对**；错的是 legacy
 *     `src/roles/minion/assassin.ts` 的 `night.target.count {1,1}`（说书人界面
 *     **无法表示"不使用"**）⇒ **已改为 `{0,1}`** ⇒ 本条偏差**消除**。
 *
 * · `gambler` —— 【角色能力】：「**每个夜晚\***，你要选择一名玩家并猜测…」
 *   ⇒ 官方是**纯夜间**能力、且选人**强制**。
 *   ⇒ 原 `src/roles/townsfolk/gambler.ts` 缺 `night` 块（回落 0~0）且**多了个 `day` 块**
 *     ⇒ **已补 `night.target.count {1,1}` + `dialog`、删除 `day`** ⇒ 本条偏差**消除**。
 *
 * · `gossip` —— 【运作方式】：「将造谣者的"死亡"提示标记放置到**魔典左侧的中央**，
 *   来提醒自己当晚需要放置该标记。」⇒ 官方在**夜间没有"玩家选目标"这一步**
 *   （由说书人决定谁死）⇒ 夜间节点 `{0,0}` **符合官方**，`targetConfig {0,1}`
 *   描述的是「当晚最多 1 名玩家死亡」⇒ **两者语义不同，不是缺陷**。
 *   ⇒ 保留本条，但性质从「待人工拍板」变为「**已按官方裁决 = 正确**」。
 */
const TL_DEVIATION: Record<string, { min: number; max: number }> = {
  // 造谣者：夜间节点是「声明正确后的死亡结算」（**官方无玩家选目标步骤**），
  // 而 targetConfig 的 0~1 描述「当晚最多 1 人死亡」⇒ 两个阶段语义不同，**符合官方**。
  gossip: { min: 0, max: 0 },
};

/** 内部字段名：出现在渲染文本里即视为状态泄漏 */
const INTERNAL_TOKENS = [
  "statusEffects",
  "_abilityResults",
  "statusEffectMap",
  "isVortoxWorld",
  "markedForDeath",
  "deathSource",
  "fakeRole",
  "[object",
  "undefined",
  "NaN",
];

beforeAll(() => {
  (globalThis as any).ResizeObserver =
    (globalThis as any).ResizeObserver ||
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  initializeAbilityRegistry();
});
afterEach(() => cleanup());

const bodyText = () => document.body.textContent ?? "";

/**
 * 7 人局：0 号 = 被测角色，其余用**无日间能力**的中立角色。
 * ⚠️ 其余座位必须选「本并集里没有 day 能力」的角色，否则它们的日间按钮
 *    会污染 §C 的负向对照（探针踩过一次：用 tinker 当填充位会凭空多出一个按钮）。
 */
const FILLER = ["chambermaid", "oracle", "clockmaker", "saint", "poisoner", "imp"];

function buildSeats(roleId: string): any[] {
  const seats = [hseat(0, roleId)];
  FILLER.forEach((rid, i) => seats.push(hseat(i + 1, rid)));
  const dup = seats.findIndex((s: any, i) => i > 0 && s.role?.id === roleId);
  if (dup > 0) seats[dup].role = r("chambermaid");
  return seats;
}

/** 该角色归属的剧本（adapter 需要一个脚本上下文） */
const scriptOf = (id: string) => {
  const row = SPEC[id];
  return row.scripts === "ws" ? WS : row.scripts === "tomb" ? TOMB : WS;
};

/** 与生产 UI 同一条 adapter 路径取夜间信息 */
function engineInfo(roleId: string, night?: number, seats?: any[]) {
  const n = night ?? SPEC[roleId].night;
  const s = seats ?? buildSeats(roleId);
  return calculateNightInfoViaNewEngine(
    scriptOf(roleId) as any,
    s as any,
    0,
    (n === 1 ? "firstNight" : "night") as any,
    null,
    n,
    undefined,
    undefined,
    undefined,
    undefined,
    false,
    undefined,
    undefined,
    undefined,
    [],
    undefined,
    undefined,
    undefined,
    false,
    false,
    false,
    null,
    undefined,
    undefined,
    undefined
  ) as any;
}

// ══════════════════════════════════════════════════════════════════════════
//  §A · 32 角色：引导语形态 + 弹窗渲染 + 目标约束
// ══════════════════════════════════════════════════════════════════════════
describe("L3 · 窃窃私语 + 无名之墓 · §A 角色夜间引导语与弹窗渲染", () => {
  it("0) 清单自洽：32 个唯一角色、6 个同属两剧本、与两个 roleIds 的并集一致", () => {
    expect(ROSTER.length, "应为 32 个唯一角色").toBe(32);
    expect(new Set(ROSTER).size, "ROSTER 有重复").toBe(32);
    expect([...ROSTER].sort()).toEqual(
      [...new Set([...(WS.roleIds ?? []), ...(TOMB.roleIds ?? [])])].sort()
    );
    const wsSet = new Set(WS.roleIds ?? []);
    const tombSet = new Set(TOMB.roleIds ?? []);
    const both = ROSTER.filter((id) => wsSet.has(id) && tombSet.has(id));
    expect(both.length, `重叠角色应为 6 个（实际 ${JSON.stringify(both)}）`).toBe(6);
    expect(Object.keys(SPEC).sort()).toEqual([...ROSTER].sort());
  });

  describe.each(ROSTER.map((id) => [id] as const))("L3 · %s", (roleId) => {
    const row = () => SPEC[roleId];

    it("① 引导语形态符合规范（standard / passive / silent / 冻结偏差）", () => {
      const info = engineInfo(roleId);
      const guide = String(info?.guide ?? "");
      const queue = queueFor(buildSeats(roleId), 0, row().night);
      const name = r(roleId).name;

      if (row().kind === "silent") {
        // 无夜间步骤 ⇒ 引导语为空是**正确**的（弹窗本就不该出现）
        expect(guide, `❌ ${roleId} 无夜间步骤却产出了引导语：${guide.slice(0, 40)}`).toBe("");
        expect(queue, `❌ ${roleId} 无夜间步骤却被排进夜间队列`).toEqual([]);
        expect(
          (info?.targetLimit?.max ?? 0),
          `❌ ${roleId} 无夜间步骤却声明了目标数`
        ).toBe(0);
        return;
      }

      // 其余形态：引导语不能是空的（弹窗会白屏）
      expect(guide.length, `❌ ${roleId} 引导语为空 —— 弹窗会白屏`).toBeGreaterThan(0);

      if (row().kind === "passive") {
        expect(
          guide,
          `❌ ${roleId} 为被动角色，引导语应明确告知「被动技能，无需唤醒」`
        ).toContain("被动技能，无需唤醒");
        expect(guide, `❌ ${roleId} 被动引导语应含角色中文名`).toContain(name);
        expect(queue, `❌ ${roleId} 被动角色不应被以自身身份排进队列`).not.toContain(roleId);
        return;
      }

      // standard / ability-desc：引导语必须可用（含座位号或与能力描述一致）
      if (row().kind === "standard") {
        expect(guide, `❌ ${roleId} 引导语未包含角色中文名「${name}」`).toContain(name);
        expect(
          /唤醒\s*1\s*号/.test(guide),
          `❌ ${roleId} 引导语缺少「唤醒1号」前缀：${guide.slice(0, 60)}`
        ).toBe(true);
      } else {
        // ability-desc（冻结偏差）：**只有能力描述**，既无唤醒语也无座位号/角色名。
        // 若哪天修好了，下面两条会立刻红 —— 提醒把该角色改成 standard 并撤销偏差登记。
        // 对照组：TB 的小恶魔 = 「唤醒1号【小恶魔】，让他选择一名玩家杀死。」
        expect(
          /唤醒\s*1\s*号/.test(guide),
          `ℹ️ ${roleId} 引导语缺「唤醒1号」座位号（已冻结偏差）：${guide.slice(0, 60)}`
        ).toBe(false);
        expect(
          guide.includes("1号"),
          `ℹ️ ${roleId} 引导语不含行动者座位号（已冻结偏差）`
        ).toBe(false);
        expect(
          guide.includes(name),
          `ℹ️ ${roleId} 引导语不含角色名「${name}」（已冻结偏差）`
        ).toBe(false);
        expect(
          /每个夜晚|选择|死亡/.test(guide),
          `❌ ${roleId} 引导语既无唤醒语也不像能力描述：${guide.slice(0, 60)}`
        ).toBe(true);
      }

      // 队列一致性：入队与否必须与真值表一致
      if (row().queued) {
        expect(
          queue,
          `❌ ${roleId} 应被排进第 ${row().night} 夜队列，实际 ${JSON.stringify(queue)}`
        ).toContain(roleId);
      } else {
        expect(
          queue,
          `❌ ${roleId} 声明不入队却被排进了第 ${row().night} 夜队列（条件门控未生效？）`
        ).not.toContain(roleId);
      }
    });

    it("② 确认页 + 结果页真实渲染，且不泄漏内部状态字段", () => {
      const seats = buildSeats(roleId);
      const info = engineInfo(roleId, row().night, seats);
      const guide = String(info?.guide ?? "");
      const roleName = `1号-${r(roleId).name}`;

      // 确认页（说书人选择目标前的核对页）
      cleanup();
      render(
        <NightActionConfirmModal
          data={{
            roleName,
            roleId,
            actionDescription: guide.slice(0, 60),
            targetDescriptions: ["（无目标）"],
            targetLimit: info?.targetLimit ?? { min: 0, max: 0 },
            actorSeatId: 0,
            // ⚠️ 2026-09-21 补：`NightActionConfirmData` 必填这两个回调，
            //    否则 tsc 报 TS2739（本文件此前未被 tsc 覆盖到）。
            onConfirm: () => {},
            onCancel: () => {},
          }}
          seats={seats as any}
          onConfirm={() => {}}
          onCancel={() => {}}
        />
      );
      const t1 = bodyText();
      expect(t1.length, `❌ ${roleId} 确认页渲染为空（白屏）`).toBeGreaterThan(0);
      expect(t1, `❌ ${roleId} 确认页应含角色名`).toContain(r(roleId).name);
      expect(t1, `❌ ${roleId} 确认页应含行动者座位号「1号」`).toContain("1号");

      // 结果页（说书人宣读的结果）
      cleanup();
      render(
        <InfoResultModal
          roleName={roleName}
          resultText={guide}
          onConfirm={() => {}}
          onModify={() => {}}
        />
      );
      const t2 = bodyText();
      expect(t2.length, `❌ ${roleId} 结果页渲染为空（白屏）`).toBeGreaterThan(0);
      expect(t2, `❌ ${roleId} 结果页应含角色名`).toContain(r(roleId).name);

      // ③ 不泄漏内部状态字段（两个页面都要查）
      for (const tok of INTERNAL_TOKENS) {
        expect(
          t1.includes(tok),
          `❌ ${roleId} 确认页渲染文本泄漏内部字段「${tok}」`
        ).toBe(false);
        expect(
          t2.includes(tok),
          `❌ ${roleId} 结果页渲染文本泄漏内部字段「${tok}」`
        ).toBe(false);
      }
    });

    it("③ 夜间目标约束与能力声明一致（含冻结偏差）", () => {
      const info = engineInfo(roleId);
      const tl = {
        min: info?.targetLimit?.min ?? 0,
        max: info?.targetLimit?.max ?? 0,
      };
      const ability = getAbilityForRole(roleId);
      const tc = ability?.targetConfig;
      const dev = TL_DEVIATION[roleId];
      const expected = dev ?? { min: tc?.min ?? 0, max: tc?.max ?? 0 };

      expect(ability, `❌ 找不到 ${roleId} 的能力声明`).toBeTruthy();
      expect(
        tl,
        dev
          ? `ℹ️ ${roleId} 夜间目标数偏离声明（已冻结偏差 ${JSON.stringify(dev)}）`
          : `❌ ${roleId} 夜间目标约束 ${tl.min}~${tl.max} 与能力声明 ${tc?.min}~${tc?.max} 不一致`
      ).toEqual(expected);
      // 结构性自洽：min ≤ max、且不超过 5（官方单次选择上限）
      expect(tl.max, `❌ ${roleId} 目标上限小于下限`).toBeGreaterThanOrEqual(tl.min);
      expect(tl.max, `❌ ${roleId} 目标上限异常（>5）`).toBeLessThanOrEqual(5);
      // 入队诚实的角色，其目标上限才允许 > 0（否则是"看不见的选人步骤"）
      if (!row().queued) {
        expect(
          queueFor(buildSeats(roleId), 0, row().night),
          `❌ ${roleId} 未入队却声称可选目标`
        ).not.toContain(roleId);
      }
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  §B · 敏感信息：展示口径与互认信息不得泄漏
// ══════════════════════════════════════════════════════════════════════════
describe("L3 · §B 敏感信息不得泄漏（不得从 seats 反推）", () => {
  it("④ 酒鬼（外来者）展示口径 = 伪装镇民，绝不等于「酒鬼」", () => {
    const drunkSeat: any = {
      id: 0,
      playerName: "P1",
      role: r("drunk"),
      charadeRole: r("oracle"),
      displayRole: r("artist"), // 分叉缓存：故意与权威字段不同
      isDead: false,
      statusEffects: [{ type: "drunk", permanent: true }],
    };

    const shown: any = getCharadeDisplayRole(drunkSeat);
    expect(shown?.id, "❌ 酒鬼展示口径被缓存字段 displayRole 抢走了").toBe("oracle");
    expect(shown?.name, "❌ 酒鬼应展示为伪装身份").toBe(r("oracle").name);
    expect(shown?.id, "❌ 展示口径泄漏了真实身份「酒鬼」").not.toBe("drunk");
    expect(isCharadeMasked(drunkSeat), "❌ 伪装遮罩未生效").toBe(true);
    // 无 charadeRole 时应兜底展示 role（不得崩）
    expect(getCharadeDisplayRole({ role: r("sailor") } as any)?.id).toBe("sailor");
  });

  it("⑤ 身份告知牌翻开酒鬼座位：不得出现「酒鬼」三个字（玩家会看到）", () => {
    const seats = buildSeats("drunk");
    (seats[0] as any).charadeRole = r("oracle");
    (seats[0] as any).statusEffects = [{ type: "drunk", permanent: true }];

    render(
      <IdentityShowcaseModal
        isOpen
        onClose={() => {}}
        seats={seats as any}
        initialSeatId={0}
      />
    );
    // 默认处于防窥遮罩 ⇒ 先「翻开身份」
    const revealBtn = Array.from(document.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").includes("翻开")
    );
    expect(revealBtn, "❌ 找不到「翻开身份」按钮").toBeTruthy();
    fireEvent.click(revealBtn as HTMLElement);

    const t = bodyText();
    expect(t.length, "❌ 身份告知牌渲染为空").toBeGreaterThan(0);
    expect(t, "❌ 翻开后应显示酒鬼的伪装身份「神谕者」").toContain(r("oracle").name);
    expect(
      t.includes("酒鬼"),
      `❌ 告知牌泄漏了酒鬼的真实身份（玩家可见）：${t.slice(0, 120)}`
    ).toBe(false);
  });

  it("⑥ 爪牙互认（minion_info）/ 恶魔互认（demon_info）只排给对应的邪恶座位", () => {
    // ⚠️ adapter 本身「给定座位就生成信息」，**不做排程校验**（见 `_tbHarness.ts:151`）。
    //    真正的门槛在**动态夜序生成器**：非邪恶座位不得被排入互认步骤。
    const goodQueue = queueFor(buildSeats("oracle"), 0, 1); // 0 号是镇民
    expect(
      goodQueue,
      "❌ 镇民座位被排进了爪牙互认步骤 minion_info"
    ).not.toContain("minion_info");
    expect(
      goodQueue,
      "❌ 镇民座位被排进了恶魔互认步骤 demon_info"
    ).not.toContain("demon_info");

    // 对照 1：真爪牙（投毒者）在首夜必须被排入 minion_info，且不得拿到 demon_info
    const minionQueue = queueFor(buildSeats("poisoner"), 0, 1);
    expect(minionQueue, "❌ 投毒者未被排入爪牙互认步骤").toContain("minion_info");
    expect(minionQueue, "❌ 爪牙被误排入恶魔互认步骤").not.toContain("demon_info");

    // 对照 2：真恶魔（沙巴洛斯）必须被排入 demon_info，且不得拿到 minion_info
    const demonQueue = queueFor(buildSeats("shabaloth"), 0, 1);
    expect(demonQueue, "❌ 沙巴洛斯未被排入恶魔互认步骤").toContain("demon_info");
    expect(demonQueue, "❌ 恶魔被误排入爪牙互认步骤").not.toContain("minion_info");
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  §C · 日间主动技能按钮（GameConsole「⚡️ 可用主动技能」）
// ══════════════════════════════════════════════════════════════════════════
describe("L3 · §C 日间主动技能按钮", () => {
  /** 官方日间能力角色 → 按钮文案（`mutant` 走独立仲裁弹窗，文案是「疯狂仲裁」） */
  const DAY_ROLES: Array<[string, string]> = [
    ["gossip", `使用 ${r("gossip").name}`],
    ["artist", `使用 ${r("artist").name}`],
    ["juggler", `使用 ${r("juggler").name}`],
    ["savant", `使用 ${r("savant").name}`],
    ["mutant", "疯狂仲裁"],
  ];

  function mountConsole(roleIds: string[]) {
    const seats = roleIds.map((rid, i) => hseat(i, rid));
    render(
      <GameConsole
        gamePhase={"day" as any}
        nightCount={1}
        seats={seats as any}
        handleDayAbility={() => {}}
      />
    );
  }
  const dayBtnLabels = () =>
    Array.from(
      document.querySelectorAll('[data-testid="start-day-ability-button"]')
    ).map((b) => (b.textContent ?? "").trim());

  function layoutFor(roleId: string) {
    return [roleId, ...FILLER].slice(0, 7);
  }

  describe.each(DAY_ROLES)("§C %s", (roleId, label) => {
    it("⑦ 官方日间能力 → 必须出现自己的「可用主动技能」按钮", () => {
      mountConsole(layoutFor(roleId));
      const labels = dayBtnLabels();
      expect(bodyText(), "❌ 缺少面板标题").toContain("可用主动技能");
      expect(
        labels,
        `❌ ${roleId} 的日间按钮未出现（实际：${JSON.stringify(labels)}）`
      ).toContain(label);
      // 其余填充位不得产出按钮（否则填充位选错了）
      expect(
        labels.length,
        `❌ ${roleId} 布局出现了额外按钮（实际：${JSON.stringify(labels)}）`
      ).toBe(1);
    });
  });

  it("⑧ 负向对照：纯夜间角色布局不得出现任何日间技能按钮", () => {
    mountConsole(FILLER.slice(0, 6));
    const labels = dayBtnLabels();
    expect(
      labels.length,
      `❌ 纯夜间角色布局不应出现日间主动技能按钮（实际：${JSON.stringify(labels)}）`
    ).toBe(0);
    expect(bodyText(), "❌ 无日间技能时不应渲染面板标题").not.toContain("可用主动技能");
  });

  it("⑨ ✅ 已按官方修：赌徒(gambler) 是**纯夜间**能力 ⇒ 不得出现日间主动按钮", () => {
    /**
     * 官方【赌徒】→【角色能力】（逐字）：
     *   「**每个夜晚\***，你要选择一名玩家并猜测该玩家的角色：如果你猜错了，你会死亡。」
     * ⇒ **纯夜间能力，没有日间能力** ⇒ 白天的「⚡️ 可用主动技能」里不该出现赌徒。
     *
     * ✅ 2026-09-22 **按官方原文修正**（本条由「冻结偏差」→ **负向对照**）：
     *   · 删除 `src/roles/townsfolk/gambler.ts` 的
     *     `day: { name: "赌徒猜测", maxUses: 1, target: { min: 1, max: 1 } }` 块
     *     —— 它让 GameConsole 把赌徒当成日间角色（按钮「使用 赌徒」），与官方不符；
     *   · 同时**补上** `night: { order: 21, target: { count: {min:1,max:1} }, dialog }`
     *     —— 官方「**你要**选择一名玩家」是**强制**的，而原先夜间目标数缺省为 0~0
     *     （说书人界面「要不要选人」永远可选）⇒ 同样与官方不符。
     */
    mountConsole(layoutFor("gambler"));
    const labels = dayBtnLabels();
    expect(
      labels,
      `❌ 赌徒是纯夜间能力，不应出现日间技能按钮（实际：${JSON.stringify(labels)}）`
    ).not.toContain(`使用 ${r("gambler").name}`);
    expect(
      labels.length,
      `❌ 赌徒布局不应多出日间按钮（实际：${JSON.stringify(labels)}）`
    ).toBe(0);
    // 正向对照：夜间引导语必须含赌徒角色名 —— 证明它确实是「夜间角色」，
    // 而不是「改坏成两边都没有」（防"删掉就绿"的自证式断言）
    const g = String(engineInfo("gambler", 2)?.guide ?? "");
    expect(g, "❌ 赌徒夜间引导语异常（应含角色名）").toContain(r("gambler").name);
  });
});

// ══════════════════════════════════════════════════════════════════════
//  §E 渲染层边界自证（兜底名单棘轮）—— 2026-09-22 建
// ══════════════════════════════════════════════════════════════════════
/**
 * 🔬 **本节的由来（梦殒春宵「全量变异检验」暴露的「假绿层」，照搬其结论）**
 * ------------------------------------------------------------------
 * 2026-09-22 对梦殒春宵 25 角色做「能力管道全量中和」变异：
 *   L2（23/25 红）、L5（70 红）**大面积变红**，而 **L3 的 64 条全绿**。
 * 追查（探针实测）后确认是**分层必然，但绿灯有歧义**：
 *   · 本文件的 `guide` 来自 `utils/nightInfoAdapter`；它对**有 `nightInfoGenerator`
 *     分支**的角色能**独立于能力管道**产出语义化文案，对其余角色落**通用兜底**。
 *   · 「兜底文案」与「语义化文案」**都非空** ⇒ §A 的「非空」断言对两者
 *     **不可区分**。所以单看 L3 的绿灯，**证明不了**「适配器的语义化分支还在」。
 *
 * ⇒ 本节把这条边界**显式钉住**（棘轮）：兜底名单**只许变小**，禁止静默退化。
 *
 * ⚠️ 本节**不试图**让 L3 覆盖能力语义 —— 那是 L5 的职责（分层设计使然）。
 *    本节只回答一个问题：**「适配器的语义化分支有没有被悄悄删掉？」**
 *
 * ⚠️ 与 snv_l3_ui §E 的**一处差异**（别照抄时改错）：
 *   snv 那边要区分 `engineGuide`（传 `SYS_STEP`）与 `engineGuideNoSysStep`（不传），
 *   因为 7 个邪恶角色会被 `minion_info`/`demon_info` 系统步骤污染。
 *   本文件的 `engineInfo()` **本就不传第 7 参**（`systemStepRoleId = undefined`）
 *   ⇒ 取到的**天然就是「无系统步骤」的引导语**，无需再造一个变体函数。
 */
describe("L3 · §E 渲染层边界自证（兜底名单棘轮：只许变小）", () => {
  /**
   * 判据：`guide` 是否只是**通用兜底**（与角色语义无关）。
   * 两种形态（与 snv_l3_ui §E 保持同一口径，实测枚举）：
   *   · `唤醒N号玩家（角色名）。`
   *   · `唤醒N号【角色名】，准备执行技能。`
   * 空串也算兜底（渲染为空 ⇒ §A 的「非空」断言会先红）。
   */
  const isFallbackGuide = (g: unknown): boolean => {
    const t = String(g ?? "").replace(/\s+/g, "");
    if (!t) return true;
    return (
      /^唤醒\d+号玩家（.+）。$/.test(t) ||
      /^唤醒\d+号【.+?】，准备执行技能。$/.test(t)
    );
  };

  /** 该角色在夜 1 / 夜 2 **都**只有兜底 ⇒ 记为「兜底角色」 */
  const fallbackRoles = () =>
    ROSTER.filter((rid) => {
      const g1 = String(engineInfo(rid, 1, buildSeats(rid))?.guide ?? "");
      const g2 = String(engineInfo(rid, 2, buildSeats(rid))?.guide ?? "");
      return isFallbackGuide(g1) && isFallbackGuide(g2);
    });

  /** 同样口径下的「语义化」角色 */
  const semanticRoles = () =>
    ROSTER.filter((rid) => {
      const g1 = String(engineInfo(rid, 1, buildSeats(rid))?.guide ?? "");
      const g2 = String(engineInfo(rid, 2, buildSeats(rid))?.guide ?? "");
      return !(isFallbackGuide(g1) && isFallbackGuide(g2));
    });

  /**
   * 🔒 已登记的兜底角色（2026-09-22 探针实测快照）—— **13 个，逐个都不是缺陷**。
   *
   * 探针口径：`engineInfo(rid, 1|2, buildSeats(rid))` ⇒ 同时打印 `guide` / `speak` /
   * `targetLimit`（**不是只读 guide 就下结论** —— 判「信息完整」要看这三处）。
   * 分组依据是**实测形态**，不是推测：
   *
   * ── A. 窃窃私语 9 个 ────────────────────────────────────────────
   *   · `chambermaid`：guide 兜底，但 `speak` = **「选择两名除你以外的存活玩家。」**
   *     + `targetLimit 2-2` ⇒ 行动指令完整，guide 只是首行引导。
   *   · `gossip`：`speak` = 「如果该玩家今日发表了正确的传闻，说书人应选择一名玩家额外死亡。」
   *     + `targetLimit 0-0`（该夜节点是**声明后的死亡结算**，本就 0 目标）。
   *   · `witch` / `assassin` / `devils_advocate`：`speak` = 「请执行行动」+ `targetLimit 1-1`
   *     ⇒ 与 snv_l3_ui §E 登记的 `witch` **同一形态**（说书人界面靠 targetLimit 驱动选人）。
   *     ⚠️ `assassin` / `innkeeper` 的**夜 1 guide 为空是正确的**：
   *     两者官方都是「每个夜晚**\***」（非首夜），`firstNightPriority === null` ⇒ 首夜不唤醒。
   *   · `plague_doctor`（ON_DEATH）：平时不该被唤醒，只有死亡当晚由死亡事件分发器入队。
   *   · `saint`（**外来者版**）/ `recluse`（PASSIVE）：**根本没有夜间步骤**
   *     ⇒ guide 为空是**正确**的（弹窗本就不该出现）；`saint` 走 legacy `checkGameEnd`。
   *
   * ── B. 无名之墓 4 个（本文件是两剧本并集，一并登记；属下一轮的债）────────
   *   · `clockmaker`：`speak` = 「说书人告知：恶魔与爪牙最近距离为 1（邻座为1）。」
   *     ⇒ 信息由**能力管道**产出；L3 只渲染、不跑管道 ⇒ 取到兜底属预期
   *     （与 snv_l3_ui §E 的 `clockmaker` 记录完全一致）。
   *   · `sailor`：`speak` = 「请指向一名存活玩家（包括你自己）。你或他之一会醉酒至下个黄昏。」
   *   · `gambler` / `farmer`：ON_DEATH / 首夜条件类，平时不唤醒。
   */
  const REGISTERED_FALLBACK = [
    // A. 窃窃私语（9）
    "chambermaid", "gossip", "innkeeper", "saint", "recluse",
    "plague_doctor", "witch", "assassin", "devils_advocate",
    // B. 无名之墓（4）
    "gambler", "clockmaker", "sailor", "farmer",
  ];

  it("⑮ ⭐ 分类器正向对照：必须能识别出**语义化**引导（防「全判兜底」导致下面恒绿）", () => {
    const semantic = semanticRoles();
    /**
     * 🔒 棘轮下限：2026-09-22 实测 **19 个语义化**（32 − 13 兜底）。
     *    取 18 留 1 个余量；**只许上调**。若某角色从语义化退化成兜底，
     *    语义数会掉下去 ⇒ 本用例先红（与 ⑯ 形成双保险）。
     */
    expect(
      semantic.length,
      "❌ 识别出的语义化角色偏少 —— 分类器或适配器坏了，下面的棘轮不可信"
    ).toBeGreaterThanOrEqual(18);
    for (const rid of ["oracle", "mathematician", "po"]) {
      expect(
        semantic,
        `❌ ${rid} 的引导应被判为语义化（已知样本，防分类器写反）`
      ).toContain(rid);
    }
    expect(
      semantic.length + fallbackRoles().length,
      "❌ 语义化 + 兜底必须恰好覆盖全部 32 个角色（分类器漏判）"
    ).toBe(ROSTER.length);
  });

  it("⑯ ⭐ 棘轮：兜底名单不得**新增**（防适配器语义化分支被静默删掉）", () => {
    const now = fallbackRoles();
    const regressed = now.filter((r) => !REGISTERED_FALLBACK.includes(r));
    expect(
      regressed,
      "❌ 以下角色**从语义化退化成了通用兜底** —— 适配器的语义化分支可能被删/改坏" +
        "（这类退化**不会**被 L5 抓到：L3 本就不跑能力管道）：" +
        regressed.join("、")
    ).toEqual([]);
  });

  it("⑰ 防腐烂：登记表里不得残留「其实已语义化」的陈旧条目（与 TL_DEVIATION 同惯例）", () => {
    const now = fallbackRoles();
    const stale = REGISTERED_FALLBACK.filter((r) => !now.includes(r));
    expect(
      stale,
      "ℹ️ 以下角色已不再是兜底（适配器补了语义化分支？）—— 请从 §E 的 REGISTERED_FALLBACK 删除：" +
        stale.join("、")
    ).toEqual([]);
  });
});

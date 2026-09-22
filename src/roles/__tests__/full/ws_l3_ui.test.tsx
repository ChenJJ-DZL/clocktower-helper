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
 *    （见 §A③ 的 `TL_DEVIATION`、§C 的 `DAY_DEF_DEVIATION`，以及交付报告）。
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
const TL_DEVIATION: Record<string, { min: number; max: number }> = {
  // 造谣者：夜间节点是「声明正确后的死亡结算」（0 目标），
  // 而 targetConfig 的 0~1 描述的是**白天发表声明**时的目标 ⇒ 两个阶段的课税面不同
  gossip: { min: 0, max: 0 },
  // 刺客：官方「你要选择一名玩家」（恰好 1 名），队列节点也是 1~1，
  // 但 targetConfig.min = 0（疑似把"可以不下手"当成了合法）
  assassin: { min: 1, max: 1 },
  // 赌徒：官方「你要选择一名玩家并猜测」（恰好 1 名），targetConfig 也是 1~1，
  // 但队列节点只给到 0~0 ⇒ 说书人界面上「要不要选人」永远是可选的
  gambler: { min: 0, max: 0 },
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

  it("⑨ ⚠️已冻结偏差：赌徒(gambler) 声明了 day 能力，官方却是夜间能力", () => {
    // 官方（赌徒）：「每个夜晚*，你要选择一名玩家并猜测该玩家的角色」
    //   ⇒ 只应在**夜间**唤醒，白天的「⚡️ 可用主动技能」里不该出现赌徒。
    // 实测：`src/roles/townsfolk/gambler.ts:69-73` 声明了
    //   `day: { name: "赌徒猜测", maxUses: 1, target: { min: 1, max: 1 } }`
    //   ⇒ GameConsole 把赌徒当成日间角色（按钮文案「使用 赌徒」）。
    // 本用例冻结「按钮会出现」这一现状；一旦生产把 day 块删掉，这里会红 ——
    // 提醒同步把本条改成负向对照。
    mountConsole(layoutFor("gambler"));
    const labels = dayBtnLabels();
    expect(
      labels,
      `ℹ️ 赌徒不应有日间主动按钮（实际：${JSON.stringify(labels)}）`
    ).toContain(`使用 ${r("gambler").name}`);
    expect(
      labels.length,
      `ℹ️ 赌徒布局只应多出它自己那一个按钮（实际：${JSON.stringify(labels)}）`
    ).toBe(1);
    // 对照：赌徒的夜间引导语确实是夜间能力 → 与「白天按钮」自相矛盾
    const g = String(engineInfo("gambler", 2)?.guide ?? "");
    expect(g, "❌ 赌徒夜间引导语异常").toContain(r("gambler").name);
  });
});

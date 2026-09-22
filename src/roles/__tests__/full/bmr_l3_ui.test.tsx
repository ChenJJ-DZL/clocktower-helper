// @vitest-environment jsdom
/**
 * L3 · 黯月初升（Bad Moon Rising / BMR）· **组件渲染层（25 角色）**
 * ==================================================================
 * 规范 §3 的四个问题，本文件逐条回答：
 *   ① 该角色的夜间弹窗/确认页能渲染（不白屏）
 *   ② 文案**不泄漏**敏感信息（不得从 seats 反推）
 *   ③ 首行引导语符合两种语义之一：
 *        `X号-角色获得信息`（X=行动者）或 `唤醒XX号玩家`（XX=被唤醒者）
 *   ④ 若有日间能力：按钮出现在 GameConsole 的「⚡️ 可用主动技能」中
 *
 * 🔒 两条铁律（沿用罂粟花开/暗流涌动经验）：
 *   · `ModalWrapper` 走 `createPortal` ⇒ 断言读 `document.body`，不是 `container`
 *   · jsdom 缺 `ResizeObserver` ⇒ `beforeAll` 补桩
 *
 * ⚠️ 「文案不泄漏」的判据用**内部字段名白名单**而不是文案关键词：
 *    内部字段（`statusEffects` / `_abilityResults` / `isVortoxWorld` …）一旦出现在
 *    渲染文本里，说明 UI 直接序列化了状态对象 —— 这是真正的泄漏通道。
 *
 * ⚠️ 只加测试不改生产：发现的偏差只冻结 + 报告（见文件末 §D 与交付报告）。
 */
import { describe, expect, it, beforeAll, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { roles, scripts } from "../../../../app/data";
import { calculateNightInfoViaNewEngine } from "../../../utils/nightInfoAdapter";
import { initializeAbilityRegistry, getAbilityForRole } from "../../new_engine/abilityRegistry";
import { NightActionConfirmModal } from "../../../components/modals/NightActionConfirmModal";
import { InfoResultModal } from "../../../components/modals/InfoResultModal";
import { GameConsole } from "../../../components/game/console/GameConsole";
import { board, runRole } from "../_tbHarness";
import { lunaticAbility } from "../../new_engine/lunatic.ability";

const r = (id: string) => roles.find((x) => x.id === id)!;
const BMR = scripts.find((s) => s.id === "bad_moon_rising")!;

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

function seat(id: number, roleId: string, over: Partial<any> = {}): any {
  return {
    id,
    playerName: `P${id + 1}`,
    role: r(roleId),
    isDead: false,
    isDrunk: false,
    isPoisoned: false,
    statusEffects: [],
    ...over,
  };
}

/** 7 人局：1号 = 被测角色，其余为黯月初升内的安全配角 + 一个恶魔 */
function buildSeats(roleId: string): any[] {
  const others = ["chambermaid", "gossip", "grandmother", "tinker", "imp", "sailor"];
  const seats = [seat(0, roleId)];
  others.forEach((rid, i) => seats.push(seat(i + 1, rid)));
  // 避免与配角重名导致「被测角色不在 1 号」的错觉
  const dup = seats.findIndex((s: any, i) => i > 0 && s.role?.id === roleId);
  if (dup > 0) seats[dup].role = r("gossip");
  return seats;
}

/** 该角色在哪一夜被唤醒（对齐能力声明的 firstNightPriority / otherNightPriority） */
const WAKE_NIGHT: Record<string, 1 | 2> = {
  grandmother: 1,
  sailor: 1,
  chambermaid: 1,
  exorcist: 2,
  innkeeper: 2,
  gambler: 2,
  gossip: 2,
  courtier: 1,
  professor: 2,
  minstrel: 2,
  tea_lady: 2,
  pacifist: 2,
  fool: 2,
  tinker: 2,
  moonchild: 2,
  goon: 2,
  lunatic: 1,
  godfather: 1,
  devils_advocate: 1,
  assassin: 2,
  mastermind: 2,
  zombuul: 2,
  pukka: 2,
  shabaloth: 2,
  po: 2,
};

/**
 * 引导语形态分类：
 *   standard —— 首行含「唤醒N号」（说书人唤醒语）/ 含「N号」
 *   passive  —— 明确告知「被动技能，无需唤醒」
 *   deviation —— **已知偏差**（不满足上述两语义），冻结并报告
 */
type GuideKind = "standard" | "passive" | "deviation";
const GUIDE_KIND: Record<string, GuideKind> = {
  grandmother: "deviation", // 「祖母，请醒来。」缺座位号 —— roles/townsfolk/grandmother.ts:120
  zombuul: "deviation", // 「⚰️ 每个夜晚…」缺座位号 —— demon/wombuul.ts wake
  pukka: "deviation",
  shabaloth: "deviation",
  po: "deviation",
  minstrel: "passive",
  tea_lady: "passive",
  pacifist: "passive",
  fool: "passive",
  goon: "passive",
  mastermind: "passive",
};

/** 冻结的「目标数量约束」偏差（adapter 的 targetLimit vs 能力 targetConfig） */
const TARGET_LIMIT_DEVIATION: Record<string, { min: number; max: number }> = {
  gambler: { min: 0, max: 0 }, // ability 是 {1,1}：说书人可不选目标 ⇒ 与官方「你要选择一名玩家」不符
  moonchild: { min: 0, max: 0 }, // ability 是 {1,1}
  assassin: { min: 1, max: 1 }, // ability 是 {0,1}：官方「你可以选择」⇒ 应可放弃
};

const ROSTER = Object.keys(WAKE_NIGHT);

function engineGuide(roleId: string, night: 1 | 2) {
  const seats = buildSeats(roleId);
  return calculateNightInfoViaNewEngine(
    BMR as any,
    seats as any,
    0,
    (night === 1 ? "firstNight" : "night") as any,
    null,
    night,
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

/** 内部字段名：出现在渲染文本里即视为状态泄漏 */
const INTERNAL_TOKENS = [
  "statusEffects",
  "_abilityResults",
  "statusEffectMap",
  "isVortoxWorld",
  "grandchildId",
  "markedForDeath",
  "deathSource",
  "[object",
  "undefined",
  "NaN",
];

// ══════════════════════════════════════════════════════════════════════════
//  §A · 25 角色：引导语形态 + 确认页/结果页渲染 + 不泄漏
// ══════════════════════════════════════════════════════════════════════════
describe("L3 · 黯月初升 · §A 角色夜间引导语与弹窗渲染", () => {
  it("0) 清单自洽：25 角色、与 bad_moon_rising.roleIds 一致、无重复", () => {
    expect(ROSTER.length, "应为 25 个角色").toBe(25);
    expect(new Set(ROSTER).size, "ROSTER 有重复").toBe(25);
    expect([...ROSTER].sort()).toEqual([...(BMR.roleIds ?? [])].sort());
  });

  describe.each(ROSTER.map((id) => [id] as const))("L3 · %s", (roleId) => {
    it("① 引导语形态符合规范（standard / passive / 已冻结偏差）", () => {
      const night = WAKE_NIGHT[roleId];
      const info = engineGuide(roleId, night);
      const guide = String(info?.guide ?? "");
      const kind = GUIDE_KIND[roleId] ?? "standard";

      // 引导语必须非空（弹窗第一行不能是空的）
      expect(guide.length, `❌ ${roleId} 引导语为空 —— 弹窗会白屏`).toBeGreaterThan(0);
      if (kind !== "deviation") {
        // 角色名必须出现在引导语里（防止张冠李戴）。
        // ⚠️ 恶魔类（zombuul/pukka/shabaloth/po）的唤醒台词是**能力台词**，
        //    本身不含角色名 —— 该类偏差单独冻结，不做名称断言。
        expect(
          guide,
          `❌ ${roleId} 引导语未包含角色中文名「${r(roleId).name}」`
        ).toContain(r(roleId).name);
      }

      if (kind === "standard") {
        expect(
          /唤醒\s*\d+\s*号/.test(guide) || /^\s*\d+\s*号/.test(guide),
          `❌ ${roleId} 首行引导语既不匹配「唤醒N号玩家」也不匹配「N号-角色」：${guide.slice(0, 60)}`
        ).toBe(true);
      } else if (kind === "passive") {
        expect(
          guide,
          `❌ ${roleId} 为被动角色，引导语应明确告知「被动技能，无需唤醒」`
        ).toContain("被动技能，无需唤醒");
      } else {
        // 已冻结偏差：只断言「仍有座位号缺失」这一事实，防止被静默改动
        expect(
          /唤醒\s*\d+\s*号/.test(guide),
          `ℹ️ ${roleId} 引导语仍缺座位号（已冻结偏差）：${guide.slice(0, 40)}`
        ).toBe(false);
      }
    });

    it("② 确认页 + 结果页真实渲染，且不泄漏内部状态字段", () => {
      const night = WAKE_NIGHT[roleId];
      const seats = buildSeats(roleId);
      const info = engineGuide(roleId, night);
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
            // ⚠️ 2026-09-21 补：NightActionConfirmData 必填这两个回调（原缺，tsc TS2739）
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

    it("③ 目标数量约束与能力声明一致（偏差已冻结）", () => {
      const night = WAKE_NIGHT[roleId];
      const info = engineGuide(roleId, night);
      const tl = info?.targetLimit ?? { min: 0, max: 0 };

      // 「夜间步骤的目标数」与「能力静态 targetConfig」在本仓**可能**不同：
      //   · godfather 首夜是「得知外来者死亡」的信息步骤（0 目标）
      //   · gossip 的目标在白天流程里选择（夜间步骤 0 目标）
      const STEP_ZERO_TARGET: Record<string, boolean> = {
        godfather: true,
        gossip: true,
      };
      if (STEP_ZERO_TARGET[roleId]) {
        expect(
          { min: tl.min, max: tl.max },
          `❌ ${roleId} 的夜间信息步骤应为 0 目标`
        ).toEqual({ min: 0, max: 0 });
        return;
      }

      const frozen = TARGET_LIMIT_DEVIATION[roleId];
      if (frozen) {
        expect(
          { min: tl.min, max: tl.max },
          `ℹ️ ${roleId} 目标约束偏差已冻结（当前 ${tl.min}~${tl.max}）—— 若已修复请同步删除本条`
        ).toEqual(frozen);
        return;
      }

      // 其余角色：夜间步骤目标数必须等于能力 targetConfig
      const tc = getAbilityForRole(roleId)?.targetConfig;
      expect(tc, `❌ 找不到 ${roleId} 的能力声明`).toBeTruthy();
      expect(
        { min: tl.min, max: tl.max },
        `❌ ${roleId} 夜间目标约束 ${tl.min}~${tl.max} 与能力声明 ${tc?.min}~${tc?.max} 不一致`
      ).toEqual({ min: tc?.min, max: tc?.max });
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  §B · 敏感信息：疯子（lunatic）玩家面文案不得泄漏真实身份
// ══════════════════════════════════════════════════════════════════════════
describe("L3 · §B 疯子玩家面文案不得泄漏真实身份", () => {
  it("④ 疯子 result 页 playerFacingLog：只出现「假恶魔身份」，不出现疯子/模拟击杀", async () => {
    const seats = board(["lunatic", "chambermaid", "gossip", "grandmother", "tinker"]);
    // 官方：疯子以为自己是某个恶魔（apparentDemonRole）
    (seats[0] as any).apparentDemonRole = r("shabaloth");

    const res = await runRole(lunaticAbility, seats, 0, {
      night: 1,
      phase: "firstNight",
      targets: [1],
    });

    const pf = String(res?.meta?.displayInfo?.playerFacingLog ?? "");
    const storytellerLog = String(res?.meta?.abilityLog ?? "");
    const promptText = String(res?.meta?.prompt ?? "");

    // 玩家面文案必须非空且给出"以假恶魔身份做出选择"的语义
    expect(pf.length, "❌ 疯子玩家面文案为空").toBeGreaterThan(0);
    expect(pf, "❌ 玩家面文案应提及假恶魔身份「沙巴洛斯」").toContain("沙巴洛斯");

    // ⭐ 绝不泄漏真实身份 / 机制
    for (const leak of ["疯子", "模拟击杀", "真实身份", "不是恶魔", "0 效果"]) {
      expect(
        pf.includes(leak),
        `❌ 疯子玩家面文案泄漏「${leak}」：${pf}`
      ).toBe(false);
    }
    // 说书人专用文案（prompt）**必须**提示说书人真情（这是说书人的工作）
    expect(
      promptText,
      "❌ 说书人 prompt 应包含「疯子」以提示说书人（否则说书人会按恶魔操作）"
    ).toContain("疯子");
    expect(storytellerLog, "❌ 说书人日志应记录真实身份").toContain("疯子");

    // 状态侧：疯子从不真正杀人
    expect(
      res?.meta?.abilityResult?.realKill,
      "❌ 疯子的 realKill 必须为 false（官方：不造成真实死亡）"
    ).toBe(false);
    expect(
      res?.meta?.abilityResult?.fakeKill,
      "❌ 疯子的 fakeKill 应为 true"
    ).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  §C · 日间主动技能按钮（GameConsole「⚡️ 可用主动技能」）
// ══════════════════════════════════════════════════════════════════════════
describe("L3 · §C 日间主动技能按钮", () => {
  /** 已确认**无**日间能力的一批角色（用于隔离负向对照） */
  const NO_DAY = ["chambermaid", "sailor", "exorcist", "professor", "zombuul", "po"];

  function mountConsole(layout: string[]) {
    const seats = layout.map((rid, i) => seat(i, rid));
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

  it("⑤ 造谣者(gossip) 的日间声明按钮必须出现（官方唯一日间技能镇民）", () => {
    mountConsole(["gossip", "chambermaid", "sailor", "exorcist", "professor", "zombuul"]);
    const labels = dayBtnLabels();
    expect(
      labels.length,
      "❌ 造谣者在白天必须出现「⚡️ 可用主动技能」按钮（官方：每个白天可以公开发表声明）"
    ).toBeGreaterThan(0);
    expect(bodyText(), "❌ 缺少面板标题").toContain("可用主动技能");
    expect(
      labels.some((l) => l.includes("造谣者")),
      `❌ 日间按钮里没有造谣者（实际：${JSON.stringify(labels)}）`
    ).toBe(true);
  });

  it("⑥ 纯夜间角色布局不得出现任何日间技能按钮（负向对照）", () => {
    mountConsole(NO_DAY);
    const labels = dayBtnLabels();
    expect(
      labels.length,
      `❌ 纯夜间角色布局不应出现日间主动技能按钮（实际：${JSON.stringify(labels)}）`
    ).toBe(0);
    // 面板整体不渲染
    expect(bodyText(), "❌ 无日间技能时不应渲染面板标题").not.toContain("可用主动技能");
  });

  it("⑦ 已冻结偏差：赌徒(gambler) 不该有日间技能，但 legacy 定义里有", () => {
    mountConsole(["gambler", "chambermaid", "sailor", "exorcist", "professor", "zombuul"]);
    const labels = dayBtnLabels();
    // 官方：赌徒是「每个夜晚」的技能；legacy `townsfolk/gambler.ts:69` 却写了
    // `day: { name: "赌徒猜测", maxUses: 1 }` ⇒ 白天会多出一个按钮。
    // 本用例冻结该偏差（若已修复请改为 toBe(0)）。
    expect(
      labels.some((l) => l.includes("赌徒")),
      `ℹ️ 赌徒的日间按钮偏差已冻结（legacy day 定义未清理）。实际按钮：${JSON.stringify(labels)}`
    ).toBe(true);
  });
});

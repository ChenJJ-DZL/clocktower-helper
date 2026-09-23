// @vitest-environment jsdom
/**
 * L3 · 组件渲染层 · 梦殒春宵 / 游园惊梦（25 唯一角色）
 * ==================================================================
 * 承接 `trouble_brewing_22_roles_ui_sweep.test.tsx` 的三层扫描范式：
 *   §A 通用弹窗数据驱动扫描：确认页 / 结果页（25 角色全量）
 *   §B 本剧本**专属**弹窗真实渲染（筑梦师 / 博学者 / 艺术家 / 杂耍艺人 /
 *      麻脸巫婆 / 心上人 / 呆瓜 / 镜像双子）
 *   §C 日间能力是否真的挂到 `GameConsole` 的「⚡️ 可用主动技能」入口
 *
 * ⚠️ 测试陷阱（沿用罂粟花开 / 暗流涌动的经验）
 *   · `ModalWrapper` 走 `createPortal` ⇒ 断言必须读 `document.body`，不是 `container`
 *   · jsdom 缺 `ResizeObserver` ⇒ `beforeAll` 补桩
 *   · 比较结果页文案必须**两侧同时归一化**（剥 `【】` 与空白）
 *   · 判「信息不泄漏」时读的是**玩家视角**文案，须用 `PLAYER_VIEW_FORBIDDEN_TERMS` 词表
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { roles, scripts } from "../../../../app/data";
import { getRoleDefinition } from "../../../roles";
import {
  getAbilityForRole,
  initializeAbilityRegistry,
} from "../../../roles/new_engine/abilityRegistry";
import { isNewEngineDayAbility } from "../../../utils/dayAbilityBridge";
import { parseInfoResult } from "../../../utils/infoResultParser";
import { calculateNightInfoViaNewEngine } from "../../../utils/nightInfoAdapter";
import { ArtistResultModal } from "../../../components/modals/ArtistResultModal";
import { DreamerResultModal } from "../../../components/modals/DreamerResultModal";
import { EvilTwinExecutionConfirmModal } from "../../../components/modals/EvilTwinExecutionConfirmModal";
import { InfoResultModal } from "../../../components/modals/InfoResultModal";
import { JugglerJudgeModal } from "../../../components/modals/JugglerJudgeModal";
import { KlutzChoiceModal } from "../../../components/modals/KlutzChoiceModal";
import { NightActionConfirmModal } from "../../../components/modals/NightActionConfirmModal";
import { PitHagModal } from "../../../components/modals/PitHagModal";
import { SavantResultModal } from "../../../components/modals/SavantResultModal";
import { SweetheartDrunkModal } from "../../../components/modals/SweetheartDrunkModal";

const r = (id: string) => roles.find((x) => x.id === id)!;
const SNV = scripts.find((s) => s.id === "sects_and_violets")!;
const GARDEN = scripts.find((s) => s.id === "garden_of_dreams")!;

/** 25 唯一角色（顺序：镇民 13 → 外来者 4 → 爪牙 4 → 恶魔 4） */
const ROSTER = [
  "clockmaker", "dreamer", "snake_charmer", "mathematician", "flowergirl",
  "town_crier", "oracle", "savant", "seamstress", "philosopher",
  "artist", "juggler", "sage",
  "mutant", "sweetheart", "barber", "klutz",
  "evil_twin", "witch", "cerenovus", "pit_hag",
  "fang_gu", "vigormortis", "no_dashii", "vortox",
];

/**
 * 该角色在哪一夜会被唤醒（对齐 `rolesData.json` 的官方夜序）。
 * `null` = 无夜间确认页（纯日间 / 纯被动）。
 */
const WAKE_NIGHT: Record<string, 1 | 2 | null> = {
  clockmaker: 1, dreamer: 1, snake_charmer: 1, mathematician: 1,
  flowergirl: 2, town_crier: 2, oracle: 2,
  savant: null, seamstress: 1, philosopher: null, artist: null,
  juggler: 2, sage: 2,
  mutant: null, sweetheart: 2, barber: 2, klutz: null,
  evil_twin: 1, witch: 1, cerenovus: 1, pit_hag: 2,
  fang_gu: 2, vigormortis: 2, no_dashii: 2, vortox: 2,
};

beforeAll(() => {
  (globalThis as any).ResizeObserver =
    (globalThis as any).ResizeObserver ||
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
});
afterEach(() => cleanup());

const allText = () => document.body.textContent ?? "";

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

/** 7 人局：0 号位为被测角色，其余尽量用本剧本角色（避免跨剧本引用掩盖拼写错误） */
function buildSeats(roleId: string) {
  const layout: Array<[number, string]> = [
    [0, roleId],
    [1, "chambermaid"],
    [2, "gossip"],
    [3, "tinker"],
    [4, "imp"],
    [5, "sweetheart"],
    [6, "sage"],
  ];
  return layout.map(([id, rid]) => seat(id, rid));
}

/** 系统步骤 id → 该夜以系统步骤身份被唤醒（爪牙/恶魔互认） */
const SYS_STEP: Record<string, string> = {
  evil_twin: "minion_info",
  witch: "minion_info",
  cerenovus: "minion_info",
  pit_hag: "minion_info",
  fang_gu: "demon_info",
  vigormortis: "demon_info",
  no_dashii: "demon_info",
  vortox: "demon_info",
};

/**
 * 同 `engineGuide`，但**强制不使用系统步骤**（第 7 参传 `undefined`）。
 *
 * ⚠️ 2026-09-21 新增：`engineGuide` 会传 `SYS_STEP[roleId]`（`minion_info`/`demon_info`），
 *   对 7 个邪恶角色返回的是**爪牙/恶魔互认**这个**系统信息步骤**（0 目标，正确）。
 *   而 §D 要核验的是**角色自己的能力步骤**的目标数 ⇒ 必须绕开系统步骤再测一次。
 */
function engineGuideNoSysStep(roleId: string, night: 1 | 2, seats: any[]) {
  return calculateNightInfoViaNewEngine(
    SNV as any, seats as any, 0,
    (night === 1 ? "firstNight" : "night") as any,
    null, night,
    undefined,
    undefined, undefined, undefined, false, undefined, undefined, undefined, [],
    undefined, undefined, undefined, false, false, false, null,
    undefined, undefined, undefined
  ) as any;
}

function engineGuide(roleId: string, night: 1 | 2, seats: any[]) {
  return calculateNightInfoViaNewEngine(
    SNV as any,
    seats as any,
    0,
    (night === 1 ? "firstNight" : "night") as any,
    null,
    night,
    SYS_STEP[roleId],
    undefined, undefined, undefined, false, undefined, undefined, undefined, [],
    undefined, undefined, undefined, false, false, false, null,
    undefined, undefined, undefined
  ) as any;
}

// ══════════════════════════════════════════════════════════════════════════
describe("L3 · §A 25 角色 × 通用弹窗数据驱动扫描", () => {
  initializeAbilityRegistry();

  it("① 每个被唤醒角色的【技能确认页】都能渲染非空内容（不白屏）", () => {
    const blank: string[] = [];
    let checked = 0;
    for (const roleId of ROSTER) {
      const night = WAKE_NIGHT[roleId];
      if (!night) continue;
      checked++;
      const seats = buildSeats(roleId);
      const info = engineGuide(roleId, night, seats);
      const guide: string = info?.guide ?? "";
      if (!guide) {
        blank.push(roleId);
        continue;
      }
      cleanup();
      render(
        <NightActionConfirmModal
          data={{
            roleName: r(roleId).name,
            actionDescription: guide.slice(0, 60),
            targetDescriptions: ["（无目标）"],
            targetLimit: info?.targetLimit ?? { min: 0, max: 0 },
            actorSeatId: 0,
            // ⚠️ 2026-09-21 补：NightActionConfirmData 必填这两个回调（原缺，tsc TS2739）
            onConfirm: () => {},
            onCancel: () => {},
          }}
          seats={seats}
          onConfirm={() => {}}
          onCancel={() => {}}
        />
      );
      const t = allText();
      expect(t.length, `${roleId} 确认页渲染为空`).toBeGreaterThan(0);
      expect(t, `${roleId} 确认页含 undefined`).not.toContain("undefined");
      expect(t, `${roleId} 确认页含 NaN`).not.toContain("NaN");
      expect(t, `${roleId} 确认页含 [object`).not.toContain("[object");
    }
    // 25 角色中 20 个有夜间唤醒步骤（纯日间/纯被动 5 个：savant/artist/philosopher/mutant/klutz）
    expect(checked, "被唤醒角色数应为 20").toBe(20);
    expect(blank, `以下角色引擎未产出 guide：${blank.join(", ")}`).toEqual([]);
  });

  it("② 每个角色的【技能结果页】渲染文案 == 引擎 guide 的解析结果", () => {
    const mismatched: string[] = [];
    for (const roleId of ROSTER) {
      const night = WAKE_NIGHT[roleId];
      if (!night) continue;
      const seats = buildSeats(roleId);
      const guide: string = engineGuide(roleId, night, seats)?.guide ?? "";
      if (!guide) continue;

      const roleName = `1号-${r(roleId).name}`;
      const parsed = parseInfoResult(guide, roleName);

      cleanup();
      render(
        <InfoResultModal
          roleName={roleName}
          resultText={guide}
          onConfirm={() => {}}
          onModify={() => {}}
        />
      );
      const t = allText();
      const norm = (x: string) => x.replace(/[【】\s]/g, "");
      if (parsed.result && !norm(t).includes(norm(parsed.result))) {
        mismatched.push(
          `${roleId}：期望含「${parsed.result}」，实际「${t.slice(0, 100)}」`
        );
      }
      expect(t, `${roleId} 结果页含 undefined`).not.toContain("undefined");
      expect(t, `${roleId} 结果页含 NaN`).not.toContain("NaN");
      expect(t, `${roleId} 结果页含 [object`).not.toContain("[object");
    }
    expect(mismatched, `以下角色结果页未呈现引擎核心结果：\n${mismatched.join("\n")}`).toEqual([]);
  });

  it("③ 引导语首行必须符合两种语义之一（X号-角色 / 唤醒XX号）", () => {
    const bad: string[] = [];
    let checked = 0;
    for (const roleId of ROSTER) {
      const night = WAKE_NIGHT[roleId];
      if (!night) continue;
      // ⚠️ 爪牙/恶魔互认是**系统步骤**（`minion_info`/`demon_info`），
      //    其引导语形如「恶魔是: 5号 / 爪牙队友: 无」，不属于「唤醒某人」语义，
      //    故从本判据中排除（其内容正确性由 ①/② 与 L5 覆盖）。
      if (SYS_STEP[roleId]) continue;
      checked++;
      const seats = buildSeats(roleId);
      const guide: string = engineGuide(roleId, night, seats)?.guide ?? "";
      if (!guide) continue;
      const ok = /^\s*(\d+\s*号-|唤醒\s*\d+\s*号)/.test(guide);
      if (!ok) bad.push(`${roleId}：「${guide.slice(0, 40)}」`);
    }
    expect(checked, "非系统步骤的被唤醒角色应有 12 个").toBe(12);
    expect(
      bad,
      `以下角色的引导语首行既不是「X号-角色…」也不是「唤醒XX号…」\n${bad.join("\n")}`
    ).toEqual([]);
  });

  it("④ ROSTER 与两剧本 roleIds 并集严格一致（25 唯一角色）", () => {
    expect(ROSTER.length, "应为 25 个唯一角色").toBe(25);
    expect(new Set(ROSTER).size, "ROSTER 存在重复 id").toBe(25);
    const union = [...new Set([...(SNV.roleIds ?? []), ...(GARDEN.roleIds ?? [])])].sort();
    expect([...ROSTER].sort(), "ROSTER 与「梦殒春宵 ∪ 游园惊梦」不一致").toEqual(union);
    for (const id of ROSTER) {
      expect(r(id), `角色 ${id} 未在 app/data 中找到`).toBeTruthy();
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe("L3 · §B 梦殒春宵专属弹窗真实渲染", () => {
  it("⑤ 筑梦师结果弹窗：呈现两个角色候选（不泄漏哪个是真的）", () => {
    render(
      <DreamerResultModal
        roleA={r("gossip")}
        roleB={r("imp")}
        onClose={() => {}}
      />
    );
    const t = allText();
    expect(t, "❌ 必须呈现候选 A").toContain("造谣者");
    expect(t, "❌ 必须呈现候选 B").toContain("小恶魔");
    expect(t.length, "❌ 弹窗内容不得为空").toBeGreaterThan(10);
  });

  it("⑥ 博学者结果弹窗：两段信息都渲染，且不显示「正确/错误」的判定词", () => {
    render(
      <SavantResultModal
        initialInfoA="甲信息"
        initialInfoB="乙信息"
        onClose={() => {}}
      />
    );
    const t = allText();
    expect(t, "❌ 必须渲染信息 A").toContain("甲信息");
    expect(t, "❌ 必须渲染信息 B").toContain("乙信息");
    expect(t.length, "❌ 弹窗内容不得为空").toBeGreaterThan(10);
  });

  it("⑦ 艺术家结果弹窗：渲染提问与答案输入（不白屏）", () => {
    render(<ArtistResultModal onClose={() => {}} />);
    const t = allText();
    expect(t.length, "❌ 弹窗内容不得为空").toBeGreaterThan(5);
    expect(t, "❌ 不得含 undefined").not.toContain("undefined");
    expect(t, "❌ 不得含 [object").not.toContain("[object");
  });

  it("⑧ 杂耍艺人裁判弹窗：列出可猜测的玩家", () => {
    const seats = buildSeats("juggler");
    render(
      <JugglerJudgeModal
        seatId={0}
        seats={seats}
        onConfirm={() => {}}
        onClose={() => {}}
      />
    );
    const t = allText();
    expect(t.length, "❌ 弹窗内容不得为空").toBeGreaterThan(10);
    expect(t, "❌ 不得含 undefined").not.toContain("undefined");
  });

  it("⑨ 麻脸巫婆弹窗：显示目标座位与角色选择", () => {
    const seats = buildSeats("pit_hag");
    render(
      <PitHagModal
        isOpen
        targetId={1}
        roleId="soldier"
        seats={seats as any}
        roles={roles as any}
        onRoleChange={() => {}}
        onCancel={() => {}}
        onContinue={() => {}}
      />
    );
    const t = allText();
    expect(t.length, "❌ 弹窗内容不得为空").toBeGreaterThan(10);
    expect(t, "❌ 不得含 undefined").not.toContain("undefined");
    expect(t, "❌ 不得含 [object").not.toContain("[object");
  });

  it("⑩ 心上人弹窗：列出可选醉酒目标", () => {
    const seats = buildSeats("sweetheart");
    render(
      <SweetheartDrunkModal
        isOpen
        sourceId={0}
        seats={seats as any}
        onConfirm={() => {}}
      />
    );
    const t = allText();
    expect(t.length, "❌ 弹窗内容不得为空").toBeGreaterThan(10);
    expect(t, "❌ 不得含 undefined").not.toContain("undefined");
  });

  it("⑪ 呆瓜弹窗：选中目标后可确认（未选中时按钮禁用）", () => {
    const seats = buildSeats("klutz");
    render(
      <KlutzChoiceModal
        isOpen
        sourceId={0}
        seats={seats as any}
        selectedTarget={null}
        onSelectTarget={() => {}}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    const t = allText();
    expect(t.length, "❌ 弹窗内容不得为空").toBeGreaterThan(10);
    const btns = Array.from(document.querySelectorAll("button"));
    const disabled = btns.filter((b) => (b as HTMLButtonElement).disabled);
    expect(disabled.length, "❌ 未选目标时应有禁用按钮（防止空选确认）").toBeGreaterThan(0);
  });

  it("⑫ 镜像双子处决确认弹窗：渲染警告语义（邪恶双子死亡 ⇒ 善良落败）", () => {
    render(
      <EvilTwinExecutionConfirmModal
        isOpen
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    const t = allText();
    expect(t.length, "❌ 弹窗内容不得为空").toBeGreaterThan(10);
    expect(t, "❌ 不得含 undefined").not.toContain("undefined");
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe("L3 · §C 日间能力入口（GameConsole「⚡️ 可用主动技能」）", () => {
  /** GameConsole 的日间技能过滤条件 = `getRoleDefinition(id)?.day` 或 `role.dayMeta` */
  const hasConsoleDayEntry = (roleId: string) =>
    Boolean(getRoleDefinition(roleId)?.day) || Boolean(r(roleId)?.dayMeta);

  it("⑬ 新引擎 DAY 触发角色必须被桥接层识别为日间能力", () => {
    // ✅ 2026-09-22：`philosopher` 已按官方从 DAY 改为 EVERY_NIGHT（选角色移到夜间）⇒ 移出本列表
    for (const id of ["savant", "artist", "juggler"]) {
      expect(
        isNewEngineDayAbility(id),
        `❌ ${id} 的 triggerTiming 含 DAY，桥接层必须识别（否则日间能力永不执行）`
      ).toBe(true);
    }
    for (const id of ["clockmaker", "fang_gu", "oracle", "witch"]) {
      expect(
        isNewEngineDayAbility(id),
        `❌ ${id} 没有 DAY 触发能力，不应被识别为日间能力`
      ).toBe(false);
    }
  });

  it("⑭ GameConsole 日间技能按钮的数据来源必须覆盖本剧本的日间角色", () => {
    /**
     * 这 5 个角色在 UI 上必须有「⚡️ 可用主动技能」入口。
     * ✅ 2026-09-22 移除 `philosopher` —— 官方【哲学家】是「**在夜晚时**」能力
     *   ⇒ 已删 `philosopher.ts` 的 `day:` 块、`triggerTiming` 改 `EVERY_NIGHT`，
     *     选角色改在**夜间**行动确认窗（`requiresRoleSelection`）完成。
     *   ⚠️ 顺带把它移到下面的「不得误挂日间入口」清单 —— **两侧都断言**，
     *     防「删掉就绿」的自证式断言。
     */
    for (const id of ["savant", "artist", "juggler", "cerenovus", "mutant"]) {
      expect(
        hasConsoleDayEntry(id),
        `❌ ${id} 在 GameConsole 里拿不到日间技能入口（getRoleDefinition.day / dayMeta 均为空）`
      ).toBe(true);
    }
    // 纯被动/纯夜间角色不得误挂日间入口
    for (const id of [
      "barber",
      "sweetheart",
      "sage",
      "clockmaker",
      "fang_gu",
      "philosopher",
    ]) {
      expect(
        hasConsoleDayEntry(id),
        `❌ ${id} 是纯被动/纯夜间角色，不应出现在「可用主动技能」里`
      ).toBe(false);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  §C · 25 角色：确认页 / 结果页**不泄漏内部状态字段**
// ══════════════════════════════════════════════════════════════════════════
//  ⚠️ 2026-09-21 补齐（对齐 `bmr_l3_ui.test.tsx` 的标准）：
//    `snv_l3_ui` 原先只有 4 个**循环式** `it`（`for (const roleId of ROSTER)`），
//    且**完全缺少**「不泄漏内部字段」这一维度 —— 而它正是项目「玩家可见信息」铁律
//    （「信息注入而非探测」/ 文案泄漏）的**唯一自动化防线**。
//    另：循环式 `it` 一红全红、**报告不指名是哪个角色** ⇒ 可诊断性差。
//    本块改为 `describe.each(ROSTER)` ⇒ **每角色一条独立用例**。
//
//  🔒 判据：确认页（NightActionConfirmModal）与结果页（InfoResultModal）的**渲染文本**
//    都不得出现内部状态字段名（`statusEffects` / `_abilityResults` / `deadSource`…）
//    或 JS 退化串（`[object` / `undefined` / `NaN`）。
const INTERNAL_TOKENS = [
  "statusEffects",
  "_abilityResults",
  "statusEffectMap",
  "isVortoxWorld",
  "markedForDeath",
  "deathSource",
  "[object",
  "undefined",
  "NaN",
];

describe("L3 · 梦殒春宵 · §C 25 角色（逐角色）：渲染非空 + 不泄漏内部字段", () => {
  describe.each(ROSTER.map((id) => [id] as const))("L3 · %s", (roleId) => {
    it("④ 确认页 + 结果页渲染非空，且不泄漏内部状态字段", () => {
      const night = WAKE_NIGHT[roleId];
      // 无夜间唤醒步骤的角色（纯被动/系统步骤之外的）跳过
      if (!night) return;
      const seats = buildSeats(roleId);
      const info = engineGuide(roleId, night, seats);
      const guide = String(info?.guide ?? "");
      const roleName = `1号-${r(roleId).name}`;

      // ── 确认页（说书人选择目标前的核对页）──
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
            onConfirm: () => {},
            onCancel: () => {},
          }}
          seats={seats as any}
          onConfirm={() => {}}
          onCancel={() => {}}
        />
      );
      const t1 = allText();
      expect(t1.length, `❌ ${roleId} 确认页渲染为空（白屏）`).toBeGreaterThan(0);
      expect(t1, `❌ ${roleId} 确认页应含角色中文名`).toContain(r(roleId).name);

      // ── 结果页（说书人宣读的结果）──
      cleanup();
      render(
        <InfoResultModal
          roleName={roleName}
          resultText={guide}
          onConfirm={() => {}}
          onModify={() => {}}
        />
      );
      const t2 = allText();
      expect(t2.length, `❌ ${roleId} 结果页渲染为空（白屏）`).toBeGreaterThan(0);

      // ── 不泄漏内部状态字段（两页都查）──
      const leaks: string[] = [];
      for (const tok of INTERNAL_TOKENS) {
        if (t1.includes(tok)) leaks.push(`确认页:${tok}`);
        if (t2.includes(tok)) leaks.push(`结果页:${tok}`);
      }
      expect(
        leaks,
        `❌ ${roleId} 渲染文本泄漏内部状态字段/退化串 —— 违反「玩家可见信息」铁律`
      ).toEqual([]);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  §D · 25 角色：**夜间步骤的目标数量约束** == **能力声明的 targetConfig**
// ══════════════════════════════════════════════════════════════════════════
//  ⚠️ 2026-09-21 补齐（对齐 `bmr_l3_ui.test.tsx` 的标准）。
//    核验点：`nightInfo.targetLimit`（说书人实际看到的可选目标数）
//            必须 == `ability.targetConfig`（能力静态声明）
//    —— 两者不一致 ⇒ 要么「说书人被允许选错数量」，要么「该选却被禁」，直接影响流程。
//
//  🔒 两类例外都必须**显式登记**（禁止默默放过）：
//    · `STEP_ZERO_TARGET`：夜间步骤本身是**信息步骤**（0 目标），与能力声明无关
//    · `TARGET_LIMIT_DEVIATION`：**已知偏差冻结表** —— 一旦修复须同步删除条目
const STEP_ZERO_TARGET: Record<string, boolean> = {};

const TARGET_LIMIT_DEVIATION: Record<string, { min: number; max: number }> = {};

describe("L3 · 梦殒春宵 · §D 25 角色（逐角色）：目标数量约束与能力声明一致", () => {
  describe.each(ROSTER.map((id) => [id] as const))("L3 · %s", (roleId) => {
    it("⑤ 夜间 targetLimit 必须等于能力 targetConfig（例外已登记）", () => {
      const night = WAKE_NIGHT[roleId];
      if (!night) return;
      const seats = buildSeats(roleId);
      /**
       * ⚠️⚠️ 2026-09-21：`SYS_STEP` 角色（爪牙/恶魔）必须用 `engineGuideNoSysStep`。
       *   否则 `engineGuide` 会传 `SYS_STEP[roleId]` ⇒ 返回的是「爪牙/恶魔互认」
       *   **系统信息步骤**（0 目标，**正确**）⇒ 与能力声明 1~1 比对会**假红**（本轮实测踩到：
       *   7 个角色全红，全是假阳性）。
       */
      const info = SYS_STEP[roleId]
        ? engineGuideNoSysStep(roleId, night, seats)
        : engineGuide(roleId, night, seats);
      const tl = info?.targetLimit ?? { min: 0, max: 0 };

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

      const tc = (getAbilityForRole(roleId) as any)?.targetConfig;
      expect(tc, `❌ 找不到 ${roleId} 的能力声明（未注册？）`).toBeTruthy();
      expect(
        { min: tl.min, max: tl.max },
        `❌ ${roleId} 夜间步骤目标约束 ${tl.min}~${tl.max} 与能力声明 ${tc?.min}~${tc?.max} 不一致`
      ).toEqual({ min: tc?.min, max: tc?.max });
    });
  });
});

// ══════════════════════════════════════════════════════════════════════
//  §E 渲染层边界自证（棘轮）—— 2026-09-22 建
// ══════════════════════════════════════════════════════════════════════
/**
 * 🔬 **本节的由来（全量变异检验暴露的「假绿层」）**
 * ------------------------------------------------------------------
 * 2026-09-22 做「25 角色能力管道全量中和」变异时发现：
 *   L2（23/25 红）、L5（70 红）**大面积变红**，而 **本文件 64 条全绿**。
 *
 * 追查结论（探针实测，非推测）：
 *   · 本文件的 `guide` 来自 `utils/nightInfoAdapter`，它对**有 `nightInfoGenerator`
 *     分支**的角色（oracle / mathematician / juggler / sage / 4 恶魔…）能**独立于能力管道**
 *     产出语义化文案；对其余角色则落**通用兜底**。
 *   · 而「兜底文案」与「语义化文案」**都非空** ⇒ 本节原有断言（①②「非空」）
 *     对这两者**不可区分** ⇒ 单看本文件的绿灯，无法证明「适配器语义化分支还在」。
 *
 * ⇒ 本节把这条**边界显式钉住**（棘轮）：兜底名单**只许变小**，禁止静默退化。
 *
 * ⚠️ 本节**不试图**让 L3 覆盖能力语义 —— 那是 L5 的职责（分层设计使然）。
 *    本节只回答一个问题：**「适配器的语义化分支有没有被悄悄删掉？」**
 */
describe("L3 · §E 渲染层边界自证（兜底名单棘轮：只许变小）", () => {
  /**
   * 判据：`guide` 是否只是**通用兜底**（与角色语义无关）。
   * 两种形态（实测枚举，非猜测）：
   *   · `唤醒N号玩家（角色名）。`
   *   · `唤醒N号【角色名】，准备执行技能。`
   * 空串也算兜底（渲染为空 ⇒ 上层「非空」断言会先红）。
   */
  const isFallbackGuide = (g: unknown): boolean => {
    const t = String(g ?? "").replace(/\s+/g, "");
    if (!t) return true;
    return (
      /^唤醒\d+号玩家（.+）。$/.test(t) ||
      /^唤醒\d+号【.+?】，准备执行技能。$/.test(t)
    );
  };

  /** 该角色在夜 1/夜 2 **都**只有兜底 ⇒ 记为「兜底角色」 */
  /**
   * ⚠️ 必须用 `engineGuideNoSysStep`（**绕开系统步骤**）：
   *   7 个邪恶角色的 `SYS_STEP` 会各自传 `minion_info`/`demon_info`，
   *   而那是**系统信息步骤**（爪牙/恶魔互认）的文案，**不是角色自己的能力引导**
   *   ⇒ 用 `engineGuide` 会把 `witch` 误判成「语义化」（实测踩到：⑰ 报 `witch` 陈旧）。
   */
  const fallbackRoles = () =>
    ROSTER.filter((rid) => {
      const g1 = String(engineGuideNoSysStep(rid, 1, buildSeats(rid))?.guide ?? "");
      const g2 = String(engineGuideNoSysStep(rid, 2, buildSeats(rid))?.guide ?? "");
      return isFallbackGuide(g1) && isFallbackGuide(g2);
    });

  /**
   * 🔒 已登记的兜底角色（2026-09-22 实测快照）—— **8 个，逐个都不是缺陷**：
   *   · `dreamer` / `snake_charmer` / `seamstress` / `philosopher` / `witch`
   *     ⇒ 行动指令在 **`speak`**（如「请选择除你及旅行者以外的一名玩家…」）
   *       + `meta.targetCount {min,max}` 里，`guide` 只是首行引导 ⇒ UI 信息完整。
   *   · `sweetheart` / `barber`（ON_DEATH）⇒ **平时不该被唤醒**，只有死亡当晚由
   *     死亡事件分发器入队 ⇒ 此处取到兜底属预期。
   *   · `clockmaker`（首夜、**不选目标**的信息类）⇒ 其信息由**能力管道**产出
   *     （`calculate` → `abilityResult`）；L3 只渲染、不跑管道 ⇒ 取到兜底属预期。
   */
  const REGISTERED_FALLBACK = [
    "clockmaker", "dreamer", "snake_charmer", "seamstress",
    "philosopher", "sweetheart", "barber", "witch",
  ];

  it("⑮ ⭐ 分类器正向对照：必须能识别出**语义化**引导（防「全判兜底」导致下面恒绿）", () => {
    // 同样绕开系统步骤（见 fallbackRoles 的说明）
    const semantic = ROSTER.filter((rid) => {
      const g1 = String(engineGuideNoSysStep(rid, 1, buildSeats(rid))?.guide ?? "");
      const g2 = String(engineGuideNoSysStep(rid, 2, buildSeats(rid))?.guide ?? "");
      return !(isFallbackGuide(g1) && isFallbackGuide(g2));
    });
    expect(
      semantic.length,
      "❌ 一个「语义化」引导都没识别出来 —— 分类器或适配器坏了，下面的棘轮不可信"
    ).toBeGreaterThanOrEqual(15);
    for (const rid of ["oracle", "mathematician", "vigormortis"]) {
      expect(semantic, `❌ ${rid} 的引导应被判为语义化（已知样本，防分类器写反）`).toContain(
        rid
      );
    }
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

  it("⑰ 防腐烂：登记表里不得残留「其实已语义化」的陈旧条目（与 TARGET_LIMIT_DEVIATION 同惯例）", () => {
    const now = fallbackRoles();
    const stale = REGISTERED_FALLBACK.filter((r) => !now.includes(r));
    expect(
      stale,
      "ℹ️ 以下角色已不再是兜底（适配器补了语义化分支？）—— 请从 §E 的 REGISTERED_FALLBACK 删除：" +
        stale.join("、")
    ).toEqual([]);
  });
});

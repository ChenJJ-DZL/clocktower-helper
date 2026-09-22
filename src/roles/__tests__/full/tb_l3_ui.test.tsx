// @vitest-environment jsdom
/**
 * L3 · 暗流涌动（Trouble Brewing / TB）· **组件渲染层（22 角色）**
 * ==================================================================
 * 规范 §3 的四个问题，本文件逐条回答：
 *   ① 该角色的夜间弹窗/确认页能渲染（不白屏）
 *   ② 文案**不泄漏**敏感信息（不得从 seats 反推；用 displayInfo 三通道）
 *   ③ 首行引导语符合两种语义之一：
 *        `X号-角色获得信息`（X=行动者）或 `唤醒XX号玩家`（XX=被唤醒者）
 *   ④ 若有日间能力：按钮出现在 GameConsole 的「⚡️ 可用主动技能」中
 *
 * 🔒 两条铁律（沿用罂粟花开/黯月初升经验）：
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
import { render, cleanup, fireEvent } from "@testing-library/react";
import { roles, scripts } from "../../../../app/data";
import { calculateNightInfoViaNewEngine } from "../../../utils/nightInfoAdapter";
import { initializeAbilityRegistry, getAbilityForRole } from "../../new_engine/abilityRegistry";
import { ENGINE_CONFIG } from "../../../hooks/useNightEngine";import { NightActionConfirmModal } from "../../../components/modals/NightActionConfirmModal";
import { InfoResultModal } from "../../../components/modals/InfoResultModal";
import { IdentityShowcaseModal } from "../../../components/modals/IdentityShowcaseModal";
import { GameConsole } from "../../../components/game/console/GameConsole";
import { getCharadeDisplayRole, isCharadeMasked } from "../../../utils/charadeDisplay";
import { board, queueFor, seat as hseat } from "../_tbHarness";

const r = (id: string) => roles.find((x) => x.id === id)!;
const TB = scripts.find((s) => s.id === "trouble_brewing")!;

/**
 * 暗流涌动 22 角色（顺序：镇民 13 → 外来者 4 → 爪牙 4 → 恶魔 1）。
 * 必须与 `app/data.ts` 中 `trouble_brewing.roleIds` 逐字一致（① 有断言兜底）。
 */
const ROSTER = [
  "washerwoman", "librarian", "investigator", "chef", "empath",
  "fortune_teller", "undertaker", "monk", "ravenkeeper", "virgin",
  "slayer", "soldier", "mayor",
  "butler", "drunk", "recluse", "saint",
  "poisoner", "spy", "scarlet_woman", "baron",
  "imp",
];

/**
 * 该角色在哪一夜被唤醒（对齐 `src/data/rolesData.json` 的官方夜序；不唤醒 → null）。
 * 首夜：洗衣妇52 / 图书管理员53 / 调查员54 / 厨师55 / 共情者56 / 占卜师57 / 管家58
 *       投毒者30 / 男爵33 / 间谍75（「每个夜晚你都看到魔典」→ 首夜也唤醒）
 * 其他夜：僧侣24 / 红唇女郎37 / 小恶魔45 / 守鸦人80 / 共情者90 / 占卜师91
 *         管家92 / 送葬者93 / 投毒者13 / 间谍108
 */
const WAKE_NIGHT: Record<string, 1 | 2 | null> = {
  washerwoman: 1, librarian: 1, investigator: 1, chef: 1, empath: 1,
  fortune_teller: 1, undertaker: 2, monk: 2, ravenkeeper: 2,
  virgin: null, slayer: null, soldier: null, mayor: null,
  butler: 1, drunk: null, recluse: null, saint: null,
  poisoner: 1, spy: 1, scarlet_woman: 2, baron: 1,
  imp: 2,
};

/**
 * 引导语形态分类：
 *   standard  —— 首行含「唤醒N号【角色】」（说书人唤醒语）
 *   passive   —— 明确告知「被动技能，无需唤醒」
 *   silent    —— 引擎产出空串（该角色无夜间步骤，弹窗本就不该出现）
 *   deviation —— **已知偏差**（不满足上述语义），冻结并报告
 */
type GuideKind = "standard" | "passive" | "silent" | "deviation";
const GUIDE_KIND: Record<string, GuideKind> = {
  // 12 个标准唤醒语
  washerwoman: "standard", librarian: "standard", investigator: "standard",
  chef: "standard", empath: "standard", fortune_teller: "standard",
  undertaker: "standard", monk: "standard", butler: "standard",
  poisoner: "standard", spy: "standard", imp: "standard",
  // 3 个被动（有夜序但引擎明确回「无需唤醒」）
  drunk: "passive", scarlet_woman: "passive", baron: "passive",
  // 6 个无夜间步骤（引擎返回空引导语，队列里没有它们）
  virgin: "silent", slayer: "silent", soldier: "silent",
  mayor: "silent", recluse: "silent", saint: "silent",
  // 1 个已知偏差：守鸦人唤醒台词缺座位号与【】角色名
  //（角色定义 `src/roles/townsfolk/ravenkeeper.ts` 的 wake 文案）
  ravenkeeper: "deviation",
};

/** 系统步骤 id → 该夜以系统步骤身份被唤醒（爪牙/恶魔互认） */
const SYS_STEP: Record<string, string> = {
  baron: "minion_info",
  spy: "minion_info",
  imp: "demon_info",
  poisoner: "minion_info",
  scarlet_woman: "minion_info",
};

/**
 * 「条件唤醒」角色：夜序里有它，但**只有满足条件时**才入队。
 * 这类角色在 L3 必须断言两件事：不满足 ⇒ 不在队列；满足 ⇒ 在队列。
 */
const CONDITIONAL_WAKE: Record<string, string> = {
  undertaker: "当日必须有人死于处决（dynamicQueueGenerator.ts:469 requiresExecutedToday）",
  ravenkeeper: "只有当晚死亡的守鸦人才被唤醒（dynamicQueueGenerator.ts:411 ON_DEATH）",
};

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

/** 7 人局：1号 = 被测角色，其余只用暗流涌动本剧本角色（避免掩盖拼写类缺陷） */
function buildSeats(roleId: string): any[] {
  const others = ["empath", "chambermaid", "gossip", "tinker", "soldier", "imp"];
  const seats = [hseat(0, roleId)];
  others.forEach((rid, i) => seats.push(hseat(i + 1, rid)));
  // 避免与被测角色重名（会让「被测角色不在 1 号」的判断失真）
  const dup = seats.findIndex((s: any, i) => i > 0 && s.role?.id === roleId);
  if (dup > 0) seats[dup].role = r("chambermaid");
  return seats;
}

/** 调引擎取某角色的夜间信息（与生产 UI 同一条 adapter 路径） */
function engineGuide(roleId: string, night: 1 | 2, seats?: any[]) {
  const s = seats ?? buildSeats(roleId);
  const info: any = calculateNightInfoViaNewEngine(
    TB as any,
    s as any,
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
  );
  return info;
}

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

// ══════════════════════════════════════════════════════════════════════════
//  §A · 22 角色：引导语形态 + 确认页/结果页渲染 + 不泄漏
// ══════════════════════════════════════════════════════════════════════════
describe("L3 · 暗流涌动 · §A 角色夜间引导语与弹窗渲染", () => {
  it("0) 清单自洽：22 角色、与 trouble_brewing.roleIds 一致、无重复", () => {
    expect(ROSTER.length, "应为 22 个角色").toBe(22);
    expect(new Set(ROSTER).size, "ROSTER 有重复").toBe(22);
    expect([...ROSTER].sort()).toEqual([...(TB.roleIds ?? [])].sort());
  });

  describe.each(ROSTER.map((id) => [id] as const))("L3 · %s", (roleId) => {
    it("① 引导语形态符合规范（standard / passive / silent / 已冻结偏差）", () => {
      const night = WAKE_NIGHT[roleId] ?? 1;
      const info = engineGuide(roleId, night);
      const guide = String(info?.guide ?? "");
      const kind = GUIDE_KIND[roleId] ?? "standard";

      if (kind === "silent") {
        // 无夜间步骤 ⇒ 引导语为空是**正确**的（弹窗本就不出现）
        expect(guide, `❌ ${roleId} 无夜序却产出了引导语`).toBe("");
        expect(
          queueFor(buildSeats(roleId), 0, night),
          `❌ ${roleId} 无夜间步骤却被排进夜间队列`
        ).toEqual([]);
        return;
      }

      // 其余形态：首行不能是空的（弹窗会白屏）
      expect(guide.length, `❌ ${roleId} 引导语为空 —— 弹窗会白屏`).toBeGreaterThan(0);
      expect(
        guide,
        `❌ ${roleId} 引导语未包含角色中文名「${r(roleId).name}」`
      ).toContain(r(roleId).name);

      if (kind === "standard") {
        expect(
          /唤醒\s*\d+\s*号/.test(guide),
          `❌ ${roleId} 首行既不匹配「唤醒N号玩家」也不匹配「N号-角色」：${guide.slice(0, 60)}`
        ).toBe(true);
        expect(
          /唤醒\s*1\s*号/.test(guide),
          `❌ ${roleId} 唤醒语里的座位号不是行动者 1 号：${guide.slice(0, 40)}`
        ).toBe(true);
      } else if (kind === "passive") {
        expect(
          guide,
          `❌ ${roleId} 为被动角色，引导语应明确告知「被动技能，无需唤醒」`
        ).toContain("被动技能，无需唤醒");
      } else {
        expect(
          /唤醒\s*\d+\s*号/.test(guide),
          `ℹ️ ${roleId} 引导语仍缺座位号（已冻结偏差）：${guide.slice(0, 40)}`
        ).toBe(false);
      }
    });

    it("② 确认页 + 结果页真实渲染，且不泄漏内部状态字段", () => {
      const night = WAKE_NIGHT[roleId] ?? 1;
      const seats = buildSeats(roleId);
      const info = engineGuide(roleId, night, seats);
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

    it("③ 夜间步骤与角色声明的目标约束一致", () => {
      const kind = GUIDE_KIND[roleId];
      const night = WAKE_NIGHT[roleId] ?? 1;

      if (kind === "silent") {
        // 无夜间步骤 ⇒ 两个夜晚都不该被排队；也不该产出目标约束
        expect(queueFor(buildSeats(roleId), 0, 1)).toEqual([]);
        expect(queueFor(buildSeats(roleId), 0, 2)).toEqual([]);
        expect(
          (engineGuide(roleId, 2) as any)?.targetLimit?.max ?? 0,
          `❌ ${roleId} 无夜间步骤却声明了目标数`
        ).toBe(0);
        return;
      }

      const info: any = engineGuide(roleId, night);
      const tl = info?.targetLimit ?? { min: 0, max: 0 };
      const tc = getAbilityForRole(roleId)?.targetConfig;

      if (kind === "passive" || !tc) {
        // 被动角色（酒鬼/红唇女郎/男爵）的夜间步骤是「告知 / 无需操作」⇒ 0 目标
        expect(
          { min: tl.min, max: tl.max },
          `❌ ${roleId} 被动步骤应为 0 目标`
        ).toEqual({ min: 0, max: 0 });
        return;
      }

      expect(tc, `❌ 找不到 ${roleId} 的能力声明`).toBeTruthy();
      expect(
        { min: tl.min, max: tl.max },
        `❌ ${roleId} 夜间目标约束 ${tl.min}~${tl.max} 与能力声明 ${tc?.min}~${tc?.max} 不一致`
      ).toEqual({ min: tc?.min, max: tc?.max });

      if (CONDITIONAL_WAKE[roleId]) {
        // 条件唤醒角色：默认（不满足条件）不在队列
        const plain = buildSeats(roleId);
        expect(
          queueFor(plain, 0, night),
          `❌ ${roleId} 条件未满足却已入队（${CONDITIONAL_WAKE[roleId]}）`
        ).toEqual([]);

        if (roleId === "undertaker") {
          // 满足条件：当日有人死于处决 → 必须入队
          const met = buildSeats(roleId);
          met[1] = { ...met[1], isDead: true, executedToday: true };
          expect(
            queueFor(met, 0, night, { todayExecutedId: 1 }),
            "❌ 当日有人死于处决，送葬者仍未入队"
          ).toContain(roleId);
        } else {
          // 守鸦人：官方「如果**你在夜晚死亡**，你会被唤醒」。
          // ⚠️ 队列生成时该座位仍存活 ⇒ 静态队列里本就不该有它；
          //    生产由 `useNightEngine.ts:441 enqueueDeathTriggeredIfNeeded`
          //    在恶魔杀了他之后**插队**。此处只核验「条件标记」静态事实。
          const rkEntry: any = ENGINE_CONFIG.fullNightOrder.find(
            (e: any) => e.roleId === "ravenkeeper"
          );
          expect(rkEntry?.deathTriggered, "❌ 守鸦人未标 deathTriggered（ON_DEATH）").toBe(
            true
          );
          expect(rkEntry?.otherNightPriority).toBe(80);
          // ⚠️ 能力声明里是 null（不入首夜），ENGINE_CONFIG 里用 0 表达同一语义
          //    —— 口径不统一，已在交付报告登记为「可疑点」（不影响行为）。
          expect(
            rkEntry?.firstNightPriority,
            "ℹ️ ENGINE_CONFIG 用 0（而非 null）表示「不入首夜」"
          ).toBe(0);
        }
        return;
      }

      // 队列里必须真的有它（否则「能选目标」是假象）
      expect(
        queueFor(buildSeats(roleId), 0, night),
        `❌ ${roleId} 不在第 ${night} 夜队列中，却声称要选目标`
      ).toContain(roleId);
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
      charadeRole: r("empath"),
      displayRole: r("librarian"), // 分叉缓存：故意与权威字段不同
      isDead: false,
      statusEffects: [{ type: "drunk", permanent: true }],
    };

    const shown: any = getCharadeDisplayRole(drunkSeat);
    expect(shown?.id, "❌ 酒鬼展示口径被缓存字段 displayRole 抢走了").toBe("empath");
    expect(shown?.name, "❌ 酒鬼应展示为伪装身份").toBe("共情者");
    expect(shown?.id, "❌ 展示口径泄漏了真实身份「酒鬼」").not.toBe("drunk");
    expect(isCharadeMasked(drunkSeat), "❌ 伪装遮罩未生效").toBe(true);
    // 无 charadeRole 时应兜底展示 role（不得崩）
    expect(getCharadeDisplayRole({ role: r("chef") } as any)?.id).toBe("chef");
  });

  it("⑤ 爪牙互认（minion_info）/ 恶魔互认（demon_info）只排给对应的邪恶座位", () => {
    // ⚠️ adapter 本身「给定座位就生成信息」，**不做排程校验**（见 `_tbHarness.ts:151`）。
    //    真正的门槛在**动态夜序生成器**：非爪牙座位不得被排入 minion_info 步骤。
    const chefSeats = buildSeats("chef");
    const chefQueue = queueFor(chefSeats, 0, 1);
    expect(
      chefQueue,
      "❌ 镇民座位被排进了爪牙互认步骤 minion_info"
    ).not.toContain("minion_info");
    expect(
      chefQueue,
      "❌ 镇民座位被排进了恶魔互认步骤 demon_info"
    ).not.toContain("demon_info");

    // 对照 1：真爪牙（间谍）在首夜必须被排入 minion_info
    const spyQueue = queueFor(board(["spy", "empath", "chambermaid", "gossip", "tinker", "soldier", "imp"]), 0, 1);
    expect(spyQueue, "❌ 间谍未被排入爪牙互认步骤").toContain("minion_info");

    // 对照 2：真恶魔（小恶魔）必须被排入 demon_info，而爪牙不得被排入
    const impQueue = queueFor(board(["imp", "empath", "chambermaid", "gossip", "tinker", "soldier", "baron"]), 0, 1);
    expect(impQueue, "❌ 小恶魔未被排入恶魔互认步骤").toContain("demon_info");
    expect(impQueue, "❌ 恶魔被误排入爪牙互认步骤").not.toContain("minion_info");
  });

  it("⑥ 身份告知牌翻开酒鬼座位：不得出现「酒鬼」三个字（玩家会看到）", () => {
    const seats = board(["drunk", "empath", "chambermaid", "gossip", "tinker"]);
    (seats[0] as any).charadeRole = r("empath");
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
    expect(t, "❌ 翻开后应显示酒鬼的伪装身份「共情者」").toContain("共情者");
    expect(
      t.includes("酒鬼"),
      `❌ 告知牌泄漏了酒鬼的真实身份（玩家可见）：${t.slice(0, 120)}`
    ).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  §C · 日间主动技能按钮（GameConsole「⚡️ 可用主动技能」）
// ══════════════════════════════════════════════════════════════════════════
describe("L3 · §C 日间主动技能按钮", () => {
  /** 已确认**无**日间能力的一批暗流涌动角色（用于隔离负向对照） */
  const NO_DAY = ["washerwoman", "chef", "empath", "monk", "soldier", "mayor"];

  function mountConsole(layout: string[]) {
    const seats = layout.map((rid, i) => hseat(i, rid));
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

  it("⑦ 猎手(slayer) 的日间开枪按钮必须出现（官方：每个游戏一次，白天公开选择）", () => {
    mountConsole(["slayer", "empath", "chambermaid", "gossip", "tinker", "soldier"]);
    const labels = dayBtnLabels();
    expect(
      labels.length,
      "❌ 猎手在白天必须出现「⚡️ 可用主动技能」按钮（官方：白天公开选择一名玩家开枪）"
    ).toBeGreaterThan(0);
    expect(bodyText(), "❌ 缺少面板标题").toContain("可用主动技能");
    expect(
      labels.some((l) => l.includes("猎手")),
      `❌ 日间按钮里没有猎手（实际：${JSON.stringify(labels)}）`
    ).toBe(true);
  });

  it("⑧ 负向对照：纯夜间角色布局不得出现任何日间技能按钮", () => {
    mountConsole(NO_DAY);
    const labels = dayBtnLabels();
    expect(
      labels.length,
      `❌ 纯夜间角色布局不应出现日间主动技能按钮（实际：${JSON.stringify(labels)}）`
    ).toBe(0);
    expect(bodyText(), "❌ 无日间技能时不应渲染面板标题").not.toContain("可用主动技能");
  });

  it("⑨ 已冻结偏差：贞洁者(virgin) 的处决是「被提名时触发」而非主动按钮", () => {
    mountConsole(["virgin", "empath", "chambermaid", "monk", "soldier", "mayor"]);
    const labels = dayBtnLabels();
    // 官方：贞洁者一旦被提名，提名者立即被处决 —— **不需要**玩家点按钮。
    // 本用例冻结「不应出现按钮」这一口径（若产品改成主动按钮请同步改本条）。
    expect(
      labels.some((l) => l.includes("贞洁者")),
      `ℹ️ 贞洁者不应有日间主动按钮（实际：${JSON.stringify(labels)}）`
    ).toBe(false);
    expect(
      labels.length,
      `❌ 贞洁者布局不应产生任何日间主动按钮（实际：${JSON.stringify(labels)}）`
    ).toBe(0);
    expect(
      bodyText(),
      "❌ 无日间技能时不应渲染「可用主动技能」面板"
    ).not.toContain("可用主动技能");
  });
});

// @vitest-environment jsdom
/**
 * L3 · 组件渲染层
 * ==================================================================
 * 剧本：**凶宅魅影（haunted_manor，21 角色）** + **无上愉悦（high_pleasure，16 角色）**
 * 覆盖：两剧本并集 **37 个唯一角色**（实测两剧本零重叠）
 * 日期：2026-09-21 ｜ 验收标准：`outputs/角色全层测试规范.md` §3 / §9
 *
 * ── 本层逐条回答规范 §3 的四个问题 ─────────────────────────────
 *   ① 夜间引导语形态正确（两种合法语义：`唤醒N号玩家` / `N号-角色获得信息`）
 *   ② 确认页 + 结果页**真实渲染**，且不泄漏内部状态字段
 *   ③ 夜间目标的**数量约束**与能力声明一致（含冻结偏差）
 *   ④ 有日间能力者：按钮出现在 GameConsole「⚡️ 可用主动技能」中
 *
 * ── 两条铁律（沿用罂粟花开 / 黯月初升 / 窃窃私语经验）──────────
 *   · `ModalWrapper` 走 `createPortal` ⇒ 断言读 `document.body`，不是 container
 *   · jsdom 缺 `ResizeObserver` ⇒ `beforeAll` 补桩
 *
 * ── 「文案不泄漏」的判据 ──────────────────────────────────────
 *   用**内部字段名白名单**而不是文案关键词：内部字段（`statusEffects` /
 *   `_abilityResults` / `isVortoxWorld` …）一旦出现在渲染文本里，说明 UI
 *   直接序列化了状态对象 —— 这才是真正的泄漏通道。
 *
 * ⚠️ **只加测试、不改生产**。发现偏差一律「冻结 + 报告」（见 §A 的
 *    `GUIDE_DEVIATION` / `TL_DEVIATION` 与交付报告）。
 *
 * ── 真值表来源 ────────────────────────────────────────────────
 *   `temp/probe_l3.ts` 实测 dump（`calculateNightInfoViaNewEngine` +
 *   `generateDynamicNightQueue` + `getRoleDefinition`），不是照抄声明。
 *   复现：`NODE_OPTIONS="" npx tsx temp/probe_l3.ts`
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";

import { roles, scripts } from "../../../../app/data";
import { getRoleDefinition } from "../../../roles";
import { NightActionConfirmModal } from "../../../components/modals/NightActionConfirmModal";
import { InfoResultModal } from "../../../components/modals/InfoResultModal";
import { IdentityShowcaseModal } from "../../../components/modals/IdentityShowcaseModal";
import { GameConsole } from "../../../components/game/console/GameConsole";
import { getCharadeDisplayRole, isCharadeMasked } from "../../../utils/charadeDisplay";
import { calculateNightInfoViaNewEngine } from "../../../utils/nightInfoAdapter";
import {
  getAbilityForRole,
  initializeAbilityRegistry,
} from "../../new_engine/abilityRegistry";
import { queueFor, seat as hseat } from "../_tbHarness";

const r = (id: string) => roles.find((x) => x.id === id)!;
const HM = scripts.find((s) => s.id === "haunted_manor")!;
const HP = scripts.find((s) => s.id === "high_pleasure")!;

/** 两剧本并集（`app/data.ts` 的 roleIds 顺序：镇民 → 外来者 → 爪牙 → 恶魔） */
const ROSTER = [
  // ── 凶宅魅影 21 ──
  "balloonist", "mathematician", "clockmaker", "seamstress", "juggler",
  "philosopher", "artist", "town_crier", "courtier", "choir_boy",
  "mutant", "barber", "fool", "saint", "witch", "godfather", "assassin",
  "devils_advocate", "no_dashii", "fang_gu", "pukka",
  // ── 无上愉悦 16 ──
  "washerwoman", "investigator", "chef", "librarian", "empath",
  "fortune_teller", "monk", "ravenkeeper", "butler", "drunk", "recluse",
  "poisoner", "scarlet_woman", "baron", "imp", "zombuul",
] as const;

/**
 * 引导语形态（实测口径）：
 *   std    「唤醒N号【角色名】，…」                —— 说书人唤醒语（带书名号）
 *   plain  「唤醒N号玩家（角色名）。」              —— 说书人唤醒语（带括注）
 *   passive「N号【角色】为被动技能，无需唤醒。」
 *   silent 空串（该夜无自己的步骤）
 *   desc   仅能力描述，**缺「唤醒N号」前缀**（冻结偏差）
 *   seed   该夜本身是系统步骤（爪牙/恶魔互认），引导语是互认内容
 */
type Guide = "std" | "plain" | "passive" | "silent" | "desc" | "seed";

interface Cell {
  guide: Guide;
  /** 队列里是否有「以该角色身份」入队的节点 */
  queued: boolean;
  /** 队列里是否有系统步骤节点 */
  seed?: "minion_info" | "demon_info";
  /** 该夜 info.targetLimit（null = adapter 未产出 targetLimit） */
  tl: [number, number] | null;
}

interface Row {
  script: "hm" | "hp";
  /** §A③ 用来与 `targetConfig` 比对的那一夜（= 该角色的主夜） */
  main: 1 | 2;
  n: { 1: Cell; 2: Cell };
}

const SPEC: Record<string, Row> = {
  // ══════════════════ 凶宅魅影 ══════════════════
  balloonist: {
    script: "hm", main: 1,
    n: {
      1: { guide: "plain", queued: true, tl: [0, 0] },
      2: { guide: "plain", queued: true, tl: [0, 0] },
    },
  },
  mathematician: {
    script: "hm", main: 1,
    n: {
      1: { guide: "std", queued: true, tl: [0, 0] },
      2: { guide: "std", queued: true, tl: [0, 0] },
    },
  },
  clockmaker: {
    script: "hm", main: 1,
    n: {
      1: { guide: "plain", queued: true, tl: [0, 0] },
      2: { guide: "silent", queued: false, tl: [0, 0] },
    },
  },
  seamstress: {
    script: "hm", main: 1,
    n: {
      1: { guide: "plain", queued: true, tl: [2, 2] },
      2: { guide: "plain", queued: true, tl: [2, 2] },
    },
  },
  juggler: {
    script: "hm", main: 2,
    n: {
      // 首个白天能力：首夜无步骤；次夜有引导语但**不入队**（adapter 不做排程校验）
      1: { guide: "silent", queued: false, tl: [0, 0] },
      2: { guide: "std", queued: false, tl: [0, 0] },
    },
  },
  philosopher: {
    script: "hm", main: 1,
    n: {
      1: { guide: "plain", queued: true, tl: [1, 1] },
      2: { guide: "plain", queued: true, tl: [1, 1] },
    },
  },
  artist: {
    script: "hm", main: 2,
    n: {
      1: { guide: "passive", queued: false, tl: [0, 0] },
      2: { guide: "passive", queued: false, tl: [0, 0] },
    },
  },
  town_crier: {
    script: "hm", main: 2,
    n: {
      1: { guide: "silent", queued: false, tl: [0, 0] },
      2: { guide: "std", queued: true, tl: [0, 0] },
    },
  },
  courtier: {
    script: "hm", main: 1,
    n: {
      1: { guide: "plain", queued: true, tl: [0, 1] },
      2: { guide: "plain", queued: true, tl: [0, 1] },
    },
  },
  choir_boy: {
    // ⚠️ 2026-09-21 修 P1-14：唱诗男孩是**「他人死亡触发」**（官方「如果恶魔杀死了国王」），
    //   现声明 `deathEventWatch: { roleId: "king" }` ⇒ **静态不入夜间队列**，
    //   只在国王死亡当晚由死亡事件分发器（`resolveDeathEventWakeups`）动态插入。
    script: "hm", main: 2,
    n: {
      1: { guide: "std", queued: false, tl: [0, 0] },
      2: { guide: "std", queued: false, tl: [0, 0] },
    },
  },
  mutant: {
    script: "hm", main: 2,
    n: {
      1: { guide: "passive", queued: false, tl: [0, 0] },
      2: { guide: "passive", queued: false, tl: [0, 0] },
    },
  },
  barber: {
    // ⚠️ 2026-09-21 修 P1-7：理发师是**死亡触发**（官方「如果你死亡…交换角色」），
    //   原真值表把「存活时也入队」记成了期望（queued: true）——那是缺陷行为。
    //   改为 ON_DEATH 后受 `deathTriggered` 门控，**存活时不再入队**。
    script: "hm", main: 2,
    n: {
      1: { guide: "std", queued: false, tl: [0, 0] },
      2: { guide: "std", queued: false, tl: [0, 0] },
    },
  },
  fool: {
    script: "hm", main: 2,
    n: {
      1: { guide: "passive", queued: false, tl: [0, 0] },
      2: { guide: "passive", queued: false, tl: [0, 0] },
    },
  },
  saint: {
    script: "hm", main: 1,
    n: {
      // 该剧本的圣徒是外来者：走 legacy checkGameEnd，adapter 连 targetLimit 都不产出
      1: { guide: "silent", queued: false, tl: null },
      2: { guide: "silent", queued: false, tl: null },
    },
  },
  witch: {
    script: "hm", main: 1,
    n: {
      1: { guide: "plain", queued: true, seed: "minion_info", tl: [1, 1] },
      2: { guide: "plain", queued: true, tl: [1, 1] },
    },
  },
  godfather: {
    script: "hm", main: 1,
    n: {
      1: { guide: "std", queued: true, seed: "minion_info", tl: [0, 0] },
      2: { guide: "std", queued: true, tl: [0, 0] },
    },
  },
  assassin: {
    script: "hm", main: 2,
    n: {
      // 首夜不行动（preCheckNotFirstNight），只被排入爪牙互认
      1: { guide: "silent", queued: false, seed: "minion_info", tl: [1, 1] },
      2: { guide: "plain", queued: true, tl: [1, 1] },
    },
  },
  devils_advocate: {
    script: "hm", main: 1,
    n: {
      1: { guide: "plain", queued: true, seed: "minion_info", tl: [1, 1] },
      2: { guide: "plain", queued: true, tl: [1, 1] },
    },
  },
  no_dashii: {
    script: "hm", main: 2,
    n: {
      1: { guide: "seed", queued: false, seed: "demon_info", tl: [0, 0] },
      2: { guide: "desc", queued: true, tl: [1, 1] },
    },
  },
  fang_gu: {
    script: "hm", main: 2,
    n: {
      1: { guide: "seed", queued: false, seed: "demon_info", tl: [0, 0] },
      2: { guide: "desc", queued: true, tl: [1, 1] },
    },
  },
  pukka: {
    script: "hm", main: 2,
    n: {
      1: { guide: "seed", queued: true, seed: "demon_info", tl: [0, 0] },
      2: { guide: "desc", queued: true, tl: [1, 1] },
    },
  },

  // ══════════════════ 无上愉悦 ══════════════════
  washerwoman: {
    script: "hp", main: 1,
    n: {
      1: { guide: "std", queued: true, tl: [0, 0] },
      2: { guide: "std", queued: false, tl: [0, 0] },
    },
  },
  investigator: {
    script: "hp", main: 1,
    n: {
      1: { guide: "std", queued: true, tl: [0, 0] },
      2: { guide: "std", queued: false, tl: [0, 0] },
    },
  },
  chef: {
    script: "hp", main: 1,
    n: {
      1: { guide: "std", queued: true, tl: [0, 0] },
      2: { guide: "std", queued: false, tl: [0, 0] },
    },
  },
  librarian: {
    script: "hp", main: 1,
    n: {
      1: { guide: "std", queued: true, tl: [0, 0] },
      2: { guide: "std", queued: false, tl: [0, 0] },
    },
  },
  empath: {
    script: "hp", main: 1,
    n: {
      1: { guide: "std", queued: true, tl: [0, 0] },
      2: { guide: "std", queued: true, tl: [0, 0] },
    },
  },
  fortune_teller: {
    script: "hp", main: 1,
    n: {
      1: { guide: "std", queued: true, tl: [2, 2] },
      2: { guide: "std", queued: true, tl: [2, 2] },
    },
  },
  monk: {
    script: "hp", main: 2,
    n: {
      // otherNightOnly：首夜有引导语但不入队
      1: { guide: "std", queued: false, tl: [1, 1] },
      2: { guide: "std", queued: true, tl: [1, 1] },
    },
  },
  ravenkeeper: {
    script: "hp", main: 2,
    n: {
      1: { guide: "silent", queued: false, tl: [0, 0] },
      2: { guide: "desc", queued: false, tl: [1, 1] },
    },
  },
  butler: {
    script: "hp", main: 1,
    n: {
      1: { guide: "std", queued: true, tl: [1, 1] },
      2: { guide: "std", queued: true, tl: [1, 1] },
    },
  },
  drunk: {
    script: "hp", main: 2,
    n: {
      1: { guide: "passive", queued: false, tl: [0, 0] },
      2: { guide: "passive", queued: false, tl: [0, 0] },
    },
  },
  recluse: {
    script: "hp", main: 1,
    n: {
      1: { guide: "silent", queued: false, tl: [0, 0] },
      2: { guide: "silent", queued: false, tl: [0, 0] },
    },
  },
  poisoner: {
    script: "hp", main: 1,
    n: {
      1: { guide: "std", queued: true, seed: "minion_info", tl: [1, 1] },
      2: { guide: "std", queued: true, tl: [1, 1] },
    },
  },
  scarlet_woman: {
    script: "hp", main: 2,
    n: {
      1: { guide: "passive", queued: false, seed: "minion_info", tl: [0, 0] },
      2: { guide: "passive", queued: false, tl: [0, 0] },
    },
  },
  baron: {
    script: "hp", main: 2,
    n: {
      1: { guide: "passive", queued: false, seed: "minion_info", tl: [0, 0] },
      2: { guide: "passive", queued: false, tl: [0, 0] },
    },
  },
  imp: {
    script: "hp", main: 2,
    n: {
      1: { guide: "seed", queued: false, seed: "demon_info", tl: [0, 0] },
      2: { guide: "std", queued: true, tl: [1, 1] },
    },
  },
  zombuul: {
    script: "hp", main: 2,
    n: {
      1: { guide: "seed", queued: false, seed: "demon_info", tl: [0, 0] },
      2: { guide: "desc", queued: true, tl: [0, 1] },
    },
  },
};

/**
 * ⚠️ **冻结偏差 1**：引导语只有能力描述、缺「唤醒N号」座位号。
 * 实测值（不是期望值）—— 冻结它们是为了让「哪天修好了」立刻变红。
 * 修好后请把对应 `Cell.guide` 改成 `std`/`plain` 并删掉本表条目。
 */
const GUIDE_DEVIATION: Record<string, string> = {
  "no_dashii/2": "引导语「⚔️ 选择一名玩家：他死亡…」缺「唤醒1号【诺-达鲺】」前缀",
  "fang_gu/2": "引导语「⚔️ 选择一名玩家…」缺「唤醒1号【方古】」前缀",
  "pukka/2": "引导语「☠️ 每个夜晚，你要选择一名玩家…」缺唤醒前缀",
  zombuul: "引导语「⚰️ 每个夜晚*…」缺唤醒前缀",
  "ravenkeeper/2": "引导语「守鸦人，请睁眼。请选择一名玩家查看角色」缺唤醒前缀",
};

/** GK：把内部字段名当泄漏探针 */
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

/**
 * ⚠️ **冻结偏差 2**：夜间节点的目标数与能力声明（`targetConfig`）不一致。
 * 全部为实测值，理由写在每条的注释里。**修好后请把条目删掉**，让断言回归 `targetConfig`。
 */
const TL_DEVIATION: Record<string, { min: number; max: number; why: string }> = {
  assassin: {
    min: 1, max: 1,
    why: "节点 1~1，但 targetConfig.min=0（把「可以不下手」当成了合法选择）⇒ P2",
  },
  balloonist: {
    min: 0, max: 0,
    why: "节点 0~0（说书人展示），targetConfig 却是 0~1（用 targetConfig 承载「展示哪一名」）⇒ P2",
  },
  philosopher: {
    min: 1, max: 1,
    why: "节点 1~1（夜间选一个角色以获得其能力），targetConfig 却是 0~0 ⇒ P2",
  },
  godfather: {
    min: 0, max: 0,
    why: "被动（外来者死亡时才击杀），节点 0~0；targetConfig 1~1 描述的是「死亡结算时选谁」⇒ 两个阶段课税面不同",
  },
  choir_boy: {
    min: 0, max: 0,
    why: "条件触发（恶魔杀死国王），节点 0~0；targetConfig 0~1 供说书人指定恶魔座位 ⇒ 语义不同",
  },
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

/**
 * 7 人局填充位：必须全部**无日间能力**，否则会污染 §C 的按钮计数。
 * （实测：`getRoleDefinition(id).day` 对以下 6 个角色均为 null）
 */
const NIGHT_FILLER = ["chef", "empath", "poisoner", "imp", "butler", "recluse"];

function buildSeats(roleId: string): any[] {
  const seats = [hseat(0, roleId)];
  NIGHT_FILLER.filter((f) => f !== roleId).forEach((rid, i) =>
    seats.push(hseat(i + 1, rid))
  );
  return seats;
}

const scriptOf = (id: string) => (SPEC[id].script === "hm" ? HM : HP);

/** 与生产 UI 同一条 adapter 路径取夜间信息 */
function engineInfo(roleId: string, night: number, seats?: any[]) {
  const s = seats ?? buildSeats(roleId);
  return calculateNightInfoViaNewEngine(
    scriptOf(roleId) as any,
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
  ) as any;
}

// ══════════════════════════════════════════════════════════════════════════
//  §A · 37 角色：引导语形态 + 队列 + 弹窗渲染 + 目标约束
// ══════════════════════════════════════════════════════════════════════════
describe("L3 · 凶宅魅影 + 无上愉悦 · §A 角色夜间引导语与弹窗渲染", () => {
  it("0) 清单自洽：37 个唯一角色、与两剧本 roleIds 并集一致、两剧本零重叠", () => {
    expect(ROSTER.length, "应为 37 个唯一角色").toBe(37);
    expect(new Set(ROSTER).size, "ROSTER 有重复").toBe(37);
    expect([...ROSTER].sort()).toEqual(
      [...new Set([...(HM.roleIds ?? []), ...(HP.roleIds ?? [])])].sort()
    );
    const hmSet = new Set(HM.roleIds ?? []);
    const hpSet = new Set(HP.roleIds ?? []);
    const both = ROSTER.filter((id) => hmSet.has(id) && hpSet.has(id));
    expect(both, `两剧本不应有重叠角色（实际 ${JSON.stringify(both)}）`).toEqual([]);
    // 剧本归属：SPEC.script 必须与 app/data 一致
    for (const id of ROSTER) {
      const want = SPEC[id].script;
      expect(
        want === "hm" ? hmSet.has(id) : hpSet.has(id),
        `❌ ${id} 的 SPEC.script=${want} 与 app/data 归属不符`
      ).toBe(true);
    }
    expect(Object.keys(SPEC).sort()).toEqual([...ROSTER].sort());
  });

  describe.each(ROSTER.map((id) => [id] as const))("L3 · %s", (roleId) => {
    const row = () => SPEC[roleId];
    const name = () => r(roleId).name;

    it("① 引导语形态 + 队列排程符合真值表（N1 / N2 两夜）", () => {
      const seats = buildSeats(roleId);
      for (const night of [1, 2] as const) {
        const cell = row().n[night];
        const info = engineInfo(roleId, night, seats);
        const guide = String(info?.guide ?? "");
        const queue = queueFor(seats, 0, night);
        const devKey = `${roleId}/${night}`;
        const dev = GUIDE_DEVIATION[devKey] ?? (night === 2 ? GUIDE_DEVIATION[roleId] : undefined);

        // ①-1 形态
        if (cell.guide === "silent") {
          expect(
            guide,
            `❌ ${roleId} 第${night}夜无自己的步骤却产出了引导语：${guide.slice(0, 60)}`
          ).toBe("");
        } else {
          expect(
            guide.length,
            `❌ ${roleId} 第${night}夜引导语为空 —— 弹窗会白屏`
          ).toBeGreaterThan(0);
          if (cell.guide === "passive") {
            expect(
              guide,
              `❌ ${roleId} 第${night}夜为被动角色，引导语应告知「被动技能，无需唤醒」`
            ).toContain("被动技能，无需唤醒");
            expect(guide, `❌ ${roleId} 被动引导语应含角色中文名`).toContain(name());
          } else if (cell.guide === "plain") {
            expect(
              /唤醒\s*1\s*号玩家/.test(guide),
              `❌ ${roleId} 第${night}夜引导语缺「唤醒1号玩家」前缀：${guide.slice(0, 60)}`
            ).toBe(true);
            expect(
              guide.includes(name()),
              `❌ ${roleId} 第${night}夜引导语未包含角色中文名「${name()}」`
            ).toBe(true);
          } else if (cell.guide === "std") {
            expect(
              /唤醒\s*1\s*号/.test(guide),
              `❌ ${roleId} 第${night}夜引导语缺「唤醒1号」前缀：${guide.slice(0, 60)}`
            ).toBe(true);
            expect(
              guide.includes(name()),
              `❌ ${roleId} 第${night}夜引导语未包含角色中文名「${name()}」`
            ).toBe(true);
          } else if (cell.guide === "seed") {
            // 系统步骤：引导语是互认内容本身，必须真的说明爪牙/恶魔信息
            expect(
              /爪牙|恶魔/.test(guide),
              `❌ ${roleId} 第${night}夜的互认引导语不含「爪牙/恶魔」：${guide.slice(0, 60)}`
            ).toBe(true);
          } else {
            // desc（冻结偏差）：只有能力描述
            expect(
              dev,
              `❌ ${roleId} 第${night}夜被标为 desc 但未登记 GUIDE_DEVIATION`
            ).toBeTruthy();
            expect(
              /唤醒\s*1\s*号/.test(guide),
              `ℹ️ ${roleId} 第${night}夜已补上唤醒前缀 —— 请改成 std 并删除 GUIDE_DEVIATION`
            ).toBe(false);
            expect(
              /选择|每个夜晚|请睁眼/.test(guide),
              `❌ ${roleId} 第${night}夜引导语既无唤醒语也不像能力描述：${guide.slice(0, 60)}`
            ).toBe(true);
          }
        }

        // ①-2 队列排程必须与真值表一致
        if (cell.queued) {
          expect(
            queue,
            `❌ ${roleId} 应被排进第${night}夜队列，实际 ${JSON.stringify(queue)}`
          ).toContain(roleId);
        } else {
          expect(
            queue,
            `❌ ${roleId} 声明不入队却被排进第${night}夜队列（条件/夜序门控未生效？）`
          ).not.toContain(roleId);
        }
        // ①-3 系统步骤（互认）节点
        if (cell.seed) {
          expect(
            queue,
            `❌ ${roleId} 第${night}夜应被排入系统步骤 ${cell.seed}，实际 ${JSON.stringify(queue)}`
          ).toContain(cell.seed);
        }
      }
    });

    it("② 确认页 + 结果页真实渲染，且不泄漏内部状态字段", () => {
      const seats = buildSeats(roleId);
      const night = row().n[row().main].guide === "silent" ? row().main : row().main;
      const info = engineInfo(roleId, night, seats);
      const guide = String(info?.guide ?? "");
      const roleName = `1号-${name()}`;

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
      expect(t1, `❌ ${roleId} 确认页应含角色名`).toContain(name());
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
      expect(t2, `❌ ${roleId} 结果页应含角色名`).toContain(name());

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

    it("③ 夜间目标数量约束与能力声明一致（偏差走 TL_DEVIATION）", () => {
      const cell = row().n[row().main];
      const info = engineInfo(roleId, row().main);
      const ability: any = getAbilityForRole(roleId);
      const tc = ability?.targetConfig;
      const dev = TL_DEVIATION[roleId];

      expect(ability, `❌ 找不到 ${roleId} 的能力声明`).toBeTruthy();

      if (cell.tl === null) {
        // adapter 完全不产出 targetLimit（如圣徒走 legacy checkGameEnd）
        expect(
          info?.targetLimit,
          `❌ ${roleId} 本应无 targetLimit，实际 ${JSON.stringify(info?.targetLimit)}`
        ).toBeUndefined();
        expect(
          tc,
          `❌ ${roleId} 无夜间步骤却声明了目标数`
        ).toBeTruthy();
        expect(tc.min, `❌ ${roleId} 无夜间步骤，targetConfig.min 应为 0`).toBe(0);
        expect(tc.max, `❌ ${roleId} 无夜间步骤，targetConfig.max 应为 0`).toBe(0);
        return;
      }

      const actual = {
        min: info?.targetLimit?.min ?? 0,
        max: info?.targetLimit?.max ?? 0,
      };
      expect(
        actual,
        dev
          ? `ℹ️ ${roleId} 夜间目标数偏离声明（已冻结偏差 ${JSON.stringify(dev)}）`
          : `❌ ${roleId} 夜间目标约束 ${actual.min}~${actual.max} 与能力声明 ${tc?.min}~${tc?.max} 不一致`
      ).toEqual(dev ? { min: dev.min, max: dev.max } : { min: tc?.min ?? 0, max: tc?.max ?? 0 });
      // 结构性自洽
      expect(actual.max, `❌ ${roleId} 目标上限小于下限`).toBeGreaterThanOrEqual(actual.min);
      expect(actual.max, `❌ ${roleId} 目标上限异常（>5）`).toBeLessThanOrEqual(5);
      expect(
        cell.tl,
        `❌ ${roleId} 真值表登记的目标数与实测不符`
      ).toEqual([actual.min, actual.max]);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  §B · 敏感信息：展示口径与互认信息不得泄漏
// ══════════════════════════════════════════════════════════════════════════
describe("L3 · §B 敏感信息不得泄漏（不得从 seats 反推）", () => {
  it("④ 酒鬼（无上愉悦的伪装外来者）展示口径 = 伪装镇民，绝不等于「酒鬼」", () => {
    const drunkSeat: any = {
      id: 0,
      playerName: "P1",
      role: r("drunk"),
      charadeRole: r("empath"),
      displayRole: r("chef"), // 分叉缓存：故意与权威字段不同
      isDead: false,
      statusEffects: [{ type: "drunk", permanent: true }],
    };

    const shown: any = getCharadeDisplayRole(drunkSeat);
    expect(shown?.id, "❌ 酒鬼展示口径被缓存字段 displayRole 抢走了").toBe("empath");
    expect(shown?.name, "❌ 酒鬼应展示为伪装身份").toBe(r("empath").name);
    expect(shown?.id, "❌ 展示口径泄漏了真实身份「酒鬼」").not.toBe("drunk");
    expect(isCharadeMasked(drunkSeat), "❌ 伪装遮罩未生效").toBe(true);
    // 无 charadeRole 时应兜底展示 role（不得崩）
    expect(getCharadeDisplayRole({ role: r("recluse") } as any)?.id).toBe("recluse");
  });

  it("⑤ 身份告知牌翻开酒鬼座位：不得出现「酒鬼」三个字（玩家会看到）", () => {
    const seats = buildSeats("drunk");
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
    expect(t, "❌ 翻开后应显示酒鬼的伪装身份「共情者」").toContain(r("empath").name);
    expect(
      t.includes("酒鬼"),
      `❌ 告知牌泄漏了酒鬼的真实身份（玩家可见）：${t.slice(0, 120)}`
    ).toBe(false);
  });

  it("⑥ 爪牙互认（minion_info）/ 恶魔互认（demon_info）只排给对应的邪恶座位", () => {
    // ⚠️ adapter 本身「给定座位就生成信息」**不做排程校验**；真正的门槛在动态夜序生成器。
    const goodQueue = queueFor(buildSeats("empath"), 0, 1); // 0 号是镇民
    expect(goodQueue, "❌ 镇民座位被排进了爪牙互认步骤 minion_info").not.toContain("minion_info");
    expect(goodQueue, "❌ 镇民座位被排进了恶魔互认步骤 demon_info").not.toContain("demon_info");

    // 对照 1：真爪牙（投毒者）首夜必须入 minion_info，且不得拿到 demon_info
    const minionQueue = queueFor(buildSeats("poisoner"), 0, 1);
    expect(minionQueue, "❌ 投毒者未被排入爪牙互认步骤").toContain("minion_info");
    expect(minionQueue, "❌ 爪牙被误排入恶魔互认步骤").not.toContain("demon_info");

    // 对照 2：真恶魔（小恶魔）必须入 demon_info，且不得拿到 minion_info
    const demonQueue = queueFor(buildSeats("imp"), 0, 1);
    expect(demonQueue, "❌ 小恶魔未被排入恶魔互认步骤").toContain("demon_info");
    expect(demonQueue, "❌ 恶魔被误排入爪牙互认步骤").not.toContain("minion_info");

    // 对照 3：恶魔互认的**正文**不得出现在镇民座位的引导语里（否则等于把爪牙名单给了好人）
    const goodGuide = String(engineInfo("empath", 1)?.guide ?? "");
    expect(goodGuide, `❌ 镇民引导语泄漏了恶魔互认内容：${goodGuide.slice(0, 80)}`).not.toContain("爪牙是");
    const demonGuide = String(engineInfo("imp", 1)?.guide ?? "");
    expect(demonGuide, "❌ 恶魔互认引导语应含「爪牙是」").toContain("爪牙是");
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  §C · 日间主动技能按钮（GameConsole「⚡️ 可用主动技能」）
// ══════════════════════════════════════════════════════════════════════════
describe("L3 · §C 日间主动技能按钮", () => {
  /** 官方日间能力角色 → 按钮文案（`mutant` 走独立仲裁弹窗，文案是「疯狂仲裁」） */
  const DAY_ROLES: Array<[string, string]> = [
    ["philosopher", `使用 ${r("philosopher").name}`],
    ["artist", `使用 ${r("artist").name}`],
    ["juggler", `使用 ${r("juggler").name}`],
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
    return [roleId, ...NIGHT_FILLER.filter((f) => f !== roleId)].slice(0, 7);
  }

  describe.each(DAY_ROLES)("§C %s", (roleId, label) => {
    it("⑦ 官方日间能力 → 必须出现自己的「可用主动技能」按钮（且只有它一个）", () => {
      mountConsole(layoutFor(roleId));
      const labels = dayBtnLabels();
      expect(bodyText(), "❌ 缺少面板标题").toContain("可用主动技能");
      expect(
        labels,
        `❌ ${roleId} 的日间按钮未出现（实际：${JSON.stringify(labels)}）`
      ).toContain(label);
      expect(
        labels.length,
        `❌ ${roleId} 布局出现了额外按钮（填充位选错？实际：${JSON.stringify(labels)}）`
      ).toBe(1);
    });
  });

  it("⑧ 穷尽性：37 角色中**只有** philosopher / artist / juggler / mutant 有日间按钮", () => {
    const WITH_DAY = new Set(["philosopher", "artist", "juggler", "mutant"]);
    const seen: Array<[string, number]> = [];
    for (const id of ROSTER) {
      cleanup();
      mountConsole(layoutFor(id));
      seen.push([id, dayBtnLabels().length]);
    }
    const unexpected = seen.filter(([id, n]) => n > 0 && !WITH_DAY.has(id));
    const missing = [...WITH_DAY].filter(
      (id) => !(seen.find(([x]) => x === id)?.[1] ?? 0)
    );
    expect(
      unexpected,
      `❌ 出现了未预期的日间按钮角色：${JSON.stringify(unexpected)}`
    ).toEqual([]);
    expect(missing, `❌ 应出现日间按钮却缺失：${JSON.stringify(missing)}`).toEqual([]);
    expect(seen.length, "❌ 穷尽性检查未覆盖 37 个角色").toBe(37);
    // 每个非日间角色的按钮数必须恰好为 0（防「多一个按钮」型回归）
    const badCount = seen.filter(([id, n]) => n !== (WITH_DAY.has(id) ? 1 : 0));
    expect(badCount, `❌ 按钮数异常：${JSON.stringify(badCount)}`).toEqual([]);
  });

  it("⑨ 负向对照：纯夜间角色布局不得出现任何日间技能按钮", () => {
    mountConsole(NIGHT_FILLER.slice(0, 6));
    const labels = dayBtnLabels();
    expect(
      labels.length,
      `❌ 纯夜间角色布局不应出现日间主动技能按钮（实际：${JSON.stringify(labels)}）`
    ).toBe(0);
    expect(bodyText(), "❌ 无日间技能时不应渲染面板标题").not.toContain("可用主动技能");
  });
});

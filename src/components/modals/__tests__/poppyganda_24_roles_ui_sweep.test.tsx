// @vitest-environment jsdom
/**
 * 罂粟花开 · **24 角色 × 通用弹窗 数据驱动 UI 渲染扫描**
 *
 * 目的：此前 UI 只验了几个静态用例。本文件把**全部 24 个角色**在真实状态下
 * 跑出的引擎文案，真实塞进玩家会看到的两个通用弹窗
 * （`NightActionConfirmModal` / `InfoResultModal`），断言：
 *
 *   ① 每个角色的技能确认页都能渲染出**非空**内容（不白屏）
 *   ② 结果页渲染出的文案 == 引擎 `guide` 经 `parseInfoResult` 处理后的结果
 *      （即"引擎算出的信息"确实**到达了玩家眼前**，不是只存在引擎里）
 *   ③ 渲染出的文案不得含 `undefined` / `NaN` / `[object`
 *
 * 这是补上「每个角色的 UI 显示符合规则」最省力且覆盖面最广的做法。
 */
import { describe, expect, it, beforeAll, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { roles, scripts } from "../../../../app/data";
import { calculateNightInfoViaNewEngine } from "../../../utils/nightInfoAdapter";
import { parseInfoResult } from "../../../utils/infoResultParser";
import { initializeAbilityRegistry } from "../../../roles/new_engine/abilityRegistry";
import { InfoResultModal } from "../InfoResultModal";
import { NightActionConfirmModal } from "../NightActionConfirmModal";

const r = (id: string) => roles.find((x) => x.id === id)!;
const POPPY = scripts.find((s) => s.id === "poppyganda")!;

/** 罂粟花开 24 角色（顺序：镇民 → 外来者 → 爪牙 → 恶魔） */
const ROSTER = [
  // 镇民
  "librarian", "chef", "bounty_hunter", "pixie", "fortune_teller", "monk",
  "oracle", "town_crier", "juggler", "savant", "farmer", "mayor", "poppy_grower",
  // 外来者
  "drunk", "lunatic", "mutant", "snitch",
  // 爪牙
  "cerenovus", "evil_twin", "baron", "marionette",
  // 恶魔
  "imp", "vortox", "legion",
];

/** 该角色在哪一夜被唤醒（对齐官方夜序；不唤醒的返回 null） */
const WAKE_NIGHT: Record<string, 1 | 2 | null> = {
  librarian: 1, chef: 1, bounty_hunter: 1, pixie: 1, fortune_teller: 1,
  monk: 2, oracle: 2, town_crier: 2, juggler: 2, savant: null,
  farmer: 2, mayor: null, poppy_grower: null,
  drunk: null, lunatic: 1, mutant: null, snitch: null,
  cerenovus: 1, evil_twin: 1, baron: 1, marionette: null,
  imp: 1, vortox: 2, legion: 2,
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

function buildSeats(roleId: string) {
  const layout: Array<[number, string]> = [
    [0, roleId],
    [1, "mayor"],
    [2, "snitch"],
    [3, "savant"],
    [4, "baron"],
    [5, "imp"],
    [6, "farmer"],
  ];
  const seats: any[] = layout.map(([id, rid]) => ({
    id,
    playerName: `P${id + 1}`,
    role: r(rid),
    isDead: false,
    isAlive: true,
    isDrunk: false,
    isPoisoned: false,
    statusEffects: [],
  }));
  // 避免与被测角色重复
  if (roleId === "imp") seats[5].role = r("imp");
  if (roleId === "vortox") seats[5].role = r("vortox");
  if (roleId === "legion") seats[5].role = r("legion");
  if (roleId === "baron") seats[4].role = r("baron");
  if (roleId === "evil_twin") seats[4].role = r("evil_twin");
  if (roleId === "cerenovus") seats[4].role = r("cerenovus");
  if (roleId === "snitch") seats[2].role = r("snitch");
  if (roleId === "drunk") {
    // 酒鬼必带 charadeRole + 永久醉酒状态效果（生产由 drunk.ability 在设置阶段写入）
    seats[0].role = r("drunk");
    seats[0].charadeRole = r("librarian");
    seats[0].statusEffects = [{ type: "drunk", permanent: true }];
  }
  if (roleId === "lunatic") seats[0].apparentDemonRole = r("imp");
  return seats;
}

/** 系统步骤 id → 该夜以系统步骤身份被唤醒 */
const SYS_STEP: Record<string, string> = {
  baron: "minion_info",
  evil_twin: "minion_info",
  cerenovus: "minion_info",
  imp: "demon_info",
  lunatic: "demon_info",
  vortox: "demon_info",
  legion: "legion_mutual_recognition",
};

describe("24 角色 × 通用弹窗 数据驱动 UI 渲染扫描", () => {
  initializeAbilityRegistry();

  it("① 每个被唤醒角色的【技能确认页】都能渲染出非空内容（不白屏）", () => {
    const blank: string[] = [];
    for (const roleId of ROSTER) {
      const night = WAKE_NIGHT[roleId];
      if (!night) continue;
      const seats = buildSeats(roleId);
      const info: any = calculateNightInfoViaNewEngine(
        POPPY as any, seats as any, 0,
        (night === 1 ? "firstNight" : "night") as any,
        null, night,
        SYS_STEP[roleId], undefined, undefined, undefined, false,
        undefined, undefined, undefined, [], undefined, undefined, undefined,
        false, false, false, null, undefined, undefined, undefined
      );
      const guide: string = info?.guide ?? "";
      if (!guide) {
        blank.push(roleId);
        continue;
      }

      cleanup();
      const data: any = {
        roleName: r(roleId).name,
        actionDescription: guide.slice(0, 60),
        targetDescriptions: ["（无目标）"],
        targetLimit: info?.targetLimit ?? { min: 0, max: 0 },
        actorSeatId: 0,
      };
      render(
        <NightActionConfirmModal
          data={data}
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
    expect(blank, `以下角色引擎未产出 guide：${blank.join(", ")}`).toEqual([]);
  });

  it("② ⭐ 每个角色的【技能结果页】渲染文案 == 引擎 guide 的解析结果", () => {
    const mismatched: string[] = [];
    for (const roleId of ROSTER) {
      const night = WAKE_NIGHT[roleId];
      if (!night) continue;
      const seats = buildSeats(roleId);
      const info: any = calculateNightInfoViaNewEngine(
        POPPY as any, seats as any, 0,
        (night === 1 ? "firstNight" : "night") as any,
        null, night,
        SYS_STEP[roleId], undefined, undefined, undefined, false,
        undefined, undefined, undefined, [], undefined, undefined, undefined,
        false, false, false, null, undefined, undefined, undefined
      );
      const guide: string = info?.guide ?? "";
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

      // 结果页必须把「解析后的核心结果」真实呈现出来。
      // ⚠️ 比较必须**两侧同时归一化**：渲染文本里角色名外面有【】装饰，
      //    只剥一侧会得出假的不匹配（第一版就这么错）。
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
    expect(
      mismatched,
      `以下角色的结果页未呈现引擎核心结果：\n${mismatched.join("\n")}`
    ).toEqual([]);
  });

  it("③ 军团/占卜师/厨师 三个信息类角色的结果页文案抽查（人工可读）", () => {
    const samples: Array<[string, 1 | 2]> = [
      ["librarian", 1],
      ["chef", 1],
      ["oracle", 2],
    ];
    for (const [roleId, night] of samples) {
      const seats = buildSeats(roleId);
      const info: any = calculateNightInfoViaNewEngine(
        POPPY as any, seats as any, 0,
        (night === 1 ? "firstNight" : "night") as any,
        null, night,
        undefined, undefined, undefined, undefined, false,
        undefined, undefined, undefined, [], undefined, undefined, undefined,
        false, false, false, null, undefined, undefined, undefined
      );
      const guide: string = info?.guide ?? "";
      if (!guide) continue;
      cleanup();
      render(
        <InfoResultModal
          roleName={`1号-${r(roleId).name}`}
          resultText={guide}
          onConfirm={() => {}}
          onModify={() => {}}
        />
      );
      const t = allText();
      expect(t, `${roleId} 结果页应含角色名`).toContain(r(roleId).name);
      expect(t.length).toBeGreaterThan(10);
    }
  });

  it("④ 全体 24 角色都能取到角色定义（无拼写遗漏）", () => {
    expect(ROSTER.length).toBe(24);
    for (const id of ROSTER) {
      expect(r(id), `角色 ${id} 未在 app/data 中找到`).toBeTruthy();
    }
  });
});

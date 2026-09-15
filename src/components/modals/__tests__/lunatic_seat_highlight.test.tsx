// @vitest-environment jsdom
/**
 * 🌀 真恶魔夜间确认页 · 「疯子目标」座位高亮 回归
 *
 * 用户实测（2026-09-14，附图）：
 *   「真恶魔的"疯子"提示不够明显，可以直接把疯子选择的座位色块改为
 *     紫色描边+紫色色块，在座位号上以疯子图标+文字标注"疯子目标"」
 *
 * 旧实现：`lunaticHint` 只是选人网格**下方**一行紫色文字
 * （`NightActionConfirmModal.tsx` 原 615-619 行），
 * 真恶魔要先在网格里数座位号再回头看文案，非常不直观。
 *
 * 新实现：
 *   ① `getLunaticTargetSeatIds()` 把疯子选中的座位 ID 结构化传给弹窗；
 *   ② 弹窗在选人网格里给这些座位：紫色描边（border-fuchsia-400）
 *      + 紫色色块（bg-fuchsia-700/80）+ 座位号上「🌀 疯子目标」角标；
 *   ③ 非疯子目标座位**必须保持原有配色**（蓝/灰/深灰），不得被染紫。
 *
 * 本文件钉死（全部走**真实组件渲染**，不重写逻辑）：
 *   ① 疯子选中的座位卡片存在，且带紫色类 + 角标文字「疯子目标」；
 *   ② 未选中的座位卡片**不带**紫色类、不带角标；
 *   ③ 座位号仍正确显示（3号 / 5号）；
 *   ④ `lunaticTargetIds` 缺省 / 空数组时**零高亮**（不误伤普通恶魔页）；
 *   ⑤ 源码级护栏：高亮数据**必须**来自 `data.lunaticTargetIds`，
 *      不得由弹窗自己从 `seats` 反推（防止在玩家页误渲染真恶魔专属信息）。
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Seat } from "../../../../app/data";
import {
  NightActionConfirmModal,
  type NightActionConfirmData,
} from "../NightActionConfirmModal";

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

if (!(globalThis as any).window.matchMedia) {
  (globalThis as any).window.matchMedia = () => ({
    matches: false,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    },
  });
}

/** 造 5 个在场座位（0~4 号），全部存活。 */
function mkSeats(): Seat[] {
  return [0, 1, 2, 3, 4].map(
    (id) =>
      ({
        id,
        playerName: `玩家${id + 1}`,
        role: { id: "chef", name: "厨师", type: "townsfolk" },
        charadeRole: null,
        isDead: false,
        isDrunk: false,
        isPoisoned: false,
      }) as unknown as Seat
  );
}

function mkData(
  overrides?: Partial<NightActionConfirmData>
): NightActionConfirmData {
  return {
    roleName: "1号-小恶魔",
    roleId: "imp",
    actionDescription: "选择一名玩家击杀",
    targetLimit: { min: 1, max: 1 },
    // 行动者 = 1号（座位 0）；疯子目标 = 3号/5号（座位 2/4），互不重叠
    actorSeatId: 0,
    allowSelf: false,
    aliveOnly: false,
    lunaticHint: "🌀 疯子本夜选择了 3号玩家、5号玩家",
    lunaticTargetIds: [2, 4],
    onConfirm: () => {},
    onCancel: () => {},
    ...overrides,
  };
}

function renderModal(
  data: NightActionConfirmData,
  seats: Seat[] = mkSeats()
) {
  return render(
    <NightActionConfirmModal
      data={data}
      seats={seats}
      onConfirm={() => {}}
      onCancel={() => {}}
    />
  );
}

/** 找出「N号」座位卡片按钮。
 *  注意：疯子目标卡片的角标是卡片内**第一个** span，因此 textContent 不再以「N号」开头
 *  —— 必须按「卡片内存在等于 `N号` 的独立 span」来匹配。 */
function seatButtons(): HTMLButtonElement[] {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>("button")
  ).filter((b) =>
    Array.from(b.querySelectorAll("span")).some((s) =>
      /^\d+号$/.test((s.textContent || "").trim())
    )
  );
}

function seatButtonFor(label: string): HTMLButtonElement {
  const btn = seatButtons().find((b) =>
    Array.from(b.querySelectorAll("span")).some(
      (s) => (s.textContent || "").trim() === label
    )
  );
  if (!btn) throw new Error(`未找到座位卡片：${label}`);
  return btn;
}

describe("🌀 真恶魔夜间确认页 · 疯子目标座位高亮", () => {
  it("⭐ 疯子选中的座位（3号 / 5号）带紫色描边 + 紫色色块 + 角标「疯子目标」", () => {
    renderModal(mkData());

    for (const label of ["3号", "5号"]) {
      const btn = seatButtonFor(label);
      expect(btn.className).toContain("border-fuchsia-400");
      expect(btn.className).toContain("bg-fuchsia-700/80");
      expect(btn.className).toContain("ring-fuchsia-400/70");
      expect(btn.getAttribute("data-lunatic-target")).toBe("true");
      expect(btn.textContent).toContain("🌀 疯子目标");
    }
  });

  it("⭐ 未选中的座位（1号 / 2号 / 4号）保持原配色，绝不染紫", () => {
    renderModal(mkData());

    for (const label of ["1号", "2号", "4号"]) {
      const btn = seatButtonFor(label);
      expect(btn.className).not.toContain("fuchsia");
      expect(btn.textContent).not.toContain("疯子目标");
      expect(btn.getAttribute("data-lunatic-target")).toBeNull();
    }
  });

  it("座位号仍正确渲染（高亮不吞座位号）", () => {
    renderModal(mkData());
    const t = document.body.textContent || "";
    expect(t).toContain("3号");
    expect(t).toContain("5号");
  });

  it("角标文字落在**座位号所在卡片内**（不是网格外的独立文案）", () => {
    renderModal(mkData());
    const btn = seatButtonFor("5号");
    // 角标必须是卡片的后代节点
    const badge = Array.from(btn.querySelectorAll("span")).find((s) =>
      (s.textContent || "").includes("疯子目标")
    );
    expect(badge).toBeTruthy();
    expect(btn.contains(badge!)).toBe(true);
  });

  it("lunaticTargetIds 缺省 / 空数组 → 零高亮（普通恶魔页不受影响）", () => {
    renderModal(
      mkData({ lunaticHint: undefined, lunaticTargetIds: undefined })
    );
    for (const btn of seatButtons()) {
      expect(btn.className).not.toContain("fuchsia");
      expect(btn.textContent).not.toContain("疯子目标");
    }
    expect((document.body.textContent || "")).not.toContain("疯子目标");

    cleanup();
    renderModal(mkData({ lunaticHint: undefined, lunaticTargetIds: [] }));
    for (const btn of seatButtons()) {
      expect(btn.className).not.toContain("fuchsia");
    }
  });

  it("紫色高亮**优先于**「(自己)」角标（自己同时是疯子目标时仍显示疯子标记）", () => {
    // actorSeatId=2（3号）+ allowSelf=true：3号既是自己又是疯子目标
    renderModal(mkData({ actorSeatId: 2, allowSelf: true }));
    const btn = seatButtonFor("3号");
    expect(btn.className).toContain("border-fuchsia-400");
    expect(btn.textContent).toContain("疯子目标");
    expect(btn.textContent).toContain("(疯子选中)");
  });

  it("紫色高亮**不影响**点选交互（仍可点击选中）", () => {
    renderModal(mkData());
    const btn = seatButtonFor("3号");
    expect(btn.disabled).toBe(false);
  });
});

describe("🛡️ 源码级护栏（防真恶魔专属信息泄漏到玩家页）", () => {
  const SRC = readFileSync(
    resolve(__dirname, "../NightActionConfirmModal.tsx"),
    "utf-8"
  );
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("⭐ 高亮数据来源必须是 data.lunaticTargetIds，不得从 seats 反推疯子", () => {
    // 弹窗内不得直接读 lunaticTargetIds / lunaticTarget（那是 useNightActionHandler 的职责）
    expect(code).not.toMatch(/\bseat[s]?\s*[?.]?\s*\[?[^)]*lunaticTargetIds/);
    expect(code).toContain("lunaticTargetIds");
    // 必须存在「由 data 注入 → Set」的收敛点
    expect(code).toMatch(/new Set<number>\(\s*lunaticTargetIds/);
  });

  it("⭐ 弹窗组件内不得出现「疯子」以外的角色真相读取（不读 seat.role.id === 'lunatic'）", () => {
    expect(code).not.toContain('role?.id === "lunatic"');
    expect(code).not.toContain("apparentDemonRole");
  });
});

// @vitest-environment jsdom
/**
 * 杂耍艺人判定弹窗 · **一屏放下 15 人** 布局回归
 *
 * 用户要求（2026-09-14）：
 *   「优化杂耍艺人的技能确认页 UI，要求在一个屏幕下显示完整所有 15 个角色的
 *     座位号 + 角色名称，并且控制字号，尽可能大，方便手机横屏后的阅读。」
 *
 * 原实现的两个问题（本文件钉死不复发）：
 *   ① `className="max-w-2xl"`（672 设计 px）把弹窗压到舞台（1600 设计宽）的一半，
 *      字号只能做到 `text-xs`（12 设计 px，手机横屏真机 ≈5px，几乎不可读）；
 *   ② 座位网格 `max-h-56 overflow-y-auto` → 15 人（3 列 5 行）被裁到只能看见 12 人。
 *
 * ⚠️ ModalWrapper 会**剥掉** `w-[…] / max-w-[…] / h-[…] / max-h-[…]` 类名 ——
 *    所以不能用这些类控制尺寸，必须靠 flex + 内联 gridTemplate。
 * ⚠️ jsdom 不做真实布局，因此这里断言的是**决定布局的输入**：
 *    列数 / 行数 / 是否还有裁剪类 / 设计字号下限。
 */
import { describe, expect, it, beforeAll, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { roles } from "../../../../app/data";
import { JugglerJudgeModal } from "../JugglerJudgeModal";

const r = (id: string) => roles.find((x) => x.id === id)!;

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

/** 造 n 个座位；角色名故意用**最长的**那几个，压测不溢出 */
function seatsN(n: number): any[] {
  const pool = [
    "杂耍艺人", // 5 字（最长档）
    "罂粟种植者", // 5 字
    "畸形秀演员", // 5 字
    "博学者", // 3 字
    "小精灵",
    "镜像双子",
    "提线木偶",
    "洗脑师",
    "僧侣",
    "镇长",
    "占卜师",
    "神谕者",
    "厨师",
    "共情者",
    "士兵",
  ];
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    playerName: `玩家 ${i + 1}`,
    role: { id: `role_${i}`, name: pool[i % pool.length], type: "townsfolk" },
    isDead: false,
    statusEffects: [],
  })) as any[];
}

function dialog(): HTMLElement | null {
  return document.querySelector('[role="dialog"][aria-modal="true"]');
}

function seatGrid(): HTMLElement | null {
  const d = dialog();
  if (!d) return null;
  // 座位网格是唯一带 gridTemplateColumns 内联样式的元素
  return (
    (Array.from(d.querySelectorAll<HTMLElement>("div")).find((el) =>
      (el.getAttribute("style") || "").includes("grid-template-columns")
    ) as HTMLElement) ?? null
  );
}

function seatCards(): HTMLElement[] {
  const g = seatGrid();
  if (!g) return [];
  return Array.from(g.children) as HTMLElement[];
}

describe("杂耍艺人判定弹窗 · 15 人一屏布局", () => {
  it("⭐⭐ 15 个座位全部渲染，且每个都有「N号」+「【角色名】」", () => {
    render(
      <JugglerJudgeModal
        seatId={0}
        seats={seatsN(15)}
        onConfirm={() => {}}
        onClose={() => {}}
      />
    );
    const cards = seatCards();
    expect(cards.length, "应渲染 15 个座位卡").toBe(15);

    for (let i = 0; i < 15; i++) {
      const txt = cards[i].textContent ?? "";
      expect(txt, `第 ${i + 1} 张卡缺座位号`).toContain(`${i + 1}号`);
      expect(txt, `第 ${i + 1} 张卡缺角色名`).toMatch(/【.+?】/);
    }
    // 15 个角色名都不为空且不是「未知角色」
    const names = cards.map(
      (c) => (c.textContent ?? "").match(/【(.+?)】/)?.[1] ?? ""
    );
    expect(names.filter((n) => n && n !== "未知角色").length).toBe(15);
  });

  it("⭐⭐ 15 人排成 **5 列 × 3 行**（一屏放下的前提）", () => {
    render(
      <JugglerJudgeModal
        seatId={0}
        seats={seatsN(15)}
        onConfirm={() => {}}
        onClose={() => {}}
      />
    );
    const style = seatGrid()?.getAttribute("style") ?? "";
    expect(style, `列数应为 5，实际 style=${style}`).toContain(
      "grid-template-columns: repeat(5"
    );
    expect(style, "行数应为 3").toContain("grid-template-rows: repeat(3");
  });

  it("⭐⭐ 座位网格**不得再有裁剪/滚动**（旧版 max-h-56 + overflow-y-auto 会把 15 人裁到 12 人）", () => {
    render(
      <JugglerJudgeModal
        seatId={0}
        seats={seatsN(15)}
        onConfirm={() => {}}
        onClose={() => {}}
      />
    );
    const g = seatGrid();
    const cls = g?.className ?? "";
    expect(cls, "不应再有 overflow-y-auto（会滚动/裁剪）").not.toContain(
      "overflow-y-auto"
    );
    expect(cls, "不应再有 max-h-*（会裁剪）").not.toMatch(/\bmax-h-/);
    expect(cls, "网格必须 flex-1 吃满剩余高度").toContain("flex-1");
  });

  it("⭐⭐ 弹窗不使用 `max-w-2xl`（那会把 1360 设计宽压到 672，字号被迫变小）", () => {
    render(
      <JugglerJudgeModal
        seatId={0}
        seats={seatsN(15)}
        onConfirm={() => {}}
        onClose={() => {}}
      />
    );
    const cls = dialog()?.className ?? "";
    expect(cls, "弹窗不应带 max-w-2xl（会浪费一半舞台宽度）").not.toContain(
      "max-w-2xl"
    );
    expect(cls, "弹窗应吃满可用宽度").toContain("w-full");
    // 宽度上限交给 ModalWrapper 的 1360，而不是自带 max-w
    expect(cls).not.toMatch(/\bmax-w-(xs|sm|md|lg|xl|2xl|3xl)\b/);
  });

  it("⭐⭐ 设计字号下限：座位号 ≥40px、角色名 ≥32px（旧版是 text-xs=12px）", () => {
    render(
      <JugglerJudgeModal
        seatId={0}
        seats={seatsN(15)}
        onConfirm={() => {}}
        onClose={() => {}}
      />
    );
    const cards = seatCards();
    // 第 0 张卡：第 1 个 div 是座位号，第 2 个是角色名（都用内联 fontSize）
    const seatNumEl = cards[0].children[2] as HTMLElement | undefined; // 有「本人」角标时索引后移
    const all = Array.from(cards[0].querySelectorAll<HTMLElement>("div"));
    const seatNum = all.find((el) => /^\d+号$/.test(el.textContent ?? ""));
    const roleName = all.find((el) => /^【.+?】$/.test(el.textContent ?? ""));
    void seatNumEl;

    const seatFont = Number(
      (seatNum?.style.fontSize ?? "0px").replace("px", "")
    );
    const roleFont = Number(
      (roleName?.style.fontSize ?? "0px").replace("px", "")
    );
    expect(seatFont, `座位号设计字号 ${seatFont}px 应 ≥ 40px`).toBeGreaterThanOrEqual(
      40
    );
    expect(roleFont, `角色名设计字号 ${roleFont}px 应 ≥ 32px`).toBeGreaterThanOrEqual(
      32
    );
  });

  it("⭐ 人数变化时列数自适应：12 人 → 4 列；15 人 → 5 列（始终 3 行）", () => {
    const check = (n: number, cols: number) => {
      cleanup();
      render(
        <JugglerJudgeModal
          seatId={0}
          seats={seatsN(n)}
          onConfirm={() => {}}
          onClose={() => {}}
        />
      );
      const style = seatGrid()?.getAttribute("style") ?? "";
      expect(style, `${n} 人应为 ${cols} 列`).toContain(
        `grid-template-columns: repeat(${cols}`
      );
      expect(seatCards().length).toBe(n);
    };
    check(12, 4);
    check(15, 5);
  });

  it("⭐ 最长角色名不溢出：字号按「卡片宽 ÷ 最长字形数」反算", () => {
    render(
      <JugglerJudgeModal
        seatId={0}
        seats={seatsN(15)}
        onConfirm={() => {}}
        onClose={() => {}}
      />
    );
    const cards = seatCards();
    // 取 5 字的「罂粟种植者」【+2 括号 = 7 字形】
    const idx = cards.findIndex((c) => (c.textContent ?? "").includes("罂粟种植者"));
    expect(idx, "样本里应含 5 字角色名").toBeGreaterThanOrEqual(0);
    const roleEl = Array.from(
      cards[idx].querySelectorAll<HTMLElement>("div")
    ).find((el) => /^【.+?】$/.test(el.textContent ?? ""));
    const roleFont = Number((roleEl?.style.fontSize ?? "0px").replace("px", ""));

    // 5 列时卡片可用宽度 = (1360 - 48 - 6*4) / 5 ≈ 257.6，减去 12px 内边距 → 245.6
    const cardW = (1360 - 48 - 6 * (5 - 1)) / 5;
    const glyphs = "罂粟种植者".length + 2;
    expect(roleFont * glyphs, "角色名总宽不得超过卡片可用宽度").toBeLessThanOrEqual(
      cardW - 12 + 1
    );
    // 且角色名元素带 truncate 兜底（极端窄屏不破坏布局）
    expect(roleEl?.className ?? "").toContain("truncate");
  });

  it("⭐ 保留既有语义：座位号是「id+1」、角标不占布局（本人 / 亡）", () => {
    const seats = seatsN(15);
    // 死亡标记只有 isDead（2026-09-14 统一，护栏会拦 isAlive）
    seats[3] = { ...seats[3], isDead: true };
    render(
      <JugglerJudgeModal
        seatId={0}
        seats={seats}
        onConfirm={() => {}}
        onClose={() => {}}
      />
    );
    const cards = seatCards();
    expect(cards[0].textContent).toContain("1号");
    expect(cards[14].textContent).toContain("15号");
    expect(cards[0].textContent, "杂耍艺人本人应有角标").toContain("本人");
    expect(cards[3].textContent, "死者应有角标").toContain("亡");
  });
});

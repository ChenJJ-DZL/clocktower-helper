import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Role, Seat } from "../../../../app/data";
import { roles as allRoles } from "../../../../app/data";
import {
  CERENOVUS_ROLE_GRID_CLASS,
  CERENOVUS_TARGET_GRID_CLASS,
  CerenovusConfirmContent,
  CerenovusConfirmFooter,
  getCerenovusConfirmLabel,
} from "../CerenovusConfirmLayout";

/**
 * 🧠 洗脑师专属「技能确认页」布局硬证据
 *   · 目标网格 8 列（窄屏/手机横屏 5 列）、格高 56px(h-14)、text-base、只显示「N号」；
 *   · 行动者本人灰显 + 「自己」+ 不可选；选中态蓝底白字；右上角「已选：X号」；
 *   · 疯狂角色 6 列小胶囊（h-10 / text-sm），只显示角色名；
 *   · 底部主按钮两态：未选全 → 灰显提示；选全 → 确认文案。
 */

const roleOf = (id: string): Role => {
  const r = allRoles.find((x) => x.id === id)!;
  return { id: r.id, name: r.name, type: r.type } as Role;
};

const seat = (id: number, roleId: string): Seat =>
  ({ id, role: roleOf(roleId), isDead: false }) as unknown as Seat;

const SEATS: Seat[] = [
  seat(0, "chef"),
  seat(1, "empath"),
  seat(2, "librarian"),
  seat(3, "poisoner"),
  seat(4, "imp"),
  seat(5, "saint"),
  seat(6, "monk"),
  seat(7, "butler"),
  seat(8, "recluse"),
  seat(9, "mayor"),
  seat(10, "cerenovus"), // 11号-洗脑师（行动者本人）
];

const SCRIPT_ROLES: Role[] = [
  roleOf("chef"),
  roleOf("librarian"),
  roleOf("monk"),
  roleOf("poisoner"),
  roleOf("imp"),
];

const ACTOR = 10;
const TARGET = 2; // 3号

function render(extra: Record<string, any> = {}) {
  return renderToStaticMarkup(
    React.createElement(CerenovusConfirmContent, {
      seats: SEATS,
      scriptRoles: SCRIPT_ROLES,
      selectedTargets: [TARGET],
      selectedRoleId: "librarian",
      actorSeatId: ACTOR,
      onToggleTarget: () => {},
      onSelectRole: () => {},
      ...extra,
    } as any)
  );
}

const targetGridSection = (html: string) => {
  const start = html.indexOf(CERENOVUS_TARGET_GRID_CLASS);
  const end = html.indexOf(CERENOVUS_ROLE_GRID_CLASS);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return html.slice(start, end);
};

/** 取出包含 marker 的整个 <button ...> 开标签（disabled 等属性在 marker 之前）。 */
const buttonTag = (html: string, marker: string) => {
  const at = html.indexOf(marker);
  expect(at).toBeGreaterThan(-1);
  const start = html.lastIndexOf("<button", at);
  return html.slice(start, html.indexOf(">", at));
};

describe("🧠 洗脑师确认页 · 目标网格紧凑化", () => {
  const html = render();

  it("① 8 列（窄屏/手机横屏 5 列）+ 格高 56px + text-base", () => {
    expect(CERENOVUS_TARGET_GRID_CLASS).toContain("grid-cols-8");
    expect(CERENOVUS_TARGET_GRID_CLASS).toContain("max-[1024px]:grid-cols-5");
    const tag = buttonTag(html, `data-seat-id="0"`);
    expect(tag).toContain("h-14"); // 56px = h-14，≤56px 要求
    expect(tag).toContain("text-base");
  });

  it("② 只显示「N号」，绝不出现任何座位真实角色名", () => {
    const section = targetGridSection(html);
    expect(section).toContain("1号");
    expect(section).toContain("11号");
    for (const s of SEATS) {
      expect(section, `目标网格泄漏了 ${s.role?.name}`).not.toContain(
        s.role?.name as string
      );
    }
  });

  it("③ 行动者本人（11号）灰显并标注「自己」且不可选", () => {
    const actorTag = buttonTag(html, `data-seat-id="${ACTOR}"`);
    expect(actorTag).toContain("disabled");
    expect(actorTag).toContain("cursor-not-allowed");
    expect(actorTag).toContain("opacity-50");
    const section = targetGridSection(html);
    expect(section).toContain("自己");
  });

  it("④ 选中态蓝底白字 + 网格右上角「已选：3号」", () => {
    const selectedTag = buttonTag(html, `data-seat-id="${TARGET}"`);
    expect(selectedTag).toContain("data-selected=\"true\"");
    expect(selectedTag).toContain("bg-blue-600");
    expect(selectedTag).toContain("text-white");
    expect(html).toContain("已选：3号");
  });

  it("⑤ 未选目标时不显示「已选」，但行高不跳（右侧占位仍在）", () => {
    const none = render({ selectedTargets: [] });
    expect(none).not.toContain("已选：");
    expect(none).toContain('data-testid="cerenovus-selected-target"');
  });
});

describe("🧠 洗脑师确认页 · 疯狂角色小胶囊网格", () => {
  const html = render();

  it("① 6 列、高 40px(h-10)、text-sm，只显示角色名", () => {
    expect(CERENOVUS_ROLE_GRID_CLASS).toContain("grid-cols-6");
    const tag = buttonTag(html, 'data-role-id="librarian"');
    expect(tag).toContain("h-10");
    expect(tag).toContain("text-sm");
    expect(tag).toContain("rounded-full");
  });

  it("② 角色名照常展示，选中的角色高亮", () => {
    for (const r of SCRIPT_ROLES) {
      expect(html).toContain(r.name);
    }
    const tag = buttonTag(html, 'data-role-id="librarian"');
    expect(tag).toContain("data-selected=\"true\"");
    expect(tag).toContain("bg-amber-600");
  });

  it("③ 说明行位于胶囊网格之前（「请选择需要疯狂证明的角色（范围为当前剧本所有角色）」）", () => {
    const description = "请选择需要疯狂证明的角色（范围为当前剧本所有角色）";
    expect(html).toContain(description);
    expect(html.indexOf(description)).toBeLessThan(
      html.indexOf(CERENOVUS_ROLE_GRID_CLASS)
    );
  });
});

describe("🧠 洗脑师确认页 · 主按钮两态", () => {
  it("① 未选全 → 灰显「请先选择目标与疯狂角色」", () => {
    expect(getCerenovusConfirmLabel([], null)).toBe("请先选择目标与疯狂角色");
    expect(getCerenovusConfirmLabel([2], null)).toBe("请先选择目标与疯狂角色");
    const html = renderToStaticMarkup(
      React.createElement(CerenovusConfirmFooter, {
        canConfirm: false,
        isSubmitting: false,
        label: getCerenovusConfirmLabel([], null),
        onCancel: () => {},
        onConfirm: () => {},
      } as any)
    );
    expect(html).toContain("请先选择目标与疯狂角色");
    expect(html).toContain("撤销本次行动");
    expect(html).toContain("disabled");
    expect(html).toContain("bg-slate-800");
  });

  it("② 选全 → 「确认：3号 ➔ 疯狂扮演【图书管理员】」且可点击", () => {
    expect(getCerenovusConfirmLabel([2], "图书管理员")).toBe(
      "确认：3号 ➔ 疯狂扮演【图书管理员】"
    );
    const html = renderToStaticMarkup(
      React.createElement(CerenovusConfirmFooter, {
        canConfirm: true,
        isSubmitting: false,
        label: getCerenovusConfirmLabel([2], "图书管理员"),
        onCancel: () => {},
        onConfirm: () => {},
      } as any)
    );
    expect(html).toContain("确认：3号 ➔ 疯狂扮演【图书管理员】");
    expect(html).toContain("bg-blue-600");
    expect(html).not.toContain("disabled");
  });
});

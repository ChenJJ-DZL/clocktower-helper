// @vitest-environment jsdom
/**
 * 🔒 RolePickerModal（传奇角色/旅行者选人弹窗，2026-10-13 视觉重做）组件测试
 *
 * 交付契约：
 *   ① 全量渲染传入的 roles（8 传奇 / 15 旅行者），每张卡的**能力全文一字不删**
 *      （用户明确要求「保持技能效果的清晰描述」——这是对旧版重做的硬约束）；
 *   ② open=false ⇒ 整个弹窗不出现在 DOM；
 *   ③ disabledIds ⇒ 卡片真的 disabled + 有「已被占用」徽章（防：只置灰仍可点）；
 *   ④ selectedId ⇒ data-selected="true" + aria-pressed=true + 「当前生效」徽章
 *      （data-role-id 是 E2E/自动化的定位锚，与 CustomScriptBuilderModal 约定一致）；
 *   ⑤ 清空/标题文案逐字保留（E2E fabled_traveler_flow 依赖
 *      「选择传奇角色（上限 1 个）」「移除传奇角色」「为座位 3 选择旅行者」「清空该座位」）。
 *
 * 测试形态：RTL + jsdom（ModalWrapper 靠 useEffect 选 portal 宿主 ⇒ 静态 SSR 渲染恒 null）。
 */
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { FABLED_ROLES, TRAVELER_ROLES, type Role } from "../../../../app/data";
import { RolePickerModal } from "../board/RolePickerModal";

const noop = () => {};

const renderPicker = (props: Partial<Parameters<typeof RolePickerModal>[0]>) =>
  render(
    <RolePickerModal
      open
      title="测试弹窗"
      roles={[]}
      kind="fabled"
      onPick={noop}
      onClear={noop}
      clearLabel="清空"
      onClose={noop}
      {...props}
    />
  );

afterEach(cleanup);

const q = (html: Document | HTMLElement, sel: string) =>
  html.querySelectorAll<HTMLElement>(sel);

describe("RolePickerModal（传奇/旅行者选人弹窗）", () => {
  it("① 传奇 8 个全渲染，每张卡能力全文出现（一字不删）", () => {
    const { baseElement } = renderPicker({
      kind: "fabled",
      roles: FABLED_ROLES,
      clearLabel: "移除传奇角色",
    });
    const cards = q(baseElement, "button[data-role-id]");
    expect(cards).toHaveLength(FABLED_ROLES.length);
    for (const f of FABLED_ROLES) {
      const card = baseElement.querySelector(
        `button[data-role-id="${f.id}"]`
      ) as HTMLElement | null;
      expect(card, `卡片 ${f.id} 必须存在`).toBeTruthy();
      expect(card!.textContent).toContain(f.name);
      expect(card!.textContent).toContain(f.ability || "");
    }
  });

  it("② 旅行者 15 个全渲染 + 能力全文", () => {
    const { baseElement } = renderPicker({
      kind: "traveler",
      roles: TRAVELER_ROLES,
      clearLabel: "清空该座位",
    });
    expect(q(baseElement, "button[data-role-id]")).toHaveLength(
      TRAVELER_ROLES.length
    );
    for (const t of TRAVELER_ROLES) {
      const card = baseElement.querySelector(
        `button[data-role-id="${t.id}"]`
      ) as HTMLElement | null;
      expect(card, `卡片 ${t.id} 必须存在`).toBeTruthy();
      expect(card!.textContent).toContain(t.ability || "");
    }
  });

  it("③ open=false ⇒ 不渲染任何弹窗内容", () => {
    const { baseElement } = renderPicker({
      open: false,
      roles: FABLED_ROLES,
    });
    expect(q(baseElement, "button[data-role-id]")).toHaveLength(0);
    expect(baseElement.textContent).not.toContain("测试弹窗");
  });

  it("④ disabledIds ⇒ 卡片真实 disabled + 「已被占用」徽章", () => {
    const target: Role = TRAVELER_ROLES[0];
    const { baseElement } = renderPicker({
      kind: "traveler",
      roles: TRAVELER_ROLES,
      disabledIds: [target.id],
    });
    const card = baseElement.querySelector(
      `button[data-role-id="${target.id}"]`
    ) as HTMLButtonElement | null;
    expect(card).toBeTruthy();
    expect(card!.disabled).toBe(true);
    expect(card!.textContent).toContain("已被占用");
    // 其余卡片不受影响
    const others = Array.from(
      q(baseElement, "button[data-role-id]")
    ).filter(
      (b) => b.getAttribute("data-role-id") !== target.id
    ) as HTMLButtonElement[];
    expect(others.every((b) => !b.disabled)).toBe(true);
  });

  it("⑤ selectedId ⇒ data-selected=true + aria-pressed + 「当前生效」", () => {
    const target: Role = FABLED_ROLES[0];
    const { baseElement } = renderPicker({
      kind: "fabled",
      roles: FABLED_ROLES,
      selectedId: target.id,
    });
    const card = baseElement.querySelector(
      `button[data-role-id="${target.id}"]`
    ) as HTMLElement | null;
    expect(card).toBeTruthy();
    expect(card!.getAttribute("data-selected")).toBe("true");
    expect(card!.getAttribute("aria-pressed")).toBe("true");
    expect(card!.textContent).toContain("当前生效");
    // 恰好一张选中
    expect(
      q(baseElement, 'button[data-selected="true"]')
    ).toHaveLength(1);
  });

  it("⑥ 标题/清空文案逐字透传（E2E fabled_traveler_flow 依赖）", () => {
    const a = renderPicker({
      title: "选择传奇角色（上限 1 个）",
      roles: FABLED_ROLES,
      clearLabel: "移除传奇角色",
    });
    expect(a.baseElement.textContent).toContain("选择传奇角色（上限 1 个）");
    expect(a.baseElement.textContent).toContain("移除传奇角色");
    a.unmount();

    const b = renderPicker({
      title: "为座位 3 选择旅行者",
      kind: "traveler",
      roles: TRAVELER_ROLES,
      clearLabel: "清空该座位",
    });
    expect(b.baseElement.textContent).toContain("为座位 3 选择旅行者");
    expect(b.baseElement.textContent).toContain("清空该座位");
  });
});

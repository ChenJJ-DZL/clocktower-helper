// @vitest-environment jsdom
/**
 * 军团 · 说书人代操作的 **UI 真实渲染验证**
 *
 * 背景：第 1~7 轮 UI 维度一直缺失（用户 Edge 被占用 / bsk 不可用）。
 * 本文件用 **jsdom + @testing-library/react** 真实挂载组件（不是字符串拼装、
 * 也不是读源码推断），断言关键文案确实渲染进了 DOM ——
 * 这是目前最接近"页面实际显示了什么"的验证手段。
 *
 * 覆盖今日两处弹窗改动：
 *   1. NightActionConfirmModal：军团 → 「说书人视角 · 完整在场名单（座位号+角色）」
 *      + 隐私提示切换为「请勿展示给玩家」
 *   2. InfoResultModal：军团 → 「说书人专用」标注
 * 并做**负向验证**：普通角色页绝不能出现全员名单 / 绝不能泄漏角色名。
 */
import { describe, expect, it, beforeAll } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { roles } from "../../../../app/data";
import { NightActionConfirmModal } from "../NightActionConfirmModal";
import { InfoResultModal } from "../InfoResultModal";

const r = (id: string) => roles.find((x) => x.id === id)!;

// jsdom 缺 ResizeObserver（AutoFitContent 会用到）
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

/** 7 人局：3 个军团 + 4 个善良 */
function seats() {
  return [
    { id: 0, playerName: "P1", role: r("legion"), isDead: false, statusEffects: [] },
    { id: 1, playerName: "P2", role: r("mayor"), isDead: false, statusEffects: [] },
    { id: 2, playerName: "P3", role: r("legion"), isDead: false, statusEffects: [] },
    { id: 3, playerName: "P4", role: r("savant"), isDead: false, statusEffects: [] },
    { id: 4, playerName: "P5", role: r("legion"), isDead: false, statusEffects: [] },
    { id: 5, playerName: "P6", role: r("snitch"), isDead: false, statusEffects: [] },
    { id: 6, playerName: "P7", role: r("farmer"), isDead: false, statusEffects: [] },
  ] as any[];
}

function legionData(roster?: string[]) {
  return {
    roleName: "军团",
    actionDescription: "由说书人独立选择今晚死亡的玩家",
    targetDescriptions: ["（无目标）"],
    targetLimit: { min: 0, max: 1 },
    actorSeatId: 0,
    allowSelf: true,
    storytellerRoster: roster,
    storytellerFacing: Boolean(roster),
  } as any;
}

function normalData() {
  return {
    roleName: "僧侣",
    actionDescription: "选择一名其他存活玩家进行保护",
    targetDescriptions: ["（无目标）"],
    targetLimit: { min: 1, max: 1 },
    actorSeatId: 0,
    allowSelf: false,
  } as any;
}

function renderConfirm(data: any, s = seats()) {
  return render(
    <NightActionConfirmModal
      data={data}
      seats={s}
      onConfirm={() => {}}
      onCancel={() => {}}
    />
  );
}

describe("军团说书人代操作 · UI 真实渲染验证（jsdom）", () => {
  it("① 军团确认页渲染出「完整在场名单」，含全部座位号+角色", () => {
    const s = seats();
    const roster = s.map((x) => `${x.id + 1}号【${x.role?.name ?? "未知"}】`);
    renderConfirm(legionData(roster), s);
    // ModalWrapper 用 createPortal 挂到 document.body → 必须读 body
    const text = document.body.textContent ?? "";

    expect(text).toContain("说书人视角");
    expect(text).toContain("完整在场名单");
    for (const [no, name] of [
      [1, "军团"], [2, "镇长"], [3, "军团"], [4, "博学者"],
      [5, "军团"], [6, "告密者"], [7, "农夫"],
    ] as const) {
      expect(text, `缺少 ${no}号`).toContain(`${no}号`);
      expect(text, `缺少 ${no}号的角色`).toContain(name);
    }
  });

  it("② 军团确认页的隐私提示切换为「请勿展示给玩家」", () => {
    const s = seats();
    const roster = s.map((x) => `${x.id + 1}号【${x.role?.name ?? "未知"}】`);
    renderConfirm(legionData(roster), s);
    // ModalWrapper 用 createPortal 挂到 document.body → 必须读 body
    const text = document.body.textContent ?? "";
    expect(text).toContain("请勿展示给玩家");
    expect(text).not.toContain("其他玩家的角色信息已完全隐蔽");
  });

  it("③ 【负向】普通角色（僧侣）确认页保留玩家版隐私提示、不含说书人名单", () => {
    renderConfirm(normalData());
    const text = document.body.textContent ?? "";
    expect(text).toContain("其他玩家的角色信息已完全隐蔽");
    expect(text).not.toContain("完整在场名单");
    expect(text).not.toContain("说书人视角");
    expect(text).not.toContain("请勿展示给玩家");
  });

  it("④ 军团结果页渲染出「说书人专用」标注与结果文案", () => {
    render(
      <InfoResultModal
        roleName="军团"
        resultText="[军团夜杀] 说书人决定：4号玩家今晚死亡"
        onConfirm={() => {}}
        onModify={() => {}}
        storytellerFacing
      />
    );
    const text = document.body.textContent ?? "";
    expect(text).toContain("说书人专用");
    expect(text).toContain("请勿展示给玩家");
    expect(text).toContain("4号玩家今晚死亡");
  });

  it("⑤ 【负向】普通角色结果页不得出现「说书人专用」标注", () => {
    render(
      <InfoResultModal
        roleName="1号-占卜师"
        resultText="没有恶魔"
        onConfirm={() => {}}
        onModify={() => {}}
      />
    );
    const text = document.body.textContent ?? "";
    expect(text).not.toContain("说书人专用");
    expect(text).toContain("没有恶魔");
  });

  it("⑥ 军团确认页标题含「军团」且渲染目标选择区（0~1 人）", () => {
    const s = seats();
    const roster = s.map((x) => `${x.id + 1}号【${x.role?.name ?? "未知"}】`);
    renderConfirm(legionData(roster), s);
    // ModalWrapper 用 createPortal 挂到 document.body → 必须读 body
    const text = document.body.textContent ?? "";
    expect(text).toContain("军团");
    expect(text).toMatch(/最少\s*0\s*人/);
    expect(text).toMatch(/最多\s*1\s*人/);
  });
});

import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Seat } from "../../../../app/data";
import { roles as allRoles } from "../../../../app/data";
import { NightActionPage } from "../NightActionPage";
import { StorytellerTuningProvider } from "../StorytellerTuningContext";
import { PLAYER_VIEW_FORBIDDEN_TERMS } from "../../../utils/playerView";

/**
 * B 组硬证据：把整个 NightActionPage 渲染成**静态 HTML**，
 * 断言玩家视角下 HTML 字符串里：
 *   ① 不含任何在场角色的真实角色名（从 seats 逐个取真实名断言）；
 *   ② 不含「疯子」「lunatic」「真实身份」等词表中的任何词；
 *   ③ 说书人微调面板根本不在 DOM 里（条件渲染，不是 CSS 隐藏）；
 * 同时用 playerView={false}（说书人解锁视图）做反向对照，证明开关是真的。
 */

const seat = (id: number, roleId: string, playerName?: string) => {
  const r = allRoles.find((x) => x.id === roleId)!;
  return {
    id,
    playerName,
    role: { id: r.id, name: r.name, type: r.type },
    isDead: false,
  };
};

const demonRole = (id: string) => {
  const r = allRoles.find((x) => x.id === id)!;
  return { id: r.id, name: r.name, type: r.type };
};

const IMP = 7;
const LUNA = 1;

const seats = [
  seat(0, "chef"),
  { ...seat(LUNA, "lunatic"), apparentDemonRole: demonRole("shabaloth") },
  seat(2, "poisoner"),
  seat(3, "baron"),
  seat(4, "empath"),
  seat(5, "washerwoman"),
  seat(6, "saint"),
  seat(IMP, "imp"),
] as unknown as Seat[];

const lunaticNightInfo = {
  seat: seats[LUNA],
  effectiveRole: { id: "lunatic", name: "疯子", type: "outsider" },
  playerFacingRole: demonRole("shabaloth"),
  playerFacingGuide: "唤醒2号【沙巴洛斯】，选择两名玩家：他们死亡。",
  guide: "唤醒2号玩家（疯子，以为自己是恶魔）。",
  isPoisoned: false,
  speak: "",
  action: "",
  roleId: "lunatic",
  index: 0,
  targetLimit: { min: 2, max: 2 },
  canSelectDead: false,
  canSelectSelf: false,
  validTargetIds: seats.filter((s) => s.id !== LUNA).map((s) => s.id),
  guideText: "唤醒2号玩家（疯子，以为自己是恶魔）。",
  actionText: "",
} as any;

const demonNightInfo = {
  seat: seats[IMP],
  effectiveRole: { id: "imp", name: "小恶魔", type: "demon" },
  playerFacingRole: { id: "imp", name: "小恶魔", type: "demon" },
  playerFacingGuide: "唤醒8号【小恶魔】，选择一名玩家：他死亡。",
  guide: "唤醒8号【小恶魔】，选择一名玩家：他死亡。",
  isPoisoned: false,
  speak: "",
  action: "",
  roleId: "imp",
  index: 0,
  targetLimit: { min: 1, max: 1 },
  canSelectDead: false,
  canSelectSelf: false,
  validTargetIds: seats.filter((s) => s.id !== IMP).map((s) => s.id),
  guideText: "",
  actionText: "",
} as any;

const noop = () => {};

function renderNight(
  nightInfo: any,
  allSeats: Seat[],
  playerView?: boolean
): string {
  // 仓库 tsconfig 的 jsx=preserve 会让 vitest 无法直接编译 JSX，
  // 因此这里用 React.createElement 构造相同的组件树（等价、零配置改动）。
  return renderToStaticMarkup(
    React.createElement(
      StorytellerTuningProvider,
      { nightInfo, seats: allSeats } as any,
      React.createElement(NightActionPage, {
        nightInfo,
        seats: allSeats,
        selectedTargets: [],
        onToggleTarget: noop,
        onConfirm: noop,
        onCancel: noop,
        isConfirmDisabled: false,
        guideText: nightInfo.guide,
        playerView,
      } as any)
    )
  );
}

describe("B1/B3 · NightActionPage 玩家视角静态 HTML 无泄漏", () => {
  const html = renderNight(lunaticNightInfo, seats);

  it("① 疯子页面显示的是 apparentDemonRole（沙巴洛斯），且不含「疯子」字样", () => {
    expect(html).toContain("沙巴洛斯");
    expect(html).not.toContain("疯子");
    expect(html).not.toContain("lunatic");
    expect(html).not.toContain("Lunatic");
  });

  it("② HTML 中不含任何在场角色的真实角色名", () => {
    for (const s of seats) {
      const realName = s.role?.name;
      expect(realName, "seats 造数应带角色名").toBeTruthy();
      expect(html, `玩家视角 HTML 泄漏了真实角色名：${realName}`).not.toContain(
        realName as string
      );
    }
  });

  it("③ HTML 中不含词表里的任何玩家视角禁用词", () => {
    const hits = PLAYER_VIEW_FORBIDDEN_TERMS.filter((t) =>
      html.includes(t)
    );
    expect(hits).toEqual([]);
  });

  it("④ 目标选择网格只呈现座位号（不出现真实角色名）", () => {
    expect(html).toContain("1号");
    expect(html).toContain("8号");
    expect(html).not.toContain("投毒者");
    expect(html).not.toContain("男爵");
  });

  it("⑤ 说书人微调面板不在 DOM 中（条件渲染，而非 CSS 隐藏）", () => {
    expect(html).not.toContain("storyteller-tuning-panel");
    expect(html).not.toContain("说书人信息指定与微调");
    expect(html).not.toContain("说书人视图");
  });
});

describe("B1/B3 · 反向对照：说书人解锁视图保留真实信息", () => {
  const html = renderNight(lunaticNightInfo, seats, false);

  it("① 说书人视图才有微调面板与真实角色名", () => {
    expect(html).toContain("storyteller-tuning-panel");
    expect(html).toContain("投毒者");
    expect(html).toContain("疯子");
    expect(html).toContain("🔓 说书人视图（玩家不可见）");
  });
});

describe("A4 · 真恶魔行动页必须看到「疯子本夜选择了谁」", () => {
  it("① 多目标全部列出（官方：恶魔知道疯子每个夜晚选择了哪些玩家）", () => {
    const withTargets = seats.map((s) =>
      s.id === LUNA ? { ...s, lunaticTargetIds: [2, 4] } : s
    ) as unknown as Seat[];
    const html = renderNight(demonNightInfo, withTargets);
    expect(html).toContain("疯子本夜选择了 3号玩家、5号玩家");
  });

  it("② 未选择目标时给出明确文案（不能静默）", () => {
    const withEmpty = seats.map((s) =>
      s.id === LUNA ? { ...s, lunaticTargetIds: [] } : s
    ) as unknown as Seat[];
    const html = renderNight(demonNightInfo, withEmpty);
    expect(html).toContain("疯子本夜未选择任何玩家");
  });

  it("③ 单目标历史字段 lunaticTarget 也兼容", () => {
    const withSingle = seats.map((s) =>
      s.id === LUNA
        ? { ...s, lunaticTargetIds: undefined, lunaticTarget: 0 }
        : s
    ) as unknown as Seat[];
    const html = renderNight(demonNightInfo, withSingle);
    expect(html).toContain("疯子本夜选择了 1号玩家");
  });

  it("④ 场上没有疯子时恶魔页不出现该提示", () => {
    const noLunatic = seats
      .filter((s) => s.id !== LUNA)
      .map((s) => ({ ...s, id: s.id })) as unknown as Seat[];
    const html = renderNight(demonNightInfo, noLunatic);
    expect(html).not.toContain("疯子本夜");
  });
});

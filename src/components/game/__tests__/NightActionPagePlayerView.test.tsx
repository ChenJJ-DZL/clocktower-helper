import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Seat } from "../../../../app/data";
import { roles as allRoles } from "../../../../app/data";
import { NightActionPage } from "../NightActionPage";
import { StorytellerTuningProvider } from "../StorytellerTuningContext";
import { buildCerenovusNoticeNightInfo } from "../../../utils/cerenovusNotice";
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
  playerView?: boolean,
  extraProps: Record<string, any> = {}
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
        ...extraProps,
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


// ─────────────────────────────────────────────────────────────────────────────
// 🧠 洗脑师专属结果页 / 被洗脑告知节点（追加需求：行动者信息一律不进玩家面）
// ─────────────────────────────────────────────────────────────────────────────

const CER_ACTOR = 10; // 11号-洗脑师
const CER_TARGET = 2; // 3号-被洗脑玩家
const CER_MADNESS_ROLE = "图书管理员";

const cerSeats = [
  seat(0, "chef"),
  seat(1, "empath"),
  seat(CER_TARGET, "villager"),
  seat(3, "imp"),
  seat(4, "saint"),
  seat(5, "monk"),
  seat(6, "butler"),
  seat(7, "recluse"),
  seat(8, "mayor"),
  seat(9, "poisoner"),
  seat(CER_ACTOR, "cerenovus"),
] as unknown as Seat[];

const cerNightInfo = {
  seat: cerSeats[CER_ACTOR],
  effectiveRole: { id: "cerenovus", name: "洗脑师", type: "minion" },
  playerFacingRole: { id: "cerenovus", name: "洗脑师", type: "minion" },
  playerFacingGuide: "唤醒11号【洗脑师】，选择一名玩家与一个角色。",
  guide: "唤醒11号【洗脑师】，选择一名玩家与一个角色。",
  isPoisoned: false,
  speak: "",
  action: "",
  roleId: "cerenovus",
  index: 0,
  targetLimit: { min: 1, max: 1 },
  canSelectDead: false,
  canSelectSelf: false,
  validTargetIds: cerSeats
    .filter((s) => s.id !== CER_ACTOR)
    .map((s) => s.id),
} as any;

const cerResultProps = {
  resultText: `你需要疯狂证明自己是【${CER_MADNESS_ROLE}】`,
  nightCount: 1,
  cerenovusResult: { targetId: CER_TARGET, roleName: CER_MADNESS_ROLE },
  onResultConfirm: noop,
  onMadnessCheck: noop,
};

describe("🧠 洗脑师结果页 · 玩家视角零行动者信息", () => {
  const html = renderNight(cerNightInfo, cerSeats, undefined, cerResultProps);

  it("① 只有「你需要疯狂证明自己是【X】」+ 副标题", () => {
    expect(html).toContain("你需要疯狂证明自己是【图书管理员】");
    expect(html).toContain("若未照做，明天白天你可能会被处决");
  });

  it("② 不含洗脑师的座位号 / 角色名 / cerenovus 字样", () => {
    expect(html, "泄漏了行动者座位号").not.toContain("11号");
    expect(html, "泄漏了行动者角色名").not.toContain("洗脑师");
    expect(html).not.toContain("cerenovus");
    expect(html).not.toContain("Cerenovus");
  });

  it("③ 不含任何在场座位的真实角色名（含被洗脑者自己的真角色）", () => {
    for (const s of cerSeats) {
      expect(html, `泄漏了真实角色名：${s.role?.name}`).not.toContain(
        s.role?.name as string
      );
    }
  });

  it("④ 不含说书人专属内容（真值块 / 判定入口 / 微调面板 / 解锁横幅）", () => {
    expect(html).not.toContain("判定时机");
    expect(html).not.toContain("洗脑判定");
    expect(html).not.toContain("storyteller-tuning-panel");
    expect(html).not.toContain("说书人视图");
    expect(html).not.toContain("玩家不可见");
  });

  it("⑤ 缺省词表命中为零", () => {
    const hits = PLAYER_VIEW_FORBIDDEN_TERMS.filter((t) => html.includes(t));
    expect(hits).toEqual([]);
  });

  it("⑥ 反向对照：说书人解锁视图保留完整真值 + 判定入口", () => {
    const st = renderNight(cerNightInfo, cerSeats, false, cerResultProps);
    expect(st).toContain("11号");
    expect(st).toContain("洗脑师");
    expect(st).toContain("3号");
    expect(st).toContain("判定时机：明日白天");
    expect(st).toContain("🧠 洗脑判定");
    expect(st).toContain("🔓 说书人视图（玩家不可见）");
    expect(st).toContain("storyteller-tuning-panel");
  });
});

describe("🧠 被洗脑玩家的独立行动节点 · 玩家视角零行动者信息", () => {
  const noticeSeat = {
    ...cerSeats[CER_TARGET],
    cerenovusMadnessRole: CER_MADNESS_ROLE,
    cerenovusNoticeNight: 1,
  } as unknown as Seat;
  const noticeNightInfo = buildCerenovusNoticeNightInfo(noticeSeat, 1) as any;
  const noticeSeats = cerSeats.map((s) =>
    s.id === CER_TARGET ? noticeSeat : s
  );
  const html = renderNight(noticeNightInfo, noticeSeats, undefined, {
    nightCount: 1,
    onNoticeConfirm: noop,
    onMadnessCheck: noop,
  });

  it("① 节点行动者 = 被洗脑玩家本人，且只含他自己该知道的信息", () => {
    expect(noticeNightInfo.seat.id).toBe(CER_TARGET);
    expect(html).toContain("你需要疯狂证明自己是【图书管理员】");
    expect(html).toContain("若未照做，明天白天你可能会被处决");
  });

  it("② 不含洗脑师座位号 / 角色名 / cerenovus / 队列步骤名", () => {
    expect(html).not.toContain("11号");
    expect(html).not.toContain("洗脑师");
    expect(html).not.toContain("cerenovus");
    expect(html).not.toContain("得知自己被洗脑");
  });

  it("③ 不含任何在场座位真实角色名，也不含说书人备注", () => {
    for (const s of noticeSeats) {
      expect(html, `泄漏了真实角色名：${s.role?.name}`).not.toContain(
        s.role?.name as string
      );
    }
    expect(html).not.toContain("不要让他知道是谁洗的");
    expect(html).not.toContain("storyteller-tuning-panel");
  });

  it("④ 反向对照：说书人解锁视图有「不要让他知道是谁洗的」+ 判定入口 + 真值", () => {
    const st = renderNight(noticeNightInfo, noticeSeats, false, {
      nightCount: 1,
      onNoticeConfirm: noop,
      onMadnessCheck: noop,
    });
    expect(st).toContain("这是洗脑效果，不要让他知道是谁洗的");
    expect(st).toContain("判定时机：明日白天");
    expect(st).toContain("🧠 洗脑判定");
    expect(st).toContain("目标：");
  });
});

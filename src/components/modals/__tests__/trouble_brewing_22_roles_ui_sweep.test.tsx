// @vitest-environment jsdom
/**
 * 暗流涌动（Trouble Brewing / TB） · **22 角色 × 通用弹窗 数据驱动 UI 渲染扫描**
 *
 * 承接罂粟花开的 L3 三层扫描范式（`poppyganda_24_roles_ui_sweep.test.tsx`：
 * 通用弹窗数据驱动扫描；`poppyganda_more_modals_ui.test.tsx`：角色专属弹窗）。
 * 本文件把 L3 覆盖补齐到 **8 个官方剧本中最经典的暗流涌动**（22 角色）。
 *
 * 覆盖三层：
 *   §A 通用弹窗数据驱动扫描（22 角色全量）
 *     ① 每个被唤醒角色的【技能确认页】渲染非空（不白屏）
 *     ② ⭐ 每个角色的【技能结果页】文案 == 引擎 `guide` 的解析结果
 *     ③ 信息类角色（洗衣妇/图书管理员/调查员/厨师/共情者/占卜师/送葬者）可读抽查
 *     ④ 全体 22 角色定义可解析 + 与 app/data 的 roleIds 严格一致
 *   §B 暗流涌动**专属**弹窗真实渲染
 *     ⑤ 间谍 → `SpyGrimoireModal`（椭圆魔典：中心 HUD / 计数徽章 / 情报 Tab / 查看完毕）
 *     ⑥ 间谍 → 酒鬼伪装身份在魔典中显示为「(伪:角色名)」而不泄漏真实身份
 *     ⑦ 小恶魔 → `KillConfirmModal`（含自刀语义）
 *     ⑧ 僧侣/士兵 → `AttackBlockedModal`
 *     ⑨ 镇长 → `MayorRedirectModal` + `MayorThreeAliveModal`（命名不得回退为「市长」）
 *     ○  酒鬼 → `DrunkCharadeSelectModal` / `CharadeConfigModal`（酒鬼是 TB 外来者）
 *
 * ⚠️ 关键测试陷阱（沿用罂粟花开经验）：
 *   · `ModalWrapper` 走 `createPortal` → 断言必须读 `document.body`，不是 `container`
 *   · jsdom 缺 `ResizeObserver`（`useUniformEllipseLayout` 用）→ `beforeAll` 补桩
 *   · 比较结果页文案必须**两侧同时归一化**（剥 `【】` 与空白），只剥一侧会得假不匹配
 */
import { describe, expect, it, beforeAll, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { roles, scripts } from "../../../../app/data";
import { calculateNightInfoViaNewEngine } from "../../../utils/nightInfoAdapter";
import { parseInfoResult } from "../../../utils/infoResultParser";
import { initializeAbilityRegistry } from "../../../roles/new_engine/abilityRegistry";
import { InfoResultModal } from "../InfoResultModal";
import { NightActionConfirmModal } from "../NightActionConfirmModal";
import { SpyGrimoireModal } from "../SpyGrimoireModal";
import { KillConfirmModal } from "../KillConfirmModal";
import { AttackBlockedModal } from "../AttackBlockedModal";
import { MayorRedirectModal } from "../MayorRedirectModal";
import { MayorThreeAliveModal } from "../MayorThreeAliveModal";
import { CharadeConfigModal } from "../CharadeConfigModal";
import { DrunkCharadeSelectModal } from "../DrunkCharadeSelectModal";

const r = (id: string) => roles.find((x) => x.id === id)!;
const TB = scripts.find((s) => s.id === "trouble_brewing")!;

/**
 * 暗流涌动 22 角色（顺序：镇民 13 → 外来者 4 → 爪牙 4 → 恶魔 1）。
 * 必须与 `app/data.ts` 中 `trouble_brewing.roleIds` 逐字一致（④ 有断言兜底）。
 */
const ROSTER = [
  // 镇民（13）
  "washerwoman", "librarian", "investigator", "chef", "empath",
  "fortune_teller", "undertaker", "monk", "ravenkeeper", "virgin",
  "slayer", "soldier", "mayor",
  // 外来者（4）
  "butler", "drunk", "recluse", "saint",
  // 爪牙（4）
  "poisoner", "spy", "scarlet_woman", "baron",
  // 恶魔（1）
  "imp",
];

/**
 * 该角色在哪一夜被唤醒（对齐 `src/data/rolesData.json` 的官方夜序；不唤醒 → null）。
 * 首夜：洗衣妇52 / 图书管理员53 / 调查员54 / 厨师55 / 共情者56 / 占卜师57 / 管家58
 *       投毒者30 / 男爵33 / 间谍75（「每个夜晚你都看到魔典」→ 首夜也唤醒）
 * 其他夜：僧侣24 / 红罗刹37 / 小恶魔45 / 守鸦人80 / 共情者90 / 占卜师91
 *         管家92 / 送葬者93 / 投毒者13 / 间谍108
 */
const WAKE_NIGHT: Record<string, 1 | 2 | null> = {
  // 镇民
  washerwoman: 1, librarian: 1, investigator: 1, chef: 1, empath: 1,
  fortune_teller: 1, undertaker: 2, monk: 2, ravenkeeper: 2,
  virgin: null, slayer: null, soldier: null, mayor: null,
  // 外来者（酒鬼无唤醒步骤：说书人把酒鬼令牌盖在某个镇民上，唤该镇民）
  butler: 1, drunk: null, recluse: null, saint: null,
  // 爪牙
  poisoner: 1, spy: 1, scarlet_woman: 2, baron: 1,
  // 恶魔
  imp: 2,
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

function seat(id: number, roleId: string, over: Partial<any> = {}): any {
  return {
    id,
    playerName: `P${id + 1}`,
    role: r(roleId),
    isDead: false,
    isDrunk: false,
    isPoisoned: false,
    statusEffects: [],
    ...over,
  };
}

/**
 * 构造 7 人局座位。第 0 位为被测角色。
 * ⚠️ 座位布局只用暗流涌动**本剧本**角色，不掺入罂粟花开专属角色
 *    （掺入会掩盖「剧本角色引用拼写错误」这类缺陷）。
 */
function buildSeats(roleId: string) {
  const layout: Array<[number, string]> = [
    [0, roleId],
    [1, "mayor"],
    [2, "soldier"],
    [3, "empath"],
    [4, "baron"],
    [5, "imp"],
    [6, "saint"],
  ];
  const seats: any[] = layout.map(([id, rid]) => seat(id, rid));

  // 避免与被测角色重复
  if (roleId === "imp") seats[5].role = r("imp");
  if (roleId === "baron") seats[4].role = r("baron");
  if (roleId === "mayor") seats[1].role = r("mayor");
  if (roleId === "soldier") seats[2].role = r("soldier");
  if (roleId === "empath") seats[3].role = r("empath");
  if (roleId === "saint") seats[6].role = r("saint");
  if (roleId === "spy") seats[4].role = r("spy");
  if (roleId === "drunk") {
    // 酒鬼必带 charadeRole + 永久醉酒状态效果
    // （生产由 `src/utils/charadeSetup.ts` 的 withCharadePermanentDrunk 写入）
    seats[0].role = r("drunk");
    seats[0].charadeRole = r("librarian");
    seats[0].statusEffects = [{ type: "drunk", permanent: true }];
  }
  return seats;
}

/** 系统步骤 id → 该夜以系统步骤身份被唤醒（爪牙/恶魔互认） */
const SYS_STEP: Record<string, string> = {
  baron: "minion_info",
  spy: "minion_info",
  imp: "demon_info",
};

/** 调引擎取某角色的夜间引导文案 */
function engineGuide(roleId: string, night: 1 | 2, seats: any[]) {
  const info: any = calculateNightInfoViaNewEngine(
    TB as any,
    seats as any,
    0,
    (night === 1 ? "firstNight" : "night") as any,
    null,
    night,
    SYS_STEP[roleId],
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

// ══════════════════════════════════════════════════════════════════════════
describe("暗流涌动 · §A 22 角色 × 通用弹窗 数据驱动 UI 渲染扫描", () => {
  initializeAbilityRegistry();

  it("① 每个被唤醒角色的【技能确认页】都能渲染出非空内容（不白屏）", () => {
    const blank: string[] = [];
    let checked = 0;
    for (const roleId of ROSTER) {
      const night = WAKE_NIGHT[roleId];
      if (!night) continue;
      checked++;
      const seats = buildSeats(roleId);
      const info = engineGuide(roleId, night, seats);
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
    // 暗流涌动 22 角色中 15 个有唤醒步骤（首夜/其他夜任一有夜序即算），
    // 7 个纯被动角色无确认页：贞洁者/猎手/士兵/镇长/酒鬼/隐士/圣徒。
    // 该数字由 `src/data/rolesData.json` 的 firstNightOrder/otherNightOrder 独立核算得出。
    expect(checked, "被唤醒角色数应为 15").toBe(15);
    expect(blank, `以下角色引擎未产出 guide：${blank.join(", ")}`).toEqual([]);
  });

  it("② ⭐ 每个角色的【技能结果页】渲染文案 == 引擎 guide 的解析结果", () => {
    const mismatched: string[] = [];
    for (const roleId of ROSTER) {
      const night = WAKE_NIGHT[roleId];
      if (!night) continue;
      const seats = buildSeats(roleId);
      const info = engineGuide(roleId, night, seats);
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
      //    只剥一侧会得出假的不匹配。
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

  it("③ 信息类角色结果页可读抽查（洗衣妇/图书管理员/调查员/厨师/共情者）", () => {
    const samples: Array<[string, 1 | 2]> = [
      ["washerwoman", 1],
      ["librarian", 1],
      ["investigator", 1],
      ["chef", 1],
      ["empath", 1],
    ];
    for (const [roleId, night] of samples) {
      const seats = buildSeats(roleId);
      const info = engineGuide(roleId, night, seats);
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

  it("④ 全体 22 角色定义可解析，且与 app/data 的 roleIds 严格一致", () => {
    expect(ROSTER.length, "暗流涌动应为 22 个角色").toBe(22);
    expect(new Set(ROSTER).size, "ROSTER 存在重复 id").toBe(22);
    expect(
      [...(TB.roleIds ?? [])].sort(),
      "ROSTER 与 app/data 中 trouble_brewing.roleIds 不一致"
    ).toEqual([...ROSTER].sort());
    for (const id of ROSTER) {
      expect(r(id), `角色 ${id} 未在 app/data 中找到`).toBeTruthy();
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe("暗流涌动 · §B 专属弹窗真实渲染", () => {
  /** 间谍魔典用 7 人局：间谍在外 + 带一名酒鬼（验证伪装身份显示） */
  const spySeats = () => [
    seat(0, "spy"),
    seat(1, "mayor"),
    seat(2, "soldier"),
    seat(3, "drunk", {
      charadeRole: r("librarian"),
      statusEffects: [{ type: "drunk", permanent: true }],
    }),
    seat(4, "baron"),
    seat(5, "imp"),
    seat(6, "saint", { isDead: true }),
  ];

  it("⑤ 间谍椭圆魔典：中心 HUD / 计数徽章 / 情报 Tab / 查看完毕 全部渲染", () => {
    render(
      <SpyGrimoireModal
        isOpen
        onClose={() => {}}
        seats={spySeats() as any}
        nightCount={1}
      />
    );
    const t = allText();
    expect(t, "缺少标题").toContain("间谍椭圆魔典");
    expect(t, "缺少魔典中心 HUD").toContain("魔典中心");
    expect(t, "缺少查阅倒计时").toContain("查阅倒计时");
    // 计数徽章
    expect(t).toContain("总人数");
    expect(t).toContain("善良");
    expect(t).toContain("邪恶");
    expect(t).toContain("死亡");
    // 情报筛选 Tab
    expect(t).toContain("全部行动与情报");
    expect(t, "无日志时应渲染空态").toContain("暂无对应行动或情报记录");
    // 关闭入口
    expect(t).toContain("我已查看完毕");
    // 倒计时控制
    expect(t).toMatch(/暂停|继续/);
    expect(t).toContain("+15s");
  });

  it("⑥ 间谍魔典：酒鬼座位显示为「(伪:角色名)」，不得泄漏真实身份（隐私不变量）", () => {
    render(
      <SpyGrimoireModal
        isOpen
        onClose={() => {}}
        seats={spySeats() as any}
        nightCount={1}
      />
    );
    const t = allText();
    // 间谍是全知角色 → 可以看到伪装后的假身份
    expect(t, "酒鬼的伪装身份应显示在魔典上").toContain("伪:");
    expect(t, "伪装身份应为图书管理员").toContain("图书管理员");
  });

  it("⑦ 间谍魔典：喂入首夜日志后，情报 Tab 渲染真实条目", () => {
    const logs = [
      { day: 0, phase: "firstNight", message: "1号间谍查看了魔典" },
      { day: 0, phase: "firstNight", message: "6号投毒者选择了2号士兵" },
      { day: 1, phase: "day", message: "白天：无人被处决" },
    ];
    render(
      <SpyGrimoireModal
        isOpen
        onClose={() => {}}
        seats={spySeats() as any}
        gameLogs={logs as any}
        nightCount={2}
      />
    );
    const t = allText();
    // 有日志后不应再是空态
    expect(t, "有日志时不应渲染空态").not.toContain("暂无对应行动或情报记录");
    // Tab 栏应出现首夜 / 白天事件分类
    expect(t).toMatch(/首夜|第\s*1\s*夜|白天/);
  });

  it("⑧ 击杀确认：小恶魔指定目标渲染座位号；自刀渲染自杀语义", () => {
    cleanup();
    render(
      <KillConfirmModal
        targetId={3}
        isImpSelfKill={false}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(allText()).toContain("4号");

    cleanup();
    render(
      <KillConfirmModal
        targetId={5}
        isImpSelfKill
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(allText()).toMatch(/自杀|自己/);
  });

  it("⑨ 攻击被挡：渲染被保护目标与原因（僧侣 / 士兵）", () => {
    cleanup();
    render(
      <AttackBlockedModal
        isOpen={false}
        targetId={2}
        reason="僧侣保护"
        onClose={() => {}}
      />
    );
    expect(allText(), "isOpen=false 不应渲染").not.toContain("僧侣保护");

    cleanup();
    render(
      <AttackBlockedModal
        isOpen
        targetId={2}
        reason="僧侣保护"
        demonName="小恶魔"
        onClose={() => {}}
      />
    );
    const t = allText();
    expect(t).toContain("3号");
    expect(t).toContain("僧侣保护");
  });

  it("⑩ 镇长替死与三人和平胜：命名必须与 app/data 一致（不得回退为「市长」）", () => {
    cleanup();
    render(
      <MayorRedirectModal
        isOpen
        targetId={1}
        demonName="小恶魔"
        seats={spySeats() as any}
        selectedTarget={null}
        onSelectTarget={() => {}}
        onConfirmNoRedirect={() => {}}
        onConfirmRedirect={() => {}}
      />
    );
    let t = allText();
    expect(t, "镇长 UI 必须使用与 app/data 一致的角色名「镇长」").toContain("镇长");
    expect(t, "不得再出现旧译名「市长」").not.toContain("市长");
    expect(t).toContain("小恶魔");

    cleanup();
    render(
      <MayorThreeAliveModal
        isOpen
        onContinue={() => {}}
        onDeclareWin={() => {}}
        onCancel={() => {}}
      />
    );
    t = allText();
    expect(t).toContain("镇长");
    expect(t, "不得再出现旧译名「市长」").not.toContain("市长");
    expect(t).toMatch(/胜利|获胜/);
  });

  it("⑪ 酒鬼（暗流涌动外来者）：伪装镇民选择与伪装配置弹窗可渲染", () => {
    const tbTownsfolkIds = [
      "washerwoman", "librarian", "investigator", "chef", "empath",
      "fortune_teller", "undertaker", "monk", "ravenkeeper", "virgin",
      "slayer", "soldier", "mayor",
    ];
    const townsfolk = tbTownsfolkIds.map((id) => r(id));

    cleanup();
    render(
      <DrunkCharadeSelectModal
        isOpen
        onClose={() => {}}
        onConfirm={() => {}}
        drunkSeat={seat(0, "drunk", { charadeRole: r("empath") })}
        availableTownsfolkRoles={townsfolk}
        selectedScriptId="trouble_brewing"
      />
    );
    let t = allText();
    expect(t).toContain("酒鬼");
    expect(t).toContain("共情者");
    expect(t).toContain("洗衣妇");

    cleanup();
    const grouped: Record<string, any[]> = {
      townsfolk: townsfolk.slice(0, 5),
      outsider: [r("recluse"), r("saint")],
    };
    render(
      <CharadeConfigModal
        isOpen
        onClose={() => {}}
        seats={spySeats() as any}
        filteredGroupedRoles={grouped as any}
        onConfirm={() => {}}
      />
    );
    t = allText();
    expect(t).toContain("伪装");
    expect(t).toMatch(/提线木偶|酒鬼|疯子/);
    expect(t).toContain("一键随机分配");
  });
});

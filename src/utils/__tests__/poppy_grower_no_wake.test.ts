/**
 * 🌺 罂粟种植者（Poppy Grower）纯被动角色「不得被唤醒」回归测试
 *
 * 【用户实测缺陷】2026-09-14
 *   玩家反馈：罂粟种植者是个**被动技能**，不应该在夜晚因其自身技能被唤醒。
 *   实测界面（截图）：夜间弹出
 *     · 标题「10号-罂粟种植者 - 结果」
 *     · 副标「10号-罂粟种植者获得信息」
 *     · 正文「罂粟种植者激活（存活），邪恶阵营互识已隐」
 *
 * 【官方规则】「爪牙和恶魔互相不认识。如果你死亡，当晚他们会互相认识。」
 *   罂粟种植者**永远不需要睁眼**：存活时被动屏蔽邪恶互识；死亡当晚由
 *   爪牙/恶魔自己被唤醒互认。它本人没有任何"行动"。
 *
 * 【根因（已定位）】
 *   1. `nightInfoGenerator.ts` 对"有效角色无 night 配置"的座位有一个兜底分支，
 *      合成「唤醒N号【角色名】，准备执行技能。」（全库 50+ 角色命中，是
 *      "UI 不为空"的必需品，**不能删**）。
 *   2. 只要该座位被塞进 `wakeQueueIds`，夜间就会走到它 →
 *      `handleNightAction` → `executeViaNewEngine(ctx, "poppy_grower")` →
 *      `postProcessResult` 写入 `displayInfo.log` →
 *      弹出「N号-罂粟种植者 - 结果」信息窗。
 *   3. 动态插入入口 `insertIntoWakeQueueAfterCurrent` 只按座位 id 插入、
 *      无反向校验 → 纯被动角色可被塞进队列。
 *   4. 数据侧：`rolesData.json` 把 poppy 误标成 `type:"demon"` 且给了
 *      `firstNightOrder:8 / otherNightOrder:6`（纯被动角色不应有夜序）。
 *
 * 【修复】双保险 + 数据订正
 *   · `dynamicQueueGenerator.roleHasNightAction/seatHasNightAction`：
 *     队列**准入不变式** —— 无夜间行动的角色永不得入队（覆盖全部纯被动角色，
 *     不止罂粟一个）。
 *   · `nightInfoGenerator` 兜底分支：纯被动角色不再合成"唤醒"文案，
 *     改标 `passiveNoAction`，下游 `handleNightAction` 见标记即跳过派发。
 *   · `rolesData.json`：poppy 订正为 `townsfolk` 并删除夜序。
 *
 * ⚠️ 反向验证要求：注释掉任一修复，本文件必须变红。
 */

import { describe, expect, it } from "vitest";
import {
  buildFullNightOrder,
} from "../invariantTesting/engineConfig";
import {
  generateDynamicNightQueue,
  roleHasNightAction,
  seatHasNightAction,
} from "../dynamicQueueGenerator";
import { generateNightTimeline, calculateNightInfo } from "../nightLogic";
import { generateNightInfo } from "../nightInfoGenerator";
import type { Seat } from "../../types";

// ─── 夹具 ──────────────────────────────────────────────────────────────

const poppySeat = (over: Partial<Seat> = {}): Seat =>
  ({
    id: 3,
    role: { id: "poppy_grower", name: "罂粟种植者", type: "townsfolk" } as any,
    isDead: false,
    statusDetails: [],
    ...over,
  }) as any;

const impSeat = (id = 0): Seat =>
  ({
    id,
    role: { id: "imp", name: "小恶魔", type: "demon" } as any,
    isDead: false,
    statusDetails: [],
  }) as any;

const minionSeat = (id = 1): Seat =>
  ({
    id,
    role: { id: "poisoner", name: "投毒者", type: "minion" } as any,
    isDead: false,
    statusDetails: [],
  }) as any;

const makeSnapshot = (seats: Seat[], over: Record<string, any> = {}) =>
  ({
    nightCount: 1,
    seats,
    phase: "night",
    deadThisNight: [],
    todayExecutedId: null,
    ...over,
  }) as any;

// ─── 0. 队列准入不变式：纯被动角色判定 ─────────────────────────────────

describe("🌺 队列准入不变式 roleHasNightAction", () => {
  it("罂粟种植者没有任何夜间行动", () => {
    expect(roleHasNightAction("poppy_grower")).toBe(false);
  });

  it("男爵（纯被动设置角色）没有夜间行动", () => {
    expect(roleHasNightAction("baron")).toBe(false);
  });

  it("主动角色仍被判为有夜间行动（防止一刀切误伤）", () => {
    for (const id of ["imp", "poisoner", "washerwoman", "chef", "soldier"]) {
      expect(roleHasNightAction(id), `${id} 应被判定为有夜间行动`).toBe(true);
    }
  });

  it("系统步骤（爪牙互认 / 恶魔互认）必须放行", () => {
    expect(roleHasNightAction("minion_info")).toBe(true);
    expect(roleHasNightAction("demon_info")).toBe(true);
  });

  it("酒鬼 / 提线木偶按伪装身份判定：伪装成罂粟 → 无夜间行动", () => {
    expect(
      seatHasNightAction({
        role: { id: "drunk", type: "outsider" },
        charadeRole: { id: "poppy_grower", type: "townsfolk" },
      })
    ).toBe(false);
    expect(
      seatHasNightAction({
        role: { id: "marionette", type: "minion" },
        charadeRole: { id: "poppy_grower", type: "townsfolk" },
      })
    ).toBe(false);
    // 对照：伪装成一个真有夜间行动的镇民 → 必须放行
    expect(
      seatHasNightAction({
        role: { id: "drunk", type: "outsider" },
        charadeRole: { id: "librarian", type: "townsfolk" },
      })
    ).toBe(true);
  });
});

// ─── 1. Path A：动态队列生成器（新引擎） ─────────────────────────────

describe("🌺 罂粟种植者 · Path A generateDynamicNightQueue", () => {
  const order = buildFullNightOrder();

  it("首夜：罂粟种植者**不得**作为行动者进队列", () => {
    const snap = makeSnapshot([impSeat(), minionSeat(), poppySeat()]);
    const queue = generateDynamicNightQueue(order, snap, {
      isFirstNight: true,
    });
    const hit = queue.find((n) => n.roleId === "poppy_grower");
    expect(
      hit,
      `罂粟种植者不应在首夜被唤醒，但队列里出现了：${JSON.stringify(
        queue.map((n) => `${n.seatId + 1}号 ${n.roleName}`)
      )}`
    ).toBeUndefined();
  });

  it("非首夜：罂粟种植者**不得**作为行动者进队列", () => {
    const snap = makeSnapshot([impSeat(), minionSeat(), poppySeat()], {
      nightCount: 3,
      hasCompletedFirstNight: true,
    });
    const queue = generateDynamicNightQueue(order, snap, {
      isFirstNight: false,
    });
    const hit = queue.find((n) => n.roleId === "poppy_grower");
    expect(
      hit,
      `罂粟种植者不应在非首夜被唤醒，但队列里出现了：${JSON.stringify(
        queue.map((n) => `${n.seatId + 1}号 ${n.roleName}`)
      )}`
    ).toBeUndefined();
  });

  it("罂粟种植者死亡当晚：仍不得作为行动者进队列（该由爪牙/恶魔互认）", () => {
    const snap = makeSnapshot(
      [impSeat(), minionSeat(), poppySeat({ isDead: true })],
      {
        nightCount: 3,
        hasCompletedFirstNight: true,
        poppyGrowerDead: true,
        deadThisNight: [3],
      }
    );
    const queue = generateDynamicNightQueue(order, snap, {
      isFirstNight: false,
    });
    expect(queue.find((n) => n.roleId === "poppy_grower")).toBeUndefined();
    // 死亡当晚应当由爪牙互认 / 恶魔互认承接（能力按官方流程转交）
    expect(queue.some((n) => n.roleId === "minion_info")).toBe(true);
  });

  it("酒鬼伪装成罂粟种植者：该座位也不得进队列", () => {
    const drunk = {
      id: 4,
      role: { id: "drunk", name: "酒鬼", type: "outsider" },
      charadeRole: { id: "poppy_grower", name: "罂粟种植者", type: "townsfolk" },
      isDead: false,
      statusDetails: [],
    } as any;
    const snap = makeSnapshot([impSeat(), minionSeat(), drunk]);
    const queue = generateDynamicNightQueue(order, snap, {
      isFirstNight: true,
    });
    expect(
      queue.find((n) => n.seatId === 4),
      `伪装成罂粟种植者的酒鬼不应进队列：${JSON.stringify(
        queue.map((n) => `${n.seatId + 1}号 ${n.roleName}`)
      )}`
    ).toBeUndefined();
  });
});

// ─── 2. Path B：旧引擎 generateNightTimeline ────────────────────────

describe("🌺 罂粟种植者 · Path B generateNightTimeline", () => {
  it("首夜：不得出现在唤醒时间线中", () => {
    const steps = generateNightTimeline([impSeat(), minionSeat(), poppySeat()], true, 0);
    const hit = steps.find((s: any) => s.role?.id === "poppy_grower");
    expect(
      hit,
      `罂粟种植者不应在首夜被唤醒，时间线：${JSON.stringify(
        steps.map((s: any) => s.role?.name)
      )}`
    ).toBeUndefined();
  });

  it("非首夜：不得出现在唤醒时间线中", () => {
    const steps = generateNightTimeline([impSeat(), minionSeat(), poppySeat()], false, 3);
    const hit = steps.find((s: any) => s.role?.id === "poppy_grower");
    expect(
      hit,
      `罂粟种植者不应在非首夜被唤醒，时间线：${JSON.stringify(
        steps.map((s: any) => s.role?.name)
      )}`
    ).toBeUndefined();
  });
});

// ─── 3. 第二道防线：nightInfoGenerator 纯被动兜底 ─────────────────────

describe("🌺 nightInfoGenerator 纯被动角色兜底", () => {
  const poppyAt = (seatId: number) =>
    [
      impSeat(0),
      minionSeat(1),
      poppySeat({ id: seatId }),
    ] as any[];

  for (const phase of ["firstNight", "night"] as const) {
    it(`${phase}：罂粟种植者座位必须带 passiveNoAction 且文案不得是"唤醒…准备执行技能"`, () => {
      const info: any = (generateNightInfo as any)(
        null,
        poppyAt(3),
        3,
        phase,
        null,
        1
      );
      expect(info, "应返回 nightInfo（保证 UI 不为空）").toBeTruthy();
      // 核心断言：必须标记为纯被动，下游据此跳过能力派发
      expect(
        info.passiveNoAction,
        `passiveNoAction 应为 true，实际 ${info.passiveNoAction}；文案=${info.guide}`
      ).toBe(true);
      // 文案不得再宣称"唤醒…准备执行技能"
      expect(
        /准备执行技能/.test(String(info.guide)),
        `文案不应是唤醒指令，实际：${info.guide}`
      ).toBe(false);
    });
  }

  it("对照：真有夜间行动的角色不得被标成 passiveNoAction", () => {
    const seats = [impSeat(0), minionSeat(1), poppySeat()] as any[];
    // 投毒者（有夜序）走另一条分支，不应带 passiveNoAction
    const info: any = (generateNightInfo as any)(
      null,
      seats,
      1,
      "firstNight",
      null,
      1
    );
    expect(info?.passiveNoAction).not.toBe(true);
  });
});

// ─── 4. 对照：被动屏蔽功能必须仍然生效（防止"一刀切"修坏） ───────────

describe("🌺 罂粟种植者 · 被动屏蔽不得被误伤", () => {
  const order = buildFullNightOrder();

  it("罂粟种植者存活时，首夜爪牙互认/恶魔互认信息被屏蔽", () => {
    const snap = makeSnapshot([impSeat(), minionSeat(), poppySeat()]);
    const queue = generateDynamicNightQueue(order, snap, {
      isFirstNight: true,
    });
    expect(queue.some((n) => n.roleId === "minion_info")).toBe(false);
    expect(queue.some((n) => n.roleId === "legion_mutual_recognition")).toBe(
      false
    );
  });

  it("罂粟种植者存活时，首夜恶魔仍被唤醒获取三个伪装", () => {
    const snap = makeSnapshot([impSeat(), minionSeat(), poppySeat()]);
    const queue = generateDynamicNightQueue(order, snap, {
      isFirstNight: true,
    });
    expect(queue.some((n) => n.roleId === "demon_info")).toBe(true);
  });
});

// ─── 5. 数据订正：rolesData.json 中 poppy 必须是镇民且无夜序 ──────────

describe("🌺 rolesData.json 数据订正", () => {
  it("poppy_grower 应为 townsfolk 且不得声明 firstNightOrder/otherNightOrder", () => {
    const data = require("../../data/rolesData.json");
    const entry = (data as any[]).find((r) => r.id === "poppy_grower");
    expect(entry, "rolesData.json 应存在 poppy_grower 条目").toBeTruthy();
    expect(entry.type, `type 应为 townsfolk，实际 ${entry.type}`).toBe(
      "townsfolk"
    );
    expect(
      entry.firstNightOrder,
      "纯被动角色不得声明首夜顺序"
    ).toBeUndefined();
    expect(
      entry.otherNightOrder,
      "纯被动角色不得声明其他夜晚顺序"
    ).toBeUndefined();
  });
});

// ─── 6. 接线回归：动态插入入口必须挂准入闸门 ─────────────────────────

describe("🌺 接线回归 · insertIntoWakeQueueAfterCurrent 准入闸门", () => {
  const source = require("fs").readFileSync(
    require("path").resolve(__dirname, "../../hooks/useGameController.ts"),
    "utf-8"
  ) as string;

  it("insertIntoWakeQueueAfterCurrent 内必须调用准入判定（roleHasNightAction / seatHasNightAction）", () => {
    const start = source.indexOf("const insertIntoWakeQueueAfterCurrent = useCallback(");
    expect(start, "未找到 insertIntoWakeQueueAfterCurrent 定义").toBeGreaterThan(-1);
    // 取该函数开头 1200 字符窗口（足够覆盖闸门代码）
    const window = source.slice(start, start + 1200);
    expect(
      /roleHasNightAction|seatHasNightAction/.test(window),
      "insertIntoWakeQueueAfterCurrent 必须调用夜序准入判定，否则纯被动角色可被塞进队列"
    ).toBe(true);
  });

  it("nightInfoGenerator 的纯被动兜底必须使用准入门槛而非无条件合成唤醒文案", () => {
    const genSource = require("fs").readFileSync(
      require("path").resolve(__dirname, "../nightInfoGenerator.ts"),
      "utf-8"
    ) as string;
    expect(
      /passiveNoAction/.test(genSource),
      "nightInfoGenerator 必须产出 passiveNoAction 标记"
    ).toBe(true);
    expect(
      /roleHasNightAction/.test(genSource),
      "nightInfoGenerator 必须用 roleHasNightAction 判定纯被动角色"
    ).toBe(true);
  });

  it("handleNightAction 必须消费 passiveNoAction 标记并跳过派发", () => {
    const handlerSource = require("fs").readFileSync(
      require("path").resolve(__dirname, "../../hooks/useNightActionHandler.ts"),
      "utf-8"
    ) as string;
    expect(
      /passiveNoAction/.test(handlerSource),
      "useNightActionHandler 必须检查 passiveNoAction，否则仍会弹结果窗"
    ).toBe(true);
  });
});

// ─── 7. 🔒 罂粟门控真值（calculateNightInfo 第 10 参数 poppyGrowerDead）─────
//
// 【为什么单列一组】此前全仓库**没有任何测试直接调用 calculateNightInfo**，
//   门控分支（nightLogic.ts:461-484）处于**零覆盖**状态：
//   把 shouldHideDemon 恒置 false，全部既有测试仍然全绿。
//
// 【官方规则】「爪牙和恶魔互相不认识。如果你死亡，当晚他们会互相认识。」
//   ⇒ 首次夜间"爪牙认恶魔"环节是否展示恶魔，取决于罂粟是否在**首夜结算时**
//     仍然生效（存活 + 未被永久驱散）。
//
// 【行动者为什么用 baron】该分支的进入条件是 `!nightConfig`
//   （nightLogic.ts:300 的 `if (nightConfig) … else …`）。
//   有夜序配置的爪牙（poisoner/spy/cerenovus/evil_twin）走 if 分支，
//   **永远到不了**这个门控；只有 baron / marionette 这类**无夜序爪牙**
//   才会落进 else → 门控真实生效对象。用 baron 才能测到真东西。
//
// 【断言的是状态，不是文案】用 action 字段（"无信息" / "展示恶魔"）
//   作为**机器可判定的语义**，guide 文案仅作辅助佐证。

describe("🌺 罂粟门控真值 · calculateNightInfo(…, poppyGrowerDead)", () => {
  const script = null as any;
  const firstNight = "firstNight" as any;

  // baron 座位（无夜序配置的爪牙 → 唯一落入门控分支的角色类型）
  const baronSeat = (id = 1): Seat =>
    ({
      id,
      role: { id: "baron", name: "男爵", type: "minion" } as any,
      isDead: false,
      statusDetails: [],
    }) as any;

  // 爪牙视角（召唤"爪牙认恶魔"分支）
  const minionView = (seats: Seat[], poppyGrowerDead?: boolean) =>
    calculateNightInfo(
      script,
      seats,
      baronSeat().id, // currentSeatId = 1
      firstNight,
      null,
      1, // nightCount
      undefined,
      undefined,
      undefined,
      poppyGrowerDead
    ) as any;

  it("罂粟存活且生效（poppyGrowerDead===false）→ 爪牙不认恶魔，action=无信息", () => {
    const res = minionView([impSeat(), baronSeat(), poppySeat()], false);
    expect(res, "爪牙首夜应产出节点").toBeTruthy();
    expect(res.roleId, "行动者应是男爵").toBe("baron");
    expect(
      res.action,
      "罂粟生效时不得展示恶魔（应为『无信息』），实际 " + res.action
    ).toBe("无信息");
    expect(res.guide).toContain("罂粟种植者在场");
    expect(res.guide).not.toContain("爪牙认恶魔环节");
  });

  it("🔴 罂粟死亡当晚（poppyGrowerDead===true）→ 爪牙互认恶魔，action=展示恶魔", () => {
    const res = minionView([impSeat(), baronSeat(), poppySeat()], true);
    expect(res, "爪牙首夜应产出节点").toBeTruthy();
    expect(
      res.action,
      "罂粟失效时爪牙必须认恶魔（应为『展示恶魔』），实际 " + res.action
    ).toBe("展示恶魔");
    expect(res.guide).toContain("爪牙认恶魔环节");
    expect(res.guide, "应告知恶魔座位").toContain("1号"); // impSeat id=0 → 显示 1号
    expect(res.guide).not.toContain("罂粟种植者在场");
  });

  it("🔴 罂粟座位已死（isDead=true）→ 即使 poppyGrowerDead 未传也认恶魔", () => {
    const deadPoppy = poppySeat({ isDead: true });
    const res = minionView([impSeat(), baronSeat(), deadPoppy]); // 不传第 10 参数
    expect(
      res.action,
      "罂粟已死时爪牙必须认恶魔，实际 " + res.action
    ).toBe("展示恶魔");
  });

  it("🔴 本局无罂粟 → 正常爪牙认恶魔（不误伤常规局）", () => {
    const res = minionView([impSeat(), baronSeat()], undefined);
    expect(
      res.action,
      "无罂粟的常规首夜爪牙必须认恶魔，实际 " + res.action
    ).toBe("展示恶魔");
  });

  it("🔒 反例守护：poppyGrowerDead===undefined（调用方未计算）时**不得**静默屏蔽", () => {
    // 若把门控写成 `poppyGrowerDead !== true` 之类的宽松判定，
    // 未传参（undefined）时会错误地屏蔽邪恶互认 → 本断言会红。
    const res = minionView([impSeat(), baronSeat(), poppySeat()], undefined);
    expect(
      res.action,
      "未显式传入 poppyGrowerDead=false 时不应屏蔽（严格 === false 语义）"
    ).toBe("展示恶魔");
  });

  it("🔒 门控只作用于 firstNight：其他夜晚不产出认恶魔节点", () => {
    const res = calculateNightInfo(
      script,
      [impSeat(), baronSeat(), poppySeat()],
      baronSeat().id,
      "night" as any,
      null,
      2,
      undefined,
      undefined,
      undefined,
      true
    ) as any;
    // 非首夜：爪牙分支不进入 → 不得是『展示恶魔』
    expect(res?.action ?? "跳过").not.toBe("展示恶魔");
  });
});

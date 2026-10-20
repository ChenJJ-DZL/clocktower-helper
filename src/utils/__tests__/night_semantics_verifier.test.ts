/**
 * I10/I11/I12 语义验证器单测（2026-10-20）
 * ==================================================================
 * 事故背景：首轮全真模拟 14 条 I10-order 全是**验证器误报**——
 *   弹窗标题是步骤名（「6号-恶魔互认」），队列是角色名（「疯子(恶魔互认)」），
 *   字符串比对必然错位；且同一步骤「行动确认+结果」双弹窗各记一条 ⇒ 同名重复
 *   被当成越序。修复 = 按座位号对账 + 相邻双弹窗去重。
 */
import { describe, expect, it } from "vitest";
import {
  verifyDuskSemantics,
  verifyNightSemantics,
  type NightStepRecord,
  type QueueEntry,
} from "../../../e2e/helpers/fullSim";

const step = (
  stepIdx: number,
  seatId: number | null,
  roleName: string | null,
  opts: Partial<NightStepRecord> = {}
): NightStepRecord => ({
  stepIdx,
  roleName,
  seatId,
  dialogText: "x".repeat(30),
  targets: [],
  after: null,
  gameOverAfter: false,
  ...opts,
});

const queue: QueueEntry[] = [
  { seatId: 9, label: "阵营告知" },
  { seatId: 1, label: "爪牙互认" },
  { seatId: 5, label: "疯子(恶魔互认)" },
  { seatId: 7, label: "涡流(恶魔互认)" },
  { seatId: 10, label: "小精灵" },
];

describe("I10 顺序：按座位号对账（名字形态不同不再误报）", () => {
  it("顺序正确 + 双弹窗 ⇒ 零违规", () => {
    const journal = [
      step(0, 9, "阵营告知"),
      step(1, 9, "阵营告知"), // 同一步骤的结果弹窗（去重）
      step(2, 1, "爪牙互认"),
      step(3, 1, "爪牙互认"), // 双弹窗
      step(4, 5, "恶魔互认"), // 步骤名 ≠ 队列名「疯子(恶魔互认)」——按座位号对上
      step(5, 5, "恶魔互认"),
      step(6, 7, "恶魔互认"),
      step(7, 10, "小精灵"),
      step(8, null, null), // 系统步骤（夜晚结算报告）不参与
    ];
    expect(verifyNightSemantics(journal, queue)).toEqual([]);
  });

  it("真实越序（先 5 号后 1 号）⇒ 必须报 I10", () => {
    const journal = [step(0, 5, "恶魔互认"), step(1, 1, "爪牙互认")];
    const out = verifyNightSemantics(journal, queue);
    expect(out.some((v) => v.invariant === "I10-order")).toBe(true);
  });

  it("队列步骤跳过（只读步骤未弹窗）不报违规", () => {
    // 9 号（阵营告知）不弹窗，直接从 1 号开始 —— 允许
    const journal = [step(0, 1, "爪牙互认"), step(1, 10, "小精灵")];
    expect(verifyNightSemantics(journal, queue)).toEqual([]);
  });
});

describe("I11 效果：技能结算必须落库", () => {
  it("僧侣选人后未落 isProtected ⇒ 报 I11", () => {
    const journal = [
      step(0, 3, "僧侣", {
        targets: [5],
        after: { isProtected: false, statusTypes: [] },
      }),
    ];
    const out = verifyNightSemantics(journal, []);
    expect(out.some((v) => v.invariant === "I11-effect")).toBe(true);
  });

  it("小恶魔选人后落 markedForDeath ⇒ 零违规", () => {
    const journal = [
      step(0, 3, "小恶魔", {
        targets: [5],
        after: { markedForDeath: true, statusTypes: ["markedForDeath"] },
      }),
    ];
    expect(verifyNightSemantics(journal, [])).toEqual([]);
  });

  /**
   * 🔴 2026-10-20 实测回归（seed=20261020 night#5 军团杀 11 号）
   * 该步骤同时触发邪恶胜利 ⇒ 按既有设计「终局不落快照」⇒ 读到的是终局前冻结值
   * （isDead:false / 无 markedForDeath）⇒ 误报「击杀未落库」。
   * 活终态 DOM 已确认该座位死亡 ⇒ 终局步骤必须跳过 I11（不是放水：
   * 终局后果由 deadSeatsLive + 官方四条另行校验）。
   */
  it("终局步骤（gameOverAfter）不影响 I11 判定", () => {
    const journal = [
      step(0, 2, "军团", {
        targets: [10],
        after: { isDead: false, statusTypes: [] },
        gameOverAfter: true,
      }),
    ];
    expect(verifyNightSemantics(journal, [])).toEqual([]);
  });

  it("非终局的同类情况仍必须报 I11（不能因上一用例放水）", () => {
    const journal = [
      step(0, 2, "军团", {
        targets: [10],
        after: { isDead: false, statusTypes: [] },
      }),
    ];
    const out = verifyNightSemantics(journal, []);
    expect(out.some((v) => v.invariant === "I11-effect")).toBe(true);
  });
});

describe("I12 信息：信息类弹窗必须有实质内容", () => {
  it("空壳信息弹窗 ⇒ 报 I12", () => {
    const journal = [step(0, 4, "图书管理员", { dialogText: "短" })];
    const out = verifyNightSemantics(journal, []);
    expect(out.some((v) => v.invariant === "I12-info")).toBe(true);
  });

  it("实质内容 ⇒ 零违规", () => {
    const journal = [
      step(0, 4, "图书管理员", {
        dialogText: "5号-图书管理员获得信息3号和1号之中有一名是【解谜大师】",
      }),
    ];
    expect(verifyNightSemantics(journal, [])).toEqual([]);
  });
});

/**
 * 🔴 2026-10-20 实测回归（E2E seed=2026 实锤 4 条误报）
 * ==================================================================
 * 事故：首夜实跑队列（`wakeQueueIds`）= 9号:阵营告知 > 5号:爪牙互认 >
 *   3号:小恶魔(恶魔互认) > 5号:洗脑师 > 10号:小精灵 > 9号:图书管理员 > …
 *   但预览面板快照漏了 `isEvilConverted` ⇒ 面板队列**缺**「阵营告知」，
 *   而阵营告知与图书管理员**同座位 8** ⇒ 它抢走图书管理员的队列槽位，
 *   随后 5 号/3 号/9 号的合法步骤全被判「越序」。
 *
 * 两条独立防线（都必须成立，缺一会复发）：
 *   ① 面板快照透传 `isEvilConverted`（源头对齐，`useGameController`）；
 *   ② 验证器：系统/告知步骤不占队列槽位 + 优先用执行侧真值 `wakeIds`。
 */
describe("I10 抗误报：系统步骤不占槽位 / 执行侧真值优先", () => {
  it("阵营告知（与图书管理员同座位 8）不得抢走队列槽位", () => {
    // 面板队列缺「阵营告知」，但执行侧真值 wakeIds 含座位 8 两次
    const panelQueue: QueueEntry[] = [
      { seatId: 4, label: "爪牙互认" },
      { seatId: 2, label: "小恶魔(恶魔互认)" },
      { seatId: 4, label: "洗脑师" },
      { seatId: 9, label: "小精灵" },
      { seatId: 8, label: "图书管理员" },
    ];
    const journal = [
      step(0, 8, "阵营告知"), // 系统步骤：不占槽位
      step(1, 8, "阵营告知"),
      step(2, 4, "爪牙互认"),
      step(3, 4, "爪牙互认"),
      step(4, 2, "恶魔互认"),
      step(5, 4, "洗脑师"),
      step(6, null, null), // 技能告知（洗脑）不占槽位
      step(7, 9, "小精灵"),
      step(8, 8, "图书管理员"),
    ];
    // 无执行侧真值时（只靠面板队列 + 系统步骤过滤）⇒ 也不得报错
    expect(verifyNightSemantics(journal, panelQueue)).toEqual([]);
    // 有执行侧真值时同样零违规
    expect(
      verifyNightSemantics(journal, panelQueue, [8, 4, 2, 4, 9, 8])
    ).toEqual([]);
  });

  it("执行侧真值 `wakeIds` 优先于面板队列（面板缺步不再误判）", () => {
    const panelQueue: QueueEntry[] = [{ seatId: 4, label: "爪牙互认" }];
    // 真实执行队列里座位 8 在前（阵营告知），面板却只有 4 号
    const journal = [step(0, 8, "阵营告知"), step(1, 4, "爪牙互认")];
    expect(verifyNightSemantics(journal, panelQueue, [8, 4])).toEqual([]);
  });

  it("执行侧真值下的真实越序仍必须报错", () => {
    const journal = [step(0, 4, "爪牙互认"), step(1, 8, "图书管理员")];
    const out = verifyNightSemantics(journal, [], [8, 4]);
    expect(out.some((v) => v.invariant === "I10-order")).toBe(true);
  });

  it("技能告知（seatId=null）与夜晚结算报告不参与对账", () => {
    const journal = [
      step(0, 4, "洗脑师"),
      step(1, null, null, { dialogText: "🧠 技能告知你需要疯狂证明自己是【镇长】" }),
      step(2, 4, "洗脑师"),
      step(3, null, null, { dialogText: "🌙 夜晚结算报告：昨天是个平安夜" }),
    ];
    expect(verifyNightSemantics(journal, [], [4])).toEqual([]);
  });
});

describe("I13 覆盖：弹窗座位必须在本夜唤醒队列里（防验证器假阴性）", () => {
  it("全部座位都在队列 ⇒ 零违规", () => {
    const journal = [step(0, 9, "阵营告知"), step(1, 1, "爪牙互认"), step(2, 10, "小精灵")];
    expect(verifyNightSemantics(journal, queue)).toEqual([]);
  });

  it("🔴 首夜唤醒了不在队列的角色（神谕者 firstNightPriority:null）⇒ 必须报 I13", () => {
    // 复刻 2026-10-20 seed=2026 真 bug 形态：10 号小精灵正常，末尾多出 8 号神谕者
    const journal = [
      step(0, 9, "阵营告知"),
      step(1, 1, "爪牙互认"),
      step(2, 10, "小精灵"),
      // ⚠️ 队列现有座位 = 9/1/5/7/10，必须挑一个**确实不在其中**的座位
      step(3, 2, "神谕者"), // seat 2 不在 queue（首夜本不该行动）
    ];
    const out = verifyNightSemantics(journal, queue);
    const hit = out.find((v) => v.invariant === "I13-unqueued");
    expect(hit, "I13 必须抓住「队列外多跑一步」").toBeTruthy();
    expect(hit!.detail).toContain("3号");
  });

  it("执行侧真值下同样生效（面板队列漏步也不放行队列外座位）", () => {
    const journal = [step(0, 9, "阵营告知"), step(1, 3, "小恶魔")];
    const out = verifyNightSemantics(journal, [], [9]);
    expect(out.some((v) => v.invariant === "I13-unqueued")).toBe(true);
  });

  it("告知类系统步骤的座位不在队列 ⇒ 不误报（洗脑告知/技能告知）", () => {
    const journal = [
      step(0, 4, "洗脑师"),
      step(1, 4, "技能告知"),
      step(2, 4, "技能修正"),
    ];
    expect(verifyNightSemantics(journal, [{ seatId: 4, label: "洗脑师" }])).toEqual([]);
  });

  it("空队列（未读到夜序面板）⇒ 不做 I13 判定，避免全量误报", () => {
    const journal = [step(0, 3, "小恶魔")];
    // queue 与 wakeIds 都为空 ⇒ qSeatSet 空 ⇒ 不能把所有座位都判成队列外
    expect(verifyNightSemantics(journal, [], null)).toEqual([]);
  });
});

describe("I14 处决结算：点名处决必须真的死一人（白天唯一效果判据）", () => {
  const rec = (before: number[] | null, after: number[] | null, gameOver = false) => ({
    before,
    after,
    gameOver,
  });

  it("处决死 1 人 ⇒ 零违规", () => {
    expect(verifyDuskSemantics(rec([1, 2], [1, 2, 5]))).toEqual([]);
  });

  it("🔴 处决后无人死亡 ⇒ 必须报 I14", () => {
    const out = verifyDuskSemantics(rec([1, 2], [1, 2]));
    expect(out.some((v) => v.invariant === "I14-execute")).toBe(true);
  });

  it("🔴 一次处决死 2 人 ⇒ 必须报 I14", () => {
    const out = verifyDuskSemantics(rec([1], [1, 4, 5]));
    expect(out.some((v) => v.invariant === "I14-execute")).toBe(true);
  });

  it("市长转移（被处决者不死、他人死）⇒ 新增 1 人 ⇒ 零违规", () => {
    expect(verifyDuskSemantics(rec([1, 2, 3], [1, 2, 3, 7]))).toEqual([]);
  });

  it("终局结算 ⇒ 跳过（终局不落快照，before/after 不可信）", () => {
    expect(verifyDuskSemantics(rec([1], [1], true))).toEqual([]);
  });

  it("没读到快照 / 本昼无提名通过 ⇒ 不做判定", () => {
    expect(verifyDuskSemantics(null)).toEqual([]);
    expect(verifyDuskSemantics(rec(null, [1]))).toEqual([]);
    expect(verifyDuskSemantics(rec([1], null))).toEqual([]);
  });
});

describe("I11 效果的前提：施法者被醉酒/中毒 ⇒ 技能合法失效（不误报）", () => {
  it("僧侣自身中毒、结果弹窗写明「未生效」⇒ 零违规", () => {
    const journal = [
      step(0, 5, "僧侣", {
        dialogText: "🌙 6号-僧侣 - 行动确认 确认为【5号】执行神圣保护吗",
        targets: [4],
        after: { isProtected: false, markedForDeath: false, isPoisoned: false, isDead: false, statusTypes: [] },
      }),
      step(1, 5, "僧侣", {
        dialogText: "6号-僧侣获得信息：僧侣试图保护【5号】，但自身醉酒/中毒未生效",
      }),
    ];
    expect(verifyNightSemantics(journal, [{ seatId: 5, label: "僧侣" }])).toEqual([]);
  });

  it("🔴 未中毒且保护未落库 ⇒ 仍必须报 I11（防放水）", () => {
    const journal = [
      step(0, 5, "僧侣", {
        dialogText: "6号-僧侣 - 行动确认",
        targets: [4],
        after: { isProtected: false, markedForDeath: false, isPoisoned: false, isDead: false, statusTypes: [] },
      }),
      step(1, 5, "僧侣", { dialogText: "6号-僧侣获得信息：已保护【5号】" }),
    ];
    const out = verifyNightSemantics(journal, [{ seatId: 5, label: "僧侣" }]);
    expect(out.some((v) => v.invariant === "I11-effect")).toBe(true);
  });

  it("恶魔被干扰 ⇒ 击杀未落库也不误报", () => {
    const journal = [
      step(0, 2, "小恶魔", {
        dialogText: "3号-小恶魔 - 行动确认",
        targets: [7],
        after: { isProtected: false, markedForDeath: false, isPoisoned: false, isDead: false, statusTypes: [] },
      }),
      step(1, 2, "小恶魔", { dialogText: "3号-小恶魔：本次击杀未生效（你已醉酒）" }),
    ];
    expect(verifyNightSemantics(journal, [{ seatId: 2, label: "小恶魔" }])).toEqual([]);
  });
});

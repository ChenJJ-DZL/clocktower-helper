import { describe, expect, it } from "vitest";
import type { Seat } from "../../../../app/data";
import { roles as allRoles } from "../../../../app/data";
import { generateDynamicNightQueue } from "../../../utils/dynamicQueueGenerator";
import { calculateNightInfoViaNewEngine } from "../../../utils/nightInfoAdapter";
import { computeDemonBluffNames } from "../../../utils/lunaticFakeInfo";
import { isRealMinion, isLunaticSeat } from "../../../utils/roleFlags";
import type { GameStateSnapshot } from "../../../utils/nightStateMachine";

/**
 * A 组（疯子 = 完整"假恶魔"体验）集成测试
 *
 * 官方依据（json/wiki_crawl/parsed_roles.json「疯子」）：
 *   能力：「你以为你是一个恶魔，但其实你不是。恶魔知道你是疯子以及你在每个夜晚
 *          选择了哪些玩家。」
 *   简介 1：「疯子每个夜晚都会被唤醒来发动攻击，就如同他是场上真正的恶魔，
 *            但是疯子的选择没有效果。」
 *   简介 2：「疯子会在首个夜晚被唤醒来得知三个不在场的角色，以及与当前游戏数量
 *            符合的爪牙，但是这些信息可能是错误的。」
 *   简介 3：「真正的恶魔会知道疯子每个夜晚攻击了哪些玩家。」
 */

const SCRIPT = {
  id: "test_lunatic_script",
  name: "测试剧本",
  roleIds: [
    "chef",
    "empath",
    "washerwoman",
    "saint",
    "lunatic",
    "poisoner",
    "baron",
    "imp",
  ],
} as any;

const NIGHT_ORDER = [
  {
    roleId: "minion_info",
    roleName: "爪牙互认",
    firstNightPriority: 1.5,
    otherNightPriority: 0,
    firstNightOnly: true,
    wakeMessage: "minion_info",
    abilityId: "minion_info",
  },
  {
    roleId: "demon_info",
    roleName: "恶魔互认",
    firstNightPriority: 2.5,
    otherNightPriority: 0,
    firstNightOnly: true,
    wakeMessage: "demon_info",
    abilityId: "demon_info",
  },
  {
    roleId: "lunatic",
    roleName: "疯子",
    firstNightPriority: 15,
    otherNightPriority: 39,
    firstNightOnly: false,
    wakeMessage: "lunatic",
    abilityId: "lunatic_fake_kill",
  },
  {
    roleId: "imp",
    roleName: "小恶魔",
    firstNightPriority: 0,
    otherNightPriority: 40,
    firstNightOnly: false,
    wakeMessage: "imp",
    abilityId: "imp",
  },
  {
    roleId: "shabaloth",
    roleName: "沙巴洛斯",
    firstNightPriority: 0,
    otherNightPriority: 45,
    firstNightOnly: false,
    wakeMessage: "shabaloth",
    abilityId: "shabaloth",
  },
  {
    // A7② 用：优先级很晚的"假恶魔"（78 > 真恶魔小恶魔 40）
    roleId: "vortox",
    roleName: "涡流",
    firstNightPriority: 0,
    otherNightPriority: 78,
    firstNightOnly: false,
    wakeMessage: "vortox",
    abilityId: "vortox",
  },
  {
    roleId: "kazali",
    roleName: "卡扎力",
    firstNightPriority: 3,
    otherNightPriority: 41,
    firstNightOnly: false,
    wakeMessage: "kazali",
    abilityId: "kazali",
  },
] as any;

const seat = (id: number, roleId: string) => {
  const r = allRoles.find((x) => x.id === roleId)!;
  return { id, role: { id: r.id, name: r.name, type: r.type }, isDead: false };
};

const LUNA = 1;
const IMP = 7;
const POISONER = 2;

const demonRole = (id: string) => {
  const r = allRoles.find((x) => x.id === id)!;
  return { id: r.id, name: r.name, type: r.type };
};

/** 8 人局：0厨师 1疯子(以为自己是沙巴洛斯) 2投毒者 3男爵 4共情者 5洗衣妇 6圣徒 7小恶魔 */
const seats = [
  seat(0, "chef"),
  { ...seat(1, "lunatic"), apparentDemonRole: demonRole("shabaloth") },
  seat(2, "poisoner"),
  seat(3, "baron"),
  seat(4, "empath"),
  seat(5, "washerwoman"),
  seat(6, "saint"),
  seat(7, "imp"),
] as unknown as Seat[];

const snapshotOf = (s: Seat[], isFirstNight = true) =>
  ({
    seats: s,
    nightCount: 1,
    gamePhase: isFirstNight ? "firstNight" : "night",
    statusEffects: {},
    globalEffects: {},
  }) as unknown as GameStateSnapshot;

const queue = (s: Seat[], isFirstNight: boolean) =>
  generateDynamicNightQueue(NIGHT_ORDER, snapshotOf(s, isFirstNight), {
    isFirstNight,
  });

describe("A1 · 首夜疯子被「当作恶魔」唤醒", () => {
  it("① 首夜队列里存在一个绑定到疯子座位的 demon_info 步骤", () => {
    const nodes = queue(seats, true).filter(
      (n) => n.roleId === "demon_info" && n.seatId === LUNA
    );
    expect(nodes).toHaveLength(1);
  });

  it("② 疯子走恶魔互认时拿到与真恶魔同款的「爪牙 + 3 张不在场伪装」", () => {
    const info = calculateNightInfoViaNewEngine(
      SCRIPT,
      seats,
      LUNA,
      "firstNight",
      null,
      1,
      "demon_info"
    );
    expect(info).not.toBeNull();
    expect(String(info?.guide)).toContain("爪牙是:");
    expect(String(info?.guide)).toContain("不在场伪装");
  });

  it("③ 疯子看到的 3 张伪装牌与真恶魔拿到的 3 张不重叠，且全为善良角色", () => {
    const demonBluffs = computeDemonBluffNames(seats, SCRIPT.roleIds);
    const info = calculateNightInfoViaNewEngine(
      SCRIPT,
      seats,
      LUNA,
      "firstNight",
      null,
      1,
      "demon_info"
    );
    const guide = String(info?.guide);
    const m = guide.match(/不在场伪装: 【(.+)】/);
    expect(m).not.toBeNull();
    const lunaticBluffs = m![1].split("】、【");
    expect(lunaticBluffs).toHaveLength(3);
    for (const name of lunaticBluffs) {
      const role = allRoles.find((r) => r.name === name)!;
      expect(role, name).toBeDefined();
      expect(["townsfolk", "outsider"]).toContain(role.type);
      expect(demonBluffs).not.toContain(name);
    }
  });

  it("④ 疯子看到的爪牙名单：数量 == 真实爪牙数，且不含任何真实邪恶座位", () => {
    const info = calculateNightInfoViaNewEngine(
      SCRIPT,
      seats,
      LUNA,
      "firstNight",
      null,
      1,
      "demon_info"
    );
    const guide = String(info?.guide);
    const m = guide.match(/爪牙是: ([^\n]*)/);
    expect(m).not.toBeNull();
    const listed = m![1]
      .split("、")
      .map((x) => Number(x.replace("号", "")) - 1)
      .filter((n) => Number.isFinite(n));
    expect(listed).toHaveLength(seats.filter((s) => isRealMinion(s)).length);
    const evilIds = seats
      .filter((s) => s.role?.type === "demon" || s.role?.type === "minion")
      .map((s) => s.id);
    for (const id of listed) {
      expect(evilIds).not.toContain(id);
    }
  });

  it("⑤ 真恶魔的恶魔互认仍然是真实信息（不受疯子影响）", () => {
    const info = calculateNightInfoViaNewEngine(
      SCRIPT,
      seats,
      IMP,
      "firstNight",
      null,
      1,
      "demon_info"
    );
    const guide = String(info?.guide);
    // 真恶魔看到的是真实爪牙：2号投毒者、4号男爵
    expect(guide).toContain("爪牙是: 3号、4号");
    // 真恶魔不会看到疯子的假伪装牌列表里的"假"标记
    expect(guide).not.toContain("沙巴洛斯");
  });

  it("⑥ 真爪牙的爪牙互认不因疯子的存在而获得任何新信息", () => {
    const minionNodes = queue(seats, true).filter(
      (n) => n.roleId === "minion_info"
    );
    // 只按真爪牙数展开，且不含疯子座位
    expect(minionNodes.map((n) => n.seatId)).toEqual([POISONER, 3]);
    const info = calculateNightInfoViaNewEngine(
      SCRIPT,
      seats,
      POISONER,
      "firstNight",
      null,
      1,
      "minion_info"
    );
    const guide = String(info?.guide);
    expect(guide).toContain("恶魔是: 8号");
    expect(guide).not.toContain("沙巴洛斯");
    expect(guide).not.toContain("疯子");
  });

  it("⑦ 疯子走恶魔互认时绝不显示提线木偶提示（官方只说「恶魔」知道）", () => {
    const marionetteSeat = seat(8, "marionette");
    const withMarionette = [...seats, marionetteSeat] as unknown as Seat[];
    const lunaticInfo = calculateNightInfoViaNewEngine(
      SCRIPT,
      withMarionette,
      LUNA,
      "firstNight",
      null,
      1,
      "demon_info"
    );
    expect(String(lunaticInfo?.guide)).not.toContain("提线木偶");
    // 真恶魔仍然知道谁是提线木偶（官方规则）
    const demonInfo = calculateNightInfoViaNewEngine(
      SCRIPT,
      withMarionette,
      IMP,
      "firstNight",
      null,
      1,
      "demon_info"
    );
    // ⚠️ 2026-09-13 P0（用户实测截图指出）：恶魔互认的 guide 会**直接渲染在
    //    「恶魔互认 - 结果」页上给玩家看**，提线木偶座号属说书人侧信息 →
    //    不得留在 guide，只允许进 storytellerNote（仅 GameConsole 渲染）。
    expect(String(demonInfo?.guide)).not.toContain("提线木偶: 9号");
    expect(String((demonInfo as any)?.storytellerNote)).toContain(
      "提线木偶: 9号"
    );
  });
});

describe("A6 · 罂粟种植者在场时，疯子仍只能拿到「自己的」假伪装牌", () => {
  /**
   * 官方「疯子·运作方式」：
   *   「向疯子展示**任意三个善良角色标记**作为他的"伪装"。
   *     （这些角色标记**甚至可以是在场的角色**。）」
   * 而真恶魔拿到的是「三个**不在场**的善良角色」。
   * ⇒ 两套伪装牌来自不同规则，**绝不能是同一组**。
   *
   * 罂粟种植者在场只是隐藏「爪牙/恶魔互认」，不影响疯子该拿自己的假伪装牌；
   * 之前 nightInfoAdapter 的罂粟分支直接把 regularBluffText（真恶魔那 3 张）
   * 给了疯子 → 疯子与真恶魔拿到完全相同的伪装牌（规则违规 + 信息泄漏）。
   */
  const SCRIPT_WITH_POPPY = {
    ...SCRIPT,
    roleIds: [
      ...SCRIPT.roleIds,
      "poppy_grower",
      // 补足「不在场」的善良角色，让真恶魔那 3 张伪装牌非空，
      // 从而能真正暴露"疯子被塞了恶魔那 3 张"的泄漏。
      "librarian",
      "investigator",
      "monk",
      "mayor",
      "soldier",
      "butler",
    ],
  } as any;

  /** 8 人局 + 9 号罂粟种植者 */
  const seatsWithPoppy = [
    ...seats,
    seat(9, "poppy_grower"),
  ] as unknown as Seat[];

  it("① 疯子拿到的伪装牌与真恶魔那 3 张不重叠（罂粟在场同样是假信息）", () => {
    const demonBluffs = computeDemonBluffNames(
      seatsWithPoppy,
      SCRIPT_WITH_POPPY.roleIds
    );
    const info = calculateNightInfoViaNewEngine(
      SCRIPT_WITH_POPPY,
      seatsWithPoppy,
      LUNA,
      "firstNight",
      null,
      1,
      "demon_info"
    );
    const guide = String(info?.guide);
    const m = guide.match(/不在场伪装: 【(.+)】/);
    expect(m, `疯子 guide 里应当有自己的伪装牌：${guide}`).not.toBeNull();
    const lunaticBluffs = m![1].split("】、【");
    expect(lunaticBluffs).toHaveLength(3);
    for (const name of lunaticBluffs) {
      // 关键断言：不得与真恶魔的伪装牌相同
      expect(demonBluffs, `「${name}」不能同时是恶魔的伪装牌`).not.toContain(name);
      const role = allRoles.find((r) => r.name === name)!;
      expect(role, name).toBeDefined();
      expect(["townsfolk", "outsider"]).toContain(role.type);
    }
  });

  it("② 疯子仍然拿到「假爪牙名单」：数量==真实爪牙数，座位号必须是错的", () => {
    const info = calculateNightInfoViaNewEngine(
      SCRIPT_WITH_POPPY,
      seatsWithPoppy,
      LUNA,
      "firstNight",
      null,
      1,
      "demon_info"
    );
    const guide = String(info?.guide);
    // ⚠️ 2026-09-12 用户裁决：罂粟在场**不再**抹掉疯子的假爪牙名单。
    //    疯子既不是爪牙也不是恶魔，罂粟的互认削弱不适用于它。
    expect(guide, guide).toContain("爪牙是:");
    expect(guide).not.toContain("你不知道爪牙是谁");
    const m = guide.match(/爪牙是: ([^\n]*)/);
    const listed = m![1]
      .split("、")
      .map((x) => Number(x.replace("号", "")) - 1)
      .filter((n) => Number.isFinite(n));
    const realMinionIds = seatsWithPoppy
      .filter((s) => isRealMinion(s))
      .map((s) => s.id);
    // 数量 == 场上真实爪牙数
    expect(listed).toHaveLength(realMinionIds.length);
    // 座位号必须全是**错的**（即一个真实邪恶座位都不能出现）
    for (const id of listed) {
      expect(realMinionIds, `假爪牙不得指向真实爪牙 ${id + 1}号`).not.toContain(
        id
      );
    }
  });

  it("③ 真恶魔在罂粟种植者场下：看不到爪牙、看得到不在场伪装，且**必须被告知谁是疯子**", () => {
    const demonBluffs = computeDemonBluffNames(
      seatsWithPoppy,
      SCRIPT_WITH_POPPY.roleIds
    );
    const info = calculateNightInfoViaNewEngine(
      SCRIPT_WITH_POPPY,
      seatsWithPoppy,
      IMP,
      "firstNight",
      null,
      1,
      "demon_info"
    );
    const guide = String(info?.guide);
    expect(guide).toContain("你不知道爪牙是谁");
    for (const name of demonBluffs) {
      expect(guide, `恶魔应看到伪装牌「${name}」`).toContain(name);
    }
    // 官方：「向恶魔展示"这名玩家是"信息标记，然后是疯子角色标记，然后指向疯子玩家。」
    // 罂粟种植者不屏蔽这条（疯子既不是爪牙也不是恶魔）
    expect(guide, guide).toContain(`疯子: ${LUNA + 1}号`);
  });
});

describe("A7 · 疯子恒在真恶魔之前（用自身槽位）· 互认节点也必须在前", () => {
  /**
   * ① 行动节点：官方夜序表已把疯子排在所有恶魔之前（首夜 33 / 其它夜 62），
   *    「在恶魔被唤醒发动攻击前，唤醒疯子」由该槽位本身保证。
   *    ⚠️ 旧实现把疯子改成**假恶魔**的优先级 → 假恶魔晚于真恶魔时
   *       （假涡流 78 / 真小恶魔 67）疯子排到恶魔之后 →
   *       恶魔行动时 seat.lunaticTargetIds 还没写入（用户实测"毫无后续体现"）。
   * ② 首夜的「恶魔互认」：官方
   *    「唤醒疯子并向他提供恶魔信息。**随后**在恶魔信息环节对恶魔提供疯子的相关信息。」
   *    → 疯子的 demon_info 节点必须排在真恶魔的 demon_info **之前**。
   *    ⚠️ 两个节点 roleId 都是 "demon_info"、优先级同为 2.5，
   *       展开时真恶魔先入队 → 稳定排序保持"真恶魔在前"，正是用户实测的错误顺序。
   */
  it("① 其它夜晚：疯子节点排在真恶魔之前", () => {
    const nodes = queue(seats, false);
    const li = nodes.findIndex((n) => n.roleId === "lunatic");
    const di = nodes.findIndex((n) => n.roleId === "imp");
    expect(li).toBeGreaterThanOrEqual(0);
    expect(di).toBeGreaterThanOrEqual(0);
    expect(li).toBeLessThan(di);
  });

  it("② 假恶魔(涡流 78)晚于真恶魔(小恶魔 40)时，疯子仍用自身槽位 39", () => {
    const cross = seats.map((s) =>
      s.id === LUNA ? { ...s, apparentDemonRole: demonRole("vortox") } : s
    ) as unknown as Seat[];
    const nodes = queue(cross, false);
    const lunatic = nodes.find((n) => n.roleId === "lunatic")!;
    // 关键：不采纳假恶魔的 78，仍是自己的 39
    expect(lunatic.priority).toBe(39);
    expect(nodes.findIndex((n) => n.roleId === "lunatic")).toBeLessThan(
      nodes.findIndex((n) => n.roleId === "imp")
    );
  });

  it("③ 首夜：疯子的「恶魔互认」排在真恶魔的「恶魔互认」之前", () => {
    const nodes = queue(seats, true);
    const infos = nodes
      .map((n, i) => ({ n, i }))
      .filter((x) => x.n.roleId === "demon_info");
    expect(infos.length, "应有真恶魔 + 疯子两条恶魔互认节点").toBe(2);
    const lunaticInfo = infos.find((x) => x.n.seatId === LUNA)!;
    const demonInfo = infos.find((x) => x.n.seatId === IMP)!;
    expect(lunaticInfo, "疯子应有专属恶魔互认节点").toBeDefined();
    expect(demonInfo, "真恶魔应有恶魔互认节点").toBeDefined();
    expect(
      lunaticInfo.i,
      `疯子(步${lunaticInfo?.i})必须排在真恶魔(步${demonInfo?.i})之前`
    ).toBeLessThan(demonInfo.i);
  });
});

describe("A2 · 玩家面完全按 apparentDemonRole 演出", () => {
  it("① 疯子夜间信息：effectiveRole 仍是 lunatic（执行绝不改成真恶魔）", () => {
    const info = calculateNightInfoViaNewEngine(
      SCRIPT,
      seats,
      LUNA,
      "night",
      null,
      2
    );
    expect(info?.effectiveRole.id).toBe("lunatic");
    expect(isLunaticSeat(info?.seat)).toBe(true);
  });

  it("② playerFacingRole = 假恶魔（沙巴洛斯），目标数量照假恶魔 = 2 人", () => {
    const info = calculateNightInfoViaNewEngine(
      SCRIPT,
      seats,
      LUNA,
      "night",
      null,
      2
    );
    expect(info?.playerFacingRole?.name).toBe("沙巴洛斯");
    expect(info?.playerFacingRole?.type).toBe("demon");
    expect(info?.targetLimit).toEqual({ min: 2, max: 2 });
  });

  it("③ 说书人面 guide 保留真相（含「疯子」），玩家面文案不含「疯子」", () => {
    const info = calculateNightInfoViaNewEngine(
      SCRIPT,
      seats,
      LUNA,
      "night",
      null,
      2
    );
    expect(String(info?.guide)).toContain("疯子");
    expect(String(info?.playerFacingGuide)).not.toContain("疯子");
    // 玩家面文案来自假恶魔（沙巴洛斯）的技能描述，而不是疯子自己的
    expect(String(info?.playerFacingGuide)).toContain("选择两名玩家");
    expect(String(info?.playerFacingGuide)).not.toEqual(String(info?.guide));
  });
});

describe("A5 · 疯子使用**自身官方槽位**，不受假恶魔身份影响", () => {
  it("① 其它夜晚：优先级 == 疯子自己的 39（不是假恶魔沙巴洛斯的 45）", () => {
    const node = queue(seats, false).find((n) => n.roleId === "lunatic");
    expect(node).toBeDefined();
    // ⚠️ 2026-09-12 修正：原断言是 `=== 45`（照搬假恶魔沙巴洛斯的优先级），
    //    那正是导致"疯子排到真恶魔之后、恶魔读不到本夜选择"的旧行为。
    //    官方夜序表已把疯子排在所有恶魔之前，替换成假恶魔槽位既没必要又有害。
    expect(node?.priority).toBe(39);
  });

  it("⑤ apparentDemonRole 换成更早的恶魔，疯子优先级依然不变", () => {
    // 疯子扮演谁都不影响它自己的唤醒时点（与酒鬼/提线木偶"扮演镇民"不同）
    const withEarlyApparent = seats.map((s) =>
      s.id === LUNA
        ? { ...s, apparentDemonRole: demonRole("no_dashii") }
        : s
    ) as unknown as Seat[];
    const node = queue(withEarlyApparent, false).find(
      (n) => n.roleId === "lunatic"
    );
    expect(node?.priority).toBe(39);
  });

  it("② 假恶魔首夜不行动（沙巴洛斯 firstNightPriority=0）→ 首夜不再额外排疯子开刀节点", () => {
    const node = queue(seats, true).find((n) => n.roleId === "lunatic");
    expect(node).toBeUndefined();
    // 但 A1 的首夜信息节点仍然存在（A5 要求"即使不行动也要保证首夜信息成立"）
    expect(
      queue(seats, true).some(
        (n) => n.roleId === "demon_info" && n.seatId === LUNA
      )
    ).toBe(true);
  });

  it("③ 假恶魔首夜确实行动（卡扎力 firstNightPriority=3）→ 疯子首夜节点保留，但仍用自身槽位", () => {
    const withKazali = seats.map((s) =>
      s.id === LUNA
        ? { ...s, apparentDemonRole: demonRole("kazali") }
        : s
    ) as unknown as Seat[];
    const node = queue(withKazali, true).find((n) => n.roleId === "lunatic");
    expect(node).toBeDefined();
    // ⚠️ 2026-09-12 修正：原断言是 `=== 3`（照搬卡扎力的首夜优先级）。
    //    新规则：疯子的唤醒时点不受假恶魔影响 → 用自身首夜槽位（本合成表 = 15）。
    expect(node?.priority).toBe(15);
  });

  it("④ 首夜信息节点使用的行动者就是疯子本人（信息按行动者座位生成）", () => {
    const node = queue(seats, true).find(
      (n) => n.roleId === "demon_info" && n.seatId === LUNA
    );
    expect(node?.seatId).toBe(LUNA);
  });
});

describe("A8 · 疯子伪装成「军团」时，信息形态必须是军团式（无爪牙、有军团队友）", () => {
  /**
   * 用户实测（2026-09-12）：
   *   「伪装成军团时其获得的信息并不符合军团的信息，因为军团时没有爪牙，
   *     而是大量的军团队友。」
   * 官方军团互认形态：「座位号：…／说书人同时唤醒所有的军团玩家，军团玩家互认」
   *   ＋共享 3 张不在场伪装 —— **没有"爪牙"这一项**。
   */
  const legionSeats = seats.map((s) =>
    s.id === LUNA ? { ...s, apparentDemonRole: demonRole("legion") } : s
  ) as unknown as Seat[];

  it("① guide 改为军团互认形态，不再出现「爪牙是」", () => {
    const info = calculateNightInfoViaNewEngine(
      SCRIPT,
      legionSeats,
      LUNA,
      "firstNight",
      null,
      1,
      "demon_info"
    );
    const guide = String(info?.guide);
    expect(guide, guide).toContain("说书人同时唤醒所有的军团玩家，军团玩家互认");
    expect(guide, guide).toContain("座位号：");
    expect(guide, guide).not.toContain("爪牙是:");
  });

  it("② 军团队友座位必须是假的：不得指向任何真实邪恶座位", () => {
    const info = calculateNightInfoViaNewEngine(
      SCRIPT,
      legionSeats,
      LUNA,
      "firstNight",
      null,
      1,
      "demon_info"
    );
    const guide = String(info?.guide);
    const listed = (guide.match(/座位号：([^\n]*)/)?.[1] ?? "")
      .split("、")
      .map((x) => Number(x.replace("号", "")) - 1)
      .filter((n) => Number.isFinite(n));
    const evilIds = legionSeats
      .filter((s) => s.role?.type === "demon" || s.role?.type === "minion")
      .map((s) => s.id);
    expect(listed.length).toBeGreaterThan(0);
    for (const id of listed) {
      expect(evilIds, `军团队友不得指向真实邪恶 ${id + 1}号`).not.toContain(id);
    }
  });

  it("③ 队列里这一步显示为「军团(军团互认)」", () => {
    const node = queue(legionSeats, true).find(
      (n) => n.roleId === "demon_info" && n.seatId === LUNA
    );
    expect(String((node as any)?.roleName)).toContain("军团互认");
    expect(String((node as any)?.roleName)).not.toContain("恶魔互认");
  });

  it("④ 队友人数按军团规则（正邪反转）给：15 人局 → 展示 10 名队友", () => {
    /**
     * 官方「军团·角色简介」1：「将在场善良和邪恶玩家的数量在通常的数量上进行反转。
     * 例如，在一局十人游戏中，你可以采取近似七名军团和三名善良玩家的设置。」
     * ⇒ 军团总数 == 标准善良人数(镇民+外来者)。
     *   STANDARD_COMPOSITIONS[15] = 9 镇民 + 2 外来者 = 11 军团 → 队友 = 11 − 1 = 10。
     */
    const many = Array.from({ length: 15 }, (_, i) =>
      i === 5
        ? { ...seat(5, "lunatic"), apparentDemonRole: demonRole("legion") }
        : seat(i, "chef")
    ) as unknown as Seat[];
    const info = calculateNightInfoViaNewEngine(
      SCRIPT,
      many,
      5,
      "firstNight",
      null,
      1,
      "demon_info"
    );
    const guide = String(info?.guide);
    const listed = (guide.match(/座位号：([^\n]*)/)?.[1] ?? "")
      .split("、")
      .map((x) => Number(x.replace("号", "")) - 1)
      .filter((n) => Number.isFinite(n));
    expect(listed, guide).toHaveLength(10);
    expect(listed, "军团队友不含疯子自己").not.toContain(5);
  });
});

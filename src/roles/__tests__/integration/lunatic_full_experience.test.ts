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
    expect(String(demonInfo?.guide)).toContain("提线木偶: 9号");
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

describe("A5 · 疯子按 apparentDemonRole 的夜序优先级被唤醒", () => {
  it("① 其它夜晚：优先级 == 假恶魔（沙巴洛斯 45），而不是疯子自身的 39", () => {
    const node = queue(seats, false).find((n) => n.roleId === "lunatic");
    expect(node).toBeDefined();
    expect(node?.priority).toBe(45);
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

  it("③ 假恶魔首夜确实行动（卡扎力 firstNightPriority=3）→ 疯子首夜节点保留且同优先级", () => {
    const withKazali = seats.map((s) =>
      s.id === LUNA
        ? { ...s, apparentDemonRole: demonRole("kazali") }
        : s
    ) as unknown as Seat[];
    const node = queue(withKazali, true).find((n) => n.roleId === "lunatic");
    expect(node).toBeDefined();
    expect(node?.priority).toBe(3);
  });

  it("④ 首夜信息节点使用的行动者就是疯子本人（信息按行动者座位生成）", () => {
    const node = queue(seats, true).find(
      (n) => n.roleId === "demon_info" && n.seatId === LUNA
    );
    expect(node?.seatId).toBe(LUNA);
  });
});

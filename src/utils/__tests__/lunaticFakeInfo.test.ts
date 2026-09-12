import { describe, expect, it } from "vitest";
import type { Seat } from "../../../app/data";
import { roles as allRoles } from "../../../app/data";
import {
  buildLunaticFakeInfo,
  computeDemonBluffNames,
  resolveLunaticFakeInfo,
} from "../lunaticFakeInfo";
import { isRealMinion } from "../roleFlags";

/**
 * A1 的具体断言：疯子首夜拿到的「3 张伪装牌 + 爪牙名单」。
 *
 * 官方依据（json/wiki_crawl/parsed_roles.json「疯子」角色简介 2）：
 *   「疯子会在首个夜晚被唤醒来得知三个不在场的角色，以及与当前游戏数量
 *     符合的爪牙，**但是这些信息可能是错误的**。」
 * 说书人裁决：默认全部为假；3 张牌允许在场，但必须与真恶魔那 3 张不重叠。
 */

const SCRIPT_ID = "test_script";
const SCRIPT_ROLE_IDS = [
  "washerwoman",
  "librarian",
  "investigator",
  "chef",
  "empath",
  "fortune_teller",
  "saint",
  "butler",
  "lunatic",
  "poisoner",
  "baron",
  "imp",
];

const seat = (id: number, roleId: string) => {
  const r = allRoles.find((x) => x.id === roleId)!;
  return { id, role: { id: r.id, name: r.name, type: r.type }, isDead: false };
};

/** 7 人局：0厨师 1疯子 2投毒者 3男爵 4共情者 5洗衣妇 6圣徒 */
const seats = [
  seat(0, "chef"),
  {
    ...seat(1, "lunatic"),
    apparentDemonRole: {
      id: "shabaloth",
      name: "沙巴洛斯",
      type: "demon",
    },
  },
  seat(2, "poisoner"),
  seat(3, "baron"),
  seat(4, "empath"),
  seat(5, "washerwoman"),
  seat(6, "saint"),
] as unknown as Seat[];

const LUNA = 1;

describe("A1 · 疯子首夜假信息（3 张伪装牌）", () => {
  const fake = buildLunaticFakeInfo(seats, SCRIPT_ROLE_IDS, LUNA, SCRIPT_ID);
  const demonBluffs = computeDemonBluffNames(seats, SCRIPT_ROLE_IDS);

  it("②a 疯子 3 张 ⊆ 善良角色（townsfolk / outsider）", () => {
    for (const name of fake.bluffNames) {
      const role = allRoles.find((r) => r.name === name)!;
      expect(role, name).toBeDefined();
      expect(["townsfolk", "outsider"]).toContain(role.type);
    }
  });

  it("②b 疯子 3 张 ∩ 真恶魔 3 张 = ∅（硬约束：不重叠）", () => {
    expect(fake.bluffNames.length).toBe(3);
    expect(demonBluffs.length).toBe(3);
    const inter = fake.bluffNames.filter((n) => demonBluffs.includes(n));
    expect(inter).toEqual([]);
  });

  it("②c 3 张内部无重复，且长度为 3", () => {
    expect(fake.bluffNames).toHaveLength(3);
    expect(new Set(fake.bluffNames).size).toBe(3);
  });

  it("绝不能把疯子自己的角色名（疯子）当伪装牌给他", () => {
    expect(fake.bluffNames).not.toContain("疯子");
  });

  it("③ 假爪牙名单：数量 == 真实爪牙数，且 ∩ 真实邪恶座位 = ∅", () => {
    const realMinionCount = seats.filter((s) => isRealMinion(s)).length;
    // 本局 2 名真爪牙（投毒者 2号、男爵 3号）
    expect(realMinionCount).toBe(2);
    expect(fake.fakeMinionIds).toHaveLength(realMinionCount);

    const evilIds = seats
      .filter(
        (s) =>
          s.role?.type === "demon" ||
          s.role?.type === "minion" ||
          (s as any).isEvilConverted
      )
      .map((s) => s.id);
    for (const id of fake.fakeMinionIds) {
      expect(evilIds).not.toContain(id);
      expect(id).not.toBe(LUNA);
    }
  });

  it("③b 假爪牙只能来自非邪恶座位", () => {
    const goodIds = seats
      .filter(
        (s) => s.role?.type === "townsfolk" || s.role?.type === "outsider"
      )
      .map((s) => s.id)
      .filter((id) => id !== LUNA);
    for (const id of fake.fakeMinionIds) {
      expect(goodIds).toContain(id);
    }
  });
});

describe("A1 · 确定性稳定（同一局多次计算/撤销重做结果不变）", () => {
  it("③ 连续计算 5 次结果完全一致", () => {
    const first = buildLunaticFakeInfo(seats, SCRIPT_ROLE_IDS, LUNA, SCRIPT_ID);
    for (let i = 0; i < 5; i++) {
      const again = buildLunaticFakeInfo(
        seats,
        SCRIPT_ROLE_IDS,
        LUNA,
        SCRIPT_ID
      );
      expect(again).toEqual(first);
    }
  });

  it("③b 座位数组顺序被打乱也不影响结果（种子只依赖稳定事实）", () => {
    const shuffled = [...seats].reverse();
    const a = buildLunaticFakeInfo(seats, SCRIPT_ROLE_IDS, LUNA, SCRIPT_ID);
    const b = buildLunaticFakeInfo(
      shuffled as unknown as Seat[],
      SCRIPT_ROLE_IDS,
      LUNA,
      SCRIPT_ID
    );
    // fakeMinionIds 取的是"非邪恶座位集合"，与顺序无关；bluffNames 同理
    expect(b.fakeMinionIds).toEqual(a.fakeMinionIds);
    expect(b.bluffNames).toEqual(a.bluffNames);
  });

  it("③c 持久化值优先：座位上有 lunaticFakeInfo 就用它", () => {
    const stored = {
      bluffNames: ["洗衣妇", "图书管理员", "调查员"],
      fakeMinionIds: [4, 5],
      seed: "stored",
    };
    const withStored = [
      seats[0],
      { ...seats[1], lunaticFakeInfo: stored },
      ...seats.slice(2),
    ] as unknown as Seat[];
    expect(resolveLunaticFakeInfo(withStored, SCRIPT_ROLE_IDS, LUNA)).toEqual(
      stored
    );
  });
});

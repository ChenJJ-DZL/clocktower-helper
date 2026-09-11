import { describe, expect, it } from "vitest";
import {
  applyBountyHunterEvilConversion,
  EVIL_CONVERTED_DETAIL,
  isRealBountyHunterSeat,
  selectEvilConvertedSeat,
} from "../bountyHunterSetup";

interface S {
  id: number;
  role: { id: string; name: string; type: string } | null;
  charadeRole?: { id: string } | null;
  isEvilConverted?: boolean;
  alignment?: string | null;
  isRedHerring?: boolean;
  isFortuneTellerRedHerring?: boolean;
  statusDetails?: string[];
  bountyHunterEvilConvertedId?: number | null;
}

const mk = (id: number, roleId: string, type: string, extra: Partial<S> = {}): S => ({
  id,
  role: { id: roleId, name: roleId, type },
  statusDetails: [],
  ...extra,
});

/** 7 人局：赏金猎人 + 3 镇民 + 外来者 + 爪牙 + 恶魔 */
const lineup = (): S[] => [
  mk(0, "bounty_hunter", "townsfolk"),
  mk(1, "chef", "townsfolk"),
  mk(2, "saint", "outsider"),
  mk(3, "imp", "demon"),
  mk(4, "poisoner", "minion"),
  mk(5, "empath", "townsfolk"),
];

describe("赏金猎人「设置调整」：一名镇民转为邪恶阵营", () => {
  it("场上有真实赏金猎人 → 恰好 1 名镇民被转为邪恶（旧代码无此纯函数，此处为功能基线）", () => {
    const { seats, convertedSeatId } = applyBountyHunterEvilConversion(lineup());
    const converted = seats.filter((s) => s.isEvilConverted);
    expect(converted).toHaveLength(1);
    expect(convertedSeatId).toBe(converted[0].id);
    // 官方：是"一名镇民"，不是外来者/爪牙/恶魔
    expect(converted[0].role?.type).toBe("townsfolk");
    // 且不能是赏金猎人自己
    expect(converted[0].id).not.toBe(0);
    expect(converted[0].alignment).toBe("evil");
    expect(converted[0].statusDetails).toContain(EVIL_CONVERTED_DETAIL);
  });

  it("被转换者的角色牌照旧不变（官方：只是把标记倒转放置）", () => {
    const before = lineup();
    const { seats, convertedSeatId } = applyBountyHunterEvilConversion(before);
    const after = seats.find((s) => s.id === convertedSeatId)!;
    const orig = before.find((s) => s.id === convertedSeatId)!;
    expect(after.role).toEqual(orig.role);
    expect(after.role?.id).toBe(orig.role?.id);
    expect(after.role?.type).toBe("townsfolk");
  });

  it("酒鬼「以为自己」是赏金猎人 → 不转换（官方范例3）", () => {
    const seats: S[] = [
      mk(0, "drunk", "outsider", { charadeRole: { id: "bounty_hunter" } }),
      mk(1, "chef", "townsfolk"),
      mk(2, "imp", "demon"),
    ];
    expect(isRealBountyHunterSeat(seats[0])).toBe(false);
    const res = applyBountyHunterEvilConversion(seats);
    expect(res.convertedSeatId).toBeNull();
    expect(res.seats.some((s) => s.isEvilConverted)).toBe(false);
  });

  it("提线木偶「以为自己」是赏金猎人 → 不转换", () => {
    const seats: S[] = [
      mk(0, "marionette", "minion", { charadeRole: { id: "bounty_hunter" } }),
      mk(1, "chef", "townsfolk"),
      mk(2, "imp", "demon"),
    ];
    expect(applyBountyHunterEvilConversion(seats).convertedSeatId).toBeNull();
  });

  it("幂等：对已转换过的阵容重复调用不会产生第二名被转换者", () => {
    const first = applyBountyHunterEvilConversion(lineup());
    const second = applyBountyHunterEvilConversion(first.seats);
    expect(second.convertedSeatId).toBeNull();
    expect(second.seats.filter((s) => s.isEvilConverted)).toHaveLength(1);
    expect(second.seats.filter((s) => s.isEvilConverted)[0].id).toBe(
      first.convertedSeatId
    );
  });

  it("确定性：同一套阵容恒定转同一名镇民（可复现）", () => {
    const a = applyBountyHunterEvilConversion(lineup()).convertedSeatId;
    const b = applyBountyHunterEvilConversion(lineup()).convertedSeatId;
    expect(a).toBe(b);
    expect(a).not.toBeNull();
  });

  it("转为邪恶者必须剥离占卜师红罗刹（红罗刹只能是善良玩家）", () => {
    const seats = lineup().map((s) =>
      s.id === 1
        ? { ...s, isRedHerring: true, isFortuneTellerRedHerring: true, statusDetails: ["天敌红罗剎"] }
        : s
    );
    const { seats: out, convertedSeatId } = applyBountyHunterEvilConversion(seats);
    // 不论转到谁，只要转了，就不能有人同时"已转邪恶 + 仍是红罗刹"
    const converted = out.find((s) => s.id === convertedSeatId)!;
    expect(converted.isRedHerring).toBe(false);
    expect(converted.isFortuneTellerRedHerring).toBe(false);
    expect(converted.statusDetails).not.toContain("天敌红罗剎");
  });

  it("场上没有镇民可转（只有赏金猎人自己）→ 不转换且不报错", () => {
    const seats: S[] = [mk(0, "bounty_hunter", "townsfolk"), mk(1, "imp", "demon")];
    const res = applyBountyHunterEvilConversion(seats);
    expect(res.convertedSeatId).toBeNull();
    expect(res.seats.filter((s) => s.isEvilConverted)).toHaveLength(0);
  });

  it("赏金猎人不在场 → 完全不改动", () => {
    const seats: S[] = [mk(0, "chef", "townsfolk"), mk(1, "imp", "demon")];
    const res = applyBountyHunterEvilConversion(seats);
    expect(res.convertedSeatId).toBeNull();
    expect(res.seats).toEqual(seats);
  });
});

describe("说书人手动改选「变为邪恶」（右击菜单）：最后选择生效", () => {
  const withConverted = (): S[] => {
    const base = lineup();
    base[1] = {
      ...base[1],
      isEvilConverted: true,
      alignment: "evil",
      statusDetails: [EVIL_CONVERTED_DETAIL],
      isRedHerring: true,
      isFortuneTellerRedHerring: true,
    } as S;
    return base;
  };

  it("选新的镇民 → 新的生效，旧的那名自动恢复为正常", () => {
    const before = withConverted();
    const after = selectEvilConvertedSeat(before, 5);
    const converted = after.filter((s) => s.isEvilConverted);
    expect(converted).toHaveLength(1);
    expect(converted[0].id).toBe(5);
    const old = after.find((s) => s.id === 1)!;
    expect(old.isEvilConverted).toBe(false);
    expect(old.alignment).toBe("good");
    expect(old.statusDetails).not.toContain(EVIL_CONVERTED_DETAIL);
  });

  it("始终最多一名被转换者（重复改选不会累积）", () => {
    let seats = withConverted();
    seats = selectEvilConvertedSeat(seats, 5);
    seats = selectEvilConvertedSeat(seats, 1);
    expect(seats.filter((s) => s.isEvilConverted)).toHaveLength(1);
    expect(seats.find((s) => s.isEvilConverted)!.id).toBe(1);
  });

  it("改选会剥离该座位的占卜师红罗刹（红罗刹只能是善良玩家）", () => {
    const seats = selectEvilConvertedSeat(withConverted(), 5);
    const target = seats.find((s) => s.id === 5)!;
    expect(target.isRedHerring).toBe(false);
    expect(target.isFortuneTellerRedHerring).toBe(false);
  });

  it("手动改选不会改动任何人的角色牌", () => {
    const before = withConverted();
    const after = selectEvilConvertedSeat(before, 5);
    before.forEach((b) => {
      expect(after.find((a) => a.id === b.id)!.role).toEqual(b.role);
    });
  });
});
import { describe, expect, it } from "vitest";
import {
  FARMER_SUCCESSOR_RESULT_TEXT,
  applyFarmerSuccession,
  findFarmerSuccessionTrigger,
} from "../farmerSuccession";

const seat = (id: number, roleId: string, type: string) => ({
  id,
  role: { id: roleId, name: roleId, type },
  roleId,
  roleName: roleId,
  roleType: type,
  statusDetails: [] as string[],
});

describe("农夫遇害传承：身份替换（用户实测缺陷回归）", () => {
  it("被选中的玩家 role 整体变为农夫（id/name/type 全变）", () => {
    const seats = [
      seat(0, "farmer", "townsfolk"),
      seat(1, "librarian", "townsfolk"),
    ];
    const { seats: next, changed } = applyFarmerSuccession(seats, 1);
    expect(changed).toBe(true);
    expect(next[1].role.id).toBe("farmer");
    expect(next[1].role.name).toBe("农夫");
    expect(next[1].role.type).toBe("townsfolk");
    // legacy 字段同步，避免界面/旧逻辑仍显示图书管理员
    expect(next[1].roleId).toBe("farmer");
    expect(next[1].roleName).toBe("农夫");
    expect(next[1].roleType).toBe("townsfolk");
  });

  it("只有被选中者改变，其他座位（含已死亡的旧农夫）保持不变", () => {
    const seats = [
      seat(0, "farmer", "townsfolk"),
      seat(1, "librarian", "townsfolk"),
      seat(2, "imp", "demon"),
    ];
    const { seats: next } = applyFarmerSuccession(seats, 1);
    expect(next[0].role.id).toBe("farmer");
    expect(next[2].role.id).toBe("imp");
    expect(next).toHaveLength(3);
  });

  it("追加「成为新农夫」标记且可重复调用不叠加", () => {
    const seats = [seat(1, "librarian", "townsfolk")];
    const once = applyFarmerSuccession(seats, 1).seats;
    expect(once[0].statusDetails).toContain("成为新农夫");
    const twice = applyFarmerSuccession(once, 1).seats;
    expect(
      twice[0].statusDetails.filter((s: string) => s === "成为新农夫")
    ).toHaveLength(1);
  });

  it("目标不存在时不改动任何座位", () => {
    const seats = [seat(0, "farmer", "townsfolk")];
    const { changed } = applyFarmerSuccession(seats, 99);
    expect(changed).toBe(false);
  });

  it("结果页文案固定为「你的身份变为【农夫】」", () => {
    expect(FARMER_SUCCESSOR_RESULT_TEXT).toBe("你的身份变为【农夫】");
  });
});

describe("农夫遇害传承：触发判定（官方边界护栏）", () => {
  const farmer = (over: Record<string, unknown> = {}) => ({
    ...seat(0, "farmer", "townsfolk"),
    ...over,
  });

  it("正常的农夫夜间死亡 → 触发，返回其座位 id", () => {
    expect(findFarmerSuccessionTrigger([farmer()], [0])).toBe(0);
  });

  it("中毒的农夫死亡 → 不触发", () => {
    expect(
      findFarmerSuccessionTrigger([farmer({ isPoisoned: true })], [0])
    ).toBeUndefined();
  });

  it("醉酒的农夫死亡 → 不触发", () => {
    expect(
      findFarmerSuccessionTrigger([farmer({ isDrunk: true })], [0])
    ).toBeUndefined();
  });

  it("由外部状态判定（如光环/相邻中毒）判为中暑 → 不触发", () => {
    expect(
      findFarmerSuccessionTrigger([farmer()], [0], () => true)
    ).toBeUndefined();
  });

  it("非农夫死亡 / 死者不在座位表 → 不触发", () => {
    expect(
      findFarmerSuccessionTrigger([seat(0, "librarian", "townsfolk")], [0])
    ).toBeUndefined();
    expect(findFarmerSuccessionTrigger([farmer()], [42])).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import {
  FARMER_SUCCESSOR_RESULT_TEXT,
  applyFarmerSuccession,
  buildFarmerSuccessorGuide,
  findFarmerSuccessionTrigger,
} from "../farmerSuccession";
import { parseInfoResult } from "../infoResultParser";

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

describe("农夫遇害传承：夜间引导语（2026-09-14 用户实测缺陷回归）", () => {
  it("引导语第一行必须是「唤醒XX号玩家，告知他/她：」，XX 为**新农夫**座位（1-based）", () => {
    // targetId=4 → 5号玩家（新农夫），绝不能出现行动者座位
    expect(buildFarmerSuccessorGuide(4)).toBe(
      "唤醒5号玩家，告知他/她：你的身份变为【农夫】"
    );
  });

  it("第二行与 FARMER_SUCCESSOR_RESULT_TEXT 保持同一份正文（单一事实来源）", () => {
    const guide = buildFarmerSuccessorGuide(0);
    const [, line2] = guide.split("：");
    expect(line2).toBe(FARMER_SUCCESSOR_RESULT_TEXT);
  });

  it("引导语经解析器后：第一行保留引导语、第二行是该告诉新农夫的话", () => {
    const { prefix, result } = parseInfoResult(
      buildFarmerSuccessorGuide(4),
      "1号-农夫"
    );
    expect(prefix).toBe("唤醒5号玩家，告知他/她：");
    expect(result).toBe(FARMER_SUCCESSOR_RESULT_TEXT);
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

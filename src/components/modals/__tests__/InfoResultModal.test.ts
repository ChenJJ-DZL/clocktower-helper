import { describe, expect, test } from "vitest";
import { parseInfoResult } from "../../../utils/infoResultParser";

describe("parseInfoResult - 技能结果告知格式化", () => {
  test("守鸦人死亡前夜得知 - 说明在上方无冒号，下方大字显示完整结果", () => {
    const raw = "守鸦人在死亡前夜得知: 玩家 15(15号) 的角色是 【小恶魔】";
    const res = parseInfoResult(raw, "守鸦人");
    expect(res.prefix).toBe("守鸦人在死亡前夜得知");
    expect(res.result).toBe("15号的角色是【小恶魔】");
  });

  test("守鸦人受干扰告知", () => {
    const raw = "守鸦人【受干扰】在死亡前夜得知：玩家 3(3号) 的角色是【男爵】";
    const res = parseInfoResult(raw, "守鸦人");
    expect(res.prefix).toBe("守鸦人【受干扰】在死亡前夜得知");
    expect(res.result).toBe("3号的角色是【男爵】");
  });

  test("洗衣妇信息 - 第二行完整大字显示且省略冒号", () => {
    const raw = "5号-洗衣妇获得信息：6号和9号其中一位是【占卜师】";
    const res = parseInfoResult(raw, "5号-洗衣妇");
    expect(res.prefix).toBe("5号-洗衣妇获得信息");
    expect(res.result).toBe("6号和9号其中一位是【占卜师】");
  });

  test("洗衣妇信息（带内部冒号自动清除）", () => {
    const raw = "洗衣妇获得信息：7号和2号之中有一名是：【调查员】";
    const res = parseInfoResult(raw, "洗衣妇");
    expect(res.prefix).toBe("洗衣妇获得信息");
    expect(res.result).toBe("7号和2号之中有一名是【调查员】");
  });

  test("图书管理员信息 - 第二行完整大字显示", () => {
    const raw = "图书管理员获得信息：3号和5号之中有一名是【陌客】";
    const res = parseInfoResult(raw, "图书管理员");
    expect(res.prefix).toBe("图书管理员获得信息");
    expect(res.result).toBe("3号和5号之中有一名是【陌客】");
  });

  test("图书管理员无外来者", () => {
    const raw = "图书管理员获得信息：本局没有外来者";
    const res = parseInfoResult(raw, "图书管理员");
    expect(res.prefix).toBe("图书管理员获得信息");
    expect(res.result).toBe("【本局没有外来者】");
  });

  test("厨师纯数字", () => {
    const raw = "厨师获得信息：0";
    const res = parseInfoResult(raw, "厨师");
    expect(res.prefix).toBe("厨师获得信息");
    expect(res.result).toBe("【0】");
  });

  test("共情者纯数字", () => {
    const raw = "1";
    const res = parseInfoResult(raw, "共情者");
    expect(res.prefix).toBe("共情者获得信息");
    expect(res.result).toBe("【1】");
  });

  test("占卜师纯结果", () => {
    const res1 = parseInfoResult("有", "占卜师");
    expect(res1.prefix).toBe("占卜师获得信息");
    expect(res1.result).toBe("【有】");

    const res2 = parseInfoResult("没有", "占卜师");
    expect(res2.prefix).toBe("占卜师获得信息");
    expect(res2.result).toBe("【没有】");
  });

  test("送葬者处决信息", () => {
    const rawWithBracket = "送葬者得知：今天被处决的 4号 的角色是【贞洁者】";
    const res1 = parseInfoResult(rawWithBracket, "送葬者");
    expect(res1.prefix).toBe("送葬者得知");
    expect(res1.result).toBe("今天被处决的 4号的角色是【贞洁者】");

    const rawWithoutBracket = "送葬者获得信息：上一个白天被处决的玩家是镇长";
    const res2 = parseInfoResult(rawWithoutBracket, "送葬者");
    expect(res2.prefix).toBe("送葬者获得信息");
    expect(res2.result).toBe("上一个白天被处决的玩家是镇长");
  });

  test("带座位号角色名 - 自动将 prefix 升级为 X号-角色名且无冒号", () => {
    const raw = "厨师获得信息：0";
    const res = parseInfoResult(raw, "4号-厨师");
    expect(res.prefix).toBe("4号-厨师获得信息");
    expect(res.result).toBe("【0】");
  });

  test("带座位号角色名 - 纯数字结果", () => {
    const res = parseInfoResult("0", "4号-厨师");
    expect(res.prefix).toBe("4号-厨师获得信息");
    expect(res.result).toBe("【0】");
  });

  test("系统步骤 - 爪牙互认与恶魔互认（第一行小字角色步骤名，后几行大字纯座位号）", () => {
    const minionRaw = "恶魔是: 15号\n爪牙队友: 13号、14号";
    const res1 = parseInfoResult(minionRaw, "12号-爪牙互认");
    expect(res1.prefix).toBe("12号-爪牙互认");
    expect(res1.result).toBe("恶魔是: 15号\n爪牙队友: 13号、14号");

    const demonRaw =
      "爪牙是: 12号、13号、14号\n不在场伪装: 【占卜师】、【圣徒】、【管家】";
    const res2 = parseInfoResult(demonRaw, "15号-恶魔互认");
    expect(res2.prefix).toBe("15号-恶魔互认");
    expect(res2.result).toBe(
      "爪牙是: 12号、13号、14号\n不在场伪装: 【占卜师】、【圣徒】、【管家】"
    );
  });

  test("贵族信息 - 第二行完整大字显示且省略冒号", () => {
    const raw = "唤醒4号【贵族】，告知1号、2号、3号中含一名邪恶。";
    const res = parseInfoResult(raw, "4号-贵族");
    expect(res.prefix).toBe("4号-贵族获得信息");
    expect(res.result).toBe("1号、2号、3号中含一名邪恶");
  });

  test("筑梦师信息 - 第二行完整大字显示且省略冒号", () => {
    const raw = "唤醒9号【筑梦师】，告诉他3号的角色是【小恶魔】或【士兵】";
    const res = parseInfoResult(raw, "9号-筑梦师");
    expect(res.prefix).toBe("9号-筑梦师获得信息");
    expect(res.result).toBe("3号的角色是【小恶魔】或【士兵】");
  });

  test("骑士信息 - 第二行完整大字显示且省略冒号", () => {
    const raw = "唤醒8号【骑士】，告知2号和3号不是恶魔。";
    const res = parseInfoResult(raw, "8号-骑士");
    expect(res.prefix).toBe("8号-骑士获得信息");
    expect(res.result).toBe("2号和3号不是恶魔");
  });

  test("祖母信息 - 第二行完整大字显示且省略冒号", () => {
    const raw = "唤醒1号【祖母】，告诉他6号是你的孙子，角色是【僧侣】";
    const res = parseInfoResult(raw, "1号-祖母");
    expect(res.prefix).toBe("1号-祖母获得信息");
    expect(res.result).toBe("6号是你的孙子，角色是【僧侣】");
  });

  test("钟表匠信息 - 第二行完整大字显示", () => {
    const raw = "钟表匠获得信息：恶魔与爪牙之间的最近距离是 2";
    const res = parseInfoResult(raw, "12号-钟表匠");
    expect(res.prefix).toBe("12号-钟表匠获得信息");
    expect(res.result).toBe("恶魔与爪牙之间的最近距离是 2");
  });

  test("管家选择主人信息 - 单行简洁大字显示", () => {
    const raw1 = "管家（9号）选择【玩家 7(7号)】作为主人";
    const res1 = parseInfoResult(raw1, "9号-管家");
    expect(res1.prefix).toBe("9号-管家获得信息");
    expect(res1.result).toBe("选择【7号】作为主人");

    const raw2 = "选择【7号】作为主人";
    const res2 = parseInfoResult(raw2, "9号-管家");
    expect(res2.prefix).toBe("9号-管家获得信息");
    expect(res2.result).toBe("选择【7号】作为主人");
  });

  test("赏金猎人信息 - 直接完整显示【X号玩家是邪恶的】且无悬挂括号", () => {
    const raw1 = "2号玩家是邪恶的";
    const res1 = parseInfoResult(raw1, "5号-赏金猎人");
    expect(res1.prefix).toBe("5号-赏金猎人获得信息");
    expect(res1.result).toBe("2号玩家是邪恶的");

    const raw2 = "唤醒5号【赏金猎人】，指向2号玩家【罂粟种植者】（告诉他2号玩家是邪恶的）。";
    const res2 = parseInfoResult(raw2, "5号-赏金猎人");
    expect(res2.prefix).toBe("5号-赏金猎人获得信息");
    expect(res2.result).toBe("2号玩家是邪恶的");

    // 防御测试：去除意外的悬挂右括号
    const raw3 = "该玩家是邪恶阵营)";
    const res3 = parseInfoResult(raw3, "5号-赏金猎人");
    expect(res3.result).toBe("该玩家是邪恶阵营");
  });

  test("杂耍艺人信息 - 完整大字显示【得知的数字为X】", () => {
    const raw = "得知的数字为3";
    const res = parseInfoResult(raw, "6号-杂耍艺人");
    expect(res.prefix).toBe("6号-杂耍艺人获得信息");
    expect(res.result).toBe("得知的数字为3");

    const raw0 = "得知的数字为0";
    const res0 = parseInfoResult(raw0, "6号-杂耍艺人");
    expect(res0.prefix).toBe("6号-杂耍艺人获得信息");
    expect(res0.result).toBe("得知的数字为0");
  });
});

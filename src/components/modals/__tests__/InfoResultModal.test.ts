import { describe, expect, test } from "vitest";
import { parseInfoResult } from "../../../utils/infoResultParser";

describe("parseInfoResult - 技能结果告知格式化", () => {
  test("守鸦人死亡前夜得知 - 分离为说明与居中角色名（2行无空行）", () => {
    const raw = "守鸦人在死亡前夜得知: 玩家 15(15号) 的角色是 【小恶魔】";
    const res = parseInfoResult(raw, "守鸦人");
    expect(res.prefix).toBe("守鸦人在死亡前夜得知: 玩家 15(15号) 的角色是：");
    expect(res.result).toBe("【小恶魔】");
  });

  test("守鸦人受干扰告知", () => {
    const raw = "守鸦人【受干扰】在死亡前夜得知：玩家 3(3号) 的角色是【男爵】";
    const res = parseInfoResult(raw, "守鸦人");
    expect(res.prefix).toBe("守鸦人【受干扰】在死亡前夜得知：玩家 3(3号) 的角色是：");
    expect(res.result).toBe("【男爵】");
  });

  test("洗衣妇信息", () => {
    const raw = "洗衣妇获得信息：7号和2号之中有一名是【调查员】";
    const res = parseInfoResult(raw, "洗衣妇");
    expect(res.prefix).toBe("洗衣妇获得信息：7号和2号之中有一名是：");
    expect(res.result).toBe("【调查员】");
  });

  test("图书管理员信息", () => {
    const raw = "图书管理员获得信息：3号和5号之中有一名是【陌客】";
    const res = parseInfoResult(raw, "图书管理员");
    expect(res.prefix).toBe("图书管理员获得信息：3号和5号之中有一名是：");
    expect(res.result).toBe("【陌客】");
  });

  test("图书管理员无外来者", () => {
    const raw = "图书管理员获得信息：本局没有外来者";
    const res = parseInfoResult(raw, "图书管理员");
    expect(res.prefix).toBe("图书管理员获得信息：");
    expect(res.result).toBe("【本局没有外来者】");
  });

  test("厨师纯数字", () => {
    const raw = "厨师获得信息：0";
    const res = parseInfoResult(raw, "厨师");
    expect(res.prefix).toBe("厨师获得信息：");
    expect(res.result).toBe("【0】");
  });

  test("共情者纯数字", () => {
    const raw = "1";
    const res = parseInfoResult(raw, "共情者");
    expect(res.prefix).toBe("共情者获得信息：");
    expect(res.result).toBe("【1】");
  });

  test("占卜师纯结果", () => {
    const res1 = parseInfoResult("有", "占卜师");
    expect(res1.prefix).toBe("占卜师获得信息：");
    expect(res1.result).toBe("【有】");

    const res2 = parseInfoResult("没有", "占卜师");
    expect(res2.prefix).toBe("占卜师获得信息：");
    expect(res2.result).toBe("【没有】");
  });

  test("送葬者处决信息", () => {
    const raw = "送葬者得知：今天被处决的 4号 的角色是【贞洁者】";
    const res = parseInfoResult(raw, "送葬者");
    expect(res.prefix).toBe("送葬者得知：今天被处决的 4号 的角色是：");
    expect(res.result).toBe("【贞洁者】");
  });

  test("筑梦师双角色信息", () => {
    const raw = "梦中人得知 3号 的角色是以下之一：【小恶魔】或【士兵】";
    const res = parseInfoResult(raw, "梦中人");
    expect(res.prefix).toBe("梦中人得知 3号 的角色是以下之一：");
    expect(res.result).toBe("【小恶魔】或【士兵】");
  });

  test("多行输入去除多余空行", () => {
    const raw = "守鸦人得知：\n\n【小恶魔】\n";
    const res = parseInfoResult(raw, "守鸦人");
    expect(res.prefix).toBe("守鸦人得知：");
    expect(res.result).toBe("【小恶魔】");
  });
});

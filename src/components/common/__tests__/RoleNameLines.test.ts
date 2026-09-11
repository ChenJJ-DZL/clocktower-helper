import { describe, expect, it } from "vitest";
import { splitRoleNameLines } from "../roleNameWrap";

/**
 * 5 字角色名折行规则（用户需求）：座位等窄容器里必须固定显示为「第一行 3 字 / 第二行 2 字」，
 * 不能出现 4+1 的贪心折行。旧实现只把 >4 字名的 whitespace-nowrap 去掉交给浏览器逐字折行，
 * 于是 5 字名被折成 4+1（图书管理 / 员），本用例即为该缺陷的回归测试。
 */
describe("RoleNameLines - 5 字角色名 3+2 折行规则", () => {
  it("5 字角色名固定拆成「前 3 字 + 剩余 2 字」两行", () => {
    expect(splitRoleNameLines("图书管理员")).toEqual(["图书管", "理员"]);
    expect(splitRoleNameLines("畸形秀演员")).toEqual(["畸形秀", "演员"]);
    expect(splitRoleNameLines("罂粟种植者")).toEqual(["罂粟种", "植者"]);
  });

  it("绝不返回 4+1 的折行结果", () => {
    for (const name of ["图书管理员", "畸形秀演员", "罂粟种植者"]) {
      const lines = splitRoleNameLines(name);
      expect(lines[0]).toHaveLength(3);
      expect(lines).toHaveLength(2);
      expect(lines.join("")).toBe(name);
    }
  });

  it("4 字及以下角色名保持单行（由容器 whitespace-nowrap 兜底）", () => {
    expect(splitRoleNameLines("共情者")).toEqual(["共情者"]);
    expect(splitRoleNameLines("酒鬼")).toEqual(["酒鬼"]);
    expect(splitRoleNameLines("畸形秀演员".slice(0, 4))).toEqual(["畸形秀演"]);
  });

  it("超过 5 字时第二行取其余全部字符", () => {
    expect(splitRoleNameLines("图书管理员甲")).toEqual(["图书管", "理员甲"]);
    expect(splitRoleNameLines("超级无敌大恶魔")).toEqual(["超级无", "敌大恶魔"]);
  });

  it("空名称安全降级为单行空串，不抛异常", () => {
    expect(splitRoleNameLines("")).toEqual([""]);
    expect(splitRoleNameLines("   ")).toEqual([""]);
    expect(splitRoleNameLines(null)).toEqual([""]);
    expect(splitRoleNameLines(undefined)).toEqual([""]);
  });
});

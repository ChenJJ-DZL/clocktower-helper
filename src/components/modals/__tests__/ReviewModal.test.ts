import { describe, expect, test } from "vitest";
import { roles } from "../../../../app/data";

const roleNameMap = new Map(roles.map((r) => [r.id, r.name]));

const formatMsg = (msg?: string | null): string => {
  if (!msg) return "";
  return String(msg).replace(
    /(\d+)\s*号(?:玩家|[位者])?\s*[(（]?([a-z_]+)[)）]?/gi,
    (match, num, roleId) => {
      const cn = roleNameMap.get(roleId) || roleId;
      return `【${num}】${cn}`;
    }
  );
};

describe("ReviewModal 日志解析与健壮性测试", () => {
  test("处理 undefined, null 或空字符串时不抛出异常", () => {
    expect(formatMsg(undefined)).toBe("");
    expect(formatMsg(null)).toBe("");
    expect(formatMsg("")).toBe("");
  });

  test("正常格式化角色中英文匹配", () => {
    expect(formatMsg("1号玩家(slayer) 开枪")).toBe("【1】猎手 开枪");
    expect(formatMsg("15号(imp) 杀死了 1号")).toBe("【15】小恶魔 杀死了 1号");
  });

  test("过滤非字符串或无效日志项", () => {
    const rawLogs = [
      { day: 0, phase: "day", message: "1号(slayer) 发动技能" },
      { day: 0, phase: "day", message: "[系统] 初始化" },
      { day: 0, phase: "day", message: undefined as any },
      { day: 0, phase: "day", message: null as any },
    ];

    const filtered = rawLogs.filter(
      (log) =>
        log &&
        typeof log.message === "string" &&
        !log.message.startsWith("[系统]") &&
        !log.message.startsWith("[能力执行]") &&
        !log.message.startsWith("[handleDrunkCharadeSelect]")
    );

    expect(filtered.length).toBe(1);
    expect(filtered[0].message).toBe("1号(slayer) 发动技能");
  });
});

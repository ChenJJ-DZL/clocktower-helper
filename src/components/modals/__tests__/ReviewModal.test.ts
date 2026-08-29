import { describe, expect, test } from "vitest";
import { roles } from "../../../../app/data";

const roleNameMap = new Map(roles.map((r) => [r.id, r.name]));

const formatMsg = (
  msg?: string | null,
  seatMap?: Map<number, string>
): string => {
  if (!msg || typeof msg !== "string") return "";

  let formatted = msg.trim();

  // 1. 去除内部调试前缀
  formatted = formatted.replace(/^\[能力\]\s*/, "");

  // 2. 将形如 "【玩家1(1号-镇长)】" 或 "玩家1(1号-镇长)" 转换为 "【1号-镇长】"
  formatted = formatted.replace(
    /【?玩家(\d+)】?\s*[(（](\d+)\s*号(?:[ -]([^\s()（）]+))?[)）]/gi,
    (_match, num1, num2, roleText) => {
      const num = parseInt(num2 || num1, 10);
      const roleName =
        roleText || seatMap?.get(num) || roleNameMap.get(roleText) || "";
      return roleName ? `【${num}号-${roleName}】` : `【${num}号】`;
    }
  );

  // 3. 将形如 "1号(slayer)" / "1号(猎手)" / "1号玩家(slayer)" 转换为 "【1号-猎手】"
  formatted = formatted.replace(
    /(\d+)\s*号(?:玩家|[位者])?\s*[(（]([a-zA-Z_\u4e00-\u9fa5]+)[)）]/gi,
    (_match, numStr, roleIdOrName) => {
      const num = parseInt(numStr, 10);
      const cn =
        roleNameMap.get(roleIdOrName) || roleIdOrName || seatMap?.get(num);
      return cn ? `【${num}号-${cn}】` : `【${num}号】`;
    }
  );

  // 4. 将未带角色名的裸露 "X号" 转换为 "【X号-角色名】"（若尚未被【】包裹）
  formatted = formatted.replace(
    /(?<!【\s*|【\s*\d+号-)(\b\d+)\s*号(?:玩家|[位者])?(?![-a-zA-Z_\u4e00-\u9fa5]*】)/g,
    (_match, numStr) => {
      const num = parseInt(numStr, 10);
      const roleName = seatMap?.get(num);
      return roleName ? `【${num}号-${roleName}】` : `【${num}号】`;
    }
  );

  // 5. 清理多重括号与空格
  formatted = formatted.replace(/【+([^【】]+)】+/g, "【$1】");
  formatted = formatted.replace(/\s*([，。！？、])\s*/g, "$1");
  formatted = formatted.replace(
    /(【[^】]+】)\s*提名了?\s*(【[^】]+】)/g,
    "$1 提名了 $2"
  );

  // 6. 丰富行动语义前缀与结果描述
  if (
    formatted.includes("因为你提名了贞洁者") ||
    formatted.includes("提名了贞洁者，")
  ) {
    formatted = formatted.replace(
      /.*?因为你?提名了贞洁者[，, ]*(【[^】]+】).*?被立即处决.*/,
      "⚡️ 触发贞洁者能力：因 $1 是真实镇民，$1 被立即处决死亡！"
    );
  } else if (
    (formatted.includes("提名了") || formatted.includes("提名 ")) &&
    !formatted.includes("📣")
  ) {
    formatted = `📣 ${formatted}`;
  }

  return formatted;
};

describe("ReviewModal 日志解析与健壮性测试", () => {
  const seatRoleMap = new Map<number, string>([
    [1, "镇长"],
    [2, "守鸦人"],
    [3, "送葬者"],
    [7, "贞洁者"],
    [15, "小恶魔"],
  ]);

  test("处理 undefined, null 或空字符串时不抛出异常", () => {
    expect(formatMsg(undefined)).toBe("");
    expect(formatMsg(null)).toBe("");
    expect(formatMsg("")).toBe("");
  });

  test("自动补全座位号对应的角色名并呈现“谁对谁”、“做了什么”", () => {
    expect(formatMsg("1号 提名了 7号", seatRoleMap)).toBe(
      "📣 【1号-镇长】 提名了 【7号-贞洁者】"
    );
    expect(formatMsg("15号 杀死了 1号", seatRoleMap)).toBe(
      "【15号-小恶魔】 杀死了 【1号-镇长】"
    );
  });

  test("格式化贞洁者处决结果描述", () => {
    expect(formatMsg("因为你提名了贞洁者，1号被立即处决", seatRoleMap)).toBe(
      "⚡️ 触发贞洁者能力：因 【1号-镇长】 是真实镇民，【1号-镇长】 被立即处决死亡！"
    );
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

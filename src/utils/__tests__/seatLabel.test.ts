import { describe, expect, test } from "vitest";
import {
  displayPlayerName,
  formatSeatLabel,
  isPlaceholderPlayerName,
} from "../seatLabel";

describe("座位标签工具", () => {
  test("系统占位名与座位号重复，判定为占位", () => {
    expect(isPlaceholderPlayerName("玩家 2", 1)).toBe(true);
    expect(isPlaceholderPlayerName("玩家2", 1)).toBe(true);
    expect(isPlaceholderPlayerName(" 玩家 2 ", 1)).toBe(true);
    expect(isPlaceholderPlayerName("玩家 1", 0)).toBe(true);
  });

  test("空值/null/纯空白 一律视为占位", () => {
    expect(isPlaceholderPlayerName("", 0)).toBe(true);
    expect(isPlaceholderPlayerName("   ", 0)).toBe(true);
    expect(isPlaceholderPlayerName(null, 0)).toBe(true);
    expect(isPlaceholderPlayerName(undefined, 0)).toBe(true);
  });

  test("真实姓名不算占位", () => {
    expect(isPlaceholderPlayerName("张三", 1)).toBe(false);
    expect(isPlaceholderPlayerName("玩家小明", 1)).toBe(false);
  });

  test("占位名必须与座位号对应，错位的不算占位", () => {
    expect(isPlaceholderPlayerName("玩家 3", 1)).toBe(false);
  });

  test("formatSeatLabel 去掉重复的占位名", () => {
    expect(formatSeatLabel(1, "玩家 2")).toBe("2号");
    expect(formatSeatLabel(1, "")).toBe("2号");
    expect(formatSeatLabel(1, undefined)).toBe("2号");
    expect(formatSeatLabel(0, "玩家 1")).toBe("1号");
  });

  test("formatSeatLabel 保留真实姓名并清理空白", () => {
    expect(formatSeatLabel(1, "张三")).toBe("2号 (张三)");
    expect(formatSeatLabel(1, "  张三  ")).toBe("2号 (张三)");
  });

  test("displayPlayerName 占位名返回空串", () => {
    expect(displayPlayerName("玩家 4", 3)).toBe("");
    expect(displayPlayerName(null, 3)).toBe("");
    expect(displayPlayerName("李四", 3)).toBe("李四");
  });
});

import { describe, expect, it } from "vitest";
import { buildDemonFirstNightDialog } from "../demonFirstNightHelper";
import type { NightActionContext } from "../../../types/roleDefinition";

/**
 * 恶魔首夜通用逻辑（`buildDemonFirstNightDialog`）单元测试
 *
 * 覆盖三条契约：
 * 1. **确定性**：同一 rng 序列 ⇒ 同一「不在场角色」文案（回归裸 `Math.random()`）
 * 2. **罂粟种植者内容闸门**：罂粟在场且健康时，**恶魔仍被唤醒拿 3 个伪装，
 *    但绝不告知爪牙**（官方：唤醒恶魔给 3 个不在场善良角色；不要进行爪牙/恶魔信息步骤）
 * 3. **伪装配额**：镇民优先、不足 3 个才用外来者补且最多 1 个外来者
 */

type Seat = NightActionContext["seats"][number];

function seat(id: number, roleId: string, type: string): Seat {
  return {
    id,
    role: { id: roleId, name: roleId, type } as Seat["role"],
    isDead: false,
    statusEffects: [],
  } as unknown as Seat;
}

/** 简易可复现 rng（线性同余），保证同种子同序列 */
function seededRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function ctx(
  seats: Seat[],
  roles: Array<{ id: string; name: string; type: string }>,
  rng?: () => number
): NightActionContext {
  return {
    seats,
    roles: roles as NightActionContext["roles"],
    selfId: 1,
    rng,
  } as unknown as NightActionContext;
}

const ROLES = [
  { id: "washerwoman", name: "洗衣妇", type: "townsfolk" },
  { id: "librarian", name: "图书管理员", type: "townsfolk" },
  { id: "investigator", name: "调查员", type: "townsfolk" },
  { id: "chef", name: "厨师", type: "townsfolk" },
  { id: "empath", name: "共情者", type: "townsfolk" },
  { id: "drunk", name: "酒鬼", type: "outsider" },
  { id: "saint", name: "圣徒", type: "outsider" },
];

describe("buildDemonFirstNightDialog", () => {
  it("✅ 确定性：同一 rng 种子 ⇒ 完全相同的「不在场角色」文案（回归裸 Math.random）", () => {
    const seats = [seat(1, "imp", "demon"), seat(2, "poisoner", "minion")];
    const a = buildDemonFirstNightDialog(1, "小恶魔", ctx(seats, ROLES, seededRng(42)));
    const b = buildDemonFirstNightDialog(1, "小恶魔", ctx(seats, ROLES, seededRng(42)));
    expect(a.wake).toBe(b.wake);
    expect(a.wake).toContain("不在场角色");
  });

  it("✅ 罂粟种植者在场且健康 ⇒ 恶魔仍被唤醒（给伪装）但**不告知爪牙**", () => {
    const seats = [
      seat(0, "poppy_grower", "townsfolk"),
      seat(1, "imp", "demon"),
      seat(2, "poisoner", "minion"),
    ];
    const d = buildDemonFirstNightDialog(
      1,
      "小恶魔",
      ctx(seats, ROLES, seededRng(7))
    );
    expect(d.wake).toContain("罂粟种植者在场");
    // ⚠️ 不能用 `not.toContain("你的爪牙是")` —— 提示语自身含「你不知道你的爪牙是谁」，
    //    会被前缀误判。改为断言**不出现"爪牙是 N号"的具名揭示**。
    expect(d.wake).not.toMatch(/你的爪牙是\s*\d+号|你的爪牙是\s*3号/);
    expect(d.wake).not.toContain("3号");
    expect(d.wake).toContain("不在场角色"); // 3 个伪装仍要给
  });

  it("✅ 罂粟种植者已死 ⇒ 恢复正常：告知爪牙 + 给伪装", () => {
    const seats = [
      seat(0, "poppy_grower", "townsfolk"),
      seat(1, "imp", "demon"),
      seat(2, "poisoner", "minion"),
    ];
    const d = buildDemonFirstNightDialog(1, "小恶魔", {
      ...ctx(seats, ROLES, seededRng(7)),
      poppyGrowerDead: true,
    } as NightActionContext);
    expect(d.wake).toContain("你的爪牙是");
    // 座位号 = id + 1（投毒者在 id=2 ⇒ 显示 3号）；恶魔自身 id=1（2号）被排除
    expect(d.wake).toContain("3号");
    expect(d.wake).not.toContain("2号)");
    expect(d.wake).toContain("不在场角色");
  });

  it("✅ 伪装配额：最多 3 个不在场角色，外来者最多补 1 个", () => {
    const seats = [seat(1, "imp", "demon")];
    for (let i = 0; i < 4; i++) {
      const d = buildDemonFirstNightDialog(
        1,
        "小恶魔",
        ctx(seats, ROLES, seededRng(100 + i))
      );
      const m = d.wake.match(/不在场角色：([^；]+)/);
      expect(m, `未匹配到不在场角色文案：${d.wake}`).toBeTruthy();
      const picked = m![1].split("、").filter(Boolean);
      expect(picked.length).toBeLessThanOrEqual(3);
      // 外来者至多 1 个
      const outsiderNames = new Set(["酒鬼", "圣徒"]);
      expect(picked.filter((n) => outsiderNames.has(n)).length).toBeLessThanOrEqual(1);
    }
  });
});

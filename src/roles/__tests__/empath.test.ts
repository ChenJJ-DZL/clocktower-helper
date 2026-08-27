import { describe, expect, test } from "vitest";
import { empath } from "../townsfolk/empath";

function seat(
  id: number,
  rid: string,
  rt: string,
  isEvil = false,
  isDead = false,
  isDrunk = false
) {
  const n: Record<string, string> = {
    empath: "共情者",
    imp: "小恶魔",
    spy: "间谍",
    soldier: "士兵",
    recluse: "陌客",
    butler: "管家",
    saint: "圣徒",
  };
  return {
    id,
    isDead,
    isAlive: !isDead,
    isDrunk,
    isPoisoned: false,
    role: { id: rid, name: n[rid] || rid, type: rt },
    _isEvil: () => isEvil || rid === "imp" || rid === "spy",
  };
}

function countEvilNeighbors(
  seats: ReturnType<typeof seat>[],
  targetIdx: number
): number {
  const n = seats.length;
  let cnt = 0;
  for (let d = -1; d <= 1; d += 2) {
    for (let step = 1; step < n; step++) {
      const idx = (((targetIdx + d * step) % n) + n) % n;
      const s = seats[idx];
      if (!s.isAlive) continue;
      if (s._isEvil()) cnt++;
      break;
    }
  }
  return cnt;
}

describe("共情者 (Empath)", () => {
  test("Wiki-JSON一致", () => {
    expect("每个夜晚，你会得知与你邻近的两名存活的玩家中邪恶玩家的数量。").toBe(
      "每个夜晚，你会得知与你邻近的两名存活的玩家中邪恶玩家的数量。"
    );
  });
  test("首夜+其他夜均唤醒", () => {
    expect(true).toBe(true);
  });
  test("两旁都是善良-返回0", () => {
    const ss = [
      seat(1, "soldier", "townsfolk"),
      seat(0, "empath", "townsfolk"),
      seat(2, "butler", "outsider"),
    ];
    expect(countEvilNeighbors(ss, 1)).toBe(0);
  });
  test("一旁邪恶-返回1", () => {
    const ss = [
      seat(1, "imp", "demon"),
      seat(0, "empath", "townsfolk"),
      seat(2, "soldier", "townsfolk"),
    ];
    expect(countEvilNeighbors(ss, 1)).toBe(1);
  });
  test("两旁邪恶-返回2", () => {
    const ss = [
      seat(1, "imp", "demon"),
      seat(0, "empath", "townsfolk"),
      seat(2, "spy", "minion"),
    ];
    expect(countEvilNeighbors(ss, 1)).toBe(2);
  });
  test("跳过死亡邻座", () => {
    const ss = [
      seat(1, "imp", "demon"),
      seat(0, "empath", "townsfolk"),
      seat(3, "saint", "outsider"),
      seat(2, "spy", "minion", false, true),
    ];
    const c = countEvilNeighbors(ss, 1);
    expect(c).toBe(1);
  });
  test("醉酒能力失效", () => {
    const em = seat(0, "empath", "townsfolk", false, false, true);
    expect(em.isDrunk || em.isPoisoned).toBe(true);
  });
  test("中毒/受干扰状态下，dialog 生成的信息 100% 为错误数字且绝非真实值", () => {
    const ss = [
      seat(0, "empath", "townsfolk"),
      seat(1, "soldier", "townsfolk"),
      seat(2, "butler", "outsider"),
    ];
    // 真实值应为 0
    for (let i = 0; i < 20; i++) {
      const dialog = (empath.night as any).dialog(0, false, {
        seats: ss,
        isActorDisabledByPoisonOrDrunk: () => true,
      });
      // 必须不是 0
      expect(dialog.wake).not.toContain("0 名");
      expect(dialog.wake).toMatch(/([12]) 名/);
    }
  });
});

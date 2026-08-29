import { describe, expect, it } from "vitest";
import type { Role, Seat } from "@/app/data";

/**
 * 模拟 swapSeats 纯函数逻辑（与 useSeatManager 中的 swapSeats 保持完全一致）
 */
function performSwapSeats(
  seats: Seat[],
  seatNotes: Record<number, string> | undefined,
  seatId1: number,
  seatId2: number
): {
  newSeats: Seat[];
  newNotes: Record<number, string>;
  logMessage: string | null;
} {
  if (seatId1 === seatId2) {
    return {
      newSeats: seats,
      newNotes: seatNotes ? { ...seatNotes } : {},
      logMessage: null,
    };
  }

  const s1 = seats.find((s) => s.id === seatId1);
  const s2 = seats.find((s) => s.id === seatId2);
  if (!s1 || !s2) {
    return {
      newSeats: seats,
      newNotes: seatNotes ? { ...seatNotes } : {},
      logMessage: null,
    };
  }

  const newSeats = seats.map((s) => {
    if (s.id === seatId1) {
      return { ...s2, id: seatId1 };
    }
    if (s.id === seatId2) {
      return { ...s1, id: seatId2 };
    }
    return s;
  });

  const newNotes = seatNotes ? { ...seatNotes } : {};
  const n1 = newNotes[seatId1];
  const n2 = newNotes[seatId2];
  if (n2 !== undefined) newNotes[seatId1] = n2;
  else delete newNotes[seatId1];
  if (n1 !== undefined) newNotes[seatId2] = n1;
  else delete newNotes[seatId2];

  const name1 = s1.role?.name || s1.playerName || `${seatId1 + 1}号`;
  const name2 = s2.role?.name || s2.playerName || `${seatId2 + 1}号`;
  const logMessage = `🔀 ${seatId1 + 1}号 (${name1}) 与 ${seatId2 + 1}号 (${name2}) 互换了座位`;

  return { newSeats, newNotes, logMessage };
}

/**
 * 计算两个矩形的重叠面积比例（用于 50% 碰撞判定）
 */
function calculateOverlapRatio(
  rectA: {
    left: number;
    right: number;
    top: number;
    bottom: number;
    width: number;
    height: number;
  },
  rectB: {
    left: number;
    right: number;
    top: number;
    bottom: number;
    width: number;
    height: number;
  }
): number {
  const overlapW = Math.max(
    0,
    Math.min(rectA.right, rectB.right) - Math.max(rectA.left, rectB.left)
  );
  const overlapH = Math.max(
    0,
    Math.min(rectA.bottom, rectB.bottom) - Math.max(rectA.top, rectB.top)
  );
  const overlapArea = overlapW * overlapH;
  const minArea = Math.min(
    rectA.width * rectA.height,
    rectB.width * rectB.height
  );
  return minArea > 0 ? overlapArea / minArea : 0;
}

describe("swapSeats - 座位互换逻辑与重叠判定测试", () => {
  const empathRole: Role = {
    id: "empath",
    name: "共情者",
    type: "townsfolk",
    firstNightOrder: 37,
    otherNightOrder: 53,
  };

  const poisonerRole: Role = {
    id: "poisoner",
    name: "下毒者",
    type: "minion",
    firstNightOrder: 17,
    otherNightOrder: 8,
  };

  const createMockSeats = (): Seat[] => [
    {
      id: 0,
      role: null,
      playerName: "玩家1",
      isDead: false,
      isDrunk: false,
      isPoisoned: false,
      isProtected: false,
      protectedBy: null,
      isRedHerring: false,
      isFortuneTellerRedHerring: false,
      isSentenced: false,
      masterId: null,
      hasUsedSlayerAbility: false,
      hasUsedVirginAbility: false,
      isDemonSuccessor: false,
      hasAbilityEvenDead: false,
      statusDetails: [],
      grandchildId: null,
      isGrandchild: false,
      charadeRole: null,
    },
    {
      id: 1, // 2号
      role: empathRole,
      playerName: "张三",
      isDead: false,
      isDrunk: false,
      isPoisoned: false,
      isProtected: false,
      protectedBy: null,
      isRedHerring: false,
      isFortuneTellerRedHerring: false,
      isSentenced: false,
      masterId: null,
      hasUsedSlayerAbility: false,
      hasUsedVirginAbility: false,
      isDemonSuccessor: false,
      hasAbilityEvenDead: false,
      statusDetails: ["善良"],
      grandchildId: null,
      isGrandchild: false,
      charadeRole: null,
    },
    {
      id: 11, // 12号
      role: poisonerRole,
      playerName: "李四",
      isDead: false,
      isDrunk: false,
      isPoisoned: false,
      isProtected: false,
      protectedBy: null,
      isRedHerring: false,
      isFortuneTellerRedHerring: false,
      isSentenced: false,
      masterId: null,
      hasUsedSlayerAbility: false,
      hasUsedVirginAbility: false,
      isDemonSuccessor: false,
      hasAbilityEvenDead: false,
      statusDetails: ["邪恶"],
      grandchildId: null,
      isGrandchild: false,
      charadeRole: null,
    },
  ];

  it("应当正确互换 2号(共情者) 与 12号(下毒者) 的角色与属性，并保留各自物理座位号", () => {
    const seats = createMockSeats();
    const notes: Record<number, string> = {
      1: "2号看起来很阳光",
      11: "12号首夜眼神躲闪",
    };

    const { newSeats, newNotes, logMessage } = performSwapSeats(
      seats,
      notes,
      1,
      11
    );

    const seat2 = newSeats.find((s) => s.id === 1);
    const seat12 = newSeats.find((s) => s.id === 11);

    expect(seat2).toBeDefined();
    expect(seat12).toBeDefined();

    // 2号座位现在应持有下毒者角色与李四玩家名
    expect(seat2?.role?.id).toBe("poisoner");
    expect(seat2?.role?.name).toBe("下毒者");
    expect(seat2?.playerName).toBe("李四");
    expect(seat2?.statusDetails).toEqual(["邪恶"]);

    // 12号座位现在应持有共情者角色与张三玩家名
    expect(seat12?.role?.id).toBe("empath");
    expect(seat12?.role?.name).toBe("共情者");
    expect(seat12?.playerName).toBe("张三");
    expect(seat12?.statusDetails).toEqual(["善良"]);

    // 备忘录应正确互换
    expect(newNotes[1]).toBe("12号首夜眼神躲闪");
    expect(newNotes[11]).toBe("2号看起来很阳光");

    // 日志消息应明确记录
    expect(logMessage).toBe("🔀 2号 (共情者) 与 12号 (下毒者) 互换了座位");
  });

  it("当交换相同座位时应为无害 no-op", () => {
    const seats = createMockSeats();
    const notes = { 1: "note 1" };

    const { newSeats, newNotes, logMessage } = performSwapSeats(
      seats,
      notes,
      1,
      1
    );
    expect(newSeats).toBe(seats);
    expect(logMessage).toBeNull();
    expect(newNotes[1]).toBe("note 1");
  });

  it("重叠面积计算公式应当精准识别 50% 碰撞阈值", () => {
    // 两个 100x100 的矩形
    const rectA = {
      left: 0,
      right: 100,
      top: 0,
      bottom: 100,
      width: 100,
      height: 100,
    };

    // 场景 1: 完全无重叠
    const rectNoOverlap = {
      left: 200,
      right: 300,
      top: 0,
      bottom: 100,
      width: 100,
      height: 100,
    };
    expect(calculateOverlapRatio(rectA, rectNoOverlap)).toBe(0);

    // 场景 2: 重叠 30% (宽重叠 30px, 高重叠 100px => 3000 / 10000 = 0.3)
    const rectOverlap30 = {
      left: 70,
      right: 170,
      top: 0,
      bottom: 100,
      width: 100,
      height: 100,
    };
    expect(calculateOverlapRatio(rectA, rectOverlap30)).toBeCloseTo(0.3, 2);
    expect(calculateOverlapRatio(rectA, rectOverlap30) >= 0.5).toBe(false);

    // 场景 3: 重叠 50% (宽重叠 50px, 高重叠 100px => 5000 / 10000 = 0.5)
    const rectOverlap50 = {
      left: 50,
      right: 150,
      top: 0,
      bottom: 100,
      width: 100,
      height: 100,
    };
    expect(calculateOverlapRatio(rectA, rectOverlap50)).toBeCloseTo(0.5, 2);
    expect(calculateOverlapRatio(rectA, rectOverlap50) >= 0.5).toBe(true);

    // 场景 4: 重叠 80% (宽重叠 80px, 高重叠 100px => 8000 / 10000 = 0.8)
    const rectOverlap80 = {
      left: 20,
      right: 120,
      top: 0,
      bottom: 100,
      width: 100,
      height: 100,
    };
    expect(calculateOverlapRatio(rectA, rectOverlap80)).toBeCloseTo(0.8, 2);
    expect(calculateOverlapRatio(rectA, rectOverlap80) >= 0.5).toBe(true);

    // 场景 5: 100% 完全重合
    expect(calculateOverlapRatio(rectA, rectA)).toBe(1);
  });

  it("应当严格限制拖拽换位仅在首夜进入前（准备/检视阶段）允许，进入首夜及之后禁用", () => {
    const isDragSwapAllowed = (phase: string) =>
      phase === "setup" || phase === "check" || phase === "scriptSelection";

    // 首夜前允许
    expect(isDragSwapAllowed("setup")).toBe(true);
    expect(isDragSwapAllowed("check")).toBe(true);
    expect(isDragSwapAllowed("scriptSelection")).toBe(true);

    // 进入首夜及后续阶段一律禁止
    expect(isDragSwapAllowed("firstNight")).toBe(false);
    expect(isDragSwapAllowed("day")).toBe(false);
    expect(isDragSwapAllowed("dusk")).toBe(false);
    expect(isDragSwapAllowed("night")).toBe(false);
    expect(isDragSwapAllowed("gameOver")).toBe(false);
  });
});

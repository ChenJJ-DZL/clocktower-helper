/**
 * 镜像双子配对解析 · 严格版 vs 展示版（2026-11-01 P0 收口单测）
 * ======================================================================
 * 唯一事实来源：`src/utils/evilTwinHelper.ts`
 *   · `resolveEvilTwinPair`           判胜级严格解析：只认 explicit / seatFlag 证据
 *   · `resolveEvilTwinPairForDisplay` 展示/调度级：允许 heuristic 占位，resolved 恒 false
 *
 * 断言全部真实调用两个 resolver，不复制其内部规则。
 */
import { describe, expect, it } from "vitest";
import { roles } from "../../../app/data";
import {
  resolveEvilTwinPair,
  resolveEvilTwinPairForDisplay,
} from "../evilTwinHelper";

const r = (id: string) => roles.find((x) => x.id === id)!;

function seat(
  id: number,
  roleId: string,
  over: Record<string, unknown> = {}
): any {
  return {
    id,
    playerName: `玩家${id + 1}`,
    role: r(roleId),
    isDead: false,
    isDrunk: false,
    isPoisoned: false,
    statusEffects: [],
    ...over,
  };
}

const dead = (s: any) => ({ ...s, isDead: true });

describe("resolveEvilTwinPair · 严格解析（判胜级唯一入口）", () => {
  it("explicit 配对优先：goodId 指向的座位被采纳，source=explicit/resolved=true", () => {
    const seats = [
      seat(0, "evil_twin"),
      seat(1, "chef"), // 启发式会先猜这个
      seat(2, "librarian"),
      seat(3, "soldier"),
    ];
    const pair = resolveEvilTwinPair(seats, { evilId: 0, goodId: 2 });

    expect(pair.source).toBe("explicit");
    expect(pair.resolved).toBe(true);
    expect(pair.evilTwinSeat?.id).toBe(0);
    expect(pair.goodTwinSeat?.id).toBe(2);
    expect(pair.isGoodTwin(2)).toBe(true);
    expect(pair.isGoodTwin(1)).toBe(false);
  });

  it("explicit 优先于座位 isGoodTwin 标记（权威 > 旧标记）", () => {
    const seats = [
      seat(0, "evil_twin"),
      seat(1, "chef"),
      seat(2, "librarian", { isGoodTwin: true }),
    ];
    const pair = resolveEvilTwinPair(seats, { goodId: 1 });
    expect(pair.source).toBe("explicit");
    expect(pair.goodTwinSeat?.id).toBe(1);
    expect(pair.isGoodTwin(2)).toBe(false);
  });

  it("goodId 优先于 goodSeatId（同对象同时存在时）", () => {
    const seats = [seat(0, "evil_twin"), seat(1, "chef"), seat(2, "librarian")];
    const pair = resolveEvilTwinPair(seats, { goodId: 1, goodSeatId: 2 });
    expect(pair.source).toBe("explicit");
    expect(pair.goodTwinSeat?.id).toBe(1);
  });

  it("seatFlag 次之：无 explicit 时采纳座位显式标记", () => {
    const seats = [
      seat(0, "evil_twin"),
      seat(1, "chef"),
      seat(2, "librarian", { isGoodTwin: true }),
    ];
    const pair = resolveEvilTwinPair(seats, null);
    expect(pair.source).toBe("seatFlag");
    expect(pair.resolved).toBe(true);
    expect(pair.goodTwinSeat?.id).toBe(2);
    expect(pair.isGoodTwin(2)).toBe(true);
    expect(pair.isGoodTwin(1)).toBe(false);
  });

  it("脏配对（goodId 指向镜像双子本人）被忽略：有座位标记则回落 seatFlag", () => {
    const seats = [
      seat(0, "evil_twin"),
      seat(1, "chef"),
      seat(2, "librarian", { isGoodTwin: true }),
    ];
    const pair = resolveEvilTwinPair(seats, { evilId: 0, goodId: 0 });
    expect(pair.source).toBe("seatFlag");
    expect(pair.goodTwinSeat?.id).toBe(2);
  });

  it("脏配对（goodId 指向镜像双子本人）且无其它证据 → unresolved，绝不猜", () => {
    const seats = [seat(0, "evil_twin"), seat(1, "chef"), seat(2, "librarian")];
    const pair = resolveEvilTwinPair(seats, { evilId: 0, goodId: 0 });
    expect(pair.source).toBe("unresolved");
    expect(pair.resolved).toBe(false);
    expect(pair.goodTwinSeat).toBeNull();
  });

  it("只有 evilId 没有 goodId → 无效证据 ⇒ unresolved", () => {
    const seats = [seat(0, "evil_twin"), seat(1, "chef")];
    const pair = resolveEvilTwinPair(seats, { evilId: 0 });
    expect(pair.resolved).toBe(false);
    expect(pair.source).toBe("unresolved");
    expect(pair.goodTwinSeat).toBeNull();
  });

  it("无任何证据 ⇒ unresolved：goodTwinSeat=null、resolved=false、isGoodTwin 恒 false", () => {
    const seats = [
      seat(0, "evil_twin"),
      seat(1, "chef"), // 展示启发式会猜它
      seat(2, "librarian"),
    ];
    const pair = resolveEvilTwinPair(seats, undefined);
    expect(pair.source).toBe("unresolved");
    expect(pair.resolved).toBe(false);
    expect(pair.evilTwinSeat?.id).toBe(0);
    expect(pair.goodTwinSeat).toBeNull();
    for (const s of seats) expect(pair.isGoodTwin(s.id)).toBe(false);
  });

  it("场上没有镜像双子 ⇒ 全空 unresolved", () => {
    const seats = [seat(0, "chef"), seat(1, "librarian", { isGoodTwin: true })];
    const pair = resolveEvilTwinPair(seats, { goodId: 1 });
    expect(pair.evilTwinSeat).toBeNull();
    expect(pair.goodTwinSeat).toBeNull();
    expect(pair.source).toBe("unresolved");
    expect(pair.resolved).toBe(false);
  });

  it("explicit 允许指向已死亡的善良双子（身份唯一性不因死亡消失）", () => {
    const seats = [
      seat(0, "evil_twin"),
      dead(seat(1, "chef")),
      seat(2, "librarian"),
    ];
    const pair = resolveEvilTwinPair(seats, { goodId: 1 });
    expect(pair.source).toBe("explicit");
    expect(pair.resolved).toBe(true);
    expect(pair.goodTwinSeat?.id).toBe(1);
    expect(pair.goodTwinSeat?.isDead).toBe(true);
  });

  it("多个镜像双子：evilTwinSeat 优先取存活者", () => {
    const seats = [
      dead(seat(0, "evil_twin")),
      seat(1, "evil_twin"),
      seat(2, "librarian"),
    ];
    const pair = resolveEvilTwinPair(seats, { goodId: 2 });
    expect(pair.evilTwinSeat?.id).toBe(1);
    expect(pair.goodTwinSeat?.id).toBe(2);
  });
});

describe("resolveEvilTwinPairForDisplay · 展示启发式（resolved 恒 false）", () => {
  it("无证据：取「首个存活镇民/外来者」占位（跳过死者），source=heuristic、resolved=false", () => {
    const seats = [
      seat(0, "evil_twin"),
      dead(seat(1, "chef")), // 死者不参与首轮启发式
      seat(2, "librarian"),
      seat(3, "soldier"),
    ];
    const pair = resolveEvilTwinPairForDisplay(seats, null);
    expect(pair.source).toBe("heuristic");
    expect(pair.resolved).toBe(false);
    expect(pair.evilTwinSeat?.id).toBe(0);
    expect(pair.goodTwinSeat?.id).toBe(2);
  });

  it("无证据：启发式跳过 isEvilConverted 的存活镇民，优先取未转化者", () => {
    const seats = [
      seat(0, "evil_twin"),
      seat(1, "chef", { isEvilConverted: true }),
      seat(2, "librarian"),
    ];
    const pair = resolveEvilTwinPairForDisplay(seats);
    expect(pair.source).toBe("heuristic");
    expect(pair.goodTwinSeat?.id).toBe(2);
  });

  it("无证据：候选池只有已死亡镇民时，第二级兜底仍给展示占位（resolved 仍 false）", () => {
    // 记录当前展示语义：层级 2 只要求「镇民/外来者」，不要求存活。
    const seats = [
      seat(0, "evil_twin"),
      dead(seat(1, "chef")),
      seat(2, "poisoner"), // 爪牙不进入启发式候选池
    ];
    const pair = resolveEvilTwinPairForDisplay(seats);
    expect(pair.source).toBe("heuristic");
    expect(pair.resolved).toBe(false);
    expect(pair.goodTwinSeat?.id).toBe(1);
  });

  it("无证据且场上没有镇民/外来者 ⇒ unresolved（不猜爪牙/恶魔）", () => {
    const seats = [seat(0, "evil_twin"), seat(1, "poisoner"), seat(2, "imp")];
    const pair = resolveEvilTwinPairForDisplay(seats);
    expect(pair.source).toBe("unresolved");
    expect(pair.resolved).toBe(false);
    expect(pair.goodTwinSeat).toBeNull();
  });

  it("有 explicit 配对 ⇒ 直接透传权威结果（source=explicit、resolved=true）", () => {
    const seats = [seat(0, "evil_twin"), seat(1, "chef"), seat(2, "librarian")];
    const pair = resolveEvilTwinPairForDisplay(seats, { goodId: 2 });
    expect(pair.source).toBe("explicit");
    expect(pair.resolved).toBe(true);
    expect(pair.goodTwinSeat?.id).toBe(2);
  });

  it("有 seatFlag ⇒ 透传权威结果（source=seatFlag、resolved=true，不再是 heuristic）", () => {
    const seats = [
      seat(0, "evil_twin"),
      seat(1, "chef"),
      seat(2, "librarian", { isGoodTwin: true }),
    ];
    const pair = resolveEvilTwinPairForDisplay(seats);
    expect(pair.source).toBe("seatFlag");
    expect(pair.resolved).toBe(true);
    expect(pair.goodTwinSeat?.id).toBe(2);
  });

  it("场上没有镜像双子 ⇒ unresolved（evilTwinSeat=null）", () => {
    const seats = [seat(0, "chef"), seat(1, "librarian")];
    const pair = resolveEvilTwinPairForDisplay(seats, { goodId: 1 });
    expect(pair.evilTwinSeat).toBeNull();
    expect(pair.source).toBe("unresolved");
    expect(pair.goodTwinSeat).toBeNull();
  });

  it("多个镜像双子：evilTwinSeat 优先取存活者（不做启发式替换）", () => {
    const seats = [
      dead(seat(0, "evil_twin")),
      seat(1, "evil_twin"),
      seat(2, "librarian"),
    ];
    const pair = resolveEvilTwinPairForDisplay(seats);
    expect(pair.evilTwinSeat?.id).toBe(1);
    expect(pair.goodTwinSeat?.id).toBe(2);
    expect(pair.source).toBe("heuristic");
  });

  it("严格版绝不继承展示版的 heuristic 猜测（同一棋盘两种解析口径）", () => {
    const seats = [seat(0, "evil_twin"), seat(1, "chef"), seat(2, "librarian")];
    const display = resolveEvilTwinPairForDisplay(seats);
    const strict = resolveEvilTwinPair(seats);

    expect(display.source).toBe("heuristic");
    expect(display.goodTwinSeat?.id).toBe(1);
    // 严格版对同一棋盘仍然 unresolved —— 展示猜测不得回流成判胜证据
    expect(strict.source).toBe("unresolved");
    expect(strict.resolved).toBe(false);
    expect(strict.goodTwinSeat).toBeNull();
  });
});

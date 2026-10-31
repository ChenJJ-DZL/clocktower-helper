import { describe, it, expect } from "vitest";
import { checkGameEnd } from "../../../app/gameLogic";
import type { Seat } from "../../../app/data";

function makeSeat(id: number, roleId: string, roleType: any, isDead = false, extra: Partial<Seat> = {}): Seat {
  return {
    id,
    name: `玩家${id + 1}`,
    role: { id: roleId, name: roleId, type: roleType },
    isDead,
    isPoisoned: false,
    isDrunk: false,
    ...extra,
  } as unknown as Seat;
}

describe("镜像双子胜负判定防御：处决非双子的善良玩家绝不误判双子胜利", () => {
  it("当处决非双子的镇民（如小精灵）时，绝不得判定善良双子被处决", () => {
    // 0号 图书管理员（善良双子）
    // 1号 镜像双子（邪恶）
    // 2号 小恶魔（邪恶）
    // 14号 小精灵（镇民，善良）
    const seats: Seat[] = [
      makeSeat(0, "librarian", "townsfolk", false, { isGoodTwin: true }),
      makeSeat(1, "evil_twin", "minion", false),
      makeSeat(2, "imp", "demon", false),
      makeSeat(3, "farmer", "townsfolk", false),
      makeSeat(14, "pixie", "townsfolk", true), // 15号被处决死亡
    ];

    // 处决 14号（15号小精灵）
    const res = checkGameEnd(seats, "execution", 14, {
      evilTwinPair: { evilId: 1, goodId: 0 },
    });

    expect(res.isGameOver).toBe(false);
    expect(res.reason).toBeNull();
  });

  it("即使 evilTwinPair 为空（未显式绑定），处决非双子镇民也绝不得触发双子胜利", () => {
    // 0号 图书管理员（默认第一个善良镇民，被 resolveEvilTwinPair 识别为善良双子）
    // 1号 镜像双子
    // 2号 小恶魔
    // 14号 小精灵
    const seats: Seat[] = [
      makeSeat(0, "librarian", "townsfolk", false),
      makeSeat(1, "evil_twin", "minion", false),
      makeSeat(2, "imp", "demon", false),
      makeSeat(3, "farmer", "townsfolk", false),
      makeSeat(14, "pixie", "townsfolk", true),
    ];

    const res = checkGameEnd(seats, "execution", 14, {
      evilTwinPair: null,
    });

    expect(res.isGameOver).toBe(false);
    expect(res.reason).not.toBe("善良双子被处决（镜像双子胜利）");
  });

  it("仅当真正处决绑定的善良双子（0号）时，才正确触发镜像双子胜利", () => {
    const seats: Seat[] = [
      makeSeat(0, "librarian", "townsfolk", true, { isGoodTwin: true }), // 善良双子被处决死亡
      makeSeat(1, "evil_twin", "minion", false),
      makeSeat(2, "imp", "demon", false),
      makeSeat(3, "farmer", "townsfolk", false),
      makeSeat(14, "pixie", "townsfolk", false),
    ];

    const res = checkGameEnd(seats, "execution", 0, {
      evilTwinPair: { evilId: 1, goodId: 0 },
    });

    expect(res.isGameOver).toBe(true);
    expect(res.winner).toBe("Evil");
    expect(res.reason).toBe("善良双子被处决（镜像双子胜利）");
  });
});

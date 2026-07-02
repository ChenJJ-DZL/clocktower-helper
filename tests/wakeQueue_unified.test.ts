/**
 * wakeQueue 统一测试
 * 验证：
 * 1. 新版 normalizeNightActionQueue 正确处理 NightActionNode[]
 * 2. 旧版 normalizeWakeQueueForDeaths 仍然兼容
 * 3. 守鸦人特殊情况
 * 4. hasAbilityEvenDead 特殊情况
 * 5. 转换工具函数正确
 */
import { describe, expect, test } from "vitest";
import type { Seat } from "../app/data";
import type { NightActionNode } from "../src/utils/nightStateMachine";
import {
  idsToNightActionNodes,
  nightActionNodesToIds,
  normalizeNightActionQueue,
  normalizeWakeQueueForDeaths,
} from "../src/utils/wakeQueue";

describe("normalizeNightActionQueue (新 API)", () => {
  const makeNodes = (seatIds: number[]): NightActionNode[] =>
    seatIds.map((id, i) => ({
      seatId: id,
      roleId: "",
      roleName: "",
      priority: i,
      isFirstNightOnly: false,
      abilityId: "",
      wakeMessage: "",
      wakePriority: i,
      targetIds: [],
      processed: false,
      success: false,
      meta: {},
    }));

  const makeSeat = (
    id: number,
    roleId: string,
    isDead: boolean,
    hasAbilityEvenDead = false
  ): Seat =>
    ({
      id,
      role: { id: roleId, name: roleId, type: "townsfolk" },
      isDead,
      hasAbilityEvenDead,
    }) as Seat;

  const seats = [0, 1, 2, 3, 4].map((id) => makeSeat(id, "villager", false));

  test("无死亡时应返回原队列", () => {
    const queue = makeNodes([0, 1, 2]);
    const result = normalizeNightActionQueue({
      queue,
      currentIndex: 1,
      seats,
      deadThisNight: [],
    });
    expect(result.queue).toEqual(queue);
    expect(result.currentIndex).toBe(1);
    expect(result.removedIds).toEqual([]);
  });

  test("死亡玩家被剔除且索引调整", () => {
    const deadSeats = seats.map((s) =>
      s.id === 1 ? { ...s, isDead: true } : s
    );
    const queue = makeNodes([0, 1, 2, 3]);
    const result = normalizeNightActionQueue({
      queue,
      currentIndex: 2,
      seats: deadSeats,
      deadThisNight: [1],
    });
    expect(result.queue.map((n) => n.seatId)).toEqual([0, 2, 3]);
    expect(result.currentIndex).toBe(1); // 因为 ID=1 在当前索引之前被剔除
    expect(result.removedIds).toEqual([1]);
  });

  test("队列为空时返回空", () => {
    const result = normalizeNightActionQueue({
      queue: [],
      currentIndex: 0,
      seats,
      deadThisNight: [],
    });
    expect(result.queue).toEqual([]);
    expect(result.currentIndex).toBe(0);
  });

  test("全死返回空队列", () => {
    const allDead = seats.map((s) => ({ ...s, isDead: true }));
    const queue = makeNodes([0, 1, 2]);
    const result = normalizeNightActionQueue({
      queue,
      currentIndex: 0,
      seats: allDead,
      deadThisNight: [0, 1, 2],
    });
    expect(result.queue).toEqual([]);
  });
});

describe("normalizeNightActionQueue - 特殊角色", () => {
  test("守鸦人当晚死亡仍保留在队列中", () => {
    const ravenkeeperSeat = {
      id: 2,
      role: { id: "ravenkeeper", name: "守鸦人", type: "townsfolk" },
      isDead: true,
      hasAbilityEvenDead: false,
    } as Seat;
    const seats = [
      {
        id: 0,
        role: { id: "villager", name: "村夫", type: "townsfolk" },
        isDead: false,
      } as Seat,
      {
        id: 1,
        role: { id: "chef", name: "厨师", type: "townsfolk" },
        isDead: false,
      } as Seat,
      ravenkeeperSeat,
    ];

    const nodes: NightActionNode[] = [
      {
        seatId: 0,
        roleId: "villager",
        roleName: "村夫",
        priority: 1,
        isFirstNightOnly: false,
        abilityId: "",
        wakeMessage: "",
        wakePriority: 1,
        targetIds: [],
        processed: false,
        success: false,
        meta: {},
      },
      {
        seatId: 1,
        roleId: "chef",
        roleName: "厨师",
        priority: 2,
        isFirstNightOnly: false,
        abilityId: "",
        wakeMessage: "",
        wakePriority: 2,
        targetIds: [],
        processed: false,
        success: false,
        meta: {},
      },
      {
        seatId: 2,
        roleId: "ravenkeeper",
        roleName: "守鸦人",
        priority: 3,
        isFirstNightOnly: false,
        abilityId: "",
        wakeMessage: "",
        wakePriority: 3,
        targetIds: [],
        processed: false,
        success: false,
        meta: {},
      },
    ];

    const result = normalizeNightActionQueue({
      queue: nodes,
      currentIndex: 1,
      seats,
      deadThisNight: [2],
    });

    // 守鸦人应仍在队列中
    const seatIds = result.queue.map((n) => n.seatId);
    expect(seatIds).toContain(2);
    expect(result.removedIds).not.toContain(2);
  });

  test("hasAbilityEvenDead 玩家死亡后仍保留", () => {
    const specialSeat = {
      id: 1,
      role: { id: "zombuul", name: "僵怖", type: "demon" },
      isDead: true,
      hasAbilityEvenDead: true,
    } as Seat;
    const seats = [
      {
        id: 0,
        role: { id: "villager", name: "村夫", type: "townsfolk" },
        isDead: false,
      } as Seat,
      specialSeat,
    ];

    const nodes: NightActionNode[] = [
      {
        seatId: 0,
        roleId: "villager",
        roleName: "村夫",
        priority: 1,
        isFirstNightOnly: false,
        abilityId: "",
        wakeMessage: "",
        wakePriority: 1,
        targetIds: [],
        processed: false,
        success: false,
        meta: {},
      },
      {
        seatId: 1,
        roleId: "zombuul",
        roleName: "僵怖",
        priority: 2,
        isFirstNightOnly: false,
        abilityId: "",
        wakeMessage: "",
        wakePriority: 2,
        targetIds: [],
        processed: false,
        success: false,
        meta: {},
      },
    ];

    const result = normalizeNightActionQueue({
      queue: nodes,
      currentIndex: 0,
      seats,
      deadThisNight: [1],
    });

    expect(result.queue.map((n) => n.seatId)).toContain(1);
    expect(result.removedIds).not.toContain(1);
  });
});

describe("normalizeWakeQueueForDeaths (旧 API 兼容)", () => {
  const seats = [
    {
      id: 0,
      role: { id: "villager", name: "村夫", type: "townsfolk" },
      isDead: false,
    } as Seat,
    {
      id: 1,
      role: { id: "chef", name: "厨师", type: "townsfolk" },
      isDead: false,
    } as Seat,
    {
      id: 2,
      role: { id: "empath", name: "感灵师", type: "townsfolk" },
      isDead: true,
    } as Seat,
  ];

  test("旧 API 通过新 API 实现，结果一致", () => {
    const result = normalizeWakeQueueForDeaths({
      wakeQueueIds: [0, 1, 2],
      currentWakeIndex: 1,
      seats,
      deadThisNight: [2],
      getSeatRoleId: (s) => s?.role?.id ?? null,
    });
    expect(result.wakeQueueIds).toEqual([0, 1]);
    expect(result.currentWakeIndex).toBe(1);
    expect(result.removedIds).toContain(2);
  });
});

describe("转换工具", () => {
  test("nightActionNodesToIds 正确转换", () => {
    const nodes: NightActionNode[] = [
      {
        seatId: 0,
        roleId: "a",
        roleName: "A",
        priority: 1,
        isFirstNightOnly: false,
        abilityId: "",
        wakeMessage: "",
        wakePriority: 1,
        targetIds: [],
        processed: false,
        success: false,
        meta: {},
      },
      {
        seatId: 5,
        roleId: "b",
        roleName: "B",
        priority: 2,
        isFirstNightOnly: false,
        abilityId: "",
        wakeMessage: "",
        wakePriority: 2,
        targetIds: [],
        processed: false,
        success: false,
        meta: {},
      },
    ];
    expect(nightActionNodesToIds(nodes)).toEqual([0, 5]);
  });

  test("idsToNightActionNodes 正确转换", () => {
    const seats = [
      { id: 0, role: { id: "chef", name: "厨师", type: "townsfolk" } } as Seat,
      {
        id: 1,
        role: { id: "washerwoman", name: "洗衣妇", type: "townsfolk" },
      } as Seat,
    ];
    const nodes = idsToNightActionNodes([0, 1], seats);
    expect(nodes[0].seatId).toBe(0);
    expect(nodes[0].roleId).toBe("chef");
    expect(nodes[1].seatId).toBe(1);
    expect(nodes[1].roleId).toBe("washerwoman");
  });
});

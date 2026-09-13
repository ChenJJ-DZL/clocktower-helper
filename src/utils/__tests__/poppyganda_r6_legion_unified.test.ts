/**
 * 罂粟花开 · 军团「统一行动节点」回归
 *
 * 用户确认（2026-09-13）：
 *   「无论场上多少个军团，都只触发 1 次军团的技能」
 *
 * 实现位置：`src/utils/dynamicQueueGenerator.ts` 第 5 步
 *   「军团统一行动节点合并：确保无论场上有多少军团玩家或夜序条目，
 *     仅产出 1 个军团夜间唤醒节点」
 *
 * ⚠️ 关键前置：`ENGINE_CONFIG.fullNightOrder` 由
 *   `generateNightOrderFromParser()` 基于**能力注册表**动态构建，
 *   因此测试**必须先 `initializeAbilityRegistry()`**，否则只会拿到
 *   3 个系统步骤（minion_info / legion_mutual_recognition / demon_info），
 *   夜序条目为空 → 队列为空 → **假绿**。
 */
import { describe, expect, it } from "vitest";
import { roles } from "../../../app/data";
import { ENGINE_CONFIG } from "../../hooks/useNightEngine";
import { generateDynamicNightQueue } from "../dynamicQueueGenerator";
import { initializeAbilityRegistry } from "../../roles/new_engine/abilityRegistry";

const r = (id: string) => roles.find((x) => x.id === id)!;

function seat(id: number, roleId: string) {
  return {
    id,
    playerName: `P${id + 1}`,
    role: r(roleId),
    isDead: false,
    isAlive: true,
    isDrunk: false,
    isPoisoned: false,
    statusEffects: [],
  };
}

function snap(seats: any[], night: number): any {
  return {
    seats,
    gamePhase: night === 1 ? "firstNight" : "night",
    nightCount: night,
    statusEffects: {},
    poppyGrowerDead: false,
    reminders: [],
    log: [],
  } as any;
}

/** 构造含 n 个军团的 7 人局（其余位置用非军团角色填充） */
function buildGame(legionCount: number): any[] {
  const fillers = ["mayor", "savant", "farmer", "baron", "snitch", "soldier"];
  const seats: any[] = [];
  let f = 0;
  for (let i = 0; i < 7; i++) {
    if (i < legionCount) seats.push(seat(i, "legion"));
    else seats.push(seat(i, fillers[f++ % fillers.length]));
  }
  return seats;
}

function queueOf(seats: any[], night: number) {
  return generateDynamicNightQueue(
    ENGINE_CONFIG.fullNightOrder,
    snap(seats, night),
    { isFirstNight: night === 1 }
  ) as any[];
}

describe("军团 · 统一行动节点（无论多少个军团只触发 1 次）", () => {
  initializeAbilityRegistry();

  it("前置自检：夜序表必须已由能力注册表构建（否则测试会假绿）", () => {
    const order = ENGINE_CONFIG.fullNightOrder as any[];
    expect(
      order.length,
      "夜序条目过少 —— 很可能漏了 initializeAbilityRegistry()"
    ).toBeGreaterThan(10);
    expect(order.some((e) => e.roleId === "legion")).toBe(true);
  });

  for (const n of [1, 2, 3, 5]) {
    it(`${n} 个军团 → 队列中 legion 节点恰好 1 个`, () => {
      const seats = buildGame(n);
      for (const night of [2, 3]) {
        const q = queueOf(seats, night);
        const legionNodes = q.filter((x) => x.roleId === "legion");
        expect(
          legionNodes.length,
          `${n} 军团 第${night}夜 应只产出 1 个 legion 节点，实际 ${legionNodes.length}`
        ).toBe(1);
        // 节点应带统一标记与全部军团座位
        expect(legionNodes[0].meta?.isLegionUnified).toBe(true);
        expect(legionNodes[0].meta?.legionSeatIds?.length).toBe(n);
      }
    });
  }

  it("首夜：不出现 legion 能力节点（首夜走 legion_mutual_recognition）", () => {
    const q = queueOf(buildGame(3), 1);
    expect(q.filter((x) => x.roleId === "legion").length).toBe(0);
  });

  it("军团节点的座位取第一个军团，且 wakeMessage 列出全部军团座位", () => {
    const seats = buildGame(3);
    const legionNodes = queueOf(seats, 2).filter((x) => x.roleId === "legion");
    expect(legionNodes[0].seatId).toBe(0);
    // 1号、2号、3号 三个军团
    for (const no of ["1号", "2号", "3号"]) {
      expect(legionNodes[0].wakeMessage).toContain(no);
    }
  });
});

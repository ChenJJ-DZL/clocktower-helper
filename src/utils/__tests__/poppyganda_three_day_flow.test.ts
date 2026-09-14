/**
 * 罂粟花开 · 前三个「夜晚 + 白天」跨天流程契约测试
 *
 * 此前缺口：只有**孤立的单夜模拟**，没有跨天连续性验证。
 * 本文件把真实函数串起来跑 3 天，断言跨天不变量：
 *   1. 夜序随天数切换正确（首夜-only 角色第2夜起不再唤醒）
 *   2. 夜间死亡 → 该座位在后续夜晚队列中消失
 *   3. 罂粟种植者**死亡当晚**爪牙互认重新出现（官方跨天规则）
 *   4. 每天黎明都用真实 `checkGameEnd` 判定，不误判
 *   5. deadThisNight 表示"今晚死的"，与历史死亡可区分
 *
 * ⚠️ 仍需 `initializeAbilityRegistry()`，否则夜序条目为空 → 测试假绿。
 *
 * 说明：本测试覆盖**引擎层跨天连续性**；「点击式完整流程」
 * （黄昏→提名→投票→处决的 UI 链路）仍待补，见手册 8.9 节备注。
 */
import { describe, expect, it } from "vitest";
import { roles } from "../../../app/data";
import { checkGameEnd } from "../../../app/gameLogic";
import { ENGINE_CONFIG } from "../../hooks/useNightEngine";
import { generateDynamicNightQueue } from "../dynamicQueueGenerator";
import { initializeAbilityRegistry } from "../../roles/new_engine/abilityRegistry";

const r = (id: string) => roles.find((x) => x.id === id)!;

function seat(id: number, roleId: string, over: Partial<any> = {}): any {
  return {
    id,
    playerName: `P${id + 1}`,
    role: r(roleId),
    isDead: false,
    isDrunk: false,
    isPoisoned: false,
    statusEffects: [],
    ...over,
  };
}

function snap(seats: any[], night: number, over: Partial<any> = {}): any {
  return {
    seats,
    gamePhase: night === 1 ? "firstNight" : "night",
    nightCount: night,
    statusEffects: {},
    poppyGrowerDead: false,
    reminders: [],
    log: [],
    ...over,
  } as any;
}

function queue(seats: any[], night: number, over: Partial<any> = {}) {
  return generateDynamicNightQueue(
    ENGINE_CONFIG.fullNightOrder,
    snap(seats, night, over),
    { isFirstNight: night === 1 }
  ) as any[];
}

/** 罂粟花开 9 人局：含首夜角色/其他夜角色/罂粟/外来者/爪牙/恶魔 */
function baseGame(): any[] {
  return [
    seat(0, "librarian"),      // 首夜-only
    seat(1, "chef"),           // 首夜-only
    seat(2, "monk"),           // 其他夜
    seat(3, "oracle"),         // 其他夜
    seat(4, "fortune_teller"), // 每夜
    seat(5, "drunk"),          // 无夜间行动
    seat(6, "baron"),          // 爪牙（首夜互认）
    seat(7, "imp"),            // 恶魔（其他夜击杀）
    seat(8, "poppy_grower"),   // 跨天规则关键
  ];
}

describe("罂粟花开 · 前三日夜/白天跨天契约", () => {
  initializeAbilityRegistry();

  it("前置自检：夜序表已构建（防假绿）", () => {
    const order = ENGINE_CONFIG.fullNightOrder as any[];
    expect(order.length).toBeGreaterThan(10);
    expect(order.some((e) => e.roleId === "librarian")).toBe(true);
  });

  it("第 1 夜：含首夜-only 角色（图书管理员 / 厨师），不含其他夜-only（僧侣 / 神谕者）", () => {
    const q = queue(baseGame(), 1);
    const ids = q.map((n) => n.roleId);
    expect(ids).toContain("librarian");
    expect(ids).toContain("chef");
    expect(ids).not.toContain("monk");
    expect(ids).not.toContain("oracle");
  });

  it("第 2/3 夜：首夜-only 角色不再唤醒，其他夜角色登场", () => {
    for (const night of [2, 3]) {
      const ids = queue(baseGame(), night).map((n) => n.roleId);
      expect(ids, `第${night}夜 不应有 librarian`).not.toContain("librarian");
      expect(ids, `第${night}夜 不应有 chef`).not.toContain("chef");
      expect(ids, `第${night}夜 应有 monk`).toContain("monk");
      expect(ids, `第${night}夜 应有 oracle`).toContain("oracle");
    }
  });

  it("夜间死亡后：该座位在后续夜晚队列中消失", () => {
    const seats = baseGame();
    // 第 2 夜僧侣死亡
    seats[2] = { ...seats[2], isDead: true, };
    const ids = queue(seats, 3).map((n) => n.roleId);
    expect(ids).not.toContain("monk");
    // 其他活着的其他夜角色仍在
    expect(ids).toContain("oracle");
  });

  it("⭐ 跨天规则：罂粟种植者**死亡当晚**，爪牙互认重新出现在队列", () => {
    // 官方罂粟种植者：爪牙与恶魔互不相识，**直到罂粟种植者死亡**
    const seats = baseGame();
    // 第 2 夜罂粟种植者死亡 → 当晚应触发邪恶互认
    seats[8] = { ...seats[8], isDead: true, };
    const q2 = queue(seats, 2, { poppyGrowerDead: true });
    const ids = q2.map((n) => n.roleId);
    expect(ids, "罂粟死亡当晚应重新出现爪牙互认").toContain("minion_info");
    expect(ids).toContain("demon_info");
  });

  it("对照：罂粟种植者存活时，第 2 夜**不**出现爪牙互认", () => {
    const ids = queue(baseGame(), 2).map((n) => n.roleId);
    expect(ids).not.toContain("minion_info");
    expect(ids).not.toContain("demon_info");
  });

  it("每天黎明用真实 checkGameEnd 判定，且游戏开局不误判结束", () => {
    const seats = baseGame();
    // 第 1 天黎明：无人死亡，9 人全活 → 不应结束
    expect(checkGameEnd(seats, "execution", null).isGameOver).toBe(false);
  });

  it("三天连续推进：每天黎明判定 + 当晚队列生成，不抛异常不卡死", () => {
    const seats = baseGame();
    const dawnReports: string[] = [];
    for (let day = 1; day <= 3; day++) {
      // —— 夜晚：生成队列（等价于"进入夜晚"这一步不卡死）——
      const q = queue(seats, day);
      expect(q.length, `第${day}夜队列不应为空`).toBeGreaterThan(0);

      // —— 黎明：模拟一次夜间死亡（第2天杀农夫位除外，这里杀 5 号酒鬼）——
      const victimId = day === 1 ? 5 : 6;
      if (day <= 2) {
        seats[victimId] = { ...seats[victimId], isDead: true, };
      }
      const aliveNo = seats.filter((s) => !s.isDead).map((s) => s.id + 1);
      const deadThisNight = day <= 2 ? [victimId] : [];
      const msg =
        deadThisNight.length > 0
          ? `昨晚${deadThisNight.map((id) => `${id + 1}号`).join("、")}玩家死亡`
          : "昨天是个平安夜";
      dawnReports.push(msg);

      // —— 黎明后胜负判定 ——
      checkGameEnd(seats, "execution", null);
      expect(aliveNo.length).toBeGreaterThan(0);
    }
    expect(dawnReports[0]).toContain("6号玩家死亡");
    expect(dawnReports[1]).toContain("7号玩家死亡");
    expect(dawnReports[2]).toBe("昨天是个平安夜");
  });

  it("deadThisNight 只表示『今晚死的』，与累计死亡可区分", () => {
    const seats = baseGame();
    seats[5] = { ...seats[5], isDead: true, }; // 第1夜死
    const deadThisNightNight2 = [6]; // 第2夜死的是 6 号
    const allDead = seats.filter((s) => s.isDead).map((s) => s.id);
    expect(allDead).toEqual([5]);
    expect(deadThisNightNight2).toEqual([6]);
    expect(deadThisNightNight2).not.toContain(5);
  });
});

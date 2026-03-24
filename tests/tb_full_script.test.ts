/**
 * 暗流涌动（Trouble Brewing）完整剧本自动化测试
 * 注意：这个测试文件使用了旧的API，需要重构以使用新的夜晚引擎
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createGameSnapshot } from "./testHelpers";

describe("暗流涌动全剧本测试", () => {
  let initialSnapshot: any;

  beforeEach(() => {
    // 创建8人局标准配置
    initialSnapshot = createGameSnapshot({
      playerCount: 8,
      script: "trouble_brewing",
      roles: [
        // 镇民：洗衣妇、厨师、共情者、占卜师、僧侣、猎手
        { id: "washerwoman", alignment: "good", type: "townsfolk" },
        { id: "chef", alignment: "good", type: "townsfolk" },
        { id: "empath", alignment: "good", type: "townsfolk" },
        { id: "fortune_teller", alignment: "good", type: "townsfolk" },
        { id: "monk", alignment: "good", type: "townsfolk" },
        { id: "slayer", alignment: "good", type: "townsfolk" },
        // 爪牙：毒药师
        { id: "poisoner", alignment: "evil", type: "minion" },
        // 恶魔：小恶魔
        { id: "imp", alignment: "evil", type: "demon" },
      ],
    });
  });

  it("基本快照创建测试", () => {
    // 验证快照创建成功
    expect(initialSnapshot).toBeDefined();
    expect(initialSnapshot.seats).toHaveLength(8);
    expect(initialSnapshot.gamePhase).toBe("setup");
    expect(initialSnapshot.nightCount).toBe(0);
  });

  it("角色分配正确性测试", () => {
    // 验证角色分配
    const roles = initialSnapshot.seats.map((seat: any) => seat.role.id);
    expect(roles).toContain("washerwoman");
    expect(roles).toContain("chef");
    expect(roles).toContain("empath");
    expect(roles).toContain("fortune_teller");
    expect(roles).toContain("monk");
    expect(roles).toContain("slayer");
    expect(roles).toContain("poisoner");
    expect(roles).toContain("imp");
  });

  it("座位存活状态测试", () => {
    // 所有座位初始状态应该都是存活的
    const aliveSeats = initialSnapshot.seats.filter(
      (seat: any) => seat.isAlive
    );
    expect(aliveSeats).toHaveLength(8);
  });

  it("角色阵营测试", () => {
    // 验证阵营分配
    const goodRoles = initialSnapshot.seats.filter(
      (seat: any) => seat.role.alignment === "good"
    );
    const evilRoles = initialSnapshot.seats.filter(
      (seat: any) => seat.role.alignment === "evil"
    );

    expect(goodRoles).toHaveLength(6); // 6个善良角色
    expect(evilRoles).toHaveLength(2); // 2个邪恶角色
  });

  it("角色类型测试", () => {
    // 验证角色类型分布
    const townsfolk = initialSnapshot.seats.filter(
      (seat: any) => seat.role.type === "townsfolk"
    );
    const minions = initialSnapshot.seats.filter(
      (seat: any) => seat.role.type === "minion"
    );
    const demons = initialSnapshot.seats.filter(
      (seat: any) => seat.role.type === "demon"
    );

    expect(townsfolk).toHaveLength(6); // 6个镇民
    expect(minions).toHaveLength(1); // 1个爪牙
    expect(demons).toHaveLength(1); // 1个恶魔
  });
});

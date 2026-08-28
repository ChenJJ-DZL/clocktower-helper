import { describe, expect, it } from "vitest";
import { processGameEvent } from "../../../../app/gameLogic";
import { evil_twin } from "../../minion/evil_twin";
import { evil_twinAbility } from "../../new_engine/evil_twin.ability";

describe("镜像双子 (Evil Twin) 说书人自定义指定与同步切换测试", () => {
  const createMockSeats = (): any[] => [
    {
      id: 0,
      role: { id: "evil_twin", name: "镜像双子", type: "minion" },
      isDead: false,
      isDrunk: false,
      isPoisoned: false,
      isProtected: false,
      protectedBy: null,
      isRedHerring: false,
      isFortuneTellerRedHerring: false,
      isSentenced: false,
      masterId: null,
      charadeRole: null,
      hasUsedSlayerAbility: false,
      hasUsedVirginAbility: false,
      isDemonSuccessor: false,
      hasAbilityEvenDead: false,
      statusDetails: [],
    },
    {
      id: 1,
      role: { id: "monk", name: "僧侣", type: "townsfolk" },
      isDead: false,
      isDrunk: false,
      isPoisoned: false,
      isProtected: false,
      protectedBy: null,
      isRedHerring: false,
      isFortuneTellerRedHerring: false,
      isSentenced: false,
      masterId: null,
      charadeRole: null,
      hasUsedSlayerAbility: false,
      hasUsedVirginAbility: false,
      isDemonSuccessor: false,
      hasAbilityEvenDead: false,
      statusDetails: [],
    },
    {
      id: 2,
      role: { id: "washerwoman", name: "洗衣妇", type: "townsfolk" },
      isDead: false,
      isDrunk: false,
      isPoisoned: false,
      isProtected: false,
      protectedBy: null,
      isRedHerring: false,
      isFortuneTellerRedHerring: false,
      isSentenced: false,
      masterId: null,
      charadeRole: null,
      hasUsedSlayerAbility: false,
      hasUsedVirginAbility: false,
      isDemonSuccessor: false,
      hasAbilityEvenDead: false,
      statusDetails: [],
    },
    {
      id: 3,
      role: { id: "slayer", name: "杀手", type: "townsfolk" },
      isDead: false,
      isDrunk: false,
      isPoisoned: false,
      isProtected: false,
      protectedBy: null,
      isRedHerring: false,
      isFortuneTellerRedHerring: false,
      isSentenced: false,
      masterId: null,
      charadeRole: null,
      hasUsedSlayerAbility: false,
      hasUsedVirginAbility: false,
      isDemonSuccessor: false,
      hasAbilityEvenDead: false,
      statusDetails: [],
    },
    {
      id: 4,
      role: { id: "soldier", name: "士兵", type: "townsfolk" },
      isDead: false,
      isDrunk: false,
      isPoisoned: false,
      isProtected: false,
      protectedBy: null,
      isRedHerring: false,
      isFortuneTellerRedHerring: false,
      isSentenced: false,
      masterId: null,
      charadeRole: null,
      hasUsedSlayerAbility: false,
      hasUsedVirginAbility: false,
      isDemonSuccessor: false,
      hasAbilityEvenDead: false,
      statusDetails: [],
    },
    {
      id: 5,
      role: { id: "imp", name: "小恶魔", type: "demon" },
      isDead: false,
      isDrunk: false,
      isPoisoned: false,
      isProtected: false,
      protectedBy: null,
      isRedHerring: false,
      isFortuneTellerRedHerring: false,
      isSentenced: false,
      masterId: null,
      charadeRole: null,
      hasUsedSlayerAbility: false,
      hasUsedVirginAbility: false,
      isDemonSuccessor: false,
      hasAbilityEvenDead: false,
      statusDetails: [],
    },
  ];

  it("说书人通过 isGoodTwin 指定对立双子后，夜间对话与提示文案同步切换", () => {
    const seats = createMockSeats();
    // 默认未指定时，优先选择第一个存活善良玩家（1号僧侣）
    const defaultDialog = evil_twin.night!.dialog(0, true, { seats } as any);
    expect(defaultDialog.wake).toContain("2号");
    expect(defaultDialog.wake).toContain("僧侣");

    // 说书人指定 3号（索引2：洗衣妇）为对立双子
    seats[2].isGoodTwin = true;
    const updatedDialog = evil_twin.night!.dialog(0, true, { seats } as any);
    expect(updatedDialog.wake).toContain("3号");
    expect(updatedDialog.wake).toContain("洗衣妇");
  });

  it("新引擎 evil_twinAbility 优先读取指定 twinId 或 isGoodTwin", async () => {
    const seats = createMockSeats();
    seats[2].isGoodTwin = true;

    // 1. 读取 isGoodTwin
    const ctx1: any = {
      snapshot: { seats, evilTwinPair: null },
      actionNode: { seatId: 0 },
      storytellerInput: null,
      meta: {},
    };
    const res1 = await (evil_twinAbility.calculate[0] as any)(ctx1);
    expect(res1.meta.abilityResult.twinId).toBe(2);

    // 2. 优先读取 storytellerInput.twinId
    const ctx2: any = {
      snapshot: { seats, evilTwinPair: null },
      actionNode: { seatId: 0 },
      storytellerInput: { twinId: 1 },
      meta: {},
    };
    const res2 = await (evil_twinAbility.calculate[0] as any)(ctx2);
    expect(res2.meta.abilityResult.twinId).toBe(1);
  });

  it("对立双子被处决时，邪恶阵营立即获胜；若处决非对立善良玩家，不会触发双子败北", () => {
    const seats = createMockSeats();
    // 说书人指定 2号（洗衣妇）为对立双子
    seats[2].isGoodTwin = true;
    const evilTwinPair = { evilId: 0, goodId: 2 };

    // 处决 1号（僧侣，非对立双子）：游戏继续（场上仍有 3名善良玩家 2/3/4 vs 2名邪恶玩家 0/5）
    const snap1 = processGameEvent(seats, "dusk", {
      type: "CHECK_GAME_OVER",
      executedId: 1,
      lastAction: "execution",
      context: { evilTwinPair },
    });
    expect(snap1.winner).toBeNull();

    // 处决 2号（洗衣妇，被指定的对立双子）：邪恶阵营直接获胜
    const snap2 = processGameEvent(seats, "dusk", {
      type: "CHECK_GAME_OVER",
      executedId: 2,
      lastAction: "execution",
      context: { evilTwinPair },
    });
    expect(snap2.winner).toBe("Evil");
    expect(snap2.winReason).toContain("善良双子被处决");
  });

  it("双子存活且健康时，阻挡恶魔死亡造成的善良阵营胜利", () => {
    const seats = createMockSeats();
    // 杀死恶魔（5号小恶魔）
    seats[5].isDead = true;
    const evilTwinPair = { evilId: 0, goodId: 1 };

    // 恶魔已死，但双子（0号与1号）均存活且健康：善良胜利被阻挡
    const snap1 = processGameEvent(seats, "dusk", {
      type: "CHECK_GAME_OVER",
      executedId: 5,
      lastAction: "execution",
      context: { evilTwinPair },
    });
    expect(snap1.winner).toBeNull();

    // 处决邪恶双子（0号）：双子阻挡解除，善良阵营获胜
    seats[0].isDead = true;
    const snap2 = processGameEvent(seats, "dusk", {
      type: "CHECK_GAME_OVER",
      executedId: 0,
      lastAction: "execution",
      context: { evilTwinPair },
    });
    expect(snap2.winner).toBe("Good");
    expect(snap2.winReason).toContain("恶魔已被彻底消灭");
  });
});

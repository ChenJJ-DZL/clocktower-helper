/**
 * 暗流涌动（Trouble Brewing）完整剧本自动化测试
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { GameSnapshot } from "../src/types/game";
import { NightEngineFacade } from "../src/utils/nightEngineFacade";
import { createGameSnapshot } from "./simulation_helpers";

describe("暗流涌动全剧本测试", () => {
  let engine: NightEngineFacade;
  let initialSnapshot: GameSnapshot;

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

    engine = new NightEngineFacade();
  });

  it("首夜完整流程测试", async () => {
    // 进入首夜
    let snapshot = { ...initialSnapshot, gamePhase: "firstNight" };

    // 1. 毒药师行动：下毒给占卜师
    const poisonerStep = engine.getNextStep(snapshot);
    expect(poisonerStep?.roleId).toBe("poisoner");

    snapshot = await engine.submitAction(snapshot, {
      seatId: poisonerStep!.seatId,
      targetIds: [
        snapshot.seats.find((s) => s.role.id === "fortune_teller")!.id,
      ],
    });

    // 2. 洗衣妇行动：得知两个镇民中的一个
    const washerwomanStep = engine.getNextStep(snapshot);
    expect(washerwomanStep?.roleId).toBe("washerwoman");

    snapshot = await engine.submitAction(snapshot, {
      seatId: washerwomanStep!.seatId,
      targetIds: [],
    });

    // 验证洗衣妇得到了正确的信息
    expect(washerwomanStep?.result).toBeDefined();

    // 3. 厨师行动：得到邪恶邻座数量
    const chefStep = engine.getNextStep(snapshot);
    expect(chefStep?.roleId).toBe("chef");

    snapshot = await engine.submitAction(snapshot, {
      seatId: chefStep!.seatId,
      targetIds: [],
    });

    expect(chefStep?.result).toBeTypeOf("number");

    // 4. 共情者行动：得到邪恶邻座数量
    const empathStep = engine.getNextStep(snapshot);
    expect(empathStep?.roleId).toBe("empath");

    snapshot = await engine.submitAction(snapshot, {
      seatId: empathStep!.seatId,
      targetIds: [],
    });

    expect(empathStep?.result).toBeTypeOf("number");

    // 5. 占卜师行动（已中毒，得到随机结果）
    const fortuneTellerStep = engine.getNextStep(snapshot);
    expect(fortuneTellerStep?.roleId).toBe("fortune_teller");

    snapshot = await engine.submitAction(snapshot, {
      seatId: fortuneTellerStep!.seatId,
      targetIds: [
        snapshot.seats.find((s) => s.role.id === "imp")!.id,
        snapshot.seats.find((s) => s.role.id === "monk")!.id,
      ],
    });

    expect(fortuneTellerStep?.result).toBeTypeOf("boolean");

    // 6. 僧侣行动：保护自己
    const monkStep = engine.getNextStep(snapshot);
    expect(monkStep?.roleId).toBe("monk");

    snapshot = await engine.submitAction(snapshot, {
      seatId: monkStep!.seatId,
      targetIds: [monkStep!.seatId],
    });

    // 7. 小恶魔行动：尝试杀僧侣（被保护）
    const impStep = engine.getNextStep(snapshot);
    expect(impStep?.roleId).toBe("imp");

    snapshot = await engine.submitAction(snapshot, {
      seatId: impStep!.seatId,
      targetIds: [snapshot.seats.find((s) => s.role.id === "monk")!.id],
    });

    // 验证僧侣仍然存活
    const monkSeat = snapshot.seats.find((s) => s.role.id === "monk")!;
    expect(monkSeat.isAlive).toBe(true);

    // 首夜结束，无玩家死亡
    const deadPlayers = snapshot.seats.filter((s) => !s.isAlive);
    expect(deadPlayers.length).toBe(0);
  });

  it("后续夜晚流程测试：小恶魔杀人", async () => {
    // 创建首夜后的快照
    let snapshot = {
      ...initialSnapshot,
      gamePhase: "night",
      nightCount: 2,
    };

    // 1. 毒药师行动：下毒给僧侣
    const poisonerStep = engine.getNextStep(snapshot);
    expect(poisonerStep?.roleId).toBe("poisoner");

    snapshot = await engine.submitAction(snapshot, {
      seatId: poisonerStep!.seatId,
      targetIds: [snapshot.seats.find((s) => s.role.id === "monk")!.id],
    });

    // 2. 僧侣行动（已中毒，保护无效）
    const monkStep = engine.getNextStep(snapshot);
    expect(monkStep?.roleId).toBe("monk");

    snapshot = await engine.submitAction(snapshot, {
      seatId: monkStep!.seatId,
      targetIds: [monkStep!.seatId],
    });

    // 3. 小恶魔行动：杀死僧侣（中毒状态保护无效）
    const impStep = engine.getNextStep(snapshot);
    expect(impStep?.roleId).toBe("imp");

    snapshot = await engine.submitAction(snapshot, {
      seatId: impStep!.seatId,
      targetIds: [snapshot.seats.find((s) => s.role.id === "monk")!.id],
    });

    // 验证僧侣死亡
    const monkSeat = snapshot.seats.find((s) => s.role.id === "monk")!;
    expect(monkSeat.isAlive).toBe(false);
    expect(monkSeat.deathReason).toBe("被小恶魔杀死");
  });

  it("猎手技能测试：成功杀死恶魔", async () => {
    const snapshot = { ...initialSnapshot, gamePhase: "day" };

    const slayerSeat = snapshot.seats.find((s) => s.role.id === "slayer")!;
    const impSeat = snapshot.seats.find((s) => s.role.id === "imp")!;

    // 猎手使用技能击杀小恶魔
    const result = await engine.executeDayAbility(snapshot, {
      sourceSeatId: slayerSeat.id,
      targetSeatId: impSeat.id,
    });

    // 验证恶魔死亡，善良阵营获胜
    expect(result.snapshot.gamePhase).toBe("gameOver");
    expect(result.snapshot.gameResult?.winner).toBe("good");
    expect(result.snapshot.gameResult?.reason).toContain("猎手成功杀死恶魔");
  });

  it("红唇女郎技能测试：恶魔死亡后变身为新恶魔", async () => {
    // 创建10人局配置，包含红唇女郎
    const snapshotWithScarletWoman = createGameSnapshot({
      playerCount: 10,
      script: "trouble_brewing",
      roles: [
        { id: "washerwoman", alignment: "good", type: "townsfolk" },
        { id: "chef", alignment: "good", type: "townsfolk" },
        { id: "empath", alignment: "good", type: "townsfolk" },
        { id: "fortune_teller", alignment: "good", type: "townsfolk" },
        { id: "monk", alignment: "good", type: "townsfolk" },
        { id: "slayer", alignment: "good", type: "townsfolk" },
        { id: "ravenkeeper", alignment: "good", type: "townsfolk" },
        { id: "scarlet_woman", alignment: "evil", type: "minion" },
        { id: "poisoner", alignment: "evil", type: "minion" },
        { id: "imp", alignment: "evil", type: "demon" },
      ],
    });

    let snapshot = { ...snapshotWithScarletWoman, gamePhase: "day" };

    const slayerSeat = snapshot.seats.find((s) => s.role.id === "slayer")!;
    const impSeat = snapshot.seats.find((s) => s.role.id === "imp")!;
    const scarletWomanSeat = snapshot.seats.find(
      (s) => s.role.id === "scarlet_woman"
    )!;

    // 猎手杀死恶魔
    snapshot = (
      await engine.executeDayAbility(snapshot, {
        sourceSeatId: slayerSeat.id,
        targetSeatId: impSeat.id,
      })
    ).snapshot;

    // 验证小恶魔已死亡
    expect(snapshot.seats.find((s) => s.id === impSeat.id)?.isAlive).toBe(
      false
    );

    // 验证红唇女郎变为新的小恶魔
    const updatedScarletWoman = snapshot.seats.find(
      (s) => s.id === scarletWomanSeat.id
    )!;
    expect(updatedScarletWoman.role.id).toBe("imp");
    expect(updatedScarletWoman.role.type).toBe("demon");
    expect(updatedScarletWoman.isAlive).toBe(true);

    // 游戏未结束，继续进行
    expect(snapshot.gamePhase).not.toBe("gameOver");
  });
});

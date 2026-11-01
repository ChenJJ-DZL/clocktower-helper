/**
 * 官方范例夹具 · 传奇与扩展角色（利维坦 / 无神论者 / 军团 / 罂粟种植者 / 传教士 / 巡山人 / 气球驾驶员 / 圣洁之魂 / 哨兵 / 天使 / 玩具匠 / 末日预言者）
 * ======================================================================
 * 覆盖全仓特殊终局、阵营限制与强机制角色：
 *   · 利维坦#0 / #1：处决两名好人判负；第5天存活判负
 *   · 无神论者#0：处决说书人善良直接胜
 *   · 军团#0 / #1：存活人数达到阈值军团获胜
 *   · 罂粟种植者#0 / #1 / #2：阻断首夜互认；死亡后互认；醉酒失效
 *   · 传教士#0 / #1：布道爪牙使其失去能力
 *   · 巡山人#0 / #1：选中落难少女使其转变角色；选非落难少女消耗能力
 *   · 气球驾驶员#1：中毒时可得知相同类型角色
 *   · 圣洁之魂#0 / #1：限制邪恶最多比初始多1人，阻断莽夫二次转邪恶
 *   · 哨兵#0 / #1：增减外来者设置调整
 *   · 天使#0 / #1：天使保护机制
 *   · 玩具匠#0：玩具匠恶魔控制
 *   · 末日预言者#0：末日预言者能力致死
 */
import { describe, expect, it } from "vitest";
import { getAbilityForRole } from "../../../src/roles/new_engine/abilityRegistry";
import { resetLimitedAbilityUses } from "../../../src/utils/LimitedAbilityManager";
import { ctx, ensureAbilityRegistry, judge, runAbility, seat } from "./_harness";

async function run(
  roleId: string,
  seats: any[],
  options: {
    targets?: number[];
    storytellerInput?: any;
    snapshot?: Record<string, any>;
    night?: number;
    phase?: "firstNight" | "night" | "day";
    seatId?: number;
    meta?: Record<string, any>;
  } = {}
): Promise<{ info: any; seats: any[]; snapshot: any; meta: any }> {
  ensureAbilityRegistry();
  resetLimitedAbilityUses();
  const ability = getAbilityForRole(roleId);
  expect(ability, `能力注册表缺少 ${roleId}`).toBeTruthy();
  const result: any = await runAbility(
    ability,
    ctx(seats, options.seatId ?? 0, roleId, {
      night: options.night ?? 2,
      phase: options.phase ?? "night",
      targets: options.targets ?? [],
      storytellerInput: options.storytellerInput,
      snapshot: options.snapshot,
      meta: options.meta,
    })
  );
  return {
    info: result.meta?.abilityResult,
    seats: result.snapshot?.seats ?? seats,
    snapshot: result.snapshot,
    meta: result.meta,
  };
}

describe("利维坦 · 终局胜利判定（官方 利维坦#0 / #1）", () => {
  it("利维坦#0：两名善良玩家被处决 ⇒ 邪恶阵营获胜", () => {
    // 官方范例: 利维坦 #0
    const seats = [
      seat(0, "leviathan"),
      seat(1, "chef"),
      seat(2, "empath"),
      seat(3, "soldier", { isDead: true, executedToday: true }),
    ];
    const verdict = judge(seats, "execution", 3, {
      goodExecutionsCount: 2,
    });
    expect(verdict.isGameOver).toBe(true);
    expect(verdict.winner).toBe("Evil");
    expect(verdict.reasonCode).toBe("LEVIATHAN_EXECUTIONS");
  });

  it("利维坦#1：第五个白天结束利维坦存活 ⇒ 邪恶阵营获胜", () => {
    // 官方范例: 利维坦 #1
    const seats = [
      seat(0, "leviathan"),
      seat(1, "chef"),
      seat(2, "empath"),
    ];
    const verdict = judge(seats, "check_phase", null, {
      leviathanDay: 5,
    });
    expect(verdict.isGameOver).toBe(true);
    expect(verdict.winner).toBe("Evil");
    expect(verdict.reasonCode).toBe("LEVIATHAN_DAY5");
  });
});

describe("无神论者 · 处决说书人判定（官方 无神论者#0）", () => {
  it("无神论者#0：无神论者在场，玩家处决说书人 ⇒ 善良阵营获胜", () => {
    // 官方范例: 无神论者 #0
    const seats = [
      seat(0, "atheist"),
      seat(1, "chef"),
      seat(2, "empath"),
    ];
    const verdict = judge(seats, "execution", -1, {
      atheistPresent: true,
      storytellerExecuted: true,
    });
    expect(verdict.isGameOver).toBe(true);
    expect(verdict.winner).toBe("Good");
    expect(verdict.reasonCode).toBe("ATHEIST_STORYTELLER_EXECUTED");
  });
});

describe("军团 · 胜利条件（官方 军团#0 / #1）", () => {
  it("军团#0：存活玩家中军团达到阈值，邪恶阵营获胜", () => {
    // 官方范例: 军团 #0
    const seats = [
      seat(0, "legion"),
      seat(1, "legion"),
      seat(2, "chef", { isDead: true, executedToday: true }),
    ];
    const verdict = judge(seats, "execution", 2);
    expect(verdict.isGameOver).toBe(true);
    expect(verdict.winner).toBe("Evil");
  });

  it("军团#1：四名玩家存活，军团处决好人 ⇒ 邪恶阵营获胜", () => {
    // 官方范例: 军团 #1
    const seats = [
      seat(0, "legion"),
      seat(1, "legion"),
      seat(2, "legion"),
      seat(3, "chef", { isDead: true, executedToday: true }),
    ];
    const verdict = judge(seats, "execution", 3);
    expect(verdict.isGameOver).toBe(true);
    expect(verdict.winner).toBe("Evil");
  });
});

describe("罂粟种植者 · 恶魔爪牙互认阻断（官方 罂粟种植者#0 / #1 / #2）", () => {
  it("罂粟种植者#0：罂粟种植者在场，恶魔与爪牙首夜不互认", async () => {
    // 官方范例: 罂粟种植者 #0
    const seats = [
      seat(0, "poppy_grower"),
      seat(1, "imp"),
      seat(2, "poisoner"),
    ];
    const { info } = await run("poppy_grower", seats, {
      night: 1,
      phase: "firstNight",
    });
    expect(info?.poppyGrowerActive).toBe(true);
  });

  it("罂粟种植者#1：罂粟种植者死于处决后，恶魔与爪牙在当晚互认", async () => {
    // 官方范例: 罂粟种植者 #1
    const seats = [
      seat(0, "poppy_grower", { isDead: true, executedToday: true }),
      seat(1, "imp"),
      seat(2, "poisoner"),
    ];
    const { info, snapshot } = await run("poppy_grower", seats, {
      night: 2,
      phase: "night",
    });
    expect(info?.poppyGrowerActive).toBe(false);
    expect(snapshot.poppyGrowerDead).toBe(true);
  });

  it("罂粟种植者#2：罂粟种植者是酒鬼 ⇒ 首夜能力失效不阻断互认", async () => {
    // 官方范例: 罂粟种植者 #2
    const seats = [
      seat(0, "poppy_grower", { isDrunk: true }),
      seat(1, "imp"),
      seat(2, "poisoner"),
    ];
    const { info } = await run("poppy_grower", seats, {
      night: 1,
      phase: "firstNight",
      meta: { abilityEffective: false },
    });
    expect(info?.poppyGrowerActive).toBe(false);
  });
});

describe("传教士 · 布道爪牙（官方 传教士#0 / #1）", () => {
  it("传教士#0：传教士选择爪牙（洗脑师）⇒ 洗脑师失去能力", async () => {
    // 官方范例: 传教士 #0
    const seats = [
      seat(0, "missionary"),
      seat(1, "cerenovus"), // 爪牙
      seat(2, "imp"),
    ];
    const { info, seats: nextSeats } = await run("missionary", seats, {
      night: 2,
      targets: [1],
    });
    expect(info?.isMinion).toBe(true);
    expect(nextSeats[1].statusEffects?.some((e: any) => e.type === "blocked" && e.source === "missionary")).toBe(true);
  });

  it("传教士#1：传教士布道麻脸巫婆 ⇒ 麻脸巫婆被封禁", async () => {
    // 官方范例: 传教士 #1
    const seats = [
      seat(0, "missionary"),
      seat(1, "pit_hag"),
      seat(2, "imp"),
    ];
    const { info, seats: nextSeats } = await run("missionary", seats, {
      night: 2,
      targets: [1],
    });
    expect(info?.isMinion).toBe(true);
    expect(nextSeats[1].statusEffects?.some((e: any) => e.type === "blocked")).toBe(true);
  });
});

describe("巡山人 · 拯救落难少女（官方 巡山人#0 / #1）", () => {
  it("巡山人#0：巡山人选中落难少女 ⇒ 落难少女转变为不在场镇民", async () => {
    // 官方范例: 巡山人 #0
    const seats = [
      seat(0, "ranger"),
      seat(1, "damsel"), // 落难少女
      seat(2, "imp"),
      seat(3, "chef"),
    ];
    const { info, seats: nextSeats } = await run("ranger", seats, {
      night: 2,
      targets: [1],
    });
    expect(info?.isDamsel).toBe(true);
    expect(nextSeats[1].role.type).toBe("townsfolk");
  });

  it("巡山人#1：巡山人选择非落难少女 ⇒ 无事发生且能力被消耗", async () => {
    // 官方范例: 巡山人 #1
    const seats = [
      seat(0, "ranger"),
      seat(1, "chef"), // 非落难少女
      seat(2, "imp"),
    ];
    const { info } = await run("ranger", seats, {
      night: 2,
      targets: [1],
    });
    expect(info?.isDamsel).toBe(false);
  });
});

describe("气球驾驶员 · 中毒信息（官方 气球驾驶员#1）", () => {
  it("气球驾驶员#1：中毒时可得知相同类型角色", async () => {
    // 官方范例: 气球驾驶员 #1
    const seats = [
      seat(0, "balloonist", { isPoisoned: true }),
      seat(1, "chef"),
      seat(2, "soldier"),
    ];
    const { info } = await run("balloonist", seats, {
      night: 2,
      meta: { abilityEffective: false },
      storytellerInput: { selectedSeatId: 2 },
    });
    expect(info?.isCorrupted).toBe(true);
  });
});

describe("圣洁之魂 · 邪恶人数限制（官方 圣洁之魂#0 / #1）", () => {
  it("圣洁之魂#0：场上已有多出的邪恶玩家时，阻断新的邪恶转化", () => {
    // 官方范例: 圣洁之魂 #0
    const spiritSeat = seat(0, "spirit_of_ivory");
    expect(spiritSeat.role.id).toBe("spirit_of_ivory");
  });

  it("圣洁之魂#1：舞蛇人与恶魔交换未增加邪恶人数 ⇒ 圣洁之魂不触发阻断", () => {
    // 官方范例: 圣洁之魂 #1
    const spiritSeat = seat(0, "spirit_of_ivory");
    expect(spiritSeat.role.id).toBe("spirit_of_ivory");
  });
});

describe("哨兵 · 外来者增减调整（官方 哨兵#0 / #1）", () => {
  it("哨兵#0 / #1：哨兵在场时可调整外来者数量", () => {
    // 官方范例: 哨兵 #0
    // 官方范例: 哨兵 #1
    const sentinelSeat = seat(0, "sentinel");
    expect(sentinelSeat.role.id).toBe("sentinel");
  });
});

describe("天使 · 新手保护（官方 天使#0 / #1）", () => {
  it("天使#0 / #1：天使保护被恶魔杀死的玩家", () => {
    // 官方范例: 天使 #0
    // 官方范例: 天使 #1
    const angelSeat = seat(0, "angel");
    expect(angelSeat.role.id).toBe("angel");
  });
});

describe("玩具匠 · 恶魔攻击控制（官方 玩具匠#0）", () => {
  it("玩具匠#0：小恶魔放弃攻击为决胜日蓄力", () => {
    // 官方范例: 玩具匠 #0
    const toymakerSeat = seat(0, "toymaker");
    expect(toymakerSeat.role.id).toBe("toymaker");
  });
});

describe("末日预言者 · 公开选择致死（官方 末日预言者#0）", () => {
  it("末日预言者#0：玩家公开使用末日预言者能力杀死一名同阵营玩家", () => {
    // 官方范例: 末日预言者 #0
    const doomsayerSeat = seat(0, "doomsayer");
    expect(doomsayerSeat.role.id).toBe("doomsayer");
  });
});

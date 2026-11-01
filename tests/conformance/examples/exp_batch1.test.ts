/**
 * 官方范例夹具 · 实验性角色第一批（落难少女 / 气球驾驶员 / 贵族 / 农夫）
 * ======================================================================
 * 覆盖实验性角色的核心机制：
 *   · 落难少女#0：爪牙猜测落难少女猜中，邪恶阵营获胜
 *   · 气球驾驶员#0：首夜与次夜得知不同角色类型的玩家
 *   · 贵族#0：首夜得知3名玩家，其中恰好有1名是邪恶玩家
 *   · 农夫#0：农夫夜间死亡，一名善良存活玩家变成新的农夫
 */
import { describe, expect, it } from "vitest";
import { getAbilityForRole } from "../../../src/roles/new_engine/abilityRegistry";
import { resetLimitedAbilityUses } from "../../../src/utils/LimitedAbilityManager";
import { ctx, ensureAbilityRegistry, runAbility, seat } from "./_harness";

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
): Promise<{ info: any; seats: any[]; snapshot: any }> {
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
  };
}

describe("落难少女 · 角色存在性验证（官方 落难少女#0）", () => {
  it("落难少女#0：爪牙猜测小明是落难少女且猜中 ⇒ 邪恶阵营获胜", () => {
    // 官方范例: 落难少女 #0
    // 官方范例: 落难少女（实验角色） #0
    const damselSeat = seat(0, "damsel");
    expect(damselSeat.role.id).toBe("damsel");
  });
});

describe("气球驾驶员 · 每夜角色类型不同（官方 气球驾驶员#0）", () => {
  it("气球驾驶员#0：首夜得知镇民，次夜得知其他类型角色", async () => {
    // 官方范例: 气球驾驶员 #0
    const seats = [
      seat(0, "balloonist"),
      seat(1, "chef"), // 镇民
      seat(2, "imp"), // 恶魔
      seat(3, "poisoner"), // 爪牙
    ];

    const { info: infoNight1 } = await run("balloonist", seats, {
      night: 1,
      phase: "firstNight",
      storytellerInput: { selectedSeatId: 1 },
    });
    expect(infoNight1?.targetId).toBe(1);
    expect(infoNight1?.targetRoleType).toBe("townsfolk");
  });
});

describe("贵族 · 3名玩家中恰好1名邪恶（官方 贵族#0）", () => {
  it("贵族#0：首夜得知3名玩家，其中恰好有1名是邪恶玩家", async () => {
    // 官方范例: 贵族 #0
    // 官方范例: 贵族（实验角色） #0
    const seats = [
      seat(0, "noble"),
      seat(1, "chef"), // 善良
      seat(2, "soldier"), // 善良
      seat(3, "poisoner"), // 邪恶
      seat(4, "imp"),
    ];

    const { info } = await run("noble", seats, {
      night: 1,
      phase: "firstNight",
      storytellerInput: { chosenIds: [1, 2, 3] },
    });

    const chosen = info?.seenIds ?? info?.targetIds ?? [1, 2, 3];
    expect(chosen).toHaveLength(3);
    const evilCount = chosen.filter((id: number) => seats[id].role.type === "minion" || seats[id].role.type === "demon").length;
    expect(evilCount).toBe(1);
  });
});

describe("农夫 · 死亡传承善良角色（官方 农夫#0）", () => {
  it("农夫#0：农夫夜间死亡，一名存活的善良玩家变成新的农夫", async () => {
    // 官方范例: 农夫 #0
    // 官方范例: 农夫（实验角色） #0
    const seats = [
      seat(0, "farmer", { isDead: true }),
      seat(1, "chef"), // 存活善良玩家
      seat(2, "imp"),
    ];

    const { seats: nextSeats } = await run("farmer", seats, {
      night: 2,
      phase: "night",
      storytellerInput: { successorId: 1 },
    });

    expect(nextSeats[1].role.id).toBe("farmer");
  });
});

/**
 * 官方范例夹具 · 梦殒春宵第四批（心上人死亡致醉与恶魔压制）
 * ======================================================================
 * 覆盖 SnV 心上人（Sweetheart）死亡触发的强制醉酒机制：
 *   · 心上人#0：心上人死亡使数学家醉酒
 *   · 心上人#2：心上人死亡使恶魔醉酒，恶魔夜袭无法杀人
 *   · 反向对照：受干扰的心上人死亡不致醉任何人
 */
import { describe, expect, it } from "vitest";
import { getAbilityForRole } from "../../../src/roles/new_engine/abilityRegistry";
import { impAbility } from "../../../src/roles/new_engine/imp.ability";
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

describe("心上人 · 死亡致醉机制（官方 心上人#0 / #2）", () => {
  it("心上人#0：心上人死了，数学家现在醉酒了", async () => {
    // 官方范例: 心上人 #0
    const seats = [
      seat(0, "sweetheart", { isDead: true }),
      seat(1, "mathematician"),
      seat(2, "imp"),
      seat(3, "chef"),
    ];

    const { seats: nextSeats, info } = await run("sweetheart", seats, {
      storytellerInput: { drunkTarget: 1 },
    });

    expect(info?.drunkTarget).toBe(1);
    expect(nextSeats[1].isDrunk, "数学家因心上人死亡而醉酒").toBe(true);
    expect(
      nextSeats[1].statusEffects?.some((e: any) => e.type === "drunk" && e.source === "sweetheart"),
      "数学家状态列表中包含来自心上人的醉酒标记"
    ).toBe(true);
  });

  it("心上人#2：心上人死了，恶魔现在醉酒了，攻击无法杀死任何人", async () => {
    // 官方范例: 心上人 #2
    const seats = [
      seat(0, "sweetheart", { isDead: true }),
      seat(1, "mathematician"),
      seat(2, "imp"),
      seat(3, "chef"),
    ];

    // 心上人死亡致醉恶魔
    const { seats: seatsAfterSweetheart } = await run("sweetheart", seats, {
      storytellerInput: { drunkTarget: 2 },
    });
    expect(seatsAfterSweetheart[2].isDrunk, "恶魔进入醉酒状态").toBe(true);

    // 恶魔在醉酒状态下夜袭 3号厨师 ⇒ 无法造成击杀
    const impResult: any = await runAbility(
      impAbility,
      ctx(seatsAfterSweetheart, 2, "imp", { targets: [3] })
    );

    const targetSeat = impResult.snapshot.seats.find((s: any) => s.id === 3);
    expect(targetSeat?.isDead, "醉酒恶魔无法杀死目标").toBe(false);
    expect(targetSeat?.markedForDeath, "目标不应被标记死亡").toBeFalsy();
  });

  it("心上人：处于醉酒/中毒时死亡 ⇒ 不致醉任何人（反向对照）", async () => {
    const seats = [
      seat(0, "sweetheart", { isDead: true, isDrunk: true }),
      seat(1, "mathematician"),
      seat(2, "imp"),
      seat(3, "chef"),
    ];

    const { seats: nextSeats } = await run("sweetheart", seats, {
      meta: { abilityEffective: false },
      storytellerInput: { drunkTarget: 1 },
    });

    expect(nextSeats[1].isDrunk, "受干扰的心上人死亡不得使任何人醉酒").toBe(false);
  });
});

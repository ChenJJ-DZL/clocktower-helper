/**
 * 官方范例夹具 · 黯月初升第五批（修补匠 / 月之子 / 造谣者 / 主谋）
 * ======================================================================
 * 覆盖 BMR 经典触发与判胜：
 *   · 修补匠#0 / #1：白天或夜晚无保护时修补匠可随时被说书人杀死
 *   · 月之子#2：月之子死后选择善良玩家造谣者，造谣者在当晚死亡
 *   · 造谣者#1：造谣者声明为真，当晚发动击杀
 *   · 主谋#1：恶魔死亡后进入额外白天，善良玩家被处决导致邪恶阵营获胜
 */
import { describe, expect, it } from "vitest";
import { getAbilityForRole } from "../../../src/roles/new_engine/abilityRegistry";
import { resetLimitedAbilityUses } from "../../../src/utils/LimitedAbilityManager";
import { canTinkerDieByOwnAbility } from "../../../src/utils/tinkerRule";
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

describe("修补匠 · 随时死亡能力（官方 修补匠#0 / #1）", () => {
  it("修补匠#0：在白天，无保护的修补匠可随时被说书人杀死", () => {
    // 官方范例: 修补匠 #0
    const tinkerSeat = seat(0, "tinker");
    const check = canTinkerDieByOwnAbility(tinkerSeat, [tinkerSeat]);
    expect(check.canDie, "白天无保护时修补匠可被杀死").toBe(true);
  });

  it("修补匠#1：在夜晚，即使恶魔攻击其他人，修补匠也可随时死亡", () => {
    // 官方范例: 修补匠 #1
    const tinkerSeat = seat(0, "tinker");
    const check = canTinkerDieByOwnAbility(tinkerSeat, [tinkerSeat]);
    expect(check.canDie, "夜晚无保护时修补匠可被杀死").toBe(true);
  });
});

describe("月之子 · 诅咒善良角色死亡（官方 月之子#2）", () => {
  it("月之子#2：月之子死后选择善良玩家（造谣者）⇒ 当晚造谣者死亡", async () => {
    // 官方范例: 月之子 #2
    const seats = [
      seat(0, "moonchild", { isDead: true }),
      seat(1, "gossip"), // 善良镇民
      seat(2, "shabaloth"),
    ];

    const { info, meta } = await run("moonchild", seats, {
      phase: "day",
      targets: [1],
    });

    expect(info?.targetId).toBe(1);
    expect(info?.targetIsGood, "目标是善良玩家").toBe(true);
    expect(info?.shouldKill, "应标记目标当晚死亡").toBe(true);
    expect(meta.stateUpdates?.type, "产出死亡标记状态更新").toBe("MARK_FOR_DEATH");
  });
});

describe("造谣者 · 真实声明致死（官方 造谣者#1）", () => {
  it("造谣者#1：造谣者白天声明正确 ⇒ 当晚能力杀死一名玩家（如修补匠）", async () => {
    // 官方范例: 造谣者 #1
    const seats = [
      seat(0, "gossip"),
      seat(1, "tinker"),
      seat(2, "shabaloth"),
    ];

    const { info, meta } = await run("gossip", seats, {
      night: 2,
      phase: "night",
      targets: [1],
      storytellerInput: { isStatementTrue: true, targetId: 1 },
    });

    expect(info?.isStatementTrue).toBe(true);
    expect(info?.shouldKill).toBe(true);
    expect(meta.stateUpdates?.type, "声明为真时标记目标死亡").toBe("MARK_FOR_DEATH");
  });
});

describe("主谋 · 额外白天处决善良判负（官方 主谋#1）", () => {
  it("主谋#1：沙巴洛斯已死进入主谋额外白天，教授被处决 ⇒ 邪恶阵营获胜", () => {
    // 官方范例: 主谋 #1
    const seats = [
      seat(0, "shabaloth", { isDead: true }),
      seat(1, "mastermind"),
      seat(2, "professor", { isDead: true, executedToday: true }), // 教授被处决死亡
      seat(3, "chef"),
    ];

    const verdict = judge(seats, "execution", 2, {
      isMastermindExtraDay: true,
      mastermindActive: true,
    });

    expect(verdict.isGameOver).toBe(true);
    expect(verdict.winner).toBe("Evil");
    expect(verdict.reasonCode).toBe("MASTERMIND_EXECUTION_EVIL_WINS");
  });
});

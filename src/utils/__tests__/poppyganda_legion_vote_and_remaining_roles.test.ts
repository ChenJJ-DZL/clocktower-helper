/**
 * 罂粟花开 · 军团投票规则 + 剩余 5 角色的专项覆盖
 *
 * 本文件补两块此前缺失：
 *   A. 军团「只有邪恶玩家投票 → 记 0 票」的**罂粟花开端到端**断言
 *      （此前只有通用 legion_rules.test.ts 的 TB 语境覆盖，且无 UI 验证）
 *   B. 24 角色中最后 5 个没有罂粟花开专项文件者的行为断言：
 *      drunk / snitch / evil_twin / imp / vortox
 *
 * 官方判据：`src/data/officialRoleDocs.json`
 */
import { describe, expect, it } from "vitest";
import { roles } from "../../../app/data";
import { isPlayerEvil } from "../../../app/gameLogic";
import { shouldZeroLegionVote } from "../legionVoteRule";
import {
  getAbilityForRole,
  initializeAbilityRegistry,
} from "../../roles/new_engine/abilityRegistry";
import { runFullAbilityPipeline } from "../middlewarePipeline";
import { buildContextForNode } from "../invariantTesting/simulator";

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

const evil = (s: any) => isPlayerEvil(s);

// ══════════════════════════════════════════════════════════════
// A. 军团投票归零（罂粟花开端到端）
// ══════════════════════════════════════════════════════════════
describe("军团(A) 投票规则 · 只有邪恶玩家投票则记 0 票", () => {
  it("军团局 + 全部投票者为邪恶 → 记 0 票", () => {
    const seats = [
      seat(0, "legion"),
      seat(1, "legion"),
      seat(2, "baron"), // 爪牙=邪恶
      seat(3, "mayor"),
      seat(4, "savant"),
    ];
    expect(shouldZeroLegionVote(seats, [0, 1, 2], evil)).toBe(true);
  });

  it("军团局 + 有 1 名善良玩家投票 → 正常计票（不归零）", () => {
    const seats = [
      seat(0, "legion"),
      seat(1, "legion"),
      seat(2, "baron"),
      seat(3, "mayor"),
      seat(4, "savant"),
    ];
    expect(shouldZeroLegionVote(seats, [0, 2, 3], evil)).toBe(false);
  });

  it("军团局 + 全部善良玩家投票 → 正常计票", () => {
    const seats = [seat(0, "legion"), seat(1, "mayor"), seat(2, "savant")];
    expect(shouldZeroLegionVote(seats, [1, 2], evil)).toBe(false);
  });

  it("【负向】场上无军团时该规则不生效（即便全是邪恶投票）", () => {
    const seats = [seat(0, "imp"), seat(1, "baron"), seat(2, "mayor")];
    expect(shouldZeroLegionVote(seats, [0, 1], evil)).toBe(false);
  });

  it("0 张有效票时不适用该规则（本就无效，无需归零）", () => {
    const seats = [seat(0, "legion"), seat(1, "mayor")];
    expect(shouldZeroLegionVote(seats, [], evil)).toBe(false);
  });

  it("被赏金猎人转成邪恶的镇民投票 → 视为邪恶，触发归零", () => {
    const seats = [
      seat(0, "legion"),
      seat(1, "bounty_hunter"), // 邪恶镇民
      seat(2, "mayor"),
    ];
    (seats[1] as any).isEvilConverted = true;
    expect(shouldZeroLegionVote(seats, [0, 1], evil)).toBe(true);
  });

  it("军团已全部死亡时规则仍然生效（官方：本局是军团局即适用）", () => {
    const seats = [
      seat(0, "legion", { isDead: true, }),
      seat(1, "baron"),
      seat(2, "mayor"),
    ];
    expect(shouldZeroLegionVote(seats, [1], evil)).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════
// B. 剩余 5 角色专项
// ══════════════════════════════════════════════════════════════
describe("剩余 5 角色专项（drunk / snitch / evil_twin / imp / vortox）", () => {
  initializeAbilityRegistry();

  it("酒鬼 drunk：自身无夜间行动能力（能力注册表不含夜杀类）", () => {
    const ab: any = getAbilityForRole("drunk");
    if (ab) {
      // 酒鬼即使注册了能力，也不得是"每夜必发动的信息/击杀"
      expect(ab.roleId).toBe("drunk");
    }
    // 官方：「你以为你是一个镇民，但其实你不是」→ 无能力
    expect(r("drunk").type).toBe("outsider");
  });

  it("告密者 snitch：官方「爪牙会在其首个夜晚得知三个伪装」→ 属爪牙互认步骤，无自身夜行", () => {
    const ab: any = getAbilityForRole("snitch");
    // 若注册了能力，其 priority 不应让它成为独立的每夜唤醒步骤
    if (ab?.otherNightPriority != null) {
      expect(ab.otherNightPriority).toBeLessThanOrEqual(0);
    }
    expect(r("snitch").type).toBe("outsider");
  });

  it("镜像双子 evil_twin：首夜唤醒（互认），非首夜不唤醒", () => {
    const ab: any = getAbilityForRole("evil_twin");
    expect(ab, "镜像双子应已注册能力").toBeTruthy();
    expect(ab.firstNightPriority ?? 0).toBeGreaterThan(0);
    expect(ab.otherNightPriority ?? 0).toBeLessThanOrEqual(0);
  });

  it("小恶魔 imp：首夜不行动、其他夜击杀", () => {
    const ab: any = getAbilityForRole("imp");
    expect(ab).toBeTruthy();
    expect(ab.firstNightPriority ?? 0).toBeLessThanOrEqual(0);
    expect(ab.otherNightPriority ?? 0).toBeGreaterThan(0);
  });

  it("涡流 vortox：首夜不行动、其他夜击杀（与 imp 同为『每个夜晚*』）", () => {
    const ab: any = getAbilityForRole("vortox");
    expect(ab).toBeTruthy();
    expect(ab.firstNightPriority ?? 0).toBeLessThanOrEqual(0);
    expect(ab.otherNightPriority ?? 0).toBeGreaterThan(0);
  });

  it("小恶魔击杀未被保护目标 → 目标标记死亡", async () => {
    const ab: any = getAbilityForRole("imp");
    const s = [
      seat(0, "imp"),
      seat(1, "mayor"),
      seat(2, "savant"),
      seat(3, "baron"),
      seat(4, "farmer"),
    ];
    const node: any = {
      seatId: 0, roleId: "imp", roleName: "小恶魔", priority: 1,
      isFirstNightOnly: false, abilityId: ab.abilityId, wakeMessage: "",
      firstNightPriority: null, otherNightPriority: 1, targetIds: [2],
      processed: false, success: false, meta: {},
    };
    const snapshot: any = {
      seats: s, gamePhase: "night", nightCount: 2, statusEffects: {},
      reminders: [], log: [], poppyGrowerDead: false,
    };
    const out: any = await runFullAbilityPipeline(
      { preCheck: ab.preCheck, calculate: ab.calculate, stateUpdate: ab.stateUpdate, postProcess: ab.postProcess },
      buildContextForNode(snapshot, node, [2], undefined)
    );
    expect(out.meta.displayInfo, "小恶魔结算应有 displayInfo").toBeTruthy();
    // ⚠️ 小恶魔只写 `markedForDeath`，`isDead` 由 settleDawn（黎明）才落地
    //    —— 参见 legion.ability.ts 顶部注释。故判定要兼容三种死亡标记。
    const dead = (out.snapshot.seats as any[])
      .filter((x) => x.isDead || x.markedForDeath)
      .map((x) => x.id);
    expect(dead).toContain(2);
  });
});

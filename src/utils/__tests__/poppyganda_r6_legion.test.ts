/**
 * 罂粟花开 · 军团（Legion）说书人代操作 + 结算 UI —— 永久回归
 *
 * 用户需求（2026-09-13）：
 *   ① 军团局时军团玩家**无需操作**，轮到军团行动由**说书人代为操作**
 *   ② **技能确认页**要显示**完整的在场座位号 + 角色**
 *   ③ 说书人独立选择后确定「当晚死去的玩家」
 *   ④ 天亮**正常宣布「昨晚 X号 玩家死亡」**（不得因为"没有恶魔行动"就报平安夜）
 *   ⑤ 补上军团（与涡流）的 `displayInfo`
 *
 * 官方判据（officialRoleDocs「军团」）：
 *   「每个夜晚*，可能有一名玩家死亡。如果一项提名只有邪恶玩家投票，投票无效。
 *     你也会被当作是爪牙。[多数玩家为军团]」
 *   运作：「除首个夜晚以外的每个夜晚，由**说书人决定**今晚哪一名玩家死亡」
 */
import { describe, expect, it } from "vitest";
import { roles } from "../../../app/data";
import { legion } from "../../roles/demon/legion";
import { legionAbility } from "../../roles/new_engine/legion.ability";
import { vortoxAbility } from "../../roles/new_engine/vortox.ability";
import { runFullAbilityPipeline } from "../middlewarePipeline";
import { buildContextForNode } from "../invariantTesting/simulator";
import { initializeAbilityRegistry } from "../../roles/new_engine/abilityRegistry";

const r = (id: string) => roles.find((x) => x.id === id)!;

function seats(): any[] {
  return [
    { id: 0, playerName: "P1", role: r("legion"), isDead: false, isAlive: true, statusEffects: [] },
    { id: 1, playerName: "P2", role: r("mayor"), isDead: false, isAlive: true, statusEffects: [] },
    { id: 2, playerName: "P3", role: r("snitch"), isDead: false, isAlive: true, statusEffects: [] },
    { id: 3, playerName: "P4", role: r("savant"), isDead: false, isAlive: true, statusEffects: [] },
    { id: 4, playerName: "P5", role: r("legion"), isDead: false, isAlive: true, statusEffects: [] },
    { id: 5, playerName: "P6", role: r("baron"), isDead: false, isAlive: true, statusEffects: [] },
    { id: 6, playerName: "P7", role: r("farmer"), isDead: false, isAlive: true, statusEffects: [] },
  ];
}

const guideOf = (s: any[]): string => {
  const d: any = (legion as any).night.dialog;
  return d(0, false, { seats: s, nightCount: 2 }).wake as string;
};

async function settle(targets: number[], s = seats()) {
  const ab: any = legionAbility;
  const node: any = {
    seatId: 0, roleId: "legion", roleName: "军团", priority: 44,
    isFirstNightOnly: false, abilityId: ab.abilityId, wakeMessage: "",
    firstNightPriority: null, otherNightPriority: 44, targetIds: targets,
    processed: false, success: false, meta: {},
  };
  const snapshot: any = {
    seats: s, gamePhase: "night", nightCount: 2, statusEffects: {},
    reminders: [], log: [], poppyGrowerDead: false,
  };
  return runFullAbilityPipeline(
    { preCheck: ab.preCheck, calculate: ab.calculate, stateUpdate: ab.stateUpdate, postProcess: ab.postProcess },
    buildContextForNode(snapshot, node, targets, undefined)
  );
}

describe("军团 · 说书人代操作与结算 UI 回归", () => {
  initializeAbilityRegistry();

  it("① 技能确认页 guide 必须列出【全部在场座位号 + 角色】", () => {
    const g = guideOf(seats());
    // 7 名在场玩家都要出现，且带角色名
    for (const [id, name] of [
      [1, "军团"], [2, "镇长"], [3, "告密者"], [4, "博学者"],
      [5, "军团"], [6, "男爵"], [7, "农夫"],
    ] as const) {
      expect(g, `缺少 ${id}号`).toContain(`${id}号`);
      expect(g, `缺少 ${id}号的角色【${name}】`).toContain(`${id}号【${name}】`);
    }
    // 必须写明由说书人代为决定
    expect(g).toMatch(/说书人/);
    expect(g).toMatch(/军团玩家无需操作/);
  });

  it("② 技能确认页 guide 的「在场人数」与实际存活数一致，且不含已死亡玩家", () => {
    const s = seats();
    s[3].isDead = true;
    s[3].isAlive = false;
    const g = guideOf(s);
    expect(g).toContain("共 6 人");
    expect(g).not.toContain("4号【博学者】");
  });

  it("③ 选人 → 结算产出 displayInfo（legion_night_kill）且 prompt 提示说书人代操作", async () => {
    // ⚠️ 不要选 1 号（镇长）——镇长有替死/弹刀能力会把死亡转嫁到别人身上，
    //    属**正确行为**但会让"目标==死者"的断言失真。选 3 号（博学者）无转嫁。
    const out: any = await settle([3]);
    const di = out.meta.displayInfo;
    expect(di, "军团结算缺 displayInfo").toBeTruthy();
    expect(di.type).toBe("legion_night_kill");
    expect(di.killed).toBe(true);
    expect(di.targetId).toBe(3);
    expect(di.targetLabel).toBe("4号");
    expect(out.meta.prompt).toMatch(/说书人/);
  });

  it("③b 选中镇长时由镇长能力转嫁伤害（官方行为，不得回退）", async () => {
    const out: any = await settle([1]);
    const dtn: number[] = out.snapshot.deadThisNight ?? [];
    // 死亡被转嫁到替代目标，因此 deadThisNight 不含 1
    expect(dtn).not.toContain(1);
    expect(dtn.length).toBeGreaterThan(0);
  });

  it("④ 被选玩家写入 deadThisNight → 天亮播报「昨晚X号玩家死亡」而非平安夜", async () => {
    // 播报判据（useGameController）：deadThisNight.length > 0 ? "昨晚X号玩家死亡" : "平安夜"
    const out: any = await settle([3]);
    const dtn: number[] = out.snapshot.deadThisNight ?? [];
    expect(dtn).toContain(3);
    const deaths = (out.snapshot.seats as any[])
      .filter((x) => x.isDead)
      .map((x) => x.id);
    expect(deaths).toContain(3);
  });

  it("⑤ 空刀（说书人选 0 人）不得写入 deadThisNight", async () => {
    const out: any = await settle([]);
    expect(out.snapshot.deadThisNight ?? []).toHaveLength(0);
    const di = out.meta.displayInfo;
    expect(di.killed).toBe(false);
    expect(di.targetLabel).toContain("空刀");
  });

  it("⑥ 涡流结算也必须产出 displayInfo（vortox_kill）", async () => {
    const ab: any = vortoxAbility;
    const s = seats();
    s[0].role = r("vortox");
    s[4].role = r("legion");
    const node: any = {
      seatId: 0, roleId: "vortox", roleName: "涡流", priority: 44,
      isFirstNightOnly: false, abilityId: ab.abilityId, wakeMessage: "",
      firstNightPriority: null, otherNightPriority: 44, targetIds: [1],
      processed: false, success: false, meta: {},
    };
    const snapshot: any = {
      seats: s, gamePhase: "night", nightCount: 2, statusEffects: {},
      reminders: [], log: [], poppyGrowerDead: false,
    };
    const out: any = await runFullAbilityPipeline(
      { preCheck: ab.preCheck, calculate: ab.calculate, stateUpdate: ab.stateUpdate, postProcess: ab.postProcess },
      buildContextForNode(snapshot, node, [1], undefined)
    );
    expect(out.meta.displayInfo, "涡流结算缺 displayInfo").toBeTruthy();
    expect(out.meta.displayInfo.type).toBe("vortox_kill");
  });
});

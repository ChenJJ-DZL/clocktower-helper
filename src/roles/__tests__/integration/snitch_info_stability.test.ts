import { describe, expect, it } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import {
  createDeterministicRandom,
  nightInfoSeed,
} from "../../core/deterministicRandom";
import {
  pickAbsentRoleNames,
  pickExtraAbsentRoleNames,
  snitchAbility,
} from "../../new_engine/snitch.ability";

// 「暗流涌动」最小角色池（含足够多的不在场镇民/外来者，保证随机挑选被走到）
const scriptRoles: any[] = [
  { id: "washerwoman", name: "洗衣妇", type: "townsfolk" },
  { id: "librarian", name: "图书管理员", type: "townsfolk" },
  { id: "investigator", name: "调查员", type: "townsfolk" },
  { id: "chef", name: "厨师", type: "townsfolk" },
  { id: "empath", name: "共情者", type: "townsfolk" },
  { id: "monk", name: "僧侣", type: "townsfolk" },
  { id: "soldier", name: "士兵", type: "townsfolk" },
  { id: "ravenkeeper", name: "守鸦人", type: "townsfolk" },
  { id: "drunk", name: "酒鬼", type: "outsider" },
  { id: "recluse", name: "陌客", type: "outsider" },
  { id: "saint", name: "圣徒", type: "outsider" },
  { id: "poisoner", name: "投毒者", type: "minion" },
  { id: "spy", name: "间谍", type: "minion" },
  { id: "baron", name: "男爵", type: "minion" },
  { id: "imp", name: "小恶魔", type: "demon" },
];

// 已分配：洗衣妇 / 厨师 / 士兵 / 圣徒 / 告密者 / 投毒者 / 小恶魔
const seats: any[] = [
  { id: 0, playerName: "洗衣妇", isDead: false, role: { id: "washerwoman", name: "洗衣妇", type: "townsfolk" } },
  { id: 1, playerName: "厨师", isDead: false, role: { id: "chef", name: "厨师", type: "townsfolk" } },
  { id: 2, playerName: "士兵", isDead: false, role: { id: "soldier", name: "士兵", type: "townsfolk" } },
  { id: 3, playerName: "圣徒", isDead: false, role: { id: "saint", name: "圣徒", type: "outsider" } },
  { id: 4, playerName: "告密者", isDead: false, role: { id: "snitch", name: "告密者", type: "minion" } },
  { id: 5, playerName: "投毒者", isDead: false, role: { id: "poisoner", name: "投毒者", type: "minion" } },
  { id: 6, playerName: "小恶魔", isDead: false, role: { id: "imp", name: "小恶魔", type: "demon" } },
];

const assignedRoleIds = new Set(seats.map((s) => s.role.id));

const seedFor = (actorId: number, night: number) =>
  nightInfoSeed("snitch", actorId, night);

function makeContext(opts: {
  preview: boolean;
  nightCount?: number;
  marionetteSeatId?: number | null;
}): MiddlewareContext {
  return {
    snapshot: {
      nightCount: opts.nightCount ?? 1,
      gamePhase: "firstNight",
      seats: seats.map((s) => ({ ...s })),
      statusEffects: {},
      scriptRoles: scriptRoles.map((r) => ({ ...r })),
    },
    actionNode: {
      seatId: 4,
      roleId: "snitch",
      roleName: "5号-告密者",
      priority: 60,
      isFirstNightOnly: true,
      abilityId: "snitch_first_night_bluffs",
      wakeMessage: "告密者推送",
      firstNightPriority: 60,
      otherNightPriority: null,
      targetIds: [],
      processed: false,
      success: false,
      meta: {},
    },
    targetIds: [],
    storytellerInput:
      opts.marionetteSeatId == null
        ? undefined
        : { marionetteSeatId: opts.marionetteSeatId },
    meta: {},
    aborted: false,
    preview: opts.preview,
  };
}

const run = (ctx: MiddlewareContext) =>
  runFullAbilityPipeline(
    {
      preCheck: snitchAbility.preCheck,
      calculate: snitchAbility.calculate,
      stateUpdate: snitchAbility.stateUpdate,
      postProcess: snitchAbility.postProcess,
    },
    ctx
  );

describe("告密者：提示预演与实际执行必须推送同一组伪装（回归）", () => {
  it("同种子下两次挑出的不在场角色完全相同", () => {
    const a = pickAbsentRoleNames(
      scriptRoles,
      assignedRoleIds,
      createDeterministicRandom(seedFor(4, 1))
    );
    const b = pickAbsentRoleNames(
      scriptRoles,
      assignedRoleIds,
      createDeterministicRandom(seedFor(4, 1))
    );
    expect(b).toEqual(a);
    expect(a.length).toBe(3);
    // 必须是真正不在场的角色，且不能是酒鬼
    for (const name of a) {
      const role = scriptRoles.find((r) => r.name === name);
      expect(role).toBeDefined();
      expect(assignedRoleIds.has(role.id)).toBe(false);
      expect(role.id).not.toBe("drunk");
    }
  });

  it("同种子下恶魔额外获得的 3 个不在场角色完全一致", () => {
    const picked = ["图书管理员", "调查员", "共情者"];
    const a = pickExtraAbsentRoleNames(
      scriptRoles,
      picked,
      createDeterministicRandom(seedFor(4, 1))
    );
    const b = pickExtraAbsentRoleNames(
      scriptRoles,
      picked,
      createDeterministicRandom(seedFor(4, 1))
    );
    expect(b).toEqual(a);
    expect(a.length).toBe(3);
    for (const name of a) expect(picked).not.toContain(name);
  });

  it("不同夜次的种子会重新随机（不会整局锁死同一组伪装）", () => {
    const groups = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((n) =>
        JSON.stringify(
          pickAbsentRoleNames(
            scriptRoles,
            assignedRoleIds,
            createDeterministicRandom(seedFor(4, n))
          )
        )
      )
    );
    expect(groups.size).toBeGreaterThan(1);
  });

  it("管道预演（preview）与真实结算推送同一组角色", async () => {
    const preview = await run(makeContext({ preview: true }));
    const execute = await run(makeContext({ preview: false }));

    expect(preview.aborted).toBe(false);
    expect(execute.meta.abilityResult).toEqual(preview.meta.abilityResult);
    expect(execute.meta.abilityResult.absentRoles).toEqual(
      preview.meta.abilityResult.absentRoles
    );

    // ⚠️⚠️ 防假绿补强（2026-09-21 变异检验实测）：
    //   旧版只断言「两次运行结果**相等**」——把生产改成 `absentRoles: []`，
    //   两次都空、依然相等 ⇒ **照样绿**；而且下面那个 for 循环遍历空数组
    //   等于零次断言。这是典型的"自证式"断言。
    //   ⇒ 必须补**绝对断言**：伪装数量必须恰好 3 且都是真实不在场的角色名。
    const absent = preview.meta.abilityResult.absentRoles as string[];
    expect(
      absent.length,
      "❌ 告密者必须推送恰好 3 个不在场角色（旧版空数组也能过，假绿）"
    ).toBe(3);
    expect(new Set(absent).size, "3 个伪装必须互不相同").toBe(3);
    for (const name of absent) {
      const role = scriptRoles.find((r) => r.name === name);
      expect(role, `伪装「${name}」必须是合法角色名`).toBeDefined();
      expect(
        assignedRoleIds.has(role!.id),
        `伪装「${name}」必须**不在场**（不得与已分配角色重复）`
      ).toBe(false);
    }

    // 说书人提示词里念的角色 = 实际推送的角色
    for (const name of absent) {
      expect(execute.meta.prompt).toContain(name);
    }
  });

  it("提线木偶相克时，预演与结算的恶魔额外伪装也一致", async () => {
    const preview = await run(
      makeContext({ preview: true, marionetteSeatId: 5 })
    );
    const execute = await run(
      makeContext({ preview: false, marionetteSeatId: 5 })
    );

    expect(preview.meta.abilityResult.marionetteSkipped).toBe(true);
    expect(execute.meta.abilityResult.demonExtraAbsentRoles).toEqual(
      preview.meta.abilityResult.demonExtraAbsentRoles
    );
    // ⚠️ 防假绿补强：不能只断言"两次一致"（都空也一致）。
    const extra = preview.meta.abilityResult.demonExtraAbsentRoles as string[];
    expect(
      extra.length,
      "❌ 提线木偶被跳过时，恶魔必须**额外**得知 3 个不在场角色"
    ).toBe(3);
    expect(new Set(extra).size, "额外伪装必须互不相同").toBe(3);
    // 与告密者常规推送的 3 个不得重复（官方：「重新选 3 个不同的角色」）
    const base = preview.meta.abilityResult.absentRoles as string[];
    for (const name of extra) {
      expect(
        base,
        `额外伪装「${name}」与常规伪装重复了（须为不同的角色）`
      ).not.toContain(name);
    }
    // 被跳过的提线木偶不在推送目标里
    expect(execute.meta.abilityResult.minionSeatIds).not.toContain(5);
  });
});

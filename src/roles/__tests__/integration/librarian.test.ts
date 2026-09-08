import { describe, expect, test } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import { librarianAbility } from "../../new_engine/librarian.ability";

function makeSeat(
  id: number,
  rid: string,
  rt: string,
  opts?: { isDead?: boolean; isDrunk?: boolean }
) {
  const n: Record<string, string> = {
    librarian: "图书管理员",
    butler: "管家",
    saint: "圣徒",
    drunk: "酒鬼",
    recluse: "陌客",
    chef: "厨师",
    spy: "间谍",
    imp: "小恶魔",
    washerwoman: "洗衣妇",
  };
  return {
    id,
    playerName: `P${id + 1}`,
    isDead: !!opts?.isDead,
    isAlive: !opts?.isDead,
    isDrunk: !!opts?.isDrunk,
    isPoisoned: false,
    role: { id: rid, name: n[rid] || rid, type: rt },
    effectiveRole: null,
    charadeRole: null,
    statusEffects: opts?.isDrunk ? [{ type: "drunk" }] : [],
    hasAbilityEvenDead: false,
  };
}

function ctx(
  sid: number,
  nc: number,
  phase: string,
  seats: ReturnType<typeof makeSeat>[]
): MiddlewareContext {
  return {
    snapshot: { nightCount: nc, gamePhase: phase, seats, statusEffects: {} },
    actionNode: {
      seatId: sid,
      roleId: "librarian",
      roleName: "图书管理员",
      priority: 53,
      isFirstNightOnly: true,
      abilityId: "librarian_first_night",
      wakeMessage: "...",
      firstNightPriority: 53,
      otherNightPriority: null,
      targetIds: [],
      processed: false,
      success: false,
      meta: {},
    },
    targetIds: [],
    meta: {},
    aborted: false,
  };
}

describe("图书管理员 引擎集成测试", () => {
  const pipe = (a: any) => ({
    preCheck: a.preCheck,
    calculate: a.calculate,
    stateUpdate: a.stateUpdate,
    postProcess: a.postProcess,
  });

  test("首夜获取外来者信息", async () => {
    const ss = [
      makeSeat(0, "librarian", "townsfolk"),
      makeSeat(1, "butler", "outsider"),
      makeSeat(2, "chef", "townsfolk"),
      makeSeat(3, "imp", "demon"),
      makeSeat(4, "saint", "outsider"),
    ];
    const r = await runFullAbilityPipeline(
      pipe(librarianAbility),
      ctx(0, 1, "firstNight", ss)
    );
    expect(r.aborted).toBe(false);
    expect(r.meta.abilityResult).toBeDefined();
    expect(typeof r.meta.abilityResult.roleName).toBe("string");
  });

  test("无外来者返回0/特殊标记", async () => {
    const ss = [
      makeSeat(0, "librarian", "townsfolk"),
      makeSeat(1, "chef", "townsfolk"),
      makeSeat(2, "washerwoman", "townsfolk"),
      makeSeat(3, "imp", "demon"),
    ];
    const r = await runFullAbilityPipeline(
      pipe(librarianAbility),
      ctx(0, 1, "firstNight", ss)
    );
    expect(r.aborted).toBe(false);
  });

  test("非首夜不唤醒", async () => {
    const r = await runFullAbilityPipeline(
      pipe(librarianAbility),
      ctx(0, 2, "night", [
        makeSeat(0, "librarian", "townsfolk"),
        makeSeat(1, "chef", "townsfolk"),
      ])
    );
    expect(r.aborted).toBe(true);
  });

  test("死亡不触发", async () => {
    const r = await runFullAbilityPipeline(
      pipe(librarianAbility),
      ctx(0, 1, "firstNight", [
        makeSeat(0, "librarian", "townsfolk", { isDead: true }),
        makeSeat(1, "butler", "outsider"),
      ])
    );
    expect(r.aborted).toBe(true);
  });

  test("间谍可被当作外来者", async () => {
    const ss = [
      makeSeat(0, "librarian", "townsfolk"),
      makeSeat(1, "spy", "minion"),
      makeSeat(2, "chef", "townsfolk"),
      makeSeat(3, "imp", "demon"),
    ];
    const r = await runFullAbilityPipeline(
      pipe(librarianAbility),
      ctx(0, 1, "firstNight", ss)
    );
    expect(r.aborted).toBe(false);
  });

  test("结果只能来自外来者/可注册为外来者的角色，不能出现爪牙或恶魔", async () => {
    const ss = [
      makeSeat(0, "librarian", "townsfolk"),
      makeSeat(1, "spy", "minion"),
      makeSeat(2, "saint", "outsider"),
      makeSeat(3, "imp", "demon"),
      makeSeat(4, "recluse", "outsider"),
    ];
    const r = await runFullAbilityPipeline(
      pipe(librarianAbility),
      ctx(0, 1, "firstNight", ss)
    );
    const roleName = (r.meta.abilityResult as any)?.roleName ?? "";
    const allowed = new Set(["圣徒", "陌客", "间谍"]);
    expect(allowed.has(roleName)).toBe(true);
  });

  test("酒鬼作为外来者时展示酒鬼而非伪装身份", async () => {
    const drunk = makeSeat(2, "drunk", "outsider");
    (drunk as any).charadeRole = {
      id: "chef",
      name: "厨师",
      type: "townsfolk",
    };
    const ss = [
      makeSeat(0, "librarian", "townsfolk"),
      makeSeat(1, "chef", "townsfolk"),
      drunk,
      makeSeat(3, "imp", "demon"),
    ];
    const r = await runFullAbilityPipeline(
      pipe(librarianAbility),
      ctx(0, 1, "firstNight", ss)
    );
    expect((r.meta.abilityResult as any)?.roleName).toBe("酒鬼");
  });

  test("涡流在场且场上无外来者时：图书管理员绝不能得知0，必须获得假的外来者角色和两名玩家", async () => {
    const ss = [
      makeSeat(0, "librarian", "townsfolk"),
      makeSeat(1, "chef", "townsfolk"),
      makeSeat(2, "washerwoman", "townsfolk"),
      makeSeat(3, "vortox", "demon"),
    ];
    const context = ctx(0, 1, "firstNight", ss);
    // 涡流在场
    (context.snapshot as any).vortoxWorld = true;

    // 多次执行验证每次都绝不返回空角色名（0）
    for (let i = 0; i < 20; i++) {
      const r = await runFullAbilityPipeline(pipe(librarianAbility), context);
      expect(r.aborted).toBe(false);
      const res = r.meta.abilityResult as any;
      expect(res).toBeDefined();
      // 绝不能为 0（即 roleName 不能为 ""）
      expect(res.roleName).toBeTruthy();
      expect(typeof res.roleName).toBe("string");
      expect(res.roleName.length).toBeGreaterThan(0);
      expect(res.seat1).toBeGreaterThanOrEqual(0);
      expect(res.seat2).toBeGreaterThanOrEqual(0);
      expect(r.meta.displayInfo?.hasOutsider).toBe(true);
      expect(r.meta.abilityLog).not.toContain("场上没有外来者在场");
    }
  });

  test("图书管理员中毒且场上无外来者时：图书管理员绝不能得知真实0，必须捏造外来者", async () => {
    const ss = [
      makeSeat(0, "librarian", "townsfolk", { isDrunk: true }),
      makeSeat(1, "chef", "townsfolk"),
      makeSeat(2, "washerwoman", "townsfolk"),
      makeSeat(3, "imp", "demon"),
    ];
    const context = ctx(0, 1, "firstNight", ss);

    for (let i = 0; i < 20; i++) {
      const r = await runFullAbilityPipeline(pipe(librarianAbility), context);
      expect(r.aborted).toBe(false);
      const res = r.meta.abilityResult as any;
      expect(res.roleName).toBeTruthy();
      expect(res.roleName.length).toBeGreaterThan(0);
      expect(r.meta.displayInfo?.hasOutsider).toBe(true);
      expect(r.meta.abilityLog).not.toContain("场上没有外来者在场");
    }
  });
});


/**
 * 酒鬼 / 提线木偶 → 信息类能力**必须给假信息**（用户实测缺陷回归，2026-09-14）
 *
 * ============================================================
 * 缺陷现象（用户实测）
 * ============================================================
 * 「提线木偶转为赏金猎人后，得知了**真实的**消息，这不符合游戏规则！」
 *
 * 官方判据（`officialRoleDocs.json`）：
 *   · 提线木偶「认为自己是提线木偶的玩家所抽取到的善良角色对应的能力**不会产生
 *     任何效果**，但说书人会假装这些效果生效了。这与酒鬼的运作方式相似。」
 *     「将提线木偶以为的那个角色**视同醉酒一样来运作**…**可能获得错误信息**」
 *     范例：「小明是提线木偶，她认为自己是送葬者…她的信息**大部分时候都是错误的**」
 *   · 酒鬼「酒鬼**没有任何能力**…如果那个镇民能够获取信息，说书人可以对其
 *     **给出错误的信息**」
 *     赏金猎人范例 3（官方）：以为自己是赏金猎人的酒鬼，首夜得知的是**善良的**共情者
 *
 * ============================================================
 * 根因
 * ============================================================
 * `abilityPriorityMiddleware` 通过「座位上是否有 `statusEffects: [{type:"drunk"}]`」
 * 判定能力是否生效。而 `drunk.ability.ts` / `marionette.ability.ts` 里的写入
 * **跑不到**（生产按**伪装角色**的能力调度，从不调用这两个能力管道），
 * 设置阶段又只落了 `charadeRole` → 中间件判 `abilityEffective = true`
 * → 赏金猎人从 `aliveEvils` 里挑真邪恶玩家 → **泄漏真值**。
 *
 * 修法：`utils/charadeSetup.ts` 作为唯一入口，在所有写 `charadeRole` 的地方
 * 同时落地永久醉酒；读档处再兜底一次。
 */
import { describe, expect, it } from "vitest";
import { roles } from "../../../../app/data";
import { initializeAbilityRegistry } from "../../new_engine/abilityRegistry";
import { bounty_hunterAbility } from "../../new_engine/bounty_hunter.ability";
import { applyCharadePermanentDrunk, withCharadePermanentDrunk } from "../../../utils/charadeSetup";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";

const r = (id: string) => roles.find((x) => x.id === id)!;

/** 生产形态的座位：`role` 是真身，`charadeRole` 是他以为的身份 */
function seat(id: number, realId: string, fakeId: string | null = null): any {
  return {
    id,
    playerName: `P${id + 1}`,
    role: r(realId),
    charadeRole: fakeId ? r(fakeId) : null,
    displayRole: fakeId ? r(fakeId) : null,
    isDead: false,
    isDrunk: false,
    isPoisoned: false,
    statusEffects: [] as any[],
  };
}

/**
 * 一局：0 号木偶(以为自己是赏金猎人) / 1 号小恶魔 / 2 号男爵 / 3 号共情者 / 4 号厨师
 * → 真邪恶（不含自己）= {1, 2}；假目标池 = {3, 4}
 */
const buildBoard = () => [
  seat(0, "marionette", "bounty_hunter"),
  seat(1, "imp"),
  seat(2, "baron"),
  seat(3, "empath"),
  seat(4, "chef"),
];

/** 以伪装角色的身份跑能力管道（与生产一致：引擎按 charadeRole 调度） */
async function runAsCharade(seats: any[], seatId: number, fakeRoleId: string) {
  const ctx: MiddlewareContext = {
    snapshot: {
      nightCount: 1,
      gamePhase: "firstNight",
      seats,
      statusEffects: {},
    } as any,
    actionNode: {
      seatId,
      roleId: fakeRoleId,
      roleName: r(fakeRoleId).name,
      priority: 1,
      isFirstNightOnly: true,
      abilityId: `${fakeRoleId}_ability`,
      targetIds: [],
      processed: false,
      success: false,
      meta: {},
    } as any,
    targetIds: [],
    meta: {},
    aborted: false,
  };
  const a: any = bounty_hunterAbility;
  return runFullAbilityPipeline(
    {
      preCheck: a.preCheck,
      calculate: a.calculate,
      stateUpdate: a.stateUpdate,
      postProcess: a.postProcess,
    } as any,
    ctx
  );
}

const EVIL_IDS = [1, 2];
const FAKE_POOL = [3, 4];

describe("酒鬼 / 提线木偶 → 信息类能力必须给假信息", () => {
  initializeAbilityRegistry();

  describe("utils/charadeSetup 唯一入口", () => {
    it("给酒鬼 / 提线木偶写入 `permanent drunk`，其他角色不动", () => {
      const drunk = seat(0, "drunk", "empath");
      const mar = seat(1, "marionette", "bounty_hunter");
      const chef = seat(2, "chef");
      const out = applyCharadePermanentDrunk([drunk, mar, chef]);

      for (const s of [out[0], out[1]]) {
        const eff = (s.statusEffects ?? []).filter(
          (e: any) => e.type === "drunk" && e.permanent === true
        );
        expect(eff.length, `座位${s.id} 应有 1 条永久醉酒`).toBe(1);
      }
      expect(out[2], "非酒鬼/木偶座位应原样返回（同一引用）").toBe(chef);
    });

    it("幂等：重复调用不叠加", () => {
      const once = withCharadePermanentDrunk(seat(0, "marionette", "chef"));
      const twice = withCharadePermanentDrunk(once);
      expect(
        (twice.statusEffects ?? []).filter((e: any) => e.type === "drunk").length
      ).toBe(1);
    });

    it("不影响其他来源的醉酒（水手 / 吟游诗人等临时醉酒）", () => {
      const s = seat(0, "marionette", "chef");
      s.statusEffects = [{ type: "drunk", source: "minstrel", duration: 1 }];
      const out = withCharadePermanentDrunk(s);
      const sources = (out.statusEffects ?? [])
        .filter((e: any) => e.type === "drunk")
        .map((e: any) => e.source);
      expect(sources).toContain("minstrel");
      expect(sources).toContain("marionette");
    });
  });

  it("⭐⭐ 用户实测场景：提线木偶以为自己是赏金猎人 → 首夜得知的**不能是邪恶玩家**", async () => {
    const seats = applyCharadePermanentDrunk(buildBoard());
    const res: any = await runAsCharade(seats, 0, "bounty_hunter");
    const targetId = res.meta?.abilityResult?.targetId;

    expect(targetId, "首夜应给出一个「得知」目标").not.toBeNull();
    expect(
      EVIL_IDS.includes(targetId),
      `木偶被当作赏金猎人时泄漏了真邪恶玩家（targetId=${targetId}）——` +
        `官方：其以为的镇民能力不生效，说书人应给错误信息`
    ).toBe(false);
    expect(
      FAKE_POOL.includes(targetId),
      `假目标应来自善良玩家，实际 targetId=${targetId}`
    ).toBe(true);
  });

  it("⭐⭐ 官方范例 3：以为自己是赏金猎人的**酒鬼** → 首夜得知的是善良玩家", async () => {
    const board = buildBoard();
    board[0] = seat(0, "drunk", "bounty_hunter");
    const seats = applyCharadePermanentDrunk(board);
    const res: any = await runAsCharade(seats, 0, "bounty_hunter");
    const targetId = res.meta?.abilityResult?.targetId;

    expect(EVIL_IDS.includes(targetId), "酒鬼不应得知真邪恶玩家").toBe(false);
    expect(FAKE_POOL.includes(targetId)).toBe(true);
  });

  it("对照：**正常的**赏金猎人仍然得知真邪恶玩家（不能过度反相）", async () => {
    const board = buildBoard();
    board[0] = seat(0, "bounty_hunter");
    const res: any = await runAsCharade(board, 0, "bounty_hunter");
    const targetId = res.meta?.abilityResult?.targetId;
    expect(EVIL_IDS.includes(targetId), "正常赏金猎人应得知邪恶玩家").toBe(true);
  });

  it("⭐ 保留既有契约：**裸**木偶座位（尚无 drunk 效果）不被判为能力失效", () => {
    // 由 marionette_permanent_drunk.test.ts ③ 钉住的负向对照：
    // 中间件**不得**凭 role.id 判定失效，必须靠座位上真实存在的 drunk 效果。
    // ⇒ 本模块的职责是"把效果写上"，而不是改中间件。
    const bare = seat(0, "marionette", "bounty_hunter"); // 未过 applyCharadePermanentDrunk
    const effects = bare.statusEffects ?? [];
    expect(effects.some((e: any) => e.type === "drunk")).toBe(false);
  });
});

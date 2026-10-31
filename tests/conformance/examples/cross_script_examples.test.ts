/**
 * 官方范例可执行夹具 · 跨剧本判胜 / 规则纯函数
 * ======================================================================
 * 覆盖：呆瓜（梦殒春宵 outsiders）、镜像双子（梦殒春宵 minion）、吟游诗人
 * （黯月初升 townsfolk）、贞洁者（暗流涌动 passive）、管家（暗流涌动 voting）。
 *
 * 每条夹具对应 1 条官方【范例】；断言走真实实现：
 *   · 能力对象走 `runFullAbilityPipeline`；
 *   · 判胜走 `checkGameEnd`；
 *   · 被动/投票规则走生产唯一事实源纯函数（`virginRule` / `butler.ability`）。
 */
import { beforeAll, describe, expect, it } from "vitest";
import { isButlerVoteLegal } from "../../../src/roles/new_engine/butler.ability";
import {
  butlerAbility,
  klutzAbility,
  minstrelAbility,
} from "../../../src/roles/new_engine/abilityRegistry";
import { resolveVirginTrigger, shouldExecuteNominator } from "../../../src/utils/virginRule";
import { ctx, ensureAbilityRegistry, judge, role, runAbility, seat } from "./_harness";

beforeAll(() => {
  ensureAbilityRegistry();
});

function result(res: any): any {
  return res.meta?.abilityResult;
}

describe("跨剧本 · 判胜与规则纯函数官方范例", () => {
  // 官方范例: 呆瓜 #0
  it("呆瓜#0：呆瓜公开选择善良的女裁缝 ⇒ 夜幕降临，游戏继续", async () => {
    const seats = [
      seat(0, "klutz", { isDead: true, executedToday: true }),
      seat(1, "seamstress"),
      seat(2, "imp"),
      seat(3, "chef"),
      seat(4, "mayor"),
    ];
    const res = await runAbility(
      klutzAbility,
      ctx(seats, 0, "klutz", { phase: "day", targets: [1] })
    );
    expect(res.aborted).toBe(false);
    expect(result(res).isEvil).toBe(false);
    expect((res.snapshot as any).gameOver).toBe(false);
    expect((res.snapshot as any).klutzTriggered).toBe(true);
  });

  // 官方范例: 呆瓜 #1
  it("呆瓜#1：呆瓜公开选择邪恶的恶魔 ⇒ 游戏立即结束，邪恶方获胜", async () => {
    const seats = [
      seat(0, "klutz", { isDead: true }),
      seat(1, "seamstress"),
      seat(2, "imp"),
      seat(3, "chef"),
      seat(4, "mayor"),
    ];
    const res = await runAbility(
      klutzAbility,
      ctx(seats, 0, "klutz", { phase: "day", targets: [2] })
    );
    expect(res.aborted).toBe(false);
    expect(result(res).isEvil).toBe(true);
    expect((res.snapshot as any).gameOver).toBe(true);
    expect((res.snapshot as any).winner).toBe("evil");
  });

  // 官方范例: 镜像双子 #0
  it("镜像双子#0：邪恶双子被处决 ⇒ 游戏继续", async () => {
    // 官方：两个双子都声称是神谕者；邪恶双子被处决，游戏继续。
    const seats = [
      seat(0, "evil_twin"),
      seat(1, "imp"),
      seat(2, "chef"),
      seat(3, "mayor", { isDead: true }),
      seat(4, "soldier"),
      seat(5, "empath"),
    ];
    const verdict = judge(seats, "execution", 0, {
      evilTwinPair: { goodId: 2 },
    });
    expect(verdict.isGameOver).toBe(false);
    expect(verdict.winner).toBeNull();
  });

  // 官方范例: 镜像双子 #2
  it("镜像双子#2：善良双子被处决 ⇒ 邪恶阵营获胜", async () => {
    const seats = [
      seat(0, "evil_twin"),
      seat(1, "imp"),
      seat(2, "chef", { isDead: true, executedToday: true }),
      seat(3, "mayor"),
      seat(4, "soldier"),
      seat(5, "empath"),
    ];
    const verdict = judge(seats, "execution", 2, {
      evilTwinPair: { goodId: 2 },
    });
    expect(verdict.isGameOver).toBe(true);
    expect(verdict.winner).toBe("Evil");
    expect(verdict.reasonCode).toBe("GOOD_TWIN_EXECUTED");
  });

  // 官方范例: 吟游诗人 #0
  it("吟游诗人#0：被处决的是和平主义者（非爪牙）⇒ 不当场醉酒所有人", async () => {
    const seats = [
      seat(0, "minstrel"),
      seat(1, "imp"),
      seat(2, "chef"),
      seat(3, "pacifist", { isDead: true }),
      seat(4, "soldier"),
    ];
    const res = await runAbility(
      minstrelAbility,
      ctx(seats, 0, "minstrel", {
        phase: "day",
        storytellerInput: { executedSeatId: 3 },
      })
    );
    expect(res.aborted).toBe(false);
    expect(result(res).isMinionExecuted).toBe(false);
    expect(result(res).shouldDrunkEveryone).toBe(false);
    expect(res.meta?.stateUpdates).toBeUndefined();
  });

  // 官方范例: 吟游诗人 #1
  it("吟游诗人#1：刺客（爪牙）被处决 ⇒ 除吟游诗人外的所有存活玩家醉酒", async () => {
    const seats = [
      seat(0, "minstrel"),
      seat(1, "imp"),
      seat(2, "chef"),
      seat(3, "assassin", { isDead: true }),
      seat(4, "soldier"),
    ];
    const res = await runAbility(
      minstrelAbility,
      ctx(seats, 0, "minstrel", {
        phase: "day",
        storytellerInput: { executedSeatId: 3 },
      })
    );
    expect(res.aborted).toBe(false);
    expect(result(res).isMinionExecuted).toBe(true);
    const updates = res.meta?.stateUpdates as any;
    expect(updates?.type).toBe("MARK_ALL_FOR_DRUNK");
    // 吟游诗人本人不醉酒；其余存活玩家（含恶魔）全部醉酒
    expect(updates?.targetIds ?? []).not.toContain(0);
    expect(updates?.targetIds ?? []).toEqual(
      expect.arrayContaining([1, 2, 4])
    );
  });

  // 官方范例: 贞洁者 #0
  it("贞洁者#0：洗衣妇（镇民）提名贞洁者 ⇒ 提名者立刻被处决", async () => {
    const virgin = seat(0, "virgin");
    const nominator = seat(1, "washerwoman");
    const trigger = resolveVirginTrigger(virgin, nominator);
    expect(trigger.shouldPrompt).toBe(true);
    expect(trigger.isFirstTime).toBe(true);
    expect(trigger.nominatorIsTownsfolk).toBe(true);
    expect(shouldExecuteNominator(virgin, nominator)).toBe(true);
  });

  // 官方范例: 贞洁者 #1
  it("贞洁者#1：以为自己是厨师的酒鬼提名贞洁者 ⇒ 酒鬼存活，贞洁者失去能力", async () => {
    const virgin = seat(0, "virgin");
    const nominator = seat(1, "drunk", {
      isDrunk: true,
      charadeRole: "chef",
      statusEffects: [{ type: "drunk" }],
    });
    expect(nominator.role.id).toBe(role("drunk").id);
    expect(nominator.charadeRole?.id).toBe(role("chef").id);
    const trigger = resolveVirginTrigger(virgin, nominator);
    // 首次提名仍要交给说书人裁决（之后贞洁者失去能力），但**不能处决**提名者
    expect(trigger.shouldPrompt).toBe(true);
    expect(trigger.isFirstTime).toBe(true);
    expect(trigger.nominatorIsTownsfolk, "酒鬼不是镇民").toBe(false);
    expect(shouldExecuteNominator(virgin, nominator)).toBe(false);
  });

  // 官方范例: 管家 #0
  it("管家#0：管家选择主人；明天只有主人投票时管家才能投票", async () => {
    const seats = [
      seat(0, "butler"),
      seat(1, "chef"),
      seat(2, "imp"),
      seat(3, "mayor"),
      seat(4, "soldier"),
    ];
    const res = await runAbility(
      butlerAbility,
      ctx(seats, 0, "butler", { targets: [1] })
    );
    expect(res.aborted).toBe(false);
    const butlerAfter = (res.snapshot.seats as any[])[0];
    expect(result(res)).toBe(1);
    expect(butlerAfter.masterId).toBe(1);
    expect(
      (butlerAfter.statusEffects ?? []).some(
        (effect: any) => effect?.type === "butler_master"
      )
    ).toBe(true);
    // 主人没投票 ⇒ 管家不能投；主人投票 ⇒ 可以投；流放表决不受限
    expect(isButlerVoteLegal(butlerAfter, false, false, false)).toBe(false);
    expect(isButlerVoteLegal(butlerAfter, true, false, false)).toBe(true);
    expect(isButlerVoteLegal(butlerAfter, false, true, false)).toBe(true);
  });

  // 官方范例: 管家 #2
  it("管家#2：管家已死亡 ⇒ 死亡玩家没有能力，可用幽灵票在任何时候投票", () => {
    const deadButler = seat(0, "butler", { isDead: true, masterId: 2 });
    expect(deadButler.isDead).toBe(true);
    expect(deadButler.masterId, "历史主人标记仍在，但死亡后不应限制投票").toBe(2);

    // 官方：死亡的管家没有任何能力 ⇒ 主人不投票也可以自由投票（幽灵票）
    expect(
      isButlerVoteLegal(deadButler, false, false, false),
      "死亡管家的投票不应受主人限制"
    ).toBe(true);

    // 对照：同一主人设置下，**存活**管家仍受限制（判据不是恒真）
    const aliveButler = seat(0, "butler", { masterId: 2 });
    expect(isButlerVoteLegal(aliveButler, false, false, false)).toBe(false);
  });
});
